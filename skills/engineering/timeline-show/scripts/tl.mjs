// timeline-show / tl.mjs —— 一次长任务的可复核台账
//
// 零依赖,只用 Node 标准库。四条子命令:
//   tl init    空手建 run(首条记录是 run.start,不预置工作项骨架)
//   tl append  唯一写入口:加锁 → 追加一行 → 解锁;锁外投影 + 原子替换 state.js
//   tl check   唯一会执行外部命令的入口:过 hold 闸门后亲自跑命令、把退出码记为证据
//   tl finish  收尾并产出复核摘要(长度与口径由 [22] 定死)
//
// 已定决策落在这里:
//   [12] 一行一事件的确切契约 —— append 盖时间戳 / 分配序列号与编号 / 永不拒收(仅拒绝无法解析的 JSON)
//   [17] 投影的时机(B′)      —— 临界区只毫秒级;project 全量纯函数在**锁外**跑;投影失败不回滚 append
//   [10] file:// 下的刷新机制 —— state.js 必须原子替换(tmp + fsync + rename),追加与替换是两套机制
//   [06] 证据机制与写盘边界   —— check 是唯一会执行命令的路径;只写 .taskboard/ 与一行 .gitignore
//   [22] check 与 finish      —— hold 闸门拒绝执行(执行前判定、无绕过);脱敏;finish 摘要上限
// 锁的写法参照 [12]「实现参照」,但**不照抄**其裸 `rm -rf` 抢占:见 releaseLock 的 token 校验。
//
// 两条写入口的唯一化(票 20 复核 H1):
//   append 与 init 共用 writeEvent 这一个「分配 seq/编号 → 追加一行」的路径;
//   init 不再硬编码 seq:1,也不再有绕开分配器的旁路。
//
// H2「永不拒收」的兜底(票 20 复核):
//   锁只用来让 seq 分配串行化。**锁拿不到时仍然落盘**——绝不因为拿不到锁而丢事件。
//   events.jsonl 的**物理行序本身才是真相**,seq 只是便利字段:project 按行序重算
//   canonical seq,凡与存储 seq 不符者进 state.notes 现形。无锁路径再置 dirty 留痕。
//
// M1 临界区回到「只追加一行」(票 20 复核,与 H2 同一子系统):
//   旧实现在锁内 readEvents + 逐行 parse 全量日志来算 seq/编号,持锁时间随日志长度线性增长
//   (数万行后单次临界区可能超过 STALE_MS,招回「两个写者同时追加」)。现在分配状态落在
//   常量大小的 index.json 上:锁内只 statSync 比一次大小(O(1)),不符才 O(n) 重建一次。
//   分配索引只影响 seq/编号这两个便利字段;行序仍是唯一真相(与 H2 同一条不变量)。
//
// F1 抢占的并发安全(票 20 复核):
//   旧 takeover 的「writeOwner + 回读 token」无互斥:N 个迟到者同时判 stale、各自回读到
//   自己的 token → N 个进程同时「持锁」(实测 12/12;持锁区间重叠峰值 >1)。现用原子
//   `mkdir .lock.claim` 串行化抢占临界区,**并在临界区内复核 stale**——排在后面的迟到者
//   复核即判非 stale(前一个赢家已刷 owner 与 mtime),不再覆盖。见 takeover()。
//
// 注:本票只立投影骨架(够跑 13 的确定性夹具);完整 reducer 见票 21。

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { SCHEMA, project, DEFAULT_POLICY, projectPolicyPatch } from './project.mjs';
export { SCHEMA, project };
const MAX_RECORD_BYTES = 2048; // [12] 单条 ≤ 2 KB,超出截断并加 …
const AUTO_REF = { item: 'T', decision: 'D', stuck: 'K', check: 'C' };

// ── hold 闸门(spec §16 G1 / 票 06 / 票 22 / 票 26 返修) ──────────────────────
// check 是**唯一会执行外部命令**的入口,所以 hold 是**拒绝执行**,不是「提示一下就执行」。
// 判定在**执行前**完成,且**没有绕过路径**(不是 --force 能开的)。
// 模式取 project.mjs 的 DEFAULT_POLICY.hold_patterns —— 那是模块常量,run.start 的
// data.policy 覆写不到它,所以「改 run 配置」也不是绕过路径。
//
// 旧实现把 argv 空格拼接后判**子串**(票 22 复核判为 CRITICAL,已实测复现):
//   · 漏放:同一个操作有无穷多种写法,只有刚好写对的那一种被拦。
//     实测漏放:rm -fr / rm -r -f / rm --recursive --force / git -C <dir> push /
//     git -c k=v push / kubectl --context x apply / kubectl -n ns delete / find . -delete,
//     而且 **victim 目录真的被删掉了**(数据丢失,不是「提示没打」)。
//   · 误伤:命令里**提到**这些词也命中 —— `--note 'rm -rf 是危险词'` 被拒执。
// 新实现判的是**解析后的 argv**:规范化可执行名 → 按工具找子命令(跳过全局旗标与其取值)
// → 剥掉透明包装递归判内层。子串只留给**解析不出来的写法**(SQL 这类)。
//
// 能力上限,明说:这不是沙箱。`node -e "…"` / `python -c "…"` 这类「把操作写成另一门语言」
// 的写法**在这个分层里拦不住**——要拦只能禁掉全部解释器,那就等于废掉 check 的全部用途。
// 本闸门的目标是拦住**会写错的那一类**写法,真正的边界是「agent 自己回合里跑 tl check 要用户授权」。
export const HOLD_PATTERNS = Object.freeze([...DEFAULT_POLICY.hold_patterns]); // 浅拷贝:改动 run 策略不得连坐闸门
// 文本型 pattern:内容不是 argv 形状(SQL 等),只能按整串判子串。代价是命令行里**提到**它也会命中。
// 这是**手写白名单**,不是从 HOLD_PATTERNS 过滤出来的——试过「带空格就算文本型」那种过滤,
// 它会把 `rm -rf` 也划进来,于是 `--note 'rm -rf 是危险词'` 被误拒(那正是一条良性命令)。
// 名单外的 pattern 由 scanHold 的结构化规则负责,不许两边都漏。
export const TEXT_PATTERNS = Object.freeze(['DROP TABLE']);

const stripExt = (s) => s.replace(/\.(exe|cmd|bat|com|ps1)$/i, '');
// 可执行名规范化:去引号 → 取 basename → 去 Windows 扩展名 → 小写。于是 `/bin/rm`、`RM.EXE`、`"rm"` 同归一。
const exeName = (tok) => {
  const s = String(tok ?? '').trim().replace(/^["']+|["']+$/g, '');
  return stripExt(s.split(/[\\/]/).pop() ?? s).toLowerCase();
};
// 删除类可执行:一律拒执(spec §16 G1「rm -rf 一律不执行」)。
// check 的用途是跑测试/构建,不是删文件——要删文件是 agent 该明说的事,不该藏在一条 check 里。
const RM_FAMILY = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'unlink', 'shred', 'srm', 'truncate',
  'mkfs', 'dd', 'format', 'diskpart', 'ansible-playbook']);
