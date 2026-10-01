# 不接入 Firecrawl 的比赛检索优化方案

> 研究日期：2026-09-01（Asia/Shanghai）
>
> 结论范围：只研究不接入 Firecrawl、也不复制其源码时，如何优化 `find-hackathons` 的发现速度、召回率、赛事级去重和官方规则核验。本文不把一次抓取失败解释成平台没有 API，也不把搜索引擎摘要当作证据。

## 结论摘要

推荐实现一个本地、来源适配器驱动的三层流水线：

```text
官方目录 / 官方 sitemap
        -> 宽搜发现（少量请求、记录候选和原始链接）
        -> 候选详情（只抓未结束或日期未知的候选）
        -> 官方规则 / 奖品核验（逐字段证据、冲突即不确定）
```

首选直接 HTTP：Node 内置 `fetch`、`AbortSignal.timeout()`、有限并发、每源限流和条件请求缓存。只有页面必须执行 JavaScript、或 HTML 明确是 Cookie/渲染门槛时，才升级到 Playwright；不绕过登录、验证码、robots 或访问控制。

八个现有来源不能共用一个“通用网页爬虫”假设。当前能直接确认的入口是 MLH、TAIKAI、lablab.ai 和 ETHGlobal；Unstop 有公开目录路径但本次响应被 Cookie 门槛占据；Devpost、DoraHacks、Encode 的可运行发现接口在本次核验中未确认。未知项进入适配器状态和可观测性，不进入虚构的 API 列表。

## 当前仓库边界

### 来源事实

- `find-hackathons` 的工作流要求从 Devpost、MLH、DoraHacks、Taikai、lablab.ai、Encode、ETHGlobal、Unstop 等入口发现候选，再以官方规则和条款为权威完成核验；详见仓库中的 [`SKILL.md`](../SKILL.md)，核验日期 2026-09-01。
- 现有 [`data-contract.md`](data-contract.md) 定义了 `deadlineAt`、`eligibility`、`prizes`、`submissionArtifacts`、`capabilities` 和 `sources` 等输出字段；核验日期 2026-09-01。
- 现有 [`generate-page.mjs`](../scripts/generate-page.mjs) 读取 JSON 并生成本地筛选页，负责数据校验和展示；它没有 HTTP 抓取、并发调度、缓存、去重或规则证据采集逻辑，核验日期 2026-09-01。

### 本项目建议

运行时检索器应保持内部抓取账本与展示契约分离：账本保存响应状态、缓存元数据、解析版本、原文摘要/哈希、失败类别和每字段证据；只有通过规则核验的事件才映射到现有 `data-contract.md`。这样不会为了支持重试和审计而扩大现有本地页面契约。

## 一手来源核查矩阵

下表只记录本次访问实际确认的内容。`未知` 是结论，不是对平台能力的否定。

