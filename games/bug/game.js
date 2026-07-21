import { startSession, submitScore, fetchLeaderboard } from './api.js';
import { renderLeaderboardList, initLeaderboardToggle } from '../../core/leaderboardUI.js';
import { triggerLossFlash } from '../../core/lossFlash.js';
import { pickRandom } from '../../core/pickRandom.js';
import { formatEndMessage } from '../../core/messageFormat.js';

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 360;
const SHIP_HALF_W = 10;
const SHIP_HALF_H = 12;

const GRAVITY = 55;
const MAIN_THRUST_ACCEL = 130;
const LATERAL_THRUST_ACCEL = 70;
const FUEL_MAX = 100;
const FUEL_BURN_RATE = 22;
const SAFE_VY = 45;
const SAFE_VX = 35;
const SAFE_SPEED_CAP = Math.hypot(SAFE_VX, SAFE_VY);
const FUEL_BONUS_MAX = 500;
const SOFTNESS_BONUS_MAX = 500;

// Должно совпадать с server/games.js.
const FUEL_DECAY_PER_LEVEL = 0.96;
const MULTIPLIER_START = 1;
const MULTIPLIER_STEP = 0.05;
const MULTIPLIER_MIN = 0.2;

const LEVEL_TRANSITION_MS = 1400;

const NICKNAME_RE = /^[A-Za-z0-9]{3,12}$/;

function fuelForLevel(level) {
  return FUEL_MAX * FUEL_DECAY_PER_LEVEL ** (level - 1);
}

function multiplierForLevel(level) {
  return Math.max(MULTIPLIER_MIN, MULTIPLIER_START - MULTIPLIER_STEP * (level - 1));
}

const LOSS_TAUNTS = {
  closeCall: [
    'Тютелька в тютельку — а звук был как у метеорита.',
    'Площадка твоя. Мягкости — нет.',
    'Ты попал точно в цель. Слишком быстро.',
    'Ещё чуть плавнее — и это была бы победа.',
    'Жук приземлился. Резковато. Очень резковато.',
    'Координаты идеальные. Тормоза — не очень.',
  ],
  missedSpot: [
    'Мягко сел. Не туда.',
    'Отличная посадка. Жаль, не на площадку.',
    'Жук цел, но не в том месте вселенной.',
    'Ты словно специально промахнулся, да ещё и красиво.',
    'Плавно, аккуратно, мимо цели.',
    'Посадка на пять баллов. Навигация — на два.',
  ],
  crash: [
    'Это был не жук, а метеорит.',
    'Жук встретился с рельефом. Рельеф победил.',
    'Взрыв было видно, наверное, с орбиты.',
    'Гравитация сегодня выиграла.',
    'Ремонту не подлежит. Как и твоей гордости.',
    'Классика: слишком быстро, слишком резко, слишком мимо.',
  ],
};

const WIN_TAUNTS = {
  shaky: [
    'Сел. Технически это победа.',
    'Жук на месте, топливо на нуле, гордость — тоже.',
    'Такую посадку одобрили бы не с первого раза.',
    'Еле-еле, но по правилам.',
    'Мягкая посадка — это громко сказано.',
    'Главное — он не взорвался. Уже успех.',
  ],
  solid: [
    'Чистая посадка, без драмы.',
    'Уверенно, аккуратно, по делу.',
    'Жук доволен пилотом.',
    'Ровная посадка — ровно то, что нужно.',
    'Хорошая работа. Без фейерверков, но надёжно.',
    'Топливо и нервы — почти в норме.',
  ],
  perfect: [
    'ИДЕАЛЬНАЯ посадка. Учебник можно закрывать.',
    'Пушинка коснулась бы земли грубее.',
    'Центр управления полётами аплодирует стоя.',
    'Топлива в запасе, скорость — почти ноль. Красота.',
    'Вот как надо. Остальные пусть смотрят и учатся.',
    'Это уже не игра, это мастерство.',
  ],
};

function pickLossTaunt(kind) {
  return pickRandom(LOSS_TAUNTS[kind]);
}

