import { XMLParser, XMLValidator } from "fast-xml-parser";

// Public metadata only. No database, account credentials, arbitrary URLs or paid API.
export const QUERIES = [
  "gold bullion when:7d", "silver bullion when:7d",
  "(platinum OR palladium) bullion when:7d", "copper price when:7d",
];
const MAX_AGE = 7 * 86400000;
const FRESH_FOR = 10 * 60000;
const STALE_FOR = 24 * 3600000;
const RETRY_AFTER = 60000;
const MAX_BYTES = 1024 * 1024;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
type Item = { title: string; link: string; source: string; pubDate: string };
type Feed = { status: string; items: Item[]; fetched_at: string; stale: boolean; partial: boolean };
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, processEntities: true });
function text(value: unknown): string {
  const s = typeof value === "string" ? value :
    value && typeof value === "object" && "#text" in value ? String(value["#text"]) : "";
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
export function parseFeed(xml: string, now: number): Item[] {
  // RSS doesn't need custom entities. Reject DTDs rather than expanding untrusted entities.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw Error("Invalid RSS");
  const raw = parser.parse(xml)?.rss?.channel?.item;
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((x) => {
    const title = text(x.title).slice(0, 500);
    const source = text(x.source).slice(0, 150);
    const link = text(x.link);
    const published = Date.parse(text(x.pubDate));
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || url.username || url.password ||
          !title || !Number.isFinite(published) || published < now - MAX_AGE || published > now + 300000) return [];
      return [{ title, source, link: url.href, pubDate: new Date(published).toISOString() }];
    } catch { return []; }
  });
}
export function combineFeeds(groups: Item[][]): Item[] {
  const seen = new Set<string>();
  return groups.flat().sort((a, b) => b.pubDate.localeCompare(a.pubDate)).filter((item) => {
    const key = item.title.replace(/ - [^-]+$/, "").toLowerCase();
    if (seen.has(key) || seen.has(item.link)) return false;
    seen.add(key); seen.add(item.link); return true;
  }).slice(0, 24);
}
async function readBounded(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel(); throw Error("Feed too large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty feed");
  const decoder = new TextDecoder(); let bytes = 0, xml = "";
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw Error("Feed too large"); }
      xml += decoder.decode(value, { stream: true });
    }
    return xml + decoder.decode();
  } finally { reader.releaseLock(); }
}
export function createNewsHandler(fetcher: typeof fetch = fetch, clock = Date.now) {
  // Best-effort isolate cache; the app also retains the last successful feed on device.
  let cached: Feed | null = null;
  let inFlight: Promise<Feed> | null = null;
  let failedAt: number | null = null;
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: {
      ...cors, "Content-Type": "application/json", "Cache-Control": "no-store",
      ...(status === 503 ? { "Retry-After": "60" } : {}),
    } });
  }
  async function refresh(): Promise<Feed> {
    const now = clock();
    const results = await Promise.allSettled(QUERIES.map(async (q) => {
      const url = new URL("https://news.google.com/rss/search");
      url.search = new URLSearchParams({ q, hl: "en-US", gl: "US", ceid: "US:en" }).toString();
      const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
      if (!response.ok) { await response.body?.cancel(); throw Error("Upstream unavailable"); }
      const items = parseFeed(await readBounded(response), now);
      if (!items.length) throw Error("No recent articles");
      return items;
    }));
    const items = combineFeeds(results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []));
    if (!items.length) { failedAt = clock(); throw Error("News unavailable"); }
    failedAt = null;
    return cached = { status: "ok", items, fetched_at: new Date(now).toISOString(), stale: false,
      partial: results.some((r) => r.status === "rejected") };
  }
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET") return json({ status: "error", message: "Method not allowed" }, 405);
    const now = clock();
    if (cached && now - Date.parse(cached.fetched_at) < FRESH_FOR) return json(cached);
    try {
      if (failedAt !== null && now - failedAt < RETRY_AFTER) throw Error("Retry later");
      if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
      return json(await inFlight);
    } catch {
      if (cached && now - Date.parse(cached.fetched_at) <= STALE_FOR) return json({ ...cached, stale: true });
      return json({ status: "error", message: "Live news temporarily unavailable", items: [] }, 503);
    }
  };
}
if (import.meta.main) Deno.serve(createNewsHandler());