// 解释器 / shell:带 -c 就能把整条命令藏进一个字符串,字符串里是什么已经看不见了。
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'cmd', 'powershell', 'pwsh', 'cscript', 'wscript', 'wsl']);
const SHELL_EXEC_FLAGS = new Set(['-c', '/c', '/k', '-command', '/command', '-encodedcommand']);
// 透明包装:自己什么都不做,只是换个方式叫内层那条命令。剥掉自身与取值,递归判内层。
const WRAPPERS = new Set(['env', 'sudo', 'doas', 'nice', 'nohup', 'time', 'timeout', 'stdbuf', 'setsid', 'ionice', 'chrt', 'xargs', 'busybox']);
// 多调式工具的危险子命令。`git reset` 要看旗标,单独判。
const DANGEROUS_SUBCOMMAND = {
  git: new Set(['push', 'clean']),
  npm: new Set(['publish', 'unpublish']), npx: new Set(['publish', 'unpublish']),
  pnpm: new Set(['publish']), yarn: new Set(['publish']), bun: new Set(['publish']),
  terraform: new Set(['apply', 'destroy', 'import', 'taint']),
  tofu: new Set(['apply', 'destroy', 'import', 'taint']),
  kubectl: new Set(['apply', 'delete', 'replace', 'patch', 'drain', 'cordon']),
  helm: new Set(['install', 'upgrade', 'uninstall', 'delete']),
  pulumi: new Set(['up', 'destroy']),
};
// 子命令前面可能夹着「带取值的全局旗标」(`git -C <dir> push`)。遇到就把它与取值一起跳过。
const FLAG_TAKES_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace', '-n', '--context', '--kubeconfig',
  '--cluster', '--user', '--chdir', '-p', '--prefix', '--registry', '--cwd', '-w', '--config', '--file', '-f', '--output', '-o', '--loglevel', '-I', '--replace', '-u', '--user-name']);
const FIND_ACTIONS = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir']);

function subcommandOf(argv) {
  for (let i = 1; i < argv.length; i++) {
    const t = String(argv[i]);
    if (t === '--') continue;
    if (!t.startsWith('-')) return t.toLowerCase();
    if (FLAG_TAKES_VALUE.has(t.toLowerCase())) i++; // 连它的取值一起跳过
  }
  return null;
}
function stripWrapper(argv) {
  for (let i = 1; i < argv.length; i++) {
    const t = String(argv[i]);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue;            // env FOO=bar
    if (t.startsWith('-')) { if (FLAG_TAKES_VALUE.has(t.toLowerCase())) i++; continue; }
    if (/^\d+[smhd]?$/.test(t)) continue;                         // timeout 60 / nice 10
    return argv.slice(i);
  }
  return [];
}
function scanHold(argv, depth) {
  if (depth > 4 || argv.length === 0) return null; // 剥不完的嵌套:不再猜,直接不拦(交给调用方的授权边界)
  const exe = exeName(argv[0]);
  if (!exe) return null;

  // (a) 文本型 pattern:解析不出来的写法(SQL 等)只能按整串判。
  const flat = argv.map((t) => String(t)).join(' ').replace(/\s+/g, ' ').toLowerCase();
  const text = TEXT_PATTERNS.find((p) => flat.includes(String(p).toLowerCase()));
  if (text) return text;

  // (b) 删除类 / 磁盘级破坏:一律拒执。
  if (RM_FAMILY.has(exe)) return exe;

  // (c) shell 用 -c 把命令藏进字符串 → 拒执。不带 -c 的 `sh ./configure` 是正经用法,放行。
  if (SHELLS.has(exe)) {
    const f = argv.find((t) => SHELL_EXEC_FLAGS.has(String(t).toLowerCase()));
    if (f) return `${exe} ${f}`;
  }

  // (d) find 的 -delete / -exec:同样是「把动作藏进参数」。
  if (exe === 'find') {
    const act = argv.map((t) => String(t).toLowerCase()).find((t) => FIND_ACTIONS.has(t));
    return act ? `find ${act}` : null;
  }

  // (e) 透明包装:剥掉自身与取值,递归判内层。
  if (WRAPPERS.has(exe)) {
    const inner = stripWrapper(argv);
    return inner.length ? scanHold(inner, depth + 1) : null;
  }

  // (f) 危险子命令:先跳过全局旗标与其取值,再查表。
  const sub = subcommandOf(argv);
  const danger = DANGEROUS_SUBCOMMAND[exe];
  if (sub && danger && danger.has(sub)) return `${exe} ${sub}`;
  if (exe === 'git' && sub === 'reset' && argv.some((t) => String(t) === '--hard')) return 'git reset --hard';
  return null;
}
export function holdHit(cmdArgs) {
  return scanHold((Array.isArray(cmdArgs) ? cmdArgs : [cmdArgs ?? '']).map(String), 0);
}

// ── 脱敏(spec §16 票 22):打码是最后一道防线 ──────────────────────────────────
// 在**唯一写入口** writeEvent 里对整条记录递归打码,所以「落盘 events.jsonl 里出现明文密钥」
// 这件事对 append / check / init 任一路径都不可能发生(不靠调用方自觉)。
const REDACT = '[redacted]';
export const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{6,}/g,                // OpenAI / Anthropic 风格 API key
  /AKIA[0-9A-Z]{12,}/g,                   // AWS access key id
  /gh[oprsu][-_][A-Za-z0-9]{16,}/g,       // GitHub token 家族(ghp_/gho_/ghs_/ghu_/ghr_)
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g,    // Authorization: Bearer …
  // 长 hex(私钥指纹、哈希)。阈值定在 64,不是 32:32/40 位 hex 压倒性地是 **git SHA / 内容哈希**
  // ——那是公开标识符,而台账正是它该出现的地方。真正的密钥材料(32 字节密钥、ed25519)至少 64 位 hex。
  // 旧阈值 32 把每个 git SHA 都绞成 [redacted],属于过度脱敏(票 22 复核)。
  /\b[0-9a-fA-F]{64,}\b/g,
];
// 长 base64 只在「像随机串」时打码:至少含两类字符(小写/大写/数字/符号)。
// 单一字符的长串(如测试里 `'x'.repeat(9000)`)是正常文本,不该被当密钥误伤——过早脱敏
// 会把「唯一写入口」变成一台绞肉机,连正常字段都吃掉。
const B64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;
const isHexRun = (s) => /^[0-9a-fA-F]+$/.test(s);
const looksRandom = (s) => {
  // 纯 hex 交给上面那条 hex 规则单独判。否则一条 40 位 git SHA 会被 base64 规则顺手绞掉
  // ——它有「数字 + 小写」两类字符,恰好满足下面的旧判据。这正是 2b 那条「不过度脱敏」要钉住的。
  if (isHexRun(s)) return s.length >= 64;
  let cls = 0;
  if (/[a-z]/.test(s)) cls++;
  if (/[A-Z]/.test(s)) cls++;
  if (/[0-9]/.test(s)) cls++;
  if (/[+/=]/.test(s)) cls++;
  // 旧判据「至少两类字符」把**纯小写的长 base64** 当正常文本放了过去(票 22 复核)。
  // 补一条与大小写无关的判据:字符种类数。`'x'.repeat(9000)` 只有 1 种 → 放行;
  // 纯小写 base64 有二十来种 → 打码。两条取或,偏严的一侧。
  return cls >= 2 || new Set(s).size >= 16;
};
export function redactText(s) {
  let out = String(s);
  for (const re of SECRET_PATTERNS) out = out.replace(re, REDACT);
  return out.replace(B64_RUN, (m) => (looksRandom(m) ? REDACT : m));
}
function redactDeep(v) {
  if (typeof v === 'string') return redactText(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = redactDeep(v[k]);
    return o;
  }
  return v;
}

