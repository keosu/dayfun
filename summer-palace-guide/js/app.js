// 应用主控制器：状态、定位、讲解、线路、界面。
import { D, loadData } from "./data.js";
import { settings, setSetting } from "./store.js";
import { GuideMap } from "./map.js";
import { Narrator, splitSentences } from "./speech.js";
import {
  bearing, compass, distance, distanceToPolygon, distanceToSpot, formatDistance,
  gcj02ToWgs84, nearestGate, pickAutoSpot, pointInPolygon,
} from "./geo.js";
import { openSheet } from "./sheet.js";
import { ICONS, esc, $ } from "./ui.js";

const S = {
  mode: "manual", // auto 按位置自动 / manual 手动
  locStatus: "off", // off asking on denied error unsupported
  loc: null,
  inPark: null,
  spotId: null,
  autoSpot: null,
  routeId: null,
  routeIdx: 0,
  sim: false, // 正在用地图模拟位置
  simLoc: null,
  unlocked: false,
  lastSpoken: new Map(),
  watchId: null,
  detail: null,
  firstFix: true,
};

const narrator = new Narrator();
let gmap;
const darkQuery = matchMedia("(prefers-color-scheme: dark)");

const ENTRANCES = ["东宫门", "北宫门", "新建宫门", "南如意门"];
const ENTRANCE_SPOT = { 东宫门: "dong-gong-men", 北宫门: "bei-gong-men", 新建宫门: "xinjian-gong-men", 南如意门: "nan-ruyi-men" };

// ───────────── 小工具 ─────────────
let toastTimer = 0;
function toast(msg, ms = 3200) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

const spot = (id) => D.byId.get(id) || null;
const route = () => (S.routeId ? D.routeById.get(S.routeId) : null);
const routeStops = () => route()?.stops || null;
const userPt = () => (S.loc ? [S.loc.lat, S.loc.lon] : null);

function distText(s) {
  const p = userPt();
  if (!p) return "";
  const d = distanceToSpot(p, s);
  const near = S.loc && d <= s.radius + Math.min(S.loc.acc ?? 20, 40);
  if (near) return "你就在这里";
  const nearest = s.at.reduce((a, b) => (distance(p, a) < distance(p, b) ? a : b));
  return `${formatDistance(d)} · ${compass(bearing(p, nearest))}`;
}

// ───────────── 讲解 ─────────────
function speak(id, from = 0) {
  const s = spot(id);
  if (!s) return;
  if (!narrator.supported) {
    toast("这个浏览器不能朗读，可以直接看文字");
    return;
  }
  narrator.voiceName = settings.voice;
  narrator.rate = settings.rate;
  if (narrator._voices.length && !narrator.hasChineseVoice) {
    toast("没找到中文语音：可以先看文字，或在系统设置里安装中文语音", 5000);
  }
  S.lastSpoken.set(id, Date.now());
  narrator.play(id, s.narration, from);
}

function togglePlay(id) {
  S.unlocked = true;
  narrator.unlock();
  if (narrator.spotId === id && narrator.status === "playing") narrator.pause();
  else if (narrator.spotId === id && narrator.status === "paused") narrator.resume();
  else speak(id);
}

function maybeAutoSpeak(id) {
  if (!settings.autoSpeak || !S.unlocked || !narrator.supported) return;
  const last = S.lastSpoken.get(id);
  if (last && Date.now() - last < 10 * 60 * 1000) return; // 刚讲过的不重复
  speak(id);
}

function playState(id) {
  if (narrator.spotId !== id) return "idle";
  return narrator.status;
}

const PLAY_LABEL = { idle: [ICONS.play, "听讲解"], playing: [ICONS.pause, "暂停"], paused: [ICONS.play, "继续听"] };

