import assert from "node:assert/strict";

const base = (process.env.BASE_URL || "http://127.0.0.1:" + (process.env.PORT || "8787")).replace(/\\/+$/, "");
const token = process.env.VERTICE_SERVICE_TOKEN || "";
const remote = !/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/i.test(base);
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
  const headers = { Authorization: "Bearer " + token };
  const auth = await request("/api/status", { headers });
  assert.equal(auth.response.status, 200, "token configurado deve permitir consultar status");
  assert.equal(typeof auth.body.connected, "boolean", "status deve informar conexão");
  assert.equal(typeof auth.body.qrAvailable, "boolean", "status deve informar disponibilidade do QR");
  console.log("PASS status autenticado");

  const deadline = Date.now() + Number(process.env.QR_WAIT_MS || 120000);
  let qrResult;
  do {
    qrResult = await request("/api/qr", { headers });
    if (qrResult.response.status === 200) break;
    assert.equal(qrResult.response.status, 202, "GET /api/qr deve retornar QR ou indicar geração pendente");
    await new Promise(resolve => setTimeout(resolve, 2000));
  } while (Date.now() < deadline);
  assert.equal(qrResult.response.status, 200, "QR real deve estar disponível no prazo de teste");
  assert.equal(qrResult.body.connected, false, "QR deve representar um fluxo de pareamento ainda não concluído");
  assert.match(qrResult.body.qrDataUrl || "", /^data:image\\/png;base64,/, "endpoint deve retornar um QR PNG renderizado");
  console.log("PASS QR real gerado e servido pelo endpoint");
} else {
  console.log("SKIP status/QR autenticado: defina VERTICE_SERVICE_TOKEN para testar o pareamento");
}
console.log("Smoke test concluído.");
