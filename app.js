const KEY_EXTRA = "pb_extra", KEY_LOGS = "pb_logs";
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let tags = {}, presets = {};
let extra = load(KEY_EXTRA, {});   // 自由入力で追加したタグ { カテゴリ: [タグ] }
let logs = load(KEY_LOGS, []);
let selPresets = [], picks = {};

const $ = id => document.getElementById(id);
function el(t, props, ...kids) { const e = document.createElement(t); Object.assign(e, props || {}); kids.forEach(k => e.append(k)); return e; }
function flash(t) { $("msg").textContent = t; clearTimeout(flash.t); flash.t = setTimeout(() => $("msg").textContent = "", 2500); }

function parseJson(text, name) {
  let d;
  try { d = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch (e) { throw new Error(name + " のJSON形式が正しくありません（" + e.message + "）"); }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error(name + " は { ... } の形式にしてください");
  return d;
}
function checkTags(d) {
  Object.entries(d).forEach(([c, v]) => {
    if (!Array.isArray(v)) throw new Error("tags.json の「" + c + "」が配列（[ ... ]）ではありません");
  });
  return d;
}
async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(path + " を取得できません（HTTP " + res.status + "）");
  return res.text();
}
function showError(msg) { $("errText").textContent = msg; $("error").hidden = false; }

function start(t, p) {
  tags = checkTags(t); presets = p; selPresets = []; picks = {};
  // 自由入力で追加したタグを重ねる
  Object.entries(extra).forEach(([c, vals]) => {
    if (!tags[c]) return;
    vals.forEach(v => { if (!tags[c].includes(v)) tags[c].push(v); });
  });
  $("error").hidden = true;
  render();
}

async function init() {
  try {
    const [t, p] = await Promise.all([fetchText("tags.json"), fetchText("presets.json")]);
    start(parseJson(t, "tags.json"), parseJson(p, "presets.json"));
  } catch (e) {
    const hint = location.protocol === "file:"
      ? "ファイルを直接開いているため、自動では読み込めません。下のボタンから tags.json と presets.json を選んでください。"
      : "";
    showError([e.message, hint].filter(Boolean).join("\n"));
  }
}

// 自動読み込みに失敗したときの手動読み込み（2ファイルを同時に選ぶ）
$("pick").onchange = async e => {
  const files = [...e.target.files]; e.target.value = "";
  const find = k => files.find(f => f.name.toLowerCase().includes(k));
  const tf = find("tags"), pf = find("preset");
  if (!tf || !pf) { showError("tags.json と presets.json の2つを同時に選んでください"); return; }
  try { start(parseJson(await tf.text(), "tags.json"), parseJson(await pf.text(), "presets.json")); }
  catch (err) { showError(err.message); }
};

function presetTags(p) { return Array.isArray(p) ? p : (p && p.tags) || []; }
function filter() {
  let on = false; const allowed = new Set();
  selPresets.forEach(n => {
    const p = presets[n];
    if (p && !Array.isArray(p) && p.show_categories) { on = true; p.show_categories.forEach(c => allowed.add(c)); }
  });
  return on ? allowed : null;
}
function compute() {
  const out = []; selPresets.forEach(n => out.push(...presetTags(presets[n])));
  const f = filter();
  Object.keys(tags).forEach(c => { if (!f || f.has(c)) out.push(...(picks[c] || [])); });
  return [...new Set(out)];
}
function togglePick(c, v) { const a = picks[c] = picks[c] || []; const i = a.indexOf(v); i < 0 ? a.push(v) : a.splice(i, 1); render(); }
function addFree(c, raw) {
  let added = 0;
  raw.split(/[,、]/).map(s => s.trim()).filter(Boolean).forEach(v => {
    if (!tags[c].includes(v)) {
      tags[c].push(v);
      (extra[c] = extra[c] || []).push(v);
      added++;
    }
    const a = picks[c] = picks[c] || []; if (!a.includes(v)) a.push(v);
  });
  if (added) { store(KEY_EXTRA, extra); flash("新規タグを【" + c + "】に記憶しました"); }
  render();
}

