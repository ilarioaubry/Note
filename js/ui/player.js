/**
 * Lecteur d'instrumentales : import local (aucun upload), forme d'onde,
 * boucle A/B, boucles 4/8 mesures, tap tempo, métronome visuel + clic.
 */
import { formatTime } from '../utils/dom.js';

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i;
export const isAudioFile = (f) => f && (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));

export function createPlayer(els, { getBpm, setBpm, getOffset, setOffset }) {
  const { audio, btnLoad, fileInput, trackName, btnPlay, time, canvas, waveWrap,
    btnA, btnB, btnLoop, btnBars4, btnBars8, loopInfo, btnTap, bpmDisplay, metro, barInfo,
    btnDownbeat, btnMetro, btnClick } = els;

  let url = null;
  let peaks = null;
  let actx = null;
  const loop = { a: null, b: null, on: false };
  let metroOn = false, metroStart = 0;
  let clickOn = false;
  let lastBeat = null;
  let taps = [];
  const dots = [...metro.children];

  const ctx = () => (actx ??= new (window.AudioContext || window.webkitAudioContext)());

  /* ---------- Chargement ---------- */
  async function loadFile(file) {
    if (!isAudioFile(file)) return false;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    audio.src = url;
    trackName.textContent = file.name;
    trackName.title = file.name;
    btnPlay.disabled = false;
    waveWrap.closest('.player')?.classList.add('has-audio');
    loop.a = loop.b = null; loop.on = false;
    peaks = null;
    updateLoopUI();
    draw();
    try {
      const buf = await ctx().decodeAudioData(await file.arrayBuffer());
      peaks = computePeaks(buf, 1600);
    } catch (e) {
      console.warn('Forme d\'onde indisponible :', e);
    }
    draw();
    return true;
  }

  function computePeaks(buf, n) {
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const size = Math.floor(ch0.length / n);
    const out = new Float32Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      let peak = 0;
      const start = i * size;
      for (let j = start; j < start + size; j += 16) {
        const v = Math.abs(ch1 ? (ch0[j] + ch1[j]) / 2 : ch0[j]);
        if (v > peak) peak = v;
      }
      out[i] = peak;
      if (peak > max) max = peak;
    }
    if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
    return out;
  }

  btnLoad.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });

  /* ---------- Transport ---------- */
  function togglePlay() {
    if (!audio.src) return;
    if (audio.paused) {
      if (loop.on && loop.a !== null && (audio.currentTime < loop.a || audio.currentTime >= loop.b)) audio.currentTime = loop.a;
      audio.play();
    } else audio.pause();
  }
  btnPlay.addEventListener('click', togglePlay);
  audio.addEventListener('play', () => { btnPlay.textContent = '❚❚'; });
  audio.addEventListener('pause', () => { btnPlay.textContent = '▶'; });
  audio.addEventListener('loadedmetadata', draw);

  /* ---------- Boucle A/B ---------- */
  const barDuration = () => (4 * 60) / (getBpm() || 90);

  function setA(t = audio.currentTime) {
    loop.a = t;
    if (loop.b !== null && loop.b <= loop.a) loop.b = null;
    updateLoopUI();
  }
  function setB(t = audio.currentTime) {
    if (loop.a === null) loop.a = 0;
    if (t <= loop.a) return;
    loop.b = t;
    loop.on = true;
    updateLoopUI();
  }
  function toggleLoop() {
    if (loop.a === null || loop.b === null) return;
    loop.on = !loop.on;
    updateLoopUI();
  }
  function loopBars(n) {
    if (!audio.duration) return;
    const bar = barDuration();
    const off = getOffset() || 0;
    const idx = Math.max(0, Math.floor((audio.currentTime - off) / bar));
    loop.a = Math.max(0, off + idx * bar);
    loop.b = Math.min(audio.duration, loop.a + n * bar);
    loop.on = true;
    updateLoopUI();
  }
  function updateLoopUI() {
    btnLoop.setAttribute('aria-pressed', String(loop.on));
    loopInfo.textContent = loop.a !== null
      ? `${formatTime(loop.a)}→${loop.b !== null ? formatTime(loop.b) : '…'}` : '';
    draw();
  }
  btnA.addEventListener('click', () => setA());
  btnB.addEventListener('click', () => setB());
  btnLoop.addEventListener('click', toggleLoop);
  btnBars4.addEventListener('click', () => loopBars(4));
  btnBars8.addEventListener('click', () => loopBars(8));

  /* ---------- Forme d'onde : clic = seek, Maj+glisser = boucle ---------- */
  const timeAt = (e) => {
    const r = waveWrap.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (audio.duration || 0);
  };
  waveWrap.addEventListener('pointerdown', (e) => {
    if (!audio.duration) return;
    const t0 = timeAt(e);
    if (!e.shiftKey) {
      audio.currentTime = t0; draw();
      waveWrap.setPointerCapture(e.pointerId);
      const scrub = (ev) => { audio.currentTime = timeAt(ev); draw(); };
      const end = () => waveWrap.removeEventListener('pointermove', scrub);
      waveWrap.addEventListener('pointermove', scrub);
      waveWrap.addEventListener('pointerup', end, { once: true });
      waveWrap.addEventListener('pointercancel', end, { once: true });
      return;
    }
    waveWrap.setPointerCapture(e.pointerId);
    loop.a = t0; loop.b = null; loop.on = false;
    const move = (ev) => {
      const t = timeAt(ev);
      loop.a = Math.min(t0, t); loop.b = Math.max(t0, t);
      updateLoopUI();
    };
    const up = () => {
      waveWrap.removeEventListener('pointermove', move);
      if (loop.b !== null && loop.b - loop.a > 0.1) { loop.on = true; audio.currentTime = loop.a; }
      updateLoopUI();
    };
    waveWrap.addEventListener('pointermove', move);
    waveWrap.addEventListener('pointerup', up, { once: true });
  });

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = waveWrap.clientWidth, h = waveWrap.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const dur = audio.duration || 0;
    const x = (t) => (dur ? (t / dur) * w : 0);

    // Boucle
    if (loop.a !== null && loop.b !== null && dur) {
      g.fillStyle = loop.on ? 'rgba(61,220,151,0.14)' : 'rgba(255,255,255,0.06)';
      g.fillRect(x(loop.a), 0, x(loop.b) - x(loop.a), h);
    }
    // Mesures
    if (dur) {
      const bar = barDuration();
      const off = getOffset() || 0;
      if (w / (dur / bar) > 6) {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        for (let t = off, i = 0; t < dur; t += bar, i++) g.fillRect(x(t), 0, i % 4 === 0 ? 1.5 : 1, h);
      }
    }
    // Onde
    const played = dur ? audio.currentTime / dur : 0;
    if (peaks) {
      const n = peaks.length;
      const step = w / n;
      for (let i = 0; i < n; i++) {
        const amp = Math.max(1, peaks[i] * (h - 8));
        g.fillStyle = i / n < played ? css.getPropertyValue('--accent').trim() || '#3ddc97' : '#4a5260';
        g.fillRect(i * step, (h - amp) / 2, Math.max(1, step - 0.3), amp);
      }
    } else {
      g.fillStyle = '#2a3039';
      g.fillRect(0, h / 2 - 1, w, 2);
      if (!dur) {
        g.fillStyle = '#5b6370';
        g.font = '11px ui-monospace, monospace';
        g.fillText('Aucune instru chargée', 10, h / 2 - 6);
      }
    }
    // Tête de lecture + A/B
    if (dur) {
      g.fillStyle = '#fff';
      g.fillRect(x(audio.currentTime) - 0.5, 0, 1.5, h);
      g.fillStyle = '#ffb347';
      if (loop.a !== null) g.fillRect(x(loop.a), 0, 2, h);
      if (loop.b !== null) g.fillRect(x(loop.b) - 2, 0, 2, h);
    }
  }
  new ResizeObserver(draw).observe(waveWrap);

  /* ---------- Tempo ---------- */
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps.at(-1) > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-8);
    if (taps.length >= 2) {
      const avg = (taps.at(-1) - taps[0]) / (taps.length - 1);
      setBpm(Math.round(60000 / avg));
    }
    btnTap.animate?.([{ background: '#3ddc97' }, { background: '' }], { duration: 120 });
  }
  btnTap.addEventListener('click', tap);

  btnDownbeat.addEventListener('click', () => { if (audio.src) { setOffset(audio.currentTime); draw(); } });
  btnMetro.addEventListener('click', () => {
    metroOn = !metroOn;
    metroStart = performance.now();
    btnMetro.setAttribute('aria-pressed', String(metroOn));
    if (metroOn) ctx().resume?.();
  });
  btnClick.addEventListener('click', () => {
    clickOn = !clickOn;
    btnClick.setAttribute('aria-pressed', String(clickOn));
    if (clickOn) ctx().resume?.();
  });

  function click(accent) {
    const c = ctx();
    const o = c.createOscillator(), gn = c.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    gn.gain.setValueAtTime(0.25, c.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
    o.connect(gn).connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.06);
  }

  function setBpmDisplay(bpm) { bpmDisplay.textContent = bpm || '—'; draw(); }

  /* ---------- Boucle d'animation ---------- */
  function frame() {
    const playing = !audio.paused && !audio.ended;
    if (playing && loop.on && loop.b !== null && audio.currentTime >= loop.b) audio.currentTime = loop.a;

    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;

    let t = null, off = 0;
    if (playing || (audio.src && !metroOn)) { t = audio.currentTime; off = getOffset() || 0; }
    else if (metroOn) t = (performance.now() - metroStart) / 1000;

    const bpm = getBpm() || 90;
    if (t !== null) {
      const beat = Math.floor(((t - off) * bpm) / 60);
      const inBar = ((beat % 4) + 4) % 4;
      const active = playing || metroOn;
      dots.forEach((d, i) => d.classList.toggle('on', active && i === inBar));
      barInfo.textContent = `M${Math.floor(beat / 4) + 1}`;
      if (active && beat !== lastBeat) {
        if (clickOn && lastBeat !== null) click(inBar === 0);
        lastBeat = beat;
      }
      if (!active) lastBeat = null;
    }
    if (playing) draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { loadFile, togglePlay, setA, setB, toggleLoop, tap, setBpmDisplay, redraw: draw };
}
