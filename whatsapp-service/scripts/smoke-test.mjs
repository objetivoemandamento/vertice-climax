import assert from "node:assert/strict";

const base = (process.env.BASE_URL || "http://127.0.0.1:" + (process.env.PORT || "8787")).replace(/\/+$/, "");
const token = process.env.VERTICE_SERVICE_TOKEN || "";
const remote = !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base);
if (remote && process.env.ALLOW_REMOTE_SMOKE !== "1") {
  console.error("Por segurança, o smoke test só executa em localhost. Para um endpoint remoto, defina ALLOW_REMOTE_SMOKE=1 explicitamente.");
  process.exit(2);
}
async function request(path, options) {
  const response = await fetch(base + path, options);
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}
const health = await request("/health");
assert.equal(health.response.status, 200, "GET /health deve retornar HTTP 200");
assert.equal(health.body.ok, true, "health deve indicar ok=true");
assert.equal(health.body.service, "vertice-climax-whatsapp", "nome do serviço deve corresponder");
console.log("PASS health endpoint");

const unauth = await request("/api/status");
assert.equal(unauth.response.status, 401, "rotas /api devem rejeitar chamadas sem token");
console.log("PASS proteção por token");

if (token) {
  const auth = await request("/api/status", { headers: { Authorization: "Bearer " + token } });
  assert.equal(auth.response.status, 200, "token configurado deve permitir consultar status");
  assert.equal(typeof auth.body.connected, "boolean", "status deve informar conexão");
  console.log("PASS status autenticado");
} else {
  console.log("SKIP status autenticado: defina VERTICE_SERVICE_TOKEN para testar também a autenticação válida");
}
console.log("Smoke test concluído.");
