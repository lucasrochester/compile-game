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
  mustCompileLineNextTurn: {1: null, 2: null},
  compiledProtocols: {1: [], 2: []},
  phase: 'start',
  cacheDiscardMode: false,
  cacheDiscardSelectedIndices: new Set(),
  compileSelectionMode: false,
  compileEligibleLines: [],
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
      if (gameState.phase !== 'action' || gameState.cacheDiscardMode || gameState.compileSelectionMode) {
        // Not action phase or busy — ignore clicks on lines
        return;
      }
      if (playerId !== gameState.currentPlayer) {
        // Can't play on opponent's lines
        return;
      }

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

      playCardOnLine(playerId, selectedCardIndex, lineIndex);
      selectedCardIndex = null;
      selectedCardFaceUp = false;
      updateFlipToggleButton();

      renderGameBoard();
      renderHand();
      updateButtonsState();
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
  gameState.phase = 'start';
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
  gameState.compileSelectionMode = false;
  gameState.compileEligibleLines = [];
  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();
  updateTurnUI();

  // Check if forced compile is needed at turn start
  const mustCompileLine = gameState.mustCompileLineNextTurn[gameState.currentPlayer];
  if (mustCompileLine !== null) {
    const playerId = gameState.currentPlayer;
    const opponentId = playerId === 1 ? 2 : 1;
    const playerValue = lineTotalValue(playerId, mustCompileLine);
    const opponentValue = lineTotalValue(opponentId, mustCompileLine);

    if (playerValue >= 10 && playerValue > opponentValue) {
      alert(`You must compile protocol "${gameState.players[playerId].protocols[mustCompileLine]}" this turn!`);
      gameState.phase = 'compileForced';
      runPhase();
      return;
    } else {
      gameState.mustCompileLineNextTurn[gameState.currentPlayer] = null;
    }
  }

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
    case 'compileForced':
      forcedCompilePhase();
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

// --- AUTOMATIC PHASES ---
// These phases run immediately one after another with no player input.

function startPhase() {
  console.log('Start phase');
  triggerTopEffects();
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

  if (gameState.compileSelectionMode) {
    // Waiting on player to choose protocol to compile
    return;
  }

  const eligibleLines = [];
  for (let line = 0; line < 3; line++) {
    const playerValue = lineTotalValue(playerId, line);
    const opponentValue = lineTotalValue(opponentId, line);
    if (playerValue >= 10 && playerValue > opponentValue) eligibleLines.push(line);
  }

  if (eligibleLines.length === 0) {
    // No compile needed, move to action immediately
    gameState.mustCompileLineNextTurn[playerId] = null;
    gameState.phase = 'action';
    runPhase();
  } else if (eligibleLines.length === 1) {
    alert(`Auto-compiling protocol "${gameState.players[playerId].protocols[eligibleLines[0]]}"`);
    compileProtocol(playerId, eligibleLines[0]);
  } else {
    // Multiple lines qualify, wait for player selection
    gameState.compileSelectionMode = true;
    gameState.compileEligibleLines = eligibleLines;
    promptCompileSelection(playerId, eligibleLines);
  }
}

function forcedCompilePhase() {
  const playerId = gameState.currentPlayer;
  const line = gameState.mustCompileLineNextTurn[playerId];
  compileProtocol(playerId, line);
  gameState.mustCompileLineNextTurn[playerId] = null;
}

// --- PLAYER INTERACTION PHASES ---

function actionPhase() {
  console.log('Action phase');
  updateButtonsState();
  // Wait for player to play exactly one card OR refresh
}

function cachePhase() {
  console.log('Cache phase');
  const player = gameState.players[gameState.currentPlayer];
  if (player.hand.length <= 5) {
    // No discard needed, move to end phase immediately
    gameState.phase = 'end';
    runPhase();
    return;
  }
  // Must discard cards
  gameState.cacheDiscardMode = true;
  gameState.cacheDiscardSelectedIndices.clear();
  document.getElementById('discard-confirm-container').style.display = 'block';
  updateDiscardInstruction();
  updateDiscardConfirmButton();
  renderHand();
}

