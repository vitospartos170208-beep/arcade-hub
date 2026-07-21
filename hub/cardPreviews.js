// Живые мини-превью внутри карточек хаба — упрощённые, зациклленные версии
// самих игр, только для вида (без счёта и проигрыша).

function initSnakePreview(canvas) {
  const CELL = 10;
  const COLS = Math.floor(canvas.width / CELL);
  const ROWS = Math.floor(canvas.height / CELL);
  const MOVE_MS = 140;
  const MAX_LEN = 10;
  const ctx = canvas.getContext('2d');

  let snake = [{ x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }];
  let dir = { x: 1, y: 0 };
  let food = spawnFood();
  let lastMove = 0;

  function spawnFood() {
    let cell;
    do {
      cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
    return cell;
  }

  // Не настоящий поиск пути — просто «иди туда, где еда», этого достаточно
  // для живой картинки в карточке.
  function chooseDirection() {
    const head = snake[0];
    const dx = food.x - head.x;
    const dy = food.y - head.y;
    const primary = Math.abs(dx) >= Math.abs(dy)
      ? { x: Math.sign(dx) || 1, y: 0 }
      : { x: 0, y: Math.sign(dy) || 1 };
    const secondary = primary.x !== 0 ? { x: 0, y: Math.sign(dy) || 1 } : { x: Math.sign(dx) || 1, y: 0 };

    for (const candidate of [primary, secondary, dir]) {
      if (candidate.x === -dir.x && candidate.y === -dir.y) continue;
      return candidate;
    }
    return dir;
  }

  function draw() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e8664c';
    ctx.fillRect(food.x * CELL + 1, food.y * CELL + 1, CELL - 2, CELL - 2);

    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#7ee787' : 'rgba(126, 231, 135, 0.6)';
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }

  function step(now) {
    if (now - lastMove >= MOVE_MS) {
      lastMove = now;
      dir = chooseDirection();
      const head = snake[0];
      const next = {
        x: (head.x + dir.x + COLS) % COLS,
        y: (head.y + dir.y + ROWS) % ROWS,
      };
      snake.unshift(next);

      if (next.x === food.x && next.y === food.y) {
        food = spawnFood();
        if (snake.length > MAX_LEN) snake.pop();
      } else {
        snake.pop();
      }
      draw();
    }
    requestAnimationFrame(step);
  }

  draw();
  requestAnimationFrame(step);
}

