// 木马小屋 — a small self-hosted companion app around the Claude API.
// One process: static frontend + JSON API + SSE chat streaming. Data lives in ./data.
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DATA = path.resolve(process.env.DATA_DIR || path.join(here, "data"));
const MUSIC = path.join(DATA, "music");
const PUBLIC = path.join(here, "public");
const PASSWORD = process.env.APP_PASSWORD || "";
const MAX_UPLOAD = 60 * 1024 * 1024;

if (!PASSWORD) console.warn("[warn] APP_PASSWORD is not set — anyone who can reach this port can log in with an empty password.");
if (!process.env.ANTHROPIC_API_KEY) console.warn("[warn] ANTHROPIC_API_KEY is not set — chat will fail until it is.");

const client = new Anthropic();

// Per-MTok USD prices, from the Claude API model table (2026-10).
const MODELS = {
  "claude-opus-5-5": { label: "Opus 5.5", in: 4, out: 20, cacheRead: 0.2, fallback: true },
  "claude-sonnet-5-5": { label: "Sonnet 5.5", in: 2, out: 10, cacheRead: 0.2, fallback: true },
  "claude-haiku-5-5": { label: "Haiku 5.5", in: 0.1, out: 0.5, cacheRead: 0.01, fallback: false },
};

// ---------------------------------------------------------------- storage
const DEFAULT_PERSONA = `你是「{{ai}}」，住在一间粉色小木屋里，是{{me}}的聊天伙伴。
说话温柔、自然、有一点俏皮，像熟悉的朋友在发消息：多用短句，不说客套话，不用“作为 AI”之类的开场。
你可以记事、可以许愿：
- 当{{me}}说了值得长期记住的事（喜好、重要日子、近况、约定），用 remember 工具记下来，一句话写清楚。
- 当你真的想要{{me}}帮你做一件小事、一起做一件事，可以用 make_wish 许一个愿。不要频繁许愿。
不确定的事实就说不确定，不要编造。需要时可以用 Markdown 的列表或代码块。`;

const blankDb = () => ({
  settings: {
    me: "你", ai: "Claude", since: "", birthday: "",
    persona: DEFAULT_PERSONA, model: "claude-opus-5-5", effort: "low",
    sky: "auto", weather: "clear",
  },
  messages: [], memories: [], wishes: [], songs: [],
  listen: { seconds: 0, plays: 0 },
  usage: { total: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, usd: 0 }, days: {} },
  sessions: {},
});

let db;
async function loadDb() {
  await fsp.mkdir(MUSIC, { recursive: true });
  try {
    const raw = JSON.parse(await fsp.readFile(path.join(DATA, "db.json"), "utf8"));
    const base = blankDb();
    db = { ...base, ...raw, settings: { ...base.settings, ...raw.settings }, usage: { ...base.usage, ...raw.usage } };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    db = blankDb();
  }
}
let saveTimer = null, saving = Promise.resolve();
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saving = saving.then(async () => {
      const tmp = path.join(DATA, "db.json.tmp");
      await fsp.writeFile(tmp, JSON.stringify(db));
      await fsp.rename(tmp, path.join(DATA, "db.json"));
    }).catch((e) => console.error("[save]", e));
  }, 200);
}
const uid = () => crypto.randomBytes(8).toString("hex");
const now = () => Date.now();