function pickWinTaunt(score) {
  if (score < 300) return pickRandom(WIN_TAUNTS.shaky);
  if (score < 700) return pickRandom(WIN_TAUNTS.solid);
  return pickRandom(WIN_TAUNTS.perfect);
}

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const STARS = Array.from({ length: 40 }, () => ({
  x: Math.random() * CANVAS_WIDTH,
  y: Math.random() * 200,
}));

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const fuelFillEl = document.getElementById('fuel-fill');
const startBtn = document.getElementById('start-btn');
const nicknameInput = document.getElementById('nickname');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const leaderboardList = document.getElementById('leaderboard-list');
const leaderboardToggle = document.getElementById('leaderboard-toggle');
const leaderboardPanel = document.getElementById('leaderboard-panel');
const thrustUpBtn = document.getElementById('thrust-up');
const thrustLeftBtn = document.getElementById('thrust-left');
const thrustRightBtn = document.getElementById('thrust-right');

const keys = { up: false, left: false, right: false };

let state = null;
let lastTime = 0;

// Рельеф — ломаная линия из случайных высот, кроме двух соседних точек,
// принудительно выровненных под площадку: без random walk на этом участке
// они и так остаются на одной высоте.
function generateTerrain() {
  const segments = 14;
  const segWidth = CANVAS_WIDTH / segments;
  const minH = 200;
  const maxH = 330;
  const padIndex = 3 + Math.floor(Math.random() * (segments - 6));

  const heights = [];
  let h = minH + Math.random() * (maxH - minH);
  for (let i = 0; i <= segments; i++) {
    if (i !== padIndex && i !== padIndex + 1) {
      h += (Math.random() - 0.5) * 60;
      h = Math.min(maxH, Math.max(minH, h));
    }
    heights.push(h);
  }

  const points = heights.map((y, i) => ({ x: i * segWidth, y }));
  const pad = { xStart: points[padIndex].x, xEnd: points[padIndex + 1].x, y: heights[padIndex] };
  return { points, pad };
}

function terrainHeightAt(terrain, x) {
  const pts = terrain.points;
  const segWidth = CANVAS_WIDTH / (pts.length - 1);
  let i = Math.floor(x / segWidth);
  i = Math.max(0, Math.min(pts.length - 2, i));
  const a = pts[i];
  const b = pts[i + 1];
  const t = (x - a.x) / (b.x - a.x || 1);
  return a.y + (b.y - a.y) * t;
}

function createShip(level) {
  return {
    x: CANVAS_WIDTH * (0.3 + Math.random() * 0.4),
    y: 24,
    vx: 0,
    vy: 0,
    fuel: fuelForLevel(level),
    thrustMain: false,
    thrustLeft: false,
    thrustRight: false,
  };
}

function createState() {
  return {
    terrain: generateTerrain(),
    ship: createShip(1),
    level: 1,
    totalScore: 0,
    sessionId: null,
    over: true,
    transitioning: false,
  };
}

function updatePhysics(dt) {
  const s = state.ship;
  const canThrust = s.fuel > 0;
  const thrustMain = keys.up && canThrust;
  const thrustLeft = keys.left && canThrust;
  const thrustRight = keys.right && canThrust;

  let ax = 0;
  let ay = GRAVITY;
  if (thrustMain) ay -= MAIN_THRUST_ACCEL;
  if (thrustLeft) ax -= LATERAL_THRUST_ACCEL;
  if (thrustRight) ax += LATERAL_THRUST_ACCEL;

  const activeCount = (thrustMain ? 1 : 0) + (thrustLeft ? 1 : 0) + (thrustRight ? 1 : 0);
  if (activeCount > 0) {
    s.fuel = Math.max(0, s.fuel - FUEL_BURN_RATE * activeCount * dt);
  }
  const fuelRatio = s.fuel / fuelForLevel(state.level);
  fuelFillEl.style.width = `${fuelRatio * 100}%`;
  fuelFillEl.style.background = fuelRatio < 0.25 ? 'var(--danger)' : 'var(--accent)';

  s.vx += ax * dt;
  s.vy += ay * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.x = Math.min(Math.max(s.x, SHIP_HALF_W), CANVAS_WIDTH - SHIP_HALF_W);

  s.thrustMain = thrustMain;
  s.thrustLeft = thrustLeft;
  s.thrustRight = thrustRight;

  const groundY = terrainHeightAt(state.terrain, s.x);
  if (s.y + SHIP_HALF_H >= groundY) {
    s.y = groundY - SHIP_HALF_H;
    handleTouchdown();
  }
}

