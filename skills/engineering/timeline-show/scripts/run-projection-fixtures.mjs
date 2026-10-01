// 投影/reducer 的自检(票 21「投影与 reducer」)。形状照 visualize/scripts/run-fixtures.mjs:
// 无测试框架,Node 标准库自己写;每条断言打印 ok/FAIL,全过退 0,否则退 1。
//
// 覆盖任务书「自检」四条:
//   1 逐字节确定性   —— 同一 events + 同一注入 now,序列化两次逐字节相同(进程内 + 跨进程各一次)
//   2 重放幂等       —— 同一 events 重放两次结构相同;换 now 只动时间派生字段
//   3 黄金样例       —— spec §8.9 示例 / 多级传递依赖 / 并行 DOING / 无 assumes / 全未知,
//                       逐例断言 ripple 与标注依据;级联四种效果 + 冲突 + 成环各一例
//   4 未知事件不崩   —— 喂 reducer 不认识的事件,投影不抛,只记 note
// 外加票面「要产出的东西」:
//   5 三泳道 + 派生标记(blocked / stale / reopened / unverified / claimed-only / discovered)
//   6 卡点 K / 决策点 D / 检查 C 的投影
//   7 注意力预算权重与排序口径
//   8 批次复核 ok low 的阈值口径
//
// 注意:spec §19 验收第 4 条(当场拒收)与第 15 条(心跳分档)已失效,本夹具**不照做**。

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const DIR = import.meta.dirname;
const TL = join(DIR, 'tl.mjs');
const WORK = mkdtempSync(join(tmpdir(), 'tl-proj-fixtures-'));
const { project, serializeState, readProjectPolicy } = await import(pathToFileURL(TL).href);
// globRe 只从 project.mjs 出(tl.mjs 不转出它),单独引一次。
const { globRe } = await import(pathToFileURL(join(DIR, 'project.mjs')).href);

const BASE = Date.UTC(2026, 8, 28, 9, 0, 0);          // 2026-09-28 09:00:00Z
const T = (min) => new Date(BASE + min * 60000).toISOString();

let bad = 0;
let total = 0;
function report(name, checks) {
  for (const [t, ok] of checks) { total++; if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} [${name}] ${t}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 非数组一律返回 null,不折叠成 []:ripple 整个缺失时 sorted(x) 会得到 [],于是
// `eq(sorted(x), [])` 这类断言恒真 —— 缺东西和空东西长得一样,断言就白写了。
const sorted = (x) => (Array.isArray(x) ? [...x].sort() : null);
const has = (arr, v) => Array.isArray(arr) && arr.includes(v);

// 结构比对用:剔除所有由注入的 now 派生的字段(生成时刻 / 活跃耗时 / ETA / 项已用时 / 沉没耗时)。
// 两处结构比对(自检 2、2c)共用这一份 —— 两份拷贝会各自漂移,一份补了新字段另一份不补就悄悄变了口径。
// 它是**黑名单**:实现新增一个 now-派生字段而这里没跟着删,比对会转红。弱在要人肉维护,
// 但失灵方向是响亮地红,不会静默放行。
const strip = (st) => {
  const o = JSON.parse(JSON.stringify(st));
  delete o.generated_at;
  if (o.run) { delete o.run.active_seconds; delete o.run.eta; }
  for (const it of o.items ?? []) delete it.active_seconds;
  for (const d of o.decisions ?? []) {
    for (const op of d.options ?? []) { const rp = op.impact && op.impact.ripple; if (rp) delete rp.sunk_min; }
    if (d.effective && d.effective.ripple) delete d.effective.ripple.sunk_min;
  }
  return o;
};

// 事件构造器:一行一事件,seq 与行序一致(投影按行序重算 canonical seq)。
function mk() {
  let s = 0; const list = [];
  return {
    list,
    add(type, ref = null, data = {}, t = T(0)) {
      list.push({ v: 3, seq: ++s, t, run: 'R', actor: 'main', type, ref, data });
      return list;
    },
  };
}
// 一个「有且仅有一个 default」的合法选项声明;declared 可覆写。
const opt = (key, label, isDefault, declared = {}) => ({
  key, label, default: isDefault, reversible: true,
  impact: { declared: { redo: [], enable: [], disable: [], side_effects: [], cascade: [], redo_est_min: 0, note: '', ...declared } },
});
const NOIMPACT = (key, label, isDefault) => ({ key, label, default: isDefault, reversible: true });
const find = (st, id) => st.decisions.find((d) => d.id === id);
const optOf = (d, k) => d.options.find((o) => o.key === k);
const itemOf = (st, id) => st.items.find((i) => i.id === id);

// ── 场景:spec §8.9 端到端示例 ────────────────────────────────────────────────
function s89() {
  const m = mk();
  m.add('run.start', null, { title: '重构认证模块', goal: 'g', type: 'coding' }, T(0));
  m.add('item.add', 'T1', { title: '调研现状' }, T(0));
  m.add('item.done', 'T1', { active_seconds: 300 }, T(5));
  m.add('item.add', 'T2', { title: '抽象 SessionStore', deps: ['T1'] }, T(0));
  m.add('item.done', 'T2', { active_seconds: 300 }, T(8));
  m.add('item.add', 'T3', { title: '迁移 session 存储', deps: ['T1', 'T2'] }, T(0));
  m.add('item.add', 'T4', { title: '改造 token 签发', deps: ['T2'] }, T(0));
  m.add('item.add', 'T5', { title: '续期接口', deps: ['T4'] }, T(0));
  m.add('item.add', 'T6', { title: '登出与失效', deps: ['T4'] }, T(0));
  m.add('item.add', 'T7', { title: '集成测试', deps: ['T3', 'T5', 'T6'] }, T(0));
  m.add('decision.open', 'D2', { title: 'token 过期策略', question: 'q', why_now: 'w', mode: 'provisional',
    affects: ['T3', 'T5', 'T6'], lock_at: { type: 'item', ref: 'T7' },
    options: [
      opt('A', '滑动过期', true, { enable: ['T5', 'T6'], cascade: [{ decision: 'D4', effect: 'default', value: 'A' }] }),
      opt('B', '固定过期', false, { redo: ['T3'], enable: ['T5', 'T6'], cascade: [{ decision: 'D4', effect: 'moot' }], redo_est_min: 15, note: '需重写过期校验' }),
    ] }, T(0));
  m.add('decision.open', 'D4', { title: 'D4', mode: 'provisional', options: [opt('A', 'a', true), opt('B', 'b', false)] }, T(0));
  m.add('item.start', 'T3', {}, T(0));
  m.add('item.done', 'T3', { active_seconds: 720 }, T(12));
  m.add('item.start', 'T4', {}, T(12));
  m.add('item.progress', 'T4', { progress: 0.4, note: '写发号逻辑' }, T(18));
  m.add('decision.answer', 'D2', { key: 'B', by: 'you', via: 'chat' }, T(21));
  return m.list;
}
const NOW89 = T(21);

// ── 场景:多级传递依赖(seed 在链头) ────────────────────────────────────────
function sChain() {
  const m = mk();
  m.add('run.start', null, { title: 'chain' }, T(0));
  m.add('decision.open', 'D1', { title: 'd', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo_est_min: null })] }, T(0));
  m.add('item.add', 'T1', { title: '1' }, T(0));
  m.add('item.start', 'T1', {}, T(1));
  m.add('item.done', 'T1', { active_seconds: 60 }, T(2));
  m.add('item.add', 'T2', { title: '2', deps: ['T1'] }, T(0));
  m.add('item.start', 'T2', {}, T(3));
  m.add('item.done', 'T2', { active_seconds: 120 }, T(5));
  m.add('item.add', 'T3', { title: '3', deps: ['T2'] }, T(0));
  m.add('item.start', 'T3', {}, T(6));
  m.add('item.add', 'T4', { title: '4', deps: ['T3'] }, T(0));
  m.add('decision.answer', 'D1', { key: 'B', by: 'you' }, T(10));
  return m.list;
}

// ── 场景:并行 DOING ────────────────────────────────────────────────────────
function sPar() {
  const m = mk();
  m.add('run.start', null, { title: 'par' }, T(0));
  m.add('decision.open', 'D1', { title: 'd', mode: 'provisional', options: [opt('A', 'a', true), opt('B', 'b', false)] }, T(0));
  m.add('item.add', 'T1', { title: '1' }, T(0));
  m.add('item.add', 'T2', { title: '2' }, T(0));
  m.add('item.start', 'T1', {}, T(0));
  m.add('item.start', 'T2', {}, T(1));
  m.add('item.done', 'T1', { active_seconds: 480 }, T(8));
  m.add('decision.answer', 'D1', { key: 'B', by: 'you' }, T(10));
  return m.list;
}

// ── 场景:无 assumes(决策在项开工后才开) ──────────────────────────────────
function sNoAssume() {
  const m = mk();
  m.add('run.start', null, { title: 'noassume' }, T(0));
  m.add('item.add', 'T1', { title: '1' }, T(0));
  m.add('item.start', 'T1', {}, T(1));
  m.add('item.done', 'T1', { active_seconds: 60 }, T(2));
  m.add('decision.open', 'D1', { title: 'd', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo: ['T1'] })] }, T(3));
  m.add('decision.answer', 'D1', { key: 'B', by: 'you' }, T(4));
  return m.list;
}

// ── 场景:全未知(无 assumes、无声明) ───────────────────────────────────────
function sUnknown() {
  const m = mk();
  m.add('run.start', null, { title: 'unknown' }, T(0));
  m.add('item.add', 'T1', { title: '1' }, T(0));
  m.add('item.start', 'T1', {}, T(1));
  m.add('item.done', 'T1', { active_seconds: 60 }, T(2));
  m.add('decision.open', 'D1', { title: 'd', mode: 'provisional', options: [NOIMPACT('A', 'a', true), NOIMPACT('B', 'b', false)] }, T(3));
  m.add('decision.answer', 'D1', { key: 'B', by: 'you' }, T(4));
  return m.list;
}

// ── 场景:声明 redo 的下游 todo ─────────────────────────────────────────────
// 钉住 spec §8.4 规则 2 里「声明 ∪ seed」那个并集。s89/sChain 都区分不出:那里的 todo
// 下游恰好也在 seed 的下游里,于是「下游取 downstreamOf(seed)」与「取 downstreamOf(seed ∪ dRedo)」
// 结果一样 —— 删掉 dRedo 那条断言照样绿(票 26 独立核验)。这里让 dRedo 引出一个 **seed 到不了** 的
// todo:T9 是声明的 redo 目标(done),T2 依赖 T9 且在 todo;seed 是 T1(doing,基于默认 A)。
// T1 无下游 ⇒ 只取 seed 得空;并入 dRedo 才有 {T2}。
function sRedoTodo() {
  const m = mk();
  m.add('run.start', null, { title: 'redotodo' }, T(0));
  // T9 的 add/start/done 排在 D1 开点**之前**:它开工时没有任何 pending 决策,于是不会被
  // derivesAssumes 合成出 {D1,A} 的假设,也就进不了 seed —— 否则 T9 既在 seed 又在 dRedo,
  // 两条下游路径重合,又退化成区分不出 dRedo 那一半(第一次写就踩了这个坑)。
  m.add('item.add', 'T9', { title: '9(声明的 redo 目标)' }, T(0));
  m.add('item.start', 'T9', {}, T(0));
  m.add('item.done', 'T9', { active_seconds: 60 }, T(1));
  m.add('decision.open', 'D1', { title: 'd', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo: ['T9'] })] }, T(0));
  m.add('item.add', 'T2', { title: '2(依赖 T9 的 todo)', deps: ['T9'] }, T(0));
  m.add('item.add', 'T1', { title: '1(doing,基于默认 A)' }, T(0));
  m.add('item.start', 'T1', { assumes: [{ decision: 'D1', option: 'A', confirmed: false }] }, T(0));
  m.add('decision.answer', 'D1', { key: 'B', by: 'you' }, T(5));
  return m.list;
}

