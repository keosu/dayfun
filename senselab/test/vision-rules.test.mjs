import test from "node:test";
import assert from "node:assert/strict";
import {
  FACE,
  POSE,
  eyeOpenness,
  mouthOpenness,
  headYaw,
  Stable,
  FaceTracker,
  PoseTracker,
  GestureTracker,
  describeGesture,
} from "../../public/senselab/js/vision-rules.js";

// ---------- 合成关键点 ----------

const point = (x, y, visibility = 1) => ({ x, y, z: 0, visibility });

/** 478 个面部点，默认都在画面中央；只设置用到的几个。 */
function faceBase() {
  const lm = Array.from({ length: 478 }, () => point(0.5, 0.5));
  lm[33] = point(0.4, 0.45); // 左眼外角
  lm[133] = point(0.46, 0.45); // 左眼内角
  lm[362] = point(0.54, 0.45); // 右眼内角
  lm[263] = point(0.6, 0.45); // 右眼外角
  lm[FACE.noseTip] = point(0.5, 0.5);
  lm[FACE.lipUp] = point(0.5, 0.55);
  lm[FACE.lipDown] = point(0.5, 0.56);
  lm[FACE.mouthL] = point(0.44, 0.555);
  lm[FACE.mouthR] = point(0.56, 0.555);
  return lm;
}

/** 设置一只眼睛的上下眼睑间距（gap 为 0 即闭眼）。 */
function setEye(lm, side, gap) {
  const [c1, c2] = side === "left" ? [33, 133] : [362, 263];
  const x0 = Math.min(lm[c1].x, lm[c2].x);
  const x1 = Math.max(lm[c1].x, lm[c2].x);
  const y = 0.45;
  const top = y - gap / 2;
  const bot = y + gap / 2;
  const [up1, up2, lo1, lo2] =
    side === "left" ? [160, 158, 153, 144] : [385, 387, 373, 380];
  const mid = (x0 + x1) / 2;
  lm[up1] = point(mid - 0.02, top);
  lm[up2] = point(mid + 0.02, top);
  lm[lo1] = point(mid + 0.02, bot);
  lm[lo2] = point(mid - 0.02, bot);
}

function face({ gap = 0.02, yaw = 0, mouthGap = 0.01 } = {}) {
  const lm = faceBase();
  setEye(lm, "left", gap);
  setEye(lm, "right", gap);
  lm[FACE.noseTip] = point(0.5 + yaw * 0.2, 0.5); // 两眼外角距离 0.2，偏移 = yaw * 0.2
  lm[FACE.lipDown] = point(0.5, 0.55 + mouthGap);
  return lm;
}

/** 全身关键点：站立时臀部在 0.6，脚踝在 0.95，鼻子在 0.2，双手在身体两侧。 */
function body({
  hipY = 0.6,
  ankleY = 0.95,
  lWristY = 0.6,
  rWristY = 0.6,
} = {}) {
  const lm = Array.from({ length: 33 }, () => point(0.5, 0.5));
  lm[POSE.nose] = point(0.5, 0.2);
  lm[POSE.lShoulder] = point(0.4, 0.35);
  lm[POSE.rShoulder] = point(0.6, 0.35);
  lm[POSE.lWrist] = point(0.3, lWristY);
  lm[POSE.rWrist] = point(0.7, rWristY);
  lm[POSE.lHip] = point(0.42, hipY);
  lm[POSE.rHip] = point(0.58, hipY);
  lm[POSE.lAnkle] = point(0.42, ankleY);
  lm[POSE.rAnkle] = point(0.58, ankleY);
  return lm;
}

const feed = (n, fn) => {
  let out = [];
  for (let i = 0; i < n; i++) out = out.concat(fn());
  return out;
};

// ---------- 基础度量 ----------

test("眼睛张开时开合度明显大于闭合时", () => {
  const open = face({ gap: 0.02 });
  const shut = face({ gap: 0 });
  assert.ok(eyeOpenness(open, [33, 160, 158, 133, 153, 144]) > 0.25);
  assert.ok(eyeOpenness(shut, [33, 160, 158, 133, 153, 144]) < 0.05);
});

test("嘴张开时比例变大", () => {
  assert.ok(mouthOpenness(face({ mouthGap: 0.06 })) > 0.35);
  assert.ok(mouthOpenness(face({ mouthGap: 0.01 })) < 0.2);
});

test("头部转向：负数是人转向自己的右边，正数是左边", () => {
  assert.ok(Math.abs(headYaw(face({ yaw: 0 }))) < 0.01);
  assert.ok(headYaw(face({ yaw: -0.5 })) < -0.4);
  assert.ok(headYaw(face({ yaw: 0.5 })) > 0.4);
});

