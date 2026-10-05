/* =====================================================================
   FORGE OLYMPICS · WAVING LEADERBOARD BANNERS
   Draws each standings bar (built in app.js) as a cloth banner fixed at
   the left edge of the screen, rippling in the wind with moving light and
   shadow across its folds. The leader's banner flies hardest.
   ===================================================================== */
(function () {
  var root = document.documentElement, CFG = window.CONFIG || {};
  if ((CFG.HERO_STYLE || 'bars') !== 'bars') return;
  var board = document.getElementById('board'); if (!board) return;
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var cv = document.createElement('canvas'); cv.className = 'board-canvas'; cv.setAttribute('aria-hidden', 'true');
  board.appendChild(cv);
  var ctx = cv.getContext('2d'), dpr = 1, W = 0, H = 0;
  var tex = {};            // per house: { c: canvas, key: string }
  var crests = {};
  Object.keys(CFG.HOUSES || {}).forEach(function (h) { var im = new Image(); im.src = CFG.HOUSES[h].logo; im.onload = function () { tex = {}; }; crests[h] = im; });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { tex = {}; });

  function size() {
    var r = board.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  addEventListener('resize', function () { size(); tex = {}; });

  // Paint one bar, flat, into its own texture canvas (re-painted only when something changes).
  function paint(row, w, h) {
    var name = row.id.slice(4), C = (CFG.HOUSES || {})[name] || {}, bar = C.bar || [C.color, C.color];
    var rank = row.dataset.rank, pos = +row.dataset.pos, pts = row.querySelector('.pts').textContent;
    var key = [w, h, rank, pos, pts, dpr].join('|');
    var t = tex[name] || (tex[name] = { c: document.createElement('canvas'), key: '' });
    if (t.key === key) return t.c;
    t.key = key;
    var c = t.c; c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var small = innerWidth < 640, slant = 14;
    // body
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w - slant, h); g.lineTo(0, h); g.closePath(); g.clip();
    var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, bar[0]); gr.addColorStop(1, bar[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var hl = g.createLinearGradient(0, 0, 0, h); hl.addColorStop(0, 'rgba(255,255,255,.24)'); hl.addColorStop(0.45, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,.10)');
    g.fillStyle = hl; g.fillRect(0, 0, w, h);
    // subtle woven texture so it reads as fabric
    g.globalAlpha = 0.018; g.fillStyle = '#000';
    for (var y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    for (var x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
    g.globalAlpha = 1;
    // score cap at the fly end
    var capW = small ? 88 : Math.min(250, Math.max(96, innerWidth * 0.15)), cx0 = w - capW;
    g.beginPath(); g.moveTo(cx0 + 16, 0); g.lineTo(w, 0); g.lineTo(w - slant, h); g.lineTo(cx0, h); g.closePath();
    g.fillStyle = C.cap || '#eee'; g.fill();
    g.restore();
    // rank numeral, outlined italic
    var padL = small ? 10 : Math.min(48, Math.max(14, innerWidth * 0.03));
    var rkSize = (pos === 0 ? 0.78 : 0.74) * h, rkW = small ? 30 : Math.min(64, Math.max(30, innerWidth * 0.042));
    g.save(); g.translate(padL + rkW / 2, h / 2); g.transform(1, 0, -0.14, 1, 0, 0);
    g.font = 'italic 900 ' + rkSize + 'px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = small ? 1.6 : 2.2; g.strokeStyle = '#170f22'; g.strokeText(rank, 0, rkSize * 0.04); g.restore();
    // crest
    var gap = small ? 8 : Math.min(22, Math.max(8, innerWidth * 0.014)), x0 = padL + rkW + gap;
    var im = crests[name], chh = h * (small ? 0.66 : 0.72);
    if (im && im.complete && im.naturalWidth) { var cw = chh * im.naturalWidth / im.naturalHeight; g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 3; g.drawImage(im, x0, (h - chh) / 2, cw, chh); g.restore(); x0 += cw + gap; }
    // house name
    var nmSize = Math.max(16, Math.min(pos === 0 ? 40 : 36, innerWidth * (pos === 0 ? 0.026 : 0.023)));
    g.font = '800 ' + nmSize + 'px Inter, system-ui, sans-serif'; g.fillStyle = '#150f1e'; g.textBaseline = 'middle'; g.textAlign = 'left';
    var maxNm = cx0 - x0 - 10, nm = name;
    while (g.measureText(nm).width > maxNm && nm.length > 3) nm = nm.slice(0, -2) + '…';
    g.fillText(nm, x0, h / 2 + 1);
    // points
    var pSize = Math.max(24, Math.min(52, innerWidth * 0.034));
    g.font = '700 ' + pSize + 'px Oswald, "Arial Narrow", sans-serif'; g.textAlign = 'right';
    var label = 'PTS'; var lSize = Math.max(10, Math.min(14, innerWidth * 0.01));
    var mid = cx0 + capW / 2 + 2, pw = g.measureText(pts).width;
    g.font = '500 ' + lSize + 'px Oswald, sans-serif'; var lw = g.measureText(label).width;
    var total = pw + 6 + lw, sx = mid - total / 2;
    g.font = '700 ' + pSize + 'px Oswald, "Arial Narrow", sans-serif'; g.textAlign = 'left'; g.fillText(pts, sx, h / 2 + 2);
    g.font = '500 ' + lSize + 'px Oswald, sans-serif'; g.fillStyle = '#4b3f5a'; g.fillText(label, sx + pw + 6, h / 2 + pSize * 0.28);
    return c;
  }

  var out = document.createElement('canvas'), octx = out.getContext('2d');
  var last = 0, t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!root.classList.contains('bars')) return;
    if (!cv.isConnected) board.appendChild(cv);   // re-attach if the board was rebuilt
    if (now - last < 24) return;                        // ~40 fps is plenty for cloth
    var dt = Math.min(0.05, (now - last) / 1000); last = now; t += REDUCED ? 0 : dt;
    var br = board.getBoundingClientRect();
    if (Math.abs(br.width - W) > 1 || Math.abs(br.height - H) > 1) size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var rows = board.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], bar = row.querySelector('.bar'), rr = bar.getBoundingClientRect();
      var w = Math.round(rr.width), h = Math.round(rr.height); if (w < 10 || h < 10) continue;
      var x = rr.left - br.left, y = rr.top - br.top, lead = row.classList.contains('first'), pos = +row.dataset.pos;
      var texc = paint(row, w, h);
      // wave settings: the leader flies hardest; lower ranks ripple more gently
      var amp = (lead ? 0.085 : 0.05 - pos * 0.006) * h, k = (Math.PI * 2) / (lead ? 300 : 360), sp = lead ? 3.4 : 2.2, ph0 = i * 1.7;
      var pad = Math.ceil(amp + 2);
      out.width = Math.ceil(w * dpr); out.height = Math.ceil((h + pad * 2) * dpr);
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, out.width, out.height);
      var step = 3, shades = [];
      for (var sx = 0; sx < w; sx += step) {
        var u = sx / w, fall = Math.pow(u, 0.85);                // fixed at the left edge, freer toward the fly end
        var ph = sx * k - t * sp + ph0;
        var dy = Math.sin(ph) * amp * fall + Math.sin(ph * 1.9 + 1.3) * amp * 0.25 * fall;
        var sw = Math.min(step + 1, w - sx);
        octx.drawImage(texc, sx * dpr, 0, sw * dpr, h * dpr, sx * dpr, (pad + dy) * dpr, sw * dpr, h * dpr);
        shades.push(Math.cos(ph) * fall);
      }
      // light and shadow rolling across the folds (only on the cloth itself)
      // one smooth gradient: highlights on the crests of the folds, shadow in the troughs
      octx.globalCompositeOperation = 'source-atop';
      var lg = octx.createLinearGradient(0, 0, w * dpr, 0), nS = shades.length;
      for (var j = 0; j < nS; j += 2) {
        var s = shades[j], at = Math.min(1, (j * step) / w);
        lg.addColorStop(at, s > 0 ? 'rgba(255,255,255,' + (s * 0.14).toFixed(3) + ')' : 'rgba(0,0,0,' + (-s * 0.22).toFixed(3) + ')');
      }
      octx.fillStyle = lg; octx.fillRect(0, 0, out.width, out.height);
      octx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
      ctx.drawImage(out, 0, 0, out.width, out.height, x, y - pad, w, h + pad * 2);
      ctx.restore();
    }
  }
  size();
  requestAnimationFrame(frame);
})();
