const assert = {
  equal(actual: unknown, expected: unknown) { if (actual !== expected) throw Error(`Expected ${expected}, got ${actual}`); },
  deepEqual(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error("Values differ"); },
  throws(fn: () => unknown) { let threw = false; try { fn(); } catch { threw = true; } if (!threw) throw Error("Expected error"); },
};
import { combineFeeds, createNewsHandler, parseFeed, FEED_URLS } from "./index.ts";
const start = Date.parse("2026-10-16T00:00:00Z");
const article = (title = "Gold rises - Example", link = "https://example.com/gold", date = start - 3600000) =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><source>Example &amp; Co</source><pubDate>${new Date(date).toUTCString()}</pubDate></item>`;
const rss = (items = article()) => `<rss><channel>${items}</channel></rss>`;
const get = () => new Request("https://example.test/benza-market-news");

Deno.test("RSS entities, CDATA, safe URLs and valid recent dates", () => {
  const items = parseFeed(rss(), start);
  assert.equal(items[0].source, "Example & Co");
  assert.equal(items[0].title, "Gold rises - Example");
  assert.equal(parseFeed(rss(article("bad", "javascript:alert(1)")), start).length, 0);
  assert.equal(parseFeed(rss(article("old", "https://example.com/old", start - 8 * 86400000)), start).length, 0);
  assert.equal(parseFeed(rss(article("future", "https://example.com/future", start + 3600000)), start).length, 0);
  assert.throws(() => parseFeed("<rss>broken", start));
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY a "x">]>'+rss(), start));
});
Deno.test("Merge deduplicates titles/links and orders newest first", () => {
  const old = parseFeed(rss(article()), start);
  const newer = parseFeed(rss(article("Silver rises - Other", "https://example.com/silver", start)), start);
  assert.deepEqual(combineFeeds([old, old, newer]).map(x => x.title), ["Silver rises - Other", "Gold rises - Example"]);
});
Deno.test("Guests need no token; methods are bounded and no input URL is fetched", async () => {
  let calls = 0;
  const handler = createNewsHandler((async (input: RequestInfo | URL) => {
    assert.equal(FEED_URLS.includes(String(input)), true); calls++;
    return new Response(rss());
  }) as typeof fetch, () => start);
  const response = await handler(new Request("https://example.test/?url=https://private.invalid"));
  assert.equal(response.status, 200); assert.equal(calls, FEED_URLS.length);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal((await handler(new Request(get(), { method: "OPTIONS" }))).status, 204);
  assert.equal((await handler(new Request(get(), { method: "POST" }))).status, 405);
});
Deno.test("Partial failure preserves good results; cache and concurrent refresh avoid duplicate calls", async () => {
  let calls = 0;
  const handler = createNewsHandler((async () => {
    const call = ++calls; await Promise.resolve();
    return call === 1 || call === FEED_URLS.length + 1 ? new Response("failure", { status: 500 }) : new Response(rss());
  }) as typeof fetch, () => start);
  const responses = await Promise.all([handler(get()), handler(get())]);
  assert.equal(calls, FEED_URLS.length + 1);
  assert.equal((await responses[0].json()).partial, true);
  await handler(get()); assert.equal(calls, FEED_URLS.length + 1);
});
Deno.test("Failure retains original timestamp, uses cooldown, expires stale cache", async () => {
  let now = start, fail = false, calls = 0;
  const handler = createNewsHandler((async () => {
    calls++; if (fail) throw Error("offline"); return new Response(rss());
  }) as typeof fetch, () => now);
  const first = await (await handler(get())).json();
  fail = true; now += 11 * 60000;
  const stale = await (await handler(get())).json();
  assert.equal(stale.stale, true); assert.equal(stale.fetched_at, first.fetched_at);
  const previous = calls; await handler(get()); assert.equal(calls, previous);
  now += 25 * 3600000;
  const failed = await handler(get()); assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("retry-after"), "60");
});
Deno.test("Malformed, oversized, old-only and failed feeds never become live empty success", async () => {
  for (const body of ["broken", "x".repeat(1024*1024+1), rss(article("old", "https://example.com", start-8*86400000))]) {
    const handler = createNewsHandler((async () => new Response(body)) as typeof fetch, () => start);
    assert.equal((await handler(get())).status, 503);
  }
});

Deno.test("A transient failure retries once; Bing can carry a complete Google outage", async () => {
  let calls = 0;
  const retry = createNewsHandler((async () => {
    calls++; return calls <= FEED_URLS.length ? new Response("error", {status:500}) : new Response(rss());
  }) as typeof fetch, () => start);
  assert.equal((await retry(get())).status, 200);
  assert.equal(calls, 2 * FEED_URLS.length);
  const backup = createNewsHandler((async (url: RequestInfo | URL) => {
    if (String(url).includes("news.google.com")) throw Error("Google offline");
    return new Response(rss(article("Gold backup", "http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.com%2Fbackup")));
  }) as typeof fetch, () => start);
  const body = await (await backup(get())).json();
  assert.equal(body.partial, true); assert.equal(body.items[0].link, "https://example.com/backup");
});
