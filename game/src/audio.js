// All sound is synthesised with WebAudio: short oscillator/noise bursts,
// no audio files and no network. Created lazily on the first user gesture
// (browsers block audio before one), and every call is a no-op until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let unlocked = false; // true only after a user gesture called unlock()

  function ensure() {
    // Never create the context before a gesture: browsers block it and
    // log a warning, and headless captures do not need sound at all.
    if (!unlocked || ctx) return Boolean(ctx);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, lowFreq) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock() {
      unlocked = true;
      ensure();
    },
    shot(kind) {
      if (kind === 'shotgun') noise(0.22, 0.9, 900);
      else if (kind === 'pistol') noise(0.12, 0.55, 1600);
      else noise(0.14, 0.7, 1200);
      tone(kind === 'shotgun' ? 90 : 140, 0.08, 'square', 0.25, 55);
    },
    enemyShot() {
      noise(0.1, 0.3, 900);
    },
    dryClick() {
      tone(1400, 0.03, 'square', 0.12);
    },
    reload() {
      tone(520, 0.05, 'square', 0.15);
      setTimeout(() => tone(760, 0.05, 'square', 0.15), 180);
    },
    hit() {
      tone(880, 0.05, 'sine', 0.3);
    },
    kill() {
      tone(660, 0.07, 'sine', 0.3);
      setTimeout(() => tone(990, 0.09, 'sine', 0.3), 70);
    },
    hurt() {
      tone(180, 0.16, 'sawtooth', 0.35, 90);
    },
    grenade() {
      noise(0.7, 0.9, 300);
      tone(55, 0.6, 'sine', 0.7, 30);
    },
    beep() {
      tone(1200, 0.09, 'sine', 0.3);
    },
    plantDone() {
      tone(740, 0.1, 'sine', 0.3);
      setTimeout(() => tone(1108, 0.16, 'sine', 0.3), 110);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.3), i * 120));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.3), i * 130));
    },
    buy() {
      tone(980, 0.06, 'sine', 0.25);
      setTimeout(() => tone(1318, 0.08, 'sine', 0.25), 70);
    },
  };
}
