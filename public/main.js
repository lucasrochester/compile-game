import { structuredEffects } from './structuredEffects.js';

let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Darkness: 'darkslategray',
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
  actionTaken: false,
  cacheDiscardMode: false,
  cacheDiscardSelectedIndices: new Set(),
  compileSelectionMode: false,
  compileEligibleLines: [],
};

let selectedCardIndex = null;
let selectedCardFaceUp = false;

fetch('cards.json')
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
        const card = {...cardData, protocolColor: protocolColors[protocol], faceUp: false, inPlay: false, isCovered: false};
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
  gameState.controlComponent = false;
  gameState.phase = 'start';
  gameState.actionTaken = false;
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
  gameState.compileSelectionMode = false;
  gameState.compileEligibleLines = [];
  updateTurnUI();

  // Forced compile check
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
    default: console.error('Unknown phase:', gameState.phase);
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
  triggerEffects('topEffect');
  gameState.phase = 'control';
  runPhase();
}

function checkControlPhase() {
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
  const playerId = gameState.currentPlayer;
  const opponentId = playerId === 1 ? 2 : 1;

  if (gameState.compileSelectionMode) {
    // Waiting for player to choose which protocol to compile
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
  updateButtonsState();
  // Wait for player input handled by UI event handlers
}

function cachePhase() {
  const player = gameState.players[gameState.currentPlayer];
  if (player.hand.length <= 5) {
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
  triggerEffects('bottomEffect');

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
    // TODO: add proper game end handling
  }

  gameState.phase = 'cache';
  runPhase();
}

async function executeCardEffect(card, phase, playerId) {
  if (!card.faceUp) return;
  if (!card.inPlay) return;

  const effectsForCard = structuredEffects[card.name];
  if (!effectsForCard) {
    return;
  }

  const effects = effectsForCard[phase];
  if (!effects || effects.length === 0) return;

  for (const effect of effects) {
    await executeEffect(effect, playerId, card);
  }
}

async function executeEffect(effect, playerId, sourceCard) {
  switch (effect.action) {
    case 'draw':
      drawCards(playerId, effect.amount);
      break;

    case 'flip':
      const targets = getTargetCards(playerId, effect, sourceCard);
      for (const card of targets) {
        if (!card.faceUp) {
          card.faceUp = true;
          await executeCardEffect(card, 'middleEffect', playerId);
        }
      }
      break;

    case 'flipSelf':
      if (!sourceCard.faceUp) {
        sourceCard.faceUp = true;
        await executeCardEffect(sourceCard, 'middleEffect', playerId);
      }
      break;

    case 'conditionalOnCovered':
      if (sourceCard.isCovered) {
        for (const subEffect of effect.effects) {
          await executeEffect(subEffect, playerId, sourceCard);
        }
      }
      break;

    // Add all other effect cases here based on structuredEffects definitions

    default:
      console.warn(`Unknown effect action: ${effect.action}`);
  }
}

function drawCards(playerId, amount) {
  for (let i = 0; i < amount; i++) {
    drawCard(playerId);
  }
  renderHand();
}

function getTargetCards(playerId, effect, sourceCard) {
  const players = effect.targetPlayer === 'self' ? [playerId] :
                  effect.targetPlayer === 'opponent' ? [playerId === 1 ? 2 : 1] :
                  [1, 2];

  let cards = [];
  players.forEach(pid => {
    if (effect.targetLocation === 'hand') {
      cards = cards.concat(gameState.players[pid].hand.filter(c => {
        if (effect.targetCardState === 'faceDown') return !c.faceUp;
        if (effect.targetCardState === 'faceUp') return c.faceUp;
        return true;
      }));
    } else if (effect.targetLocation === 'field') {
      gameState.players[pid].lines.forEach(line => {
        cards = cards.concat(line.filter(c => {
          if (effect.targetCardState === 'faceDown') return !c.faceUp;
          if (effect.targetCardState === 'faceUp') return c.faceUp;
          return true;
        }));
      });
    }
  });
  return cards.slice(0, effect.amount || 1);
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
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !isCompiled && !gameState.cacheDiscardMode && gameState.mustCompileLineNextTurn[playerId] === null && !gameState.actionTaken && !gameState.compileSelectionMode) ? 'pointer' : 'default';
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

function playCardOnLine(playerId, handIndex, lineIndex, faceUp) {
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

  const protocol = gameState.players[playerId].protocols[lineIndex];
  if (gameState.compiledProtocols[playerId].includes(protocol)) {
    alert(`Protocol "${protocol}" is already compiled. You cannot play cards here.`);
    return;
  }

  const card = gameState.players[playerId].hand[handIndex];
  const cardProtocol = card.name.split(' ')[0];
  const lineProtocol = protocol;

  if (faceUp && cardProtocol !== lineProtocol) {
    alert(`Face-up cards must be played on their protocol line: ${lineProtocol}`);
    return;
  }

  const removedCard = gameState.players[playerId].hand.splice(handIndex, 1)[0];
  removedCard.faceUp = faceUp;
  removedCard.inPlay = true;
  removedCard.isCovered = false;

  gameState.players[playerId].lines[lineIndex].push(removedCard);
  updateCoverageForLine(playerId, lineIndex);

  selectedCardIndex = null;
  selectedCardFaceUp = false;
  updateFlipToggleButton();

  gameState.actionTaken = true;

  renderGameBoard();
  renderHand();
  updateButtonsState();

  if (faceUp) {
    executeCardEffect(removedCard, 'middleEffect', playerId);
  }

  setTimeout(() => {
    gameState.phase = 'cache';
    runPhase();
  }, 100);
}

function updateCoverageForLine(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  for (let i = 0; i < cards.length; i++) {
    cards[i].isCovered = i < cards.length - 1;
  }
}

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

function updateFlipToggleButton() {
  const btn = document.getElementById('flip-toggle-button');
  btn.textContent = selectedCardFaceUp ? 'Flip Card: Face Down' : 'Flip Card: Face Up';
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
      await playCardOnLine(playerId, selectedCardIndex, lineIndex, selectedCardFaceUp);
      selectedCardIndex = null;
      selectedCardFaceUp = false;
      updateFlipToggleButton();
      renderGameBoard();
      renderHand();
      updateButtonsState();
    });
  });
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');
  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode) {
    refreshBtn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    refreshBtn.disabled = hand.length >= 5 || gameState.actionTaken;
  }
}

function lineTotalValue(playerId, lineIndex) {
  const cards = gameState.players[playerId].lines[lineIndex];
  return cards.reduce((sum, card) => {
    if (card.faceUp) return sum + card.value;
    else return sum + 2;
  }, 0);
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

