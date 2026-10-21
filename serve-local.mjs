import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
const port = Number(process.env.VERTICE_WEB_PORT || 8080);
const types = {
  ".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",".ico":"image/x-icon",".webp":"image/webp",".txt":"text/plain; charset=utf-8"
};
const server = http.createServer(async (req,res) => {
  if (!["GET","HEAD"].includes(req.method || "")) {
    res.writeHead(405,{"Allow":"GET, HEAD"});res.end("Method not allowed");return;
  }
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = path.resolve(root, "." + requested);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(403);res.end("Forbidden");return;
    }
    const stat = await fs.stat(target);
    if (!stat.isFile()) {res.writeHead(404);res.end("Not found");return;}
    const body = await fs.readFile(target);
    res.writeHead(200, {
      "Content-Type":types[path.extname(target).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer",
      "Cache-Control":"no-store"
    });
    if (req.method === "HEAD") res.end(); else res.end(body);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 400,{"Content-Type":"text/plain; charset=utf-8"});
    res.end(error.code === "ENOENT" ? "Not found" : "Bad request");
  }
});
server.listen(port,host,()=>console.log("Vértice Climax local: http://"+host+":"+port));
