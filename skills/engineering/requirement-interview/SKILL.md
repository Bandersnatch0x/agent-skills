---
name: requirement-interview
description: "Interview one decision at a time until a requirement's goal, scope and tradeoffs are settled, then stop before any code is written. Use when a request arrives as one sentence, when two readers could implement it differently, or when a plan needs stress-testing before build. Not for requirements whose decisions are already settled, and not for writing the spec itself."
---

# 拷问

把一句话需求变回一堆已经拍过板的决策,然后停手。这一站只管「我们理解的是不是同一个问题」。

## 何时使用

- 需求只有一句,谁都能照自己的理解动手。
- 同一句话两个人会做出两种行为。
- 方案将影响权限、资金、隐私、兼容或迁移,猜错的代价比多问几句高。

## 怎么用

1. 先扫仓库,不问人。受影响模块、既有约定、需求里自相矛盾的地方,凡能查到的都自己查。
2. 把需求画成决策树。每个分支是一个会改变行为或风险的取舍,分支之间尽量不重叠,按依赖排序。
3. 一次只问一个分支,等回答再走下一个。一次抛五个问题,人只会答最后两个,前面三个就被默认补全了。
4. 每问一个分支都带上推荐答案和理由。人只需否决或确认,不必从零想。
5. 事实与决策分开。能查到的算事实,自己查;会产生业务后果的算决策,必定交人拍板。事实不占人的注意力,决策不替人做主。
6. 每确认一个分支,立刻把它写成可检查的一句话,而不是形容词。「他人查看时范围外数据不进入接口响应」是决策;「注意隐私」不是。
7. 关键取舍未确认前,不写代码、不建票、不做方案。停下来是本阶段的正常工作,不是卡住。
8. 收口时给出五件东西:目标、范围、已确认决策清单、未决项、明确不做的事。

**判据。** 每个确认过的分支都能写成「给定…当…那么…」。写不出来的,说明还没问到底。

## 边界

- 不做技术方案。责任放哪一层、用什么结构,属于成谱。
- 不做任务拆分。拆成能独立验收的票,属于成票。
- 用户说「你决定」时,授权内的可逆选择按默认走并记理由;人工硬门仍然回抛,不用默认替人承担后果。
- 已经对齐过的需求不重复访谈。重复问一遍会让人开始敷衍确认,敷衍的确认比不确认更危险。
