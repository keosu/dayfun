import { $, $$, modal, toast, toolbar, escapeHTML as esc } from "./ui.js";
import { icon } from "./icons.js";
import { list, put, remove, changeEvent } from "./storage.js";
import {
  weekdayNames,
  remindChoices,
  remindText,
  remindShort,
  repeatText,
  relativeText,
  dayKey,
  occursOn,
  nextOccurrence,
  weekOf,
  addDays,
  toICS,
} from "./schedule-core.js";
import * as system from "./notify.js";
import "../schedule.css";

const emojis = [
  "📅",
  "🍼",
  "💊",
  "🧹",
  "🗑️",
  "📚",
  "🏃",
  "🛒",
  "💰",
  "🎂",
  "📞",
  "🚗",
];
const mondayFirst = [1, 2, 3, 4, 5, 6, 0];

let root;
let events = [];
let anchor = new Date();

async function load() {
  events = (await list("event")).map((record) => record.payload);
}

const template = () =>
  /* HTML */ `<div class="sc">
    ${toolbar(
      "📅 日程提醒",
      /* HTML */ `<button class="tb-button" id="sc-bell" aria-label="提醒设置">
          ${icon("bell")}</button
        ><button class="tb-pill primary" id="sc-add">
          ${icon("plus")} 添加
        </button>`,
    )}
    <button class="sc-banner" id="sc-banner" hidden></button>
    <div class="sc-head">
      <button class="tb-button" id="sc-prev" aria-label="上一周">
        ${icon("back")}</button
      ><strong id="sc-range"></strong
      ><button class="tb-button flip" id="sc-next" aria-label="下一周">
        ${icon("back")}
      </button>
      <button class="sc-today" id="sc-today">本周</button>
    </div>
    <p class="sc-upcoming" id="sc-upcoming"></p>
    <div class="sc-week" id="sc-week"></div>
  </div>`;

function chip(event, day, now) {
  const [hours, minutes] = event.time.split(":").map(Number);
  const past =
    dayKey(day) === dayKey(now) &&
    hours * 60 + minutes < now.getHours() * 60 + now.getMinutes();
  const tag =
    event.repeat === "once" ? "一次" : event.repeat === "monthly" ? "每月" : "";
  return /* HTML */ `<button
    class="sc-chip ${event.enabled ? "" : "off"} ${past ? "past" : ""}"
    data-id="${esc(event.id)}"
    data-repeat="${event.repeat}"
  >
    <time>${event.time}</time>
    <span>${esc(event.emoji)} ${esc(event.title)}</span>
    ${tag ? /* HTML */ `<i>${tag}</i>` : ""}
  </button>`;
}

function render() {
  const now = new Date();
  const days = weekOf(anchor);
  const first = days[0];
  const last = days[6];
  $("#sc-range", root).textContent =
    `${first.getMonth() + 1}月${first.getDate()}日 – ${first.getMonth() === last.getMonth() ? "" : `${last.getMonth() + 1}月`}${last.getDate()}日`;
  $("#sc-today", root).hidden = days.some((day) => dayKey(day) === dayKey(now));
  $("#sc-week", root).innerHTML = days
    .map((day) => {
      const items = events
        .filter((event) => occursOn(event, day))
        .sort((a, b) => a.time.localeCompare(b.time));
      const today = dayKey(day) === dayKey(now);
      return /* HTML */ `<section class="sc-day ${today ? "today" : ""}">
        <button
          class="sc-dayhead"
          data-add-day="${dayKey(day)}"
          aria-label="在${day.getMonth() + 1}月${day.getDate()}日添加日程"
        >
          <span>周${weekdayNames[day.getDay()]}</span><b>${day.getDate()}</b>
        </button>
        <div class="sc-items">
          ${items.map((event) => chip(event, day, now)).join("")}
        </div>
      </section>`;
    })
    .join("");

  const upcoming = events
    .filter((event) => event.enabled)
    .map((event) => ({ event, at: nextOccurrence(event, now) }))
    .filter((item) => item.at)
    .sort((a, b) => a.at - b.at)[0];
  $("#sc-upcoming", root).innerHTML = upcoming
    ? `下一个 · <b>周${weekdayNames[upcoming.at.getDay()]} ${upcoming.event.time}</b> ${esc(upcoming.event.emoji)} ${esc(upcoming.event.title)} <em>${relativeText(upcoming.at, now)}</em>`
    : events.length
      ? "没有即将到来的提醒"
      : "点右上角「添加」，建一个每周固定的提醒吧";
  renderBanner();
}

