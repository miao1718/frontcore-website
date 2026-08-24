/**
 * Cloudflare Worker: Markdown content negotiation (acceptmarkdown.com)
 *
 * Deploy in front of GitHub Pages for frontcore.net.
 * Routes with Accept: text/markdown receive the matching .md file.
 *
 * Setup:
 * 1. Workers & Pages → Create Worker → paste this script
 * 2. Add route: frontcore.net/* (and www.frontcore.net/* if used)
 * 3. Ensure .md files are deployed to origin (GitHub Pages)
 */

const MD_MAP = {
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

function resolveMdPath(pathname) {
  if (MD_MAP[pathname]) return MD_MAP[pathname];
  if (pathname.endsWith(".html")) {
    return pathname.replace(/\.html$/, ".md");
  }
  if (pathname.endsWith(".md")) return pathname;
  return null;
}

function withVary(response) {
  const headers = new Headers(response.headers);
  headers.set("Vary", "Accept, Accept-Encoding");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const accept = request.headers.get("Accept") || "";
    if (!accept.includes("text/markdown")) {
      const response = await fetch(request);
      return withVary(response);
    }

    const url = new URL(request.url);
    const mdPath = resolveMdPath(url.pathname);

    if (!mdPath) {
      const fallback = await fetch(request);
      if (fallback.status === 404) {
        const md404 = await fetch(new URL("/404.md", url.origin).toString());
        if (md404.ok) {
          const body = await md404.text();
          return new Response(body, {
            status: 404,
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "Vary": "Accept, Accept-Encoding",
              "Cache-Control": "public, max-age=300",
            },
          });
        }
      }
      return withVary(fallback);
    }

    const mdUrl = new URL(mdPath, url.origin);
    const mdResponse = await fetch(mdUrl.toString());

    if (!mdResponse.ok) {
      return withVary(await fetch(request));
    }

    const body = await mdResponse.text();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Vary": "Accept, Accept-Encoding",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
};
