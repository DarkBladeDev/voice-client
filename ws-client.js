export function createWsClient({ wsUrl, createUuid, onMessage, onClose, onError }) {
  let ws;
  const pending = new Map();
  const REQUEST_TIMEOUT_MS = 8000;

  function isOpen() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  function send(payload) {
    if (!isOpen()) {
      return false;
    }
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
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id);
        clearTimeout(entry.timeoutId);
        entry.resolve(message);
        pending.delete(message.id);
        return;
      }
      onMessage(message);
    };
    ws.onclose = () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error('closed'));
      }
      pending.clear();
      if (onClose) {
        onClose();
      }
    };
    ws.onerror = () => {
      if (onError) {
        onError();
      }
    };
    await new Promise((resolve) => ws.addEventListener('open', resolve));
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
