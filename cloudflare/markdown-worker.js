/**
 * Cloudflare Worker: Accept: text/markdown negotiation for frontcore.net
 * Protocol: https://acceptmarkdown.com/
 *
 * Deploy:
 *   1. Point frontcore.net DNS through Cloudflare (proxied)
 *   2. npx wrangler login && npx wrangler deploy
 */

import {
  preferredType,
  appendVaryAccept,
  markdownPath,
  STATIC_EXT,
  PRODUCES,
} from "../lib/accept.mjs";

function markdownResponse(body, status = 200) {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": status === 404 ? "public, max-age=300" : "public, max-age=3600",
  });
  appendVaryAccept(headers);
  return new Response(body, { status, headers });
}

function notAcceptable() {
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  appendVaryAccept(headers);
  return new Response(
    "Not Acceptable\n\nAvailable: text/html, text/markdown\n",
    { status: 406, headers }
  );
}

async function fetch404Markdown(origin, request) {
  const md404 = await fetch(
    new Request(new URL("/404.md", origin).toString(), request)
  );
  if (md404.ok) return md404.text();
  return null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const accept = request.headers.get("Accept");

    if (url.pathname.endsWith(".md")) {
      const res = await fetch(request);
      const headers = new Headers(res.headers);
      headers.set("Content-Type", "text/markdown; charset=utf-8");
      appendVaryAccept(headers);
      return new Response(res.body, { status: res.status, headers });
    }

    if (STATIC_EXT.test(url.pathname)) {
      return fetch(request);
    }

    const chosen = preferredType(accept, PRODUCES);

    if (chosen === null && accept) {
      return notAcceptable();
    }

    if (chosen === "text/markdown") {
      const mdSibling = markdownPath(url.pathname);

      if (mdSibling) {
        const mdRes = await fetch(
          new Request(new URL(mdSibling, url.origin).toString(), request)
        );
        if (mdRes.ok) {
          return markdownResponse(await mdRes.text(), 200);
        }
        // Known page but missing .md — fall through to HTML only if Accept allows it
        if (!preferredType(accept, ["text/html"])) {
          return notAcceptable();
        }
      } else {
        // Unknown path: real 404 with markdown recovery body
        const originRes = await fetch(request);
        if (originRes.status === 404) {
          const body = await fetch404Markdown(url.origin, request);
          if (body) return markdownResponse(body, 404);
        }
        if (!preferredType(accept, ["text/html"])) {
          const body = await fetch404Markdown(url.origin, request);
          if (body) return markdownResponse(body, 404);
          return notAcceptable();
        }
        // HTML still acceptable — continue with origin response below
        const headers = new Headers(originRes.headers);
        appendVaryAccept(headers);
        return new Response(originRes.body, {
          status: originRes.status,
          statusText: originRes.statusText,
          headers,
        });
      }
    }

    const htmlRes = await fetch(request);
    const headers = new Headers(htmlRes.headers);
    appendVaryAccept(headers);

    const mdSibling = markdownPath(url.pathname);
    if (
      htmlRes.status === 200 &&
      mdSibling &&
      headers.get("content-type")?.includes("text/html")
    ) {
      const linkValue = `<${mdSibling}>; rel="alternate"; type="text/markdown"`;
      const existing = headers.get("Link");
      headers.set("Link", existing ? `${existing}, ${linkValue}` : linkValue);
    }

    return new Response(htmlRes.body, {
      status: htmlRes.status,
      statusText: htmlRes.statusText,
      headers,
    });
  },
};
