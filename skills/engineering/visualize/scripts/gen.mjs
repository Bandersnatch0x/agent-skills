// 原型实现:incubator/workflow-view/gen.mjs —— 静态流程视图生成器(设计票 #28、实现票 07)
// 三段式:参数契约 → 坐标公式 → 复现清单;同输入必须产出逐字节相同的 HTML。
// 事实来源 = 目标仓的**工作流文档**(默认目标仓 docs/agents/dev-workflow.md;`--src` 或位置参数覆盖)。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { argv } from 'node:process';
import { cssVars, BASE_CSS, commonProbes } from './tokens.mjs';

// 未知旗标与 --help 先处理:未知旗标一律**拒绝执行**——照跑会落出意外产物
// (实测:某个会话探 --help,因不识别而落到默认输出,在仓根落下一个未跟踪的 .html)
const KNOWN = new Set(["--src", "--check", "--help"]);
const badFlags = argv.slice(2).filter((a) => a.startsWith('--') && !KNOWN.has(a));
if (badFlags.length || argv.includes('--help')) {
  const usage = "用法:node gen.mjs [--src <工作流文档>] [<输出路径>] [--check]";
  if (badFlags.length) { console.error('未知旗标:' + badFlags.join(' ')); console.error(usage); process.exit(2); }
  console.log(usage); process.exit(0);
}
// ── §1 参数契约 ────────────────────────────────────────────────────────────
// 用法:node gen.mjs [--src <工作流文档>] [<输出路径>] [--check]
//   --src 与位置参数等价(保留位置参数是为了兼容原型既有调用);
//   --check 只跑复现清单不写盘。
const srcFlag = argv.indexOf('--src');
const POS = argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--src');
// 位置参数语义(与原型一致):给了 --src 时,第一个位置参数是输出;
// 未给 --src 时,第一个位置参数是来源、第二个是输出。
const SRC = (srcFlag >= 0 ? argv[srcFlag + 1] : POS[0]) ?? 'docs/agents/dev-workflow.md';
const OUT = (srcFlag >= 0 ? POS[0] : POS[1]) ?? 'sample-static-view.html';   // 默认落当前目录:技能是工具,产物跟用户走
const SETUP_HINT = '先跑装配命令(如 /setup agents)生成工作流文档,或用 --src <路径> 指定其他已装配文档';
const P = {
  viewBox: [1360, 560],
  headerH: 36,          // 页头条带
  node: [160, 64],      // 阶段节点固定尺寸
  gap: 32,              // 节点间距
  chainY: 248,          // 阶段带顶端 y
  labelY: 92,           // 入口标签基线 y
  trackY: 420,          // 横切轨道顶端 y
  trackH: 44,
  pad: 24,              // 左右页边
  focal: '落码',        // 1 个焦点节点(accent 预算 2:本节点 + 横切轨道)
};
const BUDGET = { nodes: 9, connectors: 12, accents: 2 };

// 皮肤面代币不在此处定义:两刀共用 tokens.mjs 一份(票 #28 E2)——改一处两图同变,不是承诺而是 import。