// ───────────── 选择景点 ─────────────
function selectSpot(id, { auto = false, focus = true, speakNow = false } = {}) {
  const s = spot(id);
  if (!s) return;
  const changed = S.spotId !== id;
  S.spotId = id;
  gmap.setSelected(id);
  if (focus && changed) gmap.focus(s.at[0], 17, !S.firstFix);
  const r = route();
  if (r) {
    const i = r.stops.indexOf(id);
    if (i >= 0) S.routeIdx = i;
  }
  if (changed && narrator.status !== "idle" && narrator.spotId !== id) {
    // 换了景点，上一个景点的讲解就停掉
    narrator.stop();
  }
  if (!auto && S.mode === "auto" && !S.sim) {
    setMode("manual", { quiet: true });
    toast("已切到手动。点上面的“自动”，回到按位置讲解");
  }
  renderCard();
  renderStatus();
  if (speakNow && changed) maybeAutoSpeak(id);
  if (S.detail?.isOpen() && changed) renderDetail();
}

// ───────────── 定位 ─────────────
function setMode(mode, { quiet = false } = {}) {
  S.mode = mode;
  setSetting("lastMode", mode);
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (mode === "auto") {
    if (S.sim && S.simLoc) onLoc(S.simLoc);
    else startWatch();
  } else {
    stopWatch();
  }
  renderStatus();
  renderCard();
  if (!quiet && mode === "manual") toast("手动模式：点地图上的景点就能听讲解");
}

function startWatch() {
  if (S.watchId != null) return;
  if (!navigator.geolocation) {
    S.locStatus = "unsupported";
    setMode("manual", { quiet: true });
    toast("这个浏览器没有定位功能，已切到手动");
    return;
  }
  S.locStatus = "asking";
  renderStatus();
  S.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (S.sim) return;
      let lat = pos.coords.latitude;
      let lon = pos.coords.longitude;
      if (settings.coord === "gcj02") [lat, lon] = gcj02ToWgs84([lat, lon]);
      S.locStatus = "on";
      onLoc({ lat, lon, acc: pos.coords.accuracy });
    },
    (err) => {
      if (err.code === 1) {
        S.locStatus = "denied";
        stopWatch();
        setMode("manual", { quiet: true });
        toast("没有拿到定位权限，已切到手动。可以在浏览器设置里允许位置", 5500);
      } else {
        S.locStatus = "error";
        renderStatus();
      }
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 25000 },
  );
}

function stopWatch() {
  if (S.watchId != null) {
    navigator.geolocation.clearWatch(S.watchId);
    S.watchId = null;
  }
  if (!S.sim) {
    S.loc = null;
    S.locStatus = "off";
    gmap.setUser(null);
    S.inPark = null;
  }
}

function onLoc(loc) {
  S.loc = loc;
  const p = [loc.lat, loc.lon];
  S.inPark = pointInPolygon(p, D.boundary) || distanceToPolygon(p, D.boundary) < 40;
  gmap.setUser(loc);
  const first = S.firstFix;
  S.firstFix = false;
  if (S.mode === "auto") {
    // 门在园区边线附近，所以不要求“在园内”才识别景点
    const pick = (loc.acc ?? 0) <= 120 ? pickAutoSpot(loc, D.spots, { current: S.autoSpot, routeStops: routeStops() }) : null;
    if (pick) {
      const changed = pick.id !== S.autoSpot;
      S.autoSpot = pick.id;
      selectSpot(pick.id, { auto: true, focus: changed, speakNow: true });
      if (first) gmap.focus(p, 17, false);
    } else if (S.inPark) {
      S.autoSpot = null;
      if (first) gmap.focus(p, 17, false);
    } else {
      S.autoSpot = null;
      const g = nearestGate(p, D.spots);
      if (g && S.spotId !== g.id) selectSpot(g.id, { auto: true, focus: false });
      if (first) gmap.fitPark(false);
    }
  }
  renderCard();
  renderStatus();
}

function simulateAt(latlng) {
  S.simLoc = { lat: latlng[0], lon: latlng[1], acc: 8, sim: true };
  S.sim = true;
  S.locStatus = "on";
  if (S.watchId != null) {
    navigator.geolocation.clearWatch(S.watchId);
    S.watchId = null;
  }
  S.mode = "auto";
  setSetting("lastMode", "auto");
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === "auto")));
  onLoc(S.simLoc);
}

function stopSim() {
  S.sim = false;
  S.simLoc = null;
  S.loc = null;
  S.inPark = null;
  S.autoSpot = null;
  gmap.setUser(null);
  document.body.classList.remove("sim-picking");
  setMode("manual", { quiet: true });
  toast("已退出模拟位置");
}

