require('dotenv').config({ quiet: true });

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');

const sessionRoutes = require('./routes/sessionRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const { sessionLimiter, scoreLimiter } = require('./middleware/rateLimit');

const app = express();

app.use(helmet());
app.use(express.json());

app.use('/api/session', sessionLimiter, sessionRoutes);
app.use('/api/score', scoreLimiter, scoreRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.use('/core', express.static(path.join(__dirname, '../core')));
app.use('/games/snake', express.static(path.join(__dirname, '../games/snake')));
app.use('/games/mole', express.static(path.join(__dirname, '../games/mole')));
app.use('/games/bug', express.static(path.join(__dirname, '../games/bug')));
app.use('/games/boar', express.static(path.join(__dirname, '../games/boar')));
app.use('/games/hamster', express.static(path.join(__dirname, '../games/hamster')));
app.use('/bizcard', express.static(path.join(__dirname, '../bizcard')));
app.use('/landing', express.static(path.join(__dirname, '../landing')));
app.use('/', express.static(path.join(__dirname, '../hub')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`arcade-hub server listening on http://localhost:${port}`);
});
