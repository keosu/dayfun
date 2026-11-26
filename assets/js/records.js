// Shared validation for JSON backups, remote synchronization and the sample server.
const text = (value, max, required = false) =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || value.trim().length > 0);
const id = (value) =>
  typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
const image = (value) =>
  typeof value === "string" &&
  value.length <= 1_600_000 &&
  (/^\/images\/[a-z0-9-]+\.(jpg|svg)$/.test(value) ||
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
const strings = (value, min, max, width) =>
  Array.isArray(value) &&
  value.length >= min &&
  value.length <= max &&
  value.every((item) => text(item, width, true));
const modes = ["wheel", "capsule", "pixel"];
const category = (value) => text(value, 12, true);
const uniqueStrings = (value, min, max, width) =>
  strings(value, min, max, width) && new Set(value).size === value.length;
const clockTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const ints = (value, min, max, count) =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= count &&
  new Set(value).size === value.length &&
  value.every((item) => Number.isInteger(item) && item >= min && item <= max);
const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value));
const time = (value) => Number.isFinite(value) && value >= 0;

function validPayload(record) {
  const payload = record.payload;
  switch (record.type) {
    case "recipe":
      return (
        id(payload.id) &&
        record.id === `recipe:${payload.id}` &&
        text(payload.name, 40, true) &&
        text(payload.cuisine, 40) &&
        text(payload.region, 40) &&
        Number.isInteger(payload.minutes) &&
        payload.minutes >= 0 &&
        payload.minutes <= 1440 &&
        ["", "简单", "适中", "进阶"].includes(payload.difficulty) &&
        text(payload.description, 300) &&
        strings(payload.ingredients, 0, 100, 1000) &&
        strings(payload.steps, 0, 100, 2000) &&
        text(payload.tip, 300) &&
        image(payload.image)
      );
    case "favorite":
      return (
        id(payload.recipeId) && record.id === `favorite:${payload.recipeId}`
      );
    case "review":
      return (
        id(payload.recipeId) &&
        text(payload.recipeName, 40, true) &&
        image(payload.image) &&
        Number.isInteger(payload.rating) &&
        payload.rating >= 1 &&
        payload.rating <= 5 &&
        date(payload.date) &&
        text(payload.note, 2000) &&
        time(payload.at)
      );
    case "order":
      return (
        Array.isArray(payload.items) &&
        payload.items.length <= 100 &&
        payload.items.every(
          (item) =>
            item &&
            id(item.recipeId) &&
            text(item.name, 40, true) &&
            image(item.image) &&
            Number.isInteger(item.quantity) &&
            item.quantity >= 1 &&
            item.quantity <= 20,
        ) &&
        (record.id === "order:cart" ||
          (payload.status === "completed" &&
            date(payload.date) &&
            text(payload.note, 1000) &&
            time(payload.at)))
      );
    case "pick":
      return (
        category(payload.topic) &&
        text(payload.result, 30, true) &&
        modes.includes(payload.mode) &&
        strings(payload.options, 2, 16, 30) &&
        payload.options.includes(payload.result) &&
        time(payload.at)
      );
    case "pickset":
      return (
        record.id === "pickset:current" &&
        modes.includes(payload.mode) &&
        typeof payload.sound === "boolean" &&
        payload.sets &&
        typeof payload.sets === "object" &&
        !Array.isArray(payload.sets) &&
        Object.keys(payload.sets).length >= 1 &&
        Object.keys(payload.sets).length <= 30 &&
        Object.hasOwn(payload.sets, payload.topic) &&
        Object.entries(payload.sets).every(
          ([name, options]) =>
            category(name) && uniqueStrings(options, 2, 16, 30),
        )
      );
    case "event":
      return (
        id(payload.id) &&
        record.id === `event:${payload.id}` &&
        text(payload.title, 40, true) &&
        text(payload.emoji, 8) &&
        ["weekly", "once", "monthly"].includes(payload.repeat) &&
        clockTime(payload.time) &&
        ints(payload.remind, 0, 10080, 8) &&
        text(payload.note, 200) &&
        typeof payload.enabled === "boolean" &&
        (payload.repeat === "weekly"
          ? ints(payload.weekdays, 0, 6, 7)
          : payload.repeat === "once"
            ? date(payload.date)
            : Number.isInteger(payload.monthDay) &&
              payload.monthDay >= 0 &&
              payload.monthDay <= 28)
      );
    default:
      return false;
  }
}

export function validRecords(records) {
  return (
    Array.isArray(records) &&
    records.length <= 50000 &&
    records.every(
      (record) =>
        record &&
        text(record.id, 200, true) &&
        [
          "recipe",
          "review",
          "order",
          "pick",
          "pickset",
          "favorite",
          "event",
        ].includes(record.type) &&
        record.id.startsWith(`${record.type}:`) &&
        time(record.updatedAt) &&
        (record.deletedAt === null || time(record.deletedAt)) &&
        (record.deletedAt !== null
          ? record.payload === null
          : record.payload &&
            typeof record.payload === "object" &&
            !Array.isArray(record.payload) &&
            validPayload(record)),
    )
  );
}

export function shouldReplace(previous, incoming) {
  if (!previous) return true;
  if (incoming.updatedAt !== previous.updatedAt)
    return incoming.updatedAt > previous.updatedAt;
  // A deletion wins a simultaneous edit, so old offline copies cannot resurrect it.
  if ((incoming.deletedAt !== null) !== (previous.deletedAt !== null))
    return incoming.deletedAt !== null;
  return JSON.stringify(incoming) > JSON.stringify(previous);
}

export function mergeByTimestamp(existing, incoming) {
  const merged = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) {
    const previous = merged.get(record.id);
    if (shouldReplace(previous, record)) merged.set(record.id, record);
  }
  return [...merged.values()];
}
