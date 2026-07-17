const rateLimit = require('express-rate-limit');

const sessionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'слишком много запросов, попробуй позже' },
});

const scoreLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'слишком много запросов, попробуй позже' },
});

module.exports = { sessionLimiter, scoreLimiter };
