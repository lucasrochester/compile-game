const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] }
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;

// For demo: some dummy cards
const demoCards = [
  { name: 'Life 1', points: 1, protocolColor: 'green', faceUp: true },
  { name: 'Light 3', points: 3, protocolColor: 'yellow', faceUp: true },
  { name: 'Psychic 2', points: 2, protocolColor: 'purple', faceUp: true }
];

// Assign initial cards to Player 1 hand and lines
gameState.players[1].hand.push({...demoCards[0], faceUp: true});
gameState.players[1].hand.push({...demoCards[1], faceUp: true});
gameState.players[1].lines[0].push({...demoCards[2], faceUp: true});

renderGameBoard();
renderHand();

function renderGameBoard() {
  const playerDiv = document.getElementById('player1');
  const lines = playerDiv.querySelectorAll('.line');

  lines.forEach((lineDiv, idx) => {
    lineDiv.innerHTML = '';
    const cards = gameState.players[1].lines[idx];
    cards.forEach(card => {
      const cardDiv = document.createElement('div');
      cardDiv.classList.add('card');
      if (!card.faceUp) cardDiv.classList.add('face-down');
      cardDiv.textContent = card.name + (card.faceUp ? ` (${card.points})` : '');
      cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
      lineDiv.appendChild(cardDiv);
    });

    // Allow clicking line to play selected card
    lineDiv.style.cursor = 'pointer';
    lineDiv.onclick = () => {
      if (selectedCardIndex !== null) {
        playCardOnLine(1, selectedCardIndex, idx);
        selectedCardIndex = null;
        renderGameBoard();
        renderHand();
      }
    };
  });
}

function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';
  gameState.players[1].hand.forEach((card, idx) => {
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

function playCardOnLine(playerId, handIndex, lineIndex) {
  const card = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  card.faceUp = false; // plays face down by default
  gameState.players[playerId].lines[lineIndex].push(card);
  console.log(`Played ${card.name} face down on line ${lineIndex} by Player ${playerId}`);
}
