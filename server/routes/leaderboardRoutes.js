const express = require('express');
const db = require('../db/db');
const { GAMES } = require('../games');

const router = express.Router();

const topScores = db.prepare(
  'SELECT nickname, score, created_at FROM scores WHERE game = ? ORDER BY score DESC LIMIT 100'
);

router.get('/', (req, res) => {
  const { game } = req.query;

  if (typeof game !== 'string' || !(game in GAMES)) {
    return res.status(400).json({ error: 'неизвестная игра' });
  }

  res.json(topScores.all(game));
});

module.exports = router;
