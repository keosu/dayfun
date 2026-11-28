// 地图：Leaflet + 离线矢量底图（由 OpenStreetMap 数据生成，见 tools/build-map.mjs）。
// 也可以切换到 OpenStreetMap 在线街道图（免 key，需要联网）。
const L = window.L;

const COLORS = {
  light: {
    land: "#f1ecdf", park: "#e6eed2", green: "#d5e4bd", water: "#b4d4e6", waterEdge: "#8fbad3",
    building: "#e3c8a2", buildingEdge: "#b79463", roadCase: "#d3c7ae", road: "#fffdf6",
    pathCase: "#dccfb6", path: "#fffdf6", wall: "#a8805a", bridge: "#f6e8cd", bridgeEdge: "#a8885a",
    mask: "#f1ecdf", boundary: "#d4483c",
  },
  dark: {
    land: "#1d1b18", park: "#24291f", green: "#2c3825", water: "#27455a", waterEdge: "#3a6682",
    building: "#5a4a38", buildingEdge: "#7c6548", roadCase: "#12100e", road: "#4b4439",
    pathCase: "#12100e", path: "#5b5346", wall: "#8a6a4a", bridge: "#6b5d49", bridgeEdge: "#a38a63",
    mask: "#14120f", boundary: "#ee6f61",
  },
};

const AREA_LABELS = [
  { t: "昆明湖", at: [39.9868, 116.2668], cls: "lake", minZ: 14, maxZ: 17 },
  { t: "万寿山", at: [39.9992, 116.2632], cls: "hill", minZ: 14, maxZ: 17 },
  { t: "后湖", at: [40.0004, 116.2640], cls: "lake small", minZ: 15.5, maxZ: 18 },
  { t: "西堤", at: [39.9948, 116.2602], cls: "lake small", minZ: 15.5, maxZ: 18 },
  { t: "东堤", at: [39.9935, 116.2745], cls: "lake small", minZ: 15.5, maxZ: 18 },
];

