import * as THREE from "three";
import {
  palette,
  TAU,
  clamp,
  smooth,
  random,
  plastic,
  addMesh,
  rounded,
  disc,
  canvas,
  canvasTexture,
  label,
  splitEmoji,
  fitFont,
} from "./kit.js";
import { solveWheel, sampleTrack } from "./physics.js";

function faceCanvas(options) {
  return canvas((ctx, size) => {
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
      ctx.strokeStyle = "#fff6";
      ctx.lineWidth = 3;
      ctx.stroke();
      const a = (index + 0.5) * step;
      ctx.save();
      ctx.translate(
        center + Math.sin(a) * size * 0.33,
        center - Math.cos(a) * size * 0.33,
      );
      ctx.rotate(a);
      ctx.fillStyle = "#574a5b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const { text } = splitEmoji(option);
      const plain = text || option;
      const parts =
        plain.length > 6 ? [plain.slice(0, 6), plain.slice(6, 12)] : [plain];
      const maxWidth = Math.min(200, 2 * Math.sin(step / 2) * size * 0.3);
      parts.forEach((part, row) => {
        fitFont(ctx, part, maxWidth, options.length > 10 ? 40 : 54);
        ctx.fillText(part, 0, (row - (parts.length - 1) / 2) * 44);
      });
      ctx.restore();
    });
  });
}

