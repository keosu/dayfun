// 小工具：本地存储、提示、弹层、震动。

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 由 HTML 字符串创建单个元素（只用于写死的模板，动态文字一律用 textContent）。 */
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`senselab.${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`senselab.${key}`, JSON.stringify(value));
    } catch {
      // 隐私模式下可能写不进去，忽略
    }
  },
};

export const isIOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone =
  window.matchMedia?.("(display-mode: standalone)").matches ||
  window.matchMedia?.("(display-mode: fullscreen)").matches ||
  navigator.standalone === true;

let toastTimer = 0;
export function toast(message, ms = 2400) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/** 震动：安卓可用；iOS Safari 没有 navigator.vibrate，返回 false。 */
export function vibrate(pattern) {
  try {
    return typeof navigator.vibrate === "function"
      ? navigator.vibrate(pattern)
      : false;
  } catch {
    return false;
  }
}

/**
 * 弹层：手机是底部抽屉，电脑是居中卡片。
 * 弹层自己做滚动容器，标题栏吸顶，关闭按钮始终可点。
 */
export function openSheet({ title, build, onClose }) {
  const root = $("#sheet-root");
  const backdrop = h(`<div class="backdrop"></div>`);
  const sheet = h(`
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head">
        <h2></h2>
        <button class="icon-btn" aria-label="关闭">✕</button>
      </div>
      <div class="sheet-body"></div>
    </div>`);
  $("h2", sheet).textContent = title;
  const body = $(".sheet-body", sheet);
  let closed = false;
  let cleanup;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
    }, 220);
    document.removeEventListener("keydown", onKey);
    cleanup?.();
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", close);
  $("button", sheet).addEventListener("click", close);
  cleanup = build(body, close);
  root.append(backdrop, sheet);
  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    sheet.classList.add("open");
  });
  return { close, body };
}

/** 一行“标签 + 控件”的设置项 */
export function field(label, control, hint) {
  const row = h(
    `<label class="field"><span class="field-label"></span></label>`,
  );
  $(".field-label", row).textContent = label;
  row.append(control);
  if (hint) {
    const p = h(`<small class="field-hint"></small>`);
    p.textContent = hint;
    row.append(p);
  }
  return row;
}

/** 一组互斥的胶囊按钮（点选，不用横向拖动） */
export function segmented(options, value, onChange) {
  const wrap = h(`<div class="seg"></div>`);
  const buttons = options.map(([val, text]) => {
    const b = h(`<button type="button"></button>`);
    b.textContent = text;
    b.addEventListener("click", () => {
      set(val);
      onChange(val);
    });
    wrap.append(b);
    return [val, b];
  });
  function set(v) {
    for (const [val, b] of buttons) b.classList.toggle("on", val === v);
  }
  set(value);
  return wrap;
}

export function switchEl(checked, onChange) {
  const el = h(
    `<button type="button" class="switch" role="switch"><i></i></button>`,
  );
  const set = (v) => {
    el.classList.toggle("on", v);
    el.setAttribute("aria-checked", String(v));
  };
  set(checked);
  el.addEventListener("click", () => {
    const v = !el.classList.contains("on");
    set(v);
    onChange(v);
  });
  return el;
}
