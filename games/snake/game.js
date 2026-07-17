import { startSession, submitScore, fetchLeaderboard } from './api.js';

const GRID_SIZE = 20;
const COLS = 24;
const ROWS = 20;
const POINTS_PER_FOOD = 10;
const START_TICK_MS = 220;
const MIN_TICK_MS = 150;
const SPEEDUP_EVERY = 5;
const TICK_STEP_MS = 10;

const NICKNAME_RE = /^[A-Za-z0-9]{3,12}$/;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = COLS * GRID_SIZE;
canvas.height = ROWS * GRID_SIZE;

const scoreEl = document.getElementById('score');
const startBtn = document.getElementById('start-btn');
const nicknameInput = document.getElementById('nickname');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const leaderboardList = document.getElementById('leaderboard-list');

let state = null;

function spawnFood(occupied) {
  let cell;
  do {
    cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (occupied.some((s) => s.x === cell.x && s.y === cell.y));
  return cell;
}

function createState() {
  const startX = Math.floor(COLS / 2);
  const startY = Math.floor(ROWS / 2);
  const snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];
  return {
    snake,
    direction: { x: 1, y: 0 },
    pendingDirection: { x: 1, y: 0 },
    food: spawnFood(snake),
    score: 0,
    tickMs: START_TICK_MS,
    sessionId: null,
    timerId: null,
    over: true,
  };
}

function draw() {
  ctx.fillStyle = '#0d1b12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#e8664c';
  ctx.fillRect(state.food.x * GRID_SIZE, state.food.y * GRID_SIZE, GRID_SIZE, GRID_SIZE);

  state.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? '#7ee787' : '#3fa34d';
    ctx.fillRect(seg.x * GRID_SIZE + 1, seg.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
  });
}

function restartTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(tick, state.tickMs);
}

function tick() {
  state.direction = state.pendingDirection;
  const head = state.snake[0];
  const next = { x: head.x + state.direction.x, y: head.y + state.direction.y };

  const hitWall = next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS;
  const hitSelf = state.snake.some((seg) => seg.x === next.x && seg.y === next.y);

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  state.snake.unshift(next);

  if (next.x === state.food.x && next.y === state.food.y) {
    state.score += POINTS_PER_FOOD;
    scoreEl.textContent = String(state.score);
    state.food = spawnFood(state.snake);
    if (state.snake.length % SPEEDUP_EVERY === 0 && state.tickMs > MIN_TICK_MS) {
      state.tickMs = Math.max(MIN_TICK_MS, state.tickMs - TICK_STEP_MS);
      restartTimer();
    }
  } else {
    state.snake.pop();
  }

  draw();
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
  overlay.hidden = true;
  draw();
  state.timerId = setInterval(tick, state.tickMs);
}

async function endGame() {
  clearInterval(state.timerId);
  state.over = true;
  const finalScore = state.score;
  const sessionId = state.sessionId;

  overlayMessage.textContent = `игра окончена — счёт: ${finalScore}`;
  overlay.hidden = false;
  startBtn.disabled = false;

  try {
    await submitScore(sessionId, nicknameInput.value, finalScore);
    await renderLeaderboard();
  } catch (err) {
    overlayMessage.textContent += ` (счёт не отправлен: ${err.message})`;
  }
}

// Ключи — e.code (физическая клавиша), а не e.key: e.key зависит от раскладки
// (например, при русской раскладке физическая W даёт e.key === 'ц'), из-за
// этого WASD не срабатывали, хотя стрелки работали.
const DIRECTIONS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

function handleKeydown(e) {
  if (!state || state.over) return;
  const next = DIRECTIONS[e.code];
  if (!next) return;
  if (next.x === -state.direction.x && next.y === -state.direction.y) return;
  state.pendingDirection = next;
}

async function renderLeaderboard() {
  let entries;
  try {
    entries = await fetchLeaderboard();
  } catch {
    return;
  }
  leaderboardList.textContent = '';
  entries.forEach((entry, i) => {
    const li = document.createElement('li');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'nickname';
    name.textContent = entry.nickname;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'score';
    scoreSpan.textContent = String(entry.score);

    li.append(rank, name, scoreSpan);
    leaderboardList.appendChild(li);
  });
}

state = createState();
draw();
startBtn.addEventListener('click', startGame);
document.addEventListener('keydown', handleKeydown);
renderLeaderboard();
