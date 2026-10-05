/* =====================================================================
   FORGE OLYMPICS · 3D BATTLEFIELD  (purple moon theme)
   A huge moon behind a gothic castle, swirling violet storm clouds,
   jagged rock spires, cracked stone ground with glowing lava, fires,
   flaming arrow volleys, spark bursts, embers, three lone warriors and
   cloth banners that fly according to the live standings.
   Listens for the "forge:state" event dispatched by app.js.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CFG = window.CONFIG;
const root = document.documentElement;
const hero = document.querySelector('.hero');
const holder = document.getElementById('scene3d');
const headEl = document.getElementById('heroHead');
const isMobile = Math.min(screen.width, screen.height) < 700 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// 'image' = your painting is the backdrop and this layer draws only flags, arrows and sparks on top.
// '3d'    = the fully procedural 3D world (sky, castle, terrain, warriors) is drawn instead.
const WORLD = (CFG.BACKGROUND || 'image') === '3d';

/* ---------------- noise helpers ---------------- */
let seed = 1337;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + rand() * (b - a);
function hash2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const CRATERS = [[-8, -14, 0.9, 2.2], [10, -20, 1.2, 2.6], [-3, -30, 1.4, 3.2], [22, -14, 0.7, 1.8], [-19, -12, 1.0, 2.4], [6, -40, 1.6, 3.6]];

