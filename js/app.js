// 消防設備師士考試教育系統 — 純前端，localStorage 儲存
"use strict";

// ===== 常數 =====
const SUBJECTS = {
  "士": [
    { key: "law", name: "消防法規概要" },
    { key: "fire", name: "火災學概要" },
    { key: "water_chem", name: "水與化學系統消防安全設備概要" },
    { key: "alarm_escape", name: "警報與避難系統消防安全設備概要" },
  ],
  "師": [
    { key: "law", name: "消防法規" },
    { key: "fire", name: "火災學" },
    { key: "water", name: "水系統消防安全設備" },
    { key: "chem", name: "化學系統消防安全設備" },
    { key: "alarm", name: "警報系統消防安全設備" },
    { key: "escape", name: "避難系統消防安全設備" },
  ],
};
const LAW_NAMES = {
  act: "消防法", act_detail: "消防法施行細則", std: "各類場所消防安全設備設置標準",
  hazmat: "公共危險物品及可燃性高壓氣體場所設置標準暨安全管理辦法",
  review: "審查及查驗作業基準", inspect_std: "檢修基準", inspect: "檢修申報作業基準",
  lpg: "液化石油氣相關規定", fm: "防火管理相關規定",
  gas_heater: "燃氣熱水器及其配管安裝標準", license: "消防設備師及消防設備士管理辦法",
};

// ===== 儲存 =====
const DEFAULT_STORE = {
  settings: { cls: "士", examDate: "", dailyTarget: 40, quizOn: false, quizMin: 5 },
  rec: {},      // qid -> {a:作答數, c:答對數, s:連續答對}
  wrong: {},    // qid -> true（錯題本）
  lawRead: {},  // "lawKey:條號" -> "read" | "skip"
  lawNote: {},  // "lawKey:條號" -> 自己的解釋（顯示時取代原文）
  lawStar: {},  // "lawKey:條號" -> 重要性 1–5 星
  customLaws: [], // [{key, name, custom: true, articles:[{no, text}]}]
  essay: {},    // essayId -> {note, level}
  schedule: {}, // "YYYY-MM-DD" -> [{s:"19:00", e:"21:00", t:"做什麼"}]
  daily: {},    // "YYYY-MM-DD" -> 作答題數
};
let store = loadStore();
// 雲端同步狀態（宣告須在任何可能觸發 save() 的頂層程式之前，避免 TDZ）
const SYNC_API = "https://fire-exam.vercel.app/api/sync";
let syncKeyHash = null;
let syncPushTimer = null;
let syncState = "off";   // off | syncing | ok | error
let syncLastAt = null;
function loadStore() {
  try {
    const raw = localStorage.getItem("fireExam");
    if (raw) return Object.assign(JSON.parse(JSON.stringify(DEFAULT_STORE)), JSON.parse(raw));
  } catch (e) { /* 壞資料重來 */ }
  return JSON.parse(JSON.stringify(DEFAULT_STORE));
}
function persist() { localStorage.setItem("fireExam", JSON.stringify(store)); }
function save() {
  store._ts = Date.now();   // 雲端同步用：整份資料的最後修改時間（只在使用者操作時蓋）
  persist();
  pushCloudSoon();
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===== 題庫索引 =====
const QBY = {};        // qid -> q
const lawArtIdx = {};  // "law:art" / "law" -> [q]
for (const q of BANK.questions) {
  QBY[q.id] = q;
  for (const t of (q.laws || [])) {
    (lawArtIdx[t.law] = lawArtIdx[t.law] || []).push(q);
    if (t.art) {
      const k = t.law + ":" + t.art;
      (lawArtIdx[k] = lawArtIdx[k] || []).push(q);
    }
  }
}
function poolOf(cls, skey) {
  return BANK.questions.filter(q => q.cls === cls && (!skey || q.skey === skey));
}
function pdfFile(q) {
  const hi = q.year >= 110;
  const c = q.cls === "師" ? (hi ? "401" : "501") : (hi ? "402" : "502");
  const idx = q.cls === "師"
    ? { fire: 1, law: 2, alarm: 3, escape: 4, water: 5, chem: 6 }[q.skey]
    : { fire: 7, law: 8, alarm_escape: 9, water_chem: 10 }[q.skey];
  const s = (hi ? "08" : "09") + String(idx).padStart(2, "0");
  return `data/pdf/${q.year}_${c}_${s}_Q.pdf`;
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== 條文解釋 HTML 處理 =====
const NOTE_COLORS = [
  { v: "#1a1c1b", n: "預設" }, { v: "#a94b42", n: "紅" }, { v: "#8a5a2b", n: "沙" },
  { v: "#446172", n: "藍" }, { v: "#3f5f3c", n: "綠" },
];
// 只保留文字、換行與字色，其餘標籤一律解包
function sanitizeNote(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  (function clean(node) {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === Node.TEXT_NODE) continue;
      if (ch.nodeType !== Node.ELEMENT_NODE) { ch.remove(); continue; }
      clean(ch);
      const tag = ch.tagName;
      if (tag === "BR") continue;
      const color = ch.getAttribute("color") || (ch.style && ch.style.color);
      if ((tag === "FONT" || tag === "SPAN") && color) {
        const span = document.createElement("span");
        span.style.color = color;
        while (ch.firstChild) span.appendChild(ch.firstChild);
        ch.replaceWith(span);
      } else {
        if ((tag === "DIV" || tag === "P") && ch.previousSibling)
          ch.parentNode.insertBefore(document.createElement("br"), ch);
        while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
        ch.remove();
      }
    }
  })(tpl.content);
  return tpl.innerHTML;
}
// 舊版純文字解釋一次性轉為 HTML（支援上色後改存 HTML）
// 注意：這是開機整理，用 persist() 不蓋 _ts，否則全新裝置會被誤判成「比雲端新」
if (!store.settings.noteHtml) {
  for (const k in store.lawNote) store.lawNote[k] = esc(store.lawNote[k]).replace(/\n/g, "<br>");
  store.settings.noteHtml = true;
  persist();
}

// ===== 作答紀錄 =====
function recordAnswer(q, correct) {
  const r = store.rec[q.id] || { a: 0, c: 0, s: 0 };
  r.a++;
  if (correct) { r.c++; r.s++; } else { r.s = 0; }
  store.rec[q.id] = r;
  if (!correct) store.wrong[q.id] = true;
  else if (store.wrong[q.id] && r.s >= 2) delete store.wrong[q.id]; // 連對兩次移出錯題本
  store.daily[today()] = (store.daily[today()] || 0) + 1;
  save();
}
function isFree(q) { return q.answer === "#" || q.answer === ""; } // 送分/無答案
function isCorrectPick(q, letter) {
  if (isFree(q)) return true;
  return q.answer.includes(letter);
}

// ===== 共用：單題渲染 =====
// opts: {onDone(correct), showSource, variant}
function renderQuestion(container, q, opts = {}) {
  let choices = q.choices.map((c, i) => ({ text: c, letter: "ABCD"[i] }));
  let variantNote = "";
  if (opts.variant && canShuffleChoices(q)) {
    choices = shuffle(choices);
    variantNote = `<span class="tag blue">變題：選項已重排</span>`;
  }
  const lawTags = (q.laws || []).map(t =>
    `<span class="tag">${esc(LAW_NAMES[t.law] || t.law)}${t.art ? " §" + esc(t.art) : ""}</span>`).join("");
  container.innerHTML = `
    <div class="q-meta">
      <span>${q.year}年 消防設備${q.cls}《${esc(q.subject)}》第 ${q.no} 題</span>
      ${variantNote}${lawTags}
      ${opts.showSource !== false ? `<a href="${pdfFile(q)}" target="_blank">原始考卷</a>` : ""}
    </div>
    <div class="q-stem">${esc(q.stem)}</div>
    <div class="choices"></div>
    <div class="feedback"></div>`;
  const box = container.querySelector(".choices");
  const fb = container.querySelector(".feedback");
  choices.forEach(ch => {
    const b = document.createElement("button");
    b.className = "choice";
    b.innerHTML = `<b>(${ch.letter})</b> ${esc(ch.text)}`;
    b.onclick = () => {
      const correct = isCorrectPick(q, ch.letter);
      box.querySelectorAll(".choice").forEach((el, i) => {
        el.disabled = true;
        if (isCorrectPick(q, choices[i].letter)) el.classList.add("correct");
      });
      if (!correct) b.classList.add("wrongpick");
      fb.className = "feedback " + (correct ? "ok" : "bad");
      fb.textContent = correct
        ? (isFree(q) ? "本題送分（一律給分）" : "答對了！")
        : `答錯，正確答案：${q.answer}`;
      recordAnswer(q, correct);
      if (opts.onDone) opts.onDone(correct);
    };
    box.appendChild(b);
  });
}
function canShuffleChoices(q) {
  return !q.choices.some(c => /以上|皆(是|非|正確|錯誤)|^[①②③④\s]+$/.test(c.trim()));
}

