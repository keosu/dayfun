import {
  h,
  $,
  $$,
  openSheet,
  field,
  segmented,
  switchEl,
  toast,
  vibrate,
} from "../ui.js";
import { motion } from "../motion.js";
import { link, defaultServer } from "../link.js";
import { LABELS } from "../gestures.js";

const BUTTONS = [
  ["Y", "mint"],
  ["X", "orange"],
  ["B", "purple"],
  ["A", "coral"],
];

export default {
  mount(root) {
    root.innerHTML = `
      <div class="pad">
        <div class="pad-center">
          <p class="pad-status" id="pStatus"></p>
          <div class="g-banner compact" id="pBanner">
            <span class="g-emoji">🎮</span>
            <strong class="g-text">做个动作试试</strong>
          </div>
          <div class="bubble" id="pBubble" aria-hidden="true"><i class="cross"></i><i class="dot"></i></div>
          <p class="b-read" id="pRead"></p>
        </div>
        <div class="stick-zone">
          <div class="stick-base" id="stick"><i class="stick-knob"></i></div>
        </div>
        <div class="btn-zone" id="btns"></div>
        <div class="pad-start" id="pStart">
          <div class="pad-start-card">
            <span class="start-emoji">🎮</span>
            <strong>体感手柄</strong>
            <small id="pTarget"></small>
            <button class="btn primary big" id="pGo">连接并开始</button>
            <small class="hint" id="pHint"></small>
          </div>
        </div>
      </div>`;

    const status = $("#pStatus", root);
    const banner = $("#pBanner", root);
    const startEl = $("#pStart", root);
    const goBtn = $("#pGo", root);
    const bubble = $("#pBubble", root);
    const dot = $(".dot", bubble);
    const read = $("#pRead", root);

    let started = false;
    let wakeLock = null;
    const pressed = new Set();
    const stick = { x: 0, y: 0 };

    // ---------- 状态 ----------
    function targetText() {
      const s = link.settings;
      return s.server
        ? `电脑：${s.server} · 房间 ${s.room}`
        : "还没有填电脑地址，点右上角 ⚙️ 设置";
    }
    function paintStatus() {
      $("#pTarget", root).textContent = targetText();
      let text;
      if (!started) text = "未连接";
      else if (link.status === "open")
        text = `P${link.player ?? "?"} 已连接 · 延迟 ${link.rtt ?? "—"} ms`;
      else if (link.status === "connecting") text = "连接中…";
      else text = "断开了，正在重连…";
      if (started && motion.state !== "running")
        text += ` · 传感器：${motion.state === "asking" ? "等待允许" : "未启动"}`;
      status.textContent = text;
      status.dataset.state = started ? link.status : "closed";
      startEl.hidden = started;
      const hint = $("#pHint", root);
      hint.textContent = "";
      if (!started && !window.isSecureContext)
        hint.textContent =
          "当前不是 HTTPS，传感器不可用。请用电脑上显示的 https 地址打开。";
    }
    link.on("status", paintStatus);
    link.on(
      "message",
      (m) => (m.t === "welcome" || m.t === "pong") && paintStatus(),
    );
    motion.on("state", paintStatus);

    // ---------- 按钮 ----------
    const btns = $("#btns", root);
    for (const [id, tone] of BUTTONS) {
      const b = h(
        `<button type="button" class="pad-btn ${tone}" data-b="${id}"></button>`,
      );
      b.textContent = id;
      btns.append(b);
    }
    function pressButton(id, down) {
      if (down) pressed.add(id);
      else pressed.delete(id);
      link.send({ t: "btn", id, down });
      if (down) vibrate(12);
    }
    for (const b of $$(".pad-btn", btns)) {
      const id = b.dataset.b;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add("down");
        pressButton(id, true);
      });
      const up = () => {
        if (!pressed.has(id)) return;
        b.classList.remove("down");
        pressButton(id, false);
      };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    // ---------- 摇杆 ----------
    const base = $("#stick", root);
    const knob = $(".stick-knob", base);
    let stickPointer = null;
    function moveStick(e) {
      const rect = base.getBoundingClientRect();
      const r = rect.width / 2 - knob.offsetWidth / 2;
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      stick.x = dx / r;
      stick.y = -dy / r; // 向上为正
    }
    function releaseStick() {
      stickPointer = null;
      stick.x = stick.y = 0;
      knob.classList.add("release");
      knob.style.transform = "translate(0, 0)";
    }
    base.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stickPointer = e.pointerId;
      base.setPointerCapture(e.pointerId);
      knob.classList.remove("release");
      moveStick(e);
    });
    base.addEventListener("pointermove", (e) => {
      if (e.pointerId === stickPointer) moveStick(e);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
      base.addEventListener(ev, (e) => {
        if (e.pointerId === stickPointer || ev === "lostpointercapture")
          releaseStick();
      });
    }

    // ---------- 动作 ----------
    function showGesture(ev) {
      const label = LABELS[ev.type] || { emoji: "✨", text: ev.type };
      $(".g-emoji", banner).textContent = label.emoji;
      $(".g-text", banner).textContent = label.text;
      banner.classList.remove("pop");
      void banner.offsetWidth;
      banner.classList.add("pop");
    }
    motion.on("gesture", (ev) => {
      if (!started) return;
      showGesture(ev);
      if (link.settings.sendGestures)
        link.send({
          t: "gesture",
          name: ev.type,
          power: ev.power ?? 0,
          hard: !!ev.hard,
        });
      if (motion.settings.haptic) vibrate(ev.hard ? [20, 30, 20] : 15);
    });

    // 游戏回传的震动
    link.on("message", (m) => {
      if (m.t === "rumble") vibrate(m.pattern);
    });

    // ---------- 状态流 ----------
    let seq = 0;
    let last = null;
    let lastSent = 0;
    let streamTimer = 0;
    function stream() {
      const t = motion.tilt();
      const st = motion.engine.state;
      const send = link.settings.sendTilt && motion.state === "running";
      const frame = {
        t: "state",
        tx: send ? t.tx : 0,
        ty: send ? t.ty : 0,
        roll: send ? t.roll : 0,
        pitch: send ? t.pitch : 0,
        sx: stick.x,
        sy: stick.y,
        gx: send ? st.gyro[0] : 0,
        gy: send ? st.gyro[1] : 0,
        gz: send ? st.gyro[2] : 0,
      };
      // 画面
      const rad = 0.5 * (bubble.clientWidth - dot.clientWidth);
      dot.style.transform = `translate(${t.tx * rad}px, ${t.ty * rad}px)`;
      read.textContent = `左右 ${Math.round(t.roll)}° · 前后 ${Math.round(t.pitch)}°`;
      if (!started || link.status !== "open") return;
      const now = performance.now();
      const changed =
        !last ||
        Math.abs(frame.tx - last.tx) > 0.005 ||
        Math.abs(frame.ty - last.ty) > 0.005 ||
        Math.abs(frame.sx - last.sx) > 0.01 ||
        Math.abs(frame.sy - last.sy) > 0.01 ||
        Math.abs(frame.gx - last.gx) > 5 ||
        Math.abs(frame.gy - last.gy) > 5 ||
        Math.abs(frame.gz - last.gz) > 5;
      if (!changed && now - lastSent < 250) return; // 没变化时只发心跳
      frame.seq = ++seq;
      link.send(frame);
      last = frame;
      lastSent = now;
    }
    function restartStream() {
      clearInterval(streamTimer);
      streamTimer = setInterval(stream, 1000 / link.settings.rate);
    }

    // ---------- 开始 / 停止 ----------
    async function acquireWake() {
      try {
        wakeLock = await navigator.wakeLock?.request("screen");
      } catch {
        wakeLock = null;
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // 切到后台时松开所有按钮，免得游戏里一直按着
        for (const id of [...pressed]) pressButton(id, false);
        $$(".pad-btn.down", root).forEach((b) => b.classList.remove("down"));
      } else if (started) acquireWake();
    });

    goBtn.addEventListener("click", () => {
      // iOS 要求在点击的同步调用栈里请求运动权限，必须最先调用
      const asking = motion.enable();
      if (!link.settings.server) {
        toast("先在 ⚙️ 里填电脑的地址");
        openSettings();
        return;
      }
      started = true;
      link.connect();
      acquireWake();
      restartStream();
      paintStatus();
      asking.then((ok) => {
        if (ok)
          setTimeout(() => motion.calibrateTilt(), 700); // 以开始时的姿势作为正中
        else toast("传感器没开启：手柄按键仍可用，倾斜和动作不可用");
      });
    });

    function stop() {
      started = false;
      link.disconnect();
      wakeLock?.release?.().catch?.(() => {});
      wakeLock = null;
      for (const id of [...pressed]) pressed.delete(id);
      paintStatus();
    }

    // ---------- 设置 ----------
    function input(value, placeholder, onChange, attrs = {}) {
      const el = h(
        `<input class="input" autocomplete="off" autocapitalize="off" spellcheck="false" />`,
      );
      el.value = value;
      el.placeholder = placeholder;
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.addEventListener("input", () => onChange(el.value.trim()));
      return el;
    }
    function openSettings() {
      let dirty = false;
      const s = link.settings;
      openSheet({
        title: "手柄设置",
        build(body) {
          const save = (key) => (v) => {
            link.save({ [key]: v });
            dirty = true;
          };
          body.append(
            field(
              "电脑地址",
              input(
                s.server,
                defaultServer() || "192.168.1.5:8443",
                save("server"),
                { inputmode: "url" },
              ),
              "电脑上运行 npm start 后，终端会显示。从那个网址打开本页时，这里会自动填好。",
            ),
            field(
              "房间",
              input(s.room, "default", save("room")),
              "同一个房间里的手柄和游戏才互相可见。",
            ),
            field(
              "口令",
              input(s.pin, "没设置就留空", save("pin"), {
                inputmode: "numeric",
              }),
            ),
            field("名字", input(s.name, "玩家", save("name"))),
          );
          body.append(
            field(
              "发送频率",
              segmented(
                [
                  [20, "20 次/秒"],
                  [30, "30 次/秒"],
                  [60, "60 次/秒"],
                ],
                s.rate,
                (v) => {
                  link.save({ rate: v });
                  restartStream();
                },
              ),
            ),
            field(
              "倾斜多少算推到头",
              segmented(
                [
                  [25, "25° 灵敏"],
                  [35, "35° 标准"],
                  [50, "50° 迟钝"],
                ],
                motion.maxTilt,
                (v) => motion.setMaxTilt(v),
              ),
            ),
            field(
              "握持方式",
              segmented(
                [
                  ["auto", "自动"],
                  [0, "竖着"],
                  [90, "横·左"],
                  [-90, "横·右"],
                ],
                motion.settings.hold,
                (v) => motion.configure({ hold: v }),
              ),
              "自动＝跟随屏幕方向。iPhone 想横着玩，先在控制中心关掉方向锁定。",
            ),
            field(
              "发送倾斜数据",
              switchEl(s.sendTilt, (v) => link.save({ sendTilt: v })),
            ),
            field(
              "发送动作识别",
              switchEl(s.sendGestures, (v) => link.save({ sendGestures: v })),
            ),
          );
          const cal = h(`<button class="btn">把当前姿势设为“正中”</button>`);
          cal.addEventListener("click", () => {
            motion.calibrateTilt();
            toast("已归零");
          });
          const stopBtn = h(`<button class="btn ghost"></button>`);
          stopBtn.textContent = started ? "断开连接" : "取消";
          stopBtn.hidden = !started;
          stopBtn.addEventListener("click", () => {
            stop();
            toast("已断开");
          });
          body.append(cal, stopBtn);
        },
        onClose() {
          if (dirty && started) link.reconnect();
          paintStatus();
        },
      });
    }
    const setBtn = h(
      `<button class="icon-btn" aria-label="手柄设置">⚙️</button>`,
    );
    setBtn.addEventListener("click", openSettings);

    paintStatus();
    return {
      actions: [setBtn],
      enter() {
        paintStatus();
        restartStream();
      },
      leave() {
        // 已连接时切到别的页面不断开手柄；没连接就停掉画面刷新
        if (!started) clearInterval(streamTimer);
      },
    };
  },
};