// 锁的时间参数(票 12 的实现参照取值)
const STALE_MS = 30_000;        // 心跳静默超过此值即判死
const HEARTBEAT_MS = 10_000;    // 持锁期刷锁目录 mtime 的间隔
const UNOWNED_GRACE_MS = 1_000; // mkdir 与写 owner.json 之间崩溃的宽限
const LOCK_POLL_MS = 5;         // 首轮轮询间隔
const LOCK_POLL_MAX_MS = 100;   // 退避上限(避免整段 timeout 里 5ms 空转数千次)
// 抬高上限:临界区本是毫秒级,唯一能拖到秒级的是「持锁进程事件循环被占住」。
// 取到 STALE_MS 之上,给「抢占卡死者」留出成功窗口;真到了也拿不到,由 append 的无锁兜底接住。
const LOCK_TIMEOUT_MS = STALE_MS + 2_000;

// ── 路径 ────────────────────────────────────────────────────────────────────
export const taskboardDir = (root) => path.join(path.resolve(root), '.taskboard');
export const runsDir = (root) => path.join(taskboardDir(root), 'runs');
// 写盘边界(票 06 / 票 22 / 工单 35):run id 必须是**单一路径片段**。
// 所有命令共用此入口,越界与非法片段在这一处拒绝,不在各命令里各加一份。
export function runDirOf(root, runId) {
  const id = runId == null ? '' : String(runId);
  if (id === '' || id === '.' || /[/\\\0]/.test(id)) {
    throw new Error(`非法 run id「${runId}」:必须是单一路径片段(非空、非 . 、不含 / \\ 或 NUL)`);
  }
  const base = path.resolve(runsDir(root));
  const dir = path.resolve(base, id);
  if (path.dirname(dir) !== base) {
    throw new Error(`非法 run id「${runId}」:解析后越出 runs 目录(${dir})`);
  }
  return dir;
}
const eventsPathOf = (rd) => path.join(rd, 'events.jsonl');
const indexPathOf = (rd) => path.join(rd, 'index.json'); // M1:常量大小的分配索引(不进临界区读全量日志)
const statePathOf = (rd) => path.join(rd, 'state.js');
const lockDirOf = (rd) => path.join(rd, '.lock');
const ownerPathOf = (rd) => path.join(lockDirOf(rd), 'owner.json');
const currentPathOf = (root) => path.join(taskboardDir(root), 'current.json');

const nowIso = () => new Date().toISOString();
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ── 项目级策略(票 33):`.taskboard/policy.json` **用户手写**,`tl` **只读**,绝不写它 ─────
// 不新增写路径(守 [06] 写盘边界)。缺席 / 空文件 / 非法 JSON / 非对象 → 一律回落内置默认。
// 只挑项目级键(review_paths / big_change_lines);权重类键读不进来(见 project.mjs)。
export const policyPathOf = (root) => path.join(taskboardDir(root), 'policy.json');
export function readProjectPolicy(root) {
  let raw;
  try { raw = fs.readFileSync(policyPathOf(root), 'utf8'); }
  catch { return {}; }                       // 缺席 / 读不动 → 内置默认
  if (raw.trim() === '') return {};          // 空文件 → 内置默认
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return {}; }                       // 非法 JSON → 内置默认(不抛崩)
  return projectPolicyPatch(parsed);         // 非对象 / 非项目级键在此被丢干净
}

// ── 事件读写 ────────────────────────────────────────────────────────────────
// 无法 parse 的行**不再静默丢弃**:做成一个占位记录。
//   · 占位占住一个数组位置 → 分配器用 max(maxSeq, 行数)+1,不会复用坏行原本占用的 seq;
//   · project 认得出 _bad → 在 state.notes 里现形(旧注释声称「投影里现形」但投影根本看不到,现已坐实)。
export function readEvents(rd) {
  const p = eventsPathOf(rd);
  if (!fs.existsSync(p)) return [];
  const out = [];
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    try { out.push(JSON.parse(line)); }
    catch (e) {
      out.push({ v: SCHEMA, seq: null, t: null, run: null, actor: 'system', type: 'unparsed',
        ref: null, _bad: true, data: { line: i + 1, reason: e.message, raw: line.slice(0, 200) } });
    }
  }
  return out;
}
const maxSeq = (events) => events.reduce((m, e) => (Number.isInteger(e?.seq) ? Math.max(m, e.seq) : m), 0);
// seq 高水位:取「已分配的最大 seq」与「物理行数」的较大者——坏行/无锁并发都可能让两者不等。
const seqFloor = (events) => Math.max(maxSeq(events), events.length);

// [12] Q12b:--ref 留空即新建,按实体类型分配短编号(agent 要能记住并按编号回复)。
// M1:编号高水位不再每次扫描全量日志,而是落在常量大小的 index.json 上(见下)。
const REF_PREFIXES = Object.values(AUTO_REF); // ['T','D','K','C']
function refPrefixOf(ref) {
  if (typeof ref !== 'string') return null;
  for (const p of REF_PREFIXES) if (ref.startsWith(p)) return p;
  return null;
}
function entityPrefix(type) {
  const head = String(type).split('.')[0];
  return AUTO_REF[head] ?? null;
}

// ── 分配索引(M1):把 seq/编号高水位放进常量大小的 index.json ─────────────────
// [17] 要求 append 的临界区是「毫秒级、只追加一行」。旧实现每次在锁内 readEvents
// + 逐行 JSON.parse 全量日志来算 seq/nextRef,持锁时间随日志长度线性增长。
// 现在:锁内只 statSync 比一次大小(O(1));索引与文件不符(被旁路改写、crash 掉队)时
// 才 O(n) 重建一次。字段:
//   seq        已分配的最大 seq(缺行/坏行使它与行数不等时以「行数」兜底,见 rebuildIndex)
//   refs       {T,D,K,C} 各实体类型的编号高水位
//   fileBytes 上一次写入后 events.jsonl 的字节数——用来 O(1) 发现旁路改写
const fileSizeOf = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
function readIndex(rd) {
  try {
    const c = JSON.parse(fs.readFileSync(indexPathOf(rd), 'utf8'));
    if (c && Number.isInteger(c.seq) && Number.isInteger(c.fileBytes) && c.refs && typeof c.refs === 'object') return c;
  } catch { /* 缺失/损坏 → 重建 */ }
  return null;
}
// O(n):只在索引缺失、损坏,或 events.jsonl 被本进程之外的写者改动过时调用(自愈)。
function rebuildIndex(rd) {
  const events = readEvents(rd);
  const refs = {};
  for (const e of events) {
    const p = refPrefixOf(e?.ref);
    if (!p) continue;
    const n = Number(e.ref.slice(p.length));
    if (Number.isInteger(n) && n > (refs[p] ?? 0)) refs[p] = n;
  }
  return { seq: seqFloor(events), refs, fileBytes: fileSizeOf(eventsPathOf(rd)) };
}
function indexFor(rd) {
  const cur = readIndex(rd);
  if (cur && cur.fileBytes === fileSizeOf(eventsPathOf(rd))) return cur; // 稳态 O(1)
  return rebuildIndex(rd);
}
function writeIndex(rd, idx) {
  idx.fileBytes = fileSizeOf(eventsPathOf(rd));
  atomicReplace(indexPathOf(rd), JSON.stringify(idx));
}
// 索引是**派生缓存**:它只记 fileBytes 与编号高水位,一变就全量 rebuild(indexFor)。
// 所以它写不进去只该降级成「下次 O(n) 重建」,**不该**把已经落盘的事件报成写失败
// ——旧实现里 writeIndex 一抛就穿出 writeEvent,调用方拿到非 0 退出码、以为事件丢了,
// 其实日志里已经有了(票 21 复核)。真写不进去的日志(append 那一步)照旧抛出,不吞。
function writeIndexBestEffort(rd, idx) {
  try { writeIndex(rd, idx); } catch { /* 缓存坏了就重建,不是错误 */ }
}

