import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, type PatientProfile } from '@medrush/shared';
import { api, loadServerUrl, setAuthToken } from './api';
import { unregisterServerPush } from './notifications';

/** Separate login per user type; partner portals are enforced by the server. */
export type AccountKind = 'patient' | 'staff' | 'pharmacy' | 'lab';

export const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];

/** Where each role lands after login. */
export function homeForRole(role: string): '/' | '/vendor' | '/staff' | '/lab' {
  if (role === 'pharmacy_vendor') return '/vendor';
  if (STAFF_ROLES.includes(role)) return '/staff';
  if (role === 'lab_partner' || role === 'phlebotomist') return '/lab';
  return '/';
}

export interface Session {
  kind: AccountKind;
  token: string;
  refreshToken?: string;
  name: string;
  email: string;
  role: string; // 'patient' | 'pharmacy_vendor' | 'platform_admin' | …
}

interface AuthState {
  ready: boolean;
  session: Session | null;
  login: (kind: AccountKind, email: string, password: string) => Promise<Session>;
  register: (input: { name: string; email: string; phone: string; password: string }) => Promise<Session>;
  /** Sign in with a session from phone OTP / Google (customer app). */
  adoptPatientSession: (res: { patient: PatientProfile; tokens?: { accessToken: string; refreshToken: string } }) => Promise<Session>;
  logout: () => Promise<void>;
  /** Customer chose "Explore first" on the welcome screen (remembered). */
  explored: boolean;
  setExplored: (v: boolean) => void;
}

const SESSION_KEY = 'medrush.session';
const EXPLORED_KEY = 'nabz.explored';
const AuthContext = createContext<AuthState | null>(null);

async function persist(session: Session | null) {
  setAuthToken(session ? session.token : null);
  if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
}

function requireTokens(tokens: { accessToken: string; refreshToken: string } | undefined) {
  if (!tokens || !tokens.accessToken) {
    // The API only returns bearer tokens to the native app (X-Nocturnal-Mobile: expo).
    throw new Error('Server did not return a mobile session. Update the backend to this branch.');
  }
  return tokens;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [explored, setExploredState] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  // Single place that updates the session (ref for the refresh handler + state for UI).
  const commit = useCallback(async (next: Session | null) => {
    sessionRef.current = next;
    await persist(next);
    setSession(next);
  }, []);

  // Access tokens live 15 min; refresh silently (single-flight) on the first 401.
  useEffect(() => {
    let inFlight: Promise<boolean> | null = null;
    api.setUnauthorizedHandler(() => {
      if (!inFlight) {
        inFlight = (async () => {
          const current = sessionRef.current;
          if (!current?.refreshToken) return false;
          try {
            const res = await api.refreshSession(current.refreshToken);
            if (!res.tokens) throw new Error('No tokens');
            await commit({ ...current, token: res.tokens.accessToken, refreshToken: res.tokens.refreshToken });
            return true;
          } catch {
            await commit(null);
            return false;
          }
        })().finally(() => { inFlight = null; });
      }
      return inFlight;
    });
    return () => api.setUnauthorizedHandler(undefined);
  }, [commit]);

  useEffect(() => {
    (async () => {
      await loadServerUrl();
      setExploredState((await SecureStore.getItemAsync(EXPLORED_KEY).catch(() => null)) === '1');
      const raw = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Session;
          setAuthToken(saved.token);
          sessionRef.current = saved; // lets a 401 below refresh the saved session
          // Make sure the token still works (expired / password changed → log out).
          if (saved.kind === 'patient') await api.me();
          else await api.staffMe();
          await commit(sessionRef.current);
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) await commit(null);
          else {
            // Offline or server down: keep the session, screens will show the error.
            await commit(sessionRef.current);
          }
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (kind: AccountKind, email: string, password: string) => {
    let next: Session;
    if (kind === 'patient') {
      const res = await api.login(email.trim(), password);
      const tokens = requireTokens(res.tokens);
      next = {
        kind, token: tokens.accessToken, refreshToken: tokens.refreshToken,
        name: res.patient.name, email: res.patient.email, role: 'patient'
      };
    } else {
      const res = await api.staffLogin(email.trim(), password, kind);
      const tokens = requireTokens(res.tokens);
      next = {
        kind, token: tokens.accessToken, refreshToken: tokens.refreshToken,
        name: res.user.name, email: res.user.email, role: res.user.role
      };
    }
    await commit(next);
    return next;
  }, [commit]);

  const register = useCallback(async (input: { name: string; email: string; phone: string; password: string }) => {
    const res = await api.register({ ...input, email: input.email.trim() });
    const tokens = requireTokens(res.tokens);
    const next: Session = {
      kind: 'patient', token: tokens.accessToken, refreshToken: tokens.refreshToken,
      name: res.patient.name, email: res.patient.email, role: 'patient'
    };
    await commit(next);
    return next;
  }, [commit]);

  const adoptPatientSession = useCallback(async (res: { patient: PatientProfile; tokens?: { accessToken: string; refreshToken: string } }) => {
    const tokens = requireTokens(res.tokens);
    const next: Session = {
      kind: 'patient', token: tokens.accessToken, refreshToken: tokens.refreshToken,
      name: res.patient.name, email: res.patient.email || '', role: 'patient'
    };
    await commit(next);
    return next;
  }, [commit]);

  const setExplored = useCallback((v: boolean) => {
    setExploredState(v);
    if (v) SecureStore.setItemAsync(EXPLORED_KEY, '1').catch(() => undefined);
    else SecureStore.deleteItemAsync(EXPLORED_KEY).catch(() => undefined);
  }, []);

  const logout = useCallback(async () => {
    // Stop this phone receiving the old account's order pushes, then end the session.
    await unregisterServerPush();
    try { await api.logout(); } catch { /* token may already be invalid */ }
    await commit(null);
  }, [commit]);

  const value = useMemo(
    () => ({ ready, session, login, register, adoptPatientSession, logout, explored, setExplored }),
    [ready, session, login, register, adoptPatientSession, logout, explored, setExplored]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