// ── 场景:hold 决策被作答 ───────────────────────────────────────────────────
// spec §8.7:hold 决策一旦被作答即转 `answered`(不是 overridden)。旧实现一律落 overridden,
// 于是 counts.decisions.answered 永远为 0(票 21 复核)。mode 参数据此分 hold / provisional 两组。
function sHoldAnswer(mode) {
  const m = mk();
  m.add('run.start', null, { title: 'holdans-' + mode }, T(0));
  m.add('decision.open', 'D1', { title: 'h', mode, options: [opt('A', 'a', true), opt('B', 'b', false)] }, T(0));
  m.add('decision.answer', 'D1', { key: 'B', by: 'you' }, T(2));
  return m.list;
}

// ── 场景:级联(一种效果一例) ───────────────────────────────────────────────
function sCascade(effect, value, answerD4First = false) {
  const m = mk();
  m.add('run.start', null, { title: 'cas' }, T(0));
  const casc = effect === 'moot' ? [{ decision: 'D4', effect: 'moot' }]
    : effect === 'hold' ? [{ decision: 'D4', effect: 'hold' }]
      : [{ decision: 'D4', effect, value }];
  m.add('decision.open', 'D2', { title: 'd2', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { cascade: casc })] }, T(0));
  m.add('decision.open', 'D4', { title: 'd4', mode: 'provisional', options: [opt('A', 'a', true), opt('B', 'b', false)] }, T(0));
  if (answerD4First) m.add('decision.answer', 'D4', { key: 'A', by: 'you' }, T(4));
  m.add('decision.answer', 'D2', { key: 'B', by: 'you' }, T(5));
  return m.list;
}

// ── 场景:级联成环 ─────────────────────────────────────────────────────────
function sCycle() {
  const m = mk();
  m.add('run.start', null, { title: 'cycle' }, T(0));
  m.add('decision.open', 'D2', { title: 'd2', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { cascade: [{ decision: 'D3', effect: 'moot' }] })] }, T(0));
  m.add('decision.open', 'D3', { title: 'd3', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { cascade: [{ decision: 'D2', effect: 'moot' }] })] }, T(0));
  return m.list;
}

// ── 场景:派生标记 ─────────────────────────────────────────────────────────
function sMarks() {
  const m = mk();
  m.add('run.start', null, { title: 'marks' }, T(0));
  m.add('item.add', 'T1', { title: 'disc', origin: { type: 'discovered' } }, T(0));
  m.add('item.start', 'T1', {}, T(0));
  m.add('item.done', 'T1', {}, T(1));
  m.add('item.add', 'T2', { title: 'claimed' }, T(0));
  m.add('item.start', 'T2', {}, T(0));
  m.add('check.claim', 'T2', { name: '手动验证登录', result: 'pass' }, T(1));
  m.add('item.done', 'T2', {}, T(2));
  m.add('item.add', 'T3', { title: 'rounds' }, T(0));
  m.add('item.start', 'T3', {}, T(0));
  m.add('item.done', 'T3', {}, T(1));
  m.add('item.reopen', 'T3', { why: 'bug' }, T(2));
  m.add('item.add', 'T4', { title: 'blocked-by-stuck' }, T(0));
  m.add('stuck.open', 'K1', { what: 'CI 缺少 STAGING_KEY', tried: ['查了 .env.example', '查了 CI 变量'], needs: '提供密钥或允许跳过', item: 'T4', severity: 'block' }, T(0));
  m.add('decision.open', 'D9', { title: 'hold', mode: 'hold', affects: ['T5'], options: [opt('A', 'a', true, { side_effects: ['deploy'] })] }, T(0));
  m.add('item.add', 'T5', { title: 'blocked-by-hold' }, T(0));
  return m.list;
}

// ── 场景:注意力预算 + ok low 阈值 ─────────────────────────────────────────
function sAttention() {
  const m = mk();
  m.add('run.start', null, { title: 'att', policy: { review_paths: ['auth/**'], big_change_lines: 200 } }, T(0));
  m.add('item.add', 'T1', { title: 'auth change' }, T(0));
  m.add('item.start', 'T1', {}, T(0));
  m.add('item.done', 'T1', { active_seconds: 60, changes: [{ path: 'auth/session.py', status: 'M', add: 42, del: 10 }] }, T(1));
  m.add('item.add', 'T2', { title: 'small+verified' }, T(0));
  m.add('item.start', 'T2', {}, T(0));
  m.add('check.run', 'T2', { id: 'C1', name: '单元测试', result: 'pass', exit: 0, dur_s: 18 }, T(1));
  m.add('item.done', 'T2', { active_seconds: 60, changes: [{ path: 'util.py', status: 'M', add: 5, del: 3 }] }, T(2));
  m.add('item.add', 'T3', { title: 'failed check' }, T(0));
  m.add('item.start', 'T3', {}, T(0));
  m.add('check.run', 'T3', { id: 'C2', name: '单元测试', result: 'fail', exit: 1, dur_s: 9 }, T(1));
  m.add('item.done', 'T3', { active_seconds: 60 }, T(2));
  m.add('item.add', 'T4', { title: 'reopened' }, T(0));
  m.add('item.start', 'T4', {}, T(0));
  m.add('item.done', 'T4', { active_seconds: 60 }, T(1));
  m.add('item.reopen', 'T4', { why: 'x' }, T(2));
  m.add('item.start', 'T4', {}, T(2));
  m.add('check.run', 'T4', { id: 'C3', name: '单元测试', result: 'pass', exit: 0, dur_s: 5 }, T(3));
  m.add('item.done', 'T4', { active_seconds: 30 }, T(4));
  // T5:CLI 检查全通过、**零改动**。spec §7.6 末行的条件是「有已执行检查且全部通过,且改动很小」,
  // 没有「必须有改动」这一条。零改动是「很小」的极限情形,得 −1。
  // 旧实现自加了 `lines > 0` 守卫,于是这一格得 0(票 21 复核)。
  m.add('item.add', 'T5', { title: 'zero-change, all-pass' }, T(0));
  m.add('item.start', 'T5', {}, T(0));
  m.add('check.run', 'T5', { id: 'C4', name: '单元测试', result: 'pass', exit: 0, dur_s: 3 }, T(1));
  m.add('item.done', 'T5', { active_seconds: 20 }, T(2));
  // T6/T7 是 low_max **阈值本身**的两个边界探针。没有它们,`low_max === 2` 只是把输出
  // 跟一个常量比一比,阈值到底在拦谁完全没被测到(sAttention 里原本最高分的合格项才 1 分)。
  // 两项都机器验证通过(有 pass/exit 0 的 CLI 检查且改动小 ⇒ −1),只在分数上分居阈值两侧。
  // T6:permitted 那一侧 —— 改动命中 review_paths +3,−1 ⇒ **恰好 2**,应当**在内**。
  m.add('item.add', 'T6', { title: 'review-path hit, at threshold' }, T(0));
  m.add('item.start', 'T6', {}, T(0));
  m.add('check.run', 'T6', { id: 'C5', name: '单元测试', result: 'pass', exit: 0, dur_s: 4 }, T(1));
  m.add('item.done', 'T6', { active_seconds: 40, changes: [{ path: 'auth/login.py', status: 'M', add: 4, del: 2 }] }, T(2));
  // T7:excluded 那一侧 —— 所基于的选项带 hold_effects(deploy)+4,−1 ⇒ **恰好 3**,仅超阈值 1 分,
  // 应当**不在内**。这一项替「改选后为 redo 新建 TODO」之外,也顺带钉住 hold_effects 打分路径。
  const decl = (side) => ({ declared: { redo: [], enable: [], disable: [], side_effects: side, cascade: [], redo_est_min: 0, note: '' } });
  m.add('decision.open', 'D3', { title: '发布闸门', question: 'q', why_now: 'w', mode: 'provisional', options: [
    { key: 'A', label: 'A', default: true, impact: decl(['deploy']) },
    { key: 'B', label: 'B', impact: decl([]) },
  ] }, T(0));
  m.add('decision.answer', 'D3', { key: 'A', by: 'me' }, T(0));            // 答成 A ⇒ 假设被确认,不吃「未确认 +3」
  m.add('item.add', 'T7', { title: 'hold_effects hit, one over threshold' }, T(0));
  m.add('item.start', 'T7', { assumes: [{ decision: 'D3', option: 'A', confirmed: true }] }, T(0));
  m.add('check.run', 'T7', { id: 'C6', name: '单元测试', result: 'pass', exit: 0, dur_s: 4 }, T(1));
  m.add('item.done', 'T7', { active_seconds: 40, changes: [{ path: 'util.py', status: 'M', add: 2, del: 1 }] }, T(2));
  // T8:同时有**失败的检查**与 **rounds>1**。spec §7.6 把这两个条件列成**同一条** +2 规则
  // (「有失败的检查,或 rounds > 1」),不是两条各 +2。T4 只踩了 rounds 一条,区分不出
  // 「一条」与「两条」—— 这里两条同时踩,得 2 且理由恰好 1 条才是对的;拆成两条双计会得 4、理由 2 条。
  m.add('item.add', 'T8', { title: 'failed + reopened(one rule, not two)' }, T(0));
  m.add('item.start', 'T8', {}, T(0));
  m.add('item.done', 'T8', { active_seconds: 60 }, T(1));
  m.add('item.reopen', 'T8', { why: 'x' }, T(2));
  m.add('item.start', 'T8', {}, T(2));
  m.add('check.run', 'T8', { id: 'C7', name: '单元测试', result: 'fail', exit: 1, dur_s: 3 }, T(3));
  m.add('item.done', 'T8', { active_seconds: 30 }, T(4));
  return m.list;
}

