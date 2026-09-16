// ============================================================
//  Boune — cerveau du lapin
//  Machine à états simple + quelques timers. Tout est pensé
//  pour rester léger : une seule boucle à 30 fps qui ne fait
//  rien quand Boune ne bouge pas, et des sondages IPC lents.
// ============================================================

const { getCurrentWindow, currentMonitor, availableMonitors, PhysicalPosition } = window.__TAURI__.window;
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ----- Réglages (à ajuster librement) -----
const CFG = {
  winW: 240, winH: 260,            // taille logique de la fenêtre (cf. tauri.conf.json)
  tickMs: 33,                      // ~30 fps pour les déplacements
  cursorPollMs: 100,               // sondage souris globale (10 Hz)
  fgPollMs: 2000,                  // sondage fenêtre active
  hopSpeed: 2.6,                   // px logiques / tick en balade
  chaseSpeed: 4.2,
  missionSpeed: 6,
  thinkDelay: [2500, 9000],        // pause entre deux idées (ms)
  sleepAfterUserIdleMs: 6 * 60e3,  // dort si la souris ne bouge plus
  napChance: 0.04,                 // chance de faire une sieste à chaque idée
  napDuration: [4 * 60e3, 12 * 60e3],
  nibbleChance: 0.10,
  chaseChance: 0.22,
  chaseRadius: 380,                // px logiques
  scrollPatterns: /tiktok|reels|shorts/i,
  scrollOn: true,
  scrollLimitSec: 180,             // temps de doom-scroll toléré
  scrollGraceSec: 30,              // reset du compteur après X s ailleurs
  closeCooldownMs: 10 * 60e3,
  activityChance: 0.06,            // activités longues (lecture, musique…)
  chatter: 1,                      // multiplicateur des petites phrases
  size: 1,
};

// Réglages utilisateur (fenêtre Réglages) : surcharge CFG
const SETTINGS_KEY = "boune.settings.v1";
function applySettings(s) {
  if (!s) return;
  if (s.speed) CFG.hopSpeed = s.speed;
  if (s.chatter != null) CFG.chatter = s.chatter;
  if (s.nap != null) CFG.napChance = s.nap;
  if (s.idleMin) CFG.sleepAfterUserIdleMs = s.idleMin * 60e3;
  if (s.scrollOn != null) CFG.scrollOn = s.scrollOn;
  if (s.scrollMin) CFG.scrollLimitSec = s.scrollMin * 60;
  if (s.cooldownMin) CFG.closeCooldownMs = s.cooldownMin * 60e3;
  if (s.patterns != null) {
    const words = s.patterns.split(",").map((w) => w.trim()).filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    CFG.scrollPatterns = words.length ? new RegExp(words.join("|"), "i") : /$^/;
  }
  if (s.size) {
    CFG.size = s.size;
    document.documentElement.style.setProperty("--size", s.size);
  }
}
try { applySettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); } catch {}

// ----- Répliques -----
const SAY = {
  hello: ["Coucou ! Je suis Boune 🐰", "Re-coucou !", "Me revoilà !"],
  pet: ["Hihi ♥", "Encore !", "*ronron de lapin*", "Tu es gentil ♥", "Mes oreilles ! ♥", "♥ ♥ ♥", "*ferme les yeux de bonheur*"],
  petSpam: ["Doucement !", "Ça chatouille !", "Hé ho !", "*s'ébouriffe*"],
  wake: ["Mmh... encore 5 minutes...", "Zzz... hein ?!", "*baille* ... quoi ?", "J'étais en plein rêve de carottes..."],
  sleepy: ["*baille*", "Je vais faire une petite sieste...", "Zzz...", "*s'installe confortablement*"],
  idle: ["*renifle*", "...", "*se gratte l'oreille*", "Il fait beau dehors ?", "*regarde le curseur*", "*remue le nez*", "Tu travailles bien ?", "*fixe le vide*"],
  chase: ["?", "C'est quoi ça ?", "*chasse le curseur*", "Attrapé ! ...ou pas.", "*renifle le curseur*"],
  held: ["Hé !", "Repose-moi !", "Wooo", "*pattes qui pendouillent*", "Où on va ?"],
  land: ["*pouf*", "Ouf.", "*s'ébroue*", "Encore !"],
  back: ["Te revoilà ! ♥", "Tu m'as manqué !", "*saute de joie* Coucou !", "Enfin ! Je m'ennuyais."],
  scrollAlert: (m) => [`Hé ! Ça fait ${m} min de scroll... 🐰`, `${m} min de Reels ?! Allez, ça suffit.`, `Bon. ${m} minutes. Je m'en occupe.`],
  scrollDone: ["Et hop, minimisé ! Tu peux le reprendre, promis 😌", "Voilà. Ta cervelle me dira merci.", "*époussette ses pattes* Fait."],
  scrollAbort: ["Bon, d'accord...", "Ah, tu as changé toi-même. Parfait."],
  levelUp: (l) => `Niveau ${l} ! ✨`,
  unlock: { 3: "Une écharpe ! Trop chou 🧣", 5: "Un nœud ! Je suis magnifique 🎀", 8: "Une couronne de fleurs ! 🌸" },
};

