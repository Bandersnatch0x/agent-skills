#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [inputArg, outputArg = "hackathons.html"] = process.argv.slice(2);

if (!inputArg) {
  console.error("Usage: node generate-page.mjs <hackathons.json> [output.html]");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);

try {
  const documentData = JSON.parse(await readFile(inputPath, "utf8"));
  validateDocument(documentData);

  const embeddedData = JSON.stringify(documentData)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

  await writeFile(outputPath, renderPage(embeddedData), "utf8");
  console.log(`Generated ${outputPath} with ${documentData.hackathons.length} hackathons.`);
} catch (error) {
  console.error(`Failed to generate page: ${error.message}`);
  process.exit(1);
}

function validateDocument(documentData) {
  if (!documentData || Array.isArray(documentData) || !Array.isArray(documentData.hackathons)) {
    throw new Error('Expected an object with a "hackathons" array.');
  }
  if (!isTimestamp(documentData.generatedAt)) throw new Error("generatedAt must include a timezone offset.");
  if (!['en', 'zh-CN'].includes(documentData.defaultLocale)) throw new Error("defaultLocale must be en or zh-CN.");
  try { new Intl.DateTimeFormat("en", { timeZone: documentData.timezone }).format(); }
  catch { throw new Error("timezone must be a valid IANA timezone."); }

  const ids = new Set();
  for (const [index, item] of documentData.hackathons.entries()) {
    const at = `hackathons[${index}]`;
    if (!item || typeof item !== "object") throw new Error(`${at} must be an object.`);
    requireText(item.id, `${at}.id`);
    if (ids.has(item.id)) throw new Error(`${at}.id must be unique.`);
    ids.add(item.id);
    requireText(item.name, `${at}.name`);
    requireUrl(item.url, `${at}.url`);
    requireUrl(item.rulesUrl, `${at}.rulesUrl`);
    if (!isTimestamp(item.deadlineAt)) throw new Error(`${at}.deadlineAt must include a timezone offset.`);
    if (!isTimestamp(item.verifiedAt)) throw new Error(`${at}.verifiedAt must include a timezone offset.`);
    if (!item.location || !["online", "in-person", "hybrid"].includes(item.location.mode)) throw new Error(`${at}.location.mode is invalid.`);
    for (const [field, values] of Object.entries({
      eventTypes: item.eventTypes,
      technologies: item.technologies,
      platforms: item.platforms,
      tracks: item.tracks,
      requirements: item.requirements,
      submissionArtifacts: item.submissionArtifacts,
      mustUse: item.mustUse,
      countries: item.location.countries,
      eligibilityRequirements: item.eligibility?.requirements,
      allowedCountries: item.eligibility?.allowedCountries,
      excludedCountries: item.eligibility?.excludedCountries,
      allowedParticipantStatuses: item.eligibility?.allowedParticipantStatuses,
      excludedParticipantStatuses: item.eligibility?.excludedParticipantStatuses,
      storeAccounts: item.capabilities?.storeAccounts,
      vendorAccounts: item.capabilities?.vendorAccounts
    })) requireTextArray(values, `${at}.${field}`);
    if (!["eligible", "ineligible", "uncertain"].includes(item.eligibility?.verdict)) throw new Error(`${at}.eligibility.verdict is invalid.`);
    const participantStatuses = ["individual", "student", "employee", "government-employee", "company"];
    for (const status of [...item.eligibility.allowedParticipantStatuses, ...item.eligibility.excludedParticipantStatuses]) {
      if (!participantStatuses.includes(status)) throw new Error(`${at}.eligibility participant status is invalid.`);
    }
    const teamSize = item.eligibility?.teamSize;
    if (!teamSize || !Number.isInteger(teamSize.min) || !Number.isInteger(teamSize.max) || teamSize.min < 1 || teamSize.max < teamSize.min) throw new Error(`${at}.eligibility.teamSize is invalid.`);
    for (const field of ["inPersonAttendance", "publicRepository", "demoVideo", "liveDeployment", "openSourceLicense"]) {
      if (typeof item.capabilities?.[field] !== "boolean") throw new Error(`${at}.capabilities.${field} must be boolean.`);
    }
    if (!Array.isArray(item.prizes)) throw new Error(`${at}.prizes must be an array.`);
    for (const [prizeIndex, prize] of item.prizes.entries()) {
      requireText(prize?.label, `${at}.prizes[${prizeIndex}].label`);
      requireText(prize?.value, `${at}.prizes[${prizeIndex}].value`);
      if (!["cash", "credits", "hardware", "services", "swag", "other"].includes(prize?.type)) throw new Error(`${at}.prizes[${prizeIndex}].type is invalid.`);
    }
    if (!Array.isArray(item.sources) || !item.sources.length) throw new Error(`${at}.sources must contain evidence links.`);
    for (const [sourceIndex, source] of item.sources.entries()) {
      requireText(source?.label, `${at}.sources[${sourceIndex}].label`);
      requireUrl(source?.url, `${at}.sources[${sourceIndex}].url`);
      requireTextArray(source?.supports, `${at}.sources[${sourceIndex}].supports`);
    }
  }
}

function isTimestamp(value) {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

function requireText(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string.`);
}

function requireTextArray(value, path) {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) throw new Error(`${path} must be an array of non-empty strings.`);
}

function requireUrl(value, path) {
  requireText(value, path);
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`${path} must be a valid URL.`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${path} must use HTTP or HTTPS.`);
}

