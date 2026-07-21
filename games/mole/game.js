import { startSession, submitScore, fetchLeaderboard } from './api.js';
import { renderLeaderboardList, initLeaderboardToggle } from '../../core/leaderboardUI.js';
import { triggerLossFlash } from '../../core/lossFlash.js';
import { pickRandom } from '../../core/pickRandom.js';
import { formatEndMessage } from '../../core/messageFormat.js';

const LOSS_TAUNTS = {
  instant: [
    'Даже осмотреться не успел — сразу бабах.',
    'Это был не крот, а камикадзе.',
    'Рекорд по скорости самоуничтожения установлен.',
    'Соседи уже жалуются на шум от взрыва.',
    'Один клик. Одна мина. Ноль удачи.',
    'Ты как будто специально её искал.',
  ],
  low: [
    'Начало было ничего, а потом — бабах.',
    'Пара клеток — и всё, отбой.',
    'Крот немного покопал и передумал жить.',
    'До победы как до Луны, но чуть ближе, чем в прошлый раз.',
    'Мина заслуженно тебя нашла.',
    'Ну хотя бы не с первого клика.',
  ],
  mid: [
    'Уже почти половина поля — и всё насмарку.',
    'Так близко, но нет.',
    'Ты был на верном пути. Неверном шаге.',
    'Крот честно старался. Мина оказалась хитрее.',
    'Обидно, но уже не позорно.',
    'Ещё чуть-чуть удачи — и совсем другая история.',
  ],
  close: [
    'Поле было почти твоим. ПОЧТИ.',
    'Одна клетка. ОДНА. И та — мина.',
    'Это больнее, чем кажется со стороны.',
    'Ты заслужил лучшего финала, чем этот.',
    'Так близко к победе, что аж обидно за тебя.',
    'Крот честно заслужил медаль за отвагу. Посмертно.',
  ],
};

const WIN_TAUNTS = {
  slow: [
    'Победа! Не быстрая, но победа.',
    'Ты прошёл поле неторопливо. Очень неторопливо.',
    'Множитель почти испарился, пока ты думал.',
    'Победа в стиле «медленно, но верно». Очень медленно.',
    'Крот дошёл до конца пешком, а не бегом.',
    'Главное — результат. Хотя время могло быть и получше.',
  ],
  mid: [
    'Уверенная победа в нормальном темпе.',
    'Неплохо! Без рекордов скорости, но чисто.',
    'Крот справился — без спешки, но и без тормозов.',
    'Победа как победа. Годится.',
    'Множитель ещё жив, и это радует.',
    'Достойно, но чемпионы играют быстрее.',
  ],
  fast: [
    'Быстро и чисто! Крот доволен.',
    'Отличный темп — множитель почти не пострадал.',
    'Вот это скорость! Мины даже испугаться не успели.',
    'Красивая партия, без раскачки.',
    'Ты явно знаешь, что делаешь.',
    'Такими темпами — прямая дорога в топ таблицы.',
  ],
  blazing: [
    'МОЛНИЕНОСНО. Множитель почти не тронут.',
    'Это было почти нечестно быстро.',
    'Крот побил не только мины, но и часы.',
    'Такую скорость мины запомнят надолго.',
    'Ты либо гений, либо видел это поле во сне.',
    'Рекордный темп! Дальше только машина сможет быстрее.',
  ],
};

function pickLossTaunt(revealedFraction) {
  if (revealedFraction < 0.1) return pickRandom(LOSS_TAUNTS.instant);
  if (revealedFraction < 0.4) return pickRandom(LOSS_TAUNTS.low);
  if (revealedFraction < 0.75) return pickRandom(LOSS_TAUNTS.mid);
  return pickRandom(LOSS_TAUNTS.close);
}

function pickWinTaunt(multiplier) {
  if (multiplier < 1) return pickRandom(WIN_TAUNTS.slow);
  if (multiplier < 2) return pickRandom(WIN_TAUNTS.mid);
  if (multiplier < 2.7) return pickRandom(WIN_TAUNTS.fast);
  return pickRandom(WIN_TAUNTS.blazing);
}

// Должно совпадать с server/games.js.
const DIFFICULTIES = {
  easy: { cols: 8, rows: 8, mines: 8, pointsPerCell: 8, winBonus: 100 },
  medium: { cols: 10, rows: 10, mines: 14, pointsPerCell: 10, winBonus: 200 },
  hard: { cols: 12, rows: 12, mines: 24, pointsPerCell: 14, winBonus: 400 },
};

// Множитель победы: чем дольше игра, тем он меньше. Должен совпадать с
// server/games.js — сервер пересчитывает его сам по своему времени и не
// доверяет тому, что пришлёт клиент, но чтобы итоговый счёт не обрезался
// проверкой, значения должны совпадать.
const MULTIPLIER_START = 3;
const MULTIPLIER_MIN = 0.5;
const MULTIPLIER_DECAY_PER_SEC = 0.015;

const CELL_SIZE = 32;
const LONG_PRESS_MS = 450;