/* ---------------- fissures: the ground split open by the war, fire glowing below ---------------- */
const FISSURE_DEFS = [
  { pts: [[-46, -8], [-30, -6.6], [-18, -8.8], [-6.5, -6.4], [4, -8.4], [14, -6.8], [26, -9.2], [46, -7.6]], w: 2.0, d: 1.7 },
  { pts: [[-6.5, -6.4], [-5, -13], [-1.5, -21], [-6, -31], [-3, -46]], w: 1.35, d: 1.5 },
  { pts: [[14, -6.8], [17.5, -15], [13.5, -25], [19, -39]], w: 1.25, d: 1.4 },
  { pts: [[-30, -6.6], [-33, -16], [-40, -26]], w: 1.1, d: 1.3 }
];
const FISSURES = WORLD ? FISSURE_DEFS.map((f, fi) => {
  const pts = [];
  for (let i = 0; i < f.pts.length - 1; i++) {
    const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(len / 1.2));
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (let k = 0; k < n; k++) {
      const t = k / n, j = (vnoise(fi * 13 + (i + t) * 2.3, 7.7) - 0.5) * 1.6, along = (i + t) / (f.pts.length - 1);
      pts.push({ x: ax + (bx - ax) * t + nx * j, z: az + (bz - az) * t + nz * j, w: f.w * (fi === 0 ? 1 : 1 - along * 0.55) * (0.75 + 0.5 * vnoise((i + t) * 3.1, fi * 5.3)) });
    }
  }
  const last = f.pts[f.pts.length - 1]; pts.push({ x: last[0], z: last[1], w: f.w * (fi === 0 ? 1 : 0.35) });
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9; pts.forEach(q => { a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.z); d = Math.max(d, q.z); });
  return { pts, d: f.d, box: [a - 4, b + 4, c - 4, d + 4] };
}) : [];
// r = distance from the fissure centre measured in local widths (0 centre, 1 lip); d = local depth
function fissureAt(x, z) {
  let best = 99, depth = 0;
  for (const f of FISSURES) {
    if (x < f.box[0] || x > f.box[1] || z < f.box[2] || z > f.box[3]) continue;
    const P = f.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t - x, pz = a.z + dz * t - z, w = a.w + (b.w - a.w) * t, r = Math.sqrt(px * px + pz * pz) / w;
      if (r < best) { best = r; depth = f.d * (0.6 + 0.4 * w / 2.0); }
    }
  }
  return { r: best, d: depth };
}
const nearFissure = (x, z, m = 1.9) => fissureAt(x, z).r < m;
function groundH(x, z) {
  let h = (fbm(x * 0.035 + 3, z * 0.035 + 7) - 0.5) * 3.4;
  h += (fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.5;
  const ridge = Math.exp(-(z * z) / (2 * 3.2 * 3.2));
  h *= 1 - ridge * 0.92;
  if (z > 0) h -= z * 0.13;
  const back = Math.min(1, Math.max(0, (-z - 26) / 110));
  h += back * back * 10 * (0.55 + 0.9 * fbm(x * 0.02 + 9, z * 0.02));
  for (const c of CRATERS) {
    const dx = x - c[0], dz = z - c[1], d = Math.sqrt(dx * dx + dz * dz);
    h -= c[2] * Math.exp(-(d * d) / (c[3] * c[3]));
    h += c[2] * 0.35 * Math.exp(-Math.pow(d - c[3] * 1.25, 2) / (c[3] * 0.4));
  }
  if (FISSURES.length) { const f = fissureAt(x, z); if (f.r < 1.8) { h -= f.d * (1 - smooth(0.45, 1.0, f.r)); h += 0.18 * Math.exp(-Math.pow(f.r - 1.15, 2) / 0.04); } }
  return h;
}

/* ---------------- canvas textures ---------------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const softTex = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const smokeTex = canvasTex(128, 128, (g, w) => {
  for (let i = 0; i < 26; i++) {
    const x = w / 2 + (Math.random() - 0.5) * w * 0.45, y = w / 2 + (Math.random() - 0.5) * w * 0.45, r = w * (0.12 + Math.random() * 0.22);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, w);
  }
});
// cracked stone slabs: one colour map with dark cracks, one glow map where some cracks carry lava
function crackSet() {
  const S = 512, cracks = []; let s = 4242; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2; const pts = [[x, y]], n = 6 + ((r() * 12) | 0);
    for (let k = 0; k < n; k++) { a += (r() - 0.5) * 1.1; const L = 10 + r() * 26; x += Math.cos(a) * L; y += Math.sin(a) * L; pts.push([x, y]); }
    cracks.push({ pts, w: 0.8 + r() * 2.4, lava: r() < 0.42 });
  }
  const path = (g, c) => { g.beginPath(); c.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
  const color = canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const x = i % S, y = (i / S) | 0, n = 0.55 + 0.45 * (fbm(x * 0.03, y * 0.03, 4) * 0.7 + Math.random() * 0.3);
      const v = n * 255; img.data[i * 4] = v * 0.95; img.data[i * 4 + 1] = v * 0.9; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = g.lineJoin = 'round';
    for (const c of cracks) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.save(); g.translate(ox, oy); g.strokeStyle = 'rgba(8,4,10,.85)'; g.lineWidth = c.w + 1.5; path(g, c); g.stroke(); g.restore();
    }
  });
  const glow = canvasTex(S, S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.lineCap = g.lineJoin = 'round';
    for (const c of cracks) if (c.lava) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.save(); g.translate(ox, oy);
      g.shadowColor = '#ff6a1a'; g.shadowBlur = 14; g.strokeStyle = '#ff7a24'; g.lineWidth = c.w + 1; path(g, c); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = '#ffd08a'; g.lineWidth = Math.max(0.6, c.w * 0.45); path(g, c); g.stroke();
      g.restore();
    }
  });
  for (const t of [color, glow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(16, 13); }
  return { color, glow };
}
// (crackSet() builds the lava-crack ground; the aftermath field uses trampled mud instead)
const mudTex = canvasTex(256, 256, (g, w) => {
  const img = g.createImageData(w, w);
  for (let i = 0; i < w * w; i++) {
    const x = i % w, y = (i / w) | 0;
    const n = 0.55 + 0.45 * (fbm(x * 0.05, y * 0.05, 4) * 0.65 + Math.random() * 0.35);
    const v = Math.min(255, n * 255); img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.95; img.data[i * 4 + 2] = v * 0.9; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // hoof prints, boot marks and wheel ruts pressed into the mud
  for (let k = 0; k < 140; k++) { g.fillStyle = 'rgba(20,12,8,' + (0.15 + Math.random() * 0.25) + ')'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * w, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(18,10,6,.35)'; g.lineWidth = 3;
  for (let k = 0; k < 4; k++) { g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); while (y < w) { y += 12; x += (Math.random() - 0.5) * 10; g.lineTo(x, y); } g.stroke(); }
});
mudTex.wrapS = mudTex.wrapT = THREE.RepeatWrapping; mudTex.repeat.set(60, 50);

/* ---------------- renderer ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: !WORLD, powerPreference: 'high-performance' });
if (!WORLD) renderer.setClearColor(0x000000, 0);
let pixelRatio = Math.min(devicePixelRatio || 1, isMobile ? 1.25 : (WORLD ? 1.75 : 1.5));
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !isMobile && WORLD;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
holder.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color('#2a1543');
if (WORLD) scene.fog = new THREE.FogExp2(FOG.getHex(), 0.0085);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1500);

/* ---------------- sky: purple storm swirling around a giant moon ---------------- */
const NOISE_GLSL = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }`;
const MOON = new THREE.Vector3(0, Math.tan(THREE.MathUtils.degToRad(11)), -1).normalize();
const skyU = { uTime: { value: 0 }, uFlash: { value: 0 }, uMoon: { value: MOON } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `${NOISE_GLSL}
  varying vec3 vDir; uniform float uTime; uniform float uFlash; uniform vec3 uMoon;
  float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir); float h = d.y;
    vec3 top = vec3(0.02,0.008,0.05), mid = vec3(0.13,0.04,0.26), low = vec3(0.34,0.10,0.40), hor = vec3(0.62,0.18,0.34);
    vec3 col = mix(hor, low, smoothstep(-0.02, 0.07, h));
    col = mix(col, mid, smoothstep(0.06, 0.3, h));
    col = mix(col, top, smoothstep(0.3, 0.95, h));
    float md = dot(d, uMoon); float m = max(md, 0.0);
    col += vec3(0.75,0.5,1.1) * pow(m, 60.0) * 1.3 + vec3(0.5,0.28,0.9) * pow(m, 10.0) * 0.45;
    // gnomonic coordinates around the moon, swirled into a vortex
    vec3 right = normalize(cross(uMoon, vec3(0.0,1.0,0.0))); vec3 up = cross(right, uMoon);
    vec2 q = vec2(dot(d,right), dot(d,up)) / max(md, 0.06);
    float r = length(q);
    float ang = 2.4 * exp(-r * 1.3) + uTime * 0.012;
    float cs = cos(ang), sn = sin(ang);
    vec2 sw = vec2(q.x*cs - q.y*sn, q.x*sn + q.y*cs);
    float c = fbm2(sw * 2.1 + vec2(0.0, uTime * 0.015));
    float c2 = fbm2(sw * 5.5 - vec2(uTime * 0.03, 0.0));
    float cloud = smoothstep(0.40, 0.76, c * 0.78 + c2 * 0.32);
    cloud *= smoothstep(-0.01, 0.06, h) * smoothstep(0.19, 0.6, r);
    float light = clamp(exp(-r * 0.85) * 1.25, 0.0, 1.0) * (0.45 + 0.75 * smoothstep(0.5, 0.9, c2));
    vec3 cc = mix(vec3(0.05,0.018,0.10), vec3(0.72,0.48,1.05), light);
    cc += vec3(0.75,0.2,0.22) * (1.0 - smoothstep(0.0, 0.18, h)) * 0.45;
    col = mix(col, cc, cloud * 0.95);
    // stars
    vec3 sp = d * 700.0; float st = h31(floor(sp));
    col += vec3(0.9,0.85,1.0) * step(0.9993, st) * smoothstep(0.25, 0.6, h) * (1.0 - cloud) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 80.0)) * 1.3;
    // the moon
    float R = 0.16;
    float disc = smoothstep(R, R - 0.0025, r) * step(0.0, md);
    float crater = fbm2(q * 12.0) * 0.3 + fbm2(q * 38.0) * 0.12;
    float limb = sqrt(max(0.0, 1.0 - (r * r) / (R * R)));
    vec3 moonCol = vec3(1.45,1.32,1.62) * (0.74 + 0.26 * limb - crater * 0.5);
    col = mix(col, moonCol, disc);
    if (h < 0.0) col = mix(col, vec3(0.07,0.025,0.08), smoothstep(0.0, -0.08, h));
    col += uFlash * vec3(0.55,0.5,0.9) * (0.3 + cloud * 1.6);
    gl_FragColor = vec4(col, 1.0);
  }`
}));
sky.renderOrder = -10;
if (WORLD) scene.add(sky);

/* ---------------- lights ---------------- */
const hemi = new THREE.HemisphereLight(0x6b44b0, 0x3a2418, 0.85);
scene.add(hemi);
const backLight = new THREE.DirectionalLight(0xc6b0ff, 1.5); // the moon, behind the field
backLight.position.set(3, 26, -34); backLight.target.position.set(0, 0, -2);
backLight.castShadow = !isMobile;
if (!isMobile) {
  backLight.shadow.mapSize.set(2048, 2048);
  Object.assign(backLight.shadow.camera, { left: -22, right: 22, top: 20, bottom: -20, near: 1, far: 90 });
  backLight.shadow.bias = -0.0008; backLight.shadow.normalBias = 0.03;
}
scene.add(backLight, backLight.target);
const fill = new THREE.DirectionalLight(0x9076ff, 0.55);
fill.position.set(8, 14, 18);
scene.add(fill);

/* ---------------- scorched, trampled battlefield earth ---------------- */
const CRACKED = WORLD ? crackSet().color : null;
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: CRACKED || mudTex, roughness: 0.96, metalness: 0 });
const groundGlowU = { value: 2.2 };
groundMat.onBeforeCompile = (sh) => {
  sh.uniforms.uGlowI = groundGlowU;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow; uniform float uGlowI;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * vGlow * uGlowI;');
};
{
  const segX = isMobile ? 210 : 380, segZ = isMobile ? 170 : 320;
  const tg = new THREE.PlaneGeometry(340, 280, segX, segZ);
  tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -110);
  const p = tg.attributes.position, col = new Float32Array(p.count * 3);
  const mud = new THREE.Color('#4e3e33'), grass = new THREE.Color('#3f3b2a'), ash = new THREE.Color('#5e5658'), dark = new THREE.Color('#1a1412'), clay = new THREE.Color('#5c3a2c'), rockWall = new THREE.Color('#1b1513'), hot = new THREE.Color('#8a3412');
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = groundH(x, z);
    p.setY(i, y);
    const n1 = fbm(x * 0.06, z * 0.06), n2 = fbm(x * 0.22 + 50, z * 0.22 + 20, 3);
    c.copy(mud).lerp(grass, smooth(0.5, 0.78, n1) * 0.85);
    c.lerp(clay, smooth(0.55, 0.8, n2) * 0.4);
    c.lerp(ash, smooth(0.62, 0.85, fbm(x * 0.4 - 7, z * 0.4, 2)) * 0.45);
    c.lerp(dark, smooth(0.6, 0.82, fbm(x * 0.09 + 30, z * 0.09 - 12, 3)) * 0.55); // scorch marks
    let burn = 0;
    for (const cr of CRATERS) { const d = Math.hypot(x - cr[0], z - cr[1]); burn = Math.max(burn, 1 - smooth(cr[3] * 0.5, cr[3] * 1.6, d)); }
    c.lerp(dark, burn * 0.85);
    const fz = FISSURES.length ? fissureAt(x, z) : { r: 99 };
    if (fz.r < 1.7) { c.lerp(dark, (1 - smooth(0.9, 1.7, fz.r)) * 0.75); c.lerp(rockWall, (1 - smooth(0.5, 1.05, fz.r)) * 0.9); c.lerp(hot, (1 - smooth(0.3, 0.7, fz.r)) * 0.85); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const glow = new Float32Array(p.count);
  if (FISSURES.length) for (let i = 0; i < p.count; i++) { const r = fissureAt(p.getX(i), p.getZ(i)).r; glow[i] = r < 1.1 ? Math.pow(1 - smooth(0.12, 0.9, r), 2.6) : 0; }
  tg.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  tg.computeVertexNormals();
  const ground = new THREE.Mesh(tg, groundMat);
  ground.receiveShadow = true;
  if (WORLD) scene.add(ground);
}

/* ---------------- jagged distant crags ---------------- */
function crags(z, base, amp, color, so, width = 1500) {
  const s = new THREE.Shape(); const N = 300; let r = so * 999;
  const R = () => (r = (r * 16807 + 11) % 2147483647) / 2147483647;
  s.moveTo(-width / 2, -80);
  for (let i = 0; i <= N; i++) {
    const x = -width / 2 + (width * i) / N;
    const n = fbm(i * 0.045 + so, so);
    const spike = Math.pow(R(), 6) * 1.1;
    const centre = Math.exp(-Math.pow(x / (width * 0.12), 2)) * 0.35;
    s.lineTo(x, base + amp * (n * 0.9 + spike + centre) * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.31 + so))));
  }
  s.lineTo(width / 2, -80); s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, fog: false }));
  m.position.z = z; scene.add(m); return m;
}
if (WORLD) crags(-560, -10, 70, new THREE.Color('#3a2058'), 3.1);
if (WORLD) crags(-420, -12, 50, new THREE.Color('#26143d'), 7.7);
if (WORLD) crags(-320, -12, 30, new THREE.Color('#190c28'), 12.4);

/* ---------------- shared materials ---------------- */
const MAT = {
  wood: new THREE.MeshStandardMaterial({ color: '#3b2716', roughness: 0.85 }),
  darkwood: new THREE.MeshStandardMaterial({ color: '#21150d', roughness: 0.9 }),
  iron: new THREE.MeshStandardMaterial({ color: '#8a8f9c', roughness: 0.3, metalness: 0.9 }),
  rust: new THREE.MeshStandardMaterial({ color: '#4a3a33', roughness: 0.6, metalness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: '#c99a3a', roughness: 0.3, metalness: 1, emissive: '#3a2400', emissiveIntensity: 0.4 }),
  rock: new THREE.MeshStandardMaterial({ color: '#2e2636', roughness: 0.9, flatShading: true }),
  spire: new THREE.MeshStandardMaterial({ color: '#2a2036', roughness: 0.75, metalness: 0.1, flatShading: true }),
  ember: new THREE.MeshStandardMaterial({ color: '#1a0c06', roughness: 0.9, emissive: '#ff4410', emissiveIntensity: 0.9 }),
  armor: new THREE.MeshStandardMaterial({ color: '#4a4452', roughness: 0.38, metalness: 0.8 }),
  armorDark: new THREE.MeshStandardMaterial({ color: '#221d28', roughness: 0.5, metalness: 0.7 }),
  cape: new THREE.MeshStandardMaterial({ color: '#4a0f1e', roughness: 0.9, side: THREE.DoubleSide })
};
const inBannerZone = (x, z) => Math.abs(z) < 2.8 && Math.abs(x) < 14;
const WARRIOR_SPOTS = [[-11, -18], [3, -21], [21, -28]];
const nearWarrior = (x, z) => WARRIOR_SPOTS.some(([wx, wz]) => Math.hypot(x - wx, z - wz) < 3);

/* ---------------- debris & rock spires ---------------- */
const dummy = new THREE.Object3D();
function scatter(count, fn, zMin = -70, zMax = 5) {
  const out = []; let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const x = rr(-45, 45), z = rr(zMin, zMax);
    if (inBannerZone(x, z) || z > 3.5 || nearWarrior(x, z) || nearFissure(x, z)) continue;
    out.push(fn(x, z));
  }
  return out;
}
if (WORLD) { // a few natural rock outcrops
  const g = new THREE.DodecahedronGeometry(1, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 0.8 + Math.random() * 0.35; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.75, p.getZ(i) * f); }
  g.computeVertexNormals();
  const N = isMobile ? 6 : 10, im = new THREE.InstancedMesh(g, MAT.rock, N); let i = 0;
  scatter(N, (x, z) => { const sc = rr(0.7, 1.8); dummy.position.set(x, groundH(x, z) - sc * 0.35, z); dummy.rotation.set(rr(0, 1), rr(0, 6), rr(0, 1)); dummy.scale.set(sc * rr(1, 1.6), sc, sc); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix); }, -60, -12);
  im.count = i; im.castShadow = im.receiveShadow = !isMobile; scene.add(im);
}
if (WORLD) { // ruined stone outposts on the flanks, broken in the fighting
  const stoneM = new THREE.MeshStandardMaterial({ color: '#3a3438', roughness: 0.9, flatShading: true });
  const ruin = (x, z, rot) => {
    const g = new THREE.Group(), y = groundH(x, z);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 4.2, 9, 3, true), stoneM); tower.position.y = 2.1; g.add(tower);
    const tp = tower.geometry.attributes.position; for (let k = 0; k < tp.count; k++) if (tp.getY(k) > 1.5) tp.setY(k, tp.getY(k) - rr(0, 2.2)); tower.geometry.computeVertexNormals();
    tower.material = stoneM; tower.material.side = THREE.DoubleSide;
    for (let k = 0; k < 5; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, rr(0.6, 2.2), 0.6), stoneM); w.position.set(1.8 + k * 1.05, 0.4, 0.2 + rr(-0.1, 0.1)); w.rotation.z = rr(-0.08, 0.08); g.add(w); }
    for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(rr(0.3, 0.7), rr(0.25, 0.45), rr(0.3, 0.6)), stoneM); b.position.set(rr(-2, 7), 0.12, rr(-1.6, 2)); b.rotation.set(rr(0, 1), rr(0, 3), rr(0, 1)); g.add(b); }
    g.position.set(x, y - 0.1, z); g.rotation.y = rot; g.traverse(o => { o.castShadow = o.receiveShadow = !isMobile; }); scene.add(g);
  };
  ruin(-24, -16, 0.4); ruin(22, -22, Math.PI - 0.5);
}
if (WORLD) { // rubble
  const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 0.75 + Math.random() * 0.45; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.6, p.getZ(i) * f); }
  g.computeVertexNormals();
  const N = isMobile ? 60 : 110, im = new THREE.InstancedMesh(g, MAT.rock, N); let i = 0;
  scatter(N, (x, z) => { const s = rr(0.12, z > -10 ? 0.35 : 0.7); dummy.position.set(x, groundH(x, z) - s * 0.2, z); dummy.rotation.set(rr(0, 3), rr(0, 6), rr(0, 3)); dummy.scale.setScalar(s); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix); });
  im.count = i; im.castShadow = im.receiveShadow = !isMobile; scene.add(im);
}
if (WORLD) { // spears stuck in the ground
  const shaftG = new THREE.CylinderGeometry(0.022, 0.026, 2.4, 5); shaftG.translate(0, 1.2, 0);
  const tipG = new THREE.ConeGeometry(0.06, 0.3, 5); tipG.translate(0, 2.55, 0);
  const N = isMobile ? 40 : 80, shafts = new THREE.InstancedMesh(shaftG, MAT.wood, N), tips = new THREE.InstancedMesh(tipG, MAT.iron, N); let i = 0;
  scatter(N, (x, z) => { dummy.position.set(x, groundH(x, z) - 0.25, z); dummy.rotation.set(rr(-0.55, 0.55), rr(0, 6), rr(-0.55, 0.55)); dummy.scale.set(1, rr(0.55, 1.1), 1); dummy.updateMatrix(); shafts.setMatrixAt(i, dummy.matrix); tips.setMatrixAt(i, dummy.matrix); i++; });
  shafts.count = tips.count = i; shafts.castShadow = !isMobile; scene.add(shafts, tips);
}
if (WORLD) { // swords
  const blade = new THREE.BoxGeometry(0.07, 1.05, 0.015); blade.translate(0, 0.52, 0);
  const guard = new THREE.BoxGeometry(0.32, 0.05, 0.06); guard.translate(0, 1.05, 0);
  const grip = new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6); grip.translate(0, 1.2, 0);
  scatter(isMobile ? 12 : 24, (x, z) => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(blade, MAT.iron), new THREE.Mesh(guard, MAT.rust), new THREE.Mesh(grip, MAT.darkwood));
    s.position.set(x, groundH(x, z) - 0.35, z); s.rotation.set(rr(-0.35, 0.35), rr(0, 6), rr(-0.35, 0.35)); s.scale.setScalar(rr(0.9, 1.3));
    s.traverse(o => { o.castShadow = !isMobile; }); scene.add(s);
  });
}
if (WORLD) { // fallen shields
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 0.06, 22), boss = new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const tints = Object.values(CFG.HOUSES).map(h => new THREE.Color(h.deep).multiplyScalar(0.8));
  scatter(isMobile ? 16 : 32, (x, z) => {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: rand() < 0.55 ? tints[(rand() * tints.length) | 0] : new THREE.Color('#3a2616'), roughness: 0.8 });
    g.add(new THREE.Mesh(disc, m)); const b = new THREE.Mesh(boss, MAT.rust); b.position.y = 0.03; g.add(b);
    const upright = false;
    g.position.set(x, groundH(x, z) + (upright ? 0.38 : 0.03), z);
    g.rotation.set(upright ? Math.PI / 2 - 0.3 : rr(-0.25, 0.25), rr(0, 6), rr(-0.25, 0.25)); g.scale.setScalar(rr(0.8, 1.15));
    g.traverse(o => { o.castShadow = o.receiveShadow = !isMobile; }); scene.add(g);
  });
}

/* ---------------- the aftermath: wreckage of a war already fought ---------------- */
const tornFlags = [], craterEmbers = [], plumes = [], WRECK_FIRES = [];
const woodBurnt = new THREE.MeshStandardMaterial({ color: '#1e140e', roughness: 0.95 });
function place(g, x, z, rotY, sink = 0) { g.position.set(x, groundH(x, z) - sink, z); g.rotation.y = rotY; g.traverse(o => { o.castShadow = o.receiveShadow = !isMobile; }); scene.add(g); return g; }
function plank(len, r, m) { return new THREE.Mesh(new THREE.BoxGeometry(r, len, r), m); }
function wheel(r, m) {
  const w = new THREE.Group(), rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.09, 6, 16), m); w.add(rim);
  for (let k = 0; k < 6; k++) { const sp = plank(r * 1.9, r * 0.08, m); sp.rotation.z = k * Math.PI / 6; w.add(sp); }
  return w;
}
if (WORLD) { // broken trebuchets
  const tre = (x, z, rot, tipped) => {
    const g = new THREE.Group(), M = rand() < 0.5 ? MAT.wood : woodBurnt;
    const base1 = plank(4, 0.22, M); base1.rotation.x = Math.PI / 2; base1.position.set(-0.9, 0.15, 0); g.add(base1);
    const base2 = base1.clone(); base2.position.x = 0.9; g.add(base2);
    for (const sx of [-0.9, 0.9]) { const a = plank(3.2, 0.2, M); a.position.set(sx, 1.5, -0.6); a.rotation.x = 0.35; g.add(a); const b = plank(3.2, 0.2, M); b.position.set(sx, 1.5, 0.6); b.rotation.x = -0.35; g.add(b); }
    const axle = plank(2.2, 0.16, M); axle.rotation.z = Math.PI / 2; axle.position.set(0, 2.9, 0); g.add(axle);
    const arm = plank(5.5, 0.18, M); arm.position.set(0, 2.6, 0.6); arm.rotation.x = tipped ? 1.2 : -0.6; g.add(arm);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), MAT.darkwood); cw.position.set(0, 1.0, -1.4); cw.rotation.z = 0.3; g.add(cw);
    [[-1, 1.6], [1, -1.6]].forEach(([wx, wz]) => { const wh = wheel(0.5, M); wh.rotation.y = Math.PI / 2; wh.position.set(wx * 1.05, 0.5, wz); g.add(wh); });
    if (tipped) { g.rotation.z = 0.5; }
    return place(g, x, z, rot, tipped ? 0.4 : 0.05);
  };
  tre(-12.5, -27, 0.5, false); tre(15, -33, -0.9, true);
  WRECK_FIRES.push([-12.5, -26.2, 1.3], [15.2, -33, 1.1]);
}
if (WORLD) { // overturned supply carts with loose wheels
  const cart = (x, z, rot) => {
    const g = new THREE.Group(), M = rand() < 0.5 ? MAT.wood : woodBurnt;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.3), M); g.add(bed);
    [[0, 0.65], [0, -0.65]].forEach(([bx, bz]) => { const side = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.08), M); side.position.set(bx, 0.3, bz); g.add(side); });
    const shaft = plank(2.2, 0.08, M); shaft.rotation.z = Math.PI / 2 - 0.25; shaft.position.set(1.9, -0.2, 0.3); g.add(shaft);
    const wh = wheel(0.45, M); wh.position.set(-0.6, -0.4, 0.75); g.add(wh);
    g.rotation.x = 1.9; g.position.y = 0.55;
    const holder = new THREE.Group(); holder.add(g);
    const loose = wheel(0.45, M); loose.rotation.x = Math.PI / 2; loose.position.set(1.8, 0.05, -1.2); holder.add(loose);
    for (let k = 0; k < 4; k++) { const sack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#4b3d2a', roughness: 1 })); sack.scale.set(1.3, 0.7, 1); sack.position.set(rr(-1.5, 1.2), 0.12, rr(-1.6, -0.6)); holder.add(sack); }
    return place(holder, x, z, rot);
  };
  cart(7.5, -17.5, 0.3); cart(-14, -38, -1.1); if (!isMobile) cart(24, -14, 2.2);
  WRECK_FIRES.push([7.2, -19, 0.8]);
}
if (WORLD) { // broken barricades: spiked logs and toppled palisades
  const stake = new THREE.CylinderGeometry(0.06, 0.07, 1.8, 6); stake.translate(0, 0.9, 0);
  const tip = new THREE.ConeGeometry(0.07, 0.3, 6); tip.translate(0, 1.95, 0);
  const cheval = (x, z, rot, len) => {
    const g = new THREE.Group(), log = plank(len, 0.22, MAT.wood); log.rotation.z = Math.PI / 2; log.position.y = 0.45; g.add(log);
    for (let k = 0; k < len / 0.7; k++) for (const a of [0.8, -0.8]) {
      if (rand() < 0.25) continue; const st = new THREE.Group(); st.add(new THREE.Mesh(stake, MAT.wood), new THREE.Mesh(tip, MAT.darkwood));
      st.position.set(-len / 2 + 0.35 + k * 0.7, 0.45, 0); st.rotation.x = a + rr(-0.15, 0.15); st.scale.y = rr(0.5, 1); g.add(st);
    }
    g.rotation.z = rr(-0.12, 0.12); return place(g, x, z, rot, 0.1);
  };
  cheval(1.5, -11.5, 0.15, 4); cheval(4.5, -24, -0.2, 3.5); cheval(-17, -36, 0.4, 5); cheval(13, -42, -0.5, 4);
  const pal = (x, z, rot, n) => {
    const g = new THREE.Group();
    for (let k = 0; k < n; k++) { const st = new THREE.Group(); st.add(new THREE.Mesh(stake, MAT.darkwood), new THREE.Mesh(tip, MAT.darkwood));
      st.position.x = k * 0.16; st.scale.set(1.6, rr(0.9, 1.5), 1.6); if (rand() < 0.35) { st.rotation.x = rr(1.2, 1.5); st.position.z = rr(0, 0.8); } g.add(st); }
    return place(g, x, z, rot, 0.2);
  };
  pal(-30, -26, 0.2, 18); pal(28, -30, -0.3, 16); pal(-9, -48, 0.05, 22); pal(9, -52, -0.1, 20);
}
if (WORLD) { // a rain of spent arrows still stuck in the earth
  const shaft = new THREE.CylinderGeometry(0.008, 0.008, 0.8, 4); shaft.translate(0, 0.4, 0);
  const flet = new THREE.PlaneGeometry(0.06, 0.14); flet.translate(0, 0.72, 0);
  const N = isMobile ? 160 : 340, sh = new THREE.InstancedMesh(shaft, MAT.darkwood, N), fl = new THREE.InstancedMesh(flet, new THREE.MeshStandardMaterial({ color: '#c9bfae', roughness: 1, side: THREE.DoubleSide }), N);
  let i = 0; const clusters = [[-3, -9], [6, -13], [-9, -20], [2, -28], [12, -18], [-15, -12], [18, -26], [-20, -30], [8, -38]];
  while (i < N) {
    const c = clusters[i % clusters.length], x = c[0] + rr(-3.5, 3.5), z = c[1] + rr(-3, 3);
    if (inBannerZone(x, z) || nearWarrior(x, z) || nearFissure(x, z, 1.3)) { i++; continue; }
    dummy.position.set(x, groundH(x, z) - 0.15, z); dummy.rotation.set(rr(-0.15, 0.15), rr(0, 0.4), -0.55 + rr(-0.2, 0.2)); dummy.scale.setScalar(rr(0.85, 1.15)); dummy.updateMatrix();
    sh.setMatrixAt(i, dummy.matrix); fl.setMatrixAt(i, dummy.matrix); i++;
  }
  scene.add(sh, fl);
}
if (WORLD) { // dropped helmets
  const helm = new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const N = isMobile ? 14 : 28, im = new THREE.InstancedMesh(helm, MAT.armor, N); let i = 0;
  scatter(N, (x, z) => { dummy.position.set(x, groundH(x, z) - 0.02, z); dummy.rotation.set(rr(-0.6, 0.6) + (rand() < 0.3 ? Math.PI : 0), rr(0, 6), rr(-0.6, 0.6)); dummy.scale.set(1, 1.1, 1.2); dummy.updateMatrix(); im.setMatrixAt(i++, dummy.matrix); }, -45, -4);
  im.count = i; im.castShadow = !isMobile; scene.add(im);
}
if (WORLD) { // burnt tree stumps and a few dead trees
  scatter(isMobile ? 6 : 12, (x, z) => { const st = new THREE.Mesh(new THREE.CylinderGeometry(rr(0.18, 0.3), rr(0.3, 0.45), rr(0.4, 1.1), 7), woodBurnt); place(st, x, z, rr(0, 6), -0.2); }, -55, -10);
  [[-19, -22], [24, -40], [-31, -48], [11, -60]].forEach(([x, z]) => {
    const tr = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 5.5, 6), woodBurnt); trunk.position.y = 2.7; tr.add(trunk);
    for (let k = 0; k < 6; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, rr(1.4, 2.6), 5), woodBurnt); br.position.y = rr(2.8, 5); br.rotation.set(rr(-1, 1), rr(0, 6), rr(0.5, 1.2) * (rand() < 0.5 ? -1 : 1)); br.translateY(0.8); tr.add(br); }
    place(tr, x, z, rr(0, 6), 0.2);
  });
}
if (WORLD) { // muddy puddles that catch the firelight
  const pm = new THREE.MeshStandardMaterial({ color: '#141010', roughness: 0.32, metalness: 0.15 });
  scatter(isMobile ? 8 : 16, (x, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 18), pm); m.rotation.x = -Math.PI / 2; m.scale.set(rr(0.6, 2.2), rr(0.4, 1.2), 1); m.position.set(x, groundH(x, z) + 0.03, z); m.rotation.z = rr(0, 6); m.receiveShadow = true; scene.add(m); }, -40, -4);
}
if (WORLD) { // torn banners of the fallen, still stuck in the field
  const cols = ['#5a1a1a', '#1d2c55', '#2a4a2a', '#5a4a14', '#3a1f45'];
  [[-10.5, -16, 0.15], [4, -31, -0.2], [-21, -34, 0.3], [9.5, -21, -0.25], [0, -41, 0.1], [9.5, -11.5, -0.3]].forEach(([x, z, lean], k) => {
    const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.2, 6).translate(0, 1.6, 0), MAT.darkwood); g.add(pole);
    const geo = new THREE.PlaneGeometry(0.9, 0.6, 10, 6); geo.translate(0.45, -0.3, 0); geo.userData.base = Float32Array.from(geo.attributes.position.array);
    const tex = canvasTex(128, 96, (gg) => {
      gg.fillStyle = cols[k % cols.length]; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(128, 0);
      for (let y = 0; y <= 96; y += 8) gg.lineTo(70 + Math.random() * 55, y); gg.lineTo(0, 96); gg.closePath(); gg.fill();
      for (let q = 0; q < 10; q++) { gg.fillStyle = 'rgba(0,0,0,' + (0.15 + Math.random() * 0.3) + ')'; gg.beginPath(); gg.arc(Math.random() * 128, Math.random() * 96, 4 + Math.random() * 16, 0, 7); gg.fill(); }
      gg.globalCompositeOperation = 'destination-out'; for (let q = 0; q < 4; q++) { gg.beginPath(); gg.arc(30 + Math.random() * 80, 15 + Math.random() * 66, 3 + Math.random() * 7, 0, 7); gg.fill(); }
    });
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }));
    flag.position.set(0.04, 3.1, 0); g.add(flag);
    g.rotation.z = lean; place(g, x, z, rr(-0.4, 0.4), 0.3);
    tornFlags.push({ geo, ph: rand() * 6 });
  });
}
if (WORLD) { // smouldering craters and smoke rising from the field
  const emberTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,140,60,1)'); r.addColorStop(0.4, 'rgba(200,50,10,.6)'); r.addColorStop(1, 'rgba(80,10,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 90; k++) { g.fillStyle = 'rgba(0,0,0,' + (0.3 + Math.random() * 0.6) + ')'; g.beginPath(); g.arc(Math.random() * w, Math.random() * w, 2 + Math.random() * 7, 0, 7); g.fill(); }
  });
  CRATERS.forEach((c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: emberTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.4, 0.6, 0.25) }));
    m.rotation.x = -Math.PI / 2; m.position.set(c[0], groundH(c[0], c[1]) + 0.06, c[1]); m.scale.setScalar(c[3] * 1.3); scene.add(m);
    craterEmbers.push({ m, ph: k * 1.3 });
  });
  [[-18, -8.6, 1.5], [4, -8.4, 1.2], [17, -15, 1.4], [-5, -31, 1.8], [-26, -55, 2.4], [24, -60, 2.6]].forEach(([x, z, s]) => {
    for (let k = 0; k < (isMobile ? 6 : 11); k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#151117', transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData = { x, z, y: groundH(x, z), s, t: k / 9, speed: rr(0.025, 0.04) }; scene.add(sp); plumes.push(sp);
    }
  });
}

/* ---------------- the gothic castle, silhouetted against the moon ---------------- */
const castleMat = new THREE.MeshBasicMaterial({ color: '#140a20', fog: false });
const castleGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.35), fog: false });
const castle = new THREE.Group();
if (WORLD) {
  const cz = -175, dz = 15 - cz, topY = 3.2 + Math.tan(THREE.MathUtils.degToRad(14.5)) * dz;
  const baseY = groundH(0, cz) - 6, H = topY - baseY, k = H / 44;
  const add = (geo, x, y, z, m = castleMat) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); castle.add(me); return me; };
  // rocky mount
  add(new THREE.ConeGeometry(20, 16, 9), 0, 8, 0);
  // curtain walls and keep
  add(new THREE.BoxGeometry(22, 6, 3), 0, 17, 4);
  add(new THREE.BoxGeometry(10, 22, 8), 0, 26, -1);
  const tower = (x, z, r, h, roof) => {
    add(new THREE.CylinderGeometry(r, r * 1.08, h, 10), x, 16 + h / 2, z);
    add(new THREE.ConeGeometry(r * 1.25, roof, 10), x, 16 + h + roof / 2, z);
    for (let a = 0; a < 6; a++) add(new THREE.BoxGeometry(0.5, 0.7, 0.5), x + Math.cos(a) * r, 16 + h + 0.2, z + Math.sin(a) * r);
  };
  tower(0, -1, 2.4, 22, 9);                  // central great spire
  tower(-5.5, 1, 1.7, 17, 6.5); tower(5.5, 1, 1.7, 17, 6.5);
  tower(-10, 3, 1.5, 12, 5.5); tower(10, 3, 1.5, 12, 5.5);
  tower(-12, 5, 1.2, 9, 5); tower(12, 5, 1.2, 9, 5);
  tower(-3, -5, 1.2, 25, 6); tower(3.2, -5, 1.1, 20, 5.5);
  // thin needle spires
  [[-7.5, -3, 24], [7.8, -3, 22], [-1.5, 3, 18], [12.5, 0, 15], [-12.5, 0, 16]].forEach(([x, z, h]) => add(new THREE.ConeGeometry(0.55, h, 6), x, 16 + h / 2, z));
  // glowing windows
  [[-1.5, 30], [1.5, 30], [0, 34], [-1.5, 24], [1.5, 24], [-5.5, 27], [5.5, 27], [-10, 22], [10, 22], [0, 40]].forEach(([x, y]) => add(new THREE.PlaneGeometry(0.7, 1.4), x, y, 4.3, castleGlow));
  castle.position.set(0, baseY, cz); castle.scale.setScalar(k);
  scene.add(castle);
  // great shards around the castle hill
  const sg = new THREE.ConeGeometry(1, 1, 4); sg.translate(0, 0.5, 0);
  const shardMat = new THREE.MeshBasicMaterial({ color: '#1c0f2c', fog: false });
  for (let s2 = 0; s2 < 9; s2++) {
    const side = s2 % 2 ? 1 : -1, x = side * rr(26, 110), z = cz + rr(-30, 25), h = rr(16, 48) * (1 - Math.abs(x) / 180);
    const m = new THREE.Mesh(sg, shardMat); m.position.set(x, baseY + rr(-4, 4), z); m.scale.set(h * 0.18, h, h * 0.18); m.rotation.set(rr(-0.15, 0.15), rr(0, 6), side * rr(0.05, 0.35));
    scene.add(m);
  }
}

/* ---------------- crows circling the castle ---------------- */
const crows = [];
if (WORLD) {
  const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0.08, -0.25, 0.35, 0, 0.35], 3));
  const cm = new THREE.MeshBasicMaterial({ color: '#07040a', side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(), L = new THREE.Mesh(wing, cm), R = new THREE.Mesh(wing, cm); R.scale.x = -1; g.add(L, R);
    g.scale.setScalar(rr(1.2, 2)); g.userData = { L, R, a: rand() * 6.28, r: rr(18, 42), y: rr(-6, 14), sp: rr(0.12, 0.25) * (rand() < 0.5 ? -1 : 1), ph: rand() * 6 };
    scene.add(g); crows.push(g);
  }
}

/* ---------------- three lone warriors ---------------- */
const warriors = [];
function makeWarrior(kind) {
  const w = new THREE.Group(), A = MAT.armor, D = MAT.armorDark, add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = !isMobile; w.add(me); return me; };
  add(new THREE.BoxGeometry(0.17, 0.82, 0.2), D, -0.13, 0.41, 0); add(new THREE.BoxGeometry(0.17, 0.82, 0.2), D, 0.13, 0.41, 0);
  add(new THREE.CylinderGeometry(0.3, 0.22, 0.8, 8), A, 0, 1.2, 0);
  add(new THREE.CylinderGeometry(0.25, 0.3, 0.18, 8), D, 0, 0.78, 0);
  const pl = add(new THREE.SphereGeometry(0.19, 10, 8), A, -0.38, 1.52, 0); pl.scale.set(1, 0.72, 1.1);
  const pr = add(new THREE.SphereGeometry(0.19, 10, 8), A, 0.38, 1.52, 0); pr.scale.set(1, 0.72, 1.1);
  add(new THREE.SphereGeometry(0.17, 12, 10), A, 0, 1.78, 0);
  add(new THREE.BoxGeometry(0.2, 0.05, 0.05), D, 0, 1.76, 0.15);
  if (kind === 'horned') { const h1 = add(new THREE.ConeGeometry(0.05, 0.36, 6), MAT.iron, -0.17, 1.96, 0); h1.rotation.z = 0.7; const h2 = add(new THREE.ConeGeometry(0.05, 0.36, 6), MAT.iron, 0.17, 1.96, 0); h2.rotation.z = -0.7; }
  else add(new THREE.ConeGeometry(0.05, 0.32, 4), MAT.iron, 0, 2.02, 0);
  const armL = add(new THREE.CylinderGeometry(0.07, 0.06, 0.72, 6), D, -0.44, 1.15, 0.05); armL.rotation.z = 0.15;
  const armR = add(new THREE.CylinderGeometry(0.07, 0.06, 0.72, 6), D, 0.44, 1.2, 0.12); armR.rotation.set(-0.5, 0, -0.2);
  const cape = add(new THREE.PlaneGeometry(0.7, 1.25).translate(0, -0.62, 0), MAT.cape, 0, 1.62, -0.22); cape.rotation.x = 0.12;
  const weapon = new THREE.Group(); weapon.position.set(0.5, 1.0, 0.3); w.add(weapon);
  if (kind === 'halberd') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.8, 6).translate(0, 0.9, 0), MAT.darkwood);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.02).translate(0.16, 2.1, 0), MAT.iron);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5).translate(0, 2.5, 0), MAT.iron);
    weapon.add(shaft, blade, tip);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.02).translate(0, 0.65, 0), MAT.iron);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), MAT.rust); weapon.add(blade, guard); weapon.rotation.z = -0.35;
    const shield = add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 18), MAT.rust, -0.55, 1.15, 0.2); shield.rotation.set(Math.PI / 2, 0, 0.1);
  }
  weapon.traverse(o => { o.castShadow = !isMobile; });
  w.userData = { cape, weapon, ph: rand() * 6 };
  return w;
}
const horses = [];
function makeHorse() {
  const h = new THREE.Group(), M = new THREE.MeshStandardMaterial({ color: '#1f1a17', roughness: 0.55, metalness: 0.08 });
  const add = (geo, x, y, z, m = M) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = !isMobile; h.add(me); return me; };
  const body = add(new THREE.CapsuleGeometry(0.38, 1.1, 6, 12), 0, 1.25, 0); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.9);
  const neckPivot = new THREE.Group(); neckPivot.position.set(0.7, 1.45, 0); h.add(neckPivot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.27, 0.95, 10), M); neck.position.set(0.18, 0.32, 0); neck.rotation.z = -0.7; neckPivot.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.22), M); head.position.set(0.5, 0.62, 0); head.rotation.z = -0.55; neckPivot.add(head);
  [-0.06, 0.06].forEach(ez => { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), M); ear.position.set(0.32, 0.8, ez); neckPivot.add(ear); });
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: '#0d0a09', roughness: 1 })); mane.position.set(0.05, 0.4, 0); mane.rotation.z = -0.7; neckPivot.add(mane);
  const legs = [[0.55, 0.17], [0.55, -0.17], [-0.55, 0.17], [-0.55, -0.17]].map(([lx, lz]) => { const leg = add(new THREE.CylinderGeometry(0.075, 0.05, 1.05, 6).translate(0, -0.52, 0), lx, 1.08, lz); return leg; });
  const tail = add(new THREE.CylinderGeometry(0.03, 0.09, 0.8, 6).translate(0, -0.4, 0), -0.85, 1.42, 0, new THREE.MeshStandardMaterial({ color: '#0d0a09', roughness: 1 })); tail.rotation.z = -0.5;
  const cloth = add(new THREE.BoxGeometry(1.0, 0.55, 0.86), 0, 1.22, 0, MAT.cape); cloth.scale.set(1, 1, 1);
  return { h, legs, neckPivot, tail };
}
if (WORLD) [[false, 0.35], [true, Math.PI - 0.25], [false, Math.PI + 0.5]].forEach(([banner, rot], i) => {
  const [x, z] = WARRIOR_SPOTS[i], g = new THREE.Group(), horse = makeHorse(); g.add(horse.h);
  const knight = makeWarrior(i === 2 ? 'horned' : 'sword'); knight.scale.setScalar(0.88); knight.position.set(-0.08, 1.02, 0); knight.rotation.y = Math.PI / 2; g.add(knight);
  if (banner) {
    knight.userData.weapon.clear();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 3.4, 6).translate(0, 1.7, 0), MAT.darkwood); knight.userData.weapon.add(pole);
    const geo = new THREE.PlaneGeometry(0.9, 0.6, 10, 6); geo.translate(0.45, -0.3, 0); geo.userData.base = Float32Array.from(geo.attributes.position.array);
    const tex = canvasTex(128, 96, (gg) => { gg.fillStyle = '#2a0c12'; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(128, 0); gg.lineTo(96, 48); gg.lineTo(128, 96); gg.lineTo(0, 96); gg.closePath(); gg.fill(); gg.fillStyle = 'rgba(200,160,90,.6)'; gg.fillRect(0, 10, 100, 4); gg.fillRect(0, 82, 100, 4); });
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 })); flag.position.set(0.03, 3.3, 0); knight.userData.weapon.add(flag);
    tornFlags.push({ geo, ph: rand() * 6 });
  }
  g.position.set(x, groundH(x, z) - 0.05, z); g.rotation.y = rot; g.scale.setScalar(1.15);
  g.traverse(o => { o.castShadow = !isMobile; });
  scene.add(g); warriors.push(knight); horses.push({ ...horse, ph: rand() * 6 });
});

/* ---------------- fire ---------------- */
const flameU = { uTime: { value: 0 } };
const flameMat = (seedV) => new THREE.ShaderMaterial({
  uniforms: { uTime: flameU.uTime, uSeed: { value: seedV } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `${NOISE_GLSL}
  varying vec2 vUv; uniform float uTime; uniform float uSeed;
  void main(){
    vec2 uv = vUv;
    float n = fbm2(vec2(uv.x * 3.0 + uSeed, uv.y * 2.2 - uTime * 2.4));
    float n2 = fbm2(vec2(uv.x * 6.5 - uSeed, uv.y * 4.8 - uTime * 3.9));
    float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 1.1 * uv.y;
    float width = mix(0.72, 0.02, pow(uv.y, 0.7));
    float body = 1.0 - smoothstep(0.0, width, abs(x));
    float f = body * (1.0 - smoothstep(0.08, 0.95, uv.y + (n2 - 0.5) * 0.55)) * smoothstep(0.0, 0.12, uv.y);
    f = smoothstep(0.02, 0.85, f + (n2 - 0.5) * 0.3 * f);
    vec3 col = mix(vec3(0.5, 0.03, 0.0), vec3(1.0, 0.28, 0.02), smoothstep(0.05, 0.45, f));
    col = mix(col, vec3(1.0, 0.62, 0.18), smoothstep(0.55, 0.95, f));
    gl_FragColor = vec4(col * f * 1.7, f);
  }`
});
const glowMat = new THREE.SpriteMaterial({ map: softTex, color: new THREE.Color(1.2, 0.4, 0.1), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.22 });
const fires = [], smokes = [], billboards = [];
function makeFire(x, z, s, withLight) {
  const g = new THREE.Group(); const y = groundH(x, z);
  g.position.set(x, y, z); scene.add(g);
  for (let k = 0; k < 3; k++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 1.1 * s, 6), MAT.ember); log.rotation.set(Math.PI / 2 - 0.25, (k / 3) * Math.PI, 0); log.position.y = 0.08 * s; g.add(log); }
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8).translate(0, 0.9, 0), flameMat(rand() * 50)); fl.scale.set(s * 1.35, s, s); g.add(fl); billboards.push(fl);
  const fl2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8).translate(0, 0.9, 0), flameMat(rand() * 50)); fl2.scale.set(s * 0.95, s * 0.75, s); fl2.position.set(0.3 * s, 0, 0.05); g.add(fl2); billboards.push(fl2);
  const glow = new THREE.Sprite(glowMat); glow.scale.set(2.6 * s, 1.6 * s, 1); glow.position.y = 0.35 * s; g.add(glow);
  let light = null;
  if (withLight) { light = new THREE.PointLight(0xff6a24, 30 * s, 22 * s, 1.7); light.position.y = 0.9 * s; g.add(light); }
  const n = isMobile ? 4 : 7;
  for (let k = 0; k < n; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#3a2a4c', transparent: true, depthWrite: false, opacity: 0 }));
    sp.userData = { base: new THREE.Vector3(x, y + 1.2 * s, z), s, t: k / n, speed: rr(0.05, 0.08) };
    scene.add(sp); smokes.push(sp);
  }
  fires.push({ g, light, base: light ? light.intensity : 0, s, pos: new THREE.Vector3(x, y + 0.6 * s, z), ph: rand() * 10 });
}
if (WORLD) WRECK_FIRES.forEach(f => makeFire(f[0], f[1], f[2], true));
if (WORLD) [[-2, -11, 0.9, false], [1.2, -17, 1.3, false], [-12, -21, 1.6, false], [9.5, -26, 1.8, false],
 [-2, -37, 2.4, false], [20, -44, 2.8, false], [-24, -46, 2.8, false], [4, -55, 3.2, false], [-0.5, -13.5, 0.7, false]]
  .forEach(f => makeFire(f[0], f[1], f[2], f[3]));

if (WORLD) {
  const lavaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: flameU.uTime }, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${NOISE_GLSL}
      varying vec2 vUv; varying vec3 vW; uniform float uTime;
      void main(){
        vec2 p = vW.xz * 0.9;
        float n = fbm2(p + vec2(uTime * 0.25, -uTime * 0.18));
        float n2 = fbm2(p * 2.7 - vec2(uTime * 0.4, uTime * 0.1));
        float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float heat = clamp(n * 0.7 + n2 * 0.5 + edge * 0.55 - 0.35, 0.0, 1.0);
        float crust = smoothstep(0.55, 0.7, fbm2(p * 1.6 + 3.0)) * (1.0 - edge * 0.6);
        vec3 col = mix(vec3(0.45, 0.04, 0.0), vec3(1.6, 0.5, 0.07), heat);
        col = mix(col, vec3(2.4, 1.25, 0.4), smoothstep(0.78, 1.0, heat));
        col = mix(col, vec3(0.05, 0.02, 0.01), crust * 0.8);
        gl_FragColor = vec4(col * (0.85 + 0.15 * sin(uTime * 1.3 + vW.x * 0.3)) * 1.3, 1.0);
      }`
  });
  const heatMat = new THREE.ShaderMaterial({
    uniforms: { uTime: flameU.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${NOISE_GLSL}
      varying vec2 vUv; varying vec3 vW; uniform float uTime;
      void main(){ float n = fbm2(vec2(vW.x * 0.7 + vW.z * 0.4, vUv.y * 2.0 - uTime * 0.8));
        float a = pow(1.0 - vUv.y, 2.2) * (0.45 + 0.55 * n);
        gl_FragColor = vec4(vec3(1.0, 0.36, 0.06) * a * 0.45, a); }`
  });
  let lightBudget = isMobile ? 2 : 5;
  FISSURES.forEach((f, fi) => {
    const P = f.pts, pos = [], uv = [], idx = [], hp = [], huv = [];
    P.forEach((q, i) => {
      const nq = P[Math.min(i + 1, P.length - 1)], pq = P[Math.max(i - 1, 0)];
      const dx = nq.x - pq.x, dz = nq.z - pq.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
      const hw = q.w * 0.42, y = groundH(q.x, q.z) + 0.12;
      pos.push(q.x + nx * hw, y, q.z + nz * hw, q.x - nx * hw, y, q.z - nz * hw); uv.push(i, 0, i, 1);
      const hh = f.d * 0.8 + q.w * 0.6; hp.push(q.x, y, q.z, q.x, y + hh, q.z); huv.push(i, 0, i, 1);
      if (i < P.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      // flames licking up out of the crack, and embers rising from it
      if (i % (isMobile ? 9 : 5) === 2) {
        const g = new THREE.Group(); g.position.set(q.x, y - 0.1, q.z); scene.add(g);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8).translate(0, 0.9, 0), flameMat(rand() * 50)); fl.scale.set(q.w * 1.2, q.w * rr(1.1, 1.9), 1); g.add(fl); billboards.push(fl);
        let light = null;
        if (fi === 0 && lightBudget > 0 && i % 15 === 2) { light = new THREE.PointLight(0xff5a1e, 45, 16, 1.6); light.position.y = 1.2; g.add(light); lightBudget--; }
        fires.push({ g, light, base: light ? light.intensity : 0, s: q.w, pos: new THREE.Vector3(q.x, y + 0.6, q.z), ph: rand() * 10 });
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    scene.add(new THREE.Mesh(g, lavaMat));
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(huv, 2)); hg.setIndex(idx.slice());
    const heat = new THREE.Mesh(hg, heatMat); heat.renderOrder = 2; scene.add(heat);
  });
}

/* ---------------- ground fog ---------------- */
const fogSprites = [];
if (WORLD) for (let k = 0; k < (isMobile ? 7 : 12); k++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#6a5a72', transparent: true, depthWrite: false, opacity: rr(0.05, 0.1) }));
  const x = rr(-30, 30), z = rr(-48, -6); sp.position.set(x, groundH(x, z) + rr(0.8, 2.2), z); sp.scale.set(rr(18, 34), rr(4, 7), 1);
  sp.userData = { vx: rr(0.15, 0.4) * (rand() < 0.5 ? -1 : 1) }; scene.add(sp); fogSprites.push(sp);
}

/* ---------------- embers & spark bursts ---------------- */
const EN = WORLD ? (isMobile ? 380 : 900) : 0;
const eGeo = new THREE.BufferGeometry(), ePos = new Float32Array(EN * 3), eCol = new Float32Array(EN * 3), eState = [];
eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3)); eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.12, map: softTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
embers.frustumCulled = false; scene.add(embers);
function spawnEmber(i, init) {
  const e = eState[i] || (eState[i] = {});
  if (rand() < 0.35) { e.x = rr(-30, 30); e.z = rr(-50, 2); e.y = groundH(e.x, e.z) + (init ? rr(0, 10) : 0.1); }
  else { const f = fires[(Math.pow(rand(), 1.6) * fires.length) | 0]; e.x = f.pos.x + rr(-0.6, 0.6) * f.s; e.y = f.pos.y + (init ? rr(0, 8) : rr(0, 0.6)); e.z = f.pos.z + rr(-0.6, 0.6) * f.s; }
  e.vx = rr(-0.3, 0.7); e.vy = rr(0.7, 2.4); e.vz = rr(-0.3, 0.3); e.life = init ? rand() : 1; e.decay = rr(0.1, 0.28); e.ph = rand() * 10;
  e.violet = rand() < 0.14;
}
for (let i = 0; i < EN; i++) spawnEmber(i, true);

const BN = WORLD ? (isMobile ? 120 : 260) : 0;
const bGeo = new THREE.BufferGeometry(), bPos = new Float32Array(BN * 3), bCol = new Float32Array(BN * 3), bState = [];
bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3)); bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
const bursts = new THREE.Points(bGeo, new THREE.PointsMaterial({ size: 0.09, map: softTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
bursts.frustumCulled = false; scene.add(bursts);
for (let i = 0; i < BN; i++) bState.push({ life: 0 });
const burstLight = new THREE.PointLight(0xff8a3a, 0, 9, 1.6); scene.add(burstLight);
let nextBurst = 2.5;
function sparkBurst(x, z) {
  const y = groundH(x, z) + 0.15; let n = 0;
  for (const b of bState) {
    if (b.life > 0) continue;
    const a = rand() * Math.PI * 2, up = rr(2, 5), out = rr(0.5, 2);
    Object.assign(b, { x, y, z, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out, life: 1, decay: rr(0.8, 1.6) });
    if (++n > 25) break;
  }
  burstLight.position.set(x, y + 0.6, z); burstLight.intensity = 25;
}

/* ---------------- flaming arrow volleys ---------------- */
const AN = 22;
const arrowGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.1, 4); arrowGeo.rotateZ(-Math.PI / 2);
const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#0c0708' }), AN);
const trailMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; void main(){ float a = pow(vUv.x, 2.2) * (1.0 - abs(vUv.y - 0.5) * 2.0);
    vec3 c = mix(vec3(0.9,0.15,0.0), vec3(1.0,0.75,0.35), pow(vUv.x, 4.0)); gl_FragColor = vec4(c * a * 2.4, a); }`
});
const trails = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 0.12).translate(-0.6, 0, 0), trailMat, AN);
arrows.frustumCulled = trails.frustumCulled = false; scene.add(arrows, trails);
const arrowState = []; const X_AXIS = new THREE.Vector3(1, 0, 0), tmpV = new THREE.Vector3();
for (let i = 0; i < AN; i++) { arrowState.push({ on: false }); dummy.scale.setScalar(0); dummy.updateMatrix(); arrows.setMatrixAt(i, dummy.matrix); trails.setMatrixAt(i, dummy.matrix); }
function volley() {
  const dir = rand() < 0.5 ? 1 : -1;
  arrowState.forEach((a, i) => {
    Object.assign(a, { on: true, stuck: 0, x: -dir * rr(34, 46) - dir * i * 0.6, y: rr(1, 4), z: rr(-34, -10), vx: dir * rr(24, 29), vy: rr(15, 19), vz: rr(-1, 1), delay: i * 0.04, fire: rand() < 0.6 });
  });
}

