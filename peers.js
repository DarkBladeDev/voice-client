export function createPeerRenderer({ ui, updatePeers, getMaxDistance, getSelfUuid, getDeafened, playerStates, producerMap, consumerMap }) {
  let peerCount = 0;

  function computeDistance(self, other) {
    if (!self?.payload || !other?.payload) {
      return null;
    }
    if (self.payload?.world && other.payload?.world && self.payload.world !== other.payload.world) {
      return null;
    }
    if (self.payload?.dimension && other.payload?.dimension && self.payload.dimension !== other.payload.dimension) {
      return null;
    }
    const dx = (self.payload?.x ?? 0) - (other.payload?.x ?? 0);
    const dy = (self.payload?.y ?? 0) - (other.payload?.y ?? 0);
    const dz = (self.payload?.z ?? 0) - (other.payload?.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function isInRange(self, other) {
    const distance = computeDistance(self, other);
    if (distance === null) {
      return false;
    }
    return distance < getMaxDistance();
  }

  function calculateVolume(self, other) {
    if (!other) {
      return 1;
    }
    if (other.sync?.muted || other.sync?.banned) {
      return 0;
    }
    if (self.payload?.world && other.payload?.world && self.payload.world !== other.payload.world) {
      return 0;
    }
    if (self.payload?.dimension && other.payload?.dimension && self.payload.dimension !== other.payload.dimension) {
      return 0;
    }
    const dx = (self.payload?.x ?? 0) - (other.payload?.x ?? 0);
    const dy = (self.payload?.y ?? 0) - (other.payload?.y ?? 0);
    const dz = (self.payload?.z ?? 0) - (other.payload?.z ?? 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxDistance = getMaxDistance();
    if (distance >= maxDistance) {
      return 0;
    }
    return Math.max(0, 1 - distance / maxDistance);
  }

  function renderPeerList(self) {
    const players = Array.from(playerStates.values()).sort((a, b) => {
      const nameA = a.name || a.uuid || '';
      const nameB = b.name || b.uuid || '';
      return nameA.localeCompare(nameB);
    });
    if (ui.peersList) {
      ui.peersList.innerHTML = '';
    }
    for (const player of players) {
      const item = document.createElement('li');
      item.className = 'list-item';
      const left = document.createElement('div');
      left.className = 'name';
      left.textContent = player.name || player.uuid || 'Jugador';
      const right = document.createElement('div');
      right.className = 'meta';
      if (player.uuid === self.uuid) {
        const badge = document.createElement('span');
        badge.className = 'pill pill-self';
        badge.textContent = 'Tú';
        right.appendChild(badge);
      } else {
        const inRange = isInRange(self, player);
        const badge = document.createElement('span');
        badge.className = `pill ${inRange ? 'pill-ok' : 'pill-warn'}`;
        badge.textContent = inRange ? 'En rango' : 'Fuera de rango';
        right.appendChild(badge);
      }
      const distance = computeDistance(self, player);
      if (distance !== null && player.uuid !== self.uuid) {
        const info = document.createElement('span');
        info.className = 'subtle';
        info.textContent = `${Math.round(distance)}m`;
        right.appendChild(info);
      }
      item.appendChild(left);
      item.appendChild(right);
      if (ui.peersList) {
        ui.peersList.appendChild(item);
      }
    }
    peerCount = Math.max(0, players.length - 1);
    updatePeers(peerCount);
  }

  function updateVolumes() {
    const selfUuid = getSelfUuid();
    if (!selfUuid) {
      return;
    }
    const self = playerStates.get(selfUuid);
    if (!self) {
      return;
    }
    const deafened = getDeafened();
    for (const [producerId, entry] of consumerMap.entries()) {
      const uuid = producerMap.get(producerId);
      const other = uuid ? playerStates.get(uuid) : null;
      const volume = deafened ? 0 : calculateVolume(self, other);
      entry.gainNode.gain.value = volume;
    }
    renderPeerList(self);
  }

  function onPeerAdded() {
    peerCount += 1;
    updatePeers(peerCount);
  }

  function resetPeers() {
    peerCount = 0;
    updatePeers(peerCount);
    if (ui.peersList) {
      ui.peersList.innerHTML = '';
    }
  }

  function syncPeerCount() {
    updatePeers(peerCount);
  }

  return {
    updateVolumes,
    renderPeerList,
    calculateVolume,
    computeDistance,
    isInRange,
    onPeerAdded,
    resetPeers,
    syncPeerCount
  };
}
