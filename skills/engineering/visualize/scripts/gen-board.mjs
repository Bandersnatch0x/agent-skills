// 抛掷原型:动态状态视图(票况普查)样图生成器 —— 票 #29
// 三段式:参数契约 → 坐标公式 → 复现清单。取数与产图分离:本件只吃 census.json,不吃网络。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv } from 'node:process';
import { TOKEN, GRID, cssVars, BASE_CSS, commonProbes } from './tokens.mjs';

// 未知旗标与 --help 先处理:未知旗标一律**拒绝执行**——照跑会落出意外产物
// (实测:某个会话探 --help,因不识别而落到默认输出,在仓根落下一个未跟踪的 .html)
const KNOWN = new Set(["--help"]);
const badFlags = argv.slice(2).filter((a) => a.startsWith('--') && !KNOWN.has(a));
if (badFlags.length || argv.includes('--help')) {
  const usage = "用法:node gen-board.mjs <票况快照> [<输出路径>]";
  if (badFlags.length) { console.error('未知旗标:' + badFlags.join(' ')); console.error(usage); process.exit(2); }
  console.log(usage); process.exit(0);
}
// ── §1 参数契约 ────────────────────────────────────────────────────────────
const POS = argv.slice(2).filter((a) => !a.startsWith('--'));
const SRC = POS[0] ?? 'census.json';   // 取数段的产物;缺失即按拒绝路径退 2(先跑取数段)
const OUT = POS[1] ?? 'sample-dynamic-view.html';

const P = {
  // 列集是**仓情参数**:闭集给出形状(状态普查、列 ≤ 5、列头 WIP 芯片),参数给出本仓的列与上限。
  columns: [
    { key: 'todo', name: '待认领', wip: 4, order: 'asc', match: (t) => t.state === 'open' && t.assignees.length === 0 },
    { key: 'doing', name: '进行中', wip: 3, order: 'asc', match: (t) => t.state === 'open' && t.assignees.length > 0 },
    { key: 'done', name: '完成', wip: null, order: 'desc', match: (t) => t.state === 'closed' },
  ],
  colW: 320, colGap: 32, cardH: 64, cardGap: 8, headH: 48, boardY: 88, pad: 24,
  collapseAt: 4,           // 列内超 4 卡即聚合(第 5 张起折成计数卡)
  accentBudget: GRID.focusBudget,   // 2:超限芯片 + 一张阻塞卡
};
const BUDGET = { cols: 5, accents: P.accentBudget };

// ── §2 判据与坐标公式 ──────────────────────────────────────────────────────
// 卡态四型(闭集)。判据全部取自 tracker 事实,不臆造。
function cardState(t) {
  if (t.state === 'closed') return 'done';
  if (t.blockedBy.length > 0) return 'blocked';
  if (t.blockedByExternal) return 'waiting-external';   // 需仓情依据;无依据则该态不出现
  return 'default';
}
const colX = (i) => P.pad + i * (P.colW + P.colGap);
const cardY = (i) => P.boardY + P.headH + 12 + i * (P.cardH + P.cardGap);
const boardW = (n) => n * P.colW + (n - 1) * P.colGap;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function census(facts) {
  const cols = P.columns.map((c) => {
    const all = facts.tickets.filter(c.match).sort((a, b) => (c.order === 'desc' ? b.number - a.number : a.number - b.number));
    // 聚合规则先于一切:任何列(含完成列)只显前 collapseAt 张,其余折成一张计数卡——完成列因此天然有界。
    const cards = all.slice(0, P.collapseAt);
    return { ...c, total: all.length, hidden: all.length - cards.length, cards, over: c.wip != null && all.length > c.wip };
  });
  // 形态断言
  if (facts.tickets.length === 0) throw new Error('形态断言失败:票况为空——取数失败与「地图本来就没有票」不可混同,拒绝产空板');
  // 基准是**全部票**而非「匹配到的票」:拿匹配数当基准时,一张都不匹配就等于零比零,漏票被静默吞掉。
  const placed = cols.reduce((n, c) => n + c.total, 0);
  if (placed !== facts.tickets.length) throw new Error(`形态断言失败:有 ${facts.tickets.length - placed} 张票没落进任何列(列集覆盖不全),拒绝产图`);
  if (cols.length > BUDGET.cols) throw new Error(`形态断言失败:列数 ${cols.length} 超过 ${BUDGET.cols}`);
  for (const c of cols) if (c.wip != null && c.wip < 1) throw new Error(`形态断言失败:列「${c.name}」的 WIP 上限非正整数`);
  return { cols, total: facts.tickets.length };
}

