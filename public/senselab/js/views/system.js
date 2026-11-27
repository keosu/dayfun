import { h, $, toast, vibrate, isIOS, isStandalone } from "../ui.js";

const PATTERNS = [
  ["短", [60]],
  ["长", [400]],
  ["心跳", [80, 80, 80, 400, 80, 80, 80]],
  [
    "SOS",
    [
      100, 60, 100, 60, 100, 160, 300, 60, 300, 60, 300, 160, 100, 60, 100, 60,
      100,
    ],
  ],
];

/** iOS 18 的 Safari 在切换 <input switch> 时会给一下轻触反馈，是目前网页唯一的办法。 */
function iosHaptic() {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText =
    "position:fixed;left:-99px;top:0;opacity:0;pointer-events:none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.append(input);
  document.body.append(label);
  label.click();
  setTimeout(() => label.remove(), 60);
}

let audioCtx = null;
function beep(freq = 660, ms = 180) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  audioCtx ||= new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    audioCtx.currentTime + ms / 1000,
  );
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + ms / 1000 + 0.05);
  return true;
}

function tile(icon, name, hint) {
  const el = h(`
    <button class="cap" type="button">
      <span class="cap-icon"></span>
      <strong></strong>
      <small class="cap-res"></small>
    </button>`);
  $(".cap-icon", el).textContent = icon;
  $("strong", el).textContent = name;
  const res = $(".cap-res", el);
  res.textContent = hint;
  const api = {
    el,
    say(text, state) {
      res.textContent = text;
      el.dataset.state = state || "";
    },
  };
  return api;
}

