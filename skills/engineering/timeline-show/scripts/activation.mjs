// timeline-show / 激活阈值判据(票 24,落实 [15]「激活与命令面」Q4)。
//
// 为什么是**写死的数**而不是「让模型判断」:票 15 的原话是「工作项 > 5 或预计 > 30 分钟」,
// 但 Q3 取空手 init 后,工作项在执行中才长出来,「> 5 项」在开工时刻**不可判定**。
// 于是阈值收敛为单条「预计 > 30 分钟」,且把「预计」的判据也写死 —— 否则它和「> 5 项」
// 一样不可判定。本文件就是那条判据的可执行落点:SKILL.md 里的话与这里的代码一一对应。
//
// 判据(逐条,不看语义):
//   · ACTIVATION_THRESHOLD_MIN = 30,比较是**严格大于**:`> 30` 才开工,`=== 30` 不开工。
//   · estimatedMinutes 由 agent 按 SKILL.md 的固定规则取一个整数分钟值(明说时长优先;
//     否则「可独立验收的步骤数 × 10 分钟」);取不到有限值时**不自动开工**,
//     退回手动入口 `/timeline-show <标题>`。
//   · 「工作项 > 5」降级为**执行中途的提示**:discovered 项使总数越过 5 时补问一句。
export const ACTIVATION_THRESHOLD_MIN = 30;
export const MIDRUN_HINT_ITEMS = 5;

// 是否自动开工(不等批准)。非有限值(估不出)一律 false —— 不猜。
export function shouldOpenLedger(estimatedMinutes) {
  return Number.isFinite(estimatedMinutes) && estimatedMinutes > ACTIVATION_THRESHOLD_MIN;
}

// 中途提示:工作项总数越过 5 时,补一句「要不要现在开始记」。不触发任何写盘。
export function midRunHint(itemCount) {
  return Number.isFinite(itemCount) && itemCount > MIDRUN_HINT_ITEMS;
}