// ── 自检 1:逐字节确定性(注入固定 now,序列化两次逐字节相同) ─────────────────
{
  // 跨进程:两次独立进程各自 project + serialize,只比字节。
  const GEN = join(WORK, 'gen.mjs');
  writeFileSync(GEN, `
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const { project, serializeState } = await import(process.argv[2]);
const [evPath, now] = process.argv.slice(3);
const events = JSON.parse(readFileSync(evPath, 'utf8'));
process.stdout.write(serializeState(project(events, now)));
`);
  const evPath = join(WORK, 'ev.json');
  writeFileSync(evPath, JSON.stringify(s89()));
  const run = (now) => execFileSync('node', [GEN, pathToFileURL(TL).href, evPath, now], { encoding: 'utf8' });
  const a = run(NOW89), b = run(NOW89);
  const s1 = serializeState(project(s89(), NOW89));
  const s2 = serializeState(project(s89(), NOW89));
  report('1-逐字节确定性', [
    ['进程内两次序列化逐字节相同', s1 === s2],
    ['跨进程两次生成逐字节相同', a === b && a.length > 100],
    ['产物是 window.__TL__ 纯数据赋值', /^window\.__TL__ = \{[\s\S]*\};\n$/.test(s1)],
    // 上面那条正则挡不住「赋值后面又跟了一条语句」:若追加的语句本身以 `};` 结尾
    // (比如 `x = {};`),贪婪的 [\s\S]* 会把它一起吞掉,断言照样绿。
    // 所以改成**切开前后缀、把中间那坨当 JSON 解**:正文里多出任何一条语句,payload 就不再是合法 JSON。
    ['产物只含一条赋值(正文里 JSON.parse 得通,追加语句会让它解不开)',
      (() => {
        const P = 'window.__TL__ = ';
        if (!s1.startsWith(P) || !s1.endsWith(';\n')) return false;
        const payload = s1.slice(P.length, -2);
        try {
          const back = payload.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&');
          return eq(JSON.parse(back), project(s89(), NOW89));   // 解出来还得**就是**那份状态,不是随便什么 JSON
        } catch { return false; }
      })()],
    // 转义契约(§16/XSS 边界):正文里不许有裸的 `<`。拿合成串钉,不靠夹具里碰巧有没有尖括号。
    ['序列化把 < > & 与 U+2028/9 转义掉(裸 < 会让内联脚本提前闭合;裸 U+2028 在 JS 里就是换行)',
      (() => {
        const s = serializeState({ x: '<script>&', y: String.fromCharCode(0x2028) + String.fromCharCode(0x2029) });
        return s.includes('\\u003c') && s.includes('\\u003e') && s.includes('\\u0026')
          && s.includes('\\u2028') && s.includes('\\u2029') && !s.includes('<script>');
      })()],
  ]);
}

// ── 自检 2:重放幂等 + 换 now 只动时间派生字段 ────────────────────────────────
{
  const NOW2 = T(30);
  const s1 = project(s89(), NOW89);
  const s2 = project(s89(), NOW89);
  const s3 = project(s89(), NOW2);
  const i4a = itemOf(s1, 'T4');
  const i4c = itemOf(s3, 'T4');
  report('2-重放幂等', [
    ['同一 events 重放两次结果相同', JSON.stringify(s1) === JSON.stringify(s2)],
    ['换 now 后结构逐值相同(只动时间派生字段)', JSON.stringify(strip(s1)) === JSON.stringify(strip(s3))],
    ['换 now 后 generated_at 确实变了', s1.generated_at !== s3.generated_at],
    ['换 now 后 run.active_seconds 确实变了', s1.run.active_seconds !== s3.run.active_seconds],
    [`doing 项已用时随 now 变(T4 ${i4a?.active_seconds}s → ${i4c?.active_seconds}s)`, i4a && i4c && i4a.active_seconds !== i4c.active_seconds],
  ]);
}

// ── 自检 2c:`lock_at.type='time'` 是 now **真的会改结构**的那条路径 ───────────
// 自检 2 那句「换 now 后结构逐值相同」只在 s89 这个场景成立 —— 它的两处 lock_at
// 一处是 item 型、一处没到点,所以结构确实不动。若不把这条边界写出来,
// 那句断言读起来像「投影对 now 不敏感」,其实它只是在当前夹具上不敏感(票 21 复核)。
// 这一组反过来钉住:**跨过时间锁点,结构必须变**,而且默认选项的级联要跟着应用。
{
  const mkLock = () => {
    const m = mk();
    m.add('run.start', null, { title: 'time-lock' }, T(0));
    m.add('decision.open', 'D1', { title: '到点接管', mode: 'provisional', lock_at: { type: 'time', at: T(30) },
      options: [opt('A', 'a', true, { cascade: [{ decision: 'D2', effect: 'moot' }] }), opt('B', 'b', false)] }, T(0));
    m.add('decision.open', 'D2', { title: '被接管', mode: 'provisional', options: [opt('A', 'a', true), opt('B', 'b', false)] }, T(0));
    return m.list;
  };
  const before = project(mkLock(), T(10));      // 锁点之前
  const after = project(mkLock(), T(40));       // 锁点之后
  report('2c-时间锁点改结构', [
    [`锁点之前 D1 仍待默认(实得 ${find(before, 'D1')?.status})`, find(before, 'D1')?.status === 'pending_default'],
    [`跨过锁点 D1 落为 expired_locked(实得 ${find(after, 'D1')?.status})`, find(after, 'D1')?.status === 'expired_locked'],
    [`边界明说:去掉时间派生字段后,两侧结构**仍然不同**(自检 2 那句不是普适不变量)`,
      JSON.stringify(strip(before)) !== JSON.stringify(strip(after))],
    ['控制组:锁点之前级联未发生', find(before, 'D2')?.status === 'pending_default'],
    [`默认被接管时级联生效(§8.5「或被默认接管时应用」):D2 变 moot(实得 ${find(after, 'D2')?.status})`,
      find(after, 'D2')?.status === 'moot'],
  ]);
}

// ── 自检 3a:黄金样例 —— spec §8.9 端到端示例 ────────────────────────────────
{
  const st = project(s89(), NOW89);
  const d2 = find(st, 'D2');
  const oB = optOf(d2, 'B');
  const oA = optOf(d2, 'A');
  const rB = oB?.impact?.ripple ?? {};
  const rA = oA?.impact?.ripple ?? {};
  const d4 = find(st, 'D4');
  const t3 = itemOf(st, 'T3');
  const t4 = itemOf(st, 'T4');
  report('3a-§8.9黄金样例', [
    ['D2 状态为 overridden(答 B ≠ 默认 A)', d2?.status === 'overridden' && d2?.answer?.key === 'B'],
    [`D2 选项 B 的 redo = {T3,T4}(实得 ${JSON.stringify(rB.items?.redo)})`, eq(sorted(rB.items?.redo), ['T3', 'T4'])],
    [`D2 选项 B 的 affected_todo = {T5,T6,T7}(实得 ${JSON.stringify(rB.items?.affected_todo)})`, eq(sorted(rB.items?.affected_todo), ['T5', 'T6', 'T7'])],
    [`sunk_min = 12+9 = 21(实得 ${rB.sunk_min})`, rB.sunk_min === 21],
    [`声明的 redo_est_min = 15(实得 ${rB.redo_est_min})`, rB.redo_est_min === 15],
    [`标注依据 mixed(已计算+已声明)(实得 ${rB.confidence})`, rB.confidence === 'mixed'],
    ['级联:D4 因 B 被 moot', (rB.decisions ?? []).some((c) => c.id === 'D4' && c.effect === 'moot') && d4?.status === 'moot'],
    ['默认选项 A 的 redo 为空', eq(rA.items?.redo, [])],
    ['T3 标 stale 且 outcome=superseded', has(t3?.flags, 'stale') && t3?.outcome === 'superseded'],
    ['T4 标 stale 且仍在 doing', has(t4?.flags, 'stale') && t4?.lane === 'doing'],
    [`D2 的 assumed_by = {T3,T4}(实得 ${JSON.stringify(d2?.assumed_by)})`, eq(sorted(d2?.assumed_by), ['T3', 'T4'])],
    [`三泳道计数 todo3/doing1/done3(实得 ${JSON.stringify(st.counts && { t: st.counts.todo, d: st.counts.doing, n: st.counts.done })})`,
      st.counts?.todo === 3 && st.counts?.doing === 1 && st.counts?.done === 3],
  ]);
}

// ── 自检 3b:多级传递依赖 / 并行 DOING / 无 assumes / 全未知 ─────────────────
{
  const st = project(sChain(), T(10));
  const r = optOf(find(st, 'D1'), 'B')?.impact?.ripple ?? {};
  report('3b-多级传递依赖', [
    [`redo 沿链传递 = {T1,T2,T3}(实得 ${JSON.stringify(r.items?.redo)})`, eq(sorted(r.items?.redo), ['T1', 'T2', 'T3'])],
    [`affected_todo = {T4}(实得 ${JSON.stringify(r.items?.affected_todo)})`, eq(sorted(r.items?.affected_todo), ['T4'])],
    [`sunk_min = (60+120+240)/60 = 7(实得 ${r.sunk_min})`, r.sunk_min === 7],
    ['未估算时 redo_est_min 为 null', r.redo_est_min === null],
    [`仅计算 → 标注 computed(实得 ${r.confidence})`, r.confidence === 'computed'],
  ]);
}
{
  const st = project(sPar(), T(10));
  const r = optOf(find(st, 'D1'), 'B')?.impact?.ripple ?? {};
  const t1 = itemOf(st, 'T1');
  report('3b-并行DOING', [
    [`两项同时基于默认 → redo = {T1,T2}(实得 ${JSON.stringify(r.items?.redo)})`, eq(sorted(r.items?.redo), ['T1', 'T2'])],
    [`sunk_min = (480+540)/60 = 17(实得 ${r.sunk_min})`, r.sunk_min === 17],
    [`并行重叠 → 归属近似(实得 ${t1?.evidence?.attribution})`, t1?.evidence?.attribution === 'approx'],
  ]);
}
{
  const st = project(sNoAssume(), T(4));
  const r = optOf(find(st, 'D1'), 'B')?.impact?.ripple ?? {};
  report('3b-无assumes', [
    ['无 assumes → 计算侧无 seed', itemOf(st, 'T1')?.assumes?.length === 0],
    [`redo 取声明值 = {T1}(实得 ${JSON.stringify(r.items?.redo)})`, eq(sorted(r.items?.redo), ['T1'])],
    [`仅声明 → 标注 declared(实得 ${r.confidence})`, r.confidence === 'declared'],
  ]);
}
{
  const st = project(sUnknown(), T(4));
  const r = optOf(find(st, 'D1'), 'B')?.impact?.ripple ?? {};
  report('3b-全未知', [
    [`无计算无声明 → 标注 unknown(实得 ${r.confidence})`, r.confidence === 'unknown'],
    ['ripple 各项为空', eq(r.items?.redo, []) && eq(r.items?.affected_todo, []) && r.sunk_min === 0],
  ]);
}