export default {
  mount(root) {
    const grid = h(`<div class="caps scroll"></div>`);
    root.append(grid);

    // ---------- 震动 ----------
    const vib = h(`
      <div class="cap wide">
        <span class="cap-icon">📳</span>
        <strong>震动</strong>
        <small class="cap-res"></small>
        <div class="pills"></div>
      </div>`);
    const vibRes = $(".cap-res", vib);
    vibRes.textContent =
      typeof navigator.vibrate === "function"
        ? "安卓可用，点下面的节奏试试"
        : isIOS
          ? "iPhone 的网页没有震动接口，点下面试试轻触反馈（iOS 18）"
          : "这个浏览器不支持";
    for (const [name, pattern] of PATTERNS) {
      const b = h(`<button type="button" class="pill"></button>`);
      b.textContent = name;
      b.addEventListener("click", () => {
        if (vibrate(pattern)) {
          vibRes.textContent = `已发出「${name}」震动`;
        } else if (isIOS) {
          iosHaptic();
          vibRes.textContent = "已尝试 iOS 轻触反馈；感觉不到就说明系统不支持";
        } else {
          vibRes.textContent = "这个浏览器或设备不支持网页震动";
        }
      });
      $(".pills", vib).append(b);
    }
    grid.append(vib);

    // ---------- 通知 ----------
    const noti = tile("🔔", "系统通知", "点一下，申请权限并发一条测试通知");
    noti.el.addEventListener("click", async () => {
      if (!("Notification" in window)) {
        return noti.say(
          isIOS && !isStandalone
            ? "iPhone 需先“添加到主屏幕”，再从主屏幕图标打开"
            : "这个浏览器不支持通知",
          "bad",
        );
      }
      if (!window.isSecureContext) return noti.say("需要 HTTPS", "bad");
      // 权限必须在点击的同步调用栈里请求
      const perm = await Notification.requestPermission();
      if (perm !== "granted")
        return noti.say(
          perm === "denied" ? "已被拒绝，请到系统设置里开启" : "没有选择允许",
          "bad",
        );
      const opts = {
        body: "收到这条，说明通知能力正常 🎉",
        icon: "icons/icon-192.png",
        tag: "senselab-test",
      };
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.showNotification("体感实验室", opts);
        else new Notification("体感实验室", opts);
        noti.say("已发送，注意看通知栏", "ok");
      } catch (e) {
        noti.say(`发送失败：${e.message}`, "bad");
      }
    });
    grid.append(noti.el);

    // ---------- 屏幕常亮 ----------
    let lock = null;
    const wake = tile("☀️", "屏幕常亮", "玩手柄时不让屏幕熄灭");
    const acquire = async () => {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => {
        if (lock) wake.say("已被系统释放（切到后台会这样）", "");
        lock = null;
      });
    };
    wake.el.addEventListener("click", async () => {
      if (!navigator.wakeLock)
        return wake.say("这个浏览器不支持（iOS 16.4 以前不支持）", "bad");
      try {
        if (lock) {
          const l = lock;
          lock = null;
          await l.release();
          wake.say("已关闭常亮", "");
        } else {
          await acquire();
          wake.say("常亮已开启，再点一次关闭", "ok");
        }
      } catch (e) {
        wake.say(`失败：${e.message}`, "bad");
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (
        document.visibilityState === "visible" &&
        lock === null &&
        wake.el.dataset.state === "ok"
      )
        acquire().catch(() => {});
    });
    grid.append(wake.el);

    // ---------- 全屏 ----------
    const full = tile("📺", "全屏", "进入或退出全屏");
    full.el.addEventListener("click", async () => {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (!req)
        return full.say(
          isIOS
            ? "iPhone 的 Safari 不支持网页全屏：请“添加到主屏幕”后从图标打开"
            : "不支持",
          "bad",
        );
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          await exit.call(document);
          full.say("已退出全屏", "");
        } else {
          await req.call(el);
          full.say("已全屏，再点一次退出", "ok");
        }
      } catch (e) {
        full.say(`失败：${e.message}`, "bad");
      }
    });
    grid.append(full.el);

    // ---------- 锁定横屏 ----------
    const orient = tile("🔄", "锁定横屏", "横握当手柄更顺手");
    orient.el.addEventListener("click", async () => {
      if (!screen.orientation?.lock)
        return orient.say(
          isIOS
            ? "iOS 不能由网页锁定方向，请在控制中心打开“方向锁定”后横握"
            : "不支持",
          "bad",
        );
      try {
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen?.();
        await screen.orientation.lock("landscape");
        orient.say("已锁定横屏（退出全屏即解除）", "ok");
      } catch (e) {
        orient.say(`失败：${e.message}`, "bad");
      }
    });
    grid.append(orient.el);

    // ---------- 分享、剪贴板 ----------
    const share = tile("📤", "系统分享", "呼出系统分享面板");
    share.el.addEventListener("click", async () => {
      if (!navigator.share) return share.say("这个浏览器不支持分享", "bad");
      try {
        await navigator.share({
          title: "体感实验室",
          text: "把手机变成体感手柄",
          url: location.href,
        });
        share.say("已分享", "ok");
      } catch (e) {
        share.say(
          e.name === "AbortError"
            ? "你取消了分享（能呼出面板就是正常）"
            : `失败：${e.message}`,
          e.name === "AbortError" ? "ok" : "bad",
        );
      }
    });
    grid.append(share.el);

    const clip = tile("📋", "剪贴板", "写入一句话，再读回来");
    clip.el.addEventListener("click", async () => {
      if (!navigator.clipboard)
        return clip.say("需要 HTTPS，或浏览器不支持", "bad");
      try {
        const text = `体感实验室 ${new Date().toLocaleTimeString()}`;
        await navigator.clipboard.writeText(text);
        let back = "";
        try {
          back = await navigator.clipboard.readText();
        } catch {
          // 读取常需要额外授权，写入成功即可
        }
        clip.say(
          back === text ? `读写都正常：${text}` : "已写入，读取需要额外授权",
          "ok",
        );
      } catch (e) {
        clip.say(`失败：${e.message}`, "bad");
      }
    });
    grid.append(clip.el);

    // ---------- 声音、语音 ----------
    const sound = tile("🔊", "播放声音", "发出一声提示音");
    sound.el.addEventListener("click", () => {
      const ok = beep();
      sound.say(
        ok ? "听到“嘀”了吗？没声音请检查静音开关" : "不支持 Web Audio",
        ok ? "ok" : "bad",
      );
    });
    grid.append(sound.el);

    const speak = tile("🗣️", "语音朗读", "让手机说一句中文");
    speak.el.addEventListener("click", () => {
      if (!("speechSynthesis" in window))
        return speak.say("不支持语音合成", "bad");
      const u = new SpeechSynthesisUtterance(
        "你好，我是体感实验室，一起来玩吧",
      );
      u.lang = "zh-CN";
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      speak.say("正在朗读…没声音请检查静音和音量", "ok");
    });
    grid.append(speak.el);

    // ---------- 安装 ----------
    const install = tile("📲", "安装到主屏幕", "");
    const showInstall = () => {
      if (isStandalone) install.say("已经是从主屏幕打开的 App 了", "ok");
      else if (window.deferredInstall) install.say("点一下，安装到主屏幕", "");
      else if (isIOS) install.say("点 Safari 的分享按钮，选“添加到主屏幕”", "");
      else install.say("用浏览器菜单里的“安装应用”或“添加到主屏幕”", "");
    };
    showInstall();
    install.el.addEventListener("click", async () => {
      const ev = window.deferredInstall;
      if (!ev) return showInstall();
      ev.prompt();
      const { outcome } = await ev.userChoice;
      window.deferredInstall = null;
      install.say(
        outcome === "accepted" ? "已安装" : "你取消了安装",
        outcome === "accepted" ? "ok" : "",
      );
    });
    grid.append(install.el);

    // ---------- 环境概览 ----------
    const env = h(
      `<div class="cap wide info"><span class="cap-icon">ℹ️</span><strong>运行环境</strong><small class="cap-res"></small></div>`,
    );
    $(".cap-res", env).textContent = [
      window.isSecureContext ? "HTTPS ✅" : "非 HTTPS ❌",
      isStandalone ? "已安装 ✅" : "浏览器标签页",
      `Service Worker ${"serviceWorker" in navigator ? "✅" : "❌"}`,
      `Wake Lock ${navigator.wakeLock ? "✅" : "❌"}`,
    ].join(" · ");
    grid.append(env);

    return {};
  },
};
