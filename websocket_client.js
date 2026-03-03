export function createWsClient({ wsUrl, createUuid, onMessage, onClose, onError, logger }) {
  let ws;
  const pending = new Map();
  // Maximum time (ms) to wait for a response to a request before rejecting with 'timeout'
  const REQUEST_TIMEOUT_MS = 20000;
  // Maximum time (ms) to wait for the WebSocket connection to open before rejecting with 'open_timeout'
  const OPEN_TIMEOUT_MS = 8000;
  const log = logger || {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };

  function isOpen() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  function send(payload) {
    if (!isOpen()) {
      log.warn('ws_send_skipped', { reason: 'not_open', type: payload?.type });
      return false;
    }
    log.debug('ws_send', { type: payload?.type, id: payload?.id });
    ws.send(JSON.stringify(payload));
    return true;
  }

  function request(type, data = {}) {
    return new Promise((resolve, reject) => {
      if (!isOpen()) {
        reject(new Error('ws_closed'));
        return;
      }
      const id = createUuid();
      log.debug('ws_request', { id, type });
      const timeoutId = setTimeout(() => {
        if (pending.has(id)) {
          pending.get(id).reject(new Error('timeout'));
          pending.delete(id);
        }
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeoutId });
      ws.send(JSON.stringify({ id, type, ...data }));
    });
  }

  async function open() {
    log.info('ws_open_attempt', { wsUrl });
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (err) {
        log.warn('ws_message_invalid_json');
        return;
      }
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        clearTimeout(entry.timeoutId);
        entry.resolve(message);
        pending.delete(message.id);
        log.debug('ws_response', { id: message.id, type: message.type });
        return;
      }
      log.debug('ws_message', { type: message.type });
      onMessage(message);
    };
    ws.onclose = (event) => {
      log.warn('ws_closed', { code: event.code, reason: event.reason, wasClean: event.wasClean });
      for (const entry of pending.values()) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error('closed'));
      }
      pending.clear();
      if (onClose) {
        onClose(event);
      }
    };
    ws.onerror = (event) => {
      log.error('ws_error', { type: event.type });
      if (onError) {
        onError(event);
      }
    };
    await new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error('open_timeout'));
      }, OPEN_TIMEOUT_MS);
      const handleOpen = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        log.info('ws_opened');
        resolve();
      };
      const handleClose = (event) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        log.warn('ws_open_closed', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        reject(new Error('closed'));
      };
      const handleError = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        log.error('ws_open_error');
        reject(new Error('ws_error'));
      };
      const cleanup = () => {
        clearTimeout(timeoutId);
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('close', handleClose);
        ws.removeEventListener('error', handleError);
      };
      ws.addEventListener('open', handleOpen);
      ws.addEventListener('close', handleClose);
      ws.addEventListener('error', handleError);
    });
  }

  function close() {
    if (ws) {
      ws.close();
    }
  }

  return {
    open,
    request,
    send,
    isOpen,
    close
  };
}