/* ---------------- war banners ---------------- */
// Hanging war standards: heavy cloth on a crossbar atop a spear, fixed at the top and billowing in the wind.
const logoImgs = {};
const banners = {};
const BW = 0.6;          // banner width relative to its height (the trimmed crest's proportions)
const ATTACH = 0.13;     // the crossbar sits at the shield's shoulders; the peak rises above it
const BANNER = {
  leader: { amp: 0.11, k: 5.4, sp: 4.4, lift: 0.26 },
  mid:    { amp: 0.06, k: 5.0, sp: 2.8, lift: 0.1 },
  last:   { amp: 0.035, k: 4.4, sp: 1.9, lift: 0.03 }
};
// deep, battle-worn house colours: [top, bottom, embroidery]
const WAR = {
  Vikings:    ['#8e6c16', '#4a3507', '#d6b25a'],
  Samurai:    ['#1e3a74', '#0b1834', '#c9a24f'],
  Gladiators: ['#1f5433', '#0a2715', '#c9a24f'],
  Knights:    ['#7e1621', '#3a060c', '#c9a24f']
};
function prng(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function drawFlag(cv, name, kind) {
  // The house crest itself is the banner: a shield-shaped cloth, with weave, grime and (for last place) tears.
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, torn = kind === 'tattered';
  const r = prng(name.length * 991 + (torn ? 7 : 3));
  g.clearRect(0, 0, W, H);
  const img = logoImgs[name];
  if (!(img && img.complete && img.naturalWidth)) return;
  { const a = img.naturalWidth / img.naturalHeight, dw = Math.min(W, H * a); g.drawImage(img, (W - dw) / 2, 0, dw, H); }
  // fabric, only on the crest itself
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.06; g.fillStyle = '#000'; for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1); for (let x = 0; x < W; x += 3) g.fillRect(x, 0, 1, H); g.globalAlpha = 1;
  for (let i = 0; i < 7000; i++) { g.fillStyle = r() < 0.6 ? 'rgba(0,0,0,.08)' : 'rgba(255,240,215,.04)'; g.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1); }
  for (let i = 0; i < (torn ? 26 : 10); i++) {
    const x = r() * W, y = H * (0.3 + r() * 0.7), rad = W * (0.05 + r() * 0.18), rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, 'rgba(12,7,4,' + (0.1 + r() * 0.2) + ')'); rg.addColorStop(1, 'rgba(12,7,4,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const hl = g.createLinearGradient(0, 0, 0, H); hl.addColorStop(0, 'rgba(255,240,215,.08)'); hl.addColorStop(0.5, 'rgba(0,0,0,0)'); hl.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = hl; g.fillRect(0, 0, W, H);
  if (torn) { const eg = g.createLinearGradient(0, H * 0.45, 0, H); eg.addColorStop(0, 'rgba(10,4,2,0)'); eg.addColorStop(1, 'rgba(10,4,2,.75)'); g.fillStyle = eg; g.fillRect(0, 0, W, H); }
  g.globalCompositeOperation = 'source-over';
  if (torn) { // ripped lower edge, holes and a long tear
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) { const x = W * (0.08 + r() * 0.84), w = W * (0.02 + r() * 0.05); g.beginPath(); g.moveTo(x - w, H); g.lineTo(x + (r() - 0.5) * w, H * (0.7 + r() * 0.2)); g.lineTo(x + w, H); g.closePath(); g.fill(); }
    for (let i = 0; i < 7; i++) { const x = W * (0.2 + r() * 0.6), y = H * (0.2 + r() * 0.55), s2 = W * (0.02 + r() * 0.045); g.beginPath(); for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, q = s2 * (0.45 + r() * 0.8); g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }
    g.beginPath(); g.moveTo(W * 0.62, H); g.lineTo(W * 0.56, H * 0.5); g.lineTo(W * 0.53, H * 0.52); g.lineTo(W * 0.57, H); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
}
function flagMaterial(name, kind) {
  const cv = document.createElement('canvas'); cv.width = 360; cv.height = 600; drawFlag(cv, name, kind);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sheen = new THREE.Color((WAR[name] || ['#888'])[0]).lerp(new THREE.Color('#ffffff'), 0.35);
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.32 });
  m.userData = { cv, tex, name, kind };
  return m;
}
// warm light rising from the fissures onto the banners (painted backdrop mode)
if (!WORLD) { const up = new THREE.DirectionalLight(0xff8a44, 0.9); up.position.set(0, -4, 8); scene.add(up); }
const leaderSpot = new THREE.SpotLight(0xffd29a, 0, 40, 0.22, 0.8, 0);
scene.add(leaderSpot, leaderSpot.target);
// Reflections so polished metal reads as metal: purple sky above, fire glow below (matches the battlefield).
{
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#1b1230'); gr.addColorStop(0.3, '#5b4a8c'); gr.addColorStop(0.47, '#d9c8f0'); gr.addColorStop(0.53, '#6a4a5a'); gr.addColorStop(0.7, '#3a1a10'); gr.addColorStop(1, '#120806');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 6; i++) { const x = Math.random() * 512, rg = g.createRadialGradient(x, 205, 0, x, 205, 60); rg.addColorStop(0, 'rgba(255,120,40,.85)'); rg.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = rg; g.fillRect(0, 140, 512, 116); }
  const sun = g.createRadialGradient(380, 70, 0, 380, 70, 50); sun.addColorStop(0, 'rgba(255,250,255,1)'); sun.addColorStop(1, 'rgba(255,250,255,0)'); g.fillStyle = sun; g.fillRect(300, 0, 160, 140);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(t).texture; pm.dispose();
}
// Each place gets its own metal for the spearhead, collar, bands and crossbar.
const METAL = {
  gold:   new THREE.MeshStandardMaterial({ color: '#e0b04c', metalness: 1, roughness: 0.26, envMapIntensity: 1.4 }),
  silver: new THREE.MeshStandardMaterial({ color: '#d9dce2', metalness: 1, roughness: 0.22, envMapIntensity: 1.4 }),
  bronze: new THREE.MeshStandardMaterial({ color: '#c07a3e', metalness: 1, roughness: 0.32, envMapIntensity: 1.3 }),
  iron:   new THREE.MeshStandardMaterial({ color: '#2c2624', metalness: 0.85, roughness: 0.6, envMapIntensity: 0.7, emissive: '#7a1e06', emissiveIntensity: 0.55 })   // blackened, fire-scorched iron
};
const shaftMat = new THREE.MeshStandardMaterial({ color: '#2e2119', roughness: 0.88, metalness: 0, envMapIntensity: 0.3 });
// leaf-shaped spearhead with a raised midrib
const bladeGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(0.075, 0.06, 0.07, 0.2, 0, 0.5); sh.bezierCurveTo(-0.07, 0.2, -0.075, 0.06, 0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -0.004); g.computeVertexNormals(); return g;
})();
const ribGeo = new THREE.CylinderGeometry(0.006, 0.012, 0.42, 6).translate(0, 0.25, 0);
const collarGeo = new THREE.CylinderGeometry(0.034, 0.046, 0.16, 14).translate(0, 0.08, 0);
const ringGeo = new THREE.TorusGeometry(0.044, 0.01, 8, 18);
const finialGeo = (() => { const g = new THREE.ConeGeometry(0.026, 0.11, 10); g.rotateZ(-Math.PI / 2); g.translate(0.055, 0, 0); return g; })();
const knobGeo = new THREE.SphereGeometry(0.03, 12, 10);
// where each pole is planted: a mound of dirt and stones with a contact shadow
const moundMat = new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 1, flatShading: true, envMapIntensity: 0.25 });
const stoneGeo = (() => { const g = new THREE.DodecahedronGeometry(1, 0); return g; })();
const shadowTex = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.85)'); r.addColorStop(0.6, 'rgba(0,0,0,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, false);
function makeMound() {
  const m = new THREE.Group();
  const heap = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), moundMat); heap.scale.set(0.2, 0.07, 0.13); m.add(heap);
  for (let i = 0; i < 7; i++) { const st = new THREE.Mesh(stoneGeo, moundMat); const a = (i / 7) * Math.PI * 2 + rand(); st.position.set(Math.cos(a) * rr(0.08, 0.2), 0.02, Math.sin(a) * rr(0.05, 0.12)); st.scale.setScalar(rr(0.025, 0.055)); st.rotation.set(rand() * 3, rand() * 3, rand() * 3); m.add(st); }
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.004; sh.scale.set(0.75, 0.42, 1); m.add(sh);
  return m;
}
function makeBanner(name) {
  const g = new THREE.Group(), M = METAL.iron;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 10).translate(0, 0.5, 0), shaftMat);
  const head = new THREE.Group();                                   // spearhead assembly, sits on top of the shaft
  const blade = new THREE.Mesh(bladeGeo, M); blade.position.y = 0.15;
  const rib = new THREE.Mesh(ribGeo, M); rib.position.y = 0.15;
  const collar = new THREE.Mesh(collarGeo, M);
  const ring = new THREE.Mesh(ringGeo, M); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02;
  head.add(blade, rib, collar, ring);
  const bands = [0, 1].map(() => { const r = new THREE.Mesh(ringGeo, M); r.rotation.x = Math.PI / 2; return r; });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1, 10), M); bar.rotation.z = Math.PI / 2;
  const finL = new THREE.Mesh(finialGeo, M), finR = new THREE.Mesh(finialGeo, M); finL.rotation.y = Math.PI;
  const knobL = new THREE.Mesh(knobGeo, M), knobR = new THREE.Mesh(knobGeo, M);
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#3a2d22', roughness: 1 });
  const ties = [-0.4, 0, 0.4].map(() => new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.009, 6, 12), ropeMat));
  const geo = new THREE.PlaneGeometry(BW, 1, 14, 30); geo.translate(0, -0.5, 0);
  geo.userData.base = Float32Array.from(geo.attributes.position.array);
  const flag = new THREE.Mesh(geo, flagMaterial(name, 'clean')); flag.position.z = 0.075;   // just in front of the spear and crossbar, close enough that perspective keeps it centred
  if (!isMobile && WORLD) { flag.castShadow = true; flag.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: flag.material.map, alphaTest: 0.5 }); }
  const mound = makeMound();
  g.add(pole, head, ...bands, bar, finL, finR, knobL, knobR, flag, ...ties, mound); scene.add(g);
  const metalParts = [blade, rib, collar, ring, ...bands, bar, finL, finR, knobL, knobR];
  const b = { name, g, mound, pole, head, bands, bar, finL, finR, knobL, knobR, ties, flag, metalParts, medal: 'iron', x: 0, tx: 0, h: 0.1, th: 1, z: 0, w: 1, kind: 'clean', p: { ...BANNER.mid }, tp: BANNER.mid, ph: rand() * 6, role: 'mid', rank: 4 };
  banners[name] = b; return b;
}
Object.keys(CFG.HOUSES).forEach(name => {
  const img = new Image(); img.src = CFG.HOUSES[name].logo.replace(/\.png$/, '-flag.png'); logoImgs[name] = img;
  img.onload = () => { const b = banners[name]; if (b) { drawFlag(b.flag.material.userData.cv, name, b.kind); b.flag.material.map.needsUpdate = true; } };
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const n in banners) { const b = banners[n]; drawFlag(b.flag.material.userData.cv, n, b.kind); b.flag.material.map.needsUpdate = true; } });

