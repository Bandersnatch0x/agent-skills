---
name: visualize
description: Render a repository's agent workflow and its tracker state as self-contained HTML+SVG views — a static overview of pipeline stages and cross-cutting mechanisms read from the repository's own workflow document, and a frozen census board of a map's sub-issue state with blocking edges. Use when someone asks to see, draw, audit, or report on the workflow itself or on how the tickets of a map stand.
---

# 工作流视觉化

把「流程」与「票况」各画成一张**自包含、可离线、可复现**的图。两刀共用一套皮肤面(代币只有一份),产出两份独立文件。

## 何时使用

- 想看**流程本身**:七个阶段的顺序、进入规则、横切机制落在哪一条底带上 → 静态刀。
- 想看**票况**:某张地图下各票的认领与阻塞状态,冻结成一张可归档的板 → 动态刀。
- 汇报或审计:要一张能直接发出去、不依赖网络与脚本的图。
- 不适用:要交互式看板(本技能产物是生成时固化的静态文件);要单票生命周期图(不在范围内)。

## 怎么用

1. **定事实来源(静态刀)**。默认读目标仓自己的 `docs/agents/dev-workflow.md`;文件不存在就**拒绝产图**并指路「先跑装配命令」,`--src` 可指别处已装配文档。绝不内置兜底阶段表。
2. **产静态图**:`node scripts/gen.mjs [--src <工作流文档>] [<输出路径>] [--check]`。
   三段式:参数契约 → 坐标公式 → 复现清单;**清单未过不写出**;`--check` 只校验不写盘。
   形态断言(阶段数、进入规则落点、横切机制表、槽位残留)在写出前必须通过。
3. **取数(动态刀第一步)**:`node scripts/fetch-tracker.mjs [--repo <owner/name>] [--map <票号>] [--out <路径>]`。
   只读:取地图子票与每票的阻塞关系;**读不到即拒绝产图**(不产部分图,也不产空板),退 2 并给下一步。
4. **产动态图**:`node scripts/gen-board.mjs <票况快照> [<输出路径>]`。
   只吃快照、不碰网络;生成时**固化一次**,不做运行时刷新;快照时点画进图内。
5. **自检**:对抗夹具 `node scripts/run-fixtures.mjs` 覆盖「取不到 / 空票况 / 有票不落列 / 超限只转一列 / 等外部态 / 双面阻塞优先 / 两刀共用皮肤面」七条路径。
6. **交付判据**:两刀都要求**同输入两跑逐字节相同**;静态刀另要求复现清单全过。

## 边界

- **不内置兜底表**:解析不到就断言失败,绝不画一张「差不多」的图。
- **产物是生成时固化的自包含 HTML + 内联 SVG**,无脚本、无外链;要更新就重跑,别手改产物。
- **只读目标仓**:除输出文件外不改任何东西;改票、打标签、推送这类写操作一律不做。
- **皮肤面只有一份**(`scripts/tokens.mjs`),两刀共用;换色只改那一处,改完两图同变。
- **单票生命周期图不在范围内**:动态刀只做地图票况普查。
- **定位**:本技能是**装在本机全局的工具**,不随任何仓的装配分发;任何持有工作流文档的仓都能画。
