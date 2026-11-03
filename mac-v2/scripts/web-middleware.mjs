// Two tiny local endpoints behind the agent's web tools:
//
//   GET /__web/search?q=…&n=5   → { query, results: [{ title, url, snippet }] }
//   GET /__web/read?url=…       → { url, contentType, title, html }
//
// Why an endpoint at all: a browser cannot call a search engine directly — they
// send no CORS headers — so the page asks the dev server, which fetches on its
// behalf. No API key is involved anywhere: results are read out of DuckDuckGo's
// no-JavaScript pages, the same ones a text browser uses, and if one of them
// changes its markup the tools fail loudly instead of guessing.
//
// /__web/read refuses anything that isn't a public http(s) URL, so a page on your
// router, your laptop or the app's own dev server can't be pulled in.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 12000;
const MAX_RESULTS = 8;
const MAX_PAGE_CHARS = 1_000_000; // ~1 MB of HTML is plenty for one page

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};

const decodeEntities = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, e) => {
    if (e[0] === "#") {
      const code = (e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) >>> 0;
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? "";
  });

const stripTags = (html) =>
  decodeEntities(String(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

// DuckDuckGo wraps result links in /l/?uddg=<urlencoded target>&rut=…
const realUrl = (href) => {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    return u.searchParams.get("uddg") || u.toString();
  } catch {
    return href;
  }
};

// Shared scraper: every <a> whose class list contains `anchorCls` is a result, and
// the first element with `snippetCls` after it is its snippet.
const scrape = (html, { anchorCls, snippetCls, limit }) => {
  const out = [];
  const anchor = new RegExp(`<a\\b([^>]*class="[^"]*${anchorCls}[^"]*"[^>]*)>([\\s\\S]*?)</a>`, "gi");
  const snippet = new RegExp(`class="[^"]*${snippetCls}[^"]*"[^>]*>([\\s\\S]*?)</(?:a|td|div)>`, "i");
  let m;
  while ((m = anchor.exec(html))) {
    const href = decodeEntities(/\bhref="([^"]+)"/i.exec(m[1] || "")?.[1] || "");
    const title = stripTags(m[2]);
    if (!href || !title) continue;
    const sn = snippet.exec(html.slice(anchor.lastIndex, anchor.lastIndex + 2500));
    const url = realUrl(href);
    if (!/^https?:/i.test(url)) continue;
    out.push({ title: title.slice(0, 180), url, ...(sn ? { snippet: stripTags(sn[1]).slice(0, 320) } : {}) });
    if (out.length >= limit) break;
  }
  return out;
};

const get = (url) =>
  fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

// Bing wraps every result in /ck/a?…&u=a1<base64 target>.
const bingUrl = (href) => {
  try {
    const u = new URL(href, "https://www.bing.com");
    const target = u.searchParams.get("u");
    if (!target?.startsWith("a1")) return u.toString();
    const b64 = target.slice(2).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(target.length / 4) * 4, "=");
    const out = Buffer.from(b64, "base64").toString("utf8");
    return /^https?:/i.test(out) ? out : u.toString();
  } catch {
    return href;
  }
};

const parseBing = (html, limit) => {
  const out = [];
  for (const block of html.split(/<li\b[^>]*class="[^"]*\bb_algo\b/gi).slice(1)) {
    const a = /<h2[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(block);
    if (!a) continue;
    const href = decodeEntities(/\bhref="([^"]+)"/i.exec(a[1])?.[1] || "");
    const url = bingUrl(href);
    const title = stripTags(a[2]);
    const sn = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block);
    if (!title || !/^https?:/i.test(url)) continue;
    out.push({ title: title.slice(0, 180), url, ...(sn ? { snippet: stripTags(sn[1]).slice(0, 320) } : {}) });
    if (out.length >= limit) break;
  }
  return out;
};

// Tried in order: DuckDuckGo's full page, its lite page, then Bing. Free engines
// rate-limit shared connections, so when one is showing a bot-check page we note
// it and move on rather than pretending the search came back empty.
const SOURCES = [
  {
    name: "DuckDuckGo",
    fetch: (enc) => get(`https://html.duckduckgo.com/html/?q=${enc}`),
    parse: (html, limit) => scrape(html, { anchorCls: "result__a", snippetCls: "result__snippet", limit }),
  },
  {
    name: "DuckDuckGo lite",
    fetch: (enc) => get(`https://lite.duckduckgo.com/lite/?q=${enc}`),
    parse: (html, limit) => scrape(html, { anchorCls: "result-link", snippetCls: "result-snippet", limit }),
  },
  { name: "Bing", fetch: (enc) => get(`https://www.bing.com/search?q=${enc}&count=10`), parse: parseBing },
];

async function search(q, n) {
  const query = String(q || "").trim();
  if (!query) throw new Error("A search query is required.");
  const limit = Math.min(Math.max(Number(n) || 5, 1), MAX_RESULTS);
  const enc = encodeURIComponent(query);
  const notes = [];

  for (const source of SOURCES) {
    try {
      const res = await source.fetch(enc);
      if (!res.ok) {
        notes.push(`${source.name}: ${res.status === 202 ? "bot check" : `HTTP ${res.status}`}`);
        continue;
      }
      const html = await res.text();
      const results = source.parse(html, limit);
      if (results.length) return { query, results: results.slice(0, limit) };
      notes.push(`${source.name}: ${/challenge-form|anomaly\.js|captcha/i.test(html) ? "bot check" : "nothing parseable"}`);
    } catch (e) {
      notes.push(`${source.name}: ${e.message}`);
    }
  }

  throw new Error(
    `No search engine let this through (${notes.join("; ")}). Free engines throttle shared connections — wait a minute and try again, or answer from what you know.`,
  );
}

const TEXTY = /text\/(html|plain|markdown|xml|css)|application\/(xhtml\+xml|xml|json|ld\+json|rss\+xml|atom\+xml)/i;

async function read(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("That doesn't look like a URL.");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) pages can be read.");
  const host = url.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.startsWith("[") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    throw new Error("Only public web pages can be read — local addresses are off-limits.");
  }

  const res = await get(url.toString());
  if (!res.ok) throw new Error(`The page returned HTTP ${res.status}.`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType && !TEXTY.test(contentType)) {
    throw new Error(`That isn't a text page (${contentType.split(";")[0]}).`);
  }
  const html = (await res.text()).slice(0, MAX_PAGE_CHARS);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return { url: res.url || url.toString(), contentType, title: title ? stripTags(title[1]).slice(0, 200) : "", html };
}

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

export async function webMiddleware(req, res, next) {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return next();
  }
  if (url.pathname !== "/__web/search" && url.pathname !== "/__web/read") return next();
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });

  try {
    const result =
      url.pathname === "/__web/search"
        ? await search(url.searchParams.get("q"), url.searchParams.get("n"))
        : await read(url.searchParams.get("url"));
    json(res, 200, result);
  } catch (e) {
    json(res, 502, { error: e?.message || "Web request failed." });
  }
}