/* ---------------- layout: align the 3D field with the page ---------------- */
const L = { W: 1, H: 1, off: 0, cols: [0, 0, 0, 0], z: 0, flagW: 1, maxTop: 6, camY: 3.2, camZ: 15, look: new THREE.Vector3(0, 2.6, 0) };
const raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function rayAt(px, py, plane) {
  raycaster.setFromCamera(new THREE.Vector2((px / L.W) * 2 - 1, -(py / L.H) * 2 + 1), camera);
  return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}
function plaqueH() { return parseFloat(getComputedStyle(root).getPropertyValue('--plaque')) || 118; }
let state = null;
function layout() {
  L.W = hero.clientWidth; L.H = hero.clientHeight;
  renderer.setSize(L.W, L.H, false); composer.setSize(L.W, L.H);
  const aspect = L.W / L.H;
  camera.fov = aspect < 0.8 ? 52 : aspect < 1.2 ? 44 : 38;
  camera.aspect = aspect;
  L.camY = aspect < 0.8 ? 3.8 : 3.2;
  camera.clearViewOffset(); camera.position.set(0, L.camY, L.camZ); camera.lookAt(L.look); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const baseY = L.H - plaqueH() - 2;
  const v = new THREE.Vector3(0, 0, 0).project(camera), py = ((1 - v.y) / 2) * L.H;
  L.off = py - baseY;
  camera.setViewOffset(L.W, L.H, 0, L.off, L.W, L.H); camera.updateProjectionMatrix();
  for (let i = 0; i < 4; i++) { const h = rayAt(((i + 0.5) / 4) * L.W, baseY, groundPlane); L.cols[i] = h ? h.x : (i - 1.5) * 3; if (h) L.z = h.z; }
  const a = rayAt(L.W / 2, baseY, groundPlane), b = rayAt(L.W / 2 + 100, baseY, groundPlane);
  const wpp = a && b ? (b.x - a.x) / 100 : 0.01;
  const small = L.W < 640;
  L.flagW = Math.min((L.W / 4) * (small ? 0.64 : 0.42), L.W > 1500 ? 280 : 210) * wpp / BW;   // banner height (world)
  const hr = hero.getBoundingClientRect(), hb = headEl.getBoundingClientRect().bottom - hr.top;
  const vplane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -L.z);
  const t = rayAt(L.W / 2, Math.min(hb + (small ? 40 : 46), baseY - 140), vplane);
  L.maxTop = t ? Math.max(t.y, L.flagW * 1.5) : 6;
  updateTargets();
}