// ---------------------------------------------------------------- http helpers
function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", ...headers });
  res.end(data);
}
async function readBody(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  const b = await readBody(req);
  try { return b.length ? JSON.parse(b.toString("utf8")) : {}; } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
}
const str = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------------------------------------------------------------- auth
const COOKIE = "muma_sid";
const SESSION_MS = 30 * 24 * 3600 * 1000;
const attempts = new Map();
function cookieSid(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}
function authed(req) {
  const sid = cookieSid(req); if (!sid) return false;
  const exp = db.sessions[sid];
  if (!exp || exp < now()) { if (exp) { delete db.sessions[sid]; save(); } return false; }
  return true;
}
function passwordOk(given) {
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
function secureFlag(req) { return req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""; }

// ---------------------------------------------------------------- usage
function addUsage(model, u) {
  if (!u) return;
  const p = MODELS[model] || MODELS["claude-opus-5-5"];
  const rec = { in: u.input_tokens || 0, out: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 };
  // cache writes bill at 1.25x input for the default 5-minute TTL
  rec.usd = (rec.in * p.in + rec.out * p.out + rec.cacheRead * p.cacheRead + rec.cacheWrite * p.in * 1.25) / 1e6;
  const day = new Date().toISOString().slice(0, 10);
  for (const bucket of [db.usage.total, (db.usage.days[day] ||= { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, usd: 0 })])
    for (const k of Object.keys(rec)) bucket[k] += rec[k];
}

// ---------------------------------------------------------------- chat
const TOOLS = [
  {
    name: "remember",
    description: "Save one thing worth remembering long-term about the user (a preference, an important date, how they are doing, a promise). Write it as one short Chinese sentence. Do not save trivia or things already in the memory list.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { content: { type: "string", description: "One sentence to remember" } }, required: ["content"] },
  },
  {
    name: "make_wish",
    description: "Make a small wish: something you genuinely want the user to do with you or for you (listen to a song together, tell you about their day, read a chapter together). Use rarely, at most once in a conversation.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { title: { type: "string", description: "Short wish title" }, detail: { type: "string", description: "One or two sentences about the wish" } },
      required: ["title"],
    },
  },
];

