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

      if (gameState.phase === 'compile') {
        alert("You must compile this turn, no other actions allowed.");
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
  console.log(`Player ${gameState.currentPlayer} turn start.`);
  gameState.actionTaken = false;
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
  gameState.phase = 'start';
  updateTurnUI();
  runPhase();
}

function runPhase() {
  switch(gameState.phase) {
    case 'start': startPhase(); break;
    case 'control': checkControlPhase(); break;
    case 'compile': checkCompilePhase(); break;
    case 'action': actionPhase(); break;
    case 'cache': cachePhase(); break;
    case 'end': endPhase(); break;
  }
}

function nextPhase() {
  const phases = ['start', 'control', 'compile', 'action', 'cache', 'end'];
  let currentIndex = phases.indexOf(gameState.phase);
  if(currentIndex < phases.length -1) {
    gameState.phase = phases[currentIndex+1];
  } else {
    // Switch player turn after end phase
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
  }
  runPhase();
}

function startPhase() {
  console.log('Start phase');
  triggerEffects('Start');
  gameState.phase = 'control';
  runPhase();
}

function checkControlPhase() {
  console.log('Control phase');
  const pid = gameState.currentPlayer;
  const opp = pid === 1 ? 2 : 1;
  let controlCount = 0;
  for(let i=0; i<3; i++) {
    const pVal = lineTotalValue(pid,i);
    const oVal = lineTotalValue(opp,i);
    if(pVal > oVal) controlCount++;
  }
  gameState.controlComponent = controlCount >= 2;
  updateButtonsState();
  gameState.phase = 'compile';
  runPhase();
}

function checkCompilePhase() {
  console.log('Compile phase');
  const pid = gameState.currentPlayer;
  const opp = pid === 1 ? 2 : 1;
  for(let i=0; i<3; i++) {
    const pVal = lineTotalValue(pid,i);
    const oVal = lineTotalValue(opp,i);
    if(pVal >= 10 && pVal > oVal) {
      alert(`You MUST compile protocol on line ${i+1} this turn!`);
      compileProtocol(pid, i);
      return; // compiling is the only action
    }
  }
  gameState.phase = 'action';
  runPhase();
}

function actionPhase() {
  console.log('Action phase');
  updateButtonsState();
  // Wait for player action (play one card or refresh once)
  // On action, call setActionTaken()
}

function playCardOnLine(playerId, handIndex, lineIndex) {
  if(gameState.actionTaken) {
    alert("You already took your action this turn.");
    return;
  }
  if(gameState.cacheDiscardMode) {
    alert("You must discard cards before continuing.");
    return;
  }
  if(playerId !== gameState.currentPlayer) {
    alert("It's not your turn!");
    return;
  }

  const protocol = gameState.players[playerId].protocols[lineIndex];
  if(gameState.compiledProtocols[playerId]?.includes(protocol)) {
    alert(`Protocol "${protocol}" is already compiled.`);
    return;
  }

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];
  if(selectedCardFaceUp && cardProtocol !== protocol) {
    alert(`Face-up cards must be played on their protocol line: ${protocol}`);
    return;
  }

  gameState.players[playerId].hand.splice(handIndex,1);
  card.faceUp = selectedCardFaceUp;
  gameState.players[playerId].lines[lineIndex].push(card);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  setActionTaken();
  renderGameBoard();
  renderHand();
}

document.getElementById('refresh-button').addEventListener('click', () => {
  if(gameState.actionTaken) {
    alert("You already took your action this turn.");
    return;
  }
  if(gameState.cacheDiscardMode) {
    alert("You must discard cards before continuing.");
    return;
  }
  refreshHand(gameState.currentPlayer);
  renderHand();
  setActionTaken();
});

function setActionTaken() {
  gameState.actionTaken = true;
  updateButtonsState();
  // After action, immediately go to cache phase
  gameState.phase = 'cache';
  runPhase();
}

function cachePhase() {
  const player = gameState.players[gameState.currentPlayer];
  if(player.hand.length <= 5) {
    gameState.phase = 'end';
    runPhase();
    return;
  }
  // Manual discard mode
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

  setTimeout(() => {
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    startTurn();
  }, 500);
}

function compileProtocol(playerId, lineIndex) {
  console.log(`Compiling protocol line ${lineIndex} for player ${playerId}`);
  gameState.players[1].discard.push(...gameState.players[1].lines[lineIndex]);
  gameState.players[2].discard.push(...gameState.players[2].lines[lineIndex]);
  gameState.players[1].lines[lineIndex] = [];
  gameState.players[2].lines[lineIndex] = [];

  const protocol = gameState.players[playerId].protocols[lineIndex];
  if(!gameState.compiledProtocols[playerId]) gameState.compiledProtocols[playerId] = [];
  gameState.compiledProtocols[playerId].push(protocol);

  alert(`Player ${playerId} compiled protocol "${protocol}"!`);

  renderGameBoard();
  renderHand();

  if(gameState.compiledProtocols[playerId].length === 3) {
    alert(`Player ${playerId} wins by compiling all protocols!`);
    // TODO: add game end logic here
  }
}