function initMolePreview(canvas) {
  const CELL = 20;
  const COLS = Math.floor(canvas.width / CELL);
  const ROWS = Math.floor(canvas.height / CELL);
  const NUMBER_COLORS = ['', '#7ee7f5', '#7ee787', '#e8664c', '#caa24a'];
  const ctx = canvas.getContext('2d');

  let cells = [];
  let revealQueue = [];
  let flagCell = null;
  let phase = 'hold-hidden';
  let phaseStart = 0;

  function cellAt(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
    return cells[y * COLS + x];
  }

  function resetCells() {
    cells = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        cells.push({ x, y, revealed: false, number: Math.floor(Math.random() * 4) });
      }
    }
  }

  // Волна открытия клеток от случайной точки — имитация каскадного
  // раскрытия в самой игре, без настоящих мин.
  function buildRevealQueue() {
    const start = cells[Math.floor(Math.random() * cells.length)];
    const seen = new Set([start]);
    const queue = [start];
    const depths = new Map([[start, 0]]);
    const order = [start];
    const MAX_DEPTH = 3;

    while (queue.length) {
      const c = queue.shift();
      const d = depths.get(c);
      if (d >= MAX_DEPTH) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const n = cellAt(c.x + dx, c.y + dy);
        if (n && !seen.has(n)) {
          seen.add(n);
          depths.set(n, d + 1);
          queue.push(n);
          order.push(n);
        }
      });
    }
    return order;
  }

  function pickFlagCell() {
    const hidden = cells.filter((c) => !c.revealed);
    return hidden.length ? hidden[Math.floor(Math.random() * hidden.length)] : null;
  }

  function drawFlag(cell) {
    const px = cell.x * CELL;
    const py = cell.y * CELL;
    const poleX = px + CELL * 0.4;
    const poleTop = py + CELL * 0.2;

    ctx.fillStyle = '#f1e6d9';
    ctx.fillRect(poleX, poleTop, 2, CELL * 0.6);

    ctx.fillStyle = '#caa24a';
    ctx.beginPath();
    ctx.moveTo(poleX + 2, poleTop);
    ctx.lineTo(poleX + 2 + CELL * 0.4, poleTop + CELL * 0.17);
    ctx.lineTo(poleX + 2, poleTop + CELL * 0.34);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    cells.forEach((cell) => {
      const px = cell.x * CELL;
      const py = cell.y * CELL;

      ctx.fillStyle = cell.revealed ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.11)';
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);

      if (cell.revealed && cell.number > 0) {
        ctx.fillStyle = NUMBER_COLORS[cell.number];
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cell.number), px + CELL / 2, py + CELL / 2 + 1);
      }
    });

    if (flagCell) drawFlag(flagCell);
  }

  function step(now) {
    const elapsed = now - phaseStart;

    if (phase === 'hold-hidden' && elapsed > 500) {
      resetCells();
      revealQueue = buildRevealQueue();
      phase = 'revealing';
      phaseStart = now;
    } else if (phase === 'revealing') {
      const revealedCount = Math.min(revealQueue.length, Math.floor(elapsed / 45));
      for (let i = 0; i < revealedCount; i++) revealQueue[i].revealed = true;
      if (revealedCount >= revealQueue.length) {
        phase = 'flagging';
        phaseStart = now;
      }
    } else if (phase === 'flagging' && elapsed > 200) {
      flagCell = pickFlagCell();
      phase = 'hold-revealed';
      phaseStart = now;
    } else if (phase === 'hold-revealed' && elapsed > 1200) {
      cells.forEach((c) => {
        c.revealed = false;
      });
      flagCell = null;
      phase = 'hold-hidden';
      phaseStart = now;
    }

    draw();
    requestAnimationFrame(step);
  }

  resetCells();
  draw();
  requestAnimationFrame(step);
}

