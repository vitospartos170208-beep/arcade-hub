// Разбивает текст на предложения и добавляет счёт отдельной строкой.
// Рассчитан на использование с CSS white-space: pre-line — переносы
// остаются переносами, но textContent (не innerHTML) не даёт вставить разметку.
export function formatEndMessage(text, scoreLine) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...sentences, scoreLine].join('\n');
}
