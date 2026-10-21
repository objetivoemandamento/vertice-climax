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
import { classifyIncomingMessage } from "./local-agent.js";

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
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "3mb", strict: true }));

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
let automationEnabled = false;
const automationContacts = new Map();
const processedAutoMessageIds = new Set();
const hubState = { version: 1, updatedAt: null, leads: [], projects: [], workspaces: {} };

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
    messages: [...messages.entries()].map(([id, items]) => [id, items.slice(-MESSAGE_LIMIT)]).slice(-CHAT_LIMIT),
    automationEnabled,
    automationContacts: [...automationContacts.values()].slice(-CHAT_LIMIT),
    processedAutoMessageIds: [...processedAutoMessageIds].slice(-2000),
    hubState
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
    if (data.hubState && typeof data.hubState === "object") {
      hubState.updatedAt = typeof data.hubState.updatedAt === "string" ? data.hubState.updatedAt : null;
      hubState.leads = Array.isArray(data.hubState.leads) ? data.hubState.leads.slice(-5000) : [];
      hubState.projects = Array.isArray(data.hubState.projects) ? data.hubState.projects.slice(-1000) : [];
      hubState.workspaces = data.hubState.workspaces && typeof data.hubState.workspaces === "object" && !Array.isArray(data.hubState.workspaces) ? data.hubState.workspaces : {};
    }
    automationEnabled = data.automationEnabled === true;
    for (const contact of Array.isArray(data.automationContacts) ? data.automationContacts.slice(-CHAT_LIMIT) : []) {
      if (contact && typeof contact.chatId === "string") automationContacts.set(contact.chatId, contact);
    }
    for (const id of Array.isArray(data.processedAutoMessageIds) ? data.processedAutoMessageIds.slice(-2000) : []) {
      if (typeof id === "string") processedAutoMessageIds.add(id);
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
async function processIncomingAutomation(jid, message) {
  const id = message?.key?.id;
  if (!automationEnabled || !jid || !jid.endsWith("@s.whatsapp.net") || message?.key?.fromMe || !id || processedAutoMessageIds.has(id)) return;
  const contact = automationContacts.get(jid);
  if (!contact || contact.consent !== true || contact.enabled !== true) return;
  const text = safeString(extractText(message), 10000);
  if (!text.trim()) return;
  processedAutoMessageIds.add(id);
  while (processedAutoMessageIds.size > 2000) processedAutoMessageIds.delete(processedAutoMessageIds.values().next().value);
  const decision = classifyIncomingMessage(text, contact.stage || "inicio");
  contact.lastInboundAt = Date.now();
  contact.lastReason = decision.reason || null;
  contact.stage = decision.stage || contact.stage || "inicio";
  contact.needsHuman = decision.action === "human_review";
  if (decision.action === "opt_out") {
    contact.enabled = false;
    contact.consent = false;
    contact.stage = "Sem interesse";
  }
  void persistStore();
  if (!decision.reply || !["reply", "opt_out"].includes(decision.action)) {
    if (contact.needsHuman) console.log("Agente local aguardando revisão humana para", jid);
    return;
  }
  if (!sendRateLimit(jid)) {
    contact.needsHuman = true;
    contact.lastReason = "Limite de envio atingido; resposta automática não enviada.";
    void persistStore();
    return;
  }
  try {
    const sent = await sock.sendMessage(jid, { text: decision.reply });
    cacheMessage(jid, {
      key: { id: sent?.key?.id || crypto.randomUUID(), fromMe: true, remoteJid: jid },
      message: { conversation: decision.reply },
      messageTimestamp: Date.now() / 1000
    });
    contact.lastAutoReplyAt = Date.now();
    contact.needsHuman = false;
    void persistStore();
    console.log("Resposta local enviada para conversa autorizada:", jid, "ação:", decision.action);
  } catch (error) {
    contact.needsHuman = true;
    contact.lastReason = "Falha ao enviar resposta automática.";
    void persistStore();
    console.error("Resposta automática falhou:", error.message);
  }
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
    sock.ev.on("messages.upsert", ({ messages: incoming, type }) => {
      for (const message of incoming || []) {
        const jid = message.key?.remoteJid;
        cacheMessage(jid, message);
        if (type === "notify" && !message.key?.fromMe) void processIncomingAutomation(jid, message);
      }
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
app.get("/api/hub/state", (_req, res) => {
  return res.json({
    version: hubState.version,
    updatedAt: hubState.updatedAt,
    leads: hubState.leads,
    projects: hubState.projects,
    workspaces: hubState.workspaces
  });
});
app.put("/api/hub/state", async (req, res) => {
  const input = req.body || {};
  if (input.leads !== undefined && (!Array.isArray(input.leads) || input.leads.length > 5000)) {
    return res.status(400).json({ error: "leads deve ser uma lista de até 5000 registros" });
  }
  if (input.projects !== undefined && (!Array.isArray(input.projects) || input.projects.length > 1000)) {
    return res.status(400).json({ error: "projects deve ser uma lista de até 1000 projetos" });
  }
  if (input.workspaces !== undefined && (!input.workspaces || typeof input.workspaces !== "object" || Array.isArray(input.workspaces))) {
    return res.status(400).json({ error: "workspaces deve ser um objeto" });
  }
  if (input.leads !== undefined) {
    if (input.leads.some(item => !item || typeof item.id !== "string" || typeof item.name !== "string" || item.name.length > 120)) {
      return res.status(400).json({ error: "Cada lead precisa de id e nome válidos" });
    }
    hubState.leads = input.leads.map(item => ({
      ...item,
      name: safeString(item.name, 120),
      notes: safeString(item.notes, 3000),
      consentEvidence: safeString(item.consentEvidence, 500),
      consent: item.consent === true && Boolean(item.consentEvidence),
      doNotContact: item.doNotContact === true || item.stage === "Sem interesse",
      updatedAt: safeString(item.updatedAt, 60) || new Date().toISOString()
    })).slice(-5000);
  }
  if (input.projects !== undefined) {
    hubState.projects = input.projects.filter(item => item && typeof item.id === "string").slice(-1000);
  }
  if (input.workspaces !== undefined) {
    const entries = Object.entries(input.workspaces).slice(-100);
    let totalBytes = 0;
    const safeWorkspaces = {};
    for (const [key, files] of entries) {
      if (typeof key !== "string" || key.length > 120 || !files || typeof files !== "object" || Array.isArray(files)) continue;
      const safeFiles = {};
      for (const [name, content] of Object.entries(files).slice(0, 300)) {
        if (typeof name !== "string" || name.length > 180 || name.startsWith("/") || name.split("/").includes("..") || name.split("/").some(part => part.startsWith(".env")) || typeof content !== "string") continue;
        totalBytes += Buffer.byteLength(content, "utf8");
        if (totalBytes > 2_000_000) return res.status(413).json({ error: "Workspace excede o limite total de 2 MB" });
        safeFiles[name] = content;
      }
      safeWorkspaces[key] = safeFiles;
    }
    hubState.workspaces = safeWorkspaces;
  }
  hubState.updatedAt = new Date().toISOString();
  try {
    await persistStore();
    return res.json({ ok: true, updatedAt: hubState.updatedAt, counts: { leads: hubState.leads.length, projects: hubState.projects.length, workspaces: Object.keys(hubState.workspaces).length } });
  } catch {
    return res.status(500).json({ error: "Não foi possível persistir o estado central" });
  }
});
app.get("/api/status", (_req, res) => res.json({
  connected,
  connecting,
  qrAvailable: Boolean(qr),
  user: connected && user ? { id: user.id, name: user.name } : null,
  message: connected ? "WhatsApp conectado" : connecting ? "Conectando ao WhatsApp" : "Aguardando QR Code",
  lastConnectionError,
  automationEnabled
}));
app.get("/api/automation", (_req, res) => res.json({
  enabled: automationEnabled,
  contacts: [...automationContacts.values()].map(contact => ({
    chatId: contact.chatId,
    name: contact.name,
    consent: contact.consent,
    enabled: contact.enabled,
    stage: contact.stage,
    needsHuman: contact.needsHuman || false,
    lastReason: contact.lastReason || null
  }))
}));
app.post("/api/automation/config", (req, res) => {
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "enabled deve ser booleano" });
  automationEnabled = req.body.enabled;
  void persistStore();
  return res.json({ ok: true, enabled: automationEnabled });
});
app.post("/api/automation/contacts", (req, res) => {
  const { chatId, name, consent, consentEvidence } = req.body || {};
  if (typeof chatId !== "string" || !chatId.endsWith("@s.whatsapp.net") || chatId.length > 180) {
    return res.status(400).json({ error: "Selecione uma conversa individual válida" });
  }
  if (consent !== true) return res.status(400).json({ error: "É necessário registrar autorização válida antes de ativar respostas automáticas" });
  if (typeof consentEvidence !== "string" || !consentEvidence.trim() || consentEvidence.length > 500) return res.status(400).json({ error: "Registre a data ou referência da autorização" });
  const old = automationContacts.get(chatId) || {};
  if (old.consent === false && old.consentEvidence && consentEvidence.trim() === old.consentEvidence) {
    return res.status(409).json({ error: "Após desativação ou recusa, registre uma nova autorização verificável antes de reativar o contato." });
  }
  const contact = {
    ...old,
    chatId,
    name: safeString(name, 120) || chats.get(chatId)?.name || chatId,
    consent: true,
    consentEvidence: safeString(consentEvidence, 500),
    enabled: true,
    stage: old.stage || "inicio",
    updatedAt: Date.now(),
    needsHuman: false
  };
  automationContacts.set(chatId, contact);
  void persistStore();
  return res.json({ ok: true, contact: { chatId: contact.chatId, name: contact.name, enabled: contact.enabled, stage: contact.stage } });
});
app.delete("/api/automation/contacts/:chatId", (req, res) => {
  let chatId;
  try { chatId = decodeURIComponent(req.params.chatId); } catch { return res.status(400).json({ error: "chatId inválido" }); }
  const contact = automationContacts.get(chatId);
  if (!contact) return res.status(404).json({ error: "Contato do agente não encontrado" });
  contact.enabled = false;
  contact.consent = false;
  contact.stage = "Desativado";
  contact.updatedAt = Date.now();
  void persistStore();
  return res.json({ ok: true, message: "Agente desativado para este contato" });
});
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