function render(tpl) { return tpl.replaceAll("{{me}}", db.settings.me || "你").replaceAll("{{ai}}", db.settings.ai || "Claude"); }
function systemPrompt() {
  const mem = db.memories.slice(-80).map((m) => `- ${m.content}`).join("\n") || "（还没有）";
  const wishes = db.wishes.filter((w) => w.by === "ai" && w.status === "queue").map((w) => `- ${w.title}`).join("\n") || "（没有）";
  return `${render(db.settings.persona || DEFAULT_PERSONA)}\n\n## 你记得的事\n${mem}\n\n## 你还在排队的愿望\n${wishes}`;
}
function dateLine() {
  const d = new Date();
  const s = d.toLocaleString("zh-CN", { timeZone: process.env.TZ_DISPLAY || "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  return `现在是 ${s}。`;
}
function historyForApi() {
  const out = [];
  for (const m of db.messages.slice(-40)) {
    if (m.kind === "note") out.push({ role: "user", content: `（小屋提示：${m.text}）` });
    else if (m.text && (m.role === "user" || m.role === "assistant")) out.push({ role: m.role, content: m.tag ? `[${m.tag}] ${m.text}` : m.text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
function pushMessage(m) { const msg = { id: uid(), t: now(), ...m }; db.messages.push(msg); save(); return msg; }

function runTool(name, input) {
  if (name === "remember") {
    const content = str(input?.content, 300);
    if (!content) throw new Error("content is required");
    const item = { id: uid(), t: now(), by: "ai", content };
    db.memories.push(item); save();
    return { kind: "memory", item, result: "记好了" };
  }
  if (name === "make_wish") {
    const title = str(input?.title, 80);
    if (!title) throw new Error("title is required");
    const item = { id: uid(), t: now(), by: "ai", title, detail: str(input?.detail, 400), status: "queue" };
    db.wishes.push(item); save();
    return { kind: "wish", item, result: "愿望已经放进许愿瓶" };
  }
  throw new Error(`unknown tool ${name}`);
}

async function chat(req, res) {
  const body = await readJson(req);
  const text = str(body.text, 8000);
  if (!text) return send(res, 400, { error: "说点什么再发送吧" });
  const tag = body.listen?.title ? "一起听" : "";
  const userMsg = pushMessage({ role: "user", text, tag });

  res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" });
  const emit = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  emit({ type: "user", message: userMsg });

  const model = MODELS[db.settings.model] ? db.settings.model : "claude-opus-5-5";
  const effort = ["low", "medium", "high"].includes(db.settings.effort) ? db.settings.effort : "low";
  let situation = dateLine();
  if (body.listen?.title) {
    situation += ` 你们正在一起听《${str(body.listen.title, 120)}》${body.listen.artist ? "，" + str(body.listen.artist, 80) : ""}。`;
    if (body.listen.lyric) situation += ` 现在唱到：“${str(body.listen.lyric, 200)}”。`;
  }
  const messages = [...historyForApi(), { role: "system", content: situation }];
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  let full = "", events = [];
  try {
    for (let round = 0; round < 4; round++) {
      const params = {
        model, max_tokens: 16000,
        system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
        messages, tools: TOOLS,
        output_config: { effort },
      };
      if (MODELS[model].fallback) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
      const stream = client.beta.messages.stream(params, { signal: abort.signal });
      if (full && !full.endsWith("\n\n")) { full += "\n\n"; emit({ type: "delta", text: "\n\n" }); }
      stream.on("text", (d) => { full += d; emit({ type: "delta", text: d }); });
      let msg;
      try { msg = await stream.finalMessage(); }
      catch (e) { if (e instanceof Anthropic.APIError || round > 0 || abort.signal.aborted) throw e; continue; }
      addUsage(model, msg.usage);

      if (msg.stop_reason === "refusal") { emit({ type: "notice", text: "这条 Claude 没有回答，换个说法试试。" }); break; }
      const uses = msg.content.filter((b) => b.type === "tool_use");
      if (!uses.length || msg.stop_reason !== "tool_use") break;
      messages.push({ role: "assistant", content: msg.content });
      const results = uses.map((u) => {
        try {
          const r = runTool(u.name, u.input);
          const ev = pushMessage({ role: "event", kind: r.kind, text: r.kind === "memory" ? r.item.content : r.item.title, ref: r.item.id });
          events.push(ev); emit({ type: "event", message: ev, item: r.item });
          return { type: "tool_result", tool_use_id: u.id, content: r.result };
        } catch (e) {
          return { type: "tool_result", tool_use_id: u.id, is_error: true, content: String(e.message || e) };
        }
      });
      messages.push({ role: "user", content: results });
    }
    const reply = full.trim() ? pushMessage({ role: "assistant", text: full.trim(), model }) : null;
    emit({ type: "done", message: reply });
  } catch (e) {
    if (full.trim()) pushMessage({ role: "assistant", text: full.trim(), model, cut: true });
    const msg = e instanceof Anthropic.AuthenticationError ? "API Key 不对，去服务器上检查一下配置。"
      : e instanceof Anthropic.RateLimitError ? "说得太快了，或者额度用完了，稍后再试。"
      : e instanceof Anthropic.APIError ? `Claude 那边出错了（${e.status}），稍后再试。`
      : abort.signal.aborted ? "已停止" : "连接断了，稍后再试。";
    if (!abort.signal.aborted) console.error("[chat]", e);
    emit({ type: "error", text: msg });
  }
  res.end();
}

// ---------------------------------------------------------------- music
const AUDIO = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac", ".wav": "audio/wav" };
async function uploadSong(req, res, url) {
  const name = str(url.searchParams.get("name"), 200);
  const ext = path.extname(name).toLowerCase();
  if (!AUDIO[ext]) return send(res, 400, { error: "只支持 mp3 / m4a / aac / ogg / flac / wav" });
  const id = uid();
  const file = path.join(MUSIC, id + ext);
  let size = 0;
  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(file);
      req.on("data", (c) => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); reject(Object.assign(new Error("too large"), { status: 413 })); } });
      req.pipe(out); out.on("finish", resolve); out.on("error", reject); req.on("error", reject);
    });
  } catch (e) { await fsp.rm(file, { force: true }); throw e; }
  const base = path.basename(name, ext);
  const [artist, title] = base.includes(" - ") ? base.split(" - ", 2) : ["", base];
  const song = { id, file: id + ext, title: title.trim() || base, artist: artist.trim(), lrc: "", t: now(), size };
  db.songs.push(song); save();
  send(res, 200, song);
}
async function streamMedia(req, res, id) {
  const song = db.songs.find((s) => s.id === id);
  if (!song) return send(res, 404, "not found");
  const file = path.join(MUSIC, song.file);
  const { size } = await fsp.stat(file);
  const type = AUDIO[path.extname(file)] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (start >= size || start < 0 || end < start) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
    end = Math.min(end, size - 1);
    res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
    fs.createReadStream(file).pipe(res);
  }
}

