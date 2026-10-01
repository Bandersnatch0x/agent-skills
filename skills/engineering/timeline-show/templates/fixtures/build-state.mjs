// timeline-show / templates / fixtures / build-state.mjs
// 生成器：把 events.jsonl 经真投影器 project() 投影，再用 scripts/tl.mjs 的
// serializeState 转义纪律写成 templates/state.js。
//
// 生成式夹具（票 36）：state.js 不再是手写夹具，而是 project() 的真输出 ——
// 「夹具与投影器双 schema」这类漂移从根上消失。门禁（check.mjs）在运行时同样
// 调用 buildState() 现生成并注入 window.__TL__，并逐字节比对磁盘 state.js，
// 漂移即转红。
//
// 运行：node templates/fixtures/build-state.mjs

import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { project } from '../../scripts/project.mjs';
import { serializeState } from '../../scripts/tl.mjs';

// 投影器是纯函数，now 显式注入。门禁与本生成器共用同一常量，保证逐字节一致。
export const FIXED_NOW = '2026-09-28T10:15:30.000Z';

export function loadEvents() {
  const raw = fs.readFileSync(new URL('./events.jsonl', import.meta.url), 'utf8');
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

export function buildState() {
  return project(loadEvents(), FIXED_NOW);
}

export function generatedStateSource() {
  return serializeState(buildState());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = fileURLToPath(new URL('../state.js', import.meta.url));
  fs.writeFileSync(target, generatedStateSource());
  console.log(`[build-state] 已写入 ${target}`);
}
