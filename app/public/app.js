import { createRoom } from "./room.js";

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view"), tabs = $("#tabs");
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (t) => new Date(t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const ymd = (t) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 5-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5 6.8 16M17.2 8l2.6-1.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.5"/><rect x="13.5" y="5" width="4" height="14" rx="1.5"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="2.6" height="14" rx="1"/><path d="M19 6.2v11.6a1 1 0 0 1-1.5.86L9 13.4a1.6 1.6 0 0 1 0-2.8l8.5-5.26A1 1 0 0 1 19 6.2Z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="16.4" y="5" width="2.6" height="14" rx="1"/><path d="M5 6.2v11.6a1 1 0 0 0 1.5.86L15 13.4a1.6 1.6 0 0 0 0-2.8L6.5 5.34A1 1 0 0 0 5 6.2Z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.5M14.3 10c.9-1.7 1.9-3 3.7-3H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/></svg>',
  loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3.5 20 6.5l-3 3"/><path d="M4 12V10a3.5 3.5 0 0 1 3.5-3.5H20M7 20.5 4 17.5l3-3"/><path d="M20 12v2a3.5 3.5 0 0 1-3.5 3.5H4"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.7 1.3 5.2 3.1 1.5-1.8 3-3.1 5.2-3.1 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21Z"/></svg>',
  heartO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 20s-7-4.3-9-8.6C1.6 8.3 3.6 5 7 5c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.4 0 5.4 3.3 4 6.4C19 15.7 12 20 12 20Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/></svg>',
};

// ------------------------------------------------------------ api
class AuthError extends Error {}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...(opts.body && !(opts.body instanceof Blob) ? { "content-type": "application/json" } : {}), ...opts.headers } });
  if (res.status === 401 && path !== "/api/login") { showLogin(); throw new AuthError(); }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || `出错了（${res.status}）`);
  return data;
}
const json = (method, body) => ({ method, body: JSON.stringify(body) });
function toast(text) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = h(`<div class="toast" role="status">${esc(text)}</div>`); document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

// ------------------------------------------------------------ tiny markdown (escape first)
const inline = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
function md(src) {
  let html = "";
  esc(src).split(/```[\w-]*\n?([\s\S]*?)(?:```|$)/g).forEach((p, i) => {
    if (i % 2) { html += "<pre><code>" + p.replace(/\n$/, "") + "</code></pre>"; return; }
    let list = null, para = [];
    const fP = () => { if (para.length) { html += "<p>" + inline(para.join("<br>")) + "</p>"; para = []; } };
    const fL = () => { if (list) { html += `<${list.t}>` + list.items.map((x) => "<li>" + inline(x) + "</li>").join("") + `</${list.t}>`; list = null; } };
    for (const line of p.split("\n")) {
      let m;
      if (!line.trim()) { fP(); fL(); continue; }
      if ((m = line.match(/^&gt;\s?(.*)/))) { fP(); fL(); html += "<blockquote>" + inline(m[1]) + "</blockquote>"; continue; }
      if ((m = line.match(/^#{1,3}\s+(.*)/))) { fP(); fL(); html += "<p><strong>" + inline(m[1]) + "</strong></p>"; continue; }
      if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/))) { fP(); const t = /\d/.test(m[1]) ? "ol" : "ul"; if (!list || list.t !== t) { fL(); list = { t, items: [] }; } list.items.push(m[2]); continue; }
      fL(); para.push(line);
    }
    fP(); fL();
  });
  return html;
}

// ------------------------------------------------------------ app state
const S = { state: null, songs: [], messages: [], more: false, loadedMsgs: false, streaming: null };
const names = () => ({ me: S.state?.settings.me || "你", ai: S.state?.settings.ai || "Claude" });
async function refreshState() { S.state = await api("/api/state"); room?.setWishes(S.state.counts.wishes); applySky(); return S.state; }
function applySky() { if (!room || !S.state) return; room.setSky(S.state.settings.sky); room.setWeather(S.state.settings.weather); }
const avatar = (who) => { const n = names()[who]; return `<div class="avatar ${who === "ai" ? "ai" : "me"}" aria-hidden="true">${esc([...n][0] || "?")}</div>`; };