// ── 自检 3b':声明 redo 的下游 todo 必须并入 affected_todo(spec §8.4 规则 2) ──
{
  const st = project(sRedoTodo(), T(5));
  const r = optOf(find(st, 'D1'), 'B')?.impact?.ripple ?? {};
  report('3b\'-声明redo的下游todo', [
    [`redo = {T1,T9}(seed 的 T1 ∪ 声明的 T9)(实得 ${JSON.stringify(r.items?.redo)})`, eq(sorted(r.items?.redo), ['T1', 'T9'])],
    [`affected_todo = {T2}(T9 的 todo 下游;只取 seed 下游会得空)(实得 ${JSON.stringify(r.items?.affected_todo)})`,
      eq(sorted(r.items?.affected_todo), ['T2'])],
    ['T2 不在 redo 里(它是 todo,不需要重做,只是被牵动)', !has(r.items?.redo, 'T2')],
  ]);
}

// ── 自检 3d:hold 作答转 answered、provisional 作答转 overridden(spec §8.7) ──
{
  const holdSt = project(sHoldAnswer('hold'), T(2));
  const provSt = project(sHoldAnswer('provisional'), T(2));
  const dh = find(holdSt, 'D1');
  const dp = find(provSt, 'D1');
  report('3d-hold作答状态', [
    [`hold 决策答 B ⇒ answered(实得 ${dh?.status})`, dh?.status === 'answered'],
    ['hold 决策答 B 不落 overridden(answered 与 overridden 是两回事)', dh?.status !== 'overridden'],
    [`对照:provisional 答 B ≠ 默认 A ⇒ overridden(实得 ${dp?.status})`, dp?.status === 'overridden'],
    [`hold 的答案仍如实记下(key/B)(实得 ${JSON.stringify(dh?.answer?.key)})`, dh?.answer?.key === 'B'],
  ]);
}

// ── 自检 3c:级联四种效果 + 冲突 + 成环 ─────────────────────────────────────
{
  const moot = find(project(sCascade('moot'), T(5)), 'D4');
  const defv = find(project(sCascade('default', 'B'), T(5)), 'D4');
  const rm = find(project(sCascade('remove_option', 'A'), T(5)), 'D4');
  const hold = find(project(sCascade('hold'), T(5)), 'D4');
  report('3c-级联四种效果', [
    [`moot:目标转 moot(实得 ${moot?.status})`, moot?.status === 'moot'],
    [`default:目标默认改为 B(实得 ${optOf(defv, 'B')?.default})`, optOf(defv, 'B')?.default === true && optOf(defv, 'A')?.default === false],
    [`remove_option:排除 A,默认改选最可逆的 B(实得选项 ${JSON.stringify(rm?.options?.map((o) => o.key))})`,
      rm?.options?.length === 1 && rm.options[0].key === 'B' && rm.options[0].default === true],
    [`hold:目标升级为 hold(实得 mode=${hold?.mode} status=${hold?.status})`, hold?.mode === 'hold' && hold?.status === 'pending_hold'],
  ]);
}
{
  const st = project(sCascade('moot', undefined, true), T(5));
  const d4 = find(st, 'D4');
  const c = (st.conflicts ?? []).find((x) => x.target === 'D4');
  report('3c-级联冲突', [
    ['已答的 D4 被 moot → 记 conflict 且不被改写', !!c && c.effect === 'moot' && d4?.status === 'confirmed'],
  ]);
}
{
  const st = project(sCycle(), T(0));
  report('3c-级联成环', [
    [`检出级联成环并记 note(实得 ${JSON.stringify((st.notes ?? []).filter((n) => /环/.test(n)))})`,
      (st.notes ?? []).some((n) => /环/.test(n)) || (st.conflicts ?? []).some((c) => /环/.test(c.reason ?? ''))],
  ]);
}

// ── 自检 5:三泳道 + 派生标记 ───────────────────────────────────────────────
{
  const st = project(sMarks(), T(3));
  const t1 = itemOf(st, 'T1'), t2 = itemOf(st, 'T2'), t3 = itemOf(st, 'T3'), t4 = itemOf(st, 'T4'), t5 = itemOf(st, 'T5');
  const k1 = (st.stuck ?? []).find((k) => k.id === 'K1');
  report('5-派生标记', [
    [`discovered(实得 ${JSON.stringify(t1?.flags)})`, has(t1?.flags, 'discovered')],
    ['unverified:已完成但无任何证据', has(t1?.flags, 'unverified')],
    ['claimed-only:只有自述检查', has(t2?.flags, 'claimed-only')],
    [`reopened×n:rounds>1(实得 rounds=${t3?.rounds})`, has(t3?.flags, 'reopened') && t3?.rounds === 2],
    [`blocked:block 级卡点(实得 ${JSON.stringify(t4?.blocked_by)})`, has(t4?.flags, 'blocked') && has(t4?.blocked_by, 'K1')],
    [`blocked:hold 决策阻塞(实得 ${JSON.stringify(t5?.blocked_by)})`, has(t5?.flags, 'blocked') && has(t5?.blocked_by, 'D9')],
    ['已复核项不计入未复核(unverified 只在无证据时出现)', !has(t2?.flags, 'unverified')],
  ]);
}

// ── 自检 6:卡点 K / 决策点 D / 检查 C 的投影 ────────────────────────────────
{
  const st = project(sMarks(), T(3));
  const k1 = (st.stuck ?? []).find((k) => k.id === 'K1');
  report('6-K/D/C投影', [
    ['K:what/tried/needs/severity/item 齐全', k1?.what === 'CI 缺少 STAGING_KEY' && eq(k1?.tried, ['查了 .env.example', '查了 CI 变量']) && k1?.needs === '提供密钥或允许跳过' && k1?.severity === 'block' && k1?.item === 'T4'],
    ['K:未关闭时 resolved_at 为 null', k1?.resolved_at === null],
    ['D:hold 决策 mode=hold / status=pending_hold', find(st, 'D9')?.mode === 'hold' && find(st, 'D9')?.status === 'pending_hold'],
  ]);
  const sa = project(sAttention(), T(4));
  const c1 = itemOf(sa, 'T2')?.evidence?.checks?.[0];
  const c2 = itemOf(sa, 'T3')?.evidence?.checks?.[0];
  report('6-检查C证据条', [
    [`C:CLI 已执行检查 id/src/result/exit/dur_s(实得 ${JSON.stringify(c1)})`,
      c1?.id === 'C1' && c1?.src === 'run' && c1?.result === 'pass' && c1?.exit === 0 && c1?.dur_s === 18],
    ['C:失败检查仍如实记录', c2?.result === 'fail' && c2?.exit === 1],
  ]);
  const sm = project(sMarks(), T(3));
  const cl = itemOf(sm, 'T2')?.evidence?.checks?.[0];
  report('6-自述检查', [
    [`自述检查标 src=claimed(实得 ${cl?.src})`, cl?.src === 'claimed'],
  ]);
}

// ── 自检 7:注意力预算权重与排序口径 ────────────────────────────────────────
{
  const st = project(sAttention(), T(4));
  const q = st.queue ?? {};
  const list = q.review ?? [];
  const byRef = Object.fromEntries(list.map((x) => [x.ref, x]));
  report('7-注意力预算', [
    [`T1 得分 5(改动命中 review_paths +3,无 CLI 已执行检查 +2)(实得 ${byRef.T1?.score})`, byRef.T1?.score === 5],
    ['T1 理由含「改动命中 review_paths」与「没有 CLI 已执行的检查」',
      (byRef.T1?.reasons ?? []).some((r) => r.includes('review_paths')) && (byRef.T1?.reasons ?? []).some((r) => r.includes('没有 CLI 已执行的检查'))],
    [`T2 得分 −1(已执行检查全通过且改动很小)(实得 ${byRef.T2?.score})`, byRef.T2?.score === -1],
    [`T3 得 2(有失败的检查)(实得 ${byRef.T3?.score})`, byRef.T3?.score === 2],
    // T4 同时命中两条:rounds>1(+2)与「检查全通过且零改动」(−1),净 1。
    // 旧值 2 是靠 `lines > 0` 那个守卫把 −1 挡掉才成立的 —— 数变了,但踩中的规则没变。
    [`T4 得 1(rounds>1 +2 与 全通过且零改动 −1 相抵)(实得 ${byRef.T4?.score})`, byRef.T4?.score === 1],
    ['T4 的理由如实记了「轮次 > 1」这条规则',
      (byRef.T4?.reasons ?? []).some((r) => r.includes('轮次 > 1'))],
    [`T5 得 −1(检查全通过且零改动 —— 零改动是「改动很小」的极限,spec §7.6 不要求 lines>0)(实得 ${byRef.T5?.score})`, byRef.T5?.score === -1],
    [`T6 得 2(命中 review_paths +3 与 全通过且改动小 −1 相抵,恰在阈值上)(实得 ${byRef.T6?.score})`, byRef.T6?.score === 2],
    [`T7 得 3(涉及 hold_effects +4 与 全通过且改动小 −1 相抵,超阈值 1 分)(实得 ${byRef.T7?.score})`, byRef.T7?.score === 3],
    // T8 同时踩「有失败的检查」与「rounds > 1」。§7.6 第 6 行是**一条** +2 规则,两条同时成立仍只 +2。
    // 拆成两条各 +2 会得 4、理由 2 条 —— 这正是 T4(只踩 rounds 一条)区分不出的那一格。
    [`T8 得 2(失败检查与 rounds>1 是同一条 +2,不双计)(实得 ${byRef.T8?.score})`, byRef.T8?.score === 2],
    [`T8 的理由恰好 1 条(双计会记成 2 条)(实得 ${(byRef.T8?.reasons ?? []).length})`, (byRef.T8?.reasons ?? []).length === 1],
    [`排序按分数降序(实得 ${list.map((x) => `${x.ref}:${x.score}`).join(' ')})`,
      list.length === 8 && list[0].ref === 'T1' && list[list.length - 1].ref === 'T5'],
    [`top_n 取策略值 5(实得 ${q.top_n})`, q.top_n === 5],
  ]);
}

// ── 自检 8:批次复核 ok low 的阈值口径 ──────────────────────────────────────
{
  const st = project(sAttention(), T(4));
  const q = st.queue ?? {};
  const scoreOf = Object.fromEntries((q.review ?? []).map((x) => [x.ref, x.score]));
  report('8-ok low 阈值', [
    // low_max 是**声明的口径**,这条只钉住口径值本身没有漂移;它拦不住谁由下面两条边界探针负责。
    [`阈值口径 low_max = 2(实得 ${q.low_max})`, q.low_max === 2],
    [`合格集 = 低优先级且机器验证通过 = {T2,T4,T5,T6}(实得 ${JSON.stringify(sorted(q.low_eligible))})`, eq(sorted(q.low_eligible), ['T2', 'T4', 'T5', 'T6'])],
    // 阈值确实是**用来拦人**的,不是个装饰常量:合格集里每一项的分数都不超过它。
    [`合格集里每一项得分都 ≤ ${q.low_max}(逐项 ${q.low_eligible.map((r) => `${r}:${scoreOf[r]}`).join(' ')})`,
      (q.low_eligible ?? []).every((r) => scoreOf[r] <= q.low_max)],
    // 边界两侧各一个机器验证通过的项:T6 恰在阈值上(2)⇒ 在内(证明判据是 ≤ 而非 <);
    // T7 恰超阈值 1 分(3)⇒ 不在内。缺了 T7,把实现里的 `<=` 改成 `<` 都不会转红。
    ['恰好等于阈值(2 分)且机器验证通过 ⇒ 在内(≤ 而非 <)', has(q.low_eligible, 'T6')],
    ['恰好超阈值 1 分(3 分)且机器验证通过 ⇒ 不在内', scoreOf.T7 === 3 && !has(q.low_eligible, 'T7')],
    ['T3(有失败检查)被排除在合格集外', !has(q.low_eligible, 'T3')],
    ['T1(高分)被排除在合格集外', !has(q.low_eligible, 'T1')],
  ]);
}

