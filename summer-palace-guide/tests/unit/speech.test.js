import test from "node:test";
import assert from "node:assert/strict";
import { Narrator, pickVoice, splitSentences } from "../../js/speech.js";

test("splitSentences：按句号切，保留标点，长句在逗号处再切", () => {
  assert.deepEqual(splitSentences("你好。再见！真的吗？"), ["你好。", "再见！", "真的吗？"]);
  const long = "甲".repeat(40) + "，" + "乙".repeat(40) + "。";
  const parts = splitSentences(long, 64);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 64));
  assert.equal(parts.join(""), long);
  assert.deepEqual(splitSentences("  "), []);
});

test("pickVoice：优先指定的，其次普通话，再次本地声音；没有中文返回 null", () => {
  const v = [
    { name: "Alex", lang: "en-US" },
    { name: "Hong Kong", lang: "zh-HK" },
    { name: "Ting-Ting", lang: "zh-CN" },
    { name: "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)", lang: "zh-CN" },
  ];
  assert.equal(pickVoice(v).name.includes("Xiaoxiao"), true);
  assert.equal(pickVoice(v, "Hong Kong").name, "Hong Kong");
  assert.equal(pickVoice([{ name: "Alex", lang: "en-US" }]), null);
});

// 一个假的语音合成：手动触发 onend，模拟浏览器行为
function fakeSynth() {
  const spoken = [];
  const synth = {
    spoken,
    cancelled: 0,
    getVoices: () => [{ name: "Ting-Ting", lang: "zh-CN" }],
    addEventListener() {},
    speak(u) {
      spoken.push(u);
      u.onstart?.();
    },
    cancel() {
      synth.cancelled++;
    },
  };
  return synth;
}
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};

test("Narrator：逐句朗读、结束事件、暂停后从当前句继续", () => {
  const synth = fakeSynth();
  const n = new Narrator(synth);
  const events = [];
  n.addEventListener("status", (e) => events.push(e.detail.status));
  n.addEventListener("ended", () => events.push("ended"));
  assert.equal(n.hasChineseVoice, true);

  n.play("x", "第一句。第二句。第三句。");
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].text, "第一句。");
  synth.spoken[0].onend(); // 读完第一句 → 自动读第二句
  assert.equal(synth.spoken.length, 2);

  n.pause();
  assert.equal(n.status, "paused");
  synth.spoken[1].onend?.(); // 暂停后旧回调必须失效
  assert.equal(synth.spoken.length, 2);

  n.resume(); // 从第二句重读
  assert.equal(synth.spoken.length, 3);
  assert.equal(synth.spoken[2].text, "第二句。");
  synth.spoken[2].onend();
  synth.spoken[3].onend();
  assert.equal(n.status, "idle");
  assert.deepEqual(events, ["playing", "paused", "playing", "idle", "ended"]);
});

test("Narrator：换景点时旧讲解的回调不会串台；setRate 立即生效", () => {
  const synth = fakeSynth();
  const n = new Narrator(synth);
  n.play("a", "甲一。甲二。");
  const first = synth.spoken[0];
  n.play("b", "乙一。乙二。");
  first.onend(); // 旧的回调应被忽略
  assert.equal(synth.spoken.length, 2);
  assert.equal(synth.spoken[1].text, "乙一。");
  n.setRate(1.5);
  assert.equal(synth.spoken.at(-1).rate, 1.5);
  n.stop();
  assert.equal(n.status, "idle");
});

test("Narrator：浏览器不支持时给出错误事件而不是抛异常", () => {
  const n = new Narrator(null);
  let reason = null;
  n.addEventListener("error", (e) => (reason = e.detail.reason));
  assert.equal(n.play("a", "你好。"), false);
  assert.equal(reason, "unsupported");
});
