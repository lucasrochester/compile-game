// === Game State ===
const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] },
    2: { lines: [[], [], []], hand: [] },
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;

// === Load Cards and Initialize ===
fetch('../data/cards.json')
  .then(res => res.json())
  .then(data => {
    const lifeCards = data.protocols.Life.cards;
    const lightCards = data.protocols.Light.cards;

    // Setup initial board cards
    gameState.players[1].lines[0].push({ ...lifeCards[1], faceUp: true, protocolColor: 'green' });
    gameState.players[1].lines[1].push({ ...lightCards[3], faceUp: true, protocolColor: 'yellow' });

    // Setup initial hand
    gameState.players[1].hand.push({ ...lifeCards[2], protocolColor: 'green' });
    gameState.players[1].hand.push({ ...lightCards[4], protocolColor: 'yellow' });

    renderGameBoard();
    renderHand();
  });

// === Render the Game Board ===
function renderGameBoard() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const playerDiv = document.getElementById(pidStr);
    const lines = playerDiv.querySelectorAll('.line');

    lines.forEach((lineDiv, idx) => {
      lineDiv.innerHTML = ''; // Clear old cards
      const cards = gameState.players[playerId].lines[idx];

      cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');
        if (!card.faceUp) cardDiv.classList.add('face-down');
        cardDiv.textContent = card.name + (card.faceUp ? ` (${card.points})` : '');
        cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
        cardDiv.addEventListener('click', () => {
          console.log(`Clicked ${card.name}, faceUp: ${card.faceUp}`);
        });
        lineDiv.appendChild(cardDiv);
      });

      // Add click handler to line for playing a card (only current player lines)
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
      } else {
        lineDiv.style.cursor = 'default';
        lineDiv.onclick = null;
      }
    });
  });
}

// === Render Player's Hand ===
function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';
  gameState.players[gameState.currentPlayer].hand.forEach((card, idx) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    cardDiv.textContent = card.name;
    cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
    cardDiv.style.cursor = 'pointer';
    cardDiv.style.background = (idx === selectedCardIndex) ? '#555' : '#333';
    cardDiv.addEventListener('click', () => {
      selectedCardIndex = idx;
      renderHand();
      alert(`Selected card: ${card.name}. Now click a line to play it.`);
    });
    handDiv.appendChild(cardDiv);
  });
}

// === Play Card Function ===
function playCardOnLine(playerId, handIndex, lineIndex) {
  const card = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  
  // Ensure protocolColor is present - if missing, assign a default color or fetch from JSON
  if (!card.protocolColor) {
    // Example: Assign green as default or pull from your original card data
    card.protocolColor = 'gray';
  }

  card.faceUp = false; // Play face down by default
  gameState.players[playerId].lines[lineIndex].push(card);
  console.log(`${card.name} played face down on line ${lineIndex} by Player ${playerId}`);
}

