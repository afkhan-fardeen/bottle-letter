import * as THREE from 'three';

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
    uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
    varying vec3 vWorld; varying vec3 vN; varying float vH;
    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 n = normalize(vN);
      float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
      vec3 col = mix(uDeep, uShallow, smoothstep(-0.25, 0.3, vH));
      col = mix(col, uSky, fres * 0.55);
      vec3 L = normalize(vec3(-0.3, 0.6, -1.0));
      col += vec3(1.0) * pow(max(dot(reflect(-L, n), V), 0.0), 70.0) * 0.55;
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
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe0de, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-3, 5, -2);
  scene.add(sun);

  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    uTime: { value: 0 }, uWaterT: { value: 0 }, uRip: { value: ripples },
    uDeep: { value: new THREE.Color(MOODS.default.deep) },
    uShallow: { value: new THREE.Color(MOODS.default.shallow) },
    uSky: { value: new THREE.Color(PAPER) },
  };
  const plane = new THREE.PlaneGeometry(70, 80, 170, 200);
  plane.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(plane, waterMat(uniforms));
  water.position.z = -35;
  water.frustumCulled = false;
  scene.add(water);

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

  resize();
  step(0.016);
  draw();
  start();

  return {
    setVisible(v) {
      visible = v;
      canvas.style.display = v ? '' : 'none';
      v ? start() : stop();
    },
    setMood(name) {
      const m = MOODS[name] || MOODS.default;
      deepT.set(m.deep);
      shallowT.set(m.shallow);
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
