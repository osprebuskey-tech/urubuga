// Where the access token lives:
//  - "Keep me signed in" (the default on the login form): localStorage, so the person is still signed in when they come back
//    tomorrow, until they log out or the longer session ends. The server only grants it to ordinary accounts, never staff.
//  - otherwise: sessionStorage, which survives a refresh but not a closed tab.
// (Anything in web storage is readable by injected scripts, so the app must never render untrusted HTML. Logging out revokes
// the token on the server as well as removing it here.)
const KEY = 'imbehe.token';

const read = (store) => { try { return window[store].getItem(KEY); } catch { return null; } };
const write = (store, value) => { try { if (value) window[store].setItem(KEY, value); else window[store].removeItem(KEY); } catch { /* storage unavailable: the session will not survive a refresh */ } };

export const getToken = () => read('localStorage') || read('sessionStorage');

/** True when the current token is the kind that outlives the tab. */
export const isPersistent = () => Boolean(read('localStorage'));

export const setToken = (token, persist = false) => {
  write('localStorage', null);
  write('sessionStorage', null);
  if (token) write(persist ? 'localStorage' : 'sessionStorage', token);
};

/** Expiry time in ms since epoch, read from the (unverified) JWT payload. Only used to log out on time. */
export function tokenExpiry(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
