import test from "node:test";
import assert from "node:assert/strict";
import { GestureEngine, remapHold } from "../../public/senselab/js/gestures.js";

const D2R = Math.PI / 180;
const G = 9.81;

// ---------- 合成信号 ----------
const UPRIGHT = [0, 1, 0]; // 竖着拿，屏幕朝向自己
const FLAT = [0, 0, 1]; // 平放，屏幕朝上
const FACE_DOWN = [0, 0, -1];

function orientFromUp(u) {
  return [Math.asin(u[1]) / D2R, Math.atan2(-u[0], u[2]) / D2R];
}

/** 梯形钟形脉冲：t0 开始，持续 dur 毫秒，峰值 amp */
const pulse = (t, t0, dur, amp) =>
  t >= t0 && t < t0 + dur ? amp * Math.sin((Math.PI * (t - t0)) / dur) : 0;
/** 一次挥动：加速脉冲 + 反向的减速脉冲 */
const swingShape = (t, t0, amp) =>
  pulse(t, t0, 150, amp) + pulse(t, t0 + 150, 150, -amp * 0.8);
const gauss = (t, t0, sigma, peak) =>
  peak * Math.exp(-(((t - t0) / sigma) ** 2));

function makeSim(opts = {}) {
  const events = [];
  const engine = new GestureEngine(
    { ...(opts.cfg || {}), sign: opts.ios ? -1 : 1 },
    (e) => events.push(e),
  );
  const sim = {
    engine,
    events,
    t: 1000,
    u: opts.u || UPRIGHT,
    ios: !!opts.ios,
    provideLin: opts.provideLin !== false,
    /** 运行 durMs 毫秒；fn(局部毫秒) 返回 { lin:[x,y,z], rot:[beta,gamma,alpha] } */
    run(durMs, fn = () => ({})) {
      const sign = this.ios ? -1 : 1;
      const step = 1000 / 60;
      const start = this.t;
      for (let local = 0; local < durMs; local += step) {
        const {
          lin = [0, 0, 0],
          rot = [0, 0, 0],
          u = this.u,
        } = fn(local) || {};
        const ag = u.map((v, i) => (v * G + lin[i]) * sign);
        const [beta, gamma] = orientFromUp(u);
        engine.pushOrientation(beta, gamma);
        engine.push({
          t: this.t,
          ag,
          lin: this.provideLin ? lin.map((v) => v * sign) : null,
          rot,
        });
        this.t += step;
      }
      return this.t - start;
    },
    settle(ms = 2000) {
      this.run(ms);
    },
    types() {
      return events.map((e) => e.type);
    },
  };
  return sim;
}

// ---------- 线性动作 ----------
test("上升和下降", () => {
  const up = makeSim();
  up.settle();
  up.run(800, (t) => ({ lin: [0, swingShape(t, 100, 8) * 1, 0] }));
  assert.deepEqual(up.types(), ["lift"]);

  const down = makeSim();
  down.settle();
  down.run(800, (t) => ({ lin: [0, swingShape(t, 100, -8), 0] }));
  assert.deepEqual(down.types(), ["drop"]);
});

test("左右挥与重甩", () => {
  const right = makeSim();
  right.settle();
  right.run(800, (t) => ({ lin: [swingShape(t, 100, 9), 0, 0] }));
  assert.deepEqual(right.types(), ["swing-right"]);

  const left = makeSim();
  left.settle();
  left.run(800, (t) => ({ lin: [swingShape(t, 100, -9), 0, 0] }));
  assert.deepEqual(left.types(), ["swing-left"]);

  const flick = makeSim();
  flick.settle();
  flick.run(800, (t) => ({ lin: [swingShape(t, 100, 24), 0, 0] }));
  assert.deepEqual(flick.types(), ["flick-right"]);
  assert.equal(flick.events[0].hard, true);
});

test("向前推与向后拉（竖握，屏幕法线方向）", () => {
  const push = makeSim();
  push.settle();
  push.run(800, (t) => ({ lin: [0, 0, swingShape(t, 100, -9)] })); // 远离脸 = -z
  assert.deepEqual(push.types(), ["push"]);

  const pull = makeSim();
  pull.settle();
  pull.run(800, (t) => ({ lin: [0, 0, swingShape(t, 100, 9)] }));
  assert.deepEqual(pull.types(), ["pull"]);
});

test("手机平放时，向前是屏幕顶边方向", () => {
  const sim = makeSim({ u: FLAT });
  sim.settle();
  sim.run(800, (t) => ({ lin: [0, swingShape(t, 100, 9), 0] }));
  assert.deepEqual(sim.types(), ["push"]);
});

test("左右摇晃只报一次摇晃", () => {
  const sim = makeSim();
  sim.settle();
  sim.run(1500, (t) => ({
    lin: [t < 1100 ? 10 * Math.sin((2 * Math.PI * 5 * t) / 1000) : 0, 0, 0],
  }));
  const types = sim.types();
  assert.equal(types.filter((x) => x === "shake-lr").length, 1, types.join());
  assert.ok(
    types.filter((x) => x.startsWith("swing")).length <= 1,
    types.join(),
  );
});

test("上下摇晃", () => {
  const sim = makeSim();
  sim.settle();
  sim.run(1500, (t) => ({
    lin: [0, t < 1100 ? 10 * Math.sin((2 * Math.PI * 5 * t) / 1000) : 0, 0],
  }));
  assert.equal(
    sim.types().filter((x) => x === "shake-ud").length,
    1,
    sim.types().join(),
  );
});

