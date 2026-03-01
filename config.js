export function getConfig() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const normalizedPath = window.location.pathname
    .replace(/\/index\.html$/, '')
    .replace(/\/+$/, '') || '/';
  const isAdmin = normalizedPath === '/admin';
  const isAdminTests = normalizedPath === '/admin/tests';
  const authCode = params.get('code');
  const defaultWsHost = window.location.hostname || 'localhost';
  const pageProtocol = window.location.protocol;
  const defaultWsProtocol = pageProtocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = params.get('ws') || `${defaultWsProtocol}://${defaultWsHost}:3000/ws`;
  const httpBase = params.get('http') || ((pageProtocol === 'http:' || pageProtocol === 'https:')
    ? `${pageProtocol}//${defaultWsHost}:3000`
    : `http://${defaultWsHost}:3000`);
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
