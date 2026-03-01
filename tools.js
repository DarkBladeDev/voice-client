import { ui, setAdminStatus, setSuiteStatus, setAdminOutput, setSuiteOutput } from './ui.js';

export function createToolsClient(httpBase) {
  const toolsSessionKey = 'voice_tools_token';

  function getToolsToken() {
    return sessionStorage.getItem(toolsSessionKey) || '';
  }

  function storeToolsToken(value) {
    sessionStorage.setItem(toolsSessionKey, value);
  }

  function clearToolsToken() {
    sessionStorage.removeItem(toolsSessionKey);
  }

  function toolsAuthHeaders() {
    const value = getToolsToken();
    if (!value) {
      return {};
    }
    return { Authorization: `Bearer ${value}` };
  }

  async function toolsPing() {
    const start = performance.now();
    const response = await fetch(`${httpBase}/tools/ping`, { headers: toolsAuthHeaders() });
    if (!response.ok) {
      throw new Error('ping_failed');
    }
    return Math.round(performance.now() - start);
  }

  async function loginTools() {
    if (!ui.toolsUsernameInput || !ui.toolsPasswordInput) {
      return;
    }
    const username = ui.toolsUsernameInput.value.trim();
    const password = ui.toolsPasswordInput.value;
    if (!username || !password) {
      setAdminOutput('Credenciales requeridas');
      return;
    }
    setAdminOutput('Validando credenciales...');
    const response = await fetch(`${httpBase}/tools/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      setAdminOutput('Login inválido');
      return;
    }
    const data = await response.json();
    if (!data.accessToken) {
      setAdminOutput('Login inválido');
      return;
    }
    storeToolsToken(data.accessToken);
    if (ui.toolsPasswordInput) {
      ui.toolsPasswordInput.value = '';
    }
    setAdminStatus('Autenticado', true);
    setAdminOutput('Sesión iniciada');
    window.location.replace('/admin/tests');
  }

  function logoutTools() {
    clearToolsToken();
    setSuiteOutput('Sesión cerrada');
    window.location.replace('/admin');
  }

  async function runNetworkTest() {
    setSuiteOutput('Probando red...');
    const samples = [];
    for (let i = 0; i < 5; i += 1) {
      try {
        const latency = await toolsPing();
        samples.push(latency);
      } catch (err) {
        clearToolsToken();
        setSuiteOutput('No autorizado o servicio no disponible');
        window.location.replace('/admin');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const avg = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
    setSuiteOutput(`Latencia ms: min ${min} | avg ${avg} | max ${max}`);
  }

  return {
    getToolsToken,
    clearToolsToken,
    toolsPing,
    loginTools,
    logoutTools,
    runNetworkTest,
    setAdminStatus,
    setSuiteStatus
  };
}
