import { startSession, submitScore, fetchLeaderboard } from './api.js';
import { renderLeaderboardList, initLeaderboardToggle } from '../../core/leaderboardUI.js';
import { pickRandom } from '../../core/pickRandom.js';
import { formatEndMessage } from '../../core/messageFormat.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = ['♥', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const OFFSET = 22;

const NICKNAME_RE = /^[A-Za-z0-9]{3,12}$/;
const POINTS_PER_CARD = 10;
const WIN_SCORE = 1000;

const WIN_TAUNTS = [
  'Все карты в защёчных мешках. Хомяк доволен.',
  'Полный запас! Ни одной карты не потеряно.',
  'Разложил всё по полочкам — в буквальном смысле.',
  'Хомяк набил щёки под завязку. Победа!',
  'От туза до короля — идеальный склад.',
  'Ты обчистил колоду подчистую. Красиво.',
];

const LOSS_TAUNTS = {
  rough: [
    'Хомяк заснул на середине раскладки.',
    'Запасы скромные. Очень скромные.',
    'Сдался рано. Карты не одобряют.',
    'Щёки почти пустые — не сезон.',
    'Начало было, продолжения — нет.',
    'Колода оказалась хитрее.',
  ],
  decent: [
    'Неплохой запас, но до полных щёк далеко.',
    'Половина дела сделана — и брошена.',
    'Хомяк набрал приличный склад и сдался.',
    'Средне, но честно.',
    'Есть с чем зимовать. Не с избытком.',
    'Раскладка почти поддалась. Почти.',
  ],
  soClose: [
    'Ещё чуть-чуть — и полные закрома!',
    'Так близко к победе, что обидно вдвойне.',
    'Один неверный ход — и всё встало.',
    'Хомяк был на волосок от идеального запаса.',
    'Почти вся колода твоя. Почти не считается.',
    'Ещё пара карт — и это была бы легенда.',
  ],
};

function pickLossTaunt(cardsOnFoundation) {
  if (cardsOnFoundation < 15) return pickRandom(LOSS_TAUNTS.rough);
  if (cardsOnFoundation < 31) return pickRandom(LOSS_TAUNTS.decent);
  return pickRandom(LOSS_TAUNTS.soClose);
}

function createDeck() {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank, i) => {
      deck.push({
        suit,
        rank,
        value: i + 1,
        color: RED_SUITS.includes(suit) ? 'red' : 'black',
        faceUp: false,
      });
    });
  });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function deal() {
  const deck = createDeck();
  shuffle(deck);

  const tableau = [[], [], [], [], [], [], []];
  let cardIndex = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck[cardIndex++];
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }

  const stock = deck.slice(cardIndex);
  return {
    tableau,
    stock,
    waste: [],
    foundations: { '♠': [], '♥': [], '♦': [], '♣': [] },
  };
}

function isValidRun(cards) {
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i];
    const b = cards[i + 1];
    if (a.color === b.color) return false;
    if (a.value !== b.value + 1) return false;
  }
  return true;
}

function canStackOnTableau(card, targetTop) {
  if (!targetTop) return card.rank === 'K';
  return card.color !== targetTop.color && card.value === targetTop.value - 1;
}

function canPlaceOnFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length - 1];
  return card.suit === top.suit && card.value === top.value + 1;
}

const stockPileEl = document.getElementById('stock-pile');
const wastePileEl = document.getElementById('waste-pile');
const foundationEls = Object.fromEntries(SUITS.map((s) => [s, document.getElementById(`foundation-${s}`)]));
const tableauEls = Array.from(document.querySelectorAll('.column'));

const movesEl = document.getElementById('moves');
const scoreEl = document.getElementById('score');
const startBtn = document.getElementById('start-btn');
const forfeitBtn = document.getElementById('forfeit-btn');
const nicknameInput = document.getElementById('nickname');
const statusMessage = document.getElementById('status-message');
const leaderboardList = document.getElementById('leaderboard-list');
const leaderboardToggle = document.getElementById('leaderboard-toggle');
const leaderboardPanel = document.getElementById('leaderboard-panel');

let state = null;

function createState() {
  return {
    ...deal(),
    selected: null,
    moves: 0,
    sessionId: null,
    over: true,
  };
}

function cardsOnFoundationCount() {
  return SUITS.reduce((sum, s) => sum + state.foundations[s].length, 0);
}

function isSelected(target) {
  const sel = state.selected;
  if (!sel || sel.type !== target.type) return false;
  if (sel.type === 'waste') return true;
  if (sel.type === 'tableau') return sel.col === target.col && target.index >= sel.index;
  return false;
}

function getSelectedCards() {
  const sel = state.selected;
  if (!sel) return [];
  if (sel.type === 'waste') return [state.waste[state.waste.length - 1]];
  if (sel.type === 'tableau') return state.tableau[sel.col].slice(sel.index);
  return [];
}

function removeSelectedFromSource() {
  const sel = state.selected;
  if (sel.type === 'waste') {
    state.waste.pop();
  } else if (sel.type === 'tableau') {
    const col = state.tableau[sel.col];
    col.splice(sel.index);
    const newTop = col[col.length - 1];
    if (newTop && !newTop.faceUp) newTop.faceUp = true;
  }
}

function drawFromStock() {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return;
    state.stock = state.waste.reverse();
    state.stock.forEach((c) => {
      c.faceUp = false;
    });
    state.waste = [];
    state.moves += 1;
    return;
  }
  const card = state.stock.pop();
  card.faceUp = true;
  state.waste.push(card);
  state.moves += 1;
}

