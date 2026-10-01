# 长任务复核台账基础 UI 模板 (timeline-show / templates)

本目录为「一次长任务的 TODO / DOING / DONE 复核台账」的基础 HTML 页面模板与独立验证套件。
严格遵循零依赖、零外链、纯本地 `file://` 运行、无 `eval`、全 `textContent` 渲染、以及基于动态 `<script>` 标签的 10 秒无重载自刷新架构。

---

## 📁 目录结构

```text
skills/engineering/timeline-show/templates/
├── timeline.html             # 核心台账页面模板（单一真源，双击即开，CSP 禁用网络）
├── style.css                 # 样式表（单一真源，继承 visualize 皮肤代币，零硬编码颜色）
├── app.js                    # 渲染与 10s 动态自刷新驱动（单一真源，全 textContent，滚动条原位保持）
├── state.js                  # 规范数据形状的存根数据（纯数据赋值 window.__TL__）
├── tokens.mjs                # 皮肤设计令牌 ES 模块（薄加载器，TOKEN 取自技能真源 scripts/tokens.json）
├── check.mjs                 # 自动化断言自检套件（静态规则、跨平台 Chrome 探测、XSS 注入、Headless 实测）
├── README.md                 # 交付说明文档（本文件）
├── demo/
│   └── mutate.mjs            # 状态改写演示脚本（每几秒改写一次 state.js，验证 ~10s 无重载更新）
└── screenshots/
    ├── light.png             # 浅色模式 1× 视觉证据截图（泳道与状态标记肉眼可分辨）
    └── dark.png              # 深色模式 1× 视觉证据截图（高对比暗色主题）
```

---

## 🚀 怎么开（快速启动）

1. **直接双击**：
   在资源管理器中直接双击打开 `templates/timeline.html`。
2. **零网络要求**：
   页面在 `file:///` 协议下直接运行，无需启动任何 HTTP 静态服务器，零外部依赖，零网络请求。同目录的 `style.css`、`app.js`、`state.js` 均为同级相对路径，无任何跨目录安全沙箱限制。

---

## 🧪 怎么验（验证方法）

### 1. 自动化全量断言自检（推荐首选）
在 `templates/` 目录下执行自检脚本：
```bash
node check.mjs
```
该脚本会自动完成：
- **静态约束检测**：外链检测、CSP 检查、无 eval、无 innerHTML、CSS 无硬编码颜色。
- **真源收敛与去重检查 (R1 & R3)**：断言 `demo/` 下无重复同名文件，断言 `templates/` 内无第二份 `tokens.json`，断言 `tokens.mjs` 里没有内联颜色字面量、且加载出的 `TOKEN` 与同技能真源 `scripts/tokens.json` 逐值相同。
- **Chrome 跨平台探测 (R2)**：按「`CHROME_PATH` 环境变量 → 常见系统安装路径 → 系统 `PATH`」自动探测 Chrome / Edge / Chromium。若显式指定但文件不存在，明确报错阻断退出（退出码 1）。
- **转义与恶意注入测试**：验证 `</script>`、`U+2028`、`U+2029`、`img onerror`、API 密钥安全转义且作为惰性纯文本展示。
- **真实 Headless Chrome 端到端实测**：加载 `templates/timeline.html`，断言控制台 0 报错、0 外部请求、卡片完整挂载、服务端 ISO 时间戳无直接打印。
- **停滞措辞与口径隔离逐字契约 (SKILL.md:68-76)**：逐字断言「`语义更新停在 {X} 分前`」（X 计算自 `state.run.updated_at`），不足 1 分钟固定显示「`语义更新停在 1 分前`」（绝不显示「`0 分前`」），空 run 显示「`尚无语义记录`」，并验证口径与每 10 秒刷新一次的 `generated_at` 严格隔离。
- **10 秒无重载动态自刷新实测**：动态改写文件系统上的 `state.js`，断言新数据在下一拍生效，且页面持续在线计数器与滚动位置保持不变（证明未发生全局重载）。
- **视觉证据截图**：自动生成浅色与深色模式的高清证据截图至 `screenshots/`。

