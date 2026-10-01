# 事件契约与完整 Schema 参考

本文档详细定义 `timeline-show` 运行过程中的事件规范（Schema Version 3）、事件名枚举、载荷结构、编号分配与复用规则，以及机器验证与自述证据的区别和完整生命周期示例。

---

## 1. 编号分配与引用复用模式 (Reference Patterns)

系统采用字母前缀 + 自增数字的确定性自然序编号：

| 前缀 | 类别 | 说明与生命周期 | 自动分配示例 |
|------|------|----------------|--------------|
| `T<n>` | 工作项 (Item / Task) | 一次独立工作项，状态机：`todo` → `doing` → `done`。可通过 `deps` 传递依赖，可通过 `assumes` 绑定决策默认走向。 | `T1`, `T2`, `T10` |
| `D<n>` | 决策点 (Decision) | 分叉路口，状态机：`pending_default` / `pending_hold` → `confirmed` / `overridden` / `answered` / `moot` / `expired_locked`。支持级联 `cascade`。 | `D1`, `D2` |
| `K<n>` | 卡点 (Stuck / Blocker) | 阻塞或警告事项，状态机：`stuck.open` → `stuck.close`。`severity: 'block'` 将直接把关联的工作项标为 `blocked`。 | `K1`, `K2` |
| `C<n>` | 检查凭证 (Check Evidence) | 挂载于特定工作项 `T<n>` 下的执行结果凭证。`check.run` (CLI 执行) 与 `check.claim` (口述)。 | `C1`, `C2` |

### 引用复用规则 (Reference Reuse)
1. **工作项编号分配**：`item.add` 可显式指定 `ref: "T1"` 或省略 `ref` 由分配器分配下一个可用 `T<n>`。
2. **决策点关联**：工作项 `item.start` 中 `assumes: [{ decision: "D1", option: "A", confirmed: false }]` 引用已打开的决策点 `D1`。若未显式声明，引擎自动将所有当前处于 `pending_default` 的决策及其默认选项注入为 `assumes`。
3. **证据归属**：`check.run`、`check.claim`、`artifact` 必须通过 `ref` 指向现有工作项（如 `ref: "T1"`）。如果指向不存在的非 `T<n>` 编号，分配器将拒绝凭空创建幽灵项，并在投影 `notes` 中告警。
4. **卡点绑定**：`stuck.open` 通过 `data.item: "T1"` 绑定至受阻工作项，其卡点编号本身为 `K1`。

---

## 2. 事件类型全量参考 (Event Specifications)

所有事件均以 JSON Lines (`.jsonl`) 格式单行追加至 `.taskboard/runs/<runId>/events.jsonl`，单行上限 2048 字节。

公共事件外层包裹格式：
```json
{
  "seq": 1,
  "t": "2026-09-29T08:00:00.000Z",
  "type": "run.start",
  "run": "run-20260929-160000",
  "ref": null,
  "actor": "system",
  "data": { ... }
}
```

### 2.1 运行生命周期 (Run Lifecycle)

#### `run.start`
开启新 run 或记录初始化元数据。幂等重放时保留首次的 `started_at`、`title`、`goal` 与 `type`，且不会将已结束 (`status: done`) 的 run 重置为 running。
- `ref`: `null`
- `data`:
  - `title`: `string` 任务标题
  - `goal`: `string` 核心目标
  - `type`: `string` 任务类型（如 `general`, `engineering`）
  - `theme`: `"light" | "dark"` 主题
  - `accent`: `string` 主题口音颜色十六进制（如 `"#c2563f"`）
  - `density`: `"comfortable" | "compact"` 版面密度
  - `policy`: `object`（可选覆写默认策略）
    - `hold_effects`: `string[]` 触发 hold 的副作用列表
    - `hold_patterns`: `string[]` 拒绝执行的高危命令模式
    - `review_paths`: `string[]` 触发高分关注的代码路径 glob（如 `["auth/**", "**/secrets*"]`）
    - `max_pending_provisional`: `number` 最大允许同时挂起的临时决策数（默认 3）
    - `rework_budget_ratio`: `number` 返工预算比例（默认 0.25）
    - `review_top_n`: `number` 收尾摘要最多顶出的复核项（默认 5）
    - `big_change_lines`: `number` 判定「大改动」的增删行数阈值（默认 200，超出则 +1 分进复核队列）

  > **策略三级优先级**：内置 `DEFAULT_POLICY` **<** 项目级 `.taskboard/policy.json` **<** 本处 `run.start.data.policy`。
  > 项目级文件由用户手写（见下节），`run.start` 这一级可覆写上面**全部**键。

