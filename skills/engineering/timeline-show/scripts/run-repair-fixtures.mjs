// timeline-show / scripts / run-repair-fixtures.mjs
// 针对五项审查意见（Review Findings）的专注回归测试夹具：
// 1. 真实离线多文件资产协同部署 (timeline.html / style.css / app.js / state.js) 与自刷新支持
// 2. 幂等恢复：保留原初始 run.start、标题、目标、开工时刻与完成态，安全发现 currentRun
// 3. 外源工作目录 (Foreign CWD) 规范：使用完整技能路径与显式 --root / --run，不污染执行目录
// 4. 四视图路由定义、标题创建与防空约束：查看操作绝不自建 run 或接收不存在编号
// 5. 事件契约与 Schema 规范参考文档完整性检验

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  initRun,
  append,
  check,
  finish,
  viewRun,
  VALID_VIEWS,
  currentRun,
  deployOfflineAssets
} from './tl.mjs';
import { project } from './project.mjs';

const DIR = resolve(fileURLToPath(import.meta.url), '..');
const SKILL_DIR = resolve(DIR, '..');
const TL_PATH = join(DIR, 'tl.mjs');
const SKILL_MD_PATH = join(SKILL_DIR, 'SKILL.md');
const EVENTS_MD_PATH = join(SKILL_DIR, 'references', 'events.md');

