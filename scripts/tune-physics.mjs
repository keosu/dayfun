// Quick numeric checks for the picker physics: run with `node scripts/tune-physics.mjs`.
import { solveWheel, simulateDice, TAU } from "../assets/js/picker/physics.js";

let invalid = 0;
let maxError = 0;
const durations = [];
for (const count of [2, 3, 4, 6, 8, 12, 16]) {
  for (let trial = 0; trial < 40; trial++) {
    const winner = Math.floor(Math.random() * count);
    const start = Math.random() * 40;
    const turns = 3 + Math.floor(Math.random() * 3);
    const offset = 0.22 + Math.random() * 0.56;
    const t0 = performance.now();
    const result = solveWheel({ count, start, winner, turns, offset });
    const ms = performance.now() - t0;
    if (!result.valid) invalid++;
    maxError = Math.max(maxError, Math.abs(result.error));
    durations.push(result.duration);
    if (trial === 0)
      console.log(
        `wheel n=${count} turns=${turns} duration=${result.duration.toFixed(2)}s ticks=${result.ticks.length} solve=${ms.toFixed(1)}ms valid=${result.valid}`,
      );
  }
}
durations.sort((a, b) => a - b);
console.log(
  `wheel durations min=${durations[0].toFixed(2)} median=${durations[durations.length >> 1].toFixed(2)} max=${durations.at(-1).toFixed(2)} invalid=${invalid} maxError=${maxError.toFixed(3)}rad`,
);

const ground = 0.315;
// Same launch ranges, path checks and landing bounds as assets/js/picker/pixel.js.
const half = 0.27;
let ok = 0;
const diceDurations = [];
for (let trial = 0; trial < 300; trial++) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const result = simulateDice({
    position: [0, 2.42 + half + 0.02, 0.02],
    velocity: [
      side * (1.35 + Math.random() * 0.35),
      1.7 + Math.random() * 0.5,
      0.15 + Math.random() * 0.25,
    ],
    angular: [0, 1, 2].map(
      () => (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6),
    ),
    half,
    ground,
    friction: 0.75,
  });
  const n = result.frames.length / 7;
  let clear = result.settled;
  for (let i = 6; clear && i < n; i += 3) {
    const [x, y, z] = result.frames.slice(i * 7, i * 7 + 3);
    if (
      Math.abs(x) < 0.32 + half &&
      Math.abs(z) < 0.32 + half &&
      y < 2.42 + half - 0.01 &&
      y > 1.78 - half
    )
      clear = false;
    if (
      Math.abs(x) < 0.36 + half &&
      Math.abs(z - 0.3) < 0.25 + half &&
      y - half < 1.82
    )
      clear = false;
  }
  const x = Math.abs(result.frames[(n - 1) * 7]);
  const z = Math.abs(result.frames[(n - 1) * 7 + 2]);
  if (clear && x >= 0.95 && x <= 1.9 && z <= 0.95) ok++;
  diceDurations.push(result.duration);
}
diceDurations.sort((a, b) => a - b);
console.log(
  `dice accepted=${ok}/300 duration min=${diceDurations[0].toFixed(2)} median=${diceDurations[150].toFixed(2)} max=${diceDurations.at(-1).toFixed(2)}`,
);
void TAU;
