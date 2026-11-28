// 设置（保存在 localStorage）和一个很小的事件总线。

const KEY = "spg:v1";
const DEFAULTS = {
  autoSpeak: true, // 走到景点时自动开始讲解
  rate: 1, // 语速
  voice: "", // 语音名称，空表示自动选择中文语音
  basemap: "vector", // vector 离线简图 / tiles OpenStreetMap 在线街道图
  coord: "wgs84", // 设备给出的坐标系：wgs84 或 gcj02
  lastMode: "manual", // 上次的定位方式
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

class Bus extends EventTarget {
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }
}
export const bus = new Bus();

export function setSetting(key, value) {
  settings[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式下可能写不进去，忽略 */
  }
  bus.emit("setting", { key, value });
}