function applyState(s) {
  state = s;
  s.standings.forEach(st => { if (!banners[st.house]) makeBanner(st.house); });
  updateTargets();
}
function updateTargets() {
  if (!state) return;
  const s = state, bh = L.flagW;
  const leadTotal = s.lead.total, soleLead = s.second ? s.lead.total > s.second.total : true;
  const STEP = [1, 0.68, 0.38, 0.1];          // first flies highest, then second, third, fourth
  s.standings.forEach((st, i) => {
    const b = banners[st.house]; if (!b) return;
    const isLead = i === 0 && soleLead && st.total > 0;
    const isLast = i === s.standings.length - 1 && st.total < leadTotal && s.fought.length > 0;
    b.role = isLead ? 'leader' : isLast ? 'last' : 'mid'; b.tp = BANNER[b.role]; b.rank = st.rank;
    b.tx = L.cols[i]; b.z = L.z; b.w = bh;
    const minH = bh * 0.96 + 0.02, maxH = Math.max(minH + 1.0, L.maxTop - bh * 0.0);
    b.th = minH + (maxH - minH) * (s.fought.length ? STEP[Math.min(i, 3)] : 0.7);
    const medal = s.fought.length ? (['gold', 'silver', 'bronze'][st.rank - 1] || 'iron') : 'iron';
    if (medal !== b.medal) { b.medal = medal; b.metalParts.forEach(m => { m.material = METAL[medal]; }); }
    const kind = isLast ? 'tattered' : 'clean';
    if (kind !== b.kind) { b.kind = kind; drawFlag(b.flag.material.userData.cv, b.name, kind); b.flag.material.map.needsUpdate = true; }
    b.flag.material.emissiveIntensity = (isLead ? 0.3 : 0.2) + (WORLD ? 0 : 0.12);
    if (b.x === 0 && b.h === 0.1) { b.x = b.tx; }
  });
}

