import { icon } from "./icons.js";
import { getThemePreference, setThemePreference, themeEvent } from "./theme.js";

export function settingsView(
  { config, recipes, picks, reviews, lastSync, usage, offline },
  esc,
) {
  return /* HTML */ ` <nav
      class="settings-tabs"
      role="tablist"
      aria-label="设置分类"
    >
      ${[
        ["preferences", "偏好"],
        ["sync", "同步"],
        ["data", "数据"],
      ]
        .map(
          ([id, label], index) =>
            /* HTML */ `<button
              role="tab"
              id="settings-tab-${id}"
              aria-controls="settings-panel-${id}"
              data-settings-tab="${id}"
              aria-selected="${index === 0}"
              tabindex="${index === 0 ? 0 : -1}"
            >
              ${label}
            </button>`,
        )
        .join("")}
    </nav>
    <section
      class="settings-pane"
      id="settings-panel-preferences"
      role="tabpanel"
      aria-labelledby="settings-tab-preferences"
    >
      <div class="settings-row">
        <span>${icon("sun")} 主题</span>
        <div class="theme-choices" aria-label="选择主题">
          ${[
            ["system", "跟随系统"],
            ["light", "浅色"],
            ["dark", "暗色"],
          ]
            .map(
              ([id, label]) =>
                /* HTML */ `<button
                  data-theme-choice="${id}"
                  aria-pressed="${getThemePreference() === id}"
                >
                  ${label}
                </button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="settings-row">
        <span>${icon("download")} 桌面应用</span
        ><button class="button primary" id="install-app">
          安装 ${icon("arrow")}
        </button>
      </div>
      <div class="settings-row">
        <span>${icon("fullscreen")} 沉浸体验</span
        ><button class="button secondary" id="fullscreen">切换全屏</button>
      </div>
      <p class="settings-note">${esc(offline)}</p>
      <p class="settings-note">
        iOS 请在 Safari 添加到主屏幕，状态栏由系统控制。
      </p>
    </section>
    <section
      class="settings-pane"
      id="settings-panel-sync"
      role="tabpanel"
      aria-labelledby="settings-tab-sync"
      hidden
    >
      <form id="sync-form">
        <label class="field"
          >服务地址<input
            name="url"
            type="url"
            placeholder="https://your-server.example.com"
            value="${esc(config.url)}" /></label
        ><label class="field"
          >访问令牌<input
            name="token"
            type="password"
            autocomplete="off"
            placeholder="服务器访问令牌"
            value="${esc(config.token)}" /></label
        ><label class="checkbox-field"
          ><input type="checkbox" name="auto" ${config.auto ? "checked" : ""} />
          联网后自动同步</label
        >
        <div class="button-row">
          <button class="button secondary" type="submit">保存配置</button
          ><button class="button dark" type="button" id="sync-now">
            ${icon("cloud")} 立即同步
          </button>
        </div>
        <p class="form-status" id="sync-status" role="status">
          ${lastSync ? `上次同步：${esc(lastSync)}` : "未配置服务器，数据保存在本机。"}
        </p>
      </form>
    </section>
    <section
      class="settings-pane"
      id="settings-panel-data"
      role="tabpanel"
      aria-labelledby="settings-tab-data"
      hidden
    >
      <div class="storage-summary">
        <span>菜谱 <b>${recipes}</b></span
        ><span>选择 <b>${picks}</b></span
        ><span>烹饪 <b>${reviews}</b></span
        >${usage ? /* HTML */ `<span>${usage} MB</span>` : ""}
      </div>
      <div class="settings-row">
        <span>${icon("download")} 导出备份</span
        ><button class="button secondary" id="export-data">导出 JSON</button>
      </div>
      <div class="settings-row">
        <span>${icon("upload")} 导入备份</span
        ><label class="button secondary file-button"
          >选择文件<input
            id="import-data"
            type="file"
            accept="application/json,.json"
            hidden
        /></label>
      </div>
      <div class="settings-row">
        <span>${icon("shield")} 持久存储</span
        ><button class="button secondary" id="persist-data">申请保存</button>
      </div>
      <p class="settings-note">
        备份包含照片和记录，不含令牌；导入会合并数据。
      </p>
    </section>`;
}

export function initSettingsView(dialog) {
  const tabs = [...dialog.querySelectorAll("[data-settings-tab]")];
  function selectTab(id) {
    tabs.forEach((button) => {
      const active = button.dataset.settingsTab === id;
      button.setAttribute("aria-selected", active);
      button.tabIndex = active ? 0 : -1;
      dialog.querySelector(
        `#settings-panel-${button.dataset.settingsTab}`,
      ).hidden = !active;
    });
  }
  tabs.forEach((button, index) => {
    button.onclick = () => selectTab(button.dataset.settingsTab);
    button.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      selectTab(tabs[next].dataset.settingsTab);
      tabs[next].focus();
    };
  });
  const updateTheme = () =>
    dialog
      .querySelectorAll("[data-theme-choice]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          button.dataset.themeChoice === getThemePreference(),
        ),
      );
  dialog
    .querySelectorAll("[data-theme-choice]")
    .forEach(
      (button) =>
        (button.onclick = () => setThemePreference(button.dataset.themeChoice)),
    );
  window.addEventListener(themeEvent, updateTheme);
  return () => window.removeEventListener(themeEvent, updateTheme);
}
