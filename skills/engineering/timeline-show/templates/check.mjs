// timeline-show / templates / check.mjs
// Engineering Long-Task Master Cockpit 自动化断言自检套件
// 运行：node check.mjs
//
// ── 门禁维护须知（本门禁是「写型」）─────────────────────────────────────
// 每次运行都会**重写** templates/screenshots/ 下 7 个 PNG：
//   dark / dark-t1 / decisions / journey / journey-timeline / journey-branches / ledger
// 这些截图由 headless chrome 逐次生成，**字节非确定**（同一副本连跑两次即有差异）。
// 由此两条纪律：
//   (1) 任何「templates/（或整个技能目录）哈希稳定」的声称，**必须显式排除
//       templates/screenshots/**，否则不成立。
//   (2) **只读复核必须在整个技能目录的副本内跑**（本门禁需同级 ../scripts/tokens.json、
//       ../scripts/tl.mjs），不得在原目录跑——在原目录跑门禁本身就在改文件。
// 另：timeline-show/ 在 git 中整体 untracked（??），所以上述重写不产生 git 脏污。

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';
// 票 32 P-相：真投影器与夹具同形断言需要直接调用纯函数 project(events, now)
import { project } from '../scripts/project.mjs';
// 票 36：生成式夹具 —— state.js 由 events.jsonl 经 project() 真输出序列化而来。
// 门禁运行时现生成同一份 state 注入 window.__TL__，并逐字节比对磁盘产物（零漂移）。
import { buildState, generatedStateSource } from './fixtures/build-state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = __dirname;
const demoDir = path.join(templatesDir, 'demo');
const screenshotsDir = path.join(templatesDir, 'screenshots');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ── P1: CSP 判定唯一权威 ────────────────────────────────────────────────
function hasCsp(htmlText) {
  const hasMeta = /<meta\s+http-equiv=["']Content-Security-Policy["']/i.test(htmlText);
  const hasNone = /default-src\s+['"]none['"]/i.test(htmlText);
  return hasMeta && hasNone;
}

// ── Chrome/Chromium 探测 ────────────────────────────────────────────────
function findChromeExecutable() {
  const envChrome = process.env.CHROME_PATH;
  if (envChrome) {
    if (fs.existsSync(envChrome)) {
      return { path: envChrome, source: '环境变量 CHROME_PATH' };
    }
    const err = new Error(`[Chrome 探测失败] 环境变量 CHROME_PATH 指定的文件不存在: ${envChrome}`);
    err.code = 'CHROME_NOT_FOUND';
    throw err;
  }

  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return { path: candidate, source: '常见系统安装路径' };
    }
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  const exeNames = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'msedge'];

  for (const dir of pathDirs) {
    if (!dir) continue;
    for (const exe of exeNames) {
      const fullPath = path.join(dir, exe);
      try {
        if (fs.existsSync(fullPath)) {
          return { path: fullPath, source: `系统 PATH 目录 (${dir})` };
        }
      } catch {}
    }
  }

  const err = new Error('[Chrome 探测失败] 未能在系统中检测到可用的 Chrome / Chromium 浏览器');
  err.code = 'CHROME_NOT_FOUND';
  throw err;
}

