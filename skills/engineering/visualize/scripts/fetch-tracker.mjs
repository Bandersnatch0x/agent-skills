// 取数段(设计票 #29、实现票 08):tracker 读取与产图分离——取数在生成时固化,产图段才谈确定性。
// 用法:node fetch-tracker.mjs [--repo <owner/name>] [--map <票号>] [--out <路径>]
//   默认:本仓 + 地图 #19 + 落本目录 census.json。
// 拒绝路径:读不到即**拒绝产图**,不产部分图也不产空板;退 2 并给一句下一步。
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { argv } from 'node:process';

// 未知旗标与 --help 先处理:未知旗标一律**拒绝执行**——照跑会落出意外产物
// (实测:某个会话探 --help,因不识别而落到默认输出,在仓根落下一个未跟踪的 .html)
const KNOWN = new Set(["--repo", "--map", "--out", "--help"]);
const badFlags = argv.slice(2).filter((a) => a.startsWith('--') && !KNOWN.has(a));
if (badFlags.length || argv.includes('--help')) {
  const usage = "用法:node fetch-tracker.mjs [--repo <owner/name>] [--map <票号>] [--out <路径>]";
  if (badFlags.length) { console.error('未知旗标:' + badFlags.join(' ')); console.error(usage); process.exit(2); }
  console.log(usage); process.exit(0);
}
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const REPO = flag('--repo', 'Bandersnatch0x/agent-scaffold');
const MAP = Number(flag('--map', '19'));
const OUT = flag('--out', 'census.json');

function gh(args) {
  for (let i = 0; i < 5; i++) {
    try {
      return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 1 << 26 }));
    } catch (e) {
      const msg = String(e.message ?? '');
      // 404 / 无此仓 类错误不是瞬时故障,重试只是噪声
      const fatal = /404|Not Found|Could not resolve/i.test(msg);
      if (i === 4 || fatal) {
        throw new Error(
          `tracker 读取失败:${msg.split('\n')[0]}。` +
            '拒绝产图(不产部分图也不产空板);先确认 gh 已登录、仓库与地图票号无误,再重跑',
        );
      }
    }
  }
}

// 已关的阻塞不构成阻塞——仓外的阻塞也须**仍在开**,否则「等外部」会挂在一张早就解除阻塞的票上。
// 仓内/仓外两个阻塞面因此同用一条判据(open),只是按 repository_url 分归属,卡态才互斥。
const inRepo = (b) => (b.repository_url ?? '').includes(REPO);

function main() {
  const subs = gh(['api', `repos/${REPO}/issues/${MAP}/sub_issues?per_page=100`]);
  if (!Array.isArray(subs) || subs.length === 0) {
    throw new Error(`地图 #${MAP} 没有子票,tracker 无票况可取。拒绝产图(空板不是票况)`);
  }
  const tickets = [];
  for (const s of subs) {
    const blocked = gh(['api', `repos/${REPO}/issues/${s.number}/dependencies/blocked_by`]);
    const open = blocked.filter((b) => b.state === 'open');
    tickets.push({
      number: s.number,
      title: s.title,
      state: s.state,
      labels: (s.labels ?? []).map((l) => l.name),
      assignees: (s.assignees ?? []).map((a) => a.login),
      blockedBy: open.filter(inRepo).map((b) => b.number),
      blockedByExternal: open.some((b) => !inRepo(b)),
    });
  }
  tickets.sort((a, b) => a.number - b.number);
  // 快照时点写进**数据**:产图段不得读钟(读了就打断「同输入两跑逐字节相同」)。
  const payload = { map: MAP, snapshot: new Date().toISOString(), fetched: tickets.length, tickets };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`取数完成:${tickets.length} 张票 -> ${OUT}`);
  console.log(tickets.map((t) => `  #${t.number} ${t.state} assignees=[${t.assignees}] blockedBy=[${t.blockedBy}]`).join('\n'));
}

try {
  main();
} catch (e) {
  console.error(`${e?.message ?? e}`);
  process.exit(2);
}
