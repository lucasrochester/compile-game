const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] },
    2: { lines: [[], [], []], hand: [] },
  },
  currentPlayer: 1,
};

let selectedCardIndex = null;

// Sample cards for demo purposes
const demoCards = [
  { name: 'Life 1', points: 1, protocolColor: 'green', faceUp: true },
  { name: 'Light 3', points: 3, protocolColor: 'yellow', faceUp: true },
  { name: 'Psychic 2', points: 2, protocolColor: 'purple', faceUp: true },
];

// Initialize game state with some cards for both players
gameState.players[1].hand.push({ ...demoCards[0], faceUp: true });
gameState.players[1].hand.push({ ...demoCards[1], faceUp: true });
gameState.players[1].lines[0].push({ ...demoCards[2], faceUp: true });

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
      cards.forEach((card) => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');
        if (!card.faceUp) cardDiv.classList.add('face-down');
        cardDiv.textContent = card.name + (card.faceUp ? ` (${card.points})` : '');
        cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
        lineDiv.appendChild(cardDiv);
      });

      // Only player 1 can play cards on their lines for now
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
  gameState.players[1].hand.forEach((card, idx) => {
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
  card.faceUp = false; // play face down by default
  gameState.players[playerId].lines[lineIndex].push(card);
  console.log(`Played ${card.name} face down on line ${lineIndex} by Player ${playerId}`);
}
