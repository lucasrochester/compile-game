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
      compiledProtocols: [],  // Track compiled protocols here
    },
    2: {
      protocols: ['Speed', 'Gravity', 'Darkness'],
      lines: [[], [], []],
      hand: [],
      deck: [],
      discard: [],
      compiledProtocols: [],
    }
  },
  currentPlayer: 1,
  controlComponent: false,
  mustCompileLine: null,
  actionTaken: false,
  cacheDiscardMode: false,
  cacheDiscardSelectedIndices: new Set(),
  phase: 'start',
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
    player.compiledProtocols = [];
    player.lines = [[], [], []];
    player.hand = [];
    player.discard = [];

    player.protocols.forEach(protocol => {
      const protocolCards = allCardsData.protocols[protocol]?.cards || [];
      protocolCards.forEach(cardData => {
        const card = { ...cardData, protocolColor: protocolColors[protocol], faceUp: false };
        player.deck.push(card);
      });
    });

    shuffle(player.deck);

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
  gameState.actionTaken = false;
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
  gameState.phase = 'start';
  updateTurnUI();
  runPhase();
}

function runPhase() {
  switch (gameState.phase) {
    case 'start': startPhase(); break;
    case 'control': controlPhase(); break;
    case 'compile': compilePhase(); break;
    case 'action': actionPhase(); break;
    case 'cache': cachePhase(); break;
    case 'end': endPhase(); break;
  }
}

function nextPhase() {
  const phases = ['start', 'control', 'compile', 'action', 'cache', 'end'];
  let idx = phases.indexOf(gameState.phase);
  if (idx === phases.length - 1) {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    startTurn();
  } else {
    gameState.phase = phases[idx + 1];
    runPhase();
  }
}

function startPhase() {
  // Trigger start effects if you want here (stub)
  gameState.phase = 'control';
  runPhase();
}

function controlPhase() {
  const playerId = gameState.currentPlayer;
  const opponentId = playerId === 1 ? 2 : 1;
  let controlCount = 0;
  for (let i = 0; i < 3; i++) {
    const playerValue = lineTotalValue(playerId, i);
    const opponentValue = lineTotalValue(opponentId, i);
    if (playerValue > opponentValue) controlCount++;
  }
  gameState.controlComponent = controlCount >= 2;
  updateButtonsState();
  gameState.phase = 'compile';
  runPhase();
}

function compilePhase() {
  const playerId = gameState.currentPlayer;
  const opponentId = playerId === 1 ? 2 : 1;
  for (let line = 0; line < 3; line++) {
    if (
      lineTotalValue(playerId, line) >= 10 &&
      lineTotalValue(playerId, line) > lineTotalValue(opponentId, line) &&
      !gameState.players[playerId].compiledProtocols.includes(gameState.players[playerId].protocols[line])
    ) {
      alert(`Player ${playerId} MUST compile protocol on line ${line + 1}!`);
      compileProtocol(playerId, line);
      return; // compiling is the only action this turn
    }
  }
  gameState.phase = 'action';
  runPhase();
}

function actionPhase() {
  updateButtonsState();
  // Wait for user to play card or refresh
}

function cachePhase() {
  const player = gameState.players[gameState.currentPlayer];
  if (player.hand.length <= 5) {
    gameState.phase = 'end';
    runPhase();
    return;
  }
  gameState.cacheDiscardMode = true;
  updateDiscardInstruction();
  updateDiscardConfirmButton();
  document.getElementById('discard-confirm-container').style.display = 'block';
  renderHand();
}

function endPhase() {
  gameState.cacheDiscardMode = false;
  document.getElementById('discard-confirm-container').style.display = 'none';
  gameState.cacheDiscardSelectedIndices.clear();
  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();
  renderGameBoard();
  renderHand();
  updateButtonsState();
  setTimeout(() => {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    startTurn();
  }, 500);
}

function compileProtocol(playerId, lineIndex) {
  const p1 = gameState.players[1];
  const p2 = gameState.players[2];
  p1.discard.push(...p1.lines[lineIndex]);
  p2.discard.push(...p2.lines[lineIndex]);
  p1.lines[lineIndex] = [];
  p2.lines[lineIndex] = [];
  const protocolName = gameState.players[playerId].protocols[lineIndex];
  gameState.players[playerId].compiledProtocols.push(protocolName);
  alert(`Player ${playerId} compiled protocol "${protocolName}"!`);
  renderGameBoard();
  renderHand();
  if (gameState.players[playerId].compiledProtocols.length === 3) {
    alert(`Player ${playerId} wins!`);
    // You can disable further input here if you want
  }
  gameState.phase = 'cache'; // go to discard if needed after compile
  runPhase();
}