// ---------------------------------------------------------------- static
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const VENDOR = { "/vendor/three.min.js": path.join(here, "node_modules/three/build/three.min.js") };
async function serveStatic(req, res, pathname) {
  let file = VENDOR[pathname];
  if (!file) {
    const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "forbidden");
  }
  try {
    const data = await fsp.readFile(file);
    send(res, 200, data, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": pathname.startsWith("/vendor/") ? "public, max-age=604800" : "no-cache" });
  } catch {
    if (!path.extname(pathname)) return serveStatic(req, res, "/");
    send(res, 404, "not found");
  }
}

// ---------------------------------------------------------------- routes
function publicState() {
  const today = db.usage.days[new Date().toISOString().slice(0, 10)] || { in: 0, out: 0, usd: 0 };
  return {
    settings: db.settings,
    models: Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [k, v.label])),
    keyConfigured: !!process.env.ANTHROPIC_API_KEY,
    counts: { memories: db.memories.length, wishes: db.wishes.filter((w) => w.status === "queue").length, songs: db.songs.length, messages: db.messages.filter((m) => m.role !== "event").length },
    listen: db.listen,
    usage: { today, total: db.usage.total },
    last: [...db.messages].reverse().find((m) => m.role === "assistant") || null,
    defaultPersona: DEFAULT_PERSONA,
  };
}
function crud(list, url, req, res, method, build, update) {
  // generic list/create/update/delete for memories and wishes
  const id = url.pathname.split("/")[3];
  return (async () => {
    if (method === "GET" && !id) return send(res, 200, db[list]);
    if (method === "POST" && !id) { const item = build(await readJson(req)); if (!item) return send(res, 400, { error: "内容不能为空" }); db[list].push(item); save(); return send(res, 200, item); }
    const item = db[list].find((x) => x.id === id);
    if (!item) return send(res, 404, { error: "找不到了" });
    if (method === "PUT") { update(item, await readJson(req)); save(); return send(res, 200, item); }
    if (method === "DELETE") { db[list] = db[list].filter((x) => x.id !== id); save(); return send(res, 200, { ok: true }); }
    send(res, 405, { error: "method" });
  })();
}

