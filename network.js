export function createSessionClient({ httpBase, authCode, getToken, setToken, setStatus, setTokenRowVisible, createUuid }) {
  let csrfToken;

  const sessionKeys = {
    accessToken: 'voice_access_token',
    refreshToken: 'voice_refresh_token',
    accessExpiresAt: 'voice_access_expires_at',
    refreshExpiresAt: 'voice_refresh_expires_at',
    sessionId: 'voice_session_id',
    deviceHash: 'voice_device_hash'
  };

  function getDeviceHash() {
    let value = localStorage.getItem(sessionKeys.deviceHash);
    if (!value) {
      value = createUuid();
      localStorage.setItem(sessionKeys.deviceHash, value);
    }
    return value;
  }

  function storeSession(data) {
    localStorage.setItem(sessionKeys.accessToken, data.accessToken);
    localStorage.setItem(sessionKeys.refreshToken, data.refreshToken);
    localStorage.setItem(sessionKeys.accessExpiresAt, String(data.accessExpiresAt));
    localStorage.setItem(sessionKeys.refreshExpiresAt, String(data.refreshExpiresAt));
    localStorage.setItem(sessionKeys.sessionId, data.sessionId);
  }

  function loadSession() {
    const accessToken = localStorage.getItem(sessionKeys.accessToken);
    const refreshToken = localStorage.getItem(sessionKeys.refreshToken);
    const accessExpiresAt = Number(localStorage.getItem(sessionKeys.accessExpiresAt) || 0);
    const refreshExpiresAt = Number(localStorage.getItem(sessionKeys.refreshExpiresAt) || 0);
    const sessionId = localStorage.getItem(sessionKeys.sessionId);
    return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, sessionId };
  }

  function clearSession() {
    localStorage.removeItem(sessionKeys.accessToken);
    localStorage.removeItem(sessionKeys.refreshToken);
    localStorage.removeItem(sessionKeys.accessExpiresAt);
    localStorage.removeItem(sessionKeys.refreshExpiresAt);
    localStorage.removeItem(sessionKeys.sessionId);
  }

  function getHttpCandidates() {
    const candidates = [httpBase];
    if (httpBase.includes('://localhost')) {
      candidates.push(httpBase.replace('://localhost', '://127.0.0.1'));
    }
    return Array.from(new Set(candidates));
  }

  async function fetchCsrfToken() {
    const errors = [];
    for (const base of getHttpCandidates()) {
      try {
        const response = await fetch(`${base}/sessions/csrf`, { credentials: 'include' });
        if (!response.ok) {
          throw new Error('csrf_failed');
        }
        const data = await response.json();
        csrfToken = data.csrfToken;
        return csrfToken;
      } catch (err) {
        errors.push(err);
      }
    }
    throw errors[0] || new Error('csrf_failed');
  }

  function resolveAuthPayload(authToken, deviceHash) {
    if (authCode && /^[0-9]{6}$/.test(authCode)) {
      return { code: authCode, deviceHash };
    }
    if (authToken && /^[0-9]{6}$/.test(authToken)) {
      return { code: authToken, deviceHash };
    }
    return { token: authToken, deviceHash };
  }

  async function startSession(authToken) {
    await fetchCsrfToken();
    const deviceHash = getDeviceHash();
    const body = resolveAuthPayload(authToken, deviceHash);
    const response = await fetch(`${httpBase}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    if (!response.ok) {
      let errorCode = 'session_start_failed';
      try {
        const data = await response.json();
        if (data && data.error) {
          errorCode = data.error;
        }
      } catch (err) {
      }
      throw new Error(errorCode);
    }
    const data = await response.json();
    storeSession(data);
    return data;
  }

  async function refreshSession() {
    if (!csrfToken) {
      await fetchCsrfToken();
    }
    const session = loadSession();
    if (!session.refreshToken) {
      throw new Error('no_refresh_token');
    }
    const response = await fetch(`${httpBase}/sessions/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ refreshToken: session.refreshToken, deviceHash: getDeviceHash() }),
      credentials: 'include'
    });
    if (!response.ok) {
      clearSession();
      throw new Error('refresh_failed');
    }
    const data = await response.json();
    storeSession(data);
    return data;
  }

  async function ensureSession() {
    const existing = loadSession();
    if (existing.accessToken && existing.accessExpiresAt > Date.now() + 5000) {
      setToken(existing.accessToken);
      return;
    }
    const currentToken = getToken();
    if (currentToken || authCode) {
      const data = await startSession(currentToken);
      setToken(data.accessToken);
      return;
    }
    if (existing.refreshToken && existing.refreshExpiresAt > Date.now() + 5000) {
      const data = await refreshSession();
      setToken(data.accessToken);
    }
  }

  function scheduleRefresh() {
    const session = loadSession();
    if (!session.accessExpiresAt) {
      return;
    }
    const delay = Math.max(1000, session.accessExpiresAt - Date.now() - 10000);
    setTimeout(async () => {
      try {
        const data = await refreshSession();
        setToken(data.accessToken);
        scheduleRefresh();
      } catch (err) {
        setStatus('Sesión expirada');
        setTokenRowVisible(true);
      }
    }, delay);
  }

  async function validateSession() {
    const token = getToken();
    if (!token) {
      throw new Error('no_token');
    }
    const response = await fetch(`${httpBase}/sessions/state`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('session_invalid');
    }
    return response.json();
  }

  function scheduleValidation(intervalMs = 15000) {
    setInterval(async () => {
      try {
        await validateSession();
      } catch (err) {
        setStatus('Sesión inválida');
        setTokenRowVisible(true);
      }
    }, intervalMs);
  }

  return {
    ensureSession,
    scheduleRefresh,
    scheduleValidation
  };
}
