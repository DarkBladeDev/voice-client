export function createSessionStore({ token }) {
  let currentToken = token;
  let selfUuid = null;

  function getToken() {
    return currentToken;
  }

  function setToken(value) {
    currentToken = value;
  }

  function getSelfUuid() {
    return selfUuid;
  }

  function setSelfUuid(value) {
    selfUuid = value;
  }

  return {
    getToken,
    setToken,
    getSelfUuid,
    setSelfUuid
  };
}
