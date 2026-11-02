// POD·LIST 的 RSS 中繼：多數 feed 沒開 CORS，瀏覽器讀不到，由這裡轉一手。
// feedUrl 由前端向 iTunes 查好傳來（iTunes 對 Worker 的 IP 回 403，這裡查不到）。
// 為了不變成開放 proxy：只放行指定網站來源、不接 IP 或 localhost、只轉發內容確實是 RSS 的回應。
const ALLOW = /^(https:\/\/loneangle-claw\.github\.io|https:\/\/pod-list\.fbiericlin\.workers\.dev|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const MAX_BYTES = 30 * 1024 * 1024;

const okTarget = u => {
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  return /^https?:$/.test(u.protocol) && !/^[\d.]+$|^\[|^localhost$|\.localhost$/.test(host);
};
const fail = (status, msg, cors) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors } });

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin');
    if (!origin || !ALLOW.test(origin)) return fail(403, 'origin not allowed');
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    if (req.method !== 'GET') return fail(405, 'GET only', cors);

    let feed;
    try { feed = new URL(new URL(req.url).searchParams.get('url')); } catch { return fail(400, 'bad url', cors); }

    // feed 常有正常轉址，所以要跟，但每一跳都重新檢查，最多 5 跳
    let r;
    for (let hop = 0; ; hop++) {
      if (!okTarget(feed)) return fail(400, 'bad url', cors);
      r = await fetch(feed.href, { redirect: 'manual', cf: { cacheTtl: 3600, cacheEverything: true }, headers: { 'User-Agent': 'POD-LIST/1.0' } });
      const loc = r.status >= 300 && r.status < 400 && r.headers.get('Location');
      if (!loc) break;
      if (hop >= 5) return fail(502, 'too many redirects', cors);
      try { feed = new URL(loc, feed); } catch { return fail(502, 'bad redirect', cors); }
    }
    if (!r.ok) return fail(502, `feed ${r.status}`, cors);
    if (Number(r.headers.get('Content-Length') || 0) > MAX_BYTES) return fail(502, 'feed too large', cors);
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return fail(502, 'feed too large', cors);
    if (!/<rss[\s>]/i.test(new TextDecoder().decode(buf.slice(0, 4096)))) return fail(415, 'not an RSS feed', cors);

    return new Response(buf, { headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      ...cors
    } });
  }
};
