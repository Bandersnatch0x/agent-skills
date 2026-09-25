// 皮肤面单一真源:两刀共用的语义角色代币与几何取值表(票 #28 E2 的机械落实)。
// 「两刀共用一套皮肤面」在这里不是承诺而是 import——改一处两图同变。
export const TOKEN = {
  paper: ['#fdfcfa', '#16151a'], paper2: ['#f5f2ee', '#1e1d23'],
  ink: ['#26221f', '#f2eee9'], inkStrong: ['#141210', '#fbf8f4'], muted: ['#6f6862', '#a9a29b'],
  rule: ['#ded8d1', '#3a3840'], accent: ['#c2563f', '#e2795f'], accentTint: ['#f7e7e2', '#3a2620'],
};

// 4px 网格:只约束矩形的 x/y/宽/高;圆角取值表;文本基线与路径派生坐标刻意不上网格。
export const GRID = { step: 4, radius: [4, 6, 8], focusBudget: 2 };

export function cssVars() {
  const light = Object.entries(TOKEN).map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v[0]}`).join(';');
  const dark = Object.entries(TOKEN).map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v[1]}`).join(';');
  return `:root{${light}}\n  @media (prefers-color-scheme:dark){:root{${dark}}}`;
}

// 两刀共用的基础排版
export const BASE_CSS = `*{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.6 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
  .wrap{max-width:1408px;margin:0 auto;padding:24px}`;

// 复现清单的公共项:几何 / 无脚本 / 自包含 / 尾换行
export function commonProbes(html) {
  const bad = [];
  for (const r of html.matchAll(/<rect\b[^>]*>/g)) {
    const tag = r[0];
    for (const [, k, v] of tag.matchAll(/\b(x|y|width|height)="(-?\d+)"/g)) if (+v % GRID.step !== 0) bad.push(`${k}=${v}`);
    for (const [, v] of tag.matchAll(/\brx="(\d+)"/g)) if (!GRID.radius.includes(+v)) bad.push(`rx=${v}`);
  }
  return [
    ['几何:矩形落在 4px 网格' + (bad.length ? `:违规 ${bad.join(',')}` : ''), bad.length === 0],
    ['无脚本(静态优先)', !/<script/i.test(html)],
    ['无外部资源(自包含)', !/(src|href)="https?:/i.test(html)],
    ['单尾换行', html.endsWith('\n') && !html.endsWith('\n\n')],
  ];
}