function renderPage(embeddedData) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hackathon Shortlist</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --bg: #070a12;
      --panel: rgba(16, 23, 38, .88);
      --panel-strong: #111a2b;
      --border: rgba(148, 163, 184, .2);
      --border-strong: rgba(103, 232, 249, .5);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #67e8f9;
      --accent-2: #a78bfa;
      --success: #4ade80;
      --warning: #fbbf24;
      --shadow: 0 24px 80px rgba(0, 0, 0, .28);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at 12% 0%, rgba(14, 165, 233, .18), transparent 32rem),
        radial-gradient(circle at 90% 18%, rgba(124, 58, 237, .16), transparent 30rem),
        var(--bg);
    }
    header { padding: 2rem clamp(1rem, 4vw, 4rem) 1.35rem; border-bottom: 1px solid var(--border); background: rgba(7, 10, 18, .72); backdrop-filter: blur(18px); }
    .header-row { display: flex; align-items: start; justify-content: space-between; gap: 1.5rem; max-width: 96rem; margin: auto; }
    h1 { margin: 0 0 .45rem; font-size: clamp(2rem, 5vw, 3.8rem); line-height: 1; letter-spacing: -.05em; background: linear-gradient(90deg, #fff, var(--accent)); color: transparent; background-clip: text; }
    h2, h3 { margin-top: 0; letter-spacing: -.02em; }
    header p, .empty, .meta, .hint { color: var(--muted); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, 25rem); gap: 1.25rem; max-width: 96rem; margin: auto; padding: 1.25rem clamp(1rem, 4vw, 4rem) 4rem; }
    .panel, article { border: 1px solid var(--border); background: var(--panel); box-shadow: var(--shadow); backdrop-filter: blur(18px); }
    .panel { padding: 1rem; border-radius: 1rem; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .75rem; }
    label, fieldset { color: #cbd5e1; font-size: .82rem; font-weight: 650; }
    label { display: grid; gap: .38rem; }
    fieldset { margin: 0; padding: .75rem; border: 1px solid var(--border); border-radius: .7rem; }
    legend { padding: 0 .35rem; color: var(--accent); }
    input, select, button, textarea { width: 100%; padding: .72rem .78rem; border: 1px solid var(--border); border-radius: .6rem; outline: none; background: rgba(5, 10, 20, .82); color: inherit; transition: border-color .15s, transform .15s, box-shadow .15s, background .15s; }
    input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(103, 232, 249, .12); }
    input[type="checkbox"] { width: 1rem; height: 1rem; accent-color: #22d3ee; }
    textarea { min-height: 19rem; resize: vertical; font: .8rem/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; background: rgba(2, 6, 23, .86); }
    button { cursor: pointer; border-color: transparent; background: linear-gradient(135deg, #0891b2, #7c3aed); font-weight: 800; }
    button:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(34, 211, 238, .16); }
    button.secondary { border-color: var(--border); background: rgba(30, 41, 59, .9); }
    .summary { margin: 1rem 0; color: var(--muted); font-size: .9rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr)); gap: 1rem; }
    article { position: relative; padding: 1.15rem; overflow: hidden; border-radius: 1rem; transition: transform .18s, border-color .18s, background .18s; }
    article::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: linear-gradient(var(--accent), var(--accent-2)); opacity: .45; }
    article:hover { transform: translateY(-2px); border-color: rgba(103, 232, 249, .38); background: var(--panel-strong); }
    article.selected { border-color: var(--border-strong); box-shadow: 0 0 0 1px rgba(103, 232, 249, .12), var(--shadow); }
    article h2 { margin: 0 0 .65rem; font-size: 1.25rem; }
    a { color: var(--accent); text-decoration-thickness: .08em; text-underline-offset: .18em; }
    .badges, .check-grid, .actions { display: flex; flex-wrap: wrap; gap: .45rem; }
    .badge { padding: .24rem .55rem; border: 1px solid var(--border); border-radius: 999px; background: rgba(51, 65, 85, .58); color: #cbd5e1; font-size: .75rem; }
    .badge.match { border-color: rgba(74, 222, 128, .35); background: rgba(22, 101, 52, .45); color: #bbf7d0; }
    .profile { position: sticky; top: 1rem; align-self: start; max-height: calc(100vh - 2rem); overflow: auto; scrollbar-color: #475569 transparent; }
    .profile h2 { margin-bottom: .35rem; }
    .profile form { display: grid; gap: .75rem; }
    .check-grid label, .select-event { display: flex; align-items: center; gap: .4rem; padding: .35rem .5rem; border: 1px solid var(--border); border-radius: .55rem; background: rgba(15, 23, 42, .55); }
    .select-event { width: fit-content; margin-bottom: .8rem; color: var(--accent); }
    .select-event.selected { border-color: var(--border-strong); background: rgba(8, 145, 178, .16); }
    .actions { margin-top: .7rem; }
    .actions > * { flex: 1; }
    hr { margin: 1.35rem 0; border: 0; border-top: 1px solid var(--border); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: .45rem .75rem; margin: .85rem 0; font-size: .9rem; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    ul { margin: .4rem 0 .8rem; padding-left: 1.2rem; }
    details { margin-top: .75rem; color: #cbd5e1; }
    summary { cursor: pointer; color: var(--accent); }
    .risk { border-left: .2rem solid var(--warning); padding-left: .7rem; color: #fde68a; }
    .empty { padding: 3rem 0; text-align: center; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } .profile { position: static; order: -1; max-height: none; } }
    @media (max-width: 560px) { .header-row { flex-direction: column; } .header-row > label { width: 100%; } main, header { padding-inline: 1rem; } }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div><h1 data-i18n="title"></h1><p id="generated"></p></div>
      <label><span data-i18n="language"></span><select id="language"><option value="en">English</option><option value="zh-CN">简体中文</option></select></label>
    </div>
  </header>
  <main>
    <section>
      <section class="panel filters" aria-label="Hackathon filters">
        <label><span data-i18n="search"></span><input id="search" type="search" data-i18n-placeholder="searchPlaceholder"></label>
        <label><span data-i18n="fromDate"></span><input id="fromDate" type="date"></label>
        <label><span data-i18n="toDate"></span><input id="toDate" type="date"></label>
        <label><span data-i18n="location"></span><select id="location"><option value=""></option></select></label>
        <label><span data-i18n="format"></span><select id="mode"><option value=""></option></select></label>
        <label><span data-i18n="type"></span><select id="eventType"><option value=""></option></select></label>
        <label><span data-i18n="requirement"></span><select id="requirement"><option value=""></option></select></label>
        <label><span data-i18n="track"></span><select id="track"><option value=""></option></select></label>
        <label><span data-i18n="prize"></span><select id="prize"><option value=""></option></select></label>
        <button id="resetFilters" type="button" data-i18n="resetFilters"></button>
      </section>
      <p class="summary" id="summary"></p>
      <section class="grid" id="results"></section>
    </section>

    <aside class="panel profile">
      <h2 data-i18n="profileTitle"></h2>
      <p class="hint" data-i18n="profileHint"></p>
      <form id="profileForm">
        <label><span data-i18n="country"></span><input id="profileCountry" data-i18n-placeholder="countryPlaceholder"></label>
        <label><span data-i18n="age"></span><input id="profileAge" type="number" min="1" max="120"></label>
        <label><span data-i18n="participantStatus"></span><select id="profileStatus"><option value=""></option><option value="individual"></option><option value="student"></option><option value="employee"></option><option value="government-employee"></option><option value="company"></option></select></label>
        <label><span data-i18n="teamSize"></span><input id="profileTeamSize" type="number" min="1"></label>
        <label><span data-i18n="skills"></span><input id="profileSkills" data-i18n-placeholder="commaSeparated"></label>
        <label><span data-i18n="preferredTracks"></span><input id="profileTracks" data-i18n-placeholder="commaSeparated"></label>
        <fieldset><legend data-i18n="targetPlatforms"></legend><div class="check-grid">
          <label><input type="checkbox" name="platform" value="web"><span data-i18n="web"></span></label>
          <label><input type="checkbox" name="platform" value="mobile"><span data-i18n="mobile"></span></label>
          <label><input type="checkbox" name="platform" value="AI/ML"><span data-i18n="AI/ML"></span></label>
          <label><input type="checkbox" name="platform" value="hardware"><span data-i18n="hardware"></span></label>
        </div></fieldset>
        <fieldset><legend data-i18n="deliveryCapabilities"></legend><div class="check-grid">
          <label><input id="canAttend" type="checkbox"><span data-i18n="inPerson"></span></label>
          <label><input id="canPublicRepo" type="checkbox"><span data-i18n="publicRepo"></span></label>
          <label><input id="canDemoVideo" type="checkbox"><span data-i18n="demoVideo"></span></label>
          <label><input id="canLiveDeploy" type="checkbox"><span data-i18n="liveDeployment"></span></label>
          <label><input id="canOpenSource" type="checkbox"><span data-i18n="openSource"></span></label>
        </div></fieldset>
        <fieldset><legend data-i18n="storeAccounts"></legend><div class="check-grid">
          <label><input type="checkbox" name="storeAccount" value="apple">Apple</label>
          <label><input type="checkbox" name="storeAccount" value="google">Google Play</label>
          <label><input type="checkbox" name="storeAccount" value="galaxy">Galaxy Store</label>
        </div></fieldset>
        <label><span data-i18n="vendorAccounts"></span><input id="profileVendors" data-i18n-placeholder="vendorPlaceholder"></label>
        <label><span data-i18n="prizePreference"></span><select id="profilePrize"><option value=""></option><option value="cash">Cash</option><option value="credits">Credits</option><option value="hardware">Hardware</option><option value="services">Services</option><option value="swag">Swag</option><option value="other">Other</option></select></label>
        <label class="check-grid"><input id="applyProfile" type="checkbox"><span data-i18n="applyProfile"></span></label>
        <div class="actions"><button type="reset" class="secondary" data-i18n="resetProfile"></button></div>
      </form>
      <p class="hint" data-i18n="privacyNote"></p>
      <hr>
      <h2 data-i18n="briefTitle"></h2>
      <p class="hint" data-i18n="briefHint"></p>
      <textarea id="brainstormBrief" readonly data-i18n-placeholder="briefEmpty"></textarea>
      <div class="actions">
        <button id="copyBrief" type="button" data-i18n="copyBrief"></button>
        <button id="downloadBrief" type="button" class="secondary" data-i18n="downloadBrief"></button>
      </div>
    </aside>
  </main>
  <script>
    const data = ${embeddedData};
    const hackathons = data.hackathons;
    const dictionaries = {
      en: {
        title: "Hackathon Shortlist", language: "Language", generated: "Generated", verifiedAt: "Verified", search: "Search", searchPlaceholder: "Name, track, skill, requirement",
        fromDate: "Deadline from", toDate: "Deadline to", location: "Location", format: "Format", type: "Type", requirement: "Requirement", track: "Track", prize: "Prize", all: "All", resetFilters: "Reset filters", online: "Online", "in-person": "In person", hybrid: "Hybrid", web: "Web", mobile: "Mobile", "AI/ML": "AI/ML",
        profileTitle: "Participant profile", profileHint: "Use your capabilities to remove events with hard blockers and rank the closest fit.", country: "Country / region", countryPlaceholder: "e.g. CN", age: "Age", participantStatus: "Participant status", teamSize: "Team size", skills: "Skill stack", preferredTracks: "Preferred tracks", commaSeparated: "Comma-separated", targetPlatforms: "Build targets", deliveryCapabilities: "What you can deliver", inPerson: "Attend in person", publicRepo: "Public repository", demoVideo: "Demo video", liveDeployment: "Live deployment", openSource: "Open-source license", storeAccounts: "Developer accounts", vendorAccounts: "Cloud / vendor accounts", vendorPlaceholder: "e.g. AWS, OpenAI", prizePreference: "Prize preference", applyProfile: "Apply hard profile matching", resetProfile: "Reset profile", privacyNote: "Profile data stays in this browser tab and is not uploaded.", briefTitle: "Agent brainstorm brief", briefHint: "Select one or more events to prepare a Markdown handoff for another agent.", briefEmpty: "Select a hackathon to generate the brief.", selectEvent: "Select for brainstorm", copyBrief: "Copy brief", copiedBrief: "Copied", downloadBrief: "Download .md",
        individual: "Individual", student: "Student", employee: "Employee", "government-employee": "Government employee", company: "Company", results: "{shown} of {total} hackathons", noResults: "No hackathons match these filters.", deadline: "Deadline", eligibility: "Eligibility", prizes: "Prizes", requirements: "Requirements", submission: "Submission", evidence: "Evidence sources", risk: "Risk", compatible: "Profile match", blocked: "Profile blockers", fit: "soft matches", briefHeading: "Hackathon Brainstorm Brief", profileHeading: "Participant Profile", eventHeading: "Selected Hackathon", brainstormGoals: "Brainstorming Goals", ideasPrompt: "Generate project concepts aligned with the tracks, required technology, submission rules, prizes, and participant capabilities.", feasibilityPrompt: "For each concept, assess feasibility before the deadline, rule compliance, differentiation, implementation plan, demo story, and risks.", unknown: "Not provided",

        countryExcluded: "Country is excluded", countryNotAllowed: "Country is outside the allowed list", eligibilityUnverified: "Eligibility is not verified", statusBlocked: "Participant status is not allowed", ageBlocked: "Minimum age not met", teamSizeBlocked: "Team size is outside the allowed range", inPersonBlocked: "In-person attendance required", publicRepoBlocked: "Public repository required", demoVideoBlocked: "Demo video required", liveDeploymentBlocked: "Live deployment required", openSourceBlocked: "Open-source license required", storeBlocked: "Missing store account", vendorBlocked: "Missing vendor account", platformBlocked: "Build target does not match", cash: "Cash", credits: "Credits", hardware: "Hardware", services: "Services", swag: "Swag", other: "Other", eventUrl: "Event URL", rulesUrl: "Official rules", tracks: "Tracks", mustUse: "Must-use technology", technologies: "Technologies", platforms: "Build targets", sources: "Sources", minimumAge: "Minimum age", allowedCountries: "Allowed countries", excludedCountries: "Excluded countries", allowedStatuses: "Allowed participant statuses", excludedStatuses: "Excluded participant statuses", requiredStoreAccounts: "Required store accounts", requiredVendorAccounts: "Required vendor accounts", apple: "Apple", google: "Google Play", galaxy: "Galaxy Store", recommendationPrompt: "Recommend the strongest concept with a first implementation slice and a demo plan."
      },
      "zh-CN": {
        title: "黑客松候选清单", language: "语言", generated: "生成时间", verifiedAt: "核验时间", search: "搜索", searchPlaceholder: "名称、赛道、技能或要求",
        fromDate: "截止时间从", toDate: "截止时间至", location: "地点", format: "形式", type: "类型", requirement: "要求", track: "赛道", prize: "奖品", all: "全部", resetFilters: "重置筛选", online: "线上", "in-person": "线下", hybrid: "混合", web: "网页", mobile: "移动应用", "AI/ML": "AI/ML",
        profileTitle: "参赛者画像", profileHint: "根据你的能力排除存在硬性门槛的赛事，并优先展示更匹配的项目。", country: "国家 / 地区", countryPlaceholder: "例如：CN", age: "年龄", participantStatus: "参赛身份", teamSize: "队伍人数", skills: "技能栈", preferredTracks: "偏好赛道", commaSeparated: "用逗号分隔", targetPlatforms: "开发方向", deliveryCapabilities: "可交付能力", inPerson: "可线下参赛", publicRepo: "可公开代码仓库", demoVideo: "可制作演示视频", liveDeployment: "可提供在线部署", openSource: "可使用开源许可证", storeAccounts: "开发者账号", vendorAccounts: "云平台 / 厂商账号", vendorPlaceholder: "例如：AWS、OpenAI", prizePreference: "奖品偏好", applyProfile: "启用画像硬条件匹配", resetProfile: "重置画像", privacyNote: "画像数据仅保存在当前浏览器标签页，不会上传。", briefTitle: "Agent 头脑风暴简报", briefHint: "选择一个或多个赛事，生成可交给其他 Agent 的 Markdown 上下文。", briefEmpty: "请选择赛事以生成简报。", selectEvent: "选择用于头脑风暴", copyBrief: "复制简报", copiedBrief: "已复制", downloadBrief: "下载 .md",
        individual: "个人", student: "学生", employee: "员工", "government-employee": "政府雇员", company: "公司", results: "显示 {shown} / {total} 个黑客松", noResults: "没有符合当前筛选条件的黑客松。", deadline: "截止时间", eligibility: "参赛资格", prizes: "奖品", requirements: "参赛要求", submission: "提交材料", evidence: "证据来源", risk: "风险", compatible: "画像匹配", blocked: "画像不匹配", fit: "项软匹配", briefHeading: "黑客松头脑风暴简报", profileHeading: "参赛者画像", eventHeading: "已选赛事", brainstormGoals: "头脑风暴目标", ideasPrompt: "提出符合赛道、必用技术、提交规则、奖品方向和参赛者能力的项目创意。", feasibilityPrompt: "逐个评估截止日前的可行性、规则合规性、差异化、实现计划、演示故事和主要风险。", unknown: "未填写",

        countryExcluded: "所在国家或地区被排除", countryNotAllowed: "所在国家或地区不在允许范围", eligibilityUnverified: "参赛资格未核实", statusBlocked: "参赛身份不符合要求", ageBlocked: "未达到最低年龄", teamSizeBlocked: "队伍人数不符合要求", inPersonBlocked: "要求线下参赛", publicRepoBlocked: "要求公开代码仓库", demoVideoBlocked: "要求演示视频", liveDeploymentBlocked: "要求在线部署", openSourceBlocked: "要求开源许可证", storeBlocked: "缺少应用商店开发者账号", vendorBlocked: "缺少云平台或厂商账号", platformBlocked: "开发方向不匹配", cash: "现金", credits: "额度", hardware: "硬件", services: "服务", swag: "周边", other: "其他", eventUrl: "赛事链接", rulesUrl: "官方规则", tracks: "赛道", mustUse: "必用技术", technologies: "技术栈", platforms: "开发方向", sources: "来源", minimumAge: "最低年龄", allowedCountries: "允许国家或地区", excludedCountries: "排除国家或地区", allowedStatuses: "允许的参赛身份", excludedStatuses: "排除的参赛身份", requiredStoreAccounts: "所需应用商店账号", requiredVendorAccounts: "所需云平台或厂商账号", apple: "Apple", google: "Google Play", galaxy: "Galaxy Store", recommendationPrompt: "推荐最强的一个方案，并给出第一个实现切片和演示计划。"
      }
    };
    let locale = dictionaries[data.defaultLocale] ? data.defaultLocale : (navigator.language.startsWith("zh") ? "zh-CN" : "en");
    let dateFormatter;
    const dateKeyFormatter = new Intl.DateTimeFormat("en", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const records = hackathons.map(item => ({ item, deadlineTimestamp: Date.parse(item.deadlineAt), deadlineKey: dateKey(item.deadlineAt), searchText: JSON.stringify(item).toLowerCase() }));
    const language = document.querySelector("#language");
    language.value = locale;
    const controls = Object.fromEntries(["search", "fromDate", "toDate", "location", "mode", "eventType", "requirement", "track", "prize"].map(id => [id, document.querySelector("#" + id)]));
    const profileForm = document.querySelector("#profileForm");
    const results = document.querySelector("#results");
    const summary = document.querySelector("#summary");
    const brainstormBrief = document.querySelector("#brainstormBrief");
    const selectedKeys = new Set();

    populate(controls.location, valuesOf(hackathons, item => [item.location?.label, ...(item.location?.countries || [])]));
    populate(controls.mode, valuesOf(hackathons, item => [item.location?.mode]), true);
    populate(controls.eventType, valuesOf(hackathons, item => item.eventTypes));
    populate(controls.requirement, valuesOf(hackathons, item => [...(item.requirements || []), ...(item.eligibility?.requirements || [])]));
    populate(controls.track, valuesOf(hackathons, item => item.tracks));
    populate(controls.prize, valuesOf(hackathons, item => (item.prizes || []).map(prize => prize.type)), true);

    for (const control of Object.values(controls)) control.addEventListener("input", render);
    profileForm.addEventListener("input", event => {
      if (event.target.id === "applyProfile" || document.querySelector("#applyProfile").checked) render();
      else updateBrief(readProfile());
    });
    profileForm.addEventListener("reset", () => setTimeout(render));
    document.querySelector("#resetFilters").addEventListener("click", () => {
      for (const control of Object.values(controls)) control.value = "";
      render();
    });
    language.addEventListener("input", () => { locale = language.value; translatePage(); render(); });
    document.querySelector("#copyBrief").addEventListener("click", async event => {
      if (!brainstormBrief.value) return;
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(brainstormBrief.value);
      } catch {
        brainstormBrief.select();
        document.execCommand("copy");
      }
      button.textContent = t("copiedBrief");
      setTimeout(() => { button.textContent = t("copyBrief"); }, 1200);
    });
    document.querySelector("#downloadBrief").addEventListener("click", () => {
      if (!brainstormBrief.value) return;
      const url = URL.createObjectURL(new Blob([brainstormBrief.value], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "hackathon-brainstorm-brief.md";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url));
    });

    translatePage();
    render();

    function translatePage() {
      document.documentElement.lang = locale;
      document.title = t("title");
      dateFormatter = new Intl.DateTimeFormat(locale, { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" });
      for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
      for (const node of document.querySelectorAll("[data-i18n-placeholder]")) node.placeholder = t(node.dataset.i18nPlaceholder);
      for (const select of [...Object.values(controls), document.querySelector("#profileStatus"), document.querySelector("#profilePrize")]) {
        if (select?.options?.[0]) select.options[0].textContent = t("all");
      }
      const statuses = document.querySelector("#profileStatus").options;
      for (let index = 1; index < statuses.length; index++) statuses[index].textContent = t(statuses[index].value);
      const prizeOptions = document.querySelector("#profilePrize").options;
      for (let index = 1; index < prizeOptions.length; index++) prizeOptions[index].textContent = t(prizeOptions[index].value);
      for (const option of document.querySelectorAll("option[data-enum]")) option.textContent = t(option.value);
      document.querySelector("#generated").textContent = t("generated") + " " + formatDate(data.generatedAt) + " · " + data.timezone;
    }

    function render() {
      const query = controls.search.value.trim().toLowerCase();
      const profile = readProfile();
      const candidates = records
        .map(record => ({ ...record, match: profile.enabled ? matchProfile(record.item, profile) : { blockers: [], score: 0 } }))
        .filter(({ searchText }) => !query || searchText.includes(query))
        .filter(({ deadlineKey }) => withinDates(deadlineKey))
        .filter(({ item }) => matches(controls.location.value, [item.location?.label, ...(item.location?.countries || [])]))
        .filter(({ item }) => matches(controls.mode.value, [item.location?.mode]))
        .filter(({ item }) => matches(controls.eventType.value, item.eventTypes))
        .filter(({ item }) => matches(controls.requirement.value, [...item.requirements, ...item.eligibility.requirements]))
        .filter(({ item }) => matches(controls.track.value, item.tracks))
        .filter(({ item }) => matches(controls.prize.value, item.prizes.map(prize => prize.type)))
        .filter(({ match }) => !profile.enabled || match.blockers.length === 0)
        .sort((a, b) => profile.enabled && b.match.score !== a.match.score ? b.match.score - a.match.score : a.deadlineTimestamp - b.deadlineTimestamp);

      results.replaceChildren(...candidates.map(({ item, match }) => buildCard(item, match, profile.enabled)));
      summary.textContent = interpolate(t("results"), { shown: candidates.length, total: hackathons.length });
      if (!candidates.length) results.replaceChildren(element("p", "empty", t("noResults")));
      updateBrief(profile);
    }

    function readProfile() {
      return {
        enabled: document.querySelector("#applyProfile").checked,
        country: document.querySelector("#profileCountry").value.trim(),
        age: Number(document.querySelector("#profileAge").value) || null,
        status: document.querySelector("#profileStatus").value,
        teamSize: Number(document.querySelector("#profileTeamSize").value) || null,
        skills: splitValues(document.querySelector("#profileSkills").value),
        tracks: splitValues(document.querySelector("#profileTracks").value),
        platforms: checkedValues("platform"),
        canAttend: document.querySelector("#canAttend").checked,
        canPublicRepo: document.querySelector("#canPublicRepo").checked,
        canDemoVideo: document.querySelector("#canDemoVideo").checked,
        canLiveDeploy: document.querySelector("#canLiveDeploy").checked,
        canOpenSource: document.querySelector("#canOpenSource").checked,
        storeAccounts: checkedValues("storeAccount"),
        vendorAccounts: splitValues(document.querySelector("#profileVendors").value),
        prize: document.querySelector("#profilePrize").value
      };
    }

    function matchProfile(item, profile) {
      const blockers = [];
      const eligibility = item.eligibility || {};
      const capabilities = item.capabilities || {};
      const country = normalize(profile.country);
      const excluded = new Set((eligibility.excludedCountries || []).map(normalize));
      const allowed = new Set((eligibility.allowedCountries || []).map(normalize));
      const allowedStatuses = new Set((eligibility.allowedParticipantStatuses || []).map(normalize));
      const excludedStatuses = new Set((eligibility.excludedParticipantStatuses || []).map(normalize));
      if (eligibility.verdict !== "eligible") blockers.push(t("eligibilityUnverified"));
      if (country && excluded.has(country)) blockers.push(t("countryExcluded"));
      if (country && allowed.size && !allowed.has("*") && !allowed.has(country)) blockers.push(t("countryNotAllowed"));
      if (profile.age && eligibility.minimumAge && profile.age < eligibility.minimumAge) blockers.push(t("ageBlocked"));
      if (profile.status && ((allowedStatuses.size && !allowedStatuses.has(normalize(profile.status))) || excludedStatuses.has(normalize(profile.status)))) blockers.push(t("statusBlocked"));
      if (profile.teamSize && eligibility.teamSize && (profile.teamSize < eligibility.teamSize.min || profile.teamSize > eligibility.teamSize.max)) blockers.push(t("teamSizeBlocked"));
      if (capabilities.inPersonAttendance && !profile.canAttend) blockers.push(t("inPersonBlocked"));
      if (capabilities.publicRepository && !profile.canPublicRepo) blockers.push(t("publicRepoBlocked"));
      if (capabilities.demoVideo && !profile.canDemoVideo) blockers.push(t("demoVideoBlocked"));
      if (capabilities.liveDeployment && !profile.canLiveDeploy) blockers.push(t("liveDeploymentBlocked"));
      if (capabilities.openSourceLicense && !profile.canOpenSource) blockers.push(t("openSourceBlocked"));
      for (const account of capabilities.storeAccounts || []) if (!profile.storeAccounts.map(normalize).includes(normalize(account))) blockers.push(t("storeBlocked") + ": " + account);
      for (const account of capabilities.vendorAccounts || []) if (!profile.vendorAccounts.map(normalize).includes(normalize(account))) blockers.push(t("vendorBlocked") + ": " + account);
      if (profile.platforms.length && item.platforms?.length && !overlaps(profile.platforms, item.platforms)) blockers.push(t("platformBlocked"));
      if (profile.prize && !(item.prizes || []).some(prize => prize.type === profile.prize)) blockers.push(t("prize") + ": " + profile.prize);
      const score = intersectionCount(profile.skills, item.technologies) + intersectionCount(profile.tracks, item.tracks);
      return { blockers: unique(blockers), score };
    }

    function buildCard(item, profileMatch, profileEnabled) {
      const card = document.createElement("article");
      const selector = element("label", "select-event");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedKeys.has(item.id);
      card.classList.toggle("selected", checkbox.checked);
      selector.classList.toggle("selected", checkbox.checked);
      checkbox.addEventListener("input", () => {
        if (checkbox.checked) selectedKeys.add(item.id);
        else selectedKeys.delete(item.id);
        card.classList.toggle("selected", checkbox.checked);
        selector.classList.toggle("selected", checkbox.checked);
        updateBrief(readProfile());
      });
      selector.append(checkbox, document.createTextNode(t("selectEvent")));
      card.append(selector);

      const title = document.createElement("h2");
      const eventLink = safeLink(item.name, item.url);
      title.append(eventLink || document.createTextNode(item.name));
      card.append(title);

      const badges = element("div", "badges");
      for (const value of unique([...(item.eventTypes || []), ...(item.tracks || [])])) badges.append(element("span", "badge", value));
      badges.prepend(element("span", "badge", t(item.location?.mode)));
      if (profileEnabled) badges.append(element("span", "badge match", t("compatible") + " · " + profileMatch.score + " " + t("fit")));
      card.append(badges);

      const facts = document.createElement("dl");
      addFact(facts, t("deadline"), formatDate(item.deadlineAt));
      addFact(facts, t("verifiedAt"), formatDate(item.verifiedAt));
      addFact(facts, t("location"), item.location?.label || "—");
      addFact(facts, t("eligibility"), item.eligibility?.summary || item.eligibility?.verdict || "—");
      addFact(facts, t("prizes"), (item.prizes || []).map(prize => prize.label + ": " + prize.value).join("; ") || "—");
      card.append(facts);

      addList(card, t("requirements"), [...(item.eligibility?.requirements || []), ...(item.requirements || [])]);
      addList(card, t("submission"), item.submissionArtifacts || []);
      if (item.risk) card.append(element("p", "risk", t("risk") + ": " + item.risk));

      const sourceDetails = document.createElement("details");
      sourceDetails.append(element("summary", "", t("evidence")));
      const sourceList = document.createElement("ul");
      for (const source of item.sources || []) {
        const listItem = document.createElement("li");
        const link = safeLink(source.label || source.url, source.url);
        listItem.append(link || document.createTextNode(source.label || t("evidence")));
        if (source.supports?.length) listItem.append(document.createTextNode(" — " + source.supports.join(", ")));
        sourceList.append(listItem);
      }
      sourceDetails.append(sourceList);
      card.append(sourceDetails);
      return card;
    }

    function updateBrief(profile) {
      const selected = hackathons.filter(item => selectedKeys.has(item.id));
      brainstormBrief.value = selected.length ? buildBrief(selected, profile) : "";
    }

    function buildBrief(selected, profile) {
      const lines = [
        "# " + t("briefHeading"),
        "",
        "## " + t("profileHeading"),
        "",
        "- " + t("country") + ": " + valueOrUnknown(profile.country),
        "- " + t("age") + ": " + valueOrUnknown(profile.age),
        "- " + t("participantStatus") + ": " + valueOrUnknown(profile.status ? t(profile.status) : ""),
        "- " + t("teamSize") + ": " + valueOrUnknown(profile.teamSize),
        "- " + t("skills") + ": " + listOrUnknown(profile.skills),
        "- " + t("preferredTracks") + ": " + listOrUnknown(profile.tracks),
        "- " + t("targetPlatforms") + ": " + listOrUnknown(profile.platforms.map(value => t(value))),
        "- " + t("storeAccounts") + ": " + listOrUnknown(profile.storeAccounts.map(value => t(value))),
        "- " + t("vendorAccounts") + ": " + listOrUnknown(profile.vendorAccounts),
        "- " + t("deliveryCapabilities") + ": " + listOrUnknown(profileCapabilities(profile)),
        "- " + t("prizePreference") + ": " + valueOrUnknown(profile.prize ? t(profile.prize) : ""),
        ""
      ];

      for (const item of selected) {
        const eligibility = item.eligibility;
        const capabilities = item.capabilities;
        lines.push(
          "## " + t("eventHeading") + ": " + markdownText(item.name),
          "",
          "- " + t("eventUrl") + ": <" + markdownUrl(item.url) + ">",
          "- " + t("rulesUrl") + ": <" + markdownUrl(item.rulesUrl) + ">",
          "- " + t("deadline") + ": " + valueOrUnknown(formatDate(item.deadlineAt) + (item.deadlineSourceText ? " (" + item.deadlineSourceText + ")" : "")),
          "- " + t("verifiedAt") + ": " + valueOrUnknown(formatDate(item.verifiedAt)),
          "- " + t("location") + ": " + valueOrUnknown(item.location?.label) + " / " + valueOrUnknown(t(item.location?.mode)),
          "- " + t("type") + ": " + listOrUnknown(item.eventTypes),
          "- " + t("tracks") + ": " + listOrUnknown(item.tracks),
          "- " + t("technologies") + ": " + listOrUnknown(item.technologies),
          "- " + t("platforms") + ": " + listOrUnknown(item.platforms.map(value => t(value))),
          "- " + t("eligibility") + ": " + valueOrUnknown(eligibility.summary),
          "- " + t("allowedCountries") + ": " + listOrUnknown(eligibility.allowedCountries),
          "- " + t("excludedCountries") + ": " + listOrUnknown(eligibility.excludedCountries),
          "- " + t("minimumAge") + ": " + valueOrUnknown(eligibility.minimumAge),
          "- " + t("allowedStatuses") + ": " + listOrUnknown(eligibility.allowedParticipantStatuses.map(value => t(value))),
          "- " + t("excludedStatuses") + ": " + listOrUnknown(eligibility.excludedParticipantStatuses.map(value => t(value))),
          "- " + t("teamSize") + ": " + eligibility.teamSize.min + "–" + eligibility.teamSize.max,
          "- " + t("requirements") + ": " + listOrUnknown([...eligibility.requirements, ...item.requirements]),
          "- " + t("mustUse") + ": " + listOrUnknown(item.mustUse),
          "- " + t("submission") + ": " + listOrUnknown(item.submissionArtifacts),
          "- " + t("deliveryCapabilities") + ": " + listOrUnknown(eventCapabilities(capabilities)),
          "- " + t("requiredStoreAccounts") + ": " + listOrUnknown(capabilities.storeAccounts.map(value => t(value))),
          "- " + t("requiredVendorAccounts") + ": " + listOrUnknown(capabilities.vendorAccounts),
          "- " + t("prizes") + ": " + valueOrUnknown(item.prizes.map(prize => prize.label + ": " + prize.value + " [" + t(prize.type) + "]").join("; ")),
          "- " + t("risk") + ": " + valueOrUnknown(item.risk),
          "",
          "### " + t("sources"),
          ""
        );
        for (const source of item.sources) lines.push("- [" + markdownText(source.label) + "](<" + markdownUrl(source.url) + ">) — " + listOrUnknown(source.supports));
        lines.push("");
      }

      lines.push(
        "## " + t("brainstormGoals"),
        "",
        "1. " + t("ideasPrompt"),
        "2. " + t("feasibilityPrompt"),
        "3. " + t("recommendationPrompt")
      );
      return lines.join(String.fromCharCode(10));
    }

    function valueOrUnknown(value) { return value === null || value === undefined || value === "" ? t("unknown") : markdownText(value); }
    function listOrUnknown(values = []) { return values.length ? unique(values).map(markdownText).join(", ") : t("unknown"); }
    function markdownText(value) {
      const slash = String.fromCharCode(92);
      return String(value).replaceAll(slash, slash + slash).replaceAll("[", slash + "[").replaceAll("]", slash + "]").replaceAll(String.fromCharCode(10), " ").replaceAll(String.fromCharCode(13), " ").trim();
    }
    function markdownUrl(value) { return new URL(value).href.replaceAll(">", "%3E"); }
    function profileCapabilities(profile) {
      return capabilityLabels(profile);
    }
    function eventCapabilities(capabilities) {
      return capabilityLabels({
        canAttend: capabilities.inPersonAttendance,
        canPublicRepo: capabilities.publicRepository,
        canDemoVideo: capabilities.demoVideo,
        canLiveDeploy: capabilities.liveDeployment,
        canOpenSource: capabilities.openSourceLicense
      });
    }
    function capabilityLabels(capabilities) {
      return [
        [capabilities.canAttend, t("inPerson")],
        [capabilities.canPublicRepo, t("publicRepo")],
        [capabilities.canDemoVideo, t("demoVideo")],
        [capabilities.canLiveDeploy, t("liveDeployment")],
        [capabilities.canOpenSource, t("openSource")]
      ].filter(([enabled]) => enabled).map(([, label]) => label);
    }

    function addFact(list, label, value) { list.append(element("dt", "", label), element("dd", "", value)); }
    function addList(parent, label, values) {
      if (!values.length) return;
      const details = document.createElement("details");
      details.append(element("summary", "", label));
      const list = document.createElement("ul");
      for (const value of unique(values)) list.append(element("li", "", value));
      details.append(list);
      parent.append(details);
    }
    function withinDates(deadlineKey) {
      return (!controls.fromDate.value || deadlineKey >= controls.fromDate.value) && (!controls.toDate.value || deadlineKey <= controls.toDate.value);
    }
    function matches(selected, values = []) { return !selected || values.filter(Boolean).includes(selected); }
    function valuesOf(items, select) { return unique(items.flatMap(item => select(item) || []).filter(Boolean)); }
    function splitValues(value) { return value.split(/[,，]/).map(part => part.trim()).filter(Boolean); }
    function checkedValues(name) { return [...document.querySelectorAll('input[name="' + name + '"]:checked')].map(input => input.value); }
    function normalize(value) { return String(value || "").trim().toLowerCase(); }
    function overlaps(left, right = []) { return intersectionCount(left, right) > 0; }
    function intersectionCount(left, right = []) {
      const normalized = new Set(right.map(normalize));
      return left.map(normalize).filter(value => normalized.has(value)).length;
    }
    function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))); }
    function populate(select, values, translateValues = false) {
      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        if (translateValues) option.dataset.enum = "";
        option.textContent = translateValues ? t(value) : value;
        select.append(option);
      }
    }
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function safeLink(label, href) {
      try {
        const url = new URL(href);
        if (!["http:", "https:"].includes(url.protocol)) return null;
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = label;
        return link;
      } catch { return null; }
    }
    function formatDate(value) {
      const date = new Date(value);
      return Number.isNaN(date.valueOf()) ? "—" : dateFormatter.format(date);
    }
    function dateKey(value) {
      const parts = Object.fromEntries(dateKeyFormatter.formatToParts(new Date(value)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
      return [parts.year, parts.month, parts.day].join("-");
    }
    function t(key) { return dictionaries[locale][key] || dictionaries.en[key] || key; }
    function interpolate(template, values) { return Object.entries(values).reduce((text, [key, value]) => text.split("{" + key + "}").join(value), template); }
  </script>
</body>
</html>`;
}
