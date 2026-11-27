// 摄像头识别的规则：纯函数和小状态机，不依赖 DOM 和模型，可以用合成的关键点测试。
//
// 输入是 MediaPipe 的归一化关键点：x、y 都在 0..1 之间，y 向下。
// aspect = 视频宽 / 高，用来把两个方向的距离换算成同样的比例。

/** 面部关键点编号（MediaPipe Face Landmarker，478 点） */
export const FACE = {
  leftEye: [33, 160, 158, 133, 153, 144], // 外眼角、上眼睑两点、内眼角、下眼睑两点
  rightEye: [362, 385, 387, 263, 373, 380],
  noseTip: 1,
  outerEyeL: 33,
  outerEyeR: 263,
  lipUp: 13,
  lipDown: 14,
  mouthL: 61,
  mouthR: 291,
};

/** 姿态关键点编号（MediaPipe Pose Landmarker，33 点）。左右指的是人自己的左右。 */
export const POSE = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lAnkle: 27,
  rAnkle: 28,
};

/** 手势的中文说明（MediaPipe Gesture Recognizer 的内置类别） */
export const GESTURES = {
  None: { emoji: "🖐️", text: "没有识别到手势" },
  Closed_Fist: { emoji: "✊", text: "握拳" },
  Open_Palm: { emoji: "✋", text: "手掌张开" },
  Pointing_Up: { emoji: "☝️", text: "食指向上" },
  Thumb_Down: { emoji: "👎", text: "大拇指向下" },
  Thumb_Up: { emoji: "👍", text: "大拇指向上" },
  Victory: { emoji: "✌️", text: "比耶" },
  ILoveYou: { emoji: "🤟", text: "我爱你" },
};

const dist = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const vis = (p) => (p?.visibility ?? 1) > 0.5;

/** 眼睛开合度（EAR）：上下眼睑距离 / 眼宽。睁开约 0.25 到 0.35，闭合接近 0。 */
export function eyeOpenness(lm, idx, aspect = 1) {
  const p = idx.map((i) => lm[i]);
  const vertical = dist(p[1], p[5], aspect) + dist(p[2], p[4], aspect);
  const horizontal = 2 * dist(p[0], p[3], aspect);
  return horizontal > 0 ? vertical / horizontal : 0;
}

/** 嘴张开程度：上下唇距离 / 嘴宽。 */
export function mouthOpenness(lm, aspect = 1) {
  const width = dist(lm[FACE.mouthL], lm[FACE.mouthR], aspect);
  return width > 0 ? dist(lm[FACE.lipUp], lm[FACE.lipDown], aspect) / width : 0;
}

/**
 * 头部左右转向，约等于鼻尖相对两眼中点的偏移 / 两眼距离。
 * 负数：鼻子往图像左边移，也就是人转向了自己的右边（摄像头不镜像时，人的右边在图像左边）。
 */
export function headYaw(lm, aspect = 1) {
  const l = lm[FACE.outerEyeL];
  const r = lm[FACE.outerEyeR];
  const eyeDist = (r.x - l.x) * aspect;
  if (Math.abs(eyeDist) < 1e-6) return 0;
  const midX = (l.x + r.x) / 2;
  return ((lm[FACE.noseTip].x - midX) * aspect) / eyeDist;
}

/**
 * 稳定值：新值连续出现 n 帧才算数，抗抖动。
 * step() 在稳定值真正变化的那一帧返回 true。
 */
export class Stable {
  constructor(frames = 3) {
    this.frames = frames;
    this.value = undefined;
    this.candidate = undefined;
    this.count = 0;
  }
  step(v) {
    if (v === this.candidate) this.count++;
    else {
      this.candidate = v;
      this.count = 1;
    }
    if (this.count >= this.frames && v !== this.value) {
      this.value = v;
      return true;
    }
    return false;
  }
}

/** 面部：眨眼、张嘴、头部转向。 */
export class FaceTracker {
  constructor({ blinkBelow = 0.2, mouthAbove = 0.35 } = {}) {
    this.blinkBelow = blinkBelow;
    this.mouthAbove = mouthAbove;
    this.eyes = new Stable(2); // 闭眼要稳定两帧，抗抖动
    this.turn = new Stable(4);
    this.blinks = 0;
    this.mouthOn = false;
    this.closedSeen = false;
  }