// ===== 視圖切換 =====
const view = document.getElementById("view");
let currentView = "home";
function switchView(name) {
  currentView = name;
  document.querySelectorAll("nav button").forEach(b =>
    b.classList.toggle("active", b.dataset.view === name));
  ({ home: renderHome, quiz: renderQuiz, laws: renderLaws,
     calendar: renderCalendar, plan: renderPlan }[name])();
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav button").forEach(b =>
  b.onclick = () => switchView(b.dataset.view));

// 考別切換
function refreshClsBtns() {
  document.getElementById("clsShi").classList.toggle("active", store.settings.cls === "士");
  document.getElementById("clsMaster").classList.toggle("active", store.settings.cls === "師");
}
document.getElementById("clsShi").onclick = () => { store.settings.cls = "士"; save(); refreshClsBtns(); switchView(currentView); };
document.getElementById("clsMaster").onclick = () => { store.settings.cls = "師"; save(); refreshClsBtns(); switchView(currentView); };

// ===== 總覽 =====
function subjectStats(cls) {
  return SUBJECTS[cls].map(s => {
    const qs = poolOf(cls, s.key);
    let a = 0, c = 0, done = 0;
    for (const q of qs) {
      const r = store.rec[q.id];
      if (r) { a += r.a; c += r.c; done++; }
    }
    return { ...s, total: qs.length, done, acc: a ? Math.round(c / a * 100) : null };
  });
}
function renderHome() {
  const cls = store.settings.cls;
  const stats = subjectStats(cls);
  const days = examCountdown();
  const todayN = store.daily[today()] || 0;
  const readN = Object.values(store.lawRead).filter(v => v === "read").length;
  view.innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="num">${days === null ? "—" : days}</div><div class="lbl">距離考試（天）</div></div>
      <div class="stat"><div class="num">${todayN}</div><div class="lbl">今日已練題數</div></div>
      <div class="stat"><div class="num">${Object.keys(store.wrong).length}</div><div class="lbl">錯題本待複習</div></div>
      <div class="stat"><div class="num">${readN}</div><div class="lbl">已讀完條文</div></div>
    </div>
    <div class="card">
      <h2>消防設備${cls}．各科掌握度</h2>
      ${stats.map(s => `
        <div class="bar-line">
          <span class="name">${esc(s.name)}</span>
          <div class="bar-wrap"><div class="bar ${s.acc >= 60 ? "ok" : ""}" style="width:${s.acc || 0}%"></div></div>
          <span class="pct">${s.acc === null ? "尚未練習" : s.acc + "%（" + s.done + "/" + s.total + " 題）"}</span>
        </div>`).join("")}
      ${cls === "師" ? `<p class="muted">設備師除消防法規外為申論題，請至「申論題庫」練習。</p>` : ""}
    </div>
    <div class="card">
      <h2>⏰ 讀書提醒彈題</h2>
      <div class="row">
        <label><input type="checkbox" id="quizOn" ${store.settings.quizOn ? "checked" : ""}> 開啟定時彈題</label>
        <label>每 <input type="number" id="quizMin" min="1" max="120" value="${store.settings.quizMin}" style="width:60px"> 分鐘</label>
        <button class="btn small ghost" id="quizNow">立刻抽一題</button>
      </div>
      <p class="muted">開啟後，每隔設定時間會自動跳出一題考古題（優先出你在「法規閱讀」勾選「已讀完」條文的相關題目，並隨機重排選項作為變題）。</p>
    </div>`;
  document.getElementById("quizOn").onchange = e => { store.settings.quizOn = e.target.checked; save(); scheduleQuiz(); };
  document.getElementById("quizMin").onchange = e => {
    store.settings.quizMin = Math.max(1, parseInt(e.target.value) || 5); save(); scheduleQuiz();
  };
  document.getElementById("quizNow").onclick = () => popQuiz();
}
function examCountdown() {
  if (!store.settings.examDate) return null;
  const diff = Math.ceil((new Date(store.settings.examDate) - new Date()) / 86400000);
  return diff >= 0 ? diff : null;
}

// ===== 題庫測驗（練習＋模擬考合併頁） =====
let quizMode = "practice";
function renderQuiz() {
  const modes = [["practice", "📝 題庫練習"], ["exam", "⏱ 模擬考"], ["essay", "✍️ 申論題庫"], ["wrong", "📕 錯題本"]];
  view.innerHTML = `
    <div class="card">
      <div class="filter-chips">${modes.map(([m, t]) =>
        `<button class="${quizMode === m ? "active" : ""}" data-qm="${m}">${t}</button>`).join("")}</div>
    </div>
    <div id="quizBody"></div>`;
  document.querySelectorAll("[data-qm]").forEach(b =>
    b.onclick = () => { quizMode = b.dataset.qm; renderQuiz(); });
  ({ practice: renderPractice, exam: renderExam, essay: renderEssay, wrong: renderWrong }[quizMode])();
}
// 模擬考計時交卷時若不在本頁，先切回來
function quizBody() {
  let el = document.getElementById("quizBody");
  if (!el) { switchView("quiz"); el = document.getElementById("quizBody"); }
  return el;
}

// ===== 題庫練習 =====
let practice = null; // {list:[qid], i}
function renderPractice() {
  const cls = store.settings.cls;
  const subs = SUBJECTS[cls].filter(s => poolOf(cls, s.key).some(q => true));
  const years = [...new Set(poolOf(cls).map(q => q.year))].sort((a, b) => b - a);
  quizBody().innerHTML = `
    <div class="card">
      <h2>題庫練習（消防設備${cls}）</h2>
      ${cls === "師" ? `<p class="muted">設備師僅「消防法規」含測驗題，其他科目請至「申論題庫」。</p>` : ""}
      <div class="row">
        <select id="pSub">${subs.map(s => `<option value="${s.key}">${esc(s.name)}</option>`).join("")}</select>
        <select id="pYear"><option value="">全部年份</option>${years.map(y => `<option>${y}</option>`).join("")}</select>
        <select id="pScope">
          <option value="all">全部題目</option>
          <option value="new">只出沒做過的</option>
          <option value="wrong">只出錯過的</option>
        </select>
        <label><input type="checkbox" id="pShuffle" checked> 隨機出題</label>
        <button class="btn" id="pStart">開始練習</button>
      </div>
      <div id="pInfo" class="muted" style="margin-top:8px"></div>
    </div>
    <div class="card hidden" id="pQuiz">
      <div class="muted" id="pProgress"></div>
      <div id="pQ" class="q-card"></div>
      <div class="q-nav">
        <button class="btn" id="pNext" disabled>下一題 ›</button>
        <span class="muted" id="pScore"></span>
      </div>
    </div>`;
  const info = document.getElementById("pInfo");
  const updateInfo = () => {
    const list = buildPracticeList();
    info.textContent = `符合條件共 ${list.length} 題`;
  };
  ["pSub", "pYear", "pScope"].forEach(id => document.getElementById(id).onchange = updateInfo);
  updateInfo();
  document.getElementById("pStart").onclick = () => {
    let list = buildPracticeList();
    if (!list.length) { info.textContent = "沒有符合條件的題目"; return; }
    if (document.getElementById("pShuffle").checked) list = shuffle(list);
    practice = { list, i: 0, ok: 0, done: 0 };
    document.getElementById("pQuiz").classList.remove("hidden");
    showPracticeQ();
  };
}
function buildPracticeList() {
  const cls = store.settings.cls;
  const sub = document.getElementById("pSub").value;
  const year = document.getElementById("pYear").value;
  const scope = document.getElementById("pScope").value;
  return poolOf(cls, sub)
    .filter(q => !year || q.year === +year)
    .filter(q => scope === "all" || (scope === "new" ? !store.rec[q.id] : store.wrong[q.id]))
    .map(q => q.id);
}
function showPracticeQ() {
  const qid = practice.list[practice.i];
  const q = QBY[qid];
  document.getElementById("pProgress").textContent = `第 ${practice.i + 1} / ${practice.list.length} 題`;
  const next = document.getElementById("pNext");
  next.disabled = true;
  renderQuestion(document.getElementById("pQ"), q, {
    onDone: correct => {
      practice.done++; if (correct) practice.ok++;
      document.getElementById("pScore").textContent =
        `本輪答對 ${practice.ok}/${practice.done}（${Math.round(practice.ok / practice.done * 100)}%）`;
      next.disabled = false;
      if (practice.i === practice.list.length - 1) next.textContent = "完成 ✓";
    },
  });
  next.textContent = "下一題 ›";
  next.onclick = () => {
    if (practice.i < practice.list.length - 1) { practice.i++; showPracticeQ(); }
    else {
      document.getElementById("pQ").innerHTML =
        `<h3>本輪結束！答對 ${practice.ok}/${practice.done}</h3>`;
      next.disabled = true;
    }
  };
}

// ===== 模擬考 =====
let exam = null; // {qs, ans:{idx:letter}, i, endsAt, timerId, done}
function renderExam() {
  if (exam && !exam.done) { renderExamRunning(); return; }
  const cls = store.settings.cls;
  const subs = cls === "師" ? SUBJECTS["師"].filter(s => s.key === "law") : SUBJECTS[cls];
  const years = [...new Set(poolOf(cls).map(q => q.year))].sort((a, b) => b - a);
  quizBody().innerHTML = `
    <div class="card">
      <h2>模擬考（消防設備${cls}）</h2>
      <div class="row">
        <select id="eSub">${subs.map(s => `<option value="${s.key}">${esc(s.name)}</option>`).join("")}</select>
        <select id="eMode">
          <option value="year">歷屆完整卷</option>
          <option value="random">隨機組卷（40 題）</option>
        </select>
        <select id="eYear">${years.map(y => `<option>${y}</option>`).join("")}</select>
        <label>時間 <input type="number" id="eMin" value="45" min="5" max="120" style="width:60px"> 分鐘</label>
        <button class="btn" id="eStart">開始測驗</button>
      </div>
      <p class="muted">測驗中不會即時對答案，交卷後統一評分；答錯自動加入錯題本。（實際考試測驗題 40 題，每題 1.25 分）</p>
    </div>`;
  const modeSel = document.getElementById("eMode");
  modeSel.onchange = () => document.getElementById("eYear").style.display =
    modeSel.value === "year" ? "" : "none";
  document.getElementById("eStart").onclick = () => {
    const sub = document.getElementById("eSub").value;
    const mode = modeSel.value;
    let qs;
    if (mode === "year") {
      const y = +document.getElementById("eYear").value;
      qs = poolOf(cls, sub).filter(q => q.year === y).sort((a, b) => a.no - b.no);
    } else {
      qs = shuffle(poolOf(cls, sub)).slice(0, 40);
    }
    if (!qs.length) return;
    const mins = Math.max(5, parseInt(document.getElementById("eMin").value) || 45);
    exam = { qs, ans: {}, i: 0, endsAt: Date.now() + mins * 60000, done: false };
    exam.timerId = setInterval(examTick, 1000);
    renderExamRunning();
  };
}
function examTick() {
  if (!exam || exam.done) return;
  const left = exam.endsAt - Date.now();
  const el = document.getElementById("eTimer");
  if (el) {
    const m = Math.max(0, Math.floor(left / 60000)), s = Math.max(0, Math.floor(left / 1000) % 60);
    el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    el.classList.toggle("low", left < 5 * 60000);
  }
  if (left <= 0) submitExam();
}
function renderExamRunning() {
  quizBody().innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2>模擬考進行中</h2>
        <span class="timer" id="eTimer">--:--</span>
      </div>
      <div class="palette" id="ePal"></div>
      <div id="eQ" class="q-card"></div>
      <div class="q-nav">
        <button class="btn ghost" id="ePrev">‹ 上一題</button>
        <button class="btn ghost" id="eNext">下一題 ›</button>
        <button class="btn" id="eSubmit">交卷</button>
      </div>
    </div>`;
  drawPalette();
  showExamQ();
  document.getElementById("ePrev").onclick = () => { if (exam.i > 0) { exam.i--; showExamQ(); } };
  document.getElementById("eNext").onclick = () => { if (exam.i < exam.qs.length - 1) { exam.i++; showExamQ(); } };
  document.getElementById("eSubmit").onclick = () => {
    const unanswered = exam.qs.length - Object.keys(exam.ans).length;
    if (unanswered && !confirm(`還有 ${unanswered} 題未作答，確定交卷？`)) return;
    submitExam();
  };
  examTick();
}
function drawPalette() {
  const pal = document.getElementById("ePal");
  if (!pal) return;
  pal.innerHTML = "";
  exam.qs.forEach((q, i) => {
    const b = document.createElement("button");
    b.textContent = i + 1;
    if (exam.ans[i]) b.classList.add("answered");
    if (i === exam.i) b.classList.add("cur");
    b.onclick = () => { exam.i = i; showExamQ(); };
    pal.appendChild(b);
  });
}
function showExamQ() {
  const q = exam.qs[exam.i];
  const c = document.getElementById("eQ");
  c.innerHTML = `
    <div class="q-meta"><span>第 ${exam.i + 1} / ${exam.qs.length} 題（${q.year}年）</span></div>
    <div class="q-stem">${esc(q.stem)}</div>
    <div class="choices"></div>`;
  const box = c.querySelector(".choices");
  q.choices.forEach((txt, i) => {
    const letter = "ABCD"[i];
    const b = document.createElement("button");
    b.className = "choice" + (exam.ans[exam.i] === letter ? " sel" : "");
    b.innerHTML = `<b>(${letter})</b> ${esc(txt)}`;
    b.onclick = () => { exam.ans[exam.i] = letter; drawPalette(); showExamQ(); };
    box.appendChild(b);
  });
  drawPalette();
}
function submitExam() {
  clearInterval(exam.timerId);
  exam.done = true;
  quizMode = "exam";
  let ok = 0;
  exam.qs.forEach((q, i) => {
    const correct = exam.ans[i] ? isCorrectPick(q, exam.ans[i]) : false;
    if (correct) ok++;
    recordAnswer(q, correct);
  });
  exam.score = ok;
  renderExamResult();
}
function renderExamResult() {
  const n = exam.qs.length;
  const pct = Math.round(exam.score / n * 100);
  quizBody().innerHTML = `
    <div class="card">
      <h2>測驗結果</h2>
      <div class="stat-row">
        <div class="stat"><div class="num">${exam.score}/${n}</div><div class="lbl">答對題數</div></div>
        <div class="stat"><div class="num">${pct}</div><div class="lbl">百分制得分</div></div>
        <div class="stat"><div class="num" style="color:${pct >= 60 ? "var(--ok)" : "var(--bad)"}">${pct >= 60 ? "及格" : "未達 60"}</div><div class="lbl">及格線 60 分</div></div>
      </div>
      <div class="palette" id="rPal"></div>
      <div id="rQ" class="q-card"></div>
      <div class="q-nav"><button class="btn" id="rNew">再考一次</button></div>
    </div>`;
  const pal = document.getElementById("rPal");
  exam.qs.forEach((q, i) => {
    const b = document.createElement("button");
    b.textContent = i + 1;
    const correct = exam.ans[i] && isCorrectPick(q, exam.ans[i]);
    b.classList.add(correct ? "right" : "wrong");
    b.onclick = () => showResultQ(i);
    pal.appendChild(b);
  });
  document.getElementById("rNew").onclick = () => { exam = null; renderExam(); };
  showResultQ(0);
}
function showResultQ(i) {
  const q = exam.qs[i];
  const c = document.getElementById("rQ");
  const picked = exam.ans[i];
  const lawTags = (q.laws || []).map(t =>
    `<span class="tag">${esc(LAW_NAMES[t.law] || t.law)}${t.art ? " §" + esc(t.art) : ""}</span>`).join("");
  c.innerHTML = `
    <div class="q-meta"><span>第 ${i + 1} 題（${q.year}年第${q.no}題）</span>${lawTags}
      <a href="${pdfFile(q)}" target="_blank">原始考卷</a></div>
    <div class="q-stem">${esc(q.stem)}</div>
    <div class="choices">${q.choices.map((txt, j) => {
      const letter = "ABCD"[j];
      let cl = "choice";
      if (isCorrectPick(q, letter) && !isFree(q)) cl += " correct";
      if (picked === letter && !isCorrectPick(q, letter)) cl += " wrongpick";
      return `<button class="${cl}" disabled><b>(${letter})</b> ${esc(txt)}</button>`;
    }).join("")}</div>
    <div class="feedback ${picked && isCorrectPick(q, picked) ? "ok" : "bad"}">
      ${picked ? (isCorrectPick(q, picked) ? "答對" : `你的答案：${picked}，正確答案：${q.answer}`) : `未作答，正確答案：${q.answer}`}
      ${isFree(q) ? "（本題送分）" : ""}
    </div>`;
}

