let allCardsData = null;

const protocolColors = {
  Life: 'green',
  Light: 'yellow',
  Psychic: 'purple',
  Speed: 'white',
  Gravity: 'pink',
  Darkness: 'darkslategray',
  Fire: 'orange', // added Fire for testing
};

const gameState = {
  players: {
    1: {
      protocols: ['Life', 'Light', 'Fire'], // added Fire protocol here for testing
      lines: [[], [], [], []], // added 4th line for Fire protocol
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

  // Fire 1 effect states:
  fire1DiscardMode: false,
  fire1DiscardSelectedIndex: null,
  deleteSelectionMode: false,
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

    // Make sure lines array matches number of protocols
    player.lines = player.protocols.map(() => []);

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
  setupFire1DiscardConfirmUI();
}

function setupLineClickDelegation() {
  Object.entries({player1: 1, player2: 2}).forEach(([pidStr, playerId]) => {
    const container = document.querySelector(`#${pidStr} .lines`);
    container.addEventListener('click', (e) => {
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
        alert("Please discard a card for Fire 1 effect first.");
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
  gameState.actionTaken = false;
  gameState.cacheDiscardMode = false;
  gameState.cacheDiscardSelectedIndices.clear();
  gameState.compileSelectionMode = false;
  gameState.compileEligibleLines = [];
  gameState.fire1DiscardMode = false;
  gameState.fire1DiscardSelectedIndex = null;
  gameState.deleteSelectionMode = false;
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
  for (let line = 0; line < gameState.players[playerId].protocols.length; line++) {
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
    // Already waiting on player to pick — do nothing
    return;
  }

  const eligibleLines = [];

  for (let line = 0; line < gameState.players[playerId].protocols.length; line++) {
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

  // Send cards to discard piles
  gameState.players[1].lines[lineIndex].forEach(c => gameState.players[1].discard.push(c));
  gameState.players[2].lines[lineIndex].forEach(c => gameState.players[2].discard.push(c));

  // Clear the line for both players
  gameState.players[1].lines[lineIndex] = [];
  gameState.players[2].lines[lineIndex] = [];

  const protocol = gameState.players[playerId].protocols[lineIndex];
  const compiledAlready = gameState.compiledProtocols[playerId].includes(protocol);
  if (!compiledAlready) {
    gameState.compiledProtocols[playerId].push(protocol);
  } else {
    // Recompiling an already compiled protocol: draw a card from opponent's deck
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
      alert(`Player ${playerId} recompiling an already compiled protocol! Drew a card from opponent's deck: ${drawnCard.name}`);
      renderHand();
    }
  }

  alert(`Player ${playerId} compiled protocol ${protocol}!`);

  updateButtonsState();
  renderGameBoard();
  renderHand();

  if (gameState.compiledProtocols[playerId].length === gameState.players[playerId].protocols.length) {
    alert(`Player ${playerId} wins by compiling all protocols!`);
    // TODO: add game end logic here
  }

  gameState.phase = 'cache';
  runPhase();
}

function triggerEffects(phase) {
  // You can implement Start/End effects here, currently placeholder
}

function updateButtonsState() {
  const refreshBtn = document.getElementById('refresh-button');

  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.fire1DiscardMode || gameState.deleteSelectionMode) {
    refreshBtn.disabled = true;
  } else {
    const hand = gameState.players[gameState.currentPlayer].hand;
    refreshBtn.disabled = hand.length >= 5 || gameState.actionTaken;
  }

  updateDiscardConfirmButton();
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

    const faceUpToShow = card.faceUp;

    cardDiv.style.borderColor = faceUpToShow ? (card.protocolColor || 'gray') : 'black';

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

    cardDiv.innerHTML = `
      <div class="card-section card-name">${card.name} (${card.value})</div>
      <div class="card-section card-top">${card.topEffect || ''}</div>
      <div class="card-section card-middle">${card.middleEffect || ''}</div>
      <div class="card-section card-bottom">${card.bottomEffect || ''}</div>
    `;

    cardDiv.addEventListener('click', () => {
      if (gameState.fire1DiscardMode) {
        if (gameState.fire1DiscardSelectedIndex === idx) {
          gameState.fire1DiscardSelectedIndex = null;
        } else {
          gameState.fire1DiscardSelectedIndex = idx;
        }
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
        if (gameState.actionTaken) {
          alert("You already took an action this turn!");
          return;
        }
        if (gameState.deleteSelectionMode || gameState.fire1DiscardMode) {
          alert("Please complete current selection first.");
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
    alert("Please complete current selection first.");
    return;
  }

  const protocol = gameState.players[playerId].protocols[lineIndex];

  // Now you can play cards even if protocol is compiled
  // const compiledAlready = gameState.compiledProtocols[playerId].includes(protocol);
  // if (compiledAlready) {
  //   alert(`Protocol "${protocol}" is already compiled. You cannot play cards here.`);
  //   return;
  // }

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

  // Check if the played card is Fire 1 and handle its effect
  if (removedCard.name === "Fire 1" && removedCard.faceUp) {
    handleFire1Effect(removedCard, playerId).then(() => {
      // After Fire 1 effect completes, proceed to cache phase
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
    alert("Please complete current selection first.");
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
  if (gameState.fire1DiscardMode) {
    const btn = document.getElementById('fire1-discard-confirm-button');
    btn.disabled = (gameState.fire1DiscardSelectedIndex === null);
    btn.style.display = 'inline-block';

    const normalBtn = document.getElementById('discard-confirm-button');
    if (normalBtn) normalBtn.style.display = 'none';
  } else if (gameState.cacheDiscardMode) {
    const btn = document.getElementById('discard-confirm-button');
    const player = gameState.players[gameState.currentPlayer];
    const requiredDiscardCount = player.hand.length - 5;
    const selectedCount = gameState.cacheDiscardSelectedIndices.size;
    btn.disabled = selectedCount !== requiredDiscardCount;
    btn.style.display = 'inline-block';

    const fire1Btn = document.getElementById('fire1-discard-confirm-button');
    if (fire1Btn) fire1Btn.style.display = 'none';
  } else {
    const btn = document.getElementById('discard-confirm-button');
    btn.style.display = 'inline-block';
    btn.disabled = true;

    const fire1Btn = document.getElementById('fire1-discard-confirm-button');
    if (fire1Btn) fire1Btn.style.display = 'none';
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
  if (gameState.cacheDiscardMode || gameState.mustCompileLineNextTurn[gameState.currentPlayer] !== null || gameState.compileSelectionMode || gameState.fire1DiscardMode || gameState.deleteSelectionMode) {
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

        if (gameState.deleteSelectionMode) {
          cardDiv.style.cursor = 'pointer';
          cardDiv.addEventListener('click', () => {
            if (!gameState.deleteSelectionMode) return;
            // Remove the clicked card from board and put in owner's discard
            // Determine owner: if playerId is 1 or 2
            const owner = playerId;
            gameState.players[owner].lines[idx].splice(i, 1);
            gameState.players[owner].discard.push(card);
            alert(`Deleted card: ${card.name} from Player ${owner}'s line ${idx}`);

            renderGameBoard();

            // Exit delete selection mode
            gameState.deleteSelectionMode = false;

            // Proceed to cache phase if we are still in action phase chain
            gameState.phase = 'cache';
            runPhase();
          }, { once: true });
        }

        lineDiv.appendChild(cardDiv);
      });

      const protocol = gameState.players[playerId].protocols[idx];
      const isCompiled = gameState.compiledProtocols[playerId].includes(protocol);
      lineDiv.style.cursor = (playerId === gameState.currentPlayer && !gameState.cacheDiscardMode && gameState.mustCompileLineNextTurn[playerId] === null && !gameState.actionTaken && !gameState.compileSelectionMode && !gameState.fire1DiscardMode && !gameState.deleteSelectionMode) ? 'pointer' : 'default';
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

//
// Fire 1 effect handling
//

function showCardPopup(card) {
  return new Promise((resolve) => {
    const modal = document.getElementById('card-popup-modal');
    const nameElem = document.getElementById('popup-card-name');
    const textElem = document.getElementById('popup-card-text');
    const ackCountElem = document.getElementById('popup-ack-count');

    nameElem.textContent = card.name;
    // Show all effects combined clearly:
    let fullText = "";
    if (card.topEffect) fullText += `Top Effect: ${card.topEffect}\n`;
    if (card.middleEffect) fullText += `Middle Effect: ${card.middleEffect}\n`;
    if (card.bottomEffect) fullText += `Bottom Effect: ${card.bottomEffect}\n`;
    textElem.textContent = fullText.trim();

    modal.style.display = 'block';
    let ackCount = 0;
    ackCountElem.textContent = `${ackCount}/2`;

    function onClick() {
      ackCount++;
      if (ackCount >= 2) {
        modal.style.display = 'none';
        modal.removeEventListener('click', onClick);
        resolve();
      } else {
        ackCountElem.textContent = `${ackCount}/2`;
      }
    }

    modal.addEventListener('click', onClick);
  });
}

async function handleFire1Effect(card, playerId) {
  await showCardPopup(card);

  const player = gameState.players[playerId];
  if (player.hand.length === 0) {
    alert("You have no cards to discard, effect ends.");
    return;
  }

  // Enter discard selection mode
  gameState.fire1DiscardMode = true;
  gameState.fire1DiscardSelectedIndex = null;
  renderHand();
  updateButtonsState();
  updateDiscardInstruction();
  updateDiscardConfirmButton();

  const container = document.getElementById('fire1-discard-container');
  container.style.display = 'block';

  // Wait for discard confirm click to continue handled by setupFire1DiscardConfirmUI()
}

function setupFire1DiscardConfirmUI() {
  const container = document.getElementById('fire1-discard-container');
  const btn = document.getElementById('fire1-discard-confirm-button');

  if (btn && !btn.hasSetup) {
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

      // Exit discard mode
      gameState.fire1DiscardMode = false;
      gameState.fire1DiscardSelectedIndex = null;
      container.style.display = 'none';

      renderHand();
      updateButtonsState();

      // Enter delete selection mode
      gameState.deleteSelectionMode = true;
      alert("Select a card on the board to delete.");
    });
    btn.hasSetup = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupFire1DiscardConfirmUI();
});
