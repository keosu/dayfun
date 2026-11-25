import { escapeHTML } from "./ui.js";

const colors = [
  "#ffa1a8",
  "#f7cd70",
  "#a7cebe",
  "#aaa0e0",
  "#a9d8ed",
  "#f6b18d",
  "#c0cbe9",
  "#d5b7dd",
];
let wheelRotation = 0;
export function renderScene(mode, options) {
  if (mode === "capsule")
    return /* HTML */ `<div class="capsule-scene" aria-hidden="true">
      <span class="scene-spark spark-left">✦</span
      ><span class="scene-spark spark-right">✧</span>
      <div class="gacha-machine">
        <div class="gacha-sign">HAPPY LITTLE LUCK</div>
        <div class="gacha-globe">
          ${options.map((_, i) => /* HTML */ `<div class="gacha-ball ball-${i % 8}" style="--ball-color:${colors[i % colors.length]};--ball-x:${12 + ((i * 37) % 64)}%;--ball-y:${18 + ((i * 29) % 52)}%;--ball-r:${i * 41}deg"></div>`).join("")}<span
            class="glass-shine"
          ></span>
        </div>
        <div class="gacha-body">
          <span class="gacha-label">把惊喜拧出来</span>
          <div class="gacha-knob"><i></i></div>
          <div class="gacha-opening"></div>
          <div class="winning-capsule"><i></i></div>
        </div>
        <div class="gacha-foot"></div>
      </div>
      <div class="scene-ground"></div>
    </div>`;
  if (mode === "pixel")
    return /* HTML */ `<div class="pixel-scene" aria-hidden="true">
      <div class="pixel-cloud cloud-one"></div>
      <div class="pixel-cloud cloud-two"></div>
      <span class="pixel-caption">PRESS START · FIND YOUR LUCK</span>
      <div class="block-row">
        <div class="brick-block"></div>
        <div class="question-block">?</div>
        <div class="brick-block"></div>
      </div>
      <div class="pixel-coin">★</div>
      <div class="pixel-person">
        <div class="pixel-cap"></div>
        <div class="pixel-head"></div>
        <div class="pixel-body"></div>
        <div class="pixel-legs"></div>
      </div>
      <div class="pixel-ground"></div>
      <div class="pixel-bush"></div>
      <span class="pixel-plus">1UP</span>
    </div>`;
  const step = 360 / options.length;
  const gradient = options
    .map(
      (_, i) =>
        `${colors[i % colors.length]} ${i * step}deg ${(i + 1) * step}deg`,
    )
    .join(",");
  return /* HTML */ `<div class="wheel-scene" aria-hidden="true">
    <span class="scene-spark spark-left">✦</span
    ><span class="scene-spark spark-right">✳</span>
    <div class="wheel-pointer"></div>
    <div class="wheel-frame">
      <div
        class="wheel"
        style="background:conic-gradient(${gradient});transform:rotate(${wheelRotation}deg)"
      >
        ${options.map((option, i) => /* HTML */ `<span class="wheel-label" style="--angle:${(i + 0.5) * step}deg"><span>${escapeHTML(option)}</span></span>`).join("")}
        <div class="wheel-center"><span>小小运气</span><b>LUCK</b>${"✦"}</div>
      </div>
      <div class="wheel-bolts">
        ${Array.from({ length: 12 }, (_, i) => /* HTML */ `<i style="--angle:${i * 30}deg"></i>`).join("")}
      </div>
    </div>
    <div class="wheel-base"></div>
    <div class="scene-ground"></div>
  </div>`;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export function randomIndex(length) {
  const max = 0x100000000 - (0x100000000 % length);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= max);
  return buffer[0] % length;
}
export async function animateScene(container, mode, winner, count) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (mode === "wheel") {
    const wheel = container.querySelector(".wheel");
    const target = (360 - ((winner + 0.5) * 360) / count) % 360;
    wheelRotation = Math.ceil(wheelRotation / 360) * 360 + 360 * 6 + target;
    wheel.style.transition = `transform ${reduced ? 0.1 : 4.2}s cubic-bezier(.12,.72,.12,1)`;
    wheel.style.transform = `rotate(${wheelRotation}deg)`;
    container.classList.add("spinning");
    await pause(reduced ? 150 : 4300);
  } else {
    container.classList.add("spinning");
    await pause(reduced ? 150 : mode === "capsule" ? 2300 : 1900);
  }
  container.classList.remove("spinning");
}

export function playSound(enabled, final = false) {
  if (!enabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const notes = final ? [523, 659, 784, 1047] : [440, 554, 659];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, context.currentTime + index * 0.1);
      gain.gain.linearRampToValueAtTime(
        0.07,
        context.currentTime + index * 0.1 + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + index * 0.1 + 0.22,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.1);
      oscillator.stop(context.currentTime + index * 0.1 + 0.24);
    });
    setTimeout(() => context.close(), 1200);
  } catch {
    /* Audio is optional and browser dependent. */
  }
}
