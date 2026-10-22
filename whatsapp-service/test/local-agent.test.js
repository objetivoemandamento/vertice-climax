import test from "node:test";
import assert from "node:assert/strict";
import { classifyIncomingMessage } from "../src/local-agent.js";

test("pedido de interrupção desativa o contato", () => {
  const result = classifyIncomingMessage("Não tenho interesse, por favor pare de mandar mensagens");
  assert.equal(result.action, "opt_out");
  assert.equal(result.stage, "Sem interesse");
  assert.match(result.reply, /Não enviarei novas mensagens/i);
});

test("pergunta de preço apresenta primeiro a opção mais completa sem pressionar", () => {
  const result = classifyIncomingMessage("Quanto custa?");
  assert.equal(result.action, "reply");
  assert.match(result.reply, /Avançado \(R\$ 2\.000\)/);
  assert.match(result.reply, /Médio \(R\$ 700\)/);
  assert.match(result.reply, /Básico \(R\$ 300\)/);
  assert.match(result.reply, /recomendar a opção adequada/i);
});

test("resposta sobre Instagram continua a descoberta", () => {
  const result = classifyIncomingMessage("A gente mostra pelo Instagram", "inicio");
  assert.equal(result.action, "reply");
  assert.equal(result.stage, "Descoberta");
  assert.match(result.reply, /facilita o contato/i);
});

test("pergunta sobre a origem do contato exige revisão humana", () => {
  const result = classifyIncomingMessage("De onde conseguiu meu contato?");
  assert.equal(result.action, "human_review");
  assert.match(result.reason, /fonte real/i);
});

test("mensagem desconhecida não dispara resposta inventada", () => {
  const result = classifyIncomingMessage("Meu gerente está viajando e retorna em 12 dias");
  assert.equal(result.action, "human_review");
  assert.equal(result.reply, undefined);
});

test("confirmação de contratação só pede cobrança quando existe pacote selecionado", () => {
  assert.equal(classifyIncomingMessage("Quero contratar").action, "reply");
  const result = classifyIncomingMessage("Quero contratar", "Interessado", { packageKey: "Avancado" });
  assert.equal(result.action, "confirm_purchase");
  assert.equal(result.packageKey, "Avancado");
});

test("escolha de pacote pede confirmação explícita antes de cobrar", () => {
  const result = classifyIncomingMessage("Quero o pacote avançado", "Interessado");
  assert.equal(result.action, "select_package");
  assert.equal(result.packageKey, "Avancado");
  assert.match(result.reply, /Só envio a cobrança se você confirmar/i);
});
