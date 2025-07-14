// Example game state
const gameState = {
  players: {
    1: { lines: [[], [], []], hand: [] },
    2: { lines: [[], [], []], hand: [] },
  }
};

fetch('../data/cards.json')
  .then(res => res.json())
  .then(data => {
    // For demo: assign some cards to each line for each player
    const lifeCards = data.protocols.Life.cards;
    const lightCards = data.protocols.Light.cards;
    const psychicCards = data.protocols.Psychic.cards;

    // Player 1 line 0 gets Life 1 face up, Life 2 face down
    gameState.players[1].lines[0].push({...lifeCards[1], faceUp: true});
    gameState.players[1].lines[0].push({...lifeCards[2], faceUp: false});

    // Player 1 line 1 gets Light 3 face up
    gameState.players[1].lines[1].push({...lightCards[3], faceUp: true});

    // Player 2 line 0 gets Psychic 0 face down, Psychic 3 face up
    gameState.players[2].lines[0].push({...psychicCards[0], faceUp: false});
    gameState.players[2].lines[0].push({...psychicCards[3], faceUp: true});

    renderGameBoard();
  });

function renderGameBoard() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player',''));
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
    });
  });
}
