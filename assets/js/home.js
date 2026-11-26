import { $, asset, escapeHTML as esc, dateLabel } from "./ui.js";
import { icon } from "./icons.js";
import { list, changeEvent } from "./storage.js";
import { nextOccurrence, weekdayNames, relativeText } from "./schedule-core.js";

const greeting = () => {
  const hours = new Date().getHours();
  return hours < 11 ? "早上好" : hours < 18 ? "下午好" : "晚上好";
};

const tiles = [
  {
    id: "picker",
    href: "#/picker",
    emoji: "🎡",
    title: "随心选",
    text: "吃什么、轮到谁，交给好运",
  },
  {
    id: "kitchen",
    href: "#/kitchen",
    emoji: "🍳",
    title: "今天吃什么",
    text: "菜谱、点菜、拿手菜",
  },
  {
    id: "timer",
    href: "#/timer",
    emoji: "⏰",
    title: "搞笑倒计时",
    text: "到点喊你，不理就越喊越急",
  },
  {
    id: "calendar",
    href: "#/calendar",
    emoji: "📅",
    title: "日程提醒",
    text: "每周、每月、一次性的提醒",
  },
];

function timerState() {
  try {
    const stored = JSON.parse(localStorage.getItem("little-day:timer"));
    return ["running", "paused", "ringing"].includes(stored?.status)
      ? stored.status
      : null;
  } catch {
    return null;
  }
}

export function mount(root) {
  root.innerHTML = /* HTML */ `<div class="hm">
    <section class="hm-hero">
      <div>
        <span class="hm-greeting" id="home-greeting"></span>
        <h1>让日常，好玩一点<span class="hm-dot">.</span></h1>
      </div>
      <img class="hm-sun" src="${asset("/icons/icon.svg")}" alt="" />
    </section>
    <section class="hm-grid">
      ${tiles
        .map(
          (tile) =>
            /* HTML */ `<a class="hm-tile hm-${tile.id}" href="${tile.href}">
              <span class="hm-emoji" aria-hidden="true">${tile.emoji}</span>
              <strong>${tile.title}</strong>
              <span class="hm-text" data-text="${tile.id}">${tile.text}</span>
              <span class="hm-arrow" aria-hidden="true"
                >${icon("chevron")}</span
              >
              <span class="hm-live" hidden></span>
            </a>`,
        )
        .join("")}
    </section>
    <section class="hm-recent" id="recent-section" hidden>
      <h2>最近使用</h2>
      <div id="recent-activity"></div>
    </section>
  </div>`;

  async function loadActivity() {
    const [picks, reviews, own, events] = await Promise.all([
      list("pick"),
      list("review"),
      list("recipe"),
      list("event"),
    ]);
    const activities = [
      ...picks.map((record) => ({
        title: `${record.payload.topic} → ${record.payload.result}`,
        at: record.updatedAt,
        emoji: "🎲",
        href: "#/picker",
      })),
      ...reviews.map((record) => ({
        title: `${record.payload.recipeName} · ${record.payload.rating} 星`,
        at: record.updatedAt,
        emoji: "🍳",
        href: "#/kitchen?tab=records",
      })),
      ...own.map((record) => ({
        title: `记录了 ${record.payload.name}`,
        at: record.updatedAt,
        emoji: "📷",
        href: `#/kitchen?tab=own&recipe=${encodeURIComponent(record.payload.id)}`,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 3);
    $("#recent-section", root).hidden = !activities.length;
    $("#recent-activity", root).innerHTML = activities
      .map(
        (item) =>
          /* HTML */ `<a href="${item.href}" class="hm-act"
            ><span class="hm-act-emoji">${item.emoji}</span>
            <strong>${esc(item.title)}</strong
            ><span>${dateLabel(item.at)}</span></a
          >`,
      )
      .join("");

    const now = new Date();
    const upcoming = events
      .map((record) => record.payload)
      .filter((event) => event.enabled)
      .map((event) => ({ event, at: nextOccurrence(event, now) }))
      .filter((item) => item.at)
      .sort((a, b) => a.at - b.at)[0];
    $('[data-text="calendar"]', root).textContent = upcoming
      ? `下一个 周${weekdayNames[upcoming.at.getDay()]} ${String(upcoming.at.getHours()).padStart(2, "0")}:${String(upcoming.at.getMinutes()).padStart(2, "0")} · ${relativeText(upcoming.at, now)}`
      : tiles[3].text;
  }
  function showTimer() {
    const status = timerState();
    const badge = $(".hm-timer .hm-live", root);
    badge.hidden = !status;
    badge.textContent =
      status === "ringing"
        ? "响铃中"
        : status === "paused"
          ? "已暂停"
          : "计时中";
    badge.dataset.status = status || "";
  }
  window.addEventListener(changeEvent, loadActivity);
  return {
    show() {
      $("#home-greeting", root).innerHTML = `${icon("sun")} ${greeting()}`;
      showTimer();
      loadActivity();
    },
  };
}
