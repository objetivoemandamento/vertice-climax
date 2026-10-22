import test from "node:test";
import assert from "node:assert/strict";
import { buildPixChargeMessage, isPixReceiptAttachment } from "../src/pix-payment.js";

test("Pix charge message contains configured recipient, exact package amount and verification warning", () => {
  const message = buildPixChargeMessage({ leadName: "Loja Exemplo", packageKey: "Medio", amount: 700, pixKey: "pix@example.com", pixHolder: "Empresa Exemplo", pixBank: "Banco Exemplo" });
  assert.match(message, /R\$\s?700,00/);
  assert.match(message, /pix@example\.com/);
  assert.match(message, /Empresa Exemplo/);
  assert.match(message, /comprovante/);
  assert.match(message, /confirmação do crédito/);
});

test("Pix charge refuses mismatched amounts or missing key", () => {
  assert.throws(() => buildPixChargeMessage({ packageKey: "Medio", amount: 699, pixKey: "k", pixHolder: "h" }));
  assert.throws(() => buildPixChargeMessage({ packageKey: "Medio", amount: 700, pixKey: "", pixHolder: "h" }));
});

test("only incoming media attachments count as a possible Pix receipt", () => {
  assert.equal(isPixReceiptAttachment({ message: { imageMessage: {} } }), true);
  assert.equal(isPixReceiptAttachment({ message: { documentMessage: {} } }), true);
  assert.equal(isPixReceiptAttachment({ message: { conversation: "paguei" } }), false);
});
