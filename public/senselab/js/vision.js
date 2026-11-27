// 摄像头识别运行器：加载 MediaPipe Tasks Vision，在本机逐帧跑人脸、姿态、手势。
// 画面只在这台设备里处理，不上传；停止时关闭摄像头。
// 库和模型从 CDN 按需下载（第一次要几秒到十几秒），之后同一页面里不重复下载。

import { FaceTracker, PoseTracker, GestureTracker } from "./vision-rules.js";

export const VISION_VERSION = "1.2.3";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const MODELS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  gesture:
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
};
const CLASSES = {
  face: "FaceLandmarker",
  pose: "PoseLandmarker",
  gesture: "GestureRecognizer",
};
const OPTIONS = {
  face: { numFaces: 1 },
  pose: { numPoses: 1 },
  gesture: { numHands: 2 },
};

let libPromise = null;
function loadLib() {
  libPromise ||= import(`${CDN}/vision_bundle.mjs`).catch((e) => {
    libPromise = null;
    throw e;
  });
  return libPromise;
}

const tasks = {};
/** 加载某一种识别器（只加载一次）。GPU 不可用时自动退回 CPU。 */
export function loadTask(kind) {
  tasks[kind] ||= (async () => {
    const v = await loadLib();
    const fileset = await v.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const Cls = v[CLASSES[kind]];
    const make = (delegate) =>
      Cls.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS[kind], delegate },
        runningMode: "VIDEO",
        ...OPTIONS[kind],
      });
    try {
      return { api: v, task: await make("GPU") };
    } catch {
      return { api: v, task: await make("CPU") };
    }
  })().catch((e) => {
    delete tasks[kind];
    throw e;
  });
  return tasks[kind];
}

/** 把浏览器的摄像头错误翻成人话。 */
export function describeCameraError(e) {
  if (!navigator.mediaDevices?.getUserMedia)
    return "这个浏览器不能用摄像头（需要 HTTPS）";
  const name = e?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "没有摄像头权限：请到系统设置里允许浏览器使用摄像头";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "找不到这个摄像头";
  if (name === "NotReadableError")
    return "摄像头被别的应用占用了，先关掉它再试";
  return `摄像头打不开：${e?.message ?? e}`;
}

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
  }

  async start(facing = "user") {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-api");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    this.stream = stream;
    const v = this.video;
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    await v.play();
    return stream;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get live() {
    return !!this.stream?.getVideoTracks().some((t) => t.readyState === "live");
  }
}

// ---------- 绘制（2D 画布，坐标是归一化的） ----------

function strokeLines(ctx, lm, pairs, w, h, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const { start, end } of pairs) {
    const a = lm[start];
    const b = lm[end];
    if (!a || !b) continue;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
  }
  ctx.stroke();
}

