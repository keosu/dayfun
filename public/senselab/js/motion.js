// 运动传感器中心：统一申请权限、监听 devicemotion / deviceorientation，
// 把采样喂给手势引擎，并把原始值和识别结果分发给各个页面。

import { GestureEngine, DEFAULTS } from "./gestures.js";
import { store, isIOS } from "./ui.js";

const SENS = { sensitive: 0.75, normal: 1, steady: 1.4 };

/** 申请“运动与方向”权限。必须在点击的同步调用栈里调用。 */
function requestMotionPermission() {
  const DM = window.DeviceMotionEvent;
  const DO = window.DeviceOrientationEvent;
  if (!DM && !DO) return Promise.resolve("unsupported");
  if (!window.isSecureContext) return Promise.resolve("insecure");
  const asks = [];
  if (typeof DM?.requestPermission === "function")
    asks.push(DM.requestPermission());
  if (typeof DO?.requestPermission === "function")
    asks.push(DO.requestPermission());
  if (!asks.length) return Promise.resolve("granted"); // 安卓和电脑不需要弹窗
  return Promise.all(asks.map((p) => p.catch(() => "denied"))).then((r) =>
    r.every((x) => x === "granted") ? "granted" : "denied",
  );
}

class MotionHub {
  constructor() {
    this.state = "idle"; // idle | asking | running | denied | unsupported | insecure | nodata
    this.settings = {
      sens: "normal",
      hold: "auto",
      haptic: true,
      ...store.get("gesture", {}),
    };
    this.neutral = store.get("neutral", { roll: 0, pitch: 0 });
    this.maxTilt = store.get("maxTilt", 35);
    this.engine = new GestureEngine(this._engineConfig(), (e) =>
      this._onGesture(e),
    );
    this.engine.initialSign = isIOS ? -1 : 1;
    this.latest = { ag: null, lin: null, rot: null, ori: null, at: 0 };
    this.counts = store.get("counts", {});
    this.listeners = {
      gesture: new Set(),
      frame: new Set(),
      state: new Set(),
      orient: new Set(),
    };
    this._motion = (e) => this._onMotion(e);
    this._orient = (e) => this._onOrient(e);
    this._attached = false;
    screen.orientation?.addEventListener?.("change", () =>
      this.engine.setConfig({ hold: this._hold() }),
    );
  }

  _engineConfig() {
    const f = SENS[this.settings.sens] ?? 1;
    return {
      swing: DEFAULTS.swing * f,
      flick: DEFAULTS.flick * f,
      lift: DEFAULTS.lift * f,
      shake: DEFAULTS.shake * f,
      hold: this._hold(),
    };
  }

  /** 握持方式：auto 时跟随屏幕方向（屏幕转了，界面也转了，手持坐标系跟着转）。 */
  _hold() {
    const h = this.settings.hold;
    if (h !== "auto") return h;
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    return a > 180 ? a - 360 : a;
  }

  /** 修改设置并立即生效、保存。 */
  configure(partial) {
    Object.assign(this.settings, partial);
    store.set("gesture", this.settings);
    this.engine.setConfig(this._engineConfig());
  }

  setMaxTilt(deg) {
    this.maxTilt = deg;
    store.set("maxTilt", deg);
  }

  on(kind, fn) {
    this.listeners[kind].add(fn);
    return () => this.listeners[kind].delete(fn);
  }

  _set(state) {
    this.state = state;
    for (const fn of this.listeners.state) fn(state);
  }

  /** 开始感应。必须由用户点击触发（iOS 要求）。 */
  async enable() {
    if (this.state === "running") return true;
    if (this.state === "asking") return false;
    this._set("asking");
    const result = await requestMotionPermission();
    if (result !== "granted") {
      this._set(result);
      return false;
    }
    this._attach();
    this._set("running");
    setTimeout(() => {
      if (this.state === "running" && !this.latest.at) this._set("nodata");
    }, 2500);
    return true;
  }

