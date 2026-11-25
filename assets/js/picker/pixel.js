import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  TAU,
  clamp,
  smooth,
  easeOut,
  random,
  plastic,
  addMesh,
  rounded,
  texture,
  splitEmoji,
  fitFont,
  createResultCard,
  createConfetti,
} from "./kit.js";
import {
  simulateDice,
  sampleFrame,
  rotateByQuaternion,
  FACE_NORMALS,
} from "./physics.js";

const GROUND = 0.315;
const GRAVITY = 9;
const HALF = 0.27;
const BLOCK_Y = 2.1;
const CROUCH = 0.18;
const CAP_TOP = 1.095;
const PERSON_Y = GROUND - 0.045;
const HIT_HEIGHT = BLOCK_Y - 0.32 - (PERSON_Y + CAP_TOP);
const LAUNCH = Math.sqrt(2 * GRAVITY * HIT_HEIGHT) * 1.08;
const RISE =
  (LAUNCH - Math.sqrt(LAUNCH ** 2 - 2 * GRAVITY * HIT_HEIGHT)) / GRAVITY;
const FALL = Math.sqrt((2 * HIT_HEIGHT) / GRAVITY);
const HIT_AT = CROUCH + RISE;
const LAND_AT = HIT_AT + FALL;

function diceFace(option, quarter) {
  return texture(
    (ctx, size) => {
      ctx.fillStyle = "#fff3e3";
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "#e9cfaa";
      ctx.lineWidth = 10;
      ctx.strokeRect(14, 14, size - 28, size - 28);
      ctx.translate(size / 2, size / 2);
      ctx.rotate((quarter * Math.PI) / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const { emoji, text } = splitEmoji(option);
      const words = text || option;
      const lines =
        words.length > 4 && !emoji
          ? [
              words.slice(0, Math.ceil(words.length / 2)),
              words.slice(Math.ceil(words.length / 2)),
            ]
          : [words];
      ctx.fillStyle = "#6e5579";
      if (emoji) {
        ctx.font =
          '190px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.fillText(emoji, 0, -58);
        fitFont(ctx, words, size * 0.84, 116);
        ctx.fillText(words, 0, 138);
      } else {
        const sizeFont = Math.min(
          ...lines.map((line) =>
            fitFont(ctx, line, size * 0.84, lines.length > 1 ? 150 : 190),
          ),
        );
        ctx.font = `700 ${sizeFont}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        lines.forEach((line, row) =>
          ctx.fillText(
            line,
            0,
            (row - (lines.length - 1) / 2) * sizeFont * 1.1,
          ),
        );
      }
    },
    512,
    512,
  );
}

// Which local directions the texture's u and v run along on each face of the (rounded) box.
function faceAxes(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const snap = (vector, face) => {
    let best = null;
    let bestDot = -Infinity;
    for (const axis of FACE_NORMALS) {
      if (
        Math.abs(axis[0] * face[0] + axis[1] * face[1] + axis[2] * face[2]) >
        0.5
      )
        continue;
      const d = axis[0] * vector[0] + axis[1] * vector[1] + axis[2] * vector[2];
      if (d > bestDot) {
        bestDot = d;
        best = axis;
      }
    }
    return best;
  };
  return geometry.groups.map((group) => {
    const face = FACE_NORMALS[group.materialIndex];
    const extremes = { minU: null, maxU: null, minV: null, maxV: null };
    for (let i = group.start; i < group.start + group.count; i++) {
      const facing =
        normal.getX(i) * face[0] +
        normal.getY(i) * face[1] +
        normal.getZ(i) * face[2];
      if (facing < 0.999) continue;
      const point = [position.getX(i), position.getY(i), position.getZ(i)];
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (!extremes.minU || u < extremes.minU[0]) extremes.minU = [u, point];
      if (!extremes.maxU || u > extremes.maxU[0]) extremes.maxU = [u, point];
      if (!extremes.minV || v < extremes.minV[0]) extremes.minV = [v, point];
      if (!extremes.maxV || v > extremes.maxV[0]) extremes.maxV = [v, point];
    }
    const along = (a, b) => b[1].map((value, k) => value - a[1][k]);
    return {
      index: group.materialIndex,
      u: snap(along(extremes.minU, extremes.maxU), face),
      v: snap(along(extremes.minV, extremes.maxV), face),
    };
  });
}

// Keep the character and the dice in one shot, pulling back as they get further apart.
function frameBoth(x, z, elevation) {
  return {
    target: [x * 0.5, 0.95, (z + 0.3) / 2],
    distance: 4.9 + Math.abs(x) * 0.7,
    elevation,
  };
}

function buildPerson(root) {
  const red = plastic("#bd6575");
  const blue = plastic("#6e84b1");
  const skin = plastic("#efc392");
  const dark = plastic("#62524b");
  const person = new THREE.Group();
  person.position.set(0, PERSON_Y, 0.3);
  root.add(person);
  const body = new THREE.Group();
  person.add(body);
  rounded(body, 0.38, 0.34, 0.3, blue, [0, 0.54, 0], 0.02);
  rounded(body, 0.3, 0.12, 0.025, red, [0, 0.7, 0.165], 0.01);
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0);
  body.add(head);
  rounded(head, 0.34, 0.29, 0.32, skin, [0, 0.14, 0], 0.015);
  rounded(head, 0.41, 0.11, 0.37, red, [0, 0.34, 0], 0.015);
  rounded(head, 0.45, 0.06, 0.2, red, [0.05, 0.29, 0.19], 0.012);
  rounded(head, 0.14, 0.035, 0.025, dark, [0, 0.075, 0.175], 0.003);
  rounded(head, 0.09, 0.07, 0.08, skin, [0, 0.13, 0.192], 0.01);
  const eyes = [-0.0715, 0.0715].map((x) =>
    rounded(head, 0.036, 0.056, 0.02, dark, [x, 0.17, 0.172], 0.004),
  );
  const arms = [-0.24, 0.24].map((x) => {
    const arm = new THREE.Group();
    arm.position.set(x, 0.7, 0);
    body.add(arm);
    rounded(arm, 0.13, 0.24, 0.2, red, [0, -0.11, 0], 0.018);
    rounded(arm, 0.14, 0.14, 0.22, skin, [0, -0.28, 0.03], 0.015);
    return arm;
  });
  const legs = [-0.11, 0.11].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.39, 0);
    body.add(leg);
    rounded(leg, 0.13, 0.22, 0.23, blue, [0, -0.11, 0], 0.01);
    rounded(leg, 0.19, 0.13, 0.34, dark, [0, -0.28, 0.045], 0.012);
    return leg;
  });
  return { person, body, head, arms, legs, eyes };
}

export function buildPixel(root, options, { sfx, camera }) {
  const grass = plastic("#a5ba8c");
  const soil = plastic("#d7b696");
  rounded(root, 4.4, 0.22, 2.3, soil, [0, 0.12, 0], 0.08);
  rounded(root, 4.46, 0.1, 2.34, grass, [0, 0.265, 0], 0.025);
  // Decor stays at the back of the platform, out of every accepted dice path.
  const pipe = plastic("#6fae7c", { roughness: 0.35 });
  addMesh(root, new THREE.CylinderGeometry(0.24, 0.24, 0.62, 28), pipe, [
    -1.62,
    GROUND + 0.31,
    -0.72,
  ]);
  addMesh(root, new THREE.CylinderGeometry(0.3, 0.3, 0.18, 28), pipe, [
    -1.62,
    GROUND + 0.71,
    -0.72,
  ]);
  const leaf = plastic("#86b26d", { roughness: 0.55, clearcoat: 0.1 });
  [
    [1.52, 0.17, -0.78, 0.22],
    [1.78, 0.14, -0.7, 0.18],
    [1.66, 0.25, -0.86, 0.2],
  ].forEach(([x, y, z, r]) =>
    addMesh(root, new THREE.SphereGeometry(r, 18, 12), leaf, [
      x,
      GROUND + y,
      z,
    ]),
  );
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
  const usedMap = texture(
    (ctx, w) => {
      ctx.fillStyle = "#a9805f";
      ctx.fillRect(0, 0, w, w);
      ctx.strokeStyle = "#7d5a40";
      ctx.lineWidth = 34;
      ctx.strokeRect(36, 36, w - 72, w - 72);
      [
        [100, 100],
        [w - 100, 100],
        [100, w - 100],
        [w - 100, w - 100],
      ].forEach(([x, y]) => {
        ctx.fillStyle = "#7d5a40";
        ctx.fillRect(x - 24, y - 24, 48, 48);
      });
    },
    512,
    512,
  );
  const questionMaterial = plastic("#ffffff", { map: blockMap });
  const usedMaterial = plastic("#ffffff", {
    map: usedMap,
    roughness: 0.6,
    clearcoat: 0.2,
  });
  const block = rounded(
    root,
    0.64,
    0.64,
    0.64,
    questionMaterial,
    [0, BLOCK_Y, 0],
    0.045,
  );
  const character = buildPerson(root);
  const diceGeometry = new RoundedBoxGeometry(
    HALF * 2,
    HALF * 2,
    HALF * 2,
    3,
    0.05,
  );
  const axes = faceAxes(diceGeometry);
  let diceMaterials = Array.from({ length: 6 }, () =>
    plastic("#fff3e3", { roughness: 0.38 }),
  );
  const dice = addMesh(root, diceGeometry, diceMaterials);
  dice.visible = false;
  const card = createResultCard(root, 0.7);
  const confetti = createConfetti(root, 40);
  const cardPosition = new THREE.Vector3();
  const look = new THREE.Vector3();

  function dressDice(winner, face, quaternion, position) {
    const others = options.map((_, i) => i).filter((i) => i !== winner);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const sequence = others.length >= 5 ? others : [];
    while (sequence.length < 5)
      sequence.push(...(others.length ? [...others, winner] : [winner]));
    // Text on the top face should read upright from wherever the camera is.
    look
      .set(position[0], 0, position[2])
      .sub(new THREE.Vector3(camera.position.x, 0, camera.position.z))
      .normalize();
    const axesForFace = axes.find((item) => item.index === face);
    const directions = [
      axesForFace.v,
      axesForFace.u,
      axesForFace.v.map((n) => -n),
      axesForFace.u.map((n) => -n),
    ];
    let quarter = 0;
    let best = -Infinity;
    directions.forEach((direction, k) => {
      const world = rotateByQuaternion(quaternion, direction);
      const score = world[0] * look.x + world[2] * look.z;
      if (score > best) {
        best = score;
        quarter = k;
      }
    });
    let next = 0;
    diceMaterials.forEach((material, index) => {
      material.map?.dispose();
      const option =
        index === face ? options[winner] : options[sequence[next++]];
      material.map = diceFace(option, index === face ? quarter : 0);
      material.needsUpdate = true;
    });
  }

  function plan() {
    const start = [0, BLOCK_Y + 0.32 + HALF + 0.02, 0.02];
    let result;
    // About 60% of throws pass these checks, so 40 tries effectively never run out.
    for (let attempt = 0; attempt < 40; attempt++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      result = simulateDice({
        position: start,
        velocity: [
          side * random(1.35, 1.7),
          random(1.7, 2.2),
          random(0.15, 0.4),
        ],
        angular: [0, 1, 2].map(
          () => (Math.random() < 0.5 ? -1 : 1) * random(6, 12),
        ),
        quaternion: new THREE.Quaternion()
          .setFromEuler(
            new THREE.Euler(random(0, TAU), random(0, TAU), random(0, TAU)),
          )
          .toArray(),
        half: HALF,
        ground: GROUND,
        gravity: GRAVITY,
        friction: 0.75,
      });
      const frames = result.frames;
      const count = frames.length / 7;
      let clear = result.settled;
      // Boxes are grown by the dice half-size, so the dice never passes through the block or character.
      for (let i = 6; clear && i < count; i += 3) {
        const x = frames[i * 7];
        const y = frames[i * 7 + 1];
        const z = frames[i * 7 + 2];
        if (
          Math.abs(x) < 0.32 + HALF &&
          Math.abs(z) < 0.32 + HALF &&
          y < BLOCK_Y + 0.32 + HALF - 0.01 &&
          y > BLOCK_Y - 0.32 - HALF
        )
          clear = false;
        if (
          Math.abs(x) < 0.36 + HALF &&
          Math.abs(z - 0.3) < 0.25 + HALF &&
          y - HALF < PERSON_Y + 1.55
        )
          clear = false;
      }
      const x = Math.abs(frames[(count - 1) * 7]);
      const z = Math.abs(frames[(count - 1) * 7 + 2]);
      if (clear && x >= 0.95 && x <= 1.9 && z <= 0.95) break;
    }
    return result;
  }

  function pose(time, landedDiceAt, settleAt, dicePosition) {
    const { person, body, head, arms, legs, eyes } = character;
    let y = 0;
    let squash = 1;
    let raise = 0;
    if (time < CROUCH) squash = 1 - 0.16 * easeOut(time / CROUCH);
    else if (time < HIT_AT) {
      const t = time - CROUCH;
      y = LAUNCH * t - 0.5 * GRAVITY * t * t;
      squash = 1 + 0.12 * ((LAUNCH - GRAVITY * t) / LAUNCH);
    } else if (time < LAND_AT) {
      const t = time - HIT_AT;
      y = HIT_HEIGHT - 0.5 * GRAVITY * t * t;
      squash = 1 + 0.05 * (t / FALL);
    } else {
      const t = time - LAND_AT;
      squash = 1 - 0.15 * Math.exp(-9 * t) * Math.cos(17 * t);
    }
    const airborne = time >= CROUCH && time < LAND_AT;
    raise = airborne
      ? smooth(clamp((time - CROUCH + 0.06) / 0.14, 0, 1))
      : 1 - smooth(clamp((time - LAND_AT) / 0.25, 0, 1));
    let cheer = 0;
    if (settleAt !== null) {
      const t = time - settleAt - 0.2;
      if (t > 0 && t < 0.36) y += 0.12 * Math.sin((t / 0.36) * Math.PI);
      cheer =
        smooth(clamp(t / 0.15, 0, 1)) *
        (1 - smooth(clamp((t - 0.9) / 0.3, 0, 1)));
    }
    person.position.y = PERSON_Y + Math.max(0, y);
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    arms[1].rotation.z = (Math.PI - 0.32) * Math.max(raise, cheer);
    arms[0].rotation.z =
      -(Math.PI - 0.32) * cheer +
      (airborne ? 0.35 : 0) +
      (time < CROUCH ? 0.25 * (time / CROUCH) : 0);
    legs[1].rotation.x = airborne
      ? -0.55 *
        Math.sin(clamp((time - CROUCH) / (LAND_AT - CROUCH), 0, 1) * Math.PI)
      : 0;
    legs[0].rotation.x = airborne ? 0.2 : 0;
    head.rotation.x =
      time > HIT_AT && time < HIT_AT + 0.25
        ? 0.12 * Math.sin(((time - HIT_AT) / 0.25) * Math.PI)
        : 0;
    if (dicePosition && landedDiceAt !== null) {
      const yaw = clamp(
        Math.atan2(
          dicePosition.x - person.position.x,
          dicePosition.z - person.position.z,
        ),
        -0.9,
        0.9,
      );
      const blend = 1 - Math.exp(-(time - landedDiceAt) * 3);
      person.rotation.y = yaw * 0.6 * blend;
      head.rotation.y = yaw * 0.4 * blend;
    }
    const blink = time % 2.7 > 2.6;
    eyes.forEach((eye) => (eye.scale.y = blink ? 0.2 : 1));
  }

  return {
    dispose() {
      [questionMaterial, usedMaterial].forEach((material) => {
        material.map.dispose();
        material.dispose();
      });
      diceMaterials.forEach((material) => {
        material.map?.dispose();
        material.dispose();
      });
      diceGeometry.dispose();
    },
    begin(winner, { reduced }) {
      const throwPlan = plan();
      const last = sampleFrame(throwPlan.frames, throwPlan.duration);
      dressDice(winner, throwPlan.face, throwPlan.quaternion, last.position);
      card.set(options[winner]);
      card.hide();
      confetti.clear();
      const previousDice = dice.visible;
      const previousScale = dice.scale.x;
      const finalFocus = frameBoth(last.position[0], last.position[2], 0.6);
      if (reduced) {
        dice.visible = true;
        dice.scale.setScalar(1);
        dice.position.set(...last.position);
        dice.quaternion.fromArray(throwPlan.quaternion);
        block.material = usedMaterial;
        cardPosition.set(
          last.position[0],
          last.position[1] + 0.8,
          last.position[2],
        );
        card.update(cardPosition, 3, camera);
        character.person.rotation.y = 0;
        character.head.rotation.y = 0;
        return () => ({
          selectedIndex: winner,
          motion: "revealed",
          revealed: true,
          done: true,
          focus: finalFocus,
        });
      }
      block.material = questionMaterial;
      character.person.rotation.y = 0;
      character.head.rotation.y = 0;
      const impacts = [...throwPlan.impacts];
      const diceStart = HIT_AT + 0.03;
      const settleAt = diceStart + throwPlan.duration;
      const landedAt =
        throwPlan.landed !== null ? diceStart + throwPlan.landed : settleAt;
      let jumped = false;
      let bumped = false;
      let celebrated = false;
      const dicePosition = new THREE.Vector3();
      return (time, dt) => {
        if (previousDice && time < 0.2) {
          dice.scale.setScalar(
            Math.max(0.001, previousScale * (1 - smooth(time / 0.2))),
          );
        } else if (time < diceStart) dice.visible = false;
        if (!jumped && time >= CROUCH) {
          jumped = true;
          sfx?.jump();
        }
        if (!bumped && time >= HIT_AT) {
          bumped = true;
          block.material = usedMaterial;
          sfx?.bump();
          sfx?.coin();
        }
        const bump = clamp((time - HIT_AT) / 0.22, 0, 1);
        block.position.y = BLOCK_Y + Math.sin(bump * Math.PI) * 0.15;
        block.scale.set(
          1 + Math.sin(bump * Math.PI) * 0.04,
          1 - Math.sin(bump * Math.PI) * 0.05,
          1,
        );
        let focus = null;
        if (time >= diceStart) {
          const local = time - diceStart;
          const frame = sampleFrame(
            throwPlan.frames,
            Math.min(local, throwPlan.duration),
          );
          dice.visible = true;
          dice.scale.setScalar(Math.min(1, 0.55 + local * 6));
          dice.position.set(...frame.position);
          dice.quaternion.fromArray(frame.quaternion);
          dicePosition.copy(dice.position);
          while (impacts.length && impacts[0][0] <= local) {
            const strength = impacts.shift()[1];
            sfx?.thud(strength);
            sfx?.knock(strength * 0.5);
          }
          if (time > landedAt)
            focus = frameBoth(dicePosition.x, dicePosition.z, 0.45);
        }
        pose(
          time,
          time > landedAt ? landedAt : null,
          time > settleAt ? settleAt : null,
          time >= diceStart ? dicePosition : null,
        );
        const since = time - settleAt;
        if (since > 0.15) {
          if (!celebrated) {
            celebrated = true;
            confetti.burst(
              dicePosition.clone().add(new THREE.Vector3(0, 0.25, 0)),
              GROUND,
              0.7,
            );
          }
          cardPosition.set(
            dicePosition.x,
            dicePosition.y +
              0.25 +
              0.55 * smooth(clamp((since - 0.15) / 0.5, 0, 1)),
            dicePosition.z,
          );
          card.update(cardPosition, (since - 0.15) * 1.6, camera);
        }
        confetti.update(dt);
        return {
          selectedIndex: winner,
          motion:
            time < HIT_AT
              ? "jumping"
              : time < settleAt - 0.3
                ? "dice-roll"
                : since < 0.3
                  ? "settling"
                  : "revealed",
          revealed: since > 0.35,
          done: since > 1.9,
          focus: since > 0 ? finalFocus : focus,
          diceAngle: (dice.rotation.y * 180) / Math.PI,
        };
      };
    },
  };
}