function endPhase() {
  console.log('End phase');
  triggerEffects('End');
  gameState.cacheDiscardMode = false;
  document.getElementById('discard-confirm-container').style.display = 'none';
  gameState.cacheDiscardSelectedIndices.clear();
  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();
  renderGameBoard();
  renderHand();
  updateButtonsState();
  // Switch player and restart phases after a brief delay
  setTimeout(() => {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    startTurn();
  }, 500);
}

// --- CORE GAMEPLAY FUNCTIONS ---

function compileProtocol(playerId, lineIndex) {
  console.log(`Compiling protocol on line ${lineIndex} for player ${playerId}`);

  // Move all cards from both sides' lines to their owners' discard piles
  gameState.players[1].lines[lineIndex].forEach(c => gameState.players[1].discard.push(c));
  gameState.players[2].lines[lineIndex].forEach(c => gameState.players[2].discard.push(c));
  gameState.players[1].lines[lineIndex] = [];
  gameState.players[2].lines[lineIndex] = [];

  const protocol = gameState.players[playerId].protocols[lineIndex];
  if (!gameState.compiledProtocols[playerId].includes(protocol)) {
    gameState.compiledProtocols[playerId].push(protocol);
  }

  alert(`Player ${playerId} compiled protocol ${protocol}!`);

  updateButtonsState();
  renderGameBoard();
  renderHand();

  if (gameState.compiledProtocols[playerId].length === 3) {
    alert(`Player ${playerId} wins by compiling all protocols!`);
    // TODO: game end logic
  }

  // After compile, move immediately to Cache phase
  gameState.phase = 'cache';
  runPhase();
}

function promptCompileSelection(playerId, lines) {
  gameState.mustCompileLineNextTurn[playerId] = null;

  let message = 'Multiple protocols qualify for compilation. Choose one:\n';
  lines.forEach(line => {
    message += `${line}: ${gameState.players[playerId].protocols[line]}\n`;
  });

  let choice = null;
  while (choice === null) {
    const input = prompt(message + 'Enter the number of the protocol line to compile:');
    if (input === null) {
      alert('You must select a protocol to compile.');
      continue;
    }
    const num = parseInt(input);
    if (lines.includes(num)) {
      choice = num;
    } else {
      alert('Invalid selection. Try again.');
    }
  }

  gameState.compileSelectionMode = false;
  compileProtocol(playerId, choice);
}

// --- CARD PLAYING AND HAND MANAGEMENT ---