### 2.1.1 项目级策略文件 `.taskboard/policy.json`（用户手写，`tl` 只读）

把「哪些路径敏感」「多大算大改」这类**项目知识**落在仓里一次，不必在每个 `run.start` 里重写。

- **位置**：`<仓根>/.taskboard/policy.json`。
- **写法**：用户**手写**的 JSON 对象；`tl` **只读**它，**绝不写入**（不新增写路径，不破写盘边界）。
- **只认两个键**：`review_paths`、`big_change_lines`。其余键（含 `hold_effects` 等）一律忽略。
- **评分权重 `3/3/3/4/2/2/1` 不在此暴露**：那是通用口径、内置不暴露，**任何一级 policy 都覆写不到**。
- **回落**：文件缺席 / 空文件 / 非法 JSON / 非对象 → **不抛错**，一并回落内置 `DEFAULT_POLICY`。

```json
{
  "review_paths": ["src/payments/**", "migrations/**"],
  "big_change_lines": 300
}
```

项目级只作**默认**：同一个键若在 `run.start.data.policy` 里再出现，以 `run.start` 为准（如某趟 run 临时收紧阈值）。

#### `run.pause`
暂停任务计时。
- `data`: 空或 `{ reason: string }`

#### `run.resume`
恢复任务计时，累计排除暂停时长。
- `data`: 空

#### `run.end`
结束当前 run。
- `data`:
  - `status`: `"done" | "aborted"`（默认 `"done"`）

---

### 2.2 工作项生命周期 (Item Lifecycle)

#### `item.add`
声明新增工作项。
- `ref`: `"T<n>"`（如 `"T1"`）
- `data`:
  - `title`: `string`（必须）工作项简短标题
  - `deps`: `string[]` 前置依赖项编号列表（如 `["T0"]`）
  - `origin`: `object` 来源
    - `type`: `"initial" | "discovered" | "review" | "decision"`
    - `ref`: `string | null` 来源实体编号
    - `summary`: `string | null` 来源说明
  - `owner`: `string` 执行者标识

#### `item.edit`
修改未完成工作项的元数据。
- `ref`: `"T<n>"`
- `data`: `title`, `note`, `owner`, `deps`

#### `item.start`
工作项开工，进入 `doing` 泳道。
- `ref`: `"T<n>"`
- `data`:
  - `progress`: `number`（0.0 ~ 1.0）
  - `owner`: `string`
  - `assumes`: `Array<{ decision: string, option: string, confirmed?: boolean }>` 显式声明的决策预设
  - `checkpoint`: `string` 开工时的代码 commit 或状态检查点

#### `item.progress`
上报进行中的进度。
- `ref`: `"T<n>"`
- `data`:
  - `progress`: `number`（0.0 ~ 1.0）
  - `note`: `string` 阶段说明

#### `item.done`
完成工作项，进入 `done` 泳道。
- `ref`: `"T<n>"`
- `data`:
  - `outcome`: `"completed"`（默认）
  - `active_seconds`: `number` 活跃消耗秒数（未传则由 `t - started_at` 计算）
  - `changes`: `Array<{ path: string, add: number, del: number }>` 改动文件行数统计
  - `attribution`: `"exact" | "approx"` 时段独占或并行归属
  - `summary`: `string` 成果摘要

#### `item.fail`
工作项失败，打回 `todo` 泳道，并在 flags 中添加 `failed`。
- `ref`: `"T<n>"`
- `data`:
  - `why`: `string` 失败原因

#### `item.reopen`
因重构或缺陷重开工作项，`rounds += 1`，重置为 `todo`。
- `ref`: `"T<n>"`
- `data`:
  - `why`: `string` 重开原因

#### `item.drop`
放弃工作项，进入 `done` 泳道，outcome 为 `dropped`。
- `ref`: `"T<n>"`

#### `item.supersede`
工作项被更优方案取代，进入 `done` 泳道，outcome 为 `superseded`。
- `ref`: `"T<n>"`

---

### 2.3 决策点生命周期 (Decision Lifecycle)

