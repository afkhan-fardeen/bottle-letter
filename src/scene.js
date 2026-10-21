import * as THREE from 'three';
import { currentHour } from './time.js';

const PAPER = 0xfaf7f2;
const MOODS = {
  default:  { deep: '#5E9A9E', shallow: '#BCD8D5', speed: 1 },
  Calm:     { deep: '#5E9A9E', shallow: '#BCD8D5', speed: 0.8 },
  Heavy:    { deep: '#56707A', shallow: '#A9BCC2', speed: 0.6 },
  Grateful: { deep: '#6BA38F', shallow: '#C6DFCF', speed: 0.9 },
  Tired:    { deep: '#7F93A0', shallow: '#C9D2D6', speed: 0.5 },
  Anxious:  { deep: '#5F8E9B', shallow: '#B4D0D8', speed: 1.7 },
  Hopeful:  { deep: '#78A9A0', shallow: '#EBDDB8', speed: 1 },
  Angry:    { deep: '#587F86', shallow: '#B7C9C8', speed: 2.1 },
  Lonely:   { deep: '#6A8799', shallow: '#BBC8D3', speed: 0.7 },
};

// Scenery by local time. Each key is the look at that hour; hours in between are blended.
const NIGHT = { top: '#15295A', hor: '#304575', deep: '#2C4660', shallow: '#4E6E88', sunEl: -10, sunI: 0, stars: 1, sun: '#FFE0B0' };
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 5, ...NIGHT },
  { h: 6, top: '#C3CCE6', hor: '#F5C2A4', deep: '#6F93A0', shallow: '#EBC9B5', sunEl: 2, sunI: 1, stars: 0, sun: '#FFC48A' },
  { h: 8, top: '#A9CBE6', hor: '#FBEBD6', deep: '#5E9CA6', shallow: '#C5E0DC', sunEl: 20, sunI: 1, stars: 0, sun: '#FFE8B8' },
  { h: 13, top: '#8EC1E8', hor: '#E6F1F3', deep: '#4F93A3', shallow: '#BFE3E3', sunEl: 33, sunI: 1, stars: 0, sun: '#FFF4D6' },
  { h: 17, top: '#9DBEDF', hor: '#F6E3C6', deep: '#5D96A0', shallow: '#CFE0D6', sunEl: 20, sunI: 1, stars: 0, sun: '#FFD9A0' },
  { h: 18.5, top: '#D6C8E0', hor: '#F7B98F', deep: '#627E9A', shallow: '#E8B9A2', sunEl: 3, sunI: 1, stars: 0, sun: '#FF9D5C' },
  { h: 19.5, top: '#3E4A7A', hor: '#C98AA0', deep: '#3A5470', shallow: '#7C7C9A', sunEl: -2, sunI: 0.4, stars: 0.45, sun: '#FF8A5C' },
  { h: 21, ...NIGHT },
  { h: 24, ...NIGHT },
].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), deep: new THREE.Color(k.deep), shallow: new THREE.Color(k.shallow), sun: new THREE.Color(k.sun) }));