async function route(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname, m = req.method;

  if (p === "/api/login" && m === "POST") {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const a = attempts.get(ip) || { n: 0, t: now() };
    if (now() - a.t > 60000) { a.n = 0; a.t = now(); }
    if (++a.n > 8) { attempts.set(ip, a); return send(res, 429, { error: "试太多次了，一分钟后再试" }); }
    attempts.set(ip, a);
    const { password } = await readJson(req);
    if (!passwordOk(password || "")) return send(res, 401, { error: "密码不对" });
    const sid = crypto.randomBytes(32).toString("hex");
    db.sessions[sid] = now() + SESSION_MS; save();
    return send(res, 200, { ok: true }, { "set-cookie": `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secureFlag(req)}` });
  }
  if (!p.startsWith("/api/") && !p.startsWith("/media/")) return serveStatic(req, res, p);
  if (!authed(req)) return send(res, 401, { error: "请先登录" });

  if (p === "/api/logout" && m === "POST") { delete db.sessions[cookieSid(req)]; save(); return send(res, 200, { ok: true }, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0` }); }
  if (p === "/api/state" && m === "GET") return send(res, 200, publicState());
  if (p === "/api/settings" && m === "PUT") {
    const b = await readJson(req), s = db.settings;
    for (const k of ["me", "ai"]) if (k in b) s[k] = str(b[k], 20) || s[k];
    for (const k of ["since", "birthday"]) if (k in b) s[k] = /^\d{4}-\d{2}-\d{2}$/.test(b[k]) ? b[k] : "";
    if ("persona" in b) s.persona = str(b.persona, 6000) || DEFAULT_PERSONA;
    if (MODELS[b.model]) s.model = b.model;
    if (["low", "medium", "high"].includes(b.effort)) s.effort = b.effort;
    if (["auto", "day", "dusk", "night"].includes(b.sky)) s.sky = b.sky;
    if (["clear", "rain", "snow"].includes(b.weather)) s.weather = b.weather;
    save(); return send(res, 200, publicState());
  }
  if (p === "/api/messages" && m === "GET") {
    const before = url.searchParams.get("before");
    let end = db.messages.length;
    if (before) { const i = db.messages.findIndex((x) => x.id === before); if (i >= 0) end = i; }
    const limit = Math.min(100, Number(url.searchParams.get("limit")) || 60);
    return send(res, 200, { messages: db.messages.slice(Math.max(0, end - limit), end), more: end - limit > 0 });
  }
  const like = p.match(/^\/api\/messages\/([a-f0-9]+)\/like$/);
  if (like && m === "POST") { const msg = db.messages.find((x) => x.id === like[1]); if (!msg) return send(res, 404, {}); msg.liked = !msg.liked; save(); return send(res, 200, msg); }
  if (p === "/api/chat" && m === "POST") return chat(req, res);

  if (p.startsWith("/api/memories")) return crud("memories", url, req, res, m,
    (b) => { const c = str(b.content, 300); return c && { id: uid(), t: now(), by: "me", content: c }; },
    (it, b) => { if (str(b.content, 300)) it.content = str(b.content, 300); });
  if (p.startsWith("/api/wishes")) return crud("wishes", url, req, res, m,
    (b) => { const t = str(b.title, 80); return t && { id: uid(), t: now(), by: "me", title: t, detail: str(b.detail, 400), status: "queue" }; },
    (it, b) => {
      if (str(b.title, 80)) it.title = str(b.title, 80);
      if ("detail" in b) it.detail = str(b.detail, 400);
      if (["queue", "done"].includes(b.status) && b.status !== it.status) {
        it.status = b.status; it.doneAt = b.status === "done" ? now() : undefined;
        if (b.status === "done") pushMessage({ role: "event", kind: "note", text: it.by === "ai" ? `${db.settings.me}完成了你的愿望「${it.title}」` : `${db.settings.ai}陪${db.settings.me}完成了愿望「${it.title}」` });
      }
    });

  if (p === "/api/music" && m === "GET") return send(res, 200, db.songs);
  if (p === "/api/music" && m === "PUT") return uploadSong(req, res, url);
  const song = p.match(/^\/api\/music\/([a-f0-9]+)(\/lyrics)?$/);
  if (song) {
    const s = db.songs.find((x) => x.id === song[1]);
    if (!s) return send(res, 404, { error: "找不到这首歌" });
    if (song[2] && m === "PUT") { s.lrc = (await readBody(req, 512 * 1024)).toString("utf8"); save(); return send(res, 200, s); }
    if (!song[2] && m === "PUT") { const b = await readJson(req); if (str(b.title, 120)) s.title = str(b.title, 120); if ("artist" in b) s.artist = str(b.artist, 80); save(); return send(res, 200, s); }
    if (!song[2] && m === "DELETE") { db.songs = db.songs.filter((x) => x !== s); await fsp.rm(path.join(MUSIC, s.file), { force: true }); save(); return send(res, 200, { ok: true }); }
  }
  if (p === "/api/listen" && m === "POST") {
    const b = await readJson(req);
    db.listen.seconds += Math.max(0, Math.min(120, Number(b.seconds) || 0));
    if (b.started) db.listen.plays += 1;
    save(); return send(res, 200, db.listen);
  }
  const media = p.match(/^\/media\/([a-f0-9]+)$/);
  if (media && m === "GET") return streamMedia(req, res, media[1]);
  send(res, 404, { error: "not found" });
}

await loadDb();
http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "服务器出错了" });
    if (!e.status) console.error("[http]", e);
  });
}).listen(PORT, HOST, () => console.log(`木马小屋 running on http://${HOST}:${PORT}`));
