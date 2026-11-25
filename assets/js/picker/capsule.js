import * as THREE from "three";
import {
  palette,
  TAU,
  clamp,
  smooth,
  easeInOut,
  springOut,
  random,
  plastic,
  addMesh,
  rounded,
  disc,
  label,
  createResultCard,
  createConfetti,
} from "./kit.js";

const BALL = 0.235;
const GLOBE = new THREE.Vector3(0, 2.15, 0);
const INNER = 0.9 - BALL;
const PLATE = 1.45;
const FLOOR = PLATE + BALL;
const GRAVITY = 16;
const SUBSTEP = 1 / 240;
const CLOSE_UP = { target: [0.2, 0.78, 0.55], distance: 6.1, elevation: 0.4 };
const OUTLET = {
  x: 0.45,
  lip: 0.465,
  lipEnd: 0.775,
  base: 0.23,
  baseEnd: 0.88,
};

function capsule(parent, radius, color) {
  const group = new THREE.Group();
  parent.add(group);
  const top = new THREE.Group();
  group.add(top);
  addMesh(
    top,
    new THREE.SphereGeometry(radius, 28, 14, 0, TAU, 0, Math.PI / 2),
    plastic(color),
  );
  const rim = addMesh(
    top,
    new THREE.TorusGeometry(radius * 0.985, 0.01, 6, 36),
    plastic("#d6c7b6", { metalness: 0.3 }),
  );
  rim.rotation.x = Math.PI / 2;
  const bottom = addMesh(
    group,
    new THREE.SphereGeometry(radius, 28, 14, 0, TAU, Math.PI / 2, Math.PI / 2),
    plastic("#fff3df", { side: THREE.DoubleSide }),
  );
  return { group, top, bottom };
}

// Knob crank: two hand strokes with a short re-grip, like turning a real gacha handle.
function crankAngle(t) {
  if (t < 0.14) return -0.1 * smooth(t / 0.14);
  if (t < 0.84) return -0.1 + (Math.PI + 0.1) * easeInOut((t - 0.14) / 0.7);
  if (t < 0.98) return Math.PI;
  if (t < 1.68) return Math.PI + Math.PI * easeInOut((t - 0.98) / 0.7);
  return TAU;
}
const CRANK_END = 1.68;

// The winning capsule leaves the chute, drops to the floor, bounces and rolls to a stop.
function planRoll(targetZ) {
  const run = (vz, record) => {
    let y = OUTLET.lip + BALL;
    let z = 0.42;
    let vy = 0;
    let v = vz;
    let roll = 0;
    let time = 0;
    let onFloor = false;
    const frames = record ? [] : null;
    const impacts = record ? [] : null;
    while (time < 4) {
      const support =
        z < OUTLET.lipEnd ? OUTLET.lip : z < OUTLET.baseEnd ? OUTLET.base : 0;
      if (y > support + BALL + 1e-4 || vy > 0) {
        vy -= GRAVITY * SUBSTEP;
        y += vy * SUBSTEP;
        if (y < support + BALL) {
          y = support + BALL;
          if (vy < -0.5) impacts?.push([time, Math.min(1, -vy / 4)]);
          vy = vy < -0.5 ? -vy * 0.42 : 0;
          v *= 0.9;
          onFloor = support === 0;
        }
      }
      const grounded = y <= support + BALL + 1e-4 && vy <= 0;
      if (grounded) v = Math.max(0, v - (support ? 0.3 : 0.95) * SUBSTEP);
      z += v * SUBSTEP;
      roll += (v * SUBSTEP) / BALL;
      frames?.push(y, z, roll);
      time += SUBSTEP;
      if (onFloor && grounded && v < 0.015) break;
    }
    return { z, frames, impacts, duration: time };
  };
  let low = 0.2;
  let high = 4;
  for (let i = 0; i < 30; i++) {
    const middle = (low + high) / 2;
    if (run(middle, false).z < targetZ) low = middle;
    else high = middle;
  }
  return run((low + high) / 2, true);
}

