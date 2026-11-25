import { icon } from "./icons.js";
import { list, get, exportRecords, mergeRecords } from "./storage.js";
import {
  syncConfig,
  saveSyncConfig,
  syncNow,
  startAutoSync,
  syncEvent,
} from "./sync.js";
import { initPWA, installApp, toggleFullscreen, offlineStatus } from "./pwa.js";
import { settingsView, initSettingsView } from "./settings-view.js";
import { initScrollbars } from "./scrollbars.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];
export function escapeHTML(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
// Stored records keep root-style paths ("/images/x.jpg"); the site itself may live in a subdirectory.
export function asset(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}
export function safeImage(value) {
  if (typeof value === "string" && /^\/images\/[a-z\d-]+\.jpg$/.test(value))
    return asset(value);
  return typeof value === "string" &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : asset("/images/home-food.jpg");
}
export function dateLabel(timestamp) {
  const date = new Date(timestamp);
  const today = new Date().toDateString() === date.toDateString();
  return `${today ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`} ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export const links = [
  { id: "home", label: "工具首页", short: "首页", href: "#/", icon: "grid" },
  {
    id: "picker",
    label: "随心选",
    short: "随心选",
    href: "#/picker",
    icon: "shuffle",
  },
  {
    id: "kitchen",
    label: "今天吃什么",
    short: "小厨房",
    href: "#/kitchen",
    icon: "bowl",
  },
  {
    id: "timer",
    label: "搞笑倒计时",
    short: "倒计时",
    href: "#/timer",
    icon: "clock",
  },
];
export function initShell() {
  $("#app").innerHTML = /* HTML */ ` <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#/" aria-label="趣日常首页"
          ><span class="brand-mark"><i></i><i></i><i></i><i></i></span
          ><span>趣日常<small>DAYFUN</small></span></a
        >
        <nav class="desktop-nav" aria-label="主导航">
          ${links.map((link) => /* HTML */ `<a href="${link.href}" data-nav="${link.id}">${icon(link.icon)}${link.label}</a>`).join("")}
        </nav>
        <div class="header-actions">
          <span class="local-badge" id="local-badge"
            ><span class="status-dot"></span
            ><span>本地生活，安心保存</span></span
          ><button class="icon-button settings-trigger" aria-label="设置">
            ${icon("settings")}
          </button>
        </div>
      </div>
    </header>
    <main class="page" id="main"></main>
    <nav class="bottom-nav" aria-label="移动端导航">
      ${links.map((link) => /* HTML */ `<a href="${link.href}" data-nav="${link.id}">${icon(link.icon)}<span>${link.short}</span></a>`).join("")}<button
        class="settings-trigger"
      >
        ${icon("settings")}<span>设置</span>
      </button>
    </nav>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  document.addEventListener("click", (event) => {
    if (event.target.closest(".settings-trigger"))
      showSettings().catch((error) => toast(error.message));
  });
  window.addEventListener("offline", updateBadge);
  window.addEventListener("online", updateBadge);
  window.addEventListener(syncEvent, (event) => {
    const badge = $("#local-badge");
    badge.dataset.state = event.detail.state;
    badge.lastElementChild.textContent =
      event.detail.state === "syncing"
        ? "正在同步…"
        : event.detail.state === "success"
          ? "已同步，安心保存"
          : "同步失败 · 本地已保存";
  });
  window.addEventListener("unhandledrejection", (event) => {
    toast(event.reason?.message || "操作未完成，请重试。");
    console.error(event.reason);
  });
  initPWA();
  initScrollbars();
  startAutoSync();
  updateBadge();
}
// Tool pages have no top bar; on wide screens (no bottom nav) these sit beside the title.
export const appBackButton = () =>
  /* HTML */ `<a class="icon-button app-back" href="#/" aria-label="返回首页"
    >${icon("back")}</a
  >`;
export const appSettingsButton = () =>
  /* HTML */ `<button
    class="icon-button settings-trigger app-settings"
    aria-label="设置"
  >
    ${icon("settings")}
  </button>`;
export function setActivePage(page) {
  $("#main").className = `page ${page}-page`;
  document.body.dataset.app = page;
  $$("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}
function updateBadge() {
  $("#local-badge").lastElementChild.textContent = navigator.onLine
    ? "本地生活，安心保存"
    : "当前离线 · 本地可用";
}
let toastTimer;
export function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 4200);
}

export function modal({
  title,
  eyebrow = "",
  content,
  className = "",
  onClose,
}) {
  const existing = $("dialog");
  if (existing) existing.close();
  const dialog = document.createElement("dialog");
  const previousFocus = document.activeElement;
  dialog.className = `modal ${className}`;
  dialog.innerHTML = /* HTML */ `<div class="modal-heading">
      <div>
        ${eyebrow ? /* HTML */ `<span class="eyebrow">${escapeHTML(eyebrow)}</span>` : ""}
        <h2 id="modal-title">${escapeHTML(title)}</h2>
      </div>
      <button class="icon-button modal-close" aria-label="关闭">
        ${icon("close")}
      </button>
    </div>
    <div class="modal-content">${content}</div>`;
  dialog.setAttribute("aria-labelledby", "modal-title");
  document.body.append(dialog);
  dialog.showModal();
  $(".modal-close", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    }
  });
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      onClose?.();
      if (previousFocus?.isConnected) previousFocus.focus();
    },
    { once: true },
  );
  return dialog;
}

export function emptyState({ symbol = "🍃", title, text, action = "" }) {
  return /* HTML */ `<div class="empty-state">
    <span>${symbol}</span>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action}
  </div>`;
}

async function showSettings() {
  const config = await syncConfig();
  const [recipes, picks, reviews, lastSync] = await Promise.all([
    list("recipe"),
    list("pick"),
    list("review"),
    get("settings:lastSync"),
  ]);
  const estimate = await navigator.storage?.estimate?.();
  let disposeSettings;
  const dialog = modal({
    title: "设置",
    className: "settings-modal",
    content: settingsView(
      {
        config,
        recipes: recipes.length,
        picks: picks.length,
        reviews: reviews.length,
        lastSync: lastSync ? dateLabel(lastSync.at) : null,
        usage: estimate ? (estimate.usage / 1024 / 1024).toFixed(1) : "",
        offline: offlineStatus(),
      },
      escapeHTML,
    ),
    onClose: () => disposeSettings?.(),
  });
  disposeSettings = initSettingsView(dialog);
  $("#install-app", dialog).onclick = async () => toast(await installApp());
  $("#fullscreen", dialog).onclick = async () => {
    try {
      toast(await toggleFullscreen());
    } catch {
      toast("浏览器未允许全屏，请从桌面应用打开。");
    }
  };
  const save = async () => {
    const form = $("#sync-form", dialog);
    await saveSyncConfig({
      url: form.elements.url.value.trim(),
      token: form.elements.token.value.trim(),
      auto: form.elements.auto.checked,
    });
  };
  $("#sync-form", dialog).onsubmit = async (event) => {
    event.preventDefault();
    try {
      await save();
      $("#sync-status", dialog).textContent = "配置已保存在本机。";
      toast("同步配置已保存");
    } catch (error) {
      $("#sync-status", dialog).textContent = error.message;
    }
  };
  $("#sync-now", dialog).onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    $("#sync-status", dialog).textContent = "正在连接并合并数据…";
    try {
      await save();
      await syncNow();
      $("#sync-status", dialog).textContent =
        `同步完成：${dateLabel(Date.now())}`;
      toast("数据与照片已同步");
    } catch (error) {
      $("#sync-status", dialog).textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  $("#export-data", dialog).onclick = async () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "little-day",
            version: 1,
            exportedAt: Date.now(),
            records: await exportRecords(),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `趣日常备份-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("备份已导出");
  };
  $("#import-data", dialog).onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("备份超过 100 MB，请分批导入。");
      const data = JSON.parse(await file.text());
      if (data.app !== "little-day" || data.version !== 1)
        throw new Error("请选择趣日常导出的 JSON 备份。");
      await mergeRecords(data.records);
      toast("备份已合并，数据不会重复添加");
      dialog.close();
    } catch (error) {
      toast(
        error instanceof SyntaxError
          ? "文件不是有效的 JSON 备份。"
          : error.message,
      );
    }
    event.target.value = "";
  };
  $("#persist-data", dialog).onclick = async () =>
    toast(
      (await navigator.storage?.persist?.())
        ? "已获得持久存储权限，请继续定期备份。"
        : "浏览器未授予持久存储权限，建议定期导出备份。",
    );
}