const NICKNAME_RE = /^[A-Za-z0-9]{3,12}$/;

const NUMBER_COLORS = {
  1: '#7ee7f5',
  2: '#7ee787',
  3: '#e8664c',
  4: '#caa24a',
  5: '#f1e6d9',
  6: '#7ee7f5',
  7: '#f1e6d9',
  8: '#f1e6d9',
};

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const minesLeftEl = document.getElementById('mines-left');
const timerEl = document.getElementById('timer');
const multiplierEl = document.getElementById('multiplier');
const startBtn = document.getElementById('start-btn');
const nicknameInput = document.getElementById('nickname');
const difficultySelect = document.getElementById('difficulty');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const leaderboardList = document.getElementById('leaderboard-list');
const leaderboardToggle = document.getElementById('leaderboard-toggle');
const leaderboardPanel = document.getElementById('leaderboard-panel');

// Параметры текущей партии — переставляются в startGame() под выбранную
// сложность, все функции ниже используют эти значения, а не константы.
let COLS = DIFFICULTIES.medium.cols;
let ROWS = DIFFICULTIES.medium.rows;
let MINES = DIFFICULTIES.medium.mines;
let SAFE_CELLS = COLS * ROWS - MINES;
let POINTS_PER_CELL = DIFFICULTIES.medium.pointsPerCell;
let WIN_BONUS = DIFFICULTIES.medium.winBonus;

let state = null;

function currentMultiplier(elapsedMs) {
  const elapsedSeconds = elapsedMs / 1000;
  const value = MULTIPLIER_START - MULTIPLIER_DECAY_PER_SEC * elapsedSeconds;
  return Math.max(MULTIPLIER_MIN, value);
}

function emptyBoard() {
  const cells = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      cells.push({ x, y, mine: false, revealed: false, flagged: false, adjacent: 0 });
    }
  }
  return cells;
}

function cellAt(board, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  return board[y * COLS + x];
}

function neighborsOf(board, cell) {
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = cellAt(board, cell.x + dx, cell.y + dy);
      if (n) result.push(n);
    }
  }
  return result;
}

// Мины расставляются только после первого клика и никогда на кликнутую
// клетку — иначе игрок мог бы проиграть первым же действием, не успев
// ничего решить.
function placeMines(board, safeCell) {
  const candidates = board.filter((c) => c !== safeCell);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.slice(0, MINES).forEach((c) => {
    c.mine = true;
  });
  board.forEach((c) => {
    if (!c.mine) c.adjacent = neighborsOf(board, c).filter((n) => n.mine).length;
  });
}

function createState() {
  return {
    board: emptyBoard(),
    minesPlaced: false,
    revealedSafe: 0,
    flagged: 0,
    score: 0,
    sessionId: null,
    startedAt: 0,
    timerIntervalId: null,
    over: true,
  };
}

function revealCell(cell) {
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;

  if (cell.mine) {
    endGame(false);
    return;
  }

  state.revealedSafe += 1;
  state.score = state.revealedSafe * POINTS_PER_CELL;
  scoreEl.textContent = String(state.score);

  if (cell.adjacent === 0) {
    neighborsOf(state.board, cell).forEach((n) => {
      if (!n.revealed && !n.mine) revealCell(n);
    });
  }
}

function toggleFlag(cell) {
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  state.flagged += cell.flagged ? 1 : -1;
  minesLeftEl.textContent = String(MINES - state.flagged);
  draw();
}

function handleReveal(cell) {
  if (!state || state.over || cell.revealed || cell.flagged) return;

  if (!state.minesPlaced) {
    placeMines(state.board, cell);
    state.minesPlaced = true;
  }

  revealCell(cell);
  if (state.over) return; // подорвался на мине — endGame(false) уже вызван

  if (state.revealedSafe === SAFE_CELLS) {
    // Множитель и бонус за победу — только здесь, в ветке выигрыша. При
    // поражении score остаётся тем, что накопил revealCell выше: клетки ×
    // очки, без бонуса и без множителя.
    const multiplier = currentMultiplier(performance.now() - state.startedAt);
    state.score = Math.round((state.revealedSafe * POINTS_PER_CELL + WIN_BONUS) * multiplier);
    scoreEl.textContent = String(state.score);
    endGame(true);
    return;
  }

  draw();
}

function draw() {
  ctx.fillStyle = '#150f0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  state.board.forEach((cell) => {
    const px = cell.x * CELL_SIZE;
    const py = cell.y * CELL_SIZE;

    if (cell.revealed) {
      ctx.fillStyle = cell.mine ? '#e8664c' : '#3a2c18';
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      if (!cell.mine && cell.adjacent > 0) {
        ctx.fillStyle = NUMBER_COLORS[cell.adjacent] || '#f1e6d9';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cell.adjacent), px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 1);
      }
    } else {
      ctx.fillStyle = '#5a4526';
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      if (cell.flagged) drawFlag(px, py);
    }
  });
}

