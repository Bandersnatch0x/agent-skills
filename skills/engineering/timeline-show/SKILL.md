---
name: timeline-show
description: 一次长任务的可复核台账。自动开工并按执行追加事件，把 TODO / DOING / DONE、决策点、卡点、检查证据渲染成可双击离线打开、10 秒自刷新的自包含 HTML。用于预计超过 30 分钟的长任务，或在你说「看全貌 / timeline-show」时查看当前全貌。
allowed-tools: "Bash(${CLAUDE_SKILL_DIR}/scripts/tl.mjs *)"
argument-hint: "[标题] | [--view board|decisions|journey|ledger] [--run <id>]"
---

# 长任务复核台账

把一次长任务的运行事件记成一份**可复核的账**，并渲染成一眼能答「做到哪了 / 哪里卡住 / 什么在等我 / 我不回答会怎样 / 哪几处值得我看」的页面。它不是计划视图：**第一条记录是 `run.start`，工作项在执行中长出来**。

## 何时开工（判据写死，可执行）

**阈值只留一条：预计 > 30 分钟。**

「预计」按固定规则取一个整数分钟值，**不靠语义感觉**：

1. 你或用户明说了时长（「大概一小时」「要跑一下午」）→ 换算成分钟；
2. 没明说时，按「可独立验收的交付步骤数 × 10 分钟」计；
3. 仍估不出 → 不自动开工，改由你说 `/timeline-show <标题>` 手动开。

判据的可执行落点是 `scripts/activation.mjs` 的 `shouldOpenLedger(estimatedMinutes)`：**严格大于 30 才触发**（恰好 30 不触发），非有限值一律不触发。三条例外一律走手动入口。

- **自动开工，不等批准。** 达到阈值就主动 `init`，然后**立刻开工，不要等页面**。多建一个没人看的页面代价为零；该建没建则整段长跑都没有可复核的账。
- **`> 5 个工作项` 已降级为中途提示。** 空手 init 后工作项在执行中才长出来，开工时刻无从计算项数。当 `discovered` 项让总数越过 5 时，补问一句「要不要现在开始记」（`midRunHint(itemCount)`），不触发任何写盘。
- **上下文压缩或会话重启后**，先跑 `append`（或 `init` 同 run）把账接回来，保留原标题与开工时刻，不要重建第二份 run。

## 怎么用

在多项目与远程工作流中，一律使用完整技能路径 `${CLAUDE_SKILL_DIR}/scripts/tl.mjs` 并显式携带目标仓 `--root <仓>` 与 `--run <id>`。

### `tl init` —— 空手建 run 与部署离线产物

```bash
node "${CLAUDE_SKILL_DIR}/scripts/tl.mjs" init --root <仓> [--run <id>] [--title <标题>] [--goal <目标>] [--type <类型>]
```

- **空手 init**：不预置工作项骨架，**首条记录是 `run.start`**；工作项在执行中靠 `origin: discovered` 长出来。
- **离线多文件资产协同部署**：`init` 会将离线模板部署到 `.taskboard/runs/<runId>/timeline.html`，并同目录生成 `style.css`、`app.js` 与首份 `state.js`（澄清此前所谓单文件断言实为同目录多文件协同体系），页面通过 10 秒定时脚本与立即刷新按钮无缝更新。
- **幂等恢复**：对已有 run 重新 init 时，自动保留原初始开工时刻、标题、目标与已完成状态（`status: done` 不被冲刷为 running）。

### `tl append` —— agent 在过程中主动记

```bash
node "${CLAUDE_SKILL_DIR}/scripts/tl.mjs" append --root <仓> [--run <id>] --type <事件类型> [--ref <编号>] [--data <JSON>] [--actor <main|sub|system>]
```

- **`tl append` 是唯一写入口**：盖时间戳、分配序列号与编号、**永不拒收**（一行一序列号）。不合规的决策点留给投影现形，而不是当场拒收。
- 工作项的起止、决策点的开合、卡点、检查证据都走这一条；纯口述的检查记为 `claimed`，CLI 亲自跑的命令记为 `run`——两者在页面上**永远分开显示**。若通过 append 手工写入 `check.run`，会被系统强制降级为 `check.claim` 留痕。
- **不设 hook**：没有心跳、没有后台进程，事件由 agent 主动追加。写入失败不得阻断主任务；最多重试一次。

### `/timeline-show` —— 标题创建、无参查看与四视图路由

```bash
node "${CLAUDE_SKILL_DIR}/scripts/tl.mjs" [<标题>] [--root <仓>] [--run <id>] [--view board|decisions|journey|ledger]
```

- **带标题参数 (`<标题>`)**：指定非旗标字符串时，执行创建新 run，生成新的 runId。
- **无参或仅带旗标 (`view` / `--view` / 无参)**：查看当前 run 全貌。
  - `--view board`：看板全貌（默认），展示泳道、阻塞卡点、待决事项与复核注意力卡片；
  - `--view decisions`：决策影响视图，展示各分叉点、默认走向、级联影响与返工预算；
  - `--view journey`：旅途轨迹视图，按时序展现语义事件流水（Trail）；
  - `--view ledger`：台账全量明细，展示全部工作项完整明细与凭证汇总。
- **严格校验与防空机制**：查看视图**绝不自动新建 run**，也**绝不静默接受不存在的编号**。若指定的 `--run <id>` 不存在或目标仓未曾初始化 run，将直接报错退出（退出码 1）。