  /** 每帧调用。返回当前读数和本帧发生的事件。 */
  update(lm, aspect = 1) {
    const events = [];
    const ear =
      (eyeOpenness(lm, FACE.leftEye, aspect) +
        eyeOpenness(lm, FACE.rightEye, aspect)) /
      2;
    if (this.eyes.step(ear < this.blinkBelow)) {
      if (this.eyes.value) this.closedSeen = true;
      // 稳定闭合后重新睁开，算一次眨眼
      else if (this.closedSeen) {
        this.closedSeen = false;
        this.blinks++;
        events.push({ type: "blink", total: this.blinks });
      }
    }

    const mouth = mouthOpenness(lm, aspect);
    const mouthNow = mouth > this.mouthAbove;
    if (mouthNow !== this.mouthOn) {
      this.mouthOn = mouthNow;
      events.push({ type: mouthNow ? "mouth-open" : "mouth-close" });
    }

    const yaw = headYaw(lm, aspect);
    const dir = yaw <= -0.18 ? "right" : yaw >= 0.18 ? "left" : "front";
    const turnChanged = this.turn.step(dir);
    if (turnChanged && dir !== "front") events.push({ type: `turn-${dir}` });

    return {
      ear,
      mouth,
      mouthOpen: this.mouthOn,
      yaw,
      direction: this.turn.value ?? "front",
      blinks: this.blinks,
      events,
    };
  }
}

/**
 * 姿态：举手、下蹲、跳起。
 * 下蹲：脚踝到臀部的竖直距离明显变短（相对站立时最大的距离）。
 * 跳起：臀部比站立时的位置高出约身高的 6%。
 */
export class PoseTracker {
  constructor() {
    this.stable = new Stable(3);
    this.standGap = 0;
    this.hipRef = null;
    this.state = "stand";
    this.counts = {
      "arms-left": 0,
      "arms-right": 0,
      "arms-both": 0,
      squat: 0,
      jump: 0,
    };
  }

  classify(lm) {
    const nose = lm[POSE.nose];
    const lw = lm[POSE.lWrist];
    const rw = lm[POSE.rWrist];
    const lUp = vis(lw) && lw.y < nose.y;
    const rUp = vis(rw) && rw.y < nose.y;

    const hipY = (lm[POSE.lHip].y + lm[POSE.rHip].y) / 2;
    const ankleY = (lm[POSE.lAnkle].y + lm[POSE.rAnkle].y) / 2;
    const bodyH = Math.max(1e-3, ankleY - nose.y);
    const gap = ankleY - hipY;

    // 站立参考：取最近的最大值，慢慢衰减，人走近或退远时也能跟上
    this.standGap = Math.max(gap, this.standGap * 0.998);
    if (this.hipRef == null) this.hipRef = hipY;

    const jump = this.hipRef - hipY > 0.06 * bodyH && this.standGap > 0;
    const squat = !jump && gap < 0.8 * this.standGap;
    if (!jump && !squat) this.hipRef = this.hipRef * 0.99 + hipY * 0.01;

    if (jump) return "jump";
    if (squat) return "squat";
    if (lUp && rUp) return "arms-both";
    if (lUp) return "arms-left";
    if (rUp) return "arms-right";
    return "stand";
  }

  /** 每帧调用。状态稳定后变化时，计数并返回事件。 */
  update(lm) {
    const raw = this.classify(lm);
    const changed = this.stable.step(raw);
    const events = [];
    if (changed) {
      this.state = this.stable.value;
      if (this.state !== "stand") {
        this.counts[this.state]++;
        events.push({ type: this.state, total: this.counts[this.state] });
      }
    }
    return { state: this.state, events, counts: { ...this.counts } };
  }
}

/** 手势：把每只手的类别合成一个键，稳定后报告变化。 */
export class GestureTracker {
  constructor() {
    this.stable = new Stable(4);
    this.last = null;
  }

  /** hands 是每只手的手势类别名数组，例如 ["Thumb_Up", "None"]。 */
  update(names) {
    const key = names.length ? names.join("+") : "";
    const changed = this.stable.step(key);
    const events = [];
    if (changed && key !== "") {
      const list = key.split("+").filter((n) => n !== "None");
      if (list.length) events.push({ type: "gesture", names: list });
    }
    return { key: this.stable.value ?? "", events };
  }
}

/** 把一个手势类别名映射成界面文字（未知的类别原样显示）。 */
export function describeGesture(name) {
  return GESTURES[name] ?? { emoji: "❔", text: name };
}
