// 从 OpenStreetMap（Overpass，免 key）下载颐和园范围内的地图要素，保存到 tools/raw/。
// 数据 © OpenStreetMap contributors，ODbL。已下载的文件会跳过（删掉 raw/ 里对应文件可重新下载）。
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { overpass } from "./overpass.mjs";

const BBOX = "39.9775,116.2525,40.0035,116.2795"; // 南,西,北,东（比园区略大）
await mkdir(new URL("./raw/", import.meta.url), { recursive: true });

const q = (body, out = "out geom tags;") => `[out:json][timeout:120];(${body});${out}`;

const jobs = {
  boundary: q("way(29228773);"),
  water: q(`way["natural"="water"](${BBOX});relation["natural"="water"](${BBOX});way["waterway"](${BBOX});`),
  waterrel: q(`relation["natural"="water"](${BBOX});`, "out geom;"),
  buildings: q(`way["building"](${BBOX});`),
  highways: q(`way["highway"](${BBOX});`),
  walls: q(`way["barrier"="wall"](${BBOX});way["historic"="citywalls"](${BBOX});`),
  green: q(
    `way["leisure"~"park|garden"](${BBOX});way["landuse"~"forest|grass|meadow"](${BBOX});way["natural"~"wood|scrub|grassland"](${BBOX});`,
  ),
  bridges: q(`way["man_made"~"bridge|pier"](${BBOX});way["bridge"](${BBOX});`),
  pois: q(`nwr["name"](${BBOX});`, "out tags center;"),
  gates: q(
    `nwr["entrance"](${BBOX});nwr["barrier"="gate"](${BBOX});nwr["tourism"="attraction"](${BBOX});nwr["historic"](${BBOX});`,
    "out tags center;",
  ),
};

for (const [name, query] of Object.entries(jobs)) {
  const file = new URL(`./raw/${name}.json`, import.meta.url);
  if (existsSync(file)) {
    console.log(name, "已存在，跳过");
    continue;
  }
  const t0 = Date.now();
  const r = await overpass(query);
  await writeFile(file, JSON.stringify(r));
  console.log(name, r.elements.length, "elements,", ((Date.now() - t0) / 1000).toFixed(0), "s");
  await new Promise((r) => setTimeout(r, 2000));
}
