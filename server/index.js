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

app.use('/games/snake', express.static(path.join(__dirname, '../games/snake')));
app.get('/', (req, res) => res.redirect('/games/snake/'));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`arcade-hub server listening on http://localhost:${port}`);
});
