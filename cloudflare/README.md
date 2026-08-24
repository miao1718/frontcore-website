# Cloudflare setup for acceptmarkdown.com

GitHub Pages alone cannot negotiate `Accept: text/markdown`. Put Cloudflare
in front of origin and deploy the Worker.

## Why this is required

Live DNS today:

- Nameservers: GoDaddy (`domaincontrol.com`)
- A records → GitHub Pages (`185.199.x.x`)
- Response `Vary: Accept-Encoding` only (no `Accept`)

Until a Worker (or Cloudflare “Markdown for Agents”) sits on the edge,
`curl -H 'Accept: text/markdown' https://frontcore.net/` keeps returning HTML.

## Deploy (Worker proxy in front of GitHub Pages)

1. Add `frontcore.net` to Cloudflare; change nameservers at GoDaddy to Cloudflare’s.
2. DNS: keep A records pointing at GitHub Pages IPs, **proxied** (orange cloud).
3. From repo root:

```bash
npx wrangler login
npx wrangler deploy
```

Config: [`wrangler.jsonc`](../wrangler.jsonc) → `cloudflare/markdown-worker.js`  
(imports shared Accept helpers from [`lib/accept.mjs`](../lib/accept.mjs)).

4. Confirm routes `frontcore.net/*` and `www.frontcore.net/*`.
5. Optional: Rules → enable **Markdown for Agents** as a backup; the Worker prefers authored `.md` files.
6. Cache Rule: honor `Vary: Accept` so HTML and Markdown are not cache-collided.

### Verify

```bash
curl -sI -H 'Accept: text/markdown' https://frontcore.net/
# Content-Type: text/markdown; charset=utf-8
# Vary: … Accept …

curl -sI -H 'Accept: text/markdown' https://frontcore.net/some-path-that-does-not-exist
# HTTP/2 404 + text/markdown

bash scripts/verify-agentic.sh https://frontcore.net
```

## Local / CI (no Cloudflare)

```bash
npm test
npm run serve   # http://127.0.0.1:8080 with full negotiation
npm run verify:local
```
