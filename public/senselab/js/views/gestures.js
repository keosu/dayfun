import {
  h,
  $,
  openSheet,
  field,
  segmented,
  switchEl,
  toast,
  vibrate,
} from "../ui.js";
import { motion, motionStateText } from "../motion.js";
import { LABELS } from "../gestures.js";

export const HOWTO = {
  lift: "手机端稳，向上托一下",
  drop: "手机向下快速一沉",
  "swing-left": "向左轻轻挥一下",
  "swing-right": "向右轻轻挥一下",
  push: "向前（远离自己）推一下",
  pull: "向后（朝自己）拉一下",
  "flick-left": "向左用力甩出去",
  "flick-right": "向右用力甩出去",
  "flick-forward": "向前用力甩出去",
  "flick-back": "向后用力甩回来",
  "shake-lr": "左右来回快速晃几下",
  "shake-ud": "上下来回快速晃几下",
  "shake-fb": "前后来回快速晃几下",
  "flip-forward": "翻个跟头：顶边朝前转半圈",
  "flip-back": "翻个跟头：顶边朝自己转半圈",
  "flip-left": "像翻书一样向左转半圈",
  "flip-right": "像翻书一样向右转半圈",
  "twist-cw": "像拧瓶盖，顺时针转屏幕",
  "twist-ccw": "像拧瓶盖，逆时针转屏幕",
  "face-up": "把手机翻成屏幕朝上",
  "face-down": "把手机扣过来，屏幕朝下",
};