// ===== 申論題庫 =====
function renderEssay() {
  const cls = store.settings.cls;
  const essays = BANK.essays.filter(e => e.cls === cls);
  const subs = [...new Set(essays.map(e => e.subject))];
  const years = [...new Set(essays.map(e => e.year))].sort((a, b) => b - a);
  quizBody().innerHTML = `
    <div class="card">
      <h2>申論題庫（消防設備${cls}）</h2>
      <div class="row">
        <select id="sSub"><option value="">全部科目</option>${subs.map(s => `<option>${esc(s)}</option>`).join("")}</select>
        <select id="sYear"><option value="">全部年份</option>${years.map(y => `<option>${y}</option>`).join("")}</select>
      </div>
      <p class="muted">申論題無官方標準答案，請自行作答後自評熟練度；筆記會自動儲存。</p>
    </div>
    <div id="sList"></div>`;
  const render = () => {
    const sub = document.getElementById("sSub").value;
    const year = document.getElementById("sYear").value;
    const list = essays.filter(e => (!sub || e.subject === sub) && (!year || e.year === +year));
    document.getElementById("sList").innerHTML = list.map(e => {
      const st = store.essay[e.id] || {};
      return `
      <div class="card essay-card">
        <div class="q-meta">
          <span>${e.year}年《${esc(e.subject)}》第${esc(e.no)}題${e.points ? "（" + e.points + " 分）" : ""}</span>
          <span class="tag ${st.level === "ok" ? "blue" : ""}">${st.level === "ok" ? "已熟悉" : st.level === "weak" ? "需加強" : "未自評"}</span>
        </div>
        <div class="q-stem">${esc(e.text)}</div>
        <details ${st.note ? "open" : ""}>
          <summary class="muted">我的作答筆記</summary>
          <textarea data-eid="${e.id}" placeholder="在此擬答、記重點…">${esc(st.note || "")}</textarea>
        </details>
        <div class="q-nav">
          <button class="btn small ghost" data-lv="ok" data-eid="${e.id}">標記已熟悉</button>
          <button class="btn small ghost" data-lv="weak" data-eid="${e.id}">標記需加強</button>
        </div>
      </div>`;
    }).join("") || `<div class="card muted">沒有符合條件的申論題</div>`;
    document.querySelectorAll("#sList textarea").forEach(t => {
      t.onchange = () => {
        const st = store.essay[t.dataset.eid] || {};
        st.note = t.value; store.essay[t.dataset.eid] = st; save();
      };
    });
    document.querySelectorAll("#sList [data-lv]").forEach(b => {
      b.onclick = () => {
        const st = store.essay[b.dataset.eid] || {};
        st.level = b.dataset.lv; store.essay[b.dataset.eid] = st; save(); render();
      };
    });
  };
  document.getElementById("sSub").onchange = render;
  document.getElementById("sYear").onchange = render;
  render();
}

