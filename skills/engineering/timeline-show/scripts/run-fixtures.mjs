// 复跑式自检(票 20「写入骨架与锁」)。形状参照 visualize/scripts/run-fixtures.mjs:
// 无测试框架,Node 标准库自己写;每条自检打印 ok/FAIL,全过退 0,否则退 1。
//
// 覆盖任务书「自检」四条:
//   1 并发 append 不丢行  —— N 个进程各 M 行,总行数 N×M+1(run.start) 且序列号无缺口
//   2 锁不 stale + ABA    —— 持锁进程被 kill 后可接管;迟到者的 release 不退别人的锁
//   3 读者永不见截断      —— 高频 append 时循环读 state.js,每一拍都能解析出完整的 window.__TL__
//   4 两跑逐字节          —— 同一 events + 同一注入 now,**两次独立生成**(跨进程)逐字节相同
// 外加票面/复核要求:
//   5 投影失败不回滚 append —— 投影炸掉只记 note 置 dirty,事件仍在
//   6 重复 init 不产生重复序列号(H1 复核)
//   7 拿不到锁也不拒收(H2 复核)+ 没有 run 时自动开工
//   8 2 KB 上限约束到整条记录(含顶层 type/ref/actor)(复核)
//   9 dirty 成功投影后清除(复核)
//  10 坏行不被静默丢弃且不复用 seq(复核)
//  11 append 的临界区不随日志长度线性增长(M1 复核;用 crit=t(append)−t(writeState) 隔离锁内净代价)
//  12 current.json 走原子替换(与 state.js 同机制;用 inode 变化判定替换 vs 原地截断)(复核)
//  13 并发抢占同一 stale 锁 → 同时持锁峰值恰为 1(复核 F1:旧 takeover 的 CAS 竞争,N 个迟到者同时持锁)

import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const DIR = import.meta.dirname;
const TL = join(DIR, 'tl.mjs');
const WORK = mkdtempSync(join(tmpdir(), 'tl-fixtures-'));
const TL_URL = pathToFileURL(TL).href;
const NOW = '2026-09-28T18:00:00.000Z';
const NOW2 = '2026-09-28T18:05:00.000Z';

const tl = await import(TL_URL);
const { project, serializeState, append, initRun, acquireLock, releaseLock, runDirOf, readEvents, writeState, taskboardDir } = tl;