function handleTouchdown() {
  const s = state.ship;
  const pad = state.terrain.pad;
  const onPad = s.x - SHIP_HALF_W >= pad.xStart && s.x + SHIP_HALF_W <= pad.xEnd;
  const speed = Math.hypot(s.vx, s.vy);
  const soft = Math.abs(s.vy) <= SAFE_VY && Math.abs(s.vx) <= SAFE_VX;
  const won = onPad && soft;

  if (won) {
    const softness = Math.max(0, 1 - speed / SAFE_SPEED_CAP);
    const fuelBonus = Math.round(FUEL_BONUS_MAX * (s.fuel / fuelForLevel(state.level)));
    const softnessBonus = Math.round(SOFTNESS_BONUS_MAX * softness);
    const levelScore = Math.round((fuelBonus + softnessBonus) * multiplierForLevel(state.level));
    state.totalScore += levelScore;
    scoreEl.textContent = String(state.totalScore);
    advanceLevel(levelScore);
    return;
  }

  const lossKind = onPad ? 'closeCall' : soft ? 'missedSpot' : 'crash';
  endGame(lossKind);
}

// Успешная посадка не завершает партию — переносит на следующий уровень с
// меньшим баком и меньшим множителем, счёт копится до первой аварии.
function advanceLevel(levelScore) {
  state.transitioning = true;

  const taunt = pickWinTaunt(levelScore);
  overlayMessage.textContent = formatEndMessage(
    taunt,
    `Уровень ${state.level} пройден — счёт: ${state.totalScore}`
  );
  overlay.hidden = false;

  setTimeout(() => {
    state.level += 1;
    state.terrain = generateTerrain();
    state.ship = createShip(state.level);
    state.transitioning = false;
    levelEl.textContent = String(state.level);
    overlay.hidden = true;

    lastTime = performance.now();
    requestAnimationFrame(loop);
    draw();
  }, LEVEL_TRANSITION_MS);
}

function draw() {
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = 'rgba(232, 238, 247, 0.6)';
  STARS.forEach((st) => ctx.fillRect(st.x, st.y, 1, 1));

  drawTerrain();
  drawShip(state.ship);
}

function drawTerrain() {
  const { points, pad } = state.terrain;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.lineTo(0, CANVAS_HEIGHT);
  ctx.closePath();
  ctx.fillStyle = '#1c2740';
  ctx.fill();

  ctx.strokeStyle = '#3a4a70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  ctx.strokeStyle = '#5ec8f2';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pad.xStart, pad.y);
  ctx.lineTo(pad.xEnd, pad.y);
  ctx.stroke();
}

