import { h, $, toast, segmented } from "../ui.js";
import { VisionRunner } from "../vision.js";
import { describeGesture } from "../vision-rules.js";

const MODES = [
  ["face", "🙂 人脸"],
  ["pose", "🧍 姿态"],
  ["gesture", "✋ 手势"],
];

const POSE_LABEL = {
  stand: ["🧍", "站立"],
  "arms-left": ["🙋", "举起左手"],
  "arms-right": ["🙋", "举起右手"],
  "arms-both": ["🙌", "双手举过头"],
  squat: ["🏋️", "下蹲"],
  jump: ["🤸", "跳起"],
};

const POSE_EVENT = {
  "arms-left": "🙋 举左手",
  "arms-right": "🙋 举右手",
  "arms-both": "🙌 双手举高",
  squat: "🏋️ 下蹲",
  jump: "🤸 跳起",
};

const FACE_EVENT = {
  "turn-left": "⬅️ 头向左转",
  "turn-right": "➡️ 头向右转",
  "mouth-open": "😮 张嘴",
  blink: "😉 眨眼",
};

export default {
  mount(root) {
    root.innerHTML = `
      <div class="cam-page">
        <p class="g-status" id="camStatus">点“开始识别”，允许使用摄像头</p>
        <div class="cam-stage" id="cam">
          <video id="camVideo" playsinline muted></video>
          <canvas id="camCanvas"></canvas>
          <div class="cam-idle" id="camIdle">
            <span class="cam-idle-icon">📷</span>
            <small>画面只在这台设备里处理，不会上传</small>
          </div>
        </div>
        <div class="cam-read">
          <strong class="cam-big" id="camBig">准备好了</strong>
          <small class="cam-detail" id="camDetail">人脸、姿态、手势三选一</small>
        </div>
        <div class="g-history" id="camHistory"></div>
        <div class="cam-controls">
          <div id="camModes"></div>
          <button class="btn primary big" id="camGo" type="button">开始识别</button>
        </div>
      </div>`;

    const video = $("#camVideo", root);
    const canvas = $("#camCanvas", root);
    const cam = $("#cam", root);
    const status = $("#camStatus", root);
    const big = $("#camBig", root);
    const detail = $("#camDetail", root);
    const history = $("#camHistory", root);
    const idle = $("#camIdle", root);
    const goBtn = $("#camGo", root);
    let mode = "face";

    const setStatus = (text, state = "") => {
      status.textContent = text;
      status.dataset.state = state;
    };

    function pushChip(text) {
      const chip = h(`<span class="chip-g"></span>`);
      chip.textContent = text;
      history.prepend(chip);
      while (history.children.length > 8) history.lastChild.remove();
    }

    function show(frame) {
      if (frame.mode !== mode) return;
      setStatus(`识别中 · ${frame.fps} fps`, "running");
      if (frame.mode === "face") showFace(frame);
      else if (frame.mode === "pose") showPose(frame);
      else showGesture(frame);
    }

    function showFace(frame) {
      const f = frame.face;
      if (!f?.found) {
        big.textContent = "🙈 没有检测到人脸";
        detail.textContent = "把脸对准镜头，光线亮一点更准";
        return;
      }
      big.textContent =
        f.direction === "left"
          ? "⬅️ 头向左转"
          : f.direction === "right"
            ? "➡️ 头向右转"
            : "🙂 正对镜头";
      detail.textContent = `眨眼 ${f.blinks} 次 · ${f.mouthOpen ? "嘴张开着" : "嘴闭着"} · ${frame.fps} fps`;
      for (const e of f.events) {
        if (FACE_EVENT[e.type]) pushChip(FACE_EVENT[e.type]);
      }
    }

    function showPose(frame) {
      const p = frame.pose;
      if (!p?.found) {
        big.textContent = "🧍 没看到全身";
        detail.textContent = "退后一点，让头和脚都在画面里";
        return;
      }
      const [emoji, text] = POSE_LABEL[p.state] ?? POSE_LABEL.stand;
      big.textContent = `${emoji} ${text}`;
      const c = p.counts;
      detail.textContent = `下蹲 ${c.squat} · 跳 ${c.jump} · 举手 ${c["arms-left"] + c["arms-right"] + c["arms-both"]} · ${frame.fps} fps`;
      for (const e of p.events) {
        if (POSE_EVENT[e.type]) pushChip(`${POSE_EVENT[e.type]} ×${e.total}`);
      }
    }

    function showGesture(frame) {
      const g = frame.gesture;
      if (!g.hands.length) {
        big.textContent = "✋ 把手举到镜头前";
        detail.textContent = `没有看到手 · ${frame.fps} fps`;
        return;
      }
      big.textContent = g.hands
        .map((x) => {
          const d = describeGesture(x.name);
          return `${d.emoji} ${d.text}`;
        })
        .join("  ·  ");
      detail.textContent = `${g.hands.length} 只手 · ${frame.fps} fps`;
      for (const e of g.events) {
        for (const name of e.names) {
          const d = describeGesture(name);
          pushChip(`${d.emoji} ${d.text}`);
        }
      }
    }

    const runner = new VisionRunner({
      video,
      canvas,
      onFrame: show,
      onStatus: (text) => setStatus(text, "loading"),
      onError: (text) => {
        setStatus(text, "error");
        toast(text, 4000);
      },
    });

    // 只管按钮和画面占位；状态文字由调用方决定，避免把错误提示盖掉
    function paintRunning(on) {
      goBtn.textContent = on ? "停止识别" : "开始识别";
      goBtn.classList.toggle("primary", !on);
      goBtn.classList.toggle("ghost", on);
      idle.hidden = on;
      cam.classList.toggle("mirror", runner.facing === "user");
    }

    function stopCamera(text) {
      runner.stop();
      paintRunning(false);
      setStatus(text, "");
    }

    goBtn.addEventListener("click", async () => {
      if (runner.running) {
        stopCamera("已停止，点“开始识别”再来一次");
        return;
      }
      goBtn.disabled = true;
      const ok = await runner.start(runner.facing);
      goBtn.disabled = false;
      paintRunning(!!ok);
      if (ok) setStatus("正在识别…", "running");
    });

    const modeBox = $("#camModes", root);
    modeBox.append(
      segmented(MODES, mode, async (v) => {
        mode = v;
        const label = MODES.find(([val]) => val === v)[1];
        if (!runner.running) {
          // 没在识别时没有新画面，不能停在“切换中”，只给出待机提示
          big.textContent = "准备好了";
          detail.textContent = `已选：${label}，点“开始识别”`;
          await runner.setMode(v);
          return;
        }
        big.textContent = "切换中…";
        detail.textContent = "";
        await runner.setMode(v);
        setStatus(`识别中 · ${label}`, "running");
      }),
    );

    // 切换前后摄像头放在顶栏
    const flipBtn = h(
      `<button class="icon-btn" aria-label="切换前后摄像头" title="切换前后摄像头">🔄</button>`,
    );
    flipBtn.addEventListener("click", async () => {
      const facing = await runner.flip();
      cam.classList.toggle("mirror", facing === "user");
      toast(facing === "user" ? "已切到前置摄像头" : "已切到后置摄像头");
    });

    // 页面被切到后台时关掉摄像头，避免一直亮着
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && runner.running) {
        stopCamera("已暂停：切到后台时自动关闭了摄像头");
      }
    });

    paintRunning(false);
    return {
      actions: [flipBtn],
      leave() {
        if (runner.running) stopCamera("已停止，点“开始识别”再来一次");
      },
    };
  },
};
