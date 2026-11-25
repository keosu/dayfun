// Deterministic, dependency-free simulations. The winner is chosen first (Web Crypto), then the
// physics is solved or sampled so the natural-looking motion ends on that winner.
export const TAU = Math.PI * 2;
const STEP = 1 / 240;
const smooth = (t) => t * t * (3 - 2 * t);

/* ---------- Prize wheel: friction, air drag and a spring flapper riding over rim pegs ---------- */

const WINDUP = 0.36;
const PUSH = 0.11;
function wheelModel(count) {
  const step = TAU / count;
  const width = Math.min(0.055, step * 0.16);
  // Energy to lift the flapper over one peg; peak torque exceeds friction, so a stalling wheel rocks back.
  const energy = 0.1;
  return {
    step,
    width,
    stiffness: energy / (2 * width * width),
    friction: 1.45,
    drag: 0.22,
  };
}

function runWheel(count, start, omega0, record) {
  const { step, width, stiffness, friction, drag } = wheelModel(count);
  const windup = 0.2;
  const angles = record ? [] : null;
  let theta = start - windup;
  let omega = 0;
  let time = 0;
  if (record)
    for (let t = 0; t < WINDUP; t += STEP)
      angles.push(start - windup * smooth(t / WINDUP));
  while (time < 16) {
    const phase = ((theta % step) + step) % step;
    const d = phase > step / 2 ? step - phase : -phase;
    const pegTorque = Math.abs(d) <= width ? -stiffness * (width - d) : 0;
    const push = time < PUSH ? omega0 / PUSH : 0;
    const stopped =
      time >= PUSH && Math.abs(omega) < 0.02 && Math.abs(pegTorque) <= friction;
    if (!stopped) {
      const coulomb = omega > 0 ? -friction : omega < 0 ? friction : 0;
      omega += (coulomb - drag * omega + pegTorque + push) * STEP;
      theta += omega * STEP;
    }
    angles?.push(theta);
    if (stopped) break;
    time += STEP;
  }
  return { final: theta, angles, duration: WINDUP + time };
}

// The flapper is a damped spring that cannot pass through the peg currently pushing it.
function flapperTrack(count, angles) {
  const { step, width } = wheelModel(count);
  const flaps = new Float32Array(angles.length);
  const ticks = [];
  let flap = 0;
  let velocity = 0;
  let previousZone = false;
  let previousD = 0;
  for (let i = 0; i < angles.length; i++) {
    const phase = ((angles[i] % step) + step) % step;
    const d = phase > step / 2 ? step - phase : -phase;
    const inZone = Math.abs(d) <= width;
    velocity += (-900 * flap - 16 * velocity) * STEP;
    flap += velocity * STEP;
    if (inZone) {
      const contact = (0.32 * (width - d)) / (2 * width);
      if (flap < contact) {
        velocity = Math.max(velocity, (contact - flap) / STEP);
        flap = contact;
      }
    }
    const omega = i ? (angles[i] - angles[i - 1]) / STEP : 0;
    if (previousZone && !inZone && previousD < 0)
      ticks.push([i * STEP, Math.min(1, 0.35 + Math.abs(omega) / 6)]);
    else if (previousZone && !inZone && previousD > 0 && omega < 0)
      ticks.push([i * STEP, 0.3]);
    flaps[i] = flap;
    previousZone = inZone;
    previousD = d;
  }
  return { flaps, ticks };
}

// Bisection on launch speed, then the tiny residual is spread over the whole spin.
export function solveWheel({ count, start, winner, turns, offset }) {
  const { step } = wheelModel(count);
  const base = start - (((start % TAU) + TAU) % TAU);
  const target = base + turns * TAU + (winner + offset) * step;
  let low = 0.5;
  let high = 60;
  for (let i = 0; i < 50; i++) {
    const middle = (low + high) / 2;
    if (runWheel(count, start, middle, false).final < target) low = middle;
    else high = middle;
  }
  const result = runWheel(count, start, (low + high) / 2, true);
  const error = target - result.final;
  const first = Math.round(WINDUP / STEP);
  const span = result.angles.length - first;
  for (let i = first; i < result.angles.length; i++)
    result.angles[i] += error * smooth((i - first) / span);
  Object.assign(result, flapperTrack(count, result.angles));
  result.final = target;
  result.error = error;
  result.valid = Math.abs(error) < 0.4;
  return result;
}

export function sampleTrack(values, time) {
  const index = time / STEP;
  const i = Math.min(values.length - 1, Math.floor(index));
  const j = Math.min(values.length - 1, i + 1);
  const f = Math.min(1, index - i);
  return values[i] + (values[j] - values[i]) * f;
}

/* ---------- Rigid cube (dice) bouncing on the ground ---------- */

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
function rotate(q, v) {
  const [x, y, z, w] = q;
  const t = [
    2 * (y * v[2] - z * v[1]),
    2 * (z * v[0] - x * v[2]),
    2 * (x * v[1] - y * v[0]),
  ];
  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
}
function multiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function normalizeQ(q) {
  const l = Math.hypot(...q);
  return q.map((value) => value / l);
}
function slerp(a, b, t) {
  let cos = dot(a, b) + a[3] * b[3];
  const target = cos < 0 ? b.map((value) => -value) : b;
  cos = Math.abs(cos);
  if (cos > 0.9995)
    return normalizeQ(a.map((value, i) => value + (target[i] - value) * t));
  const angle = Math.acos(cos);
  const sa = Math.sin((1 - t) * angle) / Math.sin(angle);
  const sb = Math.sin(t * angle) / Math.sin(angle);
  return a.map((value, i) => value * sa + target[i] * sb);
}
export const FACE_NORMALS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export function upFace(q) {
  let best = 0;
  let bestY = -Infinity;
  FACE_NORMALS.forEach((normal, index) => {
    const y = rotate(q, normal)[1];
    if (y > bestY) {
      bestY = y;
      best = index;
    }
  });
  return best;
}
export { rotate as rotateByQuaternion };