function initBugPreview(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const groundY = H - 20;
  const shipTopY = 12;
  const shipLandedY = groundY - 20;
  const padStart = W * 0.4;
  const padEnd = W * 0.6;
  const DESCEND_MS = 1800;
  const HOLD_MS = 900;

  let phase = 'falling';
  let phaseStart = 0;
  let shipX = W / 2;

  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  function draw(shipY, thrusting) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(232, 238, 247, 0.5)';
    for (let i = 0; i < 12; i++) {
      ctx.fillRect((i * 37) % W, (i * 53) % (groundY - 20), 1, 1);
    }

    ctx.fillStyle = '#1c2740';
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = '#5ec8f2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padStart, groundY);
    ctx.lineTo(padEnd, groundY);
    ctx.stroke();

    if (thrusting) {
      ctx.fillStyle = '#ffb454';
      ctx.beginPath();
      ctx.moveTo(shipX - 3, shipY + 6);
      ctx.lineTo(shipX + 3, shipY + 6);
      ctx.lineTo(shipX, shipY + 13);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#e8eef7';
    ctx.fillRect(shipX - 6, shipY - 7, 12, 14);
    ctx.fillStyle = '#5ec8f2';
    ctx.fillRect(shipX - 4, shipY - 4, 8, 4);
  }

  function step(now) {
    const elapsed = now - phaseStart;

    if (phase === 'falling') {
      const t = Math.min(1, elapsed / DESCEND_MS);
      const shipY = shipTopY + easeOutCubic(t) * (shipLandedY - shipTopY);
      draw(shipY, t > 0.55);
      if (t >= 1) {
        phase = 'landed';
        phaseStart = now;
      }
    } else {
      draw(shipLandedY, false);
      if (elapsed > HOLD_MS) {
        shipX = W * (0.4 + Math.random() * 0.2);
        phase = 'falling';
        phaseStart = now;
      }
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function initBoarPreview(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const groundY = H / 2;
  const CELL = 30;
  const boxStartX = W * 0.3;
  const boxEndX = W * 0.65;
  const PUSH_MS = 1400;
  const HOLD_MS = 700;

  let phase = 'pushing';
  let phaseStart = 0;

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function draw(boxX) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#a67ce8';
    ctx.beginPath();
    ctx.arc(boxEndX + CELL / 2, groundY + CELL / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#caa24a';
    ctx.fillRect(boxX + 4, groundY + 4, CELL - 8, CELL - 8);

    ctx.fillStyle = '#efe6f7';
    ctx.beginPath();
    ctx.arc(boxX - CELL / 2, groundY + CELL / 2, CELL / 2 - 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function step(now) {
    const elapsed = now - phaseStart;

    if (phase === 'pushing') {
      const t = Math.min(1, elapsed / PUSH_MS);
      draw(boxStartX + easeInOut(t) * (boxEndX - boxStartX));
      if (t >= 1) {
        phase = 'hold';
        phaseStart = now;
      }
    } else {
      draw(boxEndX);
      if (elapsed > HOLD_MS) {
        phase = 'pushing';
        phaseStart = now;
      }
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function initHamsterPreview(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const stockX = W * 0.25;
  const stockY = H * 0.5;
  const foundX = W * 0.72;
  const foundY = H * 0.5;
  const CARD_W = 26;
  const CARD_H = 36;
  const MOVE_MS = 900;
  const HOLD_MS = 500;

  let phase = 'moving';
  let phaseStart = 0;

  function easeOut(t) {
    return 1 - (1 - t) ** 3;
  }

  function draw(cardX, cardY) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#e8628f';
    ctx.fillRect(stockX - CARD_W / 2, stockY - CARD_H / 2, CARD_W, CARD_H);

    ctx.strokeStyle = '#e8628f';
    ctx.lineWidth = 2;
    ctx.strokeRect(foundX - CARD_W / 2, foundY - CARD_H / 2, CARD_W, CARD_H);

    ctx.fillStyle = '#f5e6ec';
    ctx.fillRect(cardX - CARD_W / 2, cardY - CARD_H / 2, CARD_W, CARD_H);
  }

  function step(now) {
    const elapsed = now - phaseStart;

    if (phase === 'moving') {
      const t = Math.min(1, elapsed / MOVE_MS);
      const x = stockX + easeOut(t) * (foundX - stockX);
      const y = stockY + easeOut(t) * (foundY - stockY);
      draw(x, y);
      if (t >= 1) {
        phase = 'hold';
        phaseStart = now;
      }
    } else {
      draw(foundX, foundY);
      if (elapsed > HOLD_MS) {
        phase = 'moving';
        phaseStart = now;
      }
    }

    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// Показываем превью только при наведении мышью или нажатии на телефоне —
// не постоянно видимым отдельным экранчиком, а заливкой самой карточки
// (см. .card-preview в style.css). Мышь и тач различаем через pointerType:
// у мыши есть honest hover, у тача — только press.
function bindCardActivation(card) {
  const activate = () => card.classList.add('preview-active');
  const deactivate = () => card.classList.remove('preview-active');

  card.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') activate();
  });
  card.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') deactivate();
  });
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') activate();
  });
  card.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') deactivate();
  });
  card.addEventListener('pointercancel', deactivate);
}

window.addEventListener('load', () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('canvas[data-preview]').forEach((canvas) => {
    if (canvas.dataset.preview === 'snake') initSnakePreview(canvas);
    if (canvas.dataset.preview === 'mole') initMolePreview(canvas);
    if (canvas.dataset.preview === 'bug') initBugPreview(canvas);
    if (canvas.dataset.preview === 'boar') initBoarPreview(canvas);
    if (canvas.dataset.preview === 'hamster') initHamsterPreview(canvas);
  });

  document.querySelectorAll('.game-card').forEach(bindCardActivation);
});
