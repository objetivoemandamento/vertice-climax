import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getPackagePrice, isMatchingApprovedPayment, verifyMercadoPagoSignature } from "../src/mercadopago.js";

test("preços dos pacotes são explícitos e não aceitam chaves desconhecidas", () => {
  assert.equal(getPackagePrice("Basico"), 300);
  assert.equal(getPackagePrice("Medio"), 700);
  assert.equal(getPackagePrice("Avancado"), 2000);
  assert.equal(getPackagePrice("Premium"), null);
});

test("assinatura válida do Mercado Pago é aceita e alteração é rejeitada", () => {
  const secret = "webhook-test-secret";
  const requestId = "request-123";
  const dataId = "987654321";
  const ts = "1730000000";
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  assert.equal(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId, dataId, secret }), true);
  assert.equal(verifyMercadoPagoSignature({ signature: `ts=${ts},v1=${v1}`, requestId, dataId: "987654322", secret }), false);
  assert.equal(verifyMercadoPagoSignature({ signature: "ts=1,v1=bad", requestId, dataId, secret }), false);
});

test("pagamento só é conciliado quando status, referência, moeda e valor coincidem", () => {
  const lead = { id: "lead-1", packageKey: "Medio" };
  const valid = { id: 10, external_reference: "lead-1", status: "approved", currency_id: "BRL", transaction_amount: 700 };
  assert.equal(isMatchingApprovedPayment(valid, lead), true);
  assert.equal(isMatchingApprovedPayment({ ...valid, transaction_amount: 699 }, lead), false);
  assert.equal(isMatchingApprovedPayment({ ...valid, external_reference: "other" }, lead), false);
  assert.equal(isMatchingApprovedPayment({ ...valid, status: "pending" }, lead), false);
  assert.equal(isMatchingApprovedPayment({ ...valid, currency_id: "USD" }, lead), false);
});
