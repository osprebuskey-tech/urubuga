import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/authApi';
import { userHasRole } from '../utils/roles';
import { setUnauthorizedHandler } from '../services/api';
import { getToken, setToken, tokenExpiry } from '../services/session';

const AuthContext = createContext(null);
const MAX_TIMEOUT = 2 ** 31 - 1;
const EXPIRED_NOTICE = 'Your session has expired. Please log in again.';

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'anonymous'));
  const [notice, setNotice] = useState(null);

  const clearSession = useCallback((message) => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setStatus('anonymous');
    if (message) setNotice(message);
  }, []);

  const startSession = useCallback((session) => {
    setToken(session.accessToken, Boolean(session.remembered)); // the server decides: staff never get a long session
    setTokenState(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
    setNotice(null);
    return session.user;
  }, []);

  // A 401 about the session itself (expired / revoked token) logs the user out everywhere in the app.
  useEffect(() => {
    setUnauthorizedHandler(() => clearSession(EXPIRED_NOTICE));
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Restore the session after a page refresh.
  useEffect(() => {
    if (!getToken()) return undefined;
    let alive = true;
    authApi
      .me()
      .then((res) => {
        if (!alive) return;
        setUser(res.data.user);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 0) setStatus('anonymous'); // offline: keep the token so a refresh can recover
        else clearSession(err.code === 'ACCOUNT_SUSPENDED' ? err.message : null);
      });
    return () => { alive = false; };
  }, [clearSession]);

  // Log out at the moment the token expires instead of waiting for the next failed request.
  useEffect(() => {
    if (!token) return undefined;
    const expiresAt = tokenExpiry(token);
    if (!expiresAt) return undefined;
    const wait = expiresAt - Date.now();
    if (wait <= 0) { clearSession(EXPIRED_NOTICE); return undefined; }
    const id = setTimeout(() => clearSession(EXPIRED_NOTICE), Math.min(wait, MAX_TIMEOUT));
    return () => clearTimeout(id);
  }, [token, clearSession]);

  const login = useCallback(async (credentials) => startSession((await authApi.login(credentials)).data), [startSession]);
  const register = useCallback(async (details) => startSession((await authApi.register(details)).data), [startSession]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* the token may already be invalid; clear locally either way */ }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const res = await authApi.me();
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const updateProfile = useCallback(async (changes) => {
    const res = await authApi.updateMe(changes);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // The server signs every other device out and returns a fresh token, so this device stays signed in.
  const changePassword = useCallback(async (body) => startSession((await authApi.changePassword(body)).data), [startSession]);

  const hasRole = useCallback((...roles) => userHasRole(user, ...roles), [user]);
  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({ user, status, notice, clearNotice, login, register, logout, refreshUser, updateProfile, changePassword, hasRole }),
    [user, status, notice, clearNotice, login, register, logout, refreshUser, updateProfile, changePassword, hasRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