function trySelectTarget(target) {
  if (target.type === 'tableau') {
    const col = state.tableau[target.col];
    if (target.index == null || target.index >= col.length) return;
    const card = col[target.index];
    if (!card.faceUp) return;
    if (!isValidRun(col.slice(target.index))) return;
    state.selected = { type: 'tableau', col: target.col, index: target.index };
  } else if (target.type === 'waste') {
    if (state.waste.length === 0) return;
    state.selected = { type: 'waste' };
  }
}

function tryMove(target) {
  const movingCards = getSelectedCards();
  if (!movingCards.length) return false;

  if (target.type === 'foundation') {
    if (movingCards.length !== 1) return false;
    const card = movingCards[0];
    const pile = state.foundations[card.suit];
    if (target.suit !== card.suit) return false;
    if (!canPlaceOnFoundation(card, pile)) return false;
    removeSelectedFromSource();
    pile.push(card);
    state.moves += 1;
    return true;
  }

  if (target.type === 'tableau') {
    const destCol = state.tableau[target.col];
    if (state.selected.type === 'tableau' && state.selected.col === target.col) return false;
    const destTop = destCol[destCol.length - 1];
    if (!canStackOnTableau(movingCards[0], destTop)) return false;
    removeSelectedFromSource();
    destCol.push(...movingCards);
    state.moves += 1;
    return true;
  }

  return false;
}

function onTarget(target) {
  if (!state || state.over) return;

  if (target.type === 'stock') {
    drawFromStock();
    render();
    return;
  }

  if (state.selected) {
    const moved = tryMove(target);
    state.selected = null;
    if (moved) {
      if (cardsOnFoundationCount() === 52) {
        endGame(true);
        return;
      }
      render();
      return;
    }
  }

  trySelectTarget(target);
  render();
}

function createCardFace(card) {
  const el = document.createElement('div');
  el.className = `card ${card.color}`;
  el.textContent = `${card.rank}${card.suit}`;
  return el;
}

function createCardBack() {
  const el = document.createElement('div');
  el.className = 'card facedown';
  return el;
}

function render() {
  stockPileEl.textContent = '';
  if (state.stock.length > 0) {
    stockPileEl.appendChild(createCardBack());
  } else {
    const empty = document.createElement('div');
    empty.className = 'card empty-slot';
    empty.textContent = '↺';
    stockPileEl.appendChild(empty);
  }
  stockPileEl.onclick = () => onTarget({ type: 'stock' });

  wastePileEl.textContent = '';
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const el = createCardFace(card);
    if (isSelected({ type: 'waste' })) el.classList.add('selected');
    el.onclick = () => onTarget({ type: 'waste' });
    wastePileEl.appendChild(el);
  }

  SUITS.forEach((suit) => {
    const slotEl = foundationEls[suit];
    slotEl.textContent = '';
    const pile = state.foundations[suit];
    if (pile.length > 0) {
      slotEl.appendChild(createCardFace(pile[pile.length - 1]));
    }
    slotEl.onclick = () => onTarget({ type: 'foundation', suit });
  });

  state.tableau.forEach((col, colIndex) => {
    const colEl = tableauEls[colIndex];
    colEl.textContent = '';
    col.forEach((card, cardIndex) => {
      const el = card.faceUp ? createCardFace(card) : createCardBack();
      el.style.top = `${cardIndex * OFFSET}px`;
      if (card.faceUp && isSelected({ type: 'tableau', col: colIndex, index: cardIndex })) {
        el.classList.add('selected');
      }
      el.onclick = (e) => {
        e.stopPropagation();
        onTarget({ type: 'tableau', col: colIndex, index: cardIndex });
      };
      colEl.appendChild(el);
    });
    colEl.style.minHeight = `${72 + Math.max(0, col.length - 1) * OFFSET}px`;
    colEl.onclick = () => onTarget({ type: 'tableau', col: colIndex, index: col.length });
  });

  movesEl.textContent = String(state.moves);
  scoreEl.textContent = String(cardsOnFoundationCount() * POINTS_PER_CARD);
}

async function startGame() {
  const nickname = nicknameInput.value;
  if (!NICKNAME_RE.test(nickname)) {
    statusMessage.textContent = 'ник: 3-12 латинских букв или цифр';
    return;
  }

  startBtn.disabled = true;
  let session;
  try {
    session = await startSession();
  } catch (err) {
    statusMessage.textContent = err.message;
    startBtn.disabled = false;
    return;
  }

  state = createState();
  state.sessionId = session.sessionId;
  state.over = false;
  forfeitBtn.disabled = false;
  statusMessage.textContent = 'Собери все карты по мастям от туза до короля.';
  render();
}

async function endGame(won) {
  state.over = true;
  forfeitBtn.disabled = true;
  const cardsDone = cardsOnFoundationCount();
  const finalScore = won ? WIN_SCORE : cardsDone * POINTS_PER_CARD;
  const sessionId = state.sessionId;

  const taunt = won ? pickRandom(WIN_TAUNTS) : pickLossTaunt(cardsDone);
  statusMessage.textContent = formatEndMessage(taunt, `Счёт: ${finalScore}`);
  startBtn.disabled = false;
  render();

  try {
    await submitScore(sessionId, nicknameInput.value, finalScore, { moves: state.moves, won });
    await renderLeaderboard();
  } catch (err) {
    statusMessage.textContent += ` (счёт не отправлен: ${err.message})`;
  }
}

function forfeit() {
  if (!state || state.over) return;
  endGame(false);
}

async function renderLeaderboard() {
  let entries;
  try {
    entries = await fetchLeaderboard();
  } catch {
    return;
  }
  renderLeaderboardList(leaderboardList, entries);
}

state = createState();
render();
startBtn.addEventListener('click', startGame);
forfeitBtn.addEventListener('click', forfeit);
initLeaderboardToggle(leaderboardToggle, leaderboardPanel);
renderLeaderboard();
