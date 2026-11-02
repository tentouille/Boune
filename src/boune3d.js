// ============================================================
//  Boune en 3D : le modèle models/boune.glb, animé par son squelette.
//
//  Ce module ne touche pas à la logique : il lit l'état que main.js
//  pose sur #bunny (classe d'état, data-phase, blink, twitch, angry,
//  accessoires .on) et en déduit une pose. Les animations CSS de
//  #sprite (bonds, écrasement, balancement) s'appliquent au canvas
//  comme elles s'appliquaient au dessin.
//
//  Si WebGL ou le modèle manquent, ou si « Boune en 3D » est décoché
//  dans les réglages, le dessin SVG reste affiché.
// ============================================================

import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const SETTINGS_KEY = "boune.settings.v1";
const bunny = document.getElementById("bunny");
const sprite = document.getElementById("sprite");

// Taille CSS du canvas : plus grand que la boîte de 110 px pour que les
// oreilles et la pose dressée débordent sans être coupées.
const CW = 150, CH = 160;
const FPS = { move: 30, idle: 20, sleep: 8 };

// États où Boune se dresse sur ses pattes arrière (cf. UPRIGHT dans main.js)
const UPRIGHT = new Set(["surprised", "push", "held", "lookout", "treat", "groom", "alert"]);
const MOVING = new Set(["walk", "chase", "mission", "zoom", "follow", "binky", "fall", "held"]);
const STATES = ["idle", "walk", "chase", "mission", "zoom", "follow", "binky", "flop", "groom", "chin",
  "thump", "sleep", "happy", "held", "fall", "land", "activity", "nibble", "push", "surprised", "lookout",
  "poop", "drink", "eat", "treat", "attentive", "solicit", "alert"];

// Repères mesurés sur le modèle (espace du modèle : +Z = avant, +Y = haut)
const EYES = [
  { p: [-0.073, 0.611, 0.410], n: [-0.59, 0.05, 0.81] },
  { p: [0.103, 0.614, 0.384], n: [0.68, 0.05, 0.73] },
];

let enabled = readEnabled();
let ready = false;
let renderer, scene, camera, canvas;
let turn, rear, model;          // turn : orientation ; rear : se dresser (pivot aux pattes arrière)
const B = {};                   // os utiles
const rest = new Map();         // os -> { q: quaternion local au repos, p: quaternion parent (espace modèle) }
let lids = [], acc = {};
let look = { x: 0, y: 0 };      // regard vers le curseur (-1..1)
let lastFrame = 0, t0 = performance.now();
let twitchSide = 0, twitchT = -10;
let pixelKey = "";
let running = false;

// Pose courante (lissée) et cible
const P = mkPose(), T = mkPose();
function mkPose() {
  return { rear: 0, yaw: 0, roll: 0, headP: 0, headY: 0, headR: 0, earP: 0, earS: 0,
           frontP: 0, hindP: 0, lid: 0 };
}

function readEnabled() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (s && s.model3d === false) return false; } catch {}
  return true;
}

// ---------- Mise en place ----------
async function init() {
  canvas = document.createElement("canvas");
  canvas.id = "gl";
  canvas.setAttribute("aria-hidden", "true");
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch { return; }                   // pas de WebGL : on garde le dessin
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6ee, 0x9a8478, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(0.6, 1.6, 2.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe3ec, 0.9);
  rim.position.set(-1.5, 1.2, -1.5);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(22, CW / CH, 0.1, 20);
  camera.position.set(0, 0.52, 3.0);
  camera.lookAt(0, 0.5, 0);

  let gltf;
  try { gltf = await new GLTFLoader().loadAsync("models/boune.glb"); }
  catch (e) { console.warn("Boune 3D : modèle introuvable", e); return; }

  model = gltf.scene;
  model.traverse((o) => {
    if (o.isBone) B[o.name] = o;
    if (o.isMesh) { o.frustumCulled = false; }
  });
  // Pivot pour se dresser : sous les pattes arrière
  const pivotZ = -0.17;
  rear = new THREE.Group();
  rear.position.set(0, 0, pivotZ);
  model.position.set(0, 0, -pivotZ);
  rear.add(model);
  turn = new THREE.Group();
  turn.add(rear);
  scene.add(turn);
  // Centre la silhouette dans la boîte de 110 px (le nez à droite, comme le dessin)
  turn.position.set(-0.03, 0, 0);
  turn.scale.setScalar(1.12);

  model.updateMatrixWorld(true);
  const inv = new THREE.Quaternion();
  model.getWorldQuaternion(inv).invert();
  for (const b of Object.values(B)) {
    const pq = new THREE.Quaternion();
    b.parent.getWorldQuaternion(pq);
    rest.set(b, { q: b.quaternion.clone(), p: inv.clone().multiply(pq) });
  }

  buildLids();
  buildAccessories();

  sprite.appendChild(canvas);
  ready = true;
  applyEnabled();
  new MutationObserver(syncAccessories).observe(bunny, { subtree: true, attributes: true, attributeFilter: ["class"] });
  syncAccessories();
}

