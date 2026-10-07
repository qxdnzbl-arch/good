// The 3D room on the home page. Every object worth touching carries userData.pick = <route>.
// Built from three.js primitives and canvas textures only, so it ships with no model files.
/* global THREE */

const PICKS = [
  { id: "chat", short: "聊天", label: "信 · 聊天", at: [-1.55, 1.95, -2.8] },
  { id: "memory", short: "记忆", label: "日记 · 记忆", at: [-2.75, 1.95, -2.75] },
  { id: "wish", short: "许愿", label: "许愿瓶", at: [-3.45, 2.45, -3.3] },
  { id: "listen", short: "一起听", label: "唱片机 · 一起听", at: [2.6, 1.75, -3.3] },
  { id: "calendar", label: "台历", at: [-1.95, 2.3, -3.6], soon: true },
  { id: "game", label: "骰子", at: [-0.85, 1.85, -2.7], soon: true },
  { id: "read", short: "共读", label: "书架 · 共读", at: [-4.75, 4.05, -1.6], soon: true },
  { id: "call", label: "电话", at: [-4.0, 1.55, 1.2], soon: true },
];

export function createRoom(canvas, hooks) {
  const T = THREE;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(42, 1, 0.1, 100);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------ helpers
  const M = (c, o = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: 0 }, o));
  const gold = M(0xe4bd78, { metalness: .5, roughness: .32 });
  const white = M(0xfffaf6, { roughness: .55 });
  function mesh(parent, geo, mat, x = 0, y = 0, z = 0, opt = {}) {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = opt.cast !== false; m.receiveShadow = opt.receive !== false;
    parent.add(m); return m;
  }
  function group(parent, x = 0, y = 0, z = 0, pick) {
    const g = new T.Group(); g.position.set(x, y, z); if (pick) g.userData.pick = pick; parent.add(g); return g;
  }
  function tex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4; return t;
  }
  const heartShape = (() => {
    const s = new T.Shape();
    s.moveTo(0, -.9); s.bezierCurveTo(-.2, -.7, -1, -.25, -1, .25); s.bezierCurveTo(-1, .7, -.6, .95, -.32, .95);
    s.bezierCurveTo(-.12, .95, 0, .8, 0, .62); s.bezierCurveTo(0, .8, .12, .95, .32, .95);
    s.bezierCurveTo(.6, .95, 1, .7, 1, .25); s.bezierCurveTo(1, -.25, .2, -.7, 0, -.9);
    return s;
  })();
  const heartGeo = new T.ExtrudeGeometry(heartShape, { depth: .3, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 3, curveSegments: 16 });
  heartGeo.center();
  const starGeo = (() => {
    const s = new T.Shape();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .45 : 1; s[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
    const g = new T.ExtrudeGeometry(s, { depth: .35, bevelEnabled: true, bevelThickness: .1, bevelSize: .08, bevelSegments: 2 }); g.center(); return g;
  })();

  // ------------------------------------------------------------ room shell
  const wallTexDraw = (g, w, h) => {
    g.fillStyle = "#fbdbe5"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fde6ee"; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 30, h);
    g.fillStyle = "rgba(255,255,255,.85)";
    for (let y = 16; y < h; y += 64) for (let x = 47; x < w; x += 64) { g.beginPath(); g.arc(x, y + ((x / 64) % 2) * 32, 3.2, 0, 7); g.fill(); }
  };
  const backTex = tex(256, 256, wallTexDraw, [0.4, 0.4]);
  const sideTex = tex(256, 256, wallTexDraw, [4, 2.4]);
  const wallShape = new T.Shape(); wallShape.moveTo(-5, 0); wallShape.lineTo(5, 0); wallShape.lineTo(5, 6); wallShape.lineTo(-5, 6); wallShape.lineTo(-5, 0);
  const hole = new T.Path(); hole.moveTo(.4, 2.3); hole.lineTo(2.8, 2.3); hole.lineTo(2.8, 4.3); hole.lineTo(.4, 4.3); hole.lineTo(.4, 2.3);
  wallShape.holes.push(hole);
  const back = mesh(scene, new T.ShapeGeometry(wallShape), M(0xffffff, { map: backTex, shadowSide: T.DoubleSide }), 0, 0, -4);
  back.receiveShadow = true;
  const left = mesh(scene, new T.PlaneGeometry(10, 6), M(0xffffff, { map: sideTex }), -5, 3, 1, { cast: false });
  left.rotation.y = Math.PI / 2;
  const floorTex = tex(256, 256, (g, w, h) => {
    const tones = ["#f2dcc7", "#eed4bc", "#f5e2cf", "#efd8c2"];
    for (let i = 0; i < 4; i++) { g.fillStyle = tones[i]; g.fillRect(0, i * 64, w, 64); g.fillStyle = "rgba(160,110,80,.18)"; g.fillRect(0, i * 64, w, 2); g.fillRect(((i * 97) % 200) + 20, i * 64, 2, 64); }
  }, [4, 4]);
  const floor = mesh(scene, new T.PlaneGeometry(10, 10), M(0xffffff, { map: floorTex, roughness: .8 }), 0, 0, 1, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  mesh(scene, new T.BoxGeometry(10, .18, .06), white, 0, .09, -3.97);
  mesh(scene, new T.BoxGeometry(.06, .18, 10), white, -4.97, .09, 1);

  // window: frame, cross, sill, glass, curtains, a sky beyond
  const win = group(scene, 1.6, 3.3, -4);
  for (const [w, h, x, y] of [[2.6, .14, 0, 1.03], [2.6, .14, 0, -1.03], [.14, 2.2, -1.23, 0], [.14, 2.2, 1.23, 0], [.07, 2, 0, 0], [2.4, .07, 0, 0]])
    mesh(win, new T.BoxGeometry(w, h, .2), white, x, y, 0);
  mesh(win, new T.BoxGeometry(2.9, .1, .42), white, 0, -1.12, .12);
  const glass = mesh(win, new T.PlaneGeometry(2.4, 2), new T.MeshStandardMaterial({ color: 0xdff1ff, transparent: true, opacity: .12, roughness: .05, metalness: .3 }), 0, 0, -.02, { cast: false, receive: false });
  glass.renderOrder = 2;
  mesh(win, new T.CylinderGeometry(.03, .03, 3.4, 10), gold, 0, 1.32, .25).rotation.z = Math.PI / 2;
  const curtainTex = tex(128, 32, (g, w) => { const gr = g.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? "#f6b9cb" : "#fbd6e1"); g.fillStyle = gr; g.fillRect(0, 0, w, 32); });
  for (const x of [-1.5, 1.5]) { const c = mesh(win, new T.PlaneGeometry(.75, 2.9, 1, 1), M(0xffffff, { map: curtainTex, side: T.DoubleSide }), x, -.15, .27); c.castShadow = true; }
  const skyCanvas = document.createElement("canvas"); skyCanvas.width = 512; skyCanvas.height = 340;
  const skyTex = new T.CanvasTexture(skyCanvas);
  mesh(scene, new T.PlaneGeometry(6, 4.2), new T.MeshBasicMaterial({ map: skyTex }), 1.6, 3.3, -5.3, { cast: false, receive: false });
  function paintSky(kind) {
    const g = skyCanvas.getContext("2d"), w = skyCanvas.width, h = skyCanvas.height;
    const stops = { day: ["#bfe3ff", "#e4f3ff", "#ffe8f0"], dusk: ["#f6a6b8", "#fbc7a8", "#fde2c8"], night: ["#1e1a3c", "#3a2b5e", "#6b4a7e"] }[kind];
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, stops[0]); gr.addColorStop(.6, stops[1]); gr.addColorStop(1, stops[2]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (kind === "night") {
      g.fillStyle = "#fff"; for (let i = 0; i < 90; i++) { g.globalAlpha = .3 + Math.random() * .7; g.fillRect(Math.random() * w, Math.random() * h * .7, 1.6, 1.6); }
      g.globalAlpha = 1; g.fillStyle = "#fff6d6"; g.beginPath(); g.arc(w * .62, h * .3, 22, 0, 7); g.fill();
      g.fillStyle = stops[0]; g.beginPath(); g.arc(w * .62 + 10, h * .3 - 6, 20, 0, 7); g.fill();
    } else {
      g.fillStyle = kind === "day" ? "#fff7d8" : "#ffd9a8"; g.beginPath(); g.arc(w * .66, h * (kind === "day" ? .28 : .62), 26, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,.9)";
      for (const [x, y, s] of [[.3, .25, 1], [.48, .4, .7], [.8, .2, .8]]) for (const [dx, dy, r] of [[0, 0, 22], [22, -8, 18], [40, 2, 16], [-18, 4, 14]]) { g.beginPath(); g.arc(w * x + dx * s, h * y + dy * s, r * s, 0, 7); g.fill(); }
    }
    g.fillStyle = kind === "night" ? "#3d2c52" : kind === "dusk" ? "#e59db0" : "#f6c2d2";
    g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * .82 - Math.sin(x / 60) * 14 - Math.sin(x / 23) * 5); g.lineTo(w, h); g.fill();
    skyTex.needsUpdate = true;
  }

  // weather beyond the glass
  const RAIN = 140, SNOW = 160;
  const rainPos = new Float32Array(RAIN * 6);
  const resetDrop = (i, y) => { const x = .2 + Math.random() * 2.8, z = -4.3 - Math.random() * .85, yy = y ?? 2.2 + Math.random() * 2.4; rainPos.set([x, yy, z, x - .03, yy - .22, z], i * 6); };
  for (let i = 0; i < RAIN; i++) resetDrop(i);
  const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute("position", new T.BufferAttribute(rainPos, 3));
  const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: .7 })); scene.add(rain);
  const snowPos = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) snowPos.set([.2 + Math.random() * 2.8, 2.2 + Math.random() * 2.4, -4.3 - Math.random() * .85], i * 3);
  const snowGeo = new T.BufferGeometry(); snowGeo.setAttribute("position", new T.BufferAttribute(snowPos, 3));
  const dotTex = tex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
  const snow = new T.Points(snowGeo, new T.PointsMaterial({ size: .07, map: dotTex, transparent: true, depthWrite: false })); scene.add(snow);

  // string lights along the top of the back wall
  const bulbs = [], bulbMat = [M(0xfff1c9, { emissive: 0xffc56b, emissiveIntensity: .3 }), M(0xffd6e2, { emissive: 0xff9fbe, emissiveIntensity: .3 })];
  const wirePts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, x = -4.8 + t * 9.4; wirePts.push(new T.Vector3(x, 5.55 - Math.sin(t * Math.PI * 3) ** 2 * .35, -3.92)); }
  scene.add(new T.Line(new T.BufferGeometry().setFromPoints(wirePts), new T.LineBasicMaterial({ color: 0xc9a07a })));
  for (let i = 2; i < 40; i += 2) { const p = wirePts[i]; bulbs.push(mesh(scene, new T.SphereGeometry(.06, 10, 8), bulbMat[(i / 2) % 2], p.x, p.y - .07, p.z + .03, { cast: false })); }
  const stringLight = new T.PointLight(0xffc98a, 0, 9, 2); stringLight.position.set(0, 5, -3.2); scene.add(stringLight);

  // ------------------------------------------------------------ desk
  const desk = group(scene, -2.2, 0, -3.25);
  mesh(desk, new T.BoxGeometry(3.1, .1, 1.35), white, 0, 1.45, 0);
  for (const [x, z] of [[-1.45, -.55], [1.45, -.55], [-1.45, .55], [1.45, .55]]) mesh(desk, new T.CylinderGeometry(.05, .04, 1.4, 10), white, x, .7, z);
  mesh(desk, new T.BoxGeometry(.9, .55, 1.2), white, -1.0, 1.12, 0);
  mesh(desk, new T.BoxGeometry(.8, .22, .02), M(0xf6b3c6), -1.0, 1.22, .61);
  mesh(desk, new T.BoxGeometry(.8, .22, .02), M(0xf6b3c6), -1.0, .98, .61);
  for (const y of [1.22, .98]) mesh(desk, new T.SphereGeometry(.035, 10, 8), gold, -1.0, y, .63);
  const frameTex = tex(128, 128, (g) => { g.fillStyle = "#fff6f8"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#f48fb0"; g.translate(64, 70); g.scale(2.2, 2.2); g.beginPath(); g.moveTo(0, 12); g.bezierCurveTo(-18, 0, -16, -16, 0, -8); g.bezierCurveTo(16, -16, 18, 0, 0, 12); g.fill(); });
  const picture = group(scene, -2.2, 3.35, -3.95);
  mesh(picture, new T.BoxGeometry(.9, .9, .05), gold, 0, 0, 0);
  mesh(picture, new T.PlaneGeometry(.74, .74), M(0xffffff, { map: frameTex }), 0, 0, .03, { cast: false });

  // diary → memory
  const diary = group(scene, -2.75, 1.5, -2.85, "memory"); diary.rotation.y = .3;
  mesh(diary, new T.BoxGeometry(.72, .1, .92), M(0xf4a9bf, { roughness: .7 }), 0, .05, 0);
  mesh(diary, new T.BoxGeometry(.66, .08, .88), M(0xfff6ea), .02, .05, 0);
  mesh(diary, new T.BoxGeometry(.72, .02, .92), M(0xf4a9bf, { roughness: .7 }), 0, .11, 0);
  mesh(diary, new T.BoxGeometry(.12, .05, .14), gold, .36, .07, 0);
  const dh = mesh(diary, heartGeo, M(0xffe4ec, { roughness: .4 }), 0, .14, 0); dh.scale.setScalar(.12); dh.rotation.x = -Math.PI / 2;
  mesh(diary, new T.BoxGeometry(.03, .005, .5), M(0xb98be0), -.15, .121, .58).rotation.y = .2;

  // envelopes → chat
  const envTop = tex(256, 180, (g, w, h) => {
    g.fillStyle = "#fff4f0"; g.fillRect(0, 0, w, h); g.strokeStyle = "#f0b2c4"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(4, 4); g.lineTo(w / 2, h * .62); g.lineTo(w - 4, 4); g.stroke(); g.strokeRect(2, 2, w - 4, h - 4);
  });
  const letters = group(scene, -1.55, 1.5, -2.8, "chat"); letters.rotation.y = -.25;
  const envMat = (top) => [M(0xfff4f0), M(0xfff4f0), M(0xffffff, { map: top }), M(0xfff4f0), M(0xfff4f0), M(0xfff4f0)];
  mesh(letters, new T.BoxGeometry(.82, .03, .56), envMat(envTop), 0, .02, 0);
  const env2 = mesh(letters, new T.BoxGeometry(.82, .03, .56), envMat(envTop), .06, .055, -.04); env2.rotation.y = .22;
  const seal = mesh(letters, heartGeo, M(0xf06292, { roughness: .35 }), .07, .085, .04); seal.scale.setScalar(.075); seal.rotation.x = -Math.PI / 2;
  const floatHeart = mesh(letters, heartGeo, M(0xf48fb0, { emissive: 0xf48fb0, emissiveIntensity: .35, roughness: .3 }), 0, .45, 0); floatHeart.scale.setScalar(.09);

  // wish jar → wish
  const jar = group(scene, -3.45, 1.5, -3.3, "wish");
  const glassMat = new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .28, roughness: .08, metalness: .1, depthWrite: false });
  const jarBody = mesh(jar, new T.CylinderGeometry(.3, .32, .66, 32, 1, true), glassMat, 0, .33, 0, { cast: false }); jarBody.renderOrder = 3;
  mesh(jar, new T.CylinderGeometry(.32, .32, .02, 32), glassMat, 0, .01, 0, { cast: false });
  mesh(jar, new T.CylinderGeometry(.21, .3, .1, 32, 1, true), glassMat, 0, .71, 0, { cast: false });
  mesh(jar, new T.CylinderGeometry(.2, .19, .14, 24), M(0xe9b9a2, { roughness: .9 }), 0, .82, 0);
  const ribbon = mesh(jar, new T.TorusGeometry(.215, .025, 8, 32), M(0xf48fb0), 0, .72, 0); ribbon.rotation.x = Math.PI / 2;
  const jarStars = group(jar, 0, 0, 0);
  const starMats = [M(0xffd98a, { emissive: 0xffc35a, emissiveIntensity: .45 }), M(0xffc2d4, { emissive: 0xff8fb3, emissiveIntensity: .45 }), M(0xd8c8ff, { emissive: 0xb39bff, emissiveIntensity: .4 })];
  function setWishes(n) {
    jarStars.clear();
    const count = Math.max(3, Math.min(16, n + 3));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, r = Math.random() * .2;
      const s = mesh(jarStars, starGeo, starMats[i % 3], Math.cos(a) * r, .07 + (i / count) * .5 + Math.random() * .04, Math.sin(a) * r, { cast: false });
      s.scale.setScalar(.055); s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    }
  }
  setWishes(0);

  // calendar (next batch)
  const calTex = tex(256, 256, (g, w) => {
    const d = new Date();
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, w); g.fillStyle = "#f48fb0"; g.fillRect(0, 0, w, 70);
    g.fillStyle = "#fff"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.fillText(`${d.getMonth() + 1} 月`, w / 2, 52);
    g.fillStyle = "#4b3441"; g.font = "bold 120px sans-serif"; g.fillText(String(d.getDate()), w / 2, 190);
    g.fillStyle = "#ae8f9d"; g.font = "36px sans-serif"; g.fillText("周" + "日一二三四五六"[d.getDay()], w / 2, 238);
  });
  const cal = group(scene, -1.95, 1.5, -3.55, "calendar");
  const calFront = mesh(cal, new T.PlaneGeometry(.5, .5), M(0xffffff, { map: calTex, side: T.DoubleSide }), 0, .25, .07); calFront.rotation.x = -.28;
  const calBack = mesh(cal, new T.PlaneGeometry(.5, .5), M(0xf6b3c6, { side: T.DoubleSide }), 0, .25, -.07); calBack.rotation.x = .28;
  mesh(cal, new T.CylinderGeometry(.012, .012, .48, 8), gold, 0, .49, 0).rotation.z = Math.PI / 2;

  // desk lamp
  const lampG = group(scene, -0.95, 1.5, -3.55);
  mesh(lampG, new T.CylinderGeometry(.16, .18, .05, 24), white, 0, .03, 0);
  mesh(lampG, new T.CylinderGeometry(.02, .02, .7, 10), gold, 0, .38, 0);
  mesh(lampG, new T.ConeGeometry(.26, .3, 32, 1, true), M(0xf7c0cf, { side: T.DoubleSide, emissive: 0xffb3c7, emissiveIntensity: .1 }), 0, .78, 0);
  const bulb = mesh(lampG, new T.SphereGeometry(.06, 12, 10), M(0xfff3d6, { emissive: 0xffd28a, emissiveIntensity: .2 }), 0, .68, 0, { cast: false });
  const lamp = new T.PointLight(0xffcf94, 0, 7, 2); lamp.position.set(-0.95, 2.1, -3.3); scene.add(lamp);

  // dice (next batch)
  const diceFace = (n) => tex(64, 64, (g) => {
    g.fillStyle = "#fffafc"; g.fillRect(0, 0, 64, 64); g.fillStyle = n === 1 ? "#f06292" : "#4b3441";
    const P = { 1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]], 4: [[18, 18], [46, 18], [18, 46], [46, 46]], 5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]], 6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]] }[n];
    for (const [x, y] of P) { g.beginPath(); g.arc(x, y, n === 1 ? 9 : 6, 0, 7); g.fill(); }
  });
  const diceMats = [1, 6, 2, 5, 3, 4].map((n) => M(0xffffff, { map: diceFace(n), roughness: .4 }));
  const dice = group(scene, -0.85, 1.5, -2.7, "game");
  const d1 = mesh(dice, new T.BoxGeometry(.18, .18, .18), diceMats, 0, .09, 0); d1.rotation.y = .5;
  const d2 = mesh(dice, new T.BoxGeometry(.18, .18, .18), diceMats, .24, .09, .12); d2.rotation.set(Math.PI / 2, .9, 0);

  // ------------------------------------------------------------ bookshelf (next batch)
  const shelf = group(scene, -4.8, 3.2, -1.6, "read");
  mesh(shelf, new T.BoxGeometry(.38, .06, 2.1), white, 0, 0, 0);
  for (const z of [-.85, .85]) mesh(shelf, new T.BoxGeometry(.3, .25, .04), white, -.02, -.14, z);
  const bookCols = [0xf6a9be, 0xb9a2ea, 0xffd38c, 0x9fd3c7, 0xfbd0dc, 0xe7b0d6, 0xf4c5a3, 0xc6dcf5];
  let bz = -.95;
  bookCols.forEach((c, i) => {
    const w = .12 + (i % 3) * .03, h = .42 + ((i * 7) % 5) * .05;
    const b = mesh(shelf, new T.BoxGeometry(.3, h, w), M(c, { roughness: .75 }), .02, h / 2 + .03, bz + w / 2);
    if (i === 6) { b.rotation.x = -.22; b.position.z += .05; }
    bz += w + .015;
  });

  // ------------------------------------------------------------ record cabinet → listen
  const cab = group(scene, 2.6, 0, -3.35, "listen");
  mesh(cab, new T.BoxGeometry(1.9, .95, .9), white, 0, .58, 0);
  for (const x of [-.47, .47]) { mesh(cab, new T.BoxGeometry(.88, .82, .02), M(0xfbd6e1), x, .58, .46); mesh(cab, new T.SphereGeometry(.035, 10, 8), gold, x + (x < 0 ? .36 : -.36), .58, .48); }
  for (const x of [-.85, .85]) for (const z of [-.38, .38]) mesh(cab, new T.CylinderGeometry(.04, .03, .12, 8), gold, x, .06, z);
  const tt = group(cab, 0, 1.05, .02);
  mesh(tt, new T.BoxGeometry(1.15, .16, .86), M(0xf3c6d3, { roughness: .45 }), 0, .08, 0);
  mesh(tt, new T.CylinderGeometry(.4, .4, .04, 48), M(0xd9d4d6, { metalness: .6, roughness: .3 }), -.12, .18, 0);
  const grooves = tex(256, 256, (g) => { g.fillStyle = "#2c2229"; g.fillRect(0, 0, 256, 256); g.strokeStyle = "rgba(255,255,255,.08)"; for (let r = 40; r < 128; r += 3) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); } g.fillStyle = "#f6a3bb"; g.beginPath(); g.arc(128, 128, 38, 0, 7); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(128, 128, 5, 0, 7); g.fill(); g.fillStyle = "#fff4f7"; g.fillRect(118, 104, 20, 6); });
  const vinyl = mesh(tt, new T.CylinderGeometry(.37, .37, .015, 64), [M(0x2c2229), M(0xffffff, { map: grooves, roughness: .3 }), M(0x2c2229)], -.12, .21, 0);
  const armPivot = group(tt, .4, .24, -.3);
  mesh(armPivot, new T.CylinderGeometry(.05, .06, .08, 16), gold, 0, 0, 0);
  const arm = group(armPivot, 0, .05, 0);
  mesh(arm, new T.CylinderGeometry(.012, .012, .62, 8), M(0xeeeeee, { metalness: .7, roughness: .25 }), 0, 0, .31).rotation.x = Math.PI / 2;
  mesh(arm, new T.BoxGeometry(.06, .03, .1), M(0x4b3441), 0, -.01, .63);
  arm.rotation.y = .35;
  for (let i = 0; i < 3; i++) { const sl = mesh(scene, new T.BoxGeometry(.03, .6, .6), M([0xb9a2ea, 0xffd38c, 0xf6a9be][i]), 3.65 + i * .05, .3, -2.6 + i * .04); sl.rotation.z = -.12 - i * .05; }

  // plant
  const plant = group(scene, 4.3, 0, -3.4);
  mesh(plant, new T.CylinderGeometry(.28, .22, .5, 24), M(0xfbd6e1), 0, .25, 0);
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const l = mesh(plant, new T.SphereGeometry(.22, 14, 10), M(0x9fd3b8, { roughness: .8 }), Math.cos(a) * .18, .7 + (i % 3) * .14, Math.sin(a) * .18); l.scale.set(.7, 1.3, .5); l.rotation.set(Math.cos(a) * .5, a, Math.sin(a) * .5); }

  // ------------------------------------------------------------ phone table (next batch)
  const phoneT = group(scene, -4.0, 0, 1.2, "call");
  mesh(phoneT, new T.CylinderGeometry(.55, .55, .06, 32), white, 0, .9, 0);
  mesh(phoneT, new T.CylinderGeometry(.06, .08, .88, 12), white, 0, .45, 0);
  mesh(phoneT, new T.CylinderGeometry(.3, .32, .04, 24), white, 0, .02, 0);
  const ph = mesh(phoneT, new T.SphereGeometry(.26, 24, 16), M(0xf48fb0, { roughness: .4 }), 0, 1.0, 0); ph.scale.set(1.1, .55, .9);
  mesh(phoneT, new T.CylinderGeometry(.12, .12, .03, 24), M(0xfff6f8), 0, 1.13, .1).rotation.x = .5;
  const hs = group(phoneT, 0, 1.2, -.04);
  mesh(hs, new T.CylinderGeometry(.04, .04, .48, 10), M(0xf48fb0, { roughness: .4 }), 0, 0, 0).rotation.z = Math.PI / 2;
  for (const x of [-.24, .24]) { const e = mesh(hs, new T.SphereGeometry(.08, 14, 10), M(0xf48fb0, { roughness: .4 }), x, -.03, 0); e.scale.set(.8, .6, 1); }

  // ------------------------------------------------------------ rug, cushion, mascot
  const rugTex = tex(256, 256, (g) => { for (let i = 8; i > 0; i--) { g.fillStyle = i % 2 ? "#fbd0dc" : "#fff1f5"; g.beginPath(); g.arc(128, 128, i * 16, 0, 7); g.fill(); } });
  const rug = mesh(scene, new T.CircleGeometry(2.4, 64), M(0xffffff, { map: rugTex, roughness: .95 }), .4, .012, .7, { cast: false }); rug.rotation.x = -Math.PI / 2;
  const cushion = mesh(scene, new T.CylinderGeometry(.65, .7, .26, 32), M(0xf6b3c6, { roughness: .85 }), 1.5, .13, .9);
  const mascot = group(scene, 1.5, .28, .9, "mascot");
  const body = group(mascot, 0, 0, 0);
  const fluff = M(0xfffdf8, { roughness: .9 });
  const torso = mesh(body, new T.SphereGeometry(.42, 32, 24), fluff, 0, .38, 0); torso.scale.set(1, .9, .92);
  for (const [x, y, z, r] of [[-.22, .74, 0, .17], [0, .8, -.04, .19], [.22, .74, 0, .17], [-.36, .5, 0, .14], [.36, .5, 0, .14]]) mesh(body, new T.SphereGeometry(r, 16, 12), fluff, x, y, z);
  const eyes = [];
  for (const x of [-.13, .13]) eyes.push(mesh(body, new T.SphereGeometry(.04, 12, 10), M(0x4b3441, { roughness: .3 }), x, .44, .37, { cast: false }));
  for (const x of [-.24, .24]) { const b = mesh(body, new T.CircleGeometry(.06, 16), new T.MeshBasicMaterial({ color: 0xffb7c9 }), x, .36, .385, { cast: false }); b.rotation.y = x * .9; }
  const mouth = mesh(body, new T.TorusGeometry(.03, .008, 6, 12, Math.PI), M(0x4b3441), 0, .37, .395, { cast: false }); mouth.rotation.z = Math.PI;
  const bow = group(body, .26, .78, .1);
  for (const s of [-1, 1]) { const c = mesh(bow, new T.ConeGeometry(.06, .12, 12), M(0xf48fb0), s * .06, 0, 0); c.rotation.z = s * Math.PI / 2; }

  // ------------------------------------------------------------ lights
  const hemi = new T.HemisphereLight(0xfff4f7, 0xe9cdb8, .75); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff1dc, 1.1);
  sun.position.set(4.5, 7, -10); sun.target.position.set(.5, 0, 0); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 }); sun.shadow.bias = -.0005;
  const fill = new T.DirectionalLight(0xffffff, .45); fill.position.set(6, 5, 8); scene.add(fill);

  const SKIES = {
    day:   { bg: 0xfdeef3, hemi: [0xfff4f7, 0xe9cdb8, .78], sun: [0xfff1dc, 1.15], fill: .45, lamp: 0, bulb: .25, string: 0 },
    dusk:  { bg: 0xf7dbe4, hemi: [0xffdccf, 0xc9a7d4, .62], sun: [0xffa77a, .95], fill: .35, lamp: 1.0, bulb: .8, string: .5 },
    night: { bg: 0x2a2140, hemi: [0x8e7dc4, 0x2f2445, .42], sun: [0xaab4ff, .38], fill: .16, lamp: 2.0, bulb: 1.6, string: 1.1 },
  };
  let skyKind = "day", weather = "clear";
  function setSky(mode) {
    const h = new Date().getHours();
    skyKind = mode && mode !== "auto" ? mode : h >= 6 && h < 16 ? "day" : h >= 16 && h < 19 ? "dusk" : "night";
    const s = SKIES[skyKind];
    scene.background = new T.Color(s.bg);
    hemi.color.setHex(s.hemi[0]); hemi.groundColor.setHex(s.hemi[1]); hemi.intensity = s.hemi[2];
    sun.color.setHex(s.sun[0]); sun.intensity = s.sun[1]; fill.intensity = s.fill;
    lamp.intensity = s.lamp; stringLight.intensity = s.string;
    bulb.material.emissiveIntensity = s.lamp ? 1.2 : .2;
    bulbMat.forEach((m) => (m.emissiveIntensity = s.bulb));
    paintSky(skyKind);
    return skyKind;
  }
  function setWeather(w) { weather = w; rain.visible = w === "rain"; snow.visible = w === "snow"; if (w === "rain") sun.intensity *= .55; }

  // ------------------------------------------------------------ camera rig & input
  const target = new T.Vector3(-.5, 1.7, -1.1);
  const baseDir = new T.Vector3(5.2, 3.4, 7.6).normalize();
  let yaw = 0, pitch = 0, zoom = 1, fly = null, W = 0, H = 0, dist = 12;
  const pointers = new Map();
  let dragMoved = false, pinchStart = 0, zoomStart = 1, downAt = { x: 0, y: 0 };
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const pickables = []; scene.traverse((o) => { if (o.userData.pick) pickables.push(o); });
  function pickAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(pickables, true)[0];
    if (!hit) return null;
    let o = hit.object; while (o && !o.userData.pick) o = o.parent;
    return o;
  }
  let hover = null;
  function setHover(o) {
    if (hover === o) return;
    hover = o; canvas.style.cursor = o ? "pointer" : "grab";
  }
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = false; downAt = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); zoomStart = zoom; }
    hooks.onInteract?.();
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { if (e.pointerType === "mouse") setHover(pickAt(e.clientX, e.clientY)); return; }
    if (pointers.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...pointers.values()]; zoom = Math.min(1.5, Math.max(.6, zoomStart * pinchStart / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
      dragMoved = true; return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) dragMoved = true;
    yaw = Math.max(-.55, Math.min(.45, yaw - dx * .004)); pitch = Math.max(-.2, Math.min(.25, pitch + dy * .003));
  });
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!dragMoved && pointers.size === 0) { const o = pickAt(e.clientX, e.clientY); if (o) choose(o.userData.pick); }
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", (e) => pointers.delete(e.pointerId));
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.min(1.5, Math.max(.6, zoom * (1 + e.deltaY * .001))); }, { passive: false });

  const bounce = new Map();
  function choose(id) {
    const g = pickables.find((o) => o.userData.pick === id);
    if (g) bounce.set(g, 0);
    if (id === "mascot") { hooks.onMascot?.(); return; }
    const spot = PICKS.find((p) => p.id === id);
    if (!spot || spot.soon) { hooks.onPick?.(id, spot); return; }
    const to = new T.Vector3(...spot.at);
    fly = { t: 0, from: cam.position.clone(), look: target.clone(), to: to.clone().add(baseDir.clone().multiplyScalar(2.6)), toLook: to, id };
  }

  function camPose() {
    const aspect = W / H;
    dist = 12 * Math.min(2.1, Math.max(1, Math.pow(1.35 / aspect, .85))) * zoom;
    const dir = baseDir.clone().applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
    dir.y += pitch; dir.normalize();
    return target.clone().add(dir.multiplyScalar(dist));
  }

  // ------------------------------------------------------------ state from the app
  let playing = false, armAngle = .35, vinylSpeed = 0;
  const tmp = new T.Vector3();

  // ------------------------------------------------------------ loop
  let raf = 0, last = performance.now(), running = false, blinkAt = 2;
  function size() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
    const shift = W < 700 ? Math.round(H * .05) : 0;
    cam.setViewOffset(W, H, 0, shift, W, H);
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000), t = now / 1000; last = now;
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) size();

    if (fly) {
      fly.t = Math.min(1, fly.t + dt / .6); const k = fly.t * fly.t * (3 - 2 * fly.t);
      cam.position.lerpVectors(fly.from, fly.to, k);
      tmp.lerpVectors(fly.look, fly.toLook, k); cam.lookAt(tmp);
      if (fly.t >= 1) { const id = fly.id; fly = null; hooks.onPick?.(id); }
    } else {
      cam.position.lerp(camPose(), reduce ? 1 : 1 - Math.pow(.001, dt));
      cam.lookAt(target);
    }

    // idle life
    floatHeart.position.y = .45 + Math.sin(t * 2.2) * .05; floatHeart.rotation.y = t * 1.5;
    body.scale.set(1 + Math.sin(t * 2) * .02, 1 - Math.sin(t * 2) * .03, 1);
    body.lookAt(tmp.set(cam.position.x, mascot.position.y + .4, cam.position.z)); body.rotation.x = 0;
    blinkAt -= dt; const blink = blinkAt < 0 && blinkAt > -.12; if (blinkAt < -.12) blinkAt = 2 + Math.random() * 3;
    eyes.forEach((e) => e.scale.set(1, blink ? .15 : 1, 1));
    jarStars.children.forEach((s, i) => { s.rotation.y += dt * (.3 + (i % 3) * .2); });
    bulbs.forEach((b, i) => b.scale.setScalar(skyKind === "night" ? 1 + .25 * Math.sin(t * 2.5 + i) : 1));
    for (const [g, p] of bounce) {
      const np = p + dt / .45; const s = np < 1 ? Math.sin(np * Math.PI) * .18 : 0;
      g.scale.set(1 + s * .4, 1 + s, 1 + s * .4); if (np >= 1) { g.scale.set(1, 1, 1); bounce.delete(g); } else bounce.set(g, np);
    }
    // turntable
    armAngle += ((playing ? -.12 : .35) - armAngle) * Math.min(1, dt * 3); arm.rotation.y = armAngle;
    vinylSpeed += ((playing ? 3.5 : 0) - vinylSpeed) * Math.min(1, dt * 2); vinyl.rotation.y += vinylSpeed * dt;
    // weather
    if (rain.visible) { for (let i = 0; i < RAIN; i++) { const o = i * 6; rainPos[o + 1] -= dt * 6; rainPos[o + 4] -= dt * 6; if (rainPos[o + 4] < 2.1) resetDrop(i, 4.6); } rainGeo.attributes.position.needsUpdate = true; }
    if (snow.visible) { for (let i = 0; i < SNOW; i++) { const o = i * 3; snowPos[o + 1] -= dt * .45; snowPos[o] += Math.sin(t + i) * dt * .12; if (snowPos[o + 1] < 2.1) snowPos[o + 1] = 4.6; } snowGeo.attributes.position.needsUpdate = true; }

    renderer.render(scene, cam);
    // screen positions for the HTML labels
    if (hooks.onLabels) {
      const out = PICKS.map((p) => { tmp.set(...p.at).project(cam); return { ...p, x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, visible: tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 }; });
      tmp.set(mascot.position.x, mascot.position.y + 1.1, mascot.position.z).project(cam);
      hooks.onLabels(out, { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H });
    }
  }
  function start() { if (running) return; running = true; fly = null; size(); cam.position.copy(camPose()); last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (running) { stop(); running = "paused"; } } else if (running === "paused") { running = false; start(); } });

  setSky("auto");
  return {
    start, stop, choose, setWishes,
    setSky: (m) => setSky(m), setWeather,
    setPlaying(v) { playing = v; },
    picks: PICKS,
  };
}
