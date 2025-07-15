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
  phase: 'start', // current phase for the turn
  actionTaken: false,
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
  updateButtonsState();

  setupLineClickDelegation();
}

function setupLineClickDelegation() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const container = document.querySelector(`#${pidStr} .lines`);
    container.addEventListener('click', (e) => {
      let lineDiv = e.target;
      while (lineDiv && !lineDiv.classList.contains('line')) {
        lineDiv = lineDiv.parentElement;
      }
      if (!lineDiv) return;

      const lineIndex = parseInt(lineDiv.getAttribute('data-line'));
      if (isNaN(lineIndex)) return;

      if (playerId !== gameState.currentPlayer) {
        alert(`It's Player ${gameState.currentPlayer}'s turn. You can only play on your own protocols.`);
        return;
      }

      if (selectedCardIndex === null) {
        alert('No card selected to play!');
        return;
      }

      playCardOnLine(playerId, selectedCardIndex, lineIndex);
      selectedCardIndex = null;
      selectedCardFaceUp = false;
      updateFlipToggleButton();

      // After playing a card, action is done for this turn
      gameState.actionTaken = true;

      renderGameBoard();
      renderHand();
      updateButtonsState();

      // Proceed to next phase after action
      setTimeout(() => {
        nextPhase();
      }, 100);
    });
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
  gameState.phase = 'start';
  gameState.actionTaken = false;
  updateTurnUI();
  runPhase();
}

function runPhase() {
  switch (gameState.phase) {
    case 'start':
      startPhase();
      break;
    case 'control':
      checkControlPhase();
      break;
    case 'compile':
      checkCompilePhase();
      break;
    case 'action':
      actionPhase();
      break;
    case 'cache':
      cachePhase();
      break;
    case 'end':
      endPhase();
      break;
  }
}

function nextPhase() {
  const phases = ['start', 'control', 'compile', 'action', 'cache', 'end'];
  const currentIndex = phases.indexOf(gameState.phase);
  if (currentIndex < phases.length - 1) {
    gameState.phase = phases[currentIndex + 1];
    runPhase();
  } else {
    // Turn finished: switch player
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    startTurn();
  }
}

function startPhase() {
  console.log('Start phase');
  triggerEffects('Start');
  gameState.phase = 'control';
  runPhase();
}

function checkControlPhase() {
  console.log('Control phase');
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
  gameState.phase = 'compile';
  runPhase();
}

function checkCompilePhase() {
  console.log('Compile phase');
  const playerId = gameState.currentPlayer;
  const opponentId = playerId === 1 ? 2 : 1;
  gameState.mustCompileLine = null;

  for (let line = 0; line < 3; line++) {
    const playerValue = lineTotalValue(playerId, line);
    const opponentValue = lineTotalValue(opponentId, line);
    console.log(`Line ${line}: player=${playerValue}, opponent=${opponentValue}`);
    if (playerValue >= 10 && playerValue > opponentValue) {
      gameState.mustCompileLine = line;
      break;
    }
  }

  if (gameState.mustCompileLine !== null) {
    console.log(`Auto-compiling protocol on line ${gameState.mustCompileLine + 1}`);
    setTimeout(() => {
      compileProtocol(playerId, gameState.mustCompileLine);
    }, 100);
  } else {
    gameState.phase = 'action';
    runPhase();
  }
}

function actionPhase() {
  console.log('Action phase');
  updateButtonsState();

  // If mustCompileLine is set, player must compile; but auto compile already done in compile phase.
  // So here player can either:
  // - Play one card (which triggers gameState.actionTaken = true and moves to next phase)
  // - Or refresh hand, which we treat as the action, then move to next phase.

  // Disable refresh button if hand >=5 or action already taken
  updateButtonsState();

  // If player chooses to refresh (via button), refreshHand() will be called, then move on:

  // We wait here for player interaction, after playing or refreshing, nextPhase() is called.

  // No automatic progression from here to let player do their action.
}

function cachePhase() {
  console.log('Cache phase');
  const player = gameState.players[gameState.currentPlayer];
  while (player.hand.length > 5) {
    const discarded = player.hand.pop();
    player.discard.push(discarded);
  }
  gameState.phase = 'end';
  runPhase();
}

function endPhase() {
  console.log('End phase');
  triggerEffects('End');
  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();
  renderGameBoard();
  renderHand();
  updateButtonsState();

  // Automatically move to next player's turn after a short delay so player sees end effects
  setTimeout(() => {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    startTurn();
  }, 500);
}

