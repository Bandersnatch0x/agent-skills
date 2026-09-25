// 对抗夹具(票 #29):真实票况里没有阻塞卡、也不会超限,故造两份合成票况把这两条路径逼出来。
// 判据注释即断言意图——A 用以验「超限芯片 + 阻塞卡 = 恰用满 2 个 accent」,B 用以验「两列同时超限只许一列转 accent」。
const t = (number, title, state, assignees = [], blockedBy = [], blockedByExternal = false) =>
  ({ number, title, state, labels: [], assignees, blockedBy, blockedByExternal });

// A:待认领 5/4 超限;进行中 2 张其中一张被未关票阻塞 → accent 应为 2
export const A = {
  map: 19, fetched: 10,
  tickets: [
    t(101, '待认领一', 'open'), t(102, '待认领二', 'open'), t(103, '待认领三', 'open'),
    t(104, '待认领四', 'open'), t(105, '待认领五', 'open'),
    t(201, '进行中·被阻塞', 'open', ['u'], [101]),
    t(202, '进行中·常态', 'open', ['u']),
    t(301, '已完成一', 'closed'), t(302, '已完成二', 'closed'), t(303, '已完成三', 'closed'),
  ],
};

// B:两列同时超限(进行中超 3、待认领超 1)→ 只有最超的那一列转 accent,总用量 1
export const B = {
  map: 19, fetched: 12,
  tickets: [
    t(101, '待认领一', 'open'), t(102, '待认领二', 'open'), t(103, '待认领三', 'open'),
    t(104, '待认领四', 'open'), t(105, '待认领五', 'open'),
    t(201, '进行中一', 'open', ['u']), t(202, '进行中二', 'open', ['u']), t(203, '进行中三', 'open', ['u']),
    t(204, '进行中四', 'open', ['u']), t(205, '进行中五', 'open', ['u']), t(206, '进行中六', 'open', ['u']),
    t(301, '已完成一', 'closed'),
  ],
};

// C:取数失败留下的空票况 → 必须断言失败退 1,绝不产空板
export const C = { map: 19, fetched: 0, tickets: [] };

// E:等外部态(仓外仍有未关阻塞)→ 卡态须渲染成「等外部」而非「阻塞」,且**不吃 accent 预算**
// (仓外阻塞不是本仓能动的,拿 accent 去喊它等于把注意力烧在管不着的事上)。
export const E = {
  map: 19, fetched: 3,
  tickets: [
    t(101, '进行中·等仓外解锁', 'open', ['u'], [], true),
    t(102, '进行中·常态', 'open', ['u']),
    t(301, '已完成一', 'closed'),
  ],
};

// F:仓内阻塞与仓外阻塞同票并存 → 「阻塞」优先(仓内那半是本仓能动的,先喊它)
export const F = {
  map: 19, fetched: 2,
  tickets: [t(101, '进行中·双面阻塞', 'open', ['u'], [102], true), t(102, '进行中·常态且是别人的阻塞源', 'open', ['u'])],
};

// D:有票但不落任何列(列集覆盖不全)→ 必须断言失败,不静默丢票
export const D = { map: 19, fetched: 1, tickets: [t(401, '状态未识别的票', 'unknown')] };
