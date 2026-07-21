import { startSession, submitScore, fetchLeaderboard } from './api.js';
import { renderLeaderboardList, initLeaderboardToggle } from '../../core/leaderboardUI.js';
import { pickRandom } from '../../core/pickRandom.js';
import { formatEndMessage } from '../../core/messageFormat.js';

const CELL_SIZE = 40;
const NICKNAME_RE = /^[A-Za-z0-9]{3,12}$/;
const LEVEL_TRANSITION_MS = 1200;

// Должно совпадать с server/games.js. minMoves — манхэттенское расстояние
// «ящик → цель», суммарное по всем ящикам: безопасный (заниженный) минимум
// числа ходов, а не точное оптимальное решение.
const LEVELS = [
  { rows: ['######', '#@   #', '#  $.#', '######'], minMoves: 1 },
  { rows: ['#######', '#    .#', '#  $  #', '# @   #', '#######'], minMoves: 3 },
  { rows: ['########', '#  .   #', '#  $  $#', '#  @  .#', '########'], minMoves: 2 },
  { rows: ['#########', '#   .   #', '# $   $ #', '#   .   #', '# @     #', '#########'], minMoves: 6 },
  {
    rows: [
      '##########',
      '#   .    #',
      '# $     $#',
      '#   .    #',
      '#    $   #',
      '# @     .#',
      '##########',
    ],
    minMoves: 8,
  },
  {
    rows: [
      '###########',
      '#  .      #',
      '#  $    $ #',
      '#         #',
      '#      .  #',
      '# @  $   .#',
      '###########',
    ],
    minMoves: 8,
  },
  {
    rows: [
      '############',
      '#  .    .  #',
      '#  $    $  #',
      '#          #',
      '#  $    $  #',
      '#  .    .  #',
      '# @        #',
      '############',
    ],
    minMoves: 4,
  },
  {
    rows: [
      '#############',
      '#   .     . #',
      '#  $       $#',
      '#           #',
      '#  $       $#',
      '#   .     . #',
      '# @         #',
      '#############',
    ],
    minMoves: 8,
  },
];

const LEVEL_BASE = 150;
const EFFICIENCY_BONUS_MAX = 100;
const EXTRA_MOVE_PENALTY = 5;

const TAUNTS = {
  sloppy: [
    'Ящики на месте. Путь к ним — не самый короткий в истории.',
    'Кабан пропотел. И даже не от жары.',
    'Задача решена. Изящества — ноль.',
    'Лишних шагов было больше, чем нужных.',
    'Ты как будто толкал ящики с закрытыми глазами.',
    'Сработало. Как — лучше не вспоминать.',
  ],
  solid: [
    'Уверенно, без лишней суеты.',
    'Кабан доволен маршрутом.',
    'Ровная работа, никаких сюрпризов.',
    'Хорошо посчитано, хорошо сделано.',
    'Ящики на местах, шаги — почти в норме.',
    'Крепкий средний результат — и это комплимент.',
  ],
  perfect: [
    'Минимум шагов, максимум толку.',
    'Кабан-логист. Ни одного лишнего манёвра.',
    'Это было почти по учебнику складской оптимизации.',
    'Каждый шаг — по делу. Красота.',
    'Идеальный маршрут. Дальше только медаль.',
    'Вот что значит думать на два хода вперёд.',
  ],
};

function pickTaunt(totalScore) {
  const maxScore = LEVELS.length * (LEVEL_BASE + EFFICIENCY_BONUS_MAX);
  if (totalScore < maxScore * 0.5) return pickRandom(TAUNTS.sloppy);
  if (totalScore < maxScore * 0.8) return pickRandom(TAUNTS.solid);
  return pickRandom(TAUNTS.perfect);
}

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const levelIndicatorEl = document.getElementById('level-indicator');
const movesEl = document.getElementById('moves');
const scoreEl = document.getElementById('score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const nicknameInput = document.getElementById('nickname');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const leaderboardList = document.getElementById('leaderboard-list');
const leaderboardToggle = document.getElementById('leaderboard-toggle');
const leaderboardPanel = document.getElementById('leaderboard-panel');
const moveUpBtn = document.getElementById('move-up');
const moveDownBtn = document.getElementById('move-down');
const moveLeftBtn = document.getElementById('move-left');
const moveRightBtn = document.getElementById('move-right');

let state = null;

function parseLevel(levelDef) {
  const grid = [];
  const boxes = [];
  const goals = [];
  let player = null;

  levelDef.rows.forEach((row, y) => {
    const gridRow = [];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      gridRow.push(ch === '#' ? 'wall' : 'floor');
      if (ch === '.') goals.push({ x, y });
      if (ch === '$') boxes.push({ x, y });
      if (ch === '@') player = { x, y };
    }
    grid.push(gridRow);
  });

  return {
    grid,
    boxes,
    goals,
    player,
    cols: levelDef.rows[0].length,
    rows: levelDef.rows.length,
  };
}

function loadLevel(index) {
  const level = parseLevel(LEVELS[index]);
  canvas.width = level.cols * CELL_SIZE;
  canvas.height = level.rows * CELL_SIZE;
  return level;
}

function createState() {
  return {
    levelIndex: 0,
    level: loadLevel(0),
    movesThisLevel: 0,
    totalMoves: 0,
    totalScore: 0,
    sessionId: null,
    over: true,
    transitioning: false,
  };
}