function renderBanner() {
  const banner = $("#sc-banner", root);
  const state = system.permission();
  banner.hidden = state === "granted";
  $("#sc-bell", root).classList.toggle("alert", state !== "granted");
  banner.textContent =
    state === "default" && !system.needsInstall()
      ? "开启通知，到点才会提醒你 ›"
      : state === "denied"
        ? "通知被关闭了，点这里查看怎么打开 ›"
        : system.needsInstall()
          ? "iPhone 需先添加到主屏幕才能收到通知 ›"
          : "这个浏览器不支持通知，点这里看替代办法 ›";
  banner.dataset.mode =
    state === "default" && !system.needsInstall() ? "ask" : "info";
}

async function share(eventsToShare, name) {
  const body = toICS(eventsToShare);
  const file = new File([body], `${name}.ics`, { type: "text/calendar" });
  // On phones the share sheet offers "Add to Calendar"; elsewhere a plain download works.
  if (
    matchMedia("(pointer: coarse)").matches &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("日程文件已保存，打开它就能加入系统日历");
}

function openNotifySheet() {
  const dialog = modal({
    title: "提醒设置",
    className: "sheet sc-sheet",
    content: /* HTML */ `<p class="sc-status" id="sc-status"></p>
      <div class="sc-actions">
        <button class="button primary" id="sc-enable">开启通知</button>
        <button class="button secondary" id="sc-test">发送测试通知</button>
        <button class="button secondary" id="sc-ics">
          ${icon("calendar")} 全部加入系统日历
        </button>
      </div>
      <p class="sc-note">
        网页只能在 App 打开、或刚退到后台时弹出提醒。想让提醒在<b
          >完全关掉 App 后</b
        >也响，请点「全部加入系统日历」，由手机自带的日历来负责响铃（安卓和
        iPhone 都支持）。
      </p>`,
  });
  const refresh = () => {
    const granted = system.permission() === "granted";
    $("#sc-status", dialog).textContent = system.statusText();
    $("#sc-enable", dialog).hidden =
      granted || system.permission() !== "default";
    $("#sc-test", dialog).hidden = !granted;
    $("#sc-ics", dialog).disabled = !events.length;
    renderBanner();
  };
  refresh();
  $("#sc-enable", dialog).onclick = async () => {
    await system.ask();
    refresh();
  };
  $("#sc-test", dialog).onclick = async () => {
    const ok = await system.notify("📅 测试提醒", {
      body: "通知正常，到点我就会这样提醒你。",
      tag: "test",
      url: "#/calendar",
    });
    toast(ok ? "已发送，请看通知栏" : "发送失败，请检查系统通知设置");
  };
  $("#sc-ics", dialog).onclick = () =>
    share(
      events.filter((event) => event.enabled),
      "趣日常日程",
    );
}

function editor(existing, preset = {}) {
  const now = new Date();
  const draft = existing
    ? structuredClone(existing)
    : {
        id: crypto.randomUUID(),
        title: "",
        emoji: "📅",
        repeat: "weekly",
        weekdays: [preset.weekday ?? now.getDay()],
        date: preset.date ?? dayKey(now),
        monthDay: Math.min(preset.monthDay ?? now.getDate(), 28),
        time: "09:00",
        remind: [0],
        note: "",
        enabled: true,
      };
  const dialog = modal({
    title: existing ? "编辑日程" : "添加日程",
    className: "sheet sc-sheet",
    content: /* HTML */ `<form id="sc-form" novalidate>
      <div class="sc-titlerow">
        <button
          type="button"
          class="sc-emoji"
          id="sc-emoji"
          aria-label="选择图标"
        ></button>
        <input
          name="title"
          required
          maxlength="40"
          autocomplete="off"
          placeholder="做什么？例如：接宝宝放学"
          value="${esc(draft.title)}"
        />
      </div>
      <div class="sc-emojis" id="sc-emojis" hidden>
        ${emojis.map((item) => /* HTML */ `<button type="button" data-emoji="${item}">${item}</button>`).join("")}
      </div>
      <div class="sc-seg" role="group" aria-label="重复方式">
        ${[
          ["weekly", "每周"],
          ["once", "一次"],
          ["monthly", "每月"],
        ]
          .map(
            ([value, label]) =>
              /* HTML */ `<button type="button" data-repeat="${value}">
                ${label}
              </button>`,
          )
          .join("")}
      </div>
      <div class="sc-when">
        <div class="sc-days" data-pane="weekly">
          ${mondayFirst.map((day) => /* HTML */ `<button type="button" data-day="${day}">${weekdayNames[day]}</button>`).join("")}
        </div>
        <label data-pane="once"
          >日期<input type="date" name="date" value="${draft.date}"
        /></label>
        <label data-pane="monthly"
          >每月<select name="monthDay">
            ${Array.from({ length: 28 }, (_, index) => /* HTML */ `<option value="${index + 1}">${index + 1} 日</option>`).join("")}
            <option value="0">月末最后一天</option>
          </select></label
        >
        <label class="sc-time"
          >时间<input type="time" name="time" required value="${draft.time}"
        /></label>
      </div>
      <div class="sc-label">什么时候提醒（可多选）</div>
      <div class="sc-remind">
        ${remindChoices.map((minutes) => /* HTML */ `<button type="button" data-remind="${minutes}">${remindShort(minutes)}</button>`).join("")}
      </div>
      <input
        class="sc-note-input"
        name="note"
        maxlength="200"
        autocomplete="off"
        placeholder="备注（可选）"
        value="${esc(draft.note)}"
      />
      <p class="form-status" id="sc-error" role="status"></p>
      <div class="sc-foot">
        <button class="button primary" type="submit">保存</button>
        ${
          existing
            ? /* HTML */ `<button
                  type="button"
                  class="button secondary"
                  id="sc-export"
                >
                  ${icon("calendar")} 加入系统日历</button
                ><label class="switch-label sc-enabled"
                  ><span>启用</span
                  ><input
                    type="checkbox"
                    name="enabled"
                    ${draft.enabled ? "checked" : ""} /><span
                    class="switch"
                  ></span></label
                ><button
                  type="button"
                  class="button danger-ghost"
                  id="sc-delete"
                >
                  ${icon("trash")}
                </button>`
            : ""
        }
      </div>
    </form>`,
  });
  const form = $("#sc-form", dialog);
  form.elements.monthDay.value = String(draft.monthDay);
  const paint = () => {
    $("#sc-emoji", dialog).textContent = draft.emoji;
    $$("[data-repeat]", dialog).forEach((button) =>
      button.classList.toggle("active", button.dataset.repeat === draft.repeat),
    );
    $$("[data-pane]", dialog).forEach(
      (pane) => (pane.hidden = pane.dataset.pane !== draft.repeat),
    );
    $$("[data-day]", dialog).forEach((button) =>
      button.classList.toggle(
        "active",
        draft.weekdays.includes(Number(button.dataset.day)),
      ),
    );
    $$("[data-remind]", dialog).forEach((button) =>
      button.classList.toggle(
        "active",
        draft.remind.includes(Number(button.dataset.remind)),
      ),
    );
  };
  paint();
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "sc-emoji")
      $("#sc-emojis", dialog).hidden = !$("#sc-emojis", dialog).hidden;
    if (button.dataset.emoji) {
      draft.emoji = button.dataset.emoji;
      $("#sc-emojis", dialog).hidden = true;
    }
    if (button.dataset.repeat) draft.repeat = button.dataset.repeat;
    if (button.dataset.day) {
      const day = Number(button.dataset.day);
      draft.weekdays = draft.weekdays.includes(day)
        ? draft.weekdays.filter((item) => item !== day)
        : [...draft.weekdays, day];
    }
    if (button.dataset.remind) {
      const minutes = Number(button.dataset.remind);
      const next = draft.remind.includes(minutes)
        ? draft.remind.filter((item) => item !== minutes)
        : [...draft.remind, minutes];
      if (next.length) draft.remind = next.sort((a, b) => a - b);
    }
    paint();
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = data.get("title").trim();
    const error = $("#sc-error", dialog);
    if (!title) return (error.textContent = "先写下要做什么。");
    if (draft.repeat === "weekly" && !draft.weekdays.length)
      return (error.textContent = "至少选一天。");
    if (draft.repeat === "once" && !data.get("date"))
      return (error.textContent = "请选择日期。");
    if (!data.get("time")) return (error.textContent = "请选择时间。");
    // Asking for permission has to start inside this tap, before any await.
    const asked =
      system.permission() === "default" ? system.ask() : Promise.resolve();
    const payload = {
      id: draft.id,
      title,
      emoji: draft.emoji,
      repeat: draft.repeat,
      weekdays: draft.weekdays,
      date: data.get("date") || draft.date,
      monthDay: Number(data.get("monthDay")),
      time: data.get("time"),
      remind: draft.remind,
      note: data.get("note").trim(),
      enabled: existing ? form.elements.enabled.checked : true,
    };
    try {
      await put("event", payload, `event:${payload.id}`);
      await asked;
      dialog.close();
      await load();
      render();
      toast(`已保存：${repeatText(payload)} ${payload.time}`);
    } catch (failure) {
      error.textContent = failure.message;
    }
  };
  $("#sc-export", dialog)?.addEventListener("click", () =>
    share(
      [
        {
          ...draft,
          title: form.elements.title.value.trim() || draft.title,
          time: form.elements.time.value,
        },
      ],
      draft.title || "日程",
    ),
  );
  const del = $("#sc-delete", dialog);
  if (del)
    del.onclick = async () => {
      if (!del.dataset.sure) {
        del.dataset.sure = "1";
        del.textContent = "确认删除";
        setTimeout(() => {
          if (!del.isConnected) return;
          delete del.dataset.sure;
          del.innerHTML = icon("trash");
        }, 3000);
        return;
      }
      await remove(`event:${draft.id}`);
      dialog.close();
      await load();
      render();
      toast("日程已删除");
    };
  if (!existing) form.elements.title.focus();
}

