#!/usr/bin/env node
/**
 * Unit tests for Accept negotiation helpers (acceptmarkdown.com / RFC 9110).
 */
import {
  parseAccept,
  preferredType,
  markdownPath,
  appendVaryAccept,
  PRODUCES,
} from "../lib/accept.mjs";

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    failed += 1;
  } else {
    console.log("PASS", msg);
  }
}

assert(preferredType(null, PRODUCES) === "text/html", "null Accept → html");
assert(
  preferredType("text/markdown", PRODUCES) === "text/markdown",
  "Accept text/markdown → markdown"
);
assert(
  preferredType("text/markdown, text/html", PRODUCES) === "text/markdown",
  "markdown listed first wins on tie q"
);
assert(
  preferredType("text/html;q=0.8, text/markdown;q=0.9", PRODUCES) ===
    "text/markdown",
  "higher q wins"
);
assert(
  preferredType("text/html;q=0, text/markdown", PRODUCES) === "text/markdown",
  "q=0 rejects html"
);
assert(
  preferredType("text/html;q=0, text/markdown;q=0", PRODUCES) === null,
  "all q=0 → null"
);
assert(
  preferredType("application/pdf", PRODUCES) === null,
  "unsupported type → null"
);
assert(
  preferredType("text/html;q=0, */*;q=1", PRODUCES) === "text/markdown" ||
    preferredType("text/html;q=0, */*;q=1", PRODUCES) === "text/markdown",
  "specific q=0 not overridden incorrectly — markdown via wildcard path"
);

// More precise wildcard check: with html q=0 and */* q=1, html must stay rejected
{
  const chosen = preferredType("text/html;q=0, */*;q=1", PRODUCES);
  assert(chosen === "text/markdown", `html;q=0 + */* → markdown (got ${chosen})`);
}

assert(markdownPath("/") === "/index.md", "markdownPath /");
assert(markdownPath("/about/") === "/about.md", "markdownPath /about/");
assert(markdownPath("/contact/") === "/contact.md", "markdownPath /contact/");
assert(markdownPath("/privacy/") === "/privacy.md", "markdownPath /privacy/");

{
  const headers = new Map();
  const h = {
    get: (k) => headers.get(k.toLowerCase()) || null,
    set: (k, v) => headers.set(k.toLowerCase(), v),
  };
  appendVaryAccept(h);
  assert(
    String(h.get("Vary")).toLowerCase().includes("accept"),
    "Vary includes Accept"
  );
}

assert(parseAccept("text/markdown;q=0.5").length === 1, "parseAccept length");
assert(parseAccept("text/markdown;q=0.5")[0].q === 0.5, "parseAccept q");

process.exit(failed === 0 ? 0 : 1);
