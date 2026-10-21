import test from "node:test";
import assert from "node:assert/strict";
import { encryptAuthFiles, decryptAuthFiles } from "../src/whatsapp-auth-crypto.js";

test("sessão WhatsApp é criptografada e restaurada sem alterar arquivos", () => {
  const files = { "creds.json": JSON.stringify({ registered: true }), "session-1.json": JSON.stringify({ key: "value" }) };
  const encrypted = encryptAuthFiles(files, "a-very-long-test-secret-that-is-not-production");
  assert.notEqual(encrypted, JSON.stringify(files));
  assert.deepEqual(decryptAuthFiles(encrypted, "a-very-long-test-secret-that-is-not-production"), files);
});

test("chave incorreta não consegue descriptografar a sessão", () => {
  const encrypted = encryptAuthFiles({ "creds.json": "{}" }, "a-very-long-test-secret-that-is-not-production");
  assert.throws(() => decryptAuthFiles(encrypted, "another-long-test-secret-not-production"), /authenticate|Unsupported state|bad decrypt/i);
});

test("não permite nomes de arquivos com caminhos", () => {
  assert.throws(() => encryptAuthFiles({ "../secrets.json": "{}" }, "a-very-long-test-secret-that-is-not-production"), /Arquivo de sessão inválido/);
});
