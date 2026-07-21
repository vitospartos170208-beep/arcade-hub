const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.resolve(__dirname, '../..', process.env.DB_PATH || './data/arcade.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Миграция для БД, созданных до появления второй игры: тогда таблицы не
// знали, к какой игре относится счёт, потому что игра была одна.
function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('game_sessions', 'game', "TEXT NOT NULL DEFAULT 'snake'");
addColumnIfMissing('scores', 'game', "TEXT NOT NULL DEFAULT 'snake'");

// difficulty нужна только играм с уровнями сложности (пока — «Крот»),
// поэтому колонка необязательная, без DEFAULT.
addColumnIfMissing('game_sessions', 'difficulty', 'TEXT');
addColumnIfMissing('scores', 'difficulty', 'TEXT');

// Индекс зависит от колонки game, поэтому создаётся после миграции, а не
// в самом schema.sql — на старой БД колонки ещё не было бы в момент exec.
db.exec('CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores (game, score DESC);');

module.exports = db;