let bad = 0;
function report(name, checks) {
  for (const [t, ok] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${name}] ${t}`);
  }
}

// ── 1. 离线多文件资产协同部署与刷新测试 ────────────────────────────────────
{
  const targetRoot = mkdtempSync(join(tmpdir(), 'tl-p1-'));
  let r = null;
  let hasHtml = false;
  let hasCss = false;
  let hasJs = false;
  let hasState = false;
  let htmlLinked = false;
  let stateUpdated = false;

  try {
    r = initRun({ root: targetRoot, title: '离线部署自检', goal: '多文件协同生成' });
    const runDir = join(targetRoot, '.taskboard', 'runs', r.runId);
    const htmlPath = join(runDir, 'timeline.html');
    const cssPath = join(runDir, 'style.css');
    const jsPath = join(runDir, 'app.js');
    const statePath = join(runDir, 'state.js');

    hasHtml = existsSync(htmlPath) && readFileSync(htmlPath, 'utf8').length > 0;
    hasCss = existsSync(cssPath) && readFileSync(cssPath, 'utf8').length > 0;
    hasJs = existsSync(jsPath) && readFileSync(jsPath, 'utf8').length > 0;
    hasState = existsSync(statePath) && readFileSync(statePath, 'utf8').startsWith('window.__TL__ =');

    if (hasHtml) {
      const htmlContent = readFileSync(htmlPath, 'utf8');
      htmlLinked = htmlContent.includes('href="style.css"') && htmlContent.includes('src="app.js"');
    }

    append({
      root: targetRoot,
      runId: r.runId,
      type: 'item.add',
      ref: 'T1',
      data: { title: '动态事件追加' }
    });

    const newStateContent = readFileSync(statePath, 'utf8');
    stateUpdated = newStateContent.includes('动态事件追加') && newStateContent.includes('"T1"');
  } catch (e) {
    console.error(`[P1 Error] ${e.message}`);
  } finally {
    try { rmSync(targetRoot, { recursive: true, force: true }); } catch {}
  }

  report('1-离线资产部署', [
    ['init 生成 .taskboard/runs/<runId>/timeline.html', hasHtml],
    ['init 生成同目录 style.css 样式资产', hasCss],
    ['init 生成同目录 app.js 交互逻辑资产', hasJs],
    ['init 生成同目录 state.js 状态数据', hasState],
    ['timeline.html 正确链接 style.css 与 app.js', htmlLinked],
    ['append 事件后 state.js 原位实时更新', stateUpdated],
  ]);
}

// ── 2. 幂等恢复与安全发现测试 ──────────────────────────────────────────────
{
  const targetRoot = mkdtempSync(join(tmpdir(), 'tl-p2-'));
  let preservedTitle = false;
  let preservedGoal = false;
  let preservedType = false;
  let preservedStatusDone = false;
  let preservedStartedAt = false;
  let safeNormal = false;
  let safeTamperedDir = false;
  let safeCorruptedJson = false;
  let safeEmptyRoot = false;

  try {
    const r1 = initRun({
      root: targetRoot,
      runId: 'run-idemp-001',
      title: '原始任务标题',
      goal: '原始目标描述',
      type: 'engineering'
    });

    const runDir = join(targetRoot, '.taskboard', 'runs', 'run-idemp-001');
    const evp = join(runDir, 'events.jsonl');
    const firstLine = JSON.parse(readFileSync(evp, 'utf8').trim().split('\n')[0]);
    const originalStartedAt = firstLine.t;

    append({ root: targetRoot, runId: 'run-idemp-001', type: 'item.add', ref: 'T1', data: { title: '初始项' } });
    append({ root: targetRoot, runId: 'run-idemp-001', type: 'item.start', ref: 'T1', data: { progress: 0 } });
    finish({ root: targetRoot, runId: 'run-idemp-001' });

    // 重复执行 init，模拟同一 run 恢复（不带标题与目标）
    initRun({ root: targetRoot, runId: 'run-idemp-001' });

    const lines = readFileSync(evp, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const finalState = project(lines, new Date().toISOString());

    preservedTitle = finalState.run.title === '原始任务标题';
    preservedGoal = finalState.run.goal === '原始目标描述';
    preservedType = finalState.run.type === 'engineering';
    preservedStatusDone = finalState.run.status === 'done';
    preservedStartedAt = finalState.run.started_at === originalStartedAt;

    // 安全 currentRun 测试
    safeNormal = currentRun(targetRoot) === 'run-idemp-001';

    // 伪造指向不存在目录的 current.json
    writeFileSync(join(targetRoot, '.taskboard', 'current.json'), JSON.stringify({ run: 'phantom-dir' }));
    safeTamperedDir = currentRun(targetRoot) === 'run-idemp-001';

    // 损坏 current.json 为坏 JSON
    writeFileSync(join(targetRoot, '.taskboard', 'current.json'), 'ILLEGAL_JSON_DATA{{{');
    safeCorruptedJson = currentRun(targetRoot) === 'run-idemp-001';

    // 空根目录安全返回 null
    const emptyRoot = mkdtempSync(join(tmpdir(), 'tl-p2-empty-'));
    safeEmptyRoot = currentRun(emptyRoot) === null;
    try { rmSync(emptyRoot, { recursive: true, force: true }); } catch {}
  } catch (e) {
    console.error(`[P2 Error] ${e.message}`);
  } finally {
    try { rmSync(targetRoot, { recursive: true, force: true }); } catch {}
  }

  report('2-幂等恢复与发现', [
    ['同一 run 恢复 init 保留原标题', preservedTitle],
    ['同一 run 恢复 init 保留原目标', preservedGoal],
    ['同一 run 恢复 init 保留原任务类型', preservedType],
    ['已完成 run 重复 init 不被重置为 running (status 仍为 done)', preservedStatusDone],
    ['同一 run 重复 init 保留原 started_at 时间戳', preservedStartedAt],
    ['currentRun 正常读取 current.json', safeNormal],
    ['current.json 指向不存在目录时安全回退至目录扫描', safeTamperedDir],
    ['current.json 损坏时安全回退至目录扫描', safeCorruptedJson],
    ['空仓扫描 currentRun 安全返回 null 且不抛异常', safeEmptyRoot],
  ]);
}

// ── 3. 外源工作目录 (Foreign CWD) 与显式参数测试 ────────────────────────────
{
  const foreignCwd = mkdtempSync(join(tmpdir(), 'tl-p3-foreign-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'tl-p3-target-'));

  let initExit = -1;
  let appendExit = -1;
  let checkExit = -1;
  let finishExit = -1;
  let foreignClean = false;
  let targetHasTaskboard = false;
  let targetHasGitignore = false;

  try {
    const resInit = spawnSync(process.execPath, [TL_PATH, 'init', '--root', targetRoot, '--title', 'Foreign测试任务'], { cwd: foreignCwd });
    initExit = resInit.status;

    const resAppend = spawnSync(process.execPath, [
      TL_PATH, 'append', '--root', targetRoot, '--type', 'item.add', '--data', JSON.stringify({ title: '远端项' })
    ], { cwd: foreignCwd });
    appendExit = resAppend.status;

    const resCheck = spawnSync(process.execPath, [
      TL_PATH, 'check', '--root', targetRoot, '--name', '内联断言', '--', process.execPath, '-e', 'process.exit(0)'
    ], { cwd: foreignCwd });
    checkExit = resCheck.status;

    const resFinish = spawnSync(process.execPath, [TL_PATH, 'finish', '--root', targetRoot], { cwd: foreignCwd });
    finishExit = resFinish.status;

    const foreignEntries = readdirSync(foreignCwd);
    foreignClean = foreignEntries.length === 0;

    targetHasTaskboard = existsSync(join(targetRoot, '.taskboard', 'current.json'));
    targetHasGitignore = existsSync(join(targetRoot, '.gitignore')) &&
      readFileSync(join(targetRoot, '.gitignore'), 'utf8').includes('.taskboard/');
  } catch (e) {
    console.error(`[P3 Error] ${e.message}`);
  } finally {
    try { rmSync(foreignCwd, { recursive: true, force: true }); } catch {}
    try { rmSync(targetRoot, { recursive: true, force: true }); } catch {}
  }

  report('3-外源CWD调用', [
    ['外源 CWD 下执行 init 成功 (exit 0)', initExit === 0],
    ['外源 CWD 下执行 append 成功 (exit 0)', appendExit === 0],
    ['外源 CWD 下执行 check 成功 (exit 0)', checkExit === 0],
    ['外源 CWD 下执行 finish 成功 (exit 0)', finishExit === 0],
    ['外源 CWD 目录完全保持洁净无副作用', foreignClean],
    ['所有产物严格仅写入 --root 指定的目标仓 .taskboard/', targetHasTaskboard],
    ['目标仓根目录生成并收录 .gitignore 行', targetHasGitignore],
  ]);
}

// ── 4. 四视图路由、标题创建与防空机制测试 ──────────────────────────────────
{
  const targetRoot = mkdtempSync(join(tmpdir(), 'tl-p4-'));
  let titleCreateOk = false;
  let viewsOk = true;
  let unknownViewThrows = false;
  let nonExistentRunThrows = false;
  let nonExistentRunCliExit1 = false;
  let emptyRunThrows = false;
  let emptyRunCliExit1 = false;
  let phantomDirNotCreated = false;

  try {
    // 4.1 标题参数创建
    const resCreate = spawnSync(process.execPath, [TL_PATH, '指定标题新建Run', '--root', targetRoot]);
    titleCreateOk = resCreate.status === 0;

    const cur = currentRun(targetRoot);
    // 4.2 四种视图哈希路由测试
    for (const v of VALID_VIEWS) {
      const res = viewRun({ root: targetRoot, runId: cur, view: v });
      if (res.view !== v || !res.url.endsWith(`#${v}`)) {
        viewsOk = false;
      }
    }

    // 4.3 未知视图校验抛出
    try {
      viewRun({ root: targetRoot, runId: cur, view: 'unsupported_tab' });
    } catch (e) {
      unknownViewThrows = e.message.includes('仅支持');
    }

    // 4.4 不存在的 run 绝不静默接受或新建
    try {
      viewRun({ root: targetRoot, runId: 'run-phantom-id' });
    } catch (e) {
      nonExistentRunThrows = e.message.includes('不存在');
    }

    const resCliMissing = spawnSync(process.execPath, [TL_PATH, 'view', '--root', targetRoot, '--run', 'run-phantom-id']);
    nonExistentRunCliExit1 = resCliMissing.status === 1;
    phantomDirNotCreated = !existsSync(join(targetRoot, '.taskboard', 'runs', 'run-phantom-id'));

    // 4.5 空根目录直接 view 必须拒绝
    const emptyRoot = mkdtempSync(join(tmpdir(), 'tl-p4-empty-'));
    try {
      viewRun({ root: emptyRoot });
    } catch (e) {
      emptyRunThrows = e.message.includes('未找到当前正在进行的 run');
    }

    const resCliEmpty = spawnSync(process.execPath, [TL_PATH, 'view', '--root', emptyRoot]);
    emptyRunCliExit1 = resCliEmpty.status === 1;

    try { rmSync(emptyRoot, { recursive: true, force: true }); } catch {}
  } catch (e) {
    console.error(`[P4 Error] ${e.message}`);
  } finally {
    try { rmSync(targetRoot, { recursive: true, force: true }); } catch {}
  }

  report('4-视图与防空约束', [
    ['位置参数标题创建 run 成功', titleCreateOk],
    ['board / decisions / journey / ledger 四视图路由均返回对应锚点', viewsOk],
    ['非法视图入参抛出明确错误', unknownViewThrows],
    ['查看不存在的 runId 严格抛出异常 (绝不静默新建或接纳)', nonExistentRunThrows],
    ['CLI 查看不存在的 runId 以状态码 1 退出', nonExistentRunCliExit1],
    ['查看非法 runId 绝不在磁盘上虚假创建目录', phantomDirNotCreated],
    ['空仓查看视图严格拒绝且退出码为 1', emptyRunThrows && emptyRunCliExit1],
  ]);
}

