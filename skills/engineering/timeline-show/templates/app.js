// timeline-show / templates / app.js
// Engineering Long-Task Master Cockpit 逻辑核心
// 遵循零网络、无 eval、textContent 安全渲染、10s 动态脚本刷新机制
// 诚实降级：读数键缺失渲 —（U+2014），不得由 || 0 家族兜底臂伪造读数 → 故用 ?? 而非 ||

(function() {
  'use strict';

  // 页面内持久状态（不随数据自刷新重置）
  const inPageState = {
    startedAt: Date.now(),
    inPageTick: 0,
    refreshCount: 0,
    lastRefreshSuccess: null,
    activeView: 'board',
    // 账本视图：筛选与展开状态随自刷新保持（不随数据重渲染重置）
    ledgerFilter: { lane: 'all', actor: 'all', query: '', range: 'full' },
    ledgerExpanded: {},
    ledgerBound: false
  };

  // 每秒递增页面内存活计数器（ALIVE: N TICKS）
  setInterval(() => {
    inPageState.inPageTick++;
    const tickElem = document.getElementById('in-page-tick-val');
    if (tickElem) {
      tickElem.textContent = `${inPageState.inPageTick} TICK${inPageState.inPageTick === 1 ? '' : 'S'}`;
    }
  }, 1000);

  // ── 安全 DOM 构造辅助函数（严格全部走 textContent）──
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  // 诚实读数闸：夹具值非数字（或缺失）时不渲染数值型伪读数，统一以 — 占位
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

  // 票45 ⑧：无真源区块统一渲显式空态，避免空白被读成 0 / 尚未开始。
  function showEmptyState(container, text) {
    if (!container) return;
    container.textContent = '';
    container.appendChild(el('div', 'empty-state', text || '暂无真源数据'));
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, v);
      }
    }
    return node;
  }

  function createIcon(type, colorClass) {
    const svg = svgEl('svg', {
      class: 'svg-icon' + (colorClass ? ` ${colorClass}` : ''),
      viewBox: '0 0 24 24',
      width: '16',
      height: '16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });

    if (type === 'speed') {
      svg.appendChild(svgEl('path', { d: 'M12 2v4M4.93 4.93l2.83 2.83M2 12h4M12 14l4-4M19.07 4.93l-2.83 2.83M22 12h-4M6.34 17.66l-2.83 2.83M17.66 17.66l2.83 2.83' }));
    } else if (type === 'memory') {
      svg.appendChild(svgEl('rect', { x: '4', y: '4', width: '16', height: '16', rx: '2' }));
      svg.appendChild(svgEl('rect', { x: '9', y: '9', width: '6', height: '6' }));
      svg.appendChild(svgEl('line', { x1: '9', y1: '1', x2: '9', y2: '4' }));
      svg.appendChild(svgEl('line', { x1: '15', y1: '1', x2: '15', y2: '4' }));
      svg.appendChild(svgEl('line', { x1: '9', y1: '20', x2: '9', y2: '23' }));
      svg.appendChild(svgEl('line', { x1: '15', y1: '20', x2: '15', y2: '23' }));
    } else if (type === 'hub') {
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '3' }));
      svg.appendChild(svgEl('circle', { cx: '19', cy: '6', r: '2' }));
      svg.appendChild(svgEl('circle', { cx: '5', cy: '6', r: '2' }));
      svg.appendChild(svgEl('circle', { cx: '19', cy: '18', r: '2' }));
      svg.appendChild(svgEl('circle', { cx: '5', cy: '18', r: '2' }));
      svg.appendChild(svgEl('line', { x1: '14', y1: '10', x2: '17', y2: '8' }));
      svg.appendChild(svgEl('line', { x1: '10', y1: '10', x2: '7', y2: '8' }));
      svg.appendChild(svgEl('line', { x1: '14', y1: '14', x2: '17', y2: '16' }));
      svg.appendChild(svgEl('line', { x1: '10', y1: '14', x2: '7', y2: '16' }));
    } else if (type === 'verified') {
      svg.setAttribute('fill', 'currentColor');
      svg.appendChild(svgEl('path', { d: 'M12 2l2.4 2.8 3.7-.3 1.2 3.5 3.4 1.5-1.2 3.5 1.2 3.5-3.4 1.5-1.2 3.5-3.7-.3L12 22l-2.4-2.8-3.7.3-1.2-3.5-3.4-1.5 1.2-3.5-1.2-3.5 3.4-1.5 1.2-3.5 3.7.3L12 2zm-1 13.5l6-6-1.4-1.4-4.6 4.6-2.6-2.6-1.4 1.4 4 4z' }));
    } else if (type === 'clock') {
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
      svg.appendChild(svgEl('polyline', { points: '12 6 12 12 16 14' }));
    } else if (type === 'terminal') {
      svg.appendChild(svgEl('polyline', { points: '4 17 10 11 4 5' }));
      svg.appendChild(svgEl('line', { x1: '12', y1: '19', x2: '20', y2: '19' }));
    } else if (type === 'data') {
      svg.appendChild(svgEl('path', { d: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }));
      svg.appendChild(svgEl('polyline', { points: '22,6 12,13 2,6' }));
    } else {
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '8' }));
    }
    return svg;
  }

  // ── Constraint 3: localStorage 键前缀分桶 ───────────────────────────
  function getRunPrefix(runId) {
    const safe = (runId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `tl_${safe}_`;
  }

  function getStorage(key, runId) {
    try {
      return localStorage.getItem(getRunPrefix(runId) + key);
    } catch (e) {
      return null;
    }
  }

  function setStorage(key, val, runId) {
    try {
      localStorage.setItem(getRunPrefix(runId) + key, val);
    } catch (e) {}
  }

  // ── 格式化辅助 ──────────────────────────────────────────────────────
  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}小时 ${String(mins).padStart(2, '0')}分 ${String(secs).padStart(2, '0')}秒`;
    }
    return `${mins}分 ${String(secs).padStart(2, '0')}秒`;
  }

  function formatRelativeAge(isoString, nowMs) {
    if (!isoString) return '未记录时点';
    const parsed = Date.parse(isoString);
    if (isNaN(parsed)) return '无效时间戳';
    const diffSec = Math.floor((nowMs - parsed) / 1000);
    if (diffSec < 0) return '刚刚';
    if (diffSec < 5) return '刚刚';
    if (diffSec < 60) return `${diffSec}秒前`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}小时前`;
    return `${Math.floor(diffHr / 24)}天前`;
  }

  function formatStagnation(updatedAt, nowMs) {
    if (!updatedAt) return '尚无语义记录';
    const parsed = Date.parse(updatedAt);
    if (isNaN(parsed)) return '尚无语义记录';
    const diffMs = nowMs - parsed;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) {
      return '语义更新停在 1 分前';
    }
    return `语义更新停在 ${minutes} 分前`;
  }

  // ── 8 态矩阵判定 ─────────────────────────────────────────────────────
  function determineStateMatrix(state, nowMs) {
    nowMs = nowMs || Date.now();
    if (!state || typeof state !== 'object') {
      return {
        key: 'data_failed',
        title: '数据读取失败 (DATA FAILED)',
        badgeText: 'DATA FAILED',
        badgeClass: 'badge-status failed',
        bannerClass: 'state-matrix-banner failed',
        desc: '状态数据读取或解析失败，请检查 state.js 格式。',
        level: 'danger'
      };
    }

    const run = state.run || {};
    const genAt = state.generated_at || run.generated_at;

    if (!genAt || isNaN(Date.parse(genAt))) {
      return {
        key: 'clock_anomaly',
        subType: 'missing_or_invalid',
        title: '时钟异常 (CLOCK ANOMALY)',
        badgeText: 'CLOCK ANOMALY',
        badgeClass: 'badge-status clock_anomaly',
        bannerClass: 'state-matrix-banner clock_anomaly',
        desc: '数据生成时点 (generated_at) 缺失或不可解析，时钟计算失效。',
        level: 'warning'
      };
    }
    const genMs = Date.parse(genAt);
    if (nowMs < genMs - 1000) {
      return {
        key: 'clock_anomaly',
        subType: 'clock_skew_future',
        title: '时钟异常 (CLOCK ANOMALY)',
        badgeText: 'CLOCK ANOMALY',
        badgeClass: 'badge-status clock_anomaly',
        bannerClass: 'state-matrix-banner clock_anomaly',
        desc: `本地客户端时钟早于生成时间 ${Math.round((genMs - nowMs) / 1000)} 秒，检测到未来时间穿越。`,
        level: 'warning'
      };
    }

    if (run.orphan === true || run.status === 'orphan') {
      return {
        key: 'orphan',
        title: '进程孤儿 (ORPHAN)',
        badgeText: 'ORPHAN',
        badgeClass: 'badge-status orphan',
        bannerClass: 'state-matrix-banner orphan',
        desc: '检测到心跳丢失或主进程异常退出，任务已成孤儿。',
        level: 'danger'
      };
    }

    // 票 35 / 臂 3:真源 = state.stuck 中 severity 'block' 且未解除项(投影器 project() 真实产出键);
    // 不再读无生产者的旧阻塞键(真跑态不存在 → 该支路恒不触发)。
    const blockStuck = (state.stuck || []).filter((s) => s && s.severity === 'block' && !s.resolved_at);
    if (blockStuck.length > 0) {
      return {
        key: 'blocked',
        title: '执行受阻 (BLOCKED)',
        badgeText: 'BLOCKED',
        badgeClass: 'badge-status blocked',
        bannerClass: 'state-matrix-banner blocked',
        desc: `当前存在 ${blockStuck.length} 项关键阻断问题需人工介入。`,
        level: 'warning'
      };
    }

    // 工单 35 / 发现 2 防线第二层:投影层已堵源,这里再兜一次,状态非字符串也不抛。
    const st = String(run.status || '').toLowerCase();
    if (st === 'running' || st === 'in_progress') {
      return {
        key: 'running',
        title: '正在执行 (RUNNING)',
        badgeText: 'RUNNING',
        badgeClass: 'badge-status running',
        bannerClass: 'state-matrix-banner running',
        desc: '长任务各泳道健康运转中。',
        level: 'success'
      };
    }
    if (st === 'done' || st === 'success' || st === 'completed') {
      return {
        key: 'done',
        title: '已完成 (DONE)',
        badgeText: 'DONE',
        badgeClass: 'badge-status done',
        bannerClass: 'state-matrix-banner done',
        desc: '所有阶段目标已达成。',
        level: 'success'
      };
    }
    if (st === 'failed' || st === 'error') {
      return {
        key: 'failed',
        title: '失败退出 (FAILED)',
        badgeText: 'FAILED',
        badgeClass: 'badge-status failed',
        bannerClass: 'state-matrix-banner failed',
        desc: '任务执行发生严重错误已中止。',
        level: 'danger'
      };
    }

    return {
      key: 'idle',
      title: '空闲等待 (IDLE)',
      badgeText: 'IDLE',
      badgeClass: 'badge-status idle',
      bannerClass: 'state-matrix-banner idle',
      desc: '等待执行指令或数据输入。',
      level: 'info'
    };
  }

  // ── ref 前缀统一去重与标准格式化 (CRAFT-10，严禁 \\s 误写) ─────────────
  function formatRefTitle(ref, title) {
    let t = (title || '').trim();
    const token = (ref || '').trim();
    if (!token) return t;

    const bracketRegex = new RegExp(`^\\[${token}\\]\\s*`, 'i');
    if (bracketRegex.test(t)) {
      t = t.replace(bracketRegex, '');
    }

    const tokenPrefixRegex = new RegExp(`^${token}['′]*(?=[=:：–—·•.\\s\\d'′-]|$|\\b)`, 'i');
    if (tokenPrefixRegex.test(t)) {
      t = t.replace(tokenPrefixRegex, '');
    }

    t = t.replace(/^[-=:：–—·•.\s'′]+/, '').trim();

    const dm = /^[A-Z]+(\d+)$/i.exec(token);
    if (dm) {
      t = t.replace(new RegExp(`^${dm[1]}\\s+`), '').trim();
    }

    return t ? `[${token}] ${t}` : `[${token}]`;
  }

  function labelWithRef(ref, title) {
    let t = (title || '').trim();
    const token = (ref || '').trim();
    if (!token) return t;

    const bracketRegex = new RegExp(`^\\[${token}\\]\\s*`, 'i');
    if (bracketRegex.test(t)) {
      t = t.replace(bracketRegex, '');
    }

    const tokenPrefixRegex = new RegExp(`^${token}['′]*(?=[=:：–—·•.\\s\\d'′-]|$|\\b)`, 'i');
    if (tokenPrefixRegex.test(t)) {
      t = t.replace(tokenPrefixRegex, '');
    }

    t = t.replace(/^[-=:：–—·•.\s'′]+/, '').trim();

    const dm = /^[A-Z]+(\d+)$/i.exec(token);
    if (dm) {
      t = t.replace(new RegExp(`^${dm[1]}\\s+`), '').trim();
    }

    return t ? `${token} ${t}` : token;
  }

  // ── Constraint 2: 10 秒动态创建与销毁 script 标签自刷新机制 ─────────
  const REFRESH_INTERVAL_MS = 10000;
  let nextRefreshIn = REFRESH_INTERVAL_MS / 1000;

  function triggerRefresh() {
    nextRefreshIn = REFRESH_INTERVAL_MS / 1000;
    const old = document.getElementById('tl-state-script');
    if (old && old.parentNode) {
      old.parentNode.removeChild(old);
    }

    const script = document.createElement('script');
    script.id = 'tl-state-script';
    script.src = `state.js?_t=${Date.now()}`;

    script.onload = () => {
      inPageState.refreshCount++;
      inPageState.lastRefreshSuccess = Date.now();
      if (window.__TL__) {
        render(window.__TL__);
      }
    };

    script.onerror = () => {
      const fallback = document.createElement('script');
      fallback.id = 'tl-state-script';
      fallback.src = 'state.js';
      fallback.onload = () => {
        inPageState.refreshCount++;
        inPageState.lastRefreshSuccess = Date.now();
        if (window.__TL__) {
          render(window.__TL__);
        }
      };
      if (document.head) {
        document.head.appendChild(fallback);
      }
    };

    if (document.head) {
      document.head.appendChild(script);
    }
  }

  // 刷新与衰减倒计时循环
  setInterval(() => {
    // 刷新倒计时
    nextRefreshIn = Math.max(0, nextRefreshIn - 1);
    const countdownEl = document.getElementById('refresh-countdown-val');
    if (countdownEl) {
      countdownEl.textContent = `${String(nextRefreshIn).padStart(2, '0')}s`;
    }
    if (nextRefreshIn <= 0) {
      triggerRefresh();
    }

    // 默认执行衰减倒计时
    updateDecayCountdown();
  }, 1000);

  // 票 37：默认行动条（#decay-action）与衰减倒计时（#decay-countdown）取**同一条**决策
  // （首个 pending_default|pending_hold，见 pendingDefaultDecision），杜绝「X 分后执行 A」
  // 而 A 来自另一条决策。lock_at 仅作倒计时取值守卫，**不**作决策选择谓词。
  // 时间口径服从票 13：render(state) 不需要 now；剩余时间由客户端从**烘焙的 generated_at**
  // 与客户端流逝时钟派生（页内 1s setInterval 驱动），不把打印时间烘焙进 state.js。
  let decayBakedAtMs = null;   // 当前状态的烘焙 generated_at（ms）
  let decayAnchorMs = null;    // 首次观察该 generated_at 时的客户端墙钟（ms）

  // 纯取值判据：由决策的 lock_at 派生倒计时文本。
  //   {type:'time', at} → 剩余 = at − (generated_at + 客户端已流逝)；{type:'item', ref} → 「等待 <ref>」；
  //   无决策 / 无 lock_at / at 不可解析 → '—'(U+2014)。
  function decayCountdownText(focus, generatedAtMs, elapsedMs) {
    const lock = focus && focus.lock_at;
    if (!lock || typeof lock !== 'object') return '—';
    if (lock.type === 'item') return lock.ref ? `等待 ${lock.ref}` : '—';
    if (lock.type === 'time') {
      const atMs = Date.parse(lock.at ?? '');
      if (!Number.isFinite(atMs) || !Number.isFinite(generatedAtMs)) return '—';
      const remainingSec = (atMs - (generatedAtMs + (Number.isFinite(elapsedMs) ? elapsedMs : 0))) / 1000;
      return Number.isFinite(remainingSec) ? formatDuration(remainingSec) : '—';
    }
    return '—';
  }

  function updateDecayCountdown() {
    const st = cachedState || {};
    const generatedAtMs = Date.parse(st.generated_at || (st.run && st.run.generated_at) || '');
    const nowWall = Date.now();
    if (Number.isFinite(generatedAtMs)) {
      if (generatedAtMs !== decayBakedAtMs) { decayBakedAtMs = generatedAtMs; decayAnchorMs = nowWall; }
    } else {
      decayBakedAtMs = null; decayAnchorMs = null;
    }
    const elapsedMs = Number.isFinite(decayAnchorMs) ? Math.max(0, nowWall - decayAnchorMs) : 0;
    const text = decayCountdownText(pendingDefaultDecision(st), generatedAtMs, elapsedMs);

    // 真源节点：行动条倒计时与决策视图 AUTO-DEFAULT TIMEOUT 同源同值
    const decayEl = document.getElementById('decay-countdown');
    if (decayEl) decayEl.textContent = text;
    const timeoutEl = document.getElementById('decisions-timeout-countdown');
    if (timeoutEl) timeoutEl.textContent = text;
    // 无真源节点：override 入侵者与决策视图 decay 句式，诚实渲 '—'
    ['decisions-override-countdown', 'decisions-decay-countdown'].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.textContent = '—';
    });
  }

  // ── 4 大视图路由与导航切换 ──────────────────────────────────────────
  function applyActiveView(viewName) {
    const validViews = ['board', 'decisions', 'journey', 'ledger'];
    const target = validViews.includes(viewName) ? viewName : 'board';
    inPageState.activeView = target;

    // 侧栏 nav 项状态高亮
    const navItems = document.querySelectorAll('.nav-deck .nav-item');
    navItems.forEach(btn => {
      const p = btn.getAttribute('data-path');
      if (p === target) {
        btn.classList.add('active');
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.classList.remove('active');
        btn.removeAttribute('aria-current');
      }
    });

    // 视图面板显隐切换
    validViews.forEach(v => {
      const panel = document.getElementById(`view-${v}`);
      if (panel) {
        if (v === target) {
          panel.style.display = 'block';
          panel.setAttribute('data-primary', 'true');
        } else {
          panel.style.display = 'none';
          panel.removeAttribute('data-primary');
        }
      }
    });
  }

  function initNavDeck() {
    const navItems = document.querySelectorAll('.nav-deck .nav-item');
    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-path');
        if (p) {
          applyActiveView(p);
          window.location.hash = p;
        }
      });
    });

    window.addEventListener('hashchange', () => {
      const h = (window.location.hash || '').replace(/^#/, '').toLowerCase();
      applyActiveView(h);
    });

    const initialHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    applyActiveView(initialHash);
  }

  // ── 渲染主要区块 ────────────────────────────────────────────────────
  let cachedState = null;

  function render(state) {
    if (!state) return;
    cachedState = state;

    const run = state.run || {};

    // 1. Header 状态与运行标示
    const runStatusEl = document.getElementById('run-status');
    if (runStatusEl) {
      runStatusEl.textContent = String(run.status || 'RUNNING').toUpperCase();
    }

    // 2. 侧栏待复核决策项徽章（A6: 决策导航徽章数 = state.decisions 中真实待办态(pending_default|pending_hold)的数量）
    const navDecisionsBadge = document.getElementById('nav-badge-decisions');
    if (navDecisionsBadge) {
      const pendingDecisions = (state.decisions || []).filter(d => d.status === 'pending_default' || d.status === 'pending_hold');
      navDecisionsBadge.textContent = `${pendingDecisions.length} 待复核`;
    }

    // 3. 阻塞告警横幅（Blocker Banner，有则显示，无则隐藏）
    //    票 35 / 臂 3:真源 = state.stuck 中 severity 'block' 且未解除项;字段逐一映射
    //    blockedBy 项的 {id,what,item,needs}(投影器 project() 真实产出),不再读无生产者的旧阻塞键,
    //    也不再回落任何静态伪造串（真跑态无该数据源）。
    const blockerBanner = document.getElementById('blocker-banner');
    if (blockerBanner) {
      const blockedBy = (state.stuck || []).filter((s) => s && s.severity === 'block' && !s.resolved_at);
      if (blockedBy.length > 0) {
        blockerBanner.style.display = 'block';
        const s = blockedBy[0];
        const codeEl = document.getElementById('blocker-code');
        const targetEl = document.getElementById('blocker-target');
        const titleEl = document.getElementById('blocker-title');
        const stratEl = document.getElementById('blocker-strategy');
        const retryEl = document.getElementById('retry-timer');

        if (codeEl) codeEl.textContent = s.id || '—';
        if (targetEl) targetEl.textContent = s.item || '—';
        if (titleEl) titleEl.textContent = s.what || '—';
        if (stratEl) stratEl.textContent = s.needs || '—';
        // retry 无真源（投影器不产）→ 诚实渲 '—'（与 WO46b 对该节点的处置一致）。
        if (retryEl) retryEl.textContent = '—';
      } else {
        blockerBanner.style.display = 'none';
        // 票 35:无阻断 → 逐一清掉上一次填写值与源内静态假串，标题位写诚实空态「无阻塞」。
        // 保留子节点（不整块 textContent 覆盖），否则后续渲染有阻断时取不到节点、无法复显。
        const codeEl = document.getElementById('blocker-code');
        const targetEl = document.getElementById('blocker-target');
        const titleEl = document.getElementById('blocker-title');
        const stratEl = document.getElementById('blocker-strategy');
        const retryEl = document.getElementById('retry-timer');
        if (codeEl) codeEl.textContent = '—';
        if (targetEl) targetEl.textContent = '—';
        if (titleEl) titleEl.textContent = '无阻塞';
        if (stratEl) stratEl.textContent = '—';
        if (retryEl) retryEl.textContent = '—';
      }
    }

    // 4. 默认行动条 (AUTONOMOUS TRAJECTORY) 与共识队列（A4）
    //    行动文案取自 decisions[] 中「待默认」项(pending_default/pending_hold)的 default 选项 label；
    //    无待默认项 / 无 default 选项 / 无 label → 诚实降级 '—'（不再读无生产者的 state.attention）。
    const decayActionEl = document.getElementById('decay-action');
    if (decayActionEl) {
      decayActionEl.textContent = pendingDefaultLabel(state);
    }
    updateDecayCountdown();

    const consensusCountLabel = document.getElementById('consensus-count-label');
    const consensusTitle = document.getElementById('consensus-title');
    const pendingDecisions = (state.decisions || []).filter(d => d.status === 'pending_default' || d.status === 'pending_hold');
    if (consensusCountLabel) {
      consensusCountLabel.textContent = `${pendingDecisions.length} PENDING`;
    }
    // 票 35 / 臂 1:无条件写「首个决策 id: title」，无决策则 '—'（不再受 length>0 守卫，
    // 避免真跑无 decisions 时静态假串 'DEC-142: …' 直送用户）。
    if (consensusTitle) {
      const firstDec = (state.decisions || [])[0];
      consensusTitle.textContent = firstDec ? `${firstDec.id}: ${firstDec.title}` : '—';
    }

    // 5. 4 张 KPI 卡片（A2: 大数字与 state.kpis[].value 一一对应）
    const kpisStrip = document.getElementById('kpis-strip');
    if (kpisStrip && Array.isArray(state.kpis) && state.kpis.length > 0) {
      kpisStrip.textContent = '';
      state.kpis.forEach(kpi => {
        const card = el('div', 'kpi-card');
        card.setAttribute('data-kpi-id', kpi.id || '');

        const head = el('div', 'kpi-card-head');
        const label = el('span', 'kpi-label', kpi.label || '');
        head.appendChild(label);
        head.appendChild(createIcon(kpi.id, kpi.accent === 'primary' ? 'icon-primary' : (kpi.accent === 'secondary' ? 'icon-secondary' : '')));
        card.appendChild(head);

        const valRow = el('div', 'kpi-val-row');
        const valNum = el(
          'span',
          'kpi-val-number' + (kpi.accent === 'primary' ? ' icon-primary' : (kpi.accent === 'secondary' ? ' icon-secondary' : '')),
          kpi.value || ''
        );
        valRow.appendChild(valNum);

        if (kpi.sub) {
          const sub = el('span', 'kpi-sub', kpi.sub);
          valRow.appendChild(sub);
        }
        card.appendChild(valRow);

        const track = el('div', 'kpi-track');
        const fill = el('div', 'kpi-fill' + (kpi.accent === 'secondary' ? ' fill-secondary' : ''));
        fill.style.width = `${kpi.pct !== undefined ? kpi.pct : 80}%`;
        track.appendChild(fill);
        card.appendChild(track);

        kpisStrip.appendChild(card);
      });
    } else if (kpisStrip) {
      // 票45 ⑧：真跑态无 state.kpis 生产者 → 显式空态，不静默留白
      showEmptyState(kpisStrip, '暂无真源数据');
    }

    // 6. 三列执行看板 (A3: 卡片集合 = state.items 按 lane 分组)
    const items = state.items || [];
    const todoItems = items.filter(i => i.lane === 'todo');
    const doingItems = items.filter(i => i.lane === 'doing');
    const doneItems = items.filter(i => i.lane === 'done');

    const badgeTodo = document.getElementById('badge-todo');
    const badgeDoing = document.getElementById('badge-doing');
    const badgeDone = document.getElementById('badge-done');

    if (badgeTodo) badgeTodo.textContent = `${todoItems.length} ITEM${todoItems.length === 1 ? '' : 'S'}`;
    if (badgeDoing) badgeDoing.textContent = `${doingItems.length} ACTIVE`;
    if (badgeDone) {
      // 票45 ①：审计数由 item.review 真源计算；无复核真源时不谎报通过率。
      const hasReviewSource = doneItems.some(i => i && i.review && typeof i.review.state === 'string');
      const auditedDone = doneItems.filter(i => i && i.review && i.review.state === 'ok').length;
      badgeDone.textContent = hasReviewSource
        ? `${doneItems.length} DONE // ${auditedDone} AUDITED`
        : `${doneItems.length} DONE`;
    }

    // 6b. 首屏结论摘要（票47 Phase2：进度 / 阻塞 / 等待我 三格，置于看板最上）
    //     阻塞状态固定占锚点，不随有无阻塞改变阅读锚点：
    //     有 block-stuck → 阻塞中；真源 stuck 数组存在且无 block → 无阻塞；无该真源 → 未提供（诚实）。
    const summaryProgress = document.getElementById('board-summary-progress');
    if (summaryProgress) {
      summaryProgress.textContent = items.length > 0 ? `${doneItems.length} / ${items.length} 完成` : '—';
    }
    const blockerAnchor = document.getElementById('blocker-anchor');
    const summaryBlocker = document.getElementById('board-summary-blocker');
    if (summaryBlocker) {
      const blockedList = (state.stuck || []).filter((s) => s && s.severity === 'block' && !s.resolved_at);
      if (blockedList.length > 0) {
        if (blockerAnchor) blockerAnchor.setAttribute('data-blocker-state', 'blocked');
        summaryBlocker.textContent = `阻塞中：${blockedList[0].what || '—'}`;
      } else if (Array.isArray(state.stuck)) {
        if (blockerAnchor) blockerAnchor.setAttribute('data-blocker-state', 'none');
        summaryBlocker.textContent = '无阻塞';
      } else {
        if (blockerAnchor) blockerAnchor.setAttribute('data-blocker-state', 'unknown');
        summaryBlocker.textContent = '阻塞状态未提供';
      }
    }
    const summaryWaiting = document.getElementById('board-summary-waiting');
    if (summaryWaiting) {
      const waiting = (state.decisions || []).filter(d => d.status === 'pending_default' || d.status === 'pending_hold');
      summaryWaiting.textContent = waiting.length > 0
        ? `${waiting.length} 项待答复：${waiting[0].title || waiting[0].id || '—'}`
        : '无待答复';
    }

    function renderLaneStack(containerId, list, laneName) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.textContent = '';

      list.forEach(item => {
        const card = el('div', 'kanban-card');
        card.id = `card-${item.id}`;
        card.setAttribute('data-item-id', item.id);
        card.setAttribute('data-lane', laneName);

        const top = el('div', 'card-top');
        const idSpan = el('span', 'card-id' + (laneName === 'done' ? ' id-secondary' : ''), `#${item.id}`);
        top.appendChild(idSpan);

        // 票 35：origin 真源（project()）是对象 {type,ref,summary}，夹具是字符串；两者都要认，
        // 否则真跑态 item.origin.toUpperCase() 抛错、整页渲染中断（下方 metaRight 亦用 originType）。
        const originType = typeof item.origin === 'string' ? item.origin : (item.origin && item.origin.type) || '';
        let tagText = '预置声明 // PRESET';
        if (originType === 'discovered') tagText = '突发衍生 // EMERGENT';
        if (laneName === 'done') tagText = 'COMPLETED';
        if (item.marks && item.marks.includes('blocked')) tagText = 'BLOCKED 阻塞警告';
        const tagSpan = el('span', 'card-tag', tagText);
        top.appendChild(tagSpan);
        card.appendChild(top);

        const title = el('h3', 'card-title', item.title || '');
        card.appendChild(title);

        const metaRow = el('div', 'card-meta-row');
        const metaLeft = el('div', 'meta-item-left');
        metaLeft.appendChild(createIcon('clock'));
        const estSpan = el('span', '', item.est ? `EST ${item.est}` : `ROUNDS: ${item.rounds ?? '—'}`);
        metaLeft.appendChild(estSpan);
        metaRow.appendChild(metaLeft);

        const metaRight = el('div', 'meta-item-right', item.meta || (originType ? originType.toUpperCase() : ''));
        metaRow.appendChild(metaRight);
        card.appendChild(metaRow);

        container.appendChild(card);
      });
    }

    renderLaneStack('lane-cards-todo', todoItems, 'todo');
    renderLaneStack('lane-cards-doing', doingItems, 'doing');
    renderLaneStack('lane-cards-done', doneItems, 'done');

    // 7. 交付物书架 (Latest Artifacts Shelf)
    //    票 39：真源 = items[].evidence.artifacts（跨项扁平），形状 {title, path, summary}（scripts/project.mjs
    //    对 artifact 事件的唯一产出）。投影器从不产顶层 artifacts 键，旧守卫读它恒假，致 shelf 结构性
    //    渲空；旧 id/commit/sha/bytes 分支亦无任何生产者，一并删除。无真源即零行（诚实空态）。
    const artifactsList = document.getElementById('artifacts-list');
    if (artifactsList) {
      artifactsList.textContent = '';
      const flatArtifacts = [];
      (state.items || []).forEach(it => {
        const list = (it.evidence && it.evidence.artifacts) || [];
        list.forEach(a => flatArtifacts.push({ itemId: it.id, title: a.title, path: a.path, summary: a.summary }));
      });
      flatArtifacts.forEach(art => {
        const row = el('div', 'artifact-row');
        row.setAttribute('data-artifact-item', art.itemId || '');

        const left = el('div', 'artifact-left');
        left.appendChild(createIcon('terminal', 'icon-primary'));

        const info = el('div', 'artifact-info');
        // path 是复制按钮目标、亦最适 monospace 主标签槽（path 缺失时回落 title）
        const pathSpan = el('span', 'artifact-path', art.path || art.title || '');
        // title/summary 为人类可读描述 → 次标签槽（原 meta 槽承载 commit/sha 描述，语义同为副注）
        const metaParts = [];
        if (art.title && art.title !== (art.path || '')) metaParts.push(art.title);
        if (art.summary) metaParts.push(art.summary);
        const metaSpan = el('span', 'artifact-meta', metaParts.join(' • '));
        info.appendChild(pathSpan);
        info.appendChild(metaSpan);
        left.appendChild(info);
        row.appendChild(left);

        const actions = el('div', 'artifact-actions');
        const copyBtn = el('button', 'btn-artifact-copy', '复制路径');
        copyBtn.type = 'button';
        copyBtn.addEventListener('click', () => copyArtifactPath(art.path, copyBtn));
        actions.appendChild(copyBtn);
        row.appendChild(actions);

        artifactsList.appendChild(row);
      });
    }

    // 8. 安全底座 (Security Substrate)
    //    票 35 / 臂 1:真跑态投影器不产 state.security → 移出守卫无条件写；无真源即 '—'，
    //    不得回落 'ARMED // L3' 等伪造串。票 38 R7:两页静态串亦已改 '—'（源码层由 check.mjs 看守）。
    const sec = state.security || {};
    const enclaveStatus = document.getElementById('security-enclave-status');
    const enclaveDesc = document.getElementById('security-enclave-desc');
    const pageFaults = document.getElementById('security-page-faults');
    const entropyPool = document.getElementById('security-entropy-pool');

    if (enclaveStatus) enclaveStatus.textContent = sec.enclave || '—';
    if (enclaveDesc) enclaveDesc.textContent = sec.enclave_desc || '—';
    if (pageFaults) pageFaults.textContent = sec.page_faults || '—';
    if (entropyPool) entropyPool.textContent = sec.entropy_pool || '—';

    // 9. 底部遥测状态条 (Footer)
    //    票 35 / 臂 1:同上去守卫无条件写；臂 2:telemetry-protocol 装饰品牌串整块删（无写者）。
    const tel = state.telemetry || {};
    const kernelEl = document.getElementById('telemetry-kernel');
    const latencyEl = document.getElementById('telemetry-latency');
    const astDepthEl = document.getElementById('telemetry-ast-depth');
    const sessionIdEl = document.getElementById('telemetry-session-id');

    if (kernelEl) kernelEl.textContent = tel.kernel || '—';
    if (latencyEl) latencyEl.textContent = tel.latency || '—';
    if (astDepthEl) astDepthEl.textContent = tel.ast_depth || '—';
    if (sessionIdEl) sessionIdEl.textContent = tel.session_id || '—';

    // 10. 决策视图 (Decisions) 全量渲染
    renderDecisions(state);

    // 11. 旅途视图 (Journey) 全量渲染
    renderJourney(state);

    // 11b. 旅途时空视图模式与深度功能 (功能 1/2/3/4/6/7)
    renderJourneyModes(state);

    // 12. 账本视图 (Ledger) 全量渲染
    renderLedger(state);
  }

  // ── 旅途视图：Continuum Pipeline 渲染 ──────────────────────────────
  const PIPELINE_STATUS_CLASSES = ['settled', 'current', 'awaiting', 'queued'];
  const LOG_LEVEL_CLASSES = ['info', 'check', 'exec', 'sync', 'warn', 'ok'];

  function journeySvg(size) {
    return svgEl('svg', {
      class: 'svg-icon',
      viewBox: '0 0 24 24',
      width: String(size),
      height: String(size),
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });
  }

  function markerGlyph(status) {
    const svg = journeySvg(18);
    if (status === 'current') {
      svg.appendChild(svgEl('path', { d: 'M13 2 3 14h7l-1 8 10-12h-7z', fill: 'currentColor', stroke: 'none' }));
    } else if (status === 'settled') {
      svg.appendChild(svgEl('polyline', { points: '20 6 9 17 4 12' }));
    } else if (status === 'awaiting') {
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '3', fill: 'currentColor', stroke: 'none' }));
    } else {
      // queued：Pruning Checkpoint 十字准星
      svg.appendChild(svgEl('line', { x1: '12', y1: '4', x2: '12', y2: '8' }));
      svg.appendChild(svgEl('line', { x1: '12', y1: '16', x2: '12', y2: '20' }));
      svg.appendChild(svgEl('line', { x1: '4', y1: '12', x2: '8', y2: '12' }));
      svg.appendChild(svgEl('line', { x1: '16', y1: '12', x2: '20', y2: '12' }));
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '2' }));
    }
    return svg;
  }

  function stageKickerGlyph(accent) {
    const svg = journeySvg(14);
    if (accent === 'secondary') {
      svg.appendChild(svgEl('polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' }));
    } else if (accent === 'tertiary') {
      svg.appendChild(svgEl('path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }));
      svg.appendChild(svgEl('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }));
    } else {
      svg.appendChild(svgEl('path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z' }));
      svg.appendChild(svgEl('line', { x1: '4', y1: '22', x2: '4', y2: '15' }));
    }
    return svg;
  }

  // 复制路径：clipboard API 可用则用；file:// 下 navigator.clipboard 未定义 → textarea + execCommand 兜底；
  // 三条路径（可用 / 不可用 / 写入失败）都给明确反馈，绝不静默。
  function copyArtifactPath(p, btn) {
    const reset = () => setTimeout(() => { btn.textContent = '复制路径'; }, 1500);
    const done = (ok) => { btn.textContent = ok ? '已复制' : '复制失败'; reset(); };
    const legacyCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = String(p || '');
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    };
    if (!p) { done(false); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(p).then(() => done(true)).catch(() => done(legacyCopy()));
      return;
    }
    done(legacyCopy());
  }

  function formatImpactValue(field, value) {
    if (value === undefined || value === null) return '未记录';
    if (field === 'sunk_min') {
      return typeof value === 'number' ? `${value} 分钟` : '未记录';
    }
    const arr = Array.isArray(value) ? value : [String(value)];
    if (arr.length === 0) {
      if (field === 'redo') return '无返工';
      if (field === 'enable') return '无解锁项';
      if (field === 'disable') return '无排除分支';
      if (field === 'affected_todo') return '无牵动项';
      return '—';
    }
    return arr.join(' / ');
  }

  function renderJourney(state) {
    const telemetry = state.telemetry || {};

    // 页头
    // 票 35 / 臂 1:无条件写；真跑态无 telemetry.strand → '—'，不回落静态假串 'STRAND-616-ALPHA'。
    const strandEl = document.getElementById('journey-strand');
    if (strandEl) strandEl.textContent = telemetry.strand || '—';
    const epochEl = document.getElementById('journey-epoch-ticks');
    if (epochEl) epochEl.textContent = `EPOCH TICKS: ${telemetry.epoch_ticks !== undefined ? telemetry.epoch_ticks : '—'}`;

    // 三段状态卡
    const stagesWrap = document.getElementById('journey-stages');
    if (stagesWrap && Array.isArray(state.stages) && state.stages.length > 0) {
      stagesWrap.textContent = '';
      state.stages.forEach((stage, idx) => {
        const accent = stage.accent || 'primary';
        const card = el('div', `stage-card accent-${accent}`);
        card.setAttribute('data-stage-index', String(idx));
        card.appendChild(el('div', 'stage-accent-bar'));

        const top = el('div', 'stage-card-top');
        const headRow = el('div', 'stage-head-row');
        const kicker = el('span', 'stage-kicker');
        const kickerIcon = stageKickerGlyph(accent);
        kickerIcon.setAttribute('class', `svg-icon icon-${accent === 'primary' ? 'primary' : (accent === 'secondary' ? 'secondary' : 'tertiary')}`);
        kicker.appendChild(kickerIcon);
        kicker.appendChild(el('span', '', stage.kicker || ''));
        headRow.appendChild(kicker);

        const badge = el('span', 'stage-badge', stage.badge || '');
        badge.id = `journey-stage-badge-${idx}`;
        headRow.appendChild(badge);
        top.appendChild(headRow);

        const nameBox = el('div', '');
        nameBox.appendChild(el('h3', 'stage-name', stage.name || ''));
        if (stage.desc) nameBox.appendChild(el('p', 'stage-desc', stage.desc));
        top.appendChild(nameBox);
        card.appendChild(top);

        const foot = el('div', 'stage-card-foot');

        if (idx === 0) {
          const pctKnown = isNum(stage.progress_pct);
          const pct = pctKnown ? stage.progress_pct : null;
          const progRow = el('div', 'stage-progress-row');
          progRow.appendChild(el('span', '', 'PIPELINE PROGRESS'));
          const progVal = el('span', 'stage-progress-val', pctKnown ? `${pct}%` : '—');
          progVal.id = 'journey-stage-progress-val';
          progRow.appendChild(progVal);
          foot.appendChild(progRow);

          const bar = el('div', 'stage-bar');
          const fill = el('div', 'stage-bar-fill');
          // 诚实降级：键位于 → 真实宽度；键缺失 → 不留宽度（避免「零进度」观感），
          // 由 .is-unknown 呈现中性「无读数」，与文本臂的 '—' 一致
          fill.style.width = pctKnown ? `${pct}%` : '';
          if (!pctKnown) fill.classList.add('is-unknown');
          bar.appendChild(fill);
          foot.appendChild(bar);

          foot.appendChild(buildStageInlineRow('当前步耗时', stage.elapsed || '—', ''));
        } else if (idx === 1) {
          foot.appendChild(buildStageKvRow('WORKER THREADS', `${stage.workers_active ?? '—'} ACTIVE / ${stage.workers_stalled ?? '—'} STALLED`, 'val-secondary'));
          foot.appendChild(buildStageInlineRow('锁冲突检测', stage.lock_conflicts ?? '— Deadlocks', ''));
        } else {
          foot.appendChild(buildStageKvRow('DECISION TIMEOUT', `${stage.timeout ?? '—'} REMAINING`, 'val-tertiary'));
          foot.appendChild(buildStageKvRow('AUTO ACTION', stage.auto_action || '—', 'val-primary'));
          foot.appendChild(buildStageInlineRow(stage.auto_label || 'DEFAULT SAFE', stage.auto_name || stage.gate_target || '—', ''));
        }

        card.appendChild(foot);
        stagesWrap.appendChild(card);
      });
    } else if (stagesWrap) {
      // 票45 ⑧：真跑态无 state.stages 生产者 → 显式空态，不静默留白
      showEmptyState(stagesWrap, '暂无真源数据');
    }

    function buildStageKvRow(label, val, valClass) {
      const row = el('div', 'stage-kv-row');
      row.appendChild(el('span', 'stage-kv-label', label));
      const valEl = el('span', `stage-kv-val${valClass ? ' ' + valClass : ''}`, val);
      row.appendChild(valEl);
      return row;
    }

    function buildStageInlineRow(label, val, valClass) {
      const row = el('div', 'stage-inline-row');
      row.appendChild(el('span', 'stage-inline-label', label));
      const valEl = el('span', `stage-inline-val${valClass ? ' ' + valClass : ''}`, val);
      row.appendChild(valEl);
      return row;
    }

    // 主轨迹通道节点
    const pipeline = Array.isArray(state.pipeline) ? state.pipeline : [];
    const nodesWrap = document.getElementById('journey-pipeline-nodes');
    if (nodesWrap) {
      nodesWrap.textContent = '';
      pipeline.forEach(node => {
        const status = PIPELINE_STATUS_CLASSES.includes(node.status) ? node.status : 'queued';
        const nodeEl = el('div', `pipeline-node ${status}`);
        nodeEl.setAttribute('data-status', status);
        nodeEl.setAttribute('data-node-seq', String(node.seq));

        const marker = el('div', 'node-marker');
        const glyph = el('span', 'node-glyph');
        glyph.appendChild(markerGlyph(status));
        marker.appendChild(glyph);
        nodeEl.appendChild(marker);

        nodeEl.appendChild(el('span', 'node-window', node.window || ''));

        const seqLabel = String(node.seq).padStart(2, '0');
        nodeEl.appendChild(el('span', 'node-name', `#${seqLabel} ${node.name || ''}`));
        nodeEl.appendChild(el('span', 'node-status-tag', status.toUpperCase()));

        nodesWrap.appendChild(nodeEl);
      });
      if (pipeline.length === 0) {
        // 票45 ⑧：真跑态无 state.pipeline 生产者 → 显式空态，不静默留白
        showEmptyState(nodesWrap, '暂无真源数据');
      }
    }

    const progressEl = document.getElementById('journey-pipeline-progress');
    if (progressEl) {
      const n = pipeline.length;
      let activeIdx = pipeline.findIndex(node => node.status === 'current');
      if (activeIdx < 0) {
        activeIdx = pipeline.map(node => node.status).lastIndexOf('settled');
      }
      if (n > 1 && activeIdx >= 0) {
        const startPct = 100 / (2 * n);
        const endPct = (100 * (activeIdx + 0.5)) / n;
        progressEl.style.width = `${Math.max(0, endPct - startPct)}%`;
      } else {
        progressEl.style.width = '0%';
      }
    }

    // 当前活跃聚焦执行摘要
    const focus = state.focus || {};
    const focusPid = document.getElementById('journey-focus-pid');
    if (focusPid) focusPid.textContent = `PID: ${focus.pid !== undefined ? focus.pid : '--'}`;
    const focusWrap = document.getElementById('journey-focus-metrics');
    if (focusWrap) {
      if (focus && Object.keys(focus).length > 0) {
        focusWrap.textContent = '';
        const metrics = [
          { label: 'ACTIVE WORKERS', value: focus.workers, cls: '' },
          { label: 'AST SUBTREES PARSED', value: focus.ast_subtrees, cls: 'val-secondary' },
          { label: 'INVARIANTS DRIFT', value: focus.invariants_drift, cls: 'val-primary' }
        ];
        metrics.forEach(m => {
          const box = el('div', 'focus-metric');
          box.appendChild(el('span', 'focus-metric-label', m.label));
          box.appendChild(el('span', `focus-metric-val${m.cls ? ' ' + m.cls : ''}`, m.value || '—'));
          focusWrap.appendChild(box);
        });
      } else {
        // 票45 ⑧：真跑态无 state.focus 生产者 → 显式空态，不渲三格占位符
        showEmptyState(focusWrap, '暂无真源数据');
      }
    }

    // 日志流
    const logs = Array.isArray(state.logs) ? state.logs : [];
    const logWrap = document.getElementById('journey-log-stream');
    if (logWrap) {
      logWrap.textContent = '';
      logs.forEach(entry => {
        const line = el('div', 'log-line');
        line.setAttribute('data-level', entry.level || '');
        line.appendChild(el('span', 'log-time', `[${entry.t || '--:--:--'}]`));
        const level = String(entry.level || 'INFO').toLowerCase();
        const levelCls = LOG_LEVEL_CLASSES.includes(level) ? level : 'info';
        line.appendChild(el('span', `log-level level-${levelCls}`, entry.level || 'INFO'));
        line.appendChild(el('span', 'log-msg', entry.msg || ''));
        logWrap.appendChild(line);
      });
      if (logs.length === 0) {
        // 票45 ⑧：真跑态无 state.logs 生产者 → 显式空态，不静默留白
        showEmptyState(logWrap, '暂无真源数据');
      }
    }

    // 节点详情抽屉 (INSPECTOR)：绑定当前活跃节点
    const items = Array.isArray(state.items) ? state.items : [];
    const activeNode = pipeline.find(node => node.status === 'current') || pipeline[0] || {};
    const activeStatus = PIPELINE_STATUS_CLASSES.includes(activeNode.status) ? activeNode.status : 'queued';
    const inspected = items.find(i => i.id === activeNode.item_ref) || {};

    const nodeTitleEl = document.getElementById('inspector-node-title');
    if (nodeTitleEl) {
      const seqLabel = activeNode.seq ? String(activeNode.seq).padStart(2, '0') : '--';
      nodeTitleEl.textContent = `#NO${seqLabel} ${activeNode.name || ''}`.trim();
    }
    const nodeStatusEl = document.getElementById('inspector-node-status');
    if (nodeStatusEl) {
      const statusLabels = { settled: 'SETTLED', current: 'RUNNING', awaiting: 'AWAITING', queued: 'QUEUED' };
      nodeStatusEl.textContent = statusLabels[activeStatus] || 'IDLE';
    }
    const targetEl = document.getElementById('inspector-target');
    if (targetEl) targetEl.textContent = `TARGET: ${inspected.target || '--'}`;
    const tokensEl = document.getElementById('inspector-tokens');
    if (tokensEl) tokensEl.textContent = inspected.tokens ?? '— Tokens';
    const executorEl = document.getElementById('inspector-executor');
    if (executorEl) executorEl.textContent = inspected.executor || '--';
    const elapsedEl = document.getElementById('inspector-elapsed');
    if (elapsedEl) elapsedEl.textContent = inspected.elapsed || '—';
    const proofEl = document.getElementById('inspector-proof');
    if (proofEl) proofEl.textContent = inspected.proof || '--';
    const fingerprintEl = document.getElementById('inspector-fingerprint');
    if (fingerprintEl) fingerprintEl.textContent = inspected.fingerprint || '--';

    // 影响评估矩阵 (IMPACT MATRIX) ← 真投影器 ripple（唯一判据 decisionRipple()）
    // 真形状 = decision.effective.ripple || options[].impact.ripple = { items:{redo,enable,disable,affected_todo}, sunk_min, ... }
    const impactWrap = document.getElementById('journey-impact-matrix');
    if (impactWrap) {
      impactWrap.textContent = '';
      const decisions = Array.isArray(state.decisions) ? state.decisions : [];
      const ripple = decisionRipple(decisions[0]);
      const rippleItems = (ripple && ripple.items) || {};
      const cells = [
        { field: 'redo', label: '返工范围 (Redo)', value: rippleItems.redo },
        { field: 'enable', label: '启用/解锁 (Enable)', value: rippleItems.enable },
        { field: 'disable', label: '停用/排除 (Disable)', value: rippleItems.disable },
        { field: 'affected_todo', label: '牵动未启动 (Affected)', value: rippleItems.affected_todo },
        { field: 'sunk_min', label: '沉没耗时 (Sunk)', value: ripple ? ripple.sunk_min : undefined }
      ];
      cells.forEach(cellDef => {
        const raw = cellDef.value;
        const cell = el('div', 'impact-cell');
        cell.setAttribute('data-impact-field', cellDef.field);
        cell.setAttribute('data-impact-value', JSON.stringify(raw !== undefined ? raw : null));
        cell.appendChild(el('span', 'impact-cell-label', cellDef.label));
        cell.appendChild(el('span', 'impact-cell-val', formatImpactValue(cellDef.field, raw)));
        impactWrap.appendChild(cell);
      });
    }

    // 自动化验证检查与时空遥测
    // 票 43：真源 = items[].evidence.checks（跨项扁平）。投影器 project.mjs:444 在项内产
    // {id,name,src,result,exit,dur_s,at}，从不产顶层 state.checks；票 36 曾判诚实空态，
    // 票 43 改判「有真源、页面读错键」→ 改读真源键（照票 39 items[].evidence.artifacts 手法）。
    const checks = [];
    items.forEach(it => {
      const list = (it && it.evidence && Array.isArray(it.evidence.checks)) ? it.evidence.checks : [];
      list.forEach(c => checks.push(Object.assign({ item_ref: it.id }, c)));
    });
    const tbody = document.getElementById('journey-telemetry-body');
    if (tbody) {
      tbody.textContent = '';
      checks.forEach(check => {
        const tr = el('tr', '');
        tr.setAttribute('data-check-id', check.id || '');
        tr.setAttribute('data-check-src', check.src || '');

        tr.appendChild(el('td', 'telemetry-cmd', check.name || ''));
        tr.appendChild(el('td', '', check.item_ref || ''));
        const exitTd = el('td', '');
        const exitVal = check.exit;
        if (isNum(exitVal)) {
          exitTd.appendChild(el('span', `exit-pill${exitVal === 0 ? '' : ' exit-fail'}`, `${exitVal} ${exitVal === 0 ? 'SUCCESS' : 'FAILED'}`));
        } else {
          exitTd.appendChild(el('span', 'exit-pill', '—'));
        }
        tr.appendChild(exitTd);
        tr.appendChild(el('td', '', isNum(check.dur_s) ? `${check.dur_s}s` : '—'));
        tr.appendChild(el('td', '', check.at || '—'));

        tbody.appendChild(tr);
      });
    }

    const judgeableExits = checks.filter(c => isNum(c.exit));
    const invariantsEl = document.getElementById('journey-invariants-pass');
    if (invariantsEl) {
      if (judgeableExits.length === 0) {
        invariantsEl.textContent = `—/${checks.length} INVARIANTS PASS`;
      } else {
        const passCount = judgeableExits.filter(c => c.exit === 0).length;
        invariantsEl.textContent = `${passCount}/${checks.length} INVARIANTS PASS`;
      }
    }

    const summaryWrap = document.getElementById('journey-telemetry-summary');
    if (summaryWrap) {
      summaryWrap.textContent = '';
      const cellsWrap = el('div', 'summary-cells');
      const summaryCells = [
        { label: 'BRANCH ROOT', value: telemetry.branch_root, cls: 'val-primary' },
        { label: 'CHECKPOINTS', value: telemetry.checkpoints, cls: '' },
        { label: 'CONTINUITY', value: telemetry.continuity, cls: 'val-secondary' },
        { label: 'MAX DRIFT', value: telemetry.max_drift, cls: '' }
      ];
      summaryCells.forEach(c => {
        const box = el('div', 'summary-cell');
        box.appendChild(el('span', 'summary-cell-label', c.label));
        box.appendChild(el('span', `summary-cell-val${c.cls ? ' ' + c.cls : ''}`, c.value || '—'));
        cellsWrap.appendChild(box);
      });
      summaryWrap.appendChild(cellsWrap);

      const syncWrap = el('div', 'summary-sync');
      syncWrap.appendChild(el('span', '', 'SYNC: 10s Heartbeat Loop'));
      syncWrap.appendChild(el('span', 'summary-sync-dot'));
      summaryWrap.appendChild(syncWrap);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 旅途视图 · 时空视图模式 (功能 5) 与深度功能 (1/2/3/4/6/7)
  // ══════════════════════════════════════════════════════════════════════

  const JOURNEY_MODES = ['universe', 'timeline', 'atlas', 'branches'];
  const LANE_ORDER = ['user', 'claude', 'subagent', 'tool'];
  const LANE_Y = { user: 56, claude: 116, subagent: 176, tool: 236 };
  const LANE_LABEL = { user: '用户 // USER', claude: '主代理 // CLAUDE', subagent: '子代理 // SUBAGENT', tool: '工具 // TOOL' };
  const AXIS_START_X = 120;
  const AXIS_STEP_X = 74;
  const AXIS_HEIGHT = 300;
  const NODE_GLYPH = 22;
  const NODE_LABEL_MAX_WIDTH = 128;
  const CHUNK_THRESHOLD = 200;
  const CHUNK_VISIBLE = 80;
  const REPLAY_BASE_INTERVAL_MS = 700;

  // 功能 6 · 唯一判据：分离度谓词与阈值——全局只此一处，所有断言/边界探针共用
  const SEPARATION_MIN = 0.20;
  function isSeparated(a, b) {
    const base = (b === undefined || b === null) ? 0 : b;
    return Math.abs(a - base) > SEPARATION_MIN;
  }
  const NODE_FILL = { hold: 0, default: 0.5, confirm: 1.0 };
  const NODE_SYMBOL_ID = { hold: 'tl-n-hold', default: 'tl-n-default', confirm: 'tl-n-confirm' };
  const DECIDED_TYPES = { decide: 'hold', hold: 'hold', default: 'default', confirm: 'confirm', lock: 'confirm', override: 'confirm' };
  function nodeDecisionState(type) {
    return DECIDED_TYPES[String(type || '')] || 'default';
  }

  // 功能 3 · 空档折叠阈值（运行时可覆写 window.__TL_APP__.GAP_FOLD_THRESHOLD_MS）
  const DEFAULT_GAP_FOLD_THRESHOLD_MS = 15 * 60 * 1000;
  function gapFoldThresholdMs() {
    const app = window.__TL_APP__;
    const v = app ? app.GAP_FOLD_THRESHOLD_MS : undefined;
    return (typeof v === 'number' && v > 0) ? v : DEFAULT_GAP_FOLD_THRESHOLD_MS;
  }
  // 唯一折叠判据：严格大于阈值（不是 >=）
  function shouldFoldGap(gapMs, thresholdMs) {
    const th = (typeof thresholdMs === 'number') ? thresholdMs : gapFoldThresholdMs();
    return gapMs > th;
  }

  // 功能 2 · 分支修剪判据（唯一一处）：从 activity[].type 推导，不依赖夹具私有字段
  function isPrunedEv(ev) {
    return String((ev && ev.type) || '').indexOf('branch.prune') === 0;
  }
  // 被修剪分支的生命周期区间（按周期配对）：每个 branch.fork 与其后最近的 branch.prune 配成一个 {ref,from,to}
  // 同一 ref 可有多轮 fork/prune；成员判定 = 落在任一区间内（prune 通知本身恒归入，
  // 周期之间的存活事件不得归入）
  function prunedRefIntervals(events) {
    const byRef = {};
    (Array.isArray(events) ? events : []).forEach(e => {
      if (!e || e.ref === undefined || e.ref === null) return;
      const s = Number(e.seq);
      if (!Number.isFinite(s)) return;
      const r = String(e.ref);
      (byRef[r] || (byRef[r] = [])).push({ s, e });
    });
    const intervals = [];
    Object.keys(byRef).forEach(r => {
      let openFork = null;
      byRef[r].slice().sort((a, b) => a.s - b.s).forEach(({ s, e }) => {
        if (String(e.type || '').indexOf('branch.fork') === 0) {
          if (openFork === null) openFork = s;
        } else if (isPrunedEv(e)) {
          intervals.push({ ref: r, from: (openFork === null) ? s : openFork, to: s });
          openFork = null;
        }
      });
    });
    return intervals;
  }
  // 分支归属：修剪通知本身，或落在任一 [fork.seq, prune.seq] 周期区间内的同 ref 事件
  function isPrunedBranchEv(ev, intervals) {
    if (!ev) return false;
    if (isPrunedEv(ev)) return true;
    const r = (ev.ref === undefined || ev.ref === null) ? '' : String(ev.ref);
    const s = Number(ev.seq);
    if (!Number.isFinite(s)) return false;
    return (Array.isArray(intervals) ? intervals : []).some(v => v.ref === r && s >= v.from && s <= v.to);
  }

  function getActorY(actor, type) {
    const a = String(actor || '').toLowerCase();
    if (a === 'user' || a === 'human') return LANE_Y.user;
    if (a === 'claude' || a === 'main' || a === 'orchestrator') return LANE_Y.claude;
    if (a === 'subagent' || a === 'sub' || a === 'worker') return LANE_Y.subagent;
    if (a === 'tool' || a === 'env') return LANE_Y.tool;
    const t = String(type || '');
    if (t === 'decide' || t === 'confirm' || t === 'override' || t === 'hold') return LANE_Y.user;
    if (t === 'redo' || t === 'branch.fork') return LANE_Y.subagent;
    if (t.indexOf('artifact') === 0 || t === 'check' || t === 'ok' || t === 'flag' || t === 'stuck') return LANE_Y.tool;
    return LANE_Y.claude;
  }

  let journeyMode = 'universe';
  let replayIndex = -1;       // -1 表示未初始化（默认全显）
  let replaySpeed = 1;
  let replayTimer = null;
  let activitySignature = null;

  function prepareActivity(state) {
    const raw = (Array.isArray(state.activity) ? state.activity : []).slice();
    raw.sort((a, b) => {
      const ta = Date.parse(a.t);
      const tb = Date.parse(b.t);
      if (ta !== tb) return ta - tb;
      return String(a.seq).localeCompare(String(b.seq));
    });
    const total = raw.length;
    const sig = total + ':' + (total ? String(raw[0].t) + ':' + String(raw[total - 1].t) : '');
    if (sig !== activitySignature) { activitySignature = sig; replayIndex = -1; }
    const foldedCount = total > CHUNK_THRESHOLD ? total - CHUNK_VISIBLE : 0;
    return { events: raw, total, foldedCount };
  }

  // 功能 6 · 内联 SVG <defs>：三种方盾符号（空心虚线 / 半填充 / 实心）
  const SHIELD_PATH = 'M5 3 H19 V14 L12 21.5 L5 14 Z';
  function buildNodeDefs() {
    const defs = svgEl('defs', {});
    const mk = (id, body) => {
      const sym = svgEl('symbol', { id, viewBox: '0 0 24 24' });
      body(sym);
      defs.appendChild(sym);
    };
    mk('tl-n-hold', (sym) => {
      sym.appendChild(svgEl('path', { d: SHIELD_PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-dasharray': '3 2.5' }));
    });
    mk('tl-n-default', (sym) => {
      sym.appendChild(svgEl('path', { d: SHIELD_PATH, fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }));
      const clip = svgEl('clipPath', { id: 'tl-clip-half' });
      clip.appendChild(svgEl('path', { d: SHIELD_PATH }));
      sym.appendChild(clip);
      sym.appendChild(svgEl('rect', { x: '5', y: '3', width: '7', height: '19', fill: 'currentColor', 'clip-path': 'url(#tl-clip-half)' }));
    });
    mk('tl-n-confirm', (sym) => {
      sym.appendChild(svgEl('path', { d: SHIELD_PATH, fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '2' }));
    });
    return defs;
  }

  function segmentIntersectsBox(x1, y1, x2, y2, bx, by, bw, bh) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    if (maxX < bx || minX > bx + bw || maxY < by || minY > by + bh) return false;
    const ccw = (ax, ay, bx2, by2, cx, cy) => (cy - ay) * (bx2 - ax) > (by2 - ay) * (cx - ax);
    const seg = (ax, ay, bx2, by2, cx, cy, dx, dy) =>
      ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx2, by2, cx, cy, dx, dy) &&
      ccw(ax, ay, bx2, by2, cx, cy) !== ccw(ax, ay, bx2, by2, dx, dy);
    if (seg(x1, y1, x2, y2, bx, by, bx + bw, by)) return true;
    if (seg(x1, y1, x2, y2, bx, by + bh, bx + bw, by + bh)) return true;
    if (seg(x1, y1, x2, y2, bx, by, bx, by + bh)) return true;
    if (seg(x1, y1, x2, y2, bx + bw, by, bx + bw, by + bh)) return true;
    return false;
  }
  function boxesIntersect(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function labelCandidates(y, x) {
    if (y === LANE_Y.user) return [{ x, y: 32 }, { x, y: 16 }, { x: x + 34, y: 32 }, { x: x - 34, y: 16 }];
    if (y === LANE_Y.tool) return [{ x, y: 262 }, { x, y: 278 }, { x: x + 34, y: 262 }, { x: x - 34, y: 278 }];
    return [
      { x, y: y - 18 }, { x, y: y + 24 },
      { x: x + 42, y: y - 22 }, { x: x - 42, y: y + 26 },
      { x: x + 46, y: y + 26 }, { x: x - 46, y: y - 22 },
      { x, y: 32 }, { x, y: 262 }
    ];
  }

  function renderActivityCanvas(state) {
    const svg = document.getElementById('journey-svg-container');
    if (!svg) return null;
    const { events, total, foldedCount } = prepareActivity(state);
    const rendered = events.slice(foldedCount);
    const step = AXIS_STEP_X;
    const width = Math.max(1200, AXIS_START_X + Math.max(1, rendered.length) * step + 80);
    svg.setAttribute('viewBox', `0 0 ${width} ${AXIS_HEIGHT}`);
    svg.textContent = '';
    svg.appendChild(buildNodeDefs());

    // 泳道基准线 + 泳道标签
    LANE_ORDER.forEach((lane) => {
      const y = LANE_Y[lane];
      svg.appendChild(svgEl('line', { x1: String(AXIS_START_X - 70), y1: String(y), x2: String(width - 30), y2: String(y), stroke: 'var(--outline-variant)', 'stroke-width': '1' }));
      const t = svgEl('text', { x: '10', y: String(y + 4), class: 'journey-lane-label' });
      t.textContent = LANE_LABEL[lane];
      svg.appendChild(t);
    });

    // 布局：节点坐标 + 主轴段
    const PRUNED_LANE_Y = 268;
    const refIntervals = prunedRefIntervals(events);
    const isPrunedAt = (ev) => isPrunedBranchEv(ev, refIntervals);
    const placed = rendered.map((ev, i) => {
      const absIdx = foldedCount + i;
      return { ev, absIdx, x: AXIS_START_X + i * step, y: isPrunedAt(ev) ? PRUNED_LANE_Y : getActorY(ev.actor, ev.type) };
    });
    const mainPoints = placed.filter(p => !isPrunedAt(p.ev));
    const prunedPoints = placed.filter(p => isPrunedAt(p.ev));

    // 主轴折线（参考几何 + 可见轴）；空档折叠段以断续线覆盖
    const polyPts = mainPoints.map(p => `${p.x},${p.y}`).join(' ');
    const poly = svgEl('polyline', { id: 'journey-main-polyline', points: polyPts, fill: 'none', stroke: 'var(--primary-container)', 'stroke-width': '2' });
    svg.appendChild(poly);

    // 功能 2 · 被修剪支线：从最近的前序主节点以虚线引出并标注「被修剪」
    prunedPoints.forEach((pp) => {
      let anchor = null;
      mainPoints.forEach((mp) => { if (mp.x <= pp.x && (!anchor || mp.x > anchor.x)) anchor = mp; });
      if (!anchor) anchor = { x: AXIS_START_X - 60, y: LANE_Y.claude };
      const midY = anchor.y + (pp.y - anchor.y) / 2;
      const d = `M ${anchor.x} ${anchor.y} L ${anchor.x} ${midY} L ${pp.x} ${midY} L ${pp.x} ${pp.y}`;
      svg.appendChild(svgEl('path', { d, class: 'branch-pruned-line' }));
      const tag = svgEl('text', { x: String(pp.x), y: String(pp.y + 14), 'text-anchor': 'middle', class: 'pruned-tag' });
      tag.textContent = '被修剪';
      svg.appendChild(tag);
    });

    // 空档折叠（功能 3）：相邻主事件时间差 > 阈值
    for (let i = 0; i < mainPoints.length - 1; i++) {
      const a = mainPoints[i], b = mainPoints[i + 1];
      const gapMs = Date.parse(b.ev.t) - Date.parse(a.ev.t);
      if (!shouldFoldGap(gapMs)) continue;
      svg.appendChild(svgEl('line', { x1: String(a.x), y1: String(a.y), x2: String(b.x), y2: String(b.y), stroke: 'var(--surface)', 'stroke-width': '4', class: 'gap-fold-mask' }));
      svg.appendChild(svgEl('line', { x1: String(a.x), y1: String(a.y), x2: String(b.x), y2: String(b.y), stroke: 'var(--outline)', 'stroke-width': '2', 'stroke-dasharray': '5 4', class: 'gap-fold-dash' }));
      const mins = Math.round(gapMs / 60000);
      const thMins = Math.round(gapFoldThresholdMs() / 60000);
      const midX = (a.x + b.x) / 2;
      const lbl = svgEl('text', { x: String(midX), y: String(Math.min(a.y, b.y) - 14), class: 'gap-fold-label', 'text-anchor': 'middle' });
      lbl.textContent = `空档折叠 ${mins}分 (${thMins}m阈值)`;
      svg.appendChild(lbl);
    }

    // 标签避让后放置节点
    const placedBoxes = [];
    placed.forEach((p) => {
      const state3 = nodeDecisionState(p.ev.type);
      const symId = NODE_SYMBOL_ID[state3];
      const grp = svgEl('g', {
        class: 'journey-node' + (isPrunedAt(p.ev) ? ' is-pruned' : ''),
        'data-seq': String(p.ev.seq),
        'data-idx': String(p.absIdx),
        'data-type': String(p.ev.type || ''),
        'data-actor': String(p.ev.actor || ''),
        'data-decision-state': state3,
        'data-fill': String(NODE_FILL[state3])
      });
      const use = svgEl('use', {
        href: '#' + symId,
        x: String(p.x - NODE_GLYPH / 2),
        y: String(p.y - NODE_GLYPH / 2),
        width: String(NODE_GLYPH),
        height: String(NODE_GLYPH),
        class: 'journey-node-symbol sym-' + state3
      });
      grp.appendChild(use);

      // 点击打开影响面抽屉（功能 7）
      const hit = svgEl('circle', { cx: String(p.x), cy: String(p.y), r: '16', class: 'journey-node-hit', fill: 'transparent' });
      grp.appendChild(hit);
      grp.addEventListener('click', () => openImpactDrawer(state, p.ev));

      // 标签避让：先测量真实文本宽度（getComputedTextLength），再做候选位择优
      const label = p.ev.title || `${p.ev.type} ${p.ev.ref || ''}`;
      const txt = svgEl('text', { x: '0', y: '0', 'text-anchor': 'middle', class: 'journey-node-label' });
      txt.textContent = label;
      grp.appendChild(txt);
      grp.style.cursor = 'pointer';
      svg.appendChild(grp);

      const w = Math.min(NODE_LABEL_MAX_WIDTH, Math.max(44, txt.getComputedTextLength() + 8));
      const h = 13;
      const segs = [];
      for (let i = 0; i < mainPoints.length - 1; i++) {
        segs.push({ x1: mainPoints[i].x, y1: mainPoints[i].y, x2: mainPoints[i + 1].x, y2: mainPoints[i + 1].y });
      }
      const candidates = labelCandidates(p.y, p.x);
      let chosen = null;
      for (const c of candidates) {
        const box = { x: c.x - w / 2, y: c.y - 9, w, h };
        if (segs.some(sg => segmentIntersectsBox(sg.x1, sg.y1, sg.x2, sg.y2, box.x, box.y, box.w, box.h))) continue;
        if (placedBoxes.some(pb => boxesIntersect(box, pb))) continue;
        chosen = { c, box };
        break;
      }
      if (!chosen) {
        const c = candidates[0];
        chosen = { c, box: { x: c.x - w / 2, y: c.y - 9, w, h } };
      }
      placedBoxes.push(chosen.box);
      txt.setAttribute('x', String(chosen.c.x));
      txt.setAttribute('y', String(chosen.c.y));
    });

    applyReplayVisibility(svg);
    return { events, total, foldedCount, width };
  }

  function applyReplayVisibility(svgArg) {
    const svg = svgArg || document.getElementById('journey-svg-container');
    if (!svg) return;
    const nodes = Array.from(svg.querySelectorAll('.journey-node'));
    if (replayIndex < 0) {
      // 票47 Phase2 / pi P1-3：默认只突出「当前（最近）节点 + 最近 3 个 + 阻塞/决策节点」，
      //   其余以 is-hidden 折叠；**不删 DOM 节点** → P4-4 节点计数不变。
      //   拖动回放 scrubber 时走下方 limit 分支（scrubber 语义不被破坏）。
      const total = nodes.length;
      nodes.forEach((g) => {
        const idx = Number(g.getAttribute('data-idx'));
        const type = String(g.getAttribute('data-type') || '');
        const isRecent = idx >= total - 3;
        const isKey = /decision|decide|stuck|block|resolution|prune|fork/i.test(type);
        g.classList.toggle('is-hidden', !(isRecent || isKey));
      });
      return;
    }
    const limit = replayIndex;
    nodes.forEach((g) => {
      const idx = Number(g.getAttribute('data-idx'));
      g.classList.toggle('is-hidden', idx >= limit);
    });
  }

  // 功能 1 · 回放控制器
  function updateReplayControls(meta) {
    const scrub = document.getElementById('replay-scrubber');
    const pos = document.getElementById('replay-position');
    const total = meta ? meta.total : 0;
    if (scrub) {
      scrub.max = String(total);
      const val = replayIndex < 0 ? total : replayIndex;
      scrub.value = String(val);
    }
    if (pos) pos.textContent = `${replayIndex < 0 ? total : replayIndex} / ${total}`;
    const playBtn = document.getElementById('btn-replay-play');
    if (playBtn) playBtn.textContent = replayTimer ? '暂停' : '播放';
  }

  function setReplayIndex(idx, meta) {
    const m = meta || cachedActivityMeta || { total: 0 };
    const total = m.total;
    replayIndex = Math.max(0, Math.min(total, idx));
    applyReplayVisibility();
    updateReplayControls(m);
  }

  function stopReplay() {
    if (replayTimer) { clearInterval(replayTimer); replayTimer = null; }
    const playBtn = document.getElementById('btn-replay-play');
    if (playBtn) playBtn.textContent = '播放';
  }

  function toggleReplay() {
    if (replayTimer) { stopReplay(); updateReplayControls(cachedActivityMeta); return; }
    const meta = cachedActivityMeta || { total: 0 };
    if (replayIndex >= meta.total) replayIndex = 0;
    replayTimer = setInterval(() => {
      const m = cachedActivityMeta || { total: 0 };
      const next = (replayIndex < 0 ? 0 : replayIndex) + 1;
      if (next > m.total) { stopReplay(); return; }
      replayIndex = next;
      applyReplayVisibility();
      updateReplayControls(m);
    }, Math.max(60, Math.round(REPLAY_BASE_INTERVAL_MS / replaySpeed)));
    updateReplayControls(cachedActivityMeta);
  }

  let cachedActivityMeta = null;

  // 功能 4 · 大事件流分块渲染
  function renderChunkBanner(meta) {
    const banner = document.getElementById('journey-chunk-banner');
    const metaEl = document.getElementById('journey-canvas-meta');
    if (metaEl) {
      // 票47 Phase2 / pi P1-3：默认折叠的历史节点显式标注 「+N events」，不留读者从折线形状自行推断
      const svg = document.getElementById('journey-svg-container');
      const hiddenByDefault = (svg && replayIndex < 0) ? svg.querySelectorAll('.journey-node.is-hidden').length : 0;
      const foldNote = hiddenByDefault > 0 ? ` · 默认隐藏 ${hiddenByDefault}（+${hiddenByDefault} events）` : '';
      metaEl.textContent = `${meta.total} 事件 / ${meta.foldedCount} 折叠${foldNote}`;
    }
    if (!banner) return;
    if (meta.foldedCount > 0) {
      banner.style.display = 'block';
      banner.textContent = `当前已累积 ${meta.total} 项事件，为保持流畅已折叠早期 ${meta.foldedCount} 项历史事件`;
    } else {
      banner.style.display = 'none';
      banner.textContent = '';
    }
  }

  // 功能 6 · Atlas 拓扑：节点 + 边（由 activity 序号 + branch 派生）
  function renderAtlas(state) {
    const panel = document.getElementById('journey-atlas-svg');
    const legend = document.getElementById('journey-atlas-legend');
    const metaEl = document.getElementById('journey-atlas-meta');
    if (!panel) return;
    const { events } = prepareActivity(state);
    const nodes = events;
    const width = Math.max(1200, 120 + nodes.length * 58);
    const height = 320;
    panel.setAttribute('viewBox', `0 0 ${width} ${height}`);
    panel.textContent = '';
    panel.appendChild(buildNodeDefs());
    if (metaEl) metaEl.textContent = `${nodes.length} 节点 / ${Math.max(0, nodes.length - 1)} 边`;

    if (legend) {
      legend.textContent = '';
      [['hold', '未决 (空心虚线)'], ['default', '默认接管 (半填充)'], ['confirm', '已决 (实心)']].forEach(([k, txt]) => {
        const box = el('span', 'atlas-legend-item');
        const s = svgEl('svg', { class: 'atlas-legend-glyph sym-' + k, viewBox: '0 0 24 24', width: '16', height: '16' });
        s.appendChild(svgEl('use', { href: '#' + NODE_SYMBOL_ID[k], width: '24', height: '24' }));
        box.appendChild(s);
        box.appendChild(el('span', '', txt));
        legend.appendChild(box);
      });
    }

    const atlasIntervals = prunedRefIntervals(nodes);
    const mainNodes = nodes.filter(n => !isPrunedBranchEv(n, atlasIntervals));
    const yOf = (i) => 60 + ((i % 3) - 1) * 0 + 90; // 单排主轴
    const pts = nodes.map((n, i) => ({ n, x: 80 + i * 58, y: isPrunedBranchEv(n, atlasIntervals) ? 250 : 110 }));
    // 边
    for (let i = 0; i < mainNodes.length - 1; i++) {
      const a = pts[nodes.indexOf(mainNodes[i])], b = pts[nodes.indexOf(mainNodes[i + 1])];
      panel.appendChild(svgEl('line', { x1: String(a.x), y1: String(a.y), x2: String(b.x), y2: String(b.y), stroke: 'var(--secondary)', 'stroke-width': '2', class: 'atlas-edge' }));
    }
    pts.forEach((p) => {
      const st = nodeDecisionState(p.n.type);
      const grp = svgEl('g', { class: 'atlas-node', 'data-seq': String(p.n.seq), 'data-decision-state': st });
      grp.appendChild(svgEl('use', { href: '#' + NODE_SYMBOL_ID[st], x: String(p.x - 11), y: String(p.y - 11), width: '22', height: '22', class: 'journey-node-symbol sym-' + st }));
      const lbl = svgEl('text', { x: String(p.x), y: String(p.y + 26), 'text-anchor': 'middle', class: 'atlas-node-label' });
      lbl.textContent = p.n.ref || String(p.n.seq);
      grp.appendChild(lbl);
      grp.addEventListener('click', () => openImpactDrawer(state, p.n));
      grp.style.cursor = 'pointer';
      panel.appendChild(grp);
    });
    void yOf;
  }

  // 功能 2 · Branches 分支沙盒（当前采纳主分支 vs 被修剪历史分支）
  function renderBranches(state) {
    const { events } = prepareActivity(state);
    const branchIntervals = prunedRefIntervals(events);
    // 左栏 = 采纳中的主分支；右栏 = 被修剪分支的生命周期区间（fork→prune 内的同 ref 事件）
    const pruned = events.filter(e => isPrunedBranchEv(e, branchIntervals));
    const main = events.filter(e => !isPrunedBranchEv(e, branchIntervals));
    const metaEl = document.getElementById('journey-branches-meta');
    if (metaEl) metaEl.textContent = `${main.length} 主分支 / ${pruned.length} 修剪分支`;

    const fill = (containerId, list, prunedCol) => {
      const c = document.getElementById(containerId);
      if (!c) return;
      c.textContent = '';
      list.forEach((e) => {
        const row = el('div', 'branch-row' + (prunedCol ? ' is-pruned' : ''));
        row.setAttribute('data-seq', String(e.seq));
        const head = el('div', 'branch-row-head');
        head.appendChild(el('span', 'branch-ref', e.ref || String(e.seq)));
        head.appendChild(el('span', 'branch-type', String(e.type || '')));
        row.appendChild(head);
        row.appendChild(el('span', 'branch-title', e.title || `${e.type} ${e.ref || e.seq}`));
        if (prunedCol) row.appendChild(el('span', 'branch-pruned-tag', '被修剪'));
        c.appendChild(row);
      });
    };
    fill('branch-list-main', main, false);
    fill('branch-list-pruned', pruned, true);
  }

  // 功能 7 · 影响面快照抽屉
  // 真投影器 ripple 的唯一取值判据:已作答看 decision.effective.ripple,未作答看默认选项的
  // options[].impact.ripple(形状见 scripts/project.mjs 的 rippleOf)。
  function decisionRipple(decision) {
    if (!decision) return null;
    if (decision.effective && decision.effective.ripple) return decision.effective.ripple;
    const options = Array.isArray(decision.options) ? decision.options : [];
    const def = options.find(o => o.default);
    return (def && def.impact && def.impact.ripple) || null;
  }

  function openImpactDrawer(state, ev) {
    const drawer = document.getElementById('impact-drawer');
    if (!drawer) return;
    const decisions = Array.isArray(state.decisions) ? state.decisions : [];
    const decision = decisions.find(d => d.id === ev.ref) || {};
    const ripple = decisionRipple(decision);
    const rippleItems = (ripple && ripple.items) || {};
    const titleEl = document.getElementById('drawer-title');
    if (titleEl) titleEl.textContent = `影响面快照 · ${ev.ref || ev.seq} ${ev.title || ''}`;

    const left = document.getElementById('drawer-estimated');
    if (left) {
      left.textContent = '';
      // 真路径 ripple.items.* / ripple.sunk_min;缺字段如实显示「未记录」，不回落到扁平诱饵
      const fields = [
        ['redo', '若选 / 返工 (REDO)', () => rippleItems.redo],
        ['enable', '启用 / 解锁 (ENABLE)', () => rippleItems.enable],
        ['disable', '停用 / 排除 (DISABLE)', () => rippleItems.disable],
        ['affected_todo', '牵动的未启动项 (AFFECTED)', () => rippleItems.affected_todo],
        ['sunk_min', '沉没耗时 (SUNK)', () => (ripple ? ripple.sunk_min : undefined)]
      ];
      fields.forEach(([field, label, fromRipple]) => {
        const value = fromRipple();
        const row = el('div', 'drawer-metric');
        row.setAttribute('data-field', field);
        row.appendChild(el('span', 'drawer-metric-label', label));
        row.appendChild(el('span', 'drawer-metric-val', formatImpactValue(field, value)));
        left.appendChild(row);
      });
    }

    const right = document.getElementById('drawer-actual');
    if (right) {
      right.textContent = '';
      // 真数据无 decision.actual:影响面置信度 / 实际重做项 / 返工耗时 均由真字段派生
      const items = Array.isArray(state.items) ? state.items : [];
      const superseded = items.filter(i => i.outcome === 'superseded');
      const confidence = (ripple && ripple.confidence) ? ripple.confidence : 'unknown';
      // 任一 superseded 项 active_seconds 缺失/非数就不求和：旧 `|| 0` 会把「未记录」谎报成「实测 0 分钟」
      const supersededSecs = superseded.map(i => i.active_seconds);
      const secsAllKnown = supersededSecs.length > 0 && supersededSecs.every(Number.isFinite);
      const actualMin = secsAllKnown ? Math.round(supersededSecs.reduce((s, v) => s + v, 0) / 60) : null;
      const actualRows = [
        ['confidence', '影响面置信度 (CONFIDENCE)', confidence],
        ['actual_redo', '实际重做项 (ACTUAL REDO)', superseded.length ? superseded.map(i => i.id).join(' / ') : '本 run 未记录实际偏差'],
        ['redo_min', '返工耗时 (REDO MIN)', (ripple && typeof ripple.redo_est_min === 'number')
          ? `预估 ${ripple.redo_est_min} 分钟 / 实测 ${actualMin === null ? '—' : `${actualMin} 分钟`}`
          : '本 run 未记录实际偏差']
      ];
      actualRows.forEach(([field, label, value]) => {
        const row = el('div', 'drawer-metric drawer-metric-actual');
        row.setAttribute('data-field', field);
        row.appendChild(el('span', 'drawer-metric-label', label));
        row.appendChild(el('span', 'drawer-metric-val', value));
        right.appendChild(row);
      });
    }

    const note = document.getElementById('drawer-note');
    if (note) note.textContent = '估算偏差如实显示，不改写成「准确」。';
    drawer.style.display = 'block';
    drawer.setAttribute('data-ref', String(ev.ref || ev.seq || ''));
  }

  function closeImpactDrawer() {
    const drawer = document.getElementById('impact-drawer');
    if (drawer) drawer.style.display = 'none';
  }

  function renderJourneyModes(state) {
    const meta = renderActivityCanvas(state);
    cachedActivityMeta = meta ? { total: meta.total, foldedCount: meta.foldedCount } : { total: 0, foldedCount: 0 };
    if (meta) {
      renderChunkBanner(meta);
      updateReplayControls(cachedActivityMeta);
    }
    renderAtlas(state);
    renderBranches(state);
  }

  function switchJourneyMode(mode) {
    if (JOURNEY_MODES.indexOf(mode) === -1) return;
    journeyMode = mode;
    const view = document.getElementById('view-journey');
    if (view) view.setAttribute('data-jmode', mode);
    Array.from(document.querySelectorAll('#journey-mode-bar .btn-mode')).forEach((btn) => {
      const on = btn.getAttribute('data-mode') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (cachedState) renderJourneyModes(cachedState);
  }

  function initJourneyModes() {
    Array.from(document.querySelectorAll('#journey-mode-bar .btn-mode')).forEach((btn) => {
      btn.addEventListener('click', () => switchJourneyMode(btn.getAttribute('data-mode')));
    });
    const play = document.getElementById('btn-replay-play');
    if (play) play.addEventListener('click', toggleReplay);
    const prev = document.getElementById('btn-replay-prev');
    if (prev) prev.addEventListener('click', () => { stopReplay(); setReplayIndex((replayIndex < 0 ? (cachedActivityMeta ? cachedActivityMeta.total : 0) : replayIndex) - 1); });
    const next = document.getElementById('btn-replay-next');
    if (next) next.addEventListener('click', () => { stopReplay(); setReplayIndex((replayIndex < 0 ? (cachedActivityMeta ? cachedActivityMeta.total : 0) : replayIndex) + 1); });
    const scrub = document.getElementById('replay-scrubber');
    if (scrub) scrub.addEventListener('input', () => { stopReplay(); setReplayIndex(Number(scrub.value)); });
    Array.from(document.querySelectorAll('.replay-speed .btn-speed')).forEach((btn) => {
      btn.addEventListener('click', () => {
        replaySpeed = Number(btn.getAttribute('data-speed')) || 1;
        Array.from(document.querySelectorAll('.replay-speed .btn-speed')).forEach(b => b.classList.toggle('is-active', b === btn));
        if (replayTimer) { stopReplay(); toggleReplay(); }
      });
    });
    const closeBtn = document.getElementById('btn-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', closeImpactDrawer);
    // 初始模式
    switchJourneyMode(journeyMode);
  }

  // ── 决策视图：仲裁控制台渲染 ────────────────────────────────────────
  function formatClock(offsetSec) {
    // 诚实降级：键缺失/非数 → 既有静态占位形态 "--:--:--"（与 timeline.html 的
    // CREATED: T+--:--:-- 一致），不得回落 0 谎报「创建于 T+0」
    if (!isNum(offsetSec)) return '--:--:--';
    const s = Math.max(0, Math.floor(offsetSec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  // 入参 = 真投影器产出的 queue.review[].score（票 32）；函数名沿用「等级」语义。
  function attentionLevel(score) {
    // 诚实降级：score 键缺失（非有限数）→ 中性等级，不得由伪造 0 派生 NOMINAL/STABLE
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return { text: '—', cls: 'level-unknown', action: '—' };
    }
    if (score >= 5) return { text: 'CRITICAL', cls: 'level-critical', action: 'JUMP TO GATE' };
    if (score >= 3) return { text: 'ELEVATED', cls: 'level-elevated', action: 'JUMP TO GATE' };
    if (score >= 2) return { text: 'DEFERRED', cls: 'level-deferred', action: 'AUTOPILOT HOLD' };
    return { text: 'NOMINAL', cls: 'level-nominal', action: 'STABLE' };
  }

  // 衰减倒计时与默认行动条的**唯一决策源**（票 37）：decisions[] 中首个「待默认」项
  // (pending_default/pending_hold)。#decay-action 的 default label 与 #decay-countdown 的
  // lock_at 必取自**同一对象**（同源同决策），杜绝「X 分后执行 A」而 A 来自另一条决策。
  function pendingDefaultDecision(state) {
    const decisions = Array.isArray(state.decisions) ? state.decisions : [];
    return decisions.find(d => d && (d.status === 'pending_default' || d.status === 'pending_hold')) || null;
  }

  // 默认行动条文案的唯一取值点（票 32）：上述决策的 default 选项 label；
  // 无可答项 / 无 default 选项 / label 为空 → '—'（诚实降级，不回落伪造文案）。
  function pendingDefaultLabel(state) {
    const pending = pendingDefaultDecision(state);
    const options = pending && Array.isArray(pending.options) ? pending.options : [];
    const def = options.find(o => o && o.default === true);
    const label = def && typeof def.label === 'string' ? def.label.trim() : '';
    return label || '—';
  }

  function pathwayRadioGlyph(selected) {
    const svg = journeySvg(20);
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '9' }));
    if (selected) {
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '4', fill: 'currentColor', stroke: 'none' }));
    }
    return svg;
  }

  function renderDecisions(state) {
    const decisions = Array.isArray(state.decisions) ? state.decisions : [];
    // 优先关注队列真源（票 32）：真投影器产出的 queue.review[]（{ref,score,reasons}），
    // 不再是页面无生产者的 state.attention[]。
    const review = Array.isArray(state.queue?.review) ? state.queue.review : [];
    const budget = {};
    // 「需仲裁的那张」= 第一个需要行动的决策；全无则回退 decisions[0]
    const ACTIONABLE_STATUSES = ['pending_default', 'pending_hold'];
    const primary = decisions.find(d => d && ACTIONABLE_STATUSES.indexOf(d.status) !== -1) || decisions[0] || {};

    // 页头：CRITICAL ARBITRATION ACTIVE: <N> REQUIRES ACTION（由真实待办态决策数驱动）
    const critEl = document.getElementById('decisions-critical-count');
    if (critEl) {
      const pendingCount = decisions.filter(d => d.status === 'pending_default' || d.status === 'pending_hold').length;
      critEl.textContent = `${pendingCount} REQUIRES ACTION`;
    }

    // 页头：SYNC: EPOCH #<n>
    const syncEl = document.getElementById('decisions-sync-epoch');
    if (syncEl) {
      const telemetry = state.telemetry || {};
      syncEl.textContent = `EPOCH #${telemetry.epoch_ticks !== undefined ? telemetry.epoch_ticks : '—'}`;
    }

    // 注意力预算分配四格遥测
    const budgetWrap = document.getElementById('decisions-budget-metrics');
    if (budgetWrap) {
      budgetWrap.textContent = '';
      const drainKnown = isNum(budget.drain);
      const penaltyKnown = isNum(budget.stasis_penalty_ms);
      const headroomKnown = isNum(budget.headroom_pct);
      const gflopsKnown = isNum(budget.reasoning_gflops);
      if (!drainKnown && !penaltyKnown && !headroomKnown && !gflopsKnown) {
        // 票47 Phase2 / pi P0-1：四项全未知时折叠为一行紧凑摘要，不再占四行等高占位（诚实空态）
        showEmptyState(budgetWrap, '注意力预算：暂无真源数据');
      } else {
      const cells = [
        { label: 'COGNITIVE DRAIN COEFFICIENT', value: drainKnown ? String(budget.drain) : '—', unit: '/ 100 MAX', cls: 'val-primary', track: drainKnown ? budget.drain : null, known: drainKnown },
        { label: 'STASIS PENALTY', value: penaltyKnown ? `+${budget.stasis_penalty_ms}` : '—', unit: 'ms / min', cls: 'val-error', known: penaltyKnown },
        { label: 'BUFFER HEADROOM', value: headroomKnown ? `${budget.headroom_pct}%` : '—', unit: 'NOMINAL', cls: 'val-secondary', known: headroomKnown },
        { label: 'OPERATOR REASONING LOAD', value: gflopsKnown ? `${budget.reasoning_gflops}` : '—', unit: 'GFLOP/s', cls: 'val-primary', known: gflopsKnown }
      ];
      cells.forEach(cellDef => {
        const cell = el('div', 'budget-cell');
        cell.appendChild(el('span', 'budget-cell-label', cellDef.label));
        const valRow = el('div', 'budget-cell-val-row');
        valRow.appendChild(el('span', `budget-cell-val ${cellDef.cls}`, cellDef.value));
        if (cellDef.known) valRow.appendChild(el('span', 'budget-cell-unit', cellDef.unit));
        cell.appendChild(valRow);
        if (typeof cellDef.track === 'number') {
          const track = el('div', 'budget-track');
          const fill = el('div', 'budget-fill');
          fill.style.width = `${Math.max(0, Math.min(100, cellDef.track))}%`;
          track.appendChild(fill);
          cell.appendChild(track);
        }
        budgetWrap.appendChild(cell);
      });
      }
    }

    // 优先关注队列（按 queue.review[].score 降序；同分按 ref 自然序稳定断，与 project.mjs 同口径）
    const queueWrap = document.getElementById('decisions-attention-queue');
    if (queueWrap) {
      queueWrap.textContent = '';
      if (review.length === 0) {
        // 正面修掉静默空面板：无待复核项 → 渲一条明确态，而非留空读作「无需关注」
        queueWrap.appendChild(el('div', 'attention-empty', '无待复核项'));
      } else {
        const refKey = (id) => { const m = /^([A-Za-z]+)(\d+)$/.exec(String(id)); return m ? [m[1], Number(m[2])] : [String(id), 0]; };
        const cmpRef = (x, y) => { const kx = refKey(x), ky = refKey(y); return kx[0] < ky[0] ? -1 : kx[0] > ky[0] ? 1 : kx[1] - ky[1]; };
        const scoreOf = (v) => (isNum(v) ? v : -Infinity);
        const sorted = [...review].sort((a, b) => (scoreOf(b.score) - scoreOf(a.score)) || cmpRef(a.ref, b.ref));
        sorted.forEach(item => {
          const hasScore = isNum(item.score);
          const level = attentionLevel(item.score);

          const row = el('div', `attention-item ${level.cls}`);
          row.setAttribute('data-score', hasScore ? String(item.score) : '');
          row.setAttribute('data-ref', item.ref || '');

          const left = el('div', 'attention-item-left');
          left.appendChild(el('div', `attention-score ${level.cls}`, hasScore ? `S${item.score}` : 'S—'));

          const info = el('div', 'attention-info');
          const titleRow = el('div', 'attention-title-row');
          titleRow.appendChild(el('span', 'attention-title', item.ref || '--'));
          titleRow.appendChild(el('span', `attention-level ${level.cls}`, level.text));
          info.appendChild(titleRow);
          const reasons = Array.isArray(item.reasons) ? item.reasons.join(' · ') : '';
          info.appendChild(el('span', 'attention-target', `Target: ${item.ref || '--'} // ${reasons}`));
          left.appendChild(info);
          row.appendChild(left);

          row.appendChild(el('span', `attention-action ${level.cls}`, level.action));
          queueWrap.appendChild(row);
        });
      }
    }

    // 决策详情面板
    const statusBadge = document.getElementById('decisions-status-badge');
    if (statusBadge) {
      // 票45 ③：severity 缺失即渲 "—"，不得回落静态等级串把未证明等级拼进徽标。
      const severity = String(primary.severity || '—').toUpperCase();
      const status = String(primary.status || 'open').toUpperCase();
      statusBadge.textContent = `${severity} // ${status}`;
    }
    const priorityBadge = document.getElementById('decisions-priority-badge');
    if (priorityBadge) priorityBadge.textContent = `PRIORITY: ${primary.priority || '--'}`;
    const gateId = document.getElementById('decisions-gate-id');
    if (gateId) gateId.textContent = `GATE: [${primary.id || '--'}] ${primary.code || ''}`.trim();
    const createdEl = document.getElementById('decisions-created');
    if (createdEl) createdEl.textContent = `CREATED: T+${formatClock(primary.created_offset_s)}`;
    const gateTitle = document.getElementById('decisions-gate-title');
    if (gateTitle) gateTitle.textContent = primary.title || '';
    const gateDesc = document.getElementById('decisions-gate-desc');
    if (gateDesc) gateDesc.textContent = '—';

    // 自动默认执行行动条：<倒计时> 后自动默认执行：<action>
    // 与顶部行动条同源（票 32）：待默认项(pending_default/pending_hold)的 default 选项
    // label；无则 '—'。不再回落 options[0] 伪造文案。
    const options = Array.isArray(primary.options) ? primary.options : [];
    const actionEl = document.getElementById('decisions-decay-action');
    if (actionEl) {
      actionEl.textContent = pendingDefaultLabel(state);
    }

    // 分支解决路径（SELECT 1 OF N）
    const pathwayHint = document.getElementById('decisions-pathway-hint');
    if (pathwayHint) pathwayHint.textContent = `SELECT 1 OF ${options.length}`;

    const pathwayList = document.getElementById('decisions-pathway-list');
    if (pathwayList) {
      pathwayList.textContent = '';
      options.forEach(opt => {
        const card = el('div', `pathway-card${opt.default ? ' pathway-card-default' : ''}`);
        card.setAttribute('data-pathway', opt.key || '');

        const radio = el('span', `pathway-radio${opt.default ? ' radio-selected' : ''}`);
        radio.appendChild(pathwayRadioGlyph(Boolean(opt.default)));
        card.appendChild(radio);

        const body = el('div', 'pathway-body');
        const head = el('div', 'pathway-card-head');
        head.appendChild(el('span', 'pathway-label', `${opt.key}. ${opt.label}`));
        if (opt.badge) head.appendChild(el('span', `pathway-badge${opt.default ? ' badge-default' : ''}`, opt.badge));
        body.appendChild(head);

        card.appendChild(body);
        pathwayList.appendChild(card);
      });
    }

    // 决策影响后果评估 (IMPACT MATRIX)：五格 ← 真投影器 ripple（唯一判据 decisionRipple()）
    const impactWrap = document.getElementById('decisions-impact-matrix');
    if (impactWrap) {
      impactWrap.textContent = '';
      const ripple = decisionRipple(primary);
      const rippleItems = (ripple && ripple.items) || {};
      const cells = [
        { field: 'redo', label: '1. 返工范围 (REWORK COST)', value: rippleItems.redo },
        { field: 'enable', label: '2. 启用/解锁 (ENABLED)', value: rippleItems.enable },
        { field: 'disable', label: '3. 停用/排除 (DISABLED)', value: rippleItems.disable },
        { field: 'affected_todo', label: '4. 牵动未启动 (AFFECTED)', value: rippleItems.affected_todo },
        { field: 'sunk_min', label: '5. 沉没耗时 (SUNK RUNTIME)', value: ripple ? ripple.sunk_min : undefined }
      ];
      cells.forEach(cellDef => {
        const raw = cellDef.value;
        const cell = el('div', 'impact-cell');
        cell.setAttribute('data-impact-field', cellDef.field);
        cell.setAttribute('data-impact-value', JSON.stringify(raw !== undefined ? raw : null));
        cell.appendChild(el('span', 'impact-cell-label', cellDef.label));
        cell.appendChild(el('span', 'impact-cell-val', formatImpactValue(cellDef.field, raw)));
        impactWrap.appendChild(cell);
      });
    }
  }

  // ── 账本视图 (Ledger)：追加只写核验台账 ──────────────────────────────
  const LANE_LABELS = { todo: 'TODO', doing: 'DOING', done: 'DONE' };

  function ledgerGlyph(kind, size) {
    const svg = journeySvg(size || 16);
    if (kind === 'chevron') {
      svg.appendChild(svgEl('polyline', { points: '6 9 12 15 18 9' }));
    } else if (kind === 'chevron-right') {
      svg.appendChild(svgEl('polyline', { points: '9 6 15 12 9 18' }));
    } else if (kind === 'terminal') {
      svg.appendChild(svgEl('polyline', { points: '4 17 10 11 4 5' }));
      svg.appendChild(svgEl('line', { x1: '12', y1: '19', x2: '20', y2: '19' }));
    } else if (kind === 'diff') {
      svg.appendChild(svgEl('path', { d: 'M12 3v18M3 12h18' }));
    } else if (kind === 'lock') {
      svg.appendChild(svgEl('rect', { x: '3', y: '11', width: '18', height: '10', rx: '2' }));
      svg.appendChild(svgEl('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }));
    } else if (kind === 'check') {
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '9' }));
      svg.appendChild(svgEl('polyline', { points: '8.5 12.5 11 15 15.5 9.5' }));
    } else if (kind === 'shield') {
      svg.appendChild(svgEl('path', { d: 'M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5z' }));
    } else if (kind === 'eye') {
      svg.appendChild(svgEl('path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' }));
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '3' }));
    } else if (kind === 'verified') {
      svg.appendChild(svgEl('path', { d: 'M12 2l2.4 2.8 3.7-.3 1.2 3.5 3.4 1.5-1.2 3.5 1.2 3.5-3.4 1.5-1.2 3.5-3.7-.3L12 22l-2.4-2.8-3.7.3-1.2-3.5L1.3 12l1.2-3.5L1.3 5l3.4-1.5 1.2-3.5 3.7.3L12 2z' }));
      svg.appendChild(svgEl('polyline', { points: '8.5 12 11 14.5 15.5 9' }));
    }
    return svg;
  }

  function renderLedgerKpis(state, ledger) {
    const wrap = document.getElementById('ledger-kpis');
    if (!wrap) return;
    wrap.textContent = '';
    const kpis = Array.isArray(state.ledgerKpis) ? state.ledgerKpis : [];
    kpis.forEach(kpi => {
      const accent = kpi.accent === 'secondary' ? 'secondary' : 'primary';
      const card = el('div', 'ledger-kpi-card');
      card.setAttribute('data-kpi-id', kpi.id || '');
      card.appendChild(el('span', 'ledger-kpi-label', kpi.label || ''));
      const valRow = el('div', 'ledger-kpi-val-row');
      // ponytail: 记录总数由 ledger.length 驱动，杜绝硬编码记录数
      const value = kpi.id === 'records' ? String(ledger.length) : (kpi.value || '');
      valRow.appendChild(el('span', `ledger-kpi-value icon-${accent}`, value));
      if (kpi.sub) valRow.appendChild(el('span', 'ledger-kpi-sub', kpi.sub));
      card.appendChild(valRow);
      if (typeof kpi.pct === 'number') {
        const track = el('div', 'ledger-kpi-track');
        const fill = el('div', `ledger-kpi-fill fill-${accent}`);
        fill.style.width = `${Math.max(0, Math.min(100, kpi.pct))}%`;
        track.appendChild(fill);
        card.appendChild(track);
      } else if (kpi.foot) {
        const foot = el('div', 'ledger-kpi-foot');
        foot.appendChild(ledgerGlyph('lock', 12));
        foot.appendChild(el('span', '', kpi.foot));
        card.appendChild(foot);
      }
      wrap.appendChild(card);
    });
  }

  function ledgerMatches(row, filter) {
    if (filter.lane !== 'all' && String(row.lane) !== filter.lane) return false;
    if (filter.actor !== 'all' && String(row.actor || '').toLowerCase() !== filter.actor) return false;
    const q = (filter.query || '').trim().toLowerCase();
    if (q) {
      const hay = [row.seq, row.hash, row.ts, row.title, row.scope, row.origin, row.actor, row.lane, row.depth]
        .map(v => String(v === undefined || v === null ? '' : v)).join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  // 票45 ⑤：ACTOR 芯片由账本行真源 actor 枚举动态生成（claude/subagent/user/tool…），
  // 每个芯片必命中 ≥1 行；杜绝静态标签与真源枚举不符导致点选 0 命中。
  function renderActorChips(ledger) {
    const wrap = document.getElementById('ledger-actor-filters');
    if (!wrap) return;
    const actors = Array.from(new Set(
      ledger.map(r => String(r.actor || '').toLowerCase()).filter(Boolean)
    )).sort();
    if (inPageState.ledgerFilter.actor !== 'all' && actors.indexOf(inPageState.ledgerFilter.actor) === -1) {
      inPageState.ledgerFilter.actor = 'all';
    }
    wrap.querySelectorAll('[data-actor]').forEach(b => b.remove());
    const makeChip = (value, label) => {
      const btn = el('button', 'ledger-chip', label);
      btn.type = 'button';
      btn.setAttribute('data-actor', value);
      return btn;
    };
    wrap.appendChild(makeChip('all', 'ALL'));
    actors.forEach(a => wrap.appendChild(makeChip(a, a.toUpperCase())));
  }

  function buildPayloadBlock(row) {
    const block = el('div', 'ledger-block');
    const head = el('div', 'ledger-block-head');
    const left = el('div', 'ledger-block-head-left');
    left.appendChild(ledgerGlyph('terminal', 16));
    left.appendChild(el('span', 'ledger-block-title icon-secondary', 'CALL SPECIFICATION PAYLOAD (PARSED DETERMINISTIC JSON)'));
    head.appendChild(left);
    block.appendChild(head);
    const pre = el('pre', 'ledger-code ledger-payload-json');
    // 确定性序列化，禁止 eval；票 43：无 payload 真源即诚实 '—'（不回落伪造空 JSON）
    pre.textContent = row.payload ? JSON.stringify(row.payload, null, 2) : '—';
    block.appendChild(pre);
    return block;
  }

  function buildStdoutBlock(row) {
    const lines = Array.isArray(row.stdout) ? row.stdout : [];
    const block = el('div', 'ledger-block');
    const head = el('div', 'ledger-block-head');
    const left = el('div', 'ledger-block-head-left');
    left.appendChild(el('span', 'ledger-live-dot'));
    left.appendChild(el('span', 'ledger-block-title', 'STDOUT'));
    head.appendChild(left);
    const meta = el('div', 'ledger-block-meta');
    meta.appendChild(el('span', '', `PIPE: ${row.stdout_pipe || '--'}`));
    meta.appendChild(el('span', 'ledger-tail-tag', `TAIL -n ${lines.length}`));
    head.appendChild(meta);
    block.appendChild(head);
    const body = el('div', 'ledger-code ledger-stdout');
    lines.forEach(line => {
      const rowEl = el('div', 'ledger-stdout-line');
      rowEl.appendChild(el('span', 'ledger-stdout-t', `[${line.t || '--:--:--.---'}]`));
      rowEl.appendChild(el('span', `ledger-stdout-lvl lvl-${String(line.level || '').toLowerCase()}`, `${line.level || 'INFO'}:`));
      rowEl.appendChild(el('span', 'ledger-stdout-msg', line.msg || ''));
      body.appendChild(rowEl);
    });
    block.appendChild(body);
    return block;
  }

  function buildDiffBlock(row) {
    const diff = row.diff || {};
    const lines = Array.isArray(diff.lines) ? diff.lines : [];
    const block = el('div', 'ledger-block');
    const head = el('div', 'ledger-block-head');
    const left = el('div', 'ledger-block-head-left');
    left.appendChild(ledgerGlyph('diff', 16));
    const linesTail = (isNum(diff.add) && isNum(diff.del)) ? ` (+${diff.add} / -${diff.del} LINES)` : '';
    left.appendChild(el('span', 'ledger-block-title icon-primary', `DIFF${linesTail}`));
    head.appendChild(left);
    head.appendChild(el('span', 'ledger-block-note icon-primary', `CANONICAL DIFF HASH: ${diff.hash || '--'}`));
    block.appendChild(head);
    const body = el('div', 'ledger-code ledger-diff');
    lines.forEach(line => {
      const cls = line.type === 'add' ? 'diff-add' : (line.type === 'del' ? 'diff-del' : 'diff-ctx');
      body.appendChild(el('div', `ledger-diff-line ${cls}`, line.text || ''));
    });
    block.appendChild(body);
    return block;
  }

  function buildAttestationBlock(row) {
    const a = row.attestation || {};
    const block = el('div', 'ledger-block');
    const head = el('div', 'ledger-block-head');
    const left = el('div', 'ledger-block-head-left');
    left.appendChild(ledgerGlyph('verified', 18));
    // 票45 ⑥：原加密谱系串改中性 —— row.attestation 由投影器恒不产出，故不宣称签名/证明框架。
    left.appendChild(el('span', 'ledger-block-title icon-primary', 'RECORD PROVENANCE (UNVERIFIED SOURCE)'));
    head.appendChild(left);
    head.appendChild(el('span', 'ledger-immutable-tag', 'IMMUTABLE'));
    block.appendChild(head);

    const fields = [
      { label: 'SIGNING AGENT PUBLIC KEY:', value: a.pubkey, cls: 'val-mono' },
      { label: 'ED25519 ENCLAVE SIGNATURE:', value: a.signature, cls: 'val-mono val-secondary' },
      { label: 'MERKLE LEAF INDEX:', value: a.leaf_index === undefined ? null : `#${a.leaf_index}`, cls: 'val-bold' },
      { label: 'PARENT TASK (LINEAGE):', value: a.parent_task, cls: 'val-bold val-primary' },
      { label: 'NONCE ROOT & PROOF:', value: a.nonce_root, cls: 'val-mono' }
    ];
    const body = el('div', 'ledger-attest-body');
    fields.forEach(f => {
      const cell = el('div', 'ledger-attest-cell');
      cell.appendChild(el('span', 'ledger-attest-label', f.label));
      cell.appendChild(el('span', `ledger-attest-value ${f.cls}`, f.value === undefined || f.value === null ? '--' : f.value));
      body.appendChild(cell);
    });
    block.appendChild(body);
    return block;
  }

  function buildVerificationBlock(row) {
    const a = row.attestation || {};
    const block = el('div', 'ledger-block');
    block.appendChild(el('span', 'ledger-block-title ledger-title-plain', 'VERIFICATION CHECKPOINT PROOFS'));
    const checks = [
      { label: 'WITNESS VALUE', value: a.zk_witness, glyph: 'check', tone: 'val-secondary' },
      { label: 'REPLAY INTEGRITY CHECK', value: a.replay_integrity, glyph: 'check', tone: 'val-secondary' },
      { label: 'EXECUTION CONTEXT', value: a.enclave_state, glyph: 'shield', tone: 'val-primary' }
    ];
    const list = el('div', 'ledger-verify-list');
    checks.forEach(c => {
      const r = el('div', 'ledger-verify-row');
      r.appendChild(el('span', 'ledger-verify-label', c.label));
      const val = el('span', `ledger-verify-val ${c.tone}`);
      val.appendChild(ledgerGlyph(c.glyph, 14));
      val.appendChild(el('span', '', c.value === undefined || c.value === null ? '--' : c.value));
      r.appendChild(val);
      list.appendChild(r);
    });
    block.appendChild(list);

    const jsonld = el('pre', 'ledger-code ledger-jsonld');
    jsonld.setAttribute('hidden', '');
    jsonld.textContent = JSON.stringify({
      '@context': 'tl://ledger/v4',
      seq: row.seq,
      hash: row.hash,
      ts: row.ts,
      event: (row.payload || {}).event,
      ref: (row.payload || {}).ref,
      actor: row.actor,
      lane: row.lane,
      attestation: row.attestation
    }, null, 2);

    const btn = el('button', 'ledger-jsonld-btn');
    btn.type = 'button';
    btn.appendChild(ledgerGlyph('eye', 16));
    btn.appendChild(el('span', '', 'OPEN COMPLETE JSON-LD RECORD'));
    btn.addEventListener('click', () => {
      if (jsonld.hasAttribute('hidden')) jsonld.removeAttribute('hidden');
      else jsonld.setAttribute('hidden', '');
    });
    block.appendChild(btn);
    block.appendChild(jsonld);
    return block;
  }

  function buildLedgerExpand(row) {
    const grid = el('div', 'ledger-expand-grid');
    const left = el('div', 'ledger-expand-left');
    const right = el('div', 'ledger-expand-right');
    // 票47 Phase2 / pi P1-4：展开行保留完整 ISO-8601 原始时间戳（主列的相对时间为派生展示，不改记录）
    left.appendChild(el('div', 'ledger-expand-ts', `TIMESTAMP (ISO-8601): ${row.ts || '—'}`));
    left.appendChild(buildPayloadBlock(row));
    left.appendChild(buildStdoutBlock(row));
    left.appendChild(buildDiffBlock(row));
    right.appendChild(buildAttestationBlock(row));
    right.appendChild(buildVerificationBlock(row));
    grid.appendChild(left);
    grid.appendChild(right);
    return grid;
  }

  function buildLedgerRow(row, expanded) {
    const wrap = el('div', 'ledger-row');
    wrap.setAttribute('data-seq', row.seq || '');
    wrap.setAttribute('data-lane', row.lane || '');
    wrap.setAttribute('data-actor', String(row.actor || '').toLowerCase());
    wrap.setAttribute('data-hash', row.hash || '');

    const main = el('div', 'ledger-row-main');
    main.setAttribute('role', 'button');
    main.setAttribute('tabindex', '0');

    const chev = el('span', 'ledger-chevron');
    chev.appendChild(ledgerGlyph(expanded ? 'chevron' : 'chevron-right', 18));

    const seqCell = el('div', 'ledger-col ledger-col-seq');
    seqCell.appendChild(chev);
    const seqBox = el('div', 'ledger-seq-box');
    seqBox.appendChild(el('span', 'ledger-seq', row.seq || ''));
    seqBox.appendChild(el('span', 'ledger-hash', row.hash || '—'));
    seqCell.appendChild(seqBox);
    main.appendChild(seqCell);

    const tsCell = el('div', 'ledger-col ledger-col-ts');
    // 票47 Phase2 / pi P1-4：主列显示相对时间（可扫读），完整 ISO-8601 保留在展开行（不改原始记录）
    const tsSpan = el('span', 'ledger-ts', formatRelativeAge(row.ts, Date.now()));
    if (row.ts) tsSpan.setAttribute('title', row.ts);
    tsCell.appendChild(tsSpan);
    main.appendChild(tsCell);

    const titleCell = el('div', 'ledger-col ledger-col-title');
    titleCell.appendChild(el('span', 'ledger-title', row.title || '—'));
    titleCell.appendChild(el('span', 'ledger-scope', `SCOPE: ${row.scope || '—'}`));
    main.appendChild(titleCell);

    const originCell = el('div', 'ledger-col ledger-col-origin');
    originCell.appendChild(el('span', `ledger-origin origin-${row.origin || 'unknown'}`, row.origin ? String(row.origin).toUpperCase() : '—'));
    main.appendChild(originCell);

    const actorCell = el('div', 'ledger-col ledger-col-actor');
    actorCell.appendChild(el('span', 'ledger-actor', row.actor ? String(row.actor).toUpperCase() : '—'));
    main.appendChild(actorCell);

    const laneCell = el('div', 'ledger-col ledger-col-lane');
    laneCell.appendChild(el('span', `ledger-lane lane-${row.lane || 'unknown'}`, row.lane ? (LANE_LABELS[row.lane] || String(row.lane).toUpperCase()) : '—'));
    main.appendChild(laneCell);

    const depthCell = el('div', 'ledger-col ledger-col-depth');
    depthCell.appendChild(el('span', 'ledger-depth', row.depth || '—'));
    main.appendChild(depthCell);

    wrap.appendChild(main);

    const panel = el('div', 'ledger-expand');
    if (!expanded) panel.setAttribute('hidden', '');
    panel.appendChild(buildLedgerExpand(row));
    wrap.appendChild(panel);

    const toggle = () => {
      const isOpen = inPageState.ledgerExpanded[row.seq] === true;
      inPageState.ledgerExpanded[row.seq] = !isOpen;
      if (isOpen) {
        panel.setAttribute('hidden', '');
      } else {
        panel.removeAttribute('hidden');
      }
      chev.textContent = '';
      chev.appendChild(ledgerGlyph(isOpen ? 'chevron-right' : 'chevron', 18));
    };
    main.addEventListener('click', toggle);
    main.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    return wrap;
  }

  // 票 43：账本行集真源 = trail（事件轨迹 project.mjs:705 {seq,t,type,ref}）+ activity（actor :706）。
  // 投影器从不产顶层 state.ledger；票 36 曾判诚实空态，票 43 改判「有真源、页面读错键」→ 行集接 trail。
  // 行内 hash/origin/depth/payload/stdout/diff/attestation 投影器无产出 → 由渲染器诚实渲 '—'/空，不伪造。
  function ledgerRowsFrom(state) {
    const trail = Array.isArray(state.trail) ? state.trail : [];
    const activity = Array.isArray(state.activity) ? state.activity : [];
    const items = Array.isArray(state.items) ? state.items : [];
    const laneById = new Map(items.map(i => [i.id, i.lane]));
    const actorBySeq = new Map(activity.map(a => [a.seq, a.actor]));
    return trail.map(ev => {
      const ref = ev.ref || '';
      return {
        seq: ev.seq,
        hash: '',
        ts: ev.t || '',
        title: ev.type || '',
        scope: ref,
        origin: '',
        actor: actorBySeq.get(ev.seq) || '',
        lane: laneById.get(ref) || '',
        depth: '',
        payload: null, stdout: null, diff: null, attestation: null
      };
    });
  }

  function applyLedgerFilter(state) {
    const ledger = ledgerRowsFrom(state);
    const filter = inPageState.ledgerFilter;

    const rowsWrap = document.getElementById('ledger-rows');
    if (rowsWrap) {
      rowsWrap.textContent = '';
      ledger.forEach(row => {
        if (!ledgerMatches(row, filter)) return;
        rowsWrap.appendChild(buildLedgerRow(row, inPageState.ledgerExpanded[row.seq] === true));
      });
    }

    const matched = ledger.filter(row => ledgerMatches(row, filter)).length;
    const countEl = document.getElementById('ledger-count');
    if (countEl) {
      countEl.textContent = `${matched} OF ${ledger.length} RECORDS MATCHING FILTER CRITERIA`;
    }

    const markActive = (containerId, attr, value) => {
      const c = document.getElementById(containerId);
      if (!c) return;
      Array.from(c.querySelectorAll(`[${attr}]`)).forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute(attr) === value);
      });
    };
    markActive('ledger-lane-filters', 'data-lane', filter.lane);
    markActive('ledger-actor-filters', 'data-actor', filter.actor);

    const searchEl = document.getElementById('ledger-search');
    if (searchEl && searchEl.value !== filter.query) searchEl.value = filter.query;
  }

  function initLedgerControls() {
    if (inPageState.ledgerBound) return;
    inPageState.ledgerBound = true;

    const rerun = () => applyLedgerFilter(cachedState || window.__TL__ || {});

    const laneWrap = document.getElementById('ledger-lane-filters');
    if (laneWrap) {
      laneWrap.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-lane]') : null;
        if (!btn || !laneWrap.contains(btn)) return;
        inPageState.ledgerFilter.lane = btn.getAttribute('data-lane') || 'all';
        rerun();
      });
    }

    const actorWrap = document.getElementById('ledger-actor-filters');
    if (actorWrap) {
      actorWrap.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-actor]') : null;
        if (!btn || !actorWrap.contains(btn)) return;
        inPageState.ledgerFilter.actor = btn.getAttribute('data-actor') || 'all';
        rerun();
      });
    }

    const clearSearch = () => {
      const s = document.getElementById('ledger-search');
      if (s) s.value = '';
      inPageState.ledgerFilter.query = '';
      rerun();
    };

    const searchEl = document.getElementById('ledger-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        inPageState.ledgerFilter.query = searchEl.value || '';
        rerun();
      });
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clearSearch();
      });
    }
    const clearEl = document.getElementById('ledger-search-clear');
    if (clearEl) {
      clearEl.addEventListener('click', clearSearch);
    }
  }

  function renderLedger(state) {
    const ledger = ledgerRowsFrom(state);
    const meta = state.ledgerMeta || {};

    const merkleEl = document.getElementById('ledger-merkle-root');
    if (merkleEl) merkleEl.textContent = meta.merkle_root || '--';
    const guardEl = document.getElementById('ledger-enclave-guard');
    if (guardEl) guardEl.textContent = `ENCLAVE GUARD: ${meta.enclave_guard || '--'}`;

    renderLedgerKpis(state, ledger);
    initLedgerControls();
    renderActorChips(ledger);
    applyLedgerFilter(state);
  }

  // 页面加载入口
  window.addEventListener('DOMContentLoaded', () => {
    initNavDeck();

    const manualBtn = document.getElementById('manual-refresh-btn');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => {
        triggerRefresh();
      });
    }

    // 旅途视图：强制快照 (Snap) 触发一次数据自刷新
    const snapBtn = document.getElementById('btn-snap');
    if (snapBtn) {
      snapBtn.addEventListener('click', () => {
        triggerRefresh();
      });
    }

    // 旅途视图：查看活跃详情 → 滚动定位到节点详情抽屉
    const focusDetailBtn = document.getElementById('btn-focus-detail');
    if (focusDetailBtn) {
      focusDetailBtn.addEventListener('click', () => {
        const inspector = document.getElementById('journey-inspector');
        if (inspector && typeof inspector.scrollIntoView === 'function') {
          inspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    initJourneyModes();

    if (window.__TL__) {
      render(window.__TL__);
    }
  });

  // 暴露给外部自检脚本或控制台调试
  window.__TL_APP__ = {
    render,
    triggerRefresh,
    inPageState,
    formatDuration,
    formatRelativeAge,
    formatStagnation,
    determineStateMatrix,
    switchView: applyActiveView,
    updateDecayCountdown,
    pendingDefaultDecision,
    decayCountdownText,
    formatRefTitle,
    labelWithRef,
    renderLedger,
    // 时空视图模式 (功能 5) 与深度功能 (1/2/3/4/6/7)
    switchJourneyMode,
    getJourneyMode: () => journeyMode,
    GAP_FOLD_THRESHOLD_MS: DEFAULT_GAP_FOLD_THRESHOLD_MS,
    SEPARATION_MIN,
    isSeparated,
    shouldFoldGap,
    nodeDecisionState,
    NODE_FILL
  };
})();
