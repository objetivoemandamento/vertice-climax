import "dotenv/config";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.VERTICE_SERVICE_TOKEN || "";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(here, "../data"));
const AUTH_DIR = path.join(DATA_DIR, "auth");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const MESSAGE_LIMIT = Math.max(50, Math.min(2000, Number(process.env.MESSAGE_CACHE_LIMIT || 500)));
const CHAT_LIMIT = Math.max(50, Math.min(5000, Number(process.env.CHAT_CACHE_LIMIT || 1000)));
const origins = (process.env.FRONTEND_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);

if (TOKEN.length < 24 || TOKEN.includes("troque-por")) {
  console.error("Configure VERTICE_SERVICE_TOKEN com um segredo aleatório de pelo menos 24 caracteres.");
  process.exit(1);
}

fs.mkdirSync(AUTH_DIR, { recursive: true });
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error("Origem CORS não autorizada"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "64kb", strict: true }));

let sock = null;
let qr = null;
let connected = false;
let connecting = false;
let user = null;
let lastConnectionError = null;
const chats = new Map();
const messages = new Map();
const sendTimes = [];
const perChatSendTimes = new Map();
let persistQueue = Promise.resolve();
let sessionResetPromise = Promise.resolve();

function safeString(value, max = 10000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function extractText(message) {
  const body = message?.message || {};
  return body.conversation
    || body.extendedTextMessage?.text
    || body.imageMessage?.caption
    || body.videoMessage?.caption
    || body.documentMessage?.caption
    || body.buttonsResponseMessage?.selectedDisplayText
    || body.listResponseMessage?.title
    || body.templateButtonReplyMessage?.selectedDisplayText
    || "";
}
function persistStore() {
  const snapshot = JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    chats: [...chats.values()].slice(-CHAT_LIMIT),
    messages: [...messages.entries()].map(([id, items]) => [id, items.slice(-MESSAGE_LIMIT)]).slice(-CHAT_LIMIT)
  });
  persistQueue = persistQueue.then(async () => {
    const tmp = STORE_FILE + ".tmp";
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(tmp, snapshot, { mode: 0o600 });
    await fsp.rename(tmp, STORE_FILE);
  }).catch(error => console.error("Falha ao persistir cache:", error.message));
  return persistQueue;
}
async function loadStore() {
  try {
    const raw = await fsp.readFile(STORE_FILE, "utf8");
    const data = JSON.parse(raw);
    for (const c of Array.isArray(data.chats) ? data.chats.slice(-CHAT_LIMIT) : []) {
      if (c && typeof c.id === "string") chats.set(c.id, c);
    }
    for (const pair of Array.isArray(data.messages) ? data.messages.slice(-CHAT_LIMIT) : []) {
      if (Array.isArray(pair) && typeof pair[0] === "string" && Array.isArray(pair[1])) {
        messages.set(pair[0], pair[1].slice(-MESSAGE_LIMIT));
      }
    }
    console.log("Cache local restaurado:", chats.size, "conversas");
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Cache local inválido; iniciando vazio:", error.message);
  }
}
function cacheMessage(jid, message) {
  if (!jid || !message) return;
  const text = safeString(extractText(message), 10000);
  const id = message.key?.id || crypto.randomUUID();
  const list = messages.get(jid) || [];
  if (list.some(item => item.id === id)) return;
  list.push({
    id,
    text,
    fromMe: Boolean(message.key?.fromMe),
    timestamp: Number(message.messageTimestamp || Date.now() / 1000) * 1000,
    type: text ? "text" : "other"
  });
  if (list.length > MESSAGE_LIMIT) list.splice(0, list.length - MESSAGE_LIMIT);
  messages.set(jid, list);

  const existing = chats.get(jid) || { id: jid, name: safeString(message.pushName, 120) || jid };
  chats.set(jid, {
    ...existing,
    id: jid,
    name: safeString(existing.name, 120) || safeString(message.pushName, 120) || jid,
    lastMessage: text || "[Mensagem sem texto]",
    updatedAt: Date.now()
  });
  while (chats.size > CHAT_LIMIT) {
    const oldest = [...chats.values()].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))[0];
    if (!oldest) break;
    chats.delete(oldest.id);
    messages.delete(oldest.id);
  }
  void persistStore();
}
function timingSafeToken(req) {
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireAuth(req, res, next) {
  if (!timingSafeToken(req)) return res.status(401).json({ error: "Token inválido ou ausente" });
  next();
}
function sendRateLimit(chatId) {
  const now = Date.now();
  while (sendTimes.length && now - sendTimes[0] > 60000) sendTimes.shift();
  const times = perChatSendTimes.get(chatId) || [];
  while (times.length && now - times[0] > 60000) times.shift();
  if (sendTimes.length >= 20 || times.length >= 5) return false;
  sendTimes.push(now);
  times.push(now);
  perChatSendTimes.set(chatId, times);
  return true;
}

async function startWhatsApp() {
  if (connecting || connected) return;
  connecting = true;
  lastConnectionError = null;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (error) {
      console.warn("Não foi possível consultar a versão mais recente do WhatsApp Web; usando padrão da biblioteca.");
    }
    sock = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async () => undefined
    });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", ({ connection, qr: newQr, lastDisconnect }) => {
      if (newQr) qr = newQr;
      if (connection === "open") {
        connected = true;
        connecting = false;
        qr = null;
        user = sock?.user || null;
        lastConnectionError = null;
        console.log("WhatsApp conectado");
      }
      if (connection === "close") {
        connected = false;
        connecting = false;
        user = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        lastConnectionError = statusCode ? "Conexão encerrada (código " + statusCode + ")" : "Conexão encerrada";
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => startWhatsApp().catch(error => console.error("Reconexão falhou:", error.message)), 3000);
        } else {
          qr = null;
          sock = null;
          sessionResetPromise = fsp.rm(AUTH_DIR, { recursive: true, force: true })
            .then(() => fsp.mkdir(AUTH_DIR, { recursive: true }))
            .catch(error => console.error("Não foi possível limpar a sessão encerrada:", error.message));
          console.warn("Sessão encerrada pelo WhatsApp. Solicite um novo QR Code para vincular novamente.");
        }
      }
    });
    sock.ev.on("chats.upsert", items => {
      for (const chat of items || []) {
        if (!chat.id) continue;
        const old = chats.get(chat.id) || {};
        chats.set(chat.id, {
          ...old,
          id: chat.id,
          name: safeString(chat.name || chat.subject || old.name, 120) || chat.id,
          updatedAt: Date.now()
        });
      }
      void persistStore();
    });
    sock.ev.on("chats.update", items => {
      for (const chat of items || []) {
        if (!chat.id) continue;
        const old = chats.get(chat.id) || {};
        chats.set(chat.id, {
          ...old,
          ...chat,
          id: chat.id,
          name: safeString(chat.name || chat.subject || old.name, 120) || chat.id,
          updatedAt: Date.now()
        });
      }
      void persistStore();
    });
    sock.ev.on("messages.upsert", ({ messages: incoming }) => {
      for (const message of incoming || []) cacheMessage(message.key?.remoteJid, message);
    });
  } catch (error) {
    connecting = false;
    lastConnectionError = "Falha ao iniciar o conector";
    console.error("Erro ao iniciar sessão WhatsApp:", error.message);
  }
}

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "vertice-climax-whatsapp",
  connected,
  connecting,
  uptimeSeconds: Math.floor(process.uptime()),
  cachedChats: chats.size,
  cachedMessages: [...messages.values()].reduce((total, items) => total + items.length, 0)
}));
app.use("/api", requireAuth);
app.get("/api/status", (_req, res) => res.json({
  connected,
  connecting,
  qrAvailable: Boolean(qr),
  user: connected && user ? { id: user.id, name: user.name } : null,
  message: connected ? "WhatsApp conectado" : connecting ? "Conectando ao WhatsApp" : "Aguardando QR Code",
  lastConnectionError
}));
app.get("/api/qr", async (_req, res) => {
  if (connected) return res.json({ connected: true, message: "WhatsApp já conectado" });
  if (!sock && !connecting) {
    await sessionResetPromise;
    await startWhatsApp();
  }
  if (!qr) return res.status(202).json({ message: "QR ainda não disponível; tente novamente em alguns segundos" });
  try {
    return res.json({ connected: false, qrDataUrl: await QRCode.toDataURL(qr, { width: 360, margin: 2 }) });
  } catch (error) {
    console.error("Falha ao gerar QR:", error.message);
    return res.status(500).json({ error: "Falha ao gerar QR Code" });
  }
});
app.get("/api/chats", (_req, res) => {
  if (!connected) return res.status(409).json({ error: "WhatsApp não conectado" });
  return res.json({ chats: [...chats.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, CHAT_LIMIT) });
});
app.get("/api/messages", (req, res) => {
  if (!connected) return res.status(409).json({ error: "WhatsApp não conectado" });
  const id = String(req.query.chatId || "");
  if (!id || id.length > 180) return res.status(400).json({ error: "chatId inválido" });
  return res.json({ messages: (messages.get(id) || []).slice(-200) });
});
app.post("/api/send", async (req, res) => {
  if (!connected || !sock) return res.status(409).json({ error: "WhatsApp não conectado" });
  const { chatId, text, approved } = req.body || {};
  if (approved !== true) return res.status(400).json({ error: "Aprovação explícita obrigatória" });
  if (typeof chatId !== "string" || (!chatId.endsWith("@s.whatsapp.net") && !chatId.endsWith("@g.us")) || chatId.length > 180) {
    return res.status(400).json({ error: "Identificador de conversa inválido" });
  }
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return res.status(400).json({ error: "Mensagem vazia ou maior que 4000 caracteres" });
  }
  if (!sendRateLimit(chatId)) return res.status(429).json({ error: "Limite de envio atingido. Aguarde antes de enviar outra mensagem." });
  try {
    const sent = await sock.sendMessage(chatId, { text: text.trim() });
    cacheMessage(chatId, {
      key: { id: sent?.key?.id || crypto.randomUUID(), fromMe: true, remoteJid: chatId },
      message: { conversation: text.trim() },
      messageTimestamp: Date.now() / 1000
    });
    return res.json({ ok: true, message: "Mensagem enviada após aprovação explícita", id: sent?.key?.id || null });
  } catch (error) {
    console.error("Falha de envio WhatsApp:", error.message);
    return res.status(502).json({ error: "Não foi possível enviar a mensagem" });
  }
});
app.use((error, _req, res, _next) => {
  if (error?.message === "Origem CORS não autorizada") return res.status(403).json({ error: error.message });
  if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "JSON inválido" });
  console.error("Erro HTTP:", error.message);
  return res.status(500).json({ error: "Erro interno do serviço" });
});

async function shutdown(signal) {
  console.log("Encerrando serviço (" + signal + ")...");
  try {
    await persistStore();
    if (sock) sock.end(undefined);
  } catch (error) {
    console.error("Erro durante encerramento:", error.message);
  }
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await loadStore();
app.listen(PORT, "0.0.0.0", () => console.log("Vértice WhatsApp service na porta " + PORT));
void startWhatsApp();
