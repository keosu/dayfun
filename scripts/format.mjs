import prettier from "prettier";
import { readdir, readFile, writeFile } from "node:fs/promises";

// Mark HTML templates so Prettier also formats nested recipe / modal markup.
for (const name of await readdir("assets/js")) {
  if (!name.endsWith(".js")) continue;
  const path = `assets/js/${name}`;
  const source = await readFile(path, "utf8");
  const tagged = source.replace(
    /(?<!\/\* HTML \*\/ )`(?=\s*<[a-z])/g,
    "/* HTML */ `",
  );
  const formatted = await prettier.format(tagged, {
    parser: "babel",
    embeddedLanguageFormatting: "auto",
  });
  await writeFile(path, formatted);
}
for (const path of [
  "assets/styles.css",
  "assets/compact.css",
  "assets/app.css",
  "public/theme-init.js",
  "index.html",
  "apps/picker/index.html",
  "apps/kitchen/index.html",
  "vite.config.js",
  "playwright.config.js",
  "package.json",
  "public/sw.js",
  "server/sync-server.mjs",
  "tests/app.spec.js",
  "tests/sync.spec.js",
  "tests/animation.spec.js",
  "tests/theme.spec.js",
]) {
  const source = await readFile(path, "utf8");
  await writeFile(path, await prettier.format(source, { filepath: path }));
}