function drawShip(s) {
  const x = s.x;
  const y = s.y;

  ctx.fillStyle = '#ffb454';
  if (s.thrustMain) {
    ctx.beginPath();
    ctx.moveTo(x - 5, y + SHIP_HALF_H);
    ctx.lineTo(x + 5, y + SHIP_HALF_H);
    ctx.lineTo(x, y + SHIP_HALF_H + 12);
    ctx.closePath();
    ctx.fill();
  }
  if (s.thrustLeft) {
    ctx.beginPath();
    ctx.moveTo(x + SHIP_HALF_W, y - 4);
    ctx.lineTo(x + SHIP_HALF_W, y + 4);
    ctx.lineTo(x + SHIP_HALF_W + 10, y);
    ctx.closePath();
    ctx.fill();
  }
  if (s.thrustRight) {
    ctx.beginPath();
    ctx.moveTo(x - SHIP_HALF_W, y - 4);
    ctx.lineTo(x - SHIP_HALF_W, y + 4);
    ctx.lineTo(x - SHIP_HALF_W - 10, y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#e8eef7';
  ctx.fillRect(x - SHIP_HALF_W, y - SHIP_HALF_H, SHIP_HALF_W * 2, SHIP_HALF_H * 2);

  ctx.fillStyle = '#5ec8f2';
  ctx.fillRect(x - SHIP_HALF_W + 3, y - SHIP_HALF_H + 4, SHIP_HALF_W * 2 - 6, 6);
}

function loop(now) {
  if (!state || state.over || state.transitioning) return;
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  updatePhysics(dt);
  draw();
  requestAnimationFrame(loop);
}

async function startGame() {
  const nickname = nicknameInput.value;
  if (!NICKNAME_RE.test(nickname)) {
    overlayMessage.textContent = 'ник: 3-12 латинских букв или цифр';
    overlay.hidden = false;
    return;
  }

  startBtn.disabled = true;
  let session;
  try {
    session = await startSession();
  } catch (err) {
    overlayMessage.textContent = err.message;
    overlay.hidden = false;
    startBtn.disabled = false;
    return;
  }

  state = createState();
  state.sessionId = session.sessionId;
  state.over = false;
  scoreEl.textContent = '0';
  levelEl.textContent = '1';
  fuelFillEl.style.width = '100%';
  fuelFillEl.style.background = 'var(--accent)';
  overlay.hidden = true;

  lastTime = performance.now();
  requestAnimationFrame(loop);
  draw();
}

// Побеждать здесь нечего — партия всегда заканчивается аварией, только на
// каком-то уровне. Счёт — это сумма всех уровней, пройденных до неё.
async function endGame(lossKind) {
  state.over = true;
  const finalScore = state.totalScore;
  const levelsCompleted = state.level - 1;
  const sessionId = state.sessionId;

  triggerLossFlash();
  const taunt = pickLossTaunt(lossKind);

  draw();
  overlayMessage.textContent = formatEndMessage(taunt, `Уровень: ${state.level} · Счёт: ${finalScore}`);
  overlay.hidden = false;
  startBtn.disabled = false;

  try {
    await submitScore(sessionId, nicknameInput.value, finalScore, { won: false, levelsCompleted });
    await renderLeaderboard();
  } catch (err) {
    overlayMessage.textContent += ` (счёт не отправлен: ${err.message})`;
  }
}

function setKey(code, value) {
  if (code === 'ArrowUp' || code === 'KeyW') keys.up = value;
  if (code === 'ArrowLeft' || code === 'KeyA') keys.left = value;
  if (code === 'ArrowRight' || code === 'KeyD') keys.right = value;
}

const CONTROL_CODES = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyD'];

function handleKeydown(e) {
  if (!CONTROL_CODES.includes(e.code)) return;
  e.preventDefault();
  setKey(e.code, true);
}

function handleKeyup(e) {
  if (!CONTROL_CODES.includes(e.code)) return;
  setKey(e.code, false);
}

// Кнопки на экране — держать пальцем/мышью, работает и на телефоне.
function bindTouchButton(btn, key) {
  const activate = (e) => {
    e.preventDefault();
    keys[key] = true;
  };
  const deactivate = () => {
    keys[key] = false;
  };
  btn.addEventListener('pointerdown', activate);
  btn.addEventListener('pointerup', deactivate);
  btn.addEventListener('pointerleave', deactivate);
  btn.addEventListener('pointercancel', deactivate);
}

async function renderLeaderboard() {
  let entries;
  try {
    entries = await fetchLeaderboard();
  } catch {
    return;
  }
  renderLeaderboardList(leaderboardList, entries);
}

state = createState();
draw();
startBtn.addEventListener('click', startGame);
document.addEventListener('keydown', handleKeydown);
document.addEventListener('keyup', handleKeyup);
bindTouchButton(thrustUpBtn, 'up');
bindTouchButton(thrustLeftBtn, 'left');
bindTouchButton(thrustRightBtn, 'right');
initLeaderboardToggle(leaderboardToggle, leaderboardPanel);
renderLeaderboard();