// ── §2 坐标公式 ────────────────────────────────────────────────────────────
const nodeX = (i) => P.pad + i * (P.node[0] + P.gap);
const nodeW = P.node[0], nodeH = P.node[1];
const chainW = (n) => n * nodeW + (n - 1) * P.gap;
const centerX = (i) => nodeX(i) + nodeW / 2;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 事实来源:读工作流文档 ────────────────────────────────────────────────
function readFacts(path) {
  if (!existsSync(path)) {
    throw new Error(`事实来源缺失:${path}。${SETUP_HINT}`);
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const at = (h) => lines.findIndex((l) => l.trim() === h);
  const section = (h) => {
    const i = at(h);
    if (i < 0) throw new Error(`形态断言失败:找不到节「${h}」`);
    const out = [];
    for (const l of lines.slice(i + 1)) { if (/^##\s/.test(l)) break; out.push(l); }
    return out;
  };
  const phases = section('## 流水线(七阶段)')
    .filter((l) => /^\|\s*\d+\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .map(([n, name, duty, exit]) => ({ n: +n, name, duty, exit }));
  const entries = section('## 进入规则')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
    .map((body) => {
      const [head, ...rest] = body.split(':');          // 「小任务:方向未定从拷问进入,方向已定从成谱进入」
      const tail = rest.join(':');
      const targets = phases.filter((p) => tail.includes(p.name)).map((p) => p.name);
      return { label: head.trim(), targets, tail: tail.trim() };
    })
    .filter((e) => e.targets.length > 0);
  // 形态断言:漏解析即报错,不静默画空图
  if (phases.length !== 7) throw new Error(`形态断言失败:解析到 ${phases.length} 个阶段,期望 7`);
  if (entries.length === 0) throw new Error('形态断言失败:进入规则未解析出任何落点');
  for (const e of entries) for (const t of e.targets) {
    if (!phases.some((p) => p.name === t)) throw new Error(`形态断言失败:进入规则指向未知阶段「${t}」`);
  }
  if (!phases.some((p) => p.name === P.focal)) throw new Error(`形态断言失败:焦点节点「${P.focal}」不在阶段表里`);
  const tracks = section('## 横切机制(按触发条件生效,不占流水线位置)')
    .filter((l) => /^\|\s*[^|]+\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter(([a]) => a && !/^-+$/.test(a) && a !== '机制');
  if (tracks.length === 0) throw new Error('形态断言失败:横切机制表未解析出任何行');
  // 槽位残留即断言失败:模板未装配时表内会留 {{...}},画出来是一张带占位符的假图。
  const raw = lines.join('\n');
  const slot = raw.match(/\{\{[a-z0-9-]+\}\}/);
  if (slot) throw new Error(`形态断言失败:事实来源含未填槽位 ${slot[0]}(模板须先装配,或传已装配的文档路径)`);
  return { phases, entries, tracks };
}

// ── 产图 ──────────────────────────────────────────────────────────────────
function render({ phases, entries, tracks }) {
  const [vw, vh] = P.viewBox;
  const g = [];
  // 页头条带
  g.push(`  <rect data-role="band" x="0" y="0" width="${vw}" height="${P.headerH}" fill="var(--paper-2)"/>`);
  g.push(`  <text x="${P.pad}" y="24" class="hdr">七阶段流水线 · 概览层</text>`);
  g.push(`  <text x="${vw - P.pad}" y="24" class="hdr-note" text-anchor="end">细节见下表;命令绑定表不进图</text>`);
  // 连线先于节点发射(z 序)
  const cx = (i) => centerX(i);
  for (let i = 0; i < phases.length - 1; i++) {
    const x1 = nodeX(i) + nodeW, x2 = nodeX(i + 1), y = P.chainY + nodeH / 2;
    g.push(`  <path data-role="connector" d="M${x1} ${y} H${x2}" class="edge" marker-end="url(#tick)"/>`);
  }
  // 入口标签 + 折线(非节点:仅注释文字与连线)
  let li = 0;
  for (const e of entries) {
    const x = P.pad + li * 208;
    for (const t of e.targets) {
      const ti = phases.findIndex((p) => p.name === t);
      const from = x + 72, to = cx(ti);
      g.push(`  <path data-role="connector" d="M${from} ${P.labelY + 12} V${P.chainY - 20} H${to} V${P.chainY}" class="edge entry"/>`);
    }
    g.push(`  <text x="${x}" y="${P.labelY}" class="lbl">${esc(e.label)}</text>`);
    li++;
  }
  // 阶段节点
  phases.forEach((p, i) => {
    const focal = p.name === P.focal;
    g.push(`  <g data-role="${focal ? 'node accent' : 'node'}">`);
    g.push(`    <rect x="${nodeX(i)}" y="${P.chainY}" width="${nodeW}" height="${nodeH}" rx="8" class="${focal ? 'n focal' : 'n'}"/>`);
    g.push(`    <text x="${cx(i)}" y="${P.chainY + 26}" class="n-idx">${p.n}</text>`);
    g.push(`    <text x="${cx(i)}" y="${P.chainY + 48}" class="n-name">${esc(p.name)}</text>`);
    g.push(`  </g>`);
  });
  // 横切轨道:第二层,用一个支撑原语表达(一条底带),不逐阶段画箭头
  const tx = P.pad, tw = chainW(phases.length);
  g.push(`  <g data-role="track accent">`);
  g.push(`    <rect x="${tx}" y="${P.trackY}" width="${tw}" height="${P.trackH}" rx="6" class="track"/>`);
  g.push(`    <text x="${tx + 12}" y="${P.trackY + 27}" class="track-h">横切机制(按触发条件生效,不占流水线位置)</text>`);
  g.push(`    <text x="${tx + tw - 12}" y="${P.trackY + 27}" class="track-b" text-anchor="end">${tracks.map((t) => esc(t[0])).join(' · ')}</text>`);
  g.push(`  </g>`);
  // 轨道与阶段带的从属关系:两端各一条短竖线(非计数连接件,它是块的边界提示)
  g.push(`  <path d="M${tx + 12} ${P.trackY} V${P.chainY + nodeH}" class="edge tick"/>`);
  g.push(`  <path d="M${tx + tw - 12} ${P.trackY} V${P.chainY + nodeH}" class="edge tick"/>`);

  const rows = phases.map((p) =>
    `      <tr><td class="nm">${p.n} ${esc(p.name)}</td><td>${esc(p.duty)}</td><td class="slot">${esc(p.exit)}</td></tr>`).join('\n');
  const svg = `  <svg role="img" viewBox="0 0 ${vw} ${vh}" width="100%" aria-labelledby="t d">
    <title id="t">七阶段流水线概览</title>
    <desc id="d">${phases.map((p) => p.name).join(' → ')};下方一条横切机制轨道,共 ${tracks.length} 条机制。</desc>
    <defs><marker id="tick" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0 0 L8 4 L0 8 z" fill="var(--muted)"/></marker></defs>
${g.join('\n')}
  </svg>`;

  return `<!doctype html>
<html lang="zh" data-view="static-overview">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>七阶段流水线 · 概览层</title>
<!-- 抛掷原型:静态流程视图样图(票 #28)。单一自包含 HTML + 内联 SVG,无脚本。
     真源即本文件;SVG / PNG 若导出只作派生面,不得反过来当权威。
     同输入必须产出逐字节相同:生成器 .scratch/workflow-view/gen.mjs,事实来源 ${esc(SRC)} -->
<style>
  ${cssVars()}
  ${BASE_CSS}
  svg{display:block;background:var(--paper)}
  .hdr{fill:var(--ink-strong);font-size:15px;font-weight:600}
  .hdr-note,.lbl{fill:var(--muted);font-size:12px}
  .edge{fill:none;stroke:var(--rule);stroke-width:1.5}
  .edge.entry{stroke:var(--muted);stroke-dasharray:3 3}
  .edge.tick{stroke:var(--rule);stroke-dasharray:0}
  .n{fill:var(--paper-2);stroke:var(--rule);stroke-width:1.5}
  .n.focal{fill:var(--accent-tint);stroke:var(--accent);stroke-width:2}
  .n-idx{fill:var(--muted);font-size:11px;text-anchor:middle}
  .n-name{fill:var(--ink-strong);font-size:15px;font-weight:600;text-anchor:middle}
  .track{fill:var(--accent-tint);stroke:var(--accent);stroke-width:1.5;stroke-dasharray:5 4}
  .track-h{fill:var(--ink-strong);font-size:12px;font-weight:600}
  .track-b{fill:var(--muted);font-size:12px}
  table{border-collapse:collapse;width:100%;margin-top:20px;font-size:13px}
  caption{text-align:left;color:var(--muted);font-size:12px;padding-bottom:8px}
  th,td{border-top:1px solid var(--rule);padding:8px 10px;text-align:left;vertical-align:top}
  th{color:var(--muted);font-weight:600}
  td.nm{font-weight:600;white-space:nowrap}
  td.slot{color:var(--muted);font-family:ui-monospace,Consolas,monospace;font-size:12px}
</style>
</head>
<body>
<div class="wrap">
${svg}
  <table>
    <caption>细节层:不进图。命令绑定表另见工作流文档文末「依赖与命令绑定」,本图不承载它。</caption>
    <thead><tr><th>阶段</th><th>职责</th><th>出口判据</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>
</body>
</html>
`;
}

// ── §7 复现清单(逐条核对;预算类为机械计数) ────────────────────────────
function checklist(html, facts) {
  const count = (role) => (html.match(new RegExp(`data-role="[^"]*\\b${role}\\b[^"]*"`, 'g')) ?? []).length;
  const probe = (t, ok) => [t, ok];
  return [
    probe(`节点数 ${count('node')} ≤ ${BUDGET.nodes}`, count('node') <= BUDGET.nodes),
    probe(`连接件数 ${count('connector')} ≤ ${BUDGET.connectors}`, count('connector') <= BUDGET.connectors),
    probe(`焦点信号 ${count('accent')} 处 ≤ ${BUDGET.accents}`, count('accent') <= BUDGET.accents),
    // 几何 / 无脚本 / 自包含 / 尾换行四条与动态刀同源(tokens.mjs),此处不再各写一份
    ...commonProbes(html),
    probe(`阶段 ${facts.phases.length} 个、入口标签 ${facts.entries.length} 个、机制 ${facts.tracks.length} 条`, facts.phases.length === 7),
  ];
}

// 收尾:断言与清单不过一律退 2 并只给一句话,不给裸栈——裸栈对使用者不是下一步。
try {
  const facts = readFacts(SRC);
  const html = render(facts);
  const html2 = render(readFacts(SRC));               // 确定性:同输入两跑
  const boxes = checklist(html, facts);
  for (const [t, ok] of boxes) console.log(`${ok ? 'ok  ' : 'FAIL'} ${t}`);
  const deterministic = html === html2;
  console.log(`${deterministic ? 'ok  ' : 'FAIL'} 同输入两跑逐字节相同(${Buffer.byteLength(html)} 字节)`);
  if (argv.includes('--check')) process.exit(boxes.every(([, ok]) => ok) && deterministic ? 0 : 1);
  if (boxes.some(([, ok]) => !ok) || !deterministic) { console.log('复现清单未过,不写出'); process.exit(2); }
  writeFileSync(OUT, html);
  console.log(`已写出 ${OUT}`);
} catch (e) {
  console.error(`${e?.message ?? e}`);
  process.exit(2);
}