// ───────────── 线路 ─────────────
function startRoute(id) {
  const r = D.routeById.get(id);
  if (!r) return;
  S.routeId = id;
  S.routeIdx = 0;
  gmap.showRoute(r, D.byId);
  gmap.fitRoute();
  selectSpot(r.stops[0], { auto: true, focus: false });
  renderCard();
  renderStatus();
}

function endRoute() {
  S.routeId = null;
  S.routeIdx = 0;
  gmap.showRoute(null);
  renderCard();
  renderStatus();
}

function stepRoute(d) {
  const r = route();
  if (!r) return;
  const i = Math.max(0, Math.min(r.stops.length - 1, S.routeIdx + d));
  S.routeIdx = i;
  S.unlocked = true;
  narrator.unlock();
  selectSpot(r.stops[i], { auto: true, speakNow: true });
  if (S.mode === "auto" && !S.sim) {
    // 手动点“下一站”，说明想先看看这一站，回到手动
    setMode("manual", { quiet: true });
  }
}

// ───────────── 渲染：顶部状态 ─────────────
function renderStatus() {
  const el = $("#status");
  let text = "";
  let tone = "";
  const r = route();
  if (S.sim) {
    text = `模拟位置中 · ${S.inPark ? "在园内" : "在园外"}`;
    tone = "sim";
  } else if (S.mode === "manual") {
    text = r ? `线路：${r.name}（${S.routeIdx + 1}/${r.stops.length}）` : "手动浏览 · 点地图上的景点听讲解";
  } else if (S.locStatus === "asking") {
    text = "正在获取你的位置…";
    tone = "wait";
  } else if (S.locStatus === "error") {
    text = "暂时没有定位信号，走到开阔处试试";
    tone = "warn";
  } else if (!S.loc) {
    text = "等待定位…";
    tone = "wait";
  } else if (S.autoSpot) {
    text = `你在「${spot(S.autoSpot).name}」附近`;
    tone = "ok";
  } else if (!S.inPark) {
    const g = nearestGate(userPt(), D.spots);
    text = g ? `你还没进园 · 最近的入口是${spot(g.id).name}，约${formatDistance(g.dist)}` : "你还没进园";
    tone = "info";
  } else if ((S.loc.acc ?? 0) > 120) {
    text = `定位不太准（误差约 ${Math.round(S.loc.acc)} 米），先看看地图吧`;
    tone = "warn";
  } else {
    let best = null;
    for (const s of D.spots) {
      const d = distanceToSpot(userPt(), s);
      if (!best || d < best.d) best = { s, d };
    }
    text = `在路上 · 最近的是「${best.s.name}」，约${formatDistance(best.d)}`;
    tone = "info";
  }
  el.textContent = text;
  el.dataset.tone = tone;
  const simBtn = $("#sim-exit");
  simBtn.hidden = !S.sim;
}

// ───────────── 渲染：底部卡片 ─────────────
function thumbHtml(s, cls = "thumb") {
  return s.thumb
    ? `<div class="${cls}"><img src="${esc(s.thumb)}" alt="" loading="lazy" decoding="async" /></div>`
    : `<div class="${cls} ph" aria-hidden="true"><span>${s.emoji}</span></div>`;
}