// [12]/§6.1 单条 ≤ 2 KB:超预算时逐字符串截断,仍超则整体折叠,绝不拒收。
// 复核修正:旧实现只截 data 里的字符串值,顶层 type/ref/actor/run 不受约束
// (append({type:'x'.repeat(9000)}) 曾落盘 9000+ 字节)。现对整条记录兜底。
const TOP_FREE_STRINGS = ['type', 'ref', 'actor', 'run'];
const truncateStr = (s, keep) => (s.length <= keep ? s : `${s.slice(0, keep)}…`);
const byteLen = (v) => Buffer.byteLength(JSON.stringify(v));
export function fitRecord(rec0) {
  let rec = rec0;
  if (byteLen(rec) <= MAX_RECORD_BYTES) return JSON.stringify(rec);
  // 1) data 里的字符串值逐个截断
  if (rec.data && typeof rec.data === 'object') {
    const data = { ...rec.data };
    const keys = Object.keys(data).filter((k) => typeof data[k] === 'string').sort((a, b) => data[b].length - data[a].length);
    for (const k of keys) {
      // 注意:截断到「8 字符 + …」(长 9)后可能仍超预算(顶层字段本身过长时)。
      // 必须检测「再截一次不会更短」并退出,否则 here 会死循环(旧实现即有此隐患)。
      while (data[k].length > 8 && byteLen({ ...rec, data }) > MAX_RECORD_BYTES) {
        const shrunk = `${data[k].slice(0, Math.max(8, Math.floor(data[k].length * 0.75)))}…`;
        if (shrunk.length >= data[k].length) break;
        data[k] = shrunk;
      }
    }
    rec = { ...rec, data };
  }
  if (byteLen(rec) <= MAX_RECORD_BYTES) return JSON.stringify(rec);
  // 2) 顶层自由字符串字段同样受 2 KB 约束
  for (const k of TOP_FREE_STRINGS) {
    if (byteLen(rec) <= MAX_RECORD_BYTES) break;
    if (typeof rec[k] === 'string' && rec[k].length > 64) rec = { ...rec, [k]: truncateStr(rec[k], 64) };
  }
  if (byteLen(rec) <= MAX_RECORD_BYTES) return JSON.stringify(rec);
  // 3) data 整体折叠
  rec = { ...rec, data: { _truncated: '…' } };
  if (byteLen(rec) <= MAX_RECORD_BYTES) return JSON.stringify(rec);
  // 4) 硬兜底:所有顶层字符串压到 8 字符前缀(此时必 ≤ 2 KB)
  const hard = {};
  for (const k of Object.keys(rec)) hard[k] = typeof rec[k] === 'string' ? truncateStr(rec[k], 8) : rec[k];
  return JSON.stringify(hard);
}

// ── 锁:锁目录 + 原子 mkdir + owner.json{pid,token} + utimes 心跳 ─────────────
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM 算活(无权但是存在)
}
function readOwner(rd) {
  const p = ownerPathOf(rd);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
// 三个抢占条件(票 12):pid 已死 / owner.json 久未出现 / 心跳静默超 stale。
function lockIsStale(rd, now = Date.now()) {
  let mtimeMs;
  try { mtimeMs = fs.statSync(lockDirOf(rd)).mtimeMs; } catch { return false; } // 锁已不在,不算 stale
  const age = now - mtimeMs;
  const owner = readOwner(rd);
  if (!owner) return age > UNOWNED_GRACE_MS;
  if (!pidAlive(owner.pid)) return true;
  return age > STALE_MS;
}

const touchLock = (rd) => { try { const t = new Date(); fs.utimesSync(lockDirOf(rd), t, t); } catch { /* 锁已不在 */ } };

// 抢占的并发安全(复核 F1):改 owner + 回读必须整体串行,否则 N 个迟到者会同时判 stale,
// 各自 writeOwner 后**回读到自己的 token**(写与回读之间没有互斥),于是 N 个进程同时「持锁」——
// 实测 12 个并发迟到者全部抢到。用 `mkdir lockDir.claim`(原子 create-if-not-exists)串行化
// 抢占临界区,**并在临界区内复核 stale**——这一步是承重的:排在后面的迟到者拿到 claim 时,
// 前一个赢家已把 owner 写好、mtime 刷新(见下),复核即判非 stale,于是它不会覆盖。
// claim 自身也会 stale(赢家写完前崩溃):超过 STALE_MS 由下一轮清掉。
// 注意 owner.json 的原子替换(写 tmp + rename)本就会刷新锁目录 mtime,这里再显式刷一次,
// 让「持锁目录 mtime 即心跳」这条不变量不依赖 rename 的副作用。
function takeover(rd, token) {
  const claim = `${lockDirOf(rd)}.claim`;
  try { fs.mkdirSync(claim); }
  catch (e) {
    if (['EEXIST', 'EPERM', 'EACCES'].includes(e.code)) {
      try { if (Date.now() - fs.statSync(claim).mtimeMs > STALE_MS) fs.rmSync(claim, { recursive: true, force: true }); } catch { /* 清 claim 失败,下一轮再试 */ }
      return false;
    }
    throw e;
  }
  let ok = false;
  try {
    if (lockIsStale(rd)) {          // 临界区内复核:期间锁可能已被他人接管或释放
      writeOwner(rd, token);
      touchLock(rd);
      const back = readOwner(rd);
      ok = !!back && back.token === token;
    }
  } finally {
    try { fs.rmSync(claim, { recursive: true, force: true }); } catch { /* claim 残留在 STALE_MS 后自愈 */ }
  }
  return ok;
}

// 拿不到锁返回 null(不抛),由调用方决定怎么办(票 12 可搬三点之一)。
export function acquireLock(rd, { timeoutMs = LOCK_TIMEOUT_MS } = {}) {
  const lockDir = lockDirOf(rd);
  const token = crypto.randomBytes(8).toString('hex');
  const deadline = Date.now() + timeoutMs;
  let poll = LOCK_POLL_MS;
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      writeOwner(rd, token);
      touchLock(rd);
      return startHeartbeat(rd, token);
    } catch (e) {
      // Windows 上 mkdir 撞到「正被删除 / 正被占用的同名目录」会抛 EPERM/EACCES 而非 EEXIST,
      // 语义与争用相同,一并当争用处理(退到 stale 判定 + 重试),不要转成致命错误。
      if (!['EEXIST', 'EPERM', 'EACCES'].includes(e.code)) throw e;
    }
    if (lockIsStale(rd) && takeover(rd, token)) return startHeartbeat(rd, token);
    if (Date.now() >= deadline) return null;
    sleepSync(poll);
    poll = Math.min(LOCK_POLL_MAX_MS, Math.ceil(poll * 1.5)); // 退避:长等待不再 5ms 空转
  }
}
function writeOwner(rd, token) {
  atomicReplace(ownerPathOf(rd), JSON.stringify({ pid: process.pid, token, at: nowIso() }));
}
function startHeartbeat(rd, token) {
  touchLock(rd); // 立即刷一次:消除 mkdir/抢占与首个 interval 之间的 stale 窗口
  const timer = setInterval(() => { touchLock(rd); }, HEARTBEAT_MS);
  if (timer.unref) timer.unref();
  return { rd, token, lockDir: lockDirOf(rd), timer };
}
// ⚠️ 票 12 明写:不得继承上游的裸 `rm -rf`。释放前先读 owner.json,
//    token 不是自己的就不动——这样迟到的释放退化为 no-op,ABA 关闭。
export function releaseLock(handle) {
  if (!handle) return false;
  if (handle.timer) clearInterval(handle.timer);
  const owner = readOwner(handle.rd);
  if (!owner || owner.token !== handle.token) return false;
  fs.rmSync(handle.lockDir, { recursive: true, force: true });
  return true;
}