export default {
  mount(root) {
    root.innerHTML = `
      <div class="g-stage">
        <p class="g-status" id="gStatus"></p>
        <div class="g-banner" id="banner">
          <span class="g-emoji">🥋</span>
          <strong class="g-text">动一动手机试试</strong>
          <small class="g-power"></small>
        </div>
        <div class="bubble" id="bubble" aria-hidden="true">
          <i class="cross"></i><i class="dot"></i>
        </div>
        <p class="b-read" id="bRead">左右 0° · 前后 0°</p>
        <div class="g-history" id="history"></div>
        <button class="btn primary big" id="gStart">开始感应</button>
      </div>`;

    const banner = $("#banner", root);
    const history = $("#history", root);
    const status = $("#gStatus", root);
    const startBtn = $("#gStart", root);
    const dot = $(".dot", root);
    const bRead = $("#bRead", root);

    startBtn.addEventListener("click", () => motion.enable());

    function paintStatus() {
      const s = motion.state;
      startBtn.hidden = s === "running";
      if (s === "running") {
        const st = motion.engine.state;
        status.textContent = `感应中 · ${Math.round(st.hz)} Hz${st.signKnown ? "" : " · 校准方向中，请先拿稳一秒"}`;
      } else {
        status.textContent = motionStateText(s);
      }
    }
    motion.on("state", paintStatus);

    function showGesture(ev) {
      const label = LABELS[ev.type] || { emoji: "✨", text: ev.type };
      $(".g-emoji", banner).textContent = label.emoji;
      $(".g-text", banner).textContent = label.text;
      $(".g-power", banner).textContent = ev.power
        ? `力度 ${ev.power}${ev.hard ? " · 重甩" : ""}`
        : ev.angle
          ? `转了 ${ev.angle}°`
          : "";
      banner.classList.remove("pop");
      void banner.offsetWidth; // 重新触发动画
      banner.classList.add("pop");
      const chip = h(`<span class="chip-g"></span>`);
      chip.textContent = `${label.emoji} ${label.text}`;
      history.prepend(chip);
      while (history.children.length > 8) history.lastChild.remove();
      if (motion.settings.haptic)
        vibrate(ev.hard || ev.type.startsWith("flip") ? [30, 30, 30] : 25);
    }
    motion.on("gesture", (ev) => {
      if (root.hidden) return;
      showGesture(ev);
    });

    let timer = 0;
    function tick() {
      paintStatus();
      if (motion.state !== "running") return;
      const t = motion.tilt();
      const r = 0.5 * ($("#bubble", root).clientWidth - dot.clientWidth);
      dot.style.transform = `translate(${t.tx * r}px, ${t.ty * r}px)`;
      bRead.textContent = `左右 ${Math.round(t.roll)}° · 前后 ${Math.round(t.pitch)}°`;
    }

    // ---------- 弹层 ----------
    const codexBtn = h(
      `<button class="icon-btn" aria-label="动作图鉴">📖</button>`,
    );
    const setBtn = h(`<button class="icon-btn" aria-label="设置">⚙️</button>`);

    codexBtn.addEventListener("click", () => {
      openSheet({
        title: "动作图鉴",
        build(body) {
          body.append(
            h(
              `<p class="sheet-tip">做对一次，就会点亮一次。方向都以你的视角为准，和手机怎么拿无关。</p>`,
            ),
          );
          const grid = h(`<div class="codex"></div>`);
          const cells = {};
          for (const [type, label] of Object.entries(LABELS)) {
            const c = h(
              `<div class="codex-item"><span class="ce"></span><div><strong></strong><small></small></div><b class="cc"></b></div>`,
            );
            $(".ce", c).textContent = label.emoji;
            $("strong", c).textContent = label.text;
            $("small", c).textContent = HOWTO[type] || "";
            cells[type] = c;
            grid.append(c);
          }
          const refresh = () => {
            let lit = 0;
            for (const [type, c] of Object.entries(cells)) {
              const n = motion.counts[type] || 0;
              c.classList.toggle("lit", n > 0);
              $(".cc", c).textContent = n ? `×${n}` : "";
              if (n) lit++;
            }
            $("#codexLit", body).textContent =
              `${lit} / ${Object.keys(LABELS).length}`;
          };
          body.append(
            h(`<div class="codex-sum">已点亮 <b id="codexLit"></b></div>`),
            grid,
          );
          const reset = h(`<button class="btn ghost">清空记录</button>`);
          reset.addEventListener("click", () => {
            motion.resetCounts();
            refresh();
          });
          body.append(reset);
          refresh();
          const off = motion.on("gesture", refresh);
          return off;
        },
      });
    });

    setBtn.addEventListener("click", () => {
      openSheet({
        title: "识别设置",
        build(body) {
          const s = motion.settings;
          body.append(
            field(
              "握持方式",
              segmented(
                [
                  ["auto", "自动"],
                  [0, "竖着拿"],
                  [90, "横握·向左"],
                  [-90, "横握·向右"],
                ],
                s.hold,
                (v) => motion.configure({ hold: v }),
              ),
              "只影响“翻转、拧转、倾斜”。前后左右上下的挥动不受影响。",
            ),
            field(
              "灵敏度",
              segmented(
                [
                  ["sensitive", "灵敏"],
                  ["normal", "标准"],
                  ["steady", "迟钝"],
                ],
                s.sens,
                (v) => motion.configure({ sens: v }),
              ),
              "容易误触就调“迟钝”，需要用力过猛才识别就调“灵敏”。",
            ),
            field(
              "识别时震动",
              switchEl(s.haptic, (v) => motion.configure({ haptic: v })),
              "iPhone 的网页不能震动，这个开关只在安卓上有效。",
            ),
          );
          const cal = h(`<button class="btn">把当前姿势设为“正中”</button>`);
          cal.addEventListener("click", () => {
            motion.calibrateTilt();
            toast("已归零");
          });
          const diag = h(`<pre class="diag"></pre>`);
          const st = motion.engine.state;
          const L = motion.latest;
          diag.textContent = [
            `采样率    ${Math.round(st.hz)} Hz`,
            `加速度符号 ${motion.engine.sign === 0 ? "未校准" : motion.engine.sign === 1 ? "安卓式（朝上为正）" : "iOS 式（已取反）"}`,
            `系统线性加速度 ${L.hasLin ? "有" : "没有（用高通代替）"}`,
            `陀螺仪    ${L.hasRot ? "有" : "没有"}`,
          ].join("\n");
          body.append(cal, h(`<h3 class="sub">诊断</h3>`), diag);
        },
      });
    });

    return {
      actions: [codexBtn, setBtn],
      enter() {
        paintStatus();
        timer = setInterval(tick, 40);
      },
      leave() {
        clearInterval(timer);
      },
    };
  },
};