function compileProtocol(playerId, lineIndex) {
  console.log(`Compiling protocol on line ${lineIndex} for player ${playerId}`);

  gameState.players[1].lines[lineIndex].forEach(c => gameState.players[1].discard.push(c));
  gameState.players[2].lines[lineIndex].forEach(c => gameState.players[2].discard.push(c));
  gameState.players[1].lines[lineIndex] = [];
  gameState.players[2].lines[lineIndex] = [];

  const protocol = gameState.players[playerId].protocols[lineIndex];
  if (!gameState.compiledProtocols[playerId].includes(protocol)) {
    gameState.compiledProtocols[playerId].push(protocol);
  }

  gameState.mustCompileLine = null;

  alert(`Player ${playerId} compiled protocol ${protocol}!`);

  updateButtonsState();
  renderGameBoard();
  renderHand();
  checkCache();

  if (gameState.compiledProtocols[playerId].length === 3) {
    alert(`Player ${playerId} wins by compiling all protocols!`);
    // TODO: stop game or reset
  }

  // After compile, immediately move to cache phase (skip action)
  gameState.phase = 'cache';
  runPhase();
}

function triggerEffects(phase) {
  // Stub for effects on Start and End phases
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');
  const hand = gameState.players[gameState.currentPlayer].hand;
  // Disable refresh if hand >=5 or if player already took action this turn
  refreshBtn.disabled = hand.length >= 5 || gameState.actionTaken;

  // No compile button needed, compile happens automatically
}

document.getElementById('refresh-button').addEventListener('click', () => {
  if (gameState.actionTaken) return; // only once per turn
  refreshHand(gameState.currentPlayer);
  renderHand();
  updateButtonsState();
  gameState.actionTaken = true;

  // After refresh action, go to next phase (cache)
  setTimeout(() => {
    nextPhase();
  }, 100);
});

function updateTurnUI() {
  // Both players visible always
  document.getElementById('player1').style.display = 'block';
  document.getElementById('player2').style.display = 'block';

  // Highlight current player
  const p1 = document.getElementById('player1');
  const p2 = document.getElementById('player2');
  if (gameState.currentPlayer === 1) {
    p1.classList.add('current-turn');
    p2.classList.remove('current-turn');
  } else {
    p2.classList.add('current-turn');
    p1.classList.remove('current-turn');
  }

  document.getElementById('turn-indicator').textContent = `Current Turn: Player ${gameState.currentPlayer}`;

  renderHand();
  renderGameBoard();
  updateButtonsState();
}

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
      const compiled = gameState.compiledProtocols[playerId].includes(protocolName);
      protocolNameDiv.textContent = compiled ? `${protocolName} (Compiled)` : protocolName;
      const protocolColor = protocolColors[protocolName] || 'gray';
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

        if (cardDiv.classList.contains('covered') && !card.faceUp) {
          cardDiv.innerHTML = '';
        } else {
          cardDiv.innerHTML = `
            <div class="card-section card-name">${card.name} (${card.value})</div>
            <div class="card-section card-top">${card.topEffect || ''}</div>
            <div class="card-section card-middle">${card.middleEffect || ''}</div>
            <div class="card-section card-bottom">${card.bottomEffect || ''}</div>
          `;
        }

        lineDiv.appendChild(cardDiv);
      });

      const protocol = gameState.players[playerId].protocols[idx];
      const isCompiled = gameState.compiledProtocols[playerId].includes(protocol);
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled) ? 'pointer' : 'default';
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
  if (playerId !== gameState.currentPlayer) {
    alert("It's not this player's turn!");
    return;
  }

  const protocol = gameState.players[playerId].protocols[lineIndex];
  if (gameState.compiledProtocols[playerId].includes(protocol)) {
    alert(`Protocol "${protocol}" is already compiled. You cannot play cards here.`);
    return;
  }

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];
  const lineProtocol = protocol;

  if (selectedCardFaceUp && cardProtocol !== lineProtocol) {
    alert(`Face-up cards must be played on their protocol line: ${lineProtocol}`);
    return;
  }

  const removedCard = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  removedCard.faceUp = selectedCardFaceUp;

  gameState.players[playerId].lines[lineIndex].push(removedCard);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  gameState.actionTaken = true;

  renderGameBoard();
  renderHand();
  updateButtonsState();

  // After action, move to next phase
  setTimeout(() => {
    nextPhase();
  }, 100);
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
  btn.disabled = hand.length >= 5 || gameState.actionTaken;
}

function checkCache() {
  const player = gameState.players[gameState.currentPlayer];
  while (player.hand.length > 5) {
    const discarded = player.hand.pop();
    player.discard.push(discarded);
  }
}




