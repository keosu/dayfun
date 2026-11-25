let installPrompt;
let offlineReady = false;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

export async function initPWA() {
  // Development uses live modules; caching is enabled in build / preview.
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "OFFLINE_READY") {
        offlineReady = true;
        window.dispatchEvent(new Event("little-day:offline-ready"));
      }
    });
    if (registration.active) {
      const cacheNames = await caches.keys();
      offlineReady = cacheNames.some((name) => name.startsWith("little-day-v"));
    }
  } catch (error) {
    console.warn("PWA registration failed:", error);
  }
}
export function isOfflineReady() {
  return offlineReady;
}
export function offlineStatus() {
  if (import.meta.env.DEV)
    return "当前为开发预览。构建预览支持安装与离线访问。";
  return offlineReady
    ? "离线资源已准备好。"
    : "首次访问会准备离线资源，请保持网络连接。";
}
export function isInstalled() {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches ||
    navigator.standalone
  );
}
export async function installApp() {
  if (installPrompt) {
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    installPrompt = null;
    return result.outcome === "accepted"
      ? "已提交安装，请从桌面打开。"
      : "你可以稍后再次安装。";
  }
  if (isInstalled()) return "已经在桌面应用中啦。";
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    ? "在 Safari 中点击「分享」，选择「添加到主屏幕」，再从桌面打开。"
    : "打开浏览器菜单，选择「安装应用」或「添加到主屏幕」。首次离线缓存完成后即可安装。";
}
export async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return "已退出全屏。";
  }
  if (document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return "已进入全屏。";
  }
  return "此浏览器不支持网页全屏，请添加到主屏幕后打开。iOS 的系统状态栏由系统控制。";
}