const NIBBLES = [
  { text: "*crunch* ...oups, c'était important ce câble ?", svg: cable("#4a5568") },
  { text: "*grignote* ...ta souris marche encore ?", svg: cable("#6b7280") },
  { text: "*crounch crounch* 🥕", svg: carrot() },
  { text: "*miam* c'était à toi ce cookie ? 🍪", svg: cookie() },
  { text: "*mâchouille le câble d'alim* ...ça pique un peu.", svg: cable("#1f2937") },
  { text: "*grignote un coin de la barre des tâches*", svg: cable("#3b82f6") },
];

// Activités longues : Boune s'occupe un moment, un clic l'interrompt
const ACTIVITIES = [
  { start: "*ouvre un livre*", end: "*referme le livre* ...la fin était triste.", svg: book(), fx: null, dur: [60e3, 180e3] },
  { start: "*met de la musique*", end: "*range son casque* Ça donne la pêche !", svg: radio(), fx: "♪", dur: [60e3, 150e3] },
  { start: "*plante une carotte*", end: "*arrose la carotte* Elle poussera un jour.", svg: sprout(), fx: null, dur: [50e3, 120e3] },
  { start: "*regarde par la fenêtre*", end: "*soupire* Il y avait un oiseau.", svg: null, fx: null, dur: [40e3, 90e3] },
];
function book() {
  return `<svg viewBox="0 0 80 34"><path d="M20 6 h22 v24 h-22 z" fill="#fde68a" stroke="#d6a84a"/><path d="M42 6 h22 v24 h-22 z" fill="#fef3c7" stroke="#d6a84a"/><path d="M25 12 h12 M25 17 h12 M25 22 h9 M47 12 h12 M47 17 h12" stroke="#c7b27a" stroke-width="1.2"/></svg>`;
}
function radio() {
  return `<svg viewBox="0 0 80 34"><rect x="18" y="8" width="44" height="22" rx="4" fill="#94a3b8" stroke="#64748b"/><circle cx="30" cy="19" r="6" fill="#334155"/><circle cx="50" cy="19" r="6" fill="#334155"/><path d="M40 8 l10 -6" stroke="#64748b" stroke-width="2"/></svg>`;
}
function sprout() {
  return `<svg viewBox="0 0 80 34"><rect x="20" y="22" width="40" height="10" rx="3" fill="#a16207"/><path d="M40 22 v-10" stroke="#4ade80" stroke-width="2.5"/><path d="M40 16 q-8 -8 -12 -2 q6 6 12 2z M40 12 q8 -8 12 -2 q-6 6 -12 2z" fill="#4ade80"/></svg>`;
}

