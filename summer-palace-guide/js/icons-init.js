import { ICONS } from "./ui.js";

// 把 index.html 里的 data-ic 占位换成内联 SVG
document.querySelectorAll("[data-ic]").forEach((el) => {
  el.innerHTML = ICONS[el.dataset.ic] || "";
});