function renderCard() {
  const el = $("#card");
  const s = spot(S.spotId);
  const r = route();
  let html = "";
  if (r) {
    const next = r.stops[S.routeIdx + 1];
    const leg = r.legs[S.routeIdx];
    const nextText = next
      ? `下一站 ${esc(spot(next).name)}${leg ? ` · ${leg.mode === "boat" ? "乘船" : "步行"}约${leg.m >= 1000 ? (leg.m / 1000).toFixed(1) + "公里" : leg.m + "米"}` : ""}`
      : "这是最后一站，辛苦啦！";
    html += `<div class="route-strip">
      <button class="chip-btn" data-act="route-prev" aria-label="上一站" ${S.routeIdx <= 0 ? "disabled" : ""}>${ICONS.prev}</button>
      <div class="route-info"><b>${esc(r.name)}</b><span>${S.routeIdx + 1}/${r.stops.length} · ${nextText}</span></div>
      <button class="chip-btn" data-act="route-next" aria-label="下一站" ${S.routeIdx >= r.stops.length - 1 ? "disabled" : ""}>${ICONS.next}</button>
      <button class="chip-btn quiet" data-act="route-end" aria-label="结束线路">结束</button>
    </div>`;
  }
  if (!s) {
    html += `<div class="card-welcome">
      <div class="welcome-text"><b>欢迎来颐和园</b><span>开启自动定位，走到哪儿讲到哪儿；也可以直接点地图上的景点。</span></div>
      <div class="welcome-actions">
        <button class="btn primary" data-act="auto-on">${ICONS.locate}<span>开启自动导览</span></button>
        <button class="btn" data-act="open-routes">${ICONS.route}<span>看推荐线路</span></button>
      </div>
    </div>`;
  } else {
    const st = playState(s.id);
    const [icon, label] = PLAY_LABEL[st];
    const dist = distText(s);
    html += `<div class="card-row">
      <button class="card-main" data-act="open-detail" aria-label="查看${esc(s.name)}的详情">
        ${thumbHtml(s)}
        <span class="card-info">
          <span class="card-title"><span class="name">${esc(s.name)}</span>${s.classic ? '<span class="tag">经典</span>' : ""}</span>
          <span class="card-sum">${esc(s.summary)}</span>
          ${dist ? `<span class="card-dist">${esc(dist)}</span>` : ""}
        </span>
      </button>
      <button class="play-btn ${st}" data-act="play" aria-label="${label}${esc(s.name)}讲解">${icon}<span>${label}</span></button>
    </div>`;
  }
  el.innerHTML = html;
  el.classList.toggle("has-route", !!r);
  syncInsets();
}

function updatePlayButtons() {
  const s = spot(S.spotId);
  if (s) {
    const btn = $(".play-btn");
    if (btn) {
      const st = playState(s.id);
      const [icon, label] = PLAY_LABEL[st];
      btn.className = `play-btn ${st}`;
      btn.innerHTML = `${icon}<span>${label}</span>`;
      btn.setAttribute("aria-label", `${label}${s.name}讲解`);
    }
  }
  if (S.detail?.isOpen()) updateDetailPlayer();
}

function syncInsets() {
  const top = $("#top-stack").getBoundingClientRect().bottom + 6;
  const bottom = innerHeight - $("#card").getBoundingClientRect().top + 8;
  gmap?.setInsets(top, bottom);
  document.documentElement.style.setProperty("--card-h", `${Math.round(bottom)}px`);
}

// ───────────── 弹层：景点详情 ─────────────
function renderDetail() {
  const s = spot(S.spotId);
  if (!s) return;
  const sheet = S.detail;
  const r = route();
  const sentences = splitSentences(s.narration);
  const zone = D.zones[s.zone];
  const credit = s.credit
    ? `<p class="credit">📷 ${esc(s.credit.artist || "佚名")} · ${esc(s.credit.license)} · <a href="${esc(s.credit.page)}" target="_blank" rel="noopener">维基共享资源</a></p>`
    : "";
  const facts = s.facts.length
    ? `<dl class="facts">${s.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`
    : "";
  const dist = distText(s);
  sheet.body.innerHTML = `
    ${s.img ? `<figure class="hero"><img src="${esc(s.img)}" alt="${esc(s.name)}" decoding="async" /></figure>` : `<div class="hero ph"><span>${s.emoji}</span></div>`}
    ${credit}
    <div class="detail-head">
      <h3>${esc(s.name)}</h3>
      <div class="chips"><span class="chip">${zone.emoji} ${esc(zone.name)}</span>${s.classic ? '<span class="chip warm">经典景点</span>' : ""}${dist ? `<span class="chip">${esc(dist)}</span>` : ""}</div>
    </div>
    <div class="player" id="player"></div>
    <div class="narration" id="narration" lang="zh-CN">${sentences.map((t, i) => `<span class="sent" data-i="${i}">${esc(t)}</span>`).join("")}</div>
    ${facts}
    ${s.tip ? `<p class="tip">💡 ${esc(s.tip)}</p>` : ""}
    ${s.approx ? `<p class="tip muted">这个位置是根据地图推算的，现场请以指示牌为准。</p>` : ""}
    <div class="detail-actions">
      <button class="btn" data-act="locate-spot">${ICONS.pin}<span>在地图上看</span></button>
      ${r ? `<button class="btn" data-act="detail-next" ${S.routeIdx >= r.stops.length - 1 ? "disabled" : ""}>${ICONS.next}<span>下一站</span></button>` : ""}
    </div>`;
  sheet.body.scrollTop = 0;
  updateDetailPlayer();
  if (narrator.spotId === s.id && narrator.status !== "idle") highlightSentence(narrator.index, s.id); // 讲着讲着才打开详情
}

