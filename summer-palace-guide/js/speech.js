// 语音讲解：用浏览器自带的语音合成（Web Speech API），免费、免 key。
// 把讲解词切成句子逐句朗读：
//   - 可以暂停、继续、调语速、从某一句开始；
//   - 当前读到哪一句会通知界面高亮；
//   - 避开部分浏览器“一次读太长会中断”的毛病。

/** 把讲解词切成句子；太长的句子在逗号处再切一次 */
export function splitSentences(text, maxLen = 64) {
  const raw = text.replace(/\s+/g, "").match(/[^。！？；!?;]+[。！？；!?;]?/g) || [];
  const out = [];
  for (const s of raw) {
    if (s.length <= maxLen) {
      out.push(s);
      continue;
    }
    let buf = "";
    for (const part of s.match(/[^，、,]+[，、,]?/g) || [s]) {
      if (buf && (buf + part).length > maxLen) {
        out.push(buf);
        buf = "";
      }
      buf += part;
    }
    if (buf) out.push(buf);
  }
  return out;
}

const PREFER = [/xiaoxiao|xiaoyi|yunxi|yunyang|huihui|tingting|meijia|sinji|lili|google.*(普通话|chinese|mandarin)/i];

export function pickVoice(voices, wanted = "") {
  const zh = voices.filter((v) => /^zh([-_]|$)/i.test(v.lang) || /chinese|中文|普通话/i.test(v.name));
  if (!zh.length) return null;
  if (wanted) {
    const w = zh.find((v) => v.name === wanted);
    if (w) return w;
  }
  const cn = zh.filter((v) => /zh[-_]cn|cmn/i.test(v.lang) || /普通话|mandarin/i.test(v.name));
  const pool = cn.length ? cn : zh;
  for (const re of PREFER) {
    const hit = pool.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return pool.find((v) => v.localService) || pool[0];
}

export class Narrator extends EventTarget {
  constructor(synth = globalThis.speechSynthesis) {
    super();
    this.synth = synth || null;
    this.supported = !!this.synth && typeof globalThis.SpeechSynthesisUtterance === "function";
    this.rate = 1;
    this.voiceName = "";
    this.spotId = null;
    this.sentences = [];
    this.index = 0;
    this.status = "idle"; // idle | playing | paused
    this._token = 0;
    this._voices = [];
    if (this.supported) {
      const load = () => {
        this._voices = this.synth.getVoices();
        this._emit("voices");
      };
      load();
      this.synth.addEventListener?.("voiceschanged", load);
    }
  }

  get voices() {
    return this._voices.filter((v) => /^zh([-_]|$)/i.test(v.lang) || /chinese|中文|普通话/i.test(v.name));
  }

  get hasChineseVoice() {
    return !!pickVoice(this._voices, this.voiceName);
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  _setStatus(s) {
    if (this.status !== s) {
      this.status = s;
      this._emit("status", { status: s, spotId: this.spotId });
    }
  }

  /** 在用户点击时调用一次：解除 iOS 等浏览器“必须由手势触发”的限制 */
  unlock() {
    if (!this.supported) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      this.synth.speak(u);
    } catch {
      /* 忽略 */
    }
  }

  /** 开始读某个景点；from 是从第几句开始 */
  play(spotId, text, from = 0) {
    if (!this.supported) {
      this._emit("error", { reason: "unsupported" });
      return false;
    }
    this.stop(true);
    this.spotId = spotId;
    this.sentences = splitSentences(text);
    this.index = Math.max(0, Math.min(from, this.sentences.length - 1));
    this._token++;
    this._setStatus("playing");
    this._speakCurrent(this._token);
    return true;
  }

  _speakCurrent(token) {
    if (token !== this._token) return;
    if (this.index >= this.sentences.length) {
      this._finish();
      return;
    }
    const u = new SpeechSynthesisUtterance(this.sentences[this.index]);
    u.lang = "zh-CN";
    u.rate = this.rate;
    const v = pickVoice(this._voices, this.voiceName);
    if (v) {
      u.voice = v;
      u.lang = v.lang || "zh-CN";
    }
    u.onstart = () => token === this._token && this._emit("sentence", { index: this.index, spotId: this.spotId });
    u.onend = () => {
      if (token !== this._token) return;
      this.index++;
      this._speakCurrent(token);
    };
    u.onerror = (e) => {
      if (token !== this._token) return;
      if (e.error === "canceled" || e.error === "interrupted") return;
      this._emit("error", { reason: e.error || "unknown" });
      this._finish();
    };
    this.synth.speak(u);
  }

  _finish() {
    this._token++;
    this._setStatus("idle");
    this._emit("sentence", { index: -1, spotId: this.spotId });
    this._emit("ended", { spotId: this.spotId });
  }

  pause() {
    if (this.status !== "playing") return;
    this._token++; // 让正在读的这句的回调失效
    this.synth.cancel();
    this._setStatus("paused");
  }

  resume() {
    if (this.status !== "paused") return;
    this._token++;
    this._setStatus("playing");
    this._speakCurrent(this._token);
  }

  stop(silent = false) {
    this._token++;
    if (this.supported) this.synth.cancel();
    if (!silent) {
      this._setStatus("idle");
      this._emit("sentence", { index: -1, spotId: this.spotId });
    }
  }

  setRate(rate) {
    this.rate = rate;
    // 正在读时，从当前句重新开始，让新语速立刻生效
    if (this.status === "playing") {
      this._token++;
      this.synth.cancel();
      this._speakCurrent(this._token);
    }
  }
}
