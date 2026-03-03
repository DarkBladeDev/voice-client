import { getConfig } from './config.js';
import {
  ui,
  setStatus,
  updatePeers,
  setAdminOutput,
  setSuiteOutput,
  setConnectedView,
  showToast,
  setTokenRowVisible,
  setRangeInfo,
  setAdminVisibility,
  setToolsVisibility,
  setAdminStatus,
  setSuiteStatus
} from './ui.js';
import { createToolsClient } from './tools.js';
import { createSessionClient } from './network.js';
import { createAudioController } from './audio.js';
import { createPeerRenderer } from './peers.js';
import { createMediaClient } from './media.js';
import { createSessionStore } from './session-store.js';
import { createWsClient } from './websocket_client.js';

function uuidFallback() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.random() * 16 | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = uuidFallback;
}

const config = getConfig();
const isAdmin = config.isAdmin;
const isAdminTests = config.isAdminTests;
const authCode = config.authCode;
const wsUrl = config.wsUrl;
const httpBase = config.httpBase;
let maxDistance = config.maxDistance;
const debug = config.debug;

function createLogger(enabled) {
  const prefix = '[voice-client]';
  const log = (level, ...args) => {
    if (!enabled) {
      return;
    }
    const method = console[level] ? level : 'log';
    console[method](prefix, ...args);
  };
  return {
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args)
  };
}

const logger = createLogger(debug);
logger.info('config', {
  wsUrl,
  httpBase,
  isAdmin,
  isAdminTests,
  hasToken: Boolean(config.token),
  maxDistance
});

let audioTrack;
let muted = false;
let deafened = false;
let moderationBanned = false;
let moderationBanExpiresAt = 0;
let moderationKickUntil = 0;
const sessionStore = createSessionStore({ token: config.token });

const playerStates = new Map();
const producerMap = new Map();
const consumerMap = new Map();

const toolsClient = createToolsClient(httpBase);
const audioController = createAudioController({
  ui,
  setSuiteOutput
});
const peerRenderer = createPeerRenderer({
  ui,
  updatePeers,
  getMaxDistance: () => maxDistance,
  getSelfUuid: () => sessionStore.getSelfUuid(),
  getDeafened: () => deafened,
  playerStates,
  producerMap,
  consumerMap
});
const sessionClient = createSessionClient({
  httpBase,
  authCode,
  getToken: () => sessionStore.getToken(),
  setToken: (value) => sessionStore.setToken(value),
  setStatus,
  setTokenRowVisible,
  createUuid
});
let mediaClient;
let wsClient;
let pingIntervalId;

function applyModerationState(state) {
  const now = Date.now();
  const banExpiresAt = Number(state?.banExpiresAt || 0);
  const kickUntil = Number(state?.kickUntil || 0);
  const banned = Boolean(state?.banned) && (banExpiresAt === 0 || banExpiresAt > now);
  moderationBanned = banned;
  moderationBanExpiresAt = banExpiresAt;
  moderationKickUntil = kickUntil > now ? kickUntil : 0;
  if (ui.connectBtn) {
    ui.connectBtn.disabled = moderationBanned || moderationKickUntil > 0;
  }
  if (moderationBanned) {
    setStatus('Baneado del voicechat');
    setConnectedView(false);
    return;
  }
  if (moderationKickUntil > 0) {
    const remaining = Math.max(1, Math.ceil((moderationKickUntil - now) / 1000));
    setStatus(`Expulsado del voicechat. Reintento en ${remaining}s`);
    setConnectedView(false);
  }
}

function setMutedState(value, emit) {
  muted = value;
  if (audioTrack) {
    audioTrack.enabled = !muted && !deafened;
  }
  if (ui.muteBtn) {
    ui.muteBtn.textContent = muted ? 'Unmute' : 'Mute';
    ui.muteBtn.classList.toggle('muted', muted || deafened);
    ui.muteBtn.classList.toggle('active', !muted && !deafened);
    ui.muteBtn.disabled = deafened;
  }
  if (emit) {
    sendSyncState();
  }
}

function applyMuteState() {
  setMutedState(muted, true);
}

