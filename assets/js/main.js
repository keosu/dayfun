import { initShell, setActivePage, $, toast } from "./ui.js";
import "./theme.js";

const routes = {
  home: { title: "小日子 · 日常有点意思", load: () => import("./home.js") },
  picker: { title: "随心选 · 小日子", load: () => import("./picker.js") },
  kitchen: { title: "今天吃什么 · 小日子", load: () => import("./kitchen.js") },
};
const views = new Map();
const scrollPositions = new Map();
let current = null;
let navigation = 0;

// After a new deployment, chunks referenced by an old page may be gone; a reload picks up the new build.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (!sessionStorage.getItem("little-day:reloaded")) {
    sessionStorage.setItem("little-day:reloaded", "1");
    location.reload();
  }
});

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, search = ""] = raw.split("?");
  const name = routes[path] ? path : "home";
  return { name, params: new URLSearchParams(search) };
}

async function view(name) {
  if (!views.has(name)) {
    views.set(
      name,
      (async () => {
        const module = await routes[name].load();
        const element = document.createElement("div");
        element.className = "view";
        element.dataset.view = name;
        element.hidden = true;
        $("#main").append(element);
        const controller = (await module.mount(element)) || {};
        return { element, controller };
      })(),
    );
  }
  try {
    return await views.get(name);
  } catch (error) {
    views.delete(name);
    throw error;
  }
}

async function route() {
  const { name, params } = parseHash();
  const ticket = ++navigation;
  if (current && current !== name) {
    scrollPositions.set(current, scrollY);
    document.querySelector("dialog[open]")?.close();
  }
  setActivePage(name);
  document.title = routes[name].title;
  let target;
  try {
    target = await view(name);
  } catch (error) {
    console.error(error);
    toast("页面加载失败，请检查网络后重试。");
    return;
  }
  if (ticket !== navigation) return;
  const previous =
    current && current !== name ? await views.get(current) : null;
  previous?.controller.hide?.();
  if (previous) previous.element.hidden = true;
  target.element.hidden = false;
  const entering = current !== name;
  current = name;
  target.controller.show?.(params);
  if (entering) {
    target.element.classList.remove("view-enter");
    void target.element.offsetWidth;
    target.element.classList.add("view-enter");
    scrollTo(0, scrollPositions.get(name) || 0);
  }
  document.body.dataset.ready = "true";
}

function prefetch() {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() =>
    Object.values(routes).forEach((item) => item.load().catch(() => {})),
  );
}

initShell();
window.addEventListener("hashchange", route);
route().then(prefetch);
