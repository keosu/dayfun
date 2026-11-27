import { h, $, toast, isIOS } from "../ui.js";
import { motion, motionStateText } from "../motion.js";

const D2R = Math.PI / 180;

/** 由 deviceorientation 的 alpha/beta/gamma 得到 CSS 的 matrix3d：
 *  R = Rz(α)·Rx(β)·Ry(γ) 把设备坐标变到世界坐标（x 东、y 北、z 上），
 *  再变到 CSS 坐标（x 右、y 下、z 朝向观看者；观看者站在南边）。 */
export function modelMatrix(alpha, beta, gamma) {
  const [ca, sa] = [Math.cos(alpha * D2R), Math.sin(alpha * D2R)];
  const [cb, sb] = [Math.cos(beta * D2R), Math.sin(beta * D2R)];
  const [cg, sg] = [Math.cos(gamma * D2R), Math.sin(gamma * D2R)];
  const mul = (A, B) =>
    A.map((row) =>
      [0, 1, 2].map(
        (j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j],
      ),
    );
  const Rz = [
    [ca, -sa, 0],
    [sa, ca, 0],
    [0, 0, 1],
  ];
  const Rx = [
    [1, 0, 0],
    [0, cb, -sb],
    [0, sb, cb],
  ];
  const Ry = [
    [cg, 0, sg],
    [0, 1, 0],
    [-sg, 0, cg],
  ];
  const C = [
    [1, 0, 0],
    [0, 0, -1],
    [0, -1, 0],
  ];
  const D = [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
  ];
  const M = mul(mul(C, mul(mul(Rz, Rx), Ry)), D);
  return `matrix3d(${M[0][0]},${M[1][0]},${M[2][0]},0,${M[0][1]},${M[1][1]},${M[2][1]},0,${M[0][2]},${M[1][2]},${M[2][2]},0,0,0,0,1)`;
}

const CARDS = [
  {
    id: "geo",
    icon: "📍",
    name: "定位",
    has: () => "geolocation" in navigator,
  },
  {
    id: "accel",
    icon: "📈",
    name: "加速度计",
    has: () => "DeviceMotionEvent" in window,
  },
  {
    id: "gyro",
    icon: "🌀",
    name: "陀螺仪",
    has: () => "DeviceMotionEvent" in window,
  },
  {
    id: "orient",
    icon: "🧭",
    name: "方向与指南针",
    has: () => "DeviceOrientationEvent" in window,
  },
  {
    id: "mag",
    icon: "🧲",
    name: "磁力计",
    has: () => "Magnetometer" in window,
  },
  {
    id: "light",
    icon: "💡",
    name: "环境光",
    has: () => "AmbientLightSensor" in window,
  },
  {
    id: "battery",
    icon: "🔋",
    name: "电池",
    has: () => typeof navigator.getBattery === "function",
  },
  {
    id: "net",
    icon: "📶",
    name: "网络",
    has: () => "connection" in navigator || "onLine" in navigator,
  },
  {
    id: "vibrate",
    icon: "📳",
    name: "震动马达",
    has: () => typeof navigator.vibrate === "function",
  },
  { id: "screen", icon: "📱", name: "屏幕与触控", has: () => true },
];

const fmt = (n, d = 2) =>
  n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(d);
const sgn = (n, d = 2) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(d);