function playCardOnLine(playerId, handIndex, lineIndex) {
  if (gameState.actionTaken) {
    alert('You already took your action this turn.');
    return;
  }
  if (gameState.cacheDiscardMode) {
    alert('You must finish discarding cards first.');
    return;
  }
  if (playerId !== gameState.currentPlayer) {
    alert('It is not your turn.');
    return;
  }
  const protocol = gameState.players[playerId].protocols[lineIndex];
  if (gameState.players[playerId].compiledProtocols.includes(protocol)) {
    alert(`Protocol ${protocol} already compiled.`);
    return;
  }

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];

  if (selectedCardFaceUp && cardProtocol !== protocol) {
    alert(`Face-up cards must be played on their protocol line: ${protocol}`);
    // Do NOT remove from hand if invalid
    return;
  }

  // Valid play — remove from hand now
  const playedCard = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  playedCard.faceUp = selectedCardFaceUp;

  gameState.players[playerId].lines[lineIndex].push(playedCard);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  gameState.actionTaken = true;
  renderGameBoard();
  renderHand();

  gameState.phase = 'cache';
  runPhase();
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');
  refreshBtn.disabled = gameState.actionTaken || gameState.cacheDiscardMode || gameState.phase === 'compile';
}

document.getElementById('refresh-button').addEventListener('click', () => {
  if (gameState.actionTaken) {
    alert('You already took your action this turn.');
    return;
  }
  if (gameState.cacheDiscardMode) {
    alert('You must finish discarding cards first.');
    return;
  }
  refreshHand(gameState.currentPlayer);
  renderHand();
  gameState.actionTaken = true;
  gameState.phase = 'cache';
  runPhase();
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
      const compiled = gameState.players[playerId].compiledProtocols.includes(protocolName);
      protocolNameDiv.textContent = compiled ? `${protocolName} (Compiled)` : protocolName;
      protocolNameDiv.style.color = protocolColors[protocolName] || 'gray';
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
      const isCompiled = gameState.players[playerId].compiledProtocols.includes(protocol);
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.phase !== 'compile') ? 'pointer' : 'default';
    });
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
    cardDiv.style.cursor = 'pointer';

    if (!faceUpToShow) {
      cardDiv.classList.add('face-down');
    } else {
      cardDiv.classList.remove('face-down');
    }

    if (gameState.cacheDiscardMode) {
      if (gameState.cacheDiscardSelectedIndices.has(idx)) {
        cardDiv.classList.add('discard-select');
      } else {
        cardDiv.classList.remove('discard-select');
      }
    } else {
      cardDiv.classList.remove('discard-select');
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

function updateRefreshButton() {
  const btn = document.getElementById('refresh-button');
  const hand = gameState.players[gameState.currentPlayer].hand;
  btn.disabled = gameState.actionTaken || gameState.cacheDiscardMode || hand.length >= 5;
}

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
}

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if (gameState.cacheDiscardMode) {
      alert('Cannot flip cards while discarding.');
      return;
    }
    if (selectedCardIndex === null) return;
    selectedCardFaceUp = !selectedCardFaceUp;
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
    const indices = Array.from(gameState.cacheDiscardSelectedIndices).sort((a, b) => b - a);
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

function lineTotalValue(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  return cards.reduce((sum, card) => sum + (card.faceUp ? card.value : 0), 0);
}

function setupLineClickDelegation() {
  ['player1', 'player2'].forEach(pidStr => {
    const pid = parseInt(pidStr.replace('player', ''));
    const playerLinesContainer = document.querySelector(`#${pidStr} .lines`);
    playerLinesContainer.addEventListener('click', e => {
      let lineDiv = e.target;
      while (lineDiv && !lineDiv.classList.contains('line')) {
        lineDiv = lineDiv.parentElement;
      }
      if (!lineDiv) return;
      const lineIndex = parseInt(lineDiv.getAttribute('data-line'));
      if (isNaN(lineIndex)) return;
      if (pid !== gameState.currentPlayer) {
        alert(`It's Player ${gameState.currentPlayer}'s turn. You can only play cards on your own protocols.`);
        return;
      }
      if (gameState.cacheDiscardMode) {
        alert('You must finish discarding cards first!');
        return;
      }
      if (selectedCardIndex === null) {
        alert('No card selected to play!');
        return;
      }
      playCardOnLine(pid, selectedCardIndex, lineIndex);
    });
  });
}

function updateTurnUI() {
  ['player1', 'player2'].forEach(pidStr => {
    const pid = parseInt(pidStr.replace('player', ''));
    const playerDiv = document.getElementById(pidStr);
    if (pid === gameState.currentPlayer) {
      playerDiv.classList.add('current-turn');
    } else {
      playerDiv.classList.remove('current-turn');
    }
  });
}