function applyDeafenState(emit = false) {
  if (deafened) {
    setMutedState(true, emit);
  } else {
    setMutedState(muted, emit);
  }
  if (ui.deafenBtn) {
    ui.deafenBtn.textContent = deafened ? 'Undeafen' : 'Deafen';
    ui.deafenBtn.classList.toggle('muted', deafened);
    ui.deafenBtn.classList.toggle('active', !deafened);
  }
  if (deafened) {
    for (const entry of consumerMap.values()) {
      entry.gainNode.gain.value = 0;
    }
    return;
  }
  peerRenderer.updateVolumes();
}

function sendSyncState() {
  if (!wsClient || !wsClient.isOpen() || !sessionStore.getSelfUuid()) {
    return;
  }
  const state = { muted };
  wsClient.send({ type: 'syncState', state, updatedAt: Date.now() });
}

function maybeNotifyState(next, prev) {
  if (!next || !prev) {
    return;
  }
  if (next.muted !== prev.muted) {
    const text = next.muted ? 'Estás en silencio' : 'Micrófono activado';
    showToast(text);
  }
}

if (sessionStore.getToken()) {
  setStatus('Token detectado');
} else {
  setStatus('Token faltante');
  setTokenRowVisible(true);
}
setRangeInfo(`Rango: ${maxDistance} bloques`);

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return uuidFallback();
}

wsClient = createWsClient({
  wsUrl,
  createUuid,
  onMessage,
  onClose: (event) => {
    logger.warn('ws_closed', { code: event?.code, reason: event?.reason, wasClean: event?.wasClean });
    setStatus('Conexión cerrada');
    setConnectedView(false);
    peerRenderer.resetPeers();
    stopPingLoop();
  },
  onError: (event) => {
    logger.error('ws_error', { type: event?.type });
    setStatus('Error de conexión');
    setConnectedView(false);
    stopPingLoop();
  },
  logger
});

mediaClient = createMediaClient({
  request: (type, data) => wsClient.request(type, data),
  audioController,
  producerMap,
  consumerMap,
  peerRenderer,
  getDeafened: () => deafened
});

function onMessage(message) {
  logger.debug('ws_message_handled', { type: message?.type });
  if (message.type === 'authed' && message.uuid) {
    sessionStore.setSelfUuid(message.uuid);
    return;
  }
  if (message.type === 'newProducer') {
    if (message.uuid) {
      producerMap.set(message.producerId, message.uuid);
    }
    mediaClient.consumeProducer(message.producerId).catch(() => {});
  }
  if (message.type === 'state') {
    playerStates.clear();
    for (const player of message.players) {
      playerStates.set(player.uuid, player);
    }
    peerRenderer.updateVolumes();
    const selfUuid = sessionStore.getSelfUuid();
    if (selfUuid && playerStates.has(selfUuid)) {
      const selfState = playerStates.get(selfUuid)?.sync;
      if (selfState && typeof selfState.muted === 'boolean') {
        setMutedState(selfState.muted, false);
      }
      if (selfState && typeof selfState.deafened === 'boolean') {
        deafened = selfState.deafened;
        applyDeafenState();
      }
      applyModerationState(selfState);
    }
  }
  if (message.type === 'syncState') {
    const entry = playerStates.get(message.uuid) || {};
    playerStates.set(message.uuid, { ...entry, sync: message.state });
    const selfUuid = sessionStore.getSelfUuid();
    if (message.uuid === selfUuid && typeof message.state?.muted === 'boolean') {
      setMutedState(message.state.muted, false);
    }
    if (message.uuid === selfUuid && typeof message.state?.deafened === 'boolean') {
      deafened = message.state.deafened;
      applyDeafenState(false);
    }
    if (message.uuid === selfUuid) {
      applyModerationState(message.state);
    }
    maybeNotifyState(message.state, entry.sync);
  }
  if (message.type === 'stateConflict') {
    const selfUuid = sessionStore.getSelfUuid();
    if (message.uuid === selfUuid && message.state?.muted !== undefined) {
      setMutedState(message.state.muted, false);
    }
  }
  if (message.type === 'moderationDenied') {
    applyModerationState(message.state);
  }
  if (message.type === 'sessionDenied' && message.reason === 'active_session') {
    logger.warn('session_denied', { reason: message.reason });
    setStatus('Ya tienes una sesión activa en otro dispositivo o instancia');
    setConnectedView(false);
    stopPingLoop();
  }
}