### 2. 人工观察 10 秒无重载动态自刷新
1. 双击用 Chrome 或 Edge 打开 `templates/timeline.html`；
2. 保持浏览器窗口在屏幕一侧；
3. 在终端启动改写演示脚本：
   ```bash
   node demo/mutate.mjs --interval 4000
   ```
4. 观察浏览器页面：
   - 页面内的 **「页面存活计数器」** 持续按秒递增（如 `12s`、`13s`、`14s`...），证明页面**没有全局 reload**；
   - 随滚动条滚动到某一位置，刷新时视口**不跳动**；
   - 在 ~10 秒内（或点击右上角「立即刷新」），任务 T3 自动完成、阻断红框自动消除、长出突发衍生项 T7，视图平滑就地更新。

---

## 🛠️ 返修轮（3 项）落实说明

### R1 — 消除重复文件，收敛单一真源
- **决策与落实**：消除了 `demo/` 目录下的 4 个冗余副本（当时的页面副本，以及 `demo/style.css`、`demo/app.js`、`demo/state.js`，共消除约 45KB 冗余）。
- **留下的真源**：全部收敛于 `templates/` 根目录（`timeline.html`、`style.css`、`app.js`、`state.js`）。
- **设计理由**：
  1. `templates/` 根目录是供技能消费者（如 `tl init`、`tl export` 等）分发的标准资产目录，无需经过 `demo/` 中转。
  2. `templates/timeline.html` 与同级资源的相对路径均为同目录（`./`），彻底避免任何向上跨目录（`../`）在严格沙箱或跨平台浏览器（如 Firefox `security.fileuri.strict_origin_policy`）下的潜在安全阻断。
  3. `demo/mutate.mjs` 作为唯一的演示改写脚本保留，默认改写 `../state.js`（即 `templates/state.js`），支持 `--state <path>` 自定义指定。
  4. `check.mjs` 中添加断言，确保 `demo/` 不再存在冗余同名副本。

### R2 — 跨平台 Chrome 探测，禁止硬编码单一路径
- **落实机制**：`check.mjs` 内置 `findChromeExecutable()` 函数，按顺序探测：
  1. 环境变量 `CHROME_PATH`（若显式指定但文件不存在，抛出明确错误并阻断，不静默回退）；
  2. Windows / macOS / Linux 操作系统常见安装路径（Google Chrome、Microsoft Edge、Chromium 等）；
  3. 系统 `PATH` 环境变量中注册的浏览器命令。
- **全未命中时**：明确打印错误信息与指路说明（提示在各个终端如何配置 `$env:CHROME_PATH` / `export CHROME_PATH`），并以非零退出码（`exit 1`）阻断，绝不静默跳过，绝不把找不到算作通过。
- **依赖**：纯 Node 标准库（`node:fs`, `node:path`, `node:os`, `node:child_process`），零外部依赖。

### R3 — 收敛 tokens 真源，数据只存一份
- **落实机制**：
  1. 确认无任何运行时依赖后，彻底删除了 `templates/tokens.json`；
  2. `templates/tokens.mjs` 退化为**薄加载器**，`TOKEN` 从同技能真源 `../scripts/tokens.json` 读入
     ——**不在 templates/ 内再内联一份值**（内联等于同一个技能里存两份数据，正是 R3 要消掉的问题换个位置）；
  3. `GRID` 与 `cssVars()` 是**代码**不是数据，按 [11]「只共享数据，不共享代码」留在原处；
  4. `check.mjs` 断言三件事：`templates/` 内没有第二份 `tokens.json`、`tokens.mjs` 里**没有内联颜色字面量**、
     实际加载出的 `TOKEN` 与真源逐值相同。