// ===== 錯題本／弱點分析 =====
function renderWrong() {
  const cls = store.settings.cls;
  const wrongQs = Object.keys(store.wrong).map(id => QBY[id]).filter(q => q && q.cls === cls);
  const bySub = {};
  for (const q of wrongQs) (bySub[q.subject] = bySub[q.subject] || []).push(q);
  // 弱點：依法規統計
  const lawStat = {};
  for (const q of poolOf(cls)) {
    const r = store.rec[q.id];
    if (!r) continue;
    for (const t of (q.laws || [])) {
      const k = t.law;
      lawStat[k] = lawStat[k] || { a: 0, c: 0 };
      lawStat[k].a += r.a; lawStat[k].c += r.c;
    }
  }
  const weakLaws = Object.entries(lawStat).filter(([, v]) => v.a >= 4)
    .map(([k, v]) => ({ k, acc: Math.round(v.c / v.a * 100), a: v.a }))
    .sort((x, y) => x.acc - y.acc).slice(0, 8);
  quizBody().innerHTML = `
    <div class="card">
      <h2>錯題本（消防設備${cls}）：${wrongQs.length} 題待複習</h2>
      <p class="muted">同一題連續答對 2 次自動移出錯題本。</p>
      ${Object.entries(bySub).map(([sub, qs]) => `
        <div class="row" style="justify-content:space-between; border-bottom:1px solid var(--border); padding:6px 0">
          <span>${esc(sub)}（${qs.length} 題）</span>
          <button class="btn small" data-sub="${esc(sub)}">複習這科錯題</button>
        </div>`).join("") || `<p class="muted">目前沒有錯題，繼續保持！</p>`}
    </div>
    <div class="card hidden" id="wQuiz">
      <div class="muted" id="wProgress"></div>
      <div id="wQ" class="q-card"></div>
      <div class="q-nav"><button class="btn" id="wNext" disabled>下一題 ›</button></div>
    </div>
    <div class="card">
      <h2>弱點分析（依法規）</h2>
      ${weakLaws.map(w => `
        <div class="bar-line">
          <span class="name">${esc(LAW_NAMES[w.k] || w.k)}</span>
          <div class="bar-wrap"><div class="bar ${w.acc >= 60 ? "ok" : ""}" style="width:${w.acc}%"></div></div>
          <span class="pct">${w.acc}%（${w.a} 次作答）</span>
        </div>`).join("") || `<p class="muted">作答量還不夠，多練一些題目後這裡會顯示各法規的正確率。</p>`}
    </div>`;
  document.querySelectorAll("[data-sub]").forEach(b => {
    b.onclick = () => {
      const qs = shuffle(bySub[b.dataset.sub].map(q => q.id));
      startWrongReview(qs);
    };
  });
}
function startWrongReview(list) {
  let i = 0;
  const box = document.getElementById("wQuiz");
  box.classList.remove("hidden");
  const showQ = () => {
    document.getElementById("wProgress").textContent = `錯題複習 第 ${i + 1} / ${list.length} 題`;
    const next = document.getElementById("wNext");
    next.disabled = true;
    renderQuestion(document.getElementById("wQ"), QBY[list[i]], {
      onDone: () => { next.disabled = false; },
    });
    next.onclick = () => {
      if (i < list.length - 1) { i++; showQ(); }
      else renderWrong();
    };
  };
  showQ();
  box.scrollIntoView({ behavior: "smooth" });
}