function isOnGoal(level, cell) {
  return level.goals.some((g) => g.x === cell.x && g.y === cell.y);
}

function tryMove(dx, dy) {
  if (!state || state.over || state.transitioning) return;
  const level = state.level;
  const nx = level.player.x + dx;
  const ny = level.player.y + dy;
  if (level.grid[ny]?.[nx] !== 'floor') return;

  const boxIndex = level.boxes.findIndex((b) => b.x === nx && b.y === ny);
  if (boxIndex >= 0) {
    const bx = nx + dx;
    const by = ny + dy;
    if (level.grid[by]?.[bx] !== 'floor') return;
    if (level.boxes.some((b) => b.x === bx && b.y === by)) return;
    level.boxes[boxIndex] = { x: bx, y: by };
  }

  level.player = { x: nx, y: ny };
  state.movesThisLevel += 1;
  state.totalMoves += 1;
  movesEl.textContent = String(state.totalMoves);

  draw();
  checkLevelComplete();
}

function checkLevelComplete() {
  const level = state.level;
  const solved = level.boxes.every((b) => isOnGoal(level, b));
  if (!solved) return;

  const minMoves = LEVELS[state.levelIndex].minMoves;
  const extraMoves = Math.max(0, state.movesThisLevel - minMoves);
  const bonus = Math.max(0, EFFICIENCY_BONUS_MAX - EXTRA_MOVE_PENALTY * extraMoves);
  const levelScore = LEVEL_BASE + bonus;

  state.totalScore += levelScore;
  scoreEl.textContent = String(state.totalScore);

  if (state.levelIndex + 1 >= LEVELS.length) {
    finishPack(levelScore);
  } else {
    advanceLevel(levelScore);
  }
}

function advanceLevel(levelScore) {
  state.transitioning = true;
  overlayMessage.textContent = formatEndMessage(
    `Уровень ${state.levelIndex + 1} пройден! +${levelScore} очков.`,
    'Следующий уровень...'
  );
  overlay.hidden = false;

  setTimeout(() => {
    state.levelIndex += 1;
    state.level = loadLevel(state.levelIndex);
    state.movesThisLevel = 0;
    state.transitioning = false;
    levelIndicatorEl.textContent = `${state.levelIndex + 1} / ${LEVELS.length}`;
    overlay.hidden = true;
    draw();
  }, LEVEL_TRANSITION_MS);
}

function draw() {
  const level = state.level;
  ctx.fillStyle = '#15101f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < level.rows; y++) {
    for (let x = 0; x < level.cols; x++) {
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      if (level.grid[y][x] === 'wall') {
        ctx.fillStyle = '#33254a';
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
      } else {
        ctx.fillStyle = '#211a2f';
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  ctx.fillStyle = '#a67ce8';
  level.goals.forEach((g) => {
    ctx.beginPath();
    ctx.arc(g.x * CELL_SIZE + CELL_SIZE / 2, g.y * CELL_SIZE + CELL_SIZE / 2, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  level.boxes.forEach((b) => {
    const px = b.x * CELL_SIZE;
    const py = b.y * CELL_SIZE;
    ctx.fillStyle = isOnGoal(level, b) ? '#a67ce8' : '#caa24a';
    ctx.fillRect(px + 4, py + 4, CELL_SIZE - 8, CELL_SIZE - 8);
  });

  const p = level.player;
  ctx.fillStyle = '#efe6f7';
  ctx.beginPath();
  ctx.arc(p.x * CELL_SIZE + CELL_SIZE / 2, p.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
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
  movesEl.textContent = '0';
  scoreEl.textContent = '0';
  levelIndicatorEl.textContent = `1 / ${LEVELS.length}`;
  restartBtn.disabled = false;
  overlay.hidden = true;
  draw();
}

function restartLevel() {
  if (!state || state.over || state.transitioning) return;
  state.level = loadLevel(state.levelIndex);
  state.movesThisLevel = 0;
  draw();
}

async function finishPack(lastLevelScore) {
  state.over = true;
  restartBtn.disabled = true;
  const finalScore = state.totalScore;
  const sessionId = state.sessionId;

  const taunt = pickTaunt(finalScore);
  overlayMessage.textContent = formatEndMessage(taunt, `Все уровни пройдены — счёт: ${finalScore}`);
  overlay.hidden = false;
  startBtn.disabled = false;

  try {
    await submitScore(sessionId, nicknameInput.value, finalScore, { totalMoves: state.totalMoves });
    await renderLeaderboard();
  } catch (err) {
    overlayMessage.textContent += ` (счёт не отправлен: ${err.message})`;
  }
}

const MOVE_CODES = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

function handleKeydown(e) {
  const move = MOVE_CODES[e.code];
  if (!move) return;
  e.preventDefault();
  tryMove(move[0], move[1]);
}

function bindMoveButton(btn, dx, dy) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tryMove(dx, dy);
  });
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
restartBtn.addEventListener('click', restartLevel);
document.addEventListener('keydown', handleKeydown);
bindMoveButton(moveUpBtn, 0, -1);
bindMoveButton(moveDownBtn, 0, 1);
bindMoveButton(moveLeftBtn, -1, 0);
bindMoveButton(moveRightBtn, 1, 0);
initLeaderboardToggle(leaderboardToggle, leaderboardPanel);
renderLeaderboard();
