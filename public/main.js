fetch('../data/cards.json')
  .then(res => res.json())
  .then(data => {
    const container = document.getElementById('card-container');
    Object.entries(data.protocols).forEach(([protocolName, protocol]) => {
      protocol.cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.classList.add('card');
        cardDiv.style.border = `2px solid ${protocol.color}`;
        const nameDiv = document.createElement('div');
        nameDiv.className = 'name';
        nameDiv.textContent = card.name;
        const pointsDiv = document.createElement('div');
        pointsDiv.className = 'points';
        pointsDiv.textContent = `Points: ${card.points}`;
        const effectsDiv = document.createElement('div');
        effectsDiv.className = 'effects';
        effectsDiv.textContent = 
          `Top: ${card.effects.top ? JSON.stringify(card.effects.top) : 'None'}\n` +
          `Middle: ${card.effects.middle || 'None'}\n` +
          `Bottom: ${card.effects.bottom || 'None'}`;
        cardDiv.appendChild(nameDiv);
        cardDiv.appendChild(pointsDiv);
        cardDiv.appendChild(effectsDiv);
        container.appendChild(cardDiv);
      });
    });
  })
  .catch(err => console.error('Failed to load cards.json', err));
