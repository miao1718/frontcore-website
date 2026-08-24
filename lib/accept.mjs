/**
 * Accept header parsing for text/markdown content negotiation
 * (acceptmarkdown.com / RFC 9110 §12.5.1)
 */

/**
 * @typedef {{ type: string, q: number, specificity: number, position: number }} AcceptEntry
 */

/**
 * @param {string} header
 * @returns {AcceptEntry[]}
 */
export function parseAccept(header) {
  if (!header || !header.trim()) return [];

  const entries = [];
  const parts = header.split(",");

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i].trim();
    if (!raw) continue;

    const segments = raw.split(";").map((s) => s.trim());
    const type = (segments[0] || "").toLowerCase();
    if (!type) continue;

    let q = 1;
    for (const param of segments.slice(1)) {
      const eq = param.indexOf("=");
      if (eq === -1) continue;
      const name = param.slice(0, eq).trim().toLowerCase();
      const value = param.slice(eq + 1).trim();
      if (name === "q") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed));
      }
    }

    const specificity = type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2;
    entries.push({ type, q, specificity, position: i });
  }

  return entries;
}

/**
 * @param {AcceptEntry} entry
 * @param {string} candidate
 */
function matches(entry, candidate) {
  if (entry.type === "*/*") return true;
  if (entry.type.endsWith("/*")) {
    return candidate.startsWith(entry.type.slice(0, -1));
  }
  return entry.type === candidate;
}

/**
 * Pick the preferred media type among `produces` given an Accept header.
 * Returns null when every produced type is explicitly rejected (q=0) or unmatched.
 *
 * @param {string | null} header
 * @param {string[]} produces
 * @returns {string | null}
 */
export function preferredType(header, produces) {
  if (!header || !header.trim()) return produces[0] ?? null;

  const entries = parseAccept(header);
  if (entries.length === 0) return produces[0] ?? null;

  let bestType = null;
  let bestQ = -1;
  let bestPosition = Infinity;

  for (const candidate of produces) {
    let matched = null;
    let matchedPosition = Infinity;

    for (const e of entries) {
      if (!matches(e, candidate)) continue;
      if (
        matched === null ||
        e.specificity > matched.specificity ||
        (e.specificity === matched.specificity && e.position < matchedPosition)
      ) {
        matched = e;
        matchedPosition = e.position;
      }
    }

    if (matched === null) continue;
    if (matched.q <= 0) continue;

    if (
      matched.q > bestQ ||
      (matched.q === bestQ && matchedPosition < bestPosition)
    ) {
      bestQ = matched.q;
      bestPosition = matchedPosition;
      bestType = candidate;
    }
  }

  return bestType;
}

/**
 * Map a request pathname to its authored .md sibling on this site.
 * Layout: / → /index.md, /about/ → /about.md (flat siblings at repo root).
 *
 * @param {string} pathname
 * @returns {string | null}
 */
export function markdownPath(pathname) {
  const map = {
    "/": "/index.md",
    "/index.html": "/index.md",
    "/about": "/about.md",
    "/about/": "/about.md",
    "/about/index.html": "/about.md",
    "/contact": "/contact.md",
    "/contact/": "/contact.md",
    "/contact/index.html": "/contact.md",
    "/privacy": "/privacy.md",
    "/privacy/": "/privacy.md",
    "/privacy/index.html": "/privacy.md",
  };

  if (map[pathname]) return map[pathname];
  if (pathname.endsWith(".md")) return pathname;
  if (pathname.endsWith(".html")) {
    return pathname.replace(/\.html$/, ".md");
  }
  return null;
}

/**
 * Ensure Vary includes Accept (and keep Accept-Encoding if present).
 * @param {Headers | { get: Function, set: Function }} headers
 */
export function appendVaryAccept(headers) {
  const existing = headers.get("vary") || headers.get("Vary") || "";
  if (!existing) {
    headers.set("Vary", "Accept, Accept-Encoding");
    return;
  }

  const tokens = existing.split(",").map((s) => s.trim().toLowerCase());
  const needed = [];
  if (!tokens.includes("accept")) needed.push("Accept");
  if (!tokens.includes("accept-encoding")) needed.push("Accept-Encoding");

  if (needed.length === 0) {
    headers.set("Vary", existing);
    return;
  }

  headers.set("Vary", `${existing}, ${needed.join(", ")}`);
}

/** Paths that should never be content-negotiated. */
export const STATIC_EXT =
  /\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|eot|xml|txt|json|pdf|mp4|webm|mp3|wav|ogg|zip)$/i;

export const PRODUCES = ["text/html", "text/markdown"];

export const NOT_FOUND_MARKDOWN = `
# Frontcore 404 Recovery

The requested URL was not found on **frontcore.net** (Frontcore / 前沿方核).

HTTP status for this resource is **404**. Prefer canonical pages below instead of guessing paths.

## Site map

- [Homepage](https://frontcore.net/)
- [About](https://frontcore.net/about/)
- [Contact](https://frontcore.net/contact/)
- [Privacy](https://frontcore.net/privacy/)

## Agent resources

- [llms.txt](https://frontcore.net/llms.txt) — when-to-use guidance for AI agents
- [sitemap.xml](https://frontcore.net/sitemap.xml) — indexable URLs
- [agent-instructions.md](https://frontcore.net/agent-instructions.md) — extended agent instructions
- [index.md](https://frontcore.net/index.md) — homepage markdown

## Contact

- Email: info@frontcore.net
- Address: 广东深圳市福田区长富金茂大厦
- Company: 深圳市前沿方核科技有限公司
- Brand: Frontcore / 前沿方核
`;