function look(hour) {
  let i = KEYS.findIndex((k, n) => hour >= k.h && hour < KEYS[n + 1].h);
  if (i < 0) i = KEYS.length - 2;
  const a = KEYS[i], b = KEYS[i + 1];
  let f = (hour - a.h) / (b.h - a.h);
  f = f * f * (3 - 2 * f);
  const mixC = (k) => a[k].clone().lerp(b[k], f);
  const mixN = (k) => a[k] + (b[k] - a[k]) * f;
  return { top: mixC('top'), hor: mixC('hor'), deep: mixC('deep'), shallow: mixC('shallow'), sun: mixC('sun'),
    sunEl: mixN('sunEl'), sunI: mixN('sunI'), stars: mixN('stars') };
}

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uMoonDir;
  uniform float uSunI; uniform float uStars; uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.6, pow(h, 0.7)));
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(s, 6.0) * 0.3 + pow(s, 1500.0) * 1.2) * uSunI;
    vec2 cuv = d.xz / (h + 0.18) * 0.9 + vec2(uTime * 0.012, 0.0);
    float cm = smoothstep(0.52, 0.82, fbm(cuv * 1.6)) * smoothstep(0.02, 0.22, d.y) * 0.6;
    vec3 cloud = mix(uHor, vec3(1.0), 0.55 * (1.0 - uStars));
    col = mix(col, cloud, cm);
    vec2 suv = vec2(atan(d.x, -d.z), asin(clamp(d.y, 0.0, 1.0))) * 70.0;
    vec2 sid = floor(suv);
    vec2 sf = fract(suv) - 0.5 - (vec2(hash(sid + 3.1), hash(sid + 7.7)) - 0.5) * 0.6;
    float star = step(0.93, hash(sid)) * smoothstep(0.12, 0.0, length(sf)) * (0.4 + 0.6 * hash(sid + 1.3))
               * smoothstep(0.03, 0.25, d.y) * (1.0 - cm);
    col += vec3(star) * uStars;
    float m = dot(d, uMoonDir);
    col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(0.99965, 0.99968, m) * uStars);
    col += vec3(0.55, 0.65, 0.9) * pow(max(m, 0.0), 80.0) * 0.18 * uStars;
    gl_FragColor = vec4(col, 1.0);
  }`;

// The same swell function runs in the shader and here, so the bottle rides the visible water.
const swell = (x, z, t) =>
  0.18 * Math.sin(x * 0.5 + t * 0.8) + 0.12 * Math.sin(z * 0.7 + t * 1.1 + x * 0.3) + 0.06 * Math.sin((x + z) * 1.3 + t * 1.7);
const slopeX = (x, z, t) =>
  0.09 * Math.cos(x * 0.5 + t * 0.8) + 0.036 * Math.cos(z * 0.7 + t * 1.1 + x * 0.3) + 0.078 * Math.cos((x + z) * 1.3 + t * 1.7);
const slopeZ = (x, z, t) =>
  0.084 * Math.cos(z * 0.7 + t * 1.1 + x * 0.3) + 0.078 * Math.cos((x + z) * 1.3 + t * 1.7);

const GLSL_H = /* glsl */ `
  uniform float uTime;
  uniform vec4 uRip[6];
  float baseH(vec2 p, float t) {
    return 0.18 * sin(p.x * 0.5 + t * 0.8) + 0.12 * sin(p.y * 0.7 + t * 1.1 + p.x * 0.3) + 0.06 * sin((p.x + p.y) * 1.3 + t * 1.7);
  }
  float H(vec2 p, float t) {
    float h = baseH(p, t);
    for (int i = 0; i < 6; i++) {
      vec4 r = uRip[i];
      float age = uTime - r.z;
      if (r.w > 0.0 && age > 0.0) {
        float d = distance(p, r.xy);
        float front = age * 3.0;
        h += r.w * exp(-pow(d - front, 2.0) * 0.35) * exp(-age * 0.9) * cos((d - front) * 5.0);
      }
    }
    return h;
  }
`;

const waterMat = (uniforms) => new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    ${GLSL_H}
    uniform float uWaterT;
    varying vec3 vWorld; varying vec3 vN; varying float vH;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float e = 0.4;
      float h = H(wp.xz, uWaterT);
      vN = normalize(vec3(H(wp.xz - vec2(e, 0.0), uWaterT) - H(wp.xz + vec2(e, 0.0), uWaterT), 2.0 * e,
                          H(wp.xz - vec2(0.0, e), uWaterT) - H(wp.xz + vec2(0.0, e), uWaterT)));
      wp.y = h; vH = h; vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uLightDir; uniform vec3 uLightCol;
    varying vec3 vWorld; varying vec3 vN; varying float vH;
    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 n = normalize(vN);
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      vec3 col = mix(uDeep, uShallow, smoothstep(-0.25, 0.3, vH));
      col = mix(col, uSky, fres * 0.55);
      col += uLightCol * pow(max(dot(reflect(-uLightDir, n), V), 0.0), 70.0) * 0.55;
      float d = length(cameraPosition - vWorld);
      col = mix(col, uSky, smoothstep(12.0, 60.0, d));
      gl_FragColor = vec4(col, 1.0);
    }`,
});

