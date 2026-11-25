import {
  $,
  $$,
  modal,
  toast,
  escapeHTML as esc,
  dateLabel,
  emptyState,
  appBackButton,
  appSettingsButton,
} from "./ui.js";
import { icon } from "./icons.js";
import { get, put, list, remove, changeEvent } from "./storage.js";
import { validRecords } from "./records.js";
import { randomIndex } from "./picker-scenes.js";
import { createSfx } from "./picker/audio.js";
import { createPickerScene } from "./picker-3d.js";
import { presets, modes } from "./picker-presets.js";
import { createResultPopover } from "./result-popover.js";

let state;
let busy = false;
let scene;
let sceneKey = "";
let sceneReady = Promise.resolve();
let resultPopover;
const sfx = createSfx(() => state?.sound);

async function loadState() {
  const stored = await get("pickset:current");
  const validState =
    stored &&
    validRecords([
      {
        id: "pickset:current",
        type: "pickset",
        payload: stored,
        updatedAt: 1,
        deletedAt: null,
      },
    ]);
  return validState
    ? stored
    : {
        topic: "吃什么",
        mode: "wheel",
        sound: true,
        sets: structuredClone(presets),
      };
}

const template = () =>
  /* HTML */ ` <div class="page-intro">
      <div class="intro-row">
        <div class="intro-title">
          ${appBackButton()}
          <div>
            <h1>随心选 <span class="title-doodle">✦</span></h1>
            <p>小事不纠结，给今天一点小运气。</p>
          </div>
        </div>
        <div class="intro-actions">
          <button class="button secondary" id="picker-history">
            ${icon("history")} 记录</button
          >${appSettingsButton()}
        </div>
      </div>
    </div>
    <div class="picker-layout compact-picker">
      <section
        class="picker-controls selection-panel"
        aria-label="选择主题与编辑候选项"
      >
        <div class="selection-top">
          <div class="topic-chips">
            ${Object.keys(presets)
              .map(
                (topic) =>
                  /* HTML */ `<button class="topic-chip" data-topic="${topic}">
                    ${topic}
                  </button>`,
              )
              .join("")}
          </div>
          <label class="switch-label sound-setting" title="开启音效"
            ><span>音效</span
            ><input
              type="checkbox"
              id="sound-toggle"
              ${state.sound ? "checked" : ""} /><span class="switch"></span
          ></label>
        </div>
        <div class="options-heading">
          <h3>候选项 <span id="option-count"></span></h3>
          <div>
            <button class="text-button" id="reset-options">默认</button
            ><button class="text-button" id="bulk-edit">
              ${icon("copy")} 批量编辑
            </button>
          </div>
        </div>
        <div class="candidate-editor">
          <div id="option-list" class="option-list"></div>
          <form id="add-option" class="add-option">
            <input
              name="option"
              aria-label="新选项"
              placeholder="加一个…"
              maxlength="30"
              autocomplete="off"
            /><button class="icon-button" type="submit" aria-label="添加选项">
              ${icon("plus")}
            </button>
          </form>
        </div>
      </section>
      <section class="picker-playground">
        <div class="mode-tabs" role="tablist" aria-label="随机动画形式">
          ${modes.map((mode) => /* HTML */ `<button class="mode-tab" data-mode="${mode.id}" role="tab">${mode.symbol} ${mode.name}</button>`).join("")}
        </div>
        <div class="scene-heading">
          <span id="current-topic"></span
          ><span class="scene-view-hint">3D · 拖动看看</span>
        </div>
        <div id="picker-scene" class="picker-scene"></div>
        <div
          class="scene-result"
          id="scene-result"
          role="status"
          aria-live="polite"
          hidden
        >
          <div>
            <span class="result-topic">这次选中</span
            ><strong class="result-value"></strong>
          </div>
          <button class="button secondary" id="accept-pick">
            就它了 ${icon("check")}
          </button>
        </div>
        <div class="playground-bottom">
          <button class="button pick-button" id="start-pick">
            ${icon("shuffle")} 转一下
          </button>
          <p id="pick-hint">每个选项都有同样的机会</p>
        </div>
      </section>
    </div>`;

