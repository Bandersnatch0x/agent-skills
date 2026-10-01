// 皮肤面单一真源:两刀共用的语义角色代币与几何取值表(票 #28 E2 的机械落实)。
// 「两刀共用一套皮肤面」在这里不是承诺而是 import——改一处两图同变。
//
// 票 24 的拆分(共用皮肤面怎么落 / [11]):**代币数据**抽到同目录 `tokens.json`(纯数据),
// 本文件退化为**薄加载器**;数据可被逐字节复制到 sibling 技能(timeline-show),由仓内
// 漂移夹具断言两份 `tokens.json` 逐字节相同。这里只共享**数据**,不共享代码:
// `GRID` / `commonProbes` / `cssVars` 的逻辑留在原处(静态刀与新刀的探针本就该不同)。
import { readFileSync } from 'node:fs';

export const TOKEN = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));

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