// Тот же флажок (флагшток + треугольник), что «пролетает» на фоне страницы
// — так декоративный элемент и игровой узнаются как одно и то же.
function drawFlag(px, py) {
  const poleX = px + CELL_SIZE * 0.4;
  const poleTop = py + CELL_SIZE * 0.2;
  const poleBottom = py + CELL_SIZE * 0.8;

  ctx.fillStyle = '#f1e6d9';
  ctx.fillRect(poleX, poleTop, 2, poleBottom - poleTop);

  ctx.fillStyle = '#caa24a';
  ctx.beginPath();
  ctx.moveTo(poleX + 2, poleTop);
  ctx.lineTo(poleX + 2 + CELL_SIZE * 0.4, poleTop + CELL_SIZE * 0.17);
  ctx.lineTo(poleX + 2, poleTop + CELL_SIZE * 0.34);
  ctx.closePath();
  ctx.fill();
}

function updateTimerDisplay() {
  const elapsedMs = performance.now() - state.startedAt;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = String(totalSeconds % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
  multiplierEl.textContent = currentMultiplier(elapsedMs).toFixed(2);
}

async function startGame() {
  const nickname = nicknameInput.value;
  if (!NICKNAME_RE.test(nickname)) {
    overlayMessage.textContent = 'ник: 3-12 латинских букв или цифр';
    overlay.hidden = false;
    return;
  }

  const difficulty = difficultySelect.value;
  const cfg = DIFFICULTIES[difficulty];

  startBtn.disabled = true;
  difficultySelect.disabled = true;
  let session;
  try {
    session = await startSession({ difficulty });
  } catch (err) {
    overlayMessage.textContent = err.message;
    overlay.hidden = false;
    startBtn.disabled = false;
    difficultySelect.disabled = false;
    return;
  }

  COLS = cfg.cols;
  ROWS = cfg.rows;
  MINES = cfg.mines;
  SAFE_CELLS = COLS * ROWS - MINES;
  POINTS_PER_CELL = cfg.pointsPerCell;
  WIN_BONUS = cfg.winBonus;
  canvas.width = COLS * CELL_SIZE;
  canvas.height = ROWS * CELL_SIZE;

  state = createState();
  state.sessionId = session.sessionId;
  state.startedAt = performance.now();
  state.over = false;
  scoreEl.textContent = '0';
  minesLeftEl.textContent = String(MINES);
  overlay.hidden = true;

  updateTimerDisplay();
  state.timerIntervalId = setInterval(updateTimerDisplay, 200);

  draw();
}

async function endGame(won) {
  state.over = true;
  clearInterval(state.timerIntervalId);
  const finalScore = state.score;
  const sessionId = state.sessionId;

  let taunt;
  if (!won) {
    state.board.forEach((c) => {
      if (c.mine) c.revealed = true;
    });
    triggerLossFlash();
    taunt = pickLossTaunt(state.revealedSafe / SAFE_CELLS);
  } else {
    taunt = pickWinTaunt(currentMultiplier(performance.now() - state.startedAt));
  }
  draw();

  overlayMessage.textContent = formatEndMessage(taunt, `Счёт: ${finalScore}`);
  overlay.hidden = false;
  startBtn.disabled = false;
  difficultySelect.disabled = false;

  try {
    await submitScore(sessionId, nicknameInput.value, finalScore, { won });
    await renderLeaderboard();
  } catch (err) {
    overlayMessage.textContent += ` (счёт не отправлен: ${err.message})`;
  }
}

let pressTimer = null;
let pressCell = null;
let longPressTriggered = false;

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
  return cellAt(state.board, x, y);
}

// Тап = открыть клетку, долгое нажатие = флажок — так игра управляется и
// мышью, и пальцем на телефоне без отдельного мобильного режима.
function handlePointerDown(e) {
  if (!state || state.over) return;
  if (e.button > 0) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  pressCell = cell;
  longPressTriggered = false;
  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    toggleFlag(cell);
  }, LONG_PRESS_MS);
}

function handlePointerUp(e) {
  if (!state || state.over || !pressCell) return;
  clearTimeout(pressTimer);
  const cell = cellFromEvent(e);
  if (!longPressTriggered && cell === pressCell) {
    handleReveal(cell);
  }
  pressCell = null;
}

function handlePointerLeave() {
  clearTimeout(pressTimer);
  pressCell = null;
}

function handleContextMenu(e) {
  e.preventDefault();
  if (!state || state.over) return;
  const cell = cellFromEvent(e);
  if (cell) toggleFlag(cell);
}

function handleDifficultyChange() {
  if (state && !state.over) return;
  minesLeftEl.textContent = String(DIFFICULTIES[difficultySelect.value].mines);
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

canvas.width = COLS * CELL_SIZE;
canvas.height = ROWS * CELL_SIZE;
state = createState();
draw();
startBtn.addEventListener('click', startGame);
difficultySelect.addEventListener('change', handleDifficultyChange);
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointerleave', handlePointerLeave);
canvas.addEventListener('pointercancel', handlePointerLeave);
canvas.addEventListener('contextmenu', handleContextMenu);
initLeaderboardToggle(leaderboardToggle, leaderboardPanel);
renderLeaderboard();
