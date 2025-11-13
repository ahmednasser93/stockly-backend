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
const authUser = process.env.DOCS_USER ?? "stockly";
const authPass = process.env.DOCS_PASS ?? "dashboard";

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

const unauthorized = (res) => {
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Stockly Docs"',
  });
  res.end("Authentication required");
};

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Basic ") ? header.slice("Basic ".length) : "";
  const decoded = Buffer.from(token, "base64").toString();
  const [user, pass] = decoded.split(":");
  if (user !== authUser || pass !== authPass) {
    unauthorized(res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const sanitizedPath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");

  if (sanitizedPath === "/auth-check") {
    res.writeHead(204);
    res.end();
    return;
  }
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
  console.log(`Basic auth user: ${authUser}`);
  console.log(`Serving ${path.join(docsDir, defaultFile)}`);
});