export class GuideMap {
  constructor(el, { onSelect, onMapClick } = {}) {
    this.el = el;
    this.onSelect = onSelect || (() => {});
    this.onMapClick = onMapClick || (() => {});
    this.insets = { top: 70, bottom: 190 };
    this.dark = false;
    this.basemap = "vector";
    this.markers = new Map();
    this.areaLabels = [];
    this.selected = null;

    const map = (this.map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      minZoom: 14,
      maxZoom: 19,
      wheelPxPerZoomLevel: 100,
    }));
    for (const [name, z] of [["baseVec", 220], ["boundary", 300], ["routeP", 450], ["labelP", 480]]) {
      map.createPane(name).style.zIndex = z;
    }
    map.getPane("labelP").style.pointerEvents = "none";
    this.canvas = L.canvas({ padding: 0.4, pane: "baseVec" });
    this.baseLayer = L.layerGroup().addTo(map);
    this.boundaryLayer = L.layerGroup().addTo(map);
    this.routeLayer = L.layerGroup().addTo(map);
    this.userLayer = L.layerGroup().addTo(map);
    this.tiles = null;

    map.on("zoomend", () => this._zoomClass());
    map.on("click", (e) => this.onMapClick([e.latlng.lat, e.latlng.lng]));
    this._zoomClass();
  }

  _zoomClass() {
    const z = this.map.getZoom();
    this.el.dataset.zl = z < 15.6 ? "0" : z < 16.6 ? "1" : "2";
    for (const a of this.areaLabels) {
      const el = a.marker.getElement();
      if (el) el.style.display = z >= a.minZ && z <= a.maxZ ? "" : "none";
    }
  }

  setInsets(top, bottom) {
    this.insets = { top, bottom };
  }

  fitPark(animate = false) {
    const b = this.parkBounds || [[39.9792, 116.2548], [40.0011, 116.2771]];
    this.map.fitBounds(b, {
      paddingTopLeft: [10, this.insets.top + 6],
      paddingBottomRight: [76, this.insets.bottom + 6],
      animate,
    });
  }

  // ── 底图 ──
  drawBase(mapData, dark = this.dark) {
    this.dark = dark;
    const c = COLORS[dark ? "dark" : "light"];
    this.el.style.background = c.land;
    this.baseLayer.clearLayers();
    this.boundaryLayer.clearLayers();
    const r = { renderer: this.canvas, interactive: false };
    const add = (layer) => layer.addTo(this.baseLayer);
    const poly = (rings, style) => add(L.polygon(rings, { ...r, ...style }));
    const line = (pts, style) => add(L.polyline(pts, { ...r, ...style }));

    poly([mapData.boundary], { stroke: false, fillColor: c.park, fillOpacity: 1 });
    for (const g of mapData.green) poly([g], { stroke: false, fillColor: c.green, fillOpacity: 0.85 });
    for (const w of mapData.water) poly(w, { color: c.waterEdge, weight: 1, fillColor: c.water, fillOpacity: 1 });
    for (const l of mapData.waterLines) line(l, { color: c.water, weight: 4, opacity: 1, lineCap: "round" });
    for (const l of mapData.walls) line(l, { color: c.wall, weight: 2, opacity: 0.9 });
    for (const l of mapData.roads) line(l, { color: c.roadCase, weight: 6, opacity: 1 });
    for (const l of mapData.roads) line(l, { color: c.road, weight: 4, opacity: 1 });
    for (const l of mapData.paths) line(l, { color: c.pathCase, weight: 4, opacity: 1 });
    for (const l of mapData.paths) line(l, { color: c.path, weight: 2.4, opacity: 1 });
    for (const b of mapData.bridges) line(b.l, { color: c.bridgeEdge, weight: b.n ? 8 : 6, opacity: 1, lineCap: "butt" });
    for (const b of mapData.bridges) line(b.l, { color: c.bridge, weight: b.n ? 5.5 : 4, opacity: 1, lineCap: "butt" });
    for (const b of mapData.buildings) poly([b.r], { color: c.buildingEdge, weight: 0.8, fillColor: c.building, fillOpacity: 1 });
    // 园外淡化：一个“带洞”的大多边形，洞就是园区
    poly(
      [[[40.02, 116.23], [40.02, 116.3], [39.96, 116.3], [39.96, 116.23]], mapData.boundary],
      { stroke: false, fillColor: c.mask, fillOpacity: 0.6 },
    );
    L.polyline([...mapData.boundary, mapData.boundary[0]], {
      pane: "boundary", color: c.boundary, weight: 2, dashArray: "6 6", opacity: 0.85, interactive: false,
    }).addTo(this.boundaryLayer);
    this.parkBounds = L.latLngBounds(mapData.boundary).pad(0.02);
    this._applyBasemapVisibility();
  }

  setBasemap(kind) {
    this.basemap = kind;
    if (kind === "tiles" && !this.tiles) {
      this.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, crossOrigin: true, attribution: "© OpenStreetMap",
      });
    }
    if (this.tiles) {
      if (kind === "tiles") this.tiles.addTo(this.map);
      else this.tiles.remove();
    }
    this._applyBasemapVisibility();
  }

  _applyBasemapVisibility() {
    this.map.getPane("baseVec").style.display = this.basemap === "tiles" ? "none" : "";
    this.el.classList.toggle("tiles-on", this.basemap === "tiles");
    this.el.classList.toggle("tiles-dark", this.basemap === "tiles" && this.dark);
  }

  // ── 景点标记与标签 ──
  setSpots(spots) {
    for (const m of this.markers.values()) m.remove();
    this.markers.clear();
    for (const s of spots) {
      const icon = L.divIcon({
        className: "pin-wrap",
        html: `<div class="pin${s.zone === "gate" ? " gate" : ""}${s.classic ? " classic" : ""}" data-id="${s.id}"><span class="pin-emoji">${s.emoji}</span><span class="pin-label">${s.name}</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const m = L.marker(s.at[0], { icon, title: s.name, keyboard: true, riseOnHover: true });
      m.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        this.onSelect(s.id);
      });
      m.addTo(this.map);
      this.markers.set(s.id, m);
    }
    for (const a of this.areaLabels) a.marker.remove();
    this.areaLabels = AREA_LABELS.map((a) => ({
      ...a,
      marker: L.marker(a.at, {
        pane: "labelP", interactive: false, keyboard: false,
        icon: L.divIcon({ className: `area-label ${a.cls}`, html: `<span>${a.t}</span>`, iconSize: [90, 24], iconAnchor: [45, 12] }),
      }).addTo(this.map),
    }));
    this._zoomClass();
  }

  _pin(id) {
    return this.markers.get(id)?.getElement()?.querySelector(".pin") || null;
  }

  setSelected(id) {
    if (this.selected) {
      this._pin(this.selected)?.classList.remove("sel");
      this.markers.get(this.selected)?.setZIndexOffset(0);
    }
    this.selected = id;
    if (id) {
      this._pin(id)?.classList.add("sel");
      this.markers.get(id)?.setZIndexOffset(1000);
    }
  }

  /** 把一个点移到“顶栏和底部卡片之间”的可视区中央 */
  focus(latlng, zoom = 17, animate = true) {
    const z = Math.max(this.map.getZoom(), zoom);
    const shift = (this.insets.bottom - this.insets.top) / 2;
    const p = this.map.project(latlng, z).add([0, shift]);
    this.map.setView(this.map.unproject(p, z), z, { animate, duration: 0.6 });
  }

  // ── 线路 ──
  showRoute(route, byId) {
    this.routeLayer.clearLayers();
    for (const m of this.markers.values()) {
      const pin = m.getElement()?.querySelector(".pin");
      if (pin) {
        pin.classList.remove("in-route", "dim");
        delete pin.dataset.n;
      }
    }
    if (!route) return;
    const all = [];
    for (const leg of route.path) {
      const boat = leg.mode === "boat";
      const dashed = leg.mode !== "walk";
      L.polyline(leg.pts, { pane: "routeP", color: this.dark ? "#14120f" : "#ffffff", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round", interactive: false }).addTo(this.routeLayer);
      L.polyline(leg.pts, {
        pane: "routeP", color: boat ? (this.dark ? "#6fb0d6" : "#3d7ea6") : this.dark ? "#ee6f61" : "#d4483c",
        weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round", dashArray: dashed ? "2 9" : null, interactive: false,
      }).addTo(this.routeLayer);
      all.push(...leg.pts);
    }
    const inRoute = new Set(route.stops);
    route.stops.forEach((id, i) => {
      const pin = this._pin(id);
      if (pin) {
        pin.classList.add("in-route");
        pin.dataset.n = String(i + 1);
      }
    });
    for (const [id, m] of this.markers) {
      if (!inRoute.has(id)) m.getElement()?.querySelector(".pin")?.classList.add("dim");
    }
    this.routeBounds = L.latLngBounds(all);
    void byId;
  }

  fitRoute() {
    if (!this.routeBounds) return;
    this.map.fitBounds(this.routeBounds, {
      paddingTopLeft: [24, this.insets.top + 16],
      paddingBottomRight: [80, this.insets.bottom + 16],
      maxZoom: 17,
    });
  }

  // ── 我的位置 ──
  setUser(loc) {
    this.userLayer.clearLayers();
    if (!loc) return;
    const ll = [loc.lat, loc.lon];
    if (loc.acc) {
      L.circle(ll, { radius: Math.min(loc.acc, 300), color: "#3d7ea6", weight: 1, fillColor: "#3d7ea6", fillOpacity: 0.12, interactive: false }).addTo(this.userLayer);
    }
    L.marker(ll, {
      interactive: false, keyboard: false, zIndexOffset: 2000,
      icon: L.divIcon({ className: "me-wrap", html: `<div class="me${loc.sim ? " sim" : ""}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
    }).addTo(this.userLayer);
  }

  zoomBy(d) {
    this.map.setZoom(this.map.getZoom() + d);
  }

  invalidate() {
    this.map.invalidateSize();
  }
}