function cable(color) {
  return `<svg viewBox="0 0 80 34"><path d="M2 22 q14 -22 28 0 t28 0" stroke="${color}" stroke-width="3.5" fill="none" stroke-linecap="round"/><rect x="58" y="14" width="18" height="13" rx="2.5" fill="#cbd5e1" stroke="#94a3b8"/><rect x="62" y="10" width="10" height="5" fill="#94a3b8"/></svg>`;
}
function carrot() {
  return `<svg viewBox="0 0 80 34"><path d="M8 26 L58 8 L62 18 Z" fill="#fb923c"/><path d="M58 8 l8 -6 M60 10 l10 -2 M56 7 l2 -9" stroke="#4ade80" stroke-width="3" stroke-linecap="round"/><path d="M20 22 l4 -3 M32 17 l4 -3" stroke="#f97316" stroke-width="1.5"/></svg>`;
}
function cookie() {
  return `<svg viewBox="0 0 80 34"><circle cx="40" cy="18" r="14" fill="#d9a066"/><circle cx="34" cy="14" r="2.2" fill="#5b3a29"/><circle cx="45" cy="20" r="2.2" fill="#5b3a29"/><circle cx="38" cy="24" r="1.8" fill="#5b3a29"/><circle cx="46" cy="12" r="1.6" fill="#5b3a29"/></svg>`;
}

// ----- Sauvegarde / progression -----
const SAVE_KEY = "boune.save.v1";
let save = loadSave();
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.xp === "number") return s;
  } catch {}
  return { xp: 0, pets: 0, nibbles: 0, closes: 0, minutes: 0, createdAt: Date.now() };
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}
function levelFor(xp) { return Math.floor(Math.sqrt(xp / 40)) + 1; }
function addXp(n) {
  const before = levelFor(save.xp);
  save.xp += n;
  const after = levelFor(save.xp);
  persist();
  if (after > before) {
    setTimeout(() => {
      burst("✨", 5);
      say(SAY.unlock[after] || SAY.levelUp(after), 3200);
      applyAccessories();
    }, 800);
  }
}
function applyAccessories() {
  const lvl = levelFor(save.xp);
  el.scarf.classList.toggle("on", lvl >= 3);
  el.bow.classList.toggle("on", lvl >= 5);
  el.crown.classList.toggle("on", lvl >= 8);
}

// ----- DOM -----
const el = {
  bunny: document.getElementById("bunny"),
  sprite: document.getElementById("sprite"),
  bubble: document.getElementById("bubble"),
  fx: document.getElementById("fx"),
  zzz: document.getElementById("zzz"),
  prop: document.getElementById("prop"),
  eyes: document.getElementById("eyes"),
  scarf: document.getElementById("acc-scarf"),
  bow: document.getElementById("acc-bow"),
  crown: document.getElementById("acc-crown"),
};

// ----- État -----
const win = getCurrentWindow();
let scale = 1;
let W = 240, H = 260;               // taille physique de la fenêtre
let ground = 0, minX = 0, maxX = 0; // limites physiques
let pos = { x: 0, y: 0 };           // position physique de la fenêtre
let state = "idle";
let facing = 1;                     // 1 = droite, -1 = gauche
let targetX = 0;
let vy = 0;
let nextThink = 0;
let cursor = { x: 0, y: 0, lastMove: Date.now() };
let hoverable = false;
let grab = null;                    // { dx, dy, t0, moved, sx, sy }
let petStreak = 0, petStreakT = 0;
let sleepUntil = 0;
let mission = null;                 // { hwnd, title }
let scroll = { sec: 0, hwnd: 0, lastMatch: 0, cooldownUntil: 0, fg: null };
let posPending = false;
let bubbleTimer = 0;
let stateTimer = 0;
let holdTimer = 0;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const L = (px) => px * scale; // logique -> physique
const now = () => Date.now();

