const BASE = '/api';

export async function startSession() {
  const res = await fetch(`${BASE}/session`, { method: 'POST' });
  if (!res.ok) throw new Error('не удалось начать игру');
  return res.json();
}

export async function submitScore(sessionId, nickname, score) {
  const res = await fetch(`${BASE}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, nickname, score }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'не удалось отправить счёт');
  return data;
}

export async function fetchLeaderboard() {
  const res = await fetch(`${BASE}/leaderboard`);
  if (!res.ok) throw new Error('не удалось загрузить таблицу лидеров');
  return res.json();
}