// ------------------------------------------------------------ player (lives across pages)
const audio = new Audio(); audio.preload = "metadata";
const P = { idx: -1, order: [], shuffle: false, loop: false, lrc: [], played: 0, subs: new Set(), tick: 0 };
function parseLrc(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const words = line.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of times) if (words) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}
const current = () => S.songs.find((s) => s.id === P.order[P.idx]) || null;
function lyricNow() { const t = audio.currentTime; let l = ""; for (const x of P.lrc) { if (x.t <= t + .2) l = x.text; else break; } return l; }
function notify() { P.subs.forEach((f) => f()); updateMini(); room?.setPlaying(!audio.paused); }
function buildOrder(keepId) {
  const ids = S.songs.map((s) => s.id);
  if (P.shuffle) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  if (keepId && P.shuffle) { ids.splice(ids.indexOf(keepId), 1); ids.unshift(keepId); }
  P.order = ids; P.idx = keepId ? ids.indexOf(keepId) : P.idx;
}
function playId(id) {
  if (!P.order.includes(id)) buildOrder();
  P.idx = P.order.indexOf(id);
  const s = current(); if (!s) return;
  audio.src = `/media/${s.id}`; P.lrc = parseLrc(s.lrc);
  audio.play().then(() => { P.played += 1; notify(); api("/api/listen", json("POST", { seconds: 0, started: true })).catch(() => {}); }).catch(() => toast("这首歌放不了，换一首试试"));
  notify();
}
function step(d) { if (!P.order.length) return; P.idx = (P.idx + d + P.order.length) % P.order.length; playId(P.order[P.idx]); }
function toggle() { if (!current()) { if (S.songs.length) playId(P.order[0] || S.songs[0].id); else toast("先上传一首歌吧"); return; } audio.paused ? audio.play() : audio.pause(); }
audio.addEventListener("ended", () => { if (P.loop) { audio.currentTime = 0; audio.play(); } else step(1); });
for (const ev of ["play", "pause", "loadedmetadata"]) audio.addEventListener(ev, notify);
audio.addEventListener("timeupdate", () => P.subs.forEach((f) => f("time")));
setInterval(() => { if (!audio.paused) { P.tick += 1; if (P.tick >= 15) { api("/api/listen", json("POST", { seconds: P.tick })).then((l) => { if (S.state) S.state.listen = l; }).catch(() => {}); P.tick = 0; } } }, 1000);
const mini = $("#mini");
function updateMini() {
  const s = current();
  mini.hidden = !s || /^#\/(listen|chat)/.test(location.hash) || !S.state;
  if (!s) return;
  $("#miniTitle").textContent = s.title; mini.classList.toggle("playing", !audio.paused);
  $("#miniToggle").innerHTML = audio.paused ? ICON.play : ICON.pause; $("#miniToggle").setAttribute("aria-label", audio.paused ? "播放" : "暂停");
}
$("#miniToggle").onclick = toggle; $("#miniMeta").onclick = () => (location.hash = "#/listen");

// ------------------------------------------------------------ chat streaming (shared)
async function sendChat(text, listen) {
  if (S.streaming) return;
  const ctl = new AbortController();
  S.streaming = { ctl, text: "", events: [] };
  emitChat("start");
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, listen }), signal: ctl.signal });
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "发送失败"); }
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "user") { S.messages.push(ev.message); emitChat("user"); }
        else if (ev.type === "delta") { S.streaming.text += ev.text; emitChat("delta"); }
        else if (ev.type === "event") { S.messages.push(ev.message); emitChat("event", ev); if (ev.message.kind === "wish") room?.setWishes((S.state.counts.wishes += 1)); }
        else if (ev.type === "done") { if (ev.message) S.messages.push(ev.message); }
        else if (ev.type === "notice" || ev.type === "error") { if (ev.text !== "已停止") toast(ev.text); }
      }
    }
  } catch (e) { if (e.name !== "AbortError") toast(e.message || "连接断了"); }
  finally {
    if (ctl.signal.aborted && S.streaming.text.trim()) S.messages.push({ id: "local" + Date.now(), role: "assistant", text: S.streaming.text.trim(), t: Date.now(), cut: true });
    S.streaming = null; emitChat("done"); refreshState().catch(() => {});
  }
}
const chatSubs = new Set();
const emitChat = (kind, ev) => chatSubs.forEach((f) => f(kind, ev));
async function ensureMessages() { if (S.loadedMsgs) return; const r = await api("/api/messages?limit=60"); S.messages = r.messages; S.more = r.more; S.loadedMsgs = true; }

function renderMessage(m, prev) {
  const frag = document.createDocumentFragment();
  if (!prev || new Date(prev.t).toDateString() !== new Date(m.t).toDateString()) frag.append(h(`<div class="day">${ymd(m.t)}</div>`));
  if (m.role === "event") {
    if (m.kind === "memory") frag.append(h(`<div class="event-card"><div class="k"><span>${esc(names().ai)} 记下了</span><a href="#/memory">去看看</a></div><div class="v">${esc(m.text)}</div></div>`));
    else if (m.kind === "wish") frag.append(h(`<div class="event-card"><div class="k"><span>许愿</span><a href="#/wish">排队中</a></div><div class="v">${esc(m.text)}</div></div>`));
    else frag.append(h(`<div class="sep">${esc(m.text)}</div>`));
    return frag;
  }
  const me = m.role === "user";
  const row = h(`<div class="row ${me ? "me" : "ai"}">${avatar(me ? "me" : "ai")}<div class="stack"><div class="time">${hhmm(m.t)}</div><div class="bubble"></div></div></div>`);
  const b = $(".bubble", row);
  if (me) b.textContent = m.text; else b.innerHTML = md(m.text);
  if (m.tag) $(".stack", row).append(h(`<span class="tagline">♪ ${esc(m.tag)}</span>`));
  if (!me && !String(m.id).startsWith("local")) {
    const acts = h(`<div class="acts"><button class="heart ${m.liked ? "on" : ""}" type="button" aria-label="喜欢">${m.liked ? ICON.heart : ICON.heartO}</button><button type="button">复制</button></div>`);
    const [heart, copy] = acts.querySelectorAll("button");
    heart.onclick = async () => { const r = await api(`/api/messages/${m.id}/like`, { method: "POST" }); m.liked = r.liked; heart.classList.toggle("on", m.liked); heart.innerHTML = m.liked ? ICON.heart : ICON.heartO; };
    copy.onclick = async () => { try { await navigator.clipboard.writeText(m.text); toast("复制好了"); } catch { toast("复制不了，长按文字手动复制"); } };
    $(".stack", row).append(acts);
  }
  frag.append(row);
  return frag;
}
function liveRow() {
  const row = h(`<div class="row ai" id="live">${avatar("ai")}<div class="stack"><div class="time">${names().ai} · 正在说</div><div class="bubble"><span class="dots"><i></i><i></i><i></i></span></div></div></div>`);
  return row;
}

