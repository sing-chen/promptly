// Zero-dependency static file server for previewing dist/ while iterating.
// Not part of the build pipeline — see README's "serve them with any static
// file server" note. Run with: node scripts/dev-server.mjs
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = process.env.PORT || 4173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      let filePath = path.join(root, urlPath);

      let st = await stat(filePath).catch(() => null);
      if (st?.isDirectory()) filePath = path.join(filePath, "index.html");
      else if (!st && !path.extname(filePath)) filePath = path.join(filePath, "index.html");

      const body = await readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  })
  .listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
