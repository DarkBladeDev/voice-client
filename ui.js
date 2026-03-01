const statusEl = document.getElementById('status');
const peersEl = document.getElementById('peers');
const connectBtn = document.getElementById('connectBtn');
const muteBtn = document.getElementById('muteBtn');
const deafenBtn = document.getElementById('deafenBtn');
const tokenRow = document.getElementById('tokenRow');
const tokenInput = document.getElementById('tokenInput');
const tokenApplyBtn = document.getElementById('tokenApplyBtn');
const connectView = document.getElementById('connectView');
const connectedView = document.getElementById('connectedView');
const peersList = document.getElementById('peersList');
const rangeInfo = document.getElementById('rangeInfo');
const toastContainer = document.getElementById('toastContainer');
const micSelect = document.getElementById('micSelect');
const micTestBtn = document.getElementById('micTestBtn');
const micLevelFill = document.getElementById('micLevelFill');
const adminCard = document.getElementById('adminCard');
const toolsCard = document.getElementById('toolsCard');
const adminStatusEl = document.getElementById('adminStatus');
const toolsStatusEl = document.getElementById('toolsStatus');
const toolsUsernameInput = document.getElementById('toolsUsername');
const toolsPasswordInput = document.getElementById('toolsPassword');
const toolsLoginBtn = document.getElementById('toolsLoginBtn');
const toolsLogoutBtn = document.getElementById('toolsLogoutBtn');
const toolsAudioOutBtn = document.getElementById('toolsAudioOutBtn');
const toolsVoiceLoopBtn = document.getElementById('toolsVoiceLoopBtn');
const toolsNetBtn = document.getElementById('toolsNetBtn');
const toolsOutputEl = document.getElementById('toolsOutput');
const toolsSuiteOutputEl = document.getElementById('toolsSuiteOutput');

export const ui = {
  statusEl,
  peersEl,
  connectBtn,
  muteBtn,
  deafenBtn,
  tokenRow,
  tokenInput,
  tokenApplyBtn,
  connectView,
  connectedView,
  peersList,
  rangeInfo,
  toastContainer,
  micSelect,
  micTestBtn,
  micLevelFill,
  adminCard,
  toolsCard,
  adminStatusEl,
  toolsStatusEl,
  toolsUsernameInput,
  toolsPasswordInput,
  toolsLoginBtn,
  toolsLogoutBtn,
  toolsAudioOutBtn,
  toolsVoiceLoopBtn,
  toolsNetBtn,
  toolsOutputEl,
  toolsSuiteOutputEl
};

export function setStatus(text) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text;
}

export function updatePeers(peerCount) {
  if (!peersEl) {
    return;
  }
  peersEl.textContent = `Jugadores: ${peerCount}`;
}

export function setAdminStatus(text, isOk) {
  if (!adminStatusEl) {
    return;
  }
  adminStatusEl.textContent = text;
  adminStatusEl.classList.toggle('pill-ok', isOk);
  adminStatusEl.classList.toggle('pill-warn', !isOk);
}

export function setSuiteStatus(text, isOk) {
  if (!toolsStatusEl) {
    return;
  }
  toolsStatusEl.textContent = text;
  toolsStatusEl.classList.toggle('pill-ok', isOk);
  toolsStatusEl.classList.toggle('pill-warn', !isOk);
}

export function setAdminOutput(text) {
  if (!toolsOutputEl) {
    return;
  }
  toolsOutputEl.textContent = text;
}

export function setSuiteOutput(text) {
  if (!toolsSuiteOutputEl) {
    return;
  }
  toolsSuiteOutputEl.textContent = text;
}

export function setConnectedView(isConnected) {
  if (connectView) {
    connectView.classList.toggle('hidden', isConnected);
  }
  if (connectedView) {
    connectedView.classList.toggle('hidden', !isConnected);
  }
}

export function setTokenRowVisible(visible) {
  if (!tokenRow) {
    return;
  }
  tokenRow.style.display = visible ? 'flex' : 'none';
}

export function setRangeInfo(text) {
  if (!rangeInfo) {
    return;
  }
  rangeInfo.textContent = text;
}

export function showToast(text) {
  if (!toastContainer) {
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 1800);
}

export function setAdminVisibility(isAdmin) {
  if (!adminCard) {
    return;
  }
  adminCard.classList.toggle('hidden', !isAdmin);
}

export function setToolsVisibility(isAdminTests) {
  if (!toolsCard) {
    return;
  }
  toolsCard.classList.toggle('hidden', !isAdminTests);
}
