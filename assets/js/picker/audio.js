// Small procedural sound kit: every sound is synthesized, so nothing has to be downloaded or cached.
let context;
let noiseBuffer;

function audio() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}
function noise(ac) {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
function envelope(ac, at, peak, attack, decay) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  gain.connect(ac.destination);
  return gain;
}
function burst(ac, at, { type, frequency, q = 1, peak, decay }) {
  const source = ac.createBufferSource();
  source.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  source.connect(filter);
  filter.connect(envelope(ac, at, peak, 0.002, decay));
  source.start(at, Math.random() * 0.4);
  source.stop(at + decay + 0.05);
}
function tone(
  ac,
  at,
  { type = "sine", from, to = from, peak, attack = 0.004, decay },
) {
  const oscillator = ac.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  if (to !== from)
    oscillator.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
  oscillator.connect(envelope(ac, at, peak, attack, decay));
  oscillator.start(at);
  oscillator.stop(at + attack + decay + 0.05);
}

export function createSfx(isEnabled) {
  let lastTick = 0;
  const play = (draw) => {
    if (!isEnabled()) return;
    const ac = audio();
    if (!ac) return;
    try {
      draw(ac, ac.currentTime + 0.005);
    } catch {
      /* Audio is optional and browser dependent. */
    }
  };
  return {
    // Must run inside a user gesture once, so mobile browsers allow later sounds.
    unlock() {
      if (isEnabled()) audio();
    },
    tick(strength = 1) {
      play((ac, at) => {
        if (at - lastTick < 0.018) return;
        lastTick = at;
        const s = Math.min(1, Math.max(0.25, strength));
        burst(ac, at, {
          type: "bandpass",
          frequency: 3600,
          q: 1.6,
          peak: 0.16 * s,
          decay: 0.025,
        });
        tone(ac, at, {
          type: "triangle",
          from: 2100,
          to: 1500,
          peak: 0.035 * s,
          decay: 0.02,
        });
      });
    },
    ratchet() {
      play((ac, at) => {
        burst(ac, at, {
          type: "bandpass",
          frequency: 2300,
          q: 2.4,
          peak: 0.12,
          decay: 0.03,
        });
        tone(ac, at, {
          type: "square",
          from: 900,
          to: 600,
          peak: 0.012,
          decay: 0.02,
        });
      });
    },
    knock(strength = 1) {
      play((ac, at) => {
        const s = Math.min(1, strength);
        if (s < 0.06) return;
        tone(ac, at, {
          from: 520 + Math.random() * 120,
          to: 210,
          peak: 0.13 * s,
          decay: 0.07,
        });
        burst(ac, at, {
          type: "bandpass",
          frequency: 1500,
          q: 1.2,
          peak: 0.07 * s,
          decay: 0.03,
        });
      });
    },
    thud(strength = 1) {
      play((ac, at) => {
        const s = Math.min(1, strength);
        if (s < 0.06) return;
        tone(ac, at, { from: 150, to: 70, peak: 0.2 * s, decay: 0.12 });
        burst(ac, at, {
          type: "lowpass",
          frequency: 700,
          peak: 0.12 * s,
          decay: 0.07,
        });
      });
    },
    clunk() {
      play((ac, at) => {
        tone(ac, at, { from: 220, to: 95, peak: 0.18, decay: 0.16 });
        burst(ac, at, {
          type: "lowpass",
          frequency: 900,
          peak: 0.12,
          decay: 0.1,
        });
        tone(ac, at + 0.06, { from: 330, to: 160, peak: 0.06, decay: 0.08 });
      });
    },
    pop() {
      play((ac, at) => {
        burst(ac, at, {
          type: "highpass",
          frequency: 1800,
          peak: 0.16,
          decay: 0.05,
        });
        tone(ac, at, {
          from: 280,
          to: 980,
          peak: 0.1,
          attack: 0.002,
          decay: 0.09,
        });
      });
    },
    jump() {
      play((ac, at) =>
        tone(ac, at, {
          type: "square",
          from: 260,
          to: 720,
          peak: 0.035,
          attack: 0.01,
          decay: 0.16,
        }),
      );
    },
    bump() {
      play((ac, at) => {
        tone(ac, at, {
          type: "square",
          from: 190,
          to: 80,
          peak: 0.05,
          decay: 0.09,
        });
        burst(ac, at, {
          type: "lowpass",
          frequency: 500,
          peak: 0.12,
          decay: 0.06,
        });
      });
    },
    coin() {
      play((ac, at) => {
        tone(ac, at, { type: "square", from: 988, peak: 0.03, decay: 0.07 });
        tone(ac, at + 0.075, {
          type: "square",
          from: 1319,
          peak: 0.03,
          decay: 0.3,
        });
      });
    },
    whoosh(strength = 1) {
      play((ac, at) =>
        burst(ac, at, {
          type: "bandpass",
          frequency: 900,
          q: 0.7,
          peak: 0.05 * strength,
          decay: 0.22,
        }),
      );
    },
    chime() {
      play((ac, at) =>
        [523, 659, 784, 1047].forEach((frequency, index) =>
          tone(ac, at + index * 0.09, {
            from: frequency,
            peak: 0.06,
            attack: 0.015,
            decay: 0.32,
          }),
        ),
      );
    },
  };
}
