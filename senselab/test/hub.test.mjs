import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket from "ws";
import {
  createHub,
  sanitizePadMessage,
  originAllowed,
  PAGES_ORIGINS,
} from "../server/hub.mjs";

function boot(opts) {
  return new Promise((resolve) => {
    const hub = createHub(opts);
    const server = http.createServer();
    server.on("upgrade", hub.handleUpgrade);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        hub,
        close: () => {
          hub.close();
          server.close();
        },
      });
    });
  });
}

/** 连接并收集消息的小工具 */
function client(port, query, headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${query}`, { headers });
  const inbox = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  const opened = new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
    ws.on("unexpected-response", (_r, resp) =>
      rej(new Error(`HTTP ${resp.statusCode}`)),
    );
  });
  const waitFor = async (pred, ms = 1500) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = inbox.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("等待消息超时：" + JSON.stringify(inbox));
  };
  return { ws, inbox, opened, waitFor };
}

test("手柄消息转发给游戏，并带上玩家编号", async () => {
  const s = await boot();
  try {
    const game = client(s.port, "role=game");
    await game.opened;
    const pad = client(s.port, "role=pad&name=%E5%AE%9D%E5%AE%9D");
    await pad.opened;
    const welcome = await pad.waitFor((m) => m.t === "welcome");
    assert.equal(welcome.p, 1);
    assert.equal(welcome.name, "宝宝");

    pad.ws.send(
      JSON.stringify({
        t: "gesture",
        name: "flick-right",
        power: 21.3,
        hard: true,
      }),
    );
    const g = await game.waitFor((m) => m.t === "gesture");
    assert.equal(g.p, 1);
    assert.equal(g.name, "flick-right");
    assert.equal(g.hard, true);

    pad.ws.send(
      JSON.stringify({ t: "state", tx: 3, ty: -0.5, sx: 0.25, evil: "x" }),
    );
    const st = await game.waitFor((m) => m.t === "state");
    assert.equal(st.tx, 1, "超范围的值被限制");
    assert.equal(st.ty, -0.5);
    assert.equal("evil" in st, false, "未知字段被丢掉");

    // 游戏回传震动
    game.ws.send(JSON.stringify({ t: "rumble", pattern: [50, 30, 50] }));
    const r = await pad.waitFor((m) => m.t === "rumble");
    assert.deepEqual(r.pattern, [50, 30, 50]);
  } finally {
    s.close();
  }
});

test("多个手柄按顺序编号，离开后编号可复用", async () => {
  const s = await boot();
  try {
    const game = client(s.port, "role=game");
    await game.opened;
    const a = client(s.port, "role=pad");
    await a.opened;
    await a.waitFor((m) => m.t === "welcome" && m.p === 1);
    const b = client(s.port, "role=pad");
    await b.opened;
    await b.waitFor((m) => m.t === "welcome" && m.p === 2);
    a.ws.close();
    await game.waitFor((m) => m.t === "left" && m.p === 1);
    const c = client(s.port, "role=pad");
    await c.opened;
    await c.waitFor((m) => m.t === "welcome" && m.p === 1);
  } finally {
    s.close();
  }
});

test("不同房间互不干扰", async () => {
  const s = await boot();
  try {
    const game = client(s.port, "role=game&room=a");
    const other = client(s.port, "role=game&room=b");
    await Promise.all([game.opened, other.opened]);
    const pad = client(s.port, "role=pad&room=a");
    await pad.opened;
    pad.ws.send(JSON.stringify({ t: "btn", id: "A", down: true }));
    await game.waitFor((m) => m.t === "btn");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(
      other.inbox.some((m) => m.t === "btn"),
      false,
    );
  } finally {
    s.close();
  }
});

test("GitHub Pages 上的手柄可以连上局域网中继", async () => {
  const s = await boot();
  try {
    const game = client(s.port, "role=game");
    await game.opened;
    const pad = client(s.port, "role=pad", {
      Origin: "https://keosu.github.io",
    });
    await pad.opened;
    pad.ws.send(JSON.stringify({ t: "btn", id: "X", down: true }));
    const m = await game.waitFor((x) => x.t === "btn");
    assert.equal(m.id, "X");
  } finally {
    s.close();
  }
});

test("设置了口令时，没有口令的连接被拒绝", async () => {
  const s = await boot({ pin: "4321" });
  try {
    await assert.rejects(
      client(s.port, "role=pad").opened,
      /401|socket hang up|ECONNRESET/,
    );
    const ok = client(s.port, "role=pad&pin=4321");
    await ok.opened;
  } finally {
    s.close();
  }
});

test("来源不一致的网页连接被拒绝", async () => {
  const s = await boot();
  try {
    await assert.rejects(
      client(s.port, "role=pad", { Origin: "https://evil.example" }).opened,
      /403|socket hang up|ECONNRESET/,
    );
    const ok = client(s.port, "role=pad", {
      Origin: `http://127.0.0.1:${s.port}`,
    });
    await ok.opened;
  } finally {
    s.close();
  }
});

test("非法消息被忽略，连接不断", async () => {
  const s = await boot();
  try {
    const game = client(s.port, "role=game");
    await game.opened;
    const pad = client(s.port, "role=pad");
    await pad.opened;
    pad.ws.send("不是 JSON");
    pad.ws.send(JSON.stringify({ t: "rm -rf" }));
    pad.ws.send(JSON.stringify({ t: "btn", id: "B", down: true }));
    const m = await game.waitFor((x) => x.t === "btn");
    assert.equal(m.id, "B");
    assert.equal(game.inbox.filter((x) => x.t === "rm -rf").length, 0);
  } finally {
    s.close();
  }
});

test("校验函数", () => {
  assert.equal(sanitizePadMessage({ t: "nope" }), null);
  assert.equal(sanitizePadMessage(null), null);
  assert.equal(
    sanitizePadMessage({ t: "btn", id: "ABCDEFGHIJK", down: 1 }).id.length,
    8,
  );
  assert.equal(originAllowed(undefined, "x:1"), true);
  assert.equal(originAllowed("http://x:1", "x:1"), true);
  assert.equal(originAllowed("http://y:1", "x:1"), false);
  assert.equal(originAllowed("garbage", "x:1"), false);
  // GitHub Pages 上的 dayfun 页面：只放行所有者的域名
  assert.equal(originAllowed("https://keosu.github.io", "10.0.0.2:8443"), true);
  assert.equal(originAllowed("https://evil.github.io", "10.0.0.2:8443"), false);
  assert.equal(
    originAllowed("https://keosu.github.io", "10.0.0.2:8443", []),
    false,
  );
  assert.deepEqual(PAGES_ORIGINS, ["https://keosu.github.io"]);
});
