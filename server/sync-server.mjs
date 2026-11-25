import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { validRecords, mergeByTimestamp } from "../assets/js/records.js";

const port = Number(process.env.PORT || 8787);
const token = process.env.SYNC_TOKEN || randomBytes(24).toString("hex");
const origins = new Set(
  (
    process.env.SYNC_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const dataPath = resolve(
  process.env.SYNC_DATA_FILE || "server/data/records.json",
);
const maxBody = 100 * 1024 * 1024;
let queue = Promise.resolve();

await mkdir(dirname(dataPath), { recursive: true });
async function readRecords() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8")).records;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function authorized(request) {
  const provided = Buffer.from(request.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${token}`);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
function reply(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
async function bodyJSON(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBody) {
      const error = new Error("Request exceeds 100 MB");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.status = 400;
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !origins.has(origin)) {
    reply(response, 403, { error: "Origin is not allowed" });
    return;
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/health" && request.method === "GET") {
    reply(response, 200, { status: "ok" });
    return;
  }
  if (pathname !== "/api/sync") {
    reply(response, 404, { error: "Not found" });
    return;
  }
  if (!authorized(request)) {
    reply(response, 401, { error: "Invalid token" });
    return;
  }
  try {
    if (request.method === "GET") {
      await queue;
      reply(response, 200, { version: 1, records: await readRecords() });
    } else if (request.method === "PUT") {
      const data = await bodyJSON(request);
      if (data.version !== 1 || !validRecords(data.records)) {
        reply(response, 400, { error: "Invalid version or record schema" });
        return;
      }
      const task = queue.then(async () => {
        const merged = mergeByTimestamp(await readRecords(), data.records);
        const serialized = JSON.stringify({ version: 1, records: merged });
        if (Buffer.byteLength(serialized) > maxBody) {
          const error = new Error("Dataset exceeds 100 MB");
          error.status = 413;
          throw error;
        }
        const temporary = `${dataPath}.tmp`;
        await writeFile(temporary, serialized, "utf8");
        await rename(temporary, dataPath);
        return merged;
      });
      queue = task.then(
        () => {},
        () => {},
      );
      reply(response, 200, { version: 1, records: await task });
    } else {
      reply(response, 405, { error: "Method not allowed" });
    }
  } catch (error) {
    console.error(error.message);
    if (!response.headersSent)
      reply(response, error.status || 500, {
        error: error.status ? error.message : "Unable to access sync storage",
      });
  }
});
server.listen(port, "0.0.0.0", () => {
  console.log(`Little Day sync server: http://localhost:${port}`);
  if (!process.env.SYNC_TOKEN)
    console.log(
      `Temporary access token: ${token}\nSet SYNC_TOKEN to keep the same token after restarting.`,
    );
  console.log(`Allowed origins: ${[...origins].join(", ")}`);
});
