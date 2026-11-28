// 弹层：手机上是底部抽屉，电脑上是居中卡片。
// 弹层自己做滚动容器、标题吸顶（避免旧版 iOS WebKit 把内容压成一行）。
// 打开时会往历史记录里压一条，安卓“返回键”先关弹层、而不是退出应用。

const stack = [];

function closeEntry(entry) {
  if (entry.closed) return;
  entry.closed = true;
  const i = stack.indexOf(entry);
  if (i >= 0) stack.splice(i, 1);
  entry.sheet.classList.remove("in");
  entry.back.classList.remove("in");
  setTimeout(() => entry.back.remove(), 240);
  entry.onClose?.();
}

function requestClose(entry) {
  if (entry.closed) return;
  if (stack[stack.length - 1] === entry && entry.pushed) {
    history.back(); // popstate 里真正关闭
  } else {
    closeEntry(entry);
  }
}

window.addEventListener("popstate", () => {
  const top = stack[stack.length - 1];
  if (top) closeEntry(top);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) requestClose(stack[stack.length - 1]);
});

export function openSheet({ title, className = "", content, onClose }) {
  const root = document.getElementById("sheet-root");
  const back = document.createElement("div");
  back.className = "sheet-back";
  const sheet = document.createElement("section");
  sheet.className = `sheet ${className}`;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", title);
  sheet.innerHTML = `<header class="sheet-head"><h2></h2><button class="icon-btn sheet-close" aria-label="关闭">✕</button></header><div class="sheet-body"></div>`;
  sheet.querySelector("h2").textContent = title;
  const body = sheet.querySelector(".sheet-body");
  if (typeof content === "string") body.innerHTML = content;
  else if (content) body.append(content);
  back.append(sheet);
  root.append(back);

  let pushed = false;
  try {
    history.pushState({ spgSheet: true }, "");
    pushed = true;
  } catch {
    /* 忽略 */
  }
  const entry = { back, sheet, onClose, closed: false, pushed };
  stack.push(entry);
  back.addEventListener("click", (e) => {
    if (e.target === back) requestClose(entry);
  });
  sheet.querySelector(".sheet-close").addEventListener("click", () => requestClose(entry));
  requestAnimationFrame(() => {
    back.classList.add("in");
    sheet.classList.add("in");
  });
  sheet.querySelector(".sheet-close").focus({ preventScroll: true });
  return { el: sheet, body, close: () => requestClose(entry), isOpen: () => !entry.closed };
}

export function hasOpenSheet() {
  return stack.length > 0;
}

export function closeAllSheets() {
  for (const e of [...stack]) closeEntry(e);
}
