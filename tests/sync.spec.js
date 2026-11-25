import { test, expect } from "@playwright/test";
import { mergeByTimestamp, validRecords } from "../assets/js/records.js";

test("sync authentication, CORS and record validation reject invalid requests", async ({
  request,
}) => {
  const url = "http://localhost:8788/api/sync";
  expect((await request.get(url)).status()).toBe(401);
  expect(
    (
      await request.get(url, { headers: { Authorization: "Bearer wrong" } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.get(url, {
        headers: {
          Authorization: "Bearer playwright-local-test-token",
          Origin: "https://unlisted.example",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.put(url, {
        headers: { Authorization: "Bearer playwright-local-test-token" },
        data: {
          version: 1,
          records: [
            {
              type: "review",
              id: "review:bad",
              updatedAt: 1,
              deletedAt: null,
              payload: { rating: 99 },
            },
          ],
        },
      })
    ).status(),
  ).toBe(400);
});

test("simultaneous deletes win edits regardless of synchronization order", async () => {
  const original = {
    id: "favorite:tomato-egg",
    type: "favorite",
    payload: { recipeId: "tomato-egg" },
    updatedAt: 1000,
    deletedAt: null,
  };
  const deletion = { ...original, payload: null, deletedAt: 1000 };
  expect(validRecords([original, deletion])).toBe(true);
  expect(mergeByTimestamp([original], [deletion])).toEqual([deletion]);
  expect(mergeByTimestamp([deletion], [original])).toEqual([deletion]);
  expect(
    mergeByTimestamp([deletion], [{ ...original, updatedAt: 1001 }]),
  ).toEqual([{ ...original, updatedAt: 1001 }]);
});

test("local edits in the same millisecond have increasing timestamps", async ({
  page,
}) => {
  await page.goto("/apps/kitchen/");
  await page.evaluate(() => {
    window.testOriginalNow = Date.now;
    Date.now = () => 1000;
  });
  try {
    for (const [pressed, timestamp] of [
      ["true", 1000],
      ["false", 1001],
      ["true", 1002],
    ]) {
      await page.locator('[data-favorite="tomato-egg"]').click();
      await expect(
        page.locator('[data-favorite="tomato-egg"]'),
      ).toHaveAttribute("aria-pressed", pressed);
      const saved = await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const request = indexedDB.open("little-day", 1);
            request.onsuccess = () => {
              const db = request.result;
              const get = db
                .transaction("records")
                .objectStore("records")
                .get("favorite:tomato-egg");
              get.onsuccess = () => {
                db.close();
                resolve(get.result);
              };
              get.onerror = reject;
            };
            request.onerror = reject;
          }),
      );
      expect(saved.updatedAt).toBe(timestamp);
      expect(saved.deletedAt !== null).toBe(pressed === "false");
    }
  } finally {
    await page.evaluate(() => {
      Date.now = window.testOriginalNow;
    });
  }
});
