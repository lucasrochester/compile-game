let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Darkness: 'black',
};

const gameState = {
  players: {
    1: {
      protocols: ['Life', 'Light', 'Psychic'],
      lines: [[], [], []],
      hand: [],
      deck: [],
      discard: [],
    },
    2: {
      protocols: ['Speed', 'Gravity', 'Darkness'],
      lines: [[], [], []],
      hand: [],
      deck: [],
      discard: [],
    }
  },
  currentPlayer: 1,
  controlComponent: false,
  mustCompileLine: null,
  compiledProtocols: {1: [], 2: []},
};

let selectedCardIndex = null;
let selectedCardFaceUp = false;

fetch('/data/cards.json')
  .then(res => res.json())
  .then(data => {
    allCardsData = data;
    initializeGame();
    startTurn();
  })
  .catch(e => console.error('Failed to load cards.json', e));

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function findCard(protocol, value) {
  if (!allCardsData) return null;
  const protocolData = allCardsData.protocols[protocol];
  if (!protocolData) return null;
  const card = protocolData.cards.find(c => c.value === value);
  if (card) card.protocolColor = protocolColors[protocol];
  return card;
}

function initializeGame() {
  [1, 2].forEach(pid => {
    const player = gameState.players[pid];
    player.deck = [];

    player.protocols.forEach(protocol => {
      const protocolCards = allCardsData.protocols[protocol]?.cards || [];
      protocolCards.forEach(cardData => {
        const card = {...cardData, protocolColor: protocolColors[protocol], faceUp: false};
        player.deck.push(card);
      });
    });

    shuffle(player.deck);

    player.lines = [[], [], []];
    player.hand = [];
    player.discard = [];

    for (let i = 0; i < 5 && player.deck.length > 0; i++) {
      drawCard(pid);
    }
  });

  renderGameBoard();
  renderHand();
  setupFlipToggle();
  updateRefreshButton();
  updateButtonsState();

  setupLineClickDelegation();
}

function setupLineClickDelegation() {
  const player1LinesContainer = document.querySelector('#player1 .lines');
  player1LinesContainer.addEventListener('click', (e) => {
    let lineDiv = e.target;
    while (lineDiv && !lineDiv.classList.contains('line')) {
      lineDiv = lineDiv.parentElement;
    }
    if (!lineDiv) return;

    const lineIndex = parseInt(lineDiv.getAttribute('data-line'));
    if (isNaN(lineIndex)) return;

    if (selectedCardIndex === null) {
      alert('No card selected to play!');
      return;
    }

    const playerId = 1;
    playCardOnLine(playerId, selectedCardIndex, lineIndex);
    selectedCardIndex = null;
    selectedCardFaceUp = false;
    updateFlipToggleButton();
    renderGameBoard();
    renderHand();
    updateButtonsState();
  });
}

function drawCard(playerId) {
  const player = gameState.players[playerId];
  if (player.deck.length === 0) {
    if (player.discard.length === 0) return null;
    player.deck = player.discard.splice(0);
    shuffle(player.deck);
  }
  const card = player.deck.pop();
  card.faceUp = true; 
  player.hand.push(card);
  return card;
}

function refreshHand(playerId) {
  const player = gameState.players[playerId];
  while (player.hand.length < 5) {
    if (!drawCard(playerId)) break;
  }
}

function startTurn() {
  console.log('Starting turn for player', gameState.currentPlayer);
  gameState.controlComponent = false;
  gameState.mustCompileLine = null;
  updateButtonsState();
  startPhase();
}

function startPhase() {
  console.log('Start phase');
  triggerEffects('Start');
  checkControl();
}

function checkControl() {
  console.log('Check control phase');
  const playerId = gameState.currentPlayer;
  const opponentId = playerId === 1 ? 2 : 1;
  let controlCount = 0;
  for (let line = 0; line < 3; line++) {
    const playerValue = lineTotalValue(playerId, line);
    const opponentValue = lineTotalValue(opponentId, line);
    if (playerValue > opponentValue) controlCount++;
  }
  gameState.controlComponent = controlCount >= 2;
  updateButtonsState();
  checkCompile();
}

function lineTotalValue(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  return cards.reduce((sum, card) => sum + (card.faceUp ? card.value : 0), 0);
}