function render() {
  const P = $("presets"); P.replaceChildren();
  const names = Object.keys(presets);
  if (!names.length) P.append(el("span", { className: "msg", textContent: "プリセットがありません" }));
  names.forEach(n => {
    const b = el("button", { className: "chip", textContent: n, type: "button" });
    b.setAttribute("aria-pressed", selPresets.includes(n));
    b.onclick = () => { const i = selPresets.indexOf(n); i < 0 ? selPresets.push(n) : selPresets.splice(i, 1); render(); };
    P.append(b);
  });
  const C = $("cats"); C.replaceChildren(); const f = filter();
  Object.entries(tags).forEach(([c, vals]) => {
    if (f && !f.has(c)) return;
    const chips = el("div", { className: "chips" });
    vals.forEach(v => {
      const b = el("button", { className: "chip", textContent: v, type: "button" });
      b.setAttribute("aria-pressed", (picks[c] || []).includes(v));
      b.onclick = () => togglePick(c, v);
      chips.append(b);
    });
    const inp = el("input", { type: "text", placeholder: "自由入力（カンマ区切り）", enterKeyHint: "done" });
    inp.setAttribute("aria-label", c + "に自由入力");
    const go = () => { if (inp.value.trim()) addFree(c, inp.value); };
    inp.onkeydown = e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); go(); } };
    const add = el("button", { className: "btn", textContent: "追加", type: "button" }); add.onclick = go;
    C.append(el("section", {}, el("h2", { textContent: c }), chips, el("div", { className: "add" }, inp, add)));
  });
  $("prompt").textContent = compute().join(", ");
  renderLogs();
}

function renderLogs() {
  const L = $("logs"); L.replaceChildren();
  if (!logs.length) { L.append(el("span", { className: "msg", textContent: "まだありません。「履歴に保存」で残せます。" })); return; }
  logs.forEach((g, i) => {
    const cp = el("button", { className: "btn", textContent: "コピー", type: "button" }); cp.onclick = () => copyText(g.text);
    const rm = el("button", { className: "btn", textContent: "削除", type: "button" });
    rm.onclick = () => { logs.splice(i, 1); store(KEY_LOGS, logs); renderLogs(); };
    L.append(el("div", { className: "log" }, el("small", { textContent: g.time }), g.text, el("div", { className: "row" }, cp, rm)));
  });
}

const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "-" + p(d.getHours()) + "-" + p(d.getMinutes()) + "-" + p(d.getSeconds()); };
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); flash("コピーしました"); }
  catch (e) { const r = document.createRange(); r.selectNodeContents($("prompt")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); flash("選択しました。手動でコピーしてください"); }
}
function needText() { const t = compute().join(", "); if (!t) { flash("タグが選択されていません"); return null; } return t; }
function download(name, text, type) {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type: type + ";charset=utf-8" })), download: name });
  document.body.append(a); a.click(); a.remove();
}

$("copy").onclick = () => { const t = needText(); if (t) copyText(t); };
$("save").onclick = () => { const t = needText(); if (!t) return; logs.unshift({ time: stamp(), text: t }); logs = logs.slice(0, 50); store(KEY_LOGS, logs); renderLogs(); flash("履歴に保存しました"); };
$("dl").onclick = () => { const t = needText(); if (t) download(stamp() + "-prompt.txt", t, "text/plain"); };
$("clear").onclick = () => { selPresets = []; picks = {}; render(); };
$("expTags").onclick = () => download("tags.json", JSON.stringify(tags, null, 2), "application/json");
$("resetExtra").onclick = () => {
  if (!confirm("ブラウザに保存した追加タグを消します。よろしいですか？")) return;
  extra = {}; store(KEY_EXTRA, extra); location.reload();
};

init();