// ===== 法規閱讀 =====
let curLaw = null;
let lawFilter = "all";
let customLawEditor = null;
let customArticleEdit = null;
function allLaws() { return [...LAWS.laws, ...(store.customLaws || [])]; }
function currentLaw() { return allLaws().find(l => l.key === curLaw); }
function renderLaws() {
  curLaw = curLaw || allLaws()[0].key;
  const law = currentLaw() || allLaws()[0];
  const readCnt = law.articles.filter(a => store.lawRead[law.key + ":" + a.no] === "read").length;
  const skipCnt = law.articles.filter(a => store.lawRead[law.key + ":" + a.no] === "skip").length;
  const filters = [["all", "全部條文"], ["unread", "未讀"], ["skip", "先跳過"], ["read", "已讀"]];
  view.innerHTML = `
    <div class="law-layout">
      <aside class="law-side">
        <div class="side-title">法規分類</div>
        ${allLaws().map(l =>
          `<button class="${l.key === curLaw ? "active" : ""}" data-law="${l.key}">${esc(l.name)}</button>`).join("")}
        <button class="law-add" id="addCustomLaw" type="button">＋ 新增我的分類</button>
      </aside>
      <section>
        <div class="card">
          <div class="row">
            <h2 style="margin:0">${esc(law.name)}</h2>
            ${law.custom ? `<span class="tag blue">我的教材</span><button class="btn small" id="addCustomArticle">＋ 新增內容</button><button class="btn ghost small" id="deleteCustomLaw">刪除分類</button>` : `<a class="law-src" href="https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${law.pcode}" target="_blank">🔗 法規資料庫全文</a>`}
            <div class="read-progress">
              <span class="muted">閱讀進度 ${readCnt} / ${law.articles.length} 條${skipCnt ? `｜跳過 ${skipCnt}` : ""}</span>
              <div class="bar-wrap"><div class="bar ok" style="width:${Math.round(readCnt / Math.max(law.articles.length, 1) * 100)}%"></div></div>
            </div>
          </div>
          <div class="row" style="margin-top:12px">
            <div class="filter-chips">${filters.map(([v, t]) =>
              `<button class="${lawFilter === v ? "active" : ""}" data-f="${v}">${t}</button>`).join("")}</div>
            <input type="text" id="lSearch" placeholder="搜尋條文關鍵字…" style="width:180px; margin-left:auto">
          </div>
          <p class="muted" style="margin-top:10px">${law.custom ? "可直接新增你的教材標題與內容；每一段同樣可標記、加星或寫筆記。" : "圖示：✎ 寫解釋（儲存後取代原文顯示，原文收合可展開）｜✓ 已讀完（相關考古題進入定時彈題池）｜⚠ 不懂，先跳過。點條號旁星星標記重要性（1–5 星），點條號可開啟全國法規資料庫該條原文。"}</p>
        </div>
        ${customLawEditor ? `<div class="card custom-law-form">
          <h3>${customLawEditor === "category" ? "新增我的分類" : "新增教材內容"}</h3>
          ${customLawEditor === "category" ? `<label>分類名稱<input id="customLawName" type="text" placeholder="例如：水系統重點整理"></label>` : `<label>段落標題<input id="customArticleTitle" type="text" placeholder="例如：加壓送水裝置" value="${customArticleEdit === null ? "" : esc(law.articles[customArticleEdit].no)}"></label><label>內容<textarea id="customArticleText" placeholder="直接貼上或輸入你的教材內容">${customArticleEdit === null ? "" : esc(law.articles[customArticleEdit].text)}</textarea></label>`}
          <div class="row">${customLawEditor === "article" ? `<button class="btn ghost small" id="customVoiceInput">🎙 語音輸入</button>` : ""}<button class="btn small" id="saveCustomEntry">儲存</button><button class="btn ghost small" id="cancelCustomEntry">取消</button></div>
        </div>` : ""}
        <div id="artList"></div>
        <section class="card ai-tutor">
          <div class="row"><h3 style="margin:0">✨ 教材 AI 助教</h3><select id="aiProvider"><option value="gemini">Gemini</option><option value="openai">OpenAI</option></select></div>
          <p class="muted">會從所有法規與你的教材中找出最相關的段落；回答只依據這些教材，並標出來源。</p>
          <textarea id="aiQuestion" placeholder="例如：加壓送水裝置的啟動方式是什麼？"></textarea>
          <div class="row"><button class="btn small ghost" id="aiVoice">🎙 語音輸入</button><button class="btn small" id="aiAsk">問教材 AI</button></div>
          <div id="aiAnswer" class="ai-result"></div>
        </section>
      </section>
    </div>`;
  document.querySelectorAll("[data-law]").forEach(b =>
    b.onclick = () => { curLaw = b.dataset.law; customLawEditor = null; customArticleEdit = null; renderLaws(); });
  document.getElementById("addCustomLaw").onclick = () => { customLawEditor = "category"; renderLaws(); };
  const addArticle = document.getElementById("addCustomArticle");
  if (addArticle) addArticle.onclick = () => { customLawEditor = "article"; customArticleEdit = null; renderLaws(); };
  const deleteLaw = document.getElementById("deleteCustomLaw");
  if (deleteLaw) deleteLaw.onclick = () => {
    if (!confirm(`刪除「${law.name}」及其中所有內容？`)) return;
    store.customLaws = store.customLaws.filter(item => item.key !== law.key);
    curLaw = LAWS.laws[0].key; save(); renderLaws();
  };
  const cancelCustom = document.getElementById("cancelCustomEntry");
  if (cancelCustom) cancelCustom.onclick = () => { customLawEditor = null; customArticleEdit = null; renderLaws(); };
  const saveCustom = document.getElementById("saveCustomEntry");
  const customVoice = document.getElementById("customVoiceInput");
  if (customVoice) attachSpeechInput(customVoice, document.getElementById("customArticleText"));
  if (saveCustom) saveCustom.onclick = () => {
    if (customLawEditor === "category") {
      const name = document.getElementById("customLawName").value.trim();
      if (!name) return alert("請輸入分類名稱。");
      const item = { key: `custom-${Date.now()}`, name, custom: true, articles: [] };
      store.customLaws.push(item); curLaw = item.key;
    } else {
      const no = document.getElementById("customArticleTitle").value.trim();
      const text = document.getElementById("customArticleText").value.trim();
      if (!no || !text) return alert("請填寫段落標題與內容。");
      if (customArticleEdit === null) law.articles.push({ no, text });
      else law.articles[customArticleEdit] = { ...law.articles[customArticleEdit], no, text };
    }
    customLawEditor = null; customArticleEdit = null; save(); renderLaws();
  };
  const chips = [...document.querySelectorAll("[data-f]")];
  chips.forEach(b => b.onclick = () => {
    lawFilter = b.dataset.f;
    chips.forEach(c => c.classList.toggle("active", c === b));
    drawArts();
  });
  document.getElementById("lSearch").oninput = debounce(drawArts, 300);
  drawArts();
  wireAiTutor();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function attachSpeechInput(button, target) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    button.disabled = true;
    button.title = "此瀏覽器不支援語音輸入，請使用 Chrome 或 Edge";
    return;
  }
  button.onclick = () => {
    const recognition = new Recognition();
    recognition.lang = "zh-TW";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const original = "value" in target ? target.value : target.innerText;
    button.disabled = true;
    button.textContent = "正在聽…";
    recognition.onresult = event => {
      const spoken = [...event.results].map(result => result[0].transcript).join("").trim();
      const text = [original.trim(), spoken].filter(Boolean).join(original.trim() ? "\n" : "");
      if ("value" in target) target.value = text;
      else target.textContent = text;
      target.focus();
    };
    recognition.onerror = () => alert("語音辨識沒有成功，請確認麥克風權限後再試一次。");
    recognition.onend = () => { button.disabled = false; button.textContent = "🎙 語音輸入"; };
    recognition.start();
  };
}
function studySources(question) {
  const words = question.toLowerCase().match(/[\u4e00-\u9fff]{2,}|[a-z0-9]+/g) || [];
  const items = [
    ...allLaws().flatMap(law => law.articles.map(a => ({
    label: `${law.name}｜${a.no}`,
    text: `${a.text}\n${store.lawNote[`${law.key}:${a.no}`]?.replace(/<[^>]+>/g, "") || ""}`.trim(),
    current: law.key === curLaw,
    }))),
    ...BANK.questions.map(q => ({
      label: `考古題｜${q.year}年${q.cls} ${q.subject} 第${q.no}題`,
      text: `${q.stem || q.text || ""}\n${q.choices ? `選項：${q.choices.join("／")}\n答案：${q.answer || ""}` : ""}`.trim(),
      current: false,
    })),
  ];
  return items.map(item => ({ ...item, score: (item.current ? 2 : 0) + words.reduce((n, word) => n + (item.text.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score).slice(0, 10).map(({ label, text }) => ({ label, text }));
}
function wireAiTutor() {
  const ask = document.getElementById("aiAsk");
  if (!ask) return;
  const input = document.getElementById("aiQuestion");
  attachSpeechInput(document.getElementById("aiVoice"), input);
  ask.onclick = async () => {
    const question = input.value.trim();
    if (!question) return input.focus();
    const result = document.getElementById("aiAnswer");
    const sources = studySources(question);
    ask.disabled = true;
    result.innerHTML = `<span class="muted">正在閱讀 ${sources.length} 段相關教材…</span>`;
    try {
      const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: document.getElementById("aiProvider").value, question, sources }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "AI 暫時無法回答");
      result.innerHTML = `<div class="ai-answer">${esc(data.answer).replace(/\n/g, "<br>")}</div><div class="ai-sources">參考教材：${sources.map((s, i) => `[${i + 1}] ${esc(s.label)}`).join("　")}</div>`;
    } catch (e) {
      result.innerHTML = `<span class="muted">${esc(e.message)}</span>`;
    } finally { ask.disabled = false; }
  };
}
function drawArts() {
  const law = currentLaw();
  const filter = lawFilter;
  const kw = document.getElementById("lSearch").value.trim();
  const cls = store.settings.cls;
  const frag = [];
  let lastCh = null;
  for (const [articleIndex, a] of law.articles.entries()) {
    const stateKey = law.key + ":" + a.no;
    const st = store.lawRead[stateKey] || "";
    if (filter === "unread" && st) continue;
    if (filter === "read" && st !== "read") continue;
    if (filter === "skip" && st !== "skip") continue;
    const note = store.lawNote[stateKey] || "";
    const noteTxt = note.replace(/<[^>]+>/g, "");
    if (kw && !a.text.includes(kw) && !a.no.includes(kw) && !noteTxt.includes(kw)) continue;
    const rel = (lawArtIdx[stateKey] || []);
    const relCls = rel.filter(q => q.cls === cls);
    const relShow = relCls.length ? relCls : rel;
    if (a.chapter && a.chapter !== lastCh) {
      frag.push(`<h3 style="margin:14px 0 6px">${esc(a.chapter)}</h3>`);
      lastCh = a.chapter;
    }
    frag.push(`
      <div class="art-card ${st}" id="art-${esc(a.no)}">
        <div class="art-head">
          ${law.custom ? `<span class="art-no">${esc(a.no)}</span>` : `<a class="art-no" href="https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=${law.pcode}&flno=${esc(a.no)}" target="_blank" title="開啟全國法規資料庫原文">第 ${esc(a.no)} 條</a>`}
          <span class="stars" data-star="${stateKey}" title="標記重要性">${[1, 2, 3, 4, 5].map(n =>
            `<span class="star ${n <= (store.lawStar[stateKey] || 0) ? "on" : ""}" data-n="${n}">★</span>`).join("")}</span>
          ${relShow.length ? `<button class="chk" data-rel="${stateKey}">📌 考古題 ${relShow.length}</button>` : ""}
          <div class="art-actions">
            <button class="chk icon ${note ? "on-note" : ""}" data-note="${stateKey}" title="${note ? "改解釋" : "寫解釋"}">✎</button>
            <button class="chk icon ${st === "read" ? "on-read" : ""}" data-mark="read" data-key="${stateKey}" title="已讀完">✓</button>
            <button class="chk icon ${st === "skip" ? "on-skip" : ""}" data-mark="skip" data-key="${stateKey}" title="不懂，先跳過">⚠</button>
            ${law.custom ? `<button class="chk icon" data-custom-edit="${articleIndex}" title="更新這段教材">↻</button>` : ""}
            ${law.custom ? `<button class="chk icon custom-delete" data-custom-delete="${articleIndex}" title="刪除這段教材">🗑</button>` : ""}
          </div>
        </div>
        ${note ? `
          <div class="art-note">${sanitizeNote(note)}</div>
          <details class="art-orig"><summary>📄 條文原文（點開對照）</summary><div class="art-text">${esc(a.text)}</div></details>`
        : `<div class="art-text">${esc(a.text)}</div>`}
        <div class="note-edit hidden" data-notebox="${stateKey}"></div>
        <div class="rel-qs hidden" data-relbox="${stateKey}"></div>
      </div>`);
  }
  const box = document.getElementById("artList");
  box.innerHTML = frag.join("") || `<div class="card muted">沒有符合條件的條文</div>`;
  box.querySelectorAll("[data-mark]").forEach(b => {
    b.onclick = () => {
      const k = b.dataset.key, mode = b.dataset.mark;
      store.lawRead[k] = store.lawRead[k] === mode ? undefined : mode;
      if (!store.lawRead[k]) delete store.lawRead[k];
      save(); renderLaws();
    };
  });
  box.querySelectorAll("[data-custom-delete]").forEach(button => button.onclick = () => {
    const index = +button.dataset.customDelete;
    const article = law.articles[index];
    if (!article || !confirm(`刪除「${article.no}」這段教材？`)) return;
    law.articles.splice(index, 1);
    delete store.lawRead[`${law.key}:${article.no}`];
    delete store.lawNote[`${law.key}:${article.no}`];
    delete store.lawStar[`${law.key}:${article.no}`];
    save(); renderLaws();
  });
  box.querySelectorAll("[data-custom-edit]").forEach(button => button.onclick = () => {
    customArticleEdit = +button.dataset.customEdit;
    customLawEditor = "article";
    renderLaws();
  });
  box.querySelectorAll("[data-star]").forEach(el => {
    el.onclick = ev => {
      const n = +ev.target.dataset.n;
      if (!n) return;
      const k = el.dataset.star;
      store.lawStar[k] = store.lawStar[k] === n ? undefined : n;
      if (!store.lawStar[k]) delete store.lawStar[k];
      save(); drawArts();
    };
  });
  box.querySelectorAll("[data-note]").forEach(b => {
    b.onclick = () => {
      const k = b.dataset.note;
      const nb = box.querySelector(`[data-notebox="${k}"]`);
      if (!nb.classList.contains("hidden")) { nb.classList.add("hidden"); return; }
      nb.classList.remove("hidden");
      nb.innerHTML = `
        <div class="note-toolbar">
          <span class="muted" style="font-size:12px">選取文字後點顏色可上色：</span>
          ${NOTE_COLORS.map(c => `<button class="color-dot" data-color="${c.v}" style="background:${c.v}" title="${c.n}"></button>`).join("")}
          <button class="btn small ghost" data-voice-note>🎙 語音輸入</button>
        </div>
        <div class="note-area" contenteditable="true" data-ph="用自己的話解釋這一條，儲存後會取代原文顯示（原文收合可展開對照）"></div>
        <div class="row">
          <button class="btn small" data-nsave>儲存</button>
          <button class="btn small ghost" data-ncancel>取消</button>
          ${store.lawNote[k] ? `<button class="chk" data-ndel>移除解釋，還原原文</button>` : ""}
        </div>`;
      const ed = nb.querySelector(".note-area");
      ed.innerHTML = sanitizeNote(store.lawNote[k] || "");
      attachSpeechInput(nb.querySelector("[data-voice-note]"), ed);
      ed.focus();
      nb.querySelectorAll("[data-color]").forEach(cb => {
        cb.onmousedown = ev => ev.preventDefault();  // 按顏色鈕時保留編輯區的選取範圍
        cb.onclick = () => {
          document.execCommand("styleWithCSS", false, true);
          document.execCommand("foreColor", false, cb.dataset.color);
          ed.focus();
        };
      });
      nb.querySelector("[data-nsave]").onclick = () => {
        if (ed.textContent.trim()) store.lawNote[k] = sanitizeNote(ed.innerHTML);
        else delete store.lawNote[k];
        save(); drawArts();
      };
      nb.querySelector("[data-ncancel]").onclick = () => nb.classList.add("hidden");
      const del = nb.querySelector("[data-ndel]");
      if (del) del.onclick = () => { delete store.lawNote[k]; save(); drawArts(); };
    };
  });
  box.querySelectorAll("[data-rel]").forEach(b => {
    b.onclick = () => {
      const k = b.dataset.rel;
      const relBox = box.querySelector(`[data-relbox="${k}"]`);
      if (!relBox.classList.contains("hidden")) { relBox.classList.add("hidden"); return; }
      relBox.classList.remove("hidden");
      const cls = store.settings.cls;
      const rel = (lawArtIdx[k] || []);
      const relCls = rel.filter(q => q.cls === cls);
      relBox.innerHTML = (relCls.length ? relCls : rel).map(q =>
        `<div style="margin:4px 0"><a href="#" data-openq="${q.id}">【${q.year}年${q.cls}】${esc(q.stem.slice(0, 50))}…</a></div>`).join("");
      relBox.querySelectorAll("[data-openq]").forEach(aEl => {
        aEl.onclick = ev => { ev.preventDefault(); popQuiz(QBY[aEl.dataset.openq], false); };
      });
    };
  });
}

// ===== 日曆 =====
let calMonth = null;   // {y, m}（m: 0–11）
let calSel = null;     // "YYYY-MM-DD"
function dstr(y, m, d) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function renderCalendar() {
  const now = new Date();
  if (!calMonth) calMonth = { y: now.getFullYear(), m: now.getMonth() };
  if (!calSel) calSel = today();
  const { y, m } = calMonth;
  const days = new Date(y, m + 1, 0).getDate();
  const pad = new Date(y, m, 1).getDay();
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push("<div></div>");
  for (let d = 1; d <= days; d++) {
    const k = dstr(y, m, d);
    const dayList = store.schedule[k] || [];
    const imps = dayList.filter(x => x.imp);
    cells.push(`<button class="cal-day ${k === today() ? "today" : ""} ${k === calSel ? "sel" : ""}" data-day="${k}">
      <span class="d">${d}</span>
      ${imps.slice(0, 2).map(x => `<span class="cal-imp">⭐${esc(x.t.length > 5 ? x.t.slice(0, 5) + "…" : x.t)}</span>`).join("")}
      ${dayList.length ? `<span class="cal-n">${dayList.length} 項</span>` : ""}
    </button>`);
  }
  view.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">📅 讀書日曆</h2>
        <div class="row">
          <button class="btn ghost small" id="calPrev">‹</button>
          <b>${y} 年 ${m + 1} 月</b>
          <button class="btn ghost small" id="calNext">›</button>
        </div>
      </div>
      <div class="cal-week">${["日", "一", "二", "三", "四", "五", "六"].map(w => `<div>${w}</div>`).join("")}</div>
      <div class="cal-grid">${cells.join("")}</div>
    </div>
    <div class="card" id="calDetail"></div>`;
  document.getElementById("calPrev").onclick = () => { calMonth = m ? { y, m: m - 1 } : { y: y - 1, m: 11 }; calEdit = null; renderCalendar(); };
  document.getElementById("calNext").onclick = () => { calMonth = m < 11 ? { y, m: m + 1 } : { y: y + 1, m: 0 }; calEdit = null; renderCalendar(); };
  document.querySelectorAll("[data-day]").forEach(b =>
    b.onclick = () => { calSel = b.dataset.day; calEdit = null; renderCalendar(); });
  drawCalDetail();
}
let calEdit = null; // 編輯中行程的原始索引
function drawCalDetail() {
  const box = document.getElementById("calDetail");
  const orig = store.schedule[calSel] || [];
  const list = orig.map((it, oi) => ({ ...it, oi })).sort((a, b) => a.s.localeCompare(b.s));
  const editing = calEdit !== null ? orig[calEdit] : null;
  box.innerHTML = `
    <h2>${calSel}（週${"日一二三四五六"[new Date(calSel).getDay()]}）</h2>
    ${list.length ? list.map(it => `
      <div class="cal-item ${it.imp ? "imp" : ""} ${it.oi === calEdit ? "editing" : ""}">
        <span class="cal-time"><span class="ts">${it.s}</span><span class="te">${it.e}</span></span>
        <span class="cal-bar"></span>
        <span class="cal-txt">${it.imp ? "⭐ " : ""}${esc(it.t)}</span>
        <button class="chk icon" data-edit="${it.oi}" title="編輯">✎</button>
        <button class="chk icon" data-del="${it.oi}" title="刪除">✕</button>
      </div>`).join("") : `<p class="muted">這天還沒有安排。</p>`}
    <div class="row" style="margin-top:12px">
      <input type="time" id="calS" value="${editing ? editing.s : "19:00"}"><span class="muted">到</span>
      <input type="time" id="calE" value="${editing ? editing.e : "21:00"}">
      <input type="text" id="calT" placeholder="要做什麼？例如：讀設置標準 §1–30" style="flex:1; min-width:180px" value="${editing ? esc(editing.t) : ""}">
      <label class="muted" style="white-space:nowrap"><input type="checkbox" id="calImp" ${editing && editing.imp ? "checked" : ""}> ⭐ 重要</label>
      <button class="btn" id="calAdd">${editing ? "儲存修改" : "新增"}</button>
      ${editing ? `<button class="btn ghost" id="calCancel">取消</button>` : ""}
    </div>
    <p class="muted" style="margin-top:6px">標「⭐ 重要」的排程會直接顯示在月曆格子上。點行程旁 ✎ 可修改、✕ 刪除。</p>`;
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
    orig.splice(+b.dataset.del, 1);
    if (!orig.length) delete store.schedule[calSel];
    calEdit = null;
    save(); renderCalendar();
  });
  box.querySelectorAll("[data-edit]").forEach(b =>
    b.onclick = () => { calEdit = +b.dataset.edit; drawCalDetail(); });
  if (editing) document.getElementById("calCancel").onclick = () => { calEdit = null; drawCalDetail(); };
  document.getElementById("calAdd").onclick = () => {
    const s = document.getElementById("calS").value, e = document.getElementById("calE").value,
          t = document.getElementById("calT").value.trim();
    if (!s || !e || !t) return;
    const entry = { s, e, t };
    if (document.getElementById("calImp").checked) entry.imp = true;
    if (calEdit !== null) orig[calEdit] = entry;
    else (store.schedule[calSel] = store.schedule[calSel] || []).push(entry);
    calEdit = null;
    save(); renderCalendar();
  };
}

// ===== 讀書計畫 =====
function renderPlan() {
  const s = store.settings;
  const days = examCountdown();
  const todayN = store.daily[today()] || 0;
  // 近 7 天
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    last7.push({ k, n: store.daily[k] || 0, lbl: `${d.getMonth() + 1}/${d.getDate()}` });
  }
  const maxN = Math.max(...last7.map(x => x.n), s.dailyTarget, 1);
  // 連續天數
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (store.daily[k] > 0) streak++;
    else if (i === 0) continue; // 今天還沒練不斷 streak
    else break;
  }
  const doneUnique = Object.keys(store.rec).length;
  const readN = Object.values(store.lawRead).filter(v => v === "read").length;
  const totalArts = LAWS.laws.reduce((n, l) => n + l.articles.length, 0);
  view.innerHTML = `
    <div class="card">
      <h2>讀書計畫</h2>
      <div class="row">
        <label>目標考試日 <input type="date" id="planDate" value="${s.examDate}"></label>
        <label>每日目標題數 <input type="number" id="planTarget" value="${s.dailyTarget}" min="5" max="500" style="width:70px"></label>
      </div>
      <p class="muted">專技高普考（消防設備人員）每年約 6 月中舉行，請以考選部公告為準。</p>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="num">${days === null ? "未設定" : days + " 天"}</div><div class="lbl">距離考試</div></div>
      <div class="stat"><div class="num">${todayN} / ${s.dailyTarget}</div><div class="lbl">今日進度（題）</div></div>
      <div class="stat"><div class="num">${streak}</div><div class="lbl">連續學習天數</div></div>
      <div class="stat"><div class="num">${doneUnique}</div><div class="lbl">累計做過題數</div></div>
      <div class="stat"><div class="num">${readN}/${totalArts}</div><div class="lbl">已讀條文</div></div>
    </div>
    <div class="card">
      <h2>近 7 天練習量</h2>
      <div style="display:flex; gap:10px; align-items:flex-end; height:140px; padding:0 6px">
        ${last7.map(x => `
          <div style="flex:1; text-align:center">
            <div style="background:${x.n >= s.dailyTarget ? "var(--ok)" : "var(--primary-light)"}; height:${Math.round(x.n / maxN * 100)}px; border-radius:4px 4px 0 0; min-height:2px"></div>
            <div class="muted">${x.lbl}<br>${x.n}</div>
          </div>`).join("")}
      </div>
      <p class="muted" style="margin-top:8px">綠色代表達成每日目標。</p>
    </div>
    <div class="card">
      <h2>雲端同步與資料備份</h2>
      <div class="row">
        ${localStorage.getItem("fireExamSyncCode") ? `
          <span class="tag blue">☁ 雲端同步已啟用</span>
          <span class="muted" id="syncStatus"></span>
          <button class="btn small" id="syncNow">立即同步</button>
          <button class="btn ghost small" id="syncOff">停用同步</button>`
        : `
          <input type="text" id="syncCode" placeholder="自訂一組同步碼（至少 6 個字）" style="width:230px">
          <button class="btn small" id="syncOn">☁ 啟用雲端同步</button>`}
      </div>
      <p class="muted">啟用後，紀錄會自動同步到雲端；在其他電腦、手機輸入同一組同步碼即可接續讀書進度。同步碼就是你的鑰匙——自己記住、不要外流，忘記就取不回雲端資料。</p>
      <div class="row" style="margin-top:8px">
        <button class="btn ghost" id="expData">⬇ 匯出學習資料</button>
        <button class="btn ghost" id="impData">⬆ 匯入學習資料</button>
        <input type="file" id="impFile" accept=".json" class="hidden">
      </div>
      <p class="muted">匯出／匯入為手動備份，清理瀏覽器資料前建議留一份檔案；匯入會以檔案內容覆蓋目前紀錄。</p>
    </div>`;
  document.getElementById("planDate").onchange = e => { s.examDate = e.target.value; save(); renderPlan(); };
  document.getElementById("planTarget").onchange = e => {
    s.dailyTarget = Math.max(5, parseInt(e.target.value) || 40); save(); renderPlan();
  };
  const syncOnBtn = document.getElementById("syncOn");
  if (syncOnBtn) syncOnBtn.onclick = async () => {
    const code = document.getElementById("syncCode").value.trim();
    if (code.length < 6) { alert("同步碼至少 6 個字，太短容易被猜到"); return; }
    if (!window.isSecureContext) { alert("此開啟方式不支援同步，請改用網址開啟（https 或 localhost）"); return; }
    localStorage.setItem("fireExamSyncCode", code);
    syncKeyHash = await sha256Hex(code);
    await pullCloud();
    renderPlan();
  };
  const syncOffBtn = document.getElementById("syncOff");
  if (syncOffBtn) syncOffBtn.onclick = () => {
    localStorage.removeItem("fireExamSyncCode");
    syncKeyHash = null; syncState = "off";
    renderPlan();
  };
  const syncNowBtn = document.getElementById("syncNow");
  if (syncNowBtn) syncNowBtn.onclick = () => pullCloud();
  updateSyncUI();
  document.getElementById("expData").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store)], { type: "application/json" }));
    a.download = `fire-exam-備份-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById("impData").onclick = () => document.getElementById("impFile").click();
  document.getElementById("impFile").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.settings || !data.rec) throw new Error("格式不符");
        if (!confirm("將以備份檔覆蓋目前所有學習紀錄，確定匯入？")) return;
        store = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STORE)), data);
        save();
        alert("匯入完成！");
        location.reload();
      } catch (err) { alert("匯入失敗：不是有效的備份檔"); }
    };
    r.readAsText(f);
  };
}

