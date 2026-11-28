// 极简 Overpass 客户端：免 key，但要带 User-Agent，并且礼貌地限速、失败重试。
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function overpass(query, rounds = 3) {
  let lastErr;
  for (let round = 0; round < rounds; round++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "User-Agent": "summer-palace-guide/0.1 (personal PWA project; one-off data build)",
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(150_000),
        });
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        console.log("  重试：", String(e.message || e).slice(0, 100));
        await sleep(4000);
      }
    }
  }
  throw lastErr;
}