function playCardOnLine(playerId, handIndex, lineIndex) {
  if (gameState.cacheDiscardMode || gameState.compileSelectionMode) return;

  if (playerId !== gameState.currentPlayer) {
    alert("It's not this player's turn!");
    return;
  }
  if (gameState.mustCompileLineNextTurn[playerId] !== null) {
    alert("You must compile your protocol this turn; no other actions allowed.");
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

  if (removedCard.faceUp) {
    triggerCardEffect(removedCard, 'middle');
  }

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  renderGameBoard();
  renderHand();
  updateButtonsState();

  // After player action, immediately move to Cache phase
  gameState.phase = 'cache';
  runPhase();
}

document.getElementById('refresh-button').addEventListener('click', () => {
  if (gameState.cacheDiscardMode || gameState.compileSelectionMode) return;

  if (gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null) {
    alert("You must compile your protocol this turn; no other actions allowed.");
    return;
  }

  refreshHand(gameState.currentPlayer);
  renderHand();
  updateButtonsState();

  // After refresh, immediately move to Cache phase
  gameState.phase = 'cache';
  runPhase();
});

// --- EFFECTS & UTILITIES ---

function triggerCardEffect(card, effectType) {
  if (!card || !card.faceUp) return;
  const effectText = card[effectType.toLowerCase() + 'Effect'];
  if (!effectText) return;
  console.log(`Triggering ${effectType} effect of card "${card.name}": ${effectText}`);
  // TODO: Implement effect parsing and execution here
}

function triggerTopEffects() {
  [1, 2].forEach(playerId => {
    for (let line = 0; line < 3; line++) {
      gameState.players[playerId].lines[line].forEach(card => {
        if (card.faceUp) triggerCardEffect(card, 'top');
      });
    }
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

function flipCard(card, playerId, lineIndex = null, cardIndexInLine = null) {
  card.faceUp = !card.faceUp;
  if (card.faceUp) {
    if (lineIndex === null) {
      triggerCardEffect(card, 'middle');
    } else {
      const line = gameState.players[playerId].lines[lineIndex];
      const isUncovered = (cardIndexInLine === line.length - 1);
      if (isUncovered) triggerCardEffect(card, 'middle');
    }
  }
}

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if (gameState.cacheDiscardMode) {
      alert("Cannot flip cards while discarding.");
      return;
    }
    if (selectedCardIndex === null) return;
    const player = gameState.players[gameState.currentPlayer];
    const card = player.hand[selectedCardIndex];
    flipCard(card, gameState.currentPlayer);
    selectedCardFaceUp = card.faceUp;
    updateFlipToggleButton();
    renderHand();
  });
}

function setupDiscardConfirmButton() {
  const btn = document.getElementById('discard-confirm-button');
  btn.addEventListener('click', () => {
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;

    if (gameState.cacheDiscardSelectedIndices.size !== requiredDiscardCount) {
      alert(`Please select exactly ${requiredDiscardCount} cards to discard.`);
      return;
    }

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

function lineTotalValue(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  return cards.reduce((sum, card) => {
    if (card.faceUp) return sum + card.value;
    else return sum + 2;
  }, 0);
}

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');
  const handCards = document.querySelectorAll('#hand .card');

  // Enable inputs ONLY in Action phase for current player and when no blocking modes are active
  const inActionPhase = gameState.phase === 'action' &&
    !gameState.cacheDiscardMode &&
    !gameState.compileSelectionMode &&
    gameState.mustCompileLineNextTurn[gameState.currentPlayer] === null;

  refreshBtn.disabled = !inActionPhase || gameState.players[gameState.currentPlayer].hand.length >= 5;

  handCards.forEach(cardDiv => {
    if (inActionPhase) {
      cardDiv.style.pointerEvents = 'auto';
      cardDiv.style.opacity = '1';
    } else {
      cardDiv.style.pointerEvents = 'none';
      cardDiv.style.opacity = '0.5';
    }
  });
}

function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';

  const hand = gameState.players[gameState.currentPlayer].hand;

  if (!hand || hand.length === 0) {
    handDiv.textContent = 'No cards in hand';
    updateButtonsState();
    return;
  }

  hand.forEach((card, idx) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card', 'in-hand');

    const isSelected = idx === selectedCardIndex;
    const faceUpToShow = isSelected ? selectedCardFaceUp : card.faceUp;

    cardDiv.style.borderColor = faceUpToShow ? (card.protocolColor || 'gray') : 'black';

    if (gameState.cacheDiscardMode) {
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
        if (gameState.cacheDiscardSelectedIndices.has(idx)) {
          gameState.cacheDiscardSelectedIndices.delete(idx);
        } else {
          gameState.cacheDiscardSelectedIndices.add(idx);
        }
        updateDiscardInstruction();
        updateDiscardConfirmButton();
        renderHand();
      } else {
        if (gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null) {
          alert("You must compile your protocol this turn; no other actions allowed.");
          return;
        }
        if (gameState.compileSelectionMode) {
          alert("Please select a protocol to compile first.");
          return;
        }
        selectedCardIndex = idx;
        selectedCardFaceUp = card.faceUp;
        updateFlipToggleButton();
        renderHand();
      }
    });

    handDiv.appendChild(cardDiv);
  });

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
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.mustCompileLineNextTurn[playerId] === null && gameState.phase === 'action' && !gameState.compileSelectionMode) ? 'pointer' : 'default';
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
