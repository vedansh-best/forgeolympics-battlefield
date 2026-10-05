/* =====================================================================
   FORGE OLYMPICS · PAINTED BATTLEFIELD FX
   Brings the backdrop painting to life: a slow cinematic drift and
   parallax, flickering fires and flames on the painting's own fire spots,
   spark bursts, rising embers, red ash flakes, drifting storm clouds,
   a breathing moon glow and lightning.
   Fire positions below are measured on assets/battlefield.webp (0..1).
   ===================================================================== */
(function () {
  var CFG = window.CONFIG || {}, root = document.documentElement;
  var hero = document.querySelector('.hero'), art = document.getElementById('bgArt'), cv = document.getElementById('fireFx');
  if (!hero || !art || !cv) return;
  if ((CFG.BACKGROUND || 'image') !== 'image') { root.classList.remove('artbg'); art.remove(); cv.remove(); return; }
  if (CFG.BACKGROUND_IMAGE && art.getAttribute('src').split('?')[0] !== CFG.BACKGROUND_IMAGE) art.src = CFG.BACKGROUND_IMAGE;

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SMALL = Math.min(screen.width, screen.height) < 700;
  // Each backdrop has its own size, fire spots [x, y, size], smoke columns and framing (all 0..1 of the image).
  var SCENES = {
    'assets/battlefield.webp': {
      w: 1536, h: 1536, anchor: 'moonTitle', zoom: 1.05, focusX: 0.5, focusXPortrait: 0.5,
      moon: { x: 0.455, y: 0.109, r: 0.1 }, smoke: [],
      fires: [[0.445, 0.852, 1.6], [0.48, 0.85, 1.2], [0.517, 0.847, 1.0], [0.557, 0.83, 1.0], [0.40, 0.865, 1.0],
        [0.578, 0.594, 1.3], [0.475, 0.602, 1.1], [0.51, 0.478, 0.8], [0.36, 0.58, 0.6],
        [0.105, 0.652, 1.0], [0.09, 0.722, 0.8], [0.229, 0.814, 0.8],
        [0.818, 0.531, 0.7], [0.733, 0.55, 0.7], [0.649, 0.681, 0.7], [0.941, 0.858, 0.6]]
    },
    'assets/battlefield-fissure.webp': {
      w: 2548, h: 1389, anchor: 'bottom', zoom: 1.04, focusX: 0.5, focusXPortrait: 0.7, fireScale: 0.42, glowAlpha: 0.22, flameAlpha: 0.45,
      moon: { x: 0.805, y: 0.10, r: 0.064 },
      // [baseX, baseY, size, driftX]: the two black smoke columns plus smoke off the field fires
      smoke: [[0.49, 0.45, 1.5, -0.35], [0.64, 0.42, 1.3, 0.22], [0.24, 0.6, 0.6, -0.1], [0.53, 0.65, 0.55, 0.1]],
      fires: [[0.636, 0.975, 2.0], [0.581, 0.928, 2.0], [0.345, 0.975, 2.0], [0.373, 0.945, 1.6], [0.616, 0.975, 1.6],
        [0.639, 0.939, 1.4], [0.609, 0.939, 1.4], [0.348, 0.945, 1.4], [0.242, 0.61, 1.1], [0.54, 0.646, 1.0],
        [0.322, 0.98, 1.2], [0.665, 0.98, 1.2], [0.567, 0.885, 1.1], [0.546, 0.873, 1.0], [0.663, 0.926, 1.0],
        [0.225, 0.611, 0.8], [0.511, 0.67, 0.8], [0.496, 0.76, 0.7], [0.379, 0.894, 0.8], [0.81, 0.98, 0.6]]
    }
  };
  var SC = SCENES[CFG.BACKGROUND_IMAGE] || SCENES['assets/battlefield.webp'];
  var IMG_W = SC.w, IMG_H = SC.h, FIRES = SC.fires, MOON = SC.moon, SMOKE = SC.smoke || [];

  var cx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, rect = { x: 0, y: 0, w: 1, h: 1 };
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 }, visible = true, t0 = performance.now();
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; });
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(hero);

  function sprite(size, stops) {
    var c = document.createElement('canvas'); c.width = c.height = size; var g = c.getContext('2d');
    var r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(function (s) { r.addColorStop(s[0], s[1]); }); g.fillStyle = r; g.fillRect(0, 0, size, size); return c;
  }
  var GLOW = sprite(128, [[0, 'rgba(255,190,90,1)'], [0.25, 'rgba(255,110,30,.55)'], [0.6, 'rgba(200,40,10,.15)'], [1, 'rgba(120,0,0,0)']]);
  var FLAME = sprite(64, [[0, 'rgba(255,240,190,1)'], [0.3, 'rgba(255,150,40,.85)'], [0.7, 'rgba(220,50,10,.25)'], [1, 'rgba(120,10,0,0)']]);
  var SPARK = sprite(32, [[0, 'rgba(255,255,230,1)'], [0.4, 'rgba(255,180,80,.8)'], [1, 'rgba(255,80,0,0)']]);
  var MOONGLOW = sprite(256, [[0, 'rgba(240,225,255,.9)'], [0.35, 'rgba(200,160,255,.35)'], [1, 'rgba(120,70,220,0)']]);
  var SMOKEPUFF = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
    for (var i = 0; i < 18; i++) {
      var x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 30;
      var rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(22,18,26,.32)'); rg.addColorStop(1, 'rgba(22,18,26,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    }
    return c;
  })();
  var CLOUD = (function () {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256; var g = c.getContext('2d');
    for (var i = 0; i < 40; i++) {
      var x = 80 + Math.random() * 352, y = 70 + Math.random() * 116, r = 40 + Math.random() * 70;
      var rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(70,30,110,.22)'); rg.addColorStop(1, 'rgba(70,30,110,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 512, 256);
    }
    return c;
  })();

  var titleY = 160;
  function layout() {
    var tEl = document.getElementById('title');
    if (tEl) { var tr = tEl.getBoundingClientRect(), hr = hero.getBoundingClientRect(); titleY = tr.top - hr.top + tr.height * 0.45; }
    W = hero.clientWidth; H = hero.clientHeight; dpr = Math.min(devicePixelRatio || 1, 1.25); // soft fire light: no need for full retina cost
    baseW = 0;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  layout(); addEventListener('resize', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  // Cover the hero with the painting, keeping the moon and castle in view, plus a slow zoom drift and parallax.
  var baseW = 0, baseH = 0;
  art.style.transformOrigin = '0 0';
  function place(t) {
    var s0 = Math.max(W / IMG_W, H / IMG_H);
    var z0 = SC.zoom || 1.05, z = REDUCED ? z0 : z0 + 0.035 * (0.5 - 0.5 * Math.cos(t / 60 * Math.PI * 2));
    var w = IMG_W * s0 * z, h = IMG_H * s0 * z;
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    var fx = W < H ? SC.focusXPortrait : SC.focusX;
    var x = (W - w) * fx - mouse.x * 16 + Math.sin(t * 0.05) * 6;
    var y = SC.anchor === 'moonTitle'
      ? titleY - MOON.y * h - mouse.y * 10 + Math.sin(t * 0.07) * 4   // the painting's moon right behind the big title
      : (H - h) - mouse.y * 10 + Math.sin(t * 0.07) * 4;              // keep the foreground (the fissure) in view
    x = Math.min(0, Math.max(W - w, x)); y = Math.min(0, Math.max(H - h, y));
    rect.x = x; rect.y = y; rect.w = w; rect.h = h;
    // size the image once; the drift is a pure GPU transform (no re-layout or re-raster each frame)
    if (!baseW) { baseW = Math.ceil(IMG_W * s0 * 1.08); baseH = Math.ceil(IMG_H * s0 * 1.08); art.style.width = baseW + 'px'; art.style.height = baseH + 'px'; }
    art.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + (w / baseW).toFixed(5) + ')';
  }
  function at(p) { return { x: rect.x + p[0] * rect.w, y: rect.y + p[1] * rect.h }; }

  // particles
  var flames = [], sparks = [], embers = [], ash = [], clouds = [], puffs = [];
  var NE = SMALL ? 50 : 110, NA = SMALL ? 26 : 55;
  function newEmber(e, init) {
    var f = FIRES[(Math.random() * FIRES.length) | 0], p = at(f);
    e.x = p.x + (Math.random() - 0.5) * 40; e.y = init ? Math.random() * H : p.y; e.vx = (Math.random() - 0.3) * 22; e.vy = -(20 + Math.random() * 55);
    e.life = init ? Math.random() : 1; e.decay = 0.12 + Math.random() * 0.25; e.r = 0.8 + Math.random() * 1.8; e.ph = Math.random() * 9; e.violet = Math.random() < 0.12;
    return e;
  }
  function newAsh(a, init) {
    a.x = Math.random() * W; a.y = init ? Math.random() * H : -10; a.vx = 10 + Math.random() * 25; a.vy = 12 + Math.random() * 25;
    a.s = 1.5 + Math.random() * 3; a.rot = Math.random() * 6; a.vr = (Math.random() - 0.5) * 4; a.ph = Math.random() * 9; return a;
  }
  for (var i = 0; i < NE; i++) embers.push(newEmber({}, true));
  for (var k = 0; k < NA; k++) ash.push(newAsh({}, true));
  for (var c = 0; c < (SMALL ? 3 : 5); c++) clouds.push({ x: Math.random(), y: 0.04 + Math.random() * 0.34, s: 0.5 + Math.random() * 0.7, v: (0.004 + Math.random() * 0.008) * (Math.random() < 0.5 ? -1 : 1), a: 0.5 + Math.random() * 0.5 });

  function burst(f) {
    var p = at(f), n = SMALL ? 22 : 40;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 200;
      sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 120 - Math.random() * 120, life: 1, decay: 0.7 + Math.random() * 0.9, r: 1 + Math.random() * 1.6 });
    }
    flashes.push({ x: p.x, y: p.y, life: 1, r: 60 * f[2] * rect.w / IMG_W * 3 * (SC.fireScale || 1) });
  }
  var flashes = [], nextBurst = 1.5, lightning = 0;
  addEventListener('forge:lightning', function () { lightning = 1; hero.classList.add('lit'); setTimeout(function () { hero.classList.remove('lit'); }, 140); setTimeout(function () { hero.classList.add('lit'); setTimeout(function () { hero.classList.remove('lit'); }, 90); }, 260); });
  addEventListener('forge:leadchange', function () { FIRES.forEach(function (f, i) { if (i < 9) setTimeout(function () { burst(f); }, i * 120); }); });

  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    var dt = Math.min(0.06, (now - last) / 1000); last = now;
    var t = (now - t0) / 1000;
    place(t);
    cx.clearRect(0, 0, W, H);
    var scale = rect.w / IMG_W;

    // drifting storm clouds over the sky
    cx.globalCompositeOperation = 'source-over';
    for (var i = 0; i < clouds.length; i++) {
      var cl = clouds[i]; cl.x += cl.v * dt; if (cl.x > 1.3) cl.x = -0.3; if (cl.x < -0.3) cl.x = 1.3;
      var cw = 900 * cl.s * scale * 1.6, ch = cw / 2, p = at([cl.x, cl.y]);
      cx.globalAlpha = cl.a * 0.55; cx.drawImage(CLOUD, p.x - cw / 2, p.y - ch / 2, cw, ch);
    }
    // rising black smoke columns
    for (var si = 0; si < SMOKE.length; si++) {
      var S0 = SMOKE[si];
      if (!REDUCED && Math.random() < dt * 3 * S0[2]) puffs.push({ s: si, u: 0, ox: (Math.random() - 0.5) * 0.01, rot: Math.random() * 6, sp: 0.05 + Math.random() * 0.03 });
    }
    for (var pi = puffs.length - 1; pi >= 0; pi--) {
      var pf = puffs[pi], S1 = SMOKE[pf.s]; pf.u += dt * pf.sp; if (pf.u >= 1) { puffs.splice(pi, 1); continue; }
      var px = S1[0] + pf.ox + S1[3] * pf.u * 0.25 + Math.sin(pf.u * 6 + pf.s) * 0.01, py = S1[1] - pf.u * 0.5 * S1[2];
      var pp = at([px, py]), pr = (0.04 + pf.u * 0.14) * S1[2] * rect.w * 0.6;
      cx.globalAlpha = Math.sin(pf.u * Math.PI) * 0.38;
      cx.drawImage(SMOKEPUFF, pp.x - pr, pp.y - pr, pr * 2, pr * 2);
    }
    // breathing moon glow
    cx.globalCompositeOperation = 'lighter';
    var mp = at([MOON.x, MOON.y]), mr = MOON.r * rect.w * (2.6 + Math.sin(t * 0.8) * 0.15);
    cx.globalAlpha = 0.16 + 0.05 * Math.sin(t * 0.8) + lightning * 0.4;
    cx.drawImage(MOONGLOW, mp.x - mr, mp.y - mr, mr * 2, mr * 2);

    // fires: flickering glow plus rising flame tongues
    for (var f = 0; f < FIRES.length; f++) {
      var F = FIRES[f], fp = at(F), sz = F[2] * scale * 46 * (SC.fireScale || 1);
      var flick = 0.7 + 0.18 * Math.sin(t * 11 + f * 1.7) + 0.12 * Math.sin(t * 27 + f * 3.1) + Math.random() * 0.08;
      var gr = sz * 2.6 * (0.9 + flick * 0.15);
      cx.globalAlpha = (SC.glowAlpha || 0.5) * flick; cx.drawImage(GLOW, fp.x - gr, fp.y - gr, gr * 2, gr * 2);
      if (!REDUCED && Math.random() < dt * 26 * F[2]) flames.push({ x: fp.x + (Math.random() - 0.5) * sz * 0.9, y: fp.y + sz * 0.15, vx: (Math.random() - 0.5) * 12, vy: -(28 + Math.random() * 40) * F[2] * scale * 2.2 * (SC.fireScale || 1), life: 1, decay: 1.4 + Math.random() * 1.2, r: sz * (0.35 + Math.random() * 0.35) });
    }
    for (var q = flames.length - 1; q >= 0; q--) {
      var fl = flames[q]; fl.life -= dt * fl.decay; if (fl.life <= 0) { flames.splice(q, 1); continue; }
      fl.x += fl.vx * dt + Math.sin(t * 9 + q) * 0.3; fl.y += fl.vy * dt;
      var rr2 = fl.r * (0.4 + fl.life * 0.8);
      cx.globalAlpha = Math.min(1, fl.life * 1.3) * (SC.flameAlpha || 0.75); cx.drawImage(FLAME, fl.x - rr2, fl.y - rr2 * 1.4, rr2 * 2, rr2 * 2.6);
    }
    // spark bursts
    nextBurst -= dt;
    if (nextBurst <= 0 && !REDUCED) { burst(FIRES[(Math.random() * 9) | 0]); nextBurst = 2 + Math.random() * 3.5; }
    for (var b = flashes.length - 1; b >= 0; b--) { var fsh = flashes[b]; fsh.life -= dt * 2.5; if (fsh.life <= 0) { flashes.splice(b, 1); continue; } cx.globalAlpha = fsh.life * 0.8; var fr = fsh.r * (1.2 - fsh.life * 0.4); cx.drawImage(GLOW, fsh.x - fr, fsh.y - fr, fr * 2, fr * 2); }
    for (var s = sparks.length - 1; s >= 0; s--) {
      var sp = sparks[s]; sp.life -= dt * sp.decay; if (sp.life <= 0) { sparks.splice(s, 1); continue; }
      sp.vy += 260 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      cx.globalAlpha = sp.life; var sr = sp.r * 3; cx.drawImage(SPARK, sp.x - sr, sp.y - sr, sr * 2, sr * 2);
    }
    // rising embers
    for (var e = 0; e < embers.length; e++) {
      var em = embers[e]; em.life -= dt * em.decay; if (em.life <= 0 || em.y < -20) { newEmber(em, false); continue; }
      em.x += (em.vx + Math.sin(t * 1.5 + em.ph) * 14) * dt; em.y += em.vy * dt;
      cx.globalAlpha = em.life * (0.6 + 0.4 * Math.sin(t * 12 + em.ph));
      var er = em.r * 2.6;
      if (em.violet) { cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(190,140,255,1)'; cx.beginPath(); cx.arc(em.x, em.y, em.r, 0, 7); cx.fill(); }
      else cx.drawImage(SPARK, em.x - er, em.y - er, er * 2, er * 2);
    }
    // red ash flakes tumbling through the air, like the painting
    cx.globalCompositeOperation = 'source-over';
    for (var a = 0; a < ash.length; a++) {
      var A = ash[a]; A.x += (A.vx + Math.sin(t + A.ph) * 10) * dt; A.y += A.vy * dt; A.rot += A.vr * dt;
      if (A.y > H + 10 || A.x > W + 10) newAsh(A, false);
      var co = Math.cos(A.rot) * dpr, si = Math.sin(A.rot) * dpr; cx.setTransform(co, si, -si, co, A.x * dpr, A.y * dpr); cx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3 + A.ph);
      cx.fillStyle = A.ph > 6 ? '#ff7a3a' : '#d8302a'; cx.fillRect(-A.s, -A.s * 0.35, A.s * 2, A.s * 0.7);
    }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // lightning wash
    if (lightning > 0) { lightning = Math.max(0, lightning - dt * 1.5); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = lightning * 0.4; cx.fillStyle = '#b9a2ff'; cx.fillRect(0, 0, W, H * 0.65); }
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
  }
  requestAnimationFrame(frame);
})();