// ----- Utilitaires visuels -----
function setState(s) {
  el.bunny.classList.remove(state);
  state = s;
  el.bunny.classList.add(s);
  clearTimeout(stateTimer);
  clearInterval(activityFx);
}
function setFacing(dir) {
  if (dir === facing) return;
  facing = dir;
  el.bunny.classList.toggle("facing-left", facing < 0);
  el.bunny.style.setProperty("--face", facing);
}
function say(text, ms = 2600) {
  el.bubble.textContent = text;
  el.bubble.classList.remove("hidden");
  el.bubble.style.animation = "none";
  void el.bubble.offsetWidth; // relance l'anim pop
  el.bubble.style.animation = "";
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => el.bubble.classList.add("hidden"), ms);
}
function burst(glyph, n = 3) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.textContent = glyph;
    s.style.left = 80 + rnd(-25, 45) + "px";
    s.style.animationDelay = i * 90 + "ms";
    el.fx.appendChild(s);
    setTimeout(() => s.remove(), 1600);
  }
}
function blink() {
  if (state === "sleep" || state === "happy") return;
  el.bunny.classList.add("blink");
  setTimeout(() => el.bunny.classList.remove("blink"), 130);
}
function twitch() {
  const c = Math.random() < 0.5 ? "twitch" : "twitch-r";
  el.bunny.classList.add(c);
  setTimeout(() => el.bunny.classList.remove(c), 600);
}
let posDirty = false;
function setWinPos(x, y) {
  pos.x = x; pos.y = y;
  posDirty = true;
  flushPos();
}
function flushPos() {
  if (posPending || !posDirty) return;
  posPending = true;
  posDirty = false;
  win.setPosition(new PhysicalPosition(Math.round(pos.x), Math.round(pos.y)))
    .catch(() => {})
    .finally(() => { posPending = false; flushPos(); });
}
// Centre horizontal de Boune (physique)
const centerX = () => pos.x + W / 2;

// ----- Initialisation -----
async function init() {
  scale = await win.scaleFactor();
  W = Math.round(CFG.winW * scale);
  H = Math.round(CFG.winH * scale);
  await computeBounds();

  const lastX = Number(localStorage.getItem("boune.lastX"));
  pos = { x: lastX ? clamp(lastX, minX, maxX) : maxX - L(140), y: ground };
  setWinPos(pos.x, pos.y);
  setInterval(() => { try { localStorage.setItem("boune.lastX", String(Math.round(pos.x))); } catch {} }, 15e3);
  await win.setIgnoreCursorEvents(true);

  applyAccessories();
  setState("idle");
  nextThink = now() + 4000;
  setTimeout(() => say(pick(SAY.hello)), 600);

  setInterval(tick, CFG.tickMs);
  setInterval(pollCursor, CFG.cursorPollMs);
  setInterval(pollForeground, CFG.fgPollMs);
  setInterval(() => { if (Math.random() < 0.6) blink(); }, 2800);
  setInterval(() => { if (state === "idle" && Math.random() < 0.35) twitch(); }, 5000);
  setInterval(() => { save.minutes++; addXp(1); }, 60e3);
  setInterval(computeBounds, 30e3); // si la barre des tâches / l'écran change
}

// Limites de l'écran sur lequel se trouve le curseur (multi-écrans)
async function boundsUnderCursor() {
  const mons = await availableMonitors().catch(() => []);
  const m = mons.find((m) =>
    cursor.x >= m.position.x && cursor.x < m.position.x + m.size.width &&
    cursor.y >= m.position.y && cursor.y < m.position.y + m.size.height);
  if (m) setBoundsFrom(m);
}
function setBoundsFrom(mon) {
  const wa = mon.workArea || {
    position: mon.position,
    size: { width: mon.size.width, height: mon.size.height - Math.round(48 * scale) },
  };
  minX = wa.position.x;
  maxX = wa.position.x + wa.size.width - W;
  ground = wa.position.y + wa.size.height - H;
}

async function computeBounds() {
  const mon = await currentMonitor().catch(() => null);
  if (!mon) return;
  setBoundsFrom(mon);
  if (state !== "held" && state !== "fall") {
    setWinPos(clamp(pos.x, minX, maxX), ground);
  }
}