// ── 原子替换:tmp + fsync + rename(只用于整文件替换,如 state.js) ─────────────
export function atomicReplace(target, content) {
  const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // Windows 上 rename 覆盖已有文件可能因读者短暂持有而 EPERM/EBUSY,短重试。
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, target); return; }
    catch (e) {
      if (i < 40 && ['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { sleepSync(5); continue; }
      try { fs.rmSync(tmp, { force: true }); } catch { /* 清场失败不掩盖原错 */ }
      throw e;
    }
  }
}

// ── 序列化:window.__TL__ = <JSON>;  纯数据赋值,无副作用([10] 硬约束) ─────────
export function serializeState(state) {
  const json = JSON.stringify(state, null, 2)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.__TL__ = ${json};\n`;
}

// ── 投影:见 ./project.mjs(票 21 的完整 reducer 已就位;此处只留写路径) ──────────

// ── 写入:唯一的事件分配 + 追加路径(append 与 init 共用,H1 闭合旁路) ──────────
// 调用方负责持锁;但**锁不得时也照样调用**——这是「永不拒收」的落点。
// M1:分配 seq/编号只读常量大小的 index.json(O(1)),不读全量日志——临界区回到「只追加一行」。
//     index.json 只加速分配;events.jsonl 的行序仍是唯一真相(project 照旧按行序重算 canonical seq)。
function writeEvent(rd, runId, { type, ref = null, data = {}, actor = 'main' }) {
  const idx = indexFor(rd);
  const seq = idx.seq + 1;
  const prefix = entityPrefix(type);
  const finalRef = ref ?? (prefix ? `${prefix}${(idx.refs[prefix] ?? 0) + 1}` : null);
  const rec = { v: SCHEMA, seq, t: nowIso(), run: runId, actor, type, ref: finalRef, data };
  fs.appendFileSync(eventsPathOf(rd), `${fitRecord(redactDeep(rec))}\n`);
  // 回写索引:seq 高水位、编号高水位(显式给的 ref 也要抬高,与旧 nextRef 的语义一致)。
  idx.seq = seq;
  const rp = refPrefixOf(finalRef);
  if (rp) { const n = Number(finalRef.slice(rp.length)); if (Number.isInteger(n)) idx.refs[rp] = Math.max(idx.refs[rp] ?? 0, n); }
  writeIndexBestEffort(rd, idx);
  return { seq, ref: finalRef };
}

// ── 机器验证类事件由 append 产生的降级表(票 26 返修) ────────────────────────
// [06] 决议:agent 追加的行**只能产出 claimed**。而 project.mjs 按事件类型把
// `check.run` 记成 src='run'(机器验证)——于是 agent 只要手写
// `tl append --type check.run --data '{"result":"pass","exit":0}'` 就能凭空造出「机器验证通过」,
// 拿到 priority.score=-1 并进 queue.low_eligible(票 22 复核实测复现)。
// 修法用**降级**而不是**拒收**:事件照样落盘(「永不拒收」是 [12] 的硬契约),但类型换成
// `check.claim`,投影里就是 claimed;降级原因写进 data,页面与日志都看得见。
// check.run 只能由 `tl check` 亲自写盘——那条路径不走 append。
const RESERVED_EVIDENCE_TYPES = Object.freeze({ 'check.run': 'check.claim' });

// ── spec §8.7 第 2 步:改选后为 redo 集合**新建 TODO**(origin=decision, rounds+1) ──
// 生成这件事放在写入口(append)、不放在投影(project)里:日志是唯一真源。
// 让 project 凭空造出一个没有 item.add 事件的项,正是票 22 那个幽灵 C1 的形状
// ——刚从一个缝里堵上,不该从另一个缝里长回来。所以投影对 decision.answer
// 只做标记(stale/superseded),「返工待办」由 CLI 在写盘时补成**真事件**。
//
// 幂等键取 (decision id, 被重做的旧项 id):同一次改选不会被重复派生,
// 上一次派生中途失败也能在下一次 append 时补齐。
const DECISION_ANSWERISH = Object.freeze(new Set(['decision.answer', 'decision.override']));

function reconcileRedoTodos(rd, runId) {
  const spawned = [];
  let st;
  // 项目级策略(票 33)只影响队列/评分,不影响 items/decisions —— 这里不注入也可以。
  try { st = project(readEvents(rd), nowIso()); } catch { return spawned; } // 投不出来就什么都不做
  const items = st.items ?? [];
  const already = new Set(items.filter((i) => i.origin?.type === 'decision' && i.origin.ref != null)
    .map((i) => `${i.origin.ref}\u0000${i.origin.summary ?? ''}`));
  let maxN = 0;
  for (const i of items) { const m = /^T(\d+)$/.exec(i.id); if (m) maxN = Math.max(maxN, Number(m[1])); }
  for (const d of st.decisions ?? []) {
    if (d.status !== 'overridden' || !d.effective) continue;
    for (const oldId of asArrK(d.effective.ripple?.items?.redo)) {
      const old = items.find((i) => i.id === oldId);
      if (!old) continue;
      const key = `${d.id}\u0000${oldId}`;
      if (already.has(key)) continue;
      const nid = `T${++maxN}`;
      const put = (type, data) => writeEvent(rd, runId, { type, ref: nid, data, actor: 'system' });
      put('item.add', { title: `返工:${old.title || oldId}`, deps: asArrK(old.deps) });
      put('item.reopen', { why: `改选 ${d.id}` });                                  // rounds 1→2,回到 todo
      // item.reopen 会把 origin 覆写成 review,这里按 §8.7 改回来(最后一条 item.add 生效)。
      put('item.add', { origin: { type: 'decision', ref: d.id, summary: oldId } });
      already.add(key);
      spawned.push(nid);
    }
  }
  return spawned;
}

// ── append:唯一写入口,永不拒收 ──────────────────────────────────────────────
// 锁内只做「追加一行」;出锁后全量 project + 原子替换。投影失败**不回滚** append。
// H2:拿不到锁**不拒收**——仍落盘,seq 以文件行序为准(project 会重算并记 notes),
//     并置 dirty 留痕。绝不走「丢事件换退出码」那条路。
export function append({ root, runId, type, ref = null, data = {}, actor = 'main', lockTimeoutMs = LOCK_TIMEOUT_MS }) {
  if (!type || typeof type !== 'string') throw new Error('append 需要 --type');
  const downgradedTo = RESERVED_EVIDENCE_TYPES[type] ?? null;
  const effType = downgradedTo ?? type;
  const effData = downgradedTo
    ? { ...data, forced: `append 不能写 ${type}(机器验证只能由 tl check 亲自写盘),已按 ${downgradedTo} 落盘` }
    : data;
  let id = runId ?? currentRun(root);
  if (!id) id = initRun({ root }).runId;               // 永不拒收:没有 run 就地自动开工
  const rd = runDirOf(root, id);
  if (!fs.existsSync(rd)) fs.mkdirSync(rd, { recursive: true }); // run 不存在就地建,不拒收

  // —— 临界区(毫秒级) ——
  const lock = acquireLock(rd, { timeoutMs: lockTimeoutMs });
  const unlocked = !lock;
  let assigned;
  try {
    assigned = writeEvent(rd, id, { type: effType, ref, data: effData, actor }); // 无锁也写,事件绝不丢
  } finally {
    releaseLock(lock); // lock 为 null 时退化为 no-op
  }

  // —— 改选的派生事件(spec §8.7 第 2 步) ——
  // 只有「答了决策」这类事件才需要;拿不到锁就跳过(下次 append 会自动补齐,幂等)。
  if (DECISION_ANSWERISH.has(effType)) {
    const l2 = acquireLock(rd, { timeoutMs: lockTimeoutMs });
    try { if (l2) reconcileRedoTodos(rd, id); } finally { releaseLock(l2); }
  }

  // —— 锁外:投影(纯函数)+ 原子替换 ——
  try {
    writeState(root, id, nowIso());
  } catch (e) {
    markDirty(rd, `projection failed: ${e.message}`);
    noteSafely(root, id, `projection failed: ${e.message}`);
  }
  // 无锁落盘留痕(在 writeState 之后置,避免被成功的投影顺手清掉)
  if (unlocked) markDirty(rd, 'append 未取得锁:按无锁路径落盘,seq 以文件行序为准');
  return { ...assigned, forced: downgradedTo };
}

// 投影并原子落盘 state.js。成功后清 dirty(旧实现只写不清,一次瞬态失败会永久残留)。
// 项目级策略在这里读一次并注入(票 33):`tl` 只读 `.taskboard/policy.json`,缺席即内置默认。
export function writeState(root, runId, now) {
  const rd = runDirOf(root, runId);
  const state = project(readEvents(rd), now, readProjectPolicy(root));
  atomicReplace(statePathOf(rd), serializeState(state));
  clearDirty(rd);
  return state;
}
function markDirty(rd, msg) {
  try { fs.writeFileSync(path.join(rd, 'dirty'), `${nowIso()} ${msg}\n`); } catch { /* 置 dirty 失败不致命 */ }
}
function clearDirty(rd) {
  try { fs.rmSync(path.join(rd, 'dirty'), { force: true }); } catch { /* 清 dirty 失败不致命 */ }
}
// 投影失败时补记一条 note(不再投影,避免递归)。走同一个 writeEvent。
function noteSafely(root, runId, msg) {
  try {
    const rd = runDirOf(root, runId);
    const lock = acquireLock(rd, { timeoutMs: 2000 });
    try { writeEvent(rd, runId, { type: 'note', ref: null, data: { msg }, actor: 'system' }); }
    finally { releaseLock(lock); }
  } catch { /* note 是尽力而为 */ }
}

// ── init:空手 init(票 15) ───────────────────────────────────────────────────
// taste 记忆(票 24 落地):文件位置与形状是本票定的,`tl init` 读它并套用;
// 写入走 `tl taste`(全局只写这一份 token,见票 06/16)。
export const DEFAULT_TASTE = { theme: 'light', accent: '#c2563f', density: 'comfortable' };
const TASTE_THEMES = ['light', 'dark'];
const TASTE_DENSITIES = ['comfortable', 'compact'];
export const tastePath = () => path.join(os.homedir(), '.claude', 'taskboard-taste.json');
function normalizeTaste(t) {
  const src = t && typeof t === 'object' ? t : {};
  return {
    theme: TASTE_THEMES.includes(src.theme) ? src.theme : DEFAULT_TASTE.theme,
    accent: typeof src.accent === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(src.accent) ? src.accent : DEFAULT_TASTE.accent,
    density: TASTE_DENSITIES.includes(src.density) ? src.density : DEFAULT_TASTE.density,
  };
}
export function readTaste() {
  try { return normalizeTaste(JSON.parse(fs.readFileSync(tastePath(), 'utf8'))); }
  catch { return { ...DEFAULT_TASTE }; } // 读不到就用默认主题(票 20:别做成硬依赖)
}
// 写 taste:原子替换;只覆写显式给出的字段(其余沿用现值/默认)。
export function writeTaste({ theme, accent, density } = {}) {
  const cur = readTaste();
  const next = normalizeTaste({
    theme: theme ?? cur.theme, accent: accent ?? cur.accent, density: density ?? cur.density,
  });
  const p = tastePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  atomicReplace(p, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
function defaultRunId(root, title) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  // 工单 35 / 发现 5:保留 CJK(Unicode 属性类),别再被剥成空串退化为 'run'。
  const slug = String(title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  const base = `${stamp}-${slug || 'run'}`;
  // 同分钟同标题会撞同一 id(中文标题尤其):目录已存在就追加 -N 后缀去重。
  let id = base;
  for (let i = 2; fs.existsSync(runDirOf(root, id)); i++) id = `${base}-${i}`;
  return id;
}
export function currentRun(root) {
  // 1. 优先读取 current.json 并校验对应的 run 目录真实存在
  try {
    const curPath = currentPathOf(root);
    if (fs.existsSync(curPath)) {
      const data = JSON.parse(fs.readFileSync(curPath, 'utf8'));
      if (typeof data.run === 'string' && data.run.trim()) {
        const candidate = data.run.trim();
        const rDir = runDirOf(root, candidate);
        if (fs.existsSync(rDir)) {
          return candidate;
        }
      }
    }
  } catch {}

  // 2. 兜底安全发现:从 .taskboard/runs/ 扫描最新有效的 run 目录
  try {
    const rDir = runsDir(root);
    if (fs.existsSync(rDir)) {
      const entries = fs.readdirSync(rDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => {
          const runPath = path.join(rDir, d.name);
          let mtime = 0;
          try { mtime = fs.statSync(runPath).mtimeMs; } catch {}
          return { name: d.name, mtime };
        })
        .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
      if (entries.length > 0) {
        return entries[0].name;
      }
    }
  } catch {}

  return null;
}

// ── 离线多文件资源部署 (Constraint 1 / 票 23 / 票 26) ────────────────────────
// 把 templates/ 下的单一真源模板部署到指定 run 目录,生成离线可双击打开的 timeline.html
export function deployOfflineAssets(root, runId) {
  const rd = runDirOf(root, runId);
  if (!fs.existsSync(rd)) fs.mkdirSync(rd, { recursive: true });
  const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

  // 工单 35 / 发现 4:部署源必须是 app.js 真正消费的完整页 timeline.html。
  const srcHtml = path.join(templatesDir, 'timeline.html');
  const targetHtml = path.join(rd, 'timeline.html');
  if (fs.existsSync(srcHtml)) {
    const html = fs.readFileSync(srcHtml, 'utf8');
    fs.writeFileSync(targetHtml, html, 'utf8');
  }

  const srcCss = path.join(templatesDir, 'style.css');
  const targetCss = path.join(rd, 'style.css');
  if (fs.existsSync(srcCss)) {
    fs.copyFileSync(srcCss, targetCss);
  }

  const srcJs = path.join(templatesDir, 'app.js');
  const targetJs = path.join(rd, 'app.js');
  if (fs.existsSync(srcJs)) {
    fs.copyFileSync(srcJs, targetJs);
  }

  return { timelineHtml: targetHtml, styleCss: targetCss, appJs: targetJs };
}

// ── 四视图定义与查看路由 (Constraint 4) ──────────────────────────────────────
export const VALID_VIEWS = Object.freeze(['board', 'decisions', 'journey', 'ledger']);

export function viewRun({ root, runId, view = 'board' }) {
  const normView = String(view || 'board').toLowerCase();
  if (!VALID_VIEWS.includes(normView)) {
    throw new Error(`未知视图「${view}」: 仅支持 ${VALID_VIEWS.join('|')}`);
  }

  let id = runId;
  if (id) {
    const rd = runDirOf(root, id);
    if (!fs.existsSync(rd) || !fs.existsSync(eventsPathOf(rd))) {
      throw new Error(`指定的 run「${id}」不存在: 查看视图绝不静默建 run 或接收不存在的编号`);
    }
  } else {
    id = currentRun(root);
    if (!id) {
      throw new Error('未找到当前正在进行的 run: 先创建 run 或运行 init');
    }
  }

  deployOfflineAssets(root, id);
  const state = writeState(root, id, nowIso());
  const rd = runDirOf(root, id);
  const htmlPath = path.join(rd, 'timeline.html');
  const fileUrl = `file:///${path.resolve(htmlPath).replace(/\\/g, '/')}#${normView}`;

  return {
    runId: id,
    view: normView,
    path: htmlPath,
    url: fileUrl,
    state
  };
}