test("隔一小会儿的两次挥动不会被当成摇晃", () => {
  const sim = makeSim();
  sim.settle();
  // 向右挥，停 0.4 秒，再向右甩：减速的反向峰也算一次变向，但中间有停顿
  sim.run(1800, (t) => ({
    lin: [swingShape(t, 100, 9) + swingShape(t, 750, 24), 0, 0],
  }));
  assert.deepEqual(sim.types(), ["swing-right", "flick-right"]);
});

// ---------- 旋转动作 ----------
test("翻转：绕 x 轴、绕 y 轴", () => {
  const back = makeSim();
  back.settle();
  back.run(1200, (t) => ({ rot: [gauss(t, 400, 150, 760), 0, 0] }));
  assert.deepEqual(back.types(), ["flip-back"]);

  const fwd = makeSim();
  fwd.settle();
  fwd.run(1200, (t) => ({ rot: [gauss(t, 400, 150, -760), 0, 0] }));
  assert.deepEqual(fwd.types(), ["flip-forward"]);

  const left = makeSim();
  left.settle();
  left.run(1200, (t) => ({ rot: [0, gauss(t, 400, 150, -760), 0] }));
  assert.deepEqual(left.types(), ["flip-left"]);

  const right = makeSim();
  right.settle();
  right.run(1200, (t) => ({ rot: [0, gauss(t, 400, 150, 760), 0] }));
  assert.deepEqual(right.types(), ["flip-right"]);
});

test("拧转：绕屏幕法线", () => {
  const sim = makeSim();
  sim.settle();
  sim.run(1200, (t) => ({ rot: [0, 0, gauss(t, 400, 120, -700)] }));
  assert.deepEqual(sim.types(), ["twist-cw"]);
});

test("小幅转动不算翻转", () => {
  const sim = makeSim();
  sim.settle();
  sim.run(2000, (t) => ({ rot: [gauss(t, 500, 150, 300), 0, 0] })); // 约 80°
  assert.deepEqual(sim.types(), []);
});

test("翻面", () => {
  const sim = makeSim({ u: FLAT });
  sim.settle(3000);
  sim.run(900, () => ({ u: FACE_DOWN }));
  assert.deepEqual(sim.types(), ["face-down"]);
  sim.run(900, () => ({ u: FLAT }));
  assert.deepEqual(sim.types(), ["face-down", "face-up"]);
});

// ---------- 平台差异 ----------
test("iOS 的加速度符号相反，也能识别出同样的方向", () => {
  const sim = makeSim({ ios: true });
  sim.settle();
  sim.run(800, (t) => ({ lin: [swingShape(t, 100, 9), 0, 0] }));
  assert.deepEqual(sim.types(), ["swing-right"]);
  assert.equal(sim.engine.sign, -1);

  const lift = makeSim({ ios: true });
  lift.settle();
  lift.run(800, (t) => ({ lin: [0, swingShape(t, 100, 8), 0] }));
  assert.deepEqual(lift.types(), ["lift"]);
});

test("系统没有提供线性加速度时，自己高通也能识别", () => {
  const sim = makeSim({ provideLin: false });
  sim.settle();
  sim.run(800, (t) => ({ lin: [swingShape(t, 100, 12), 0, 0] }));
  assert.deepEqual(sim.types(), ["swing-right"]);
});

test("横握时翻转按手持方向重映射", () => {
  // 横握（左转 90°）：手持坐标系的“前后翻”绕设备 x 轴变成绕手持 y 轴
  const [x, y] = remapHold([0, 1, 0], 90);
  assert.ok(Math.abs(x - -1) < 1e-9 && Math.abs(y) < 1e-9);
  const sim = makeSim({ cfg: { hold: 90 }, u: [1, 0, 0] });
  sim.settle();
  // 设备绕 y 轴转 = 手持坐标系绕 x 轴转：应该是前后翻
  sim.run(1200, (t) => ({
    rot: [0, gauss(t, 400, 150, 760), 0],
    u: [1, 0, 0],
  }));
  assert.ok(
    ["flip-back", "flip-forward"].includes(sim.types()[0]),
    sim.types().join(),
  );
});

// ---------- 抗误触 ----------
test("静止加传感器噪声时没有任何事件", () => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const sim = makeSim();
  sim.settle();
  sim.run(8000, () => ({
    lin: [rnd() * 0.3, rnd() * 0.3, rnd() * 0.3],
    rot: [rnd() * 4, rnd() * 4, rnd() * 4],
  }));
  assert.deepEqual(sim.types(), []);
});

test("慢慢把手机从竖着放平：自己高通时也不误报", () => {
  const sim = makeSim({ provideLin: false });
  sim.settle();
  sim.run(1000, (t) => {
    const a = (90 - (t / 1000) * 90) * D2R; // 1 秒转 90°
    return { u: [0, Math.sin(a), Math.cos(a)], rot: [-90, 0, 0] };
  });
  sim.run(600, () => ({ u: FLAT }));
  // 放平后“屏幕朝上”是正确的事件，除此之外不该有挥动、翻转等误报
  assert.deepEqual(
    sim.types().filter((x) => !x.startsWith("face-")),
    [],
  );
});

test("倾斜角", () => {
  const sim = makeSim();
  const r = 20 * D2R;
  sim.run(3000, () => ({ u: [-Math.sin(r), Math.cos(r), 0] }));
  assert.ok(
    Math.abs(sim.engine.state.roll - 20) < 0.5,
    String(sim.engine.state.roll),
  );

  const pitch = makeSim();
  const p = 30 * D2R; // 手机从竖直向前（顶边远离自己）放倒 60° 以内
  pitch.run(3000, () => ({ u: [0, Math.cos(p), Math.sin(p)] }));
  // u.y = cos30 → pitch = -asin(cos30) = -60
  assert.ok(
    Math.abs(pitch.engine.state.pitch - -60) < 0.5,
    String(pitch.engine.state.pitch),
  );
});
