const BASE = '/api';

// Общий клиент для всех игр платформы: у каждой игры свой слаг (`game`),
// но протокол общения с сервером (сессия → счёт → лидерборд) одинаковый.
export function createApiClient(game) {
  return {
    // extra — поля, нужные конкретной игре (например, сложность у «Крота»);
    // игры без таких полей просто не передают extra.
    async startSession(extra = {}) {
      const res = await fetch(`${BASE}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, ...extra }),
      });
      if (!res.ok) throw new Error('не удалось начать игру');
      return res.json();
    },

    async submitScore(sessionId, nickname, score, extra = {}) {
      const res = await fetch(`${BASE}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, nickname, score, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'не удалось отправить счёт');
      return data;
    },

    async fetchLeaderboard() {
      const res = await fetch(`${BASE}/leaderboard?game=${game}`);
      if (!res.ok) throw new Error('не удалось загрузить таблицу лидеров');
      return res.json();
    },
  };
}
