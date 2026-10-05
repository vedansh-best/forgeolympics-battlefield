/* =====================================================================
   FORGE OLYMPICS · SOUND
   Everything is synthesised live (no audio files): war drums, horns,
   thunder and a low battlefield ambience of wind and crackling fire.
   Browsers only allow sound after the first tap or click on the page.
   ===================================================================== */
(function () {
  var ctx = null, master = null, ambientOn = false, unlocked = false, crackleT = null;
  var enabled = true;
  try { enabled = localStorage.getItem('forge-sound') !== 'off'; } catch (e) {}
  var btn = document.getElementById('soundBtn');

  function label() {
    if (!btn) return;
    btn.classList.toggle('wait', enabled && !unlocked);
    btn.textContent = !enabled ? '🔇' : unlocked ? '🔊' : '🔈'; btn.title = !enabled ? 'Sound off' : unlocked ? 'Sound on' : 'Tap anywhere for sound';
  }
  function init() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    return true;
  }
  var noiseCache = {};
  function noise(sec) {
    if (noiseCache[sec]) return noiseCache[sec];
    var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (noiseCache[sec] = b);
  }
  function ready() { return ctx && unlocked && enabled; }

  function drum(t, vol) {
    vol = vol || 1;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.85);
    var n = ctx.createBufferSource(); n.buffer = noise(0.4);
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    var ng = ctx.createGain(); ng.gain.setValueAtTime(0.4 * vol, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(f); f.connect(ng); ng.connect(master); n.start(t); n.stop(t + 0.4);
  }
  function horn(t, freq, dur, vol) {
    vol = vol || 0.35;
    var out = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.35); lp.frequency.linearRampToValueAtTime(900, t + dur);
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(vol, t + 0.25); out.gain.setValueAtTime(vol, t + dur - 0.35); out.gain.linearRampToValueAtTime(0.0001, t + dur);
    var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.012, t + 0.6);
    lfo.connect(lg);
    [[1, 'sawtooth', 1], [1.004, 'sawtooth', 0.8], [0.5, 'sine', 0.9], [1.5, 'triangle', 0.25]].forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.type = p[1]; o.frequency.value = freq * p[0]; g.gain.value = p[2];
      lg.connect(o.frequency); o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    });
    lfo.start(t); lfo.stop(t + dur + 0.05);
    lp.connect(out); out.connect(master);
  }
  function thunderAt(t) {
    var n = ctx.createBufferSource(); n.buffer = noise(4);
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.05); g.gain.exponentialRampToValueAtTime(0.25, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 3.8);
    n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 4);
  }
  function startAmbient() {
    if (ambientOn || !ctx) return; ambientOn = true;
    // wind
    var w = ctx.createBufferSource(); w.buffer = noise(4); w.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    var wg = ctx.createGain(); wg.gain.value = 0.05;
    var lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 220;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    var lfo2 = ctx.createOscillator(), lfo2G = ctx.createGain(); lfo2.frequency.value = 0.11; lfo2G.gain.value = 0.025;
    lfo2.connect(lfo2G); lfo2G.connect(wg.gain);
    w.connect(bp); bp.connect(wg); wg.connect(master); w.start(); lfo.start(); lfo2.start();
    // fire crackle
    (function crackle() {
      crackleT = setTimeout(function () {
        if (ready() && !document.hidden) {
          var t = ctx.currentTime, n = ctx.createBufferSource(); n.buffer = noise(0.4);
          var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random() * 2500;
          var g = ctx.createGain(); var v = 0.02 + Math.random() * 0.06;
          g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.02 + Math.random() * 0.05);
          n.connect(hp); hp.connect(g); g.connect(master); n.start(t, Math.random() * 0.3); n.stop(t + 0.1);
        }
        crackle();
      }, 40 + Math.random() * 260);
    })();
  }

  function unlock() {
    if (unlocked) return;
    if (!init()) return;
    ctx.resume().then(function () { unlocked = true; label(); if (enabled) startAmbient(); });
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) { window.addEventListener(ev, unlock, { passive: true }); });

  if (btn) btn.addEventListener('click', function () {
    if (!unlocked) { enabled = true; unlock(); label(); return; }
    enabled = !enabled;
    try { localStorage.setItem('forge-sound', enabled ? 'on' : 'off'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(enabled ? 0.9 : 0, ctx.currentTime, 0.1);
    if (enabled) startAmbient();
    label();
  });
  label();

  window.ForgeAudio = {
    battle: function () { if (!ready()) return; var t = ctx.currentTime + 0.05; drum(t, 1); drum(t + 0.32, 0.8); drum(t + 0.64, 1.1); },
    leadChange: function () {
      if (!ready()) return; var t = ctx.currentTime + 0.05, d = 0.32;
      for (var i = 0; i < 9; i++) { drum(t, 0.6 + i * 0.06); t += d; d *= 0.82; }
      horn(t, 110, 2.2, 0.32); horn(t + 0.02, 164.8, 2.2, 0.18); drum(t, 1.2);
    },
    champion: function () {
      if (!ready()) return; var t = ctx.currentTime + 0.1;
      [130.8, 164.8, 196, 261.6].forEach(function (f, i) { horn(t + i * 0.45, f, i === 3 ? 2.8 : 0.6, 0.28); drum(t + i * 0.45, 1); });
      horn(t + 1.35, 196, 2.8, 0.16); horn(t + 1.35, 329.6, 2.8, 0.12);
      for (var k = 0; k < 6; k++) drum(t + 1.6 + k * 0.18, 0.7);
    },
    thunder: function () { if (!ready()) return; thunderAt(ctx.currentTime + 0.4 + Math.random() * 0.8); }
  };
})();