/* ---------------- composer ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.65, 0.55, 0.84);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------------- interaction ---------------- */
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', e => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; });
let flash = 0, shake = 0;
addEventListener('forge:lightning', () => { flash = 1; });
addEventListener('forge:leadchange', () => { shake = 1; flash = Math.max(flash, 0.6); });
addEventListener('forge:state', e => applyState(e.detail));
let rzT; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(layout, 120); });
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(hero);

/* ---------------- loop ---------------- */
const clock = new THREE.Clock();
let t = 0, frames = 0, slowAcc = 0, quality = 2, nextVolley = 25, ready = false, intro = REDUCED ? 1 : 0;
const tmpCol = new THREE.Color(), projV = new THREE.Vector3();
function updateBanner(b, dt) {
  const k = 1 - Math.exp(-dt * 2.2);
  b.x += (b.tx - b.x) * k; b.h += (b.th - b.h) * (1 - Math.exp(-dt * 1.6));
  for (const key of ['amp', 'k', 'sp', 'lift']) b.p[key] += (b.tp[key] - b.p[key]) * (1 - Math.exp(-dt * 1.2));
  const s = b.w, top = b.h - s * 0.02, barY = top - s * ATTACH;
  // painted backdrop: every pole stands on the same ground line; 3D world: follow the terrain
  b.g.position.set(b.x, WORLD ? groundH(b.x, b.z) - 0.15 : 0, b.z);
  b.mound.scale.setScalar(Math.max(0.9, s * 0.55));
  const hs = Math.max(0.8, s * 0.55);                              // fittings scale with the banner
  b.pole.scale.y = b.h; b.head.position.y = b.h; b.head.scale.setScalar(hs);
  b.bands[0].position.y = b.h - 0.05 * hs; b.bands[1].position.y = barY - 0.09 * hs; b.bands.forEach(r => r.scale.setScalar(hs * 0.9));
  const half = s * BW * 0.53;
  b.bar.scale.set(hs, half * 2, hs); b.bar.position.set(0, barY, 0.035);
  b.knobL.position.set(-half, barY, 0.035); b.knobR.position.set(half, barY, 0.035); b.knobL.scale.setScalar(hs); b.knobR.scale.setScalar(hs);
  b.finL.position.set(-half, barY, 0.035); b.finR.position.set(half, barY, 0.035); b.finL.scale.setScalar(hs); b.finR.scale.setScalar(hs);
  b.ties.forEach((tie, i) => { tie.position.set((i - 1) * s * BW * 0.4, barY, 0.05); tie.scale.setScalar(s * 0.9); });
  b.flag.position.y = top; b.flag.scale.setScalar(s);
  const geo = b.flag.geometry, base = geo.userData.base, pos = geo.attributes.position.array, P = b.p, tt = t + b.ph;
  const sway = Math.sin(tt * 0.9) * 0.03 + Math.sin(tt * 2.3) * 0.012 * (P.amp / 0.06);
  for (let i = 0; i < pos.length; i += 3) {
    const x0 = base[i], y0 = base[i + 1], v = Math.max(0, (-y0 - ATTACH) / (1 - ATTACH));   // 0 at the crossbar, 1 at the tip
    const ph = v * P.k - tt * P.sp + x0 * 2.4;
    const ripple = (Math.sin(ph) + Math.sin(ph * 1.7 + 1.1 + x0 * 5) * 0.35) * P.amp * v;
    pos[i] = x0 * (1 - 0.06 * Math.abs(Math.sin(ph)) * v) + sway * v * v;
    pos[i + 1] = y0 * (1 - P.lift * 0.22 * v);                 // wind lifts the cloth a little
    pos[i + 2] = ripple + P.amp * 1.4 * v + P.lift * 0.55 * v * v;   // waves forward only, never folding back through the spear
  }
  geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
}
function frame() {
  requestAnimationFrame(frame);
  if (!visible) { clock.getDelta(); return; }
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), slowDt = Math.min(raw, 0.5); t += dt;
  // slowDt keeps the intro and banner movement on real time, so slow devices still settle quickly
  skyU.uTime.value = t; flameU.uTime.value = t;
  flash = Math.max(0, flash - dt * 1.4); shake = Math.max(0, shake - dt * 0.9);
  skyU.uFlash.value = flash > 0.5 ? flash : flash * (0.5 + 0.5 * Math.sin(t * 60));
  hemi.intensity = 0.7 + flash * 2.2;
  groundGlowU.value = 1.5 + 0.3 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 3.7);

  // camera: intro glide, breathing, parallax, shake
  intro = Math.min(1, intro + slowDt / 4); const ie = 1 - Math.pow(1 - intro, 3);
  root.classList.toggle('intro3d', intro < 0.85);
  mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;
  const sx = shake ? (Math.random() - 0.5) * shake * 0.35 : 0, sy = shake ? (Math.random() - 0.5) * shake * 0.25 : 0;
  camera.position.set(mouse.x * 0.7 + Math.sin(t * 0.13) * 0.25 + sx, L.camY + (1 - ie) * 6 - mouse.y * 0.25 + Math.sin(t * 0.21) * 0.08 + sy, L.camZ + (1 - ie) * 16);
  camera.lookAt(L.look.x + mouse.x * 0.25, L.look.y + (1 - ie) * 2.5, L.look.z);
  sky.position.copy(camera.position);

  // banners + plaques
  let leader = null;
  for (const name in banners) { const b = banners[name]; updateBanner(b, slowDt); if (b.role === 'leader') leader = b; }
  for (const name in banners) {
    const b = banners[name], el = document.getElementById('bn-' + name); if (!el) continue;
    projV.set(b.x, 0, b.z).project(camera);
    el.style.transform = 'translateX(' + (((projV.x + 1) / 2) * L.W - L.W / 8).toFixed(1) + 'px)';
  }
  if (leader) {
    const topY = leader.g.position.y + leader.h;
    leaderSpot.intensity = 1.6; leaderSpot.position.set(leader.x + 1.5, topY + 8, leader.z + 6); leaderSpot.target.position.set(leader.x, topY - leader.w * 0.5, leader.z);
  } else leaderSpot.intensity = 0;

  // warriors breathe, capes stir in the wind
  for (const hs of horses) { hs.neckPivot.rotation.z = Math.sin(t * 0.9 + hs.ph) * 0.06 - 0.02; hs.tail.rotation.x = Math.sin(t * 1.7 + hs.ph) * 0.15; hs.legs[0].rotation.z = Math.max(0, Math.sin(t * 0.5 + hs.ph)) * 0.25; }
  for (const w of warriors) { const u = w.userData; u.cape.rotation.x = 0.12 + Math.sin(t * 1.6 + u.ph) * 0.08; u.weapon.rotation.x = Math.sin(t * 0.8 + u.ph) * 0.03; w.position.y += Math.sin(t * 1.2 + u.ph) * 0.0006; }
  // crows circle the castle
  for (const c of crows) {
    const u = c.userData; u.a += dt * u.sp;
    c.position.set(Math.cos(u.a) * u.r, castle.position.y + 48 * castle.scale.y + u.y + Math.sin(t * 0.7 + u.ph) * 2, castle.position.z + Math.sin(u.a) * u.r * 0.5);
    c.rotation.y = -u.a + (u.sp > 0 ? 0 : Math.PI);
    const f = Math.sin(t * 9 + u.ph) * 0.6; u.L.rotation.z = f; u.R.rotation.z = -f;
  }

  // fires
  for (const f of fires) if (f.light) f.light.intensity = f.base * (0.75 + 0.18 * Math.sin(t * 9 + f.ph) + 0.12 * Math.sin(t * 23 + f.ph * 2) + 0.08 * Math.random());
  for (const b of billboards) { const wp = b.parent.position; b.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z); }
  for (const sp of smokes) {
    const u = sp.userData; u.t += dt * u.speed; if (u.t > 1) u.t -= 1;
    sp.position.set(u.base.x + u.t * 3 * u.s + Math.sin(u.t * 6 + u.s) * 0.4, u.base.y + u.t * 9 * u.s, u.base.z - u.t * u.s);
    const sc = u.s * (1.2 + u.t * 5); sp.scale.set(sc, sc, 1); sp.material.opacity = Math.sin(u.t * Math.PI) * 0.4;
  }
  for (const tf of tornFlags) {
    const pos = tf.geo.attributes.position.array, base = tf.geo.userData.base;
    for (let i = 0; i < pos.length; i += 3) { const x0 = base[i], y0 = base[i + 1], u = x0 / 0.9; pos[i + 2] = Math.sin(x0 * 6 - t * 2.4 + tf.ph) * 0.05 * u; pos[i + 1] = y0 - u * u * 0.12; }
    tf.geo.attributes.position.needsUpdate = true; tf.geo.computeVertexNormals();
  }
  for (const ce of craterEmbers) ce.m.material.opacity = 0.55 + 0.25 * Math.sin(t * 1.3 + ce.ph) + 0.1 * Math.sin(t * 4.1 + ce.ph * 2);
  for (const sp of plumes) {
    const u = sp.userData; u.t += dt * u.speed; if (u.t > 1) u.t -= 1;
    sp.position.set(u.x + u.t * 9 * u.s + Math.sin(u.t * 5 + u.s) * 0.6, u.y + 0.5 + u.t * 24 * u.s, u.z - u.t * 3);
    const sc = u.s * (1.6 + u.t * 9); sp.scale.set(sc, sc, 1); sp.material.opacity = Math.sin(u.t * Math.PI) * 0.55;
  }
  for (const fs of fogSprites) { fs.position.x += fs.userData.vx * dt; if (fs.position.x > 40) fs.position.x = -40; if (fs.position.x < -40) fs.position.x = 40; }

  // embers
  for (let i = 0; i < EN; i++) {
    const e = eState[i];
    e.life -= dt * e.decay; if (e.life <= 0 || e.y > 26) { spawnEmber(i, false); continue; }
    e.vx += Math.sin(t * 1.3 + e.ph) * dt * 0.6; e.x += (e.vx + 0.35) * dt; e.y += e.vy * dt; e.z += e.vz * dt;
    ePos[i * 3] = e.x; ePos[i * 3 + 1] = e.y; ePos[i * 3 + 2] = e.z;
    const fl = e.life * (0.6 + 0.4 * Math.sin(t * 14 + e.ph * 7));
    if (e.violet) tmpCol.setRGB(1.1 * fl, 0.55 * fl, 2.4 * fl); else tmpCol.setRGB(2.7 * fl, 0.75 * fl, 0.18 * fl);
    eCol[i * 3] = tmpCol.r; eCol[i * 3 + 1] = tmpCol.g; eCol[i * 3 + 2] = tmpCol.b;
  }
  eGeo.attributes.position.needsUpdate = eGeo.attributes.color.needsUpdate = true;

  // spark bursts (impacts on the field)
  nextBurst -= dt;
  if (nextBurst <= 0 && !REDUCED && fires.length) { const f = fires[(rand() * Math.min(fires.length, 6)) | 0]; sparkBurst(f.pos.x, f.pos.z); nextBurst = rr(4, 9); }
  burstLight.intensity = Math.max(0, burstLight.intensity - dt * 140);
  for (let i = 0; i < BN; i++) {
    const b = bState[i];
    if (b.life > 0) {
      b.life -= dt * b.decay; b.vy -= 9 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const f = Math.max(0, b.life) * 2.2; bCol[i * 3] = 2.6 * f; bCol[i * 3 + 1] = 1.3 * f; bCol[i * 3 + 2] = 0.45 * f;
    } else { bCol[i * 3] = bCol[i * 3 + 1] = bCol[i * 3 + 2] = 0; }
    bPos[i * 3] = b.x || 0; bPos[i * 3 + 1] = b.y || -50; bPos[i * 3 + 2] = b.z || 0;
  }
  bGeo.attributes.position.needsUpdate = bGeo.attributes.color.needsUpdate = true;

  // flaming arrows
  nextVolley -= dt; if (nextVolley <= 0 && !REDUCED) { volley(); nextVolley = rr(35, 60); }
  for (let i = 0; i < AN; i++) {
    const a = arrowState[i]; if (!a.on) continue;
    if (a.delay > 0) { a.delay -= dt; continue; }
    if (!a.stuck) {
      a.vy -= 13 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      const gy = groundH(a.x, a.z); if (a.y < gy + 0.3 && a.vy < 0) { a.stuck = WORLD ? 4 : 0.01; a.y = gy + 0.3; if (a.fire && rand() < 0.25 && Math.abs(a.x) < 12) sparkBurst(a.x, a.z); }
      tmpV.set(a.vx, a.vy, a.vz).normalize(); a.q = (a.q || new THREE.Quaternion()).setFromUnitVectors(X_AXIS, tmpV);
    } else { a.stuck -= dt; if (a.stuck <= 0) a.on = false; }
    dummy.position.set(a.x, a.y, a.z); dummy.quaternion.copy(a.q); dummy.scale.setScalar(a.on ? 1 : 0); dummy.updateMatrix(); arrows.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(a.on && a.fire && !a.stuck ? 1 : 0); dummy.updateMatrix(); trails.setMatrixAt(i, dummy.matrix);
  }
  arrows.instanceMatrix.needsUpdate = trails.instanceMatrix.needsUpdate = true;

  camera.updateMatrixWorld();
  if (WORLD) composer.render(dt); else renderer.render(scene, camera);
  if (!ready) { ready = true; holder.classList.add('ready'); }

  // adaptive quality for slower devices
  frames++;
  if (frames > 40 && frames < 400) {
    slowAcc = slowAcc * 0.95 + (dt > 0.034 ? 1 : 0) * 0.05;
    if (slowAcc > 0.6 && quality > 0) {
      quality--; slowAcc = 0;
      if (quality === 1) { pixelRatio = 1; renderer.setPixelRatio(1); layout(); }
      if (quality === 0) { bloom.enabled = false; renderer.shadowMap.enabled = false; }
    }
  }
}

layout();
if (window.FORGE_STATE) applyState(window.FORGE_STATE);
requestAnimationFrame(frame);
