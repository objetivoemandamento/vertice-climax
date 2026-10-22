import { getPackagePrice } from "./mercadopago.js";

export function buildPixChargeMessage({ leadName, packageKey, amount, pixKey, pixHolder, pixBank = "" }) {
  const expected = getPackagePrice(packageKey);
  if (expected === null || Number(amount) !== expected) throw new Error("Pacote e valor não correspondem à tabela aprovada.");
  if (typeof pixKey !== "string" || !pixKey.trim() || typeof pixHolder !== "string" || !pixHolder.trim()) {
    throw new Error("Chave Pix e titular precisam estar configurados.");
  }
  const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(expected);
  const lines = [
    "Olá" + (leadName ? " " + leadName.trim().slice(0, 100) : "") + "! Seguem os dados para pagamento do projeto Vértice Climax.",
    "Pacote: " + packageKey + ".",
    "Valor: " + formattedAmount + ".",
    "Chave Pix: " + pixKey.trim().slice(0, 200),
    "Titular: " + pixHolder.trim().slice(0, 120)
  ];
  if (typeof pixBank === "string" && pixBank.trim()) lines.push("Instituição: " + pixBank.trim().slice(0, 120));
  lines.push("Após realizar a transferência, envie o comprovante por esta conversa. O comprovante será conferido e o projeto só será liberado após a confirmação do crédito na conta.");
  return lines.join("\n");
}

export function isPixReceiptAttachment(message) {
  const body = message?.message || {};
  return Boolean(body.imageMessage || body.documentMessage || body.videoMessage);
}