function dots(ctx, lm, w, h, color, r) {
  ctx.fillStyle = color;
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- 运行器 ----------

export class VisionRunner {
  /**
   * @param {{video: HTMLVideoElement, canvas: HTMLCanvasElement,
   *          onFrame: (frame: object) => void, onStatus: (text: string) => void,
   *          onError: (text: string) => void}} opts
   */
  constructor({ video, canvas, onFrame, onStatus, onError }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.onError = onError;
    this.camera = new Camera(video);
    this.mode = "face";
    this.facing = "user";
    this.running = false;
    this.raf = 0;
    this.lastTime = -1;
    this.fpsEma = 0;
    this.lastTick = 0;
    this.trackers = null;
    this.loaded = {};
    this.loading = 0;
  }

  get busy() {
    return this.loading > 0;
  }

  resetTrackers() {
    this.trackers = {
      face: new FaceTracker(),
      pose: new PoseTracker(),
      gesture: new GestureTracker(),
    };
  }

  async ensureTask(kind) {
    if (this.loaded[kind]) return this.loaded[kind];
    this.loading++;
    try {
      this.onStatus(
        `正在加载${{ face: "人脸", pose: "姿态", gesture: "手势" }[kind]}模型…（第一次需要下载）`,
      );
      this.loaded[kind] = await loadTask(kind);
      return this.loaded[kind];
    } finally {
      this.loading--;
    }
  }

  /** 打开摄像头并开始识别。必须由用户点击触发（iOS 要求）。 */
  async start(facing = this.facing) {
    if (this.running) return;
    this.facing = facing;
    this.onStatus("正在打开摄像头…");
    try {
      await this.camera.start(facing);
    } catch (e) {
      this.onError(describeCameraError(e));
      return false;
    }
    try {
      await this.ensureTask(this.mode);
    } catch (e) {
      this.camera.stop();
      this.onError(`模型加载失败，请检查网络：${e?.message ?? e}`);
      return false;
    }
    this.resetTrackers();
    this.running = true;
    this.lastTime = -1;
    this.lastTick = performance.now();
    this.fpsEma = 0;
    this.loop();
    return true;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.camera.stop();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 切换前后摄像头：不影响识别状态和计数。 */
  async flip() {
    this.facing = this.facing === "user" ? "environment" : "user";
    if (!this.running) return this.facing;
    try {
      await this.camera.start(this.facing);
    } catch (e) {
      this.onError(describeCameraError(e));
    }
    return this.facing;
  }

  async setMode(mode) {
    this.mode = mode;
    this.resetTrackers();
    this.lastTime = -1;
    if (!this.running) return;
    try {
      await this.ensureTask(mode);
    } catch (e) {
      this.onError(`模型加载失败：${e?.message ?? e}`);
    }
  }

  loop() {
    this.raf = requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    if (!this.running) return;
    const v = this.video;
    const model = this.loaded[this.mode];
    if (
      model &&
      !this.busy &&
      v.readyState >= 2 &&
      v.currentTime !== this.lastTime &&
      v.videoWidth
    ) {
      this.lastTime = v.currentTime;
      const dt = now - this.lastTick;
      this.lastTick = now;
      if (dt > 0)
        this.fpsEma = this.fpsEma
          ? this.fpsEma * 0.9 + (1000 / dt) * 0.1
          : 1000 / dt;
      try {
        this.detect(model, performance.now());
      } catch (e) {
        this.onError(`识别出错：${e?.message ?? e}`);
        this.stop();
        return;
      }
    }
    this.loop();
  }

  detect({ api, task }, t) {
    const v = this.video;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const aspect = w / h;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const frame = {
      mode: this.mode,
      fps: Math.round(this.fpsEma),
      size: { w, h },
    };

    if (this.mode === "face") {
      const res = task.detectForVideo(v, t);
      const lm = res.faceLandmarks?.[0];
      if (lm) {
        const F = api.FaceLandmarker;
        strokeLines(ctx, lm, F.FACE_LANDMARKS_FACE_OVAL, w, h, "#ffffffd0", 2);
        strokeLines(ctx, lm, F.FACE_LANDMARKS_LEFT_EYE, w, h, "#ffffffd0", 2);
        strokeLines(ctx, lm, F.FACE_LANDMARKS_RIGHT_EYE, w, h, "#ffffffd0", 2);
        strokeLines(ctx, lm, F.FACE_LANDMARKS_LIPS, w, h, "#ed8179", 2);
      }
      frame.face = lm
        ? { found: true, ...this.trackers.face.update(lm, aspect) }
        : { found: false };
    } else if (this.mode === "pose") {
      const res = task.detectForVideo(v, t);
      const lm = res.landmarks?.[0];
      if (lm) {
        strokeLines(
          ctx,
          lm,
          api.PoseLandmarker.POSE_CONNECTIONS,
          w,
          h,
          "#ffffffd0",
          4,
        );
        dots(ctx, lm, w, h, "#ed8179", 5);
      }
      frame.pose = lm
        ? { found: true, ...this.trackers.pose.update(lm) }
        : { found: false };
    } else {
      const res = task.recognizeForVideo(v, t);
      const hands = res.landmarks ?? [];
      hands.forEach((lm) => {
        strokeLines(
          ctx,
          lm,
          api.HandLandmarker.HAND_CONNECTIONS,
          w,
          h,
          "#ffffffd0",
          3,
        );
        dots(ctx, lm, w, h, "#8b78c3", 4);
      });
      const names = (res.gestures ?? []).map(
        (g) => g[0]?.categoryName ?? "None",
      );
      const { key, events } = this.trackers.gesture.update(names);
      frame.gesture = {
        hands: (res.gestures ?? []).map((g) => ({
          name: g[0]?.categoryName ?? "None",
          score: g[0]?.score ?? 0,
        })),
        key,
        events,
      };
    }
    this.onFrame(frame);
  }
}
