let allCardsData = null;
const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Water: 'blue',
  Darkness: 'black',
  Love: 'lightpink',
  Hate: 'red',
  Death: 'gray',
  Apathy: 'lightgray',
  Metal: 'darkgray',
  Plague: 'darkgreen',
  Spirit: 'darkblue',
  Fire: 'orange',
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
  gameState.players[1].hand = [];
  gameState.players[1].lines = [[], [], []];
  gameState.players[2].lines = [[], [], []];

  // Example initial cards
  const life1 = findCard('Life', 1);
  const light4 = findCard('Light', 4);
  if (life1) gameState.players[1].hand.push({...life1, faceUp: true});
  if (light4) gameState.players[1].hand.push({...light4, faceUp: true});

  const psychic2 = findCard('Psychic', 2);
  if (psychic2) gameState.players[1].lines[0].push({...psychic2, faceUp: true});

  const light4b = findCard('Light', 4);
  const life1b = findCard('Life', 1);
  if (light4b) gameState.players[2].lines[0].push({...light4b, faceUp: true});
  if (life1b) gameState.players[2].lines[1].push({...life1b, faceUp: true});

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

        const topText = card.topEffect || '-';
        const middleText = card.middleEffect || '-';
        const bottomText = card.bottomEffect || '-';

        cardDiv.innerHTML = `
          <div><strong>${card.name} (${card.value})</strong></div>
          <div><em>Top: ${topText}</em></div>
          <div><em>Middle: ${middleText}</em></div>
          <div><em>Bottom: ${bottomText}</em></div>
        `;

        cardDiv.style.border = `2px solid ${card.protocolColor || 'gray'}`;
        cardDiv.style.top = `${i * 40}px`;
        cardDiv.style.zIndex = i + 1;

        cardDiv.addEventListener('click', e => {
          e.stopPropagation();
          if (playerId === gameState.currentPlayer) {
            flipCard(playerId, idx, i);
          }
        });

        lineDiv.appendChild(cardDiv);
      });

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
  card.faceUp = false; // play face down by default
  gameState.players[playerId].lines[lineIndex].push(card);
  console.log(`Played ${card.name} face down on line ${lineIndex} by Player ${playerId}`);
}

function flipCard(playerId, lineIndex, cardIndex) {
  const card = gameState.players[playerId].lines[lineIndex][cardIndex];
  card.faceUp = !card.faceUp;
  console.log(`${card.name} flipped ${card.faceUp ? 'face up' : 'face down'}`);
  if (card.faceUp) {
    triggerMiddleEffect(card);
  }
  renderGameBoard();
}

function triggerMiddleEffect(card) {
  console.log(`Triggering middle effect for ${card.name}`);
  // TODO: Implement your middle effect logic here based on card.middleEffect
}