// ===== 雲端同步 =====
// 以使用者自訂「同步碼」的 SHA-256 為鍵，整份 store 存 Vercel Blob；最後寫入者為準（_ts 比大小）
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function initSync() {
  const code = localStorage.getItem("fireExamSyncCode");
  if (!code || !window.isSecureContext) return;   // file:// 開啟時無法使用
  syncKeyHash = await sha256Hex(code);
  pullCloud();
}
async function pullCloud() {
  if (!syncKeyHash) return;
  syncState = "syncing"; updateSyncUI();
  try {
    const r = await fetch(SYNC_API, { headers: { "x-sync-key": syncKeyHash } });
    if (r.status === 404) { await pushCloud(); return; }   // 雲端還沒有資料：上傳本地
    if (!r.ok) throw 0;
    const cloud = await r.json();
    // 防呆：空資料不得蓋掉有紀錄的一方，不論時間戳
    const hasData = s => !!(Object.keys(s.rec || {}).length || Object.keys(s.lawNote || {}).length
      || Object.keys(s.lawRead || {}).length || Object.keys(s.schedule || {}).length || (s.customLaws || []).length);
    const localEmpty = !hasData(store);
    if (!hasData(cloud) && !localEmpty) { await pushCloud(); return; }
    if (localEmpty || (cloud._ts || 0) > (store._ts || 0)) {
      store = Object.assign(JSON.parse(JSON.stringify(DEFAULT_STORE)), cloud);
      persist();
      refreshClsBtns(); switchView(currentView);
    } else if ((store._ts || 0) > (cloud._ts || 0)) {
      await pushCloud(); return;
    }
    syncState = "ok"; syncLastAt = Date.now();
  } catch { syncState = "error"; }
  updateSyncUI();
}
function pushCloudSoon() {
  if (!syncKeyHash) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(pushCloud, 3000);
}
async function pushCloud() {
  if (!syncKeyHash) return;
  // 舊資料可能還沒有 _ts，補上再推，否則其他裝置無法判斷新舊
  if (!store._ts) { store._ts = Date.now(); localStorage.setItem("fireExam", JSON.stringify(store)); }
  syncState = "syncing"; updateSyncUI();
  try {
    const r = await fetch(SYNC_API, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-sync-key": syncKeyHash },
      body: JSON.stringify(store),
    });
    if (!r.ok) throw 0;
    syncState = "ok"; syncLastAt = Date.now();
  } catch { syncState = "error"; }
  updateSyncUI();
}
function updateSyncUI() {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = {
    off: "", syncing: "☁ 同步中…",
    ok: "✓ 已同步" + (syncLastAt ? `（${new Date(syncLastAt).toLocaleTimeString()}）` : ""),
    error: "⚠ 同步失敗，下次修改時自動重試",
  }[syncState];
}