function triggerEffects(phase) {
  // Implement card start/end effects here
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');
  refreshBtn.disabled = gameState.actionTaken || gameState.cacheDiscardMode || gameState.phase === 'compile';
}

function renderHand() {
  const handDiv = document.getElementById('hand');
  handDiv.innerHTML = '';

  const hand = gameState.players[gameState.currentPlayer].hand;

  if(!hand || hand.length === 0) {
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

    if(gameState.cacheDiscardMode) {
      cardDiv.style.cursor = 'pointer';
      if(gameState.cacheDiscardSelectedIndices.has(idx)) {
        cardDiv.classList.add('discard-select');
      } else {
        cardDiv.classList.remove('discard-select');
      }
    } else {
      cardDiv.style.cursor = 'pointer';
      cardDiv.classList.remove('discard-select');
    }

    if(!faceUpToShow) {
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
      if(gameState.cacheDiscardMode) {
        if(gameState.cacheDiscardSelectedIndices.has(idx)) {
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

function refreshHand(playerId) {
  const player = gameState.players[playerId];
  while(player.hand.length < 5) {
    if(!drawCard(playerId)) break;
  }
}

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if(gameState.cacheDiscardMode) {
      alert("Cannot flip cards while discarding.");
      return;
    }
    if(selectedCardIndex === null) return;
    selectedCardFaceUp = !selectedCardFaceUp;
    updateFlipToggleButton();
    renderHand();
  });
}

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
}

function updateRefreshButton() {
  const btn = document.getElementById('refresh-button');
  btn.disabled = gameState.actionTaken || gameState.cacheDiscardMode || gameState.phase === 'compile';
}

function setupDiscardConfirmButton() {
  const btn = document.getElementById('discard-confirm-button');
  btn.addEventListener('click', () => {
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;

    if(gameState.cacheDiscardSelectedIndices.size !== requiredDiscardCount) {
      alert(`Please select exactly ${requiredDiscardCount} cards to discard.`);
      return;
    }

    const indices = Array.from(gameState.cacheDiscardSelectedIndices).sort((a,b) => b - a);
    for(const idx of indices) {
      const [removed] = player.hand.splice(idx,1);
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
  return cards.reduce((sum, card) => sum + (card.faceUp ? card.value : 0), 0);
}

function renderGameBoard() {
  ['player1','player2'].forEach(pidStr => {
    const pid = parseInt(pidStr.replace('player',''));
    const playerDiv = document.getElementById(pidStr);
    const lines = playerDiv.querySelectorAll('.line');

    lines.forEach((lineDiv, idx) => {
      lineDiv.innerHTML = '';

      const protocolNameDiv = document.createElement('div');
      protocolNameDiv.classList.add('protocol-name');
      const protocolName = gameState.players[pid].protocols[idx];
      const compiled = gameState.compiledProtocols[pid]?.includes(protocolName);
      protocolNameDiv.textContent = compiled ? `${protocolName} (Compiled)` : protocolName;
      protocolNameDiv.style.color = protocolColors[protocolName] || 'gray';
      lineDiv.appendChild(protocolNameDiv);

      const cards = gameState.players[pid].lines[idx];

      cards.forEach((card, i) => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');

        if(!card.faceUp) cardDiv.classList.add('face-down');
        if(i < cards.length -1) cardDiv.classList.add('covered');

        cardDiv.style.borderColor = card.faceUp ? (card.protocolColor || 'gray') : 'black';
        cardDiv.style.top = `${i*80}px`;
        cardDiv.style.zIndex = i+1;
        cardDiv.style.left = '0';

        if(cardDiv.classList.contains('covered') && !card.faceUp) {
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

      const protocol = gameState.players[pid].protocols[idx];
      const isCompiled = gameState.compiledProtocols[pid]?.includes(protocol);
      lineDiv.style.cursor = (pid === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.phase !== 'compile') ? 'pointer' : 'default';
    });
  });
}

function updateTurnUI() {
  document.getElementById('player1').style.display = 'block';
  document.getElementById('player2').style.display = 'block';

  const p1 = document.getElementById('player1');
  const p2 = document.getElementById('player2');
  if(gameState.currentPlayer === 1) {
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
