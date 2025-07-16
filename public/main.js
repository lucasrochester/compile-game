let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Darkness: 'darkslategray',
  Fire: 'orange',
};

const gameState = {
  players: {
    1: {
      protocols: ['Fire', 'Life', 'Light'],
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
  actionTaken: false,
  cacheDiscardMode: false,
  cacheDiscardSelectedIndices: new Set(),
  compileSelectionMode: false,
  compileEligibleLines: [],
  deleteSelectionMode: false,
  boardDeleteSelectionMode: false,
};

let selectedCardIndex = null;
let selectedCardFaceUp = false;
let cardPopupAckCount = 0;

// -------------------- UI & Game Logic --------------------

function showCardPopup(card) {
  cardPopupAckCount = 0;
  const modal = document.getElementById('card-popup-modal');
  const nameEl = document.getElementById('popup-card-name');
  const textEl = document.getElementById('popup-card-text');
  const ackCountEl = document.getElementById('popup-ack-count');

  nameEl.textContent = card.name;
  textEl.textContent =
    (card.topEffect ? `Top Effect:\n${card.topEffect}\n\n` : '') +
    (card.middleEffect ? `Middle Effect:\n${card.middleEffect}\n\n` : '') +
    (card.bottomEffect ? `Bottom Effect:\n${card.bottomEffect}` : '');

  ackCountEl.textContent = cardPopupAckCount;
  modal.style.display = 'block';

  modal.onclick = () => {
    cardPopupAckCount++;
    ackCountEl.textContent = cardPopupAckCount;

    if (cardPopupAckCount >= 2) {
      modal.style.display = 'none';
      modal.onclick = null;
    }
  };
}

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

    // Draw initial 5 cards for both players
    const cardsToDraw = 5;
    for (let i = 0; i < cardsToDraw && player.deck.length > 0; i++) {
      drawCard(pid);
    }
  });

  // Force add Fire 1 face up to Player 1's hand for testing
  const fire1Card = allCardsData.protocols['Fire']?.cards.find(c => c.name === 'Fire 1');
  if (fire1Card) {
    const testCard = {...fire1Card, protocolColor: protocolColors['Fire'], faceUp: true};
    gameState.players[1].hand.push(testCard);
  }

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
    container.addEventListener('click', async (e) => {
      if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || gameState.boardDeleteSelectionMode) {
        alert("Cannot play cards during special effect selection.");
        return;
      }
      if (gameState.actionTaken) {
        alert("You already took an action this turn!");
        return;
      }
      if (gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null) {
        alert("You must compile your protocol this turn; no other actions allowed.");
        return;
      }
      if (gameState.compileSelectionMode) {
        alert("Please select a protocol to compile first.");
        return;
      }
      if (playerId !== gameState.currentPlayer) {
        alert(`It's Player ${gameState.currentPlayer}'s turn. You can only play on your own protocols.`);
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

      await playCardOnLine(playerId, selectedCardIndex, lineIndex);

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
  gameState.actionTaken = false;
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
  gameState.compileSelectionMode = false;
  gameState.compileEligibleLines = [];
  gameState.deleteSelectionMode = false;
  gameState.boardDeleteSelectionMode = false;
  updateTurnUI();

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
  console.log('Running phase:', gameState.phase);
  switch (gameState.phase) {
    case 'start': startPhase(); break;
    case 'control': checkControlPhase(); break;
    case 'compile': checkCompilePhase(); break;
    case 'compileForced': forcedCompilePhase(); break;
    case 'action': actionPhase(); break;
    case 'cache': cachePhase(); break;
    case 'end': endPhase(); break;
  }
}

function nextPhase() {
  const phases = ['start', 'control', 'compile', 'action', 'cache', 'end'];
  const currentIndex = phases.indexOf(gameState.phase);
  if (currentIndex < phases.length - 1) {
    gameState.phase = phases[currentIndex + 1];
    runPhase();
  } else {
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

  if (gameState.compileSelectionMode) {
    return;
  }

  const eligibleLines = [];

  for (let line = 0; line < 3; line++) {
    const playerValue = lineTotalValue(playerId, line);
    const opponentValue = lineTotalValue(opponentId, line);
    if (playerValue >= 10 && playerValue > opponentValue) {
      eligibleLines.push(line);
    }
  }

  if (eligibleLines.length === 0) {
    gameState.mustCompileLineNextTurn[playerId] = null;
    gameState.phase = 'action';
    runPhase();
  } else if (eligibleLines.length === 1) {
    alert(`Auto-compiling protocol "${gameState.players[playerId].protocols[eligibleLines[0]]}"`);
    compileProtocol(playerId, eligibleLines[0]);
  } else {
    gameState.compileSelectionMode = true;
    gameState.compileEligibleLines = eligibleLines;
    promptCompileSelection(playerId, eligibleLines);
  }
}

function promptCompileSelection(playerId, lines) {
  gameState.actionTaken = true;
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

function forcedCompilePhase() {
  const playerId = gameState.currentPlayer;
  const line = gameState.mustCompileLineNextTurn[playerId];
  compileProtocol(playerId, line);
  gameState.mustCompileLineNextTurn[playerId] = null;
}

function actionPhase() {
  console.log('Action phase');
  updateButtonsState();
}

function cachePhase() {
  console.log('Cache phase');
  const player = gameState.players[gameState.currentPlayer];
  const handSize = player.hand.length;
  if (handSize <= 5) {
    gameState.phase = 'end';
    runPhase();
    return;
  }

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
    gameState.actionTaken = false;
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
  const hasCompiledBefore = gameState.compiledProtocols[playerId].includes(protocol);

  if (!hasCompiledBefore) {
    gameState.compiledProtocols[playerId].push(protocol);
    alert(`Player ${playerId} compiled protocol ${protocol}!`);
  } else {
    alert(`Player ${playerId} recompiled protocol ${protocol}! Drawing 1 card from opponent's deck.`);
    const opponentId = playerId === 1 ? 2 : 1;
    const opponent = gameState.players[opponentId];
    if (opponent.deck.length === 0 && opponent.discard.length > 0) {
      opponent.deck = opponent.discard.splice(0);
      shuffle(opponent.deck);
    }
    if (opponent.deck.length > 0) {
      const drawnCard = opponent.deck.pop();
      drawnCard.faceUp = true;
      gameState.players[playerId].hand.push(drawnCard);
      alert(`Player ${playerId} drew "${drawnCard.name}" from opponent's deck.`);
    } else {
      alert("Opponent's deck is empty, no card drawn.");
    }
  }

  updateButtonsState();
  renderGameBoard();
  renderHand();

  if (gameState.compiledProtocols[playerId].length === 3) {
    alert(`Player ${playerId} wins by compiling all protocols!`);
  }

  gameState.phase = 'cache';
  runPhase();
}

function triggerEffects(phase) {
  // Placeholder for Start/End effects processing
}

// ----------- Fire 1 middle effect and helpers --------------

function promptPlayerDiscard(playerId) {
  return new Promise((resolve) => {
    const player = gameState.players[playerId];
    if (player.hand.length === 0) {
      alert("No cards in hand to discard.");
      resolve(null);
      return;
    }

    alert("Select a card from your hand to discard.");

    gameState.discardSelectionMode = true;

    function onCardClick(idx) {
      gameState.discardSelectionMode = false;

      const discardedCard = player.hand.splice(idx, 1)[0];
      player.discard.push(discardedCard);

      renderHand();
      updateButtonsState();

      cleanup();

      resolve(discardedCard);
    }

    const handDiv = document.getElementById('hand');

    function clickListener(e) {
      let cardDiv = e.target;
      while (cardDiv && !cardDiv.classList.contains('card')) {
        cardDiv = cardDiv.parentElement;
      }
      if (!cardDiv) return;
      const cards = Array.from(handDiv.children);
      const idx = cards.indexOf(cardDiv);
      if (idx === -1) return;

      onCardClick(idx);
    }

    handDiv.addEventListener('click', clickListener);

    function cleanup() {
      handDiv.removeEventListener('click', clickListener);
    }
  });
}

function promptSelectCardOnBoard(playerId, message) {
  return new Promise((resolve) => {
    alert(message);

    gameState.boardDeleteSelectionMode = true;

    function onCardClick(card, ownerId, lineIndex, stackIndex) {
      gameState.boardDeleteSelectionMode = false;

      gameState.players[ownerId].lines[lineIndex].splice(stackIndex, 1);
      gameState.players[ownerId].discard.push(card);

      renderGameBoard();

      cleanup();

      resolve(card);
    }

    function boardClickListener(e) {
      if (!gameState.boardDeleteSelectionMode) return;

      let cardDiv = e.target;
      while (cardDiv && !cardDiv.classList.contains('card')) {
        cardDiv = cardDiv.parentElement;
      }
      if (!cardDiv) return;

      const ownerId = parseInt(cardDiv.dataset.owner);
      const lineIndex = parseInt(cardDiv.dataset.line);
      const stackIndex = parseInt(cardDiv.dataset.stackIndex);

      if (isNaN(ownerId) || isNaN(lineIndex) || isNaN(stackIndex)) return;

      const card = gameState.players[ownerId].lines[lineIndex][stackIndex];
      if (!card) return;

      onCardClick(card, ownerId, lineIndex, stackIndex);
    }

    const boardDiv = document.getElementById('game-board');
    boardDiv.addEventListener('click', boardClickListener);

    function cleanup() {
      boardDiv.removeEventListener('click', boardClickListener);
    }
  });
}

async function fire1MiddleEffect(playerId) {
  const player = gameState.players[playerId];

  if (player.hand.length === 0) {
    alert("No cards in hand to discard. Fire 1 effect ends.");
    return;
  }

  const discardedCard = await promptPlayerDiscard(playerId);
  if (!discardedCard) {
    alert("No card discarded. Fire 1 effect ends.");
    return;
  }

  alert(`You discarded "${discardedCard.name}". Now select a card on the board to delete.`);

  const deletedCard = await promptSelectCardOnBoard(playerId, "Select a card to delete");

  if (!deletedCard) {
    alert("No card selected for deletion. Fire 1 effect ends.");
    return;
  }

  alert(`Deleted "${deletedCard.name}".`);

  renderGameBoard();
  renderHand();
  updateButtonsState();
}

// ----------- Play card on line --------------

async function playCardOnLine(playerId, handIndex, lineIndex) {
  if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || gameState.boardDeleteSelectionMode) {
    alert("Cannot play cards during special effect selection.");
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
  if (gameState.mustCompileLineNextTurn[playerId] !== null) {
    alert("You must compile your protocol this turn; no other actions allowed.");
    return;
  }
  if (gameState.compileSelectionMode) {
    alert("Please select a protocol to compile first.");
    return;
  }

  const protocol = gameState.players[playerId].protocols[lineIndex];

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];
  const lineProtocol = protocol;

  if (selectedCardFaceUp && cardProtocol !== lineProtocol) {
    alert(`Face-up cards must be played on their protocol line: ${lineProtocol}`);
    return;
  }

  gameState.actionTaken = true;

  const removedCard = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  removedCard.faceUp = selectedCardFaceUp;

  gameState.players[playerId].lines[lineIndex].push(removedCard);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  renderGameBoard();
  renderHand();
  updateButtonsState();

  if (removedCard.name === "Fire 1" && removedCard.faceUp) {
    await fire1MiddleEffect(playerId);
  }

  setTimeout(() => {
    gameState.phase = 'cache';
    runPhase();
  }, 100);
}

// ----------- Render game board -------------

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

        // Add data attributes for board selection
        cardDiv.dataset.owner = playerId;
        cardDiv.dataset.line = idx;
        cardDiv.dataset.stackIndex = i;

        if (!card.faceUp) cardDiv.classList.add('face-down');

        if (i < cards.length - 1) cardDiv.classList.add('covered');

        cardDiv.style.borderColor = card.faceUp ? (card.protocolColor || 'gray') : 'black';
        cardDiv.style.top = `${i * 80}px`;
        cardDiv.style.zIndex = i + 1;
        cardDiv.style.left = '0';

        if (gameState.deleteSelectionMode) {
          cardDiv.style.cursor = 'pointer';
          cardDiv.classList.add('delete-selectable');

          if (i === cards.length -1) {
            cardDiv.onclick = () => {
              handleDeleteSelection(playerId, idx, i, card);
            };
          } else {
            cardDiv.onclick = () => {
              alert("You can only delete the top card of a stack.");
            };
          }
        } else if (gameState.boardDeleteSelectionMode) {
          cardDiv.style.cursor = 'pointer';
          cardDiv.onclick = (e) => {
            e.stopPropagation();
            // The global listener handles selection in boardDeleteSelectionMode
          };
        } else {
          cardDiv.style.cursor = 'default';
          cardDiv.onclick = null;
        }

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
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.mustCompileLineNextTurn[playerId] === null && !gameState.actionTaken && !gameState.compileSelectionMode && !gameState.deleteSelectionMode && !gameState.boardDeleteSelectionMode) ? 'pointer' : 'default';
    });
  });
}

