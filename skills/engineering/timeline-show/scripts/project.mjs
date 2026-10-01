// timeline-show / project.mjs —— 投影与 reducer(票 21)
//
// project(events, now) → state 是**纯函数**([13]):now 显式注入,state 里烘焙一个 generated_at。
// 这是全趟**唯一**需要处理 now 的地方(页面连 now 都不要)。同一 events + 同一 now 两跑逐字节相同。
//
// 数据契约照 spec §6 原样实现,三处与本趟决策的差异:
//   · hb   —— 出局。§15 整表经实证作废,心跳无数据源,「语义更新停在 X 分前」改由
//             run.updated_at(最后一个事件的时刻)在客户端派生,不再烘焙心跳字段。
//   · bg   —— 出局。后台 timeline-builder 已在 [05] 砍掉,bg.* 事件只进 trail,不建状态字段。
//   · layers.l2 —— 出局(见 [05],L2 版面层不做)。
//
// 重放按**行序**为真相(票 20 的 H2):canonical seq = 物理行序,存储 seq 只是便利字段。
// append 永不拒收 ⇒ reducer 必须容忍未来事件:不认识的事件类型只记 note,绝不抛。

export const SCHEMA = 3;

// 「ok low」批量复核的优先级阈值口径(本票定死):分数 ≤ 此值且机器验证通过 ⇒ 可批量复核。
export const LOW_PRIORITY_MAX = 2;

// 硬性策略(spec §6.4)。可由 run.start 的 data.policy 覆写——这样 project 仍是 (events, now) 的纯函数。
export const DEFAULT_POLICY = {
  hold_effects: ['delete', 'deploy', 'publish', 'message', 'spend', 'prod-write'],
  hold_patterns: ['git push', 'git reset --hard', 'rm -rf', 'DROP TABLE', 'terraform apply', 'kubectl apply', 'npm publish'],
  review_paths: ['auth/**', 'migrations/**', '**/secrets*', 'infra/**'],
  max_pending_provisional: 3,
  rework_budget_ratio: 0.25,
  review_top_n: 5,
  big_change_lines: 200,
};

// 项目级策略文件(`.taskboard/policy.json`,票 33)只承载**项目知识**——「哪些路径敏感」「多大算大改」。
// 用户手写、`tl` 只读(不新增写路径,不破 [06] 写盘边界)。三级优先级:
//   DEFAULT_POLICY < .taskboard/policy.json < run.start.data.policy
// 项目级**只认这两个键**;`run.start.policy` 仍可覆写全部策略键(见 references/events.md)。
export const PROJECT_POLICY_KEYS = Object.freeze(['review_paths', 'big_change_lines']);
// 从任意来源(项目级文件)挑出项目级键;非对象(缺席/坏形状)→ 空 patch,退回内置默认。
// 评分权重(spec §7.6 的 3/3/3/4/2/2/1)是**通用口径、内置不暴露**(票 31 Q4),不在此列,
// 任何一级 policy 都覆写不到(见 priorityOf)。

// trail 收「精简语义事件」:决策、复核、分支、卡点、交付、证据、工作项边界(spec §6.2)。
const SEMANTIC = /^(run\.|decision\.|review\.|stuck\.|artifact|reply\.|branch\.|check\.|item\.(add|edit|start|progress|done|fail|drop|reopen|supersede))/;
const MAX_TRAIL = 500;   // spec §6.2:trail 上限 500
const MAX_ACTIVITY = 50; // spec §6.2:activity 只保留最近 50 条

// glob → 正则:先转义,再把 ** 与 * 展开(spec §6.4 的 review_paths)。
//
// `**/` 展开成 `(?:.*/)?` —— **零层或多层**目录。旧实现把 `**` 一律写成 `.*`,
// 于是 `**/secrets*` 成了 `^.*/[^/]*secrets[^/]*$`,**硬性要求至少一层目录**:
// 仓根的 `secrets.py` 恰恰是这条 glob 最该拦下的那个文件,却漏了(票 21 复核实测)。
// 单星 `*` 不受影响,仍恰好一层。
export function globRe(glob) {
  // 非字符串一律给「一条都不匹配」的正则,而不是抛:`review_paths` 来自日志里的 policy,
  // 而 project 抛一次就会让该 run 的 state.js 永久停在旧值(见 normalizePolicy 处的说明)。
  if (typeof glob !== 'string') return /(?!)/;
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i++; }
      } else re += '[^/]*';
    }
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const matchAny = (path, globs) => (globs ?? []).some((g) => globRe(g).test(path));