  disable() {
    if (this._attached) {
      window.removeEventListener("devicemotion", this._motion);
      window.removeEventListener("deviceorientation", this._orient);
      window.removeEventListener("deviceorientationabsolute", this._orient);
      this._attached = false;
    }
    this._set("idle");
  }

  _attach() {
    if (this._attached) return;
    window.addEventListener("devicemotion", this._motion);
    window.addEventListener("deviceorientation", this._orient);
    // 安卓上 deviceorientationabsolute 带指南针方向，deviceorientation 是相对方向
    window.addEventListener("deviceorientationabsolute", this._orient);
    this._attached = true;
  }

  _onMotion(e) {
    const ag = e.accelerationIncludingGravity;
    if (!ag || ag.x == null) return;
    const a = e.acceleration;
    const r = e.rotationRate;
    const lin = a && a.x != null ? [a.x, a.y, a.z] : null;
    const rot = r && r.alpha != null ? [r.beta, r.gamma, r.alpha] : [0, 0, 0];
    this.latest.ag = [ag.x, ag.y, ag.z];
    this.latest.lin = lin;
    this.latest.rot = rot;
    this.latest.hasRot = !!(r && r.alpha != null);
    this.latest.hasLin = !!lin;
    this.latest.at = performance.now();
    this.latest.interval = e.interval;
    this.engine.push({ t: this.latest.at, ag: this.latest.ag, lin, rot });
    if (this.state === "nodata") this._set("running");
    for (const fn of this.listeners.frame) fn(this.latest);
  }

  _onOrient(e) {
    if (e.beta == null && e.alpha == null) return;
    // 同时收到相对和绝对方向时，以绝对方向的指南针为准，但姿态用同一份即可
    const abs = e.type === "deviceorientationabsolute";
    const prev = this.latest.ori || {};
    this.latest.ori = {
      alpha: e.alpha,
      beta: e.beta,
      gamma: e.gamma,
      absolute: abs || e.absolute === true,
      // iOS 的指南针方向（顺时针，北为 0）
      compass:
        e.webkitCompassHeading ??
        (abs && e.alpha != null ? (360 - e.alpha) % 360 : prev.compass),
      accuracy: e.webkitCompassAccuracy,
    };
    if (e.beta != null) this.engine.pushOrientation(e.beta, e.gamma);
    for (const fn of this.listeners.orient) fn(this.latest.ori);
  }

  _onGesture(ev) {
    this.counts[ev.type] = (this.counts[ev.type] || 0) + 1;
    store.set("counts", this.counts);
    for (const fn of this.listeners.gesture) fn(ev);
  }

  resetCounts() {
    this.counts = {};
    store.set("counts", this.counts);
  }

  /** 把当前姿势定为“正中”。 */
  calibrateTilt() {
    const { roll, pitch } = this.engine.state;
    this.neutral = { roll, pitch };
    store.set("neutral", this.neutral);
  }

  /** 相对正中的倾斜：角度和归一化到 -1…1 的值（右、前为正）。 */
  tilt() {
    const { roll, pitch } = this.engine.state;
    const dr = roll - this.neutral.roll;
    const dp = pitch - this.neutral.pitch;
    const dead = 0.04;
    const norm = (d) => {
      const v = Math.max(-1, Math.min(1, d / this.maxTilt));
      return Math.abs(v) < dead ? 0 : v;
    };
    return { roll: dr, pitch: dp, tx: norm(dr), ty: norm(dp) };
  }
}

export const motion = new MotionHub();

/** 对用户说人话的状态解释 */
export function motionStateText(state) {
  return (
    {
      idle: "还没开始感应",
      asking: "请在弹窗里选择“允许”…",
      running: "感应中",
      denied: "权限被拒绝：请到系统设置里允许，或彻底关闭后重新打开",
      unsupported: "这台设备没有运动传感器",
      insecure: "需要 HTTPS 才能读取传感器",
      nodata: "没有收到数据：可能是电脑浏览器，或系统关掉了传感器",
    }[state] || state
  );
}
