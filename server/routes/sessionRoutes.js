const express = require('express');
const crypto = require('node:crypto');
const db = require('../db/db');
const { GAMES } = require('../games');

const router = express.Router();

const insertSession = db.prepare(
  'INSERT INTO game_sessions (id, game, difficulty, started_at, used) VALUES (?, ?, ?, ?, 0)'
);

router.post('/', (req, res) => {
  const { game, difficulty } = req.body ?? {};

  if (typeof game !== 'string' || !(game in GAMES)) {
    return res.status(400).json({ error: 'неизвестная игра' });
  }

  const gameDef = GAMES[game];
  let resolvedDifficulty = null;

  if (gameDef.difficulties) {
    if (typeof difficulty !== 'string' || !(difficulty in gameDef.difficulties)) {
      return res.status(400).json({ error: 'неизвестная сложность' });
    }
    resolvedDifficulty = difficulty;
  }

  const id = crypto.randomUUID();
  const startedAt = Date.now();

  insertSession.run(id, game, resolvedDifficulty, startedAt);

  res.status(201).json({ sessionId: id, startedAt });
});

module.exports = router;