function updateDetailPlayer() {
  const s = spot(S.spotId);
  const p = $("#player", S.detail.el);
  if (!p || !s) return;
  const st = playState(s.id);
  const [icon, label] = PLAY_LABEL[st];
  const rates = [0.8, 1, 1.25, 1.5];
  p.innerHTML = `
    <button class="play-btn ${st}" data-act="play">${icon}<span>${label}</span></button>
    <button class="icon-btn" data-act="stop" aria-label="停止" ${st === "idle" ? "disabled" : ""}>${ICONS.stop}</button>
    <div class="rates" role="group" aria-label="语速">
      ${rates.map((x) => `<button class="rate ${settings.rate === x ? "on" : ""}" data-rate="${x}" aria-pressed="${settings.rate === x}">${x}×</button>`).join("")}
    </div>
    ${narrator.supported ? "" : '<p class="muted small">这个浏览器不支持朗读，可以直接看下面的文字。</p>'}`;
}

function highlightSentence(index, spotId) {
  if (!S.detail?.isOpen() || spotId !== S.spotId) return;
  const box = $("#narration", S.detail.el);
  if (!box) return;
  box.querySelectorAll(".sent.now").forEach((n) => n.classList.remove("now"));
  if (index >= 0) {
    const n = box.querySelector(`.sent[data-i="${index}"]`);
    if (n) {
      n.classList.add("now");
      const body = S.detail.body;
      const nr = n.getBoundingClientRect();
      const br = body.getBoundingClientRect();
      if (nr.bottom > br.bottom - 24 || nr.top < br.top + 60) {
        n.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }
}

function openDetail() {
  if (!S.spotId) return;
  if (S.detail?.isOpen()) return;
  S.detail = openSheet({ title: "景点详情", className: "detail", content: "", onClose: () => (S.detail = null) });
  renderDetail();
}

// ───────────── 弹层：景点列表 ─────────────
function openSpots() {
  const groups = Object.entries(D.zones)
    .map(([zid, z]) => {
      const items = D.spots.filter((s) => s.zone === zid);
      if (!items.length) return "";
      return `<h3 class="group">${z.emoji} ${esc(z.name)}</h3><ul class="list">${items
        .map((s) => {
          const d = userPt() ? formatDistance(distanceToSpot(userPt(), s)) : "";
          return `<li><button class="row ${s.id === S.spotId ? "on" : ""}" data-spot="${s.id}">${thumbHtml(s, "thumb sm")}<span class="row-main"><b>${esc(s.name)}${s.classic ? '<i class="tag">经典</i>' : ""}</b><small>${esc(s.summary)}</small></span>${d ? `<span class="row-side">${esc(d)}</span>` : ""}</button></li>`;
        })
        .join("")}</ul>`;
    })
    .join("");
  const sh = openSheet({ title: "全部景点", className: "list-sheet", content: `<div class="sheet-pad">${groups}</div>` });
  sh.el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-spot]");
    if (!b) return;
    sh.close();
    selectSpot(b.dataset.spot);
  });
}

