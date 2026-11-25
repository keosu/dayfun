import { $, escapeHTML as esc, dateLabel, asset } from "./ui.js";
import { icon } from "./icons.js";
import { list, changeEvent } from "./storage.js";

const greeting = () => {
  const hours = new Date().getHours();
  return hours < 11 ? "早上好" : hours < 18 ? "下午好" : "晚上好";
};

export function mount(root) {
  root.innerHTML = /* HTML */ ` <section class="home-hero launcher-hero">
      <div class="hero-copy">
        <span class="greeting" id="home-greeting"></span>
        <h1>让日常，好玩一点<span class="coral-word">.</span></h1>
        <p>选个小工具，给生活一点灵感。</p>
      </div>
      <div class="launcher-sun" aria-hidden="true">
        <span>˘ ˘</span><span>◡</span>
      </div>
    </section>
    <section class="tools-section">
      <div class="section-heading"><h2>我的工具</h2></div>
      <div class="tool-grid launcher-grid">
        <a class="tool-card picker-card" href="#/picker"
          ><div class="tool-content">
            <span class="app-category">${icon("shuffle")} 一点小运气</span>
            <h3>随心选</h3>
            <p>吃什么、去哪玩、轮到谁，<br />让好运帮你决定。</p>
            <div class="feature-pills">
              <span>转盘</span><span>扭蛋</span><span>顶骰子</span>
            </div>
            <span class="enter-app">开始选择 ${icon("arrow")}</span>
          </div>
          <div class="card-wheel-art" aria-hidden="true">
            <div class="mini-pointer"></div>
            <div class="mini-wheel">
              <span class="wheel-emoji emoji-one">🍜</span
              ><span class="wheel-emoji emoji-two">🎮</span
              ><span class="wheel-emoji emoji-three">🏕️</span
              ><span class="wheel-emoji emoji-four">🍕</span>
              <div class="mini-hub">GO</div>
            </div>
          </div></a
        >
        <a class="tool-card kitchen-card" href="#/kitchen"
          ><div class="tool-content">
            <span class="app-category">${icon("bowl")} 好好吃饭</span>
            <h3>今天吃什么</h3>
            <p>找道经典好菜，<br />记住自己的拿手味道。</p>
            <div class="feature-pills">
              <span>菜谱</span><span>拍照</span><span>点菜</span>
            </div>
            <span class="enter-app">进入厨房 ${icon("arrow")}</span>
          </div>
          <div class="card-food-art" aria-hidden="true">
            <img
              src="${asset("/images/home-food.jpg")}"
              alt=""
              class="hero-food"
            /></div
        ></a>
      </div>
    </section>
    <section class="launcher-recent" id="recent-section" hidden>
      <div class="section-heading"><h2>最近使用</h2></div>
      <div id="recent-activity"></div>
    </section>`;

  async function loadActivity() {
    const [picks, reviews, own] = await Promise.all([
      list("pick"),
      list("review"),
      list("recipe"),
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
          /* HTML */ `<a href="${item.href}" class="activity"
            ><span class="activity-emoji">${item.emoji}</span>
            <div>
              <strong>${esc(item.title)}</strong
              ><span>${dateLabel(item.at)}</span>
            </div>
            ${icon("chevron")}</a
          >`,
      )
      .join("");
  }
  window.addEventListener(changeEvent, loadActivity);
  return {
    show() {
      $("#home-greeting", root).innerHTML = `${icon("sun")} ${greeting()}`;
      loadActivity();
    },
  };
}
