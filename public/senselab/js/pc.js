// 电脑端监视器：以“游戏”的身份连上中继，显示每个手柄的状态，并用一个小球场地演示怎么用这些数据。

import { LABELS } from "./gestures.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const pin = params.get("pin") || "";
const room = params.get("room") || "default";
const COLORS = [
  "#ed8179",
  "#8b78c3",
  "#de8755",
  "#82aa95",
  "#5b9bd5",
  "#d4a017",
  "#c46ba5",
  "#6aa84f",
];

const players = new Map(); // p → { name, tx, ty, sx, sy, roll, pitch, keys:Set, last, ball }
let ws = null;
let retry = 0;

// ---------- 连接 ----------
function setConn(text, state) {
  const el = $("#conn");
  el.textContent = text;
  el.dataset.state = state;
}

function connect() {
  // 监视器只能由局域网服务打开（需要 /ws 和 /api/info）；在 GitHub Pages 上没有意义
  if (!location.port) {
    setConn("请在电脑上运行 npm start，然后打开 pc.html", "closed");
    return;
  }
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams({ role: "game", room });
  if (pin) q.set("pin", pin);
  setConn("连接中…", "connecting");
  ws = new WebSocket(`${scheme}://${location.host}/ws?${q}`);
  ws.onopen = () => {
    retry = 0;
    setConn("已连接，等待手柄", "open");
  };
  ws.onmessage = (e) => {
    try {
      handle(JSON.parse(e.data));
    } catch {
      // 忽略坏消息
    }
  };
  ws.onclose = () => {
    setConn("断开了，正在重连…", "closed");
    setTimeout(connect, Math.min(4000, 400 * 2 ** retry++));
  };
}

function ensure(p) {
  if (!players.has(p)) {
    players.set(p, {
      p,
      name: `玩家${p}`,
      tx: 0,
      ty: 0,
      sx: 0,
      sy: 0,
      roll: 0,
      pitch: 0,
      keys: new Set(),
      last: "",
      ball: { x: 0.5, y: 0.5, vx: 0, vy: 0, z: 0, vz: 0, spin: 0, squash: 0 },
    });
  }
  return players.get(p);
}

function handle(m) {
  if (m.t === "players") {
    const alive = new Set(m.list.map((x) => x.p));
    for (const x of m.list) ensure(x.p).name = x.name;
    for (const p of [...players.keys()]) if (!alive.has(p)) players.delete(p);
    setConn(
      m.list.length ? `${m.list.length} 个手柄在线` : "已连接，等待手柄",
      "open",
    );
    renderPlayers();
    return;
  }
  if (m.t === "left") {
    players.delete(m.p);
    renderPlayers();
    return;
  }
  if (m.p == null) return;
  const pl = ensure(m.p);
  if (m.t === "state") {
    Object.assign(pl, {
      tx: m.tx,
      ty: m.ty,
      sx: m.sx,
      sy: m.sy,
      roll: m.roll,
      pitch: m.pitch,
    });
  } else if (m.t === "btn") {
    if (m.down) pl.keys.add(m.id);
    else pl.keys.delete(m.id);
    if (m.down && m.id === "A" && pl.ball.z === 0) pl.ball.vz = 2.2;
    if (m.down && m.id === "B") pl.ball.spin += Math.PI * 2;
  } else if (m.t === "gesture") {
    onGesture(pl, m);
  }
}

// ---------- 动作 → 小球 ----------
const DASH = {
  "flick-left": [-1.8, 0],
  "flick-right": [1.8, 0],
  "flick-forward": [0, -1.8],
  "flick-back": [0, 1.8],
  "swing-left": [-0.9, 0],
  "swing-right": [0.9, 0],
  push: [0, -0.9],
  pull: [0, 0.9],
};

function onGesture(pl, m) {
  const b = pl.ball;
  const label = LABELS[m.name] || { emoji: "✨", text: m.name };
  pl.last = `${label.emoji} ${label.text}`;
  const li = document.createElement("li");
  const when = new Date().toLocaleTimeString([], { hour12: false });
  li.textContent = `P${pl.p} ${label.emoji} ${label.text}`;
  const small = document.createElement("small");
  small.textContent = `  ${m.power ? "力度 " + m.power + " · " : ""}${when}`;
  li.append(small);
  const log = $("#log");
  log.prepend(li);
  while (log.children.length > 40) log.lastChild.remove();

  if (DASH[m.name]) {
    b.vx += DASH[m.name][0];
    b.vy += DASH[m.name][1];
  } else if (m.name === "lift") b.vz = 2.6;
  else if (m.name === "drop") b.squash = 1;
  else if (m.name.startsWith("shake"))
    Object.assign(b, { x: 0.5, y: 0.5, vx: 0, vy: 0 });
  else if (m.name.startsWith("flip") || m.name.startsWith("twist"))
    b.spin += Math.PI * 4;
}

