let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Darkness: 'black',
  // Add other protocols if needed
};

const gameState = {
  players: {
    1: {
      protocols: ['Life', 'Light', 'Psychic'],
      lines: [[], [], []],
      hand: [],
    },
    2: {
      protocols: ['Speed', 'Gravity', 'Darkness'],
      lines: [[], [], []],
      hand: [],
    }
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;
let selectedCardFaceUp = false; // track flip state of selected card in hand

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
  setupFlipToggle();
}

function renderGameBoard() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const playerDiv = document.getElementById(pidStr);
    const lines = playerDiv.querySelectorAll('.line');

    lines.forEach((lineDiv, idx) => {
      lineDiv.innerHTML = ''; // clear previous

      // Render protocol name & color
      const protocolNameDiv = document.createElement('div');
      protocolNameDiv.classList.add('protocol-name');
      const protocolName = gameState.players[playerId].protocols[idx];
      const protocolColor = protocolColors[protocolName] || 'gray';
      protocolNameDiv.textContent = protocolName;
      protocolNameDiv.style.color = protocolColor;
      lineDiv.appendChild(protocolNameDiv);

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

        // No flipping on board cards anymore

        lineDiv.appendChild(cardDiv);
      });

      if (playerId === gameState.currentPlayer) {
        lineDiv.style.cursor = 'pointer';
        lineDiv.onclick = () => {
          if (selectedCardIndex !== null) {
            playCardOnLine(playerId, selectedCardIndex, idx);
            selectedCardIndex = null;
            selectedCardFaceUp = false;
            updateFlipToggleButton();
            renderGameBoard();
            renderHand();
          }
        };
      } else {
        lineDiv.style.cursor = 'default';
        lineDiv.onclick = null;
      }
    });
  });
}

function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';

  const hand = gameState.players[gameState.currentPlayer].hand;

  if (!hand || hand.length === 0) {
    handDiv.textContent = 'No cards in hand';
    return;
  }

  hand.forEach((card, idx) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card', 'in-hand');

    const isSelected = idx === selectedCardIndex;
    const faceUpToShow = isSelected ? selectedCardFaceUp : card.faceUp;

    cardDiv.style.borderColor = faceUpToShow ? (card.protocolColor || 'gray') : 'black';
    cardDiv.style.cursor = 'pointer';

    if (!faceUpToShow) {
      cardDiv.classList.add('face-down');
    } else {
      cardDiv.classList.remove('face-down');
    }

    cardDiv.style.background = isSelected ? '#555' : '#444';

    cardDiv.innerHTML = `
      <div class="card-section card-name">${card.name} (${card.value})</div>
      <div class="card-section card-top">${card.topEffect || ''}</div>
      <div class="card-section card-middle">${card.middleEffect || ''}</div>
      <div class="card-section card-bottom">${card.bottomEffect || ''}</div>
    `;

    cardDiv.addEventListener('click', () => {
      selectedCardIndex = idx;
      selectedCardFaceUp = card.faceUp; // default to card's faceUp on select
      updateFlipToggleButton();
      renderHand();
    });

    handDiv.appendChild(cardDiv);
  });
}

function playCardOnLine(playerId, handIndex, lineIndex) {
  if (handIndex !== selectedCardIndex) return;

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];

  if (selectedCardFaceUp) {
    const lineProtocol = gameState.players[playerId].protocols[lineIndex];
    if (cardProtocol !== lineProtocol) {
      alert(`Face-up cards must be played on their protocol line: ${lineProtocol}`);
      return;
    }
  }

  gameState.players[playerId].hand.splice(handIndex, 1)[0];
  card.faceUp = selectedCardFaceUp;

  gameState.players[playerId].lines[lineIndex].push(card);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  renderGameBoard();
  renderHand();
}

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
}

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if (selectedCardIndex === null) return;
    selectedCardFaceUp = !selectedCardFaceUp;
    updateFlipToggleButton();
    renderHand();
  });
}