- **跨技能漂移不再由 `check.mjs` 负责**：它原先伸到 `../../visualize` 去比对，技能一旦被单独安装到别处
  就失效（且原文用 `if (existsSync)` 包着，缺席时静默跳过、照样报全绿）。现在那道闸只有一个家：
  仓内 `scripts/run-skill-fixtures.mjs` 的漂移夹具，逐字节比对两份 `scripts/tokens.json`。

---

## 💡 核心四问实现与视觉映射

| 核心问题 | 页面对应区域与表达机制 |
|---|---|
| **1. 做到哪了** | 头部完成率进度条 + 三泳道主线视图（待办 `TODO`、进行中 `DOING`、已完成 `DONE`）。每张卡片展示来源标签（`预置声明` / `突发衍生`）、轮次（`R1`）与状态标记。 |
| **2. 哪里卡住** | `🚨 哪里卡住 (Blockers)` 红色警示面板。展示阻断事件 `K1`、阻塞时长（客户端时钟动态派生）、并在泳道中高亮带有受阻标记的卡片（虚线边框+强调底色）。若无阻断显示绿色平稳提示。 |
| **3. 什么在等我** | `⚖️ 待裁决事项 & 默认走向 (Decisions)` 面板列出状态为 `open` 的决策项；下方 `👀 需优先关注 (Attention Items)` 按权重列出关联工作项与排查原因。 |
| **4. 我不回答会怎样** | 在待裁决项卡片中醒目标记 **「⚠️ 若无干预将执行默认走向：【选项 A】」**，并列出四象限影响后果矩阵：<br>• `将导致返工 (Redo)`：关联受损任务列表<br>• `解锁推进 (Unlock)`：将被解锁的任务列表<br>• `排除方案 (Rules Out)`：被彻底舍弃的备选方案<br>• `沉没耗时 (Sunk)`：将损失的沉没工时 |

---

## 🛡️ 硬约束落实清单

- **C1**: `state.js` 纯数据赋值（`window.__TL__ = <JSON>;`，无副作用）。
- **C2**: 10 秒刷新每拍新建 `<script>` 并移除旧元素，元素不复用。
- **C3**: `localStorage` 键名强制带 `tl_${runId}_` 前缀。
- **C4**: 数据转义 `<`、`>`、`&`、`U+2028`、`U+2029`。
- **C5**: 零 `innerHTML`、零 `eval`，全 `textContent` 渲染。
- **C6**: 页面禁止直接打印服务端生成时间，全部由客户端 `Date.now()` 动态派生。数据状态新鲜度严格遵循 `SKILL.md:68-76` 逐字契约，以 `run.updated_at` 派生停滞措辞（`语义更新停在 {X} 分前` / `语义更新停在 1 分前` / `尚无语义记录`），并与每拍自刷新的 `generated_at` 彻底隔离。
- **C7**: CSP 禁止网络（`default-src 'none'`），单文件零外链。
- **C8**: 禁用任何影视作品名称、角色或台词。
- **C9**: 中文成文，技术标识符保留原文。

---

## ⏱️ 停滞措辞与口径隔离逐字契约 (SKILL.md:68-76)

- **逐字措辞**：`语义更新停在 {X} 分前`
- **口径隔离**：
  - 严格取自 `state.run.updated_at`（最后一条合法语义事件时刻），绝对不与每 10 秒刷新一次的 `generated_at` 混淆。
  - 计算规则：`Math.floor((Date.now() - Date.parse(run.updated_at)) / 60000)`。
  - 不足 1 分钟（`< 60000ms`）：严格显示 `语义更新停在 1 分前`（绝不显示 `0 分前`）。
  - 空 run（`run.updated_at` 为空/不存在）：显示 `尚无语义记录`。
- **渲染与时钟**：全由客户端 `Date.now()` 驱动，在 `render(state)` 与每秒 `updateTimeDisplays()` 中实时刷新。
