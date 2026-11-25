import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { renderScene, animateScene } from "./picker-scenes.js";
import { isDarkTheme, themeEvent } from "./theme.js";

const palette = [
  "#f39b9f",
  "#edd077",
  "#96bba5",
  "#b5a3d4",
  "#9acbd9",
  "#e8ab80",
  "#b4bfe0",
  "#c7a6c8",
];
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) ** 3;

function plastic(color, extras = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
    ...extras,
  });
}
function addMesh(parent, geometry, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function rounded(
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
function disc(parent, radius, depth, material, position) {
  const mesh = addMesh(
    parent,
    new THREE.CylinderGeometry(radius, radius, depth, 64),
    material,
    position,
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
function texture(draw, width = 1024, height = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
function textMap(
  text,
  background = "#fff9ee",
  color = "#665076",
  subtitle = "",
) {
  return texture(
    (ctx, w, h) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.font = `700 ${text.length > 12 ? 75 : text.length > 7 ? 100 : text.length < 5 ? 200 : 140}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(text, w / 2, subtitle ? h * 0.43 : h / 2, w * 0.88);
      if (subtitle) {
        ctx.font = "36px sans-serif";
        ctx.fillStyle = "#a995b1";
        ctx.fillText(subtitle, w / 2, h * 0.73);
      }
    },
    1024,
    384,
  );
}
function label(
  parent,
  text,
  width,
  height,
  position,
  background,
  color,
  subtitle,
) {
  const material = new THREE.MeshBasicMaterial({
    map: textMap(text, background, color, subtitle),
    toneMapped: false,
  });
  const mesh = addMesh(
    parent,
    new THREE.PlaneGeometry(width, height),
    material,
    position,
  );
  mesh.castShadow = false;
  return mesh;
}
function resultCard(parent, text, position) {
  const group = new THREE.Group();
  parent.add(group);
  group.position.set(...position);
  rounded(group, 1.75, 0.64, 0.09, plastic("#fff8ed"), [0, 0, 0], 0.07);
  label(
    group,
    text,
    1.64,
    0.54,
    [0, 0, 0.052],
    "#fff8ed",
    "#775a91",
    "这次就选它",
  );
  group.scale.setScalar(0.001);
  return group;
}

function wheelFace(options) {
  return texture((ctx, size) => {
    const center = size / 2;
    const radius = size * 0.496;
    const step = TAU / options.length;
    options.forEach((option, index) => {
      const angle = index * step - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, angle, angle + step);
      ctx.closePath();
      ctx.fillStyle = palette[index % palette.length];
      ctx.fill();
      ctx.strokeStyle = "#fff5";
      ctx.lineWidth = 3;
      ctx.stroke();
      const a = (index + 0.5) * step;
      const x = center + Math.sin(a) * size * 0.345;
      const y = center - Math.cos(a) * size * 0.345;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#574a5b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const plain = option
        .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "")
        .trim();
      ctx.font = `700 ${options.length > 10 ? 36 : 52}px "Microsoft YaHei", sans-serif`;
      const parts =
        plain.length > 6 ? [plain.slice(0, 6), plain.slice(6, 12)] : [plain];
      parts.forEach((part, row) =>
        ctx.fillText(
          part,
          0,
          (row - (parts.length - 1) / 2) * 38,
          options.length > 10 ? 135 : 170,
        ),
      );
      ctx.restore();
    });
  });
}

function buildWheel(root, options) {
  const ivory = plastic("#f8f2e6");
  const gold = plastic("#d9bd86", { metalness: 0.7, roughness: 0.24 });
  const purple = plastic("#9c86ba");
  rounded(root, 1.9, 0.2, 1.05, ivory, [0, 0.12, 0], 0.09);
  rounded(root, 0.48, 1.4, 0.38, purple, [0, 0.85, -0.13], 0.1);
  rounded(root, 0.72, 0.1, 0.5, gold, [0, 0.29, 0], 0.03);
  const center = new THREE.Group();
  center.position.set(0, 1.93, 0.03);
  root.add(center);
  const rotor = new THREE.Group();
  center.add(rotor);
  disc(rotor, 1.32, 0.23, ivory, [0, 0, 0]);
  const face = addMesh(
    rotor,
    new THREE.CircleGeometry(1.22, 96),
    plastic("#ffffff", {
      map: wheelFace(options),
      roughness: 0.4,
      metalness: 0.02,
    }),
    [0, 0, 0.122],
  );
  face.castShadow = false;
  addMesh(
    center,
    new THREE.TorusGeometry(1.285, 0.047, 12, 96),
    gold,
    [0, 0, 0.14],
  );
  disc(rotor, 0.3, 0.08, gold, [0, 0, 0.18]);
  disc(rotor, 0.25, 0.07, ivory, [0, 0, 0.225]);
  label(rotor, "LUCK", 0.4, 0.14, [0, 0, 0.266], "#f8f2e6", "#9277ad");
  for (let i = 0; i < 24; i++) {
    const angle = (i * TAU) / 24;
    const light = addMesh(
      center,
      new THREE.SphereGeometry(0.025, 8, 8),
      plastic("#fff2c9", { emissive: "#ffe3a3", emissiveIntensity: 0.3 }),
      [Math.sin(angle) * 1.283, Math.cos(angle) * 1.283, 0.192],
    );
    light.castShadow = false;
  }
  const pointer = new THREE.Group();
  pointer.position.set(0, 1.29, 0.3);
  center.add(pointer);
  const shape = new THREE.Shape();
  shape.moveTo(-0.115, 0.17);
  shape.lineTo(0.115, 0.17);
  shape.lineTo(0, -0.16);
  shape.closePath();
  addMesh(
    pointer,
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2,
      steps: 1,
    }),
    gold,
  );
  const rivet = disc(pointer, 0.045, 0.025, ivory, [0, 0.12, 0.075]);
  label(
    root,
    "让好运慢慢停下来",
    1.35,
    0.14,
    [0, 0.16, 0.536],
    "#f8f2e6",
    "#a894b4",
  );
  let rotation = 0;
  return {
    duration: 5500,
    begin(winner) {
      const from = rotation;
      const to =
        Math.ceil(from / TAU) * TAU +
        5 * TAU +
        ((winner + 0.5) * TAU) / options.length;
      return (t) => {
        const progress = 1 - (1 - t) ** 4 * (1 + 4 * t);
        rotation = THREE.MathUtils.lerp(from, to, progress);
        rotor.rotation.z = rotation;
        pointer.rotation.z =
          Math.sin(rotation * options.length) * 0.12 * Math.sin(Math.PI * t);
        if (t === 1) pointer.rotation.z = 0;
        return {
          angle: (rotation * 180) / Math.PI,
          motion: t < 0.9 ? "spinning" : "settling",
          revealed: t > 0.99,
          selectedIndex: Math.floor(
            (((rotation % TAU) + TAU) % TAU) / (TAU / options.length),
          ),
        };
      };
    },
  };
}

function capsule(parent, radius, color, position) {
  const group = new THREE.Group();
  parent.add(group);
  group.position.set(...position);
  const top = addMesh(
    group,
    new THREE.SphereGeometry(radius, 24, 16, 0, TAU, 0, Math.PI / 2),
    plastic(color),
  );
  const bottom = addMesh(
    group,
    new THREE.SphereGeometry(radius, 24, 16, 0, TAU, Math.PI / 2, Math.PI / 2),
    plastic("#fff3df"),
  );
  const seam = addMesh(
    group,
    new THREE.TorusGeometry(radius, 0.009, 6, 32),
    plastic("#d6c7b6", { metalness: 0.3 }),
  );
  seam.rotation.x = Math.PI / 2;
  return { group, top, bottom, seam };
}

function buildCapsule(root, options) {
  const pink = plastic("#d994a0");
  const ivory = plastic("#fff3df");
  const gold = plastic("#d9bd86", { metalness: 0.65 });
  rounded(root, 2.08, 0.22, 1.56, ivory, [0, 0.12, 0], 0.09);
  rounded(root, 1.78, 1.12, 1.14, pink, [0, 0.79, 0], 0.12);
  rounded(root, 1.88, 0.12, 1.2, ivory, [0, 1.39, 0], 0.05);
  addMesh(
    root,
    new THREE.SphereGeometry(0.92, 48, 32),
    plastic("#fffafa", {
      transmission: 0.76,
      thickness: 0.13,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      ior: 1.45,
    }),
    [0, 2.15, 0],
  );
  const positions = [
    [-0.46, 1.8, 0.2],
    [0.1, 1.78, 0.45],
    [0.49, 1.94, 0.15],
    [-0.28, 2.16, 0.48],
    [0.26, 2.3, 0.34],
    [-0.49, 2.44, 0.05],
    [0.04, 2.58, 0.12],
    [0.47, 2.45, -0.12],
    [-0.12, 1.83, -0.42],
    [0.38, 2.09, -0.4],
    [-0.43, 2.17, -0.32],
    [0.04, 2.37, -0.35],
  ];
  const balls = positions.map((position, index) => {
    const ball = capsule(
      root,
      0.235,
      palette[index % palette.length],
      position,
    );
    ball.group.rotation.set(index * 0.72, index * 0.3, index * 0.85);
    return ball;
  });
  label(
    root,
    "LUCKY CAPSULE",
    1.35,
    0.2,
    [0, 1.23, 0.581],
    "#d994a0",
    "#fff3df",
  );
  const knob = new THREE.Group();
  root.add(knob);
  knob.position.set(-0.45, 0.87, 0.64);
  disc(knob, 0.245, 0.1, gold, [0, 0, 0]);
  rounded(knob, 0.34, 0.075, 0.08, ivory, [0, 0, 0.08], 0.025);
  rounded(
    root,
    0.57,
    0.42,
    0.09,
    plastic("#675364", { roughness: 0.8 }),
    [0.45, 0.64, 0.59],
    0.09,
  );
  rounded(root, 0.64, 0.07, 0.27, gold, [0.45, 0.43, 0.64], 0.025);
  const winning = capsule(root, 0.275, palette[0], [0.45, 0.64, 0.72]);
  winning.group.visible = false;
  let card;
  return {
    duration: 5500,
    begin(winner) {
      if (card) {
        root.remove(card);
        disposeGroup(card);
      }
      card = resultCard(root, options[winner], [0, 1.08, 1.3]);
      winning.top.material.color.set(palette[winner % palette.length]);
      winning.group.visible = false;
      winning.top.position.set(0, 0, 0);
      winning.top.rotation.z = 0;
      winning.seam.visible = true;
      return (t) => {
        const crank = smooth(clamp(t / 0.43, 0, 1));
        knob.rotation.z = -crank * TAU * 1.75;
        balls.forEach((ball, index) => {
          const rest = positions[index];
          const mix = smooth(clamp(t / 0.46, 0, 1));
          const angle = mix * TAU * 2;
          const shake = Math.sin(Math.PI * clamp(t / 0.46, 0, 1));
          ball.group.position.set(
            rest[0] * Math.cos(angle) - rest[2] * Math.sin(angle),
            rest[1] + Math.sin(t * 24 + index) * 0.045 * shake,
            rest[0] * Math.sin(angle) + rest[2] * Math.cos(angle),
          );
          ball.group.rotation.set(
            index * 0.72 + mix * TAU,
            index * 0.3 + mix * TAU * 2,
            index * 0.85 + mix * TAU,
          );
        });
        const roll = clamp((t - 0.43) / 0.34, 0, 1);
        winning.group.visible = t > 0.43;
        winning.group.position.set(
          0.45 * (1 - smooth(roll)) - 0.26 * Math.sin(roll * Math.PI),
          0.28 +
            0.35 * (1 - roll) +
            Math.abs(Math.sin(roll * Math.PI * 2)) * 0.19 * (1 - roll),
          0.72 + 1.13 * smooth(roll),
        );
        winning.group.rotation.set(
          -roll * TAU,
          0,
          Math.sin(roll * Math.PI) * 0.45,
        );
        const open = smooth(clamp((t - 0.77) / 0.23, 0, 1));
        if (open > 0) {
          winning.top.position.set(-open * 0.32, open * 0.27, 0);
          winning.top.rotation.z = open * -0.65;
          winning.seam.visible = false;
        }
        card.scale.setScalar(Math.max(0.001, open));
        card.position.y = 0.9 + open * 0.2;
        return {
          selectedIndex: winner,
          motion:
            t < 0.43
              ? "mixing"
              : t < 0.77
                ? "rolling"
                : t < 0.95
                  ? "opening"
                  : "revealed",
          revealed: open > 0.95,
          rollAngle: roll * TAU,
        };
      };
    },
  };
}

function diceFace(value) {
  return texture(
    (ctx, size) => {
      ctx.fillStyle = "#fff0df";
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "#e5cba8";
      ctx.lineWidth = 16;
      ctx.strokeRect(18, 18, size - 36, size - 36);
      ctx.fillStyle = "#876883";
      const dots = {
        1: [[0.5, 0.5]],
        2: [
          [0.28, 0.28],
          [0.72, 0.72],
        ],
        3: [
          [0.28, 0.28],
          [0.5, 0.5],
          [0.72, 0.72],
        ],
        4: [
          [0.28, 0.28],
          [0.72, 0.28],
          [0.28, 0.72],
          [0.72, 0.72],
        ],
        5: [
          [0.28, 0.28],
          [0.72, 0.28],
          [0.5, 0.5],
          [0.28, 0.72],
          [0.72, 0.72],
        ],
        6: [
          [0.28, 0.25],
          [0.72, 0.25],
          [0.28, 0.5],
          [0.72, 0.5],
          [0.28, 0.75],
          [0.72, 0.75],
        ],
      };
      if (value <= 6)
        dots[value].forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x * size, y * size, size * 0.074, 0, TAU);
          ctx.fill();
        });
      else {
        ctx.font = "700 290px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), size / 2, size / 2);
      }
    },
    512,
    512,
  );
}

function buildPixel(root, options) {
  const grass = plastic("#a5ba8c");
  const soil = plastic("#d7b696");
  const gold = plastic("#ebc66b", { metalness: 0.25 });
  rounded(root, 3.1, 0.22, 1.9, soil, [0, 0.12, 0], 0.08);
  rounded(root, 3.16, 0.1, 1.94, grass, [0, 0.265, 0], 0.025);
  const blockMap = texture(
    (ctx, w) => {
      ctx.fillStyle = "#ebc66b";
      ctx.fillRect(0, 0, w, w);
      ctx.strokeStyle = "#b78a43";
      ctx.lineWidth = 38;
      ctx.strokeRect(40, 40, w - 80, w - 80);
      ctx.fillStyle = "#fff3c4";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 640px monospace";
      ctx.fillText("?", w / 2, w / 2 + 25);
      [
        [100, 100],
        [w - 100, 100],
        [100, w - 100],
        [w - 100, w - 100],
      ].forEach(([x, y]) => {
        ctx.fillStyle = "#b78a43";
        ctx.fillRect(x - 22, y - 22, 44, 44);
      });
    },
    512,
    512,
  );
  const questionMaterial = plastic("#ffffff", { map: blockMap });
  const diceMaterials = Array.from({ length: 6 }, (_, index) =>
    plastic("#ffffff", { map: diceFace(index + 1), roughness: 0.36 }),
  );
  const block = rounded(
    root,
    0.64,
    0.64,
    0.64,
    questionMaterial,
    [0, 2.1, 0],
    0.045,
  );
  [-0.69, 0.69].forEach((x) => {
    const brick = rounded(
      root,
      0.64,
      0.64,
      0.64,
      plastic("#c89975"),
      [x, 2.1, 0],
      0.025,
    );
    for (let i = -1; i <= 1; i++)
      rounded(
        brick,
        0.63,
        0.018,
        0.008,
        plastic("#a47457"),
        [0, i * 0.19, 0.324],
        0.003,
      );
    rounded(
      brick,
      0.018,
      0.61,
      0.008,
      plastic("#a47457"),
      [0, 0, 0.325],
      0.003,
    );
  });
  const person = new THREE.Group();
  root.add(person);
  person.position.set(0, 0.31, 0.3);
  const red = plastic("#bd6575");
  const blue = plastic("#6e84b1");
  const skin = plastic("#efc392");
  const dark = plastic("#62524b");
  rounded(person, 0.34, 0.29, 0.32, skin, [0, 0.84, 0], 0.015);
  rounded(person, 0.41, 0.11, 0.37, red, [0, 1.04, 0], 0.015);
  rounded(person, 0.45, 0.06, 0.2, red, [0.05, 0.99, 0.19], 0.012);
  rounded(person, 0.38, 0.34, 0.3, blue, [0, 0.54, 0], 0.02);
  rounded(person, 0.3, 0.12, 0.025, red, [0, 0.7, 0.165], 0.01);
  [-0.24, 0.24].forEach((x) => {
    rounded(person, 0.13, 0.24, 0.2, red, [x, 0.59, 0], 0.018);
    rounded(person, 0.14, 0.14, 0.22, skin, [x, 0.42, 0.03], 0.015);
  });
  [-0.11, 0.11].forEach((x) => {
    rounded(person, 0.13, 0.22, 0.23, blue, [x, 0.28, 0], 0.01);
    rounded(person, 0.19, 0.13, 0.34, dark, [x, 0.11, 0.045], 0.012);
    rounded(person, 0.036, 0.056, 0.02, dark, [x * 0.65, 0.87, 0.172], 0.004);
  });
  rounded(person, 0.14, 0.035, 0.025, dark, [0, 0.775, 0.175], 0.003);
  rounded(person, 0.09, 0.07, 0.08, skin, [0, 0.83, 0.192], 0.01);
  const coin = disc(root, 0.13, 0.055, gold, [0, 2.12, 0.04]);
  coin.visible = false;
  label(root, "PRESS START", 1.03, 0.12, [0, 0.14, 0.96], "#d7b696", "#fff2df");
  let card;
  return {
    duration: 4600,
    dispose() {
      questionMaterial.map.dispose();
      questionMaterial.dispose();
      diceMaterials.forEach((material) => {
        material.map.dispose();
        material.dispose();
      });
    },
    begin(winner) {
      if (card) {
        root.remove(card);
        disposeGroup(card);
      }
      card = resultCard(root, options[winner], [0, 2.84, 0.45]);
      block.material = questionMaterial;
      diceMaterials[4].map.dispose();
      diceMaterials[4].map = diceFace(winner + 1);
      diceMaterials[4].needsUpdate = true;
      coin.visible = false;
      return (t) => {
        const jump = clamp((t - 0.12) / 0.48, 0, 1);
        person.position.y = 0.31 + Math.sin(jump * Math.PI) * 0.43;
        person.scale.y =
          t < 0.12
            ? 1 - Math.sin((t / 0.12) * Math.PI) * 0.14
            : jump > 0.86 && jump < 1
              ? 0.93
              : 1;
        person.rotation.y = Math.sin(jump * Math.PI) * -0.12;
        const hit = clamp((t - 0.33) / 0.47, 0, 1);
        if (hit > 0.06) block.material = diceMaterials;
        block.position.y = 2.1 + Math.sin(hit * Math.PI) * 0.59;
        const spin = 1 - (1 - hit) ** 3 * (1 + 3 * hit);
        block.rotation.y = spin * TAU * 3;
        block.rotation.x = spin * TAU * 2;
        block.rotation.z = Math.sin(hit * Math.PI) * 0.24;
        const pop = clamp((t - 0.34) / 0.32, 0, 1);
        coin.visible = pop > 0 && pop < 1;
        coin.position.y = 2.13 + Math.sin(pop * Math.PI) * 0.85;
        coin.rotation.y = pop * TAU * 2;
        const reveal = smooth(clamp((t - 0.79) / 0.21, 0, 1));
        card.scale.setScalar(Math.max(0.001, reveal));
        card.position.y = 2.6 + reveal * 0.24;
        return {
          selectedIndex: winner,
          motion:
            t < 0.33
              ? "jumping"
              : t < 0.76
                ? "dice-spin"
                : t < 0.92
                  ? "settling"
                  : "revealed",
          revealed: reveal > 0.95,
          diceAngle: (block.rotation.y * 180) / Math.PI,
        };
      };
    },
  };
}

function disposeGroup(group) {
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

export function createPickerScene(container, mode, options) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch {
    container.innerHTML = renderScene(mode, options);
    container.dataset.renderer = "fallback";
    return {
      animate: async (winner) => {
        container.dataset.phase = "animating";
        container.dataset.visualResult = "hidden";
        await animateScene(container, mode, winner, options.length);
        container.dataset.selectedIndex = String(winner);
        container.dataset.phase = "result";
        container.dataset.visualResult = "visible";
      },
      dispose() {},
    };
  }
  container.replaceChildren(renderer.domElement);
  container.dataset.renderer = "webgl";
  renderer.domElement.setAttribute(
    "aria-label",
    `${mode === "wheel" ? "幸运转盘" : mode === "capsule" ? "惊喜扭蛋机" : "像素顶骰子"} 3D 动画场景`,
  );
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  const scene = new THREE.Scene();
  const sceneBackground = () =>
    isDarkTheme()
      ? mode === "capsule"
        ? "#2a222b"
        : mode === "pixel"
          ? "#1f2c27"
          : "#242130"
      : mode === "capsule"
        ? "#f3e8e9"
        : mode === "pixel"
          ? "#e9eee3"
          : "#eee9f3";
  const background = sceneBackground();
  container.dataset.theme = isDarkTheme() ? "dark" : "light";
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(background, 9, 18);
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 40);
  camera.zoom = 1.22;
  const target = new THREE.Vector3(0, 1.66, 0);
  let viewAngle = 0.19;
  const placeCamera = () => {
    camera.position.set(Math.sin(viewAngle) * 7, 3.2, Math.cos(viewAngle) * 7);
    camera.lookAt(target);
  };
  placeCamera();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight("#fffcf7", "#b6a0b8", 0.7));
  const key = new THREE.DirectionalLight("#fff7e9", 1.8);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -3;
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#d9caff", 1.15);
  rim.position.set(4, 4, -3);
  scene.add(rim);
  const floor = addMesh(
    scene,
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: background, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  floor.position.y = -0.025;
  const root = new THREE.Group();
  scene.add(root);
  const model =
    mode === "wheel"
      ? buildWheel(root, options)
      : mode === "capsule"
        ? buildCapsule(root, options)
        : buildPixel(root, options);
  const render = () => renderer.render(scene, camera);
  const updateSceneTheme = () => {
    const color = sceneBackground();
    scene.background.set(color);
    scene.fog.color.set(color);
    floor.material.color.set(color);
    scene.environmentIntensity = isDarkTheme() ? 0.58 : 0.65;
    renderer.toneMappingExposure = isDarkTheme() ? 0.92 : 0.88;
    container.dataset.theme = isDarkTheme() ? "dark" : "light";
    render();
  };
  window.addEventListener(themeEvent, updateSceneTheme);
  updateSceneTheme();
  const resize = () => {
    const width = container.clientWidth,
      height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  let frame = 0,
    disposed = false,
    running = false,
    finish;
  let dragX;
  const down = (event) => {
    if (running) return;
    dragX = event.clientX;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    if (dragX == null || running) return;
    viewAngle = clamp(viewAngle + (event.clientX - dragX) * 0.003, -0.4, 0.65);
    dragX = event.clientX;
    placeCamera();
    render();
  };
  const up = () => {
    dragX = undefined;
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", up);
  return {
    animate(winner) {
      const animate = model.begin(winner);
      running = true;
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 200
        : model.duration;
      const start = performance.now();
      container.dataset.phase = "animating";
      container.dataset.visualResult = "hidden";
      return new Promise((resolve) => {
        finish = resolve;
        const tick = (now) => {
          if (disposed) return;
          const t = clamp((now - start) / duration, 0, 1);
          const debug = animate(t);
          container.dataset.motion = debug.motion || "animating";
          container.dataset.visualResult = debug.revealed
            ? "visible"
            : "hidden";
          if (debug.rollAngle != null)
            container.dataset.rollAngle = String(debug.rollAngle);
          if (debug.diceAngle != null)
            container.dataset.diceAngle = String(debug.diceAngle);
          if (debug.angle != null)
            container.dataset.angle = String(debug.angle);
          render();
          if (t < 1) frame = requestAnimationFrame(tick);
          else {
            running = false;
            container.dataset.phase = "result";
            container.dataset.selectedIndex = String(debug.selectedIndex);
            finish = undefined;
            resolve();
          }
        };
        frame = requestAnimationFrame(tick);
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      finish?.();
      observer.disconnect();
      window.removeEventListener(themeEvent, updateSceneTheme);
      disposeGroup(scene);
      model.dispose?.();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
