// ==== GAME STATE ====
const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] },
    2: { lines: [[], [], []], hand: [] },
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;

// ==== SAMPLE CARDS ====
const demoCards = [
  { name: 'Life 1', points: 1, protocolColor: 'green', faceUp: true },
  { name: 'Light 3', points: 3, protocolColor: 'yellow', faceUp: true },
  { name: 'Psychic 2', points: 2, protocolColor: 'purple', faceUp: true },
];

// Initialize player 1 hand and lines with demo cards
gameState.players[1].hand.push({ ...demoCards[0], faceUp: true });
gameState.players[1].hand.push({ ...demoCards[1], faceUp: true });
gameState.players[1].lines[0].push({ ...demoCards[2], faceUp: true });

// Player 2 lines for visual
gameState.players[2].lines[0].push({ ...demoCards[1], faceUp: true });
gameState.players[2].lines[1].push({ ...demoCards[0], faceUp: true });

renderGameBoard();
renderHand();

function renderGameBoard() {
  ['player1', 'player2'].forEach((pidStr) => {
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
      cardDiv.textContent = card.faceUp ? `${card.name} (${card.points})` : 'Face Down';
      cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
      cardDiv.style.zIndex = cards.length - i;  // higher zIndex for top cards
      lineDiv.appendChild(cardDiv);
    });

      // Player 1 lines clickable only
      if (playerId === 1) {
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

function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';

  const hand = gameState.players[gameState.currentPlayer].hand;

  if (hand.length === 0) {
    handDiv.textContent = 'No cards in hand';
    return;
  }

  hand.forEach((card, idx) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    cardDiv.textContent = card.name;
    cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
    cardDiv.style.cursor = 'pointer';
    cardDiv.style.background = idx === selectedCardIndex ? '#555' : '#333';
    cardDiv.addEventListener('click', () => {
      selectedCardIndex = idx;
      renderHand();
      alert(`Selected card: ${card.name}. Now click a line to play it.`);
    });
    handDiv.appendChild(cardDiv);
  });
}

function playCardOnLine(playerId, handIndex, lineIndex) {
  const card = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  card.faceUp = false;
  gameState.players[playerId].lines[lineIndex].push(card);
  console.log(`Played ${card.name} face down on line ${lineIndex} by Player ${playerId}`);
}
