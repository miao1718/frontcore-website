#!/usr/bin/env node
/**
 * Verify public agent-readiness endpoints against a base URL.
 * Usage: node scripts/verify.mjs https://frontcore.net
 */

const base = (process.argv[2] || "https://frontcore.net").replace(/\/$/, "");

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(name, fn) {
  try {
    await fn();
  } catch (err) {
    record(name, false, err.message || String(err));
  }
}

await check("homepage HTML 200 + H1 + text length", async () => {
  const res = await fetch(base + "/");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const html = await res.text();
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  if (h1Count !== 1) throw new Error(`expected exactly one H1, found ${h1Count}`);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 500) throw new Error(`only ${text.length} chars`);
  if (!/application\/ld\+json/.test(html)) throw new Error("missing JSON-LD");
  record("homepage HTML 200 + H1 + text length", true, `${text.length} chars`);
});

await check("JSON-LD Organization present", async () => {
  const html = await (await fetch(base + "/")).text();
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no JSON-LD");
  const data = JSON.parse(m[1]);
  const nodes = data["@graph"] || [data];
  const org = nodes.find((n) => n["@type"] === "Organization");
  if (!org) throw new Error("no Organization");
  if (!org.address || !org.contactPoint) throw new Error("incomplete Organization");
  record("JSON-LD Organization present", true, org.name);
});

await check("404 status for unknown path", async () => {
  const res = await fetch(base + "/some-path-that-does-not-exist-xyz");
  if (res.status !== 404) throw new Error(`status ${res.status}`);
  const body = await res.text();
  if (!/llms\.txt|sitemap/i.test(body)) {
    throw new Error("404 body missing recovery links");
  }
  record("404 status for unknown path", true, "404 with recovery links");
});

await check("Accept: text/markdown on /", async () => {
  const res = await fetch(base + "/", {
    headers: { Accept: "text/markdown" },
  });
  const ct = res.headers.get("content-type") || "";
  const vary = res.headers.get("vary") || "";
  if (!/text\/markdown/i.test(ct)) {
    throw new Error(`content-type=${ct}; vary=${vary} (deploy Cloudflare Worker)`);
  }
  if (!/accept/i.test(vary)) throw new Error(`Vary missing Accept: ${vary}`);
  record("Accept: text/markdown on /", true, ct);
});

await check("Accept: text/markdown on 404", async () => {
  const res = await fetch(base + "/some-path-that-does-not-exist-xyz", {
    headers: { Accept: "text/markdown" },
  });
  const ct = res.headers.get("content-type") || "";
  if (res.status !== 404) throw new Error(`status ${res.status}`);
  if (!/text\/markdown/i.test(ct)) {
    throw new Error(`content-type=${ct} (needs Worker for full 404 credit)`);
  }
  record("Accept: text/markdown on 404", true, ct);
});

await check("llms.txt", async () => {
  const res = await fetch(base + "/llms.txt");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const body = await res.text();
  if (!/When to use/i.test(body)) throw new Error("missing When to use");
  record("llms.txt", true);
});

await check("sitemap.xml", async () => {
  const res = await fetch(base + "/sitemap.xml");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const body = await res.text();
  if (!/<urlset/i.test(body)) throw new Error("invalid sitemap");
  record("sitemap.xml", true);
});

await check("index.md sibling", async () => {
  const res = await fetch(base + "/index.md");
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!/markdown|plain/i.test(ct)) throw new Error(`content-type=${ct}`);
  record("index.md sibling", true, ct);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${base}`);
process.exit(failed ? 1 : 0);
