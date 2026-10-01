// check 与 finish 的自检(票 22「check 与 finish」)。形状照 run-fixtures.mjs / run-projection-fixtures.mjs:
// 无测试框架,Node 标准库自己写;每条断言打印 ok/FAIL,全过退 0,否则退 1。
//
// 覆盖任务书「自检」四条:
//   1 hold 闸门   —— 对 7 条 pattern 各喂一条「本会创建文件」的命令,断言副作用探针**一个文件都没写**
//                     (外加 1b 控制组:无 pattern 的同形命令确实写出文件,证明探针不是空断言)
//   1c hold 等价写法 —— 子串匹配的形状是错的:同一个破坏性操作有无数种写法。本组先做**函数级表驱动**
//                     (35 种拼写必须命中 + 16 条良性命令必须不命中),再做**端到端真删**
//                     (本机的破坏性命令真能删掉 victim;闸门拦住后 victim 还在)。
//   1h 位置参数      —— spec §16 的 `tl check T3 --name x -- cmd` 要解析成 ref=T3,且不得生成幽灵编号
//   2 脱敏        —— 喂入 sk-… / AKIA… / ghp_… / Bearer … / 长 hex,断言落盘 events.jsonl 一个都不出现
//   3 写盘边界    —— 在临时 git 仓里完整跑一遍,断言 git status 恰好只有 .gitignore 一行,且它含 .taskboard/
//   4 finish 摘要 —— 行数上限 + 「只顶出值得复核的几处、不复述全部」口径 + **顶出顺序真的按优先级**
// 外加票面硬约束:
//   5 hold 无绕过路径 —— `--force` 也拒执([06]/[22]:判定在执行前,不是 --force 能开的)
//   6 check 只记摘要   —— 落盘的 check.run 事件里不含命令原文、不含输出、不含环境变量
//
// 注意:本票的 hold 判定在**执行前**完成、且是**拒绝执行**;探针证明的是「副作用没有发生」,不是「打了提示」。
//
// 闸门的能力上限(明说,不假装):本闸门做的是**argv 结构化匹配**,不是沙箱。
//   `node -e "…"` / `python -c "…"` / `perl -e "…"` 这类「把操作写成另一门语言」的写法**拦不住**,
//   而且在这个分层里**无法**拦住——要拦只能拦住所有解释器,那就等于禁掉 check 的全部用途。
//   真正的边界不在这里:真正的不变量是「agent 自己回合里跑 tl check 要用户授权」。
//   本闸门的目标是**拦住会写错的那一类写法**(旗标换序、全局旗标夹在中间、shell 包一层),不是提供安全保证。

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const DIR = import.meta.dirname;
const TL = join(DIR, 'tl.mjs');
const WORK = mkdtempSync(join(tmpdir(), 'tl-cf-fixtures-'));
const TL_URL = pathToFileURL(TL).href;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '_');