function startPingLoop(intervalMs = 10000) {
  stopPingLoop();
  pingIntervalId = setInterval(async () => {
    if (!wsClient || !wsClient.isOpen()) {
      return;
    }
    const sentAt = Date.now();
    try {
      await wsClient.request('ping', { sentAt });
      const pingMs = Date.now() - sentAt;
      wsClient.send({ type: 'pingReport', pingMs });
    } catch (err) {
      logger.debug('ping_failed', { message: err?.message });
    }
  }, intervalMs);
}

function stopPingLoop() {
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
}

async function connect() {
  stopPingLoop();
  logger.info('connect_start');
  try {
    const sessionStart = performance.now();
    await sessionClient.ensureSession();
    logger.info('session_ready', { ms: Math.round(performance.now() - sessionStart) });
  } catch (err) {
    logger.warn('session_failed', { message: err?.message });
    if (err && err.message === 'invalid_token') {
      setStatus('Token inválido o expirado');
      setTokenRowVisible(true);
    } else if (err && err.message === 'rate_limited') {
      setStatus('Límite de intentos alcanzado');
    } else if (err && err.message === 'active_session') {
      setStatus('Ya tienes una sesión activa en otro dispositivo o instancia');
    } else {
      setStatus('No se pudo iniciar sesión');
    }
    setConnectedView(false);
    return;
  }
  const now = Date.now();
  if (moderationBanned && (moderationBanExpiresAt === 0 || moderationBanExpiresAt > now)) {
    setStatus('Baneado del voicechat');
    return;
  }
  if (moderationKickUntil > now) {
    const remaining = Math.max(1, Math.ceil((moderationKickUntil - now) / 1000));
    setStatus(`Expulsado del voicechat. Reintento en ${remaining}s`);
    return;
  }
  const token = sessionStore.getToken();
  if (!token) {
    logger.warn('token_missing');
    setStatus('Token faltante');
    setTokenRowVisible(true);
    return;
  }
  setStatus('Conectando...');
  try {
    const openStart = performance.now();
    await wsClient.open();
    logger.info('ws_ready', { ms: Math.round(performance.now() - openStart) });
  } catch (err) {
    logger.warn('ws_open_failed', { message: err?.message });
    if (err && err.message === 'open_timeout') {
      setStatus('Tiempo de espera agotado');
    } else {
      setStatus('No se pudo conectar');
    }
    setConnectedView(false);
    return;
  }
  wsClient.send({ type: 'auth', token });
  logger.debug('ws_auth_sent');
  sessionStore.setSelfUuid(parseTokenSubject(token));

  let joined;
  try {
    const joinStart = performance.now();
    joined = await wsClient.request('join');
    logger.info('join_ok', { ms: Math.round(performance.now() - joinStart) });
  } catch (err) {
    logger.warn('join_failed', { message: err?.message });
    if (err && (err.message === 'closed' || err.message === 'ws_closed')) {
      setStatus('Conexión cerrada');
    } else if (err && err.message === 'timeout') {
      setStatus('Tiempo de espera agotado');
    } else {
      setStatus('Token inválido o expirado');
    }
    setConnectedView(false);
    if (!err || !['closed', 'ws_closed', 'timeout'].includes(err.message)) {
      logger.error('join_error', { message: err?.message });
    }
    return;
  }
  logger.debug('rtp_capabilities_ready');
  await mediaClient.initDevice(joined.rtpCapabilities);
  logger.debug('transports_create_start');
  await mediaClient.createTransports();
  logger.debug('transports_create_done');

  audioController.stopMicTest();
  if (!navigator.mediaDevices?.getUserMedia) {
    logger.warn('mic_unavailable');
    setStatus('Micrófono no disponible en este navegador');
    setConnectedView(false);
    return;
  }
  logger.debug('mic_track_create_start', { deviceId: ui.micSelect?.value || '' });
  const audioInput = await audioController.createAudioTrack(ui.micSelect?.value || '');
  audioTrack = audioInput.track;
  applyMuteState();
  await mediaClient.produceTrack(audioTrack);
  logger.debug('mic_track_produced');

  const producers = await wsClient.request('getProducers');
  logger.debug('producers_received', { count: producers?.producers?.length || 0 });
  for (const producer of producers.producers) {
    if (producer.uuid) {
      producerMap.set(producer.producerId, producer.uuid);
    }
    await mediaClient.consumeProducer(producer.producerId);
  }

  setStatus('Conectado');
  setConnectedView(true);
  sessionClient.scheduleRefresh();
  sessionClient.scheduleValidation();
  startPingLoop();
  logger.info('connect_ready');
}

