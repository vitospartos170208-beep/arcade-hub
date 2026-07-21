CREATE TABLE IF NOT EXISTS game_sessions (
  id         TEXT PRIMARY KEY,
  game       TEXT NOT NULL,
  difficulty TEXT,
  started_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT NOT NULL,
  difficulty TEXT,
  nickname   TEXT NOT NULL CHECK (
               length(nickname) BETWEEN 3 AND 12
               AND nickname GLOB '[A-Za-z0-9]*'
               AND nickname NOT GLOB '*[^A-Za-z0-9]*'
             ),
  score      INTEGER NOT NULL CHECK (score >= 0),
  session_id TEXT NOT NULL REFERENCES game_sessions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