export function simulateDice({
  position,
  velocity,
  angular,
  quaternion = [0, 0, 0, 1],
  half,
  ground,
  gravity = 9,
  restitution = 0.34,
  friction = 0.55,
  maxTime = 3.6,
}) {
  let p = [...position];
  let v = [...velocity];
  let w = [...angular];
  let q = normalizeQ(quaternion);
  const inertia = (2 * half * half) / 3;
  const corner = half * 0.96;
  const corners = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        corners.push([x * corner, y * corner, z * corner]);
  const frames = [];
  const impacts = [];
  let restTime = 0;
  let time = 0;
  let settled = false;
  let landed = null;
  const push = () => frames.push(p[0], p[1], p[2], q[0], q[1], q[2], q[3]);
  push();
  while (time < maxTime) {
    v[1] -= gravity * STEP;
    p = p.map((value, i) => value + v[i] * STEP);
    const spin = [w[0] * STEP * 0.5, w[1] * STEP * 0.5, w[2] * STEP * 0.5, 0];
    const dq = multiply(spin, q);
    q = normalizeQ(q.map((value, i) => value + dq[i]));
    let touching = false;
    let strongest = 0;
    for (let iteration = 0; iteration < 4; iteration++) {
      for (const local of corners) {
        const r = rotate(q, local);
        if (p[1] + r[1] > ground) continue;
        touching = true;
        const vc = [
          v[0] + w[1] * r[2] - w[2] * r[1],
          v[1] + w[2] * r[0] - w[0] * r[2],
          v[2] + w[0] * r[1] - w[1] * r[0],
        ];
        if (vc[1] >= 0) continue;
        if (iteration === 0) strongest = Math.max(strongest, -vc[1]);
        const rn = cross(r, [0, 1, 0]);
        const bounce = vc[1] < -0.7 ? restitution : 0;
        const jn = (-(1 + bounce) * vc[1]) / (1 + dot(rn, rn) / inertia);
        v[1] += jn;
        w = w.map((value, i) => value + (rn[i] * jn) / inertia);
        const vt = [
          v[0] + w[1] * r[2] - w[2] * r[1],
          0,
          v[2] + w[0] * r[1] - w[1] * r[0],
        ];
        const speed = length(vt);
        if (speed > 1e-6) {
          const t = [-vt[0] / speed, 0, -vt[2] / speed];
          const rt = cross(r, t);
          const jt = Math.min(
            speed / (1 + dot(rt, rt) / inertia),
            friction * jn,
          );
          v = v.map((value, i) => value + t[i] * jt);
          w = w.map((value, i) => value + (rt[i] * jt) / inertia);
        }
      }
    }
    let lowest = Infinity;
    for (const local of corners)
      lowest = Math.min(lowest, p[1] + rotate(q, local)[1]);
    if (lowest < ground) p[1] += ground - lowest;
    if (strongest > 0.5) {
      impacts.push([time, Math.min(1, strongest / 4)]);
      landed ??= time;
    }
    if (touching) {
      w = w.map((value) => value * (1 - 1.6 * STEP));
      v[0] *= 1 - 0.8 * STEP;
      v[2] *= 1 - 0.8 * STEP;
    }
    restTime =
      touching && length(v) < 0.09 && length(w) < 0.45 ? restTime + STEP : 0;
    time += STEP;
    push();
    if (restTime > 0.1) {
      settled = true;
      break;
    }
  }
  // Ease the last few millimetres flat, as a real cube drops onto its face.
  const face = upFace(q);
  const normal = rotate(q, FACE_NORMALS[face]);
  const axis = cross(normal, [0, 1, 0]);
  const sin = length(axis);
  const angle = Math.atan2(sin, normal[1]);
  const align =
    sin > 1e-6
      ? [
          (axis[0] / sin) * Math.sin(angle / 2),
          (axis[1] / sin) * Math.sin(angle / 2),
          (axis[2] / sin) * Math.sin(angle / 2),
          Math.cos(angle / 2),
        ]
      : [0, 0, 0, 1];
  const finalQ = normalizeQ(multiply(align, q));
  const startQ = q;
  const startY = p[1];
  const snap = Math.round(0.12 / STEP);
  for (let i = 1; i <= snap; i++) {
    const t = smooth(i / snap);
    q = slerp(startQ, finalQ, t);
    p[1] = startY + (ground + half - startY) * t;
    push();
  }
  return {
    frames: new Float32Array(frames),
    impacts,
    settled,
    landed,
    face,
    quaternion: finalQ,
    duration: (frames.length / 7 - 1) * STEP,
  };
}

export function sampleFrame(frames, time) {
  const count = frames.length / 7;
  const index = Math.min(count - 1, Math.max(0, time / STEP));
  const i = Math.floor(index);
  const j = Math.min(count - 1, i + 1);
  const f = index - i;
  const a = i * 7;
  const b = j * 7;
  const position = [0, 1, 2].map(
    (k) => frames[a + k] + (frames[b + k] - frames[a + k]) * f,
  );
  const quaternion = slerp(
    [frames[a + 3], frames[a + 4], frames[a + 5], frames[a + 6]],
    [frames[b + 3], frames[b + 4], frames[b + 5], frames[b + 6]],
    f,
  );
  return { position, quaternion };
}
