let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Darkness: 'darkslategray',
  Fire: 'orange', // Added Fire protocol color
};

const gameState = {
  players: {
    1: {
      protocols: ['Fire', 'Life', 'Light'], // Added Fire here
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
  deleteSelectionMode: false, // For Fire 1 delete step
  fire1DiscardMode: false,    // For Fire 1 discard step
  fire1DiscardSelectedIndex: null, // Selected card index for discard during Fire 1 effect
};

let selectedCardIndex = null;
let selectedCardFaceUp = false;

// Variables for Fire 1 popup modal acknowledgement tracking
let cardPopupAckCount = 0;

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
      if (gameState._fire1AfterPopupResolve) {
        gameState._fire1AfterPopupResolve();
        gameState._fire1AfterPopupResolve = null;
      }
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

    const cardsToDraw = (pid === 1) ? 4 : 5;
    for (let i = 0; i < cardsToDraw && player.deck.length > 0; i++) {
      drawCard(pid);
    }

    // Add Fire 1 card explicitly to Player 1 hand for testing
    if (pid === 1) {
      let fireOneIndex = player.deck.findIndex(c => c.name === 'Fire 1');
      if (fireOneIndex !== -1) {
        const fireOneCard = player.deck.splice(fireOneIndex, 1)[0];
        player.hand.push(fireOneCard);
      } else {
        player.hand.push({
          name: 'Fire 1',
          value: 1,
          protocolColor: protocolColors['Fire'],
          faceUp: false,
          topEffect: '',
          middleEffect: 'Discard 1 card. If you do, delete 1 card.',
          bottomEffect: '',
        });
      }
    }
  });

  renderGameBoard();
  renderHand();
  setupFlipToggle();
  updateButtonsState();

  setupLineClickDelegation();
  setupDiscardConfirmButton();
  setupFire1DiscardConfirmButton();
}

