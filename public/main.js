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
  phase: 'start',
  actionTaken: false,
  cacheDiscardMode: false,
  cacheDiscardSelectedIndices: new Set(),
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
  setupDiscardConfirmButton();
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

      if (gameState.cacheDiscardMode) {
        alert("You must discard cards before continuing!");
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

      // After playing a card, action taken and proceed to cache phase
      gameState.actionTaken = true;

      renderGameBoard();
      renderHand();
      updateButtonsState();

      setTimeout(() => {
        gameState.phase = 'cache';
        runPhase();
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
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
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
  // Player can play 1 card or refresh once this phase.
  // Wait for player input.
}

function cachePhase() {
  console.log('Cache phase');

  const player = gameState.players[gameState.currentPlayer];
  const handSize = player.hand.length;
  if (handSize <= 5) {
    // No discards needed
    gameState.phase = 'end';
    runPhase();
    return;
  }

  // Enter discard selection mode
  gameState.cacheDiscardMode = true;
  gameState.cacheDiscardSelectedIndices.clear();

  // Show discard confirm UI
  document.getElementById('discard-confirm-container').style.display = 'block';
  updateDiscardInstruction();
  updateDiscardConfirmButton();

  // Render hand so discardable cards can be selected
  renderHand();
}

function endPhase() {
  console.log('End phase');
  triggerEffects('End');

  // Clear discard mode UI if somehow still active
  gameState.cacheDiscardMode = false;
  document.getElementById('discard-confirm-container').style.display = 'none';
  gameState.cacheDiscardSelectedIndices.clear();

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();
  renderGameBoard();
  renderHand();
  updateButtonsState();

  // Auto next turn after short delay so player sees end effects
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
    // TODO: stop or reset game here if desired
  }

  // Skip action phase since compiling used the action
  gameState.phase = 'cache';
  runPhase();
}

function triggerEffects(phase) {
  // Stub for start/end effects
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');

  if (gameState.cacheDiscardMode) {
    refreshBtn.disabled = true; // Disable refresh during discard mode
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    refreshBtn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
}

// --- HAND RENDER & INTERACTION ---

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

    if (gameState.cacheDiscardMode) {
      // In discard mode: enable multi-select for discards
      cardDiv.style.cursor = 'pointer';
      if (gameState.cacheDiscardSelectedIndices.has(idx)) {
        cardDiv.classList.add('discard-select');
      } else {
        cardDiv.classList.remove('discard-select');
      }
    } else {
      cardDiv.style.cursor = 'pointer';
      cardDiv.classList.remove('discard-select');
    }

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
      if (gameState.cacheDiscardMode) {
        // Toggle discard selection
        if (gameState.cacheDiscardSelectedIndices.has(idx)) {
          gameState.cacheDiscardSelectedIndices.delete(idx);
        } else {
          gameState.cacheDiscardSelectedIndices.add(idx);
        }
        updateDiscardInstruction();
        updateDiscardConfirmButton();
        renderHand();
      } else {
        // Normal hand card select to play
        selectedCardIndex = idx;
        selectedCardFaceUp = card.faceUp;
        updateFlipToggleButton();
        renderHand();
      }
    });

    handDiv.appendChild(cardDiv);
  });

  updateRefreshButton();
}

function playCardOnLine(playerId, handIndex, lineIndex) {
  if (gameState.cacheDiscardMode) {
    alert("You must discard cards before continuing!");
    return;
  }
  if (playerId !== gameState.currentPlayer) {
    alert("It's not this player's turn!");
    return;
  }
  if (gameState.actionTaken) {
    alert("You already took an action this turn!");
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

  setTimeout(() => {
    gameState.phase = 'cache';
    runPhase();
  }, 100);
}

// --- REFRESH BUTTON HANDLER ---

document.getElementById('refresh-button').addEventListener('click', () => {
  if (gameState.cacheDiscardMode) {
    alert("You must discard cards before continuing!");
    return;
  }
  if (gameState.actionTaken) {
    alert("You already took an action this turn!");
    return;
  }

  refreshHand(gameState.currentPlayer);
  renderHand();
  updateButtonsState();
  gameState.actionTaken = true;

  setTimeout(() => {
    gameState.phase = 'cache';
    runPhase();
  }, 100);
});

// --- DISCARD CONFIRM BUTTON SETUP ---

function setupDiscardConfirmButton() {
  const btn = document.getElementById('discard-confirm-button');
  btn.addEventListener('click', () => {
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;

    if (gameState.cacheDiscardSelectedIndices.size !== requiredDiscardCount) {
      alert(`Please select exactly ${requiredDiscardCount} cards to discard.`);
      return;
    }

    // Remove selected cards from hand and add to discard pile
    // Sort indices descending so removal from array doesn't mess up indices
    const indices = Array.from(gameState.cacheDiscardSelectedIndices).sort((a,b) => b - a);
    for (const idx of indices) {
      const [removed] = player.hand.splice(idx, 1);
      player.discard.push(removed);
    }

    gameState.cacheDiscardMode = false;
    gameState.cacheDiscardSelectedIndices.clear();

    document.getElementById('discard-confirm-container').style.display = 'none';

    renderHand();
    updateButtonsState();

    gameState.phase = 'end';
    runPhase();
  });
}

function updateDiscardInstruction() {
  const player = gameState.players[gameState.currentPlayer];
  const requiredDiscardCount = player.hand.length - 5;
  const selectedCount = gameState.cacheDiscardSelectedIndices.size;
  const instructionDiv = document.getElementById('discard-instruction');

  instructionDiv.textContent = `Select exactly ${requiredDiscardCount} card(s) to discard. Selected: ${selectedCount}`;
}

function updateDiscardConfirmButton() {
  const player = gameState.players[gameState.currentPlayer];
  const requiredDiscardCount = player.hand.length - 5;
  const selectedCount = gameState.cacheDiscardSelectedIndices.size;

  const btn = document.getElementById('discard-confirm-button');
  btn.disabled = selectedCount !== requiredDiscardCount;
}

// --- UTILS ---

function lineTotalValue(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  return cards.reduce((sum, card) => sum + (card.faceUp ? card.value : 0), 0);
}

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
}

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if (gameState.cacheDiscardMode) {
      alert("Cannot flip cards while discarding.");
      return;
    }
    if (selectedCardIndex === null) return;
    selectedCardFaceUp = !selectedCardFaceUp;
    updateFlipToggleButton();
    renderHand();
  });
}

function updateRefreshButton() {
  const btn = document.getElementById('refresh-button');
  if (gameState.cacheDiscardMode) {
    btn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    btn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
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
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode) ? 'pointer' : 'default';
    });
  });
}

function updateTurnUI() {
  document.getElementById('player1').style.display = 'block';
  document.getElementById('player2').style.display = 'block';

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