function checkCompile() {
  console.log('Check compile phase');
  const playerId = gameState.currentPlayer;
  const opponentId = playerId === 1 ? 2 : 1;
  gameState.mustCompileLine = null;
  for (let line = 0; line < 3; line++) {
    const playerValue = lineTotalValue(playerId, line);
    const opponentValue = lineTotalValue(opponentId, line);
    if (playerValue >= 10 && playerValue > opponentValue) {
      gameState.mustCompileLine = line;
      break;
    }
  }
  updateButtonsState();
  if (gameState.mustCompileLine !== null) {
    alert(`You must compile the protocol on line ${gameState.mustCompileLine + 1} this turn.`);
  }
  actionPhase();
}

function actionPhase() {
  console.log('Action phase');
  if (gameState.mustCompileLine !== null) {
    alert("You must compile this turn. Use the Compile button.");
    updateButtonsState();
    return;
  }
  updateButtonsState();
}

function checkCache() {
  const player = gameState.players[gameState.currentPlayer];
  while (player.hand.length > 5) {
    const discarded = player.hand.pop();
    player.discard.push(discarded);
  }
}

function endPhase() {
  console.log('End phase');
  triggerEffects('End');
  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();
  renderGameBoard();
  renderHand();
  startTurn();
}

function triggerEffects(phase) {
  // Stub for effect processing
}

function compileProtocol(playerId, lineIndex) {
  console.log(`Compiling protocol on line ${lineIndex} for player ${playerId}`);
  gameState.players[1].lines[lineIndex].forEach(c => gameState.players[1].discard.push(c));
  gameState.players[2].lines[lineIndex].forEach(c => gameState.players[2].discard.push(c));
  gameState.players[1].lines[lineIndex] = [];
  gameState.players[2].lines[lineIndex] = [];
  gameState.compiledProtocols[playerId].push(gameState.players[playerId].protocols[lineIndex]);

  gameState.mustCompileLine = null;

  alert(`Player ${playerId} compiled protocol ${gameState.players[playerId].protocols[lineIndex]}!`);
  updateButtonsState();
  renderGameBoard();
  renderHand();
  checkCache();
  endPhase();
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');
  const compileBtn = document.getElementById('compile-button');

  refreshBtn.disabled = gameState.players[gameState.currentPlayer].hand.length >= 5;
  compileBtn.disabled = gameState.mustCompileLine === null;
}

document.getElementById('refresh-button').addEventListener('click', () => {
  refreshHand(gameState.currentPlayer);
  renderHand();
  updateButtonsState();
});

document.getElementById('compile-button').addEventListener('click', () => {
  if (gameState.mustCompileLine === null) return;
  compileProtocol(gameState.currentPlayer, gameState.mustCompileLine);
});

function renderGameBoard() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const playerDiv = document.getElementById(pidStr);
    const lines = playerDiv.querySelectorAll('.line');

    lines.forEach((lineDiv, idx) => {
      lineDiv.innerHTML = '';

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

        lineDiv.style.cursor = playerId === 1 ? 'pointer' : 'default';

        lineDiv.appendChild(cardDiv);
      });
    });
  });
}

function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';

  const hand = gameState.players[gameState.currentPlayer].hand;

  if (!hand || hand.length === 0) {
    handDiv.textContent = 'No cards in hand';
    updateRefreshButton();
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
      selectedCardFaceUp = card.faceUp;
      updateFlipToggleButton();
      renderHand();
    });

    handDiv.appendChild(cardDiv);
  });

  updateRefreshButton();
}

function playCardOnLine(playerId, handIndex, lineIndex) {
  if (handIndex !== selectedCardIndex) return;

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];
  const lineProtocol = gameState.players[playerId].protocols[lineIndex];

  if (selectedCardFaceUp && cardProtocol !== lineProtocol) {
    alert(`Face-up cards must be played on their protocol line: ${lineProtocol}`);
    return;
  }

  gameState.players[playerId].hand.splice(handIndex, 1)[0];
  card.faceUp = selectedCardFaceUp;

  gameState.players[playerId].lines[lineIndex].push(card);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  renderGameBoard();
  renderHand();
  updateButtonsState();
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

function updateRefreshButton() {
  const btn = document.getElementById('refresh-button');
  const hand = gameState.players[gameState.currentPlayer].hand;
  btn.disabled = hand.length >= 5;
}


