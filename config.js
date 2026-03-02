export function getConfig() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const normalizedPath = window.location.pathname
    .replace(/\/index\.html$/, '')
    .replace(/\/+$/, '') || '/';
  const isAdmin = normalizedPath === '/admin';
  const isAdminTests = normalizedPath === '/admin/tests';
  const authCode = params.get('code');
  const rawHost = window.location.host || window.location.hostname || 'localhost';
  const rawHostname = window.location.hostname || rawHost;
  const rawPort = window.location.port;
  const pageProtocol = window.location.protocol;
  const useStandardPorts = pageProtocol === 'http:' || pageProtocol === 'https:';
  const defaultHost = useStandardPorts && rawPort === '3000' ? rawHostname : rawHost;
  const defaultWsProtocol = pageProtocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = params.get('ws') || (useStandardPorts
    ? `${defaultWsProtocol}://${defaultHost}/ws`
    : `ws://${defaultHost}:3000/ws`);
  const httpBase = params.get('http') || (useStandardPorts
    ? `${pageProtocol}//${defaultHost}`
    : `http://${defaultHost}:3000`);
  let maxDistance = Number(params.get('range') || 48);
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    maxDistance = 48;
  }
  maxDistance = Math.min(128, Math.max(4, maxDistance));

  return {
    token,
    normalizedPath,
    isAdmin,
    isAdminTests,
    authCode,
    wsUrl,
    httpBase,
    maxDistance
  };
}