// ---------- 右侧面板 ----------
let lastRender = 0;
function renderPlayers(force) {
  const now = performance.now();
  if (!force && now - lastRender < 100) return;
  lastRender = now;
  const box = $("#players");
  if (!players.size) {
    box.innerHTML = `<strong>手柄</strong><span class="empty">还没有手柄连上来。</span>`;
    return;
  }
  box.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "手柄";
  box.append(title);
  for (const pl of [...players.values()].sort((a, b) => a.p - b.p)) {
    const row = document.createElement("div");
    row.className = "player";
    const dot = document.createElement("div");
    dot.className = "player-dot";
    dot.style.background = COLORS[(pl.p - 1) % COLORS.length];
    dot.textContent = `P${pl.p}`;
    const main = document.createElement("div");
    main.className = "player-main";
    const name = document.createElement("strong");
    name.textContent = pl.name;
    const info = document.createElement("small");
    info.textContent = `倾斜 ${pl.tx.toFixed(2)}, ${pl.ty.toFixed(2)} · 摇杆 ${pl.sx.toFixed(2)}, ${pl.sy.toFixed(2)}${pl.last ? " · " + pl.last : ""}`;
    main.append(name, info);
    const keys = document.createElement("div");
    keys.className = "keys";
    for (const k of ["A", "B", "X", "Y"]) {
      const i = document.createElement("i");
      i.textContent = k;
      if (pl.keys.has(k)) i.className = "on";
      keys.append(i);
    }
    row.append(dot, main, keys);
    box.append(row);
  }
}

// ---------- 场地 ----------
const canvas = $("#arena");
const ctx = canvas.getContext("2d");
let W = 0;
let H = 0;
function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  W = r.width;
  H = r.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(canvas);

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, W, H);
  // 网格
  ctx.strokeStyle = css.getPropertyValue("--line").trim() || "#ddd";
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo((W * i) / 10, 0);
    ctx.lineTo((W * i) / 10, H);
    ctx.moveTo(0, (H * i) / 8);
    ctx.lineTo(W, (H * i) / 8);
    ctx.stroke();
  }
  if (!players.size) {
    ctx.fillStyle = css.getPropertyValue("--muted").trim() || "#888";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("等手机连上来，这里会出现你的小球 🎮", W / 2, H / 2);
  }
  const R = Math.max(16, Math.min(W, H) * 0.045);
  for (const pl of players.values()) {
    const b = pl.ball;
    const tx = pl.tx + pl.sx;
    const ty = pl.ty + pl.sy; // 前、上为正：屏幕上方
    b.vx += (tx * 0.9 - b.vx) * Math.min(1, dt * 4);
    b.vy += (-ty * 0.9 - b.vy) * Math.min(1, dt * 4);
    b.x += b.vx * dt;
    b.y += b.vy * dt * (W / H);
    if (b.x < 0.02 || b.x > 0.98) {
      b.x = Math.min(0.98, Math.max(0.02, b.x));
      b.vx *= -0.5;
    }
    if (b.y < 0.03 || b.y > 0.97) {
      b.y = Math.min(0.97, Math.max(0.03, b.y));
      b.vy *= -0.5;
    }
    if (b.z > 0 || b.vz > 0) {
      b.vz -= 7 * dt;
      b.z += b.vz * dt;
      if (b.z <= 0) {
        b.z = 0;
        b.vz = 0;
        b.squash = 0.5;
      }
    }
    b.squash = Math.max(0, b.squash - dt * 3);
    b.spin *= Math.pow(0.02, dt);

    const color = COLORS[(pl.p - 1) % COLORS.length];
    const cx = b.x * W;
    const cy = b.y * H;
    const lift = b.z * R * 1.4;
    // 影子
    ctx.fillStyle = "#0002";
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy + R * 0.9,
      R * (1 - b.z * 0.15),
      R * 0.35,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // 球
    const sq = 1 + b.squash * 0.35;
    ctx.save();
    ctx.translate(cx, cy - lift);
    ctx.scale(sq, 1 / sq);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(b.spin);
    ctx.fillStyle = "#ffffffcc";
    ctx.beginPath();
    ctx.arc(R * 0.45, 0, R * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = css.getPropertyValue("--ink").trim() || "#222";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`P${pl.p}`, cx, cy + R * 1.9);
  }
  renderPlayers();
  requestAnimationFrame(frame);
}

// ---------- 其他 ----------
$("#rumble").addEventListener("click", () => {
  if (ws?.readyState === 1)
    ws.send(JSON.stringify({ t: "rumble", pattern: [80, 60, 80] }));
});

fetch("api/info")
  .then((r) => r.json())
  .then((info) => {
    const box = $("#urls");
    const q = info.pinRequired && pin ? `?pin=${encodeURIComponent(pin)}` : "";
    for (const ip of info.ips) {
      const line = document.createElement("div");
      line.textContent = `https://${ip}:${info.httpsPort}/${q}`;
      box.append(line);
    }
    const note = document.createElement("small");
    note.textContent = info.pinRequired
      ? "需要口令：在手机上打开时带上 ?pin=口令"
      : "手机和电脑要在同一个 Wi-Fi。第一次会提示证书不受信任，选继续即可。";
    box.append(note);
  })
  .catch(() => {});

renderPlayers(true);
resize();
connect();
requestAnimationFrame(frame);