// 毫秒时刻 → 本地钟串 `HH:MM`(spec §6.2 的 eta 形状)。
// 注意确定性边界:输出随**本机时区**变 —— 这是 spec 要的「本地钟」,不是实现疏忽。
// 同一台机器 + 同一个注入的 now ⇒ 逐字节相同(自检 1 的逐字节确定性仍成立)。
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// 编号自然序:T2 < T10(按前缀与数字),用于数组的确定性排序。
const idKey = (id) => {
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(id));
  return m ? [m[1], Number(m[2])] : [String(id), 0];
};
export const sortIds = (ids) => [...new Set(ids)].sort((a, b) => {
  const ka = idKey(a), kb = idKey(b);
  return ka[0] < kb[0] ? -1 : ka[0] > kb[0] ? 1 : ka[1] - kb[1];
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const asArr = (v) => (Array.isArray(v) ? v : []);
const asStrArr = (v) => asArr(v).filter((s) => typeof s === 'string');

// policy 是**外部输入**(来自 run.start 的 data.policy,也就是日志里的一行),任意形状都可能出现。
// 形状不对就退回默认,而不是原样收下 —— 「append 永不拒收」意味着坏形状一定会到得了这里,而
// project 抛一次,该 run 的 state.js 就**永久**停在旧值(writeState 每次都在 try 里失败,投影
// 再也追不上日志)。具体会炸的点:`review_paths:[null]` → globRe 读 `null.length`;`review_paths`
// 是字符串 → matchAny 调字符串的 `.some`;`hold_effects:null` → `.includes` 不是函数(票 26 独立核验实测)。
// 顺带把数组**拷一份**:`{ ...DEFAULT_POLICY }` 只复制引用,别处一旦 in-place 改 policy 就会
// 改到模块常量上。
function normalizePolicy(patch) {
  const out = {};
  for (const [k, dv] of Object.entries(DEFAULT_POLICY)) {
    const v = isObj(patch) ? patch[k] : undefined;
    if (Array.isArray(dv)) out[k] = Array.isArray(v) ? asStrArr(v) : [...dv];
    else if (typeof dv === 'number') out[k] = Number.isFinite(v) ? v : dv;
    else out[k] = v === undefined ? dv : v;
  }
  return out;
}
// 项目级 patch(票 33):只挑 PROJECT_POLICY_KEYS。非对象(缺席/空/坏形状)与键不在列者一律丢,
// 于是权重类键、`hold_effects` 之类的非项目级键从项目文件里**读不进来**。值本身的形状仍由
// normalizePolicy 兜(与 run.start 同一套),坏形状退回该项默认而不是原样收下。
export function projectPolicyPatch(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const k of PROJECT_POLICY_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  return out;
}
const normOrigin = (o) => (typeof o === 'string' ? { type: o, ref: null, summary: null }
  : isObj(o) ? { type: o.type ?? 'initial', ref: o.ref ?? null, summary: o.summary ?? null }
    : { type: 'initial', ref: null, summary: null });

// 工作项起点(spec §6.3)。rounds 初值 1;reopened×n 判据是 rounds>1。
export function newItem(id) {
  return {
    id, title: '', lane: 'todo', outcome: null,
    origin: { type: 'initial', ref: null, summary: null },
    deps: [], owner: null, note: '', progress: 0,
    started_at: null, ended_at: null, active_seconds: 0, rounds: 1,
    assumes: [], flags: [], blocked_by: [],
    evidence: { changes: [], attribution: null, checks: [], artifacts: [], checkpoint: null },
    review: { state: 'unreviewed', by: null, at: null, note: '', batch: false },
    priority: { score: 0, reasons: [] },
    history: [],
  };
}

// 决策点起点(spec §8.2)。
export function newDecision(id, data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    id, opened_at: null,
    title: d.title ?? '', question: d.question ?? '', why_now: d.why_now ?? '',
    mode: d.mode ?? 'provisional', status: (d.mode === 'hold' ? 'pending_hold' : 'pending_default'),
    gate: { g1: !!d.gate?.g1, g2: false, g3: false, policy_hit: d.gate?.policy_hit ?? null },
    pack: d.pack ?? null, affects: asStrArr(d.affects), anchors: asArr(d.anchors), assumed_by: [],
    options: asArr(d.options).filter((o) => o && typeof o === 'object').map((o) => ({
      key: o.key, label: o.label ?? '', default: !!o.default, reversible: o.reversible !== false,
      impact: { declared: isObj(o.impact) && o.impact.declared != null ? o.impact.declared : null },
      hold_effects_hit: [],
    })),
    lock_at: d.lock_at ?? null, checkpoint: d.checkpoint ?? null,
    answer: { key: null, by: null, via: null, at: null }, resolved_at: null,
    cascades: [], effective: null,
  };
}

// 「下游」= 经 deps 传递依赖该集合的项(deps 指前置;反查得依赖者)。
export function downstreamOf(seedIds, items) {
  const dependents = new Map();
  for (const it of items) for (const dep of asArr(it.deps)) {
    if (!dependents.has(dep)) dependents.set(dep, []);
    dependents.get(dep).push(it.id);
  }
  const seen = new Set(); const out = []; const stack = [...seedIds];
  while (stack.length) {
    for (const nx of dependents.get(stack.pop()) ?? []) {
      if (seen.has(nx)) continue;
      seen.add(nx); out.push(nx); stack.push(nx);
    }
  }
  return out;
}

// 一项的活跃耗时:done 取已记录值;doing 取「now − 开工」;todo 为 0(spec §8.4 规则 4)。
export function activeSecondsOf(it, nowMs) {
  if (it.lane === 'done') return Number.isFinite(it.active_seconds) ? it.active_seconds : 0;
  if (it.lane === 'doing' && it.started_at) return Math.max(0, Math.round((nowMs - Date.parse(it.started_at)) / 1000));
  return 0;
}

// 选项 X 的 ripple(spec §8.4 六条规则)。declared 来自主会话,computed 由本函数算。
export function rippleOf(dec, opt, itemArr, nowMs) {
  const declared = (opt.impact && opt.impact.declared) || {};
  // id 列表一律**只留字符串**:坏形状原样透传的话,`null` 会一路进 ripple.items.redo 与页面的
  // id 列表里变成幽灵(票 26 独立核验实测:`declared.redo:[null]` 会把 null 透传出去)。
  const dRedo = asStrArr(declared.redo), dEnable = asStrArr(declared.enable), dDisable = asStrArr(declared.disable);
  const dSide = asStrArr(declared.side_effects), dCascade = asArr(declared.cascade).filter((c) => c && typeof c === 'object');
  const dRest = Number.isFinite(declared.redo_est_min) ? declared.redo_est_min : null;
  const defKey = (dec.options.find((o) => o.default) || {}).key ?? null;
  // 规则 1 的 seed:已基于默认推进(doing/done)且该默认仍未确认的项 —— 仅当 X ≠ 默认。
  const seed = (defKey != null && opt.key !== defKey)
    ? itemArr.filter((it) => (it.lane === 'doing' || it.lane === 'done')
      && it.assumes.some((a) => a.decision === dec.id && a.option === defKey && !a.confirmed)).map((it) => it.id)
    : [];
  const byId = new Map(itemArr.map((i) => [i.id, i]));
  // 规则 1:redo = declared.redo ∪ seed ∪ seed 经 deps 的、处于 doing/done 的传递下游。
  const seedDown = downstreamOf(seed, itemArr);
  const redoSet = new Set([...dRedo, ...seed]);
  for (const id of seedDown) { const it = byId.get(id); if (it && (it.lane === 'doing' || it.lane === 'done')) redoSet.add(id); }
  const redo = sortIds([...redoSet]);
  // 规则 2:上述集合(声明 ∪ seed)在 todo 泳道的传递下游(不需重做,但会被牵动)。
  const allDown = downstreamOf([...seed, ...dRedo], itemArr);
  const affected = sortIds(allDown.filter((id) => byId.get(id)?.lane === 'todo' && !redoSet.has(id)));
  const sunk = redo.reduce((s, id) => s + Math.round(activeSecondsOf(byId.get(id) ?? {}, nowMs) / 60), 0); // 规则 4
  const hasComputed = seed.length > 0;
  const hasDeclared = dRedo.length > 0 || dEnable.length > 0 || dDisable.length > 0 || dSide.length > 0
    || dCascade.length > 0 || dRest != null || declared.none === true;
  const confidence = hasComputed && hasDeclared ? 'mixed' : hasComputed ? 'computed' : hasDeclared ? 'declared' : 'unknown';
  return {
    items: { redo, affected_todo: affected, enable: [...dEnable], disable: [...dDisable] },
    decisions: dCascade.map((c) => ({ id: c.decision, effect: c.effect, ...(c.value != null ? { value: c.value } : {}) })),
    sunk_min: sunk, redo_est_min: dRest, confidence,
  };
}

// ── 投影 ────────────────────────────────────────────────────────────────────
// projectPolicy 是**注入的项目级默认**(票 33,由 tl.mjs 从 `.taskboard/policy.json` 只读读出后传进来)。
// 留在参数里而不是让 project 自己去读盘,是为了守住 [13]:project 仍是 (events, now, projectPolicy)
// 的纯函数,不碰文件系统;同一份入参两跑逐字节相同。不给(夹具/旧调用点)即 `{}` ⇒ 行为与改动前一致。
export function project(events, now, projectPolicy = {}) {
  const evs = asArr(events); // 容忍非数组入参(API 误用不应炸掉整趟投影)
  const nowMs = Date.parse(now);
  const notes = [];
  const conflicts = [];
  const unknown = new Map();
  const items = new Map();
  const decisions = new Map();
  const stucks = new Map();
  const run = { id: null, title: '', goal: '', type: '', status: 'running',
    started_at: null, updated_at: null, active_seconds: 0 };
  let theme = null, accent = null, density = null;
  // 三级优先级的第一跳:内置默认 < 项目级(此处)。第二跳 run.start.data.policy 在重放里覆写。
  let policy = normalizePolicy(projectPolicyPatch(projectPolicy));
  let pauseStartMs = null, pausedMs = 0;
  let last = null, pos = 0, checkSeq = 0;
  const trail = [], activity = [];

  const defKeyOf = (d) => ((d.options.find((o) => o.default) || {}).key) ?? null;
  const setDefault = (d, key) => { for (const o of d.options) o.default = (o.key === key); };
  const mostReversible = (opts) => opts.find((o) => o.reversible !== false) ?? opts[0] ?? null;
  const ensureItem = (id) => { if (!items.has(id)) items.set(id, newItem(id)); return items.get(id); };
  // 只有 T<n> 是自动分配的工作项编号。
  // **声明**工作项的事件(item.*)可以物化一个新项;只是**引用**工作项的事件(check / artifact)
  // 不许凭空造项:旧实现一律走 ensureItem,于是 `tl check` 不传 --ref 时自动分配出的 C1
  // 被物化成一张空 title 的卡,board 上凭空多出一个 C1、counts.todo 从 1 变 2(票 22 复核实测)。
  // 规则:已存在的编号一律放行(哪怕不是 T 开头,如手写的 MY-TASK);只有「不存在的非 T<n>」才拦。
  const ITEM_REF = /^T\d+$/;
  const maybeItem = (ref) => {
    if (typeof ref !== 'string') return null;
    if (items.has(ref)) return items.get(ref);
    return ITEM_REF.test(ref) ? ensureItem(ref) : null;
  };
  // 启动项时冻结「仍未确认的 provisional 决策及其默认选项」——spec §6.3 说不靠模型声明。
  const derivesAssumes = () => {
    const out = [];
    for (const d of decisions.values()) {
      if (d.status !== 'pending_default') continue;
      const k = defKeyOf(d);
      if (k) out.push({ decision: d.id, option: k, confirmed: false });
    }
    return out;
  };
  // 级联应用(spec §8.5):只在选项被选定/默认接管时应用,且**永不替目标决策作答**。
  function recordCascade(fromId, casc, at) {
    for (const c of asArr(casc)) {
      if (!c || typeof c !== 'object') continue; // 容忍未来事件里的畸形级联项,不抛
      const t = decisions.get(c.decision);
      if (!t) { notes.push(`级联引用不存在的决策 ${c.decision}(来自 ${fromId})`); continue; }
      const pending = t.status === 'pending_default' || t.status === 'pending_hold';
      if (c.effect === 'moot') {
        // resolved_at 取「触发级联的那条事件的时刻」,不取投影 now —— 否则换 now 会改结构(自检 2)。
        if (pending) { t.status = 'moot'; t.resolved_at = at ?? null; }
        else conflicts.push({ from: fromId, target: t.id, effect: 'moot', reason: `${t.id} 已答,无法失效` });
      } else if (c.effect === 'default') {
        if (pending && t.mode !== 'hold') setDefault(t, c.value);
        else conflicts.push({ from: fromId, target: t.id, effect: 'default', reason: `${t.id} ${t.mode === 'hold' ? '为 hold' : '已答'},默认未被改写` });
      } else if (c.effect === 'remove_option') {
        const i = t.options.findIndex((o) => o.key === c.value);
        if (i < 0) { notes.push(`级联排除选项 ${t.id}/${c.value},该选项不存在`); }
        else {
          const wasDefault = t.options[i].default;
          if (!pending && t.answer?.key === c.value) conflicts.push({ from: fromId, target: t.id, effect: 'remove_option', reason: `${t.id} 已答且答案正是 ${c.value}` });
          t.options.splice(i, 1);
          if (wasDefault) { const best = mostReversible(t.options); if (best) setDefault(t, best.key); }
        }
      } else if (c.effect === 'hold') {
        t.mode = 'hold';
        if (pending) t.status = 'pending_hold';
      } else {
        notes.push(`未知级联效果 ${c.effect}(来自 ${fromId})`);
      }
      t.cascades.push({ from: fromId, effect: c.effect, ...(c.value != null ? { value: c.value } : {}) });
    }
  }

  // 归属:按**时间区间相交**判定,而不是「完成瞬间是否有人正好在 doing」(工单 35 / 发现 6)。
  // 旧判据漏掉历史重叠:已完工的并行项 lane 已是 'done',会被 `o.lane === 'doing'` 滤掉,
  // 于是真正被包含的项反被判 exact、后完成者反被判 approx —— 判反。
  // 故这里只看时间戳,不看 lane。调用点(:345)已先把 it.ended_at = t。
  // self 区间 [self.started_at, t); 无 started_at 时无法定义区间,维持不判 approx。
  const parallelDuring = (self, t) => {
    if (!self.started_at) return false;
    const sStart = Date.parse(self.started_at);
    const tEnd = Date.parse(t);
    if (!Number.isFinite(sStart) || !Number.isFinite(tEnd)) return false;
    return [...items.values()].some((o) => {
      if (o.id === self.id || !o.started_at) return false;
      const oStart = Date.parse(o.started_at);
      if (!Number.isFinite(oStart)) return false;
      const oEnd = o.ended_at ? Date.parse(o.ended_at) : Infinity;
      return oStart < tEnd && oEnd > sStart;
    });
  };

  // ── 重放(行序即真相) ──────────────────────────────────────────────────────
  for (const e of evs) {
    pos++;
    if (!e || typeof e.type !== 'string') continue;
    if (e._bad) { notes.push(`第 ${pos} 行无法解析,已占位跳过:${e.data?.reason ?? 'parse error'}`); continue; }
    if (Number.isInteger(e.seq) && e.seq !== pos) notes.push(`第 ${pos} 行存储 seq=${e.seq} 与文件行序不符,以行序为准`);
    if (last?.t && e.t && Date.parse(e.t) < Date.parse(last.t)) notes.push(`时钟回拨:第 ${pos} 行 t=${e.t} 早于上一行`);
    last = e;
    const t = e.t ?? null;
    const d = isObj(e.data) ? e.data : {};
    const ref = e.ref ?? null;

    if (e.type === 'run.start') {
      run.id = e.run ?? run.id;
      if (!run.started_at && t) run.started_at = t;
      if (d.title != null && (d.title !== '' || !run.title)) run.title = String(d.title);
      if (d.goal != null && (d.goal !== '' || !run.goal)) run.goal = String(d.goal);
      if (d.type != null && (d.type !== '' || !run.type)) run.type = String(d.type);
      if (d.theme != null && theme == null) theme = d.theme;
      if (d.accent != null && accent == null) accent = d.accent;
      if (d.density != null && density == null) density = d.density;
      if (isObj(d.policy)) policy = normalizePolicy({ ...policy, ...d.policy });
    } else if (e.type === 'run.pause') {
      if (run.status !== 'done') {
        run.status = 'paused';
        if (t) pauseStartMs = Date.parse(t);
      }
    } else if (e.type === 'run.resume') {
      if (run.status !== 'done') {
        run.status = 'running';
        if (pauseStartMs != null && t) { pausedMs += Math.max(0, Date.parse(t) - pauseStartMs); pauseStartMs = null; }
      }
    } else if (e.type === 'run.end') {
      // 工单 35 / 发现 2:非字符串 status(如 {"status":1})不许原样投影进 run.status,
      // 否则页面侧 .toLowerCase()/.toUpperCase() 抛 TypeError、渲染从此中断。
      // 事件本身仍保留在 events[];这里只在投影层识别非法值并明确告警。
      const raw = d.status;
      if (raw == null) { run.status = 'done'; }
      else if (typeof raw === 'string' && raw !== '') { run.status = raw; }
      else {
        run.status = 'done';
        notes.push(`第 ${pos} 行 run.end 的 status 非法(${JSON.stringify(raw)}),已按 'done' 投影(事件仍保留在 events)`);
      }
      run.ended_at = t;
      if (pauseStartMs != null && t) { pausedMs += Math.max(0, Date.parse(t) - pauseStartMs); pauseStartMs = null; }
    } else if (e.type.startsWith('item.')) {
      if (!ref) { notes.push(`第 ${pos} 行 item 事件缺 ref,已跳过`); }
      else {
        const it = ensureItem(ref);
        const act = e.type.slice(5);
        if (act === 'add') {
          if (d.title != null) it.title = String(d.title);
          if (d.deps != null) it.deps = asStrArr(d.deps);
          if (d.origin != null) it.origin = normOrigin(d.origin);
          if (d.owner != null) it.owner = String(d.owner);
        } else if (act === 'edit') {
          if (d.title != null) it.title = String(d.title);
          if (d.note != null) it.note = String(d.note);
          if (d.owner != null) it.owner = String(d.owner);
          if (d.deps != null) it.deps = asStrArr(d.deps);
        } else if (act === 'start') {
          it.lane = 'doing'; it.started_at = t;
          if (Number.isFinite(d.progress)) it.progress = d.progress;
          if (d.owner != null) it.owner = String(d.owner);
          // assumes 要两条都是字符串才算数:`{decision:null}` 永远匹配不上任何决策,纯幽灵。
          const declaredAssumes = asArr(d.assumes)
            .filter((a) => a && typeof a === 'object' && typeof a.decision === 'string' && typeof a.option === 'string');
          it.assumes = declaredAssumes.length ? declaredAssumes.map((a) => ({ decision: a.decision, option: a.option, confirmed: !!a.confirmed })) : derivesAssumes();
          if (d.checkpoint != null) it.evidence.checkpoint = String(d.checkpoint);
        } else if (act === 'progress') {
          if (Number.isFinite(d.progress)) it.progress = d.progress;
          if (d.note != null) it.note = String(d.note);
          if (it.lane === 'todo') it.lane = 'doing';
        } else if (act === 'done') {
          it.lane = 'done'; it.progress = 1; it.ended_at = t;
          it.outcome = d.outcome ?? 'completed';
          it.active_seconds = Number.isFinite(d.active_seconds) ? d.active_seconds
            : (it.started_at ? Math.max(0, Math.round((Date.parse(t) - Date.parse(it.started_at)) / 1000)) : 0);
          if (d.changes != null) it.evidence.changes = asArr(d.changes).filter((c) => c && typeof c === 'object');
          it.evidence.attribution = d.attribution ?? (parallelDuring(it, t) ? 'approx' : 'exact');
          if (d.summary != null) it.note = String(d.summary);
          it.review = { state: 'unreviewed', by: null, at: null, note: '', batch: false };
        } else if (act === 'drop') { it.lane = 'done'; it.outcome = 'dropped'; it.ended_at = t; }
        else if (act === 'supersede') { it.lane = 'done'; it.outcome = 'superseded'; it.ended_at = t; }
        else if (act === 'fail') { it.lane = 'todo'; it.ended_at = t; if (!it.flags.includes('failed')) it.flags.push('failed'); if (d.why != null) it.note = String(d.why); }
        else if (act === 'reopen') {
          it.lane = 'todo'; it.rounds += 1; it.ended_at = null; it.progress = 0;
          it.review = { state: 'unreviewed', by: null, at: null, note: '', batch: false };
          if (d.why != null) it.note = String(d.why);
        } else { notes.push(`未知的 item 动作 ${act}(第 ${pos} 行)`); }
      }
    }
    else if (e.type === 'decision.open') {
      const dec = ref ? newDecision(ref, d) : null;
      if (!dec) notes.push(`第 ${pos} 行 decision.open 缺 ref,已跳过`);
      else { dec.opened_at = t; dec.resolved_at = null; decisions.set(ref, dec); }
    } else if (e.type === 'decision.pack') {
      for (const spec of asArr(d.decisions)) if (spec?.id) { const dec = newDecision(spec.id, spec); dec.opened_at = t; dec.pack = ref ?? spec.pack ?? null; decisions.set(spec.id, dec); }
    } else if (e.type === 'decision.impact') {
      const dec = decisions.get(ref); const o = dec?.options.find((x) => x.key === d.option);
      if (o) o.impact.declared = d.declared ?? null;
      else notes.push(`第 ${pos} 行 decision.impact 目标 ${ref}/${d.option} 不存在`);
    } else if (e.type === 'decision.answer') {
      const dec = decisions.get(ref);
      if (!dec) notes.push(`第 ${pos} 行 decision.answer 目标 ${ref} 不存在`);
      else {
        const key = d.key ?? d.option ?? null;
        const o = dec.options.find((x) => x.key === key);
        dec.answer = { key, by: d.by ?? 'you', via: d.via ?? 'chat', at: t };
        dec.resolved_at = t;
        dec.status = dec.mode === 'hold' ? 'answered'
          : (key != null && key === defKeyOf(dec) ? 'confirmed' : 'overridden');
        if (o) recordCascade(dec.id, o.impact.declared?.cascade, t);
      }
    } else if (e.type === 'decision.override') {
      const dec = decisions.get(ref);
      if (dec) { dec.status = 'overridden'; dec.resolved_at = t; if (d.key != null) dec.answer.key = d.key; }
    } else if (e.type === 'decision.expire') {
      const dec = decisions.get(ref);
      if (dec && (dec.status === 'pending_default' || dec.status === 'pending_hold')) { dec.status = 'expired_locked'; dec.resolved_at = t; }
    } else if (e.type === 'decision.hold') {
      const dec = decisions.get(ref);
      if (dec) { dec.mode = 'hold'; if (dec.status === 'pending_default') dec.status = 'pending_hold'; }
    } else if (e.type === 'decision.moot') {
      const dec = decisions.get(ref); if (dec) { dec.status = 'moot'; dec.resolved_at = t; }
    } else if (e.type === 'decision.cascade') {
      recordCascade(ref, d.cascade ?? [d], t);
    } else if (e.type === 'check.run' || e.type === 'check.claim') {
      const it = maybeItem(ref);
      if (!it) notes.push(`第 ${pos} 行 ${e.type} 的 ref ${JSON.stringify(ref ?? null)} 不是已存在的项、也不是 T<n>,已跳过(不会凭空建项)`);
      else {
        const id = d.id ?? `C${++checkSeq}`;
        it.evidence.checks.push({ id, name: d.name ?? '', src: e.type === 'check.run' ? 'run' : 'claimed',
          result: d.result ?? null, exit: Number.isFinite(d.exit) ? d.exit : null, dur_s: Number.isFinite(d.dur_s) ? d.dur_s : null, at: t });
      }
    } else if (e.type === 'artifact') {
      const it = maybeItem(ref);
      if (it) it.evidence.artifacts.push({ title: d.title ?? '', path: d.path ?? null, summary: d.summary ?? '' });
      else notes.push(`第 ${pos} 行 artifact 的 ref ${JSON.stringify(ref ?? null)} 不是已存在的项、也不是 T<n>,已跳过(不会凭空建项)`);
    } else if (e.type === 'review.ok' || e.type === 'review.flag' || e.type === 'review.redo') {
      const it = ref ? items.get(ref) : null;
      if (!it) notes.push(`第 ${pos} 行 review 事件目标 ${ref} 不存在`);
      else {
        const verb = e.type.slice(7);
        if (verb === 'redo') {
          it.history.push({ at: t, evidence: it.evidence, outcome: it.outcome });
          it.evidence = { changes: [], attribution: null, checks: [], artifacts: [], checkpoint: it.evidence.checkpoint };
          it.lane = 'todo'; it.rounds += 1; it.ended_at = null; it.progress = 0;
          it.origin = { type: 'review', ref: null, summary: d.note ?? null };
          it.review = { state: 'unreviewed', by: d.by ?? 'you', at: t, note: d.note ?? '', batch: false };
        } else {
          it.review = { state: verb, by: d.by ?? 'you', at: t, note: d.note ?? '', batch: !!(d.batch || d.low) };
        }
      }
    } else if (e.type === 'stuck.open') {
      if (ref) stucks.set(ref, { id: ref, since: t, severity: d.severity ?? 'warn', what: d.what ?? '',
        tried: asArr(d.tried), needs: d.needs ?? '', item: d.item ?? null, resolved_at: null });
    } else if (e.type === 'stuck.close') {
      const k = stucks.get(ref); if (k) { k.resolved_at = t; if (d.note != null) k.note = String(d.note); }
    } else if (e.type === 'reply.apply' || e.type === 'note' || e.type === 'choice' || e.type.startsWith('branch.') || e.type.startsWith('bg.')) {
      /* 语义备注 / 分支 / 后台(已出局):进 trail 与 activity,不建状态字段 */
    } else {
      unknown.set(e.type, (unknown.get(e.type) ?? 0) + 1);
    }

    if (SEMANTIC.test(e.type)) trail.push({ seq: pos, t, type: e.type, ref });
    activity.push({ seq: pos, t, type: e.type, ref, actor: e.actor ?? null });
  }

  // ── 归约后的派生 ────────────────────────────────────────────────────────────
  for (const [type, n] of [...unknown.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    notes.push(`未知事件类型「${type}」×${n},已跳过`);
  }
  const itemArr = [...items.values()];
  const decArr = [...decisions.values()];
  const byId = new Map(itemArr.map((i) => [i.id, i]));

  // 锁定点与三道闸(spec §8.6)。G1 在 open 时已按 mode 体现;G2 落计数臂;G3 在 lock_at 到达时判。
  for (const d of decArr) {
    if (d.status !== 'pending_default' || !d.lock_at) continue;
    const reached = d.lock_at.type === 'item' ? byId.get(d.lock_at.ref)?.lane === 'done'
      : d.lock_at.type === 'time' && Number.isFinite(Date.parse(d.lock_at.at ?? '')) && nowMs >= Date.parse(d.lock_at.at);
    if (!reached) continue;
    // resolved_at 取锁定点的确定时刻(item 用其 ended_at,time 用 lock_at.at),不取投影 now。
    const at = d.lock_at.type === 'item' ? (byId.get(d.lock_at.ref)?.ended_at ?? null) : d.lock_at.at ?? null;
    if (d.options.some((o) => asArr(o.impact.declared?.side_effects).some((s) => policy.hold_effects.includes(s)))) {
      d.mode = 'hold'; d.status = 'pending_hold'; d.gate.g3 = true;
    } else {
      d.status = 'expired_locked'; d.resolved_at = at;
      // spec §8.5:级联在选项「被选定或被默认接管」时应用 —— 到点未答即默认接管,其 cascade 同样要跑。
      recordCascade(d.id, d.options.find((o) => o.default)?.impact.declared?.cascade, at);
    }
  }
  // G2 闸(两条臂)移到 ripple 与 run 耗时算完之后 —— 第二臂要用 sunk_min/redo_est_min 与预计总时长。
  // assumes 的确认状态:决策已按该选项作答,或被默认接管(spec §6.3 / §8.4)。
  for (const it of itemArr) for (const a of it.assumes) {
    const d = decisions.get(a.decision); if (!d) continue;
    a.confirmed = (d.answer?.key != null && d.answer.key === a.option) || (d.status === 'expired_locked' && defKeyOf(d) === a.option);
  }
  // ripple:每个选项一份,由 reducer 计算并随状态更新(页面只展示)。
  for (const d of decArr) {
    d.assumed_by = sortIds(itemArr.filter((it) => it.assumes.some((a) => a.decision === d.id)).map((it) => it.id));
    for (const o of d.options) {
      o.impact.ripple = rippleOf(d, o, itemArr, nowMs);
      o.hold_effects_hit = asArr(o.impact.declared?.side_effects).filter((s) => policy.hold_effects.includes(s));
    }
    const ans = d.answer?.key != null ? d.options.find((o) => o.key === d.answer.key) : null;
    d.effective = ans ? { option: ans.key, ripple: ans.impact.ripple } : null;
  }
  // 改选后的 DONE 项 outcome=superseded(spec §8.7 第 2 步)。
  for (const d of decArr) {
    if (d.status !== 'overridden' || !d.effective) continue;
    for (const id of d.effective.ripple.items.redo) { const it = byId.get(id); if (it && it.lane === 'done') it.outcome = 'superseded'; }
  }

  // ── run 的耗时/预估:先算,G2 第二臂(返工预算)的分母要用(spec §8.6 / 票 27) ──────────
  const doneItems = itemArr.filter((i) => i.lane === 'done');
  const startedMs = run.started_at ? Date.parse(run.started_at)
    : (itemArr[0]?.started_at ? Date.parse(itemArr[0].started_at) : (last?.t ? Date.parse(last.t) : nowMs));
  const endMs = run.ended_at ? Date.parse(run.ended_at) : (pauseStartMs != null ? pauseStartMs : nowMs);
  run.active_seconds = Math.max(0, Math.round((endMs - startedMs - pausedMs) / 1000));
  run.updated_at = last?.t ?? null;
  const durs = doneItems.filter((i) => Number.isFinite(i.active_seconds) && i.active_seconds > 0).map((i) => i.active_seconds);
  // est(全程剩余的粗估,ms):不足 2 个 done 时为 null —— 预计总时长估不出,G2 第二臂据此**不评估**(诚实降级)。
  let estMs = null;
  if (durs.length >= 2) {
    const s = [...durs].sort((a, b) => a - b);
    estMs = s[Math.floor(s.length / 2)] * 1000 * itemArr.filter((i) => i.lane !== 'done').length;
  }
  run.est_min = estMs == null ? null : Math.round(estMs / 60000);

  // ── G2:同时挂起的 provisional 超阈,或累计返工估计超预算 → 把顶出的那个 provisional 降级 hold ──
  // spec §8.6 两条臂;按 decArr 顺序扫,第一臂数挂起数,第二臂累计「若默认错了」的返工。页面沉默,只改状态 + reason。
  // 分母 = 已耗 + 预计剩余(票 27 选 (b));est 为 null 时第二臂不评估。分子/分母都取分钟。
  const budgetMin = estMs == null ? null : (run.active_seconds / 60 + estMs / 60000) * policy.rework_budget_ratio;
  let pendingSeen = 0, reworkAcc = 0;
  for (const d of decArr) {
    if (d.status !== 'pending_default') continue;
    pendingSeen++;
    // 该决策「若默认错了」的返工:非默认选项里最大的 redo_est_min(为 null=未估算时取 sunk_min;todo 项 sunk 本就是 0)。
    const rw = d.options.filter((o) => !o.default).reduce((mx, o) => {
      const r = (o.impact && o.impact.ripple) || {};
      const v = r.redo_est_min != null ? r.redo_est_min : r.sunk_min;
      return Math.max(mx, Number.isFinite(v) ? v : 0);
    }, 0);
    reworkAcc += rw;
    const overCount = pendingSeen > policy.max_pending_provisional;
    const overBudget = budgetMin != null && reworkAcc > budgetMin;
    if (d.mode !== 'hold' && (overCount || overBudget)) {
      d.mode = 'hold'; d.status = 'pending_hold'; d.gate.g2 = true;
      if (overBudget) d.gate.g2_reason = 'rework_budget';
    }
  }

  // ── 派生标记(spec §7.3) ────────────────────────────────────────────────────
  const holdDecs = decArr.filter((d) => d.status === 'pending_hold');
  const blockStuck = [...stucks.values()].filter((s) => s.severity === 'block' && !s.resolved_at);
  const DERIVED = new Set(['stale', 'blocked', 'unverified', 'claimed-only', 'discovered', 'reopened']);
  for (const it of itemArr) {
    it.flags = it.flags.filter((f) => !DERIVED.has(f));
    let stale = false;
    for (const a of it.assumes) {
      const d = decisions.get(a.decision); if (!d) continue;
      // 所基于的默认「被改选」:既含被作答成别的选项,也含被级联 default 改掉的默认(spec §7.3)。
      const answeredAgainst = (d.status === 'confirmed' || d.status === 'overridden')
        && d.answer?.key != null && d.answer.key !== a.option;
      const defaultReplaced = (d.status === 'pending_default' || d.status === 'pending_hold')
        && defKeyOf(d) != null && defKeyOf(d) !== a.option;
      if (answeredAgainst || defaultReplaced) { stale = true; break; }
    }
    if (!stale) {
      const up = new Set(); const stack = [...asArr(it.deps)];
      while (stack.length) { const id = stack.pop(); if (up.has(id)) continue; up.add(id); stack.push(...asArr(byId.get(id)?.deps)); }
      if ([...up].some((id) => byId.get(id)?.outcome === 'superseded' || (byId.get(id)?.rounds ?? 1) > 1)) stale = true;
    }
    if (stale) it.flags.push('stale');
    it.blocked_by = [];
    for (const d of holdDecs) if (asArr(d.affects).includes(it.id) || it.assumes.some((a) => a.decision === d.id)) it.blocked_by.push(d.id);
    for (const s of blockStuck) if (s.item === it.id) it.blocked_by.push(s.id);
    if (it.blocked_by.length) it.flags.push('blocked');
    if (it.origin.type === 'discovered') it.flags.push('discovered');
    if (it.rounds > 1) it.flags.push('reopened');
    if (it.lane === 'done') {
      const ev = it.evidence;
      const hasAny = ev.changes.length > 0 || ev.checks.length > 0 || ev.artifacts.length > 0;
      if (!hasAny) it.flags.push('unverified');
      else if (ev.checks.length > 0 && !ev.checks.some((c) => c.src === 'run')) it.flags.push('claimed-only');
    }
    it.flags = [...new Set(it.flags)];
  }

  // ── 注意力预算(spec §7.6):确定性打分 + 理由,页面只顶出前 N ─────────────────
  // 权重 3/3/3/4/2/2/1 **写死在此**,是通用口径、内置不暴露(票 31 Q4,保跨项目可比)。
  // 它们不在 DEFAULT_POLICY 里 ⇒ normalizePolicy 读不到、projectPolicyPatch 也挑不进来;
  // 任何一级 policy 带权重类键都被忽略(反向断言见 run-projection-fixtures)。
  function priorityOf(it) {
    let score = 0; const reasons = []; const ev = it.evidence;
    const hitPaths = asArr(ev.changes).map((c) => c?.path).filter((p) => p && matchAny(p, policy.review_paths));
    if (hitPaths.length) { score += 3; reasons.push(`改动命中 review_paths:${hitPaths.join(',')}`); }
    const unconfirmed = it.assumes.filter((a) => !a.confirmed);
    if (unconfirmed.length) { score += 3; reasons.push(`基于未确认的 provisional 默认:${unconfirmed.map((a) => `${a.decision}=${a.option}`).join(',')}`); }
    if (it.flags.includes('stale')) { score += 3; reasons.push('带 stale 标记'); }
    const holds = [];
    for (const a of it.assumes) { const d = decisions.get(a.decision); const o = d?.options.find((x) => x.key === a.option); holds.push(...asArr(o?.hold_effects_hit)); }
    if (holds.length) { score += 4; reasons.push(`涉及 hold_effects:${[...new Set(holds)].join(',')}`); }
    const runChecks = asArr(ev.checks).filter((c) => c?.src === 'run');
    if (runChecks.length === 0) { score += 2; reasons.push('没有 CLI 已执行的检查'); }
    // spec §7.6 第 6 行是**一条**规则(「有失败的检查,或 rounds > 1」= +2),不拆成两条双计。
    const failed = asArr(ev.checks).some((c) => c?.result === 'fail');
    if (failed || it.rounds > 1) {
      score += 2;
      reasons.push(failed && it.rounds > 1 ? '有失败的检查且轮次 > 1'
        : failed ? '有失败的检查' : `轮次 > 1(rounds=${it.rounds})`);
    }
    const lines = asArr(ev.changes).reduce((s, c) => s + (Number(c?.add) || 0) + (Number(c?.del) || 0), 0);
    if (lines > policy.big_change_lines) { score += 1; reasons.push(`改动行数 > ${policy.big_change_lines}`); }
    // 机器验证 = CLI 亲自执行(退出码 0)且 result 为 pass([06]:退出码是机器信号,不能只看自述字段)。
    // 「改动很小」不附带「必须有改动」:零改动是该条件的极限情形,同样 −1(spec §7.6 末行没有 lines>0)。
    const allPass = runChecks.length > 0 && runChecks.every((c) => c.result === 'pass' && c.exit === 0);
    if (allPass && lines <= policy.big_change_lines) { score -= 1; reasons.push('CLI 已执行检查全部通过且改动很小'); }
    return { score, reasons, machineVerified: allPass };
  }
  const scored = [];
  for (const it of doneItems) { const p = priorityOf(it); it.priority = { score: p.score, reasons: p.reasons }; scored.push({ ref: it.id, score: p.score, reasons: p.reasons, machineVerified: p.machineVerified }); }
  scored.sort((a, b) => (b.score - a.score) || (idKey(a.ref)[1] - idKey(b.ref)[1]));
  // 批次复核阈值口径(本票定死):分数 ≤ LOW_PRIORITY_MAX 且机器验证通过 ⇒ 可被 `ok low` 批量复核。
  const lowEligible = sortIds(scored.filter((s) => s.score <= LOW_PRIORITY_MAX && s.machineVerified).map((s) => s.ref));
  const queue = {
    review: scored.map((s) => ({ ref: s.ref, score: s.score, reasons: s.reasons })),
    top_n: policy.review_top_n, low_max: LOW_PRIORITY_MAX, low_eligible: lowEligible,
  };

  // doing 项的「已用时」由 now 派生(spec §7:在途耗时随时间增长);done 项在 done 事件里定格。
  // 不写回则 item.active_seconds 恒为 0,与 ripple 里算出的 sunk 时间不一致(自检 2 曾因此判 FAIL)。
  for (const it of itemArr) if (it.lane === 'doing' && it.started_at) it.active_seconds = activeSecondsOf(it, nowMs);

  // ── 计数(spec §6.2) ────────────────────────────────────────────────────────
  const lane = (l) => itemArr.filter((i) => i.lane === l).length;
  const counts = {
    todo: lane('todo'), doing: lane('doing'), done: lane('done'),
    discovered: itemArr.filter((i) => i.origin.type === 'discovered').length,
    review: {
      ok: doneItems.filter((i) => i.review.state === 'ok').length,
      flag: doneItems.filter((i) => i.review.state === 'flag').length,
      unreviewed: doneItems.filter((i) => i.review.state === 'unreviewed').length,
    },
    decisions: {
      pending: decArr.filter((d) => d.status === 'pending_default' || d.status === 'pending_hold').length,
      resolved: decArr.filter((d) => d.status === 'confirmed' || d.status === 'overridden' || d.status === 'answered').length,
      defaulted: decArr.filter((d) => d.status === 'expired_locked').length,
      moot: decArr.filter((d) => d.status === 'moot').length,
    },
  };

  // ── run 字段(spec §5 / §12.4):活跃耗时排除 paused;ETA 至少 2 项才算 ─────────
  run.eta = estMs != null
    ? { low: hhmm(nowMs + estMs * 0.75), high: hhmm(nowMs + estMs * 1.25), basis: '已完成工作项耗时中位数外推', n: durs.length }
    : { low: null, high: null, basis: '估算中', n: durs.length };

  // ── 级联图必须无环(spec §8.3;当场拒收已失效,改为在投影里现形) ─────────────
  const edges = new Map();
  for (const d of decArr) {
    const set = new Set();
    for (const o of d.options) for (const c of asArr(o.impact.declared?.cascade)) if (c?.decision) set.add(c.decision);
    edges.set(d.id, [...set]);
  }
  const color = new Map(); let cycle = null;
  const dfs = (id, path) => {
    color.set(id, 1); path.push(id);
    for (const nx of edges.get(id) ?? []) {
      if (!edges.has(nx)) continue;
      if (color.get(nx) === 1) { cycle = [...path.slice(path.indexOf(nx)), nx]; return true; }
      if (color.get(nx) !== 2 && dfs(nx, path)) return true;
    }
    path.pop(); color.set(id, 2); return false;
  };
  for (const d of decArr) { if (color.get(d.id) !== 2 && dfs(d.id, [])) break; }
  if (cycle) {
    notes.push(`级联成环:${cycle.join(' → ')}`);
    conflicts.push({ from: cycle[0], target: cycle[cycle.length - 1], effect: 'cycle', reason: `级联成环 ${cycle.join(' → ')}` });
  }

  const maxSeq = evs.reduce((m, e) => (Number.isInteger(e?.seq) ? Math.max(m, e.seq) : m), 0);
  return {
    schema: SCHEMA,
    seq: Math.max(maxSeq, evs.length),
    run,
    theme, accent, density,
    counts,
    items: itemArr,
    decisions: decArr,
    stuck: [...stucks.values()],
    queue,
    trail: trail.length > MAX_TRAIL ? trail.slice(-MAX_TRAIL) : trail,
    activity: activity.slice(-MAX_ACTIVITY),
    notes,
    conflicts,
    generated_at: now,
  };
}