// ── 自检 4:未知事件类型不崩(append 永不拒收 ⇒ reducer 必须容忍未来事件) ─────
{
  const m = mk();
  m.add('run.start', null, { title: 'future' }, T(0));
  m.add('item.add', 'T1', { title: '1' }, T(0));
  m.add('item.start', 'T1', {}, T(1));
  m.add('item.done', 'T1', { active_seconds: 60 }, T(2));
  m.add('future.metric', 'T1', { x: 1 }, T(3));
  m.add('quantum.entangle', null, { y: 2 }, T(4));
  let st = null, err = null;
  try { st = project(m.list, T(4)); } catch (e) { err = e.message; }
  report('4-未知事件不崩', [
    [`投影不抛异常(实得 ${err ?? 'ok'})`, err === null],
    [`未知事件只记 note(实得 ${JSON.stringify((st?.notes ?? []).filter((n) => /未知/.test(n)))})`,
      (st?.notes ?? []).some((n) => /未知/.test(n))],
    ['已知事件仍正常投影', st?.counts?.done === 1 && itemOf(st, 'T1')?.lane === 'done'],
  ]);
}

// ── 5 `**/` 必须能配到仓根的文件(票 21 复核) ────────────────────────────────
// 旧实现把 `**` 只展开成 `.*`,于是 `**/secrets*` 变成 `^.*/[^/]*secrets[^/]*$`
// ——**要求至少一层目录**,而 `secrets.py` 恰恰是 `**/secrets*` 最该拦下的那一个。
// 控制组是重点:`*`(单星)不许跟着一起变松,`auth/**` 的语义也不许动。
{
  const HITS = [
    ['**/secrets*', 'secrets.py'], ['**/secrets*', 'secrets'],
    ['**/secrets*', 'src/secrets.yml'], ['**/secrets*', 'src/deep/secrets'],
    ['**/secrets*', 'a/b/c/secrets.json'],
    ['auth/**', 'auth/x.py'], ['auth/**', 'auth/deep/x'],
    ['**/*.pem', 'k.pem'], ['**/*.pem', 'a/b/k.pem'],
    ['infra/**', 'infra/main.tf'],
  ];
  const MISSES = [
    ['**/secrets*', 'src/auth/token.py'], ['**/secrets*', 'secret.py'],
    ['*/secrets*', 'secrets.py'],                 // 单星:仍然恰好一层
    ['*/secrets*', 'a/b/secrets.py'],
    ['auth/**', 'x/auth.py'], ['auth/**', 'authx/y.py'],
    ['**/*.pem', 'k.pem.txt'], ['infra/**', 'infra.tf'],
  ];
  const hitMiss = HITS.filter(([g, p]) => !globRe(g).test(p)).map(([g, p]) => `${g} ✗ ${p}`);
  const falseHit = MISSES.filter(([g, p]) => globRe(g).test(p)).map(([g, p]) => `${g} ⊃ ${p}`);
  report('5-glob 语义', [
    [`${HITS.length} 条该命中的全命中(漏 ${hitMiss.length}:${hitMiss.join(' | ')})`, hitMiss.length === 0],
    [`${MISSES.length} 条不该命中的一条都没中(误 ${falseHit.length}:${falseHit.join(' | ')})`, falseHit.length === 0],
    // globRe 是对外导出的:喂非字符串不能抛(丢一次异常的代价见 normalizePolicy 处的说明)。
    // 内部调用点(matchAny)已被 normalizePolicy 保证只吃字符串,故这条守卫是 defense-in-depth
    // —— 但它**必须自身可证伪**,否则就是一段看起来被测过、其实删掉也没人红的死代码(票 26 独立核验)。
    ['非字符串 glob 不抛且一条都不命中(导出面的防御守卫)', (() => {
      try { const re = globRe(null); return !re.test('anything') && !re.test(''); } catch { return false; }
    })()],
  ]);

  // 端到端:用**出厂默认** policy,一个改到仓根 secrets.py 的项必须被抬进复核队列。
  const m2 = mk();
  m2.add('run.start', null, { title: 'glob-e2e' }, T(0));            // 不给 policy → 用默认
  m2.add('item.declare', 'T1', { title: '动了仓根密钥', est_min: 10 }, T(1));
  m2.add('item.done', 'T1', { changes: [{ path: 'secrets.py', add: 3, del: 0 }] }, T(2));
  const st2 = project(m2.list, T(2));
  const it2 = itemOf(st2, 'T1');
  const reason2 = (it2?.priority?.reasons ?? []).find((r) => r.includes('review_paths'));
  report('5b-默认策略拦得住仓根 secrets.py', [
    [`理由里出现 review_paths 命中(实得 ${JSON.stringify(reason2 ?? null)})`, !!reason2],
  ]);
}

// ── 6 ETA 是本地钟串 `HH:MM`,不是 ISO(spec §6.2 示例 `"low":"15:02"`) ────────
// 断言刻意**不**镜像实现的时间格式化:只查形状、只查与 `now` 的**分钟差**,
// 后者由 spec 的公式(中位数 × 剩余项数,×0.75 / ×1.25)独立推出,换时区也成立。
{
  const m = mk();
  m.add('run.start', null, { title: 'eta' }, T(0));
  for (const id of ['T1', 'T2']) {
    m.add('item.add', id, { title: id }, T(0));
    m.add('item.start', id, {}, T(0));
    m.add('item.done', id, { active_seconds: 120 }, T(1));   // 中位数 120s
  }
  for (const id of ['T3', 'T4']) m.add('item.add', id, { title: id }, T(0)); // 剩 2 项
  // est = 120s × 2 = 4 分钟 ⇒ low = now+3min,high = now+5min
  const now = T(5);
  const eta = project(m.list, now).run?.eta ?? {};
  const hm = (s) => { const p = /^(\d{2}):(\d{2})$/.exec(s ?? ''); return p ? Number(p[1]) * 60 + Number(p[2]) : null; };
  const nowHm = (() => { const d = new Date(now); return d.getHours() * 60 + d.getMinutes(); })();
  const gap = (a, b) => (a == null || b == null) ? null : ((a - b) % 1440 + 1440) % 1440;
  report('6-ETA 本地钟', [
    [`low/high 都是 HH:MM 形状(实得 ${JSON.stringify([eta.low, eta.high])})`,
      /^\d{2}:\d{2}$/.test(eta.low ?? '') && /^\d{2}:\d{2}$/.test(eta.high ?? '')],
    ['控制组:不是 ISO 串(旧实现吐的就是 ISO)',
      !/^\d{4}-\d{2}-\d{2}T/.test(eta.low ?? '') && !/^\d{4}-\d{2}-\d{2}T/.test(eta.high ?? '')],
    [`high 与 low 相差 2 分钟(est 4min 的 ×1.25−×0.75,实得 ${gap(hm(eta.high), hm(eta.low))})`,
      gap(hm(eta.high), hm(eta.low)) === 2],
    [`low 落在 now 之后 3 分钟(实得 ${gap(hm(eta.low), nowHm)})`, gap(hm(eta.low), nowHm) === 3],
    [`basis/n 仍如实(实得 ${JSON.stringify([eta.basis, eta.n])})`, eta.basis === '已完成工作项耗时中位数外推' && eta.n === 2],
  ]);
}

