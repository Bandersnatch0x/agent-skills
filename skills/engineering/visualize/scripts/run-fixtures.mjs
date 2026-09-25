// 对抗夹具跑法(设计票 #29、实现票 08):真实票况走不到的两条路径,靠合成票况逼出来。
// 每份夹具断言两件事——退出码(该红的必须红),以及产图里该出现的形态确实出现了。
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { A, B, C, D, E, F } from './fixtures.mjs';

const DIR = import.meta.dirname;
// 夹具的临时产物落系统临时区,不落仓内(产物两分:临时产物不留工作区)——
// 实测原型曾把 fx-*.html 落在仓内,门禁的强制归类与尾换行判定随即报出。
const WORK = mkdtempSync(join(tmpdir(), 'workflow-view-fixtures-'));
// 跑法不带 --check:形态断言通过才写出文件,失败即抛(退出码 1)——所以「该红时有没有落盘」本身也是判据的一部分。
// 注意 has 的检查面分两处:过形态断言的看**产图**(HTML),被断言拦下的看**输出**(错误消息)。
const cases = [
  // [名, 票况, 期望退出码, 期望 accent 用量, 检查面, 必须出现的字样, 期望转 accent 的列(可空)]
  // 期望退出码:0 = 正常产图;2 = 形态断言/清单不过(两刀同约,失败一律退 2 且不落盘)。
  ['A-超限与阻塞', A, 0, 2, 'html', ['class="card blocked"', 'chip over', '被 #101 阻塞'], '待'],
  ['B-两列同超只转一列', B, 0, 1, 'html', ['chip over'], '进'],
  ['C-空票况', C, 2, null, 'out', ['票况为空'], null],
  ['D-有票不落列', D, 2, null, 'out', ['列集覆盖不全'], null],
  ['E-等外部态', E, 0, 0, 'html', ['class="card waiting-external"', '等仓外解锁'], null],
  ['F-双面阻塞优先', F, 0, 1, 'html', ['class="card blocked"', '被 #102 阻塞'], null],
];

let bad = 0;
for (const [name, facts, wantCode, wantAccent, face0, has, wantCol] of cases) {
  const k = name[0];
  const src = `${WORK}/fx-${k}.json`;
  const file = `${WORK}/fx-${k}.html`;
  writeFileSync(src, JSON.stringify(facts));
  try { unlinkSync(file); } catch { /* 上一轮残留会污染「没落盘」的判据 */ }
  let code = 0, out = '';
  try { out = execFileSync('node', [`${DIR}/gen-board.mjs`, src, file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { code = e.status ?? -1; out = `${e.stdout ?? ''}${e.stderr ?? ''}`; }

  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const face = face0 === 'html' ? html : out;
  const checks = [[`退出码 ${code} === ${wantCode}`, code === wantCode]];
  for (const s of has) checks.push([`${face0 === 'html' ? '产图' : '输出'}含「${s}」`, face.includes(s)]);
  if (code !== 0) checks.push(['失败即不落盘', !existsSync(file)]);
  if (wantAccent != null) {
    checks.push([`accent 用量恰为 ${wantAccent}`, out.includes(`accent 用量 ${wantAccent} ≤`)]);
  }
  if (wantCol) {
    // 超限转 accent 的列名也须对得上:B 只许「进行中」超,「待认领」不许。
    const overCol = /<div class="chead over"[\s\S]{0,80}?<span>(.)/.exec(html)?.[1];
    checks.push([`转 accent 的是「${wantCol}」列(实得「${overCol ?? '无'}」)`, overCol === wantCol]);
  }
  for (const [t, ok] of checks) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} [${name}] ${t}`); }
  try { unlinkSync(src); } catch { /* 清场失败不影响判据 */ }
}
// S:两刀共用皮肤面(#28 E2)。共享是 import,不是承诺——生成器里再出现一份代币定义,这条就该红。
{
  const gens = [`${DIR}/gen.mjs`, `${DIR}/gen-board.mjs`];
  const src = gens.map((f) => readFileSync(f, 'utf8'));
  const shared = [src.every((s) => s.includes("from './tokens.mjs'")), src.every((s) => !/const TOKEN\s*=/.test(s))];
  // 样图住在 ../references/(技能布局:运行脚本在 scripts/、样图在 references/)
  const REF = `${DIR}/../references`;
  const outs = [`${REF}/sample-static-view.html`, `${REF}/sample-dynamic-view.html`].map((f) => readFileSync(f, 'utf8'));
  const probes = [
    ['两刀都 import tokens.mjs', shared[0]],
    ['两刀都不自带代币定义', shared[1]],
    ['代币色值在两图里都生效', outs.every((h) => h.includes('#c2563f') && h.includes('--accent-tint:#f7e7e2'))],
  ];
  for (const [t, ok] of probes) { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} [S-两刀共用皮肤面] ${t}`); }
}
console.log(bad === 0 ? `全部夹具通过(${cases.length + 1} 份)` : `${bad} 项未过`);
rmSync(WORK, { recursive: true, force: true });
process.exit(bad === 0 ? 0 : 1);