let bad = 0;
let total = 0;
function report(name, checks) {
  for (const [t, ok] of checks) {
    total++;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${name}] ${t}`);
  }
}
// 跑 tl.mjs 子命令,不因非 0 退出码而抛——退出码本身是断言对象(尤其 hold 的拒绝码)。
// 拿不到 .status(信号杀)时返回 -1,于是 `=== 3` 这种精确断言会自然判红。
function runTl(args) {
  try {
    const out = execFileSync('node', [TL, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
const evPathOf = (root, runId) => join(root, '.taskboard', 'runs', runId, 'events.jsonl');
const readEventsRaw = (root, runId) => (existsSync(evPathOf(root, runId)) ? readFileSync(evPathOf(root, runId), 'utf8') : '');
// state.js 的格式是硬约束([10]):纯 `window.__TL__ = <JSON>;` 赋值,所以能直接剥壳解析。
function readState(root, runId) {
  const p = join(root, '.taskboard', 'runs', runId, 'state.js');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8').replace(/^window\.__TL__ = /, '').replace(/;\s*$/, ''));
}

// 副作用探针:被执行就写一个以「参数」命名的文件。hold 测试把它当第 2 个参数的模式文本传进去,
// 于是「命令串含 pattern」与「执行会留痕」绑在一件命令上:没留痕 = 真没执行。
const PROBE = join(WORK, 'probe.mjs');
writeFileSync(PROBE, `
import { writeFileSync } from 'node:fs';
const tag = String(process.argv[2]).replace(/[^a-z0-9]+/gi, '_');
writeFileSync(process.argv[3] + '/' + tag, 'EXECUTED');
`);

// 造一个带哨兵文件的 victim 目录,返回路径。
let victimSeq = 0;
function makeVictim(tag) {
  const v = join(WORK, `victim-${++victimSeq}-${slug(tag)}`);
  mkdirSync(v, { recursive: true });
  writeFileSync(join(v, 'keep.txt'), 'SENTINEL');
  return v;
}

// ── 自检 1:hold 闸门(spec §16 的 7 条 pattern,端到端走完整 CLI) ─────────────
// 关键:破坏性命令必须放在**命令位**。旧夹具把 pattern 当**参数**喂给一个探针
// (`node probe.mjs 'git push'`),那测的其实是「命令行里提到这些词就拦」——而那正是
// 误伤(`--note 'rm -rf 是危险词'` 会被拒执)。命令位才是真语义,见 1c 的反向控制组。
// 这些命令一律**必须被拒执**,所以它们根本不会跑;万一闸门坏了,它们也都被加了 --dry-run
// 或落在没有仓库/没有配置的临时目录里,不会造成真实破坏。
{
  const root = join(WORK, 'hold');
  runTl(['init', '--root', root, '--run', 'hold-run', '--title', 'hold 夹具']);
  runTl(['append', '--root', root, '--run', 'hold-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"x"}']);

  const victimRm = makeVictim('spec-rm');
  const specCases = [
    ['git push', ['git', 'push', '--dry-run', 'origin', 'main']],
    ['git reset --hard', ['git', 'reset', '--hard']],
    ['rm -rf', ['rm', '-rf', victimRm]],
    ['DROP TABLE', ['psql', '-c', 'DROP TABLE users']],
    ['terraform apply', ['terraform', 'apply']],
    ['kubectl apply', ['kubectl', 'apply', '-f', 'k.yml']],
    ['npm publish', ['npm', 'publish', '--dry-run']],
  ];
  const codes = [];
  const eventsBefore = readEventsRaw(root, 'hold-run');
  for (const [label, argv] of specCases) {
    const r = runTl(['check', '--root', root, '--run', 'hold-run', '--ref', 'T1', '--', ...argv]);
    codes.push(`${label}=${r.code}`);
  }
  const eventsAfter = readEventsRaw(root, 'hold-run');
  report('1-hold闸门', [
    [`spec §16 的 7 条 pattern 一律以拒绝码 3 结束(实得 ${codes.join(' ')})`, codes.every((c) => c.endsWith('=3'))],
    // 拒执的另一半:命令没跑,而且**一条事件都不该落**(tl.mjs 注释「不 spawn、不落任何事件」)。
    [`被拒执的 7 条命令未落任何事件(日志长度 ${eventsBefore.length} → ${eventsAfter.length})`, eventsBefore === eventsAfter],
    // 副作用证据(比「没落事件」更硬):rm -rf 那条的 victim 必须还在。
    ['rm -rf 那条未留副作用(victim 目录与哨兵文件仍在)', existsSync(join(victimRm, 'keep.txt'))],
  ]);

  // 1b 控制组:同一形状、同一个探针,只是命令位不是破坏性命令 —— 必须被执行。
  // 没有它,「holdHit 恒返回真」也能让上面三条全绿。
  const probeDir = join(WORK, 'probe-hold');
  mkdirSync(probeDir, { recursive: true });
  const rc = runTl(['check', '--root', root, '--run', 'hold-run', '--ref', 'T1', '--', 'node', PROBE, 'control safe', probeDir]);
  report('1b-探针控制组', [
    ['无破坏性命令位的同形命令确实被执行(探针写出 control_safe)', readdirSync(probeDir).includes('control_safe')],
    ['该命令退出码 0', rc.code === 0],
  ]);

  // 5 --force 不是绕过路径:破坏性命令仍在命令位。
  // 快照要在**这次运行之前**重新取:1b 控制组合法地往日志里加过一条事件,拿旧快照比会把那笔算到 --force 头上。
  const beforeForce = readEventsRaw(root, 'hold-run');
  const rf = runTl(['check', '--root', root, '--run', 'hold-run', '--ref', 'T1', '--force', '--', 'git', 'push', '--dry-run']);
  report('5-hold无绕过', [
    [`--force 仍以拒绝码 3 拒执(实得 ${rf.code})`, rf.code === 3],
    ['--force 那次同样未落事件', readEventsRaw(root, 'hold-run') === beforeForce],
  ]);
}

// ── 自检 1c:hold 的等价写法(子串匹配是错的形状) ─────────────────────────────
// 分两层,因为这两层证明的事不一样:
//   · 1c-函数级:直接喂 argv 数组给 holdHit,把「所有拼写」一次铺开 —— 可移植、覆盖全,但只证明判定函数;
//   · 1c-端到端:用本机**真的会删目录**的命令跑一次完整 check —— 证明副作用确实没发生。
// 函数级那组还带**反向控制组**:一表良性命令必须**不**命中,否则「全判红」也能骗过上面那组。
{
  const root = join(WORK, 'hold-eq');
  runTl(['init', '--root', root, '--run', 'eq-run', '--title', 'hold 等价写法']);
  runTl(['append', '--root', root, '--run', 'eq-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"x"}']);

  // 命中表:同一个破坏性操作的多种拼写。旧实现(空格拼接后判子串)只拦得住第一列那一种。
  const HITS = [
    ['git push', ['git', 'push']],
    ['git push --force', ['git', 'push', '--force']],
    ['git -C <dir> push', ['git', '-C', 'D:/tmp/x', 'push']],
    ['git -c k=v push', ['git', '-c', 'user.name=x', 'push']],
    ['git --git-dir /x push', ['git', '--git-dir', '/x', 'push']],
    ['git reset --hard', ['git', 'reset', '--hard']],
    ['git clean -fd', ['git', 'clean', '-fd']],
    ['rm -rf', ['rm', '-rf', 'D:/tmp/x']],
    ['rm -fr', ['rm', '-fr', 'D:/tmp/x']],
    ['rm -r -f', ['rm', '-r', '-f', 'D:/tmp/x']],
    ['rm --recursive --force', ['rm', '--recursive', '--force', 'D:/tmp/x']],
    ['rm 带路径 /bin/rm', ['/bin/rm', '-rf', 'D:/tmp/x']],
    ['DEL.EXE(Windows 大小写与扩展名)', ['DEL.EXE', '/s', 'D:/tmp/x']],
    ['rmdir', ['rmdir', 'D:/tmp/x']],
    ['npm publish', ['npm', 'publish']],
    ['npm --prefix x publish', ['npm', '--prefix', 'x', 'publish']],
    ['terraform apply', ['terraform', 'apply']],
    ['terraform -chdir=x apply', ['terraform', '-chdir=x', 'apply']],
    ['terraform destroy', ['terraform', 'destroy']],
    ['kubectl apply', ['kubectl', 'apply', '-f', 'k.yml']],
    ['kubectl --context x apply', ['kubectl', '--context', 'x', 'apply', '-f', 'k.yml']],
    ['kubectl -n ns delete', ['kubectl', '-n', 'ns', 'delete', 'pod', 'p']],
    ['helm uninstall', ['helm', 'uninstall', 'rel']],
    ['DROP TABLE(文本型)', ['psql', '-c', 'DROP TABLE users']],
    ['sh -c 包一层', ['sh', '-c', 'rm -rf /x']],
    ['bash -c 包一层', ['bash', '-c', 'git push']],
    ['cmd /c 包一层', ['cmd', '/c', 'rd /s /q D:/tmp/x']],
    ['powershell -Command 包一层', ['powershell', '-Command', 'Remove-Item -Recurse -Force x']],
    ['env 前缀', ['env', 'FOO=bar', 'rm', '-rf', 'D:/tmp/x']],
    ['env -i 前缀', ['env', '-i', 'rm', '-rf', 'D:/tmp/x']],
    ['timeout 前缀', ['timeout', '60', 'rm', '-rf', 'D:/tmp/x']],
    ['xargs 前缀', ['xargs', 'rm', '-rf']],
    ['sudo 前缀', ['sudo', 'rm', '-rf', 'D:/tmp/x']],
    ['find -delete', ['find', 'D:/tmp/x', '-delete']],
    ['find -exec', ['find', 'D:/tmp/x', '-exec', 'rm', '{}', ';']],
  ];
  // 反向控制组:这一表**必须一条都不命中**。没有它,「holdHit 恒返回真」也能让上表全绿。
  const MISSES = [
    ['node 跑测试', ['node', '--test', 'scripts/']],
    ['node -e 输出', ['node', '-e', 'console.log(1)']],
    ['npm test', ['npm', 'test']],
    ['npm run build', ['npm', 'run', 'build']],
    ['git status', ['git', 'status']],
    ['git diff HEAD~1', ['git', 'diff', 'HEAD~1']],
    ['git log --oneline', ['git', 'log', '--oneline']],
    ['git fetch origin', ['git', 'fetch', 'origin']],
    ['pytest -q', ['pytest', '-q']],
    ['cargo build', ['cargo', 'build']],
    ['terraform plan', ['terraform', 'plan']],
    ['kubectl get pods', ['kubectl', 'get', 'pods']],
    ['find 按名字找文件', ['find', '.', '-name', '*.mjs']],
    ['timeout 包住 pytest', ['timeout', '600', 'pytest', '-q']],
    ['sh 跑脚本文件(不是 -c)', ['sh', './configure']],
    ['rm 出现在参数里而非命令位', ['node', 'tools/check.mjs', '--note', 'rm -rf 是危险词']],
  ];
  const { holdHit, HOLD_PATTERNS, TEXT_PATTERNS } = await import(TL_URL);
  const hitFails = HITS.filter(([, argv]) => !holdHit(argv)).map(([label]) => label);
  const missFails = MISSES.filter(([, argv]) => !!holdHit(argv)).map(([label, argv]) => `${label}→误判为「${holdHit(argv)}」`);
  // 策略表与判定实现不许脱钩:往 DEFAULT_POLICY.hold_patterns 里加一条而没人实现,
  // 是最容易悄悄发生的退化。这里把 spec §16 的 7 条逐条喂进去,一条都不能落空。
  const uncovered = HOLD_PATTERNS.filter((p) => holdHit(String(p).split(/\s+/)) === null);
  // 文本型 pattern 是手写名单(见 tl.mjs 注释):它必须仍然是策略表的子集,
  // 否则一条与 run 策略无关的词会悄悄获得拦截力。
  const strayText = TEXT_PATTERNS.filter((p) => !HOLD_PATTERNS.includes(p));
  report('1c-hold判定函数', [
    [`${HITS.length} 种破坏性拼写全部命中(漏放 ${hitFails.length} 条:${hitFails.join(' , ') || '无'})`, hitFails.length === 0],
    [`${MISSES.length} 条良性命令一条都不命中(误伤 ${missFails.length} 条:${missFails.join(' , ') || '无'})`, missFails.length === 0],
    [`spec §16 的 ${HOLD_PATTERNS.length} 条 pattern 每条都有生效的判据(未生效 ${uncovered.length} 条:${uncovered.join(' , ') || '无'})`, uncovered.length === 0],
    [`文本型名单是策略表的子集(越界 ${strayText.length} 条:${strayText.join(' , ') || '无'})`, strayText.length === 0],
  ]);

  // 端到端:本机**真会删目录**的一条命令。victim 里放哨兵,命令真跑起来它就没了。
  const DESTRUCTIVE = process.platform === 'win32'
    ? (v) => ['cmd', '/c', 'rd', '/s', '/q', v]
    : (v) => ['rm', '-fr', v];
  // 控制组必须**绕过 tl 直接跑**:闸门本来就是用来拦住这条命令的,走 tl 的话它根本不会执行,
  // 「本机有破坏力」这句话就没被证明过,下面「victim 还在」也就成了空断言。
  const vc = makeVictim('control');
  try { execFileSync(DESTRUCTIVE(vc)[0], DESTRUCTIVE(vc).slice(1), { stdio: 'ignore' }); } catch { /* 删不掉下面会判红 */ }
  report('1c-破坏力控制组', [
    ['绕过 tl 直接执行时,本机的破坏性命令确实能删掉 victim——在此之前,下面「victim 还在」没有意义',
      !existsSync(join(vc, 'keep.txt'))],
  ]);

  const v = makeVictim('destructive');
  const r = runTl(['check', '--root', root, '--run', 'eq-run', '--ref', 'T1', '--', ...DESTRUCTIVE(v)]);
  report('1c-端到端拒执', [
    [`${DESTRUCTIVE('<dir>').join(' ')} 被拒执(拒绝码 3,实得 ${r.code})`, r.code === 3],
    ['未留副作用(victim 目录与哨兵文件仍在)', existsSync(join(v, 'keep.txt'))],
  ]);

  // 位置参数写法(spec §16:`tl check T3 -- cmd`)必须解析成 --ref,而不是被丢掉。
  // 旧实现只读 --ref,位置参数落进 args._ 被无视:于是 T3 拿不到证据,还凭空生成一个 C1。
  const posRun = 'pos-run';
  runTl(['init', '--root', root, '--run', posRun, '--title', '位置参数']);
  runTl(['append', '--root', root, '--run', posRun, '--type', 'item.add', '--ref', 'T3', '--data', '{"title":"位置参数项"}']);
  const rp = runTl(['check', '--root', root, '--run', posRun, 'T3', '--name', '位置参数', '--', 'node', '-e', '0']);
  const rawPos = readEventsRaw(root, posRun);
  const posEv = rawPos.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean).find((e) => e.type === 'check.run');
  report('1h-位置参数', [
    [`tl check T3 -- cmd 正常执行(exit ${rp.code})`, rp.code === 0],
    [`该 check.run 事件的 ref 是 T3(实得 ${JSON.stringify(posEv?.ref)})`, posEv?.ref === 'T3'],
    ['没有凭空生成 C 前缀的幽灵编号', !/"ref":"C\d+"/.test(rawPos)],
  ]);
}

// ── 自检 2:脱敏(spec §16;打码是最后一道防线) ───────────────────────────────
{
  const root = join(WORK, 'redact');
  runTl(['init', '--root', root, '--run', 'redact-run', '--title', '脱敏夹具']);
  const secrets = [
    'sk-abcdef1234567890ABCDEFXYZ',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    // 64 位 hex = 真正的密钥材料长度(SHA-256 / ed25519)。阈值两侧分别由这条与 2b 钉住。
    'deadbeef'.repeat(8),
  ];
  // 两条喂入路径都试:append 的 --data(agent 自述)与 check 的 --name(检查标签)。
  runTl(['append', '--root', root, '--run', 'redact-run', '--type', 'note', '--data', JSON.stringify({ msg: `tokens: ${secrets.join(' | ')}` })]);
  runTl(['check', '--root', root, '--run', 'redact-run', '--ref', 'T1', '--name', secrets.join(' '), '--', 'node', '-e', '0']);

  const raw = readEventsRaw(root, 'redact-run');
  const leaked = secrets.filter((s) => raw.includes(s));
  report('2-脱敏', [
    [`events.jsonl 不含任何原始密钥(泄漏 ${leaked.length} 条:${leaked.join(' , ') || '无'})`, leaked.length === 0],
    ['脱敏占位符已落盘', raw.includes('[redacted]')],
  ]);

  // 2b 过度脱敏的反面:git SHA 是公开内容,不该被绞成 [redacted]。
  // (36~63 位 hex 那段**故意不断言**——既可能是哈希也可能是短 token,两种取舍都说得通;
  //  阈值两侧的取舍写在 tl.mjs 的 SECRET_PATTERNS 注释里。)
  const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'; // 40 位 hex = 典型 git SHA
  runTl(['append', '--root', root, '--run', 'redact-run', '--type', 'note', '--data', JSON.stringify({ msg: `commit ${sha}` })]);
  const raw2 = readEventsRaw(root, 'redact-run');
  report('2b-不过度脱敏', [
    [`40 位 hex(git SHA)在日志里保持原样`, raw2.includes(sha)],
  ]);

  // 2d 长 base64:旧判据「至少两类字符」把**纯小写**的长串当正常文本放了过去。
  const b64Lower = 'qwertyuiopasdfghjklzxcvbnmqwertyuiopasdfghjklzxcvbn'; // 纯小写 48 位,像随机串
  // 长度取 300,不是 9000:`fitRecord` 的 MAX_RECORD_BYTES = 2048 会把超长记录**截断加 …**,
  // 9000 长的串压根到不了盘上,断言 `raw.includes(它)` 恒假——那是夹具自己的 bug,不是打码逻辑的。
  // 300 已经远超 B64_RUN 的 40 位下限、且只有一类字符,足够把「长就打码」这个假设钉死。
  const benignRun = 'x'.repeat(300);                                   // 单一字符的 300 长串,是正常文本
  runTl(['append', '--root', root, '--run', 'redact-run', '--type', 'note', '--data', JSON.stringify({ msg: `b64 ${b64Lower}` })]);
  runTl(['append', '--root', root, '--run', 'redact-run', '--type', 'note', '--data', JSON.stringify({ msg: `run ${benignRun}` })]);
  const raw4 = readEventsRaw(root, 'redact-run');
  report('2d-base64两侧', [
    ['纯小写的长 base64 被识别为疑似密钥并打码', !raw4.includes(b64Lower)],
    ['单一字符的 300 长串不被误伤(仍原样在盘,证明不是「长就打码」)', raw4.includes(benignRun)],
  ]);
}

// ── 自检 3:写盘边界(临时 git 仓;除 .gitignore 外无改动) ────────────────────
{
  const repo = join(WORK, 'boundary');
  mkdirSync(repo, { recursive: true });
  let gitOk = true;
  try { execFileSync('git', ['init', '-q'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { gitOk = false; }

  runTl(['init', '--root', repo, '--run', 'b-run', '--title', 'boundary']);
  runTl(['append', '--root', repo, '--run', 'b-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"a"}']);
  runTl(['append', '--root', repo, '--run', 'b-run', '--type', 'item.start', '--ref', 'T1']);
  runTl(['append', '--root', repo, '--run', 'b-run', '--type', 'item.done', '--ref', 'T1', '--data', '{"changes":[{"path":"src/a.mjs","add":3,"del":1}]}']);
  runTl(['check', '--root', repo, '--run', 'b-run', '--ref', 'T1', '--name', 'smoke', '--', 'node', '-e', '0']);
  runTl(['finish', '--root', repo, '--run', 'b-run']);

  let lines = [];
  if (gitOk) {
    try {
      const gs = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      lines = gs.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
    } catch (e) { gitOk = false; }
  }
  // 精确到「恰好一行,且是 .gitignore」。旧写法只要求「每行都以 .gitignore 结尾」——
  // 一行都不剩时它也成立(空数组 every 恒真),而 .taskboard/ 刚被写进 .gitignore,
  // 于是「没有 .taskboard 散落」那句也是恒真的。两句加起来什么都没测。
  const onlyGitignore = lines.length === 1 && /^\?\?\s+\.gitignore$/.test(lines[0]);
  const giContent = existsSync(join(repo, '.gitignore')) ? readFileSync(join(repo, '.gitignore'), 'utf8') : '';
  report('3-写盘边界', [
    [`完整跑完 git status 恰好只有一行「?? .gitignore」(实得 ${JSON.stringify(lines)}${gitOk ? '' : ' · 本机 git 不可用'})`, gitOk && onlyGitignore],
    ['刚写入的 .gitignore 里确实含 .taskboard/(上一条才算数)', giContent.includes('.taskboard')],
  ]);
}

// ── 自检 4:finish 摘要(长度上限 + 只顶出值得复核的几处 + 顺序) ──────────────
{
  // 4a:1 项高优先 + 11 项低优先,验「顶出」与「排序」。
  const root = join(WORK, 'finish');
  runTl(['init', '--root', root, '--run', 'f-run', '--title', 'finish 夹具']);
  const M = 12;
  for (let i = 1; i <= M; i++) {
    runTl(['append', '--root', root, '--run', 'f-run', '--type', 'item.add', '--ref', `T${i}`, '--data', JSON.stringify({ title: `工作项 ${i}` })]);
    runTl(['append', '--root', root, '--run', 'f-run', '--type', 'item.start', '--ref', `T${i}`]);
    // T1 命中 review_paths(auth/**)→ 高分,应被顶到最前;其余只带一个不痛不痒的小改动。
    const changes = i === 1 ? [{ path: 'auth/login.mjs', add: 12, del: 3 }] : [{ path: `src/x${i}.mjs`, add: 1, del: 0 }];
    runTl(['append', '--root', root, '--run', 'f-run', '--type', 'item.done', '--ref', `T${i}`, '--data', JSON.stringify({ changes })]);
  }
  const out = runTl(['finish', '--root', root, '--run', 'f-run']);
  const lines = out.out.trimEnd().split('\n').filter((l) => l.trim() !== '');
  const refs = out.out.match(/\bT\d+\b/g) ?? [];
  // 把「值得复核的」那一块单独取出来:标题行之后的、以两个空格开头的行,第一列就是编号。
  const headerIdx = lines.findIndex((l) => l.startsWith('值得复核的'));
  const block = headerIdx < 0 ? [] : lines.slice(headerIdx + 1).filter((l) => /^ {2}T\d+\b/.test(l));
  const blockRefs = block.map((l) => (l.match(/^ {2}(T\d+)\b/) ?? [])[1]);
  report('4-finish摘要', [
    [`行数 ≤ 25(实得 ${lines.length})`, lines.length <= 25],
    ['不报错退出', out.code === 0],
    [`找得到「值得复核的」区块(实得 ${headerIdx < 0 ? '没有' : `${block.length} 行`})`, headerIdx >= 0 && block.length > 0],
    // 旧断言只要求 T1 出现在输出的任意位置——而表头那行本来就带 run 信息,随手放个 T1 也能过。
    // 现在断言的是**顺序**:顶出区块的第一条必须是最该看的那条。
    [`顶出区块第一行就是最高优先项 T1(实得 ${JSON.stringify(blockRefs)})`, blockRefs[0] === 'T1'],
    [`不复述全部 ${M} 项(摘要里提到的编号 ${new Set(refs).size} 个 < ${M})`, new Set(refs).size < M],
    ['给出回复示例', /回复示例|D\d+\s*=/.test(out.out)],
  ]);

  // 4b:让**全部**已完成项都够格被顶出,验「截断真的发生了」。
  // 旧断言 `行数 <= 25` 对本实现恒真(子列表已硬截 5),这条才是有约束力的那一条。
  const root2 = join(WORK, 'finish-cap');
  runTl(['init', '--root', root2, '--run', 'fc-run', '--title', 'finish 截断夹具']);
  const N = 12;
  for (let i = 1; i <= N; i++) {
    runTl(['append', '--root', root2, '--run', 'fc-run', '--type', 'item.add', '--ref', `T${i}`, '--data', JSON.stringify({ title: `高优先 ${i}` })]);
    runTl(['append', '--root', root2, '--run', 'fc-run', '--type', 'item.start', '--ref', `T${i}`]);
    runTl(['append', '--root', root2, '--run', 'fc-run', '--type', 'item.done', '--ref', `T${i}`, '--data', JSON.stringify({ changes: [{ path: 'auth/x.mjs', add: 5, del: 1 }] })]);
  }
  const out2 = runTl(['finish', '--root', root2, '--run', 'fc-run']);
  const lines2 = out2.out.trimEnd().split('\n').filter((l) => l.trim() !== '');
  const idx2 = lines2.findIndex((l) => l.startsWith('值得复核的'));
  const block2 = idx2 < 0 ? [] : lines2.slice(idx2 + 1).filter((l) => /^ {2}T\d+\b/.test(l));
  const total2 = Number((/(\d+) 个已完成项/.exec(lines2[idx2] ?? '') ?? [])[1]);
  report('4b-截断真的发生', [
    [`${N} 项全部够格,顶出区块恰好 5 条(实得 ${block2.length})`, block2.length === 5],
    [`区块标题如实报出总数(实得 ${total2},应为 ${N})`, total2 === N],
  ]);
}

// ── 自检 6:check 只记摘要(命令原文 / 输出 / 环境变量都不得落盘) ──────────────
// 文件头从第一版起就写着「自检 6」,正文却一直没有这一条。补上。
{
  const root = join(WORK, '摘要');
  const marker = 'SUMMARY_ONLY_MARKER_9f3a';
  const envName = 'TL_FIXTURE_SECRET_ENV';
  runTl(['init', '--root', root, '--run', 's-run', '--title', '摘要夹具']);
  runTl(['append', '--root', root, '--run', 's-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"x"}']);

  const prev = process.env[envName];
  process.env[envName] = 'SUPER_SECRET_ENV_VALUE';
  const r = runTl([
    'check', '--root', root, '--run', 's-run', '--ref', 'T1', '--name', '摘要检查',
    '--', 'node', '-e', `console.log("${marker}"); console.error("STDERR_${marker}")`,
  ]);
  if (prev === undefined) delete process.env[envName]; else process.env[envName] = prev;

  const raw = readEventsRaw(root, 's-run');
  const evLine = raw.split('\n').find((l) => l.includes('"check.run"')) ?? '';
  let ev = null;
  try { ev = JSON.parse(evLine); } catch { /* 解析失败下面会判红 */ }
  const dataKeys = ev && ev.data ? Object.keys(ev.data).sort() : [];
  report('6-只记摘要', [
    ['check 正常执行完毕(退出码 0)', r.code === 0],
    [`落盘了 check.run 事件`, ev != null],
    [`事件 data 只含 name/result/exit/dur_s(实得 ${JSON.stringify(dataKeys)})`,
      JSON.stringify(dataKeys) === JSON.stringify(['dur_s', 'exit', 'name', 'result'])],
    [`事件里不含命令原文(搜 node / -e)`, !/node/.test(evLine)],
    [`事件里不含命令输出(${marker} 未出现)`, !raw.includes(marker)],
    [`事件里不含环境变量名与值(${envName})`, !raw.includes(envName) && !raw.includes('SUPER_SECRET_ENV_VALUE')],
  ]);
}

// ── 自检 7:机器验证不可伪造 + 不产生幽灵编号(票 22 的两条 CRITICAL/HIGH) ─────
{
  const root = join(WORK, 'forge');
  runTl(['init', '--root', root, '--run', 'g-run', '--title', '伪造夹具']);

  // 7a 伪造机器验证:[06] 说 agent 追加的行只能产出 claimed。
  // project.mjs 按 **事件类型** 把 check.run 记成 src='run'(机器验证),于是
  // 不跑任何测试、只手写一行 --type check.run 就能造出「机器验证通过」。
  runTl(['append', '--root', root, '--run', 'g-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"不会跑任何测试的项"}']);
  const forged = runTl(['append', '--root', root, '--run', 'g-run', '--type', 'check.run', '--ref', 'T1',
    '--data', '{"result":"pass","exit":0,"name":"我声称跑过了"}']);
  const stateG = readState(root, 'g-run');
  const checksG = stateG.items?.[0]?.evidence?.checks ?? [];
  const srcs = checksG.map((c) => c.src);
  report('7a-不可伪造机器验证', [
    [`手写 check.run 仍被收下(永不拒收,exit ${forged.code})`, forged.code === 0],
    [`落盘的事件类型已降级为 check.claim(实得 ${JSON.stringify(checksG.map((c) => c.id))})`, srcs.length === 1 && srcs[0] === 'claimed'],
    [`不该出现 src='run'(实得 ${JSON.stringify(srcs)})`, !srcs.includes('run')],
    ['降级原因写在事件里(data.forced)', readEventsRaw(root, 'g-run').includes('append 不能写 check.run')],
  ]);

  // 7b 幽灵编号:check 不传 --ref 时会自动分配 C<n>。旧实现把它当工作项物化出来,
  // board 上凭空多一张空 title 的卡、counts.todo 跟着涨。
  const root2 = join(WORK, 'ghost');
  runTl(['init', '--root', root2, '--run', 'h-run', '--title', '幽灵编号夹具']);
  runTl(['append', '--root', root2, '--run', 'h-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"唯一的项"}']);
  const before = readState(root2, 'h-run');
  runTl(['check', '--root', root2, '--run', 'h-run', '--', 'node', '-e', '0']);
  const after = readState(root2, 'h-run');
  const idsAfter = (after.items ?? []).map((i) => i.id);
  report('7b-不产生幽灵编号', [
    [`条目数没变(T1 之前 ${before.items.length} → 之后 ${after.items.length})`, after.items.length === before.items.length],
    [`列表里没有凭空出现的 C 编号(实得 ${JSON.stringify(idsAfter)})`, !idsAfter.some((x) => /^C\d+$/.test(x))],
    ['投影为这条无主 check 记了 note(不是静默丢弃)', (after.notes ?? []).some((n) => n.includes('不是已存在的项'))],
  ]);
}

// ── 自检 8:命令不存在 → 127(不是 1) ────────────────────────────────────────
{
  const root = join(WORK, 'enoent');
  runTl(['init', '--root', root, '--run', 'e-run', '--title', 'ENOENT 夹具']);
  runTl(['append', '--root', root, '--run', 'e-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"x"}']);
  runTl(['check', '--root', root, '--run', 'e-run', '--ref', 'T1', '--name', '不存在的命令', '--', 'no-such-cmd-tl-fixture-xyz', '--flag']);
  const st = readState(root, 'e-run');
  const ck = (st.items ?? [])[0]?.evidence?.checks ?? [];
  report('8-命令不存在', [
    [`退出码记为 127(实得 ${JSON.stringify(ck.map((c) => c.exit))})`, ck.length === 1 && ck[0].exit === 127],
    [`result 记为 fail(实得 ${JSON.stringify(ck.map((c) => c.result))})`, ck.length === 1 && ck[0].result === 'fail'],
  ]);
}

// ── 自检 9:索引写不进去,不许把已经落盘的事件报成「写失败了」 ─────────────────
// index.json 是**派生缓存**:它记 fileBytes,变了就全量 rebuild(见 indexFor)。
// 旧实现里 writeEvent 先 append 落盘、再 writeIndex;后者一抛就穿出 append,
// 调用方拿到非 0 退出码、以为事件没写上——其实日志里已经有了(票 21 复核)。
// 注入手法:把 index.json 的位置换成一个**目录**,rename 覆盖目录必失败。
{
  const root = join(WORK, 'idxfail');
  runTl(['init', '--root', root, '--run', 'i-run', '--title', '索引失败夹具']);
  runTl(['append', '--root', root, '--run', 'i-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"x"}']);

  const idxPath = join(root, '.taskboard', 'runs', 'i-run', 'index.json');
  rmSync(idxPath, { force: true });
  mkdirSync(idxPath, { recursive: true });                       // 注入:索引路径变成目录
  const injected = statSync(idxPath).isDirectory();              // 控制组:注入确实生效了

  const before = readEventsRaw(root, 'i-run');
  const r = runTl(['append', '--root', root, '--run', 'i-run', '--type', 'note', '--data', '{"msg":"索引坏掉时这条也必须落盘"}']);
  const after = readEventsRaw(root, 'i-run');

  report('9-索引写失败不算拒收', [
    ['控制组:注入生效(index.json 位置确实是目录)', injected],
    [`append 仍以退出码 0 收下(实得 ${r.code})`, r.code === 0],
    ['事件确实落了盘(日志变长)', after.length > before.length],
    ['落盘的就是这一条(内容对得上)', after.includes('索引坏掉时这条也必须落盘')],
    ['投影仍追得上(读回 state 不报错)', !!readState(root, 'i-run')],
  ]);
  rmSync(idxPath, { recursive: true, force: true });             // 收尾:让后续清理能删干净
}

// ── 自检 10:改选后为 redo 集合新建 TODO(spec §8.7 第 2 步) ──────────────────
// 旧实现只给 redo 项打 stale / superseded,不新建返工 TODO —— 改选完页面上
// 「要重做的事」直接消失。生成放在写入口(append)而不是投影里:日志是唯一真源,
// 让 project 凭空造项正是票 22 那个幽灵 C1 的形状。
{
  const root = join(WORK, 'redo');
  const O = (key, isDef, redo) => JSON.stringify({
    key, label: key, default: isDef, reversible: true,
    impact: { declared: { redo, enable: [], disable: [], side_effects: [], cascade: [], redo_est_min: 0, note: '' } },
  });
  const decData = (redoForB) => `{"title":"过期策略","question":"q","why_now":"w","mode":"provisional",`
    + `"options":[${O('A', true, [])},${O('B', false, redoForB)}]}`;

  runTl(['init', '--root', root, '--run', 'redo-run', '--title', '改选返工夹具']);
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'item.add', '--ref', 'T1', '--data', '{"title":"迁移 session 存储"}']);
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'item.done', '--ref', 'T1', '--data', '{"active_seconds":720}']);
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'decision.open', '--ref', 'D1', '--data', decData(['T1'])]);
  const spawnedOf = (st) => (st?.items ?? []).filter((i) => i.origin?.type === 'decision');

  const before = spawnedOf(readState(root, 'redo-run'));
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'decision.answer', '--ref', 'D1', '--data', '{"key":"B","by":"you","via":"chat"}']);
  const st = readState(root, 'redo-run');
  const spawned = spawnedOf(st);
  const n1 = spawned[0];

  report('10-改选新建 TODO', [
    ['控制组:改选之前没有任何 decision 起点的项', before.length === 0],
    [`redo 里的 T1 派生出一条新 TODO(实得 ${JSON.stringify(spawned.map((i) => i.id))})`, spawned.length === 1],
    [`新项起点记全了(origin = ${JSON.stringify(n1?.origin ?? null)})`,
      n1?.origin?.type === 'decision' && n1?.origin?.ref === 'D1' && n1?.origin?.summary === 'T1'],
    [`新项轮次 +1(rounds 实得 ${n1?.rounds})`, n1?.rounds === 2],
    [`新项在 todo 泳道(实得 ${n1?.lane})`, n1?.lane === 'todo'],
    [`新项不是空标题(实得 ${JSON.stringify(n1?.title)})`, typeof n1?.title === 'string' && n1.title.length > 0],
  ]);

  // 幂等:后续无关事件不许再派生一条。
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'note', '--data', '{"msg":"无关事件"}']);
  const after = spawnedOf(readState(root, 'redo-run'));

  // 控制组:答成**默认**选项不是改选,不该派生。
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'decision.open', '--ref', 'D2', '--data', decData(['T1'])]);
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'decision.answer', '--ref', 'D2', '--data', '{"key":"A","by":"you"}']);
  const afterDefault = spawnedOf(readState(root, 'redo-run'));

  report('10b-不重复派生', [
    [`无关事件不触发派生(1 → ${after.length})`, after.length === 1],
    [`答成默认选项不触发派生(仍 ${afterDefault.length} 条)`, afterDefault.length === 1],
  ]);

  // 10c —— reconcileRedoTodos 的闸门只认 overridden。hold 决策作答后转 answered(spec §8.7),
  // 那不是「改选」,不该凭空造返工 TODO。投影侧(自检 3d)钉的是状态;这里钉的是**闸门**:
  // 状态对了但闸门写成「answered 也派生」的话,页面上仍会多出一条幽灵返工项(票 26 独立核验)。
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'decision.open', '--ref', 'D3',
    '--data', `{"title":"hold闸门","question":"q","why_now":"w","mode":"hold","options":[${O('A', true, [])},${O('B', false, ['T1'])}]}`]);
  runTl(['append', '--root', root, '--run', 'redo-run', '--type', 'decision.answer', '--ref', 'D3', '--data', '{"key":"B","by":"you"}']);
  const stH = readState(root, 'redo-run');
  const d3 = (stH.decisions ?? []).find((d) => d.id === 'D3');
  const afterHold = spawnedOf(stH);
  report('10c-hold作答不派生', [
    [`控制组:hold 决策作答后状态确为 answered(实得 ${d3?.status})`, d3?.status === 'answered'],
    [`D3 也带 redo=['T1'],但 answered ≠ 改选,不该派生(实得 ${JSON.stringify(afterHold.map((i) => i.id))})`, afterHold.length === 1],
  ]);
}

console.log(bad === 0 ? `全部自检通过(${total} 条)` : `${bad}/${total} 项未过`);
rmSync(WORK, { recursive: true, force: true });
process.exit(bad === 0 ? 0 : 1);
