// 最小的“游戏端”示例：连上中继，打印收到的手柄数据，并在收到重甩时让手柄震一下。
//   node examples/game-client.mjs [主机:端口] [房间] [口令]
//   例：node examples/game-client.mjs 192.168.1.5:8080 default 1234

import WebSocket from "ws";

const [host = "localhost:8080", room = "default", pin = ""] =
  process.argv.slice(2);
const q = new URLSearchParams({ role: "game", room });
if (pin) q.set("pin", pin);

const ws = new WebSocket(`ws://${host}/ws?${q}`);
ws.on("open", () => console.log(`已连接 ws://${host}，房间 ${room}`));
ws.on("close", () => console.log("连接关闭"));
ws.on("error", (e) => console.log("出错：", e.message));

let lastState = 0;
ws.on("message", (data) => {
  const m = JSON.parse(data.toString());
  switch (m.t) {
    case "players":
      console.log(
        "在线手柄：",
        m.list.map((p) => `P${p.p}:${p.name}`).join("、") || "（无）",
      );
      break;
    case "state":
      // 状态每秒约 30 次，这里每 200ms 打印一次
      if (Date.now() - lastState > 200) {
        lastState = Date.now();
        console.log(
          `P${m.p} 倾斜 ${m.tx.toFixed(2)},${m.ty.toFixed(2)} 摇杆 ${m.sx.toFixed(2)},${m.sy.toFixed(2)}`,
        );
      }
      break;
    case "btn":
      console.log(`P${m.p} 按键 ${m.id} ${m.down ? "按下" : "松开"}`);
      break;
    case "gesture":
      console.log(`P${m.p} 动作 ${m.name}（力度 ${m.power}）`);
      if (m.hard)
        ws.send(JSON.stringify({ t: "rumble", p: m.p, pattern: [60, 40, 60] }));
      break;
    case "left":
      console.log(`P${m.p} 离开了`);
      break;
  }
});