// ----- Boucle principale (ne fait rien si Boune est immobile) -----
function tick() {
  const t = now();
  switch (state) {
    case "idle":
      if (t >= nextThink) think();
      break;
    case "walk":
    case "chase":
    case "mission": {
      const speed = L(state === "mission" ? CFG.missionSpeed : state === "chase" ? CFG.chaseSpeed : CFG.hopSpeed);
      const dx = targetX - pos.x;
      if (Math.abs(dx) <= speed) {
        setWinPos(clamp(targetX, minX, maxX), ground);
        arrived();
      } else {
        setFacing(Math.sign(dx));
        setWinPos(clamp(pos.x + Math.sign(dx) * speed, minX, maxX), ground);
      }
      break;
    }
    case "fall":
      vy += L(1.1);
      if (pos.y + vy >= ground) {
        setWinPos(pos.x, ground);
        vy = 0;
        setState("land");
        burst("💨", 1);
        if (Math.random() < 0.5) say(pick(SAY.land), 1500);
        stateTimer = setTimeout(() => { setState("idle"); nextThink = now() + rnd(1500, 4000); }, 320);
      } else {
        setWinPos(pos.x, pos.y + vy);
      }
      break;
    case "sleep":
      if (t >= sleepUntil) wake(false);
      break;
  }
}

function think() {
  const t = now();
  nextThink = t + rnd(...CFG.thinkDelay);
  const r = Math.random();
  const userIdle = t - cursor.lastMove > CFG.sleepAfterUserIdleMs;

  let acc = 0;
  if (userIdle || r < (acc += CFG.napChance)) return nap();
  if (r < (acc += CFG.nibbleChance)) return nibble();
  if (r < (acc += CFG.activityChance)) return activity();
  if (r < (acc += CFG.chaseChance) && cursorNear()) return chase();
  if (r < 0.6) return wander();
  if (r < 0.6 + 0.13 * CFG.chatter) return say(pick(SAY.idle), 2200);
  // sinon : rien, elle profite
}

// ----- Activités longues -----
let activityFx = 0;
function activity() {
  const a = pick(ACTIVITIES);
  if (a.svg) { el.prop.innerHTML = a.svg; el.prop.classList.remove("hidden"); }
  setState("activity");
  say(a.start, 2200);
  if (a.fx) activityFx = setInterval(() => burst(a.fx, 1), 1800);
  stateTimer = setTimeout(() => endActivity(a.end), rnd(...a.dur));
}
function endActivity(text) {
  clearInterval(activityFx);
  el.prop.classList.add("hidden");
  if (text) say(text, 3000);
  addXp(2);
  setState("idle");
  nextThink = now() + rnd(3000, 7000);
}

function wander() {
  const range = L(rnd(120, 420));
  targetX = clamp(pos.x + (Math.random() < 0.5 ? -range : range), minX, maxX);
  setState("walk");
}
function cursorNear() {
  return Math.abs(cursor.x - centerX()) < L(CFG.chaseRadius) && now() - cursor.lastMove < 8000;
}
function chase() {
  targetX = clamp(cursor.x - W / 2, minX, maxX);
  setState("chase");
}
function arrived() {
  if (state === "mission") return missionArrived();
  const wasChase = state === "chase";
  setState("idle");
  nextThink = now() + rnd(1800, 5000);
  if (wasChase && Math.random() < 0.6) say(pick(SAY.chase), 1800);
}

// ----- Sieste -----
function nap() {
  setState("sleep");
  el.zzz.classList.remove("hidden");
  sleepUntil = now() + rnd(...CFG.napDuration);
  say(pick(SAY.sleepy), 2000);
}
function wake(grumpy) {
  el.zzz.classList.add("hidden");
  setState("idle");
  nextThink = now() + rnd(3000, 7000);
  if (grumpy) say(pick(SAY.wake), 2400);
}

// ----- Grignotage -----
function nibble() {
  const n = pick(NIBBLES);
  el.prop.innerHTML = n.svg;
  el.prop.classList.remove("hidden");
  setState("nibble");
  stateTimer = setTimeout(() => {
    el.prop.classList.add("hidden");
    say(n.text, 3000);
    save.nibbles++;
    addXp(3);
    setState("idle");
    nextThink = now() + rnd(3000, 6000);
  }, rnd(4000, 7000));
}

