import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const palette = [
  "#f39b9f",
  "#edd077",
  "#96bba5",
  "#b5a3d4",
  "#9acbd9",
  "#e8ab80",
  "#b4bfe0",
  "#c7a6c8",
];
export const TAU = Math.PI * 2;
export const clamp = THREE.MathUtils.clamp;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
// Under-damped spring from 0 to 1, used for anything that "pops" into place.
export const springOut = (t, frequency = 2.4, damping = 7) =>
  t <= 0 ? 0 : 1 - Math.exp(-damping * t) * Math.cos(TAU * frequency * t);
export const random = (min, max) => min + Math.random() * (max - min);

export function plastic(color, extras = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
    ...extras,
  });
}
export function addMesh(parent, geometry, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function rounded(
  parent,
  width,
  height,
  depth,
  material,
  position,
  radius = 0.06,
) {
  return addMesh(
    parent,
    new RoundedBoxGeometry(
      width,
      height,
      depth,
      2,
      Math.min(radius, width / 3, height / 3, depth / 3),
    ),
    material,
    position,
  );
}
export function disc(parent, radius, depth, material, position, segments = 64) {
  const mesh = addMesh(
    parent,
    new THREE.CylinderGeometry(radius, radius, depth, segments),
    material,
    position,
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
export function canvas(draw, width = 1024, height = width) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  draw(element.getContext("2d"), width, height);
  return element;
}
export function canvasTexture(element) {
  const map = new THREE.CanvasTexture(element);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
export function texture(draw, width = 1024, height = width) {
  return canvasTexture(canvas(draw, width, height));
}

const pictograph = /\p{Extended_Pictographic}|\uFE0F|\u200D/gu;
export function splitEmoji(option) {
  const emoji = (option.match(pictograph) || []).join("");
  return { emoji, text: option.replace(pictograph, "").trim() };
}
export function fitFont(ctx, text, maxWidth, size, weight = 700) {
  let current = size;
  do {
    ctx.font = `${weight} ${current}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    current -= 4;
  } while (current > 18);
  return current;
}

function textMap(text, background, color, subtitle) {
  return texture(
    (ctx, w, h) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      fitFont(ctx, text, w * 0.88, subtitle ? 150 : 200);
      ctx.fillText(text, w / 2, subtitle ? h * 0.43 : h / 2);
      if (subtitle) {
        ctx.font = '36px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = "#a995b1";
        ctx.fillText(subtitle, w / 2, h * 0.75);
      }
    },
    1024,
    384,
  );
}
export function label(
  parent,
  text,
  width,
  height,
  position,
  background = "#fff9ee",
  color = "#665076",
  subtitle = "",
) {
  const mesh = addMesh(
    parent,
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: textMap(text, background, color, subtitle),
      toneMapped: false,
    }),
    position,
  );
  mesh.castShadow = false;
  return mesh;
}

// A floating answer card. It always faces the camera and pops in with a spring.
export function createResultCard(parent, size = 1) {
  const group = new THREE.Group();
  parent.add(group);
  group.scale.setScalar(size);
  const holder = new THREE.Group();
  group.add(holder);
  rounded(holder, 1.75, 0.64, 0.09, plastic("#fff8ed"), [0, 0, 0], 0.07);
  let face;
  group.visible = false;
  return {
    group,
    set(text) {
      if (face) {
        holder.remove(face);
        face.geometry.dispose();
        face.material.map.dispose();
        face.material.dispose();
      }
      face = label(
        holder,
        text,
        1.64,
        0.54,
        [0, 0, 0.052],
        "#fff8ed",
        "#775a91",
        "这次就选它",
      );
    },
    hide() {
      group.visible = false;
    },
    update(position, progress, camera) {
      group.visible = progress > 0.001;
      if (!group.visible) return;
      group.position.copy(position);
      group.quaternion.copy(camera.quaternion);
      const scale = Math.max(0.001, springOut(progress, 1.6, 6));
      holder.scale.setScalar(scale);
      holder.rotation.z = (1 - Math.min(1, progress * 2.2)) * 0.25;
    },
  };
}

// Paper confetti: a single instanced mesh with simple drag, flutter and floor contact.
export function createConfetti(parent, count = 64) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.05, 0.08),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }),
    count,
  );
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  parent.add(mesh);
  const items = Array.from({ length: count }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    r: new THREE.Euler(),
    spin: new THREE.Vector3(),
    resting: false,
  }));
  const color = new THREE.Color();
  items.forEach((_, i) =>
    mesh.setColorAt(i, color.set(palette[i % palette.length])),
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let floor = 0;
  let active = false;
  function write() {
    items.forEach((item, i) => {
      quaternion.setFromEuler(item.r);
      matrix.compose(item.p, quaternion, one);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    burst(origin, ground, strength = 1) {
      floor = ground + 0.004;
      items.forEach((item) => {
        item.p.copy(origin);
        const angle = Math.random() * TAU;
        const spread = random(0.4, 1.6) * strength;
        item.v.set(
          Math.cos(angle) * spread,
          random(2.2, 3.8) * strength,
          Math.sin(angle) * spread * 0.8 + 0.3,
        );
        item.r.set(
          Math.random() * TAU,
          Math.random() * TAU,
          Math.random() * TAU,
        );
        item.spin.set(random(-14, 14), random(-14, 14), random(-14, 14));
        item.resting = false;
      });
      mesh.visible = true;
      active = true;
      write();
    },
    clear() {
      mesh.visible = false;
      active = false;
    },
    update(dt) {
      if (!active) return;
      let moving = false;
      items.forEach((item) => {
        if (item.resting) return;
        moving = true;
        item.v.y -= 6.5 * dt;
        item.v.multiplyScalar(Math.exp(-2.6 * dt));
        item.v.x += Math.sin(item.r.y * 2) * 0.6 * dt;
        item.p.addScaledVector(item.v, dt);
        item.r.x += item.spin.x * dt;
        item.r.y += item.spin.y * dt;
        item.r.z += item.spin.z * dt;
        if (item.p.y <= floor) {
          item.p.y = floor;
          item.r.x = -Math.PI / 2;
          item.r.y = 0;
          item.resting = true;
        }
      });
      write();
      if (!moving) active = false;
    },
  };
}

export function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    materials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  });
}
