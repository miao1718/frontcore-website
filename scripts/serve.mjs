#!/usr/bin/env node
/**
 * Local static server with acceptmarkdown.com content negotiation.
 * Mirrors cloudflare/markdown-worker.js behavior for tests and local verify.
 *
 * Usage: node scripts/serve.mjs [port]
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  preferredType,
  markdownPath,
  appendVaryAccept,
  STATIC_EXT,
  PRODUCES,
  NOT_FOUND_MARKDOWN,
} from "../lib/accept.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, normalized);
  if (!full.startsWith(root)) return null;
  return full;
}

async function fileExists(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function resolveHtmlFile(pathname) {
  if (pathname === "/" || pathname === "") {
    return path.join(ROOT, "index.html");
  }

  const direct = safeJoin(ROOT, pathname);
  if (!direct) return null;

  if (await fileExists(direct)) return direct;

  if (pathname.endsWith("/")) {
    const indexFile = path.join(direct, "index.html");
    if (await fileExists(indexFile)) return indexFile;
  } else {
    const asDir = path.join(direct, "index.html");
    if (await fileExists(asDir)) return asDir;
    const asHtml = `${direct}.html`;
    if (await fileExists(asHtml)) return asHtml;
  }

  return null;
}

function setCommonHeaders(res, extra = {}) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  appendVaryAccept(headers);
  for (const [k, v] of headers.entries()) {
    res.setHeader(k, v);
  }
}

async function read404Markdown() {
  const file = path.join(ROOT, "404.md");
  if (await fileExists(file)) {
    return fs.readFile(file, "utf8");
  }
  return NOT_FOUND_MARKDOWN;
}

async function sendFile(res, filePath, status = 200, typeOverride) {
  const ext = path.extname(filePath).toLowerCase();
  const type = typeOverride || MIME[ext] || "application/octet-stream";
  const body = await fs.readFile(filePath);
  setCommonHeaders(res, {
    "Content-Type": type,
    "Cache-Control": "no-cache",
  });
  res.statusCode = status;
  res.end(body);
}

async function sendMarkdown(res, body, status = 200) {
  setCommonHeaders(res, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": status === 404 ? "public, max-age=300" : "no-cache",
  });
  res.statusCode = status;
  res.end(body);
}

async function sendText(res, body, status, type) {
  setCommonHeaders(res, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.statusCode = status;
  res.end(body);
}

async function handle(req, res) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);
  const pathname = url.pathname;
  const accept = req.headers.accept || null;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  // Direct .md / static files
  if (STATIC_EXT.test(pathname) || pathname.endsWith(".md")) {
    const file = safeJoin(ROOT, pathname);
    if (file && (await fileExists(file))) {
      if (req.method === "HEAD") {
        setCommonHeaders(res, {
          "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        });
        res.statusCode = 200;
        res.end();
        return;
      }
      await sendFile(res, file);
      return;
    }
    // Fall through to 404 negotiation
  }

  const chosen = preferredType(accept, PRODUCES);

  if (chosen === null && accept) {
    await sendText(
      res,
      "Not Acceptable\n\nAvailable: text/html, text/markdown\n",
      406,
      "text/plain; charset=utf-8"
    );
    return;
  }

  const htmlFile = await resolveHtmlFile(pathname);
  const mdRel = markdownPath(pathname);
  const mdFile = mdRel ? safeJoin(ROOT, mdRel) : null;
  const mdOk = mdFile ? await fileExists(mdFile) : false;

  if (chosen === "text/markdown") {
    if (mdOk) {
      if (req.method === "HEAD") {
        setCommonHeaders(res, {
          "Content-Type": "text/markdown; charset=utf-8",
          Link: `<${mdRel}>; rel="alternate"; type="text/markdown"`,
        });
        res.statusCode = 200;
        res.end();
        return;
      }
      const body = await fs.readFile(mdFile, "utf8");
      setCommonHeaders(res, {
        "Content-Type": "text/markdown; charset=utf-8",
        Link: `<${mdRel}>; rel="alternate"; type="text/markdown"`,
      });
      res.statusCode = 200;
      res.end(body);
      return;
    }

    if (!htmlFile) {
      await sendMarkdown(res, await read404Markdown(), 404);
      return;
    }

    if (!preferredType(accept, ["text/html"])) {
      await sendText(
        res,
        "Not Acceptable\n\nMarkdown sibling missing and HTML is not acceptable.\n",
        406,
        "text/plain; charset=utf-8"
      );
      return;
    }
  }

  if (!htmlFile) {
    if (chosen === "text/markdown") {
      await sendMarkdown(res, await read404Markdown(), 404);
      return;
    }
    const notFoundHtml = path.join(ROOT, "404.html");
    if (await fileExists(notFoundHtml)) {
      await sendFile(res, notFoundHtml, 404);
      return;
    }
    await sendText(res, "Not Found\n", 404, "text/plain; charset=utf-8");
    return;
  }

  const extra = {};
  if (mdOk && mdRel) {
    extra.Link = `<${mdRel}>; rel="alternate"; type="text/markdown"`;
  }

  if (req.method === "HEAD") {
    setCommonHeaders(res, {
      "Content-Type": "text/html; charset=utf-8",
      ...extra,
    });
    res.statusCode = 200;
    res.end();
    return;
  }

  const body = await fs.readFile(htmlFile);
  setCommonHeaders(res, {
    "Content-Type": "text/html; charset=utf-8",
    ...extra,
  });
  res.statusCode = 200;
  res.end(body);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Frontcore negotiation server http://127.0.0.1:${PORT}`);
});
