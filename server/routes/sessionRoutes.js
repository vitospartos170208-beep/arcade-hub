const express = require('express');
const crypto = require('node:crypto');
const db = require('../db/db');

const router = express.Router();

const insertSession = db.prepare(
  'INSERT INTO game_sessions (id, started_at, used) VALUES (?, ?, 0)'
);

router.post('/', (req, res) => {
  const id = crypto.randomUUID();
  const startedAt = Date.now();

  insertSession.run(id, startedAt);

  res.status(201).json({ sessionId: id, startedAt });
});

module.exports = router;
