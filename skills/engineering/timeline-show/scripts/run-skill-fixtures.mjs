// 复跑式自检(票 24「SKILL.md 成文与 tokens 拆分」)。
// 形状照 visualize/scripts/run-fixtures.mjs:无测试框架,Node 标准库自己写;
// 每条自检打印 ok/FAIL,全过退 0,否则退 1。
//
// 覆盖任务书「自检」三条 + 一条本票必须落地的耦合:
//   1 漂移夹具        —— visualize/scripts/tokens.json 与 timeline-show/scripts/tokens.json 逐字节相同
//   2 技能可被列出    —— 装完后 ~/.claude/skills/timeline-show 指向本技能,SKILL.md 字段可解析
//   3 阈值判据可执行  —— 「预计 20 分钟」不触发、「预计 40 分钟」触发(写死的数,不是语义判断)
//   4 taste 记忆被 init 读到 —— tl init 的 run.start 带上主题/强调色(读不到则降级默认)
//
// 前置:先跑仓根 `bash scripts/link-skills.sh` 把本技能装到 ~/.claude/skills。
//       自检 2 断言这条安装;未装即红(这是「技能真的存在」的一部分,不是环境噪声)。

import { readFileSync, existsSync, realpathSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = import.meta.dirname;                       // .../timeline-show/scripts
const SKILL_DIR = resolve(DIR, '..');                  // .../timeline-show
const REPO = resolve(DIR, '..', '..', '..', '..');     // 仓根
const VIZ_JSON = join(REPO, 'skills', 'engineering', 'visualize', 'scripts', 'tokens.json');
const SELF_JSON = join(SKILL_DIR, 'scripts', 'tokens.json');
const SKILL_MD = join(SKILL_DIR, 'SKILL.md');
const INSTALLED = join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'skills', 'timeline-show', 'SKILL.md');

let bad = 0;
function report(name, checks) {
  for (const [t, ok] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} [${name}] ${t}`);
  }
}
const fileURL = (p) => `file:///${p.replace(/\\/g, '/')}`;

// ── 1 漂移夹具:两份 tokens.json 逐字节相同 ─────────────────────────────────
{
  const have = existsSync(VIZ_JSON) && existsSync(SELF_JSON);
  let byteEqual = false, same = false, loaderOk = false, detail = '';
  if (have) {
    const a = readFileSync(VIZ_JSON); const b = readFileSync(SELF_JSON);
    byteEqual = a.equals(b);
    detail = `${a.length}B vs ${b.length}B`;
    try {
      const viz = await import(fileURL(join(REPO, 'skills', 'engineering', 'visualize', 'scripts', 'tokens.mjs')));
      const self = await import(fileURL(join(SKILL_DIR, 'scripts', 'tokens.mjs')));
      same = JSON.stringify(viz.TOKEN) === JSON.stringify(self.TOKEN)
        && JSON.stringify(viz.TOKEN) === JSON.stringify(JSON.parse(a.toString('utf8')));
      // 「薄加载器」这条性质由下面的 1b 用变异测试真正验证;这里只断言表非空、import 没炸。
      loaderOk = Object.keys(self.TOKEN).length > 0 && Object.keys(viz.TOKEN).length > 0;
    } catch (e) { detail += ` | import 失败:${e.message}`; }
  }
  report('1-漂移夹具', [
    [`两份 tokens.json 都存在(${VIZ_JSON} / ${SELF_JSON})`, have],
    [`逐字节相同(${detail})`, byteEqual],
    ['两份加载器导出的 TOKEN 逐值相同且等于 JSON 真源', same],
    ['薄加载器能解析出代币表', loaderOk],
  ]);
}

// ── 1b 薄加载器真的在「读文件」——变异测试 ──────────────────────────────────
// 票 24 复核发现:上面原来那句注释承诺「改一处外部数据能反映到 TOKEN 上」,却没有任何一行代码做这件事。
// 这里补上真做:把 tokens.json 改一处,薄加载器导出的 TOKEN 必须跟着变。
// 全程在**临时副本**上做,仓内真源一个字节都不碰。
// 同时给一条**反证**:同一份变异喂给一个**内联**加载器,TOKEN 必须纹丝不动 ——
// 没有这条反证,「跟着变了」可能只是巧合,断言就是恒真句。
{
  const dir = mkdtempSync(join(tmpdir(), 'tl-tokens-'));
  let thinSaw = null, inlinedSaw = null, mutated = null, key = null, err = '';
  try {
    const orig = JSON.parse(readFileSync(SELF_JSON, 'utf8'));
    key = Object.keys(orig)[0];
    mutated = ['#FAKEFAKE', '#FAKEFAKE'];
    const json = { ...orig, [key]: mutated };          // 只改一处值
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'tokens.json'), JSON.stringify(json));
    copyFileSync(join(SKILL_DIR, 'scripts', 'tokens.mjs'), join(dir, 'scripts', 'tokens.mjs'));
    // 反证对照组:形状一样但值内联的加载器(等价于「改了位置但没消掉的那份内联」)
    writeFileSync(join(dir, 'inlined.mjs'), `export const TOKEN = ${JSON.stringify(orig)};\n`);

    thinSaw = (await import(fileURL(join(dir, 'scripts', 'tokens.mjs')))).TOKEN?.[key];
    inlinedSaw = (await import(fileURL(join(dir, 'inlined.mjs')))).TOKEN?.[key];
  } catch (e) { err = e.message; } finally { rmSync(dir, { recursive: true, force: true }); }

  report('1b-薄加载器变异测试', [
    [`夹具本身跑通(${err || 'ok'})`, err === ''],
    [`外部 tokens.json 的改动(键 ${JSON.stringify(key)})反映到了 TOKEN 上(实得 ${JSON.stringify(thinSaw)})`,
      JSON.stringify(thinSaw) === JSON.stringify(mutated)],
    [`反证:同一份变异喂给内联加载器时 TOKEN 不变(实得 ${JSON.stringify(inlinedSaw)})—— 证明上一条不是恒真`,
      inlinedSaw !== undefined && JSON.stringify(inlinedSaw) !== JSON.stringify(mutated)],
    [`且反证组读到的确实是原值(实得 ${JSON.stringify(inlinedSaw)})—— 证明对照组不是靠「读不到」蒙混`,
      !!inlinedSaw],
  ]);
}


