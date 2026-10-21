import test from "node:test";
import assert from "node:assert/strict";
import { createVercelProjectSlug, prepareVercelFiles } from "../src/vercel-publish.js";

test("slug de publicação é estável, normalizado e exclusivo por projeto", () => {
  assert.equal(createVercelProjectSlug("Café da Manhã", "12345678-aaaa"), "vertice-cafe-da-manha-12345678");
  assert.notEqual(createVercelProjectSlug("Café da Manhã", "12345678-aaaa"), createVercelProjectSlug("Café da Manhã", "87654321-bbbb"));
});

test("arquivos válidos são preparados como base64", () => {
  const files = prepareVercelFiles({ "index.html": "<h1>Olá</h1>", "assets/style.css": "body{}" });
  assert.equal(files.length, 2);
  assert.equal(files[0].encoding, "base64");
  assert.equal(Buffer.from(files[0].data, "base64").toString("utf8"), "<h1>Olá</h1>");
});

test("publicação rejeita ausência de index, traversal e segredos", () => {
  assert.throws(() => prepareVercelFiles({ "home.html": "x" }), /index.html/);
  assert.throws(() => prepareVercelFiles({ "index.html": "x", "../secret.txt": "x" }), /Caminho de arquivo inválido/);
  assert.throws(() => prepareVercelFiles({ "index.html": "x", ".env": "SECRET" }), /arquivo interno proibido/);
});
