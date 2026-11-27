// 单页路由：hash 路由，视图懒加载，首次打开后一直保持挂载，切换不刷新。

import { $ } from "./ui.js";

const ROUTES = {
  "/": { title: "体感实验室", load: () => import("./views/home.js") },
  "/sensors": { title: "传感器体检", load: () => import("./views/sensors.js") },
  "/gestures": { title: "动作识别", load: () => import("./views/gestures.js") },
  "/pad": { title: "体感手柄", load: () => import("./views/pad.js") },
  "/system": { title: "系统能力", load: () => import("./views/system.js") },
};

const mounted = new Map(); // path → { root, api }
let current = null;

function routeOf() {
  const path = location.hash.replace(/^#/, "") || "/";
  return ROUTES[path] ? path : "/";
}

async function show(path) {
  const route = ROUTES[path];
  const host = $("#views");
  document.title = path === "/" ? "体感实验室" : `${route.title} · 体感实验室`;
  $("#title").textContent = route.title;
  $("#home-btn").hidden = path === "/";

  if (current && current !== path) {
    const prev = mounted.get(current);
    prev?.api.leave?.();
    prev?.root.setAttribute("hidden", "");
  }
  current = path;

  let entry = mounted.get(path);
  if (!entry) {
    const root = document.createElement("section");
    root.className = `view view-${path.slice(1) || "home"}`;
    host.append(root);
    entry = { root, api: {} };
    mounted.set(path, entry);
    const mod = await route.load();
    entry.api = (await mod.default.mount(root)) || {};
  }
  if (current !== path) return; // 加载期间又切走了
  entry.root.removeAttribute("hidden");
  const actions = $("#actions");
  actions.replaceChildren(...(entry.api.actions || []));
  entry.api.enter?.();
}

addEventListener("hashchange", () => show(routeOf()));
show(routeOf());

// 记住安卓的安装提示，在“系统能力”里用按钮触发
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.deferredInstall = e;
});