// Rotational blur: the running average of many slightly rotated copies.
function blurredCanvas(source, spread) {
  return canvas((ctx, size) => {
    const samples = 20;
    for (let i = 0; i < samples; i++) {
      ctx.globalAlpha = 1 / (i + 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(size / 2, size / 2);
      ctx.rotate((i / (samples - 1) - 0.5) * spread);
      ctx.translate(-size / 2, -size / 2);
      ctx.drawImage(source, 0, 0);
    }
  }, source.width);
}

export function buildWheel(root, options, { sfx }) {
  const count = options.length;
  const step = TAU / count;
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
  disc(rotor, 1.32, 0.23, ivory, [0, 0, 0], 72);
  const sharp = faceCanvas(options);
  const face = addMesh(
    rotor,
    new THREE.CircleGeometry(1.22, 96),
    plastic("#ffffff", {
      map: canvasTexture(sharp),
      roughness: 0.4,
      metalness: 0.02,
    }),
    [0, 0, 0.122],
  );
  face.castShadow = false;
  const blurMaterial = new THREE.MeshBasicMaterial({
    map: canvasTexture(blurredCanvas(sharp, Math.min(1.1, step * 1.6))),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const blur = addMesh(
    rotor,
    new THREE.CircleGeometry(1.22, 96),
    blurMaterial,
    [0, 0, 0.1235],
  );
  blur.castShadow = false;
  blur.receiveShadow = false;
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: "#fffdf5",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  let highlight;
  const pegMaterial = plastic("#efe2c4", { metalness: 0.55, roughness: 0.25 });
  const pegGeometry = new THREE.CylinderGeometry(0.02, 0.024, 0.2, 12);
  for (let i = 0; i < count; i++) {
    const angle = i * step;
    const peg = addMesh(rotor, pegGeometry, pegMaterial, [
      Math.sin(angle) * 1.17,
      Math.cos(angle) * 1.17,
      0.22,
    ]);
    peg.rotation.x = Math.PI / 2;
  }
  addMesh(
    center,
    new THREE.TorusGeometry(1.285, 0.047, 12, 96),
    gold,
    [0, 0, 0.14],
  );
  disc(rotor, 0.3, 0.08, gold, [0, 0, 0.18]);
  disc(rotor, 0.25, 0.07, ivory, [0, 0, 0.225]);
  label(rotor, "LUCK", 0.4, 0.14, [0, 0, 0.266], "#f8f2e6", "#9277ad");
  const bulbs = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i * TAU) / 24;
    const bulb = addMesh(
      center,
      new THREE.SphereGeometry(0.027, 10, 10),
      plastic("#fff2c9", { emissive: "#ffd88a", emissiveIntensity: 0.35 }),
      [Math.sin(angle) * 1.283, Math.cos(angle) * 1.283, 0.192],
    );
    bulb.castShadow = false;
    bulbs.push(bulb);
  }
  const pointer = new THREE.Group();
  pointer.position.set(0, 1.34, 0.27);
  center.add(pointer);
  const shape = new THREE.Shape();
  shape.moveTo(-0.1, 0.12);
  shape.lineTo(0.1, 0.12);
  shape.lineTo(0.022, -0.2);
  shape.quadraticCurveTo(0, -0.225, -0.022, -0.2);
  shape.closePath();
  addMesh(
    pointer,
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 2,
      steps: 1,
    }),
    gold,
    [0, 0, -0.03],
  );
  disc(pointer, 0.045, 0.03, ivory, [0, 0.06, 0.05]);
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
  const lightBulbs = (time, speed, mode) => {
    bulbs.forEach((bulb, i) => {
      let intensity = 0.35;
      if (mode === "chase") {
        const phase = (((i / 24 - time * speed) % 1) + 1) % 1;
        intensity = 0.25 + (phase < 0.18 ? 1.6 * (1 - phase / 0.18) : 0);
      } else if (mode === "blink") {
        intensity = Math.sin(time * TAU * 3.2) > 0 ? 1.8 : 0.3;
      } else if (mode === "glow") intensity = 0.9;
      bulb.material.emissiveIntensity = intensity;
    });
  };
  const setHighlight = (winner) => {
    if (highlight) {
      rotor.remove(highlight);
      highlight.geometry.dispose();
    }
    highlight = addMesh(
      rotor,
      new THREE.CircleGeometry(
        1.215,
        32,
        Math.PI / 2 - (winner + 1) * step,
        step,
      ),
      highlightMaterial,
      [0, 0, 0.1245],
    );
    highlight.castShadow = false;
    highlight.receiveShadow = false;
  };
  const apply = (angle, flap, speed) => {
    rotor.rotation.z = angle;
    pointer.rotation.z = -flap;
    blurMaterial.opacity =
      smooth(clamp((Math.abs(speed) - 3) / 9, 0, 1)) * 0.92;
  };
  const debug = (angle) => ({
    angle: (angle * 180) / Math.PI,
    selectedIndex: Math.floor((((angle % TAU) + TAU) % TAU) / step),
  });

  return {
    dispose() {
      pegGeometry.dispose();
      highlightMaterial.dispose();
    },
    begin(winner, { reduced }) {
      setHighlight(winner);
      highlightMaterial.opacity = 0;
      const offset = random(0.24, 0.76);
      if (reduced) {
        const base = rotation - (((rotation % TAU) + TAU) % TAU);
        rotation = base + TAU + (winner + offset) * step;
        return () => {
          apply(rotation, 0, 0);
          lightBulbs(0, 0, "glow");
          highlightMaterial.opacity = 0.22;
          return {
            ...debug(rotation),
            motion: "revealed",
            revealed: true,
            done: true,
          };
        };
      }
      const plan = solveWheel({
        count,
        start: rotation,
        winner,
        turns: 3 + Math.floor(Math.random() * 3),
        offset,
      });
      const ticks = [...plan.ticks];
      const stopAt = plan.duration;
      let previous = rotation;
      rotation = plan.final;
      return (time, dt) => {
        const t = Math.min(time, stopAt);
        const angle = sampleTrack(plan.angles, t);
        const flap = sampleTrack(plan.flaps, t);
        const speed = dt > 0 ? (angle - previous) / dt : 0;
        previous = angle;
        apply(angle, flap, time < stopAt ? speed : 0);
        while (ticks.length && ticks[0][0] <= time) sfx?.tick(ticks.shift()[1]);
        const after = time - stopAt;
        if (after < 0) {
          lightBulbs(time, clamp(Math.abs(speed) / 6, 0.15, 2.4), "chase");
          if (time < 0.36 && time + dt >= 0.36) sfx?.whoosh(0.8);
        } else {
          lightBulbs(after, 0, after < 1.25 ? "blink" : "glow");
          highlightMaterial.opacity =
            after < 1.25
              ? 0.16 + 0.16 * Math.sin(after * TAU * 1.6) ** 2
              : 0.22;
        }
        const slow = after < 0 && Math.abs(speed) < 2.2 && time > 1;
        return {
          ...debug(angle),
          motion: after < 0 ? (slow ? "settling" : "spinning") : "revealed",
          revealed: after > 0.12,
          done: after > 1.45,
          focus:
            slow || after >= 0
              ? { target: [0, 2.12, 0], distance: 6.25, elevation: 0.17 }
              : null,
        };
      };
    },
  };
}
