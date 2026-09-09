# Bandersnatch0x Skills

[English](README.md) · [中文](README-zh.md)

Agent skills —— 小巧、可组合、模型无关。放进任何仓库，任何编码 agent（Claude Code、Codex、pi 等）都能直接使用。

## 安装

```bash
npx skills@latest add Bandersnatch0x/agent-skills
```

或克隆本仓库后，把 skill 软链到本地 harness 的 skill 目录（`~/.claude/skills`、`~/.agents/skills`）：

```bash
scripts/link-skills.sh
```

## Skills

### Engineering（工程）

**模型触发**

- **[distill-project-manual](./skills/engineering/distill-project-manual/SKILL.md)** — 把现有仓库里散落的文档、约定和强制规则蒸馏成一份紧凑的 agent 操作手册，带两道门槛：可溯源（每条规则指回真实来源）与行为探针（全新 agent 仅凭手册就能回答路由问题）。适合给不是你搭的代码库做 agent 入职。

### Product（产品）

**模型触发**

四个收敛类 skill 构成一条流水线 —— 用户 → 定位 → 功能裁剪 / 指标 —— 而 product-scope-audit 在「继续还是停止」本身成为问题时横跨全部维度。

- **[target-user-and-jtbd](./skills/product/target-user-and-jtbd/SKILL.md)** — 用证据锁定真实的主用户与其要完成的任务（JTBD），附「看起来像用户但其实不是」的反用户画像，以及下周就能做的最小验证。
- **[product-positioning-audit](./skills/product/product-positioning-audit/SKILL.md)** — 把项目宣称的定位与仓库实际构建的东西对账；揪出过度承诺、隐藏价值与定位漂移；收敛出 2–3 个候选定位与「不做清单」。
- **[feature-scope-triage](./skills/product/feature-scope-triage/SKILL.md)** — 按一个已确定的定位，给每个功能判 Keep / Keep-as-is / Defer / Cut / Spin-out，并复原「新手 10 分钟路径」。
- **[goals-and-success-metrics](./skills/product/goals-and-success-metrics/SKILL.md)** — 把模糊的目标变成 North Star、支撑指标与护栏指标、分阶段里程碑、反目标（「做到了也不算赢」），以及功能↔指标对照表。
- **[product-scope-audit](./skills/product/product-scope-audit/SKILL.md)** — 整盘产品决策审查：continue / narrow / reposition / pause / stop 五选一 + 一个下一步行动，全部基于能力边界与端到端旅程的证据。

### Productivity（生产力）

**模型触发**

- **[claude-session-manager](./skills/productivity/claude-session-manager/SKILL.md)** — 以「保全优先」的方式诊断与维护 Claude Code 本地状态：清点、可验证的交接、显式归档门槛与恢复检查。
- **[claude-retrospective](./skills/productivity/claude-retrospective/SKILL.md)** — 把反复出现的会话证据蒸馏成至多一条最小、有据可依的持久行为变更。
- **[find-hackathons](./skills/productivity/find-hackathons/SKILL.md)** — 按截止日期、地点、类型、参赛要求、赛道和奖金查找并验证黑客松；可选生成本地双语筛选页面（含参赛者画像匹配与 agent 头脑风暴 brief）。

## Buckets

- `engineering/` — 日常代码工作
- `product/` — 产品策略：用户、定位、功能裁剪、指标、整盘决策
- `productivity/` — 非代码工作流工具

仅这三个 bucket 下的 skill 会被推广（列于此处与 `.claude-plugin/plugin.json`）。
