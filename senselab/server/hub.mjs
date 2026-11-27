// 手柄中继：手机（pad）把动作发上来，电脑上的游戏或监视器（game）收下来。
// 协议见 README。这里只做校验、编号和转发，不保存任何数据。

import { WebSocketServer } from "ws";

const MAX_PLAYERS = 8;
const MAX_PAYLOAD = 2048;
const PAD_RATE_LIMIT = 150; // 每个手柄每秒最多处理的消息数

const num = (v, lo = -1e4, hi = 1e4) => {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.min(hi, Math.max(lo, Math.round(n * 1000) / 1000))
    : 0;
};
const str = (v, max) => String(v ?? "").slice(0, max);

/** 只放行已知字段，别的一律丢掉，免得不明数据原样转发给游戏。 */
export function sanitizePadMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  switch (raw.t) {
    case "state":
      return {
        t: "state",
        seq: num(raw.seq, 0, 2 ** 31),
        tx: num(raw.tx, -1, 1), // 左右倾斜，-1 到 1，右为正
        ty: num(raw.ty, -1, 1), // 前后倾斜，-1 到 1，前为正
        roll: num(raw.roll, -180, 180),
        pitch: num(raw.pitch, -180, 180),
        sx: num(raw.sx, -1, 1), // 虚拟摇杆
        sy: num(raw.sy, -1, 1),
        gx: num(raw.gx, -4000, 4000), // 陀螺仪，度/秒
        gy: num(raw.gy, -4000, 4000),
        gz: num(raw.gz, -4000, 4000),
      };
    case "gesture":
      return {
        t: "gesture",
        name: str(raw.name, 24),
        power: num(raw.power, 0, 500),
        hard: !!raw.hard,
      };
    case "btn":
      return { t: "btn", id: str(raw.id, 8), down: !!raw.down };
    case "hello":
      return { t: "hello", name: str(raw.name, 20) };
    case "ping":
      return { t: "ping", ts: num(raw.ts, 0, 1e15) };
    default:
      return null;
  }
}

export function sanitizeGameMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.t === "rumble") {
    const pattern = Array.isArray(raw.pattern)
      ? raw.pattern.slice(0, 12).map((n) => num(n, 0, 2000))
      : [num(raw.ms ?? 80, 0, 2000)];
    return {
      t: "rumble",
      pattern,
      p: raw.p == null ? null : num(raw.p, 1, MAX_PLAYERS),
    };
  }
  if (raw.t === "ping") return { t: "ping", ts: num(raw.ts, 0, 1e15) };
  return null;
}

// 放行的外部页面：dayfun 站点上的体感手柄（GitHub Pages 是 HTTPS，只能连 wss://）。
// 只放行所有者自己的 Pages 域名；别人的 github.io 不在列表里。
export const PAGES_ORIGINS = ["https://keosu.github.io"];

/** 来源检查：浏览器发起的连接，Origin 必须是访问的主机本身，或在白名单里。防止别的网页偷偷连上来。 */
export function originAllowed(origin, host, allowed = PAGES_ORIGINS) {
  if (!origin) return true; // 非浏览器客户端（游戏引擎、脚本）没有 Origin
  if (allowed.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createHub({
  pin = "",
  log = () => {},
  allowOrigins = PAGES_ORIGINS,
} = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  const rooms = new Map();

  const getRoom = (name) => {
    if (!rooms.has(name))
      rooms.set(name, { pads: new Map(), games: new Set() });
    return rooms.get(name);
  };
  const send = (ws, obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };
  const playerList = (room) =>
    [...room.pads.entries()]
      .map(([p, c]) => ({ p, name: c.name }))
      .sort((a, b) => a.p - b.p);
  const broadcastPlayers = (room) => {
    const msg = { t: "players", list: playerList(room) };
    for (const c of room.pads.values()) send(c.ws, msg);
    for (const g of room.games) send(g, msg);
  };

  function accept(ws, req) {
    const url = new URL(req.url, "http://localhost");
    const role = url.searchParams.get("role");
    const roomName =
      str(url.searchParams.get("room") || "default", 24).replace(
        /[^\w-]/g,
        "",
      ) || "default";
    const room = getRoom(roomName);
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    ws.on("error", () => {});

    if (role === "game") {
      room.games.add(ws);
      send(ws, { t: "welcome", role: "game", room: roomName });
      send(ws, { t: "players", list: playerList(room) });
      ws.on("message", (data) => {
        let msg;
        try {
          msg = sanitizeGameMessage(JSON.parse(data.toString()));
        } catch {
          return;
        }
        if (!msg) return;
        if (msg.t === "ping") return send(ws, { t: "pong", ts: msg.ts });
        for (const [p, c] of room.pads) {
          if (msg.p == null || msg.p === p)
            send(c.ws, { t: "rumble", pattern: msg.pattern });
        }
      });
      ws.on("close", () => room.games.delete(ws));
      return;
    }

    // 手柄：分配最小的空闲编号
    let p = 1;
    while (room.pads.has(p) && p <= MAX_PLAYERS) p++;
    if (p > MAX_PLAYERS) {
      send(ws, { t: "error", message: "房间已满" });
      return ws.close(1013, "full");
    }
    const client = {
      ws,
      name: str(url.searchParams.get("name"), 20) || `玩家${p}`,
      window: 0,
      count: 0,
    };
    room.pads.set(p, client);
    send(ws, {
      t: "welcome",
      role: "pad",
      p,
      room: roomName,
      name: client.name,
    });
    broadcastPlayers(room);
    log(`手柄 P${p}「${client.name}」加入房间 ${roomName}`);

    ws.on("message", (data) => {
      const now = Date.now();
      if (now - client.window > 1000) {
        client.window = now;
        client.count = 0;
      }
      if (++client.count > PAD_RATE_LIMIT) return;
      let msg;
      try {
        msg = sanitizePadMessage(JSON.parse(data.toString()));
      } catch {
        return;
      }
      if (!msg) return;
      if (msg.t === "ping") return send(ws, { t: "pong", ts: msg.ts });
      if (msg.t === "hello") {
        client.name = msg.name || client.name;
        return broadcastPlayers(room);
      }
      const out = JSON.stringify({ ...msg, p, at: now });
      for (const g of room.games) if (g.readyState === 1) g.send(out);
    });
    ws.on("close", () => {
      room.pads.delete(p);
      // 松开所有可能还按着的状态，避免游戏里角色一直在跑
      for (const g of room.games) send(g, { t: "left", p });
      broadcastPlayers(room);
      log(`手柄 P${p} 离开`);
    });
  }

  /** 挂到 http/https 服务器的 upgrade 事件上。 */
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ws") return socket.destroy();
    if (!originAllowed(req.headers.origin, req.headers.host, allowOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      return socket.destroy();
    }
    if (pin && url.searchParams.get("pin") !== pin) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    const role = url.searchParams.get("role");
    if (role !== "pad" && role !== "game") return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => accept(ws, req));
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);
  heartbeat.unref();

  return {
    handleUpgrade,
    rooms,
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