// ── 自检 4b:已知事件类型的**畸形 payload** 也不许抛 ──────────────────────────
// 「append 永不拒收」⇒ 日志里可以出现任意形状的 data;而 project 抛一次,该 run 的
// state.js 就**永久**停在旧值(writeState 每次都在 try 里失败,投影再也追不上日志)。
// 所以不变量是「project 对任何输入都不抛」,对**已知**类型同样成立 —— 自检 4 只喂了
// 未知事件类型,对已知类型的坏形状一无所知(票 26 的独立核验实测:改 run.start 的
// data.policy 就能复现永久停旧,`grep -rnF '[null]'` 全仓零命中)。
// 表里每行 = 一个形状,行名就是失败时的证词。**控制组**是同一事件给正常值。
{
  // 引擎预热:打分那条路径读 `changes` 经 `matchAny` 进 `globRe`,ripple 那条路径读每个
  // 决策的选项进 `policy.hold_effects.includes`。**不预热,坏 policy 压根没被读到**,
  // 「不抛」就是假的 —— 本表第一版 17 行全绿,一预热才发现一条都没走到该走的行。
  //
  // 预热用的路径与副作用**刻意取非默认值**(`custom/a.py` / `wipe`):默认 policy 里就有
  // `auth/**` 与 `deploy`,拿它们当「好值」的话,一旦 normalizePolicy 被改成整条丢掉 patch,
  // 默认值照样命中,对照组与 4c 都察觉不到 —— 那条性质就是空心的(票 26 独立核验实测 e1 变异 105 全绿)。
  function warm(m, policy) {
    m.add('run.start', null, policy === undefined ? { title: 't' } : { title: 't', policy }, T(0));
    m.add('item.add', 'T1', { title: 't' }, T(0));
    m.add('item.start', 'T1', {}, T(0));
    m.add('item.done', 'T1', { changes: [{ path: 'custom/a.py', add: 1, del: 0 }] }, T(1));
    m.add('decision.open', 'D1', { title: 't', options: [{ key: 'A', default: true, impact: { declared: { side_effects: ['wipe'] } } }] }, T(0));
  }
  const rows = [
    ['policy.review_paths:[null]', { review_paths: [null] }],
    ['policy.review_paths:[null,"auth/**"] 混数组', { review_paths: [null, 'auth/**'] }],
    ['policy.review_paths 非数组', { review_paths: 'auth/**' }],
    ['policy.hold_effects:null', { hold_effects: null }],
    ['policy.hold_effects:true', { hold_effects: true }],
    ['policy.hold_effects:[null]', { hold_effects: [null] }],
    ['policy.hold_patterns:{a:1}', { hold_patterns: { a: 1 } }],
    // 「policy 整体不是对象」(字符串 / 数组)曾经也在这里各占一行,现已删:normalizePolicy 内部
    // 自带 `isObj(patch)` 兜底,把调用点的 `isObj(d.policy)` 闸门单独拆掉,这两行**照样全绿**
    // ——它们在任何单点变异下都无法失败(票 26 独立核验)。该保证由 normalizePolicy 一处兜住,不重复占行。
    ['policy.max_pending_provisional:"3"', { max_pending_provisional: '3' }],
    ['policy.review_top_n:null', { review_top_n: null }],
    ['policy.big_change_lines:-1', { big_change_lines: -1 }],
  ];
  const thrown = [];
  for (const [name, pol] of rows) {
    const mm = mk();
    try { warm(mm, pol); project(mm.list, T(4)); } catch (e) { thrown.push(`${name} → ${e.message}`); }
  }
  // 非 policy 类的坏形状:同一条预热过的引擎上再追加畸形事件。
  const shapeRows = [
    ['decision.open options:[null]', (m) => m.add('decision.open', 'D2', { title: 't', options: [null] }, T(0))],
    ['decision.open options 非数组', (m) => m.add('decision.open', 'D2', { title: 't', options: 'A' }, T(0))],
    ['option impact 是字符串', (m) => m.add('decision.open', 'D2', { title: 't', options: [{ key: 'A', default: true, impact: 'x' }] }, T(0))],
    ['option declared.cascade:[null]', (m) => m.add('decision.open', 'D2', { title: 't', options: [{ key: 'A', default: true, impact: { declared: { cascade: [null] } } }] }, T(0))],
    ['item.start assumes:[null]', (m) => m.add('item.start', 'T2', { assumes: [null] }, T(0))],
    ['item.start assumes 项缺字段', (m) => m.add('item.start', 'T2', { assumes: [{ decision: null, option: null }] }, T(0))],
    ['item.done changes:[null]', (m) => m.add('item.done', 'T2', { changes: [null] }, T(1))],
    ['item.done changes 非数组', (m) => m.add('item.done', 'T2', { changes: { path: 'a' } }, T(1))],
    ['item.add deps:[null]', (m) => m.add('item.add', 'T3', { title: 't', deps: [null] }, T(0))],
    ['item.add deps 非数组', (m) => m.add('item.add', 'T3', { title: 't', deps: 'T9' }, T(0))],
  ];
  for (const [name, extra] of shapeRows) {
    const mm = mk();
    try { warm(mm, undefined); extra(mm); project(mm.list, T(4)); } catch (e) { thrown.push(`${name} → ${e.message}`); }
  }
  report('4b-已知事件畸形 payload 不抛', [
    [`${rows.length + shapeRows.length} 种坏形状全都不抛(抛了 ${thrown.length}:${thrown.join(' | ')})`, thrown.length === 0],
    // 控制组:预热过的引擎给**正常** policy 必须正常投影 —— 否则「不抛」可能只是引擎空转。
    ['控制组:预热过的引擎正常投影(坏形状表不是空转)', (() => {
      const mm = mk();
      warm(mm, { review_paths: ['custom/**'], hold_effects: ['wipe'] });
      const st = project(mm.list, T(4));
      const r = (itemOf(st, 'T1')?.priority?.reasons ?? []).find((x) => x.includes('review_paths'));
      return !!r && optOf(find(st, 'D1'), 'A')?.hold_effects_hit?.length === 1;
    })()],
  ]);

  // 坏形状要**被收干净**,不是原样透传:透了 null 进 id 列表,下游匹配与页面渲染都会拿到幽灵。
  const m3 = mk();
  warm(m3, { review_paths: [null, 'custom/**'], hold_effects: [null, 'wipe'] });
  m3.add('item.add', 'T9', { title: 't' }, T(0));
  m3.add('item.add', 'T2', { title: 't', deps: [null, 'T9'] }, T(0));
  m3.add('item.start', 'T2', { assumes: [null, { decision: 'D1', option: 'A', confirmed: true }] }, T(0));
  m3.add('decision.open', 'D3', { title: 't', options: [{ key: 'A', default: true, impact: { declared: { redo: [null, 'T9'] } } }] }, T(0));
  m3.add('item.done', 'T2', { changes: [null, { path: 'x.py', add: 1, del: 0 }] }, T(1));
  // 投影包进 try/catch 折成一条具名断言:裸的 project 一旦抛,进程直接崩,输出里连 FAIL 行都没有
  // (退出码仍是 1,不是假绿),但 4c 之后追加的代码会被静默跳过(票 26 独立核验)。
  let st3 = null, projErr = '';
  try { st3 = project(m3.list, T(2)); } catch (e) { projErr = e.message; }
  const it2 = st3 ? itemOf(st3, 'T2') : null;
  const r3 = st3 ? (optOf(find(st3, 'D3'), 'A')?.impact?.ripple ?? {}) : {};
  // 下面两条也必须在 st3 为 null(投影抛了)时安全:否则抛出被 try 接住、断言表达式却仍去点 null.items。
  const t1r = st3 ? (itemOf(st3, 'T1')?.priority?.reasons ?? []) : [];
  const wipeHit = st3 ? optOf(find(st3, 'D1'), 'A')?.hold_effects_hit : null;
  const noJunk = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
  report('4c-坏形状被收干净', [
    [`投影不抛(实得 ${projErr || 'ok'})`, projErr === ''],
    [`deps 里的 null 被剔掉、真值留着(实得 ${JSON.stringify(it2?.deps)})`, noJunk(it2?.deps) && it2.deps.includes('T9')],
    [`assumes 里没有 null(实得 ${JSON.stringify(it2?.assumes)})`, (it2?.assumes ?? []).length > 0 && (it2.assumes ?? []).every((a) => a && typeof a.decision === 'string')],
    [`evidence.changes 里没有 null(实得 ${JSON.stringify(it2?.evidence?.changes)})`, (it2?.evidence?.changes ?? []).length > 0 && (it2.evidence.changes ?? []).every((c) => c && typeof c.path === 'string')],
    [`ripple.redo 里没有 null、真值留着(实得 ${JSON.stringify(r3.items?.redo)})`, noJunk(r3.items?.redo) && r3.items.redo.includes('T9')],
    // 混数组里的好 glob 与好效果**必须仍然生效** —— 不能靠「整条 policy 丢掉」来免抛。
    // 好值取的是 patch 独有的 `custom/**` / `wipe`(不是默认里就有的 `auth/**` / `deploy`),
    // 否则整条丢掉 patch 也照样命中,这条断言就是空心的(票 26 独立核验 e1 变异实测)。
    [`混数组里的 'custom/**' 仍生效(实得 ${JSON.stringify(t1r.filter((x) => x.includes('review_paths')))})`,
      t1r.some((x) => x.includes('review_paths:custom/a.py'))],
    [`混数组里的 'wipe' 仍生效(实得 ${JSON.stringify(wipeHit)})`, eq(wipeHit, ['wipe'])],
  ]);
}

