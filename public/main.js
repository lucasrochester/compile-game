let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  // Add other protocols as needed...
};

const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] },
    2: { lines: [[], [], []], hand: [] }
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;

fetch('/data/cards.json')
  .then(res => res.json())
  .then(data => {
    allCardsData = data;
    initializeGame();
  })
  .catch(e => console.error('Failed to load cards.json', e));

function findCard(protocol, value) {
  if (!allCardsData) return null;
  const protocolData = allCardsData.protocols[protocol];
  if (!protocolData) return null;
  const card = protocolData.cards.find(c => c.value === value);
  if (card) card.protocolColor = protocolColors[protocol];
  return card;
}

function initializeGame() {
  if (gameState.players[1].hand.length === 0) {
    gameState.players[1].hand = [
      findCard('Life', 1),
      findCard('Light', 4),
      findCard('Psychic', 2),
      findCard('Speed', 3),
      findCard('Gravity', 0),
    ].filter(Boolean).map(card => ({ ...card, faceUp: true }));
  }

  gameState.players[1].lines = [[], [], []];
  gameState.players[2].lines = [[], [], []];

  const fieldCardsP1 = [findCard('Life', 2), findCard('Light', 1)].filter(Boolean);
  fieldCardsP1.forEach(card => {
    gameState.players[1].lines[0].push({ ...card, faceUp: true });
  });

  const fieldCardsP2 = [findCard('Psychic', 3), findCard('Speed', 1)].filter(Boolean);
  fieldCardsP2.forEach(card => {
    gameState.players[2].lines[1].push({ ...card, faceUp: true });
  });

  renderGameBoard();
  renderHand();
}

function renderGameBoard() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const playerDiv = document.getElementById(pidStr);
    const lines = playerDiv.querySelectorAll('.line');

    lines.forEach((lineDiv, idx) => {
      lineDiv.innerHTML = '';
      const cards = gameState.players[playerId].lines[idx];

      cards.forEach((card, i) => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');
        if (!card.faceUp) cardDiv.classList.add('face-down');
        if (i < cards.length - 1) cardDiv.classList.add('covered');

        cardDiv.style.borderColor = card.faceUp ? (card.protocolColor || 'gray') : 'black';
        cardDiv.style.top = `${i * 80}px`;
        cardDiv.style.zIndex = i + 1;
        cardDiv.style.left = '0';

        cardDiv.innerHTML = `
          <div class="card-section card-name">${card.name} (${card.value})</div>
          <div class="card-section card-top">${card.topEffect || ''}</div>
          <div class="card-section card-middle">${card.middleEffect || ''}</div>
          <div class="card-section card-bottom">${card.bottomEffect || ''}</div>
        `;

        cardDiv.addEventListener('click', e => {
          e.stopPropagation();
          if (playerId === gameState.currentPlayer) {
            flipCard(playerId, idx, i);
          }
        });

        lineDiv.appendChild(cardDiv);
      });

      if (playerId === gameState.currentPlayer) {
        lineDiv.style.cursor = 'pointer';
        lineDiv.onclick = () => {
          if (selectedCardIndex !== null) {
            playCardOnLine(playerId, selectedCardIndex, idx);
            selectedCardIndex = null;
            renderGameBoard();
            renderHand();
          }
        };