// ───────────── 弹层：线路 ─────────────
function openRoutes() {
  let entrance = route()?.entrance || null;
  if (!entrance && userPt() && S.inPark === false) {
    const g = nearestGate(userPt(), D.spots);
    const name = g && spot(g.id).name;
    if (ENTRANCES.includes(name)) entrance = name;
  }
  entrance = entrance || ENTRANCES[0];
  const sh = openSheet({ title: "推荐线路", className: "routes-sheet", content: "" });
  const draw = () => {
    const list = D.routes.filter((r) => r.entrance === entrance);
    sh.body.innerHTML = `<div class="sheet-pad">
      <p class="muted small lead">选一个你进园的入口，看看从这里出发怎么逛。线路按公开的景区推荐和实际步行路网整理，时间仅供参考。</p>
      <div class="seg" role="tablist" aria-label="入口">${ENTRANCES.map((e) => `<button role="tab" class="seg-b ${e === entrance ? "on" : ""}" aria-selected="${e === entrance}" data-ent="${e}">${e}</button>`).join("")}</div>
      <ul class="route-list">${list
        .map((r) => {
          const stopsText = r.stops.map((id) => spot(id).name).join(" → ");
          const dist = `步行约 ${r.walkKm} 公里${r.boatKm ? `，乘船约 ${r.boatKm} 公里` : ""}`;
          return `<li class="route-card ${r.id === S.routeId ? "on" : ""}">
            <div class="rc-head"><b>${esc(r.name)}</b><span class="badge ${r.source === "official" ? "official" : ""}">${r.source === "official" ? "参考官方推荐" : "本应用推荐"}</span></div>
            <p class="rc-sum">${esc(r.summary)}</p>
            <p class="rc-meta">${esc(r.hours)} · ${esc(dist)} · ${r.stops.length} 站</p>
            <p class="rc-stops">${esc(stopsText)}</p>
            ${r.note ? `<p class="rc-note">${esc(r.note)}</p>` : ""}
            <button class="btn primary" data-route="${r.id}">${r.id === S.routeId ? "回到这条线路" : "开始这条线路"}</button>
          </li>`;
        })
        .join("")}</ul>
    </div>`;
  };
  draw();
  sh.el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ent]");
    if (t) {
      entrance = t.dataset.ent;
      draw();
      return;
    }
    const b = e.target.closest("[data-route]");
    if (b) {
      S.unlocked = true;
      narrator.unlock();
      sh.close();
      startRoute(b.dataset.route);
    }
  });
}

// ───────────── 弹层：设置 ─────────────
let deferredInstall = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
});