function buildBottle(letterColor = 0xf4ead4) {
  const s = 0.5;
  const profile = [[0, 0], [0.38, 0], [0.5, 0.1], [0.52, 0.5], [0.5, 1.0], [0.38, 1.35], [0.18, 1.6], [0.15, 2.0], [0.19, 2.05], [0.19, 2.12]]
    .map(([r, y]) => new THREE.Vector2(r * s, y * s));
  const geo = new THREE.LatheGeometry(profile, 32);
  geo.translate(0, -1.0 * s, 0); // centre it so it rotates about its middle

  const mats = [];
  const mk = (m) => { m.transparent = true; mats.push(m); return m; };
  const glass = new THREE.Mesh(geo, mk(new THREE.MeshPhysicalMaterial({
    color: 0xcfe9e6, opacity: 0.42, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })));
  const rim = new THREE.Mesh(geo, mk(new THREE.MeshBasicMaterial({ color: 0x3f7a80, opacity: 0.55, side: THREE.BackSide, depthWrite: false })));
  rim.scale.setScalar(1.05);
  const letter = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 1.0 * s, 16), mk(new THREE.MeshStandardMaterial({ color: letterColor, roughness: 0.9 })));
  letter.position.y = -0.1 * s;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.14 * s, 0.22 * s, 16), mk(new THREE.MeshStandardMaterial({ color: 0xc9a878, roughness: 1 })));
  cork.position.y = 1.1 * s;

  const body = new THREE.Group();
  body.add(rim, glass, letter, cork);
  const group = new THREE.Group();
  group.add(body);
  group.visible = false;
  return { group, body, mats };
}