#### `decision.open`
打开决策点。
- `ref`: `"D<n>"`
- `data`:
  - `title`: `string` 决策标题
  - `question`: `string` 具体提问
  - `why_now`: `string` 为何当前必须做出选择
  - `mode`: `"provisional" | "hold"`（provisional: 默认推进; hold: 阻塞等待人工）
  - `gate`: `{ g1?: boolean, policy_hit?: string }` 闸门触发信息
  - `affects`: `string[]` 受影响的工作项编号列表
  - `lock_at`: `object | null` 锁定 / 自动默认触发点。`{ type: "time", at: string }`（ISO 8601 绝对时刻）或 `{ type: "item", ref: "T<n>" }`（该工作项进入 `done` 即到达）；`null` / 缺省 = 无自动锁定点。到达且未作答时，`pending_default` 决策自动默认接管（投影为 `expired_locked`）；若命中策略 `hold_effects` 副作用则升级为 `pending_hold` 并落 G3 闸。
  - `options`: 选项数组
    - `key`: `string`（如 `"A"`, `"B"`）
    - `label`: `string` 选项说明
    - `default`: `boolean` 是否默认选项
    - `reversible`: `boolean` 是否可逆（默认 true）
    - `impact`:
      - `declared`:
        - `redo`: `string[]` 改选此项需要重做的工作项
        - `enable`: `string[]` 解锁的工作项
        - `disable`: `string[]` 废弃的工作项
        - `side_effects`: `string[]` 涉及的副作用类别（如 `["prod-write", "deploy"]`）
        - `cascade`: `Array<{ decision: string, effect: "moot" | "default" | "remove_option" | "hold", value?: any }>` 级联动作
        - `redo_est_min`: `number | null` 预估返工分钟数

#### `decision.pack`
批量打开关联决策包。
- `ref`: `"D<n>"` 或包标识符
- `data`:
  - `decisions`: `Array<DecisionSpec>` 包含多个完整决策定义的数组

#### `decision.impact`
补充或修正选项的预期影响矩阵。
- `ref`: `"D<n>"`
- `data`:
  - `option`: `string` 目标选项 key
  - `declared`: 影响声明对象

#### `decision.answer`
人工或主管指定作答。
- `ref`: `"D<n>"`
- `data`:
  - `key`: `string` 选中的选项 key
  - `by`: `string`（如 `"user"`, `"you"`）
  - `via`: `"chat" | "cli"`

#### `decision.override`
覆盖原有决策，触发连锁下游重做计算。
- `ref`: `"D<n>"`
- `data`:
  - `key`: `string` 新选项 key

#### `decision.expire`
锁定时点到达或前置工作项已完成，临时决策自动默认锁定。
- `ref`: `"D<n>"`

#### `decision.hold`
由闸门或返工预算超标将临时决策升级为 hold 状态。
- `ref`: `"D<n>"`

#### `decision.moot`
由于上下文变更或上游级联使该决策不再成立，置为失效。
- `ref`: `"D<n>"`

#### `decision.cascade`
手动触发对一组目标决策的级联更新。
- `ref`: `"D<n>"`
- `data`:
  - `cascade`: `Array<{ decision: string, effect: string, value?: any }>`

---

### 2.4 自动化核验与凭证机制 (Verification & Evidence)

#### `check.run` (CLI 亲自执行凭证 —— 机器验证)
由 `tl check` 唯一生成并写入日志。系统亲自 spawn 子进程执行外部测试/构建命令，并收集真实退出码与执行耗时。
- **安全性**：经过 hold 闸门（执行前检测，无绕过路径）；只记录摘要，**严禁记录命令原文、输出内容与环境变量**。
- `ref`: `"T<n>"` 所属工作项编号
- `data`:
  - `id`: `"C<n>"` 凭证编号（如 `"C1"`）
  - `name`: `string` 检查名称或简短描述
  - `result`: `"pass" | "fail"`（退出码 0 为 pass，非 0 为 fail）
  - `exit`: `number` 退出码（如 0, 1, 127）
  - `dur_s`: `number` 耗时秒数（如 1.8）
- **不可伪造性**：若调用者试图使用 `tl append --type check.run` 手动追加伪造机器验证，`tl.mjs` 会无条件强制降级为 `check.claim`，并在载荷中标记 `forced: "check.claim"`，确保机器凭证不可由提示词凭空自述。

#### `check.claim` (口述与降级检查凭证)
由用户或 agent 口述自述的检查，或手工 append 的检查。
- `ref`: `"T<n>"`
- `data`: 同上，但来源标记为 `src: "claimed"`。
- **页面表现与预算**：页面上标有明显的口述标记，复核注意力预算会将其与机器验证严格区分（仅有自述检查的项无法享受机器验证通过的优先级扣减）。

#### `artifact` (交付产物凭证)
记录此工作项产出的实质性文件或报告。
- `ref`: `"T<n>"`
- `data`:
  - `title`: `string` 产物名称
  - `path`: `string` 相对仓根的文件路径
  - `summary`: `string` 简要说明

