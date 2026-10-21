const MAX_FILES = 100;
const MAX_TOTAL_BYTES = 3_000_000;

export function createVercelProjectSlug(name, id) {
  const base = String(name || "site").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45) || "site";
  const suffix = String(id || "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8);
  if (suffix.length < 6) throw new Error("Identificador de projeto inválido para publicação");
  return ("vertice-" + base + "-" + suffix).slice(0, 90);
}

export function prepareVercelFiles(workspace) {
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) throw new Error("Workspace inválido");
  const entries = Object.entries(workspace);
  if (!entries.some(([name]) => name === "index.html")) throw new Error("O site precisa ter um index.html na raiz");
  if (entries.length > MAX_FILES) throw new Error("O site excede o limite de 100 arquivos");
  let totalBytes = 0;
  return entries.map(([file, content]) => {
    if (typeof file !== "string" || !file || file.startsWith("/") || file.includes("\\") || file.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("Caminho de arquivo inválido: " + String(file).slice(0, 80));
    }
    if (file.split("/").some(part => /^\.env($|\.)/i.test(part) || [".git", ".vercel", "node_modules"].includes(part.toLowerCase()))) {
      throw new Error("O site contém arquivo interno proibido: " + file.slice(0, 80));
    }
    if (typeof content !== "string") throw new Error("Conteúdo de arquivo inválido: " + file.slice(0, 80));
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > 1_500_000) throw new Error("Arquivo individual excede 1,5 MB: " + file.slice(0, 80));
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("O site excede o limite de 3 MB para publicação automática");
    return { file, data: Buffer.from(content, "utf8").toString("base64"), encoding: "base64" };
  });
}