// ── 写盘边界(票 06 / 票 22):本技能在目标仓只写 .taskboard/ 与一行 .gitignore ──
// 幂等:已有该行(或已有等价的行)就不动。**不碰**用户级 CLAUDE.md 与任何 settings。
export const GITIGNORE_LINE = '.taskboard/';
export function ensureGitignore(root) {
  const p = path.join(path.resolve(root), '.gitignore');
  let cur = '';
  // 工单 35 / 发现 3:只有 ENOENT 才算「不存在」;EACCES/EISDIR 等其余读错必须向上抛,
  // 否则 cur 被当成空串,后面会**整个覆盖**用户的 .gitignore。
  try { cur = fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const has = cur.split('\n').some((l) => l.trim().replace(/\/$/, '') === '.taskboard');
  if (has) return { path: p, changed: false };
  const next = cur === '' ? `${GITIGNORE_LINE}\n`
    : `${cur.replace(/\n*$/, '\n')}${GITIGNORE_LINE}\n`;
  fs.writeFileSync(p, next);
  return { path: p, changed: true };
}

// 首条记录是 run.start;工作项靠 origin:discovered 在执行中长出来,不预置骨架。
// 幂等恢复(票 26):同一 run 重复 init 时保留原标题、目标与初始开工时点。
export function initRun({ root, runId, title = '', goal = '', type = 'general' }) {
  let id = runId;
  let existingTitle = '';
  let existingGoal = '';
  let existingType = type;
  let isRecovery = false;

  if (id) {
    const rdCheck = runDirOf(root, id);
    const evp = eventsPathOf(rdCheck);
    if (fs.existsSync(evp)) {
      isRecovery = true;
      try {
        const lines = fs.readFileSync(evp, 'utf8').trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'run.start') {
              if (ev.data?.title) existingTitle = ev.data.title;
              if (ev.data?.goal) existingGoal = ev.data.goal;
              if (ev.data?.type) existingType = ev.data.type;
            }
          } catch {}
        }
      } catch {}
    }
  } else {
    id = defaultRunId(root, title);
  }

  const rd = runDirOf(root, id);
  fs.mkdirSync(rd, { recursive: true });
  atomicReplace(currentPathOf(root), JSON.stringify({ run: id, at: nowIso() }));
  if (!fs.existsSync(eventsPathOf(rd))) fs.writeFileSync(eventsPathOf(rd), '');
  ensureGitignore(root); // 写盘边界:唯一一行 .gitignore(幂等)

  const finalTitle = title || existingTitle;
  const finalGoal = goal || existingGoal;
  const finalType = type !== 'general' ? type : (existingType || 'general');

  const taste = readTaste();
  // 与 append 同形状:拿不到锁也照写(永不拒收),只置 dirty 留痕。
  const lock = acquireLock(rd);
  try {
    writeEvent(rd, id, {
      type: 'run.start',
      ref: null,
      actor: 'system',
      data: {
        title: finalTitle,
        goal: finalGoal,
        type: finalType,
        theme: taste.theme,
        accent: taste.accent,
        density: taste.density
      }
    });
  } finally {
    releaseLock(lock);
  }
  if (!lock) markDirty(rd, 'init 未取得锁:按无锁路径落盘');

  // 部署多文件离线产物 (timeline.html / style.css / app.js) 并生成最新 state.js
  deployOfflineAssets(root, id);
  writeState(root, id, nowIso());
  return { runId: id, dir: rd, taste, isRecovery };
}

