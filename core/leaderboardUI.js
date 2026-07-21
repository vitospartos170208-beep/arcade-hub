// Рендер списка лидеров — общий для всех игр: сервер всегда отдаёт одну и
// ту же форму записи (nickname, score), меняется только сама игра.
export function renderLeaderboardList(listEl, entries) {
  listEl.textContent = '';
  entries.forEach((entry, i) => {
    const li = document.createElement('li');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'nickname';
    name.textContent = entry.nickname;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'score';
    scoreSpan.textContent = String(entry.score);

    li.append(rank, name, scoreSpan);
    listEl.appendChild(li);
  });
}

// Таблица лидеров свёрнута по умолчанию — раскрывается по клику на кнопку.
export function initLeaderboardToggle(toggleBtn, panelEl) {
  const collapsedLabel = toggleBtn.textContent;
  const expandedLabel = collapsedLabel.replace('▾', '▴');

  toggleBtn.setAttribute('aria-expanded', 'false');
  panelEl.hidden = true;

  toggleBtn.addEventListener('click', () => {
    const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(!expanded));
    toggleBtn.textContent = expanded ? collapsedLabel : expandedLabel;
    panelEl.hidden = expanded;
  });
}