test("Stable 只在连续 n 帧一致后才改变", () => {
  const s = new Stable(3);
  assert.equal(s.step("a"), false);
  assert.equal(s.step("a"), false);
  assert.equal(s.step("a"), true);
  assert.equal(s.step("b"), false); // 单帧抖动不算
  assert.equal(s.step("a"), false);
  assert.equal(s.value, "a");
});

// ---------- 面部 ----------

test("眨眼：闭眼后睁开计一次；单帧闭眼抖动不计", () => {
  const f = new FaceTracker();
  const seq = [
    ...Array(4).fill(face({ gap: 0.02 })),
    ...Array(4).fill(face({ gap: 0 })),
    ...Array(4).fill(face({ gap: 0.02 })),
  ];
  let events = [];
  for (const lm of seq) events = events.concat(f.update(lm).events);
  assert.deepEqual(
    events.filter((e) => e.type === "blink").map((e) => e.total),
    [1],
  );

  // 一帧抖动：不计数
  const g = new FaceTracker();
  let n = 0;
  const glitch = [
    ...Array(4).fill(face({ gap: 0.02 })),
    face({ gap: 0 }),
    ...Array(4).fill(face({ gap: 0.02 })),
  ];
  for (const lm of glitch)
    n += g.update(lm).events.filter((e) => e.type === "blink").length;
  assert.equal(n, 0);
});

test("张嘴和闭嘴各报一次", () => {
  const f = new FaceTracker();
  const types = [];
  for (const lm of [
    ...Array(3).fill(face({ mouthGap: 0.01 })),
    ...Array(3).fill(face({ mouthGap: 0.07 })),
    ...Array(3).fill(face({ mouthGap: 0.01 })),
  ]) {
    types.push(...f.update(lm).events.map((e) => e.type));
  }
  assert.deepEqual(types, ["mouth-open", "mouth-close"]);
});

test("头向右转（人的右边）稳定后报一次，正对镜头不报", () => {
  const f = new FaceTracker();
  const types = feed(6, () =>
    f.update(face({ yaw: -0.5 })).events.map((e) => e.type),
  );
  assert.deepEqual(types, ["turn-right"]);
  assert.equal(f.update(face({ yaw: 0 })).direction, "right"); // 还没稳定回正
  feed(5, () => f.update(face({ yaw: 0 })));
  assert.equal(f.turn.value, "front");
});

// ---------- 姿态 ----------

test("举起左手：左手腕高于鼻子时报告，计数 +1", () => {
  const p = new PoseTracker();
  feed(5, () => p.update(body()));
  const events = feed(5, () => p.update(body({ lWristY: 0.1 })).events);
  assert.deepEqual(events, [{ type: "arms-left", total: 1 }]);
});

test("双手举过头报告 arms-both", () => {
  const p = new PoseTracker();
  feed(5, () => p.update(body()));
  const events = feed(
    5,
    () => p.update(body({ lWristY: 0.1, rWristY: 0.1 })).events,
  );
  assert.equal(events[0].type, "arms-both");
});

test("下蹲：臀部下降、脚踝到臀部的距离明显变短", () => {
  const p = new PoseTracker();
  feed(10, () => p.update(body())); // 站立，记下正常距离（0.35）
  const events = feed(6, () => p.update(body({ hipY: 0.75 })).events);
  assert.deepEqual(events, [{ type: "squat", total: 1 }]);
  feed(6, () => p.update(body()));
  const again = feed(6, () => p.update(body({ hipY: 0.75 })).events);
  assert.deepEqual(again, [{ type: "squat", total: 2 }]);
});

test("跳起：臀部比站立时高出身高的约 6% 以上", () => {
  const p = new PoseTracker();
  feed(10, () => p.update(body()));
  const events = feed(
    6,
    () => p.update(body({ hipY: 0.5, ankleY: 0.75 })).events,
  );
  assert.deepEqual(events, [{ type: "jump", total: 1 }]);
});

test("静止站着不报任何事件", () => {
  const p = new PoseTracker();
  const events = feed(60, () => p.update(body()).events);
  assert.deepEqual(events, []);
});

// ---------- 手势 ----------

test("手势：稳定后报告，None 不单独报告", () => {
  const g = new GestureTracker();
  const names = feed(5, () => g.update(["Thumb_Up", "None"]).events);
  assert.deepEqual(names, [{ type: "gesture", names: ["Thumb_Up"] }]);
  assert.deepEqual(
    feed(5, () => g.update([]).events),
    [],
  );
});

test("手势类别有中文说明，未知类别原样显示", () => {
  assert.equal(describeGesture("Victory").text, "比耶");
  assert.equal(describeGesture("Mystery").text, "Mystery");
});
