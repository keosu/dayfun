import {
  get,
  put,
  exportRecords,
  mergeRecords,
  changeEvent,
} from "./storage.js";

let syncing = false;
let autoTimer;
export const syncEvent = "little-day:sync";
export async function syncConfig() {
  return (await get("settings:sync")) || { url: "", token: "", auto: false };
}
export async function saveSyncConfig(config) {
  if (config.url) {
    const url = new URL(config.url);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("请填写有效的 HTTP / HTTPS 服务地址。");
    if (location.protocol === "https:" && url.protocol !== "https:")
      throw new Error("当前网页使用 HTTPS，同步服务也需要使用 HTTPS。");
  }
  await put(
    "settings",
    { ...config, url: config.url.replace(/\/+$/, "") },
    "settings:sync",
  );
}
async function request(config, method, records) {
  const response = await fetch(`${config.url}/api/sync`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    ...(records ? { body: JSON.stringify({ version: 1, records }) } : {}),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "访问令牌不正确。"
        : `同步服务返回错误（${response.status}）。`,
    );
  const result = await response.json();
  if (result.version !== 1) throw new Error("同步服务版本不兼容。");
  return result.records;
}
export async function syncNow() {
  if (syncing) return;
  const config = await syncConfig();
  if (!config.url) throw new Error("先填写同步服务地址。");
  if (!navigator.onLine)
    throw new Error("当前离线，数据已保存在本机，联网后可同步。");
  syncing = true;
  window.dispatchEvent(
    new CustomEvent(syncEvent, { detail: { state: "syncing" } }),
  );
  try {
    await mergeRecords(await request(config, "GET"));
    await mergeRecords(await request(config, "PUT", await exportRecords()));
    await put("settings", { at: Date.now() }, "settings:lastSync");
    window.dispatchEvent(
      new CustomEvent(syncEvent, { detail: { state: "success" } }),
    );
  } catch (error) {
    const message = ["TimeoutError", "AbortError"].includes(error.name)
      ? "同步超时，数据已保存在本机。"
      : error instanceof TypeError
        ? "无法连接同步服务，请检查地址、网络和服务的跨域配置。"
        : error.message;
    window.dispatchEvent(
      new CustomEvent(syncEvent, { detail: { state: "error", message } }),
    );
    throw new Error(message);
  } finally {
    syncing = false;
  }
}

export function startAutoSync() {
  const schedule = () => {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(async () => {
      if (syncing) return;
      const config = await syncConfig();
      if (config.auto && config.url && navigator.onLine)
        await syncNow().catch(() => {});
    }, 1800);
  };
  window.addEventListener(changeEvent, (event) => {
    if (!["settings", "merge"].includes(event.detail.type)) schedule();
  });
  window.addEventListener("online", schedule);
  schedule();
}
