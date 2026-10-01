// timeline-show / templates / tokens.mjs
// 代币是**数据**：真源是同技能的 `scripts/tokens.json`（与 `visualize/scripts/tokens.json` 逐字节
// 相同，由 `scripts/run-skill-fixtures.mjs` 的漂移夹具看守）。本文件只做**薄加载**，不再内联一份值
// ——内联等于同一个技能里存两份数据，正是 R3 要消掉的那个问题换了个位置。
// `GRID` 与 `cssVars()` 是**代码**不是数据，按 [11]「只共享数据、不共享代码」留在原处。
import { readFileSync } from 'node:fs';

export const TOKEN = JSON.parse(readFileSync(new URL('../scripts/tokens.json', import.meta.url), 'utf8'));

export const GRID = { step: 4, radius: [4, 6, 8], focusBudget: 2 };

export function cssVars() {
  const light = Object.entries(TOKEN).map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v[0]}`).join(';');
  const dark = Object.entries(TOKEN).map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v[1]}`).join(';');
  return `:root{${light};--grid-step:${GRID.step}px;--radius-sm:${GRID.radius[0]}px;--radius-md:${GRID.radius[1]}px;--radius-lg:${GRID.radius[2]}px}\n  @media (prefers-color-scheme:dark){:root{${dark}}}`;
}