---

### 2.5 卡点与阻塞 (Stuck & Blockers)

#### `stuck.open`
记录长任务中的阻塞或卡点。
- `ref`: `"K<n>"`
- `data`:
  - `severity`: `"warn" | "block"`（`block` 将使关联工作项显示为 blocked 阻断态）
  - `what`: `string` 卡住的现象或错误
  - `tried`: `string[]` 已尝试过的解法
  - `needs`: `string` 需要外部提供的输入、密钥或决策
  - `item`: `string | null` 关联的工作项编号 `T<n>`

#### `stuck.close`
解除卡点。
- `ref`: `"K<n>"`
- `data`:
  - `note`: `string` 解除方法说明

---

### 2.6 复核评审 (Review)

- `review.ok`: 标为复核通过。`data: { by, note, batch, low }`
- `review.flag`: 标记需要关注的疑点。`data: { by, note }`
- `review.redo`: 要求返工，将工作项打回 `todo` 并记录一轮历史。`data: { by, note }`

---

## 3. 完整生命周期流转实录 (End-to-End Walkthrough)

以下是一段标准的工作项推进流程：从新增任务、开工绑定决策、执行测试命令获取真实凭证，到最终完成并附带代码改动统计。

```jsonl
{"seq":1,"t":"2026-09-29T08:00:00.000Z","type":"run.start","run":"run-auth-refactor","actor":"system","data":{"title":"重构认证模块","goal":"迁移至JWT无状态鉴权","type":"engineering"}}
{"seq":2,"t":"2026-09-29T08:01:00.000Z","type":"decision.open","ref":"D1","actor":"main","data":{"title":"Token存储介质","question":"客户端Token存放在何处？","mode":"provisional","options":[{"key":"A","label":"HttpOnly Cookie","default":true,"reversible":true,"impact":{"declared":{"redo":[],"side_effects":[]}}},{"key":"B","label":"LocalStorage","default":false,"reversible":true,"impact":{"declared":{"redo":[],"side_effects":[]}}}]}}
{"seq":3,"t":"2026-09-29T08:02:00.000Z","type":"item.add","ref":"T1","actor":"main","data":{"title":"实现 JWT 签发与验证中间件","deps":[],"origin":{"type":"discovered","ref":null,"summary":"核心鉴权管道"},"owner":"main"}}
{"seq":4,"t":"2026-09-29T08:03:00.000Z","type":"item.start","ref":"T1","actor":"main","data":{"progress":0,"owner":"main","assumes":[{"decision":"D1","option":"A","confirmed":false}],"checkpoint":"git:a1b2c3d"}}
{"seq":5,"t":"2026-09-29T08:08:00.000Z","type":"check.run","ref":"T1","actor":"system","data":{"id":"C1","name":"JWT 单元测试","result":"pass","exit":0,"dur_s":2.4}}
{"seq":6,"t":"2026-09-29T08:09:00.000Z","type":"check.claim","ref":"T1","actor":"main","data":{"id":"C2","name":"手动验证过期刷新行为","result":"pass","exit":0,"dur_s":10.0}}
{"seq":7,"t":"2026-09-29T08:10:00.000Z","type":"item.done","ref":"T1","actor":"main","data":{"outcome":"completed","active_seconds":420,"changes":[{"path":"src/auth/jwt.ts","add":120,"del":15},{"path":"test/jwt.test.ts","add":85,"del":0}],"attribution":"exact","summary":"完成 JWT 签发、解密校验中间件并通过全量单测"}}
{"seq":8,"t":"2026-09-29T08:11:00.000Z","type":"decision.answer","ref":"D1","actor":"user","data":{"key":"A","by":"user","via":"chat"}}
{"seq":9,"t":"2026-09-29T08:12:00.000Z","type":"run.end","actor":"system","data":{"status":"done"}}
```

在此流程中：
1. `D1` 在开工前以 `mode: provisional` 打开，默认选项为 `A`；
2. `T1` 开工时（`item.start`）将 `D1=A` 冻结在 `assumes` 列表中；
3. `C1` 经由 `tl check -- npm test` 获得不可伪造的真实 `check.run` 凭证；
4. `C2` 为开发者补充的手动自述凭证 `check.claim`；
5. `T1` 完成时上报了改动路径与精确耗时；
6. 用户最终确认答复 `D1=A`，`T1` 的 `assumes[0].confirmed` 自动翻转为 `true`。