function applyEnabled() {
  bunny.classList.toggle("three", ready && enabled);
  if (ready && enabled && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); }
}

// Paupières : un petit dôme couleur pelage + un trait, posés sur chaque œil
function buildLids() {
  const head = B["tripoHead_1"];
  if (!head) return;
  const fur = new THREE.MeshStandardMaterial({ color: 0xb8a296, roughness: 1 });
  const line = new THREE.MeshBasicMaterial({ color: 0x2a1d18 });
  for (const e of EYES) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), fur);
    dome.rotation.x = Math.PI / 2;      // le dôme regarde vers +Z local
    dome.scale.set(1, 0.32, 0.9);
    const crease = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0036, 6, 16, Math.PI), line);
    crease.rotation.z = Math.PI;        // arc vers le bas : œil fermé paisible
    crease.position.set(0, 0.003, 0.0075);
    g.add(dome, crease);
    // Position/orientation dans l'espace du modèle puis rattachées à l'os de la tête
    const p = new THREE.Vector3(...e.p), n = new THREE.Vector3(...e.n).normalize();
    g.position.copy(p).addScaledVector(n, -0.004);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    model.add(g);
    model.updateMatrixWorld(true);
    head.attach(g);
    g.visible = false;
    lids.push(g);
  }
}

// Accessoires gagnés avec les niveaux : écharpe (3), nœud (5), couronne de fleurs (8)
function buildAccessories() {
  const spine = B["tripoSpine_0"], head = B["tripoHead_1"];
  if (!spine || !head) return;
  const pink = new THREE.MeshStandardMaterial({ color: 0xff7b9c, roughness: 0.8 });
  const deep = new THREE.MeshStandardMaterial({ color: 0xff5c85, roughness: 0.7 });
  const place = (obj, bone, pos, rot) => {
    obj.position.set(...pos);
    if (rot) obj.rotation.set(...rot);
    model.add(obj);
    model.updateMatrixWorld(true);
    bone.attach(obj);
    obj.visible = false;
    return obj;
  };

  // Écharpe : le cou disparaît sous la crinière, on ne voit que le nœud et
  // les deux pans sur le poitrail (mesuré sur le modèle)
  const scarf = new THREE.Group();
  const knot0 = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), pink);
  knot0.scale.set(1.1, 0.8, 0.7);
  knot0.position.set(-0.04, 0, 0.325);
  const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.022), pink);
  tail1.position.set(-0.07, -0.08, 0.31);
  tail1.rotation.set(0.25, -0.45, -0.3);
  const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.022), deep);
  tail2.position.set(-0.01, -0.07, 0.32);
  tail2.rotation.set(0.25, -0.2, 0.2);
  scarf.add(knot0, tail1, tail2);
  acc.scarf = place(scarf, spine, [0.01, 0.42, 0.06]);

  const bow = new THREE.Group();
  const wing = new THREE.ConeGeometry(0.045, 0.085, 12);
  const l = new THREE.Mesh(wing, pink); l.rotation.z = -Math.PI / 2; l.position.x = -0.042;
  const r = new THREE.Mesh(wing, pink); r.rotation.z = Math.PI / 2; r.position.x = 0.042;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), deep);
  bow.add(l, r, knot);
  // Nœud au pied de l'oreille côté caméra
  acc.bow = place(bow, head, [-0.075, 0.8, 0.31], [0, -0.9, 0.35]);

  const crown = new THREE.Group();
  const colors = [0xffd166, 0xff8fab, 0xa0e7e5, 0xff8fab, 0xffd166, 0xc3f0ca, 0xff8fab];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    f.position.set(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.12);
    crown.add(f);
  });
  acc.crown = place(crown, head, [0.01, 0.79, 0.27], [0.1, 0, 0]);
}

