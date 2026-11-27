// 手柄连接：WebSocket 到电脑上的中继服务，断线自动重连，并测量延迟。

import { store } from "./ui.js";

export function defaultServer() {
  // 从中继服务打开的页面，直接连同一个地址；其他情况（如静态托管）需要手填
  // 只有从局域网服务打开时才有端口（8443 / 8080）。GitHub Pages 没有端口，不能拿来当手柄地址。
  return location.port ? location.host : "";
}

function loadSettings() {
  const saved = store.get("link", {});
  const params = new URLSearchParams(location.search);
  const pin = params.get("pin");
  return {
    server: saved.server || defaultServer(),
    room: saved.room || "default",
    pin: pin ?? saved.pin ?? "",
    name: saved.name || "",
    rate: saved.rate || 30,
    sendTilt: saved.sendTilt ?? true,
    sendGestures: saved.sendGestures ?? true,
  };
}

class Link {
  constructor() {
    this.settings = loadSettings();
    if (new URLSearchParams(location.search).has("pin"))
      store.set("link", this.settings);
    this.status = "closed"; // closed | connecting | open
    this.player = null;
    this.rtt = null;
    this.listeners = { status: new Set(), message: new Set() };
    this.ws = null;
    this.wantOpen = false;
    this.retry = 0;
    this.timers = [];
  }

  on(kind, fn) {
    this.listeners[kind].add(fn);
    return () => this.listeners[kind].delete(fn);
  }

  save(partial) {
    Object.assign(this.settings, partial);
    store.set("link", this.settings);
  }

  _status(s) {
    this.status = s;
    for (const fn of this.listeners.status) fn(s);
  }

  url() {
    const s = this.settings;
    if (!s.server) return "";
    // 页面是 https 就必须用 wss，否则会被浏览器当作混合内容拦截
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const q = new URLSearchParams({ role: "pad", room: s.room || "default" });
    if (s.name) q.set("name", s.name);
    if (s.pin) q.set("pin", s.pin);
    return `${scheme}://${s.server}/ws?${q}`;
  }

  connect() {
    this.wantOpen = true;
    this._open();
  }

  _open() {
    if (!this.wantOpen || this.ws) return;
    const url = this.url();
    if (!url) {
      this._status("closed");
      return;
    }
    this._status("connecting");
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      this._status("closed");
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this._status("open");
      this._ping();
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === "welcome") this.player = msg.p;
      if (msg.t === "pong") this.rtt = Math.round(performance.now() - msg.ts);
      for (const fn of this.listeners.message) fn(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // 已经被 disconnect 主动关掉并替换
      this.ws = null;
      this.player = null;
      this.rtt = null;
      this._status("closed");
      if (this.wantOpen) {
        const delay = Math.min(5000, 400 * 2 ** this.retry++);
        this.timers.push(setTimeout(() => this._open(), delay));
      }
    };
    ws.onerror = () => {};
  }

  _ping() {
    clearTimeout(this._pingTimer);
    if (this.status !== "open") return;
    this.send({ t: "ping", ts: performance.now() });
    this._pingTimer = setTimeout(() => this._ping(), 2000);
  }

  disconnect() {
    this.wantOpen = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    clearTimeout(this._pingTimer);
    this.ws?.close();
    this.ws = null;
    this._status("closed");
  }

  /** 重新用新设置连接 */
  reconnect() {
    const want = this.wantOpen;
    this.disconnect();
    if (want) this.connect();
  }

  send(obj) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }
}

export const link = new Link();