// ----- Souris : sondage global, zone cliquable, regard -----
async function pollCursor() {
  const c = await invoke("cursor_pos").catch(() => null);
  if (!c) return;
  const [x, y] = c;
  if (Math.abs(x - cursor.x) > 1 || Math.abs(y - cursor.y) > 1) {
    const away = now() - cursor.lastMove;
    cursor.lastMove = now();
    if (away > 15 * 60e3 && state === "sleep") {
      wake(false);
      setState("surprised");
      say(pick(SAY.back), 2800);
      burst("♥", 2);
      stateTimer = setTimeout(() => { setState("idle"); nextThink = now() + 3000; }, 600);
    }
  }
  cursor.x = x; cursor.y = y;

  // Regard vers le curseur (petit décalage des yeux)
  if (state !== "sleep") {
    const dx = clamp((x - centerX()) / L(120), -1, 1) * 2.4 * facing;
    const dy = clamp((y - (pos.y + H - L(60))) / L(200), -1, 1) * 1.8;
    el.eyes.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Zone cliquable = uniquement le lapin (le reste de la fenêtre est traversé)
  if (state === "held") return;
  const r = el.bunny.getBoundingClientRect();
  const over =
    x >= pos.x + L(r.left - 6) && x <= pos.x + L(r.right + 6) &&
    y >= pos.y + L(r.top - 6) && y <= pos.y + L(r.bottom + 6);
  if (over !== hoverable) {
    hoverable = over;
    win.setIgnoreCursorEvents(!over).catch(() => {});
  }
}

// ----- Interaction directe : caresse / porter / lâcher -----
el.bunny.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  el.bunny.setPointerCapture(e.pointerId);
  grab = { dx: cursor.x - pos.x, dy: cursor.y - pos.y, t0: now(), moved: false, sx: cursor.x, sy: cursor.y };
});
el.bunny.addEventListener("pointermove", () => {
  if (!grab || grab.moved) return;
  if (Math.hypot(cursor.x - grab.sx, cursor.y - grab.sy) > L(6)) {
    grab.moved = true;
    startHold();
  }
});
el.bunny.addEventListener("pointerup", () => {
  if (!grab) return;
  const g = grab; grab = null;
  if (g.moved) drop();
  else pet();
});
el.bunny.addEventListener("pointercancel", () => { if (grab && grab.moved) drop(); grab = null; });
document.addEventListener("contextmenu", (e) => e.preventDefault());
el.bunny.addEventListener("pointerdown", (e) => {
  if (e.button === 2) invoke("open_settings").catch(() => {});
});

function startHold() {
  clearTimeout(stateTimer);
  el.zzz.classList.add("hidden");
  el.prop.classList.add("hidden");
  el.bunny.classList.remove("angry");
  mission = null;
  setState("held");
  say(pick(SAY.held), 1500);
  holdTimer = setInterval(async () => {
    if (!grab) return;
    const c = await invoke("cursor_pos").catch(() => null);
    if (!c) return;
    cursor.x = c[0]; cursor.y = c[1]; cursor.lastMove = now();
    setWinPos(cursor.x - grab.dx, cursor.y - grab.dy);
  }, 16);
}
async function drop() {
  clearInterval(holdTimer);
  vy = 0;
  await boundsUnderCursor();
  setWinPos(clamp(pos.x, minX, maxX), Math.min(pos.y, ground));
  if (pos.y >= ground - 1) {
    setState("idle");
    nextThink = now() + 2000;
  } else {
    setState("fall");
  }
}
function pet() {
  if (state === "sleep") { wake(true); return; }
  if (state === "mission" || state === "push" || state === "fall") return;
  if (state === "activity") { el.prop.classList.add("hidden"); }
  const t = now();
  petStreak = t - petStreakT < 1200 ? petStreak + 1 : 1;
  petStreakT = t;
  clearTimeout(stateTimer);
  el.prop.classList.add("hidden");
  setState("happy");
  if (petStreak > 6) {
    say(pick(SAY.petSpam), 1500);
    burst("💢", 1);
  } else {
    say(pick(SAY.pet), 1800);
    burst("♥", 3);
    save.pets++;
    addXp(petStreak <= 3 ? 5 : 1);
  }
  stateTimer = setTimeout(() => { setState("idle"); nextThink = now() + rnd(2000, 5000); }, 1400);
}