// ── check:唯一会执行外部命令的入口(spec §16 / 票 06 / 票 22) ────────────────
// 两条不变量:
//   · 命令过 hold 闸门,**执行前判定、拒绝执行**(返回 held,不 spawn、不落任何事件)。
//   · 「已执行(run)」与「自述(claim)」由机制区分:退出码由本程序写盘 → src='run'(project.mjs)。
// 记录只写**摘要**:name / result / exit / dur_s。**不记命令原文、不记输出、不记环境变量**。
export const CHECK_TIMEOUT_MS = 600_000;
export function check({ root, runId, ref = null, name = '', cmd, cwd, timeoutMs = CHECK_TIMEOUT_MS }) {
  if (!Array.isArray(cmd) || cmd.length === 0) throw new Error('check 需要 `-- <cmd> [args...]`');
  const hit = holdHit(cmd);
  if (hit) return { held: true, pattern: hit }; // 拒绝执行:判定在执行前,无绕过路径

  let id = runId ?? currentRun(root);
  if (!id) id = initRun({ root }).runId;             // 永不拒收:没有 run 就地开工
  const rd = runDirOf(root, id);
  if (!fs.existsSync(rd)) fs.mkdirSync(rd, { recursive: true });

  const t0 = Date.now();
  let exit;
  try {
    // stdio:'inherit':命令的输出去终端、**不经过本进程缓冲**——从机制上保证「输出不进事件」。
    const res = spawnSync(cmd[0], cmd.slice(1), {
      cwd: cwd ?? path.resolve(root), stdio: 'inherit', timeout: timeoutMs, windowsHide: true,
    });
    // ENOENT(命令不存在)/ EACCES 等 spawn 失败必须落 127,不能落 1:
    // 「命令根本没跑起来」与「命令跑了但失败」是两件事,旧实现把前者一律记成 1(票 22 复核)。
    exit = res.error ? (res.error.code === 'ETIMEDOUT' ? 124 : 127) : (res.status ?? 1);
  } catch { exit = 127; } // spawn 自身抛异常(极罕见)
  const dur_s = Math.round((Date.now() - t0) / 100) / 10;
  const result = exit === 0 ? 'pass' : 'fail';

  const lock = acquireLock(rd);
  let assigned;
  try { assigned = writeEvent(rd, id, { type: 'check.run', ref, data: { name, result, exit, dur_s }, actor: 'system' }); }
  finally { releaseLock(lock); }                    // lock 为 null 时退化为 no-op
  try { writeState(root, id, nowIso()); } catch (e) { markDirty(rd, `projection failed: ${e.message}`); }
  if (!lock) markDirty(rd, 'check 未取得锁:按无锁路径落盘');
  return { held: false, runId: id, exit, result, dur_s, ref: assigned.ref, seq: assigned.seq };
}

// ── finish:复核摘要(票 15 / 票 22) ──────────────────────────────────────────
// 措辞与长度上限**由本票定死**:总行数 ≤ FINISH_MAX_LINES;只顶出「值得复核」的前 FINISH_TOP_N 项;
// **不复述全部内容**——每条只给「编号 + 分数 + 一条主理由」,正文留给页面。
export const FINISH_MAX_LINES = 25;
export const FINISH_TOP_N = 5;

