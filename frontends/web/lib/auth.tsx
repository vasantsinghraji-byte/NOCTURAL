'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { PatientProfile, RegisterPatientInput } from '@medrush/shared';

interface AuthContextValue {
  patient: PatientProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterPatientInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.me();
      setPatient(res.patient);
    } catch {
      setPatient(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setPatient(res.patient);
  }, []);

  const register = useCallback(async (input: RegisterPatientInput) => {
    const res = await api.register(input);
    setPatient(res.patient);
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setPatient(null);
  }, []);

  return (
    <AuthContext.Provider value={{ patient, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