const save = () => put("pickset", state, "pickset:current");
function render() {
  const options = state.sets[state.topic];
  $$(".mode-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
    button.setAttribute("aria-selected", button.dataset.mode === state.mode);
  });
  $$(".topic-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.topic === state.topic);
    button.setAttribute("aria-pressed", button.dataset.topic === state.topic);
  });
  $("#current-topic").textContent =
    `${state.topic} · ${modes.find((mode) => mode.id === state.mode).subtitle}`;
  $("#option-count").textContent = `${options.length}/16`;
  $("#option-list").innerHTML = options
    .map(
      (option, index) =>
        /* HTML */ `<div class="option-row" data-candidate="${index}">
          <input
            aria-label="选项 ${index + 1}"
            value="${esc(option)}"
            maxlength="30"
            data-index="${index}"
            style="width:${Math.min(196, Math.max(56, [...option].length * 15))}px"
          /><button
            class="icon-button remove-option"
            data-index="${index}"
            aria-label="删除选项 ${index + 1}"
            ${options.length <= 2 ? "disabled" : ""}
          >
            ${icon("close")}
          </button>
        </div>`,
    )
    .join("");
  $("#start-pick").innerHTML =
    `${icon("shuffle")} ${modes.find((mode) => mode.id === state.mode).action}`;
  const key = JSON.stringify([state.mode, options]);
  if (key !== sceneKey) {
    resultPopover.hide();
    scene?.dispose();
    scene = null;
    sceneKey = key;
    $("#picker-scene").className = `picker-scene scene-${state.mode}`;
    $("#scene-result").hidden = true;
    $(".picker-playground").classList.remove("has-result");
    // Building WebGL and compiling shaders is a long task; let the page paint first.
    const mode = state.mode;
    const token = key;
    $("#picker-scene").dataset.ready = "false";
    sceneReady = new Promise((resolve) =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (sceneKey === token) {
            scene = createPickerScene($("#picker-scene"), mode, options, {
              sfx,
            });
            $("#picker-scene").dataset.ready = "true";
          }
          resolve();
        }),
      ),
    );
  }
}
function bindEvents() {
  $$(".mode-tab").forEach(
    (button) =>
      (button.onclick = async () => {
        if (busy) return;
        state.mode = button.dataset.mode;
        render();
        await save();
      }),
  );
  $$(".topic-chip").forEach(
    (button) =>
      (button.onclick = async () => {
        if (busy) return;
        state.topic = button.dataset.topic;
        render();
        await save();
      }),
  );
  $("#option-list").addEventListener("change", async (event) => {
    if (!event.target.matches("input")) return;
    const options = state.sets[state.topic];
    const index = Number(event.target.dataset.index);
    const value = event.target.value.trim();
    if (
      !value ||
      options.some((option, i) => option === value && i !== index)
    ) {
      toast("选项不能为空，也不能重复");
      render();
      return;
    }
    options[index] = value;
    render();
    await save();
  });
  $("#option-list").addEventListener("click", async (event) => {
    const button = event.target.closest(".remove-option");
    if (!button || busy || state.sets[state.topic].length <= 2) return;
    state.sets[state.topic].splice(Number(button.dataset.index), 1);
    render();
    await save();
  });
  $("#add-option").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const input = event.target.elements.option;
    const value = input.value.trim();
    if (!value) return input.focus();
    if (state.sets[state.topic].length >= 16) return toast("最多 16 个选项");
    if (state.sets[state.topic].includes(value))
      return toast("这个选项已经有啦");
    state.sets[state.topic].push(value);
    input.value = "";
    render();
    await save();
    input.focus();
  };
  $("#sound-toggle").onchange = async (event) => {
    state.sound = event.target.checked;
    await save();
  };
  $("#reset-options").onclick = async () => {
    if (busy) return;
    state.sets[state.topic] = [...presets[state.topic]];
    render();
    await save();
    toast("已恢复默认选项");
  };
  $("#bulk-edit").onclick = () => {
    if (busy) return;
    const dialog = modal({
      title: "编辑候选项",
      eyebrow: state.topic,
      content: /* HTML */ `<form id="bulk-form">
        <label class="field"
          >每行一个选项，支持 2–16 个<textarea name="options" rows="7" required>
${esc(state.sets[state.topic].join("\n"))}</textarea>
        </label>
        <p class="fine-print">每项最多 30 个字符，空行自动忽略。</p>
        <button class="button primary full-width" type="submit">
          ${icon("check")} 保存候选项
        </button>
        <p class="form-status" role="status"></p>
      </form>`,
    });
    $("#bulk-form", dialog).onsubmit = async (event) => {
      event.preventDefault();
      const options = event.target.elements.options.value
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
      if (
        options.length < 2 ||
        options.length > 16 ||
        options.some((value) => value.length > 30) ||
        new Set(options).size !== options.length
      ) {
        $(".form-status", dialog).textContent =
          "请填写 2–16 个不重复的选项，每个最多 30 字。";
        return;
      }
      state.sets[state.topic] = options;
      await save();
      render();
      dialog.close();
      toast("候选项已保存");
    };
  };
}