let bad = 0;
let total = 0;
function report(name, checks) {
  for (const [t, ok] of checks) {
    total++;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${name}] ${t}`);
  }
}

// 子进程封装:用 node 跑,返回 {code, out}。
function runNode(script, args) {
  try {
    const out = execFileSync('node', [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
const runTl = (args) => runNode(TL, args);
function spawnNode(script, args) {
  const p = spawn('node', [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.done = new Promise((res) => p.on('exit', (code) => res({ code, out })));
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000, step = 25) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); }
  return fn();
}
const readLines = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim() !== '');
const evPathOf = (root, runId) => join(root, '.taskboard', 'runs', runId, 'events.jsonl');
const seqOf = (lines) => lines.map((l) => JSON.parse(l).seq).sort((a, b) => a - b);
const contiguous = (seqs) => seqs.length > 0 && seqs.every((s, i) => s === i + 1) && new Set(seqs).size === seqs.length;

// 临时子进程脚本:并发追加器 / 慢追加器 / 持锁者 / 独立生成器。写进 WORK,不落技能目录。
const APPENDER = join(WORK, 'appender.mjs');
writeFileSync(APPENDER, `
import { pathToFileURL } from 'node:url';
const { append } = await import(process.argv[2]);
const [root, runId, n, tag] = process.argv.slice(3);
for (let i = 0; i < Number(n); i++) append({ root, runId, type: 'tick', actor: 'sub', data: { tag, i } });
`);
// 慢追加器:每条之间 sleep,保证读者循环与真实写入重叠(否则 atomicity 断言会空过)。
const SLOW_APPENDER = join(WORK, 'slow-appender.mjs');
writeFileSync(SLOW_APPENDER, `
import { pathToFileURL } from 'node:url';
const { append } = await import(process.argv[2]);
const [root, runId, n, tag] = process.argv.slice(3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < Number(n); i++) { append({ root, runId, type: 'tick', actor: 'sub', data: { tag, i } }); await sleep(3); }
`);
const HOLDER = join(WORK, 'holder.mjs');
writeFileSync(HOLDER, `
import { pathToFileURL } from 'node:url';
const { acquireLock, runDirOf } = await import(process.argv[2]);
const h = acquireLock(runDirOf(process.argv[3], process.argv[4]), { timeoutMs: 5000 });
if (!h) { console.error('HOLDER_FAILED'); process.exit(3); }
console.log('HELD ' + h.token);
setInterval(() => {}, 1000);
`);
// 独立生成器:自己读 events 文件、自己 project、自己 serialize,只吐字节。
// 两次**独立进程**的产物比对,才测得出 [13] 要防的非确定性(同进程相隔微秒会落在同一毫秒而漏测)。
const GEN = join(WORK, 'gen.mjs');
writeFileSync(GEN, `
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const { project, serializeState } = await import(process.argv[2]);
const [evPath, now] = process.argv.slice(3);
const events = readFileSync(evPath, 'utf8').split('\\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
process.stdout.write(serializeState(project(events, now)));
`);
const gen = (evPath, now) => runNode(GEN, [TL_URL, evPath, now]);

// ── 自检 1:并发 append 不丢行 ──────────────────────────────────────────────
{
  const root = join(WORK, 'conc');
  const r = runTl(['init', '--root', root, '--run', 'conc-run', '--title', '并发夹具']);
  const N = 8, M = 25;
  const kids = await Promise.all(
    Array.from({ length: N }, (_, k) => spawnNode(APPENDER, [TL_URL, root, 'conc-run', String(M), `p${k}`]).done),
  );
  const evPath = evPathOf(root, 'conc-run');
  const lines = existsSync(evPath) ? readLines(evPath) : [];
  const want = N * M + 1;
  let parsed = [], parseErr = null;
  try { parsed = lines.map((l) => JSON.parse(l)); } catch (e) { parseErr = e.message; }
  const seqs = parseErr ? [] : parsed.map((e) => e.seq).sort((a, b) => a - b);
  const noNote = !parseErr && !parsed.some((e) => e.type === 'note');
  const projSeq = parseErr ? -1 : project(readEvents(runDirOf(root, 'conc-run')), NOW).seq;
  report('1-并发append', [
    ['init 成功', r.code === 0],
    [`子进程全部退 0`, kids.every((k) => k.code === 0)],
    // 行数与序列号两种信号**交叉校验**:单看行数会被「丢一行 + 补一条 note」凑成 want 而误判通过。
    [`行数===${want} 且 seq 恰为 1..${want} 且无 note 行(实得行数 ${lines.length},可解析 ${parseErr ? `parse失败:${parseErr}` : 'ok'})`,
      lines.length === want && contiguous(seqs) && seqs.length === want && noNote],
    [`投影 seq 与行数一致(${projSeq})`, projSeq === want],
  ]);
}

// ── 自检 2:锁不 stale(被 kill 后可接管)+ ABA(迟到 release 不退别人的锁) ──
{
  const root = join(WORK, 'lock');
  runTl(['init', '--root', root, '--run', 'lock-run']);
  const rd = runDirOf(root, 'lock-run');
  const lockDir = join(rd, '.lock');

  // 2a:子进程持锁,查锁在,再 kill;随后本进程应能接管。
  const child = spawn('node', [HOLDER, TL_URL, root, 'lock-run'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let held = '';
  child.stdout.on('data', (d) => { held += d; });
  const appeared = await waitFor(() => existsSync(lockDir));
  await waitFor(() => held.includes('HELD'));
  child.kill('SIGKILL');
  await new Promise((r) => child.on('exit', r));
  await sleep(50);
  const taken = acquireLock(rd, { timeoutMs: 4000 });
  const tookOver = !!taken;
  if (taken) releaseLock(taken);

  // 2b:ABA——h1 持锁;伪造其 owner 为「已死 pid」逼出走抢占;h2 抢到后 h1 的 release 必须 no-op。
  const h1 = acquireLock(rd, { timeoutMs: 4000 });
  const ownerPath = join(lockDir, 'owner.json');
  if (h1) {
    writeFileSync(ownerPath, JSON.stringify({ pid: 0x7fffffff, token: h1.token, at: new Date().toISOString() }));
    await sleep(20);
  }
  const h2 = acquireLock(rd, { timeoutMs: 4000 });
  if (h1) releaseLock(h1); // 迟到的释放
  const stillThere = existsSync(lockDir);
  const ownerAfter = existsSync(ownerPath) ? JSON.parse(readFileSync(ownerPath, 'utf8')) : null;
  if (h2) releaseLock(h2);

  report('2-锁不stale与ABA', [
    ['持锁进程被 kill 后锁可被接管', appeared && tookOver],
    ['h2 成功抢占被伪造为死亡的锁', !!h2],
    ['h2 抢到后锁仍在(h1 的迟到 release 未删除他人锁)', stillThere],
    ['owner.json 仍是 h2 的 token', !!ownerAfter && !!h2 && ownerAfter.token === h2.token],
    ['h2 释放后锁目录消失', !existsSync(lockDir)],
  ]);
}

// ── 自检 3:读者永不见截断(读窗口与真实写入绑定) ───────────────────────────
{
  const root = join(WORK, 'reader');
  runTl(['init', '--root', root, '--run', 'reader-run']);
  const statePath = join(root, '.taskboard', 'runs', 'reader-run', 'state.js');
  const kid = spawnNode(SLOW_APPENDER, [TL_URL, root, 'reader-run', '150', 'r']);

  let reads = 0, failures = [], lo = Infinity, hi = 0;
  while (kid.exitCode === null && reads < 20000) {
    try {
      const txt = readFileSync(statePath, 'utf8');
      const m = /^window\.__TL__ = ([\s\S]*);\n$/.exec(txt);
      if (!m) failures.push('shape');
      else { const s = JSON.parse(m[1]).seq; lo = Math.min(lo, s); hi = Math.max(hi, s); }
      reads++;
    } catch (e) { failures.push(e.code || e.message); }
    await sleep(1);
  }
  await kid.done;
  // 「读过 >0」是恒真的空断言;真正要绑的是「读窗口横跨了真实写入」。
  const overlapped = hi - lo >= 5;
  report('3-读者永不见截断', [
    [`读窗口与写入真实重叠(reads=${reads}, 观测 seq ${lo}..${hi}, 跨度 ${hi - lo})`, reads > 3 && overlapped],
    [`无一拍截断(失败 ${failures.length} 次:${failures.slice(0, 3).join(',')})`, failures.length === 0],
  ]);
}

// ── 自检 4:两跑逐字节(两次独立进程) ──────────────────────────────────────
{
  const root = join(WORK, 'conc');
  const evPath = evPathOf(root, 'conc-run');
  // conc-run 的 run.start 盖的是**真实**时钟(自检 1 现跑的 tl init)。固定的过去时刻一旦被墙钟追过,
  // 就都落在起点之前 → active_seconds 双双 clamp 到 0、「换 now 两字段确实变了」假失败(与实现无关)。
  // 所以注入 now 取「conc-run 真实起点 + 偏移」,永远在起点之后,这条断言才有意义。
  const startT = Date.parse(readEvents(runDirOf(root, 'conc-run'))[0].t);
  const LN = new Date(startT + 8 * 60000).toISOString();
  const LN2 = new Date(startT + 13 * 60000).toISOString();
  const a = gen(evPath, LN);
  const b = gen(evPath, LN);          // 第二个**独立进程**:同 events + 同注入 now
  const c = gen(evPath, LN2);         // 换 now
  const parse = (s) => JSON.parse(s.slice(s.indexOf('=') + 1, s.lastIndexOf(';')));
  // 注入含 HTML/JS 元字符的输入,验 §16 注入转义:< > & 与 U+2028/U+2029 必须转义。
  const escIn = [{ v: 3, seq: 1, t: NOW, run: 'esc', type: 'run.start', ref: null, data: { title: 'a<b>&c d' } }];
  const esc = serializeState(project(escIn, NOW));

  const pa = parse(a.out), pc = parse(c.out);
  // 「换 now 只该动时间派生字段」必须**比值**,不能只比键个数。
  const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.generated_at; delete x.run.active_seconds; return x; };
  report('4-两跑逐字节', [
    ['两次独立进程生成逐字节相同', a.code === 0 && b.code === 0 && a.out === b.out],
    ['产物是 window.__TL__ 纯数据赋值', /^window\.__TL__ = \{[\s\S]*\};\n$/.test(a.out)],
    ['generated_at 为注入值', pa.generated_at === LN],
    ['换 now 后仅 generated_at/active_seconds 变(其余逐值相同)', JSON.stringify(strip(pa)) === JSON.stringify(strip(pc))],
    ['换 now 后那两个字段确实变了', pa.generated_at !== pc.generated_at && pa.run.active_seconds !== pc.run.active_seconds],
    ['注入转义:< > & U+2028 不出现在产物里', !esc.includes('<b>') && esc.includes('u003c') && esc.includes('u0026') && esc.includes('u2028')],
    ['转义后仍能解析回原值', parse(esc).run.title === 'a<b>&c d'],
  ]);
}

// ── 自检 5:投影失败不回滚 append([17] B′ 的故障注入) ─────────────────────────
{
  const root = join(WORK, 'fail');
  runTl(['init', '--root', root, '--run', 'fail-run', '--title', 'x']);
  const rd = join(root, '.taskboard', 'runs', 'fail-run');
  // 把 state.js 换成目录:原子替换的 rename 必然失败,逼出「投影失败」这条路径。
  rmSync(join(rd, 'state.js'));
  mkdirSync(join(rd, 'state.js'));
  let err = null, r;
  try { r = append({ root, runId: 'fail-run', type: 'item.add', data: { title: 't' } }); } catch (e) { err = e.message; }
  const lines = readLines(join(rd, 'events.jsonl')).map((l) => JSON.parse(l));
  report('5-投影失败不回滚', [
    ['append 本身不抛(写入口未被投影失败波及)', err === null],
    ['append 仍返回编号 T1(未拒收)', !!r && r.ref === 'T1'],
    ['事件已忠实落盘(未回滚)', lines.some((e) => e.type === 'item.add' && e.ref === 'T1')],
    ['置 dirty 标记', existsSync(join(rd, 'dirty'))],
    ['补记了一条 note', lines.some((e) => e.type === 'note')],
  ]);
}

// ── 自检 6(H1):重复 init 不产生重复序列号 ─────────────────────────────────
{
  const root = join(WORK, 'dupinit');
  runTl(['init', '--root', root, '--run', 'dup', '--title', 'dup']);
  runTl(['append', '--root', root, '--run', 'dup', '--type', 'note', '--data', '{"a":1}']);
  runTl(['init', '--root', root, '--run', 'dup', '--title', 'dup']); // 同一 run 再 init 一次
  const lines = readLines(evPathOf(root, 'dup')).map((l) => JSON.parse(l));
  const seqs = lines.map((e) => e.seq).sort((a, b) => a - b);
  report('6-重复init', [
    ['重复 init 不产生重复序列号', new Set(seqs).size === seqs.length],
    [`序列号仍无缺口 1..n(实得 ${seqs.join(',')})`, contiguous(seqs)],
    ['两次 init 各落一条 run.start(未被旁路吞掉)', lines.filter((e) => e.type === 'run.start').length === 2],
    ['共 3 行', lines.length === 3],
  ]);
}

// ── 自检 7(H2):拿不到锁也不拒收 + 没有 run 时自动开工 ───────────────────────
{
  const root = join(WORK, 'nolock');
  runTl(['init', '--root', root, '--run', 'nl', '--title', 'x']);
  const rd = runDirOf(root, 'nl');
  const holder = acquireLock(rd, { timeoutMs: 4000 }); // 本进程持锁:活 pid + 新鲜心跳 → 不可抢占
  let err = null, r;
  try { r = append({ root, runId: 'nl', type: 'item.add', data: { title: 't' }, lockTimeoutMs: 300 }); }
  catch (e) { err = e.message; }
  const lines = readLines(join(rd, 'events.jsonl')).map((l) => JSON.parse(l));
  if (holder) releaseLock(holder);
  report('7-拿不到锁不拒收', [
    ['拿不到锁时不抛(永不拒收)', err === null],
    ['事件仍忠实落盘(未丢)', lines.some((e) => e.type === 'item.add' && e.ref === 'T1')],
    ['仍返回编号 T1', !!r && r.ref === 'T1'],
    ['置 dirty 留痕(无锁路径)', existsSync(join(rd, 'dirty'))],
  ]);

  // 没有 current run 也不拒收:就地自动开工。
  const root2 = join(WORK, 'norun');
  let err2 = null;
  try { append({ root: root2, type: 'note', data: { ok: 1 } }); } catch (e) { err2 = e.message; }
  const cur = existsSync(join(taskboardDir(root2), 'current.json'));
  const autoEv = cur ? readEvents(runDirOf(root2, JSON.parse(readFileSync(join(taskboardDir(root2), 'current.json'), 'utf8')).run)) : [];
  report('7-无run自动开工', [
    ['没有 run 时 append 不抛', err2 === null],
    ['自动建了 run(current.json 出现)', cur],
    ['先落 run.start 再落事件', autoEv[0]?.type === 'run.start' && autoEv.some((e) => e.type === 'note')],
  ]);
}

// ── 自检 8(复核):2 KB 上限约束到整条记录 ──────────────────────────────────
{
  const root = join(WORK, 'size');
  runTl(['init', '--root', root, '--run', 'sz']);
  const rd = runDirOf(root, 'sz');
  append({ root, runId: 'sz', type: 'x'.repeat(9000), data: { big: 'y'.repeat(9000) } });
  append({ root, runId: 'sz', type: 'note', actor: 'a'.repeat(9000), ref: 'r'.repeat(9000), data: { s: 'z'.repeat(9000) } });
  const lines = readLines(join(rd, 'events.jsonl'));
  const sizes = lines.map((l) => Buffer.byteLength(l));
  let ok = true, types = [];
  try { types = lines.map((l) => JSON.parse(l).type); } catch { ok = false; }
  report('8-2KB上限', [
    [`所有行 ≤ 2048 字节(最大 ${Math.max(...sizes)})`, sizes.every((s) => s <= 2048)],
    ['超长 type 被截断仍可解析且保留语义', ok && types[types.length - 1] === 'note' && types[types.length - 2].startsWith('x') && types[types.length - 2].endsWith('…')],
    ['顶层 ref 未被漏掉(仍可解析)', ok],
  ]);
}

// ── 自检 9(复核):投影成功后清 dirty ────────────────────────────────────────
{
  const root = join(WORK, 'dirty');
  runTl(['init', '--root', root, '--run', 'd']);
  const rd = runDirOf(root, 'd');
  rmSync(join(rd, 'state.js'));
  mkdirSync(join(rd, 'state.js'));           // 投影必失败
  append({ root, runId: 'd', type: 'note', data: { a: 1 } });
  const dirtyAfterFail = existsSync(join(rd, 'dirty'));
  rmSync(join(rd, 'state.js'), { recursive: true, force: true }); // 修好,再投影一次
  append({ root, runId: 'd', type: 'note', data: { b: 2 } });
  const dirtyAfterOk = existsSync(join(rd, 'dirty'));
  report('9-dirty清除', [
    ['投影失败时置 dirty', dirtyAfterFail],
    ['之后投影成功时清 dirty(不残留一次瞬态失败)', !dirtyAfterOk],
  ]);
}

// ── 自检 10(复核):坏行不静默丢弃、不复用 seq ──────────────────────────────
{
  const root = join(WORK, 'badline');
  runTl(['init', '--root', root, '--run', 'b']);
  const rd = runDirOf(root, 'b');
  appendFileSync(join(rd, 'events.jsonl'), '{ 这不是合法 JSON\n'); // 模拟被截断的行
  let r = null, err = null;
  try { r = append({ root, runId: 'b', type: 'note', data: { ok: 1 } }); } catch (e) { err = e.message; }
  const proj = project(readEvents(rd), NOW);
  report('10-坏行不静默', [
    ['坏行后 append 不抛', err === null],
    [`不复用坏行占用的 seq(新事件 seq=${r?.seq},应 > 2)`, !!r && r.seq > 2],
    ['坏行在投影 notes 里现形', proj.notes.some((n) => n.includes('无法解析'))],
    ['坏行仍在文件里(未被改写)', readFileSync(join(rd, 'events.jsonl'), 'utf8').includes('这不是合法 JSON')],
  ]);
}

// ── 自检 11(M1):append 的临界区(持锁时间)不随日志长度线性增长 ─────────────
// 直接量 append 的墙钟没用:writeState(全量投影)在锁外、按设计就是 O(n)。
// 所以把临界区代价隔离出来:crit = t(append) − t(writeState)。
//   · 新实现:锁内只 statSync + 追加一行 + 写常量大小的 index.json → crit ≈ O(1);
//   · 旧实现:锁内 readEvents + 逐行 parse 全量日志算 seq/nextRef → crit ≈ 一次全量读。
// 判据用「crit 相对一次全量读(tFull)的量级」表述,不依赖绝对毫秒(机器速度无关)。
{
  const root = join(WORK, 'scale');
  runTl(['init', '--root', root, '--run', 'sc']);
  const rd = runDirOf(root, 'sc');
  const evp = join(rd, 'events.jsonl');
  // 用「最快的一拍」而非中位数:每次 append 含 2 次 fsync,中位数会被 fsync 抖动淹没。
  // 取 min 把抖动滤掉,留下的是稳定的净代价。
  const best = (fn, n = 9) => {
    let m = Infinity;
    for (let i = 0; i < n; i++) { const t0 = process.hrtime.bigint(); fn(); m = Math.min(m, Number(process.hrtime.bigint() - t0) / 1e6); }
    return m;
  };
  // 成对采样后再取 Δ 的最小值:min(append)−min(writeState) 会把两次独立采样的抖动叠加,
  // 在 Windows 上偶发让 Δcrit 冒出 50ms+ 的假尖峰(实测一次 55ms,阈值 39ms → 误红)。
  // 成对 Δ=t(append_i)−t(writeState_i) 让同一拍内的两次测量共享瞬时负载,差值抵消抖动,再取 min。
  // 真·临界区代价是毫秒级常量;而「锁内读全量」的旧实现每拍都含一次 tFull,Δ_min ≈ tFull,
  // 与新版(≈0)仍分得开——阈值放宽到 tFull/2 只为吸收残余尖峰,判别力不变。
  const pairDelta = (n = 12) => {
    let m = Infinity;
    for (let i = 0; i < n; i++) {
      const t0 = process.hrtime.bigint(); append({ root, runId: 'sc', type: 'tick', data: { k: 'x' } }); const c = Number(process.hrtime.bigint() - t0) / 1e6;
      const t1 = process.hrtime.bigint(); writeState(root, 'sc', NOW); const w = Number(process.hrtime.bigint() - t1) / 1e6;
      m = Math.min(m, c - w);
    }
    return m;
  };
  // 小日志上的临界区(基线)
  const tSmallCrit = pairDelta();
  // 造大日志:直接写行(旁路 index),再 append 一次触发 O(n) 索引重建;此后 append 应回到 O(1)。
  // N 取得足够大,使「一次全量读」远大于 fsync 抖动——否则两种实现都淹没在噪声里分不开。
  const N = 120000;
  let blob = '';
  for (let i = 0; i < N; i++) blob += JSON.stringify({ v: 3, seq: 1000 + i, t: NOW, run: 'sc', actor: 'sub', type: 'tick', ref: null, data: { i } }) + '\n';
  appendFileSync(evp, blob);
  append({ root, runId: 'sc', type: 'tick', data: { k: 'sync' } }); // 索引自愈(一次性 O(n))
  const tFull = best(() => readEvents(rd), 7);
  const critLarge = pairDelta();
  const lines = readLines(evp);
  // 判据:临界区随日志增长的**增量**要远小于一次全量读。这既是 [17] 的「只追加一行」,
  // 也直接对比两种实现——旧实现 Δcrit ≈ tFull(锁内读全量),新实现两者相近。
  report('11-持锁时间不随日志增长', [
    [`大日志已就位(${lines.length} 行,一次全量读 ${tFull.toFixed(1)}ms)`, lines.length >= N && tFull > 20],
    [`临界区增量 ≠ 一次全量读:Δcrit ${(critLarge - tSmallCrit).toFixed(2)}ms < tFull/2 ${(tFull / 2).toFixed(2)}ms`,
      critLarge - tSmallCrit < tFull / 2],
    [`临界区不随日志增长:大日志 ${critLarge.toFixed(2)}ms ≈ 小日志 ${tSmallCrit.toFixed(2)}ms`,
      critLarge < tSmallCrit + tFull / 2],
  ]);
}

// ── 自检 12(复核):current.json 走原子替换(与 state.js 同一机制) ───────────
// 非原子的 writeFileSync 是「原地截断再写」——目标 inode 不变,截断窗口内读者会看到半截文件。
// 原子替换是「写 tmp + rename」——目标 inode 必变,读者只见旧值或新值。用 inode 变化做判据:
// 它把两种写法的**机制差异**变成可断言的事实,而非靠概率去撞一个微秒级窗口。
{
  const root = join(WORK, 'curatomic');
  runTl(['init', '--root', root, '--run', 'ca1', '--title', 'one']);
  const curPath = join(taskboardDir(root), 'current.json');
  const ino1 = statSync(curPath).ino;
  const c1 = JSON.parse(readFileSync(curPath, 'utf8'));
  runTl(['init', '--root', root, '--run', 'ca2', '--title', 'two']);
  const ino2 = statSync(curPath).ino;
  const c2 = JSON.parse(readFileSync(curPath, 'utf8'));
  report('12-current.json原子替换', [
    ['current.json 始终可解析且指向最新 run', c1.run === 'ca1' && c2.run === 'ca2' && typeof c2.at === 'string'],
    [`换 run 是替换不是原地截断(ino ${ino1} → ${ino2})`, ino1 !== 0 && ino2 !== 0 && ino1 !== ino2],
  ]);
}

// ── 自检 13(复核 F1):并发抢占同一 stale 锁 → 同时持锁峰值必须为 1 ───────────
// 复核发现的真实缺陷:[12] 的抢占原语「writeOwner + 回读 token」无互斥——N 个迟到者同时判 stale,
// 各自 writeOwner 后回读到**自己的 token**,于是 N 个进程同时「持锁」(实测 12/12)。
// 判据用**持锁区间重叠峰值**,不是「共几个拿到」:释放后等待者会次序再取,那是合法的。
{
  const root = join(WORK, 'steal');
  runTl(['init', '--root', root, '--run', 'steal']);
  const rd = runDirOf(root, 'steal');
  const lockDir = join(rd, '.lock');
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ pid: 0x7fffffff, token: 'dead' }));
  const old = new Date(Date.now() - 60000); utimesSync(lockDir, old, old); // 伪造为 stale(死 pid + 旧 mtime)
  const K = 16;
  const ST = join(WORK, 'stealer.mjs');
  writeFileSync(ST, `
import { pathToFileURL } from 'node:url';
const { acquireLock, runDirOf, releaseLock } = await import(process.argv[2]);
const h = acquireLock(runDirOf(process.argv[3], 'steal'), { timeoutMs: 2000 });
if (!h) { process.stdout.write('NONE'); process.exit(0); }
const t0 = Date.now();
await new Promise((r) => setTimeout(r, 300));
process.stdout.write(JSON.stringify({ t0, t1: Date.now(), token: h.token }));
releaseLock(h);
process.exit(0);
`);
  const outs = await Promise.all(Array.from({ length: K }, () => spawnNode(ST, [TL_URL, root]).done));
  const holders = outs.filter((o) => o.out.trim().startsWith('{')).map((o) => JSON.parse(o.out));
  // 扫描线:同一时刻先记「释放」再记「获取」(比较器 a[1]-b[1] 让 -1 排前),避免毫秒级并发的假重叠。
  const ev = holders.flatMap((h) => [[h.t0, 1], [h.t1, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, peak = 0;
  for (const [, d] of ev) { cur += d; peak = Math.max(peak, cur); }
  report('13-并发抢占恰一持有者', [
    [`K=${K} 迟到者同时持锁峰值 === 1(实得 ${peak};报告持锁 ${holders.length} 个,其余超时或次序再取)`, peak === 1],
  ]);
}

// 条数由 report() 现数现报。写死数字会随夹具增删悄悄变成谎话(票 21 复核发现这里写的数与实跑数早就对不上)。
console.log(bad === 0 ? `全部自检通过(${total} 条)` : `${bad}/${total} 项未过`);
rmSync(WORK, { recursive: true, force: true });
process.exit(bad === 0 ? 0 : 1);
