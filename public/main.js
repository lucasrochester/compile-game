// Game state
const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] },
    2: { lines: [[], [], []], hand: [] },
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;

// Load cards and initialize
fetch('../data/cards.json')
  .then(res => res.json())
  .then(data => {
    const lifeCards = data.protocols.Life.cards;
    const lightCards = data.protocols.Light.cards;

    // Setup initial board cards for Player 1
    gameState.players[1].lines[0].push({ ...lifeCards[1], faceUp: true, protocolColor: 'green' });
    gameState.players[1].lines[1].push({ ...lightCards[3], faceUp: true, protocolColor: 'yellow' });

    // Setup Player 1's hand
    gameState.players[1].hand.push({ ...lifeCards[2], protocolColor: 'green' });
    gameState.players[1].hand.push({ ...lightCards[4], protocolColor: 'yellow' });

    renderGameBoard();
    renderHand();
  });

// Render the board
function renderGameBoard() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const playerDiv = document.getElementById(pidStr);
    const lines = playerDiv.querySelectorAll('.line');

    lines.forEach((lineDiv, idx) => {
      lineDiv.innerHTML = '';
      const cards = gameState.players[playerId].lines[idx];
      cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');
        if (!card.faceUp) cardDiv.classList.add('face-down');
        cardDiv.textContent = card.name + (card.faceUp ? ` (${card.points})` : '');
        cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
        lineDiv.appendChild(cardDiv);
      });

      // Allow clicking line to play card only if current player and a card selected
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

// Render player's hand
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

// Function to play card on line
function playCardOnLine(playerId, handIndex, lineIndex) {
  const card = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  card.faceUp = false;
  gameState.players[playerId].lines[lineIndex].push(card);
  console.log(`${card.name} played face down on line ${lineIndex} by Player ${playerId}`);
}
