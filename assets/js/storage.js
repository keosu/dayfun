import { validRecords, shouldReplace } from "./records.js";
export { validRecords } from "./records.js";
const DB_NAME = "little-day";
let database;
export const changeEvent = "little-day:changed";

function openDB() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("records", {
        keyPath: "id",
      });
      store.createIndex("type", "type");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = null;
      reject(new Error("本地存储不可用，请检查浏览器隐私设置。"));
    };
  });
  return database;
}

async function transaction(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", mode);
    let result;
    const request = action(tx.objectStore("records"));
    if (request)
      request.onsuccess = () => {
        result = request.result;
      };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () =>
      reject(tx.error || new Error("保存失败，请检查设备剩余空间。"));
    tx.onabort = () => reject(tx.error || new Error("保存已中断。"));
  });
}

export async function allRecords() {
  return (await transaction("readonly", (store) => store.getAll())) || [];
}
export async function list(type) {
  return (
    (await transaction("readonly", (store) =>
      store.index("type").getAll(type),
    )) || []
  )
    .filter((record) => record.deletedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function get(id) {
  const record = await transaction("readonly", (store) => store.get(id));
  return record && record.deletedAt === null ? record.payload : null;
}
export async function put(
  type,
  payload,
  id = `${type}:${crypto.randomUUID()}`,
) {
  const record = {
    id,
    type,
    payload: structuredClone(payload),
    updatedAt: Date.now(),
    deletedAt: null,
  };
  if (type !== "settings" && !validRecords([record]))
    throw new Error("内容格式不正确，请检查必填项及内容长度。");
  await transaction("readwrite", (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      record.updatedAt = Math.max(
        Date.now(),
        (request.result?.updatedAt || 0) + 1,
      );
      store.put(record);
    };
  });
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: { type } }));
  return record;
}
export async function remove(id) {
  let existing;
  await transaction("readwrite", (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      existing = request.result;
      if (!existing) return;
      const updatedAt = Math.max(Date.now(), existing.updatedAt + 1);
      store.put({
        ...existing,
        payload: null,
        updatedAt,
        deletedAt: updatedAt,
      });
    };
  });
  if (!existing) return;
  window.dispatchEvent(
    new CustomEvent(changeEvent, { detail: { type: existing.type } }),
  );
}

export async function mergeRecords(incoming) {
  if (!validRecords(incoming))
    throw new Error("数据格式不正确，请使用小日子导出的备份或兼容的同步服务。");
  await transaction("readwrite", (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const existing = new Map(
        request.result.map((record) => [record.id, record]),
      );
      for (const record of incoming) {
        if (shouldReplace(existing.get(record.id), record)) {
          store.put(record);
          existing.set(record.id, record);
        }
      }
    };
  });
  window.dispatchEvent(
    new CustomEvent(changeEvent, { detail: { type: "merge" } }),
  );
}
export async function exportRecords() {
  return (await allRecords()).filter((record) => record.type !== "settings");
}