### 授权（附片段供自取，默认不代写）

技能回合内跑 `tl.mjs` 由技能的 `allowed-tools` 白名单覆盖；但 agent 在**自己的回合**里 `tl append` 不在该白名单内，首次会弹一次授权。手点一次 always allow 即可，或自行把下面这行粘进你的 settings：

```json
{ "permissions": { "allow": ["Bash(node \"$HOME/.claude/skills/timeline-show/scripts/tl.mjs\" *)"] } }
```

**默认不代写**：本技能**不写** `.claude/settings.json`，也**不写** `~/.claude/settings.json`——那是替用户改配置。

### `tl check` / `tl finish`

- `node "${CLAUDE_SKILL_DIR}/scripts/tl.mjs" check --root <仓> [--run <id>] [--ref T1] [--name 描述] -- <cmd> [args...]`：**唯一会执行外部命令**的入口，命令过 hold 闸门（执行前判定、无绕过），退出码由 CLI 亲自写盘（不可伪造的 `run` 证据）。只记摘要，不记命令原文与输出。
- `node "${CLAUDE_SKILL_DIR}/scripts/tl.mjs" finish --root <仓> [--run <id>]`：收尾并产出复核摘要（≤ 25 行，只顶出值得复核的前 5 项，不复述全部）。

### 项目级策略 `.taskboard/policy.json`（用户手写，`tl` 只读）

「哪些路径敏感」「多大算大改」是**项目知识**，落一份到 `<仓根>/.taskboard/policy.json` 即可，不必在每个 `run.start` 里重写。**你（agent）不代写这份文件**——由用户手写，`tl` 只读。

```json
{ "review_paths": ["src/payments/**", "migrations/**"], "big_change_lines": 300 }
```

- 只认这两个键；其余键（含 `hold_effects` 等）忽略。**评分权重 `3/3/3/4/2/2/1` 内置不暴露**，任何一级都覆写不到。
- 优先级：内置默认 **<** 项目级文件 **<** `run.start.data.policy`。文件缺席 / 空 / JSON 非法 → 不报错，回落内置默认。

## 停滞后页面显示什么（确切措辞与时长口径）

不检测「忘了记」——心跳体系出局后它失去了数据源。页面**如实显示停滞**，让沉默自己说话：

- **措辞（逐字）**：`语义更新停在 {X} 分前`
- **X 的口径**：取页面**客户端时钟**的毫秒时刻减去 `state.run.updated_at`（投影里**最后一条合法事件**的时刻，含 `note`），除以 `60000` **向下取整**。
  - 不足 1 分钟显示 `语义更新停在 1 分前`（不显示 `0 分前`）；
  - `run.updated_at` 为空（空 run）显示 `尚无语义记录`。
- 页面里**不存在任何由服务端打印的时间**：X 每一拍由客户端从烘焙的 `generated_at` 与本地 `Date.now()` 重算。

## 皮肤与审美记忆

- **皮肤面与 `visualize` 共用一份数据**：`scripts/tokens.json`（纯数据）逐字节等于 `skills/engineering/visualize/scripts/tokens.json`；`scripts/tokens.mjs` 是把它变成 CSS 变量的薄加载器。**只共享数据，不共享代码**——改代币只改这一份数据。漂移由仓内夹具 `scripts/run-skill-fixtures.mjs` 断言两份 `tokens.json` 逐字节相同。
- **首次风格问答保留**：复用你已装的 `ui-ux-pro-max`（预加载的设计技能）问一次风格，用 `node "${CLAUDE_SKILL_DIR}/scripts/tl.mjs" taste --theme light|dark --accent '#rrggbb' --density comfortable|compact` 把结果存到 **`~/.claude/taskboard-taste.json`**：

  ```json
  { "theme": "light", "accent": "#c2563f", "density": "comfortable" }
  ```

  `tl init` 读这份 token 并套用（读不到就用上面这组默认值，**不是硬依赖**）；不带旗标的 `tl taste` 只打印当前值。
- **用户未答则降级默认主题**，并**最多再问一次**；之后不再询问。
- **后台 L2 builder 已砍**（`background` 页面构建与 L2 版面层不做），版面按任务类型加权进 fog。

## 安装与边界

- 装法是仓根 `bash scripts/link-skills.sh`：把仓内每个含 `SKILL.md` 的目录符号链接到 `~/.claude/skills` 与 `~/.agents/skills`。本技能装到 `~/.claude/skills/timeline-show/`（本机全局）。
- **只读目标仓**：除 `.taskboard/` 与一行 `.gitignore` 外不改任何东西；全局只写上面那份 taste token。**不碰**用户级 `CLAUDE.md` 与任何 settings。
- 产物**可双击离线打开**：多文件离线产物输出至 `.taskboard/runs/<runId>/`（包含 `timeline.html`、`style.css`、`app.js` 与 `state.js`，同目录自包含、无外链、零网络请求，澄清此前所谓的单文件说法实为同目录多文件协同体系）；所有时间来自系统时钟，模型不写任何时间；页面只读，`TODO` 泳道不构成审批（未复核不阻塞 `finish`）。
- 中文成文，技术标识符保留原文。

## 事件契约与参考文档

关于完整的事件名清单、载荷 Schema、引用复用、决策/卡点/自述与机器凭证机制，以及端到端生命周期示例，参见：
- [事件契约与完整 Schema 参考](references/events.md)
