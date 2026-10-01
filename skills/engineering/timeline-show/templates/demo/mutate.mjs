// timeline-show / templates / demo / mutate.mjs
// 改写 state.js 脚本：用来证明 10 秒无重载自刷新真实生效
// 运行：node mutate.mjs [--interval 4000] [--steps 10]

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveTargetStatePath(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state' && argv[i + 1]) {
      return path.resolve(argv[i + 1]);
    }
  }
  // 优先改写父目录下的单一真源 templates/state.js
  const parentState = path.join(__dirname, '..', 'state.js');
  if (fs.existsSync(parentState)) return parentState;
  return path.join(__dirname, 'state.js');
}

const statePath = resolveTargetStatePath(process.argv.slice(2));

function serializeState(state) {
  const json = JSON.stringify(state, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.__TL__ = ${json};\n`;
}

function readCurrentState() {
  const raw = fs.readFileSync(statePath, 'utf8');
  const match = raw.match(/window\.__TL__\s*=\s*([\s\S]+?);?\s*$/);
  if (!match) throw new Error('无法解析现有 state.js 中的 window.__TL__');
  return JSON.parse(match[1]);
}

function writeState(state) {
  // 原子写入：先写临时文件后 rename
  const tmp = `${statePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  fs.writeFileSync(tmp, serializeState(state), 'utf8');
  fs.renameSync(tmp, statePath);
}

const MUTATIONS = [
  (s) => {
    // 变更 1：推进 T3 到完成，调整新鲜度
    const t3 = s.items.find(i => i.id === 'T3');
    if (t3) {
      t3.lane = 'done';
      t3.marks = [];
    }
    s.run.generated_at = new Date().toISOString();
    return '【变更 1】任务 T3 推进至 DONE，移除 unverified 标记';
  },
  (s) => {
    // 变更 2：解除阻断 K1，T4 退出受阻状态（阻塞横幅真源为 state.stuck，本夹具恒空）
    const t4 = s.items.find(i => i.id === 'T4');
    if (t4) {
      t4.marks = t4.marks.filter(m => m !== 'blocked');
    }
    s.run.generated_at = new Date().toISOString();
    return '【变更 2】阻断 K1 已解除，T4 退出受阻状态，警示条恢复为平稳状态';
  },
  (s) => {
    // 变更 3：在 DOING 泳道长出一个突发衍生项 T7
    s.items.push({
      id: 'T7',
      title: '执行期动态发现: 验证打印样式与 reduced-motion 媒体查询行为',
      lane: 'doing',
      origin: 'discovered',
      marks: [],
      rounds: 1
    });
    s.queue = s.queue || {};
    s.queue.review = s.queue.review || [];
    s.queue.review.push({
      ref: 'T7',
      score: 4,
      reasons: ['新衍生的 T7 需要在真实 Chromium 视口下跑自检']
    });
    s.run.generated_at = new Date().toISOString();
    return '【变更 3】执行中长出突发衍生任务 T7 (DOING 泳道)，已加入高优先关注列表';
  },
  (s) => {
    // 变更 4：推进 T5 从 todo 进入 doing
    const t5 = s.items.find(i => i.id === 'T5');
    if (t5) {
      t5.lane = 'doing';
      t5.marks = [];
      t5.rounds = 1;
    }
    s.run.generated_at = new Date().toISOString();
    return '【变更 4】任务 T5 从 TODO 推进至 DOING';
  },
  (s) => {
    // 变更 5：裁决 D1 达成，更新状态为 answered
    const d1 = s.decisions.find(d => d.id === 'D1');
    if (d1) {
      d1.status = 'answered';
      d1.title = '裁决: [已采纳选项 A] 本地 file:// 协议下使用动态时间戳查询参数破除缓存';
    }
    s.queue = s.queue || {};
    s.queue.review = s.queue.review || [];
    s.queue.review = s.queue.review.filter(r => r.ref !== 'D1');
    s.run.generated_at = new Date().toISOString();
    return '【变更 5】决策事项 D1 已裁决通过，决策区自动清空待决项';
  }
];

function main() {
  const args = process.argv.slice(2);
  let intervalMs = 4000;
  let maxSteps = MUTATIONS.length;
  let loop = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) intervalMs = parseInt(args[++i], 10);
    if (args[i] === '--steps' && args[i + 1]) maxSteps = parseInt(args[++i], 10);
    if (args[i] === '--loop') loop = true;
  }

  console.log(`[mutate.mjs] 启动改写演示脚本，目标文件: ${statePath}`);
  console.log(`[mutate.mjs] 步长间隔: ${intervalMs}ms，总步数: ${maxSteps}，循环模式: ${loop}`);
  console.log(`[mutate.mjs] 请保持浏览器打开 templates/timeline.html，观察页面在 10s 内不重载更新！\n`);

  let step = 0;
  const timer = setInterval(() => {
    try {
      const state = readCurrentState();
      const mutateFn = MUTATIONS[step % MUTATIONS.length];
      const desc = mutateFn(state);
      writeState(state);
      step++;
      console.log(`[第 ${step} 步 / ${new Date().toLocaleTimeString()}] ${desc}`);

      if (!loop && step >= maxSteps) {
        clearInterval(timer);
        console.log(`\n[mutate.mjs] 演示步骤完成，state.js 已落盘最新改写。`);
      }
    } catch (err) {
      console.error('[mutate.mjs] 改写出错:', err);
      clearInterval(timer);
    }
  }, intervalMs);
}

main();