// ===== 定時彈題 =====
let quizTimerId = null;
function scheduleQuiz() {
  if (quizTimerId) { clearInterval(quizTimerId); quizTimerId = null; }
  if (store.settings.quizOn) {
    quizTimerId = setInterval(() => popQuiz(), store.settings.quizMin * 60000);
  }
}
function pickQuizQuestion() {
  const cls = store.settings.cls;
  // 1. 已讀條文的直接相關考古題
  const readKeys = Object.entries(store.lawRead).filter(([, v]) => v === "read").map(([k]) => k);
  let pool = [];
  for (const k of readKeys) pool.push(...(lawArtIdx[k] || []));
  let clsPool = pool.filter(q => q.cls === cls && !isFree(q));
  if (clsPool.length) return clsPool[Math.floor(Math.random() * clsPool.length)];
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  // 2. 已讀法規（法別層級）的題目
  const readLaws = [...new Set(readKeys.map(k => k.split(":")[0]))];
  for (const lk of shuffle(readLaws)) {
    const p = (lawArtIdx[lk] || []).filter(q => q.cls === cls && !isFree(q));
    if (p.length) return p[Math.floor(Math.random() * p.length)];
  }
  // 3. 目前考別隨機
  const p = poolOf(cls).filter(q => !isFree(q));
  return p.length ? p[Math.floor(Math.random() * p.length)] : null;
}
function popQuiz(fixedQ, variant = true) {
  const modal = document.getElementById("quizModal");
  if (!modal.classList.contains("hidden")) return;      // 已有彈題
  if (exam && !exam.done) return;                        // 模擬考中不打擾
  const q = fixedQ || pickQuizQuestion();
  if (!q) return;
  modal.innerHTML = `
    <div class="modal-box">
      <div class="title">⏰ 讀書提醒：來一題考古題！</div>
      <div id="mQ" class="q-card"></div>
      <div class="q-nav">
        <button class="btn ghost" id="mClose">關閉</button>
      </div>
    </div>`;
  modal.classList.remove("hidden");
  renderQuestion(document.getElementById("mQ"), q, { variant });
  document.getElementById("mClose").onclick = () => modal.classList.add("hidden");
  modal.onclick = e => { if (e.target === modal) modal.classList.add("hidden"); };
}

// ===== 啟動 =====
refreshClsBtns();
scheduleQuiz();
// 支援 #quiz、#laws 等 hash 直達分頁（舊的 #practice／#exam／#essay／#wrong 導向題庫測驗頁對應模式）
const initView = location.hash.slice(1);
const legacyQuizModes = ["practice", "exam", "essay", "wrong"];
if (legacyQuizModes.includes(initView)) quizMode = initView;
switchView(["home", "quiz", "laws", "calendar", "plan"].includes(initView)
  ? initView : legacyQuizModes.includes(initView) ? "quiz" : "home");
initSync();