async function startPick() {
  if (busy) return;
  resultPopover.hide();
  busy = true;
  const options = [...state.sets[state.topic]],
    winner = randomIndex(options.length),
    mode = state.mode,
    topic = state.topic;
  $$(
    ".picker-controls input, .picker-controls button, .mode-tab, #start-pick",
  ).forEach((element) => {
    element.disabled = true;
  });
  $$(".option-row").forEach((element) => element.classList.remove("selected"));
  $("#scene-result").hidden = true;
  $("#accept-pick").innerHTML = `就它了 ${icon("check")}`;
  $("#start-pick").textContent =
    mode === "wheel"
      ? "好运正在慢慢停靠…"
      : mode === "capsule"
        ? "惊喜正在滚出来…"
        : "跳起来，接住好运…";
  $("#pick-hint").textContent = "看看，今天的答案会是什么";
  sfx.unlock();
  try {
    await sceneReady;
    await scene.animate(winner);
    const result = options[winner];
    await put("pick", { topic, result, mode, options, at: Date.now() });
    navigator.vibrate?.([40, 30, 60]);
    sfx.chime();
    $(`[data-candidate="${winner}"]`).classList.add("selected");
    $(".result-value").textContent = result;
    $("#scene-result").hidden = false;
    $(".picker-playground").classList.add("has-result");
    // Capsule and pixel scenes already show a 3D answer card; a popover would cover it.
    if (mode === "wheel") resultPopover.reveal(result);
    $("#pick-hint").textContent = "答案已经留下，给今天一点新可能";
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
    $$(
      ".picker-controls input, .picker-controls button, .mode-tab, #start-pick",
    ).forEach((element) => {
      element.disabled = false;
    });
    $("#start-pick").innerHTML = `${icon("shuffle")} 再选一次`;
    $$(".remove-option").forEach((button) => {
      button.disabled = options.length <= 2;
    });
  }
}
function acceptPick() {
  resultPopover.hide();
  toast(`今天就选「${$(".result-value").textContent}」啦`);
  $("#accept-pick").innerHTML = `${icon("check")} 就这么定了`;
}
async function showHistory() {
  const records = await list("pick");
  const dialog = modal({
    title: "选择记录",
    eyebrow: `${records.length} 次小幸运`,
    content: records.length
      ? /* HTML */ `<div class="history-list">
          ${records
            .slice(0, 100)
            .map(
              (record) =>
                /* HTML */ `<div class="history-row">
                  <span class="history-symbol"
                    >${record.payload.mode === "capsule" ? "🫧" : record.payload.mode === "pixel" ? "👾" : "🎡"}</span
                  >
                  <div>
                    <span
                      >${esc(record.payload.topic)} ·
                      ${dateLabel(record.updatedAt)}</span
                    ><strong>${esc(record.payload.result)}</strong>
                  </div>
                  <button
                    class="icon-button delete-pick"
                    data-id="${esc(record.id)}"
                    aria-label="删除此记录"
                  >
                    ${icon("trash")}
                  </button>
                </div>`,
            )
            .join("")}
        </div>`
      : emptyState({
          symbol: "🎲",
          title: "还没有选择记录",
          text: "转一次，记下一份小幸运。",
        }),
  });
  $$(".delete-pick", dialog).forEach(
    (button) =>
      (button.onclick = async () => {
        await remove(button.dataset.id);
        button.closest(".history-row").remove();
        if (!$(".history-row", dialog)) dialog.close();
        toast("记录已删除");
      }),
  );
}

export async function mount(root) {
  state = await loadState();
  root.innerHTML = template();
  resultPopover = createResultPopover($(".picker-playground", root));
  bindEvents();
  $("#start-pick").onclick = startPick;
  $("#accept-pick").onclick = acceptPick;
  $("#picker-history").onclick = showHistory;
  render();
  window.addEventListener(changeEvent, async (event) => {
    if (event.detail.type !== "merge" || busy) return;
    const incoming = await get("pickset:current");
    if (incoming) {
      state = incoming;
      $("#sound-toggle").checked = state.sound;
      render();
    }
  });
  return {
    show(params) {
      const topic = params.get("topic");
      if (presets[topic] && topic !== state.topic && !busy) {
        state.topic = topic;
        render();
      }
      scene?.resume?.();
    },
    hide() {
      resultPopover.hide();
      scene?.pause?.();
    },
  };
}