function openSettings() {
  const sh = openSheet({ title: "设置", className: "settings-sheet", content: "" });
  const draw = () => {
    const voices = narrator.voices;
    const credits = D.spots.filter((s) => s.credit);
    const swState = navigator.serviceWorker?.controller ? "已就绪，没有网络也能用" : "尚未启用（刷新一次后启用）";
    sh.body.innerHTML = `<div class="sheet-pad settings">
      <section>
        <h3>讲解</h3>
        <label class="switch-row"><span><b>走到景点自动讲解</b><small>自动模式下，到了景点就开始读</small></span><input type="checkbox" role="switch" id="set-autospeak" ${settings.autoSpeak ? "checked" : ""} /></label>
        <div class="field"><span class="lbl">语速</span><div class="seg">${[0.8, 1, 1.25, 1.5].map((x) => `<button class="seg-b ${settings.rate === x ? "on" : ""}" data-rate="${x}" aria-pressed="${settings.rate === x}">${x}×</button>`).join("")}</div></div>
        <div class="field"><label class="lbl" for="set-voice">声音</label>
          <select id="set-voice"><option value="">自动选择中文声音</option>${voices.map((v) => `<option value="${esc(v.name)}" ${settings.voice === v.name ? "selected" : ""}>${esc(v.name)}（${esc(v.lang)}）</option>`).join("")}</select>
        </div>
        ${!narrator.supported ? '<p class="muted small">这个浏览器不支持朗读。</p>' : !voices.length ? '<p class="muted small">还没有发现中文声音；手机上通常在系统“辅助功能/文字转语音”里安装。</p>' : ""}
      </section>
      <section>
        <h3>地图</h3>
        <div class="seg">
          <button class="seg-b ${settings.basemap === "vector" ? "on" : ""}" data-basemap="vector" aria-pressed="${settings.basemap === "vector"}">离线简图</button>
          <button class="seg-b ${settings.basemap === "tiles" ? "on" : ""}" data-basemap="tiles" aria-pressed="${settings.basemap === "tiles"}">在线街道图</button>
        </div>
        <p class="muted small">离线简图由 OpenStreetMap 数据绘制，不用网络，也没有额外流量。在线街道图来自 OpenStreetMap 官方图块，需要联网。</p>
      </section>
      <section>
        <h3>定位</h3>
        <div class="field"><span class="lbl">设备坐标</span><div class="seg">
          <button class="seg-b ${settings.coord === "wgs84" ? "on" : ""}" data-coord="wgs84" aria-pressed="${settings.coord === "wgs84"}">GPS（默认）</button>
          <button class="seg-b ${settings.coord === "gcj02" ? "on" : ""}" data-coord="gcj02" aria-pressed="${settings.coord === "gcj02"}">国内偏移坐标</button></div></div>
        <p class="muted small">如果你的蓝点总和实际位置差几百米，可以试试换成另一个。</p>
        ${S.sim ? `<button class="btn" data-act="sim-exit">退出模拟位置</button>` : `<button class="btn" data-act="sim-start">${ICONS.pin}<span>在地图上模拟我的位置</span></button>`}
        <p class="muted small">没到颐和园也想试试？点一下地图，就当作你在那里。</p>
      </section>
      <section>
        <h3>安装与离线</h3>
        <p class="muted small">离线缓存：${esc(swState)}。</p>
        ${deferredInstall ? `<button class="btn" data-act="install">安装到手机</button>` : '<p class="muted small">iPhone：用 Safari 点“分享”→“添加到主屏幕”。安卓 Chrome：菜单里选“安装应用”。</p>'}
      </section>
      <section>
        <h3>说明与来源</h3>
        <p class="small">开放时间、票价、临时闭馆、船票，都以<b>颐和园官方公告</b>为准。本应用的讲解词和线路是整理改写的参考，不是官方内容。</p>
        <p class="small">地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap 贡献者</a>（ODbL）。</p>
        <details class="credits"><summary>照片来源（共 ${credits.length} 张，来自维基共享资源）</summary>
          <ul>${credits.map((s) => `<li>${esc(s.name)}：${esc(s.credit.artist || "佚名")}，${esc(s.credit.license)}，<a href="${esc(s.credit.page)}" target="_blank" rel="noopener">原图页面</a></li>`).join("")}</ul>
        </details>
      </section>
    </div>`;
  };
  draw();
  const offVoices = () => narrator.removeEventListener("voices", draw);
  narrator.addEventListener("voices", draw);
  sh.el.addEventListener("change", (e) => {
    if (e.target.id === "set-autospeak") setSetting("autoSpeak", e.target.checked);
    if (e.target.id === "set-voice") setSetting("voice", e.target.value);
  });
  sh.el.addEventListener("click", (e) => {
    const t = e.target;
    const rate = t.closest("[data-rate]");
    const bm = t.closest("[data-basemap]");
    const co = t.closest("[data-coord]");
    const act = t.closest("[data-act]")?.dataset.act;
    if (rate) {
      applyRate(Number(rate.dataset.rate));
      draw();
    } else if (bm) {
      setSetting("basemap", bm.dataset.basemap);
      gmap.setBasemap(settings.basemap);
      draw();
    } else if (co) {
      setSetting("coord", co.dataset.coord);
      draw();
    } else if (act === "sim-start") {
      sh.close();
      document.body.classList.add("sim-picking");
      toast("点一下地图，就当作你在那里", 4500);
    } else if (act === "sim-exit") {
      sh.close();
      stopSim();
    } else if (act === "install" && deferredInstall) {
      deferredInstall.prompt();
      deferredInstall = null;
      draw();
    }
  });
  const obs = new MutationObserver(() => {
    if (!sh.isOpen()) {
      offVoices();
      obs.disconnect();
    }
  });
  obs.observe(document.getElementById("sheet-root"), { childList: true });
}

function applyRate(x) {
  setSetting("rate", x);
  narrator.setRate(x);
  if (S.detail?.isOpen()) updateDetailPlayer();
}

