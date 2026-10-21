import crypto from "node:crypto";

const PACKAGE_PRICES = Object.freeze({ Basico: 300, Medio: 700, Avancado: 2000 });

export function getPackagePrice(packageKey) {
  return Object.hasOwn(PACKAGE_PRICES, packageKey) ? PACKAGE_PRICES[packageKey] : null;
}

export function verifyMercadoPagoSignature({ signature, requestId, dataId, secret }) {
  if (typeof signature !== "string" || typeof requestId !== "string" || !requestId ||
      typeof dataId !== "string" || !dataId || typeof secret !== "string" || !secret) return false;
  const fields = Object.fromEntries(signature.split(",").map(part => {
    const index = part.indexOf("=");
    return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
  const timestamp = fields.ts;
  const supplied = fields.v1;
  if (!timestamp || !/^[a-f0-9]{64}$/i.test(supplied || "")) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest();
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function isMatchingApprovedPayment(payment, lead) {
  const expectedPrice = getPackagePrice(lead?.packageKey);
  return expectedPrice !== null &&
    String(payment?.external_reference || "") === String(lead?.id || "") &&
    payment?.status === "approved" &&
    payment?.currency_id === "BRL" &&
    Number(payment?.transaction_amount) === expectedPrice;
}