function parseTokenSubject(tokenValue) {
  try {
    const payload = JSON.parse(atob(tokenValue.split('.')[1]));
    return payload.sub;
  } catch (err) {
    return null;
  }
}

if (ui.connectBtn) {
  ui.connectBtn.addEventListener('click', () => connect());
}

if (ui.micSelect) {
  audioController.populateMicSelect().catch(() => {});
  ui.micSelect.addEventListener('change', () => {
    audioController.setSelectedMicId(ui.micSelect.value);
  });
}

if (ui.micTestBtn) {
  ui.micTestBtn.addEventListener('click', () => {
    audioController.startMicTest().catch(() => {
      audioController.stopMicTest();
    });
  });
}

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    audioController.populateMicSelect(ui.micSelect?.value || audioController.getSelectedMicId()).catch(() => {});
  });
}

if (ui.tokenApplyBtn) {
  ui.tokenApplyBtn.addEventListener('click', () => {
    const value = ui.tokenInput?.value.trim() || '';
    if (!value) {
      setStatus('Token faltante');
      return;
    }
    sessionStore.setToken(value);
    setStatus('Token detectado');
    setTokenRowVisible(false);
  });
}
if (ui.toolsLoginBtn) {
  ui.toolsLoginBtn.addEventListener('click', () => {
    toolsClient.loginTools().catch(() => setAdminOutput('No se pudo iniciar sesión'));
  });
}

if (ui.toolsLogoutBtn) {
  ui.toolsLogoutBtn.addEventListener('click', () => {
    toolsClient.logoutTools();
  });
}

if (ui.toolsAudioOutBtn) {
  ui.toolsAudioOutBtn.addEventListener('click', () => {
    audioController.runAudioOutputTest().catch(() => setSuiteOutput('Error en prueba de salida'));
  });
}

if (ui.toolsVoiceLoopBtn) {
  ui.toolsVoiceLoopBtn.addEventListener('click', () => {
    audioController.runVoiceLoopTest().catch(() => setSuiteOutput('Error en prueba de voz'));
  });
}

if (ui.toolsNetBtn) {
  ui.toolsNetBtn.addEventListener('click', () => {
    toolsClient.runNetworkTest().catch(() => setSuiteOutput('Error en test de red'));
  });
}

setAdminVisibility(isAdmin);
setToolsVisibility(isAdminTests);

if (isAdmin || isAdminTests) {
  if (ui.connectView) {
    ui.connectView.classList.add('hidden');
  }
  if (ui.connectedView) {
    ui.connectedView.classList.add('hidden');
  }
}

if (isAdmin) {
  if (toolsClient.getToolsToken()) {
    window.location.replace('/admin/tests');
  } else {
    setAdminStatus('Sin sesión', false);
  }
}

if (isAdminTests) {
  if (!toolsClient.getToolsToken()) {
    window.location.replace('/admin');
  } else {
    setSuiteStatus('Autenticado', true);
    toolsClient.toolsPing()
      .then(() => setSuiteOutput('Sesión validada'))
      .catch(() => {
        toolsClient.clearToolsToken();
        setSuiteOutput('Sesión expirada');
        window.location.replace('/admin');
      });
  }
}

if (ui.muteBtn) {
  ui.muteBtn.addEventListener('click', () => {
    if (deafened) {
      return;
    }
    setMutedState(!muted, true);
  });
}

if (ui.deafenBtn) {
  ui.deafenBtn.addEventListener('click', () => {
    deafened = !deafened;
    applyDeafenState(true);
  });
}

peerRenderer.syncPeerCount();
