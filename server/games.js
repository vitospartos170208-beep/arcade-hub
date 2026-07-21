// Реестр игр, которым разрешено создавать сессии, отправлять счёт и иметь
// лидерборд. Добавление новой игры — это запись сюда плюс её собственная
// анти-чит проверка (у каждой игры свой темп набора очков).
const GAMES = {
  snake: {
    isScorePlausible(score, durationMs) {
      // Верхняя граница: даже если бы еда появлялась на соседней клетке при
      // каждом ходе (нереалистично, но это безопасный запас сверху), очков
      // за секунду больше этого получить нельзя.
      const FASTEST_TICK_MS = 150;
      const POINTS_PER_FOOD = 10;
      const maxPlausibleScore = Math.floor(durationMs / FASTEST_TICK_MS) * POINTS_PER_FOOD;
      return score <= maxPlausibleScore;
    },
  },

  mole: {
    // Должно совпадать с games/mole/game.js.
    difficulties: {
      easy: { cols: 8, rows: 8, mines: 8, pointsPerCell: 8, winBonus: 100 },
      medium: { cols: 10, rows: 10, mines: 14, pointsPerCell: 10, winBonus: 200 },
      hard: { cols: 12, rows: 12, mines: 24, pointsPerCell: 14, winBonus: 400 },
    },

    // Множитель — единственная часть очков, которую сервер может проверить
    // точно: он зависит только от времени, а время сервер меряет сам
    // (сессия → сейчас), тут клиенту соврать нечем.
    MULTIPLIER_START: 3,
    MULTIPLIER_MIN: 0.5,
    MULTIPLIER_DECAY_PER_SEC: 0.015,

    multiplierAt(durationMs) {
      const elapsedSeconds = durationMs / 1000;
      const value = this.MULTIPLIER_START - this.MULTIPLIER_DECAY_PER_SEC * elapsedSeconds;
      return Math.max(this.MULTIPLIER_MIN, value);
    },

    isScorePlausible(score, durationMs, difficulty, won) {
      const cfg = this.difficulties[difficulty];
      if (!cfg) return false;

      // В отличие от змейки, число открытых клеток нельзя честно связать со
      // временем: одним кликом по удачному полю каскадом открывается сразу
      // много клеток, поэтому даже очень быстрый счёт, близкий к максимуму,
      // физически возможен у честного игрока. Полная проверка (пересчёт
      // партии по логу ходов на сервере) — Этап 4 в ROADMAP.md; здесь —
      // отсечение явно невозможного: мгновенной отправки без единого клика,
      // превышения максимума клеток и, для победы, множителя выше того, что
      // мог быть у честного игрока к этому моменту времени.
      const MIN_ACTION_MS = 300;
      if (durationMs < MIN_ACTION_MS) return false;

      const safeCells = cfg.cols * cfg.rows - cfg.mines;
      const maxCellScore = safeCells * cfg.pointsPerCell;

      // Бонус и множитель победы допустимы только при won === true — без
      // победы верхняя граница не включает ни то, ни другое.
      if (!won) {
        return score <= maxCellScore;
      }

      const maxPossibleScore = Math.round((maxCellScore + cfg.winBonus) * this.multiplierAt(durationMs));
      return score <= maxPossibleScore;
    },
  },

  bug: {
    // Должно совпадать с games/bug/game.js.
    MAX_LEVEL_SCORE: 1000,
    // Даже при идеальной игре долететь от старта до площадки и мягко сесть
    // быстрее физически нельзя — на каждый пройденный уровень нужно время.
    MIN_FLIGHT_MS_PER_LEVEL: 1500,
    MULTIPLIER_START: 1,
    MULTIPLIER_STEP: 0.05,
    MULTIPLIER_MIN: 0.2,

    multiplierForLevel(level) {
      return Math.max(this.MULTIPLIER_MIN, this.MULTIPLIER_START - this.MULTIPLIER_STEP * (level - 1));
    },

    // Топливный бонус — это всегда доля от бака (0..1) × фикс. множитель,
    // поэтому сокращение бака на 4% за уровень не меняет потолок очков —
    // оно влияет только на то, насколько трудно долететь без спешки.
    isScorePlausible(score, durationMs, difficulty, won, extra) {
      const levelsCompleted = Number.isInteger(extra?.levelsCompleted) ? extra.levelsCompleted : 0;
      if (levelsCompleted < 0) return false;
      if (durationMs < 300) return false;
      if (durationMs < levelsCompleted * this.MIN_FLIGHT_MS_PER_LEVEL) return false;

      let maxPossibleScore = 0;
      for (let level = 1; level <= levelsCompleted; level++) {
        maxPossibleScore += Math.round(this.MAX_LEVEL_SCORE * this.multiplierForLevel(level));
      }

      return score <= maxPossibleScore;
    },
  },

  boar: {
    // Должно совпадать с games/boar/game.js. Минимум ходов на уровень — это
    // сумма манхэттенских расстояний «ящик → цель»: толкнуть ящик ближе к
    // цели меньше чем на 1 клетку за ход нельзя, так что это гарантированно
    // безопасная (заниженная) граница, даже если точное оптимальное решение
    // длиннее — его никто здесь не пересчитывает.
    MIN_MOVES_PER_LEVEL: [1, 3, 2, 6, 8, 8, 4, 8],
    LEVEL_BASE: 150,
    EFFICIENCY_BONUS_MAX: 100,
    MIN_MS_PER_MOVE: 150,

    isScorePlausible(score, durationMs, difficulty, won, extra) {
      const totalMoves = Number.isInteger(extra?.totalMoves) ? extra.totalMoves : -1;
      const minTotalMoves = this.MIN_MOVES_PER_LEVEL.reduce((a, b) => a + b, 0);
      const maxTotalScore = this.MIN_MOVES_PER_LEVEL.length * (this.LEVEL_BASE + this.EFFICIENCY_BONUS_MAX);

      if (totalMoves < minTotalMoves) return false;
      if (durationMs < totalMoves * this.MIN_MS_PER_MOVE) return false;

      return score <= maxTotalScore;
    },
  },

  hamster: {
    // Должно совпадать с games/hamster/game.js.
    POINTS_PER_CARD: 10,
    WIN_SCORE: 1000,
    MIN_MS_PER_MOVE: 300,
    MIN_DURATION_MS: 1000,

    // Раскладка тасуется на клиенте — сервер не знает колоду и не может
    // проверить, что игрок не подсмотрел карты в devtools. Проверяем то, что
    // проверить можно: очки при сдаче — это ровно cardsOnFoundation × 10 (не
    // может внезапно оказаться 52 карты — тогда это была бы победа, не
    // сдача), и на каждую перенесённую на фундамент карту нужен хотя бы один
    // реальный ход.
    isScorePlausible(score, durationMs, difficulty, won, extra) {
      const moves = Number.isInteger(extra?.moves) ? extra.moves : -1;
      if (moves < 0) return false;
      if (durationMs < this.MIN_DURATION_MS) return false;
      if (durationMs < moves * this.MIN_MS_PER_MOVE) return false;

      if (won) {
        return score === this.WIN_SCORE;
      }

      if (score % this.POINTS_PER_CARD !== 0) return false;
      const cardsOnFoundation = score / this.POINTS_PER_CARD;
      if (cardsOnFoundation > 51) return false;

      return moves >= cardsOnFoundation;
    },
  },
};

module.exports = { GAMES };
