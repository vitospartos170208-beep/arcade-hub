const express = require('express');
const db = require('../db/db');

const router = express.Router();

const NICKNAME_RE = /^[A-Za-z0-9]{3,12}$/;

// Базовый фильтр недопустимых ников — не претендует на полноту словаря,
// это первая линия защиты от очевидной нецензурщины в публичном лидерборде.
const BANNED_SUBSTRINGS = ['fuck', 'shit', 'nigger', 'cunt'];

function isBannedNickname(nickname) {
  const lower = nickname.toLowerCase();
  return BANNED_SUBSTRINGS.some((word) => lower.includes(word));
}

// Верхняя граница правдоподобности для змейки: даже если бы еда появлялась
// на соседней клетке при каждом ходе (нереалистично, но это безопасный запас
// сверху), очков за секунду больше этого получить нельзя.
const FASTEST_TICK_MS = 150;
const POINTS_PER_FOOD = 10;

const getSession = db.prepare('SELECT started_at, used FROM game_sessions WHERE id = ?');
const markSessionUsed = db.prepare('UPDATE game_sessions SET used = 1 WHERE id = ?');
const insertScore = db.prepare(
  'INSERT INTO scores (nickname, score, session_id) VALUES (?, ?, ?)'
);

router.post('/', (req, res) => {
  const { sessionId, nickname, score } = req.body ?? {};

  if (typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId обязателен' });
  }
  if (typeof nickname !== 'string' || !NICKNAME_RE.test(nickname)) {
    return res.status(400).json({ error: 'ник должен быть 3-12 латинских букв или цифр' });
  }
  if (isBannedNickname(nickname)) {
    return res.status(400).json({ error: 'этот ник недопустим' });
  }
  if (!Number.isInteger(score) || score < 0) {
    return res.status(400).json({ error: 'некорректный счёт' });
  }

  const session = getSession.get(sessionId);
  if (!session) {
    return res.status(400).json({ error: 'сессия не найдена' });
  }
  if (session.used) {
    return res.status(409).json({ error: 'счёт по этой сессии уже отправлен' });
  }

  const durationMs = Date.now() - session.started_at;
  const maxPlausibleScore = Math.floor(durationMs / FASTEST_TICK_MS) * POINTS_PER_FOOD;

  if (score > maxPlausibleScore) {
    return res.status(400).json({ error: 'счёт превышает возможный для длительности сессии' });
  }

  db.exec('BEGIN');
  try {
    markSessionUsed.run(sessionId);
    insertScore.run(nickname, score, sessionId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.status(201).json({ ok: true });
});

module.exports = router;
