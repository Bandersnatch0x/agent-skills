// timeline-show / 皮肤面薄加载器(票 24,落实 [11]「共用皮肤面怎么落」)。
//
// 与 visualize 共用**同一份代币数据**,机制是「各技能自带一份逐字节相同的 `tokens.json`」
// (本文件旁的 `tokens.json`),而不是跨技能 import —— `_shared/` 包按现有安装工具不会被安装,
// 相对路径 import 在独立安装下必崩([11] 的查证)。漂移由仓内夹具
// `scripts/run-skill-fixtures.mjs` 断言两份 `tokens.json` 逐字节相同来兜。
//
// 只共享数据,不共享代码:本文件把表变成 CSS 变量;探针不在此处 ——
// 静态刀保留「无脚本」探针、本刀放开内联脚本([05]),两套探针本就该不同,故不共用。
import { readFileSync } from 'node:fs';

export const TOKEN = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));

// 与 visualize 同源的 4px 网格取值(Object 形状一致,便于页面对齐两刀)。
export const GRID = { step: 4, radius: [4, 6, 8], focusBudget: 2 };

// 代币 → CSS 变量。深浅两套:`:root` 给浅色,`prefers-color-scheme:dark` 给深色。
export function cssVars() {
  const light = Object.entries(TOKEN).map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v[0]}`).join(';');
  const dark = Object.entries(TOKEN).map(([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v[1]}`).join(';');
  return `:root{${light}}\n  @media (prefers-color-scheme:dark){:root{${dark}}}`;
}
