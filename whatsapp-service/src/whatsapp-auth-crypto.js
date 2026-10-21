import crypto from "node:crypto";

const MAX_PLAINTEXT_BYTES = 2_700_000;
const FILENAME = /^[A-Za-z0-9._-]{1,200}\.json$/;

function deriveKey(secret) {
  if (typeof secret !== "string" || secret.length < 24) throw new Error("Segredo insuficiente para criptografar a sessão WhatsApp");
  return crypto.createHash("sha256").update("vertice-climax-whatsapp-auth:v1:").update(secret).digest();
}

export function encryptAuthFiles(files, secret) {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("Formato de sessão inválido");
  for (const [name, content] of Object.entries(files)) {
    if (!FILENAME.test(name) || name.includes("..") || typeof content !== "string") throw new Error("Arquivo de sessão inválido");
  }
  const plaintext = JSON.stringify(files);
  if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("Sessão WhatsApp excede o limite seguro de persistência");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64")
  });
}

export function decryptAuthFiles(encrypted, secret) {
  if (typeof encrypted !== "string" || Buffer.byteLength(encrypted, "utf8") > 4_000_000) throw new Error("Carga criptografada inválida");
  const envelope = JSON.parse(encrypted);
  if (envelope?.version !== 1 || typeof envelope.iv !== "string" || typeof envelope.tag !== "string" || typeof envelope.data !== "string") {
    throw new Error("Envelope criptográfico inválido");
  }
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const data = Buffer.from(envelope.data, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Parâmetros criptográficos inválidos");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  const files = JSON.parse(plaintext);
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("Conteúdo da sessão inválido");
  for (const [name, content] of Object.entries(files)) {
    if (!FILENAME.test(name) || name.includes("..") || typeof content !== "string") throw new Error("Arquivo de sessão inválido");
  }
  return files;
}
