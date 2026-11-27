import { h, $, isIOS, isStandalone } from "../ui.js";
import { link } from "../link.js";
import { motion } from "../motion.js";

const TILES = [
  {
    href: "#/sensors",
    emoji: "🧭",
    title: "传感器体检",
    desc: "定位、陀螺仪、加速度，有没有、准不准",
    tone: "t1",
  },
  {
    href: "#/gestures",
    emoji: "🥋",
    title: "动作识别",
    desc: "甩一甩、翻一翻、摇一摇，认得出来",
    tone: "t2",
  },
  {
    href: "#/pad",
    emoji: "🎮",
    title: "体感手柄",
    desc: "把手机变成局域网里的游戏手柄",
    tone: "t3",
    id: "pad",
  },
  {
    href: "#/system",
    emoji: "🔧",
    title: "系统能力",
    desc: "震动、通知、全屏、屏幕常亮",
    tone: "t4",
  },
];

export default {
  mount(root) {
    const grid = h(`<div class="tiles"></div>`);
    for (const t of TILES) {
      const a = h(`
        <a class="tile ${t.tone}" href="${t.href}">
          <span class="tile-emoji">${t.emoji}</span>
          <strong></strong>
          <small></small>
          <em class="badge" hidden></em>
        </a>`);
      $("strong", a).textContent = t.title;
      $("small", a).textContent = t.desc;
      if (t.id) a.dataset.tile = t.id;
      grid.append(a);
    }
    const tip = h(`<p class="home-tip"></p>`);
    root.append(grid, tip);

    const padBadge = $("[data-tile=pad] .badge", grid);
    const gestureBadge = $('[href="#/gestures"] .badge', grid);

    const refresh = () => {
      const open = link.status === "open";
      padBadge.hidden = !open;
      padBadge.textContent = open ? `P${link.player ?? "?"} 已连接` : "";
      const running = motion.state === "running";
      gestureBadge.hidden = !running;
      gestureBadge.textContent = running ? "感应中" : "";
    };
    link.on("status", refresh);
    link.on("message", (m) => m.t === "welcome" && refresh());
    motion.on("state", refresh);
    refresh();

    let msg = "传感器需要 HTTPS 才能使用。";
    if (isIOS && !isStandalone)
      msg = "iPhone：点分享按钮，选“添加到主屏幕”，用起来更像一个 App。";
    else if (!window.isSecureContext)
      msg =
        "当前不是 HTTPS，传感器会被浏览器禁用，请用电脑上显示的 https 地址打开。";
    else msg = "建议在手机上打开；电脑浏览器没有运动传感器。";
    tip.textContent = msg;
    return {};
  },
};