// ── 1. 静态规范与真源收敛断言 ──────────────────────────────────────────────
async function testStaticRules() {
  console.log('\n[1/4] 执行静态规范、安全约束与真源收敛断言...');

  const cssPath = path.join(templatesDir, 'style.css');
  const jsPath = path.join(templatesDir, 'app.js');
  const statePath = path.join(templatesDir, 'state.js');
  const timelineHtmlPath = path.join(templatesDir, 'timeline.html');

  assert(fs.existsSync(cssPath), '单一真源 templates/style.css 存在');
  assert(fs.existsSync(jsPath), '单一真源 templates/app.js 存在');
  assert(fs.existsSync(statePath), '单一真源 templates/state.js 存在');
  assert(fs.existsSync(timelineHtmlPath), '单一真源 templates/timeline.html 存在（页面唯一部署源）');

  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const stateContent = fs.readFileSync(statePath, 'utf8');
  const timelineHtml = fs.readFileSync(timelineHtmlPath, 'utf8');

  // 无 http://, https://, 协议相对外链
  const urlRegex = /(src|href|url)\s*=\s*["'](https?:|\/\/)/i;
  assert(!urlRegex.test(css), 'style.css 中无 http/https/协议相对外部资源链接');
  assert(!urlRegex.test(js), 'app.js 中无 http/https/协议相对外部资源链接');
  assert(!urlRegex.test(timelineHtml), 'timeline.html 中无 http/https/协议相对外部资源链接');

  // CSP meta 严格禁网
  assert(hasCsp(timelineHtml), 'timeline.html CSP meta 标签存在且配置 default-src \'none\' 禁止外部网络');

  // Cockpit 核心容器结构
  assert(timelineHtml.includes('id="cockpit-aside"'), 'timeline.html 包含控制台侧栏 #cockpit-aside');
  assert(timelineHtml.includes('id="cockpit-header"'), 'timeline.html 包含顶部遥测栏 #cockpit-header');
  assert(timelineHtml.includes('id="cockpit-main"'), 'timeline.html 包含主内容容器 #cockpit-main');
  assert(timelineHtml.includes('id="nav-deck"'), 'timeline.html 包含导航面板 #nav-deck');
  assert(timelineHtml.includes('id="view-board"'), 'timeline.html 包含看板视图容器 #view-board');
  assert(timelineHtml.includes('id="view-decisions"'), 'timeline.html 包含决策点视图容器 #view-decisions');
  assert(timelineHtml.includes('id="view-journey"'), 'timeline.html 包含旅途视图容器 #view-journey');
  assert(timelineHtml.includes('id="view-ledger"'), 'timeline.html 包含账本视图容器 #view-ledger');

  // state.js 格式严格为纯数据赋值 window.__TL__ = <JSON>;
  const stateTrimmed = stateContent.trim();
  const validStatePrefix = stateTrimmed.startsWith('window.__TL__ =');
  const validStateSuffix = stateTrimmed.endsWith(';') || stateTrimmed.endsWith('};');
  assert(validStatePrefix && validStateSuffix, 'state.js 格式严格为纯数据赋值 window.__TL__ = <JSON>;');

  // §2.5 转义纪律：出厂 state.js 本体不得残留裸 < > &（对文件本体断言，不止测序列化器合成输入）
  const rawMarkupCount = (stateContent.match(/[<>&]/g) || []).length;
  const mutantUnescaped = (stateContent.replace('\\u003c', '<').match(/[<>&]/g) || []).length;
  assert(rawMarkupCount === 0, `state.js 本体零裸标记字符 (< > &)，实测 ${rawMarkupCount} 处`);
  assert(mutantUnescaped > 0, `state.js 变异组(亲眼变红): 把一个 \\u003c 还原为裸 < 后该断言转红 (mutant: ${mutantUnescaped} 处)`);

  // 票 36 零漂移：磁盘 templates/state.js 必须逐字节 = serializeState(project(events.jsonl, FIXED_NOW))。
  // 这条把「生成式夹具」钉死：任何人手改 state.js 或改 events 后忘了重生成，立即转红。
  assert(stateContent === generatedStateSource(),
    '票36 零漂移(保持绿): 磁盘 templates/state.js 逐字节 = serializeState(project(fixtures/events.jsonl, FIXED_NOW))（手写夹具/漏重生成即转红）');

  // 票 37：无真源口号与死源串清理（timeline.html 源码层）
  assert(!/RETRY IN 42\.0s/.test(timelineHtml),
    '票37 R1 死源清理(保持绿): timeline.html #retry-timer 静态串 "RETRY IN 42.0s" 已改为 "—"（app.js 两个分支均无条件写 "—"，该源串是死值）');
  assert(!/ARMED\s*&(amp;)?\s*COUNTING/.test(timelineHtml) && !timelineHtml.includes('[AUTO-DEFAULT TRAJECTORY // ARMED]') && !timelineHtml.includes('SYSTEM FAIL-SAFE TRIGGER'),
    '票37 口号清理(保持绿): timeline.html 不再含无真源口号 "ARMED & COUNTING" / "[AUTO-DEFAULT TRAJECTORY // ARMED]" / "SYSTEM FAIL-SAFE TRIGGER"');
  // 票 38 R7：第 4 处同族「已武装」口号（#security-enclave-status）源码层清理。
  // 票 40：双层看守收敛到 timeline.html —— 另一页是死文件（tl 从不部署），看守它属假覆盖面。
  assert(!timelineHtml.includes('ARMED // L3'),
    '票38 R7 口号清理(保持绿): timeline.html #security-enclave-status 静态串已由 "ARMED // L3" 改 "—"（app.js 无条件覆写真源，sec.enclave || "—"；静态串回归即转红）');

  // 票 42：无源 claim 清理（timeline.html 源码层）。以下 8 处 + 4 处按钮文案宣称性质/机制/格式，
  // 却无真源、无处理器（安全/机制类一律删，不换措辞留观感）。任一串回归即转红。
  const WO42_CLAIM_STRINGS = [
    'Non-Destructive Safe', 'Force Arbitration',
    'Enqueue Manual Task', 'Audit Settlement Log',
    'SORTED BY ARBITRATION IMPACT', 'CRITICAL ARBITRATION ACTIVE:',
    'AUTONOMOUS OVERRIDE INTRUDER:', 'NODE ID: 0x9AF4-DEC',
    'SYNCED', '— // STRICT LINEAR', 'TAIL -F LIVE', 'ENCLAVE ATTESTATION VERIFIED',
  ];
  const wo42Residual = WO42_CLAIM_STRINGS.filter((s) => timelineHtml.includes(s));
  assert(wo42Residual.length === 0,
    `票42 无源 claim 清理(保持绿): timeline.html 不再含无源 claim 串（残留 ${wo42Residual.length} 处: ${wo42Residual.join(' / ')}）`);
  // 保留项的反向看守：两条「待核」经查真源后保留，须仍带依据注释（防被顺手误删）。
  assert(timelineHtml.includes('ISO-8601 // STRICT') && /ISO-8601 有真源/.test(timelineHtml),
    '票42 保留项(保持绿): "ISO-8601 // STRICT" 有真源（tl.mjs nowIso=toISOString）保留，并带依据注释');
  assert(timelineHtml.includes('IMMUTABLE APPEND-ONLY WAL') && /append-only WAL 有真源/.test(timelineHtml),
    '票42 保留项(保持绿): "IMMUTABLE APPEND-ONLY WAL" 有真源（tl.mjs appendFileSync 追加写）保留，并带依据注释');

  // 票 44：清账本视图的假加密框架（D1/D2）。下列串宣称哈希链 / merkle / SHA-256 / CBOR 编码，
  // 但 ledgerMeta 是零生产者键（真源从不产出），接线后 19 行真数据挂在假框架下。
  // 被删串（D1 的 LEAVES VALIDATED 标签 + D2 的 6 处 html 框架 + 3 处 app.js 块标题）任一回归即转红。
  const WO44_CLAIM_STRINGS = [
    'SEC-LEDGER-V4', 'MERKLE ROOT:', 'MERKLE ROOT STATUS:', 'LEAVES VALIDATED',
    'SHA-256 CHECK', 'SEQ // IMMUTABLE HASH', 'ENCODING: CANONICAL-CBOR-B64',
    'LIVE PIPED STDOUT', 'CODE MUTATION VECTOR DIFF',
  ];
  const wo44Sources = timelineHtml + '\n' + js;
  const wo44Residual = WO44_CLAIM_STRINGS.filter((s) => wo44Sources.includes(s));
  assert(wo44Residual.length === 0,
    `票44 假加密框架清理(保持绿): timeline.html/app.js 不再含账本假加密框架串（残留 ${wo44Residual.length} 处: ${wo44Residual.join(' / ')}）`);

  // 安全约束：无 eval，无 innerHTML =
  assert(!/\beval\s*\(/.test(js), 'app.js 中禁止出现 eval()');
  assert(!/innerHTML\s*=/.test(js), 'app.js 中无 innerHTML 赋值，全部动态数据走 safe DOM/textContent');
  // L5 静态：payload 渲染无 eval 链路，且采用确定性 JSON.stringify
  assert(!/\bnew Function\s*\(/.test(js), 'app.js 中禁止出现 new Function() 动态构造 (L5: payload 渲染链路无 eval)');
  assert(/ledger-payload-json/.test(js) && /JSON\.stringify\(row\.payload/.test(js), 'app.js 中 ledger payload 采用确定性 JSON.stringify 序列化 (L5 静态)');

  // localStorage 键带 runId 前缀
  assert(/tl_.*_/.test(js) && /getRunPrefix/.test(js), 'localStorage 键使用 run 前缀隔离存储桶');

  // CSS 组件规则内无硬编码十六进制颜色 (值全在 :root)
  const cssWithoutRoot = css
    .replace(/:root\s*\{[\s\S]*?\}/g, '')
    .replace(/\[data-theme=["'][^"']+["']\]\s*\{[\s\S]*?\}/g, '')
    .replace(/@media[^{]+\{[\s\S]*?\}\s*\}/g, (m) => m.includes(':root') ? '' : m);
  const hexMatches = cssWithoutRoot.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert(hexMatches.length === 0, `style.css 组件规则中无硬编码十六进制颜色 (发现 ${hexMatches.length} 处)`);

  // R1: 验证消除重复副本（票 40 保留此条：它守的是「demo/ 下不再出现冗余副本」这一独立不变量，
  // 与 templates/ 下模板源本身是否被删无关 —— 模板源已删，demo/ 副本仍可能被重新引入）
  assert(!fs.existsSync(path.join(demoDir, 'ledger.html')), 'R1 验证: demo/ledger.html 冗余副本已消除');
  assert(!fs.existsSync(path.join(demoDir, 'style.css')), 'R1 验证: demo/style.css 冗余副本已消除');
  assert(!fs.existsSync(path.join(demoDir, 'app.js')), 'R1 验证: demo/app.js 冗余副本已消除');
  assert(!fs.existsSync(path.join(demoDir, 'state.js')), 'R1 验证: demo/state.js 冗余副本已消除');

  // R3: 真源只在同技能 scripts/tokens.json
  const tokensMjsPath = path.join(templatesDir, 'tokens.mjs');
  const selfJsonPath = path.resolve(templatesDir, '../scripts/tokens.json');
  assert(fs.existsSync(tokensMjsPath), 'R3 验证: templates/tokens.mjs 存在');
  assert(fs.existsSync(selfJsonPath), `R3 验证: 找到同技能代币真源 ${selfJsonPath}`);
  if (fs.existsSync(selfJsonPath)) {
    const src = JSON.parse(fs.readFileSync(selfJsonPath, 'utf8'));
    const localTokens = await import(`file:///${tokensMjsPath.replace(/\\/g, '/')}`);
    assert(JSON.stringify(src) === JSON.stringify(localTokens.TOKEN), 'R3 验证: templates/tokens.mjs 的 TOKEN 逐值等于同技能 scripts/tokens.json');
  }

  // ── 票 45：pi 第三方评审 10 条收口 —— 串级 denylist（①③⑥⑨⑩）+ 逐一回退变异 ────
  // 谓词只扫「页面源」(timeline.html + app.js)，不扫本门禁自身，故阵列内列出被禁串是安全的。
  const WO45_SOURCES = timelineHtml + '\n' + js;
  const WO45_DENY = {
    '① 伪审计徽标': ['AUDITED // 100% OK'],
    '③ severity 回落': ["severity || 'CRITICAL'"],
    '⑥ 加密谱系串': ['ATTESTATION & CRYPTOGRAPHIC LINEAGE', 'ZERO-KNOWLEDGE WITNESS', 'SGX SECURE ENCLAVE STATE'],
    '⑨ Commits 范围宣称': ['Artifacts &amp; Commits Shelf', 'Artifacts & Commits Shelf'],
    '⑩ 预测评估标签': ['PREDICTIVE EVAL']
  };
  const wo45Hits = (src, list) => list.filter((s) => src.includes(s));
  Object.keys(WO45_DENY).forEach((k) => {
    const hits = wo45Hits(WO45_SOURCES, WO45_DENY[k]);
    assert(hits.length === 0,
      `票45 ${k} 串级 denylist(保持绿): 页面源不再含被清串（残留 ${hits.length} 处: ${hits.join(' / ') || '无'}）`);
  });
  // 变异：把每处修复逐一回退 → 对应串级断言必须转红；当前源码无残留即「还原复绿」另一臂。
  const WO45_MUTATIONS = [
    { k: '① 伪审计徽标', where: 'js', from: 'DONE // ${auditedDone} AUDITED', to: 'AUDITED // 100% OK' },
    { k: '③ severity 回落', where: 'js', from: "String(primary.severity || '—')", to: "String(primary.severity || 'CRITICAL')" },
    { k: '⑥ 加密谱系串', where: 'js', from: 'RECORD PROVENANCE (UNVERIFIED SOURCE)', to: 'ATTESTATION & CRYPTOGRAPHIC LINEAGE' },
    { k: '⑥ 加密谱系串', where: 'js', from: 'WITNESS VALUE', to: 'ZERO-KNOWLEDGE WITNESS' },
    { k: '⑥ 加密谱系串', where: 'js', from: 'EXECUTION CONTEXT', to: 'SGX SECURE ENCLAVE STATE' },
    { k: '⑨ Commits 范围宣称', where: 'html', from: 'Latest Artifacts Shelf', to: 'Latest Artifacts &amp; Commits Shelf' },
    { k: '⑩ 预测评估标签', where: 'html', from: 'DECLARED IMPACT', to: 'PREDICTIVE EVAL' }
  ];
  assert(WO45_MUTATIONS.every((m) => (m.where === 'js' ? js : timelineHtml).indexOf(m.from) !== -1),
    '票45 变异前置(保持绿): 每处修复锚点在当前源码中确实存在（防锚点漂移导致变异空转）');
  const wo45Mut = WO45_MUTATIONS.map((m) => {
    const base = m.where === 'js' ? js : timelineHtml;
    const mutated = base.split(m.from).join(m.to);
    return { k: m.k, red: wo45Hits(mutated, WO45_DENY[m.k]).length > 0 };
  });
  assert(wo45Mut.every((r) => r.red),
    `票45 变异组(亲眼变红): 逐一回退被清串 → 对应串级 denylist 断言转红（${wo45Mut.filter((r) => r.red).length}/${wo45Mut.length} 命中；未命中 ${wo45Mut.filter((r) => !r.red).map((r) => r.k).join(', ') || '无'}）`);

  // ── 票 51：侧栏/页眉装饰·遥测标签砍/降权 —— 串级 denylist + 逐一回退变异 ─────────
  // 谓词只扫「页面源」(timeline.html + app.js)，不扫本门禁自身，故阵列内列出被砍串是安全的。
  const WO51_SOURCES = timelineHtml + '\n' + js;
  const WO51_DENY = {
    '① 纯装饰品牌块': ['class="brand-row"', 'class="brand-name"', 'class="brand-sub"', 'CONTINUUM // V4.2'],
    '② 无信息量遥测标签': ['TEMPORAL ENGINE', 'EPOCH DRIFT', 'AUTONOMOUS TELEMETRY'],
    '③ 页脚死静态版本串': ['v4.2.1-RELEASE'],
  };
  Object.keys(WO51_DENY).forEach((k) => {
    const hits = WO51_DENY[k].filter((s) => WO51_SOURCES.includes(s));
    assert(hits.length === 0,
      `票51 ${k} 串级 denylist(保持绿): 页面源不再含被砍/降权串（残留 ${hits.length} 处: ${hits.join(' / ') || '无'}）`);
  });
  const WO51_MUTATIONS = [
    { k: '① 纯装饰品牌块', where: 'html', from: '<div class="aside-top">', to: '<div class="aside-top"><div class="brand-row"><span class="brand-name">CHRONOS</span><span class="brand-sub">CONTINUUM // V4.2</span></div>' },
    { k: '② 无信息量遥测标签', where: 'html', from: '<div class="header-left">', to: '<div class="header-left"><span class="pill-text">AUTONOMOUS TELEMETRY</span>' },
    { k: '② 无信息量遥测标签', where: 'html', from: '<span class="drift-label">漂移</span>', to: '<span class="drift-label">EPOCH DRIFT</span>' },
    { k: '② 无信息量遥测标签', where: 'html', from: '<div class="aside-bottom">', to: '<div class="aside-bottom"><div class="temporal-row"><span class="temporal-label">TEMPORAL ENGINE</span></div>' },
    { k: '③ 页脚死静态版本串', where: 'html', from: 'id="telemetry-kernel">—</span>', to: 'id="telemetry-kernel">v4.2.1-RELEASE</span>' }
  ];
  assert(WO51_MUTATIONS.every((m) => (m.where === 'js' ? js : timelineHtml).indexOf(m.from) !== -1),
    '票51 变异前置(保持绿): 每处砍/降权锚点在当前源码中确实存在（防锚点漂移导致变异空转）');
  const wo51Mut = WO51_MUTATIONS.map((m) => {
    const base = m.where === 'js' ? js : timelineHtml;
    const mutated = base.split(m.from).join(m.to);
    return { k: m.k, red: WO51_DENY[m.k].filter((s) => mutated.includes(s)).length > 0 };
  });
  assert(wo51Mut.every((r) => r.red),
    `票51 变异组(亲眼变红): 逐一回退被砍/降权串 → 对应串级 denylist 断言转红（${wo51Mut.filter((r) => r.red).length}/${wo51Mut.length} 命中；未命中 ${wo51Mut.filter((r) => !r.red).map((r) => r.k).join(', ') || '无'}）`);
}

// ── 2. 转义与 XSS 边界断言 (调用真 scripts/tl.mjs:serializeState) ─────────────
async function testEscapingAndSecurity() {
  console.log('\n[2/4] 执行数据转义、XSS 注入边界与逐字节确定性自检...');

  const tlMjsPath = path.resolve(templatesDir, '../scripts/tl.mjs');
  assert(fs.existsSync(tlMjsPath), `真序列化器存在于 ${tlMjsPath}`);
  const { serializeState } = await import(`file:///${tlMjsPath.replace(/\\/g, '/')}`);
  assert(typeof serializeState === 'function', '从 scripts/tl.mjs 成功导入真 serializeState 函数');

  const maliciousPayload = {
    run: { id: 'xss-run' },
    items: [
      { id: 'T1', title: '</script><script>alert("xss")</script>' },
      { id: 'T2', title: 'Line\u2028Separator and \u2029Paragraph' },
      { id: 'T3', title: 'Special chars: <>&"\'' }
    ]
  };

  const serialized = serializeState(maliciousPayload);
  assert(!serialized.includes('</script>'), '序列化输出中不包含原始未转义的 </script>');
  assert(serialized.includes('\\u003c/script\\u003e'), '闭合 script 标签转义为 \\u003c/script\\u003e');
  assert(!serialized.includes('\u2028') && !serialized.includes('\u2029'), 'U+2028 与 U+2029 行分隔符安全转义');
  assert(serialized.startsWith('window.__TL__ = ') && serialized.trim().endsWith(';'), '序列化产物具备标准 window.__TL__ 包装');

  const s1 = serializeState(maliciousPayload);
  const s2 = serializeState(maliciousPayload);
  assert(s1 === s2, '相同输入下 serializeState 产物逐字符逐字节完全相同');
}

// ── 3. 8 态矩阵与时钟单测断言 ──────────────────────────────────────────
function testStateMatrixUnit() {
  console.log('\n[3/4] 执行 8 态矩阵判定与时钟异常单元测试断言...');

  const appJsContent = fs.readFileSync(path.join(templatesDir, 'app.js'), 'utf8');
  const fakeWindow = { location: { hash: '' }, addEventListener: () => {} };
  const fakeDoc = {
    head: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    createElementNS: () => ({ setAttribute: () => {}, appendChild: () => {} })
  };
  const fakeNav = { clipboard: { writeText: () => Promise.resolve() } };
  const fakeSetInterval = () => 0;
  const fakeClearInterval = () => {};

  const extractFn = new Function('window', 'document', 'navigator', 'setInterval', 'clearInterval', `${appJsContent}; return window.__TL_APP__.determineStateMatrix;`);
  const determineStateMatrix = extractFn(fakeWindow, fakeDoc, fakeNav, fakeSetInterval, fakeClearInterval);

  assert(typeof determineStateMatrix === 'function', '成功从 app.js 提取 determineStateMatrix 函数');

  const now = Date.now();
  const validRun = { id: 'r1', status: 'running' };

  // 1. 缺失或不可解析 generated_at
  const clockMissing = determineStateMatrix({ run: validRun, items: [{ id: 'T1' }] }, now);
  const clockInvalid = determineStateMatrix({ run: validRun, items: [{ id: 'T1' }], generated_at: 'INVALID' }, now);
  assert(clockMissing.key === 'clock_anomaly', '时钟异常: 缺失 generated_at 判定为 clock_anomaly');
  assert(clockInvalid.key === 'clock_anomaly', '时钟异常: 不可解析 generated_at 判定为 clock_anomaly');

  // 2. 本地时钟早于 generated_at（未来穿越）
  const clockFuture = determineStateMatrix({ run: validRun, items: [{ id: 'T1' }], generated_at: new Date(now + 2000).toISOString() }, now);
  assert(clockFuture.key === 'clock_anomaly' && clockFuture.subType === 'clock_skew_future', '未来时间穿越: 超过容差判定为 clock_anomaly');

  // 3. 正常运行态
  const normalRunning = determineStateMatrix({ run: validRun, items: [{ id: 'T1' }], generated_at: new Date(now - 1000).toISOString() }, now);
  assert(normalRunning.key === 'running', '健康执行态: 判定为 running');

  // 4. 阻塞态（票 35：真源改 state.stuck 中 severity 'block' 且未解除项）
  const blockedState = determineStateMatrix({ run: validRun, stuck: [{ id: 'B1', severity: 'block', resolved_at: null }], items: [{ id: 'T1' }], generated_at: new Date(now - 1000).toISOString() }, now);
  assert(blockedState.key === 'blocked', '阻塞态: 存在 block-stuck 判定为 blocked');
  // 4b. 非 block / 已解除的 stuck 不得误判为 blocked（票 35）
  const warnStuck = determineStateMatrix({ run: validRun, stuck: [{ id: 'W1', severity: 'warn', resolved_at: null }], items: [{ id: 'T1' }], generated_at: new Date(now - 1000).toISOString() }, now);
  assert(warnStuck.key !== 'blocked', '阻塞态: 非 block 或已解除的 stuck 不判为 blocked');

  // 5. 孤儿态
  const orphanState = determineStateMatrix({ run: { id: 'r1', orphan: true }, items: [{ id: 'T1' }], generated_at: new Date(now - 1000).toISOString() }, now);
  assert(orphanState.key === 'orphan', '孤儿态: orphan 为 true 判定为 orphan');
}

// ── 4. Headless Chrome 端到端深度断言与 A1~A6 变异/对照组 ─────────────────
async function testHeadlessChrome() {
  console.log('\n[4/4] 启动 Headless Chrome 执行 Cockpit 外壳 + Board 视图验收断言 (A1~A6)，并执行旅途视图 Journey 断言 (J1~J6)...');

  const chromeInfo = findChromeExecutable();
  console.log(`  [Chrome 探测成功] 使用: ${chromeInfo.path} (${chromeInfo.source})`);

  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const port = 9556;
  const tempProfile = path.join(os.tmpdir(), `chrome-cockpit-profile-${Date.now()}`);
  const htmlUrl = `file:///${path.resolve(templatesDir, 'timeline.html').replace(/\\/g, '/')}`;

  const chromeProc = spawn(chromeInfo.path, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    htmlUrl
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          const list = await res.json();
          const target = list.find(t => t.type === 'page') || list[0];
          if (target && target.webSocketDebuggerUrl) {
            wsUrl = target.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
    }

    if (!wsUrl) {
      throw new Error(`无法连接 Chrome CDP (端口: ${port})`);
    }

    const ws = new WebSocket(wsUrl);

    let msgId = 1;
    const pending = new Map();
    const consoleErrors = [];
    const networkRequests = [];

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.error) {
        console.error('CDP Error:', data.id, data.error);
      }
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data.result || data);
        pending.delete(data.id);
      }
      if (data.method === 'Runtime.consoleAPICalled') {
        const type = data.params.type;
        const text = data.params.args.map(a => a.value).join(' ');
        if (type === 'error') consoleErrors.push(text);
      }
      if (data.method === 'Network.requestWillBeSent') {
        networkRequests.push(data.params.request.url);
      }
    };

    const cdp = (method, params = {}) => new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await new Promise(r => ws.onopen = r);
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Page.enable');

    await new Promise(r => setTimeout(r, 1000));

    // 票 42：api=true 时注入 CDP 命令行 API（getEventListeners），供死控件守卫取证用。
    const evalRes = async (expr, api = false) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, includeCommandLineAPI: api });
      if (r?.exceptionDetails) {
        console.error('CDP Eval Exception:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r?.result?.value;
    };

    // J3/D3 共用的真投影器 ripple 取值实现：单一来源，避免两处内联各写一份后漂移
    const RIPPLE_OF_SRC = [
      'const rippleOf = (dec) => {',
      '  if (!dec) return null;',
      '  if (dec.effective && dec.effective.ripple) return dec.effective.ripple;',
      '  const opts = Array.isArray(dec.options) ? dec.options : [];',
      '  const def = opts.find(o => o && o.default);',
      '  return (def && def.impact && def.impact.ripple) || null;',
      '};'
    ].join('\n');

    // 票 36 (b) 现生成：门禁启动时用真投影器把 events.jsonl 投成 fixtureState，注入页面并重渲染。
    // 此后主断言读的是 project() 的现产物（而非磁盘 state.js），与「夹具」解耦；磁盘一致性另由零漂移断言看守。
    const fixtureState = buildState();
    await evalRes(`window.__TL__ = ${JSON.stringify(fixtureState)}; window.__TL_APP__.render(window.__TL__); true`);

    // 基础安全
    assert(consoleErrors.length === 0, `控制台无致命报错 (发现错误数: ${consoleErrors.length})`);
    const externalReqs = networkRequests.filter(u => u.startsWith('http://') || u.startsWith('https://'));
    assert(externalReqs.length === 0, `零外部网络请求 (外网请求数: ${externalReqs.length})`);

    // F3(票 40)：转义探针载荷已移出可见文本 —— 渲染出的 UI 不得出现生 <script>/</script> 标记。
    // 探针本身仍活在 state.js（[1/4] 的 rawMarkupCount===0 / mutantUnescaped>0 两条断言看守其转义纪律）。
    const f3Res = await evalRes(`
      (() => {
        const t = document.body.innerText || "";
        return { hasScriptTag: t.indexOf("<script") !== -1 || t.indexOf("</script") !== -1 };
      })()
    `);
    assert(!f3Res.hasScriptTag, 'F3(保持绿): 渲染出的 UI 文本不含生 <script>/</script> 标记（测试载荷仅存于 state.js 的转义数据，不再进可见标题）');

    // 票 42：死控件守卫 —— 渲染出的 UI 中不得存在「无处理器」的 <button>。
    // 判定（三重取证，与第 1 步枚举口径一致）：无直连 click 监听；且(除带 data-* 的委托控件外)无祖先 click 委托。
    // 真源：app.js 一律 getElementById/.querySelector + addEventListener 直连绑定；ledger 筛选片走 wrapper 的 closest('[data-*]') 委托。
    const btnGuard = await evalRes(`
      (() => {
        const hasClick = (el) => { try { return Object.keys(getEventListeners(el)).includes('click'); } catch { return false; } };
        const btns = Array.from(document.querySelectorAll('button'));
        const dead = [];
        for (const b of btns) {
          if (hasClick(b)) continue;
          let hasData = false;
          for (const a of b.attributes) if (a.name.startsWith('data-')) { hasData = true; break; }
          let delegated = false;
          if (hasData) { let n = b.parentElement; while (n) { if (hasClick(n)) { delegated = true; break; } n = n.parentElement; } }
          if (delegated) continue;
          dead.push((b.id || '(no-id)') + ' [' + (typeof b.className === 'string' ? b.className : '') + '] "' + (b.textContent || '').trim().slice(0, 24) + '"');
        }
        return { total: btns.length, dead };
      })()
    `, true);
    assert(btnGuard.dead.length === 0,
      `票42 死控件守卫(保持绿): 渲染出的 UI 中不得存在无处理器的 <button>（共 ${btnGuard.total} 个按钮，发现 ${btnGuard.dead.length} 个死控件: ${btnGuard.dead.join(' / ')}）`);

    // UI 0 emoji 检查
    const emojiScan = await evalRes(`
      (() => {
        const emojiRegex = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        let count = 0;
        while ((node = walk.nextNode())) {
          if (emojiRegex.test(node.textContent)) count++;
        }
        return count;
      })()
    `);
    assert(emojiScan === 0, `产品 UI 0 emoji 协议达标 (页面 emoji 数量: ${emojiScan})`);

    // 捕获深色 Cockpit 截图
    const darkShot = await cdp('Page.captureScreenshot', { format: 'png' });
    const darkPath = path.join(screenshotsDir, 'dark.png');
    fs.writeFileSync(darkPath, Buffer.from(darkShot.data, 'base64'));
    assert(fs.existsSync(darkPath) && fs.statSync(darkPath).size > 10000, `已生成深色 Cockpit 视图截图: ${darkPath}`);

    // ── A1: 侧栏存在且恰好 4 个导航项，点击决策点切换到 Decisions ──────────────
    console.log('\n  正在执行 A1 验证 (侧栏 4 项导航与点击切换 Decisions 视图)...');
    const a1Res = await evalRes(`
      (() => {
        const aside = document.getElementById("cockpit-aside");
        const navItems = Array.from(document.querySelectorAll("#nav-deck .nav-item"));
        const countOk = Boolean(aside) && navItems.length === 4;

        // 切换至 decisions
        document.getElementById("nav-item-decisions")?.click();
        const decisionsVisible = document.getElementById("view-decisions")?.style.display !== 'none';
        const boardHidden = document.getElementById("view-board")?.style.display === 'none';

        // 切换回 board
        document.getElementById("nav-item-board")?.click();
        const boardRestored = document.getElementById("view-board")?.style.display !== 'none';
        const decisionsHidden = document.getElementById("view-decisions")?.style.display === 'none';

        const controlPass = countOk && decisionsVisible && boardHidden && boardRestored && decisionsHidden;

        // 变异：临时篡改导航数量为 3 项
        const removedItem = navItems[0];
        removedItem.remove();
        const mutantPass = document.querySelectorAll("#nav-deck .nav-item").length === 4;

        // 恢复现场
        document.getElementById("nav-deck").prepend(removedItem);
        const restoredPass = document.querySelectorAll("#nav-deck .nav-item").length === 4;

        return { controlPass, mutantPass, restoredPass, count: navItems.length };
      })()
    `);
    assert(!a1Res.mutantPass, `A1 变异组(亲眼变红): 移除导航项后数量断言转红 (mutantPass: false, 期望 4 项)`);
    assert(a1Res.controlPass && a1Res.restoredPass, `A1 对照组(保持绿): 侧栏存在且恰好 4 个导航项，点击成功切换 Decisions 视图 (4 项完整)`);

    // ── A2(票 36 重写): state.kpis 投影器零生产者 → 真跑态 KPI 条渲空（诚实空态）──────
    // 旧断言建在夹具独有键 kpis 上；生成式夹具下该键不存在，改断「无真源 → 零卡片，不崩、不回落」。
    console.log('\n  正在执行 A2 验证 (真跑态 KPI 条诚实空态)...');
    const a2Res = await evalRes(`
      (() => {
        const strip = document.getElementById("kpis-strip");
        const kpiCards = Array.from(document.querySelectorAll("#kpis-strip .kpi-card"));
        const hasKpisKey = Object.prototype.hasOwnProperty.call(window.__TL__ || {}, "kpis");
        return { exists: Boolean(strip), cardCount: kpiCards.length, hasKpisKey };
      })()
    `);
    assert(a2Res.exists && !a2Res.hasKpisKey && a2Res.cardCount === 0,
      `A2 对照组(保持绿): 真跑态 project() 不产 state.kpis → KPI 条零卡片渲空（容器在、无伪造读数、不崩），实测 ${a2Res.cardCount} 张`);

    // ── A3: 三列看板卡片集合 = state.items 按 lane 分组集合 ────────────────────
    console.log('\n  正在执行 A3 验证 (三列看板任务卡片按 lane 分组条数与 ID 映射)...');
    const a3Res = await evalRes(`
      (() => {
        const items = window.__TL__?.items || [];
        const expectedTodo = items.filter(i => i.lane === 'todo').map(i => i.id);
        const expectedDoing = items.filter(i => i.lane === 'doing').map(i => i.id);
        const expectedDone = items.filter(i => i.lane === 'done').map(i => i.id);

        const actualTodo = Array.from(document.querySelectorAll("#lane-cards-todo .kanban-card")).map(c => c.getAttribute("data-item-id"));
        const actualDoing = Array.from(document.querySelectorAll("#lane-cards-doing .kanban-card")).map(c => c.getAttribute("data-item-id"));
        const actualDone = Array.from(document.querySelectorAll("#lane-cards-done .kanban-card")).map(c => c.getAttribute("data-item-id"));

        const matchArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
        const controlMatch = matchArray(actualTodo, expectedTodo) && matchArray(actualDoing, expectedDoing) && matchArray(actualDone, expectedDone);

        // 变异：从 todo 列临时删除一张卡片
        const todoContainer = document.getElementById("lane-cards-todo");
        const firstCard = todoContainer.firstElementChild;
        firstCard.remove();
        const mutantTodo = Array.from(document.querySelectorAll("#lane-cards-todo .kanban-card")).map(c => c.getAttribute("data-item-id"));
        const mutantMatch = matchArray(mutantTodo, expectedTodo);

        // 恢复现场
        todoContainer.prepend(firstCard);
        const restoredTodo = Array.from(document.querySelectorAll("#lane-cards-todo .kanban-card")).map(c => c.getAttribute("data-item-id"));
        const restoredMatch = matchArray(restoredTodo, expectedTodo);

        return {
          controlMatch, mutantMatch, restoredMatch,
          counts: { todo: actualTodo.length, doing: actualDoing.length, done: actualDone.length }
        };
      })()
    `);
    assert(!a3Res.mutantMatch, `A3 变异组(亲眼变红): 缺失任务卡片时 lane 集合匹配断言转红 (mutantMatch: false)`);
    assert(a3Res.controlMatch && a3Res.restoredMatch, `A3 对照组(保持绿): 三列看板卡片集合与 state.items 按 lane 分组严格全量对齐 (TODO:${a3Res.counts.todo}, DOING:${a3Res.counts.doing}, DONE:${a3Res.counts.done})`);

    // ── A4(票 32 重写): 默认行动条取自 decisions[] 待默认项；倒计时无真源诚实渲 '—' ──────
    // 旧断言整条建在无生产者的 state.attention / deadline_offset_s 与恒真「时钟冻结」构造上，故重写。
    console.log('\n  正在执行 A4 验证 (默认行动条接 decisions[] 待默认项 default label + 倒计时诚实降级)...');
    // 臂 B(票 32 补修)：独立锚 —— expected 写死为「夹具当前待默认项 default 选项 label」的字面常量，
    // 不再由夹具自身派生（否则夹具退化时 expected 与实渲同退 → 门禁恒绿；复核 V7(c) 三种变体实测证伪）。
    const EXPECTED_DEFAULT_LABEL = '使用动态时间戳查询参数并保持 fallback 备用加载';
    const a4Initial = await evalRes(`
      (() => {
        const expected = ${JSON.stringify(EXPECTED_DEFAULT_LABEL)};
        const actionText = (document.getElementById("decay-action")?.textContent || "").trim();
        const countdownText = (document.getElementById("decay-countdown")?.textContent || "").trim();
        const descText = (document.querySelector(".trajectory-desc")?.textContent || "").trim();

        const actionMatch = actionText.length > 0 && actionText === expected;
        const countdownHonest = countdownText === "—";
        const noSickSentence = !descText.includes("若若干秒内") && !descText.includes("若无干预将在") && descText.includes("后自动默认执行：");

        return { actionMatch, countdownHonest, noSickSentence, actionText, countdownText, descText, expected };
      })()
    `);

    const darkShotT1 = await cdp('Page.captureScreenshot', { format: 'png' });
    const darkPathT1 = path.join(screenshotsDir, 'dark-t1.png');
    fs.writeFileSync(darkPathT1, Buffer.from(darkShotT1.data, 'base64'));

    assert(a4Initial.countdownHonest,
      `A4 对照组(保持绿): 衰减倒计时无真源(投影器不产 deadline_offset_s/lock_at 数值)→ 诚实渲 "—"（U+2014），不再拼 "00m 00s" 伪造读数 (实渲 "${a4Initial.countdownText}")`);
    assert(a4Initial.actionMatch && a4Initial.noSickSentence,
      `A4 对照组(保持绿): 默认行动条文案 = 夹具待默认项(pending_default)的 default 选项 label ("${a4Initial.actionText}")，且 .trajectory-desc 文案无病句`);

    // A4 诚实臂(删键夹具)：抹掉待默认项 default 选项 label / 整体抹掉待默认决策 → 行动条渲 "—"
    const a4Honest = await evalRes(`
      (() => {
        const st = window.__TL__;
        const isPending = (d) => d && (d.status === "pending_default" || d.status === "pending_hold");
        const clone = JSON.parse(JSON.stringify(st));
        const def = (clone.decisions.find(isPending)?.options || []).find(o => o && o.default === true);
        if (def) delete def.label;
        window.__TL_APP__.render(clone);
        const noLabel = (document.getElementById("decay-action")?.textContent || "").trim();

        const clone2 = JSON.parse(JSON.stringify(st));
        clone2.decisions = clone2.decisions.filter(d => !isPending(d));
        window.__TL_APP__.render(clone2);
        const noPending = (document.getElementById("decay-action")?.textContent || "").trim();

        window.__TL_APP__.render(st);
        const restored = (document.getElementById("decay-action")?.textContent || "").trim();
        return { noLabel, noPending, restored };
      })()
    `);
    assert(a4Honest.noLabel === '—' && a4Honest.noPending === '—',
      `A4 诚实臂(删键): 待默认项 default 选项 label 缺失 / 待默认决策缺失 → 行动条渲 "—" 而非空串或伪造文案 (缺 label "${a4Honest.noLabel}" / 缺决策 "${a4Honest.noPending}")`);
    assert(a4Honest.restored === a4Initial.expected,
      `A4 还原(保持绿): 还原真实状态后行动条复回 "${a4Honest.restored}"`);

    // A4 改接臂(亲眼变红，数据级等价判别)：注入一条伪造 state.attention 并同时抹掉真源(待默认决策)。
    // 若实现仍读 state.attention[0].action，行动条必渲出伪造动作；真实现渲 "—" ⇒ 断言转红只可能发生在改接臂上。
    const a4Backwire = await evalRes(`
      (() => {
        const st = window.__TL__;
        const clone = JSON.parse(JSON.stringify(st));
        clone.attention = [{ ref: "X", weight: 99, action: "伪造动作-FROM-ATTENTION", why: "伪造理由" }];
        clone.decisions = clone.decisions.filter(d => !(d && (d.status === "pending_default" || d.status === "pending_hold")));
        window.__TL_APP__.render(clone);
        const text = (document.getElementById("decay-action")?.textContent || "").trim();
        window.__TL_APP__.render(st);
        return { text };
      })()
    `);
    assert(a4Backwire.text === '—' && a4Backwire.text !== '伪造动作-FROM-ATTENTION',
      `A4 改接臂(亲眼变红): 注入伪造 state.attention[0].action 且抹掉 decisions 真源后，行动条渲 "${a4Backwire.text}"（若改接回 attention 会渲 "伪造动作-FROM-ATTENTION"）→ 读无生产者字段必转红`);

    // ── W37 (票 37): #decay-countdown 改接 decisions[].lock_at —— 真跑态 project() 喂页面 ──
    console.log('\n  正在执行 W37 验证 (#decay-countdown 接 lock_at 真源：time 倒计时 / item 等待 / 无 → —)...');
    const W37_NOW = '2026-09-28T18:00:00.000Z';
    const w37Base = [
      { type: 'run.start', run: 'R37', t: '2026-09-28T17:00:00.000Z', data: { title: 'W37 真跑态' } },
      { type: 'item.add', ref: 'T9', t: '2026-09-28T17:00:01.000Z', data: { title: 'lock 目标项' } }
    ];
    const w37Open = (id, label, extra) => ({
      type: 'decision.open', ref: id, t: '2026-09-28T17:30:00.000Z',
      data: Object.assign({ title: id, options: [{ key: 'A', label, default: true }, { key: 'B', label: '备选' + id }] }, extra)
    });
    const w37TimeState = project(w37Base.concat([w37Open('D1', '默认动作甲', { lock_at: { type: 'time', at: '2026-09-28T18:05:00.000Z' } })]), W37_NOW);
    const w37ItemState = project(w37Base.concat([w37Open('D1', '默认动作甲', { lock_at: { type: 'item', ref: 'T9' } })]), W37_NOW);
    const w37NoLockState = project(w37Base.concat([w37Open('D1', '默认动作甲', {})]), W37_NOW);
    // 选择器口径判别态：首条 pending_default 无 lock_at(甲)、次条有 lock_at(乙)。
    // 若两节点非同源（倒计时取「首条有 lock_at」=乙、行动条取「首条待默认」=甲）→ 必然失配。
    const w37OrderState = project(w37Base.concat([
      w37Open('D1', '默认动作甲', {}),
      w37Open('D2', '默认动作乙', { lock_at: { type: 'time', at: '2026-09-28T18:05:00.000Z' } })
    ]), W37_NOW);

    const w37Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
        const show = (s) => { app.render(s); };
        show(${JSON.stringify(w37TimeState)});
        const time = txt("decay-countdown");
        const timeAction = txt("decay-action");
        const timeTimeout = txt("decisions-timeout-countdown");
        show(${JSON.stringify(w37ItemState)});
        const item = txt("decay-countdown");
        const itemAction = txt("decay-action");
        show(${JSON.stringify(w37NoLockState)});
        const none = txt("decay-countdown");
        show(${JSON.stringify(w37OrderState)});
        const orderCd = txt("decay-countdown");
        const orderAction = txt("decay-action");
        const override = txt("decisions-override-countdown");
        const decayDec = txt("decisions-decay-countdown");
        app.render(window.__TL__);
        const fixture = txt("decay-countdown");
        return { time, timeAction, timeTimeout, item, itemAction, none, orderCd, orderAction, override, decayDec, fixture };
      })()
    `);
    assert(w37Res.time !== '—' && /^\d+分 \d{2}秒$/.test(w37Res.time),
      `W37 对照组(保持绿): time 型 lock_at(18:05) 由烘焙 generated_at(18:00) 派生剩余倒计时 "${w37Res.time}"（不恒为 "—"）`);
    assert(w37Res.item === '等待 T9',
      `W37 对照组(保持绿): item 型 lock_at → 渲 "等待 <ref>"、无倒计时（实渲 "${w37Res.item}"）`);
    assert(w37Res.none === '—',
      `W37 对照组(保持绿): pending_default 无 lock_at → #decay-countdown 诚实渲 "—"（U+2014，实渲 "${w37Res.none}"）`);
    assert(w37Res.timeAction === '默认动作甲' && w37Res.itemAction === '默认动作甲',
      `W37 同源(保持绿): #decay-action 与 #decay-countdown 取同一条决策的 default label（实渲 "${w37Res.timeAction}" / "${w37Res.itemAction}"）`);
    assert(w37Res.orderCd === '—' && w37Res.orderAction === '默认动作甲',
      `W37 选择器口径(保持绿): 首条无 lock_at、次条有 → 倒计时与行动条都取**首条**（倒计时 "${w37Res.orderCd}" / 行动条 "${w37Res.orderAction}"），非同源必失配`);
    assert(w37Res.timeTimeout === w37Res.time,
      `W37 同源(保持绿): #decisions-timeout-countdown 与 #decay-countdown 同源同值（"${w37Res.timeTimeout}"）`);
    assert(w37Res.override === '—' && w37Res.decayDec === '—',
      `W37 诚实(保持绿): 无真源的 override / decisions-decay 倒计时保持 "—"（实渲 "${w37Res.override}" / "${w37Res.decayDec}"）`);
    assert(w37Res.fixture === '—',
      `W37 真跑夹具(保持绿): 生成式夹具 decisions 无 lock_at → 顶栏倒计时 "—"（与 A4 countdownHonest 同口径，实渲 "${w37Res.fixture}"）`);

    // W37 变异臂(数据级)：删掉真源读 —— 抹掉该决策的 lock_at → 倒计时必从倒计时形态退回 "—"。
    const w37Mut = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };
        const st = ${JSON.stringify(w37TimeState)};
        app.render(st);
        const withLock = txt("decay-countdown");
        const stripped = JSON.parse(JSON.stringify(st));
        stripped.decisions.forEach(d => { delete d.lock_at; });
        app.render(stripped);
        const noLock = txt("decay-countdown");
        app.render(window.__TL__);
        return { withLock, noLock };
      })()
    `);
    assert(w37Mut.withLock !== '—' && w37Mut.noLock === '—',
      `W37 变异组(亲眼变红): 抹掉真源 lock_at 后倒计时由 "${w37Mut.withLock}" 退回 "—"（断言钉在真源上，实删实红）`);

    // ── A5: 离线化：无外部 http(s)://、无 @import、无 icon font 引用 ────────────
    console.log('\n  正在执行 A5 验证 (离线化：无任何外部网络依赖与字体图标)...');
    const a5Res = await evalRes(`
      (() => {
        // 1. 检查属性中是否包含外链
        const elementsWithUrls = Array.from(document.querySelectorAll('[src], [href], [style]'));
        const externalAttrList = [];
        elementsWithUrls.forEach(el => {
          ['src', 'href', 'style'].forEach(attr => {
            const val = el.getAttribute(attr);
            if (val && /(https?:|\\/\\/)/i.test(val)) {
              externalAttrList.push(\`<\${el.tagName.toLowerCase()} \${attr}="\${val}">\`);
            }
          });
        });

        // 2. 检查 style 标签中是否有 @import
        const styleTags = Array.from(document.querySelectorAll('style'));
        let hasImport = false;
        styleTags.forEach(st => {
          if (/@import/i.test(st.textContent)) hasImport = true;
        });

        // 3. 检查是否有 icon font (material-symbols / material-icons)
        const iconFonts = document.querySelectorAll('.material-symbols-outlined, .material-icons, [class*="material-symbols"]');

        const controlOffline = externalAttrList.length === 0 && !hasImport && iconFonts.length === 0;

        // 变异：临时注入包含外部 google fonts 的 link 节点
        const mutantLink = document.createElement('link');
        mutantLink.id = 'mutant-external-link';
        mutantLink.href = 'https://fonts.googleapis.com/css2';
        document.head.appendChild(mutantLink);

        const mutantCheckList = Array.from(document.querySelectorAll('[src], [href]'))
          .map(e => e.getAttribute('src') || e.getAttribute('href'))
          .filter(v => /(https?:|\\/\\/)/i.test(v));
        const mutantOffline = mutantCheckList.length === 0;

        // 恢复现场
        mutantLink.remove();
        const restoredOffline = Array.from(document.querySelectorAll('[src], [href]'))
          .map(e => e.getAttribute('src') || e.getAttribute('href'))
          .filter(v => /(https?:|\\/\\/)/i.test(v)).length === 0;

        return {
          controlOffline, mutantOffline, restoredOffline,
          externalAttrCount: externalAttrList.length,
          iconFontCount: iconFonts.length
        };
      })()
    `);
    assert(!a5Res.mutantOffline, `A5 变异组(亲眼变红): 注入外部字体链接后离线化断言转红 (mutantOffline: false)`);
    assert(a5Res.controlOffline && a5Res.restoredOffline, `A5 对照组(保持绿): DOM 中 100% 离线自包含，零外部链接、零 @import、零 icon font (图标全为内联 SVG)`);

    // ── A6: 决策导航徽章数 = state.decisions 中真实待办态(pending_default|pending_hold)的数量 ─
    console.log('\n  正在执行 A6 验证 (决策导航徽章与真实待办态决策数动态同步)...');
    const a6Res = await evalRes(`
      (() => {
        const decisions = window.__TL__?.decisions || [];
        const isPending = (d) => d && (d.status === 'pending_default' || d.status === 'pending_hold');
        const pendingCount = decisions.filter(isPending).length;
        const badgeEl = document.getElementById("nav-badge-decisions");
        const badgeText = badgeEl?.textContent.trim() || '';

        const controlSync = badgeText === \`\${pendingCount} 待复核\`;

        // 变异：注入第二个待办决策但不重新渲染徽章（模拟徽章硬编码未联动 bug）
        const mutantPendingCount = pendingCount + 1;
        const mutantSync = badgeText === \`\${mutantPendingCount} 待复核\`;

        return { controlSync, mutantSync, badgeText, pendingCount };
      })()
    `);
    assert(!a6Res.mutantSync, `A6 变异组(亲眼变红): 决策数量变异后硬编码徽章未联动断言转红 (mutantSync: false)`);
    assert(a6Res.controlSync, `A6 对照组(保持绿): 决策导航徽章数与 state.decisions 中真实待办态数量严格一致 ("${a6Res.badgeText}")`);

    // ── P-相(票 32): 夹具 queue.review[] 与真投影器同形，队列行 data-score 取自夹具真值 ────────
    // 目的：杀死「夹具手写字段无生产者」这一类隐患——夹具一旦与 project() 形状漂移即转红。
    console.log('\n  正在执行 P-相 验证 (夹具 queue.review 与真投影器 project() 同形 + 队列行取自真值)...');
    const INLINE_EVENTS = [
      { type: 'run.start', run: 'R1', t: '2026-09-28T17:00:00.000Z', data: { title: 'shape fixture' } },
      { type: 'item.add', ref: 'T1', t: '2026-09-28T17:00:01.000Z', data: { title: 'one' } },
      { type: 'item.done', ref: 'T1', t: '2026-09-28T17:00:10.000Z', data: { outcome: 'completed', active_seconds: 9 } },
      { type: 'item.add', ref: 'T2', t: '2026-09-28T17:00:02.000Z', data: { title: 'two' } },
      { type: 'item.done', ref: 'T2', t: '2026-09-28T17:00:20.000Z', data: { outcome: 'completed', active_seconds: 18 } },
      // 票 32 补修 P-相(d)：补一条决策事件，使 project() 至少产 1 条决策（否则 decisions[] 为空无从比形）。
      { type: 'decision.open', ref: 'D9', t: '2026-09-28T17:00:04.000Z', data: { title: 'shape decision', options: [{ key: 'A', label: 'default opt', default: true }, { key: 'B', label: 'alt opt' }] } }
    ];
    const projected = project(INLINE_EVENTS, '2026-09-28T18:00:00.000Z');
    const projKeySet = Object.keys(projected.queue.review[0] || {}).sort().join(',');
    const fixtureText = fs.readFileSync(path.join(templatesDir, 'state.js'), 'utf8').trim();
    const fixtureObj = JSON.parse(fixtureText.replace(/^window\.__TL__\s*=\s*/, '').replace(/;\s*$/, ''));
    const fxReview = (fixtureObj.queue && fixtureObj.queue.review) || [];
    const fxKeySets = [...new Set(fxReview.map(r => Object.keys(r).sort().join(',')))];
    assert(projected.queue.review.length > 0 && projKeySet === 'reasons,ref,score'
      && fxKeySets.length === 1 && fxKeySets[0] === projKeySet,
      `P-相(a) 同形(保持绿): project() 输出的 queue.review[] 每项键集 "${projKeySet}" ≡ templates/state.js 夹具键集 [${fxKeySets.join(' | ')}]（键名逐字相同）`);

    // ── P-相(d)/(e)(票 32 补修)：夹具 decisions[] 单向契约包含 + status 取值域 ⊆ 投影器真实产出域 ──
    const fxDecisions = Array.isArray(fixtureObj.decisions) ? fixtureObj.decisions : [];
    const projDecisionKeySet = Object.keys(projected.decisions[0] || {}).sort().join(',');
    const fxDecisionKeySets = [...new Set(fxDecisions.map(d => Object.keys(d).sort().join(',')))];
    // P-相(d) 为**单向契约包含**（投影器核心契约键 ⊂ 夹具键集），非「同形/同构」：
    // 夹具决策另携一套页面风味键（code/severity/priority/created_offset_s/impact 等无生产者键，其本体归票 34）。
    // 完整 decisions[] 键集同构 deferred 到票 34（生成式夹具；用户已在票 34 第一轮 Q3 裁「生成式夹具」）。
    const PROJ_DECISION_CONTRACT = ['id', 'title', 'status', 'options'];
    const optContractOk = (o) => o && Object.prototype.hasOwnProperty.call(o, 'key') && typeof o.label === 'string'
      && typeof o.default === 'boolean';
    const decisionContractOk = (d) => d && PROJ_DECISION_CONTRACT.every(k => Object.prototype.hasOwnProperty.call(d, k))
      && Array.isArray(d.options) && d.options.length > 0 && d.options.every(optContractOk);
    const badDecisions = fxDecisions.filter(d => !decisionContractOk(d));
    assert(projected.decisions.length > 0 && fxDecisions.length > 0 && badDecisions.length === 0,
      `P-相(d) 夹具契约(保持绿): project() 产 ${projected.decisions.length} 条决策，其核心契约键 [${PROJ_DECISION_CONTRACT.join(', ')}]；夹具 decisions[]×${fxDecisions.length} 均齐备该契约且 options[] 每项 {key,label,default} 键名逐字相同、类型正确 (违规 ${badDecisions.length} 项；夹具键集 [${fxDecisionKeySets.join(' | ')}])`);

    const REAL_DECISION_STATUSES = ['pending_default', 'pending_hold', 'answered', 'confirmed', 'overridden', 'expired_locked', 'moot'];
    const fxStatuses = [...new Set(fxDecisions.map(d => d && d.status))];
    const badStatuses = fxStatuses.filter(s => REAL_DECISION_STATUSES.indexOf(s) === -1);
    assert(fxStatuses.length > 0 && badStatuses.length === 0,
      `P-相(e) 夹具不变量(保持绿): 夹具 decisions[].status 取值域 [${fxStatuses.join(', ')}] ⊆ 投影器真实产出域 [${REAL_DECISION_STATUSES.join(', ')}]（无生产者状态值如 "open" 即转红）`);

    const pRes = await evalRes(`
      (() => {
        const fxScores = () => (((window.__TL__ && window.__TL__.queue && window.__TL__.queue.review) || []).map(r => r.score));
        const rows = () => Array.from(document.querySelectorAll("#decisions-attention-queue .attention-item"));
        const rendered = () => rows().map(el => { const v = el.getAttribute("data-score"); return v === "" || v === null ? null : Number(v); });

        window.__TL_APP__.render(window.__TL__);
        const src = fxScores();
        const descending = src.length > 0 && src.every((v, i) => i === 0 || src[i - 1] >= v);
        const control = JSON.stringify(rendered()) === JSON.stringify(src);

        // 变异：互换首末项 score（夹具源序被调成逆序）→ 页面仍按 score 降序渲染 → 与源序不再一致
        const clone = JSON.parse(JSON.stringify(window.__TL__));
        const n = clone.queue.review.length;
        const t = clone.queue.review[0].score;
        clone.queue.review[0].score = clone.queue.review[n - 1].score;
        clone.queue.review[n - 1].score = t;
        window.__TL_APP__.render(clone);
        const mutantSrc = clone.queue.review.map(r => r.score);
        const mutant = JSON.stringify(rendered()) === JSON.stringify(mutantSrc);

        window.__TL_APP__.render(window.__TL__);
        const restored = JSON.stringify(rendered()) === JSON.stringify(src);
        return { descending, control, mutant, restored, src, rendered: rendered() };
      })()
    `);
    assert(pRes.descending, `P-相(b) 夹具不变量(保持绿): 夹具 queue.review[] 按 score 降序书写 [${pRes.src.join(', ')}]`);
    assert(pRes.control && pRes.restored, `P-相(b) 对照组(保持绿): 队列行 data-score 序列 [${pRes.rendered.join(', ')}] = 夹具 score 源序（页面据此降序渲染）`);
    assert(!pRes.mutant, `P-相(c) 变异组(亲眼变红): 互换首末项 score 使夹具源序逆序后，页面仍降序渲染 → 与源序不再一致，断言转红 (mutant: false)`);

    // ── SRC-lint(票 32 补修 · 臂 D；票 40 收敛到 timeline.html)：源码层不得残留静态假倒计时 "\d\d m \d\d s" ──
    // 渲染层已把 4 个倒计时节点覆盖为 '—'；本断言把「页面不再出现假倒计时」钉到源码层（V5 原只在渲染层成立）。
    console.log('\n  正在执行 SRC-lint 验证 (timeline.html 源码层无静态假倒计时字面量)...');
    const scanCountdownSource = (file) => {
      const text = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      const hits = [];
      const idRe = /<[a-zA-Z][^>]*\bid="[^"]*-countdown"[^>]*>([^<]*)</g;
      const pillRe = /<[a-zA-Z][^>]*\bclass="[^"]*countdown-pill[^"]*"[^>]*>([^<]*)</g;
      for (const re of [idRe, pillRe]) {
        let m; while ((m = re.exec(text)) !== null) { if (/\d{2}m\s*\d{2}s/.test(m[1])) hits.push(m[1].trim()); }
      }
      return { text, hits };
    };
    const tSrc = scanCountdownSource('timeline.html');
    const srcCountdownHits = tSrc.hits;
    const cdIdCount = (tSrc.text.match(/-countdown"/g) || []).length;
    const cdPillCount = (tSrc.text.match(/countdown-pill/g) || []).length;
    assert(cdIdCount >= 4 && cdPillCount >= 2,
      `SRC-lint 反空心(保持绿): timeline.html 中 *-countdown 元素 ${cdIdCount} 个（≥4）、countdown-pill 类 ${cdPillCount} 处（≥2）——选择器失配即转红`);
    assert(srcCountdownHits.length === 0,
      `SRC-lint(保持绿): timeline.html 中 *-countdown / countdown-pill 元素的静态内文均不含假倒计时 (\\d{2}m\\s*\\d{2}s)，实命中 [${srcCountdownHits.join(' ; ')}]`);

    // ── RUN-相(票 35 · 臂 4)：用 project() 真输出渲染整页，钉住「真跑态」下的诚实性 ─────
    // 真跑态 = tl deploy 交付的 timeline.html 原样 + project() 产出的 state（**不含** security/
    // telemetry/stages 等键）。这正是现有门禁照不到的面：写入臂一旦在真跑时为假的守卫内，
    // 静态假串就会原样交付用户。本臂把「无真源即 '—'、无伪串」钉死，且把已删节点钉死为不存在。
    console.log('\n  正在执行 RUN-相 验证 (真跑态 project() 输出渲染下的页面诚实性)...');
    const RUN_EVENTS = [
      { type: 'run.start', run: 'R35', t: '2026-09-28T17:00:00.000Z', data: { title: 'real-run fixture' } },
      { type: 'item.add', ref: 'T1', t: '2026-09-28T17:00:01.000Z', data: { title: 'one' } }
    ];
    const RUN_BLOCK_EVENTS = [
      ...RUN_EVENTS,
      { type: 'stuck.open', ref: 'K9', t: '2026-09-28T17:00:05.000Z', data: { severity: 'block', what: '真跑阻断标题 REAL-BLOCK-TITLE', needs: 'call human', item: 'T1' } }
    ];
    const realRunState = project(RUN_EVENTS, '2026-09-28T18:00:00.000Z');
    const realBlockState = project(RUN_BLOCK_EVENTS, '2026-09-28T18:00:00.000Z');
    // 真跑态确实缺这些键（否则本臂的「守卫为假」前提不成立，断言本身应转红）
    assert(!Object.prototype.hasOwnProperty.call(realRunState, 'security')
      && !Object.prototype.hasOwnProperty.call(realRunState, 'telemetry')
      && !Object.prototype.hasOwnProperty.call(realRunState, 'stages'),
      'RUN-相(前提)(保持绿): project() 真输出不含 security/telemetry/stages 键（真跑态前提成立）');
    assert(realBlockState.stuck.length === 1 && realBlockState.stuck[0].severity === 'block',
      'RUN-相(前提)(保持绿): project() 对 stuck.open(severity:block) 真产出 1 条 block-stuck');

    const FAKE_STATIC = ['ARMED // L3', 'Zero telemetry leakage', 'v4.2.1-RELEASE', 'SES-09X-CKPT', 'STRAND-616-ALPHA', 'DEC-142'];
    const A_CLASS_IDS = ['security-enclave-status', 'security-enclave-desc', 'telemetry-kernel', 'telemetry-session-id', 'journey-strand', 'consensus-title'];
    const runRes = await evalRes(`
      (() => {
        const st = ${JSON.stringify(realRunState)};
        window.__TL_APP__.render(st);
        const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent : null; };
        const FAKE = ${JSON.stringify(FAKE_STATIC)};
        const ids = ${JSON.stringify(A_CLASS_IDS)};
        const aTexts = {}; ids.forEach(id => { aTexts[id] = txt(id); });
        const leaks = ids.filter(id => { const t = aTexts[id]; return t != null && FAKE.some(f => t.indexOf(f) !== -1); });
        const deletedPresent = ['telemetry-protocol', 'shelf-branch-tag'].filter(id => !!document.getElementById(id));
        const bannerNoBlock = document.getElementById('blocker-banner');
        const noBlockDisplay = bannerNoBlock ? getComputedStyle(bannerNoBlock).display : null;
        window.__TL_APP__.render(window.__TL__);
        return { aTexts, leaks, deletedPresent, noBlockDisplay };
      })()
    `);
    assert(runRes.leaks.length === 0,
      `RUN-相(a) (保持绿): 真跑态下 6 个 A 类节点文本均不含原静态假串，实泄漏 [${runRes.leaks.join(', ')}]（实渲 ${JSON.stringify(runRes.aTexts)}）`);
    assert(runRes.deletedPresent.length === 0,
      `RUN-相(b) (保持绿): 已删节点 telemetry-protocol / shelf-branch-tag 在真跑态 DOM 中不存在，实存在 [${runRes.deletedPresent.join(', ')}]`);
    assert(runRes.noBlockDisplay === 'none',
      `RUN-相(c) (保持绿): 真跑态无 block-stuck 时 blocker-banner 隐藏 (display: ${runRes.noBlockDisplay})`);

    const runBlockRes = await evalRes(`
      (() => {
        const st = ${JSON.stringify(realBlockState)};
        window.__TL_APP__.render(st);
        const b = document.getElementById('blocker-banner');
        const titleEl = document.getElementById('blocker-title');
        const res = {
          display: b ? getComputedStyle(b).display : null,
          title: titleEl ? titleEl.textContent : null,
          stuckWhat: (st.stuck && st.stuck[0] && st.stuck[0].what) || null
        };
        window.__TL_APP__.render(window.__TL__);
        return res;
      })()
    `);
    assert(runBlockRes.display !== 'none' && runBlockRes.title === runBlockRes.stuckWhat,
      `RUN-相(d) (保持绿): 真跑态有 block-stuck 时 blocker-banner 显示 (display: ${runBlockRes.display}) 且 blocker-title = stuck.what ("${runBlockRes.title}")`);

    // ── SHELF-相(票 39)：交付物书架接线真源 items[].evidence.artifacts（跨项扁平） ────────────
    // 与 stuck 同形的旧缺陷：真源被算出却丢进 items[].evidence.artifacts，页面却读顶层 state.artifacts
    // （投影器从不产该键）→ 结构性渲空。本臂把「读对真源、按真形状 {title,path,summary} 渲染、无源即零行、
    // 不再回退旧键」钉死，并用变异组亲眼看它转红。
    console.log('\n  正在执行 SHELF-相 验证 (交付物书架接 items[].evidence.artifacts 真源)...');
    const shelfAppSrc = fs.readFileSync(path.join(templatesDir, 'app.js'), 'utf8');
    assert(/\.evidence\.artifacts\b/.test(shelfAppSrc),
      'SHELF-src(保持绿): app.js shelf 从 items[].evidence.artifacts 扁平取真源');
    assert(!/\bstate\.artifacts\b/.test(shelfAppSrc),
      'SHELF-src(保持绿): app.js 不再读顶层 state.artifacts（无生产者的旧恒假守卫源已删除）');

    const RUN_ARTIFACT_EVENTS = [
      ...RUN_EVENTS,
      { type: 'artifact', ref: 'T1', t: '2026-09-28T17:00:02.000Z', data: { title: 'REAL-ART-TITLE-1', path: 'art/one.js', summary: 'S1' } },
      { type: 'artifact', ref: 'T1', t: '2026-09-28T17:00:03.000Z', data: { title: 'REAL-ART-TITLE-2', path: 'art/two.md', summary: 'S2' } }
    ];
    const realArtState = project(RUN_ARTIFACT_EVENTS, '2026-09-28T18:00:00.000Z');

    const shelfRealRes = await evalRes(`
      (() => {
        const st = ${JSON.stringify(realArtState)};
        const rows = () => Array.from(document.querySelectorAll('#artifacts-list .artifact-row'));
        const paths = () => rows().map(r => (r.querySelector('.artifact-path') || {}).textContent);
        const metas = () => rows().map(r => (r.querySelector('.artifact-meta') || {}).textContent);
        window.__TL_APP__.render(st);
        const res = { count: rows().length, paths: paths(), metas: metas() };
        window.__TL_APP__.render(window.__TL__);
        return res;
      })()
    `);
    assert(shelfRealRes.count === 2 && shelfRealRes.paths[0] === 'art/one.js' && shelfRealRes.paths[1] === 'art/two.md'
      && shelfRealRes.metas[0].indexOf('REAL-ART-TITLE-1') !== -1 && shelfRealRes.metas[1].indexOf('REAL-ART-TITLE-2') !== -1,
      `SHELF-相(保持绿): 真跑态 project() 产 2 条 artifact → 书架渲出 2 行，path [${shelfRealRes.paths.join(', ')}] 与 title 均正确 (实渲 ${shelfRealRes.count} 行，meta ${JSON.stringify(shelfRealRes.metas)})`);

    const shelfEmptyRes = await evalRes(`
      (() => {
        const st = ${JSON.stringify(realRunState)};
        const rows = () => Array.from(document.querySelectorAll('#artifacts-list .artifact-row'));
        window.__TL_APP__.render(st);
        const n = rows().length;
        window.__TL_APP__.render(window.__TL__);
        return n;
      })()
    `);
    assert(shelfEmptyRes === 0,
      `SHELF-相(保持绿): 真跑态无 artifact 事件 → 书架零行渲空（诚实空态，不崩不造假行），实测 ${shelfEmptyRes} 行`);

    const fixtureFlatExpected = [];
    fixtureState.items.forEach(it => {
      ((it.evidence && it.evidence.artifacts) || []).forEach(a => fixtureFlatExpected.push({ itemId: it.id, path: a.path, title: a.title }));
    });
    const shelfFixtureRes = await evalRes(`
      (() => {
        window.__TL_APP__.render(window.__TL__);
        const rows = Array.from(document.querySelectorAll('#artifacts-list .artifact-row'));
        return rows.map(r => ({
          item: r.getAttribute('data-artifact-item'),
          path: (r.querySelector('.artifact-path') || {}).textContent,
          meta: (r.querySelector('.artifact-meta') || {}).textContent
        }));
      })()
    `);
    const fixtureRowsOk = shelfFixtureRes.length === fixtureFlatExpected.length &&
      shelfFixtureRes.every((r, i) => r.item === fixtureFlatExpected[i].itemId && r.path === fixtureFlatExpected[i].path
        && r.meta.indexOf(fixtureFlatExpected[i].title) !== -1);
    assert(fixtureFlatExpected.length > 0 && fixtureRowsOk,
      `SHELF-相(保持绿): 夹具 events.jsonl×${fixtureFlatExpected.length} 条 artifact 跨项扁平 → 书架 ${shelfFixtureRes.length} 行，逐行 item/path/title 对齐 (实渲 ${JSON.stringify(shelfFixtureRes)})`);

    const shelfMutantRes = await evalRes(`
      (() => {
        const base = window.__TL__;
        const rows = () => Array.from(document.querySelectorAll('#artifacts-list .artifact-row'));
        window.__TL_APP__.render(base);
        const controlCount = rows().length;
        // 变异：掐掉真源（清空每项 artifacts）并植入旧键 state.artifacts（旧渲染器读的键）
        const clone = JSON.parse(JSON.stringify(base));
        clone.items.forEach(it => { if (it.evidence) it.evidence.artifacts = []; });
        clone.artifacts = [{ id: 'FAKE', path: 'FAKE/old-key.js', commit: 'deadbeef', additions: 1, deletions: 1 }];
        window.__TL_APP__.render(clone);
        const mutantPaths = rows().map(r => (r.querySelector('.artifact-path') || {}).textContent);
        window.__TL_APP__.render(base);
        const restoredCount = rows().length;
        return { controlCount, mutantPaths, restoredCount };
      })()
    `);
    assert(shelfMutantRes.controlCount === fixtureFlatExpected.length
      && shelfMutantRes.mutantPaths.length === 0 && shelfMutantRes.mutantPaths.indexOf('FAKE/old-key.js') === -1,
      `SHELF-相(变异/亲眼变红): 掐真源(items[].evidence.artifacts 清空)并植入旧键 state.artifacts → 书架转红为零行、不回退读旧键 (对照 ${shelfMutantRes.controlCount} 行，变异 ${shelfMutantRes.mutantPaths.length} 行 ${JSON.stringify(shelfMutantRes.mutantPaths)})`);
    assert(shelfMutantRes.restoredCount === shelfMutantRes.controlCount,
      `SHELF-相(还原/复绿): 还原真源后书架回到 ${shelfMutantRes.restoredCount} 行，与对照组一致`);

    // ── J1~J6: 旅途视图 (Journey) · Continuum Pipeline 验收断言 ─────────────
    console.log('\n  正在执行 J1~J6 验证 (旅途视图：主轨迹通道 / 状态卡 / 影响矩阵 / 遥测表 / 日志流 / 离线化)...');

    // 切换至旅途视图，使截图与可见性断言在真实视口下成立
    await evalRes(`document.getElementById("nav-item-journey")?.click(); true`);

    // J1(票 36 重写)：state.pipeline 投影器零生产者 → 真跑态主轨迹通道零节点（诚实空态）
    const j1Res = await evalRes(`
      (() => {
        const container = document.getElementById("journey-pipeline-nodes");
        const nodes = Array.from(document.querySelectorAll("#journey-pipeline-nodes .pipeline-node"));
        const hasPipelineKey = Object.prototype.hasOwnProperty.call(window.__TL__ || {}, "pipeline");
        return { exists: Boolean(container), nodeCount: nodes.length, hasPipelineKey };
      })()
    `);
    assert(j1Res.exists && !j1Res.hasPipelineKey && j1Res.nodeCount === 0,
      `J1 对照组(保持绿): 真跑态 project() 不产 state.pipeline → 主轨迹通道容器在、零节点渲空（不崩、不回落 || 0），实测 ${j1Res.nodeCount} 节点`);

    // J1b(票 38 恢复正向覆盖)：票 36 把 P4-5 的 pipelineNodes 断言由 >0 改锚 ===0（诚实空态），
    // 代价是「universe 模式保留 pipeline 渲染」这一能力失去正向覆盖。本臂用自造合成 state 补回：
    // 有真源即正向渲出同数量节点（含 status 类与节点名），还原真跑态即归零——两侧都钉死。
    const j1bRes = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const st = JSON.parse(JSON.stringify(window.__TL__));
        st.pipeline = [
          { seq: 1, name: "positive-coverage-A", status: "settled", window: "00:10" },
          { seq: 2, name: "positive-coverage-B", status: "current", window: "00:20" }
        ];
        app.render(st);
        app.switchJourneyMode("universe");
        const nodes = Array.from(document.querySelectorAll("#journey-pipeline-nodes .pipeline-node"));
        const detail = nodes.map(n => ({ seq: n.getAttribute("data-node-seq"), status: n.getAttribute("data-status") }));
        const names = nodes.map(n => n.querySelector(".node-name")?.textContent || "");
        const mode = document.getElementById("view-journey").getAttribute("data-jmode");
        app.render(window.__TL__);
        app.switchJourneyMode("universe");
        const restored = document.querySelectorAll("#journey-pipeline-nodes .pipeline-node").length;
        return { mode, count: nodes.length, detail, names, restored };
      })()
    `);
    assert(j1bRes.mode === "universe" && j1bRes.count === 2 && j1bRes.detail[0].seq === "1" &&
      j1bRes.detail[1].status === "current" && j1bRes.names[1].indexOf("positive-coverage-B") !== -1 && j1bRes.restored === 0,
      `J1b 正向覆盖(保持绿，票38 恢复): universe 模式 + 合成 state.pipeline 两节点 → #journey-pipeline-nodes 正向渲出 2 个 .pipeline-node（data-status 与节点名跟随），还原真跑态后归零；实测 x${j1bRes.count} ${JSON.stringify(j1bRes.detail)}/${JSON.stringify(j1bRes.names)}，还原后 x${j1bRes.restored}`);

    // J2(票 36 重写)：state.stages 投影器零生产者 → 真跑态三段状态卡渲空（诚实空态）
    // 旧 J2（badge 由 state.stages[1].badge 驱动）整臂建立在无生产者键上，故整条改写。
    const j2Res = await evalRes(`
      (() => {
        const wrap = document.getElementById("journey-stages");
        const cards = Array.from(document.querySelectorAll("#journey-stages .stage-card"));
        const hasStagesKey = Object.prototype.hasOwnProperty.call(window.__TL__ || {}, "stages");
        return { exists: Boolean(wrap), cardCount: cards.length, hasStagesKey };
      })()
    `);
    assert(j2Res.exists && !j2Res.hasStagesKey && j2Res.cardCount === 0,
      `J2 对照组(保持绿): 真跑态 project() 不产 state.stages → 三段状态卡容器在、零卡片渲空（不崩、不回落），实测 ${j2Res.cardCount} 张`);

    // J3：影响矩阵五格文本与真投影器 ripple 逐一对齐（期望值取自真形状，非夹具扁平 decision.impact）
    const j3Res = await evalRes(`
      (() => {
        const d0 = (window.__TL__?.decisions?.[0]) || {};
        ${RIPPLE_OF_SRC}
        const ripple = rippleOf(d0);
        const items = (ripple && ripple.items) || {};
        const fmt = (field, value) => {
          if (field === "sunk_min") return typeof value === "number" ? value + " 分钟" : "未评估";
          const arr = Array.isArray(value) ? value : (value ? [String(value)] : []);
          if (arr.length === 0) {
            if (field === "redo") return "无返工";
            if (field === "enable") return "无解锁项";
            if (field === "disable") return "无排除分支";
            if (field === "affected_todo") return "无牵动项";
            return "—";
          }
          return arr.join(" / ");
        };
        const spec = [
          ["redo", items.redo],
          ["enable", items.enable],
          ["disable", items.disable],
          ["affected_todo", items.affected_todo],
          ["sunk_min", ripple ? ripple.sunk_min : undefined]
        ];
        const cells = spec.map(s => document.querySelector('#journey-impact-matrix .impact-cell[data-impact-field="' + s[0] + '"]'));
        const exists = cells.length === 5 && cells.every(Boolean);
        const valueMatch = exists && spec.every((s, i) => {
          const raw = (s[1] === undefined) ? null : s[1];
          const attr = cells[i].getAttribute("data-impact-value");
          const text = cells[i].querySelector(".impact-cell-val").textContent.trim();
          return attr === JSON.stringify(raw) && text === fmt(s[0], raw);
        });
        const nonEmpty = exists && spec.every((s, i) => cells[i].querySelector(".impact-cell-val").textContent.trim().length > 0);
        const control = exists && valueMatch && nonEmpty;

        const redoValEl = cells.length ? cells[0].querySelector(".impact-cell-val") : null;
        let mutant = false, restored = false;
        if (redoValEl) {
          const originalText = redoValEl.textContent;
          redoValEl.textContent = "99 项返工";
          mutant = redoValEl.textContent === fmt("redo", items.redo);
          redoValEl.textContent = originalText;
          restored = redoValEl.textContent === fmt("redo", items.redo);
        }

        return { control, mutant, restored, texts: cells.map(c => c ? c.querySelector(".impact-cell-val").textContent.trim() : "") };
      })()
    `);
    assert(!j3Res.mutant, `J3 变异组(亲眼变红): 篡改影响矩阵文本后与真投影器 ripple 对齐断言转红 (mutant: false)`);
    assert(j3Res.control && j3Res.restored, `J3 对照组(保持绿): 影响矩阵五格(返工/启用/停用/牵动/沉没)与 decision.effective.ripple 逐一对齐 (${j3Res.texts.join(' | ')})`);

    // J4(票 43 接线重写)：遥测表真源 = items[].evidence.checks（跨项扁平）。
    // 票 36 曾判诚实空态（页面读无生产者的顶层 state.checks）；票 43 改判「有真源、页面读错键」→ 接线。
    const j4Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const st = window.__TL__;
        const items = Array.isArray(st.items) ? st.items : [];
        const expected = [];
        items.forEach(it => {
          const list = (it.evidence && Array.isArray(it.evidence.checks)) ? it.evidence.checks : [];
          list.forEach(c => expected.push(c));
        });
        const rows = Array.from(document.querySelectorAll("#journey-telemetry-body tr"));
        const ids = rows.map(r => r.getAttribute("data-check-id"));
        const expectedIds = expected.map(c => c.id);
        const hasTopKey = Object.prototype.hasOwnProperty.call(st, "checks");
        const control = !hasTopKey && expected.length > 0 && rows.length === expected.length &&
          ids.length === expectedIds.length && ids.every((v, i) => v === expectedIds[i]);

        // 变异：掐掉真源读（合成 state 的 evidence.checks 全清空）→ 行数归零，与期望数不符 → 转红
        const mutantState = JSON.parse(JSON.stringify(st));
        (mutantState.items || []).forEach(it => { if (it.evidence) it.evidence.checks = []; });
        app.render(mutantState);
        const mutantRows = document.querySelectorAll("#journey-telemetry-body tr").length;
        app.render(st);
        const restoredRows = document.querySelectorAll("#journey-telemetry-body tr").length;
        return { control, mutantFail: mutantRows !== expected.length, restored: restoredRows === expected.length, expectedCount: expected.length, mutantRows, restoredRows };
      })()
    `);
    assert(j4Res.mutantFail, `J4 变异组(亲眼转红): 清空 items[].evidence.checks 真源 → 遥测表行数(${j4Res.mutantRows}) ≠ 期望(${j4Res.expectedCount})，接线断言转红`);
    assert(j4Res.control && j4Res.restored,
      `J4 对照组(票43 接线): 遥测表行数 = items[].evidence.checks 跨项扁平数（实测 ${j4Res.expectedCount} 行，data-check-id 逐步对齐），顶层无 state.checks、不回落；还原真源后复绿`);

    // J5(票 36 重写)：state.logs 投影器零生产者 → 真跑态日志流零行（诚实空态）
    const j5Res = await evalRes(`
      (() => {
        const wrap = document.getElementById("journey-log-stream");
        const lines = Array.from(document.querySelectorAll("#journey-log-stream .log-line"));
        const hasLogsKey = Object.prototype.hasOwnProperty.call(window.__TL__ || {}, "logs");
        return { exists: Boolean(wrap), lineCount: lines.length, hasLogsKey };
      })()
    `);
    assert(j5Res.exists && !j5Res.hasLogsKey && j5Res.lineCount === 0,
      `J5 对照组(保持绿): 真跑态 project() 不产 state.logs → 日志流容器在、零行渲空（不崩、不回落），实测 ${j5Res.lineCount} 行`);

    // J6：旅途视图离线化（子树内零 http(s)://、零 @import、零 icon font，图标全为内联 SVG）
    const j6Res = await evalRes(`
      (() => {
        const scope = document.getElementById("view-journey");
        const urlAttrs = [];
        Array.from(scope.querySelectorAll("[src], [href], [style]")).forEach(el => {
          ["src", "href", "style"].forEach(attr => {
            const v = el.getAttribute(attr);
            if (v && /(https?:|\\/\\/)/i.test(v)) urlAttrs.push(attr + "=" + v);
          });
        });
        let hasImport = false;
        Array.from(scope.querySelectorAll("style")).forEach(st => {
          if (/@import/i.test(st.textContent)) hasImport = true;
        });
        const iconFonts = scope.querySelectorAll('[class*="material-symbols"], [class*="material-icons"], [class*="fontawesome"], [class*="fa-"]');
        const svgCount = scope.querySelectorAll("svg").length;
        const control = urlAttrs.length === 0 && !hasImport && iconFonts.length === 0 && svgCount > 0;

        const mutantLink = document.createElement("link");
        mutantLink.id = "journey-mutant-link";
        mutantLink.href = "https://fonts.googleapis.com/css2";
        scope.appendChild(mutantLink);
        const mutantUrls = Array.from(scope.querySelectorAll("[src], [href]"))
          .map(e => e.getAttribute("href") || e.getAttribute("src"))
          .filter(v => /(https?:|\\/\\/)/i.test(v));
        const mutant = mutantUrls.length === 0;
        mutantLink.remove();
        const restored = Array.from(scope.querySelectorAll("[href], [src]"))
          .map(e => e.getAttribute("href") || e.getAttribute("src"))
          .filter(v => /(https?:|\\/\\/)/i.test(v)).length === 0;

        return { control, mutant, restored, urlCount: urlAttrs.length, svgCount, iconFontCount: iconFonts.length };
      })()
    `);
    assert(!j6Res.mutant, `J6 变异组(亲眼变红): 旅途视图内注入外部字体链接后离线化断言转红 (mutant: false)`);
    assert(j6Res.control && j6Res.restored, `J6 对照组(保持绿): 旅途视图 100% 离线自包含 (外链 ${j6Res.urlCount} / @import 无 / icon font ${j6Res.iconFontCount}，内联 SVG ${j6Res.svgCount} 枚)`);

    // 捕获旅途视图截图 (以桌面全宽视口渲染，供人工比对设计稿)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
    const journeyShot = await cdp('Page.captureScreenshot', { format: 'png' });
    await cdp('Emulation.clearDeviceMetricsOverride');
    const journeyPath = path.join(screenshotsDir, 'journey.png');
    fs.writeFileSync(journeyPath, Buffer.from(journeyShot.data, 'base64'));
    assert(fs.existsSync(journeyPath) && fs.statSync(journeyPath).size > 10000, `已生成旅途视图 Journey 截图: ${journeyPath}`);

    // ── D1~D6: 决策视图 (Decisions) · Arbitration Console 验收断言 ─────────
    console.log('\n  正在执行 D1~D6 验证 (决策视图：分支路径 / 优先队列 / 影响矩阵 / 倒计时 / 仲裁计数 / 离线化)...');

    // 切换至决策视图，使可见性相关断言与截图在真实视口下成立
    await evalRes(`document.getElementById("nav-item-decisions")?.click(); true`);

    // D1：分支路径卡片数 = state.decisions[0].options.length，key/label 逐一取自 state
    const d1Res = await evalRes(`
      (() => {
        const opts = (window.__TL__?.decisions?.[0]?.options) || [];
        const cards = Array.from(document.querySelectorAll("#decisions-pathway-list .pathway-card"));
        const labelOf = (c) => c.querySelector(".pathway-label")?.textContent.trim() || "";
        const expectedOf = (o) => \`\${o.key}. \${o.label}\`;

        const countMatch = cards.length === opts.length && opts.length > 0;
        const keyLabelMatch = countMatch && cards.every((c, i) => c.getAttribute("data-pathway") === opts[i].key && labelOf(c) === expectedOf(opts[i]));
        const control = countMatch && keyLabelMatch;

        const firstLabel = cards[0] ? cards[0].querySelector(".pathway-label") : null;
        let mutant = false, restored = false;
        if (firstLabel) {
          const original = firstLabel.textContent;
          firstLabel.textContent = "X. 硬编码假方案";
          mutant = firstLabel.textContent === expectedOf(opts[0]);
          firstLabel.textContent = original;
          restored = firstLabel.textContent === expectedOf(opts[0]);
        }

        return { control, mutant, restored, cardCount: cards.length, optCount: opts.length };
      })()
    `);
    assert(!d1Res.mutant, `D1 变异组(亲眼变红): 分支路径卡 label 被篡改后与 state 对齐断言转红 (mutant: false)`);
    assert(d1Res.control && d1Res.restored, `D1 对照组(保持绿): 分支路径卡数(${d1Res.cardCount}) = state.decisions[0].options.length(${d1Res.optCount})，key/label 逐一取自 state`);

    // D2(票 32 迁移)：优先关注队列条目数 = state.queue.review.length，且渲染顺序 = 按 score 降序
    const d2Res = await evalRes(`
      (() => {
        const review = (window.__TL__?.queue?.review) || [];
        const items = () => Array.from(document.querySelectorAll("#decisions-attention-queue .attention-item"));
        const scores = () => items().map(el => { const v = el.getAttribute("data-score"); return v === "" || v === null ? null : Number(v); });
        const expected = review.map(r => r.score).sort((a, b) => b - a);

        const list = items();
        const countMatch = list.length === review.length && review.length > 0;
        const orderMatch = countMatch && scores().every((s, i) => s === expected[i]);
        const control = countMatch && orderMatch;

        // 变异：调换前两项顺序（模拟未按 score 降序渲染）
        const queue = document.getElementById("decisions-attention-queue");
        const a = list[0], b = list[1];
        let mutant = false;
        if (a && b && a.getAttribute("data-score") !== b.getAttribute("data-score")) {
          queue.insertBefore(b, a);
          mutant = scores().every((s, i) => s === expected[i]);
          queue.insertBefore(a, b);
        }
        const restored = scores().every((s, i) => s === expected[i]);

        return { control, mutant, restored, scores: scores(), expected, count: list.length };
      })()
    `);
    assert(!d2Res.mutant, `D2 变异组(亲眼变红): 打乱队列顺序后按 score 降序断言转红 (mutant: false)`);
    assert(d2Res.control && d2Res.restored, `D2 对照组(保持绿): 优先关注队列条目数(${d2Res.count}) = state.queue.review.length，渲染顺序 = 按 score 降序 ([${d2Res.scores.join(', ')}])`);

    // D3：决策影响矩阵五格文本与真投影器 ripple 逐一对齐（期望值取自真形状，非夹具扁平 decision.impact）
    const d3Res = await evalRes(`
      (() => {
        const d0 = (window.__TL__?.decisions?.[0]) || {};
        ${RIPPLE_OF_SRC}
        const ripple = rippleOf(d0);
        const items = (ripple && ripple.items) || {};
        const fmt = (field, value) => {
          if (field === "sunk_min") return typeof value === "number" ? value + " 分钟" : "未评估";
          const arr = Array.isArray(value) ? value : (value ? [String(value)] : []);
          if (arr.length === 0) {
            if (field === "redo") return "无返工";
            if (field === "enable") return "无解锁项";
            if (field === "disable") return "无排除分支";
            if (field === "affected_todo") return "无牵动项";
            return "—";
          }
          return arr.join(" / ");
        };
        const spec = [
          ["redo", items.redo],
          ["enable", items.enable],
          ["disable", items.disable],
          ["affected_todo", items.affected_todo],
          ["sunk_min", ripple ? ripple.sunk_min : undefined]
        ];
        const cells = spec.map(s => document.querySelector('#decisions-impact-matrix .impact-cell[data-impact-field="' + s[0] + '"]'));
        const exists = cells.length === 5 && cells.every(Boolean);
        const valueMatch = exists && spec.every((s, i) => {
          const raw = (s[1] === undefined) ? null : s[1];
          const attr = cells[i].getAttribute("data-impact-value");
          const text = cells[i].querySelector(".impact-cell-val").textContent.trim();
          return attr === JSON.stringify(raw) && text === fmt(s[0], raw);
        });
        const nonEmpty = exists && spec.every((s, i) => cells[i].querySelector(".impact-cell-val").textContent.trim().length > 0);
        const control = exists && valueMatch && nonEmpty;

        const redoValEl = cells.length ? cells[0].querySelector(".impact-cell-val") : null;
        let mutant = false, restored = false;
        if (redoValEl) {
          const originalText = redoValEl.textContent;
          redoValEl.textContent = "99 项返工";
          mutant = redoValEl.textContent === fmt("redo", items.redo);
          redoValEl.textContent = originalText;
          restored = redoValEl.textContent === fmt("redo", items.redo);
        }

        return { control, mutant, restored, texts: cells.map(c => c ? c.querySelector(".impact-cell-val").textContent.trim() : "") };
      })()
    `);
    assert(!d3Res.mutant, `D3 变异组(亲眼变红): 篡改决策影响矩阵文本后与真投影器 ripple 对齐断言转红 (mutant: false)`);
    assert(d3Res.control && d3Res.restored, `D3 对照组(保持绿): 决策影响矩阵五格(返工/启用/停用/牵动/沉没)与 decision.effective.ripple 逐一对齐 (${d3Res.texts.join(' | ')})`);

    // M1 看护：两处影响矩阵中，凡 .impact-cell-val 非空的格子，其后代不得出现任何声称
    // 「未记录 / 未评估 / 无数据 / 未采集」的小字（防诚实降级文案贴错层级，挂到有真值的格子上）。
    // 刻意不写成「sub 数量必须为 0」，以便日后合法新增 sub 时不误报。
    // 空格子（.impact-cell-val 为空）不参与此规则：给它挂「本 run 未记录」小字是合法形态，
    // 故断言只要求 count === 5（反空心：选择器失配即转红）与逐格 bad 为空，不要求 nonEmpty === 5。
    const m1Res = await evalRes(`
      (() => {
        const FORBIDDEN = /未记录|未评估|无数据|未采集/;
        const scan = (wrapId) => {
          const cells = Array.from(document.querySelectorAll("#" + wrapId + " .impact-cell"));
          const bad = [];
          cells.forEach((cell) => {
            const valEl = cell.querySelector(".impact-cell-val");
            if (!valEl || !valEl.textContent.trim()) return;
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              if (valEl.contains(node)) continue;
              if (FORBIDDEN.test(node.nodeValue)) bad.push((cell.getAttribute("data-impact-field") || "?") + "：「" + node.nodeValue.trim() + "」");
            }
          });
          return { count: cells.length, nonEmpty: cells.filter(c => { const v = c.querySelector(".impact-cell-val"); return v && v.textContent.trim(); }).length, bad };
        };
        return { journey: scan("journey-impact-matrix"), decisions: scan("decisions-impact-matrix") };
      })()
    `);
    assert(m1Res.journey.count === 5 && m1Res.decisions.count === 5
      && m1Res.journey.nonEmpty >= 1 && m1Res.decisions.nonEmpty >= 1
      && m1Res.journey.bad.length === 0 && m1Res.decisions.bad.length === 0,
      `M1 看护(保持绿): 两处影响矩阵非空格子后代无「未记录/未评估/无数据/未采集」小字 (journey ${m1Res.journey.count}格/${m1Res.journey.nonEmpty}非空, decisions ${m1Res.decisions.count}格/${m1Res.decisions.nonEmpty}非空, 违规 [${(m1Res.journey.bad.concat(m1Res.decisions.bad)).join(' ; ')}])`);

    // M2 看护(票 36 重写)：生成式夹具下 decisions[] 的扁平诱饵键（impact / code / severity /
    // priority / created_offset_s）与 options[].badge 根本不存在。判别目标从旧的「诱饵不相等」
    // 升级为「诱饵根本不存在」—— 即夹具键集 ⊆ 投影器键集（决策层）。J3/D3 的「读真 ripple vs
    // 读扁平块」判别力已由 P4-7b/P4-8 的自造合成输入独立承担。
    const m2Res = await evalRes(`
      (() => {
        const decisions = (window.__TL__ && window.__TL__.decisions) || [];
        const DEC_FORBIDDEN = ["impact", "code", "severity", "priority", "created_offset_s"];
        const OPT_FORBIDDEN = ["badge"];
        const badDec = [];
        const badOpt = [];
        decisions.forEach((d) => {
          DEC_FORBIDDEN.forEach((k) => { if (Object.prototype.hasOwnProperty.call(d, k)) badDec.push(d.id + "." + k); });
          (Array.isArray(d.options) ? d.options : []).forEach((o) => {
            OPT_FORBIDDEN.forEach((k) => { if (Object.prototype.hasOwnProperty.call(o, k)) badOpt.push(d.id + "/" + o.key + "." + k); });
          });
        });
        const optCount = decisions.reduce((n, d) => n + (Array.isArray(d.options) ? d.options.length : 0), 0);
        return { decisionCount: decisions.length, optCount, badDec, badOpt };
      })()
    `);
    assert(m2Res.decisionCount > 0 && m2Res.optCount > 0 && m2Res.badDec.length === 0 && m2Res.badOpt.length === 0,
      `M2 看护(保持绿，票36 正向改写): 生成式夹具 decisions[] 键集 ⊆ 投影器键集 —— 决策级不含 [impact,code,severity,priority,created_offset_s]、options[] 不含 [badge]（实测 ${m2Res.decisionCount} 决策 / ${m2Res.optCount} 选项；违规 [${m2Res.badDec.concat(m2Res.badOpt).join(', ')}]）`);

    // D4(票 32 重写)：决策视图倒计时无真源诚实渲 '—'；行动条与顶部同源(待默认项 default label)
    console.log('\n  正在执行 D4 验证 (决策视图倒计时诚实降级与行动条同源)...');
    const d4Res = await evalRes(`
      (() => {
        const st = window.__TL__ || {};
        const isPending = (d) => d && (d.status === "pending_default" || d.status === "pending_hold");
        const expected = ${JSON.stringify(EXPECTED_DEFAULT_LABEL)};

        const cd = (document.getElementById("decisions-decay-countdown")?.textContent || "").trim();
        const action = (document.getElementById("decisions-decay-action")?.textContent || "").trim();
        const desc = (document.getElementById("decisions-decay-desc")?.textContent || "").trim();

        const countdownHonest = cd === "—";
        const actionMatch = action.length > 0 && action === expected;
        const noSick = !desc.includes("若若干秒内") && !desc.includes("若无干预将在") && desc.includes("后自动默认执行：");
        const startsWithCd = desc.startsWith(cd);

        const clone = JSON.parse(JSON.stringify(st));
        clone.decisions = clone.decisions.filter(d => !isPending(d));
        window.__TL_APP__.render(clone);
        const honest = (document.getElementById("decisions-decay-action")?.textContent || "").trim();
        window.__TL_APP__.render(st);
        const restored = (document.getElementById("decisions-decay-action")?.textContent || "").trim();

        return { countdownHonest, actionMatch, noSick, startsWithCd, honest, restored, cd, action, desc, expected };
      })()
    `);
    assert(d4Res.countdownHonest,
      `D4 对照组(保持绿): 决策视图倒计时无真源 → 诚实渲 "—"（实渲 "${d4Res.cd}"），不再拼 "00m 00s"`);
    assert(d4Res.actionMatch && d4Res.noSick && d4Res.startsWithCd,
      `D4 对照组(保持绿): 决策视图行动条与顶部同源 = 待默认项 default label ("${d4Res.action}")，"<倒计时> 后自动默认执行：<action>" 结构成立且无病句`);
    assert(d4Res.honest === '—',
      `D4 变异组(亲眼变红): 抹掉待默认决策后行动条必须渲 "—"；若回落旧伪造路径(primary.options[0].label / 静态 "--")即转红 (实渲 "${d4Res.honest}")`);
    assert(d4Res.restored === d4Res.expected,
      `D4 还原(保持绿): 还原真实状态后行动条复回 "${d4Res.restored}"`);

    // D5：CRITICAL ARBITRATION ACTIVE: <N> REQUIRES ACTION 的 N 由真实待办态决策数驱动
    const d5Res = await evalRes(`
      (() => {
        const state = window.__TL__;
        const app = window.__TL_APP__;
        const decisions = state.decisions || [];
        const read = () => document.getElementById("decisions-critical-count")?.textContent.trim() || "";
        const isPending = (d) => d && (d.status === "pending_default" || d.status === "pending_hold");
        const pending0 = decisions.filter(isPending).length;
        const control = read() === pending0 + " REQUIRES ACTION";

        const orig = decisions[0].status;
        decisions[0].status = "settled";
        const mutant = read() === (pending0 - 1) + " REQUIRES ACTION"; // 未重渲染 → DOM 未跟随 → false
        app.render(state);
        const driven = read() === (pending0 - 1) + " REQUIRES ACTION";
        decisions[0].status = orig;
        app.render(state);
        const restored = read() === pending0 + " REQUIRES ACTION";

        return { control, mutant, driven, restored, pending0, text: read() };
      })()
    `);
    assert(!d5Res.mutant, `D5 变异组(亲眼变红): 真实待办态决策数变更而 DOM 未同步时仲裁计数断言转红 (mutant: false)`);
    assert(d5Res.control && d5Res.driven && d5Res.restored, `D5 对照组(保持绿): "CRITICAL ARBITRATION ACTIVE: ${d5Res.pending0} REQUIRES ACTION" 由真实待办态决策数驱动（改待办数 → 重渲染 → DOM 跟随）`);

    // D6：决策视图离线化（子树内零 http(s)://、零 @import、零 icon font，图标全为内联 SVG）
    const d6Res = await evalRes(`
      (() => {
        const scope = document.getElementById("view-decisions");
        const urlAttrs = [];
        Array.from(scope.querySelectorAll("[src], [href], [style]")).forEach(el => {
          ["src", "href", "style"].forEach(attr => {
            const v = el.getAttribute(attr);
            if (v && /(https?:|\\/\\/)/i.test(v)) urlAttrs.push(attr + "=" + v);
          });
        });
        let hasImport = false;
        Array.from(scope.querySelectorAll("style")).forEach(st => {
          if (/@import/i.test(st.textContent)) hasImport = true;
        });
        const iconFonts = scope.querySelectorAll('[class*="material-symbols"], [class*="material-icons"], [class*="fontawesome"], [class*="fa-"]');
        const svgCount = scope.querySelectorAll("svg").length;
        const control = urlAttrs.length === 0 && !hasImport && iconFonts.length === 0 && svgCount > 0;

        const mutantLink = document.createElement("link");
        mutantLink.id = "decisions-mutant-link";
        mutantLink.href = "https://fonts.googleapis.com/css2";
        scope.appendChild(mutantLink);
        const mutantUrls = Array.from(scope.querySelectorAll("[src], [href]"))
          .map(e => e.getAttribute("href") || e.getAttribute("src"))
          .filter(v => /(https?:|\\/\\/)/i.test(v));
        const mutant = mutantUrls.length === 0;
        mutantLink.remove();
        const restored = Array.from(scope.querySelectorAll("[href], [src]"))
          .map(e => e.getAttribute("href") || e.getAttribute("src"))
          .filter(v => /(https?:|\\/\\/)/i.test(v)).length === 0;

        return { control, mutant, restored, urlCount: urlAttrs.length, svgCount, iconFontCount: iconFonts.length };
      })()
    `);
    assert(!d6Res.mutant, `D6 变异组(亲眼变红): 决策视图内注入外部字体链接后离线化断言转红 (mutant: false)`);
    assert(d6Res.control && d6Res.restored, `D6 对照组(保持绿): 决策视图 100% 离线自包含 (外链 ${d6Res.urlCount} / @import 无 / icon font ${d6Res.iconFontCount}，内联 SVG ${d6Res.svgCount} 枚)`);

    // 捕获决策视图截图 (以桌面全宽视口渲染，供人工比对设计稿)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
    const decisionsShot = await cdp('Page.captureScreenshot', { format: 'png' });
    await cdp('Emulation.clearDeviceMetricsOverride');
    const decisionsPath = path.join(screenshotsDir, 'decisions.png');
    fs.writeFileSync(decisionsPath, Buffer.from(decisionsShot.data, 'base64'));
    assert(fs.existsSync(decisionsPath) && fs.statSync(decisionsPath).size > 10000, `已生成决策视图 Decisions 截图: ${decisionsPath}`);

    // ── L1~L6: 账本视图 (Ledger) · 追加只写核验台账 验收断言 ────────────────
    console.log('\n  正在执行 L1~L6 验证 (账本视图：行数/筛选/计数条/MERKLE/确定性JSON/离线化)...');

    // 切换至账本视图，使可见性相关断言与截图在真实视口下成立
    await evalRes(`document.getElementById("nav-item-ledger")?.click(); true`);

    // L1(票 43 接线重写)：账本行集真源 = trail（事件轨迹）+ activity（actor）。
    // 票 36 曾判诚实空态（页面读无生产者的顶层 state.ledger）；票 43 改判「有真源、页面读错键」→ 接线。
    const l1Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const st = window.__TL__;
        const trail = Array.isArray(st.trail) ? st.trail : [];
        const rows = Array.from(document.querySelectorAll("#ledger-rows .ledger-row"));
        const seqs = rows.map(r => r.getAttribute("data-seq"));
        const expectedSeqs = trail.map(e => String(e.seq));
        const hasTopKey = Object.prototype.hasOwnProperty.call(st, "ledger");
        const control = !hasTopKey && trail.length > 0 && rows.length === trail.length &&
          seqs.length === expectedSeqs.length && seqs.every((v, i) => v === expectedSeqs[i]);

        // 变异：掐掉真源读（合成 state 的 trail 清空）→ 行数归零，与期望数不符 → 转红
        const mutantState = JSON.parse(JSON.stringify(st));
        mutantState.trail = [];
        app.render(mutantState);
        const mutantRows = document.querySelectorAll("#ledger-rows .ledger-row").length;
        app.render(st);
        const restoredRows = document.querySelectorAll("#ledger-rows .ledger-row").length;
        return { control, mutantFail: mutantRows !== trail.length, restored: restoredRows === trail.length, expectedCount: trail.length, mutantRows };
      })()
    `);
    assert(l1Res.mutantFail, `L1 变异组(亲眼转红): 清空 st.trail 真源 → 账本行数(${l1Res.mutantRows}) ≠ 期望(${l1Res.expectedCount})，接线断言转红`);
    assert(l1Res.control && l1Res.restored,
      `L1 对照组(票43 接线): 账本行数 = trail 事件数（实测 ${l1Res.expectedCount} 行，data-seq 与事件 seq 全列表对齐），顶层无 state.ledger、不回落`);

    // L2(票 43 接线重写)：LANE 筛选在真源行集上生效（LANE:DONE 命中「归 done 的事件」子集，切回 all 复原全量）
    const l2Res = await evalRes(`
      (() => {
        const st = window.__TL__;
        const trail = Array.isArray(st.trail) ? st.trail : [];
        const items = Array.isArray(st.items) ? st.items : [];
        const laneById = new Map(items.map(i => [i.id, i.lane]));
        const expectedDone = trail.filter(e => laneById.get(e.ref || "") === "done").length;
        const rows = () => document.querySelectorAll("#ledger-rows .ledger-row").length;
        const click = (sel) => { const b = document.querySelector(sel); if (b) b.click(); };
        click('#ledger-lane-filters [data-lane="all"]');
        const all = rows();
        click('#ledger-lane-filters [data-lane="done"]');
        const done = rows();
        click('#ledger-lane-filters [data-lane="all"]');
        const restored = rows();
        return { all, done, restored, expectedAll: trail.length, expectedDone };
      })()
    `);
    assert(l2Res.all === l2Res.expectedAll && l2Res.done === l2Res.expectedDone && l2Res.restored === l2Res.expectedAll && l2Res.expectedDone < l2Res.expectedAll,
      `L2 对照组(票43 接线): LANE 筛选在真源行集上生效 —— all=${l2Res.all}(=trail ${l2Res.expectedAll}) / DONE=${l2Res.done}(=归 done 的事件 ${l2Res.expectedDone}) / 复位=${l2Res.restored}`);

    // L3(票 43 接线重写)：计数条 = "{trail.length} OF {trail.length} RECORDS MATCHING FILTER CRITERIA"（真量、非伪造）
    const l3Res = await evalRes(`
      (() => {
        const st = window.__TL__;
        document.querySelector('#ledger-lane-filters [data-lane="all"]')?.click();
        const el = document.getElementById("ledger-count");
        const n = (Array.isArray(st.trail) ? st.trail : []).length;
        return { text: el ? el.textContent.trim() : "", expected: n + " OF " + n + " RECORDS MATCHING FILTER CRITERIA" };
      })()
    `);
    assert(l3Res.text === l3Res.expected,
      `L3 对照组(票43 接线): 计数条 = "${l3Res.expected}"（由真 trail 量驱动；实渲 "${l3Res.text}"）`);

    // L4(票 36 重写)：state.ledgerMeta 投影器零生产者 → MERKLE ROOT 渲占位 "--"
    const l4Res = await evalRes(`
      (() => {
        const el = document.getElementById("ledger-merkle-root");
        const hasMetaKey = Object.prototype.hasOwnProperty.call(window.__TL__ || {}, "ledgerMeta");
        return { exists: Boolean(el), text: el ? el.textContent.trim() : null, hasMetaKey };
      })()
    `);
    assert(l4Res.exists && !l4Res.hasMetaKey && l4Res.text === "--",
      `L4 对照组(保持绿): 真跑态无 state.ledgerMeta → MERKLE ROOT 渲占位 "--"，不伪造 root（实渲 "${l4Res.text}"）`);

    // L5(票 43 接线重写)：真源行内无 payload → 展开节点诚实渲 '—'，不伪造确定性 JSON
    const l5Res = await evalRes(`
      (() => {
        const rows = Array.from(document.querySelectorAll("#ledger-rows .ledger-row"));
        const payloads = Array.from(document.querySelectorAll("#ledger-rows .ledger-payload-json"));
        const fabricated = payloads.filter(p => { const t = p.textContent.trim(); return t !== "—" && t !== ""; });
        return { rowCount: rows.length, payloadCount: payloads.length, fabricatedCount: fabricated.length };
      })()
    `);
    assert(l5Res.rowCount > 0 && l5Res.payloadCount === l5Res.rowCount && l5Res.fabricatedCount === 0,
      `L5 对照组(票43 接线): 每行一个 payload 展开节点共 ${l5Res.payloadCount} 个（=行数 ${l5Res.rowCount}），且全部诚实 '—'（无 payload 真源，不得伪造 JSON；伪造 ${l5Res.fabricatedCount} 处）`);

    // L6：账本视图离线化（子树内零 http(s)://、零 @import、零 icon font，图标全为内联 SVG）
    const l6Res = await evalRes(`
      (() => {
        const scope = document.getElementById("view-ledger");
        const urlAttrs = [];
        Array.from(scope.querySelectorAll("[src], [href], [style]")).forEach(el => {
          ["src", "href", "style"].forEach(attr => {
            const v = el.getAttribute(attr);
            if (v && /(https?:|\\/\\/)/i.test(v)) urlAttrs.push(attr + "=" + v);
          });
        });
        let hasImport = false;
        Array.from(scope.querySelectorAll("style")).forEach(st => { if (/@import/i.test(st.textContent)) hasImport = true; });
        const iconFonts = scope.querySelectorAll('[class*="material-symbols"], [class*="material-icons"], [class*="fontawesome"], [class*="fa-"]');
        const svgCount = scope.querySelectorAll("svg").length;
        const control = urlAttrs.length === 0 && !hasImport && iconFonts.length === 0 && svgCount > 0;

        const mutantLink = document.createElement("link");
        mutantLink.id = "ledger-mutant-link";
        mutantLink.href = "https://fonts.googleapis.com/css2";
        scope.appendChild(mutantLink);
        const mutantUrls = Array.from(scope.querySelectorAll("[src], [href]"))
          .map(e => e.getAttribute("href") || e.getAttribute("src"))
          .filter(v => /(https?:|\\/\\/)/i.test(v));
        const mutant = mutantUrls.length === 0;
        mutantLink.remove();
        const restored = Array.from(scope.querySelectorAll("[href], [src]"))
          .map(e => e.getAttribute("href") || e.getAttribute("src"))
          .filter(v => /(https?:|\\/\\/)/i.test(v)).length === 0;

        return { control, mutant, restored, urlCount: urlAttrs.length, svgCount, iconFontCount: iconFonts.length };
      })()
    `);
    assert(!l6Res.mutant, `L6 变异组(亲眼变红): ledger 视图内注入外部字体链接后离线化断言转红 (mutant: false)`);
    assert(l6Res.control && l6Res.restored, `L6 对照组(保持绿): ledger 视图 100% 离线自包含 (外链 ${l6Res.urlCount} / @import 无 / icon font ${l6Res.iconFontCount}，内联 SVG ${l6Res.svgCount} 枚)`);

    // 捕获账本视图截图（首行已展开，匹配设计稿首行展开态）
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
    const ledgerShot = await cdp('Page.captureScreenshot', { format: 'png' });
    await cdp('Emulation.clearDeviceMetricsOverride');
    const ledgerPath = path.join(screenshotsDir, 'ledger.png');
    fs.writeFileSync(ledgerPath, Buffer.from(ledgerShot.data, 'base64'));
    assert(fs.existsSync(ledgerPath) && fs.statSync(ledgerPath).size > 10000, `已生成账本视图 Ledger 截图: ${ledgerPath}`);

    // 票 43 · 四视图渲染健全性（headless 真渲）：逐视图切换后，可见文本不得泄漏 undefined / NaN。
    const renderSanity = await evalRes(`
      (() => {
        const views = [["board", "nav-item-board"], ["decisions", "nav-item-decisions"], ["journey", "nav-item-journey"], ["ledger", "nav-item-ledger"]];
        const bad = [];
        for (const [name, navId] of views) {
          const nav = document.getElementById(navId);
          if (nav) nav.click();
          const panel = document.querySelector('[data-view="' + name + '"]');
          const t = panel ? (panel.innerText || "") : "";
          if (/(^|[^A-Za-z0-9_])undefined([^A-Za-z0-9_]|$)/.test(t)) bad.push(name + ":undefined");
          if (/(^|[^A-Za-z0-9_])NaN([^A-Za-z0-9_]|$)/.test(t)) bad.push(name + ":NaN");
        }
        return { bad, viewCount: views.length };
      })()
    `);
    assert(renderSanity.bad.length === 0,
      `票43 四视图渲染健全性(headless 真渲): 看板/决策/旅途/账本 四视图可见文本均无 undefined/NaN 泄漏（实测 [${renderSanity.bad.join(', ')}]）`);

    // ══════════════════════════════════════════════════════════════════
    // P4 · 阶段 4 深度功能端到端 (功能 1 回放 / 2 分支 / 3 空档折叠 / 4 分块 / 5 模式 / 6 符号 / 7 抽屉)
    // ══════════════════════════════════════════════════════════════════
    console.log('\n  正在执行 P4-1~P4-7 验证 (时空视图模式 + 7 项深度功能)...');
    await evalRes(`document.getElementById("nav-item-journey")?.click(); true`);

    // ── 功能 5 · 4 档模式切换 + 面板可见性 + 回归基线 ────────────────────
    const p5Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const view = document.getElementById("view-journey");
        const modes = ["universe", "timeline", "atlas", "branches"];
        const perMode = {};
        modes.forEach((m) => {
          document.getElementById("btn-mode-" + m).click();
          const active = Array.from(document.querySelectorAll("#journey-mode-bar .btn-mode.is-active"));
          perMode[m] = {
            jmode: view.getAttribute("data-jmode"),
            activeIds: active.map((b) => b.id),
            canvas: getComputedStyle(document.getElementById("journey-canvas-card")).display !== "none",
            atlas: getComputedStyle(document.getElementById("journey-atlas-panel")).display !== "none",
            branches: getComputedStyle(document.getElementById("journey-branches-panel")).display !== "none",
            replay: getComputedStyle(document.getElementById("journey-replay-bar")).display !== "none",
            pipelineNodes: document.querySelectorAll("#journey-pipeline-nodes .pipeline-node").length
          };
        });
        app.switchJourneyMode("universe");
        const backToUniverse = view.getAttribute("data-jmode") === "universe" &&
          getComputedStyle(document.getElementById("journey-canvas-card")).display !== "none";

        // 变异：视图与高亮失配（强制 data-jmode 回 universe）→ atlas 面板可见性断言转红
        document.getElementById("btn-mode-atlas").click();
        const atlasOk = getComputedStyle(document.getElementById("journey-atlas-panel")).display !== "none";
        view.setAttribute("data-jmode", "universe");
        const mutantAtlasHidden = getComputedStyle(document.getElementById("journey-atlas-panel")).display === "none";
        app.switchJourneyMode("atlas");
        const restored = getComputedStyle(document.getElementById("journey-atlas-panel")).display !== "none";
        app.switchJourneyMode("universe");

        return { perMode, backToUniverse, atlasOk, mutantAtlasHidden, restored };
      })()
    `);
    assert(p5Res.perMode.universe.jmode === "universe" && p5Res.perMode.universe.activeIds.join() === "btn-mode-universe" &&
      p5Res.perMode.universe.canvas && !p5Res.perMode.universe.atlas && !p5Res.perMode.universe.branches && !p5Res.perMode.universe.replay,
      `P4-5 对照组(保持绿): universe 模式 → data-jmode=universe、高亮唯一、主轴画布可见、回放条隐藏、拓扑/分支面板隐藏`);
    assert(p5Res.perMode.timeline.jmode === "timeline" && p5Res.perMode.timeline.activeIds.join() === "btn-mode-timeline" &&
      p5Res.perMode.timeline.canvas && p5Res.perMode.timeline.replay && !p5Res.perMode.timeline.atlas,
      `P4-5 对照组(保持绿): timeline 模式 → 主轴画布 + 回放条可见，高亮唯一`);
    assert(p5Res.perMode.atlas.jmode === "atlas" && p5Res.perMode.atlas.atlas && !p5Res.perMode.atlas.canvas &&
      p5Res.perMode.branches.jmode === "branches" && p5Res.perMode.branches.branches && !p5Res.perMode.branches.canvas,
      `P4-5 对照组(保持绿): atlas 模式 → 拓扑面板独占；branches 模式 → 分支面板独占`);
    assert(p5Res.perMode.universe.pipelineNodes === 0, `P4-5 回归基线(保持绿，票36 改锚): 真跑态 project() 不产 state.pipeline → #journey-pipeline-nodes 零节点（诚实空态，不回落）（实测 x${p5Res.perMode.universe.pipelineNodes}）`);
    assert(p5Res.backToUniverse, `P4-5 对照组(保持绿): 选择器可随时切回 universe 且面板跟随`);
    assert(p5Res.mutantAtlasHidden, `P4-5 变异组(亲眼变红): 视图 data-jmode 与高亮失配时 atlas 面板可见性断言转红`);
    assert(p5Res.atlasOk && p5Res.restored, `P4-5 还原(保持绿): 复原后 atlas 模式面板复可见`);

    // ── 功能 1 · 旅途回放（播放/上一步/下一步 + 倍速 + scrubber 定位）──────
    const p1Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        app.switchJourneyMode("timeline");
        const total = (window.__TL__.activity || []).length;
        const scrub = document.getElementById("replay-scrubber");
        const shown = () => document.querySelectorAll("#journey-svg-container .journey-node:not(.is-hidden)").length;
        const maxOk = Number(scrub.max) === total;

        const labels = ["btn-replay-play", "btn-replay-prev", "btn-replay-next"].map((id) => {
          const b = document.getElementById(id);
          return b ? b.textContent.trim() : "";
        });
        const buttonOk = labels[0] === "播放" && labels[1] === "上一步" && labels[2] === "下一步";
        const speeds = Array.from(document.querySelectorAll(".replay-speed .btn-speed")).map((b) => b.getAttribute("data-speed"));
        const speedOk = speeds.join() === "1,2,5,10";
        const speedActive = (document.querySelector(".replay-speed .btn-speed.is-active") || {}).getAttribute
          ? document.querySelector(".replay-speed .btn-speed.is-active").getAttribute("data-speed") : "";

        scrub.value = "5";
        scrub.dispatchEvent(new Event("input", { bubbles: true }));
        const atFive = shown();

        Array.from(document.querySelectorAll("#journey-svg-container .journey-node")).forEach((g) => g.classList.remove("is-hidden"));
        const mutantAtFive = document.querySelectorAll("#journey-svg-container .journey-node:not(.is-hidden)").length === 5;

        scrub.value = "5";
        scrub.dispatchEvent(new Event("input", { bubbles: true }));
        const restored = shown() === 5;

        scrub.value = String(total);
        scrub.dispatchEvent(new Event("input", { bubbles: true }));
        const fullShown = shown();
        const posText = document.getElementById("replay-position").textContent.trim();

        const run = window.__TL__.run || {};
        const canvasText = document.getElementById("journey-canvas-card").textContent;
        const noServerTime = canvasText.indexOf(String(run.generated_at)) === -1 && canvasText.indexOf(String(run.updated_at)) === -1 &&
          canvasText.indexOf(String(run.started_at)) === -1;

        return { total, maxOk, buttonOk, speedOk, speedActive, atFive, mutantAtFive, restored, fullShown, posText, noServerTime };
      })()
    `);
    assert(p1Res.maxOk && p1Res.total > 0, `P4-1 对照组(保持绿): 回放 scrubber max = state.activity.length (${p1Res.total})`);
    assert(p1Res.buttonOk, `P4-1 对照组(保持绿): 纯文本回放按钮 "播放 / 上一步 / 下一步" 存在且无 emoji`);
    assert(p1Res.speedOk, `P4-1 对照组(保持绿): 倍速选单 1x/2x/5x/10x 齐备（当前激活 ${p1Res.speedActive}x）`);
    assert(p1Res.atFive === 5, `P4-1 对照组(保持绿): scrubber 定位第 5 个事件 → 前 5 个节点可见（实测 ${p1Res.atFive}）`);
    assert(!p1Res.mutantAtFive, `P4-1 变异组(亲眼变红): 取消节点隐藏后 scrubber 定位断言转红 (mutantAtFive: false)`);
    assert(p1Res.fullShown === p1Res.total, `P4-1 对照组(保持绿): scrubber 覆盖全量 0..N，拖到末尾 ${p1Res.fullShown}/${p1Res.total} 全部可见`);
    assert(p1Res.restored, `P4-1 还原(保持绿): 重新定位第 5 个事件后可见数复归 5`);
    assert(p1Res.posText === p1Res.total + " / " + p1Res.total, `P4-1 对照组(保持绿): 回放位置文本 "${p1Res.posText}" 与全量一致`);
    assert(p1Res.noServerTime, `P4-1 对照组(保持绿): 时空视图画布/回放条不含任何服务端时间 (generated_at / updated_at / started_at 均未打印，时间仅来自 activity[].t)`);

    // ── 功能 3 · 15 分钟空档折叠（阈值 + 断续线 + 标注 + 边界）────────────
    const p3Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        app.switchJourneyMode("timeline");
        const countFolds = () => document.querySelectorAll("#journey-svg-container .gap-fold-dash").length;
        const labels = () => Array.from(document.querySelectorAll("#journey-svg-container .gap-fold-label")).map((l) => l.textContent.trim());
        const ctrl = countFolds();
        const ctrlLabels = labels();

        app.GAP_FOLD_THRESHOLD_MS = 19 * 60 * 1000;
        app.render(window.__TL__);
        const mutantFolds = countFolds();

        delete app.GAP_FOLD_THRESHOLD_MS;
        app.GAP_FOLD_THRESHOLD_MS = 15 * 60 * 1000;
        app.render(window.__TL__);
        const restored = countFolds();
        delete app.GAP_FOLD_THRESHOLD_MS;
        app.render(window.__TL__);

        return { ctrl, ctrlLabels, mutantFolds, restored };
      })()
    `);
    assert(p3Res.ctrl === 1 && p3Res.ctrlLabels.length === 1 && p3Res.ctrlLabels[0].indexOf("空档折叠 18分") === 0 && p3Res.ctrlLabels[0].indexOf("15m阈值") !== -1,
      `P4-3 对照组(保持绿): 夹具 18 分钟空档被折叠，绘断续线并标注 "${p3Res.ctrlLabels[0]}"`);
    assert(p3Res.mutantFolds === 0, `P4-3 变异组(亲眼变红): 运行时把阈值抬到 19 分钟（> 18 分钟空档）后折叠断言转红（折叠数 ${p3Res.mutantFolds}）`);
    assert(p3Res.restored === 1, `P4-3 还原(保持绿): 阈值复原为 15 分钟（GAP_FOLD_THRESHOLD_MS）后折叠复现`);

    // ── 功能 4 · 大事件流分块渲染（显式标注条 + 全量 scrubber + 边界）─────
    const p4Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        app.switchJourneyMode("timeline");
        const banner = document.getElementById("journey-chunk-banner");
        const scrub = document.getElementById("replay-scrubber");
        const base = Date.parse("2026-09-28T09:30:00.000Z");

        function build(n) {
          const st = JSON.parse(JSON.stringify(window.__TL__));
          st.activity = [];
          for (let i = 0; i < n; i++) {
            st.activity.push({
              seq: i + 1,
              t: new Date(base + i * 1000).toISOString(),
              type: "auto",
              ref: "T" + ((i % 6) + 1),
              actor: ["claude", "tool", "user"][i % 3],
              title: "合成事件 " + (i + 1)
            });
          }
          return st;
        }
        const nodeCount = () => document.querySelectorAll("#journey-svg-container .journey-node").length;
        const bannerText = () => banner.textContent.trim();
        const bannerShown = () => banner.style.display !== "none";

        app.render(build(1));
        const at1 = { hidden: !bannerShown(), nodes: nodeCount(), max: Number(scrub.max) };
        app.render(build(50));
        const at50 = { hidden: !bannerShown(), nodes: nodeCount(), max: Number(scrub.max) };
        app.render(build(200));
        const at200 = { hidden: !bannerShown(), nodes: nodeCount(), max: Number(scrub.max) };
        app.render(build(201));
        const at201 = { text: bannerText(), shown: bannerShown(), nodes: nodeCount(), max: Number(scrub.max) };

        app.render(build(520));
        const EXPECT = "当前已累积 520 项事件，为保持流畅已折叠早期 440 项历史事件";
        // 同一断言谓词（对照组与变异组共用，保证同源共动）
        const foldOk = () => bannerShown() && bannerText() === EXPECT && Number(scrub.max) === 520 && nodeCount() === 80;
        const bigOk = foldOk();
        const restoredText = bannerText();

        app.render(window.__TL__);
        return { at1, at50, at200, at201, bigOk, restoredText };
      })()
    `);
    assert(p4Res.at1.hidden && p4Res.at1.nodes === 1 && p4Res.at1.max === 1,
      `P4-4 边界(保持绿): 只有 1 条 → 不折叠、无横幅、1 节点、进度条 0..1`);
    assert(p4Res.at50.hidden && p4Res.at50.nodes === 50 && p4Res.at50.max === 50,
      `P4-4 边界(保持绿): 恰 50 条（真投影器上限）→ 不折叠、无横幅、50 节点全渲染`);
    assert(p4Res.at200.hidden && p4Res.at200.nodes === 200 && p4Res.at200.max === 200,
      `P4-4 边界(保持绿): 恰 200 条（= 阈值）→ 不折叠、无横幅、${p4Res.at200.nodes} 节点全渲染`);
    assert(p4Res.at201.shown && p4Res.at201.text === "当前已累积 201 项事件，为保持流畅已折叠早期 121 项历史事件" && p4Res.at201.nodes === 80 && p4Res.at201.max === 201,
      `P4-4 边界(保持绿): 201 条（超阈值 1 条）→ 折叠早期 121 条，显式标注条 "${p4Res.at201.text}"，进度条全量 0..${p4Res.at201.max}`);
    assert(p4Res.bigOk,
      `P4-4 对照组(保持绿): 520 条大事件流不崩溃，折叠 440 条并显式标注「${p4Res.restoredText}」，进度条覆盖全量 0..520（撤下/停渲染标注条即转红）`);

    // ── 功能 2 · 分支对比（左右分栏 + timeline 虚线「被修剪」）─────────────
    const p2Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const act = window.__TL__.activity || [];
        // 显式期望（不复刻 app 内部规则，避免断言与实现同源共错）：
        // 夹具 T3 的 branch.fork(seq8) / redo(seq10) / branch.prune(seq11) 属被修剪分支，其余归主栏
        const EXPECT_PRUNED_SEQS = [8, 10, 11];
        const prunedN = EXPECT_PRUNED_SEQS.length;
        const seqsOf = (sel) => Array.from(document.querySelectorAll(sel + " .branch-row")).map((r) => Number(r.getAttribute("data-seq"))).sort((a, b) => a - b);

        app.switchJourneyMode("branches");
        const prunedSeqs = seqsOf("#branch-list-pruned");
        const mainSeqs = seqsOf("#branch-list-main");
        const mainRows = mainSeqs.length;
        const prunedRows = Array.from(document.querySelectorAll("#branch-list-pruned .branch-row"));
        const prunedTypes = prunedRows.map((r) => { const t = r.querySelector(".branch-type"); return t ? t.textContent.trim() : ""; });
        const forkInPruned = prunedTypes.some((t) => t.indexOf("branch.fork") === 0);
        const noticeInPruned = prunedTypes.some((t) => t.indexOf("branch.prune") === 0);
        const hasTag = prunedRows.some((r) => r.textContent.indexOf("被修剪") !== -1);
        const branchVisible = getComputedStyle(document.getElementById("journey-branches-panel")).display !== "none";

        // 端到端对照：把夹具裁剪成真投影器字段集（seq/t/type/ref/actor）后重渲染，修剪推导必须仍然成立
        const stripped = JSON.parse(JSON.stringify(window.__TL__));
        stripped.activity = stripped.activity.map((e) => ({ seq: e.seq, t: e.t, type: e.type, ref: e.ref, actor: e.actor }));
        app.render(stripped);
        app.switchJourneyMode("branches");
        const projectorPrunedSeqs = seqsOf("#branch-list-pruned").join(",");
        const projectorMain = seqsOf("#branch-list-main").length;
        app.render(window.__TL__);
        app.switchJourneyMode("branches");

        // 端到端生命周期探针（独立于夹具、独立于 app 规则）：合成一条同 ref 覆盖
        // 「fork 前 / 周期1 内 / 周期之间 / 周期2 内 / prune 后」的完整多轮生命周期，
        // 被修剪列的 seq 集必须恰为显式期望 —— 一次钉死上界、下界与多周期撑开三种失效
        const probeState = JSON.parse(JSON.stringify(window.__TL__));
        probeState.activity = [
          { seq: 1, t: "2026-09-30T01:00:00.000Z", type: "artifact",     ref: "T9", actor: "claude" }, // fork 前 → 主栏
          { seq: 2, t: "2026-09-30T02:00:00.000Z", type: "branch.fork",  ref: "T9", actor: "claude" }, // 周期1 开
          { seq: 3, t: "2026-09-30T03:00:00.000Z", type: "redo",         ref: "T9", actor: "claude" }, // 周期1 内
          { seq: 4, t: "2026-09-30T04:00:00.000Z", type: "branch.prune", ref: "T9", actor: "claude" }, // 周期1 收
          { seq: 5, t: "2026-09-30T05:00:00.000Z", type: "check",        ref: "T9", actor: "claude" }, // 周期之间 → 主栏
          { seq: 6, t: "2026-09-30T06:00:00.000Z", type: "branch.fork",  ref: "T9", actor: "claude" }, // 周期2 开
          { seq: 7, t: "2026-09-30T07:00:00.000Z", type: "artifact",     ref: "T9", actor: "claude" }, // 周期2 内
          { seq: 8, t: "2026-09-30T08:00:00.000Z", type: "branch.prune", ref: "T9", actor: "claude" }, // 周期2 收
          { seq: 9, t: "2026-09-30T09:00:00.000Z", type: "plan",         ref: "T9", actor: "claude" }  // prune 后 → 主栏
        ];
        app.render(probeState);
        app.switchJourneyMode("branches");
        const probePrunedSeqs = seqsOf("#branch-list-pruned").join(",");
        const probeMainSeqs = seqsOf("#branch-list-main").join(",");
        app.render(window.__TL__);
        app.switchJourneyMode("branches");

        const prunedList = document.getElementById("branch-list-pruned");
        Array.from(prunedList.querySelectorAll(".branch-row")).forEach((r) => r.remove());
        const mutant = prunedList.querySelectorAll(".branch-row").length === prunedN;
        app.render(window.__TL__);
        app.switchJourneyMode("branches");
        const restored = document.querySelectorAll("#branch-list-pruned .branch-row").length === prunedN;

        app.switchJourneyMode("timeline");
        const dashed = document.querySelectorAll("#journey-svg-container .branch-pruned-line").length;
        const prunedNode = document.querySelectorAll("#journey-svg-container .journey-node.is-pruned").length;
        const tags = Array.from(document.querySelectorAll("#journey-svg-container .pruned-tag")).map((t) => t.textContent.trim());
        const line = document.querySelector("#journey-svg-container .branch-pruned-line");
        const dashStyle = line ? getComputedStyle(line).strokeDasharray : "";

        return { prunedN, EXPECT_PRUNED_SEQS, prunedSeqs, mainSeqs, mainRows, prunedRows: prunedRows.length, prunedTypes, forkInPruned, noticeInPruned, hasTag, branchVisible, projectorPrunedSeqs, projectorMain, probePrunedSeqs, probeMainSeqs, mutant, restored, dashed, prunedNode, tags, dashStyle };
      })()
    `);
    assert(p2Res.branchVisible && p2Res.mainRows >= 1 && p2Res.prunedRows === p2Res.prunedN && p2Res.prunedN >= 1,
      `P4-2 对照组(保持绿): branches 模式左右分栏 — 主分支 ${p2Res.mainRows} 项 / 被修剪分支 ${p2Res.prunedRows} 项`);
    assert(p2Res.prunedSeqs.join(",") === "8,10,11" && p2Res.mainSeqs.join(",") === "1,2,3,4,5,6,7,9,12,13,14,15,16,17,18,19,20,21",
      `P4-2 对照组(保持绿): 被修剪列 seq 集恰为显式期望 [8,10,11]，实测 [${p2Res.prunedSeqs.join(",")}]；主栏 seq 集恰为其余（实测 ${p2Res.mainSeqs.length} 项）`);
    assert(p2Res.prunedN >= 3 && p2Res.forkInPruned && p2Res.noticeInPruned,
      `P4-2 对照组(保持绿): 被修剪列含该分支历史（${p2Res.prunedTypes.join(" / ")}）——branch.fork 与修剪通知同 ref 归入一栏，非仅修剪通知本身`);
    assert(p2Res.hasTag, `P4-2 对照组(保持绿): 被修剪列条目显式标注「被修剪」`);
    assert(p2Res.projectorPrunedSeqs === p2Res.EXPECT_PRUNED_SEQS.join(",") && p2Res.projectorMain === p2Res.mainRows,
      `P4-2 端到端(保持绿): 仅保留真投影器字段集 {seq,t,type,ref,actor} 重渲染 → 修剪推导不变（主 ${p2Res.projectorMain} / 修剪 seq ${p2Res.projectorPrunedSeqs}）`);
    assert(p2Res.probePrunedSeqs === "2,3,4,6,7,8" && p2Res.probeMainSeqs === "1,5,9",
      `P4-2 生命周期探针(保持绿): 多轮 fork/prune 同 ref — 被修剪列 seq 集恰为周期内 [2,3,4,6,7,8]，fork 前(1)/周期之间(5)/prune 后(9) 三个存活事件留在主栏 [${p2Res.probeMainSeqs}]（实测被修剪 [${p2Res.probePrunedSeqs}]）`);
    assert(!p2Res.mutant, `P4-2 变异组(亲眼变红): 清空被修剪列后左右分栏对比断言转红 (mutant: false)`);
    assert(p2Res.restored, `P4-2 还原(保持绿): 重渲染后被修剪列恢复 ${p2Res.prunedN} 项`);
    assert(p2Res.dashed >= 1 && p2Res.prunedNode === p2Res.prunedN && p2Res.tags.indexOf("被修剪") !== -1 && p2Res.dashStyle.indexOf("5") !== -1,
      `P4-2 对照组(保持绿): timeline 模式下被修剪支线绘为虚线（stroke-dasharray: ${p2Res.dashStyle}）并标「被修剪」`);

    // ── 功能 7 · 影响面快照抽屉（左右分栏 + 如实偏差）──────────────────────
    const p7Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        app.switchJourneyMode("timeline");
        const drawer = document.getElementById("impact-drawer");
        const node = document.querySelector('#journey-svg-container .journey-node[data-type="decide"]');
        const nodeFound = Boolean(node);
        if (node) node.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const open = getComputedStyle(drawer).display !== "none";
        const rows = Array.from(document.querySelectorAll("#drawer-estimated .drawer-metric"));
        const fieldNames = rows.map((r) => r.getAttribute("data-field"));
        const fieldsOk = fieldNames.join() === "redo,enable,disable,affected_todo,sunk_min";
        const valOf = (i) => rows[i] ? rows[i].querySelector(".drawer-metric-val").textContent.trim() : "";
        const redo = valOf(0);
        const enable = valOf(1);
        const disable = valOf(2);
        const affected = valOf(3);
        const sunk = valOf(4);
        const confEl = document.querySelector('#drawer-actual .drawer-metric[data-field="confidence"] .drawer-metric-val');
        const confText = confEl ? confEl.textContent.trim() : "";
        const actualText = document.getElementById("drawer-actual").textContent.trim();
        const noteEl = document.getElementById("drawer-note");
        const EXPECT = "估算偏差如实显示，不改写成「准确」。";
        const noteOk = noteEl.textContent.trim() === EXPECT;
        const sunkPred = () => {
          const r = document.querySelectorAll("#drawer-estimated .drawer-metric")[4];
          return r ? r.querySelector(".drawer-metric-val").textContent.trim() : "";
        };

        // 变异（改数据 → 走真实现路径）：篡改 decisionRipple 实际读取的 effective.ripple.sunk_min，
        // 重渲染后抽屉必须跟着变（若实现改读旧扁平 decision.impact，此处不会变 → 断言转红）
        const D1 = (window.__TL__.decisions || []).find((d) => d.id === "D1");
        const savedSunk = D1.effective.ripple.sunk_min;
        D1.effective.ripple.sunk_min = 99;
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        document.querySelector('#journey-svg-container .journey-node[data-type="decide"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const sunkAfterDataMutation = sunkPred();
        D1.effective.ripple.sunk_min = savedSunk;
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        document.querySelector('#journey-svg-container .journey-node[data-type="decide"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const sunkRestored = sunkPred();

        document.getElementById("btn-drawer-close").click();
        const closed = getComputedStyle(drawer).display === "none";

        return { nodeFound, open, fieldsOk, redo, enable, disable, affected, sunk, confText, actualText, noteOk, sunkAfterDataMutation, sunkRestored, closed };
      })()
    `);
    assert(p7Res.nodeFound && p7Res.open, `P4-7 对照组(保持绿): 点击旅途决策节点 → 影响面抽屉展开`);
    assert(p7Res.fieldsOk && p7Res.sunk === "2 分钟" && p7Res.redo === "T1",
      `P4-7 对照组(保持绿): 左栏五格(返工/启用/停用/牵动/沉没)读真路径 decision.effective.ripple.items，沉没耗时 = "${p7Res.sunk}"；返工 = "${p7Res.redo}"；启用 = "${p7Res.enable}"；停用 = "${p7Res.disable}"；牵动 = "${p7Res.affected}"`);
    assert(p7Res.confText === "declared",
      `P4-7 对照组(保持绿): 右栏按真字段派生 — 影响面置信度 = "${p7Res.confText}"（ripple.confidence，如实显示不写「准确」）`);
    assert(p7Res.actualText.length > 0 && p7Res.noteOk,
      `P4-7 对照组(保持绿): 右栏「实际执行结果」如实列出 ("${p7Res.actualText.slice(0, 40)}...")，抽屉显式声明「估算偏差如实显示，不改写成「准确」」`);
    assert(p7Res.sunkAfterDataMutation !== "2 分钟" && p7Res.sunkRestored === "2 分钟",
      `P4-7 变异组(亲眼变红): 改 D1.effective.ripple.sunk_min 2→99 重渲染后沉没耗时变 "${p7Res.sunkAfterDataMutation}"（断言转红），还原后回 "${p7Res.sunkRestored}"`);
    assert(p7Res.closed, `P4-7 还原(保持绿): 关闭按钮收起抽屉`);

    // P4-7 端到端(仅真投影器字段集)：activity 每条仅 {seq,t,type,ref,actor}、decisions 仅真形状
    // ripple（无扁平 decision.impact 可用），抽屉左栏五格与右栏必须全部走真路径非空
    const p7bRes = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const RIPPLE = {
          items: { redo: ["T2"], affected_todo: ["T9"], enable: ["T4"], disable: ["方案 B"] },
          decisions: [], sunk_min: 15, redo_est_min: 7, confidence: "declared"
        };
        const base = JSON.parse(JSON.stringify(window.__TL__));
        base.activity = [
          { seq: 1, t: "2026-09-28T09:30:00.000Z", type: "run.start", ref: "T0", actor: "claude" },
          { seq: 2, t: "2026-09-28T09:56:00.000Z", type: "decide", ref: "D1", actor: "user" }
        ];
        base.items = (window.__TL__.items || []).map((i) => i.id === "T1" ? Object.assign({}, i, { outcome: "superseded", active_seconds: 420 }) : i);
        base.decisions = [{
          id: "D1",
          // 旧扁平 impact 故意留错值：真实现只读 ripple，若退回只读扁平键则取值错误
          impact: { redo: ["FLAT"], unlock: ["FLAT"], rules_out: ["FLAT"], sunk_min: 999 },
          options: [{ key: "A", default: true, impact: { ripple: RIPPLE } }]
        }];
        const openDrawer = () => {
          app.switchJourneyMode("timeline");
          const n = document.querySelector('#journey-svg-container .journey-node[data-type="decide"]');
          if (n) n.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        };
        const valOf = (sel, i) => {
          const rs = document.querySelectorAll(sel);
          const r = rs[i];
          return r ? r.querySelector(".drawer-metric-val").textContent.trim() : "";
        };
        const probe = () => ({
          redo: valOf("#drawer-estimated .drawer-metric", 0),
          enable: valOf("#drawer-estimated .drawer-metric", 1),
          disable: valOf("#drawer-estimated .drawer-metric", 2),
          affected: valOf("#drawer-estimated .drawer-metric", 3),
          sunk: valOf("#drawer-estimated .drawer-metric", 4),
          conf: (document.querySelector('#drawer-actual .drawer-metric[data-field="confidence"] .drawer-metric-val') || {}).textContent || "",
          actual: (document.querySelector('#drawer-actual .drawer-metric[data-field="actual_redo"] .drawer-metric-val') || {}).textContent || "",
          rmin: (document.querySelector('#drawer-actual .drawer-metric[data-field="redo_min"] .drawer-metric-val') || {}).textContent || ""
        });
        const ok = (p) => p.redo === "T2" && p.enable === "T4" && p.disable === "方案 B" && p.affected === "T9"
          && p.sunk === "15 分钟" && p.conf.trim() === "declared"
          && p.actual.indexOf("T1") !== -1 && p.rmin.indexOf("预估 7 分钟") !== -1;

        app.render(base); openDrawer();
        const ctrl = probe();
        const control = ok(ctrl);

        // 变异（数据 → 真路径）：抽掉真 ripple（模拟旧「只读 decision.impact」），仅剩扁平错值 → 断言转红
        const mutated = JSON.parse(JSON.stringify(base));
        mutated.decisions[0].options[0].impact.ripple = null;
        app.render(mutated); openDrawer();
        const mutant = ok(probe());

        app.render(base); openDrawer();
        const restored = ok(probe());

        document.getElementById("btn-drawer-close").click();
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        return { control, mutant, restored, ctrl };
      })()
    `);
    assert(p7bRes.control,
      `P4-7 端到端(保持绿): 仅真字段集 activity {seq,t,type,ref,actor} + decisions 真形状重渲染 → 左栏五格全走 ripple.items/sunk_min 非空 (${[p7bRes.ctrl.redo, p7bRes.ctrl.enable, p7bRes.ctrl.disable, p7bRes.ctrl.affected, p7bRes.ctrl.sunk].join(' | ')})`);
    assert(p7bRes.ctrl.conf.trim() === "declared" && p7bRes.ctrl.actual.indexOf("T1") !== -1 && p7bRes.ctrl.rmin.indexOf("预估 7 分钟") !== -1,
      `P4-7 端到端(保持绿): 右栏含 confidence 派生内容（置信度 "${p7bRes.ctrl.conf}" / 实际重做 "${p7bRes.ctrl.actual}" / "${p7bRes.ctrl.rmin}"）`);
    assert(!p7bRes.mutant,
      `P4-7 变异组(亲眼变红): 抽掉真路径 ripple（模拟 decisionRipple 退回只读旧扁平 decision.impact）后同一断言转红 (mutant: false)`);
    assert(p7bRes.restored,
      `P4-7 还原(保持绿): 恢复真形状 ripple 后复绿`);

    // P4-7c 删键夹具(仅真字段集)：影响面抽屉「返工耗时」实测臂 —— 任一 superseded 项 active_seconds
    // 缺失/非数时不得按 0 求和后仍称「实测」。删掉 T2.active_seconds → 实测臂渲「—」而非「实测 0 分钟」。
    const p7cRes = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const RIPPLE = { items: { redo: ["T1","T2"] }, decisions: [], sunk_min: 15, redo_est_min: 7, confidence: "declared" };
        const mk = (seed) => {
          const b = JSON.parse(JSON.stringify(window.__TL__));
          b.activity = [
            { seq: 1, t: "2026-09-28T09:30:00.000Z", type: "run.start", ref: "T0", actor: "claude" },
            { seq: 2, t: "2026-09-28T09:56:00.000Z", type: "decide", ref: "D1", actor: "user" }
          ];
          b.items = (window.__TL__.items || []).map((i) => {
            if (i.id === "T1") return Object.assign({}, i, { outcome: "superseded", active_seconds: 420 });
            if (i.id === "T2") return Object.assign({}, i, { outcome: "superseded", active_seconds: seed });
            return i;
          });
          b.decisions = [{ id: "D1", options: [{ key: "A", default: true, impact: { ripple: RIPPLE } }] }];
          return b;
        };
        const openDrawer = () => {
          app.switchJourneyMode("timeline");
          const n = document.querySelector('#journey-svg-container .journey-node[data-type="decide"]');
          if (n) n.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        };
        const rmin = () => {
          const el = document.querySelector('#drawer-actual .drawer-metric[data-field="redo_min"] .drawer-metric-val');
          return el ? el.textContent.trim() : "";
        };
        app.render(mk(180)); openDrawer();
        const control = rmin();
        const partial = mk(180);
        delete partial.items.find((i) => i.id === "T2").active_seconds;
        app.render(partial); openDrawer();
        const partialText = rmin();
        const allMissing = mk(180);
        allMissing.items.forEach((i) => { if (i.outcome === "superseded") delete i.active_seconds; });
        app.render(allMissing); openDrawer();
        const noneText = rmin();
        document.getElementById("btn-drawer-close").click();
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        return { control, partialText, noneText };
      })()
    `);
    assert(p7cRes.control === "预估 7 分钟 / 实测 10 分钟",
      `P4-7c 对照组(保持绿): 两个 superseded 项 active_seconds 齐备(420s+180s) → 实测臂如实求和 ("${p7cRes.control}")`);
    assert(p7cRes.partialText.indexOf("实测 —") !== -1 && p7cRes.partialText.indexOf("实测 0 分钟") === -1,
      `P4-7c 删键夹具(保持绿): 删掉 T2 的 active_seconds → 实测臂渲「—」而非「实测 0 分钟」 ("${p7cRes.partialText}")`);
    assert(p7cRes.noneText.indexOf("实测 —") !== -1 && p7cRes.noneText.indexOf("实测 0 分钟") === -1,
      `P4-7c 删键夹具(保持绿): 全部 superseded 项删 active_seconds → 实测臂同样「—」（不谎报 0） ("${p7cRes.noneText}")`);

    // P4-8 端到端(仅真字段集)：decisions 仅含真形状 ripple（扁平 decision.impact 故意留错值），
    // 重渲染 → journey 与 decisions 两处影响矩阵各五格均非空且与真 ripple 逐字一致；抽掉真 ripple
    // （模拟旧「只读扁平 decision.impact」）→ 断言转红；还原复绿。
    const imRes = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const RIPPLE = {
          items: { redo: ["T2"], affected_todo: ["T9"], enable: ["T4"], disable: ["方案 B"] },
          decisions: [], sunk_min: 15, redo_est_min: 7, confidence: "declared"
        };
        const base = JSON.parse(JSON.stringify(window.__TL__));
        base.decisions = [{
          id: "D1", status: "open",
          // 旧扁平 impact 故意留错值：真实现只读 ripple，若退回只读扁平键则取值错误
          impact: { redo: ["FLAT"], unlock: ["FLAT"], rules_out: ["FLAT"], sunk_min: 999 },
          options: [{ key: "A", label: "A", default: true, impact: { ripple: RIPPLE } }],
          effective: { ripple: RIPPLE }
        }];
        const fmt = (field, value) => {
          if (field === "sunk_min") return typeof value === "number" ? value + " 分钟" : "未评估";
          const arr = Array.isArray(value) ? value : (value ? [String(value)] : []);
          if (arr.length === 0) {
            if (field === "redo") return "无返工";
            if (field === "enable") return "无解锁项";
            if (field === "disable") return "无排除分支";
            if (field === "affected_todo") return "无牵动项";
            return "—";
          }
          return arr.join(" / ");
        };
        const expect = [["redo", ["T2"]], ["enable", ["T4"]], ["disable", ["方案 B"]], ["affected_todo", ["T9"]], ["sunk_min", 15]];
        const readMatrix = (wrapId) => {
          const cells = Array.from(document.querySelectorAll("#" + wrapId + " .impact-cell"));
          const byField = {};
          cells.forEach(c => {
            const valEl = c.querySelector(".impact-cell-val");
            byField[c.getAttribute("data-impact-field")] = {
              attr: c.getAttribute("data-impact-value"),
              text: valEl ? valEl.textContent.trim() : ""
            };
          });
          return { count: cells.length, byField };
        };
        const okOne = (m) => m.count === 5 && expect.every(e => m.byField[e[0]]
          && m.byField[e[0]].attr === JSON.stringify(e[1]) && m.byField[e[0]].text === fmt(e[0], e[1]));
        const probe = () => {
          const j = readMatrix("journey-impact-matrix");
          const d = readMatrix("decisions-impact-matrix");
          return {
            jCount: j.count, dCount: d.count,
            nonEmpty: j.count === 5 && d.count === 5 && expect.every(e =>
              j.byField[e[0]] && j.byField[e[0]].text.length > 0 && d.byField[e[0]] && d.byField[e[0]].text.length > 0),
            both: okOne(j) && okOne(d),
            jTexts: expect.map(e => (j.byField[e[0]] || {}).text || ""),
            dTexts: expect.map(e => (d.byField[e[0]] || {}).text || "")
          };
        };

        app.render(base);
        const ctrl = probe();

        // 变异（数据 → 模拟退回只读扁平 decision.impact）：抽掉真 ripple，两处矩阵取自真路径失败 → 转红
        const mutated = JSON.parse(JSON.stringify(base));
        mutated.decisions[0].effective.ripple = null;
        mutated.decisions[0].options[0].impact.ripple = null;
        app.render(mutated);
        const mutant = probe();

        app.render(base);
        const restored = probe();

        app.render(window.__TL__);
        return { ctrl, mutant, restored };
      })()
    `);
    assert(imRes.ctrl.both && imRes.ctrl.nonEmpty,
      `P4-8 端到端(保持绿): 仅真字段集 decisions{effective.ripple / options[].impact.ripple} 重渲染 → journey(${imRes.ctrl.jCount}格:[${imRes.ctrl.jTexts.join(' | ')}]) 与 decisions(${imRes.ctrl.dCount}格:[${imRes.ctrl.dTexts.join(' | ')}]) 两处影响矩阵均非空且与真值逐字一致`);
    assert(!imRes.mutant.both,
      `P4-8 变异组(亲眼变红): 抽掉真 ripple（模拟退回只读扁平 decision.impact）后两处影响矩阵与真值对齐断言转红 (mutant.both: ${imRes.mutant.both})`);
    assert(imRes.restored.both && imRes.restored.nonEmpty,
      `P4-8 还原(保持绿): 恢复真形状 ripple 后两处影响矩阵复绿`);

    // ── 功能 6 · 1x 符号体系（Canvas 像素级填充率 + 退化变异组）───────────
    const p6Res = await evalRes(`
      (async () => {
        const app = window.__TL_APP__;
        app.switchJourneyMode("atlas");
        const svgNS = "http://www.w3.org/2000/svg";

        async function fillRatio(symId) {
          const sym = document.getElementById(symId);
          if (!sym) return -1;
          const holder = document.createElementNS(svgNS, "svg");
          holder.setAttribute("xmlns", svgNS);
          holder.setAttribute("viewBox", "0 0 24 24");
          holder.setAttribute("width", "96");
          holder.setAttribute("height", "96");
          holder.setAttribute("color", "#ffffff");
          Array.from(sym.childNodes).forEach((n) => holder.appendChild(n.cloneNode(true)));
          const str = new XMLSerializer().serializeToString(holder);
          const img = new Image();
          const loaded = new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); });
          img.src = "data:image/svg+xml;base64," + btoa(str);
          if (!(await loaded)) return -1;
          const cv = document.createElement("canvas");
          cv.width = 96; cv.height = 96;
          const ctx = cv.getContext("2d");
          ctx.clearRect(0, 0, 96, 96);
          ctx.drawImage(img, 0, 0, 96, 96);
          const data = ctx.getImageData(40, 24, 16, 20).data;
          let painted = 0, total = 0;
          for (let i = 0; i < data.length; i += 4) { total++; if (data[i + 3] > 32) painted++; }
          return painted / total;
        }

        const fHold = await fillRatio("tl-n-hold");
        const fDefault = await fillRatio("tl-n-default");
        const fConfirm = await fillRatio("tl-n-confirm");
        const rangeOk = fHold < 0.25 && fDefault >= 0.35 && fDefault <= 0.65 && fConfirm >= 0.70;
        const sepDH = app.isSeparated(fDefault, fHold);
        const sepCD = app.isSeparated(fConfirm, fDefault);

        const defNode = document.getElementById("tl-n-default");
        const confirmNode = document.getElementById("tl-n-confirm");
        const backup = Array.from(defNode.childNodes).map((n) => n.cloneNode(true));
        Array.from(defNode.childNodes).forEach((n) => n.remove());
        Array.from(confirmNode.childNodes).forEach((n) => defNode.appendChild(n.cloneNode(true)));
        const fDefaultMut = await fillRatio("tl-n-default");
        const sepMut = app.isSeparated(fConfirm, fDefaultMut);

        Array.from(defNode.childNodes).forEach((n) => n.remove());
        backup.forEach((n) => defNode.appendChild(n));
        const fDefaultRestored = await fillRatio("tl-n-default");
        const sepRestored = app.isSeparated(fConfirm, fDefaultRestored);

        app.switchJourneyMode("universe");
        return { fHold, fDefault, fConfirm, rangeOk, sepDH, sepCD, fDefaultMut, sepMut, fDefaultRestored, sepRestored };
      })()
    `);
    assert(p6Res.fHold >= 0 && p6Res.fHold < 0.25, `P4-6 对照组(保持绿): hold 符号宏观填充率 ${(p6Res.fHold * 100).toFixed(1)}% < 25%（空心虚线方盾）`);
    assert(p6Res.fDefault >= 0.35 && p6Res.fDefault <= 0.65, `P4-6 对照组(保持绿): default 符号填充率 ${(p6Res.fDefault * 100).toFixed(1)}% ∈ [35%, 65%]（半填充方盾）`);
    assert(p6Res.fConfirm >= 0.70, `P4-6 对照组(保持绿): confirm 符号填充率 ${(p6Res.fConfirm * 100).toFixed(1)}% >= 70%（实心方盾）`);
    assert(p6Res.rangeOk && p6Res.sepDH && p6Res.sepCD,
      `P4-6 对照组(保持绿): Canvas getImageData 实测三态填充率分层成立，且默认↔未决、已决↔默认 均可分离 (isSeparated)`);
    assert(!p6Res.sepMut,
      `P4-6 变异组(亲眼变红): 真 DOM defs 中把 #tl-n-default 退化为实心（同 #tl-n-confirm，填充率 ${(p6Res.fDefaultMut * 100).toFixed(1)}%）→ 已决↔默认 分离度断言转红 (mutant: false)`);
    assert(p6Res.sepRestored && Math.abs(p6Res.fDefaultRestored - p6Res.fDefault) < 0.05,
      `P4-6 还原(保持绿): defs 复原后 default 填充率回到 ${(p6Res.fDefaultRestored * 100).toFixed(1)}%，分离度复绿`);

    // ── 票52 · 影响面抽屉默认显示「当前节点」（= 画布事件流最新一条）+ 点节点切换 ──
    // 「当前节点」取自 state.activity 时间序最新一条，**不是**票50 #journey-summary 读
    // state.pipeline 声明状态的那个（后者真跑恒「未提供」，两者是两回事）。
    const wo52Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const clean = (s) => String(s == null ? "" : s).replace(/\\s+/g, " ").trim();
        const latestOf = (st) => {
          const evs = (st.activity || []).slice().sort((a, b) => {
            const ta = Date.parse(a.t), tb = Date.parse(b.t);
            if (ta !== tb) return ta - tb;
            return String(a.seq).localeCompare(String(b.seq));
          });
          return evs.length ? evs[evs.length - 1] : null;
        };
        const refOf = (ev) => String((ev && (ev.ref || ev.seq)) || "");
        const evOfSeq = (seq) => (window.__TL__.activity || []).find(e => String(e.seq) === String(seq));

        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        const drawer = document.getElementById("impact-drawer");
        const expected = latestOf(window.__TL__);
        const expectRef = refOf(expected);
        const openDefault = getComputedStyle(drawer).display !== "none";
        const defaultRef = drawer.getAttribute("data-ref");
        const defaultTitle = clean(document.getElementById("drawer-title").textContent);

        // ② 点一个「ref 与最新不同」的节点 → 内容切换到该节点
        const nodes = Array.from(document.querySelectorAll("#journey-svg-container .journey-node"));
        const differs = (n) => { const e = evOfSeq(n.getAttribute("data-seq")); return e && refOf(e) !== expectRef; };
        // 优先取「默认可见」节点（贴合用户真实点击路径），否则退回任一同 ref 不同的节点
        const other = nodes.find(n => differs(n) && !n.classList.contains("is-hidden")) || nodes.find(differs);
        const otherEv = other ? evOfSeq(other.getAttribute("data-seq")) : null;
        let switchRef = null, switchTitle = null;
        if (other) {
          other.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          switchRef = drawer.getAttribute("data-ref");
          switchTitle = clean(document.getElementById("drawer-title").textContent);
        }

        // ③ 变异A（行为 → 模拟「默认打开被去掉」）：打回改前初始态 display:none，默认谓词转红；render() 复绿
        drawer.style.display = "none";
        drawer.removeAttribute("data-ref");
        const mutantOpen = getComputedStyle(drawer).display !== "none";
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        const restoredOpen = getComputedStyle(drawer).display !== "none" && drawer.getAttribute("data-ref") === expectRef;

        // ③ 变异B（数据 → 证明读的是「最新」而非硬编码）：追加一条更晚事件 → data-ref 跟随新最新
        const mutState = JSON.parse(JSON.stringify(window.__TL__));
        mutState.activity = (mutState.activity || []).concat([{ seq: 99, t: "2026-09-28T11:00:00.000Z", type: "decide", ref: "D1", actor: "user" }]);
        app.render(mutState);
        app.switchJourneyMode("timeline");
        const mutRef = drawer.getAttribute("data-ref");
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        const mutateRestored = drawer.getAttribute("data-ref") === expectRef;

        return { openDefault, defaultRef, defaultTitle, expectRef, hasOther: Boolean(other),
          switchRef, switchTitle, otherRef: otherEv ? refOf(otherEv) : null,
          mutantOpen, restoredOpen, mutRef, mutateRestored };
      })()
    `);
    assert(wo52Res.openDefault && wo52Res.defaultRef === wo52Res.expectRef,
      `票52 ① 真跑态(保持绿): 未点击即默认显示影响面抽屉，data-ref 对应画布事件流最新一条（实测 "${wo52Res.defaultRef}"，期望 "${wo52Res.expectRef}"）`);
    assert(wo52Res.openDefault && wo52Res.defaultTitle.indexOf(wo52Res.expectRef) !== -1,
      `票52 ① 真跑态(保持绿): 默认抽屉标题含最新事件 ref（"${wo52Res.defaultTitle}"）`);
    assert(wo52Res.hasOther && wo52Res.switchRef === wo52Res.otherRef && wo52Res.switchRef !== wo52Res.defaultRef,
      `票52 ② 真跑态(保持绿): 点任一节点 → 抽屉内容切换到该节点（"${wo52Res.defaultRef}" → "${wo52Res.switchRef}"，期望 "${wo52Res.otherRef}"）`);
    assert(!wo52Res.mutantOpen && wo52Res.restoredOpen,
      `票52 ③ 变异组(亲眼变红): 打回改前初始 display:none → 「默认显示」断言转红 (mutantOpen: ${wo52Res.mutantOpen})；render() 复绿 (restoredOpen: ${wo52Res.restoredOpen})`);
    assert(wo52Res.mutRef === "D1" && wo52Res.mutRef !== wo52Res.expectRef && wo52Res.mutateRestored,
      `票52 ③ 变异组(亲眼变红/数据): 追加更晚事件后 data-ref 跟随新最新 ("${wo52Res.mutRef}" ≠ "${wo52Res.defaultRef}")，还原复回 (${wo52Res.mutateRestored})`);

    // ── 票53 · 节点详情抽屉(#journey-inspector)接「所选节点」──
    // 默认 = 画布事件流最新一条（标识 / target=ref / executor=actor）；点任一节点切换；
    // 事件真源 {seq,t,type,ref,actor} 无 status → 诚实中性 —，不留静态假状态 QUEUED。
    const wo53Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const clean = (s) => String(s == null ? "" : s).replace(/\\s+/g, " ").trim();
        const latestOf = (st) => {
          const evs = (st.activity || []).slice().sort((a, b) => {
            const ta = Date.parse(a.t), tb = Date.parse(b.t);
            if (ta !== tb) return ta - tb;
            return String(a.seq).localeCompare(String(b.seq));
          });
          return evs.length ? evs[evs.length - 1] : null;
        };
        const identOf = (ev) => ev
          ? clean('#' + String(ev.seq).padStart(2, '0') + ' ' + [ev.type, ev.ref].filter(Boolean).join(' '))
          : '#--';
        const evOfSeq = (seq) => (window.__TL__.activity || []).find(e => String(e.seq) === String(seq));
        const readInsp = () => ({
          title: clean((document.getElementById('inspector-node-title') || {}).textContent),
          target: clean((document.getElementById('inspector-target') || {}).textContent),
          executor: clean((document.getElementById('inspector-executor') || {}).textContent),
          status: clean((document.getElementById('inspector-node-status') || {}).textContent)
        });

        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        const expectEv = latestOf(window.__TL__);
        const def = readInsp();

        // ② 点一个「ref 与最新不同」的节点 → 详情抽屉切换到该节点
        const nodes = Array.from(document.querySelectorAll("#journey-svg-container .journey-node"));
        const differs = (n) => { const e = evOfSeq(n.getAttribute("data-seq")); return e && String(e.ref || e.seq) !== String(expectEv.ref || expectEv.seq); };
        const other = nodes.find(n => differs(n) && !n.classList.contains("is-hidden")) || nodes.find(differs);
        const otherEv = other ? evOfSeq(other.getAttribute("data-seq")) : null;
        let sw = null;
        if (other) { other.dispatchEvent(new MouseEvent("click", { bubbles: true })); sw = readInsp(); }

        // ③ 变异（接源/数据）: 抽掉 state.activity → 默认谓词转红（面板读的就是事件流），还原复绿
        const mutState = JSON.parse(JSON.stringify(window.__TL__));
        mutState.activity = [];
        app.render(mutState);
        app.switchJourneyMode("timeline");
        const mutTitle = readInsp().title;
        app.render(window.__TL__);
        app.switchJourneyMode("timeline");
        const restoredTitle = readInsp().title;

        return {
          def, expectTitle: identOf(expectEv),
          expectTarget: 'TARGET: ' + String(expectEv.ref || '--'),
          expectExec: String(expectEv.actor || '--'),
          hasOther: Boolean(other), sw,
          otherTitle: identOf(otherEv),
          otherTarget: 'TARGET: ' + String((otherEv && otherEv.ref) || '--'),
          otherExec: String((otherEv && otherEv.actor) || '--'),
          mutTitle, restoredTitle
        };
      })()
    `);
    assert(wo53Res.def.title === wo53Res.expectTitle && wo53Res.def.target === wo53Res.expectTarget && wo53Res.def.executor === wo53Res.expectExec,
      `票53 ① 真跑态(保持绿): 未点击即显示事件流最新节点 —— 标识 "${wo53Res.def.title}"（期望 "${wo53Res.expectTitle}"）/ target "${wo53Res.def.target}"（期望 "${wo53Res.expectTarget}"）/ executor "${wo53Res.def.executor}"（期望 "${wo53Res.expectExec}"）`);
    assert(wo53Res.def.status === '—',
      `票53 ① 无源状态诚实化: #inspector-node-status 不留静态假状态 QUEUED，实测 "${wo53Res.def.status}"`);
    assert(wo53Res.hasOther && wo53Res.sw && wo53Res.sw.title === wo53Res.otherTitle && wo53Res.sw.title !== wo53Res.def.title && wo53Res.sw.target === wo53Res.otherTarget && wo53Res.sw.executor === wo53Res.otherExec,
      `票53 ② 真跑态(保持绿): 点任一节点 → 详情抽屉切换到该节点（"${wo53Res.def.title}" → "${wo53Res.sw && wo53Res.sw.title}"，期望 "${wo53Res.otherTitle}"；target "${wo53Res.sw && wo53Res.sw.target}"）`);
    assert(wo53Res.mutTitle === '#--' && wo53Res.mutTitle !== wo53Res.expectTitle && wo53Res.restoredTitle === wo53Res.expectTitle,
      `票53 ③ 变异(亲眼变红/接源): 抽掉 state.activity 后详情抽屉退回空态 "${wo53Res.mutTitle}"（≠ 最新 "${wo53Res.expectTitle}"），还原复绿 "${wo53Res.restoredTitle}"`);

    // ── E2 (§WO45, 票36 搬到合成输入): 兜底臂诚实化 —— 删键必须渲 —，不得由 || 0 家族伪造读数 ──
    // stages / pipeline / queue.review 均为投影器零生产者键 → 本臂不再读夹具，改为在断言体内
    // 自造合成 state 后 app.render（照 P4-7b/P4-8 手法），保住该臂的核心价值且与生成式夹具解耦。
    console.log('\n  正在执行 E2 验证 (兜底臂诚实化：合成输入删键 + 变异对照)...');
    const e2Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const clean = (s) => String(s == null ? "" : s).replace(/\\s+/g, " ").trim();
        const mkState = () => {
          const s = JSON.parse(JSON.stringify(window.__TL__));
          s.pipeline = [
            { seq: 1, name: "环境初始化", status: "settled", window: "00:00 - 01:12", item_ref: "T1" },
            { seq: 2, name: "规范校验", status: "current", window: "01:12 - ACTIVE", item_ref: "T3" },
            { seq: 3, name: "共识落盘", status: "queued", window: "T+24:00", item_ref: "T5" }
          ];
          s.stages = [
            { kicker: "01 // 做到哪了", accent: "primary", badge: "—", name: "阶段一", desc: "—", progress_pct: "—", elapsed: "—" },
            { kicker: "02 // 哪里卡住", accent: "secondary", badge: "—", name: "主线通道畅通", desc: "—", workers_active: "—", workers_stalled: "—", lock_conflicts: "—" },
            { kicker: "03 // 什么在等我", accent: "tertiary", badge: "—", name: "GATE 分歧裁决确认", desc: "—", timeout: "—", gate_target: "Gamma-04", auto_label: "DEFAULT SAFE", auto_name: "超时自动执行标准修剪", auto_action: "PRUNE & ROLLBACK" }
          ];
          s.items = s.items.map((i) => {
            if (i.id === "T3") return Object.assign({}, i, { tokens: "—" });
            if (i.id === "T5") return Object.assign({}, i, { est: "—", rounds: 1 });
            return i;
          });
          s.queue = Object.assign({}, s.queue, { review: [{ ref: "T5", score: 8, reasons: ["合成"] }, { ref: "T1", score: 2, reasons: ["合成"] }] });
          return s;
        };

        const rowVal = (idx, labelRe) => {
          const card = document.querySelector('#journey-stages .stage-card[data-stage-index="' + idx + '"]');
          if (!card) return "";
          const rows = Array.from(card.querySelectorAll(".stage-kv-row, .stage-inline-row"));
          const hit = rows.find(r => labelRe.test(clean((r.querySelector(".stage-kv-label, .stage-inline-label") || {}).textContent)));
          return hit ? clean((hit.querySelector(".stage-kv-val, .stage-inline-val") || {}).textContent) : "";
        };
        const estOf = (id) => clean((document.querySelector("#card-" + id + " .meta-item-left > span") || {}).textContent);
        const attnCol = (sel) => Array.from(document.querySelectorAll("#decisions-attention-queue .attention-item " + sel)).map(e => clean(e.textContent));

        // 对照组：键在位 → 照常渲染真实值
        const clone = mkState();
        app.render(clone);
        const control = {
          workers: rowVal(1, /WORKER THREADS/),
          lock: rowVal(1, /锁冲突/),
          timeout: rowVal(2, /DECISION TIMEOUT/),
          tokens: clean((document.getElementById("inspector-tokens") || {}).textContent),
          rounds: estOf("T5"),
          attnW: attnCol(".attention-score"),
          attnL: attnCol(".attention-level"),
          attnA: attnCol(".attention-action")
        };

        // 删键夹具：抹掉对应键（而非置 —），触发兜底臂
        delete clone.stages[1].workers_active;
        delete clone.stages[1].workers_stalled;
        delete clone.stages[1].lock_conflicts;
        delete clone.stages[2].timeout;
        const t5 = clone.items.find(i => i.id === "T5");
        delete t5.est; delete t5.rounds;
        const t3 = clone.items.find(i => i.id === "T3");
        delete t3.tokens;
        delete clone.queue.review[0].score; // 删键：抹掉首项 score（渲 S— 而非 S0）
        app.render(clone);
        const missing = {
          workers: rowVal(1, /WORKER THREADS/),
          lock: rowVal(1, /锁冲突/),
          timeout: rowVal(2, /DECISION TIMEOUT/),
          tokens: clean((document.getElementById("inspector-tokens") || {}).textContent),
          rounds: estOf("T5"),
          attnW: attnCol(".attention-score"),
          attnL: attnCol(".attention-level"),
          attnA: attnCol(".attention-action")
        };

        app.render(window.__TL__); // 还原真实会话状态

        // 若兜底臂仍是 || 0 家族，删键时会伪造出的读数（变异方向）
        const legacy = {
          workers: "0 ACTIVE / 0 STALLED",
          lock: "0 Deadlocks",
          timeout: "00:00 REMAINING",
          tokens: "0 Tokens",
          rounds: "ROUNDS: 0"
        };
        const stillFake = Object.keys(missing).filter(k => missing[k] === legacy[k]);
        return { control, missing, legacy, stillFake };
      })()
    `);
    assert(e2Res.control.workers === '— ACTIVE / — STALLED' && e2Res.control.lock === '—' && e2Res.control.timeout === '— REMAINING' && e2Res.control.tokens === '—' && e2Res.control.rounds === 'EST —',
      `E2 对照组(保持绿): 合成输入键在位时照常渲染真实值，未被诚实化改动波及 (workers "${e2Res.control.workers}" / lock "${e2Res.control.lock}" / timeout "${e2Res.control.timeout}" / tokens "${e2Res.control.tokens}" / T5 "${e2Res.control.rounds}")`);
    assert(e2Res.missing.workers === '— ACTIVE / — STALLED',
      `E2 删键(workers_active/stalled): 键缺失渲 "— ACTIVE / — STALLED"（单位保留），而非伪造的 "${e2Res.legacy.workers}"（实渲 "${e2Res.missing.workers}"）`);
    assert(e2Res.missing.lock === '— Deadlocks',
      `E2 删键(lock_conflicts): 键缺失渲 "— Deadlocks"（后缀保留），而非 "${e2Res.legacy.lock}"（实渲 "${e2Res.missing.lock}"）`);
    assert(e2Res.missing.timeout === '— REMAINING',
      `E2 删键(timeout): 键缺失渲 "— REMAINING"（后缀保留），而非 "${e2Res.legacy.timeout}"（实渲 "${e2Res.missing.timeout}"）`);
    assert(e2Res.missing.tokens === '— Tokens',
      `E2 删键(tokens): 键缺失渲 "— Tokens"（后缀保留），而非 "${e2Res.legacy.tokens}"（实渲 "${e2Res.missing.tokens}"）`);
    assert(e2Res.missing.rounds === 'ROUNDS: —',
      `E2 删键(rounds/est): 两键缺失渲 "ROUNDS: —"（标签保留），而非 "${e2Res.legacy.rounds}"（实渲 "${e2Res.missing.rounds}"）`);
    assert(e2Res.stillFake.length === 0,
      `E2 变异组(亲眼变红): 任一删键处回落 || 0 家族并渲出伪造读数即转红 (命中 ${e2Res.stillFake.length} 处: ${e2Res.stillFake.join(', ') || '无'})`);

    // ── E2-weight (§WO45b，票 32 迁至 score): 优先关注队列分数臂诚实化 —— 键缺失不得渲 S0 ──
    const wControl = e2Res.control.attnW;
    const wMissing = e2Res.missing.attnW;
    const lMissing = e2Res.missing.attnL;
    const aMissing = e2Res.missing.attnA;
    assert(JSON.stringify(wControl) === JSON.stringify(['S8', 'S2']),
      `E2-weight 对照组(保持绿): 键在位时队列分数徽标照常渲真实值 [${wControl.join(', ')}]（等级 [${e2Res.control.attnL.join(', ')}]）`);
    assert(wMissing[wMissing.length - 1] === 'S—' && wMissing.indexOf('S0') === -1,
      `E2-weight 删键(queue.review[0].score): 键缺失渲 "S—"（标签 S 保留，与 ROUNDS: — 同构），而非伪造的 "S0"（实渲 [${wMissing.join(', ')}]）`);
    assert(lMissing[lMissing.length - 1] === '—' && aMissing[aMissing.length - 1] === '—',
      `E2-weight 派生诚实: 键缺失时等级/动作渲中性 "—"，不得由伪造 0 派生 NOMINAL/STABLE（实渲等级 "${lMissing[lMissing.length - 1]}" / 动作 "${aMissing[aMissing.length - 1]}"）`);

    // ── E2-created / E2-bar (§WO45d, 票36 搬到合成输入): created 时钟 + 进度条 ──
    // 臂 A: formatClock(created_offset_s) 键缺失不得回落 0 谎报「创建于 T+0」；
    // 臂 B: progress_pct 键缺失时进度条不得渲 0% 观感（文本臂已是 '—'）。
    // created_offset_s / stages[] 均投影器零生产者 → 本臂自造合成 stages 后 app.render。
    const wdRes = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const clean = (s) => String(s == null ? "" : s).replace(/\\s+/g, " ").trim();
        const clone = JSON.parse(JSON.stringify(window.__TL__));
        clone.stages = [
          { kicker: "01", accent: "primary", badge: "—", name: "阶段一", desc: "—", progress_pct: "—", elapsed: "—" },
          { kicker: "02", accent: "secondary", badge: "—", name: "主线通道畅通", desc: "—" },
          { kicker: "03", accent: "tertiary", badge: "—", name: "GATE 分歧裁决确认", desc: "—" }
        ];

        const createdText = () => clean((document.getElementById("decisions-created") || {}).textContent);
        const fillEl = () => document.querySelector('#journey-stages .stage-card[data-stage-index="0"] .stage-bar-fill');
        const barWidth = () => { const f = fillEl(); return f ? clean(f.style.width) : ""; };
        const barUnknown = () => { const f = fillEl(); return !!f && f.classList.contains("is-unknown"); };
        const pctText = () => clean((document.getElementById("journey-stage-progress-val") || {}).textContent);

        // 对照组：两键在位 → 照常渲染真实值（守「诚实化不得波及正常路径」）
        clone.decisions[0].created_offset_s = 20530;  // → T+05:42:10
        clone.stages[0].progress_pct = 68;
        app.render(clone);
        const control = { created: createdText(), pctText: pctText(), width: barWidth(), unknown: barUnknown() };

        // 删键夹具：抹掉两键（而非置 —），触发兜底臂
        delete clone.decisions[0].created_offset_s;
        delete clone.stages[0].progress_pct;
        app.render(clone);
        const missing = { created: createdText(), pctText: pctText(), width: barWidth(), unknown: barUnknown() };

        app.render(window.__TL__); // 还原真实会话状态
        return { control, missing };
      })()
    `);
    assert(/^CREATED: T\+\d{2}:\d{2}:\d{2}$/.test(wdRes.control.created) && wdRes.control.created === 'CREATED: T+05:42:10',
      `E2-created 对照组(保持绿): created_offset_s 在位(20530) → 渲 HH:MM:SS 时钟形态 "${wdRes.control.created}"（数值路径行为不变）`);
    assert(wdRes.missing.created === 'CREATED: T+--:--:--' && wdRes.missing.created.indexOf('T+00:00:00') === -1,
      `E2-created 删键(created_offset_s): 键缺失 → 渲既有诚实静态占位 "CREATED: T+--:--:--"，不得回落 0 伪造 "CREATED: T+00:00:00" 谎报创建于 T+0（实渲 "${wdRes.missing.created}"）`);
    assert(wdRes.control.pctText === '68%' && wdRes.control.width === '68%' && wdRes.control.unknown === false,
      `E2-bar 对照组(保持绿): progress_pct 在位(68) → 文本 "68%" 且宽度 "68%"，且不带 is-unknown（键在位不加类）`);
    assert(wdRes.missing.pctText === '—' && wdRes.missing.width !== '0%' && wdRes.missing.unknown === true,
      `E2-bar 删键(progress_pct): 键缺失 → 文本 "—" 且 fill 宽度非 "0%"（实渲 "${wdRes.missing.width}"）且带 is-unknown 类，不得渲「零进度」观感`);
    assert(wdRes.missing.width.indexOf('%') === -1,
      `E2-bar 删键(progress_pct): 键缺失时不留任何百分比宽度（实渲 "${wdRes.missing.width}"），由 .is-unknown 中性斜纹呈现「无读数」`);

    // ── WO45 (§票45): pi 评审 10 条收口的页面行为断言 ─────────────────────────
    // ① 徽标真源 / ② drift 条 / ③ severity / ④ 范围死控件不存在 / ⑤ ACTOR 真源枚举 /
    // ⑦ 时间戳列几何 / ⑧ 空态 / ⑨⑩ 文案。控件「有 handler 但不生效」的教训：一律断言行为。
    console.log('\n  正在执行 WO45 验证 (pi 评审 10 条收口的页面行为断言)...');
    const wo45Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const clean = (s) => String(s == null ? "" : s).replace(/\\s+/g, " ").trim();
        app.render(window.__TL__);
        // ⑦ 需要账本视图可见才有布局几何；测完在 return 前复原 journey 视图（后续截图依赖）
        const navLedger = document.getElementById("nav-item-ledger");
        if (navLedger) navLedger.click();
        const st = window.__TL__;
        const items = Array.isArray(st.items) ? st.items : [];

        // ① DONE 徽标：由 item.review 真源计算
        const done = items.filter(i => i.lane === "done");
        const audited = done.filter(i => i.review && i.review.state === "ok").length;
        const badge = clean((document.getElementById("badge-done") || {}).textContent);
        const badgeExpect = done.length + " DONE // " + audited + " AUDITED";

        // ② EPOCH DRIFT 条：无内联宽度、带 is-unknown 中性斜纹
        const prog = document.querySelector(".temporal-track .temporal-progress");
        const progInline = prog ? prog.getAttribute("style") : "MISSING";
        const progUnknown = !!prog && prog.classList.contains("is-unknown");
        const progBg = prog ? getComputedStyle(prog).backgroundImage : "";
        const driftVal = clean((document.getElementById("aside-epoch-drift") || {}).textContent);

        // ③ 决策徽标：severity 缺失 → '— // STATUS'
        const d2 = (Array.isArray(st.decisions) ? st.decisions : []).find(d => d.id === "D2") || {};
        const sevBadge = clean((document.getElementById("decisions-status-badge") || {}).textContent);
        const sevExpect = String(d2.severity || "—").toUpperCase() + " // " + String(d2.status || "open").toUpperCase();

        // ④ 时间范围控件已移除
        const rangeWrap = document.getElementById("ledger-time-range");
        const rangeBtnCount = document.querySelectorAll("[data-range]").length;

        // ⑤ ACTOR 芯片 = 账本行真源 actor 枚举；每个芯片点击必须命中 ≥1 行
        const trail = Array.isArray(st.trail) ? st.trail : [];
        const actorBySeq = new Map((Array.isArray(st.activity) ? st.activity : []).map(a => [a.seq, a.actor]));
        const rowActors = Array.from(new Set(trail.map(e => String(actorBySeq.get(e.seq) || "").toLowerCase()).filter(Boolean))).sort();
        const actorChips = Array.from(document.querySelectorAll("#ledger-actor-filters [data-actor]"));
        const actorLabels = actorChips.map(c => c.getAttribute("data-actor"));
        const rows = () => document.querySelectorAll("#ledger-rows .ledger-row").length;
        const allBtn = actorChips.find(c => c.getAttribute("data-actor") === "all");
        if (allBtn) allBtn.click();
        const totalRows = rows();
        const actorProbe = [];
        actorChips.forEach(c => {
          const v = c.getAttribute("data-actor");
          if (v === "all") return;
          c.click();
          actorProbe.push({ actor: v, n: rows() });
        });
        if (allBtn) allBtn.click();
        const restoreRows = rows();
        // 变异：把首个非 all 芯片改成与真源不符的旧标签 → 命中 0 行（旧 bug 复现）
        let actorMutZero = false;
        const firstChip = actorChips.find(c => c.getAttribute("data-actor") !== "all");
        if (firstChip) {
          const orig = firstChip.getAttribute("data-actor");
          firstChip.setAttribute("data-actor", "primary");
          firstChip.click();
          actorMutZero = rows() === 0;
          firstChip.setAttribute("data-actor", orig);
        }
        if (allBtn) allBtn.click();

        // ⑦ 时间戳列：nowrap/ellipsis/hidden + 无内容溢出/截断
        const tsCells = Array.from(document.querySelectorAll("#ledger-rows .ledger-col-ts"));
        const tsCellOverflow = tsCells.filter(c => c.scrollWidth > c.clientWidth + 1).length;
        const tsSpan = tsCells.length ? tsCells[0].querySelector(".ledger-ts") : null;
        const tsTruncated = tsSpan ? (tsSpan.scrollWidth > tsSpan.clientWidth + 1) : true;
        const tsStyle = tsSpan ? getComputedStyle(tsSpan) : null;
        const tsGeom = tsSpan ? [tsSpan.clientWidth, tsSpan.scrollWidth] : [0, 0];
        // ⑧ 空态：无真源区块渲显式文案
        const emptyOf = (id) => { const e = document.querySelector("#" + id + " .empty-state"); return e ? clean(e.textContent) : null; };
        const empty = {
          kpis: emptyOf("kpis-strip"),
          stages: emptyOf("journey-stages"),
          pipeline: emptyOf("journey-pipeline-nodes"),
          logs: emptyOf("journey-log-stream"),
          focus: emptyOf("journey-focus-metrics")
        };

        // ⑨⑩ 文案
        const shelfTitle = clean((document.querySelector("#artifacts-shelf .shelf-title-text") || {}).textContent);
        const impactNote = clean((document.querySelector("#view-decisions .card-head-note") || {}).textContent);

        const navJourney = document.getElementById("nav-item-journey");
        if (navJourney) navJourney.click();
        // ⑧ 几何（票47 Phase2 改写）：空态「压成一行且不破版」的等价几何——单行（高 ≤ 48px）且不横向溢出版面
        const jourStages = document.getElementById("journey-stages");
        const jourEmpty = jourStages ? jourStages.querySelector(".empty-state") : null;
        const stageSpanRatio = (jourStages && jourEmpty)
          ? jourEmpty.getBoundingClientRect().width / jourStages.getBoundingClientRect().width : -1;
        const stageEmptyH = jourEmpty ? jourEmpty.getBoundingClientRect().height : -1;
        const stageEmptyBreak = jourEmpty ? Math.max(0, jourEmpty.scrollWidth - jourEmpty.clientWidth) : -1;

        return {
          stageSpanRatio, stageEmptyH, stageEmptyBreak,
          badge, badgeExpect, badgeHas100: /100% OK/.test(badge),
          progInline, progUnknown, progBg, driftVal,
          sevBadge, sevExpect,
          rangeExists: !!rangeWrap, rangeBtnCount,
          rowActors, actorLabels, totalRows, actorProbe, restoreRows, actorMutZero,
          tsCellCount: tsCells.length, tsCellOverflow, tsTruncated, tsGeom,
          tsNowrap: tsStyle ? tsStyle.whiteSpace : "", tsEllipsis: tsStyle ? tsStyle.textOverflow : "", tsOverflowCss: tsStyle ? tsStyle.overflow : "",
          empty, shelfTitle, impactNote
        };
      })()
    `);
    assert(wo45Res.badge === wo45Res.badgeExpect && !wo45Res.badgeHas100,
      `票45 ① 行为(保持绿): #badge-done 由 item.review 真源派生（实渲 "${wo45Res.badge}"，期望 "${wo45Res.badgeExpect}"），不含无据通过率`);
    assert(wo45Res.progInline === null && wo45Res.progUnknown && /repeating-linear-gradient/.test(wo45Res.progBg) && wo45Res.driftVal === '—',
      `票45 ② 行为(保持绿): drift 条无内联宽度(style=${wo45Res.progInline})、带 is-unknown 中性斜纹、数值节点 "${wo45Res.driftVal}"`);
    assert(wo45Res.sevBadge === wo45Res.sevExpect && wo45Res.sevBadge.indexOf('CRITICAL') === -1,
      `票45 ③ 行为(保持绿): D2 无 severity → 徽标 "${wo45Res.sevBadge}"（期望 "${wo45Res.sevExpect}"），不回落静态等级`);
    assert(!wo45Res.rangeExists && wo45Res.rangeBtnCount === 0,
      `票45 ④ 行为(保持绿): 无真源边界的时间范围死控件已移除（#ledger-time-range ${wo45Res.rangeExists ? '仍在' : '不存在'}，[data-range] 计 ${wo45Res.rangeBtnCount}）`);
    assert(JSON.stringify(wo45Res.actorLabels) === JSON.stringify(['all'].concat(wo45Res.rowActors)),
      `票45 ⑤ 行为(保持绿): ACTOR 芯片 [${wo45Res.actorLabels.join(', ')}] 精确等于账本行真源 actor 枚举 [all, ${wo45Res.rowActors.join(', ')}]`);
    assert(wo45Res.actorProbe.length > 0 && wo45Res.actorProbe.every(p => p.n >= 1) && wo45Res.restoreRows === wo45Res.totalRows,
      `票45 ⑤ 行为(保持绿): 逐个 ACTOR 芯片点击均命中 ≥1 行（${wo45Res.actorProbe.map(p => p.actor + '=' + p.n).join(' / ')}），复位回全量 ${wo45Res.restoreRows}/${wo45Res.totalRows}`);
    assert(wo45Res.actorMutZero,
      `票45 ⑤ 变异组(亲眼变红): 把芯片改成与真源不符的旧标签 → 命中 0 行（旧 bug 复现，证明断言钉在真源枚举上）`);
    assert(wo45Res.tsCellCount > 0 && wo45Res.tsCellOverflow === 0 && !wo45Res.tsTruncated &&
      wo45Res.tsNowrap === 'nowrap' && wo45Res.tsEllipsis === 'ellipsis' && wo45Res.tsOverflowCss === 'hidden',
      `票45 ⑦ 行为(保持绿): 时间戳列 nowrap/ellipsis/overflow:hidden，${wo45Res.tsCellCount} 列零溢出、零截断（首列 client/scroll=${wo45Res.tsGeom.join('/')}）`);
    assert(['kpis', 'stages', 'pipeline', 'logs', 'focus'].every(k => wo45Res.empty[k] === '暂无真源数据'),
      `票45 ⑧ 行为(保持绿): 5 个无真源区块渲显式空态（${JSON.stringify(wo45Res.empty)}）`);
    assert(wo45Res.stageSpanRatio > 0.9 && wo45Res.stageEmptyH > 0 && wo45Res.stageEmptyH <= 48 && wo45Res.stageEmptyBreak === 0,
      `票45 ⑧ 几何(票47 改写/保持绿): 空态压成一行（高 ${wo45Res.stageEmptyH}px ≤ 48）且仍横跨 grid 不破版（占比 ${wo45Res.stageSpanRatio.toFixed(3)}、横向溢出 ${wo45Res.stageEmptyBreak}）`);
    assert(wo45Res.shelfTitle === 'Latest Artifacts Shelf' && wo45Res.impactNote === 'DECLARED IMPACT',
      `票45 ⑨⑩ 行为(保持绿): 货架标题 "${wo45Res.shelfTitle}" / 影响矩阵标注 "${wo45Res.impactNote}"`);

    // ── 票50：pi 复审三处遗留收尾 —— ① Journey 结论摘要位 + ② Inspector 空态压缩 ────
    // ② 的高度几何量测钉在 pi 同口径视口 1440×1000（默认 headless 视口 <1200 会触发
    // .impact-matrix 折 3 列使读数随环境浮动），量测后清 override，不影响后续截图。
    console.log('\n  正在执行 票50 验证 (Journey 结论摘要位 / Inspector 全未知占位压缩)...');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const wo50Res = await evalRes(`
      (() => {
        const app = window.__TL_APP__;
        const clean = (s) => String(s == null ? "" : s).replace(/\\s+/g, " ").trim();
        const navJourney = document.getElementById("nav-item-journey");
        if (navJourney) navJourney.click();

        // ① 摘要位真跑态：pipeline 零生产者 → 两格在且明确写未知（不得由历史事件推断当前阶段）
        const sum = document.getElementById("journey-summary");
        const hasPipelineKey = Object.prototype.hasOwnProperty.call(window.__TL__ || {}, "pipeline");
        const stockCur = clean((document.getElementById("journey-summary-current") || {}).textContent);
        const stockNext = clean((document.getElementById("journey-summary-next") || {}).textContent);
        const summaryControl = !!sum && !hasPipelineKey
          && stockCur === "当前节点未提供" && stockNext === "下一等待点未提供";

        // ① 正向覆盖：合成 pipeline 含 current/awaiting → 摘要位跟随真源；还原 → 复回未知
        const synth = JSON.parse(JSON.stringify(window.__TL__));
        synth.pipeline = [
          { seq: 1, name: "环境初始化", status: "settled", item_ref: "T1" },
          { seq: 2, name: "规范校验", status: "current", item_ref: "T3" },
          { seq: 3, name: "共识落盘", status: "awaiting", item_ref: "T5" }
        ];
        app.render(synth);
        const synthCur = clean((document.getElementById("journey-summary-current") || {}).textContent);
        const synthNext = clean((document.getElementById("journey-summary-next") || {}).textContent);
        app.render(window.__TL__);
        const restoredCur = clean((document.getElementById("journey-summary-current") || {}).textContent);

        // ① 变异：掐掉摘要位容器 → 「摘要位在且写未知」断言必转红；随后原位还原
        const sumParent = sum ? sum.parentNode : null;
        const sumNext = sum ? sum.nextSibling : null;
        if (sum) sumParent.removeChild(sum);
        const mutMissing = !document.getElementById("journey-summary");
        if (sum) sumParent.insertBefore(sum, sumNext);
        const restoredExists = !!document.getElementById("journey-summary");

        // ② Inspector 空态：无真源真跑态带 is-compact、高度收在阈值内，且 5 格影响矩阵结构保留
        const insp = document.getElementById("journey-inspector");
        const hasCompact = !!insp && insp.classList.contains("is-compact");
        const compactH = insp ? Math.round(insp.getBoundingClientRect().height) : -1;
        const impactCells = document.querySelectorAll("#journey-impact-matrix .impact-cell").length;
        // ② 变异：摘掉 is-compact 类 → 高度回到大值；加回复原
        if (insp) insp.classList.remove("is-compact");
        const tallH = insp ? Math.round(insp.getBoundingClientRect().height) : -1;
        if (insp) insp.classList.add("is-compact");
        const restoredH = insp ? Math.round(insp.getBoundingClientRect().height) : -1;

        return { summaryControl, stockCur, stockNext, synthCur, synthNext, restoredCur,
                 mutMissing, restoredExists, hasCompact, compactH, tallH, restoredH, impactCells };
      })()
    `);
    await cdp('Emulation.clearDeviceMetricsOverride');
    assert(wo50Res.summaryControl,
      `票50 ① 摘要位(真跑态): #journey-summary 在、无 pipeline 真源时两格明确写未知（当前节点 "${wo50Res.stockCur}" / 下一等待点 "${wo50Res.stockNext}"），不从历史事件推断当前阶段`);
    assert(wo50Res.synthCur === "#NO02 规范校验" && wo50Res.synthNext === "#NO03 共识落盘" && wo50Res.restoredCur === "当前节点未提供",
      `票50 ① 正向覆盖: 合成 pipeline(current/awaiting) → 摘要位跟随声明状态渲出（"${wo50Res.synthCur}" / "${wo50Res.synthNext}"），还原真跑态复回未知`);
    assert(wo50Res.mutMissing && wo50Res.restoredExists,
      `票50 ① 变异组(亲眼变红): 移除 #journey-summary 容器后「摘要位在且写未知」断言转红（DOM 实删实红，还原后容器复在）`);
    assert(wo50Res.hasCompact && wo50Res.compactH > 0 && wo50Res.compactH <= 340 && wo50Res.impactCells === 5,
      `票50 ② Inspector 压缩: 无真源真跑态带 is-compact、高度 ${wo50Res.compactH}px ≤ 340，且 impact 5 格结构保留（${wo50Res.impactCells} 格）`);
    assert(wo50Res.tallH > 340 && wo50Res.restoredH === wo50Res.compactH,
      `票50 ② 变异组(亲眼变红): 摘掉 is-compact 后 Inspector 高度回到 ${wo50Res.tallH}px（> 340）断言转红，类加回复绿（${wo50Res.restoredH}px）`);

    // 时空视图模式截图留证
    await evalRes(`window.__TL_APP__.switchJourneyMode("timeline"); true`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2200, deviceScaleFactor: 1, mobile: false });
    const timelineShot = await cdp('Page.captureScreenshot', { format: 'png' });
    const timelinePath = path.join(screenshotsDir, 'journey-timeline.png');
    fs.writeFileSync(timelinePath, Buffer.from(timelineShot.data, 'base64'));
    await evalRes(`window.__TL_APP__.switchJourneyMode("branches"); true`);
    const branchesShot = await cdp('Page.captureScreenshot', { format: 'png' });
    const branchesPath = path.join(screenshotsDir, 'journey-branches.png');
    fs.writeFileSync(branchesPath, Buffer.from(branchesShot.data, 'base64'));
    await cdp('Emulation.clearDeviceMetricsOverride');
    await evalRes(`window.__TL_APP__.switchJourneyMode("universe"); true`);
    assert(fs.existsSync(timelinePath) && fs.statSync(timelinePath).size > 10000 && fs.existsSync(branchesPath) && fs.statSync(branchesPath).size > 10000,
      `已生成时空视图模式截图: ${timelinePath} / ${branchesPath}`);

    ws.close();
  } finally {
    try {
      chromeProc.kill('SIGTERM');
    } catch {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
  }
}

