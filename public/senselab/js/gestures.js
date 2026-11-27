// 体感动作识别引擎：纯计算，不依赖 DOM，浏览器和 Node 测试共用。
//
// 输入（每个 devicemotion 采样调用一次 push）：
//   t    毫秒时间戳（单调递增）
//   ag   accelerationIncludingGravity [x, y, z]，m/s²
//   lin  acceleration（系统已去掉重力的线性加速度）[x, y, z]，没有就传 null，引擎会自己高通
//   rot  rotationRate [beta, gamma, alpha]，也就是绕设备 x、y、z 轴，度/秒
//
// 设备坐标系（W3C）：x 向屏幕右，y 向屏幕上，z 垂直屏幕朝向用户。
// 输出事件（type）：
//   lift 上升 / drop 下降
//   swing-left / swing-right  轻甩（左右挥动）
//   push 向前推 / pull 向后拉
//   flick-left / flick-right / flick-forward / flick-back  重甩（甩一下）
//   shake-lr 左右摇晃 / shake-ud 上下摇晃 / shake-fb 前后摇晃
//   flip-forward / flip-back / flip-left / flip-right  翻转（绕两条水平轴转半圈）
//   twist-cw / twist-ccw  拧转（绕屏幕法线转，像拧瓶盖）
//   face-up / face-down  翻面（屏幕朝上或朝下）
//
// 方向都以“世界里的方向”为准（前后左右上下与手机怎么拿无关），
// 只有翻转和拧转用到手机自身的轴，横握时用 hold 重映射。

const D2R = Math.PI / 180;

export const DEFAULTS = {
  swing: 6, // 轻甩阈值 m/s²
  flick: 16, // 超过它算“重甩”
  lift: 4.5, // 上升/下降阈值
  shake: 6, // 摇晃每次峰值
  shakeCount: 4, // 摇晃需要的交替峰数
  flipAngle: 150, // 翻转角度
  twistAngle: 120, // 拧转角度
  cooldown: 320, // 同一方向两次动作的最短间隔
  hold: 0, // 握持方式：0 竖握，90 横握（左转），-90 横握（右转）
};