// ───────────── 事件 ─────────────
function bind() {
  // 任何一次用户手势都顺手解锁语音（iOS 需要）
  addEventListener("pointerdown", () => {
    if (!S.unlocked) {
      S.unlocked = true;
      narrator.unlock();
    }
  }, { once: true, capture: true });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-mode]");
    if (!t) return;
    if (t.dataset.mode) {
      if (t.dataset.mode === S.mode) return;
      S.unlocked = true;
      narrator.unlock();
      if (t.dataset.mode === "auto" && S.sim) {
        setMode("auto");
      } else {
        if (S.sim && t.dataset.mode === "manual") {
          S.mode = "manual";
          document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === "manual")));
          renderStatus();
          return;
        }
        setMode(t.dataset.mode);
      }
      return;
    }
    switch (t.dataset.act) {
      case "open-routes": return openRoutes();
      case "open-spots": return openSpots();
      case "open-settings": return openSettings();
      case "open-detail": return openDetail();
      case "play": return S.spotId && togglePlay(S.spotId);
      case "stop": return narrator.stop();
      case "auto-on": return setMode("auto");
      case "route-prev": return stepRoute(-1);
      case "route-next": return stepRoute(1);
      case "route-end": return endRoute();
      case "detail-next": return stepRoute(1);
      case "locate-spot": {
        S.detail?.close();
        const s = spot(S.spotId);
        if (s) gmap.focus(s.at[0], 17.5, true);
        return;
      }
      case "sim-exit": return stopSim();
      case "zoom-in": return gmap.zoomBy(0.5);
      case "zoom-out": return gmap.zoomBy(-0.5);
      case "fit-park": return gmap.fitPark(true);
      case "locate-me": {
        if (S.loc) gmap.focus([S.loc.lat, S.loc.lon], 17, true);
        else if (S.mode === "manual") setMode("auto");
        else toast("还没有拿到位置");
        return;
      }
      default:
    }
  });

  document.addEventListener("click", (e) => {
    const rate = e.target.closest("#player [data-rate]");
    if (rate) applyRate(Number(rate.dataset.rate));
  });

  narrator.addEventListener("status", updatePlayButtons);
  narrator.addEventListener("sentence", (e) => highlightSentence(e.detail.index, e.detail.spotId));
  narrator.addEventListener("ended", updatePlayButtons);
  narrator.addEventListener("error", (e) => {
    updatePlayButtons();
    if (e.detail.reason === "unsupported") toast("这个浏览器不能朗读，可以直接看文字");
    else if (e.detail.reason === "not-allowed") toast("浏览器拦住了自动朗读，点一下“听讲解”就好");
    else toast("朗读出了点问题，可以先看文字");
  });

  darkQuery.addEventListener("change", applyTheme);
  addEventListener("resize", () => {
    syncInsets();
    gmap.invalidate();
  });
  new ResizeObserver(syncInsets).observe($("#card"));
  new ResizeObserver(syncInsets).observe($("#top-stack"));
  document.addEventListener("visibilitychange", () => {
    // 回到前台时，如果在自动模式，确保还在监听
    if (!document.hidden && S.mode === "auto" && !S.sim && S.watchId == null) startWatch();
  });
}

function applyTheme() {
  gmap.drawBase(D.map, darkQuery.matches);
  gmap.setBasemap(settings.basemap);
  const r = route();
  if (r) gmap.showRoute(r, D.byId);
  gmap.setSelected(S.spotId);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", darkQuery.matches ? "#14120f" : "#f6f0e4");
}

// ───────────── 启动 ─────────────
async function boot() {
  try {
    await loadData();
  } catch (err) {
    $("#boot").innerHTML = `<p>地图数据没有载入成功。<br><small>${esc(err.message)}</small></p><button class="btn primary" onclick="location.reload()">重试</button>`;
    return;
  }
  gmap = new GuideMap($("#map"), {
    onSelect: (id) => selectSpot(id),
    onMapClick: (ll) => {
      if (document.body.classList.contains("sim-picking")) simulateAt(ll);
    },
  });
  gmap.drawBase(D.map, darkQuery.matches);
  gmap.setSpots(D.spots);
  gmap.setBasemap(settings.basemap);
  syncInsets();
  gmap.fitPark(false);
  bind();
  narrator.rate = settings.rate;
  renderCard();
  renderStatus();
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode)));
  $("#boot").remove();
  document.body.classList.add("ready");
  if (settings.lastMode === "auto") setMode("auto", { quiet: true });
  // 暴露给测试用
  window.__app = { S, D, narrator, gmap, selectSpot, startRoute, setMode, simulateAt };
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

boot();