// ── 5. 事件契约与完整 Schema 参考文档检验 ──────────────────────────────────
{
  const docExists = existsSync(EVENTS_MD_PATH);
  let docContent = '';
  if (docExists) {
    docContent = readFileSync(EVENTS_MD_PATH, 'utf8');
  }

  const skillMdContent = existsSync(SKILL_MD_PATH) ? readFileSync(SKILL_MD_PATH, 'utf8') : '';
  const skillLinked = skillMdContent.includes('references/events.md');

  const EXPECTED_EVENTS = [
    'run.start', 'run.end', 'run.pause', 'run.resume',
    'item.add', 'item.edit', 'item.start', 'item.progress', 'item.done', 'item.fail', 'item.drop', 'item.reopen', 'item.supersede',
    'decision.open', 'decision.pack', 'decision.impact', 'decision.answer', 'decision.override', 'decision.expire', 'decision.hold', 'decision.moot', 'decision.cascade',
    'check.run', 'check.claim', 'artifact',
    'review.ok', 'review.flag', 'review.redo',
    'stuck.open', 'stuck.close'
  ];

  const allEventsPresent = EXPECTED_EVENTS.every(ev => docContent.includes(ev));
  const hasRefReuse = docContent.includes('T<n>') && docContent.includes('D<n>') &&
                      docContent.includes('K<n>') && docContent.includes('C<n>');
  const hasEvidenceContrasted = docContent.includes('check.run') && docContent.includes('check.claim') &&
                                docContent.includes('机器验证') && docContent.includes('自述');
  const hasFullWalkthrough = docContent.includes('item.add') && docContent.includes('item.start') &&
                             docContent.includes('check.run') && docContent.includes('item.done') &&
                             docContent.includes('assumes');

  report('5-Schema参考文档', [
    ['references/events.md 文件存在', docExists],
    ['SKILL.md 显式链接到 references/events.md', skillLinked],
    [`文档完整覆盖全部 30 个事件类型规范`, allEventsPresent],
    ['包含 T/D/K/C 编号模式与引用复用规则', hasRefReuse],
    ['包含机器凭证 check.run 与自述 check.claim 的区别与防伪机制', hasEvidenceContrasted],
    ['包含完整的 item.add -> start -> check -> done 流转实录示例', hasFullWalkthrough],
  ]);
}

console.log(`\n修复回归套件执行完毕: ${bad === 0 ? '全部通过' : `失败 ${bad} 项`}`);
process.exit(bad === 0 ? 0 : 1);
