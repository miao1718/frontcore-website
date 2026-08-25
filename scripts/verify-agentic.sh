#!/usr/bin/env bash
# Verify Is Agentic / acceptmarkdown readiness signals for frontcore.net
set -euo pipefail

BASE="${1:-https://frontcore.net}"
FAIL=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAIL=1; }
info() { printf 'INFO  %s\n' "$1"; }

echo "=== Agentic checks against ${BASE} ==="

# 1) Homepage text without JS (raw HTML strip) >= 500 chars + H1
HTML=$(curl -fsS "${BASE}/")
TEXT=$(printf '%s' "$HTML" | python3 -c "
import sys,re
html=sys.stdin.read()
html=re.sub(r'(?is)<script[^>]*>.*?</script>','',html)
html=re.sub(r'(?is)<style[^>]*>.*?</style>','',html)
text=re.sub(r'<[^>]+>',' ',html)
text=re.sub(r'\s+',' ',text).strip()
print(len(text))
h1_count=len(re.findall(r'<h1\\b', html, re.I))
print(h1_count)
print(text[:120])
")
CHARS=$(printf '%s' "$TEXT" | sed -n '1p')
H1_COUNT=$(printf '%s' "$TEXT" | sed -n '2p')
if [[ "$H1_COUNT" == "1" && "$CHARS" -ge 500 ]]; then
  pass "Content without JS: ${CHARS} chars + exactly one H1"
else
  fail "Content without JS: chars=${CHARS} h1_count=${H1_COUNT} (need >=500 + exactly one H1)"
fi

# 2) JSON-LD present
if printf '%s' "$HTML" | grep -q 'application/ld+json'; then
  pass "JSON-LD structured data on homepage"
else
  fail "JSON-LD structured data missing on homepage"
fi

# Organization type
if printf '%s' "$HTML" | grep -q '"@type": "Organization"'; then
  pass "Organization schema present"
else
  fail "Organization schema missing"
fi

# Metadata completeness
for needle in 'rel="canonical"' 'property="og:image"' 'property="og:type"' 'lang="zh-CN"'; do
  if printf '%s' "$HTML" | grep -q "$needle"; then
    pass "Metadata signal: ${needle}"
  else
    fail "Metadata signal missing: ${needle}"
  fi
done

# Brand signals
if printf '%s' "$HTML" | grep -qi 'Frontcore' && printf '%s' "$HTML" | grep -q '前沿方核' && printf '%s' "$HTML" | grep -q 'frontcore.net'; then
  pass "Brand name signals (Frontcore / 前沿方核 / frontcore.net)"
else
  fail "Brand name signals incomplete"
fi

# 3) Agent files
for path in /llms.txt /sitemap.xml /robots.txt /agent-instructions.md /index.md /404.md; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")
  if [[ "$code" == "200" ]]; then
    pass "Machine-readable ${path} -> ${code}"
  else
    fail "Machine-readable ${path} -> ${code}"
  fi
done

# When-to-use in llms.txt
if curl -fsS "${BASE}/llms.txt" | grep -qi 'When to use'; then
  pass "llms.txt contains when-to-use guidance"
else
  fail "llms.txt missing when-to-use guidance"
fi

# Trust pages
for path in /about/ /contact/ /privacy/; do
  body=$(curl -fsS "${BASE}${path}")
  len=$(printf '%s' "$body" | python3 -c "import sys,re; t=re.sub(r'<[^>]+>',' ',sys.stdin.read()); print(len(re.sub(r'\\s+',' ',t).strip()))")
  if [[ "$len" -ge 500 ]]; then
    pass "Trust page ${path} text chars=${len}"
  else
    fail "Trust page ${path} text chars=${len} (need >=500)"
  fi
done

# 4) Agent-friendly 404
CODE=$(curl -s -o /tmp/fc-agent-404.body -w '%{http_code}' "${BASE}/agentic-missing-path-404-check")
BODY=$(cat /tmp/fc-agent-404.body)
if [[ "$CODE" == "404" ]]; then
  pass "Nonexistent path returns HTTP 404"
else
  fail "Nonexistent path returned HTTP ${CODE} (need 404)"
fi

has_recovery() {
  printf '%s' "$1" | grep -q 'llms.txt' \
    && printf '%s' "$1" | grep -q 'sitemap.xml' \
    && printf '%s' "$1" | grep -Eq '# Frontcore 404|Site map|Agent resources'
}

if has_recovery "$BODY"; then
  pass "404 response body includes agent recovery markdown/sitemap/llms hints"
else
  # GitHub Pages serves 404.html for unknown paths; local SimpleHTTPServer does not.
  TEMPLATE=$(curl -fsS "${BASE}/404.html" 2>/dev/null || true)
  MD404=$(curl -fsS "${BASE}/404.md" 2>/dev/null || true)
  if has_recovery "$TEMPLATE" && has_recovery "$MD404"; then
    pass "404.html + 404.md recovery content present (GitHub Pages will serve 404.html for missing paths)"
    info "This origin did not embed 404.html into the ${CODE} body (expected on plain local servers)"
  else
    fail "404 body missing agent recovery markdown/sitemap/llms hints"
  fi
fi

# 5) Accept: text/markdown negotiation (requires Cloudflare Worker)
MD_HEADERS=$(curl -sI -H 'Accept: text/markdown' "${BASE}/" || true)
CT=$(printf '%s' "$MD_HEADERS" | tr -d '\r' | grep -i '^content-type:' | head -1 | awk '{print tolower($0)}' || true)
VARY=$(printf '%s' "$MD_HEADERS" | tr -d '\r' | grep -i '^vary:' | head -1 | awk '{print tolower($0)}' || true)
if printf '%s' "$CT" | grep -q 'text/markdown' && printf '%s' "$VARY" | grep -q 'accept'; then
  pass "Markdown negotiation: Content-Type text/markdown + Vary Accept"
else
  fail "Markdown negotiation not live yet (got CT='${CT}' VARY='${VARY}') — deploy cloudflare/markdown-worker.js"
  info "Direct markdown still available at ${BASE}/index.md"
fi

# Direct markdown Content-Type (GitHub may serve as text/plain or octet; Workers/_headers fix)
MD_DIRECT=$(curl -sI "${BASE}/index.md" | tr -d '\r' | grep -i '^content-type:' | head -1 || true)
info "Direct /index.md Content-Type: ${MD_DIRECT}"

echo "=== Done (exit=${FAIL}) ==="
exit "$FAIL"
