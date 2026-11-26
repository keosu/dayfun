import {
  $,
  $$,
  modal,
  toast,
  toolbar,
  escapeHTML as esc,
  dateLabel,
  emptyState,
} from "./ui.js";
import { icon } from "./icons.js";
import { get, put, list, remove, changeEvent } from "./storage.js";
import { validRecords } from "./records.js";
import { randomIndex } from "./picker-scenes.js";
import { createSfx } from "./picker/audio.js";
import { createPickerScene } from "./picker-3d.js";
import { presets, modes, topicEmoji } from "./picker-presets.js";
import { createResultPopover } from "./result-popover.js";

const MAX_OPTIONS = 16;
const MAX_TOPICS = 30;

let state;
let busy = false;
let scene;
let sceneKey = "";
let sceneReady = Promise.resolve();
let resultPopover;
let root;
const sfx = createSfx(() => state?.sound);

const options = () => state.sets[state.topic];
const emojiOf = (name) =>
  Object.hasOwn(topicEmoji, name) ? topicEmoji[name] : "🏷️";

async function loadState() {
  const stored = await get("pickset:current");
  const valid =
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
  if (!valid)
    return {
      topic: "吃什么",
      mode: "wheel",
      sound: true,
      sets: structuredClone(presets),
    };
  // The previous built-in names (小明, 小红 …) give way to the family defaults.
  if (stored.sets.轮到谁?.join() === "小明,小红,小林,小陈")
    stored.sets.轮到谁 = [...presets.轮到谁];
  return stored;
}

const template = () =>
  /* HTML */ `<div class="pk">
    ${toolbar(
      "🎲 随心选",
      /* HTML */ `<button
          class="tb-button"
          id="sound-toggle"
          aria-label="音效"
          aria-pressed="${state.sound}"
        ></button
        ><button class="tb-button" id="picker-history" aria-label="记录">
          ${icon("history")}
        </button>`,
    )}
    <div class="pk-bar">
      <div class="pk-topic">
        <button
          class="pk-pill"
          id="topic-btn"
          aria-haspopup="listbox"
          aria-expanded="false"
        ></button>
        <div class="pk-menu" id="topic-menu" role="listbox" hidden></div>
      </div>
      <button class="pk-pill ghost" id="edit-options">
        ${icon("edit")}<span id="option-count"></span>
      </button>
      <div class="mode-tabs pk-modes" role="tablist" aria-label="随机动画形式">
        ${modes.map((mode) => /* HTML */ `<button class="mode-tab" data-mode="${mode.id}" role="tab" aria-label="${mode.name}" title="${mode.name}">${mode.symbol}<span>${mode.short}</span></button>`).join("")}
      </div>
    </div>
    <section class="pk-stage" id="pk-stage">
      <div id="picker-scene" class="picker-scene"></div>
      <div
        class="scene-result pk-result"
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
    </section>
    <div class="pk-bottom">
      <button class="button pick-button" id="start-pick"></button>
    </div>
  </div>`;

const save = () => put("pickset", state, "pickset:current");

function renderMenu() {
  $("#topic-menu", root).innerHTML =
    Object.entries(state.sets)
      .map(
        ([name, items]) =>
          /* HTML */ `<button
            role="option"
            data-topic="${esc(name)}"
            aria-selected="${name === state.topic}"
            class="${name === state.topic ? "active" : ""}"
          >
            <span>${emojiOf(name)}</span><b>${esc(name)}</b
            ><small>${items.length}</small>
            ${name === state.topic ? icon("check") : ""}
          </button>`,
      )
      .join("") +
    /* HTML */ `<button class="pk-menu-new" data-new-topic>
      <span>＋</span><b>新类别</b>
    </button>`;
}

function render() {
  const items = options();
  const mode = modes.find((item) => item.id === state.mode);
  $$(".mode-tab", root).forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
    button.setAttribute("aria-selected", button.dataset.mode === state.mode);
  });
  $("#topic-btn", root).innerHTML = /* HTML */ `<span
      >${emojiOf(state.topic)}</span
    ><b>${esc(state.topic)}</b>${icon("down")}`;
  $("#option-count", root).textContent = `${items.length} 项`;
  const sound = $("#sound-toggle", root);
  sound.setAttribute("aria-pressed", state.sound);
  sound.innerHTML = icon(state.sound ? "volume" : "mute");
  $("#start-pick", root).innerHTML = `${icon("shuffle")} ${mode.action}`;
  renderMenu();
  const key = JSON.stringify([state.mode, items]);
  if (key !== sceneKey) {
    resultPopover.hide();
    scene?.dispose();
    scene = null;
    sceneKey = key;
    $("#pk-stage", root).dataset.scene = state.mode;
    $("#picker-scene", root).className = `picker-scene scene-${state.mode}`;
    $("#scene-result", root).hidden = true;
    // Building WebGL and compiling shaders is a long task; let the page paint first.
    const token = key;
    const stage = $("#picker-scene", root);
    stage.dataset.ready = "false";
    const current = state.mode;
    sceneReady = new Promise((resolve) =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (sceneKey === token) {
            scene = createPickerScene(stage, current, items, { sfx });
            stage.dataset.ready = "true";
          }
          resolve();
        }),
      ),
    );
  }
}

