// Railway (veya herhangi bir Node sunucusu) için: public/ klasörünü sunar ve
// api/ fonksiyonlarını Vercel'deki gibi çalıştırır. Vercel bu dosyayı kullanmaz.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "./api/config.js";
import analyze from "./api/analyze.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const routes = { "/api/config": config, "/api/analyze": analyze };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };

function vercelRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.headersSent) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return raw; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    const handler = routes[url.pathname];
    if (handler) {
      req.body = await readBody(req);
      await handler(req, vercelRes(res));
      return;
    }
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.statusCode = 403; res.end("Forbidden"); return; }
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    let data;
    try { data = await readFile(file); }
    catch { data = await readFile(path.join(root, "index.html")); file = "index.html"; }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(data);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); }
    res.end(JSON.stringify({ error: "Sunucu hatası" }));
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Meeting Copilot http://localhost:${port}`));
