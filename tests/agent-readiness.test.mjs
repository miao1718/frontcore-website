#!/usr/bin/env node
/**
 * Agent-readiness tests for Frontcore.
 * Spawns scripts/serve.mjs and asserts Accept negotiation, 404 markdown,
 * homepage SSR content, and JSON-LD.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  preferredType,
  parseAccept,
  markdownPath,
  appendVaryAccept,
} from "../lib/accept.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitForServer(base, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(base);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Server did not start: ${base}`);
}

function startServer(port) {
  const child = spawn(process.execPath, ["scripts/serve.mjs", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function withServer(fn) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = startServer(port);
  try {
    await waitForServer(base);
    await fn(base);
  } finally {
    child.kill("SIGTERM");
  }
}

function textContent(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Unit: Accept parsing ---

test("parseAccept respects q-values and order", () => {
  const entries = parseAccept("text/markdown, text/html;q=0.8");
  assert.equal(entries[0].type, "text/markdown");
  assert.equal(entries[0].q, 1);
  assert.equal(entries[1].type, "text/html");
  assert.equal(entries[1].q, 0.8);
});

test("preferredType picks markdown when preferred", () => {
  assert.equal(
    preferredType("text/markdown, text/html;q=0.8", [
      "text/html",
      "text/markdown",
    ]),
    "text/markdown"
  );
});

test("preferredType picks html for browser Accept", () => {
  assert.equal(
    preferredType(
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ["text/html", "text/markdown"]
    ),
    "text/html"
  );
});

test("preferredType returns null when both rejected", () => {
  assert.equal(
    preferredType("text/html;q=0, text/markdown;q=0", [
      "text/html",
      "text/markdown",
    ]),
    null
  );
});

test("preferredType specificity beats wildcard", () => {
  assert.equal(
    preferredType("text/html;q=0, */*", ["text/html", "text/markdown"]),
    "text/markdown"
  );
});

test("markdownPath maps site routes", () => {
  assert.equal(markdownPath("/"), "/index.md");
  assert.equal(markdownPath("/about/"), "/about.md");
  assert.equal(markdownPath("/contact/"), "/contact.md");
  assert.equal(markdownPath("/privacy/"), "/privacy.md");
  assert.equal(markdownPath("/nope"), null);
});

test("appendVaryAccept adds Accept", () => {
  const headers = new Headers({ Vary: "Accept-Encoding" });
  appendVaryAccept(headers);
  const vary = headers.get("Vary").toLowerCase();
  assert.match(vary, /accept/);
  assert.match(vary, /accept-encoding/);
});

// --- Integration against local negotiation server ---

test("homepage HTML has H1, nested headings, and 500+ chars without JS", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(res.headers.get("vary") || "", /Accept/i);

    const html = await res.text();
    assert.match(html, /<h1[\s\S]*?>[\s\S]*?<\/h1>/i);
    assert.match(html, /<h2[\s\S]*?>/i);
    assert.match(html, /<h3[\s\S]*?>/i);
    assert.match(html, /application\/ld\+json/);

    const text = textContent(html);
    assert.ok(
      text.length >= 500,
      `expected >=500 chars of text, got ${text.length}`
    );
    assert.match(text, /Frontcore/i);
  });
});

test("homepage JSON-LD includes Organization and OfferCatalog", async () => {
  await withServer(async (base) => {
    const html = await (await fetch(base + "/")).text();
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    assert.ok(match, "missing JSON-LD script");
    const data = JSON.parse(match[1]);
    const nodes = data["@graph"] || [data];
    const types = nodes.flatMap((n) =>
      Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]
    );
    assert.ok(types.includes("Organization"));
    assert.ok(types.includes("OfferCatalog"));
    assert.ok(types.includes("WebSite"));

    const org = nodes.find((n) => n["@type"] === "Organization");
    assert.ok(org.address);
    assert.ok(org.contactPoint);
    assert.ok(org.email || org.contactPoint.email);
    assert.ok(Array.isArray(org.knowsAbout) && org.knowsAbout.length >= 8);
    assert.match(String(org.name) + JSON.stringify(org.alternateName), /Frontcore/i);
  });
});

test("Accept: text/markdown on / returns markdown with Vary", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/", {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/markdown/);
    assert.match(res.headers.get("vary") || "", /Accept/i);
    const body = await res.text();
    assert.match(body, /Frontcore|# /);
    assert.ok(body.length > 200);
  });
});

test("Accept: text/markdown on /about/ returns about.md", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/about/", {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/markdown/);
    const body = await res.text();
    assert.match(body, /关于|About|Frontcore/i);
  });
});

test("unsupported Accept returns 406", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/", {
      headers: { Accept: "application/pdf" },
    });
    assert.equal(res.status, 406);
    assert.match(res.headers.get("vary") || "", /Accept/i);
  });
});

test("unknown path returns HTTP 404", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/some-path-that-does-not-exist");
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.match(body, /llms\.txt|sitemap\.xml|Frontcore/i);
  });
});

test("unknown path with Accept: text/markdown returns markdown 404", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/some-path-that-does-not-exist", {
      headers: { Accept: "text/markdown" },
    });
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /text\/markdown/);
    assert.match(res.headers.get("vary") || "", /Accept/i);
    const body = await res.text();
    assert.match(body, /Frontcore 404 Recovery|# 404/);
    assert.match(body, /llms\.txt/);
    assert.match(body, /sitemap\.xml/);
  });
});

test("trust pages have 500+ chars", async () => {
  await withServer(async (base) => {
    for (const p of ["/about/", "/contact/", "/privacy/"]) {
      const html = await (await fetch(base + p)).text();
      const text = textContent(html);
      assert.ok(
        text.length >= 500,
        `${p} expected >=500 chars, got ${text.length}`
      );
    }
  });
});

test("llms.txt and sitemap.xml are reachable", async () => {
  await withServer(async (base) => {
    const llms = await fetch(base + "/llms.txt");
    assert.equal(llms.status, 200);
    const llmsBody = await llms.text();
    assert.match(llmsBody, /When to use/i);

    const sm = await fetch(base + "/sitemap.xml");
    assert.equal(sm.status, 200);
    const smBody = await sm.text();
    assert.match(smBody, /https:\/\/frontcore\.net\//);
    assert.match(smBody, /about/);
  });
});
