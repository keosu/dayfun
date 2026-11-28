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
for (const name of await readdir("assets/js/picker")) {
  if (!name.endsWith(".js")) continue;
  const path = `assets/js/picker/${name}`;
  const source = await readFile(path, "utf8");
  await writeFile(path, await prettier.format(source, { filepath: path }));
}
for (const path of [
  "assets/styles.css",
  "assets/compact.css",
  "assets/app.css",
  "assets/shell.css",
  "assets/timer.css",
  "assets/schedule.css",
  "index.html",
  "vite.config.js",
  "playwright.config.js",
  "package.json",
  "public/sw.js",
  "server/sync-server.mjs",
  "tests/app.spec.js",
  "tests/sync.spec.js",
  "tests/animation.spec.js",
  "tests/theme.spec.js",
  "tests/timer.spec.js",
  "tests/calendar.spec.js",
  "tests/senselab.spec.js",
  "tests/summer-palace.spec.js",
  "scripts/tune-physics.mjs",
  ".github/workflows/deploy.yml",
]) {
  const source = await readFile(path, "utf8");
  await writeFile(path, await prettier.format(source, { filepath: path }));
}

// senselab：前端（public/senselab）和它的局域网服务与测试（senselab/）
const senselabFiles = [];
for (const dir of ["public/senselab", "senselab/server", "senselab/test", "senselab/e2e", "senselab/examples", "senselab/scripts"]) {
  for (const rel of await readdir(dir, { recursive: true })) {
    if (/\.(m?js|css|html|webmanifest)$/.test(rel)) senselabFiles.push(`${dir}/${rel}`.replaceAll("\\", "/"));
  }
}
for (const path of [...senselabFiles, "senselab/playwright.config.js", "senselab/package.json"]) {
  const source = await readFile(path, "utf8");
  await writeFile(path, await prettier.format(source, { filepath: path }));
}