function setupLineClickDelegation() {
  ['player1', 'player2'].forEach(pidStr => {
    const playerId = parseInt(pidStr.replace('player', ''));
    const container = document.querySelector(`#${pidStr} .lines`);
    container.addEventListener('click', async (e) => {
      if (gameState.cacheDiscardMode) {
        alert("You must discard cards before continuing!");
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
      if (gameState.fire1DiscardMode) {
        alert("Please select a card from your hand to discard (highlighted).");
        return;
      }
      if (gameState.deleteSelectionMode) {
        alert("Please select a card on the board to delete.");
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
  gameState.fire1DiscardMode = false;
  gameState.fire1DiscardSelectedIndex = null;
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
  // Wait for player input — actions handled by UI event handlers
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
    startTurn();
  }, 500);
}

function compileProtocol(playerId, lineIndex) {
  console.log(`Compiling protocol on line ${lineIndex} for player ${playerId}`);

  // Move all cards in line to discard piles
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
    // Draw 1 card from opponent's deck
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
    // TODO: add game end logic here
  }

  gameState.phase = 'cache';
  runPhase();
}

function triggerEffects(phase) {
  // TODO: Implement start/end effects here
}

// Update buttons enabling/disabling state
function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');

  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.deleteSelectionMode || gameState.fire1DiscardMode) {
    refreshBtn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    refreshBtn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
}

// Render player's hand including special selection modes
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

    // Highlight card if in Fire 1 discard selection mode and this card is selected for discard
    if (gameState.fire1DiscardMode) {
      cardDiv.style.cursor = 'pointer';
      if (gameState.fire1DiscardSelectedIndex === idx) {
        cardDiv.classList.add('discard-select');
      } else {
        cardDiv.classList.remove('discard-select');
      }
    } else if (gameState.cacheDiscardMode) {
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

    cardDiv.addEventListener('click', async () => {
      if (gameState.cacheDiscardMode) {
        // Normal cache discard selection
        if (gameState.cacheDiscardSelectedIndices.has(idx)) {
          gameState.cacheDiscardSelectedIndices.delete(idx);
        } else {
          gameState.cacheDiscardSelectedIndices.add(idx);
        }
        updateDiscardInstruction();
        updateDiscardConfirmButton();
        renderHand();
      } else if (gameState.fire1DiscardMode) {
        // Fire 1 discard selection
        if (gameState.fire1DiscardSelectedIndex === idx) {
          gameState.fire1DiscardSelectedIndex = null;
        } else {
          gameState.fire1DiscardSelectedIndex = idx;
        }
        updateDiscardConfirmButton();
        updateDiscardInstruction();
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
        if (gameState.actionTaken) {
          alert("You already took an action this turn!");
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
  if (gameState.mustCompileLineNextTurn[playerId] !== null) {
    alert("You must compile your protocol this turn; no other actions allowed.");
    return;
  }
  if (gameState.compileSelectionMode) {
    alert("Please select a protocol to compile first.");
    return;
  }
  if (gameState.fire1DiscardMode || gameState.deleteSelectionMode) {
    alert("Cannot play cards during special effect selection.");
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

  // After playing Fire 1, trigger its effect
  if (removedCard.name === 'Fire 1' && removedCard.faceUp) {
    handleFire1Effect(removedCard, playerId).then(() => {
      gameState.phase = 'cache';
      runPhase();
    });
  } else {
    setTimeout(() => {
      gameState.phase = 'cache';
      runPhase();
    }, 100);
  }
}

// Refresh button handler
document.getElementById('refresh-button').addEventListener('click', () => {
  if (gameState.cacheDiscardMode) {
    alert("You must discard cards before continuing!");
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
  if (gameState.fire1DiscardMode || gameState.deleteSelectionMode) {
    alert("Cannot refresh during special effect selection.");
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

// Discard confirm button for normal cache discard
function setupDiscardConfirmButton() {
  const btn = document.getElementById('discard-confirm-button');
  btn.addEventListener('click', () => {
    if (gameState.fire1DiscardMode) {
      alert("Please discard your selected card to continue.");
      return;
    }
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

// Fire 1 discard confirmation button (separate flow)
function setupFire1DiscardConfirmButton() {
  const btn = document.getElementById('fire1-discard-confirm-button');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!gameState.fire1DiscardMode) return;
      if (gameState.fire1DiscardSelectedIndex === null) {
        alert("Please select a card to discard.");
        return;
      }
      const player = gameState.players[gameState.currentPlayer];
      const discardedCard = player.hand.splice(gameState.fire1DiscardSelectedIndex, 1)[0];
      player.discard.push(discardedCard);
      alert(`Discarded card: ${discardedCard.name}`);

      gameState.fire1DiscardMode = false;
      gameState.fire1DiscardSelectedIndex = null;

      renderHand();
      updateButtonsState();

      gameState.deleteSelectionMode = true;
      renderGameBoard();
      alert("Select a card on the board to delete.");
    });
  }
}

function updateDiscardInstruction() {
  if (gameState.fire1DiscardMode) {
    const instructionDiv = document.getElementById('discard-instruction');
    instructionDiv.textContent = `Select 1 card from your hand to discard for Fire 1 effect.`;
  } else {
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;
    const selectedCount = gameState.cacheDiscardSelectedIndices.size;
    const instructionDiv = document.getElementById('discard-instruction');

    instructionDiv.textContent = `Select exactly ${requiredDiscardCount} card(s) to discard. Selected: ${selectedCount}`;
  }
}

function updateDiscardConfirmButton() {
  if (gameState.fire1DiscardMode) {
    const btn = document.getElementById('fire1-discard-confirm-button');
    if (btn) {
      btn.disabled = (gameState.fire1DiscardSelectedIndex === null);
      btn.style.display = 'inline-block';
    }
    document.getElementById('discard-confirm-button').style.display = 'none';
  } else {
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;
    const selectedCount = gameState.cacheDiscardSelectedIndices.size;

    const btn = document.getElementById('discard-confirm-button');
    btn.disabled = selectedCount !== requiredDiscardCount;
    btn.style.display = 'inline-block';

    const fire1Btn = document.getElementById('fire1-discard-confirm-button');
    if (fire1Btn) {
      fire1Btn.style.display = 'none';
    }
  }
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

function setupFlipToggle() {
  const btn = document.getElementById('flip-toggle-button');
  btn.addEventListener('click', () => {
    if (gameState.cacheDiscardMode || gameState.fire1DiscardMode || gameState.deleteSelectionMode) {
      alert("Cannot flip cards while discarding or during special effect selections.");
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
  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.deleteSelectionMode || gameState.fire1DiscardMode) {
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

        // DEBUG: During deleteSelectionMode, allow clicks on ALL cards (for testing)
        if (gameState.deleteSelectionMode) {
          cardDiv.style.cursor = 'pointer';
          cardDiv.classList.add('delete-selectable');
          cardDiv.onclick = () => {
            console.log('Clicked card for delete:', playerId, idx, i, card.name);
            handleDeleteSelection(playerId, idx, i, card);
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
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.mustCompileLineNextTurn[playerId] === null && !gameState.actionTaken && !gameState.compileSelectionMode && !gameState.fire1DiscardMode && !gameState.deleteSelectionMode) ? 'pointer' : 'default';
    });
  });
}

function handleDeleteSelection(playerId, lineIndex, cardIndex, card) {
  console.log('handleDeleteSelection called:', playerId, lineIndex, cardIndex, card.name);

  if (!gameState.deleteSelectionMode) {
    console.log('Delete selection mode not active, ignoring click.');
    return;
  }

  let ownerId = null;
  if (gameState.players[1].lines[lineIndex].includes(card)) ownerId = 1;
  else if (gameState.players[2].lines[lineIndex].includes(card)) ownerId = 2;
  else {
    console.log('Card ownership unknown for:', card.name);
    return alert("Card ownership unknown");
  }

  const ownerLine = gameState.players[ownerId].lines[lineIndex];
  if (cardIndex !== ownerLine.length - 1) {
    console.log('Attempted to delete non-top card:', card.name);
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

async function handleFire1Effect(card, playerId) {
  return new Promise((resolve) => {
    showCardPopup(card);

    gameState._fire1AfterPopupResolve = () => {
      const player = gameState.players[playerId];

      if (player.hand.length === 0) {
        alert("You have no cards to discard, effect ends.");
        resolve();
        return;
      }

      gameState.fire1DiscardMode = true;
      gameState.fire1DiscardSelectedIndex = null;
      renderHand();
      updateButtonsState();
      updateDiscardInstruction();
      updateDiscardConfirmButton();

      let container = document.getElementById('fire1-discard-container');
      if (!container) setupFire1DiscardConfirmUI();
      container.style.display = 'block';

      const checkDiscardConfirmed = setInterval(() => {
        if (!gameState.fire1DiscardMode) {
          clearInterval(checkDiscardConfirmed);
          container.style.display = 'none';

          gameState.deleteSelectionMode = true;
          renderGameBoard();
          alert("Select a card on the board to delete.");
          resolve();
        }
      }, 200);
    };
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

// Call setup for Fire 1 discard confirm button UI when DOM content is ready
document.addEventListener('DOMContentLoaded', () => {
  setupFire1DiscardConfirmUI();
});

// Setup Fire 1 discard confirm button container and handler
function setupFire1DiscardConfirmUI() {
  let container = document.getElementById('fire1-discard-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'fire1-discard-container';
    container.style.marginTop = '10px';
    container.style.display = 'none';

    const btn = document.createElement('button');
    btn.id = 'fire1-discard-confirm-button';
    btn.textContent = 'Confirm Discard';
    btn.disabled = true;
    container.appendChild(btn);

    document.body.appendChild(container);

    btn.addEventListener('click', () => {
      if (!gameState.fire1DiscardMode) return;
      if (gameState.fire1DiscardSelectedIndex === null) {
        alert("Please select a card to discard.");
        return;
      }
      const player = gameState.players[gameState.currentPlayer];
      const discardedCard = player.hand.splice(gameState.fire1DiscardSelectedIndex, 1)[0];
      player.discard.push(discardedCard);
      alert(`Discarded card: ${discardedCard.name}`);

      gameState.fire1DiscardMode = false;
      gameState.fire1DiscardSelectedIndex = null;
      container.style.display = 'none';

      renderHand();
      updateButtonsState();

      gameState.deleteSelectionMode = true;
      renderGameBoard();
      alert("Select a card on the board to delete.");
    });
  }
}