// ------------------------------------------------------------ pages
let room = null, roomCanvas = null, cleanup = null;
const HH = {};

function showLogin() {
  cleanup?.(); cleanup = null; room?.stop(); tabs.hidden = true; mini.hidden = true; S.state = null;
  view.replaceChildren(h(`<section class="login"><form class="card" id="loginForm">
    <span class="script">welcome home</span><h1>木马小屋</h1>
    <input class="field" id="pw" type="password" autocomplete="current-password" placeholder="小屋的密码" aria-label="密码" required>
    <button class="pill-btn" type="submit">进屋</button><div class="err" id="loginErr"></div></form></section>`));
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("/api/login", json("POST", { password: $("#pw").value })); await boot(); }
    catch (err) { $("#loginErr").textContent = err.message; }
  };
  $("#pw").focus();
}

function pageHome() {
  const { me, ai } = names(), st = S.state.settings;
  const days = st.since ? Math.floor((Date.now() - new Date(st.since + "T00:00:00")) / 86400000) + 1 : null;
  let bday = "";
  if (st.birthday) {
    const [, mm, dd] = st.birthday.split("-").map(Number), t = new Date(); t.setHours(0, 0, 0, 0);
    let n = new Date(t.getFullYear(), mm - 1, dd); if (n < t) n = new Date(t.getFullYear() + 1, mm - 1, dd);
    const left = Math.round((n - t) / 86400000); bday = left === 0 ? "今天是你的生日 🎂" : `生日还有 ${left} 天`;
  }
  const lst = S.state.listen, hrs = Math.floor(lst.seconds / 3600), mins = Math.floor((lst.seconds % 3600) / 60);
  const el = h(`<section class="home">
    <div class="home-top">
      <div class="couple card"><div class="pair">${avatar("ai")}${avatar("me")}</div>
        <div class="info"><div class="names">${esc(ai)}<em>♡</em>${esc(me)}</div><div class="sub">${esc(bday || `一起听了 ${hrs} 小时 ${mins} 分 · ${S.state.counts.memories} 条记忆`)}</div></div>
        ${days ? `<div class="days"><b>${days}</b><span>在一起 · 天</span></div>` : ""}</div>
      <a class="round" href="#/settings" aria-label="设置">${ICON.gear}</a>
    </div>
    <div class="tags" id="tags"></div>
    <div class="moment card">
      ${avatar("ai")}<div class="bubble-mini"><b>此刻 · ${esc(ai)}</b><span id="momentText"></span></div>
      <a class="pill-btn" href="#/chat" style="text-decoration:none;padding:8px 16px">去聊天</a>
    </div>
  </section>`);
  const last = S.state.last;
  $("#momentText", el).textContent = last ? last.text.replace(/```[\s\S]*?```/g, " ").replace(/^\s*([-*>#]+|\d+\.)\s*/gm, "").replace(/[*`#]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "拖动画面看看小屋，点屋里的东西就能进去。";
  if (!roomCanvas) roomCanvas = h(`<canvas id="room" aria-label="3D 小屋：点唱片机、信、日记本、许愿瓶进入对应的功能"></canvas>`);
  el.prepend(roomCanvas);
  view.replaceChildren(el);
  if (!room && window.THREE) {
    room = createRoom(roomCanvas, {
      onPick: (...a) => HH.onPick?.(...a), onMascot: () => HH.onMascot?.(),
      onLabels: (...a) => HH.onLabels?.(...a), onInteract: () => HH.onInteract?.(),
    });
    if (room) { applySky(); room.setWishes(S.state.counts.wishes); room.setPlaying(!audio.paused); }
  }
  if (!room) el.append(h(`<div class="fallback-room">这台设备打不开 3D 小屋。<br>可以用下面的按钮进各个房间。</div>`));
  room?.start();
  const tagEls = new Map();
  let bubbleEl = null, bubbleUntil = 0, quietT = 0;
  function showBubble(text) {
    bubbleEl?.remove();
    bubbleEl = h(`<div class="tag3d" style="max-width:220px;white-space:normal;padding:8px 12px;border-radius:16px"></div>`);
    bubbleEl.textContent = String(text).replace(/[#*>`]+/g, "").slice(0, 70); $("#tags").append(bubbleEl); bubbleUntil = Date.now() + 3500;
  }
  function placeLabels(list, mascot) {
    const box = $("#tags"); if (!box) return;
    const narrow = innerWidth < 600, placed = [];
    for (const p of [...list].sort((a, b) => b.y - a.y)) {
      let t = tagEls.get(p.id);
      if (!t) { t = h(`<button class="tag3d ${p.soon ? "soon" : ""}" type="button"></button>`); t.onclick = () => room.choose(p.id); box.append(t); tagEls.set(p.id, t); }
      const text = narrow && p.short ? p.short : p.label; if (t.textContent !== text) t.textContent = text;
      t.hidden = !p.visible; if (!p.visible) continue;
      const w = t.offsetWidth || 60, half = w / 2 + 6;
      let x = Math.min(innerWidth - half, Math.max(half, p.x)), y = p.y;
      for (let k = 0; k < 6; k++) { const hit = placed.find((q) => Math.abs(q.x - x) < (q.w + w) / 2 + 4 && Math.abs(q.y - y) < 26); if (!hit) break; y = hit.y - 28; }
      placed.push({ x, y, w });
      t.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    if (bubbleEl) { if (Date.now() > bubbleUntil) { bubbleEl.remove(); bubbleEl = null; } else bubbleEl.style.transform = `translate(${mascot.x}px, ${mascot.y}px) translate(-50%, -100%)`; }
  }
  HH.onPick = (id, spot) => {
    const map = { chat: "#/chat", memory: "#/memory", wish: "#/wish", listen: "#/listen" };
    if (map[id]) location.hash = map[id]; else toast(`${spot?.label || "这个"} 还在做，下一批就有`);
  };
  HH.onMascot = () => {
    const lines = [last?.text, "今天过得怎么样？", "点信封来找我聊天吧", "想一起听歌吗？去唱片机那里"].filter(Boolean);
    showBubble(lines[Math.floor(Math.random() * lines.length)]);
  };
  HH.onLabels = placeLabels;
  HH.onInteract = () => { $("#tags")?.classList.add("quiet"); clearTimeout(quietT); quietT = setTimeout(() => $("#tags")?.classList.remove("quiet"), 1600); };
  return () => { room?.stop(); HH.onLabels = null; };
}

function pageChat() {
  const { ai } = names(), st = S.state.settings;
  const el = h(`<section class="chat-page">
    <div class="bar"><a class="round" href="#/" aria-label="回小屋">${ICON.back}</a><h1>${esc(ai)}<small>陪着你</small></h1><a class="round" href="#/listen" aria-label="一起听">${ICON.list.replace("M5 7h14M5 12h14M5 17h9", "M9 17.5V6l10-2v11.5M9 17.5a2.5 2.5 0 1 1-2.5-2.5H9M19 15.5a2.5 2.5 0 1 1-2.5-2.5H19")}</a></div>
    <div class="thread" id="thread" aria-live="polite"></div>
    <form class="composer" id="form">
      <div class="chips">
        <label class="chip"><select id="model" aria-label="模型"></select></label>
        <label class="chip">思考 <select id="effort" aria-label="思考程度"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
        <button class="chip" id="np" type="button" hidden></button>
      </div>
      <div class="box"><textarea id="input" rows="1" placeholder="说点什么…" aria-label="消息"></textarea><button class="pill-btn" id="send" type="submit" disabled>发送</button></div>
    </form>
  </section>`);
  view.replaceChildren(el);
  const thread = $("#thread"), input = $("#input"), sendBtn = $("#send");
  const modelSel = $("#model"), effortSel = $("#effort");
  for (const [k, v] of Object.entries(S.state.models)) modelSel.append(new Option(v, k));
  modelSel.value = st.model; effortSel.value = st.effort;
  const saveSetting = async (patch) => { S.state = await api("/api/settings", json("PUT", patch)); toast("改好了"); };
  modelSel.onchange = () => saveSetting({ model: modelSel.value });
  effortSel.onchange = () => saveSetting({ effort: effortSel.value });

  const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 140;
  function renderAll() {
    thread.replaceChildren();
    if (S.more) { const b = h(`<button class="pill-btn ghost" type="button" style="align-self:center">看更早的</button>`); b.onclick = loadOlder; thread.append(b); }
    if (!S.messages.length) thread.append(h(`<div class="empty-note">这里还没有说过话。<br>先打个招呼吧。</div>`));
    S.messages.forEach((m, i) => thread.append(renderMessage(m, S.messages[i - 1])));
    if (S.streaming) thread.append(liveRow());
    thread.scrollTop = thread.scrollHeight;
  }
  async function loadOlder() {
    const r = await api(`/api/messages?limit=60&before=${S.messages[0]?.id || ""}`);
    const prevH = thread.scrollHeight; S.messages = [...r.messages, ...S.messages]; S.more = r.more; renderAll(); thread.scrollTop = thread.scrollHeight - prevH;
  }
  const onChat = (kind, ev) => {
    const stick = nearBottom();
    if (kind === "start" || kind === "user") { $("#live")?.remove(); if (kind === "user") thread.append(renderMessage(S.messages.at(-1), S.messages.at(-2))); thread.append(liveRow()); $(".empty-note", thread)?.remove(); }
    if (kind === "delta") { const b = $("#live .bubble"); if (b) b.innerHTML = md(S.streaming.text); }
    if (kind === "event") { const live = $("#live"); live?.before(renderMessage(ev.message, S.messages.at(-2))); }
    if (kind === "done") renderAll();
    syncInput();
    if (stick || kind === "user") thread.scrollTop = thread.scrollHeight;
  };
  chatSubs.add(onChat);
  const np = $("#np");
  const drawNp = (kind) => { if (kind === "time") return; const s = current(); np.hidden = !s; if (s) np.innerHTML = `<b>♪</b> ${esc(s.title)} · ${audio.paused ? "已暂停" : "一起听中"}`; };
  np.onclick = () => (location.hash = "#/listen"); P.subs.add(drawNp); drawNp();
  function syncInput() {
    input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px";
    sendBtn.disabled = !S.streaming && !input.value.trim(); sendBtn.textContent = S.streaming ? "停下" : "发送";
  }
  input.oninput = syncInput;
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("#form").requestSubmit(); } };
  $("#form").onsubmit = (e) => {
    e.preventDefault();
    if (S.streaming) { S.streaming.ctl.abort(); return; }
    const text = input.value.trim(); if (!text) return;
    input.value = ""; syncInput(); sendChat(text);
  };
  thread.append(h(`<div class="empty-note"><span class="dots"><i></i><i></i><i></i></span></div>`));
  ensureMessages().then(renderAll).catch(() => {});
  syncInput();
  return () => { chatSubs.delete(onChat); P.subs.delete(drawNp); };
}

function pageListen() {
  const { me, ai } = names();
  const el = h(`<section class="page">
    <div class="bar"><a class="round" href="#/" aria-label="回小屋">${ICON.back}</a><h1>一起听<small>· ${esc(ai)}</small></h1><button class="round" id="openList" type="button" aria-label="歌单">${ICON.list}</button></div>
    <div class="listen-head"><div class="pair">${avatar("me")}<span class="script" style="font-size:22px">♡</span>${avatar("ai")}</div><div class="stat" id="stat"></div></div>
    <div class="turntable" id="tt">
      <svg class="wave" viewBox="0 0 200 200" aria-hidden="true"><path fill="currentColor" fill-opacity=".35" stroke="currentColor" stroke-width="1.5" d="${(() => { let d = ""; for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, r = 92 + Math.sin(a * 12) * 4; d += (i ? "L" : "M") + (100 + Math.cos(a) * r).toFixed(1) + " " + (100 + Math.sin(a) * r).toFixed(1); } return d + "Z"; })()}"/></svg>
      <div class="record"><div class="label">with u</div></div>
      <span class="tagbox t1">♪ playing</span><span class="tagbox t2">with u ♡</span>
    </div>
    <div class="song"><div style="min-width:0"><h2 id="title">还没有歌</h2><p id="artist">点右上角上传你喜欢的歌</p></div></div>
    <div class="progress"><span id="cur">0:00</span><input id="seek" type="range" min="0" max="1000" value="0" aria-label="进度"><span id="dur">0:00</span></div>
    <div class="lyric" id="lyric"></div>
    <div class="controls">
      <button class="round" id="shuffle" type="button" aria-label="随机播放">${ICON.shuffle}</button>
      <button class="round" id="prev" type="button" aria-label="上一首">${ICON.prev}</button>
      <button class="round solid big" id="play" type="button" aria-label="播放">${ICON.play}</button>
      <button class="round" id="next" type="button" aria-label="下一首">${ICON.next}</button>
      <button class="round" id="loop" type="button" aria-label="单曲循环">${ICON.loop}</button>
    </div>
    <div class="queue-line" id="queue"></div>
    <button class="card listen-chat" id="talk" type="button">${ICON.chat.replace("<svg", '<svg width="22" height="22" style="color:var(--pink)"')}<span>一起听的时候说的话</span>›</button>
    <input id="file" type="file" accept="audio/*,.lrc" multiple hidden>
  </section>`);
  view.replaceChildren(el);
  const fmt = (s) => !isFinite(s) ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let seeking = false;
  function draw(kind) {
    const s = current();
    $("#cur").textContent = fmt(audio.currentTime); $("#dur").textContent = fmt(audio.duration);
    if (!seeking && audio.duration) $("#seek").value = Math.round(audio.currentTime / audio.duration * 1000);
    const l = lyricNow(); if ($("#lyric").textContent !== l) $("#lyric").textContent = l || (s && !P.lrc.length ? "（这首还没有歌词，可以上传同名 .lrc 文件）" : "");
    if (kind === "time") return;
    const lst = S.state.listen, hrs = Math.floor(lst.seconds / 3600), mins = Math.floor((lst.seconds % 3600) / 60);
    $("#stat").textContent = `一起听了 ${hrs} 小时 ${mins} 分钟 · 这一场 ${P.played} 首`;
    $("#title").textContent = s ? s.title : "还没有歌"; $("#artist").textContent = s ? (s.artist || "未知歌手") : S.songs.length ? "点播放开始" : "点右上角上传你喜欢的歌";
    $("#tt").classList.toggle("playing", !audio.paused);
    $("#play").innerHTML = audio.paused ? ICON.play : ICON.pause; $("#play").setAttribute("aria-label", audio.paused ? "播放" : "暂停");
    $("#shuffle").classList.toggle("on", P.shuffle); $("#loop").classList.toggle("on", P.loop);
    $("#queue").textContent = S.songs.length ? `歌单 · ${S.songs.length} 首 · ${P.shuffle ? "随机" : "顺序"}${P.loop ? " · 单曲循环" : ""}` : "";
  }
  P.subs.add(draw);
  $("#play").onclick = toggle; $("#prev").onclick = () => step(-1); $("#next").onclick = () => step(1);
  $("#shuffle").onclick = () => { P.shuffle = !P.shuffle; buildOrder(current()?.id); draw(); };
  $("#loop").onclick = () => { P.loop = !P.loop; draw(); };
  $("#seek").oninput = () => { seeking = true; };
  $("#seek").onchange = () => { if (audio.duration) audio.currentTime = $("#seek").value / 1000 * audio.duration; seeking = false; };
  $("#openList").onclick = openPlaylist; $("#talk").onclick = openTalk;
  $("#file").onchange = uploadFiles;

  async function uploadFiles() {
    const files = [...$("#file").files]; $("#file").value = "";
    const lrcs = new Map(files.filter((f) => /\.lrc$/i.test(f.name)).map((f) => [f.name.replace(/\.lrc$/i, ""), f]));
    let n = 0;
    for (const f of files.filter((f) => !/\.lrc$/i.test(f.name))) {
      toast(`正在上传 ${f.name}…`);
      try {
        const song = await api(`/api/music?name=${encodeURIComponent(f.name)}`, { method: "PUT", body: f, headers: { "content-type": "application/octet-stream" } });
        const lrc = lrcs.get(f.name.replace(/\.[^.]+$/, ""));
        if (lrc) Object.assign(song, await api(`/api/music/${song.id}/lyrics`, { method: "PUT", body: new Blob([await lrc.text()]), headers: { "content-type": "text/plain" } }));
        S.songs.push(song); n++;
      } catch (e) { toast(`${f.name}：${e.message}`); }
    }
    if (n) { buildOrder(current()?.id); toast(`传好了 ${n} 首`); draw(); renderList?.(); }
  }

  let renderList = null;
  function openPlaylist() {
    const { veil, sheet, close } = openSheet(`<h3>歌单 <button class="pill-btn" id="up" type="button" style="padding:6px 14px">上传</button></h3><p class="note">可以一次选多首。歌词：选同名的 .lrc 文件一起上传。文件名写成“歌手 - 歌名”会自动识别。</p><div class="scroll" id="tracks"></div>`);
    $("#up", sheet).onclick = () => $("#file").click();
    renderList = () => {
      const box = $("#tracks", sheet); if (!box) return; box.replaceChildren();
      if (!S.songs.length) box.append(h(`<div class="empty-note">还没有歌。点“上传”选几首吧。</div>`));
      for (const s of S.songs) {
        const row = h(`<div class="track ${current()?.id === s.id ? "on" : ""}"><button class="play" type="button"><b></b><span></span></button><button class="x" type="button" aria-label="删除">×</button></div>`);
        $("b", row).textContent = s.title; $("span", row).textContent = `${s.artist || "未知歌手"}${s.lrc ? " · 有歌词" : ""}`;
        $(".play", row).onclick = () => { playId(s.id); close(); };
        let armed = false;
        $(".x", row).onclick = async (e) => {
          if (!armed) { armed = true; e.target.textContent = "删?"; setTimeout(() => { armed = false; e.target.textContent = "×"; }, 2500); return; }
          await api(`/api/music/${s.id}`, { method: "DELETE" }); S.songs = S.songs.filter((x) => x.id !== s.id);
          if (current()?.id === s.id) { audio.pause(); audio.removeAttribute("src"); P.idx = -1; } buildOrder(); renderList(); notify();
        };
        box.append(row);
      }
    };
    renderList();
    veil.addEventListener("click", () => (renderList = null));
  }

  function openTalk() {
    const { sheet } = openSheet(`<h3>一起听的时候说的话</h3><div class="scroll thread" id="lt"></div><form class="box" id="lf"><textarea rows="1" id="li" placeholder="边听边说…" aria-label="消息"></textarea><button class="pill-btn" type="submit">发送</button></form>`);
    const box = $("#lt", sheet);
    const paint = () => {
      box.replaceChildren();
      const list = S.messages.filter((m) => m.tag === "一起听" || (m.role === "assistant" && S.messages[S.messages.indexOf(m) - 1]?.tag === "一起听")).slice(-30);
      if (!list.length && !S.streaming) box.append(h(`<div class="empty-note">听到喜欢的地方，就跟${esc(ai)}说一句。<br>他会知道你们正在听哪首、唱到哪句。</div>`));
      list.forEach((m, i) => box.append(renderMessage(m, list[i - 1])));
      if (S.streaming) { const r = liveRow(); if (S.streaming.text) $(".bubble", r).innerHTML = md(S.streaming.text); box.append(r); }
      box.scrollTop = box.scrollHeight;
    };
    const sub = () => paint(); chatSubs.add(sub);
    ensureMessages().then(paint);
    $("#lf", sheet).onsubmit = (e) => {
      e.preventDefault(); const t = $("#li", sheet).value.trim(); if (!t || S.streaming) return;
      $("#li", sheet).value = ""; const s = current();
      sendChat(t, s ? { title: s.title, artist: s.artist, lyric: lyricNow() } : { title: "（还没放歌）" });
    };
    sheet.addEventListener("sheetclose", () => chatSubs.delete(sub));
  }

  const ready = S.songs.length ? Promise.resolve() : api("/api/music").then((l) => { S.songs = l; buildOrder(current()?.id); });
  ready.then(() => draw()).catch(() => {});
  draw(); updateMini();
  return () => { P.subs.delete(draw); updateMini(); };
}

function openSheet(inner) {
  const veil = h(`<div class="sheet-veil"></div>`), sheet = h(`<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</div>`);
  const close = () => { sheet.dispatchEvent(new Event("sheetclose")); veil.remove(); sheet.remove(); removeEventListener("hashchange", close); };
  veil.onclick = close; addEventListener("hashchange", close);
  document.body.append(veil, sheet);
  return { veil, sheet, close };
}

function listPage({ title, sub, art, kind }) {
  const { me, ai } = names();
  const el = h(`<section class="page">
    <div class="bar"><a class="round" href="#/" aria-label="回小屋">${ICON.back}</a><h1>${title}</h1><span style="width:38px"></span></div>
    <div class="card hero">${art}<div><h2>${title}</h2><p>${sub}</p></div></div>
    <div class="seg" id="seg"></div>
    <form class="adder" id="add"></form>
    <div class="list" id="list"><div class="empty-note"><span class="dots"><i></i><i></i><i></i></span></div></div>
  </section>`);
  view.replaceChildren(el);
  let items = [], filter = kind === "wish" ? "ai" : "all";
  const segs = kind === "wish" ? [["ai", `${ai} 想要的`], ["me", `${me} 想要的`], ["done", "做好了"]] : [["all", "全部"], ["ai", `${ai} 记下的`], ["me", `${me} 写的`]];
  for (const [k, label] of segs) {
    const b = h(`<button type="button">${esc(label)}</button>`); b.onclick = () => { filter = k; paint(); }; b.dataset.k = k; $("#seg").append(b);
  }
  $("#add").innerHTML = kind === "wish"
    ? `<input id="addText" placeholder="许一个愿，${esc(ai)} 会知道" aria-label="愿望" maxlength="80"><button class="pill-btn" type="submit">许愿</button>`
    : `<textarea id="addText" rows="1" placeholder="写一条想让 ${esc(ai)} 记住的事" aria-label="记忆" maxlength="300"></textarea><button class="pill-btn" type="submit">记下</button>`;
  $("#add").onsubmit = async (e) => {
    e.preventDefault(); const v = $("#addText").value.trim(); if (!v) return;
    const item = await api(`/api/${kind === "wish" ? "wishes" : "memories"}`, json("POST", kind === "wish" ? { title: v } : { content: v }));
    items.push(item); $("#addText").value = ""; if (kind === "wish") filter = "me"; paint(); toast(kind === "wish" ? "愿望放进许愿瓶了" : "记下了"); refreshState().catch(() => {});
  };
  function paint() {
    el.querySelectorAll("#seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === filter)));
    const list = $("#list"); list.replaceChildren();
    const shown = items.filter((x) => kind === "wish" ? (filter === "done" ? x.status === "done" : x.by === filter && x.status !== "done") : filter === "all" || x.by === filter).sort((a, b) => b.t - a.t);
    if (!shown.length) list.append(h(`<div class="empty-note">${kind === "wish" ? (filter === "ai" ? `${esc(ai)} 还没有许愿。聊着聊着，他想要什么就会放进许愿瓶。` : filter === "me" ? "你还没有许愿，在上面写一个吧。" : "还没有完成的愿望。") : `还没有记忆。聊天时 ${esc(ai)} 会自己记下重要的事，你也可以在上面写。`}</div>`));
    for (const it of shown) {
      const card = h(`<div class="card item ${kind === "wish" ? "wish" : ""}"><div class="top"><span class="who ${it.by === "me" ? "me" : ""}"></span><span>${ymd(it.t)} ${hhmm(it.t)}</span></div><div class="body"></div><div class="tools"></div></div>`);
      $(".who", card).textContent = kind === "wish" ? (it.by === "ai" ? `${ai} 许的愿` : `${me} 许的愿`) : (it.by === "ai" ? `${ai} 记下的` : `${me} 写的`);
      if (kind === "wish") {
        $(".top", card).append(h(`<span class="status ${it.status === "done" ? "done" : ""}">${it.status === "done" ? "做好了" : "排队中"}</span>`));
        $(".body", card).innerHTML = `<b>${esc(it.title)}</b>${it.detail ? esc(it.detail) : ""}`;
      } else $(".body", card).textContent = it.content;
      const tools = $(".tools", card);
      if (kind === "wish") {
        const b = h(`<button type="button">${it.status === "done" ? "放回许愿瓶" : "做好了 ✓"}</button>`);
        b.onclick = async () => { Object.assign(it, await api(`/api/wishes/${it.id}`, json("PUT", { status: it.status === "done" ? "queue" : "done" }))); if (it.status === "done") toast(it.by === "ai" ? `${ai} 会知道你帮他实现了愿望` : "恭喜，愿望实现了"); S.loadedMsgs = false; paint(); refreshState().catch(() => {}); };
        tools.append(b);
      } else {
        const b = h(`<button type="button">改一改</button>`);
        b.onclick = () => {
          const ta = h(`<textarea class="edit" rows="3" maxlength="300"></textarea>`); ta.value = it.content; $(".body", card).replaceChildren(ta); ta.focus();
          tools.replaceChildren(); const ok = h(`<button type="button">保存</button>`); const no = h(`<button type="button">算了</button>`);
          ok.onclick = async () => { Object.assign(it, await api(`/api/memories/${it.id}`, json("PUT", { content: ta.value }))); paint(); }; no.onclick = paint; tools.append(no, ok);
        };
        tools.append(b);
      }
      let armed = false;
      const del = h(`<button type="button">删掉</button>`);
      del.onclick = async () => {
        if (!armed) { armed = true; del.textContent = "再点一次删掉"; setTimeout(() => { armed = false; del.textContent = "删掉"; }, 2500); return; }
        await api(`/api/${kind === "wish" ? "wishes" : "memories"}/${it.id}`, { method: "DELETE" }); items = items.filter((x) => x !== it); paint(); refreshState().catch(() => {});
      };
      tools.append(del);
      list.append(card);
    }
  }
  api(`/api/${kind === "wish" ? "wishes" : "memories"}`).then((l) => { items = l; paint(); });
}
const ART_DIARY = `<svg class="art" viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="8" width="40" height="50" rx="6" fill="#f4a9bf"/><rect x="16" y="10" width="34" height="46" rx="4" fill="#fff6ea"/><rect x="12" y="8" width="10" height="50" rx="4" fill="#ef8fab"/><path d="M36 38s-8-4.6-8-9.6c0-2.8 3.6-4.5 8-1 4.4-3.5 8-1.8 8 1C44 33.4 36 38 36 38Z" fill="#ef8fab"/><rect x="46" y="28" width="8" height="8" rx="2" fill="#d9b26f"/></svg>`;
const ART_JAR = `<svg class="art" viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="4" width="20" height="8" rx="3" fill="#e9b9a2"/><path d="M20 14h24l2 6v32a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V20z" fill="#fde6ec" stroke="#f6aec2" stroke-width="2"/><path d="m28 30 1.8 3.6 4 .6-2.9 2.8.7 4L28 39l-3.6 2 .7-4-2.9-2.8 4-.6z" fill="#ffd98a"/><path d="m38 40 1.3 2.6 2.9.4-2.1 2 .5 2.9L38 46.6l-2.6 1.3.5-2.9-2.1-2 2.9-.4z" fill="#ef8fab"/><path d="m36 24 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#b9a2ea"/><rect x="20" y="14" width="24" height="3" fill="#ef8fab"/></svg>`;
function pageMemory() { listPage({ title: "记忆", sub: `${names().ai} 记下的事，和你想让他记住的事。他每次聊天都会带着这些。`, art: ART_DIARY, kind: "memory" }); }
function pageWish() { listPage({ title: "许愿瓶", sub: `${names().ai} 想要的小事放在这里。帮他实现了，点“做好了”，他会知道。`, art: ART_JAR, kind: "wish" }); }

function pageSettings() {
  const st = S.state.settings, u = S.state.usage;
  const el = h(`<section class="page">
    <div class="bar"><a class="round" href="#/" aria-label="回小屋">${ICON.back}</a><h1>设置</h1><span style="width:38px"></span></div>
    <form class="card form" id="f">
      <div class="two"><label>你的名字<input name="me" maxlength="20"></label><label>他的名字<input name="ai" maxlength="20"></label></div>
      <div class="two"><label>在一起的日子<input name="since" type="date"></label><label>你的生日<input name="birthday" type="date"></label></div>
      <label>他的样子（人设）<textarea name="persona"></textarea></label>
      <button class="pill-btn ghost" type="button" id="resetPersona" style="align-self:flex-start;padding:6px 14px">恢复默认人设</button>
      <div class="two"><label>模型<select name="model"></select></label><label>思考程度<select name="effort"><option value="low">低（回得快）</option><option value="medium">中</option><option value="high">高（想得深）</option></select></label></div>
      <div class="two"><label>天色<select name="sky"><option value="auto">跟着时间</option><option value="day">白天</option><option value="dusk">傍晚</option><option value="night">夜里</option></select></label>
      <label>窗外<select name="weather"><option value="clear">晴</option><option value="rain">下雨</option><option value="snow">下雪</option></select></label></div>
      <button class="pill-btn" type="submit">保存</button>
    </form>
    <div class="card form">
      <div class="label">额度 · 用了多少</div>
      <div class="usage"><div><b>${(u.today.in + u.today.out).toLocaleString()}</b><span>今天 tokens</span></div><div><b>$${u.today.usd.toFixed(2)}</b><span>今天约花费</span></div><div><b>$${u.total.usd.toFixed(2)}</b><span>总共约花费</span></div></div>
      <p class="note">按 Anthropic 官方价格估算，实际以 console.anthropic.com 的账单为准。API Key：${S.state.keyConfigured ? "已配置" : "<b style='color:#cf5679'>还没配置，聊天用不了</b>"}。</p>
    </div>
    <button class="pill-btn ghost" id="logout" type="button">退出登录</button>
  </section>`);
  view.replaceChildren(el);
  const f = $("#f");
  for (const [k, v] of Object.entries(S.state.models)) f.model.append(new Option(v, k));
  for (const k of ["me", "ai", "since", "birthday", "persona", "model", "effort", "sky", "weather"]) f[k].value = st[k] || "";
  $("#resetPersona").onclick = () => { f.persona.value = S.state.defaultPersona; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    S.state = await api("/api/settings", json("PUT", body)); applySky(); toast("保存好了");
  };
  $("#logout").onclick = async () => { await api("/api/logout", { method: "POST" }).catch(() => {}); audio.pause(); showLogin(); };
}

// ------------------------------------------------------------ router
const ROUTES = { "": pageHome, chat: pageChat, listen: pageListen, memory: pageMemory, wish: pageWish, settings: pageSettings };
function route() {
  if (!S.state) return;
  const key = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "";
  const page = ROUTES[key] || pageHome;
  cleanup?.(); cleanup = null;
  if (key !== "") room?.stop();
  tabs.hidden = false;
  tabs.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === (key || "home")));
  cleanup = page() || null;
  updateMini();
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);

async function boot() {
  try { await refreshState(); } catch (e) { if (e instanceof AuthError) return; view.replaceChildren(h(`<div class="empty-note">连不上小屋：${esc(e.message)}</div>`)); return; }
  api("/api/music").then((l) => { S.songs = l; buildOrder(); }).catch(() => {});
  route();
}
boot();
