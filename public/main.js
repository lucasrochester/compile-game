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
};

// Fire 1 discard+delete special interaction state
let fire1DiscardMode = false;
let fire1DiscardSelectedIndices = new Set();
let fire1DeleteSelectionMode = false;
let fire1DeleteCandidateCards = [];

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

    const cardsToDraw = 5;
    for (let i = 0; i < cardsToDraw && player.deck.length > 0; i++) {
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
    container.addEventListener('click', async (e) => {
      if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || fire1DiscardMode || fire1DeleteSelectionMode) {
        alert("Cannot play cards during special effect selection.");
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
  fire1DiscardMode = false;
  fire1DiscardSelectedIndices.clear();
  fire1DeleteSelectionMode = false;
  fire1DeleteCandidateCards = [];
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

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');

  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.deleteSelectionMode || fire1DiscardMode || fire1DeleteSelectionMode) {
    refreshBtn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    refreshBtn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
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

    if (fire1DiscardMode) {
      cardDiv.style.cursor = 'pointer';
      if (fire1DiscardSelectedIndices.has(idx)) {
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
      if (fire1DiscardMode) {
        if (fire1DiscardSelectedIndices.has(idx)) {
          fire1DiscardSelectedIndices.delete(idx);
        } else {
          fire1DiscardSelectedIndices.add(idx);
        }
        updateFire1DiscardInstruction();
        updateDiscardConfirmButton();
        renderHand();
      } else if (gameState.cacheDiscardMode) {
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

  updateRefreshButton();
}

// --- Modify playCardOnLine to detect Fire 0 effects ---
async function playCardOnLine(playerId, handIndex, lineIndex) {
  if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || fire1DiscardMode || fire1DeleteSelectionMode || fire0FlipSelectionMode) {
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

  // Check cover effect if top card is Fire 0 face up
  const line = gameState.players[playerId].lines[lineIndex];
  if (line.length > 0) {
    const topCard = line[line.length - 1];
    if (topCard.name === 'Fire 0' && topCard.faceUp) {
      await triggerFire0CoverEffect(playerId);
    }
  }

  gameState.players[playerId].lines[lineIndex].push(removedCard);

  renderGameBoard();
  renderHand();
  updateButtonsState();

  // Trigger play/flip-up effect of Fire 0 if applicable
  if (removedCard.faceUp && removedCard.name === 'Fire 0') {
    await triggerFire0PlayOrFlipUpEffect(playerId);
  } else if (removedCard.faceUp && removedCard.name === 'Fire 1') {
    // Existing Fire 1 effect...
  } else {
    setTimeout(() => {
      gameState.phase = 'cache';
      runPhase();
    }, 100);
  }
}

document.getElementById('refresh-button').addEventListener('click', () => {
  if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || fire1DiscardMode || fire1DeleteSelectionMode) {
    alert("Cannot refresh during special effect selection.");
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

  refreshHand(gameState.currentPlayer);
  renderHand();
  updateButtonsState();

  gameState.actionTaken = true;

  setTimeout(() => {
    gameState.phase = 'cache';
    runPhase();
  }, 100);
});

function setupDiscardConfirmButton() {
  const btn = document.getElementById('discard-confirm-button');
  btn.addEventListener('click', () => {
    if (fire1DiscardMode) {
      handleFire1DiscardConfirm();
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

function updateDiscardInstruction() {
  const player = gameState.players[gameState.currentPlayer];
  const requiredDiscardCount = player.hand.length - 5;
  const selectedCount = gameState.cacheDiscardSelectedIndices.size;
  const instructionDiv = document.getElementById('discard-instruction');

  instructionDiv.textContent = `Select exactly ${requiredDiscardCount} card(s) to discard. Selected: ${selectedCount}`;
}

function updateDiscardConfirmButton() {
  const btn = document.getElementById('discard-confirm-button');

  if (fire1DiscardMode) {
    btn.disabled = fire1DiscardSelectedIndices.size !== 1;
    btn.style.display = 'inline-block';
  } else if (gameState.cacheDiscardMode) {
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;
    const selectedCount = gameState.cacheDiscardSelectedIndices.size;
    btn.disabled = selectedCount !== requiredDiscardCount;
    btn.style.display = 'inline-block';
  } else {
    btn.style.display = 'none';
  }
}

// Fire1 discard instruction text update
function updateFire1DiscardInstruction() {
  const requiredDiscardCount = 1;
  const selectedCount = fire1DiscardSelectedIndices.size;
  const instructionDiv = document.getElementById('discard-instruction');

  instructionDiv.textContent = `Fire 1: Select exactly ${requiredDiscardCount} card(s) to discard. Selected: ${selectedCount}`;
}

// Handle Fire 1 discard confirm
async function handleFire1DiscardConfirm() {
  const player = gameState.players[gameState.currentPlayer];

  if (fire1DiscardSelectedIndices.size !== 1) {
    alert(`Fire 1 effect requires you to discard exactly 1 card.`);
    return;
  }

  const indices = Array.from(fire1DiscardSelectedIndices).sort((a,b) => b - a);
  for (const idx of indices) {
    const [removed] = player.hand.splice(idx, 1);
    player.discard.push(removed);
    alert(`Discarded "${removed.name}" due to Fire 1 effect.`);
  }

  fire1DiscardMode = false;
  fire1DiscardSelectedIndices.clear();

  document.getElementById('discard-confirm-container').style.display = 'none';

  renderHand();
  updateButtonsState();

  // Now prompt to delete a top card anywhere on board
  fire1DeleteSelectionMode = true;
  fire1DeleteCandidateCards = [];
  [1, 2].forEach(pid => {
    gameState.players[pid].lines.forEach((line, lineIndex) => {
      if (line.length > 0) {
        const topCard = line[line.length - 1];
        fire1DeleteCandidateCards.push({
          playerId: pid,
          lineIndex: lineIndex,
          card: topCard
        });
      }
    });
  });

  if (fire1DeleteCandidateCards.length === 0) {
    alert("No cards available to delete.");
    fire1DeleteSelectionMode = false;
    gameState.phase = 'cache';
    runPhase();
    return;
  }

  alert("Fire 1 effect: Click on a top card on the board to delete it.");

  renderGameBoard();
}

// --- Fire 0 specific flags ---
let fire0FlipSelectionMode = false;
let fire0FlipCandidates = []; // Cards eligible to flip
let fire0EffectType = ''; // 'playOrFlipUp' or 'cover'

// --- Trigger Fire 0 effect when played or flipped face up ---
async function triggerFire0PlayOrFlipUpEffect(playerId) {
  fire0EffectType = 'playOrFlipUp';
  fire0FlipSelectionMode = true;
  fire0FlipCandidates = getAllFlippableCards(playerId);

  if (fire0FlipCandidates.length === 0) {
    alert("No cards available to flip for Fire 0 effect.");
    drawMultipleCards(playerId, 2);
    fire0FlipSelectionMode = false;
    runPhaseAfterEffect();
    return;
  }

  alert("Fire 0 effect: Select one card to flip (face up/down). If you flip a face-down card face up, its effects will trigger.");
  renderGameBoard();
}

// --- Trigger Fire 0 effect when about to be covered ---
async function triggerFire0CoverEffect(playerId) {
  fire0EffectType = 'cover';
  fire0FlipSelectionMode = true;

  // For play or flip-up effect:
  fire0FlipCandidates = getAllFlippableCards(playerId, true);

  // For cover effect (already excludes Fire 0):
  fire0FlipCandidates = getAllFlippableCards(playerId, true);

  if (fire0FlipCandidates.length === 0) {
    alert("No valid cards to flip for Fire 0 cover effect.");
    drawMultipleCards(playerId, 1);
    fire0FlipSelectionMode = false;
    runPhaseAfterEffect();
    return;
  }

  drawMultipleCards(playerId, 1);
  alert("Fire 0 cover effect: Draw 1 card and select one non-Fire 0 card to flip.");
  renderGameBoard();
}

// --- Get all top cards on board as candidates to flip ---
function getAllFlippableCards(playerId, excludeFire0 = false) {
  const candidates = [];
  [1, 2].forEach(pid => {
    gameState.players[pid].lines.forEach((line, lineIndex) => {
      if (line.length === 0) return;
      const topCard = line[line.length - 1];
      if (excludeFire0 && topCard.name === 'Fire 0') return;
      candidates.push({
        playerId: pid,
        lineIndex,
        card: topCard
      });
    });
  });
  return candidates;
}


// --- Handle card flip selection for Fire 0 effect ---
function handleFire0FlipSelection(playerId, lineIndex, cardIndex, card) {
  if (!fire0FlipSelectionMode) return;

  const line = gameState.players[playerId].lines[lineIndex];
  if (cardIndex !== line.length - 1) {
    alert("You can only flip the top card of a stack.");
    return;
  }

  const wasFaceDown = !card.faceUp;
  card.faceUp = !card.faceUp; // Flip the card

  alert(`Flipped card "${card.name}" ${card.faceUp ? 'face up' : 'face down'}.`);

  // If flipped face down, no further effect
  if (wasFaceDown && card.faceUp) {
    // Trigger the card's middle effect immediately
    triggerCardMiddleEffect(card, playerId);
  }

  fire0FlipSelectionMode = false;
  renderGameBoard();
  renderHand();
  updateButtonsState();

  // After flip, draw cards depending on effect type
  if (fire0EffectType === 'playOrFlipUp') {
    drawMultipleCards(playerId, 2);
  }
  // For 'cover' effect, card draw already done before selection

  runPhaseAfterEffect();
}

// --- Function to trigger middle effect text logic for a card ---
function triggerCardMiddleEffect(card, playerId) {
  if (!card.middleEffect) return;

  alert(`Triggering middle effect of "${card.name}":\n${card.middleEffect}`);

  // Here, implement logic for specific card middle effects as needed
  // For example, if you want to automate effects like "Draw 2 cards", etc.
  // For now, you can leave this as a placeholder or extend per card.
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
    if (gameState.cacheDiscardMode || gameState.deleteSelectionMode || fire1DiscardMode || fire1DeleteSelectionMode) {
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
  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.deleteSelectionMode || fire1DiscardMode || fire1DeleteSelectionMode) {
    btn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    btn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
}

// --- Modify renderGameBoard to handle Fire 0 flip selections ---
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

        if (fire0FlipSelectionMode) {
          cardDiv.style.cursor = 'pointer';
          if (i === cards.length - 1) {
            cardDiv.onclick = () => handleFire0FlipSelection(playerId, idx, i, card);
          } else {
            cardDiv.onclick = () => alert("You can only flip the top card of a stack.");
          }
        } else if (fire1DeleteSelectionMode) {
          // Your Fire 1 delete selection code here...
        } else if (gameState.deleteSelectionMode) {
          // Generic delete selection code...
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
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.mustCompileLineNextTurn[playerId] === null && !gameState.actionTaken && !gameState.compileSelectionMode && !gameState.deleteSelectionMode && !fire0FlipSelectionMode && !fire1DeleteSelectionMode) ? 'pointer' : 'default';
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

// ------------ Handle Fire1 card delete selection -------------

function handleFire1DeleteSelection(playerId, lineIndex, cardIndex, card) {
  if (!fire1DeleteSelectionMode) return;

  const line = gameState.players[playerId].lines[lineIndex];
  if (cardIndex !== line.length - 1) {
    alert("You can only delete the top card of a stack.");
    return;
  }

  line.splice(cardIndex, 1);
  gameState.players[playerId].discard.push(card);

  alert(`Fire 1 effect: Deleted card "${card.name}" from Player ${playerId}'s line ${lineIndex}.`);

  fire1DeleteSelectionMode = false;

  renderGameBoard();
  renderHand();
  updateButtonsState();

  gameState.phase = 'cache';
  runPhase();
}

// ------------ Handle generic delete selection -------------

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