function setBusy(on) {
  busy = on;
  $$(".mode-tab, #start-pick, #topic-btn, #edit-options", root).forEach(
    (element) => (element.disabled = on),
  );
}

function toggleMenu(open = $("#topic-menu", root).hidden) {
  $("#topic-menu", root).hidden = !open;
  $("#topic-btn", root).setAttribute("aria-expanded", open);
}

function bindEvents() {
  $$(".mode-tab", root).forEach(
    (button) =>
      (button.onclick = async () => {
        if (busy) return;
        state.mode = button.dataset.mode;
        render();
        await save();
      }),
  );
  $("#sound-toggle", root).onclick = async () => {
    state.sound = !state.sound;
    render();
    await save();
  };
  $("#topic-btn", root).onclick = (event) => {
    event.stopPropagation();
    if (!busy) toggleMenu();
  };
  $("#topic-menu", root).onclick = async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    toggleMenu(false);
    if ("newTopic" in button.dataset) return editOptions({ creating: true });
    state.topic = button.dataset.topic;
    render();
    await save();
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".pk-topic")) toggleMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") toggleMenu(false);
  });
  $("#edit-options", root).onclick = () => !busy && editOptions();
}

// One sheet for everything about a category: pick another, rename, add or remove options.
function editOptions({ creating = false } = {}) {
  const dialog = modal({
    title: "类别与选项",
    className: "sheet ps-sheet",
    content: /* HTML */ `<div class="ps-row">
        <select id="ps-select" aria-label="选择类别"></select>
        <button class="button secondary" id="ps-new">＋ 新类别</button>
      </div>
      <form class="ps-create" id="ps-create" hidden>
        <input
          id="ps-newname"
          maxlength="12"
          placeholder="新类别的名字，例如：周末安排"
          autocomplete="off"
        /><button class="button primary" type="submit">创建</button>
      </form>
      <div class="ps-row">
        <input
          id="ps-name"
          maxlength="12"
          aria-label="类别名称"
          autocomplete="off"
        />
        <button
          class="icon-button ps-delete"
          id="ps-delete"
          aria-label="删除类别"
        >
          ${icon("trash")}
        </button>
      </div>
      <div class="ps-list" id="ps-list"></div>
      <form class="ps-add" id="ps-add">
        <input
          name="option"
          maxlength="30"
          autocomplete="off"
          placeholder="加一个选项…"
          aria-label="新选项"
        /><button class="icon-button" type="submit" aria-label="添加选项">
          ${icon("plus")}
        </button>
      </form>
      <div class="ps-foot">
        <button class="text-button" id="ps-reset">恢复默认</button>
        <span id="ps-count"></span>
        <button class="button primary" data-done>完成</button>
      </div>`,
  });
  const names = () => Object.keys(state.sets);
  function paint() {
    $("#ps-select", dialog).innerHTML = names()
      .map(
        (name) =>
          /* HTML */ `<option
            value="${esc(name)}"
            ${name === state.topic ? "selected" : ""}
          >
            ${emojiOf(name)} ${esc(name)}
          </option>`,
      )
      .join("");
    $("#ps-name", dialog).value = state.topic;
    $("#ps-delete", dialog).disabled = names().length <= 1;
    $("#ps-reset", dialog).hidden = !presets[state.topic];
    $("#ps-count", dialog).textContent = `${options().length}/${MAX_OPTIONS}`;
    $("#ps-list", dialog).innerHTML = options()
      .map(
        (option, index) =>
          /* HTML */ `<div class="ps-option">
            <input
              aria-label="选项 ${index + 1}"
              value="${esc(option)}"
              maxlength="30"
              data-index="${index}"
            /><button
              class="icon-button remove-option"
              data-index="${index}"
              aria-label="删除选项 ${index + 1}"
              ${options().length <= 2 ? "disabled" : ""}
            >
              ${icon("close")}
            </button>
          </div>`,
      )
      .join("");
  }
  const commit = async () => {
    paint();
    render();
    await save();
  };
  paint();

  $("#ps-select", dialog).onchange = async (event) => {
    state.topic = event.target.value;
    await commit();
  };
  const create = $("#ps-create", dialog);
  $("#ps-new", dialog).onclick = () => {
    create.hidden = !create.hidden;
    if (!create.hidden) $("#ps-newname", dialog).focus();
  };
  create.onsubmit = async (event) => {
    event.preventDefault();
    const name = $("#ps-newname", dialog).value.trim();
    if (!name) return;
    if (name === "__proto__" || Object.hasOwn(state.sets, name))
      return toast("已经有这个类别了");
    if (names().length >= MAX_TOPICS) return toast("类别太多啦");
    state.sets[name] = ["选项 1", "选项 2"];
    state.topic = name;
    create.hidden = true;
    $("#ps-newname", dialog).value = "";
    await commit();
    $('#ps-list input[data-index="0"]', dialog).select();
  };
  $("#ps-name", dialog).onchange = async (event) => {
    const name = event.target.value.trim();
    if (!name || name === state.topic) return paint();
    if (name === "__proto__" || Object.hasOwn(state.sets, name)) {
      toast("已经有这个类别了");
      return paint();
    }
    // Rebuilding keeps the category where it was in the list.
    state.sets = Object.fromEntries(
      Object.entries(state.sets).map(([key, value]) => [
        key === state.topic ? name : key,
        value,
      ]),
    );
    state.topic = name;
    await commit();
  };
  const del = $("#ps-delete", dialog);
  del.onclick = async () => {
    if (!del.dataset.sure) {
      del.dataset.sure = "1";
      del.classList.add("sure");
      setTimeout(() => {
        delete del.dataset.sure;
        del.classList.remove("sure");
      }, 3000);
      return toast("再点一次，确认删除这个类别");
    }
    delete state.sets[state.topic];
    state.topic = names()[0];
    delete del.dataset.sure;
    del.classList.remove("sure");
    await commit();
  };
  $("#ps-list", dialog).addEventListener("change", async (event) => {
    if (!event.target.matches("input")) return;
    const index = Number(event.target.dataset.index);
    const value = event.target.value.trim();
    if (
      !value ||
      options().some((option, i) => option === value && i !== index)
    ) {
      toast("选项不能为空，也不能重复");
      return paint();
    }
    options()[index] = value;
    await commit();
  });
  $("#ps-list", dialog).addEventListener("click", async (event) => {
    const button = event.target.closest(".remove-option");
    if (!button || options().length <= 2) return;
    options().splice(Number(button.dataset.index), 1);
    await commit();
  });
  $("#ps-add", dialog).onsubmit = async (event) => {
    event.preventDefault();
    const input = event.target.elements.option;
    const value = input.value.trim();
    if (!value) return input.focus();
    if (options().length >= MAX_OPTIONS)
      return toast(`最多 ${MAX_OPTIONS} 个选项`);
    if (options().includes(value)) return toast("这个选项已经有啦");
    options().push(value);
    input.value = "";
    await commit();
    input.focus();
    $("#ps-list", dialog).scrollTop = $("#ps-list", dialog).scrollHeight;
  };
  $("#ps-reset", dialog).onclick = async () => {
    state.sets[state.topic] = [...presets[state.topic]];
    await commit();
    toast("已恢复默认选项");
  };
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-done]")) dialog.close();
  });
  if (creating) {
    create.hidden = false;
    $("#ps-newname", dialog).focus();
  }
}