// ── 产图 ──────────────────────────────────────────────────────────────────
function render(L, meta) {
  // accent 预算:超限芯片只允许**一列**转 accent(最超的那列),否则芯片自身会吃掉全部预算
  const overCols = L.cols.filter((c) => c.over);
  const overPicked = overCols.sort((a, b) => (b.total - b.wip) - (a.total - a.wip))[0]?.key;
  const blockedShown = L.cols.some((c) => c.cards.some((t) => cardState(t) === 'blocked'));
  const accents = (overPicked ? 1 : 0) + (blockedShown ? 1 : 0);

  const cols = L.cols.map((c, i) => {
    const chip = c.wip == null ? `${c.total}` : `${c.total}/${c.wip}`;
    const chipAccent = c.key === overPicked;
    const cards = c.cards.map((t, j) => {
      const st = cardState(t);
      const inner = `<div class="card ${st}">
          <div class="t">#${t.number} ${esc(t.title)}</div>
          <div class="m">${st === 'blocked' ? `被 #${t.blockedBy.join(' #')} 阻塞` : st === 'waiting-external' ? '等仓外解锁' : st === 'done' ? '已关' : t.assignees.length ? '已认领' : '未认领'}</div>
        </div>`;
      return `<div class="slot" style="top:${cardY(j)}px">${inner}</div>`;
    });
    const more = c.hidden > 0 ? `<div class="slot" style="top:${cardY(c.cards.length)}px"><div class="card more">+${c.hidden} 张(列内有界,只显最近 ${P.collapseAt} 张)</div></div>` : '';
    return `<div class="col" style="left:${colX(i)}px;width:${P.colW}px;top:${P.boardY}px">
      <div class="chead ${chipAccent ? 'over' : ''}"><span>${esc(c.name)}</span><span class="chip ${chipAccent ? 'over' : ''}">${chip}</span></div>
      ${cards.join('')}${more}
    </div>`;
  }).join('\n    ');

  const snap = meta.snapshot ? `快照时点 ${meta.snapshot}` : '快照时点未记录';
  const waiting = L.cols.reduce((n, c) => n + c.cards.filter((t) => cardState(t) === 'waiting-external').length, 0);
  const svg = `<svg role="img" viewBox="0 0 ${boardW(L.cols.length) + P.pad * 2} ${P.boardY + P.headH + 12 + (P.collapseAt + 1) * (P.cardH + P.cardGap) + P.pad * 2}" width="100%" aria-labelledby="bt bd">
    <title id="bt">票况普查:地图 #${meta.map} 的 ${L.total} 张子票</title>
    <desc id="bd">按阶段分列的状态普查。${L.cols.map((c) => `${c.name} ${c.total}`).join(';')}。看板内不含任何连接件。</desc>
    <rect x="0" y="0" width="${boardW(L.cols.length) + P.pad * 2}" height="${P.boardY}" fill="var(--paper-2)"/>
    <text x="${P.pad}" y="40" class="hdr">票况普查 · 地图 #${meta.map} · ${L.total} 张子票</text>
    <text x="${P.pad}" y="64" class="hdr-note">${snap};取数于生成时固化、不做运行时刷新;看板内禁止连接件;等待仓外解锁 ${waiting} 张</text>
    <foreignObject x="${P.pad}" y="${P.boardY}" width="${boardW(L.cols.length)}" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" class="board" style="width:${boardW(L.cols.length)}px;height:600px">
    ${cols}
      </div>
    </foreignObject>
  </svg>`;

  return { html: `<!doctype html>
<html lang="zh" data-view="dynamic-census">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>票况普查 · 地图 #${meta.map}</title>
<!-- 原型实现:incubator/workflow-view/gen-board.mjs —— 动态票况视图生成器(设计票 #29、实现票 08)。单一自包含 HTML + 内联 SVG,无脚本;快照在生成时固化。
     皮肤面代币与静态刀共用同一份 tokens.mjs;同输入必须产出逐字节相同。 -->
<style>
  ${cssVars()}
  ${BASE_CSS}
  svg{display:block;background:var(--paper)}
  .hdr{fill:var(--ink-strong);font-size:15px;font-weight:600}
  .hdr-note{fill:var(--muted);font-size:12px}
  .board{position:relative;font:13px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
  .col{position:absolute}
  .chead{display:flex;justify-content:space-between;align-items:center;height:${P.headH - 16}px;padding:0 12px;
         color:var(--ink-strong);font-weight:600;border-bottom:1px solid var(--rule)}
  .chip{border:1px solid var(--rule);border-radius:8px;padding:0 8px;color:var(--muted);font-size:12px}
  .chip.over{border-color:var(--accent);color:var(--accent);background:var(--accent-tint)}
  .slot{position:absolute;left:0;width:${P.colW}px;height:${P.cardH}px}
  .card{height:${P.cardH}px;padding:8px 12px;border:1px solid var(--rule);border-radius:6px;background:var(--paper-2);overflow:hidden}
  .card .t{color:var(--ink-strong);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card .m{color:var(--muted);font-size:12px}
  .card.blocked{border-style:dashed;border-color:var(--accent);background:var(--accent-tint);box-shadow:inset 4px 0 0 var(--accent)}
  .card.done{opacity:.55}
  .card.waiting-external{border-style:dashed;border-color:var(--muted)}
  .card.more{border-style:dashed;color:var(--muted);display:flex;align-items:center}
</style>
</head>
<body>
<div class="wrap">
${svg}
</div>
</body>
</html>
`, accents, overPicked, blockedShown };
}

// ── §7 复现清单 ───────────────────────────────────────────────────────────
function layoutConstants() {
  return { colW: P.colW, colGap: P.colGap, cardH: P.cardH, cardGap: P.cardGap, headH: P.headH, boardY: P.boardY, pad: P.pad };
}
function checklist(html, L, accents) {
  const constants = layoutConstants();
  const offGrid = Object.entries(constants).filter(([, v]) => v % GRID.step !== 0).map(([k, v]) => `${k}=${v}`);
  const connectors = (html.match(/<(path|line|polyline|marker)\b/gi) ?? []).length;
  return [
    [`禁连接件:path / line / polyline / marker 计数为 0(实得 ${connectors})`, connectors === 0],
    [`列数 ${L.cols.length} ≤ ${BUDGET.cols}`, L.cols.length <= BUDGET.cols],
    [`accent 用量 ${accents} ≤ ${BUDGET.accents}(超限芯片 + 阻塞卡)`, accents <= BUDGET.accents],
    [`布局常量落在 4px 网格${offGrid.length ? `:违规 ${offGrid.join(',')}` : ''}`, offGrid.length === 0],
    [`列内有界:每列实显卡数 ≤ ${P.collapseAt} 且超出部分已折成计数卡`,
      L.cols.every((c) => c.cards.length <= P.collapseAt && (c.hidden === 0 || c.cards.length + 1 <= P.collapseAt + 1))],
    // 卡态只由 cardState 从票面事实派生,「无依据的卡态」不可能渲染出来——那种探针永远不会红,
    // 留着是假安慰。真要把卡态钉住的是夹具:合成票况逐态逼出,并核对 accent 用量。
    ...commonProbes(html),
  ];
}

// ── main ──────────────────────────────────────────────────────────────────
// 失败一律退 2 并只给一句话(与静态刀同约):裸栈对使用者不是下一步。
try {
  if (!existsSync(SRC)) {
    // 拒绝路径:给下一步(先跑取数段),不产空板,不打裸栈
    throw new Error(`票况快照缺失:${SRC}。先跑取数段(fetch-census 那一步)拿到快照,再产图;空板不是票况`);
  }
  const facts = JSON.parse(readFileSync(SRC, 'utf8'));
  const L = census(facts);
  const { html, accents } = render(L, facts);
  const html2 = render(census(JSON.parse(readFileSync(SRC, 'utf8'))), facts).html;
  const boxes = checklist(html, L, accents);
  for (const [t, ok] of boxes) console.log(`${ok ? 'ok  ' : 'FAIL'} ${t}`);
  const det = html === html2;
  console.log(`${det ? 'ok  ' : 'FAIL'} 同输入两跑逐字节相同(${Buffer.byteLength(html)} 字节)`);
  const passed = boxes.every(([, ok]) => ok) && det;
  if (argv.includes('--check')) process.exit(passed ? 0 : 1);
  if (!passed) { console.log('复现清单未过,不写出'); process.exit(2); }
  writeFileSync(OUT, html);
  console.log(`已写出 ${OUT}`);
} catch (e) {
  console.error(`${e?.message ?? e}`);
  process.exit(2);
}
