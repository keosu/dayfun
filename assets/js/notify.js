// System notifications. They go through the service worker so Android and installed iOS web apps
// show them like any other app's notification.
import { asset } from "./ui.js";
import { isInstalled } from "./pwa.js";

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const supported = () => "Notification" in window;
export const permission = () =>
  supported() ? Notification.permission : "unsupported";

// iOS only allows web notifications for apps added to the Home Screen.
export const needsInstall = () => isIOS() && !isInstalled();

export async function ask() {
  if (!supported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function statusText() {
  if (!supported())
    return needsInstall()
      ? "iPhone 需要先「添加到主屏幕」，再从桌面图标打开，才能开启通知。"
      : "这个浏览器不支持系统通知。";
  if (permission() === "granted") return "通知已开启。";
  if (permission() === "denied")
    return "通知被关闭了，请在系统或浏览器的网站设置里重新允许。";
  return needsInstall()
    ? "iPhone 需要先「添加到主屏幕」，从桌面图标打开后才能开启通知。"
    : "还没有开启通知。";
}

export async function notify(title, { body = "", tag, url = "#/" } = {}) {
  if (permission() !== "granted") return false;
  const options = {
    body,
    tag,
    renotify: Boolean(tag),
    icon: asset("/icons/icon-192.png"),
    badge: asset("/icons/icon-192.png"),
    vibrate: [200, 100, 200, 100, 300],
    data: { url },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    /* Fall through to the page-level API. */
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