function syncAccessories() {
  if (!ready) return;
  for (const k of ["scarf", "bow", "crown"]) {
    if (acc[k]) acc[k].visible = !!bunny.querySelector(`.acc-${k}.on`);
  }
}

// ---------- Squelette ----------
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
// Tourne un os autour des axes du modèle (x : tangage, y : lacet, z : roulis)
function pose(name, x = 0, y = 0, z = 0) {
  const b = B[name];
  if (!b) return;
  const r = rest.get(b);
  _q.setFromEuler(_e.set(x, y, z, "YXZ"));
  // q_local = P⁻¹ · R · P · q_repos
  b.quaternion.copy(r.p).invert().multiply(_q).multiply(r.p).multiply(r.q);
}

function currentState() {
  for (const s of STATES) if (bunny.classList.contains(s)) return s;
  return "idle";
}

// Cible de pose pour l'état courant ; t en secondes
function target(s, phase, t) {
  Object.assign(T, mkPose());
  const up = UPRIGHT.has(s);
  T.yaw = up ? 0.5 : 0.95;               // de profil vers la droite, un peu de trois-quarts
  if (up) { T.rear = 0.62; T.frontP = 0.3; T.hindP = 0.55; T.headP = 0.25; }

  // Regard : la tête suit le curseur (de face s'il est derrière elle)
  T.headY = -(1 - look.x) * 0.28;
  T.headP += clamp(look.y, -1, 1) * 0.18;

  const wave = (hz, a = 1) => Math.sin(t * Math.PI * 2 * hz) * a;

  switch (s) {
    case "sleep":
      T.headP = 0.42; T.headY = -0.1; T.earP = -0.95; T.earS = 0.25; T.lid = 1; break;
    case "flop":
      T.roll = 0.45; T.headP = 0.3; T.headR = 0.2; T.earP = -1.0; T.lid = 1; break;
    case "happy":
    case "treat":
      T.lid = 1; T.earP = -0.25 + wave(2.8, 0.25); T.headR = wave(1.4, 0.08); break;
    case "held":
      T.rear = 0.95; T.yaw = 0.25; T.hindP = 0.35 + wave(1.4, 0.25); T.frontP = 0.3 + wave(1.1, 0.3);
      T.earP = -0.15; break;
    case "fall":
      T.rear = 0.5; T.earP = 0.35; T.frontP = -0.8; break;
    case "groom":
      T.frontP = -0.35 + wave(2.4, 0.3); T.headP = 0.35 + wave(2.4, 0.08); T.headY = -0.25; T.lid = 1; break;
    case "push":
      T.rear = 0.45; T.yaw = 0.9; T.frontP = -0.6 + wave(2.8, 0.25); T.earP = -0.5; T.headP = 0.1; break;
    case "surprised":
    case "alert":
      T.earP = 0.25; T.headP = -0.05; T.headY = -0.35; break;
    case "lookout":
      T.earP = 0.15; T.earS = wave(0.4, 0.3); T.headY = wave(0.2, 0.45) - 0.2; T.headP = -0.05; break;
    case "nibble":
    case "drink":
    case "eat":
      T.headP = 0.5 + wave(s === "nibble" ? 4.5 : 3.1, 0.1); T.earP = -0.25; T.headY = 0.1; break;
    case "activity":
      T.headP = 0.32 + wave(0.45, 0.06); T.headY = 0.05; T.earP = -0.1; break;
    case "chin":
      T.headP = 0.48 + wave(3.1, 0.12); T.headY = 0.12 + wave(3.1, 0.06); T.earP = -0.35; break;
    case "thump":
      T.earP = 0.3; T.hindP = wave(9, 0.25); break;
    case "solicit":
      T.headP = 0.3; T.headY = -0.35; T.earP = -0.3; T.yaw = 0.8; break;
    case "attentive":
      T.headY = -0.55; T.earP = 0.15; T.headP = 0.05; break;
    case "binky":
      T.headY = wave(1.7, 0.3); T.earP = wave(3.3, 0.4); break;
    case "poop":
      T.earP = -0.25; T.headP = 0.08; break;
  }

  // Bonds : oreilles et pattes selon la phase
  if (phase === "crouch") { T.earP -= 0.2; T.headP += 0.12; T.frontP -= 0.1; }
  if (phase === "air") { T.earP -= 0.75; T.headP -= 0.12; T.frontP = -0.75; T.hindP = -0.7; }
  if (phase === "land") { T.earP -= 0.1; T.frontP = 0.2; }

  if (bunny.classList.contains("angry")) T.earP = Math.min(T.earP, -0.8);
  if (bunny.classList.contains("blink") && !T.lid) T.lid = 1;

  // Petit frémissement permanent des oreilles et du museau
  if (s !== "sleep" && s !== "flop") {
    T.earP += Math.sin(t * 1.7) * 0.04;
    T.headP += Math.max(0, Math.sin(t * Math.PI * 2 / 1.8)) * 0.012;
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function apply(t) {
  turn.rotation.set(0, P.yaw, 0);
  rear.rotation.set(-P.rear, 0, P.roll);

  // Le corps reste posé : on compense le cabrage sur les pattes arrière
  pose("bone_1", P.rear * 0.85 + P.hindP * 0.3);
  pose("tripo1_Left_Limb_0", P.hindP * 0.6);
  pose("tripo1_Right_Limb_0", P.hindP * 0.6);

  // Pattes avant : rentrées contre le torse quand elle est dressée
  pose("tripo0_Left_Limb_0", P.frontP);
  pose("tripo0_Right_Limb_0", P.frontP);

  // Tête : un peu au cou, l'essentiel à la tête (et le corps cabré se rattrape)
  const hp = P.headP + P.rear * 0.55;
  pose("tripoHead_0", hp * 0.35, P.headY * 0.4, P.headR * 0.5);
  pose("tripoHead_1", hp * 0.65, P.headY * 0.6, P.headR * 0.5);

  // Oreilles : tangage (vers l'arrière < 0) + écartement, et la petite secousse « twitch »
  const tw = (side) => (twitchSide === side ? Math.sin(Math.min(1, (t - twitchT) / 0.5) * Math.PI * 2) * 0.35 : 0);
  pose("bone_19", P.earP + tw(1), 0, -P.earS);
  pose("bone_20", P.earP * 0.5);
  pose("tripoHead_2", P.earP + tw(2), 0, P.earS);
  pose("tripoHead_3", P.earP * 0.5);

  for (const l of lids) l.visible = P.lid > 0.5;
}

let lastTwitchClass = "";
function frame(now) {
  if (!ready || !enabled) { running = false; return; }
  if (document.hidden) { setTimeout(() => requestAnimationFrame(frame), 500); return; }
  requestAnimationFrame(frame);

  const s = currentState();
  const phase = bunny.dataset.phase || "";
  const fps = s === "sleep" ? FPS.sleep : (MOVING.has(s) || phase) ? FPS.move : FPS.idle;
  if (now - lastFrame < 1000 / fps - 2) return;
  const dt = lastFrame ? Math.min(0.25, (now - lastFrame) / 1000) : 1;
  lastFrame = now;
  const t = (now - t0) / 1000;

  const tc = bunny.classList.contains("twitch") ? 1 : bunny.classList.contains("twitch-r") ? 2 : 0;
  const key = tc ? "t" + tc : "";
  if (key && key !== lastTwitchClass) { twitchSide = tc; twitchT = t; }
  lastTwitchClass = key;

  target(s, phase, t);
  // Lissage : rapide pendant les bonds, plus doux au repos
  const k = 1 - Math.exp(-dt * (phase || MOVING.has(s) ? 18 : 9));
  for (const n in P) P[n] += (T[n] - P[n]) * (n === "lid" ? 1 : k);

  resize();
  apply(t);
  renderer.render(scene, camera);
}

// Résolution du canvas = taille affichée (taille réglée × écran HiDPI)
function resize() {
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--size")) || 1;
  const dpr = window.devicePixelRatio || 1;
  const k = `${size}|${dpr}`;
  if (k === pixelKey) return;
  pixelKey = k;
  renderer.setPixelRatio(Math.min(3, dpr * size));
  renderer.setSize(CW, CH, false);
}

// ---------- Liens avec main.js et les réglages ----------
window.boune3d = {
  // dx, dy : position du curseur (-1..1), dx > 0 = devant elle
  look(dx, dy) { look.x = clamp(dx, -1, 1); look.y = clamp(dy, -1, 1); },
};

if (window.__TAURI__?.event) {
  window.__TAURI__.event.listen("settings-changed", ({ payload }) => {
    if (!payload || payload.model3d == null) return;
    enabled = payload.model3d !== false;
    applyEnabled();
  });
}

init();