export function initScene() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    return null; // no WebGL: caller falls back to the flat animation
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(PAPER);
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(0, 2.2, 0);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfe0de, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-3, 5, -2);
  scene.add(sun);

  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    uTime: { value: 0 }, uWaterT: { value: 0 }, uRip: { value: ripples },
    uDeep: { value: new THREE.Color(MOODS.default.deep) },
    uShallow: { value: new THREE.Color(MOODS.default.shallow) },
    uSky: { value: new THREE.Color(PAPER) },
    uLightDir: { value: new THREE.Vector3(0, 0.5, -1) },
    uLightCol: { value: new THREE.Color(1, 1, 1) },
  };
  const plane = new THREE.PlaneGeometry(70, 80, 170, 200);
  plane.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(plane, waterMat(uniforms));
  water.position.z = -35;
  water.frustumCulled = false;
  scene.add(water);

  const skyU = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3(0.2, 0.42, -0.88).normalize() },
    uSunI: { value: 1 }, uStars: { value: 0 }, uTime: uniforms.uTime,
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.position.copy(camera.position);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const bottle = buildBottle();
  scene.add(bottle.group);

  // His bottle: floats out on the water until she taps it.
  const replyB = buildBottle(0xefb8ae);
  replyB.group.scale.setScalar(2.4);
  replyB.group.visible = false;
  scene.add(replyB.group);
  let replyEl = null;
  const RX = 2.2, RZ = -20;
  const proj = new THREE.Vector3();

  const dropN = 28;
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dropN * 3), 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dc = dot.getContext('2d');
  dc.fillStyle = '#fff';
  dc.beginPath(); dc.arc(16, 16, 14, 0, Math.PI * 2); dc.fill();
  const dropMat = new THREE.PointsMaterial({ color: 0xffffff, map: new THREE.CanvasTexture(dot), alphaTest: 0.05, size: 6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  scene.add(drops);
  const dropVel = Array.from({ length: dropN }, () => new THREE.Vector3());

  // ---- state ----
  let flow = 0;           // water time, scaled by mood speed
  let speed = 1, speedTarget = 1;
  const deepT = new THREE.Color(MOODS.default.deep);
  const shallowT = new THREE.Color(MOODS.default.shallow);
  const moodDeep = new THREE.Color(MOODS.default.deep), moodShallow = new THREE.Color(MOODS.default.shallow);
  let timeLook = look(currentHour());
  let phaseName = 'day';

  // Water takes its colour from the time of day, tinted by her mood.
  function waterTargets() {
    deepT.copy(moodDeep).lerp(timeLook.deep, 0.55);
    shallowT.copy(moodShallow).lerp(timeLook.shallow, 0.55);
  }

  function applyTime(jump) {
    timeLook = look(currentHour());
    const t = timeLook;
    skyU.uTop.value.copy(t.top);
    skyU.uHor.value.copy(t.hor);
    skyU.uSunCol.value.copy(t.sun);
    skyU.uSunI.value = t.sunI;
    skyU.uStars.value = t.stars;
    const e = (t.sunEl * Math.PI) / 180;
    skyU.uSunDir.value.set(0.25 * Math.cos(e), Math.sin(e), -Math.cos(e)).normalize();
    uniforms.uSky.value.copy(t.hor);
    uniforms.uLightDir.value.copy(skyU.uMoonDir.value).lerp(skyU.uSunDir.value, t.sunI).normalize();
    uniforms.uLightCol.value.setRGB(0.7, 0.8, 1).multiplyScalar(0.6).lerp(t.sun, t.sunI);
    sun.color.copy(t.sun);
    sun.intensity = 0.35 + 1.9 * t.sunI;
    sun.position.copy(uniforms.uLightDir.value).multiplyScalar(8);
    hemi.intensity = 0.5 + 0.6 * t.sunI;
    hemi.color.copy(t.hor).lerp(new THREE.Color(1, 1, 1), 0.5);
    renderer.setClearColor(t.top);
    waterTargets();
    if (jump) { uniforms.uDeep.value.copy(deepT); uniforms.uShallow.value.copy(shallowT); }
    phaseName = t.stars > 0.12 ? 'night' : 'day';
    applyTheme();
    if (!running) draw();
  }

  // Night flips the page to light-on-dark so writing stays readable.
  function applyTheme() {
    const name = visible ? phaseName : 'day';
    document.documentElement.dataset.time = name;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = name === 'night' ? '#0F1B2D' : '#FAF7F2';
  }
  const IDLE_PITCH = 0.2, SEND_PITCH = -0.23;
  let pitch = IDLE_PITCH, pitchTarget = IDLE_PITCH;
  let yaw = 0, yawTarget = 0;
  let sendT = -1, sendOpts = null, impacted = false, sendDone = null;
  let ripIdx = 0, clock = 0, last = 0, running = false, visible = true, dropT = -1;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 50; // keep the scene framed on tall phones
    camera.updateProjectionMatrix();
    if (!running) draw();
  }
  addEventListener('resize', resize);
  addEventListener('pointermove', (e) => { yawTarget = (e.clientX / innerWidth - 0.5) * -0.12; });

  function ripple(x, z, amp) {
    ripples[ripIdx].set(x, z, clock, amp);
    ripIdx = (ripIdx + 1) % ripples.length;
  }

  function splash(x, z) {
    ripple(x, z, 0.13);
    ripple(x, z, 0.06);
    const pos = dropGeo.attributes.position;
    for (let i = 0; i < dropN; i++) {
      pos.setXYZ(i, x, swell(x, z, flow), z);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
      dropVel[i].set(Math.cos(a) * r, 2 + Math.random() * 2.5, Math.sin(a) * r);
    }
    dropT = 0;
  }

  function step(dt) {
    clock += dt;
    speed += (speedTarget - speed) * (1 - Math.exp(-dt * 1.5));
    flow += dt * speed;
    uniforms.uTime.value = clock;
    uniforms.uWaterT.value = flow;
    uniforms.uDeep.value.lerp(deepT, 1 - Math.exp(-dt * 1.5));
    uniforms.uShallow.value.lerp(shallowT, 1 - Math.exp(-dt * 1.5));
    pitch += (pitchTarget - pitch) * (1 - Math.exp(-dt * 2.6));
    yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * 3));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    if (sendT >= 0) stepSend(dt);

    if (replyEl) {
      const g = replyB.group;
      const bob = Math.sin(flow * 1.3) * 0.04;
      g.position.set(RX, swell(RX, RZ, flow) + 0.1 + bob, RZ);
      g.rotation.set(slopeZ(RX, RZ, flow) * 0.8, 0.5, 1.45 + slopeX(RX, RZ, flow) * 0.8);
    }

    if (dropT >= 0) {
      dropT += dt;
      const pos = dropGeo.attributes.position;
      for (let i = 0; i < dropN; i++) {
        dropVel[i].y -= 9 * dt;
        pos.setXYZ(i, pos.getX(i) + dropVel[i].x * dt, pos.getY(i) + dropVel[i].y * dt, pos.getZ(i) + dropVel[i].z * dt);
      }
      pos.needsUpdate = true;
      dropMat.opacity = Math.max(0, 0.9 * (1 - dropT / 0.9));
      if (dropT > 0.9) dropT = -1;
    }
  }

  const X0 = 0.4, Z0 = -4.5, HIT = 0.9;
  function stepSend(dt) {
    sendT += dt;
    const T = sendT;
    const g = bottle.group;
    let x = X0, z = Z0, y;
    const yw = (px, pz) => swell(px, pz, flow) - 0.04;
    if (T < HIT) {
      const k = T / HIT;
      y = 4.2 + (yw(x, z) - 4.2) * k * k;
      g.rotation.z = 1.9 - 0.45 * k;
    } else {
      if (!impacted) { impacted = true; splash(x, z); sendOpts?.onImpact?.(); }
      const s = T - HIT;
      const u = Math.max(0, T - 1.4);
      x = X0 + u * 0.9;
      z = Z0 - 3.5 * Math.pow(u, 1.4);
      y = yw(x, z) - 0.5 * (1 - Math.exp(-s * 12)) * Math.exp(-s * 2.2) * Math.cos(s * 5.5);
      g.rotation.z = 1.45 + slopeX(x, z, flow) * 0.8;
      g.rotation.x = slopeZ(x, z, flow) * 0.8;
    }
    g.position.set(x, y, z);
    g.rotation.y = 0.5;
    g.visible = true;

    const fade = T > 3.2 ? Math.max(0, 1 - (T - 3.2) / 0.7) : 1;
    const base = [0.42, 0.55, 1, 1];
    bottle.mats.forEach((m, i) => { m.opacity = base[i] * fade; });
    if (T > 3.4) pitchTarget = IDLE_PITCH;
    if (T > 3.9) {
      g.visible = false;
      sendT = -1;
      sendDone?.();
      sendDone = null;
    }
  }

  function placeReply() {
    if (!replyEl) return;
    replyB.group.visible = sendT < 0;
    replyEl.style.visibility = sendT < 0 ? 'visible' : 'hidden';
    camera.updateMatrixWorld();
    proj.copy(replyB.group.position).project(camera);
    replyEl.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
  }

  function draw() {
    renderer.render(scene, camera);
    placeReply();
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - last < 33) return; // ~30fps is plenty for slow water
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    step(dt);
    draw();
  }
  function start() {
    if (running || reduce || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
  function stop() { running = false; }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  applyTime(true);
  setInterval(() => applyTime(false), 60_000);
  resize();
  step(0.016);
  draw();
  start();

  return {
    setVisible(v) {
      visible = v;
      canvas.style.display = v ? '' : 'none';
      applyTheme();
      v ? start() : stop();
    },
    setMood(name) {
      const m = MOODS[name] || MOODS.default;
      moodDeep.set(m.deep);
      moodShallow.set(m.shallow);
      waterTargets();
      speedTarget = m.speed;
      if (!running) { uniforms.uDeep.value.copy(deepT); uniforms.uShallow.value.copy(shallowT); draw(); }
    },
    // Pass the button that should sit on the bottle, or null to remove it.
    setReplyBottle(el) {
      replyEl = el;
      replyB.group.visible = Boolean(el);
      if (el) step(0); // pose it before the first frame, also in static mode
      if (!running) draw();
    },
    typing() {
      ripple((Math.random() - 0.5) * 8, -5 - Math.random() * 8, 0.07);
    },
    // Resolves when the bottle has drifted away. Static (reduced-motion) mode skips it.
    playSend(opts = {}) {
      if (reduce || !running) { opts.onImpact?.(); return Promise.resolve(); }
      sendOpts = opts;
      impacted = false;
      sendT = 0;
      pitchTarget = SEND_PITCH;
      return new Promise((res) => { sendDone = res; });
    },
  };
}
