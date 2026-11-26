import { $, $$, modal, toolbar } from "./ui.js";
import { icon } from "./icons.js";
import { createSfx } from "./picker/audio.js";
import * as system from "./notify.js";
import "../timer.css";

const storageKey = "little-day:timer";
const maxSeconds = 3 * 60 * 60;
// After ten minutes of shouting the alarm gives up on its own.
const giveUpAfter = 600;

const tasks = [
  {
    id: "noodle",
    name: "泡面",
    emoji: "🍜",
    seconds: 180,
    start: "好嘞，泡面计时{time}！面饼已就位，叉子请准备！",
    done: [
      "叮！泡面好啦！再不吃，面就要泡成宽粉啦！",
      "开饭啦！泡面已经等不及要跳进你的嘴里了！",
    ],
  },
  {
    id: "egg",
    name: "煮鸡蛋",
    emoji: "🥚",
    seconds: 480,
    start: "煮鸡蛋计时{time}，鸡蛋们正在泡热水澡。",
    done: [
      "鸡蛋煮好啦！再煮下去，它就要孵出小鸡了！",
      "叮！鸡蛋说：我已经熟透了，快来救我出锅！",
    ],
  },
  {
    id: "teeth",
    name: "刷牙",
    emoji: "🦷",
    seconds: 120,
    start: "刷牙{time}开始！上刷刷，下刷刷，左刷刷，右刷刷。",
    done: [
      "刷牙时间到！牙齿说谢谢你，我现在亮得能当灯泡了！",
      "叮！细菌们已经全军覆没，可以漱口啦！",
    ],
  },
  {
    id: "homework",
    name: "写作业",
    emoji: "📚",
    seconds: 1500,
    start: "写作业{time}，开始专心！我负责计时，你负责变聪明。",
    done: [
      "作业时间到！大脑请休息，去喝口水吧！",
      "叮咚！学霸模式暂停，奖励自己伸个懒腰！",
    ],
  },
  {
    id: "tv",
    name: "看电视",
    emoji: "📺",
    seconds: 1800,
    start: "看电视{time}，我帮你记着时间，别想赖皮哦。",
    done: [
      "电视时间到！电视说：我也累了，让我睡会儿吧！",
      "叮！动画片里的小伙伴都下班了，你也该让眼睛休息啦！",
    ],
  },
  {
    id: "nap",
    name: "午睡",
    emoji: "😴",
    seconds: 1200,
    start: "午睡{time}，晚安……啊不，午安。呼噜呼噜。",
    done: [
      "起床啦起床啦！太阳都晒到屁股啦！",
      "叮铃铃！小懒猪，午觉结束，起来活动活动！",
    ],
  },
  {
    id: "free",
    name: "随便计时",
    emoji: "⏰",
    seconds: 300,
    start: "倒计时{time}开始！我已经准备好大喊大叫了。",
    done: ["叮咚！时间到啦！", "时间到！我憋了好久，终于可以喊出来了！"],
  },
];

// Each nag gets a little more desperate.
const nagLines = [
  [
    "喂喂，{name}的时间已经到了哦，听见了吗？",
    "叮咚叮咚，你的倒计时在敲门！",
    "时间到啦，我数到三你就关掉我。一，二，二点五……",
  ],
  [
    "已经超时{over}了，我嗓子都快喊冒烟了！",
    "你再不理我，我就要开始唱歌了！啦啦啦，啦啦啦～",
    "超时啦超时啦！小闹钟要生气了，后果很可爱！",
  ],
  [
    "紧急通知！有一个倒计时正在被无情地忽视！",
    "我只是一个闹钟，我没有手，没法自己关掉自己啊！",
    "警报警报！再不关掉，我就要原地转圈圈了！",
  ],
  [
    "好吧我承认，我只是一个想被关注的小闹钟。呜呜呜。",
    "已经超时{over}了！连隔壁的小猫都听见了！",
    "我数到一百，你要是还不关，我就……我就继续数！",
  ],
  [
    "我放弃了，我要去当一个安静的计时器……骗你的！时间到啦！",
    "你赢了，但我还会回来的！叮咚叮咚！",
    "最后通牒：本闹钟将在你关掉我之后，停止吵闹！",
  ],
];
const dismissLines = [
  "终于理我了，感动！闹钟下班啦～",
  "收到收到！我去休息一会儿。",
  "谢谢你关掉我，下次早点哦！",
];
const snoozeLines = [
  "好吧好吧，再给你一分钟，就一分钟哦！",
  "行，再赖一分钟。我先去喝口水。",
];
const quips = [
  "我在认真数数……一千零一，一千零二……",
  "滴答滴答，时间在偷偷溜走哦",
  "你忙你的，我帮你看着",
  "我是专业计时器，绝不偷懒，偶尔发呆",
  "嘘，我在专心倒数",
];
const ringFaces = ["🤩", "😗", "😤", "😱", "🥺", "🤪"];