// ----------- Flip Toggle -------------

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
}

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || gameState.boardDeleteSelectionMode) {
      alert("Cannot flip cards while discarding or during special effect selections.");
      return;
    }
    if (selectedCardIndex === null) return;
    selectedCardFaceUp = !selectedCardFaceUp;
    updateFlipToggleButton();
    renderHand();
  });
}

// ----------- Render Hand -------------

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
      cardDiv.style.cursor = 'pointer';
      if (gameState.cacheDiscardSelectedIndices.has(idx)) {
        cardDiv.classList.add('discard-select');
      } else {
        cardDiv.classList.remove('discard-select');
      }
    } else if (gameState.boardDeleteSelectionMode) {
      cardDiv.style.cursor = 'default';
      cardDiv.classList.remove('discard-select');
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

    cardDiv.addEventListener('click', async () => {
      if (gameState.cacheDiscardMode) {
        if (gameState.cacheDiscardSelectedIndices.has(idx)) {
          gameState.cacheDiscardSelectedIndices.delete(idx);
        } else {
          gameState.cacheDiscardSelectedIndices.add(idx);
        }
        updateDiscardInstruction();
        updateDiscardConfirmButton();
        renderHand();
      } else if (gameState.boardDeleteSelectionMode) {
        alert("Please select a card on the board to delete.");
      } else {
        if (gameState.actionTaken) {
          alert("You already took an action this turn!");
          return;
        }
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

  updateRefreshButton();
}

// ----------- Refresh Button -------------

function updateRefreshButton() {
  const btn = document.getElementById('refresh-button');
  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.deleteSelectionMode || gameState.boardDeleteSelectionMode) {
    btn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    btn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
}

// ----------- Discard Confirm Button -------------

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
  btn.style.display = 'inline-block';
}

// ----------- lineTotalValue -------------

function lineTotalValue(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  return cards.reduce((sum, card) => {
    if (card.faceUp) return sum + card.value;
    else return sum + 2;
  }, 0);
}

// ----------- Delete Selection Handler -------------

function handleDeleteSelection(playerId, lineIndex, cardIndex, card) {
  if (!gameState.deleteSelectionMode) return;

  let ownerId = null;
  if (gameState.players[1].lines[lineIndex].includes(card)) ownerId = 1;
  else if (gameState.players[2].lines[lineIndex].includes(card)) ownerId = 2;
  else {
    alert("Card ownership unknown.");
    return;
  }

  const ownerLine = gameState.players[ownerId].lines[lineIndex];
  if (cardIndex !== ownerLine.length - 1) {
    alert("You can only delete the top card of a stack.");
    return;
  }

  ownerLine.splice(cardIndex, 1);
  gameState.players[ownerId].discard.push(card);
  alert(`Deleted card: ${card.name}`);

  gameState.deleteSelectionMode = false;

  renderGameBoard();
  renderHand();
  updateButtonsState();

  gameState.phase = 'cache';
  runPhase();
}