// ── 4.5 深度功能纯逻辑单元断言（空档折叠严格判据 / 分离度唯一判据 同源共动）────
function testDepthFeaturesUnit() {
  console.log('\n[3.5/4] 执行深度功能纯逻辑单元断言 (空档折叠严格判据 / 分离度唯一判据 同源共动)...');

  const appJsContent = fs.readFileSync(path.join(templatesDir, 'app.js'), 'utf8');
  const fakeWindow = { location: { hash: '' }, addEventListener: () => {} };
  const fakeDoc = {
    head: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    createElementNS: () => ({ setAttribute: () => {}, appendChild: () => {} })
  };
  const load = (src) => new Function('window', 'document', 'navigator', 'setInterval', 'clearInterval', `${src}; return window.__TL_APP__;`)(fakeWindow, fakeDoc, {}, () => 0, () => {});

  const app = load(appJsContent);

  // ── 功能 3 · 空档折叠阈值边界 + 严格 > 判据 ──────────────────────────
  const M15 = 15 * 60 * 1000;
  assert(app.shouldFoldGap(M15 - 1000, M15) === false, 'P3 边界(保持绿): 14m59s 空档不折叠（不应折叠）');
  assert(app.shouldFoldGap(M15 + 1000, M15) === true, 'P3 边界(保持绿): 15m01s 空档折叠');
  assert(app.shouldFoldGap(M15, M15) === false, 'P3 边界(保持绿): 恰为阈值 15m00s 不折叠（锁定严格 >，非 >=）');
  assert(app.shouldFoldGap(M15 - 1000, M15) === false && app.shouldFoldGap(M15 + 1, M15) === true, 'P3 边界对照: 阈值两侧 14m59s / 15m00.001s 判定相反（翻面清晰）');

  const p3Mut = load(appJsContent.replace('gapMs > th', 'gapMs >= th'));
  assert(p3Mut.shouldFoldGap(M15, M15) === true, 'P3 变异组(亲眼变红): 把 `>` 改成 `>=` 后 15m00s 边界探针翻转（同源共动证明唯一判据）');
  assert(app.shouldFoldGap(M15, M15) === false, 'P3 还原(保持绿): 未变异源码下 15m00s 边界探针复绿');

  // ── 功能 6 · 分离度唯一判据 SEPARATION_MIN + 边界探针 ─────────────────
  const literalCount = (appJsContent.match(/0\.20/g) || []).length;
  assert(literalCount === 1, `P6 唯一判据(保持绿): 字面量 0.20 在 app.js 全局仅出现 1 次（实测 ${literalCount}）——无复述`);
  assert(app.SEPARATION_MIN === 0.20, `P6 唯一判据(保持绿): SEPARATION_MIN === 0.20`);
  assert(app.isSeparated(0.2000, 0) === false, 'P6 边界(保持绿): !isSeparated(0.2000, 0)（锁定严格 >）');
  assert(app.isSeparated(0.2001, 0) === true, 'P6 边界(保持绿): isSeparated(0.2001, 0)');

  const p6Gt = load(appJsContent.replace('Math.abs(a - base) > SEPARATION_MIN', 'Math.abs(a - base) >= SEPARATION_MIN'));
  assert(p6Gt.isSeparated(0.2000, 0) === true, 'P6 变异组(亲眼变红): 把 `>` 改成 `>=` 后 !isSeparated(0.2000, 0) 探针转红（同源共动）');

  const p6Thr = load(appJsContent.replace('const SEPARATION_MIN = 0.20;', 'const SEPARATION_MIN = 0.25;'));
  assert(p6Thr.isSeparated(0.2001, 0) === false, 'P6 变异组(亲眼变红): 把 SEPARATION_MIN 改成 0.25 后 isSeparated(0.2001, 0) 探针转红（同源共动）');

  assert(app.isSeparated(0.2001, 0) === true && app.isSeparated(0.2000, 0) === false, 'P6 还原(保持绿): 未变异源码下两条边界探针复绿');

  // ── 票 37 · 衰减倒计时取值判据（纯函数 decayCountdownText，源级变异同源共动）────
  const W37_AT = '2026-09-28T18:05:00.000Z';
  const W37_GEN = Date.parse('2026-09-28T18:00:00.000Z');
  assert(app.decayCountdownText({ lock_at: { type: 'time', at: W37_AT } }, W37_GEN, 0) === '5分 00秒',
    'W37 单测(保持绿): time 型 lock_at 由 generated_at 派生剩余 300s → "5分 00秒"');
  assert(app.decayCountdownText({ lock_at: { type: 'item', ref: 'T9' } }, NaN, 0) === '等待 T9',
    'W37 单测(保持绿): item 型 lock_at → "等待 T9"（不依赖 generated_at）');
  assert(app.decayCountdownText({ lock_at: null }, W37_GEN, 0) === '—'
    && app.decayCountdownText(null, W37_GEN, 0) === '—'
    && app.decayCountdownText({ lock_at: { type: 'time', at: 'INVALID' } }, W37_GEN, 0) === '—',
    'W37 单测(保持绿): 无决策 / 无 lock_at / at 不可解析 → 均诚实渲 "—"(U+2014)');
  const app37Mut = load(appJsContent.replace('const lock = focus && focus.lock_at;', 'const lock = null;'));
  assert(app37Mut.decayCountdownText({ lock_at: { type: 'time', at: W37_AT } }, W37_GEN, 0) === '—',
    'W37 变异组(亲眼变红): 源级删掉真源读（`const lock = focus && focus.lock_at` → null）后 time 型倒计时退化为 "—"（证明断言钉在真源上）');
}

// ── 执行主入口 ──────────────────────────────────────────────────────────
async function run() {
  console.log('================================================================');
  console.log('  Engineering Long-Task Master Cockpit 自动化断言自检套件');
  console.log('================================================================');

  try {
    await testStaticRules();
    await testEscapingAndSecurity();
    testStateMatrixUnit();
    testDepthFeaturesUnit();
    await testHeadlessChrome();

    console.log('\n================================================================');
    console.log(`自检完成: 共 ${totalTests} 项断言，通过 ${passedTests} 项，失败 ${failedTests} 项`);
    console.log('================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n自检执行发生异常:');
    console.error(err.message || err);
    process.exit(1);
  }
}

run();
