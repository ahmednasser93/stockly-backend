#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsDir = path.resolve(__dirname, "../docs");
const defaultFile = "endpoints.html";
const port = Number(process.env.PORT) || 4173;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const sanitizedPath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(
    docsDir,
    sanitizedPath === "/" ? defaultFile : sanitizedPath
  );

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Docs server running on http://localhost:${port}`);
  console.log(`Serving ${path.join(docsDir, defaultFile)}`);
});
