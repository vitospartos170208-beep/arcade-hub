const express = require('express');
const db = require('../db/db');

const router = express.Router();

const topScores = db.prepare(
  'SELECT nickname, score, created_at FROM scores ORDER BY score DESC LIMIT 100'
);

router.get('/', (req, res) => {
  res.json(topScores.all());
});

module.exports = router;