export function buildCapsule(root, options, { sfx, camera }) {
  const pink = plastic("#d994a0");
  const ivory = plastic("#fff3df");
  const gold = plastic("#d9bd86", { metalness: 0.65 });
  const dark = plastic("#675364", { roughness: 0.8 });
  rounded(root, 2.08, 0.22, 1.56, ivory, [0, 0.12, 0], 0.09);
  rounded(root, 1.78, 1.12, 1.14, pink, [0, 0.79, 0], 0.12);
  rounded(root, 1.88, 0.12, 1.2, ivory, [0, 1.39, 0], 0.05);
  const hole = disc(
    root,
    0.26,
    0.01,
    plastic("#4b3c48", { roughness: 0.9 }),
    [0, PLATE + 0.004, 0],
    40,
  );
  hole.rotation.x = 0;
  hole.receiveShadow = true;
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
    GLOBE.toArray(),
  ).castShadow = false;
  const stirrer = new THREE.Group();
  stirrer.position.set(0, PLATE + 0.035, 0);
  root.add(stirrer);
  rounded(stirrer, 0.86, 0.05, 0.07, gold, [0, 0, 0], 0.02);
  rounded(stirrer, 0.07, 0.05, 0.86, gold, [0, 0, 0], 0.02);
  disc(stirrer, 0.08, 0.06, gold, [0, 0.02, 0]).rotation.x = 0;

  const start = [
    [-0.36, 0.2],
    [0.1, 0.42],
    [0.42, 0.12],
    [-0.25, -0.38],
    [0.3, -0.33],
    [-0.05, 0],
    [-0.42, -0.08],
    [0.12, -0.12],
    [0.26, 0.28],
    [-0.18, 0.3],
    [0.05, 0.25],
    [-0.2, -0.15],
  ];
  const balls = start.map(([x, z], i) => {
    const ball = capsule(root, BALL, palette[i % palette.length]);
    ball.group.rotation.set(i * 0.72, i * 0.3, i * 0.85);
    return {
      ...ball,
      color: palette[i % palette.length],
      p: new THREE.Vector3(x, FLOOR + 0.05 + (i % 3) * 0.42, z),
      v: new THREE.Vector3(),
      active: true,
    };
  });
  let lastKnock = 0;
  let clock = 0;
  const pair = new THREE.Vector3();
  function physics(dt, agitation) {
    const active = balls.filter((ball) => ball.active);
    for (const ball of active) {
      ball.v.y -= GRAVITY * dt;
      ball.v.multiplyScalar(1 - 0.35 * dt);
      const height = ball.p.y - FLOOR;
      if (agitation > 0 && height < 0.5) {
        const radius = Math.hypot(ball.p.x, ball.p.z) + 0.05;
        const push = agitation * (1 - height / 0.5);
        ball.v.x += (-ball.p.z / radius) * push * 9.5 * dt;
        ball.v.z += (ball.p.x / radius) * push * 9.5 * dt;
        ball.v.y += push * random(6, 22) * dt;
      }
      ball.p.addScaledVector(ball.v, dt);
    }
    let hardest = 0;
    for (let iteration = 0; iteration < 3; iteration++) {
      for (let i = 0; i < active.length; i++) {
        const a = active[i];
        for (let j = i + 1; j < active.length; j++) {
          const b = active[j];
          pair.subVectors(b.p, a.p);
          const distance = pair.length();
          if (distance >= BALL * 2 || distance < 1e-6) continue;
          pair.divideScalar(distance);
          const overlap = (BALL * 2 - distance) / 2;
          a.p.addScaledVector(pair, -overlap);
          b.p.addScaledVector(pair, overlap);
          const relative = b.v.dot(pair) - a.v.dot(pair);
          if (relative < 0) {
            const impulse = (-(1 + 0.45) * relative) / 2;
            a.v.addScaledVector(pair, -impulse);
            b.v.addScaledVector(pair, impulse);
            hardest = Math.max(hardest, -relative);
          }
        }
        pair.subVectors(a.p, GLOBE);
        const reach = pair.length();
        if (reach > INNER) {
          pair.divideScalar(reach);
          a.p.copy(GLOBE).addScaledVector(pair, INNER);
          const normal = a.v.dot(pair);
          if (normal > 0) {
            a.v.addScaledVector(pair, -(1 + 0.4) * normal);
            hardest = Math.max(hardest, normal);
          }
          a.v.multiplyScalar(0.995);
        }
        if (a.p.y < FLOOR) {
          a.p.y = FLOOR;
          if (a.v.y < 0) {
            hardest = Math.max(hardest, -a.v.y);
            a.v.y *= -0.35;
          }
          a.v.x *= 0.99;
          a.v.z *= 0.99;
        }
      }
    }
    if (hardest > 0.9 && clock - lastKnock > 0.05) {
      lastKnock = clock;
      sfx?.knock(hardest / 7);
    }
  }
  const spin = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  function syncBalls(dt) {
    for (const ball of balls) {
      if (!ball.active) continue;
      ball.group.position.copy(ball.p);
      const speed = Math.hypot(ball.v.x, ball.v.z);
      if (speed > 1e-3) {
        axis.set(ball.v.z / speed, 0, -ball.v.x / speed);
        spin.setFromAxisAngle(axis, (speed * dt) / BALL);
        ball.group.quaternion.premultiply(spin);
      }
    }
  }
  function simulate(seconds, agitation = 0) {
    for (let t = 0; t < seconds; t += SUBSTEP) physics(SUBSTEP, agitation);
  }
  simulate(2.5);
  syncBalls(0);

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
  rounded(root, 0.57, 0.42, 0.09, dark, [0.45, 0.64, 0.59], 0.09);
  rounded(root, 0.64, 0.07, 0.27, gold, [OUTLET.x, 0.43, 0.64], 0.025);
  const prize = capsule(root, BALL, palette[0]);
  prize.group.visible = false;
  const card = createResultCard(root, 0.7);
  const confetti = createConfetti(root);
  const cardPosition = new THREE.Vector3();
  let dropped = null;

  function resetPrize() {
    prize.group.visible = false;
    prize.group.rotation.set(0, 0, 0);
    prize.top.position.set(0, 0, 0);
    prize.top.rotation.set(0, 0, 0);
    card.hide();
    confetti.clear();
  }
  function refill() {
    if (!dropped) return;
    dropped.active = true;
    dropped.group.visible = true;
    dropped.p.set(random(-0.15, 0.15), GLOBE.y + 0.55, random(-0.15, 0.15));
    dropped.v.set(0, -0.5, 0);
    dropped = null;
  }
  function pickBall() {
    let best = null;
    let bestDistance = Infinity;
    for (const ball of balls) {
      if (!ball.active) continue;
      const distance = Math.hypot(ball.p.x, ball.p.y - FLOOR, ball.p.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = ball;
      }
    }
    return best;
  }
  function placeFinal(roll, winner) {
    const last = roll.frames.length - 3;
    prize.group.visible = true;
    prize.group.position.set(
      OUTLET.x,
      roll.frames[last],
      roll.frames[last + 1],
    );
    prize.group.rotation.set(0, 0, 0);
    prize.top.position.set(-0.42, -BALL + 0.003, 0.18);
    prize.top.rotation.set(0, 0.4, 0);
    cardPosition.set(
      OUTLET.x * 0.7,
      roll.frames[last] + 0.62,
      roll.frames[last + 1],
    );
    card.set(options[winner]);
    card.update(cardPosition, 3, camera);
  }

  return {
    begin(winner, { reduced }) {
      resetPrize();
      refill();
      const roll = planRoll(random(1.12, 1.28));
      if (reduced) {
        const ball = pickBall();
        if (ball) {
          ball.active = false;
          ball.group.visible = false;
          prize.top.children[0].material.color.set(ball.color);
          dropped = ball;
        }
        simulate(1.5);
        syncBalls(0);
        placeFinal(roll, winner);
        return () => ({
          selectedIndex: winner,
          motion: "revealed",
          revealed: true,
          done: true,
          focus: CLOSE_UP,
        });
      }
      card.set(options[winner]);
      let lastCrank = 0;
      let lastClick = 0;
      let accumulator = 0;
      let dropBall = null;
      let dropStart = null;
      let dropFrom = new THREE.Vector3();
      let emergeAt = null;
      let restAt = null;
      let popAt = null;
      let topVelocity = null;
      let restRoll = 0;
      let landedTop = false;
      return (time, dt) => {
        clock = time;
        const crank = crankAngle(time);
        const crankSpeed = dt > 0 ? (crank - lastCrank) / dt : 0;
        lastCrank = crank;
        knob.rotation.z = -crank;
        stirrer.rotation.y = -crank * 1.5;
        root.position.x =
          time < CRANK_END
            ? Math.sin(time * 61) * 0.0025 * clamp(crankSpeed / 4, 0, 1)
            : 0;
        if (Math.floor(crank / (Math.PI / 4)) > lastClick) {
          lastClick = Math.floor(crank / (Math.PI / 4));
          sfx?.ratchet();
        }
        accumulator += dt;
        while (accumulator >= SUBSTEP) {
          physics(SUBSTEP, clamp(crankSpeed / 4.5, 0, 1.2));
          accumulator -= SUBSTEP;
        }
        syncBalls(dt);

        if (dropStart === null && crank > Math.PI * 1.55) {
          dropBall = pickBall();
          if (dropBall) {
            dropBall.active = false;
            dropFrom.copy(dropBall.p);
            prize.top.children[0].material.color.set(dropBall.color);
            dropped = dropBall;
          }
          dropStart = time;
          sfx?.knock(0.5);
        }
        if (dropBall && dropStart !== null) {
          const u = (time - dropStart) / 0.42;
          if (u <= 1) {
            const slide = smooth(clamp(u / 0.55, 0, 1));
            const sink = clamp((u - 0.45) / 0.55, 0, 1) ** 2;
            dropBall.group.position.set(
              dropFrom.x * (1 - slide),
              dropFrom.y + (FLOOR - dropFrom.y) * slide - sink * 0.6,
              dropFrom.z * (1 - slide),
            );
            dropBall.group.visible =
              dropBall.group.position.y > PLATE - BALL + 0.02;
          } else dropBall.group.visible = false;
        }
        if (
          dropStart !== null &&
          emergeAt === null &&
          time > dropStart + 0.55
        ) {
          emergeAt = time;
          prize.group.visible = true;
          sfx?.clunk();
        }
        let focus = null;
        if (emergeAt !== null) {
          const local = time - emergeAt;
          const frames = roll.frames;
          const count = frames.length / 3;
          const index = Math.min(count - 1, Math.floor(local / SUBSTEP));
          while (roll.impacts.length && roll.impacts[0][0] <= local)
            sfx?.knock(roll.impacts.shift()[1]);
          const y = frames[index * 3];
          const z = frames[index * 3 + 1];
          const spinAngle = frames[index * 3 + 2];
          if (restAt === null) {
            prize.group.position.set(OUTLET.x, y, z);
            prize.group.rotation.set(spinAngle, 0, 0);
            if (index === count - 1) {
              restAt = time;
              restRoll = spinAngle;
            }
          }
          focus = CLOSE_UP;
        }
        if (restAt !== null) {
          const wobble = time - restAt - 0.12;
          const upright = Math.round(restRoll / TAU) * TAU;
          if (wobble > 0 && popAt === null) {
            const u = clamp(wobble / 0.65, 0, 1);
            prize.group.rotation.x =
              restRoll + (upright - restRoll) * easeInOut(u);
            prize.group.rotation.z =
              Math.sin(wobble * TAU * 4.2) * (0.05 + 0.2 * u) * (1 - u * 0.3);
            prize.group.position.y =
              BALL + Math.abs(Math.sin(wobble * TAU * 4.2)) * 0.02 * u;
            if (u === 1) {
              popAt = time;
              prize.group.rotation.set(0, 0, 0);
              prize.group.position.y = BALL;
              topVelocity = new THREE.Vector3(
                random(-0.9, -0.5),
                random(2.4, 2.9),
                random(0.1, 0.5),
              );
              confetti.burst(
                prize.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
                0,
                0.9,
              );
              sfx?.pop();
            }
          }
        }
        let revealed = false;
        let done = false;
        if (popAt !== null) {
          const since = time - popAt;
          if (topVelocity) {
            topVelocity.y -= GRAVITY * 0.7 * dt;
            prize.top.position.addScaledVector(topVelocity, dt);
            if (!landedTop) {
              prize.top.rotation.x += 6 * dt;
              prize.top.rotation.z -= 9 * dt;
            }
            const floorY = -BALL + 0.003;
            if (prize.top.position.y < floorY) {
              prize.top.position.y = floorY;
              if (topVelocity.y < -0.6)
                sfx?.knock(Math.min(1, -topVelocity.y / 5) * 0.6);
              topVelocity.y = topVelocity.y < -0.6 ? -topVelocity.y * 0.3 : 0;
              topVelocity.x *= 0.6;
              topVelocity.z *= 0.6;
              landedTop = true;
              if (
                Math.abs(topVelocity.y) < 0.01 &&
                Math.hypot(topVelocity.x, topVelocity.z) < 0.05
              )
                topVelocity = null;
            }
          }
          if (landedTop) {
            // The lid tips onto its rim, the only stable way a dome rests on a table.
            const ease = 1 - Math.exp(-dt * 14);
            prize.top.rotation.x +=
              (Math.round(prize.top.rotation.x / TAU) * TAU -
                prize.top.rotation.x) *
              ease;
            prize.top.rotation.z +=
              (Math.round(prize.top.rotation.z / TAU) * TAU -
                prize.top.rotation.z) *
              ease;
          }
          cardPosition.set(
            prize.group.position.x * 0.7,
            prize.group.position.y + 0.12 + 0.5 * springOut(since, 1.2, 5),
            prize.group.position.z,
          );
          card.update(cardPosition, since * 1.6, camera);
          revealed = since > 0.35;
          done = since > 2.2;
          focus = CLOSE_UP;
        }
        confetti.update(dt);
        return {
          selectedIndex: winner,
          motion:
            time < CRANK_END
              ? "mixing"
              : popAt !== null
                ? revealed
                  ? "revealed"
                  : "opening"
                : "rolling",
          revealed,
          done,
          focus,
          rollAngle: prize.group.rotation.x,
        };
      };
    },
  };
}