let state;
let root;
let loop = 0;
let pending = [];
let nagCount = 0;
let lastLine = "";
let lastSecond = -1;
let lastQuip = 0;
let milestones = new Set();
let wakeLock = null;
let voice = null;
const sfx = createSfx(() => state?.sound);

const pad = (value) => String(value).padStart(2, "0");
function clock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours
    ? `${hours}:${pad(minutes)}:${pad(total % 60)}`
    : `${pad(minutes)}:${pad(total % 60)}`;
}
function spoken(seconds) {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest}秒`;
  return rest ? `${minutes}分${rest}秒` : `${minutes}分钟`;
}
const task = () => tasks.find((item) => item.id === state.task) || tasks[0];
function pick(lines) {
  const choices =
    lines.length > 1 ? lines.filter((l) => l !== lastLine) : lines;
  lastLine = choices[Math.floor(Math.random() * choices.length)];
  return lastLine;
}
const fill = (line) =>
  line
    .replace("{time}", spoken(state.total))
    .replace("{name}", task().name)
    .replace("{over}", spoken((Date.now() - state.endAt) / 1000));

function load() {
  const fallback = {
    task: "noodle",
    seconds: 180,
    sound: true,
    voice: true,
    notify: true,
    status: "idle",
    total: 180,
    endAt: 0,
    remaining: 180,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    const valid =
      stored &&
      tasks.some((item) => item.id === stored.task) &&
      ["idle", "running", "paused", "ringing"].includes(stored.status) &&
      [stored.seconds, stored.total, stored.endAt, stored.remaining].every(
        Number.isFinite,
      ) &&
      stored.seconds >= 1 &&
      stored.seconds <= maxSeconds;
    return valid ? { ...fallback, ...stored } : fallback;
  } catch {
    return fallback;
  }
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* Private mode: the timer still works, it just won't survive a reload. */
  }
}
function chooseVoice() {
  const voices = speechSynthesis
    .getVoices()
    .filter((item) => /^zh/i.test(item.lang));
  voice =
    voices.find(
      (item) =>
        /zh[-_]CN/i.test(item.lang) &&
        /xiaoxiao|xiaoyi|tingting|普通话|mandarin/i.test(item.name),
    ) ||
    voices.find((item) => /zh[-_]CN/i.test(item.lang)) ||
    voices[0] ||
    null;
}
function speak(text, level = 0) {
  if (!state.voice || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  if (voice) utterance.voice = voice;
  utterance.pitch = Math.min(2, 1.25 + level * 0.12);
  utterance.rate = Math.min(1.6, 1.05 + level * 0.07);
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}
function hush() {
  pending.forEach(clearTimeout);
  pending = [];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
const later = (fn, ms) => pending.push(setTimeout(fn, ms));

async function holdScreen(on) {
  try {
    if (on && !wakeLock && document.visibilityState === "visible")
      wakeLock = await navigator.wakeLock?.request("screen");
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

function bubble(text) {
  const element = $("#timer-bubble", root);
  if (element.textContent === text) return;
  element.textContent = text;
  element.classList.remove("pop");
  void element.offsetWidth;
  element.classList.add("pop");
}
function setFace(face) {
  $("#timer-face", root).textContent = face;
}
function remaining() {
  if (state.status === "running") return (state.endAt - Date.now()) / 1000;
  if (state.status === "paused") return state.remaining;
  if (state.status === "ringing") return 0;
  return state.seconds;
}

function render() {
  const stage = $(".timer-stage", root);
  const busy = state.status !== "idle";
  stage.dataset.status = state.status;
  const open = $("#tm-open", root);
  open.disabled = busy;
  open.innerHTML = `${task().emoji} ${task().name} · ${clock(state.seconds)} ${icon("down")}`;
  $("#timer-digits", root).toggleAttribute("data-tap", !busy);
  $("#timer-task-name", root).textContent = `${task().emoji} ${task().name}`;
  const actions = {
    idle: /* HTML */ `<button
      class="button primary timer-main"
      data-action="start"
    >
      ${icon("clock")} 开始倒计时
    </button>`,
    running: /* HTML */ `<button class="button secondary" data-action="pause">
        暂停</button
      ><button class="button secondary" data-action="reset">重来</button>`,
    paused: /* HTML */ `<button class="button primary" data-action="resume">
        继续</button
      ><button class="button secondary" data-action="reset">重来</button>`,
    ringing: /* HTML */ `<button
        class="button primary timer-main"
        data-action="dismiss"
      >
        🙉 关掉我</button
      ><button class="button secondary" data-action="snooze">
        😪 再赖 1 分钟
      </button>`,
  };
  $("#timer-actions", root).innerHTML = actions[state.status];
  if (state.status === "idle") {
    stage.dataset.level = "0";
    stage.removeAttribute("data-hurry");
    $("#timer-over", root).textContent = "";
  }
  if (state.status === "paused") {
    setFace("😑");
    bubble("暂停中……我先眯一会儿");
  }
  draw();
}
function draw() {
  const left = remaining();
  const total = state.status === "idle" ? state.seconds : state.total;
  $("#timer-digits", root).textContent = clock(left);
  $(".ring-progress", root).style.strokeDashoffset =
    state.status === "idle" ? 0 : 100 * (1 - Math.max(0, left) / total);
}

function tick() {
  if (state.status === "running") {
    const left = (state.endAt - Date.now()) / 1000;
    if (left <= 0) return ring();
    draw();
    const second = Math.ceil(left);
    const stage = $(".timer-stage", root);
    stage.toggleAttribute("data-hurry", second <= 10);
    if (second !== lastSecond && second <= 10) sfx.tick(second <= 3 ? 1 : 0.6);
    lastSecond = second;
    const done = 1 - left / state.total;
    let face = done < 0.5 ? "🙂" : "😯";
    if (second <= 60 && state.total >= 120) face = "😬";
    if (second <= 10) face = "😰";
    setFace(face);
    const say = (key, text) => {
      if (milestones.has(key)) return false;
      milestones.add(key);
      bubble(text);
      lastQuip = Date.now();
      return true;
    };
    if (second <= 10 && state.total > 15) say("ten", "要来了要来了……");
    else if (second <= 60 && state.total >= 120)
      say("minute", "最后一分钟，准备好了吗？");
    else if (done >= 0.5 && state.total >= 30)
      say("half", "已经过去一半啦，稳住！");
    else if (Date.now() - lastQuip > 25000) {
      bubble(pick(quips));
      lastQuip = Date.now();
    }
  } else if (state.status === "ringing") {
    $("#timer-over", root).textContent =
      `超时 +${clock((Date.now() - state.endAt) / 1000)}`;
  }
}
function run() {
  clearInterval(loop);
  loop = setInterval(tick, 200);
  tick();
}

function start(seconds = state.seconds, line) {
  sfx.unlock();
  // Must be asked inside the tap that starts the timer, or browsers ignore it.
  if (state.notify && system.permission() === "default") system.ask();
  hush();
  state.total = seconds;
  state.endAt = Date.now() + seconds * 1000;
  state.status = "running";
  milestones = new Set();
  lastSecond = -1;
  lastQuip = Date.now();
  save();
  render();
  sfx.boing();
  const text = line || fill(task().start);
  bubble(text);
  speak(text);
  holdScreen(true);
  run();
}
function ring() {
  state.status = "ringing";
  save();
  nagCount = 0;
  render();
  if (!location.hash.startsWith("#/timer")) location.hash = "#/timer";
  nag();
  run();
}
const levelSounds = [
  () => sfx.alarm(0),
  () => (sfx.boing(), sfx.alarm(1)),
  () => sfx.honk(),
  () => (sfx.alarm(3), sfx.slide(true)),
  () => sfx.slide(false),
  () => (sfx.alarm(5), sfx.honk()),
];
function nag() {
  if ((Date.now() - state.endAt) / 1000 > giveUpAfter) {
    stop("喊了十分钟都没人理我，我自己下班了，拜拜！", "😮‍💨");
    return;
  }
  const level = nagCount ? Math.min(5, Math.ceil(nagCount / 2)) : 0;
  const line = fill(pick(level ? nagLines[level - 1] : task().done));
  $(".timer-stage", root).dataset.level = level;
  setFace(ringFaces[level]);
  bubble(line);
  levelSounds[level]();
  navigator.vibrate?.(
    Array.from({ length: 2 + level }, () => [180, 90]).flat(),
  );
  later(() => speak(line, level), 1100);
  // In the foreground the page already shouts; a system notification is for when it is out of sight.
  if (state.notify && document.visibilityState !== "visible")
    system.notify(`${task().emoji} ${task().name}：时间到！`, {
      body: line,
      tag: "timer",
      url: "#/timer",
    });
  nagCount += 1;
  later(nag, level >= 5 ? 12000 : 9000);
}
function stop(line, face) {
  hush();
  clearInterval(loop);
  state.status = "idle";
  save();
  render();
  setFace(face);
  bubble(line);
  later(() => speak(line), 450);
  holdScreen(false);
}

function bindEvents() {
  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start") start();
    if (action === "pause") {
      state.remaining = (state.endAt - Date.now()) / 1000;
      state.status = "paused";
      clearInterval(loop);
      save();
      render();
    }
    if (action === "resume") {
      state.endAt = Date.now() + state.remaining * 1000;
      state.status = "running";
      save();
      render();
      bubble("继续！我又精神了");
      run();
    }
    if (action === "reset") {
      hush();
      clearInterval(loop);
      state.status = "idle";
      save();
      render();
      setFace("🥱");
      bubble("重新来过，选好时间再点开始");
      holdScreen(false);
    }
    if (action === "dismiss") {
      sfx.rimshot();
      stop(pick(dismissLines), "😎");
    }
    if (action === "snooze") start(60, pick(snoozeLines));
    if (
      state.status === "idle" &&
      event.target.closest("#tm-open, #timer-digits")
    )
      openSettings();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (["running", "ringing"].includes(state.status)) {
      holdScreen(true);
      tick();
    }
  });
  if ("speechSynthesis" in window) {
    chooseVoice();
    speechSynthesis.addEventListener?.("voiceschanged", chooseVoice);
  }
}

const minuteSteps = [1, 3, 5, 10, 15, 30, 60];

// The one place where the countdown is configured: task, length, and how it should nag.
function openSettings() {
  const dialog = modal({
    title: "计时设置",
    className: "sheet tm-sheet",
    content: /* HTML */ `<div class="tm-tiles">
        ${tasks
          .map(
            (item) =>
              /* HTML */ `<button class="tm-tile" data-task="${item.id}">
                <span>${item.emoji}</span>${item.name}
              </button>`,
          )
          .join("")}
      </div>
      <div class="tm-time">
        ${[
          ["min", 60, "分"],
          ["sec", 10, "秒"],
        ]
          .map(
            ([unit, step, label]) =>
              /* HTML */ `<div class="tm-step">
                <button data-step="-${step}" aria-label="减少${label}">
                  ${icon("minus")}</button
                ><b id="sh-${unit}">0</b><small>${label}</small
                ><button data-step="${step}" aria-label="增加${label}">
                  ${icon("plus")}
                </button>
              </div>`,
          )
          .join("")}
      </div>
      <div class="tm-chips">
        ${minuteSteps.map((minutes) => /* HTML */ `<button data-set="${minutes * 60}">${minutes} 分</button>`).join("")}
      </div>
      <div class="tm-switches">
        ${[
          ["voice", "搞笑语音"],
          ["sound", "音效"],
          ["notify", "系统通知"],
        ]
          .map(
            ([key, label]) =>
              /* HTML */ `<label class="switch-label"
                ><span>${label}</span
                ><input type="checkbox" data-switch="${key}" /><span
                  class="switch"
                ></span
              ></label>`,
          )
          .join("")}
      </div>
      <p class="tm-hint" id="sh-hint"></p>
      <button class="button primary full-width" data-done>完成</button>`,
  });
  const set = (seconds) => {
    state.seconds = Math.min(maxSeconds, Math.max(1, Math.round(seconds)));
    save();
    sync();
    render();
  };
  function sync() {
    $$("[data-task]", dialog).forEach((button) =>
      button.classList.toggle("active", button.dataset.task === state.task),
    );
    $("#sh-min", dialog).textContent = Math.floor(state.seconds / 60);
    $("#sh-sec", dialog).textContent = pad(state.seconds % 60);
    $$("[data-set]", dialog).forEach((button) =>
      button.classList.toggle(
        "active",
        Number(button.dataset.set) === state.seconds,
      ),
    );
    $$("[data-switch]", dialog).forEach(
      (input) => (input.checked = state[input.dataset.switch]),
    );
    $("#sh-hint", dialog).textContent = state.notify
      ? system.permission() === "granted"
        ? "时间到时，如果页面不在前台，会发系统通知。"
        : system.statusText()
      : "";
  }
  sync();
  dialog.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.task) {
      state.task = target.dataset.task;
      state.seconds = task().seconds;
      save();
      sync();
      render();
      setFace(task().emoji);
      bubble(`${task().name}，${spoken(state.seconds)}，准备好就点开始！`);
    }
    if (target.dataset.set) set(Number(target.dataset.set));
    if ("done" in target.dataset) dialog.close();
  });
  // Steppers repeat while held, so a long countdown does not take dozens of taps.
  let hold = 0;
  const release = () => {
    clearTimeout(hold);
    clearInterval(hold);
  };
  dialog.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-step]");
    if (!button) return;
    const step = Number(button.dataset.step);
    set(state.seconds + step);
    hold = setTimeout(() => {
      hold = setInterval(() => set(state.seconds + step), 110);
    }, 420);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((name) =>
    dialog.addEventListener(name, release),
  );
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (button && event.detail === 0)
      set(state.seconds + Number(button.dataset.step));
  });
  dialog.addEventListener("change", async (event) => {
    const key = event.target.dataset.switch;
    if (!key) return;
    state[key] = event.target.checked;
    if (key === "voice" && !state.voice) window.speechSynthesis?.cancel();
    if (key === "notify" && state.notify) await system.ask();
    save();
    sync();
  });
  dialog.addEventListener("close", release, { once: true });
}

const template = () =>
  /* HTML */ `<div class="tm">
    ${toolbar("⏰ 倒计时", /* HTML */ `<button class="tb-pill" id="tm-open"></button>`)}
    <section class="timer-stage" data-status="idle" data-level="0">
      <div
        class="timer-bubble"
        id="timer-bubble"
        role="status"
        aria-live="polite"
      ></div>
      <div class="timer-clock">
        <span class="ring-word ring-word-left" aria-hidden="true">叮</span>
        <span class="ring-word ring-word-right" aria-hidden="true">铃</span>
        <svg class="timer-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="54" />
          <circle
            class="ring-progress"
            cx="60"
            cy="60"
            r="54"
            pathLength="100"
          />
        </svg>
        <div class="timer-center">
          <div class="timer-face" id="timer-face">🥱</div>
          <div class="timer-digits" id="timer-digits">03:00</div>
          <div class="timer-task-name" id="timer-task-name"></div>
          <div class="timer-over" id="timer-over"></div>
        </div>
      </div>
      <div class="timer-actions" id="timer-actions"></div>
    </section>
  </div>`;

export function mount(element) {
  root = element;
  state = load();
  root.innerHTML = template();
  bindEvents();
  render();
  if (state.status === "idle") bubble("选个事情，点开始，我就开始盯着！");
  if (state.status === "running" || state.status === "ringing") {
    if ((Date.now() - state.endAt) / 1000 > giveUpAfter) {
      state.status = "idle";
      save();
      render();
      bubble("上次的倒计时早就结束啦，再来一个？");
    } else if (state.status === "ringing" || state.endAt <= Date.now()) ring();
    else {
      bubble("我还在计时，没忘哦！");
      run();
    }
  }
  return {
    show() {
      if (state.status === "running" || state.status === "ringing") tick();
    },
  };
}