| 来源 | 已确认的官方发现入口与响应事实 | 时间 / 分页 / 规则入口 | JavaScript 与未知项 |
|---|---|---|---|
| Devpost | `https://devpost.com/hackathons` 在 2026-09-01 的 Node HTTP 探测返回 `202`、`text/html`，响应体为 0 字节，`Cache-Control: no-store, max-age=0`；`https://devpost.com/robots.txt` 同样返回 `202`、0 字节。来源：[`devpost.com/hackathons`](https://devpost.com/hackathons)、[`devpost.com/robots.txt`](https://devpost.com/robots.txt)，核验日期 2026-09-01。 | 目录分页、稳定日期字段、公开 API、sitemap 和官方规则入口均未从这次响应确认。 | 本次结果不能判断是反爬、临时异步响应还是需要浏览器；不得把猜测的 JSON 接口写入适配器。状态应为 `entry_unverified`，后续仅在取得官方可访问入口或人工提供链接后启用。 |
| MLH | `https://mlh.io/seasons/2026/events` 重定向到 `https://www.mlh.com/seasons/2026/events`，返回 `200`，服务端 HTML 包含 2026 赛季事件、地点、区域和 `Digital`/`In-Person` 等展示字段。来源：[`mlh.io/seasons/2026/events`](https://mlh.io/seasons/2026/events)，核验日期 2026-09-01。 | 官方事件详情 `https://events.mlh.io/events/14061-midnight-hackathon-may-2026` 返回 `200`；HTML 包含活动开始/结束时间、`Event is hosted online`、`This event ended`、日程中的 Initial/Final Submission、Devpost 链接和 `https://hackp.ac/ContestTerms` 条款链接。来源：[`MLH event detail`](https://events.mlh.io/events/14061-midnight-hackathon-may-2026)，核验日期 2026-09-01。 | 目录和详情在本次响应中未显示 Next.js 标记或明显的 XHR/GraphQL 线索，适合先用 HTTP 解析。分页参数或公开 API 未确认；不能假定赛季页覆盖所有独立赛事。MLH robots 允许根路径但禁止 `/graphql` 等路径。来源：[`mlh.io/robots.txt`](https://mlh.io/robots.txt)，核验日期 2026-09-01。 |
| DoraHacks | `https://dorahacks.io/hackathon`、`https://dorahacks.io/hackathon/`、主页及 `https://dorahacks.io/robots.txt` 在本次 HTTP 核验均返回 `405`；这只证明当前探测方式未取得内容。来源：[`dorahacks.io/hackathon`](https://dorahacks.io/hackathon)、[`dorahacks.io/robots.txt`](https://dorahacks.io/robots.txt)，核验日期 2026-09-01。 | 官方分页、日期字段、公开 API、sitemap 和规则页未确认。 | JavaScript 要求、方法限制原因和是否存在其他官方入口均未知。不要切换到未证实的 `/api`、GraphQL 或内部接口。 |
| TAIKAI | `https://taikai.network/en/hackathons` 返回 `200`；响应包含 Next 数据、Next 静态资源和 JSON-LD 标记。来源：[`taikai.network/en/hackathons`](https://taikai.network/en/hackathons)，核验日期 2026-09-01。 | `https://taikai.network/sitemap.xml` 是官方 XML sitemap，包含组织者/赛事路径及 `/timeline`、`/rules`、`/faqs`、`/prizes` 子路径，并提供 `lastmod`。示例路径可见于该 sitemap；来源：[`taikai.network/sitemap.xml`](https://taikai.network/sitemap.xml)，核验日期 2026-09-01。 | 目录存在 SSR/Next 数据，优先尝试解析 HTML 中的结构化数据和链接；只有候选字段未物化时再浏览器升级。TAIKAI robots 声明 sitemap 并禁止 `/auth`。来源：[`taikai.network/robots.txt`](https://taikai.network/robots.txt)，核验日期 2026-09-01。sitemap 的 `lastmod` 是资源更新时间，不应直接当作比赛截止时间。 |
| lablab.ai | `https://lablab.ai/event` 重定向到 `https://lablab.ai/ai-hackathons`；官方目录内容展示赛事名称、`LIVE`/`Register`、Online/Hybrid、日期范围、build 时长、技术方向和详情链接。来源：[`lablab.ai/event`](https://lablab.ai/event)、[`lablab.ai/ai-hackathons`](https://lablab.ai/ai-hackathons)，核验日期 2026-09-01。 | `https://lablab.ai/sitemap.xml` 是 sitemap index，列出 `server-sitemap/ai-hackathons/0` 等分片；目录示例可见日期和详情 slug，但本次没有确认目录分页参数或公开 API。来源：[`lablab.ai/sitemap.xml`](https://lablab.ai/sitemap.xml)，核验日期 2026-09-01。 | robots 明确限制 dashboard、登录、评审等路径，公开赛事路径没有被本次规则命中禁止。来源：[`lablab.ai/robots.txt`](https://lablab.ai/robots.txt)，核验日期 2026-09-01。当前直连探测和内容转换结果对响应体表现不一致，因此适配器必须记录重定向、零字节和解析失败，不应默认为“无赛事”。 |
| ETHGlobal | `https://ethglobal.com/events` 返回 `200`；官方页面包含 `Upcoming` 区域和活动卡片的月份/日期展示，HTML 还包含 Next 静态资源标记。来源：[`ethglobal.com/events`](https://ethglobal.com/events)，核验日期 2026-09-01。 | 从该官方列表可取得详情链接，详情 URL 必须使用页面实际发现的 href；本次没有确认独立公开 API、分页参数或 sitemap。测试的 robots/sitemap 根路径返回 `404`，不等于平台没有其他规则入口。来源：[`ethglobal.com/events`](https://ethglobal.com/events)，核验日期 2026-09-01。 | 页面可能依赖 Next 客户端状态，先解析服务端 HTML/内嵌数据，失败才用 Playwright。不要自行拼接不存在的 slug，也不要以赛事卡片月份替代官方提交截止时间。 |
| Unstop | `https://unstop.com/hackathons` 返回 `200`，但正文是 `Cookies Disabled` / `Please enable cookies` 门槛，没有候选事件。该响应仍提供 `ETag` 和 `Last-Modified`。来源：[`unstop.com/hackathons`](https://unstop.com/hackathons)，核验日期 2026-09-01。 | `https://unstop.com/robots.txt` 允许 `/hackathons/`、`/_next/` 和 `/api/public/*`，但这只是 robots 规则，不是 API 存在或字段 schema 的证明；sitemap URL 本次返回同样的 Cookie 门槛 HTML而非可解析 XML。来源：[`unstop.com/robots.txt`](https://unstop.com/robots.txt)、[`unstop.com/sitemap.xml`](https://unstop.com/sitemap.xml)，核验日期 2026-09-01。 | 需要浏览器/Cookie 的可能性已观察到，但是否可在不登录、不绕过挑战的前提下取得列表未知。只有通过官方页面实际网络请求或官方文档确认后，才可实现对应适配器；否则保留 `cookie_gate` 失败状态。 |
| Encode | `https://www.encode.club/` 重定向到 `https://www.encodeclub.com/`，返回 `200`，主页包含 JSON-LD。来源：[`www.encode.club/`](https://www.encode.club/)，核验日期 2026-09-01。 | 本次测试的 `https://www.encode.club/hackathons`、`/programmes`、`/events` 返回 `404`；当前事件目录、分页、日期字段、公开 API、sitemap 和规则入口未确认。来源：[`www.encode.club/hackathons`](https://www.encode.club/hackathons)、[`www.encode.club/programmes`](https://www.encode.club/programmes)、[`www.encode.club/events`](https://www.encode.club/events)，核验日期 2026-09-01。 | 主页可直接取到并不代表赛事目录可取到。适配器应先记录 `entry_unverified`，不应根据旧路径或搜索摘要编造入口。 |

### 矩阵解读

- 目前可落地的第一批直接 HTTP 适配器是 MLH、TAIKAI、lablab.ai、ETHGlobal；其中 TAIKAI/lablab.ai 适合补充 sitemap 发现，MLH 适合目录到详情链路，ETHGlobal 需要重点验证服务端数据是否完整。
- Unstop 是“入口存在但内容被门槛覆盖”，应进入浏览器升级实验而不是直接判定无赛事。
- Devpost、DoraHacks、Encode 目前没有足够证据支持运行时适配器。将它们排除在当前验证统计之外会掩盖召回风险，因此统计应分别报告 `source_not_ready` 和已启用来源结果。

## 直接 HTTP、限流、超时与缓存

### 来源事实

- Node 的全局 `fetch()` 是浏览器兼容的 HTTP API，Node 文档说明其实现基于 Undici；来源：[`nodejs.org/api/globals.html#fetch`](https://nodejs.org/api/globals.html#fetch)，核验日期 2026-09-01。
- `AbortSignal.timeout(delay)` 会在指定毫秒数后触发 abort；来源：[`nodejs.org/api/globals.html#abortsignaltimeoutdelay`](https://nodejs.org/api/globals.html#abortsignaltimeoutdelay)，核验日期 2026-09-01。
- Node 的 `node:timers/promises` `setTimeout` 接受 `AbortSignal`，取消时 Promise 以 `AbortError` 拒绝；来源：[`nodejs.org/api/timers.html#timerspromisessettimeoutdelay-value-options`](https://nodejs.org/api/timers.html#timerspromisessettimeoutdelay-value-options)，核验日期 2026-09-01。
- RFC 9110 定义了 `If-None-Match` 条件 GET，并说明服务器可用 `304 Not Modified` 表示缓存表示未变化；RFC 同时规定 `If-None-Match` 比 `If-Modified-Since` 更准确。来源：[`RFC 9110 §13.1.2`](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2)、[`RFC 9110 §13.2.2`](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.2)，核验日期 2026-09-01。
- RFC 9309 定义 robots 的 product token、User-Agent 组及 Allow/Disallow 规则。来源：[`RFC 9309 §2.2.1`](https://www.rfc-editor.org/rfc/rfc9309#section-2.2.1)、[`RFC 9309 §2.2`](https://www.rfc-editor.org/rfc/rfc9309#section-2.2)，核验日期 2026-09-01。
- Sitemap 协议支持 sitemap index、`loc` 和可选 `lastmod`，并把 sitemap index 作为多个 sitemap 文件的分组方式。来源：[`sitemaps.org protocol`](https://www.sitemaps.org/protocol.html)、[`sitemap index`](https://www.sitemaps.org/protocol.html#index)，核验日期 2026-09-01。

### 本项目建议

1. 每个来源定义一个 adapter：`discoverListing`、`discoverSitemap`、`parseCandidate`、`resolveDetail`、`resolveRules`、`classifyFailure`。适配器只使用已确认的官方入口；入口未确认时返回显式 `source_not_ready`。
2. 每次 HTTP 请求都带稳定的识别 User-Agent、来源标签和请求 ID；记录最终 URL、重定向链、状态码、内容类型、响应字节、耗时、`ETag`、`Last-Modified`、`Cache-Control` 和解析器版本。
3. 使用两级并发：全局并发上限建议从 6 开始，每个 origin 默认并发 1，连续成功后最多提升到 2；每个 origin 使用 token bucket 和随机抖动。限流是建议值，不是平台允许值，必须根据 429/Retry-After 和监控动态降速。
4. 重试只用于网络断开、超时、408、425、429 和 5xx；最多 2 次，采用指数退避加抖动，并尊重有效的 `Retry-After`。405、404、robots 禁止、登录/验证码门槛和解析错误不应盲目重试。
5. 单请求必须有超时；建议首轮列表 8 秒、详情/规则 12 秒、浏览器页面 20 秒，整个运行有 45 秒软预算和 60 秒硬截止。超时后保留候选状态，不把它当作“没有赛事”。
6. 采用持久化 HTTP cache：缓存键是规范化 URL 加请求方法/必要的语言标识；保存正文或压缩正文、响应头和抓取时间。若有 `ETag`，下次发 `If-None-Match`；没有时再用 `Last-Modified`/`If-Modified-Since`。收到 304 时沿用上次正文并更新访问时间；若服务器没有验证器，则使用 TTL 和内容 SHA-256。
7. 建议默认 TTL：列表 15 分钟，sitemap 30 分钟，普通详情 6 小时，规则/奖品 6 小时；距截止时间 48 小时内将详情和规则 TTL 降到 30 分钟。所有 TTL 都是本项目初始值，响应的 `Cache-Control` 和实际错误率优先。
8. 只解析 XML sitemap 的 `loc`/`lastmod`，按 URL 路径白名单保留赛事详情、rules、prizes、faqs、timeline；`lastmod` 用于增量调度，不能填入 `deadlineAt`。
9. 按 RFC 9309 解析与发送匹配的 User-Agent，遵守来源 robots。robots 不可取得或语法无法确认时，对自动发现采用保守状态 `robots_unknown`，不通过换 User-Agent、绕过验证码或调用隐藏接口强行继续。

## URL 规范化与赛事级去重

### 来源事实

- WHATWG URL 标准定义 URL 的解析、序列化和 `URLSearchParams` 操作；来源：[`url.spec.whatwg.org`](https://url.spec.whatwg.org/)，核验日期 2026-09-01。
- Node `node:crypto` 提供 `crypto.createHash()`，可生成 SHA-256 等摘要；来源：[`nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options`](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options)，核验日期 2026-09-01。

### 本项目建议

URL 规范化分成“用于请求”和“用于去重”两个结果，避免为了去重破坏真实查询参数：

- 使用 WHATWG `URL` 解析相对链接；跟随重定向后把最终 URL作为强证据之一；移除 fragment、默认端口和明确的追踪参数（`utm_*`、`gclid` 等）；只对已知无语义参数做删除，不删除未知 query 参数。
- 主机名小写，保留路径语义；不依赖字符串大小写或 slug 猜测赛事身份。页面 `<link rel="canonical">` 只能作为候选信号，不能覆盖实际详情 URL 的证据。
- 第一层强去重键：同一 source 的稳定平台 ID；其次是规范化最终 URL。跨来源只有在“同一外链/平台 ID”或“规范化名称 + 同一届时间区间 + 同一组织者”至少两个稳定信号同时匹配时才合并。
- 名称归一化仅用于比较：Unicode 规范化、大小写折叠、空白/标点折叠、常见日期后缀分离。不要仅凭相似名称合并年度赛事、不同城市场次或同一主办方的不同挑战。
- 事件记录保留 `canonicalEventId`、所有发现 URL、所有来源、匹配信号和 `mergeConfidence`。低置信匹配进入 `possible_duplicate` 队列而不是静默丢弃。
- 使用 `crypto.createHash('sha256')` 对原始响应、抽取后的规范化证据块和规则文本分别留哈希；哈希用于变化检测和审计，不替代原文链接。

## 分层流水线

### 第一层：宽搜发现

目标是低请求量获得尽可能多的候选 URL，不在这里判断资格和奖品。

- 从每个已确认官方入口读取目录 HTML、JSON-LD、内嵌 SSR 数据和 sitemap index；优先解析“下一页”真实链接或 sitemap 的所有分片，不能假定 `page=2`。
- 只保存 `source`、发现 URL、最终 URL、标题、粗略日期文本、列表状态、发现时间和原始证据指针。列表里的月份或“LIVE”只作排序/预筛，不写成最终截止时间。
- 对上次已知的列表/sitemap 做条件请求；成功收到 304 时不重新解析。对最近一次出现过的事件 URL 保留短期 recheck，避免取消或延期变化被缓存遮住。
- 发现阶段不因日期解析失败丢弃候选：`deadline_unknown` 进入详情队列。硬过滤只可以淘汰已明确结束且规则证据足够的事件。
- 每次运行保留 `discovered_count`、`new_count`、`changed_count`、`unknown_date_count`、`source_not_ready` 和 `robots_unknown`。

### 第二层：候选详情

按“未结束优先、日期未知其次、最近变化优先”排序，只抓详情链接，不抓不可能进入用户时间范围的已确认过期事件。

- 详情 URL 必须来自第一层页面/sitemap 的真实链接或用户提供的官方链接；禁止由名称拼 slug。
- 先用 HTTP 解析 HTML、JSON-LD、内嵌结构化数据和规则/奖品链接；仅当正文是空壳、Cookie 门槛或字段由脚本物化时才进入浏览器队列。
- 详情层提取事件开始/结束、提交截止、地点/形式、主办方、赛道、技术要求、提交物、规则/条款/奖品链接。每个字段都保存来源 URL 和抽取定位。
- 同一事件被多个平台或主办方页面发现时合并抓取任务，但不删除来源证据。若详情页面变更，失效其规则证据并重新进入第三层。

### 第三层：官方规则/奖品核验

这是生成 shortlist 前的门槛，而不是详情解析的附带结果。

- 权威优先级沿用现有技能：官方规则/条款 > 主办方官方活动页 > 托管平台官方事件页 > 第三方列表。每个事件独立核验，不能把同系列赛事条款迁移过来。
- `deadlineAt` 必须来自提交/报名/活动规则中的明确时间，保留源时区和原始文本；活动结束时间不能替代提交截止时间。
- eligibility、地域、年龄、身份、队伍大小、必用技术、作品新旧规则、提交物和奖品逐字段检查。缺证据、来源冲突、正文被 Cookie/登录门槛覆盖时写 `uncertain`，不得生成 `eligible` shortlist 项。
- 奖品只记录官方原文和类型；现金、credits、hardware、services、swag、other 分开，不能把积分、云额度或服务估算成现金。
- 规则页、奖品页和活动页互相冲突时，保留冲突双方、抓取时间和哈希，状态为 `official_conflict`，交由人工处理；不能用最新抓到的页面静默覆盖旧证据。

### Playwright 升级边界

Playwright 官方文档说明它可以监控和修改页面发出的 HTTP/HTTPS 请求，包括 XHR 和 fetch；BrowserContext 可提供隔离的浏览器环境；locator 具有自动等待/重试能力。来源：[`Playwright network`](https://playwright.dev/docs/network)、[`Playwright browser contexts`](https://playwright.dev/docs/browser-contexts)、[`Playwright locators`](https://playwright.dev/docs/locators)，核验日期 2026-09-01。

本项目建议只在以下条件之一成立时升级：直连 HTML 无候选但浏览器页面可见；字段在首屏后由合法的公开请求填充；或 Unstop 类 Cookie 门槛可以在不登录、不绕过挑战的正常浏览器上下文中取得内容。使用一个浏览器进程、多个隔离 context，阻断图片/字体/分析资源，仅等待必要的 DOM/网络条件；每源浏览器并发 1。捕获公开 XHR 只能用于诊断和后续官方入口确认，不能把未经确认的内部 API 作为长期合同。若出现 CAPTCHA、登录、地区/权限墙，记录 `access_blocked` 并停止该来源。

## 推荐架构

```text
SourceRegistry
  ├─ official entrypoints + robots/sitemap policy
  ├─ HttpClient (timeout, retry, rate limit, conditional cache)
  ├─ BrowserEscalator (Playwright, opt-in per source)
  ├─ Adapter[MLH|Taikai|lablab|ETHGlobal|...]
  ├─ CandidateLedger (raw URL, response, fields, evidence, failures)
  ├─ Canonicalizer + EventDeduper
  ├─ VerificationQueue (deadline/eligibility/rules/prizes)
  └─ ContractMapper -> data-contract.md JSON -> generate-page.mjs
```

建议的内部记录最少包含：

```text
source, sourceRecordId, discoveredUrl, finalUrl, canonicalUrl,
discoveredAt, fetchedAt, phase, status, httpStatus, cacheState,
etag, lastModified, contentHash, parserVersion, eventFingerprint,
deadlineText, deadlineAt, evidence[], failureClass, retryCount
```

核心不变量：

1. 没有官方字段证据的字段值必须是 `unknown`，不能用列表猜测补齐。
2. 事件只有在每个用户选择的硬门槛都被官方证据支持后，才能进入 `eligible` 输出。
3. 去重只减少重复工作，不减少来源证据；任何低置信合并都可回滚/人工复核。
4. 单一来源失败不阻断其他来源，也不把失败伪装成空结果。

## 验收指标与可观测性

以下是本项目建议的初始验收门槛，不是平台承诺。先用冻结的官方页面/sitemap 快照建立 gold corpus，再以低频 live smoke 校验入口变化。

| 维度 | 指标与初始目标 | 测量方法 |
|---|---|---|
| 端到端速度 | 冷缓存八源运行 P95 <= 45 秒、硬截止 <= 60 秒；热缓存 P95 <= 10 秒；单源超时不拖住全局 | 记录 run、phase、source 的 monotonic duration；分别统计冷/热缓存和 HTTP/浏览器路径 |
| 宽搜召回 | 对每个启用来源，在冻结快照的“仍可能进入窗口”事件 URL 上召回率 >= 95%；新赛事 canary 不得因日期未知被丢弃 | 人工建立 source-specific gold URL 集；比较发现 URL 与最终规范化事件集，按来源报告 |
| 赛事去重 | 测试集错误合并为 0；已知重复发现的保留率 100%；其余目标是去重准确率 >= 99% | 构造同一届多 URL、多届同名、跨平台、同主办方不同场次四类夹具，人工标注真值 |
| 官方核验 | 进入 shortlist 的事件 100% 有 deadline、eligibility、submission、prize（适用时）的字段证据；候选详情核验成功率 >= 95% | 每个字段关联 URL、抓取时间、原文片段/定位和 parser version；缺字段即失败或 uncertain |
| 请求效率 | 热缓存列表条件请求不传正文；每源每轮默认 1 个列表请求加按需详情请求；详情只覆盖未结束/未知日期候选 | 统计 `request_count`、`bytes_received`、`cache_hit`、`not_modified`、`detail_selected` |
| 失败分类 | 失败分类覆盖 `timeout`、`dns`、`http_4xx`、`http_5xx`、`rate_limited`、`robots_disallowed`、`robots_unknown`、`cookie_gate`、`js_required`、`parse_error`、`missing_field`、`official_conflict`、`source_not_ready` | 每次失败保留 source、phase、URL、status、重试次数、耗时、是否可重试和最后错误；无空数组静默成功 |
| 稳定性 | 单源失败不使全局失败；运行结果必须区分 `success_with_gaps`、`success`、`failed` | run summary 保存启用源、不可用源、候选数、淘汰数、uncertain 数和证据覆盖率 |

建议最低可观测字段：`runId`、`source`、`phase`、`urlHash`、`startedAt`、`durationMs`、`cacheState`、`httpStatus`、`bytes`、`retryCount`、`failureClass`、`candidateId`、`evidenceCount`、`parserVersion`。日志不得记录 Cookie、Authorization 或其他凭据。

## 测试方案

### 离线单元与夹具

- URL：相对链接、重定向 URL、fragment、追踪参数、未知 query 参数、默认端口、不同路径大小写；验证请求 URL 与去重 URL 分离。
- sitemap：普通 urlset、sitemap index、多语言链接、`lastmod`、坏 XML、重复 loc、规则/prizes 路径白名单。
- 分页：真实 next href、无 next、重复 next、分页循环、列表中途 HTTP 失败；禁止只依靠“直到空页”。
- 日期：源时区、带时区 ISO、无时区文本、报名截止与活动结束并存、未知日期；验证不把无证据的日期写入 `deadlineAt`。
- 去重：同 URL 参数、同事件不同平台链接、同名不同届、同主办方不同城市、延期事件；验证错误合并为零。
- 证据：规则支持 deadline/eligibility/prize/submission 的字段映射，缺字段、冲突字段和旧哈希失效。
- 失败：Devpost 的 `202 + empty body`、DoraHacks 的 `405`、Unstop 的 `200 + Cookie gate`、404、429、Retry-After、超时；每种都必须得到正确 failure class，不能变成空结果。

### HTTP 与缓存集成测试

使用本地可控 HTTP server 模拟 200/304/404/405/408/429/5xx、重定向、ETag、Last-Modified、Retry-After、慢响应和截断正文。断言：

- 304 复用旧正文并更新访问元数据；
- ETag 优先于 Last-Modified；
- 只对可重试类别退避，重试次数有上限；
- 单请求 abort 后队列继续执行；
- 并发不超过 origin 限额；
- 缓存命中、未修改、正文更新和解析失败都有可观测记录。

### 浏览器与 live smoke

- 对一个本地 JavaScript 延迟渲染页面，验证 HTTP 路径标记 `js_required`、Playwright 路径等待必要 locator 后提取候选，并验证 BrowserContext 隔离。
- 对 Unstop 等真实门槛来源只做低频、无登录 smoke：验证能识别 Cookie 门槛/访问阻断即可，不把一次成功渲染当作永久 API 合同。
- 每个启用来源每日或每次发布做一次低频 live smoke；CI 不应并发打真实平台。快照差异超过阈值时报警，交由适配器更新。
- 用同一份 gold corpus 对新旧 parser 做回归，报告召回、字段覆盖、错误合并和规则证据覆盖，而不是只看进程退出码。

## 非目标

- 不接入 Firecrawl API、SDK、云服务，也不复制 Firecrawl 源码或其专有行为。
- 不抓取搜索引擎结果页，不把搜索摘要、第三方聚合描述或模型推断当作官方资格/截止时间/奖品证据。
- 不绕过 robots、验证码、登录、付费墙、地区限制、Cookie 同意/安全挑战或其他访问控制。
- 不在没有官方文档或实际公开页面证据时依赖隐藏 GraphQL、内部 JSON endpoint 或逆向出的请求 schema。
- 不在本阶段实现全网通用爬虫、自然语言规则裁决、自动报名、账号登录、奖品价值换算或跨来源强制合并。
- 不改变现有 `data-contract.md` 和 `generate-page.mjs` 的展示契约；运行时账本和指标属于后续实现范围。

## 风险与处置

| 风险 | 影响 | 处置 |
|---|---|---|
| 平台 HTML/类名、SSR 数据或路径变化 | 解析失败、召回下降 | source-specific parser version、live smoke、快照差异报警；失败显式分类 |
| 反爬、405、Cookie/JS 门槛 | 看似成功但实际漏赛 | 空响应/门槛不算成功；浏览器仅 opt-in；不能绕过挑战；报告 source gap |
| 过度并发触发 429 或封禁 | 延迟和覆盖下降 | 每源限流、Retry-After、随机抖动、条件缓存、浏览器并发 1 |
| sitemap `lastmod` 被误当截止时间 | 错误淘汰或错误推荐 | `lastmod` 只调度增量；deadline 必须由规则/提交字段支持 |
| 时区、延期和多种截止时间 | 用户看到错误剩余时间 | 保存源文本和源时区；区分报名、提交、活动结束；冲突转 uncertain |
| 同名赛事错误合并 | 漏掉独立赛事或错误证据串线 | 稳定 ID/URL 优先，跨来源至少两个信号，低置信进入人工复核 |
| 缓存过旧 | 奖品/资格已变更仍被推荐 | 截止前缩短 TTL、ETag revalidation、内容哈希、规则证据过期失效 |
| 来源不可验证被当成“无结果” | 召回统计虚高 | `source_not_ready`、`robots_unknown`、`access_blocked` 独立计数和最终报告 |
| 规则 PDF/外链/动态附件 | 字段证据不完整 | 第一阶段只把可访问官方文本作为 verified；附件解析另列任务，缺证据保持 uncertain |
| 机器人规则与平台条款变化 | 合规风险 | 每轮记录 robots 内容哈希和抓取时间；必要时停用该来源并人工确认 |

## 分阶段实施顺序

1. **阶段 0：基线与账本**。建立 source registry、统一请求结果/失败分类、缓存元数据、run summary 和一组官方 HTML/XML 冻结夹具。先把“空结果”和“来源失败”分开。
2. **阶段 1：直接 HTTP 宽搜**。实现 MLH、TAIKAI、lablab.ai、ETHGlobal；加入 robots/sitemap 解析、真实链接分页、ETag/Last-Modified、每源限流和候选账本。以宽搜召回和冷/热延迟为第一验收门槛。
3. **阶段 2：详情与官方证据**。实现详情、规则、奖品链接解析；按字段记录来源、原文定位、哈希和 parser version；接入 URL 规范化、事件级去重和 uncertain/official_conflict 状态；输出现有 data contract。
4. **阶段 3：浏览器升级**。仅针对实测 `js_required`/`cookie_gate` 的来源试验 Playwright，优先 Unstop；不登录、不绕过挑战。若无法取得稳定公开内容，保留 source gap，不降低核验门槛。
5. **阶段 4：剩余来源再评估**。依据官方新入口或人工提供的事件链接重新评估 Devpost、DoraHacks、Encode；没有一手入口就维持 `entry_unverified`，不以逆向隐藏接口作为完成条件。
6. **阶段 5：验收与维护**。运行离线 gold corpus、缓存/重试/去重回归和低频 live smoke；达到指标后再接入 `generate-page.mjs` 产物，并持续记录来源覆盖、缺口和解析版本。

## 最终建议

当前最有把握的优化不是增加一个全站通用抓取器，而是把“来源入口、缓存、调度、去重、证据”做成可观测的本地管线。先用直接 HTTP 覆盖已确认的 MLH、TAIKAI、lablab.ai、ETHGlobal，再对 Unstop 做受控浏览器实验；Devpost、DoraHacks、Encode 继续以未知状态报告。这样速度收益来自条件缓存和分层请求，召回收益来自 sitemap/真实分页/未知日期保留，可靠性收益来自官方字段逐项核验，而不是依赖不可验证的隐藏 API。