// ----- Veille anti doom-scroll -----
async function pollForeground() {
  const fg = await invoke("foreground_info").catch(() => null);
  const t = now();
  if (CFG.scrollOn && fg && fg.title !== "Boune" && CFG.scrollPatterns.test(fg.title)) {
    if (scroll.hwnd !== fg.hwnd) scroll.sec = 0;
    scroll.hwnd = fg.hwnd;
    scroll.sec += CFG.fgPollMs / 1000;
    scroll.lastMatch = t;
    scroll.fg = fg;
  } else if (t - scroll.lastMatch > CFG.scrollGraceSec * 1000) {
    scroll.sec = 0;
  }

  if (scroll.sec >= CFG.scrollLimitSec && t > scroll.cooldownUntil && !mission
      && state !== "held" && state !== "fall" && scroll.fg) {
    startMission(scroll.fg);
  }
}
function startMission(fg) {
  mission = { hwnd: fg.hwnd, title: fg.title };
  clearTimeout(stateTimer);
  el.zzz.classList.add("hidden");
  el.prop.classList.add("hidden");
  el.bunny.classList.add("angry");
  say(pick(SAY.scrollAlert(Math.round(scroll.sec / 60))), 3500);
  targetX = clamp(fg.x + fg.w / 2 - W / 2, minX, maxX);
  setState("mission");
}
async function missionArrived() {
  const m = mission;
  setState("push");
  const fg = await invoke("foreground_info").catch(() => null);
  const stillThere = !!fg && fg.hwnd === m.hwnd;
  stateTimer = setTimeout(async () => {
    let ok = false;
    if (stillThere) ok = await invoke("minimize_window", { hwnd: m.hwnd }).catch(() => false);
    el.bunny.classList.remove("angry");
    if (ok) {
      say(pick(SAY.scrollDone), 3500);
      burst("✨", 3);
      save.closes++;
      addXp(20);
    } else {
      say(pick(SAY.scrollAbort), 2500);
    }
    scroll.sec = 0;
    scroll.cooldownUntil = now() + CFG.closeCooldownMs;
    mission = null;
    setState("idle");
    nextThink = now() + rnd(3000, 6000);
  }, stillThere ? 1600 : 400);
}

// ----- Fenêtre de réglages -----
listen("settings-changed", ({ payload }) => applySettings(payload));
listen("reset-progress", () => {
  save = { xp: 0, pets: 0, nibbles: 0, closes: 0, minutes: 0, createdAt: now() };
  persist();
  applyAccessories();
  say("Tout oublié... on recommence ? 🐰", 3000);
});

// ----- Menu de la barre système -----
listen("tray", ({ payload }) => {
  switch (payload) {
    case "sleep":
      if (state === "sleep") wake(true);
      else if (state !== "held" && state !== "fall") { clearTimeout(stateTimer); el.prop.classList.add("hidden"); nap(); }
      break;
    case "home":
      clearTimeout(stateTimer); clearInterval(holdTimer); grab = null; mission = null;
      el.zzz.classList.add("hidden"); el.prop.classList.add("hidden"); el.bunny.classList.remove("angry");
      boundsUnderCursor().then(() => {
        setWinPos(clamp(cursor.x - W / 2, minX, maxX), ground);
      });
      setState("surprised");
      say("Téléportée !", 1500);
      stateTimer = setTimeout(() => { setState("idle"); nextThink = now() + 2000; }, 600);
      break;
    case "stats": {
      const lvl = levelFor(save.xp);
      const next = 40 * lvl * lvl;
      say(`Niv. ${lvl} · ${save.xp}/${next} XP · ♥ ${save.pets} câlins · 🍪 ${save.nibbles} grignotages · 🚫 ${save.closes} scrolls stoppés · ⏱ ${Math.round(save.minutes / 6) / 10} h ensemble`, 6000);
      break;
    }
  }
});

init();