export default {
  mount(root) {
    root.innerHTML = `
      <div class="sense-top">
        <div class="scene" aria-hidden="true">
          <div class="tilt-plane">
            <div class="phone" id="phone">
              <div class="face front"><i class="notch"></i><span>🙂</span></div>
              <div class="face back"><i class="cam"></i></div>
            </div>
          </div>
        </div>
        <div class="sense-summary">
          <div class="big-num"><b id="okCount">0</b><span id="okTotal"></span></div>
          <small id="statusLine">点“开始体检”，会依次请求权限</small>
          <button class="btn primary" id="start">开始体检</button>
        </div>
      </div>
      <div class="cards scroll" id="cards"></div>`;

    const cardsEl = $("#cards", root);
    const cards = {};
    for (const c of CARDS) {
      const el = h(`
        <div class="card" data-id="${c.id}">
          <span class="ci">${c.icon}</span>
          <div class="cm"><strong></strong><span class="val">点开始体检后显示</span></div>
          <span class="chip">待检测</span>
        </div>`);
      $("strong", el).textContent = c.name;
      cardsEl.append(el);
      cards[c.id] = {
        el,
        val: $(".val", el),
        chip: $(".chip", el),
        status: "wait",
        def: c,
      };
    }
    $("#okTotal", root).textContent = `/ ${CARDS.length} 项可用`;

    // 摄像头不是传感器卡片，单独一张，点进去是完整的识别页面
    const cam = h(`
      <a class="card cam-entry" href="#/camera">
        <span class="ci">📷</span>
        <div class="cm"><strong>摄像头识别</strong><span class="val">人脸、姿态、手势；画面只在本机处理</span></div>
        <span class="chip">打开</span>
      </a>`);
    cardsEl.append(cam);

    function set(id, status, val, chipText) {
      const c = cards[id];
      c.status = status;
      c.el.dataset.status = status;
      c.chip.textContent =
        chipText ||
        { ok: "正常", wait: "等待", no: "不支持", bad: "出错" }[status];
      if (val != null) c.val.textContent = val;
      updateCount();
    }
    function updateCount() {
      $("#okCount", root).textContent = String(
        Object.values(cards).filter((c) => c.status === "ok").length,
      );
    }

    // 先做特性检测：不支持的直接标出来
    for (const c of CARDS) {
      if (!c.has())
        set(
          c.id,
          "no",
          c.id === "vibrate" && isIOS
            ? "iPhone 的 Safari 没有网页震动接口"
            : "这个浏览器没有提供",
          "不支持",
        );
    }
    if (cards.vibrate.def.has())
      set("vibrate", "ok", "支持。到“系统能力”里可以试各种节奏", "支持");
    set("screen", "ok", "");
    if (!window.isSecureContext) {
      $("#statusLine", root).textContent =
        "当前不是 HTTPS，定位和传感器会被禁用";
    }

    // ---------- 各个传感器 ----------
    let geoWatch = null;
    function startGeo() {
      if (!cards.geo.def.has()) return;
      if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch);
      set("geo", "wait", "正在定位…（室内可能要十几秒）", "定位中");
      geoWatch = navigator.geolocation.watchPosition(
        (p) => {
          const c = p.coords;
          const speed =
            c.speed != null ? ` · ${(c.speed * 3.6).toFixed(1)} km/h` : "";
          set(
            "geo",
            "ok",
            `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}  ±${Math.round(c.accuracy)} m${speed}`,
          );
        },
        (err) => {
          const why =
            {
              1: "你拒绝了定位权限，请到系统设置里允许",
              2: "暂时获取不到位置",
              3: "定位超时，换个开阔处再试",
            }[err.code] || err.message;
          set("geo", "bad", why, err.code === 1 ? "被拒绝" : "出错");
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
    }

    function startGenericSensors() {
      const tryStart = (id, make, show) => {
        if (!cards[id].def.has()) return;
        try {
          const s = make();
          s.addEventListener("reading", () => set(id, "ok", show(s)));
          s.addEventListener("error", (e) => {
            const name = e.error?.name;
            set(
              id,
              "bad",
              name === "NotAllowedError"
                ? "没有权限"
                : name === "NotReadableError"
                  ? "读不到这个传感器"
                  : (e.error?.message ?? "出错"),
              "出错",
            );
          });
          s.start();
        } catch (e) {
          set(id, "bad", e.message || String(e), "出错");
        }
      };
      tryStart(
        "mag",
        () => new window.Magnetometer({ frequency: 10 }),
        (s) => `x ${fmt(s.x, 1)}  y ${fmt(s.y, 1)}  z ${fmt(s.z, 1)} μT`,
      );
      tryStart(
        "light",
        () => new window.AmbientLightSensor({ frequency: 5 }),
        (s) => `${Math.round(s.illuminance)} lux`,
      );
    }

    let battery = null;
    async function startBattery() {
      if (!cards.battery.def.has()) {
        set("battery", "no", "iPhone 的 Safari 不开放电池信息", "不支持");
        return;
      }
      try {
        battery = await navigator.getBattery();
        const show = () =>
          set(
            "battery",
            "ok",
            `${Math.round(battery.level * 100)}%${battery.charging ? " · 充电中⚡" : ""}`,
          );
        battery.addEventListener("levelchange", show);
        battery.addEventListener("chargingchange", show);
        show();
      } catch (e) {
        set("battery", "bad", e.message, "出错");
      }
    }

    function showNet() {
      const c = navigator.connection;
      const online = navigator.onLine ? "在线" : "离线";
      set(
        "net",
        navigator.onLine ? "ok" : "bad",
        c
          ? `${online} · ${c.effectiveType ?? "?"} · ${c.downlink ?? "?"} Mb/s · 延迟 ${c.rtt ?? "?"} ms`
          : `${online}（浏览器不提供网络质量）`,
      );
    }
    addEventListener("online", showNet);
    addEventListener("offline", showNet);
    navigator.connection?.addEventListener?.("change", showNet);

    function showScreen() {
      const o = screen.orientation;
      set(
        "screen",
        "ok",
        `${screen.width}×${screen.height} @${window.devicePixelRatio}x · ${o ? o.type.replace("-primary", "") + " " + o.angle + "°" : "—"} · 触点 ${navigator.maxTouchPoints}`,
      );
    }
    screen.orientation?.addEventListener?.("change", showScreen);
    addEventListener("resize", showScreen);
    showScreen();

    // ---------- 运动传感器（来自 motion 中心） ----------
    const phone = $("#phone", root);
    let alpha0 = null;
    let timer = 0;
    function paint() {
      const L = motion.latest;
      if (L.ag) {
        set(
          "accel",
          "ok",
          `x ${sgn(L.ag[0])}  y ${sgn(L.ag[1])}  z ${sgn(L.ag[2])} m/s²  ·  ${Math.round(motion.engine.state.hz)} Hz`,
        );
        if (L.hasRot) {
          const [b, g, a] = L.rot;
          set(
            "gyro",
            "ok",
            `α ${sgn(a, 0)}  β ${sgn(b, 0)}  γ ${sgn(g, 0)} °/s`,
          );
        } else {
          set("gyro", "no", "这台设备没有陀螺仪，或浏览器没有开放", "不支持");
        }
      }
      const o = L.ori;
      if (o && o.beta != null) {
        if (alpha0 == null && o.alpha != null) alpha0 = o.alpha;
        const heading =
          o.compass != null ? `航向 ${Math.round(o.compass)}° · ` : "";
        set(
          "orient",
          "ok",
          `${heading}β ${fmt(o.beta, 0)}°  γ ${fmt(o.gamma, 0)}°${o.absolute ? "  · 绝对方向" : ""}`,
        );
        phone.style.transform = modelMatrix(
          o.alpha != null ? o.alpha - alpha0 : 0,
          o.beta,
          o.gamma,
        );
      }
    }

    const offState = motion.on("state", (s) => {
      const line = $("#statusLine", root);
      line.textContent = motionStateText(s);
      if (s === "denied" || s === "unsupported" || s === "insecure") {
        for (const id of ["accel", "gyro", "orient"])
          set(
            id,
            s === "denied" ? "bad" : "no",
            motionStateText(s),
            s === "denied" ? "被拒绝" : "不支持",
          );
      }
      if (s === "nodata")
        for (const id of ["accel", "gyro", "orient"])
          set(id, "no", "没有收到数据", "无数据");
    });

    const startBtn = $("#start", root);
    startBtn.addEventListener("click", () => {
      // iOS 要求在点击的同步调用栈里请求运动权限，所以必须第一个调用
      const asking = motion.enable();
      startGeo();
      startGenericSensors();
      startBattery();
      showNet();
      startBtn.textContent = "重新体检";
      asking.then((ok) => {
        if (!ok && motion.state === "denied")
          toast("运动权限被拒绝了：关闭这个页面后重新打开，再点一次允许");
      });
    });

    return {
      enter() {
        paint();
        timer = setInterval(paint, 120);
        showScreen();
      },
      leave() {
        clearInterval(timer);
      },
      dispose() {
        offState();
      },
    };
  },
};