function replyExample(pending) {
  if (pending.length >= 2) return `${pending[0].id}=A; ${pending[1].id}=B; ok low`;
  if (pending.length === 1) return `${pending[0].id}=A; ok low`;
  return 'ok low  (批量复核低优先级且机器验证通过的项)';
}
// 纯函数:由投影后的 state 造摘要行。不读盘、不打印,便于夹具直接断言。
export function finishSummary(state) {
  const lines = [];
  const c = state.counts ?? {};
  const run = state.run ?? {};
  const title = run.title ? `「${run.title}」` : '';
  lines.push(`# run ${run.id ?? '?'} ${title}`.trim());
  const mins = Math.round((run.active_seconds ?? 0) / 60);
  lines.push(`状态 ${run.status ?? '?'} · 活跃 ${mins}m · TODO ${c.todo ?? 0} / DOING ${c.doing ?? 0} / DONE ${c.done ?? 0}` +
    `(复核 ${c.review?.ok ?? 0} ok / ${c.review?.flag ?? 0} flag / ${c.review?.unreviewed ?? 0} 未复核)`);
  const d = c.decisions ?? {};
  lines.push(`决策 待决 ${d.pending ?? 0} · 已决 ${d.resolved ?? 0} · 默认定夺 ${d.defaulted ?? 0}`);
  const openStuck = asArrK(state.stuck).filter((k) => !k.resolved_at);
  if (openStuck.length) lines.push(`卡点 ${openStuck.length} 个未解`);

  const q = state.queue ?? {};
  const review = Array.isArray(q.review) ? q.review : [];
  const pending = asArrK(state.decisions).filter((x) => x.status === 'pending_default' || x.status === 'pending_hold');
  const cap = Math.min(FINISH_TOP_N, Number.isInteger(q.top_n) && q.top_n > 0 ? q.top_n : FINISH_TOP_N);
  const top = review.slice(0, cap);

  if (top.length === 0 && pending.length === 0) {
    lines.push('没有值得复核的项。');
  } else {
    if (pending.length) {
      lines.push('待你决策:');
      for (const dec of pending.slice(0, FINISH_TOP_N)) lines.push(`  ${dec.id} ${dec.title || dec.question || ''}`.trimEnd());
    }
    if (top.length) {
      lines.push(`值得复核的 ${top.length} 处(共 ${review.length} 个已完成项,按优先级顶出):`);
      for (const r of top) lines.push(`  ${r.ref} 分数 ${r.score} · ${asArrK(r.reasons)[0] ?? '无特别理由'}`);
    }
  }
  lines.push(`回复示例:${replyExample(pending)}`);
  return lines.slice(0, FINISH_MAX_LINES); // 硬上限:任何 run 都不超过
}
function asArrK(v) { return Array.isArray(v) ? v : []; }

export function finish({ root, runId }) {
  const id = runId ?? currentRun(root);
  if (!id) throw new Error('没有可结束的 run:先 tl init');
  const rd = runDirOf(root, id);
  const lock = acquireLock(rd);
  try { writeEvent(rd, id, { type: 'run.end', ref: null, data: { status: 'done' }, actor: 'system' }); }
  finally { releaseLock(lock); }
  deployOfflineAssets(root, id);
  const state = writeState(root, id, nowIso());
  if (!lock) markDirty(rd, 'finish 未取得锁:按无锁路径落盘');
  return { runId: id, state, lines: finishSummary(state) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
    else out._.push(a);
  }
  return out;
}
function cli(argv) {
  const [cmd, ...rest] = argv;
  const args = parseArgs(rest);
  const root = args.root ?? process.cwd();
  if (cmd === 'init') {
    const r = initRun({ root, runId: args.run, title: args.title ?? '', goal: args.goal ?? '', type: args.type ?? 'general' });
    console.log(`${r.runId}`);
    return 0;
  }
  if (cmd === 'append') {
    let data = {};
    if (typeof args.data === 'string') {
      try { data = JSON.parse(args.data); } catch (e) { console.error(`--data 不是合法 JSON:${e.message}`); return 2; }
    }
    const r = append({ root, runId: args.run, type: args.type, ref: args.ref, data, actor: args.actor });
    if (r.forced) console.error(`注意:append 不能写 ${args.type},已按 ${r.forced} 落盘(机器验证只能由 tl check 亲自写盘)`);
    console.log(r.ref ?? `#${r.seq}`);
    return 0;
  }
  if (cmd === 'check') {
    // `--` 之后全是命令与参数(`--` 之前的才是 tl 自己的 flag)。
    const cut = rest.indexOf('--');
    if (cut < 0) {
      console.error('用法:tl.mjs check [--root R] [--run ID] [--ref T1] [--name 描述] -- <cmd> [args...]');
      return 2;
    }
    const flags = parseArgs(rest.slice(0, cut));
    // spec §16 的写法是 `tl check T3 --name 描述 -- cmd`(位置参数给编号)。
    // 旧实现只读 --ref,位置参数落进 flags._ 被无声丢掉:于是 T3 拿不到证据,
    // 又因为没给 ref 而自动分配出一个 C 编号(票 22 复核)。这里把它接上。
    const positionalRef = typeof flags._[0] === 'string' ? flags._[0] : null;
    const r = check({
      root: flags.root ?? process.cwd(), runId: flags.run,
      ref: typeof flags.ref === 'string' ? flags.ref : positionalRef,
      name: typeof flags.name === 'string' ? flags.name : '',
      cmd: rest.slice(cut + 1),
    });
    if (r.held) {
      console.error(`拒绝执行:命令命中 hold 闸门「${r.pattern}」(spec §16 G1)。任何命令都未被执行。`);
      return 3;
    }
    console.log(`${r.ref ?? `#${r.seq}`} ${r.result} (exit ${r.exit}, ${r.dur_s}s)`);
    return 0;
  }
  if (cmd === 'finish') {
    const r = finish({ root, runId: args.run });
    for (const l of r.lines) console.log(l);
    return 0;
  }
  if (cmd === 'taste') {
    // 无旗标 = 读;带 --theme/--accent/--density = 写(全局只写这一份 token)。
    const hasFlag = ['theme', 'accent', 'density'].some((k) => typeof args[k] === 'string');
    const t = hasFlag
      ? writeTaste({ theme: args.theme, accent: args.accent, density: args.density })
      : readTaste();
    console.log(JSON.stringify(t));
    return 0;
  }

  // 视图与查看路由 (Constraint 4):
  // 显式 view, 或无参数 (!cmd), 或首个参数为旗标 (cmd.startsWith('--'))
  if (cmd === 'view' || !cmd || cmd.startsWith('--')) {
    const fullArgs = parseArgs(argv);
    const viewRoot = fullArgs.root ?? process.cwd();
    const targetView = fullArgs.view ?? 'board';
    try {
      const v = viewRun({ root: viewRoot, runId: fullArgs.run, view: targetView });
      console.log(`run: ${v.runId}`);
      console.log(`view: ${v.view}`);
      console.log(`url: ${v.url}`);
      return 0;
    } catch (e) {
      console.error(e.message);
      return 1;
    }
  }

  // 带标题的手动创建入口 (Title / Create, Constraint 4):
  // 传了非旗标字符串且非已知子命令,视作指定标题新建 run
  if (typeof cmd === 'string' && !cmd.startsWith('-')) {
    const title = cmd;
    const r = initRun({
      root,
      runId: args.run,
      title,
      goal: args.goal ?? '',
      type: args.type ?? 'general',
    });
    console.log(`${r.runId}`);
    return 0;
  }

  console.error('用法:tl.mjs [<标题>] [--root R] [--run ID] [--view board|decisions|journey|ledger]');
  console.error('      tl.mjs init [--root R] [--run ID] [--title T] [--goal G] [--type T]');
  console.error('      tl.mjs append --type T [--ref R] [--data JSON] [--actor A] [--root R] [--run ID]');
  console.error('      tl.mjs check [--root R] [--run ID] [--ref R] [--name 描述] -- <cmd> [args...]');
  console.error('      tl.mjs finish [--root R] [--run ID]');
  console.error('      tl.mjs taste [--theme light|dark] [--accent #rrggbb] [--density comfortable|compact]');
  return 2;
}

// 只在直接执行时派发 CLI;被 import(夹具)时不派发。
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { process.exit(cli(process.argv.slice(2))); }
  catch (e) { console.error(e.message); process.exit(1); }
}