async function startPick() {
  if (busy) return;
  resultPopover.hide();
  toggleMenu(false);
  setBusy(true);
  const items = [...options()],
    winner = randomIndex(items.length),
    mode = state.mode,
    topic = state.topic;
  $("#scene-result", root).hidden = true;
  $("#accept-pick", root).innerHTML = `就它了 ${icon("check")}`;
  $("#start-pick", root).textContent =
    mode === "wheel"
      ? "好运正在慢慢停靠…"
      : mode === "capsule"
        ? "惊喜正在滚出来…"
        : "跳起来，接住好运…";
  sfx.unlock();
  try {
    await sceneReady;
    await scene.animate(winner);
    const result = items[winner];
    await put("pick", { topic, result, mode, options: items, at: Date.now() });
    navigator.vibrate?.([40, 30, 60]);
    sfx.chime();
    $(".result-value", root).textContent = result;
    $("#scene-result", root).hidden = false;
    // Capsule and pixel scenes already show a 3D answer card; a popover would cover it.
    if (mode === "wheel") resultPopover.reveal(result);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(false);
    $("#start-pick", root).innerHTML = `${icon("shuffle")} 再选一次`;
  }
}
function acceptPick() {
  resultPopover.hide();
  toast(`今天就选「${$(".result-value", root).textContent}」啦`);
  $("#scene-result", root).hidden = true;
}
async function showHistory() {
  const records = await list("pick");
  const dialog = modal({
    title: "选择记录",
    eyebrow: `${records.length} 次小幸运`,
    className: "sheet",
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

export async function mount(element) {
  root = element;
  state = await loadState();
  root.innerHTML = template();
  resultPopover = createResultPopover($("#pk-stage", root));
  bindEvents();
  $("#start-pick", root).onclick = startPick;
  $("#accept-pick", root).onclick = acceptPick;
  $("#picker-history", root).onclick = showHistory;
  render();
  window.addEventListener(changeEvent, async (event) => {
    if (event.detail.type !== "merge" || busy) return;
    const incoming = await get("pickset:current");
    if (incoming && Object.hasOwn(incoming.sets, incoming.topic)) {
      state = incoming;
      render();
    }
  });
  return {
    show(params) {
      const topic = params.get("topic");
      if (
        topic &&
        Object.hasOwn(state.sets, topic) &&
        topic !== state.topic &&
        !busy
      ) {
        state.topic = topic;
        render();
      }
      scene?.resume?.();
    },
    hide() {
      resultPopover.hide();
      toggleMenu(false);
      scene?.pause?.();
    },
  };
}