export async function mount(element) {
  root = element;
  root.innerHTML = template();
  await load();
  render();
  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.id === "sc-add") editor(null);
    if (target.id === "sc-bell") openNotifySheet();
    if (target.id === "sc-banner") {
      if (target.dataset.mode === "ask") system.ask().then(renderBanner);
      else openNotifySheet();
    }
    if (target.id === "sc-prev") {
      anchor = addDays(anchor, -7);
      render();
    }
    if (target.id === "sc-next") {
      anchor = addDays(anchor, 7);
      render();
    }
    if (target.id === "sc-today") {
      anchor = new Date();
      render();
    }
    if (target.dataset.id)
      editor(events.find((item) => item.id === target.dataset.id));
    if (target.dataset.addDay) {
      const [year, month, day] = target.dataset.addDay.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      editor(null, {
        weekday: date.getDay(),
        date: target.dataset.addDay,
        monthDay: day,
      });
    }
  });
  window.addEventListener(changeEvent, async (event) => {
    if (["event", "merge"].includes(event.detail.type)) {
      await load();
      render();
    }
  });
  // Keeps "today" and greyed-out past items honest while the page stays open.
  setInterval(() => {
    if (!root.hidden) render();
  }, 60_000);
  return {
    async show() {
      await load();
      render();
    },
  };
}