{
  const fm = (() => {
    if (!existsSync(SKILL_MD)) return null;
    const md = readFileSync(SKILL_MD, 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
    if (!m) return null;
    const out = {};
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[line.slice(0, i).trim()] = v;
    }
    return out;
  })();
  const installedExists = existsSync(INSTALLED);
  let installedSame = false, resolvesToSkill = false;
  if (installedExists) {
    try {
      installedSame = readFileSync(INSTALLED, 'utf8') === readFileSync(SKILL_MD, 'utf8');
      resolvesToSkill = realpathSync(INSTALLED).toLowerCase() === realpathSync(SKILL_MD).toLowerCase();
    } catch { /* 读不到即红 */ }
  }
  const desc = fm?.description ?? '';
  report('2-技能可被列出', [
    ['仓内 skills/engineering/timeline-show/SKILL.md 存在', existsSync(SKILL_MD)],
    [`已装到 ~/.claude/skills/timeline-show(${INSTALLED})`, installedExists],
    ['安装件与仓内 SKILL.md 同源(内容相同且 realpath 一致)', installedSame && resolvesToSkill],
    [`name === timeline-show(实得 ${fm?.name ?? '(无)'})`, fm?.name === 'timeline-show'],
    ['description 同时表达「维护台账」与「渲染全貌」两个职责',
      /台账/.test(desc) && /全貌/.test(desc)],
    ['allowed-tools 逐字为 Bash(${CLAUDE_SKILL_DIR}/scripts/tl.mjs *)',
      fm?.['allowed-tools'] === 'Bash(${CLAUDE_SKILL_DIR}/scripts/tl.mjs *)'],
    ['一个技能目录 = 一个命令名(无 commands/ 子目录)', !existsSync(join(SKILL_DIR, 'commands'))],
  ]);
}

// ── 3 阈值判据可执行:写死的 30 分钟,不是语义判断 ───────────────────────────
{
  let mod = null, err = null;
  try { mod = await import(fileURL(join(SKILL_DIR, 'scripts', 'activation.mjs'))); } catch (e) { err = e.message; }
  const open = mod?.shouldOpenLedger;
  const mid = mod?.midRunHint;
  report('3-阈值判据', [
    [`activation.mjs 可导入${err ? `(${err})` : ''}`, !!mod],
    ['阈值常量恰为 30 分钟', mod?.ACTIVATION_THRESHOLD_MIN === 30],
    ['「预计 20 分钟」不触发', open?.(20) === false],
    ['「预计 40 分钟」触发', open?.(40) === true],
    ['边界「恰好 30 分钟」不触发(> 而非 ≥)', open?.(30) === false],
    ['估不出时长(非有限值)不自动开工', open?.(NaN) === false && open?.(undefined) === false],
    ['「> 5 项」降级为中途提示(5 不提示、6 提示)', mid?.(5) === false && mid?.(6) === true],
  ]);
}

// ── 4 taste 记忆:tl taste 写、tl init 读,全局只写这一份 token ────────────────
{
  const TL = join(SKILL_DIR, 'scripts', 'tl.mjs');
  const work = mkdtempSync(join(tmpdir(), 'tl-taste-'));
  const fakeHome = join(work, 'home'); mkdirSync(fakeHome, { recursive: true });
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome };
  const runStart = (repo) => {
    execFileSync('node', [TL, 'init', '--root', repo, '--run', 't', '--title', 'x'], { env, encoding: 'utf8' });
    const ev = readFileSync(join(repo, '.taskboard', 'runs', 't', 'events.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return ev.find((e) => e.type === 'run.start')?.data ?? {};
  };
  const noTaste = runStart(join(work, 'repo0'));
  // 用 CLI 写这份记忆(不是夹具自己 writeFileSync):测的是「技能真的能把审美存下来」。
  const wrote = JSON.parse(execFileSync('node', [TL, 'taste', '--theme', 'dark', '--accent', '#123456', '--density', 'compact'], { env, encoding: 'utf8' }));
  const tasteFile = join(fakeHome, '.claude', 'taskboard-taste.json');
  const withTaste = runStart(join(work, 'repo1'));
  const partial = JSON.parse(execFileSync('node', [TL, 'taste', '--density', 'comfortable'], { env, encoding: 'utf8' }));
  report('4-taste记忆', [
    [`读不到 taste 文件时降级为默认主题(theme/accent/density 仍在 run.start 里)`, noTaste.theme === 'light' && !!noTaste.accent && !!noTaste.density],
    [`tl taste 把记忆写到 ~/.claude/taskboard-taste.json`, existsSync(tasteFile) && wrote.theme === 'dark'],
    ['tl init 读到并套用用户 token(dark / #123456 / compact)', withTaste.theme === 'dark' && withTaste.accent === '#123456' && withTaste.density === 'compact'],
    ['只覆写显式给出的字段(density 改回,theme/accent 保留)', partial.theme === 'dark' && partial.accent === '#123456' && partial.density === 'comfortable'],
  ]);
  rmSync(work, { recursive: true, force: true });
}

console.log(bad === 0 ? '全部自检通过(票 24:4 组)' : `${bad} 项未过`);
process.exit(bad === 0 ? 0 : 1);