// ── 自检 G2b:返工预算臂(spec §8.6 第二条臂;口径见票 27,实现见票 28) ──────────────
// 分母 = run.active_seconds + est(全程预期);分子 = 挂起 provisional 的累计 redo_est_min(缺失取 sunk_min)。
// est 需 ≥2 个 done(否则 est_min=null,第二臂不评估 —— 诚实降级)。数都对着注入 now 现算:
//   两个 done 各 120s → 中位 120s;未完成项 1 个(T3 todo)→ est = 120s×1 = 2 分钟。
//   now=T(4) → active_seconds=240s=4 分钟。分母 = 4+2 = 6;ratio 0.25 → 预算 = 1.5 分钟。
{
  // D1 开在 T1/T2 开工**之后**:那时它还没开,derivesAssumes 不会给 T1/T2 合成假设,seed 为空,
  // 分子就纯由声明的 redo_est_min 决定(与「缺失取 sunk_min」那条分开测)。
  const sBudget = (restMin, policyExtra) => {
    const m = mk();
    m.add('run.start', null, { title: 'budget', ...(policyExtra ? { policy: policyExtra } : {}) }, T(0));
    m.add('item.add', 'T1', { title: '1' }, T(0));
    m.add('item.start', 'T1', {}, T(0));
    m.add('item.done', 'T1', { active_seconds: 120 }, T(2));
    m.add('item.add', 'T2', { title: '2' }, T(0));
    m.add('item.start', 'T2', {}, T(0));
    m.add('item.done', 'T2', { active_seconds: 120 }, T(2));
    m.add('item.add', 'T3', { title: '3(todo,凑未完成项数)' }, T(0));
    m.add('decision.open', 'D1', { title: 'd', mode: 'provisional',
      options: [opt('A', 'a', true), opt('B', 'b', false, { redo_est_min: restMin })] }, T(0));
    return m.list;
  };
  const fire = project(sBudget(2), T(4));                                  // 返工 2 > 预算 1.5 → 翻 hold
  const noFire = project(sBudget(1), T(4));                                // 返工 1 < 1.5 → 不翻
  const halfRatio = project(sBudget(2, { rework_budget_ratio: 0.5 }), T(4)); // 预算 3,2 < 3 → 不翻
  const boundary = project(sBudget(1.5), T(4));                            // 返工恰等于预算 1.5 → 严格 > 不翻
  const dropEst = project(sBudget(1.2), T(4));                             // 1.2<含est预算1.5 不翻;分母漏 est 则预算塌到 1.0 会翻
  const dFire = find(fire, 'D1'), dNo = find(noFire, 'D1'), dHalf = find(halfRatio, 'D1');
  report('G2b-返工预算臂', [
    [`est 存进 state:est_min=2(实得 ${fire.run?.est_min})`, fire.run?.est_min === 2],
    [`超预算 → D1 翻 pending_hold(实得 ${dFire?.status})`, dFire?.status === 'pending_hold'],
    [`超预算 → mode 也升为 hold(实得 ${dFire?.mode})`, dFire?.mode === 'hold'],
    ['超预算 → gate.g2=true', dFire?.gate?.g2 === true],
    [`超预算 → gate.g2_reason='rework_budget'(实得 ${dFire?.gate?.g2_reason})`, dFire?.gate?.g2_reason === 'rework_budget'],
    [`预算内 → D1 仍 pending_default(实得 ${dNo?.status})`, dNo?.status === 'pending_default' && dNo?.gate?.g2 === false],
    // ratio 从 policy 读、不是常量:同样返工 2,ratio 0.5 下预算翻倍到 3,就不该翻。
    [`ratio 可覆写:0.5 下同样返工不翻(实得 ${dHalf?.status})`, dHalf?.status === 'pending_default'],
    // 边界:判据是**严格** > —— 返工恰等于预算时不翻(钉住 `>` 而非 `>=`)。
    [`返工恰等于预算(1.5)→ 严格不翻(实得 ${find(boundary, 'D1')?.status})`, find(boundary, 'D1')?.status === 'pending_default'],
    // 分母含 est 项:1.2 落在「含 est 预算 1.5」内;若分母漏掉估剩余(预算塌到 1.0),这条会误翻。
    [`返工 1.2 落在含-est 预算内 → 不翻(实得 ${find(dropEst, 'D1')?.status})`, find(dropEst, 'D1')?.status === 'pending_default'],
  ]);

  // 分子是**累计**跨决策:单条都在预算内(0.8 < 1.5),两条加起来(1.6)才越界 → 只翻越界那一刻的 D2。
  // 若把 `reworkAcc += rw` 写成 `=`,两条各自 0.8 永不越界,D2 就不翻(这条断言据此变红)。
  const mAcc = mk();
  mAcc.add('run.start', null, { title: 'accum' }, T(0));
  mAcc.add('item.add', 'T1', { title: '1' }, T(0));
  mAcc.add('item.start', 'T1', {}, T(0));
  mAcc.add('item.done', 'T1', { active_seconds: 120 }, T(2));
  mAcc.add('item.add', 'T2', { title: '2' }, T(0));
  mAcc.add('item.start', 'T2', {}, T(0));
  mAcc.add('item.done', 'T2', { active_seconds: 120 }, T(2));
  mAcc.add('item.add', 'T3', { title: '3(todo,凑未完成项数)' }, T(0));
  mAcc.add('decision.open', 'D1', { title: 'd1', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo_est_min: 0.8 })] }, T(0));
  mAcc.add('decision.open', 'D2', { title: 'd2', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo_est_min: 0.8 })] }, T(0));
  const stAcc = project(mAcc.list, T(4));                                  // 与上面同形:预算 1.5
  const d1a = find(stAcc, 'D1'), d2a = find(stAcc, 'D2');
  report('G2b-累计跨决策', [
    [`单条 0.8 < 预算 1.5 → D1 不翻(实得 ${d1a?.status})`, d1a?.status === 'pending_default'],
    [`累计 1.6 > 预算 1.5 → D2 翻(实得 ${d2a?.status})`, d2a?.status === 'pending_hold' && d2a?.gate?.g2_reason === 'rework_budget'],
  ]);

  // 缺失兜底:非默认无 redo_est_min → 取 sunk_min;且 declared.redo 里的 todo 项 sunk 记 0。
  // T2 开在 D1 开点**之前**(不被 derivesAssumes 波及,只当中位数来源);T1 显式 assumes D1=A → B 的 seed={T1}。
  const m2 = mk();
  m2.add('run.start', null, { title: 'sunk' }, T(0));
  m2.add('item.add', 'T2', { title: '2(中位数来源,不假设 D1)' }, T(0));
  m2.add('item.start', 'T2', {}, T(0));
  m2.add('item.done', 'T2', { active_seconds: 600 }, T(2));
  m2.add('decision.open', 'D1', { title: 'd', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo: ['T4'], redo_est_min: null })] }, T(0)); // B 显式未估算 → 取 sunk_min
  m2.add('item.add', 'T1', { title: '1(seed)' }, T(0));
  m2.add('item.start', 'T1', { assumes: [{ decision: 'D1', option: 'A', confirmed: false }] }, T(0));
  m2.add('item.done', 'T1', { active_seconds: 600 }, T(3));
  m2.add('item.add', 'T3', { title: '3(todo)' }, T(0));
  m2.add('item.add', 'T4', { title: '4(todo,被声明 redo 但无耗时)' }, T(0));
  const stSunk = project(m2.list, T(5));
  const dSunk = find(stSunk, 'D1');
  const rBsunk = optOf(dSunk, 'B')?.impact?.ripple ?? {};
  report('G2b-缺失取sunk且todo记0', [
    [`B 无 redo_est_min → null(实得 ${rBsunk.redo_est_min})`, rBsunk.redo_est_min === null],
    [`B 的 sunk_min=10(seed=T1 的 600s;todo T4 记 0)(实得 ${rBsunk.sunk_min})`, rBsunk.sunk_min === 10],
    [`声明的 todo T4 在 redo 里但不贡献 sunk(实得 redo=${JSON.stringify(rBsunk.items?.redo)})`, has(rBsunk.items?.redo, 'T4')],
    // 分子取 sunk_min=10,分母 5+20=25、预算 6.25 → 触发。
    [`累计用 sunk_min 也能触发预算臂(实得 ${dSunk?.status}/${dSunk?.gate?.g2_reason})`,
      dSunk?.status === 'pending_hold' && dSunk?.gate?.g2_reason === 'rework_budget'],
  ]);

  // est 不足(<2 done)→ est_min=null → 第二臂不评估,再大的返工也不翻(诚实降级)。
  const m3 = mk();
  m3.add('run.start', null, { title: 'noest' }, T(0));
  m3.add('item.add', 'T1', { title: '1' }, T(0));
  m3.add('item.start', 'T1', {}, T(0));
  m3.add('item.done', 'T1', { active_seconds: 600 }, T(2)); // 只 1 个 done
  m3.add('item.add', 'T3', { title: '3(todo)' }, T(0));
  m3.add('decision.open', 'D1', { title: 'd', mode: 'provisional',
    options: [opt('A', 'a', true), opt('B', 'b', false, { redo_est_min: 999 })] }, T(0));
  const dNoEst = find(project(m3.list, T(4)), 'D1');
  const stNoEst = project(m3.list, T(4));
  report('G2b-est不足则不评估', [
    [`<2 个 done → est_min=null(实得 ${stNoEst.run?.est_min})`, stNoEst.run?.est_min === null],
    [`est 估不出 → 返工 999 也不翻(实得 ${dNoEst?.status})`, dNoEst?.status === 'pending_default' && dNoEst?.gate?.g2 === false],
  ]);

  // 空 run 不抛、est_min=null、不产生 NaN。
  const m4 = mk();
  m4.add('run.start', null, { title: 'empty' }, T(0));
  let stEmpty = null, err4 = '';
  try { stEmpty = project(m4.list, T(1)); } catch (e) { err4 = e.message; }
  report('G2b-空run不抛', [
    [`空 run 投影不抛(实得 ${err4 || 'ok'})`, err4 === ''],
    [`est_min=null(实得 ${stEmpty?.run?.est_min})`, stEmpty?.run?.est_min === null],
  ]);

  // 第一臂(计数)阈值:此前零断言。复核实测「阈值 −1 / 写死 3」都不变色,故在此钉死。
  // 无 done → estMs=null → 第二臂不评估,纯第一臂在起作用(挂起数 > max_pending_provisional)。
  const sCount = (n, policyExtra) => {
    const m = mk();
    m.add('run.start', null, { title: 'count', ...(policyExtra ? { policy: policyExtra } : {}) }, T(0));
    for (let i = 1; i <= n; i++) {
      m.add('decision.open', `D${i}`, { title: `d${i}`, mode: 'provisional',
        options: [opt('A', 'a', true), opt('B', 'b', false)] }, T(0)); // 非默认无 redo → 第二臂分子恒 0
    }
    return m.list;
  };
  const stC3 = project(sCount(3), T(1));                                   // 恰 3 = 阈值 → 全不翻
  const stC4 = project(sCount(4), T(1));                                   // 第 4 个(>3)→ 翻
  const stC1 = project(sCount(2, { max_pending_provisional: 1 }), T(1));   // 覆写为 1 → 第 2 个就翻
  report('G2b-第一臂计数阈值', [
    [`恰 3 个挂起(=阈值)→ D1..D3 全不翻(实得 ${['D1', 'D2', 'D3'].map((id) => find(stC3, id)?.status).join('/')})`,
      ['D1', 'D2', 'D3'].every((id) => find(stC3, id)?.status === 'pending_default')],
    [`第 4 个挂起(>阈值)→ D4 翻 pending_hold(实得 ${find(stC4, 'D4')?.status})`,
      find(stC4, 'D4')?.status === 'pending_hold' && find(stC4, 'D4')?.gate?.g2 === true],
    // 第一臂的 reason 不点名预算 —— 与第二臂区分开(reason 只有第二臂才写)。
    [`第一臂的 gate 不带 rework_budget 字样(实得 ${find(stC4, 'D4')?.gate?.g2_reason})`,
      find(stC4, 'D4')?.gate?.g2_reason !== 'rework_budget'],
    [`policy 覆写为 1 → 第 2 个就翻、第 1 个不翻(读 policy,非写死 3)`,
      find(stC1, 'D2')?.status === 'pending_hold' && find(stC1, 'D1')?.status === 'pending_default'],
  ]);

  // est 的口径:取已完成项耗时的**中位数**(非最小值),并向分钟**取整**。
  // 三个 done [60,90,600] → 中位 90(min 会得 60);× 1 个未完成 = 1.5min → 取整 2。
  const mEst = mk();
  mEst.add('run.start', null, { title: 'est' }, T(0));
  mEst.add('item.add', 'T1', { title: '1' }, T(0));
  mEst.add('item.start', 'T1', {}, T(0));
  mEst.add('item.done', 'T1', { active_seconds: 60 }, T(1));
  mEst.add('item.add', 'T2', { title: '2' }, T(0));
  mEst.add('item.start', 'T2', {}, T(0));
  mEst.add('item.done', 'T2', { active_seconds: 90 }, T(2));
  mEst.add('item.add', 'T3', { title: '3' }, T(0));
  mEst.add('item.start', 'T3', {}, T(0));
  mEst.add('item.done', 'T3', { active_seconds: 600 }, T(3));
  mEst.add('item.add', 'T4', { title: '4(todo,1 个未完成)' }, T(0));
  const stEst = project(mEst.list, T(5));
  report('G2b-est中位数与取整', [
    [`中位 90s(非最小 60s)× 1 = 1.5min → 取整 2(实得 ${stEst.run?.est_min})`, stEst.run?.est_min === 2],
  ]);
}
// ── 自检 9:项目级策略(票 33)—— 三级优先级 内置 < .taskboard/policy.json < run.start.policy ──
// 五条 done 项分别改五条路径,各自都**没有** CLI 已执行检查 ⇒ 恒有「+2」;路径命中 +3、
// 行数 > big_change_lines +1 随 policy 变。所有期望分数都是手算的内置权重(3/3/3/4/2/2/1),
// 不是镜像实现 —— 权重被任何一级覆写都会让下面的等式塌掉。
{
  const sPolicy = (runPolicy) => {
    const m = mk();
    m.add('run.start', null, runPolicy ? { title: 'pol', policy: runPolicy } : { title: 'pol' }, T(0));
    const add = (id, path, add, del) => {
      m.add('item.add', id, { title: id }, T(0));
      m.add('item.start', id, {}, T(0));
      m.add('item.done', id, { active_seconds: 60, changes: [{ path, add, del }] }, T(1));
    };
    add('T1', 'custom/a.py', 1, 0);
    add('T2', 'plain/z.py', 400, 200);   // 共 600 行
    add('T3', 'auth/x.py', 1, 0);        // 内置 review_paths 命中
    add('T4', 'proj/a.py', 1, 0);
    add('T5', 'run/a.py', 1, 0);
    return m.list;
  };
  const EV = sPolicy();
  const NOW = T(5);
  const scoreOf = (st, ref) => (st.queue.review.find((r) => r.ref === ref) || {}).score;
  const reasonsOf = (st, ref) => (st.queue.review.find((r) => r.ref === ref) || {}).reasons || [];
  const scores = (st) => Object.fromEntries(st.queue.review.map((r) => [r.ref, r.score]));

  const builtin = project(EV, NOW);                                        // 项目级缺席 ⇒ 内置
  const projRP = project(EV, NOW, { review_paths: ['custom/**'] });        // 项目级 review_paths
  const projBig = project(EV, NOW, { big_change_lines: 1000 });            // 项目级 big_change_lines
  const projT4 = project(EV, NOW, { review_paths: ['proj/**'] });          // 项目级只认 proj/**
  const both = project(sPolicy({ review_paths: ['run/**'] }), NOW, { review_paths: ['proj/**'] });

  report('9-项目级策略:三级优先级', [
    [`内置(项目级缺席):custom/a.py 不命中 ⇒ T1=2;auth/x.py 命中 ⇒ T3=5;600 行 > 200 ⇒ T2=3(实得 ${JSON.stringify([scoreOf(builtin, 'T1'), scoreOf(builtin, 'T3'), scoreOf(builtin, 'T2')])})`,
      scoreOf(builtin, 'T1') === 2 && scoreOf(builtin, 'T3') === 5 && scoreOf(builtin, 'T2') === 3],
    [`项目级 review_paths 生效 ⇒ T1=5 且理由含命中路径(实得 ${scoreOf(projRP, 'T1')} / ${JSON.stringify(reasonsOf(projRP, 'T1').filter((r) => r.includes('review_paths')))})`,
      scoreOf(projRP, 'T1') === 5 && reasonsOf(projRP, 'T1').some((r) => r.includes('review_paths:custom/a.py'))],
    [`项目级是**覆写**非叠加:换成 custom/** 后内置 auth/** 不再命中 ⇒ T3 由 5 掉回 2(实得 ${scoreOf(projRP, 'T3')})`,
      scoreOf(projRP, 'T3') === 2 && !reasonsOf(projRP, 'T3').some((r) => r.includes('review_paths'))],
    [`项目级 big_change_lines 生效:600 行 ≤ 1000 ⇒ T2 由 3 掉回 2(实得 ${scoreOf(projBig, 'T2')})`,
      scoreOf(projBig, 'T2') === 2 && !reasonsOf(projBig, 'T2').some((r) => r.includes('改动行数'))],
    [`控制组:项目级只动 review_paths 时,big_change_lines 仍内置 ⇒ T2=3(实得 ${scoreOf(projRP, 'T2')})`,
      scoreOf(projRP, 'T2') === 3],
    [`单项目级:proj/a.py 命中 ⇒ T4=5,run/a.py 不命中 ⇒ T5=2(实得 ${JSON.stringify([scoreOf(projT4, 'T4'), scoreOf(projT4, 'T5')])})`,
      scoreOf(projT4, 'T4') === 5 && scoreOf(projT4, 'T5') === 2],
    [`run.start.policy 覆写项目级:换成 run/** ⇒ T5=5 且 T4 掉回 2(实得 ${JSON.stringify([scoreOf(both, 'T5'), scoreOf(both, 'T4')])})`,
      scoreOf(both, 'T5') === 5 && scoreOf(both, 'T4') === 2],
    [`两级同时在场:run.start 的 review_paths 是**最终**那一份,内置 auth/** 也不复活(实得 ${JSON.stringify(scores(both))})`,
      scoreOf(both, 'T3') === 2 && scoreOf(both, 'T2') === 3 && scoreOf(both, 'T1') === 2],
  ]);

  // ── 反向断言:权重不可被任何一级覆写(票 31 Q4:3/3/3/4/2/2/1 内置不暴露)──────────
  // 权重键塞进项目级文件与 run.start.policy,分数必须**逐值等于内置**;而同一 patch 里合法的
  // 项目级键仍照常生效。若哪一级把权重接成了可覆写,下面的等式立刻塌(见报告里的变异实录)。
  const WEIGHT_PROBE = {
    review_paths_weight: 99, hold_effects_weight: 99, stale_weight: 99,
    weights: { review_paths: 99, unconfirmed: 99, stale: 99, hold_effects: 99 },
    score_weights: [9, 9, 9, 9, 9, 9, 9],
  };
  const wProj = project(EV, NOW, { ...WEIGHT_PROBE });
  const wRun = project(sPolicy({ ...WEIGHT_PROBE }), NOW);
  const wMixed = project(sPolicy({ review_paths: ['custom/**'], ...WEIGHT_PROBE }), NOW);
  const eqScores = (a, b) => eq(scores(a), scores(b));
  report('9-反向断言:评分权重不可覆写', [
    [`项目级带权重键 ⇒ 分数逐值等于内置(实得 ${JSON.stringify(scores(wProj))})`, eqScores(wProj, builtin)],
    [`run.start.policy 带权重键 ⇒ 分数逐值等于内置(实得 ${JSON.stringify(scores(wRun))})`, eqScores(wRun, builtin)],
    [`同批合法键仍生效:review_paths:custom/** 与权重键混放 ⇒ T1=5(实得 ${scoreOf(wMixed, 'T1')})`,
      scoreOf(wMixed, 'T1') === 5],
    [`权重未被 99 污染:T1 仍是 5 而非 99 系(实得 ${scoreOf(wMixed, 'T1')})`, scoreOf(wMixed, 'T1') < 99 && scoreOf(builtin, 'T3') === 5],
  ]);

  // ── 项目级文件只读**项目级键**:hold_effects 之类的非项目级键读不进来 ────────────
  {
    const mkKeys = (runPolicy) => {
      const m = mk();
      m.add('run.start', null, runPolicy ? { title: 'k', policy: runPolicy } : { title: 'k' }, T(0));
      m.add('decision.open', 'D1', { title: 'd', options: [{ key: 'A', default: true, impact: { declared: { side_effects: ['wipe'] } } }] }, T(0));
      m.add('item.add', 'T1', { title: 'x' }, T(0));
      m.add('item.start', 'T1', { assumes: [{ decision: 'D1', option: 'A', confirmed: true }] }, T(0));
      m.add('item.done', 'T1', { active_seconds: 60, changes: [{ path: 'custom/a.py', add: 1, del: 0 }] }, T(1));
      return m.list;
    };
    const KEYS = mkKeys();
    const st = project(KEYS, NOW, { hold_effects: ['wipe'], review_paths: ['custom/**'], review_top_n: 9 });
    const t1 = itemOf(st, 'T1');
    report('9-项目级只读项目级键', [
      [`项目级 hold_effects 读不进来(不投 'wipe')⇒ 无 +4(实得 ${JSON.stringify(t1?.priority?.reasons ?? [])})`,
        !(t1?.priority?.reasons ?? []).some((r) => r.includes('hold_effects'))],
      [`同批项目级 review_paths 照常生效(+3)(实得 ${(t1?.priority?.reasons ?? []).filter((r) => r.includes('review_paths')).join(' | ')})`,
        (t1?.priority?.reasons ?? []).some((r) => r.includes('review_paths:custom/a.py'))],
      [`项目级 review_top_n 读不进来 ⇒ queue.top_n 仍内置 5(实得 ${st.queue.top_n})`, st.queue.top_n === 5],
    ]);
  }

  // ── 坏形状:非对象 / 坏元素一律不抛,且与 run.start 同一套语义(单代码路径) ──────
  {
    const thrown = [];
    for (const [name, pp] of [['字符串', 'x'], ['数字', 42], ['null', null], ['数组', [1, 2]], ['坏元素', { review_paths: [null] }], ['非数组', { review_paths: 'auth/**' }], ['负行数', { big_change_lines: -1 }]]) {
      try { project(EV, NOW, pp); } catch (e) { thrown.push(`${name} → ${e.message}`); }
    }
    const projBad = project(EV, NOW, { review_paths: [null] });
    const runBad = project(sPolicy({ review_paths: [null] }), NOW);
    report('9-项目级坏形状不抛且与 run.start 同语义', [
      [`7 种坏形状全不抛(抛了 ${thrown.length}:${thrown.join(' | ')})`, thrown.length === 0],
      [`非对象项目级 = 内置(实得 ${JSON.stringify(scores(project(EV, NOW, 42)))})`, eqScores(project(EV, NOW, 42), builtin)],
      [`review_paths:[null] 与 run.start 同语义(normalizePolicy 一处兜)(实得 ${JSON.stringify(scores(projBad))} vs ${JSON.stringify(scores(runBad))})`,
        eq(scores(projBad), scores(runBad)) && !reasonsOf(projBad, 'T3').some((r) => r.includes('review_paths'))],
    ]);
  }

  // ── 确定性:注入同一份项目级策略,两跑逐字节相同([13] 不破) ────────────────────
  {
    const pp = { review_paths: ['custom/**'], big_change_lines: 1000 };
    const a = serializeState(project(EV, NOW, pp));
    const b = serializeState(project(EV, NOW, pp));
    report('9-项目级策略确定性', [
      ['同一 (events, now, projectPolicy) 两跑逐字节相同', a === b],
      ['项目级在场与缺席都是确定投影(各自两跑相同)',
        serializeState(project(EV, NOW)) === serializeState(project(EV, NOW)) && a !== serializeState(project(EV, NOW))],
    ]);
  }

  // ── tl.mjs 只读器 readProjectPolicy:缺席 / 空 / 非法 / 非对象 → {};只挑项目级键 ──
  {
    const R = join(WORK, 'policy-root');
    const TB = join(R, '.taskboard');
    const PP = join(TB, 'policy.json');
    mkdirSync(TB, { recursive: true });
    const rows = [
      ['缺席 → {}', null, {}],
      ['空文件 → {}', '', {}],
      ['纯空白 → {}', '   \n ', {}],
      ['非法 JSON → {}', '{ not json', {}],
      ['非对象(数组)→ {}', '[1,2]', {}],
      ['非对象(数字)→ {}', '42', {}],
      ['只挑项目级键(丢 hold_effects/weights)', JSON.stringify({ review_paths: ['p/**'], big_change_lines: 50, hold_effects: ['wipe'], weights: { x: 9 } }),
        { review_paths: ['p/**'], big_change_lines: 50 }],
      ['坏元素原样交给 normalizePolicy(此处只挑键)', JSON.stringify({ review_paths: [null] }), { review_paths: [null] }],
    ];
    const got = [];
    for (const [name, content, want] of rows) {
      if (content === null) rmSync(PP, { force: true }); else writeFileSync(PP, content);
      const r = readProjectPolicy(R);
      if (!eq(r, want)) got.push(`${name} → ${JSON.stringify(r)}`);
    }
    report('9-tl readProjectPolicy', [
      [`${rows.length} 种项目级文件状态读数全部符合预期(不符 ${got.length}:${got.join(' | ')})`, got.length === 0],
      ['返回值是纯数据对象(不含函数/undefined,可 JSON 往返)', eq(readProjectPolicy(R), JSON.parse(JSON.stringify(readProjectPolicy(R))))],
    ]);
    rmSync(R, { recursive: true, force: true });
  }
}

// 条数现数现报:写死的数字在夹具增删后会变成谎话(票 21 复核发现这里写 12、实跑远不止)。
console.log(bad === 0 ? `全部自检通过(${total} 条)` : `${bad}/${total} 项未过`);
rmSync(WORK, { recursive: true, force: true });
process.exit(bad === 0 ? 0 : 1);