export const LABELS = {
  lift: { emoji: "🛗", text: "上升" },
  drop: { emoji: "⤵️", text: "下降" },
  "swing-left": { emoji: "👈", text: "向左挥" },
  "swing-right": { emoji: "👉", text: "向右挥" },
  push: { emoji: "🫸", text: "向前推" },
  pull: { emoji: "🫷", text: "向后拉" },
  "flick-left": { emoji: "💨", text: "向左甩" },
  "flick-right": { emoji: "💨", text: "向右甩" },
  "flick-forward": { emoji: "🚀", text: "向前甩" },
  "flick-back": { emoji: "🪃", text: "向后甩" },
  "shake-lr": { emoji: "↔️", text: "左右摇晃" },
  "shake-ud": { emoji: "↕️", text: "上下摇晃" },
  "shake-fb": { emoji: "🔀", text: "前后摇晃" },
  "flip-forward": { emoji: "⤴️", text: "向前翻" },
  "flip-back": { emoji: "⤵️", text: "向后翻" },
  "flip-left": { emoji: "↩️", text: "向左翻" },
  "flip-right": { emoji: "↪️", text: "向右翻" },
  "twist-cw": { emoji: "🔃", text: "顺时针拧" },
  "twist-ccw": { emoji: "🔄", text: "逆时针拧" },
  "face-up": { emoji: "🙂", text: "屏幕朝上" },
  "face-down": { emoji: "🙃", text: "屏幕朝下" },
};

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const n = norm(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** 把设备坐标系的向量换算到“手持坐标系”（横握时 x、y 互换）。 */
export function remapHold(vec, hold) {
  const th = hold * D2R;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [vec[0] * c - vec[1] * s, vec[0] * s + vec[1] * c, vec[2]];
}

/** 由 deviceorientation 的 beta、gamma 推出“世界向上”在设备坐标系里的方向。 */
export function upFromOrientation(beta, gamma) {
  const b = beta * D2R;
  const g = gamma * D2R;
  return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
}

export class GestureEngine {
  constructor(options = {}, onEvent = () => {}) {
    this.cfg = { ...DEFAULTS, ...options };
    this.onEvent = onEvent;
    this.initialSign = options.sign || 1;
    this.reset();
  }

  setConfig(partial) {
    Object.assign(this.cfg, partial);
  }

  reset() {
    this.sign = 0; // 0 表示还没校准；1 或 -1 表示加速度的符号约定
    this.oriUp = null;
    this.lastT = null;
    this.t0 = 0;
    this.gSlow = [0, 0, 9.81];
    this.gFast = [0, 0, 9.81];
    this.u = [0, 0, 1];
    this.dtAvg = 16;
    this.ch = {
      lat: this._channel(),
      fwd: this._channel(),
      v: this._channel(),
    };
    this.rotRing = [[], [], []];
    this.rotLock = 0;
    this.shakeLock = 0;
    this.face = undefined;
    this.faceCandidate = null;
    this.faceSince = 0;
    this.state = {
      roll: 0,
      pitch: 0,
      hz: 0,
      gyro: [0, 0, 0],
      lin: { lat: 0, fwd: 0, v: 0 },
      face: null,
      signKnown: false,
    };
  }

  _channel() {
    return {
      active: false,
      sign: 0,
      peak: 0,
      start: 0,
      lock: 0,
      hist: [],
      shakeLast: 0,
      shakeTimes: [],
    };
  }

  /** 传入 deviceorientation，用来判断这个平台的加速度符号方向。 */
  pushOrientation(beta, gamma) {
    if (beta == null || gamma == null) return;
    this.oriUp = upFromOrientation(beta, gamma);
  }

  push(s) {
    const out = [];
    const cfg = this.cfg;
    const t = s.t;
    if (!s.ag) return out;
    if (this.lastT == null) {
      this.gSlow = [...s.ag];
      this.gFast = [...s.ag];
      this.lastT = t;
      this.t0 = t;
      return out;
    }
    const dt = clamp(t - this.lastT, 1, 100);
    this.lastT = t;
    this.dtAvg += (dt - this.dtAvg) * 0.05;

    // 重力低通：开头 1.5 秒收敛得快，之后慢
    const tau = t - this.t0 < 1500 ? 120 : 450;
    const aSlow = dt / (tau + dt);
    const aFast = dt / (60 + dt);
    for (let i = 0; i < 3; i++) {
      this.gSlow[i] += (s.ag[i] - this.gSlow[i]) * aSlow;
      this.gFast[i] += (s.ag[i] - this.gFast[i]) * aFast;
    }

    const rot = remapHold(s.rot || [0, 0, 0], cfg.hold);
    const wMag = norm(rot);

    // 符号校准：手机静止时，加速度方向应该和 deviceorientation 推出的“向上”同向
    if (!this.sign && this.oriUp && wMag < 25) {
      const gm = norm(this.gSlow);
      if (Math.abs(gm - 9.81) < 1.2) {
        const d = dot(unit(this.gSlow), this.oriUp);
        if (Math.abs(d) > 0.6) this.sign = d > 0 ? 1 : -1;
      }
    }
    const sg = this.sign || this.initialSign;

    const gSlowS = this.gSlow.map((v) => v * sg);
    const gFastS = this.gFast.map((v) => v * sg);
    if (norm(gSlowS) > 3) this.u = unit(gSlowS);
    const u = this.u;

    // 线性加速度：优先用系统给的；没有就用原始值减慢速重力
    const hasLin = Array.isArray(s.lin) && s.lin.every((v) => v != null);
    const linRaw = hasLin ? s.lin : s.ag.map((v, i) => v - this.gSlow[i]);
    const lin = linRaw.map((v) => v * sg);

    // 世界坐标分解：竖直、前后、左右
    const v = dot(lin, u);
    const f = this._forward(u);
    const r = cross(f, u);
    const lat = dot(lin, r);
    const fwd = dot(lin, f);

    // 倾斜角
    const uh = remapHold(unit(gFastS), cfg.hold);
    const roll = Math.asin(clamp(-uh[0], -1, 1)) / D2R;
    const pitch = -Math.asin(clamp(uh[1], -1, 1)) / D2R;

    this.state = {
      roll,
      pitch,
      hz: 1000 / this.dtAvg,
      gyro: rot,
      lin: { lat, fwd, v },
      face: this.face ?? null,
      signKnown: !!this.sign,
    };

    const emit = (type, extra = {}) => {
      const ev = { type, t, ...extra };
      out.push(ev);
      this.onEvent(ev);
    };

    this._rotation(rot, dt, t, emit);
    this._linear({ lat, fwd, v }, t, wMag, hasLin, emit);
    this._faceState(gFastS, t, emit);
    return out;
  }

  _forward(u) {
    // 候选 A：屏幕法线的反方向（手机竖着拿时，向前就是远离脸的方向）
    // 候选 B：手持坐标系的“上”边（手机平放时，向前是屏幕顶边）
    const a = [0, 0, -1];
    const A = [
      a[0] - u[0] * dot(a, u),
      a[1] - u[1] * dot(a, u),
      a[2] - u[2] * dot(a, u),
    ];
    const th = this.cfg.hold * D2R;
    const b = [Math.sin(th), Math.cos(th), 0];
    const B = [
      b[0] - u[0] * dot(b, u),
      b[1] - u[1] * dot(b, u),
      b[2] - u[2] * dot(b, u),
    ];
    return unit(norm(A) >= norm(B) ? A : B);
  }

  _linear(vals, t, wMag, hasLin, emit) {
    const cfg = this.cfg;
    const thr = { lat: cfg.swing, fwd: cfg.swing, v: cfg.lift };
    const gate = hasLin ? 250 : 80; // 转得太快时，线性加速度多半是旋转造成的假象
    for (const name of ["lat", "fwd", "v"]) {
      const c = this.ch[name];
      const val = vals[name];
      c.hist.push([t, Math.abs(val)]);
      while (c.hist.length && t - c.hist[0][0] > 300) c.hist.shift();
      this._pulseStep(name, c, val, t, thr[name], wMag, gate, emit);
      if (this._shakeStep(name, c, val, t, emit)) return;
    }
  }

  // 单次脉冲：越过阈值开始，回落到峰值的 55% 以下或反向时结束
  _pulseStep(name, c, val, t, thr, wMag, gate, emit) {
    const av = Math.abs(val);
    if (!c.active) {
      if (t < c.lock || t < this.rotLock || av <= thr) return;
      c.active = true;
      c.sign = Math.sign(val);
      c.peak = av;
      c.start = t;
      return;
    }
    if (Math.sign(val) === c.sign && av > c.peak) c.peak = av;
    const ended =
      Math.sign(val) !== c.sign || av < c.peak * 0.55 || t - c.start > 300;
    if (!ended) return;
    c.active = false;
    c.lock = t + this.cfg.cooldown;
    this._finishPulse(name, c, t, wMag, gate, emit);
  }

  // 摇晃：同一方向上来回出现足够大的峰
  _shakeStep(name, c, val, t, emit) {
    const cfg = this.cfg;
    const av = Math.abs(val);
    if (t <= this.shakeLock) {
      // 刚报过摇晃：冷却期里的峰不再累计，免得一结束就立刻又报一次
      c.shakeTimes = [];
      c.shakeLast = 0;
      return false;
    }
    if (av > cfg.shake) {
      const sgn = Math.sign(val);
      if (sgn !== c.shakeLast) {
        // 真正的摇晃是连续来回的；隔了一小段静止再动，说明是另一个动作，重新计数
        if (
          c.shakeTimes.length &&
          t - c.shakeTimes[c.shakeTimes.length - 1] > 380
        )
          c.shakeTimes = [];
        c.shakeLast = sgn;
        c.shakeTimes.push(t);
      }
    }
    while (c.shakeTimes.length && t - c.shakeTimes[0] > 1000)
      c.shakeTimes.shift();
    if (c.shakeTimes.length >= cfg.shakeCount && t > this.shakeLock) {
      const type = { lat: "shake-lr", fwd: "shake-fb", v: "shake-ud" }[name];
      emit(type, { power: Math.round(av * 10) / 10 });
      this._clearLinear(t, 600);
      this.shakeLock = t + 900;
      return true;
    }
    if (t - (c.shakeTimes[c.shakeTimes.length - 1] ?? t) > 600) c.shakeLast = 0;
    return false;
  }

  _finishPulse(name, c, t, wMag, gate, emit) {
    const cfg = this.cfg;
    const hard = c.peak >= cfg.flick;
    if (!hard && wMag > gate) return; // 旋转干扰
    if (t < this.rotLock || t < this.shakeLock) return;
    // 已经在连续来回晃动，后面的单次脉冲不再单独报
    if (c.shakeTimes.filter((x) => t - x < 500).length >= 2) return;
    // 必须明显强于同一时间窗里的其他方向
    for (const other of Object.keys(this.ch)) {
      if (other === name) continue;
      const recent = this.ch[other].hist.reduce(
        (m, h) => (t - h[0] <= 250 ? Math.max(m, h[1]) : m),
        0,
      );
      if (recent * 1.25 > c.peak) return;
    }
    const pos = c.sign > 0;
    const power = Math.round(c.peak * 10) / 10;
    if (name === "v") return emit(pos ? "lift" : "drop", { power });
    if (name === "lat") {
      return emit(`${hard ? "flick" : "swing"}-${pos ? "right" : "left"}`, {
        power,
        hard,
      });
    }
    if (hard) return emit(`flick-${pos ? "forward" : "back"}`, { power, hard });
    return emit(pos ? "push" : "pull", { power, hard });
  }

  _clearLinear(t, lockMs) {
    for (const c of Object.values(this.ch)) {
      c.active = false;
      c.shakeTimes = [];
      c.shakeLast = 0;
      c.lock = t + lockMs;
    }
  }

  _rotation(rot, dt, t, emit) {
    const cfg = this.cfg;
    const sums = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const ring = this.rotRing[i];
      const rate = Math.abs(rot[i]) > 40 ? rot[i] : 0; // 去掉静止噪声
      ring.push([t, rate * (dt / 1000)]);
      while (ring.length && t - ring[0][0] > 700) ring.shift();
      sums[i] = ring.reduce((a, e) => a + e[1], 0);
    }
    if (t < this.rotLock) return;
    const abs = sums.map(Math.abs);
    const limits = [cfg.flipAngle, cfg.flipAngle, cfg.twistAngle];
    for (let i = 0; i < 3; i++) {
      const others = Math.max(abs[(i + 1) % 3], abs[(i + 2) % 3]);
      if (abs[i] < limits[i] || abs[i] < others * 1.6) continue;
      const pos = sums[i] > 0;
      const type =
        i === 0
          ? pos
            ? "flip-back"
            : "flip-forward" // 绕 x：顶边朝自己翻为正
          : i === 1
            ? pos
              ? "flip-right"
              : "flip-left" // 绕 y：右边朝下翻为正
            : pos
              ? "twist-ccw"
              : "twist-cw"; // 绕 z：从正面看逆时针为正
      emit(type, { angle: Math.round(abs[i]) });
      this.rotRing = [[], [], []];
      this.rotLock = t + 600;
      this._clearLinear(t, 450);
      return;
    }
  }

  _faceState(gFastS, t, emit) {
    const n = norm(gFastS);
    if (n < 3) return;
    const uz = gFastS[2] / n;
    const cand = uz > 0.85 ? "up" : uz < -0.85 ? "down" : null;
    if (cand !== this.faceCandidate) {
      this.faceCandidate = cand;
      this.faceSince = t;
      return;
    }
    if (!cand || t - this.faceSince < 250 || cand === this.face) return;
    const first = this.face === undefined && t - this.t0 < 2500;
    this.face = cand;
    this.state.face = cand;
    if (!first) emit(cand === "up" ? "face-up" : "face-down");
  }
}
