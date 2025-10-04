import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Employee, AuthState } from '../types';
import { Database } from '../utils/database';
import { getSupabase } from '../utils/supabaseClient';
import { getSessionUser, signInWithEmailPassword } from '../utils/supabaseAuth';
import { hydrateAllFromSupabase } from '../utils/supabaseSync';
import { subscribeRealtime } from '../utils/supabaseRealtime';

interface AuthContextType {
  state: AuthState;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isManager: () => boolean;
  isEmployee: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; payload: { user: Employee; token: string } }
  | { type: 'LOGOUT' }
  | { type: 'LOAD_USER'; payload: { user: Employee; token: string } }
  | { type: 'SET_LOADING'; payload: boolean };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: false
      };
    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false
      };
    case 'LOAD_USER':
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: false
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };
    default:
      return state;
  }
};

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: true
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const unsubRef = React.useRef<(() => void) | null>(null);

  // Check for existing session on app start (validate token exp, bind user)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Supabase-only auth
        const sb = getSupabase();
        if (sb) {
          const res = await getSessionUser();
          if (res.ok) {
            dispatch({ type: 'LOAD_USER', payload: { user: res.user, token: res.token } });
            try { await hydrateAllFromSupabase(); } catch {}
            try { if (unsubRef.current) { unsubRef.current(); } unsubRef.current = subscribeRealtime(); } catch {}
          } else {
            dispatch({ type: 'SET_LOADING', payload: false });
          }
          return;
        }

        // Supabase is required; if not configured, stay on login screen
        dispatch({ type: 'SET_LOADING', payload: false });
      } catch {
        // Final safety net
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    checkAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const sb = getSupabase();
      if (!sb) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return false;
      }

      const res = await signInWithEmailPassword(username, password);
      if (!res.ok) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return false;
      }
      // Optional: activity log
      try {
        const sb = getSupabase();
        if (sb) {
          await sb.from('activity_logs').insert({ employee_id: res.user.id, action: 'Đăng nhập hệ thống', details: `Nhân viên ${res.user.username} đăng nhập` });
        }
      } catch {}
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: res.user, token: res.sessionToken } });
      try { await hydrateAllFromSupabase(); } catch {}
      try { if (unsubRef.current) { unsubRef.current(); } unsubRef.current = subscribeRealtime(); } catch {}
      return true;
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return false;
    }
  };

  const logout = () => {
    const sb = getSupabase();
    if (sb) {
      try { sb.auth.signOut(); } catch {}
    }
    try { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; } } catch {}
    if (state.user) {
      try {
        const sb = getSupabase();
        if (sb) {
          sb.from('activity_logs').insert({ employee_id: state.user.id, action: 'Đăng xuất hệ thống', details: `Nhân viên ${state.user.username} đăng xuất` });
        }
      } catch {}
    }
    dispatch({ type: 'LOGOUT' });
  };

  // removed setRole; role changes are now managed via SQL/admin

  // Idle timeout with rolling refresh (30 minutes)
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const sb = getSupabase();
    if (sb) {
      // Supabase handles token rotation; no custom idle refresh
      return;
    }

    let lastRefreshAt = 0;
    let intervalId: number | undefined;
    const IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    const MIN_REFRESH_GAP_MS = 60 * 1000; // don't refresh more than once per minute

    const refreshTokenIfNeeded = async (_force: boolean = false) => {
      // Local token flow removed; nothing to refresh when Supabase is disabled
      return;
    };

    const activity = () => {
      refreshTokenIfNeeded(true);
    };

    window.addEventListener('mousemove', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('click', activity);
    window.addEventListener('touchstart', activity);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') activity();
    });

    intervalId = window.setInterval(() => {
      // periodic check for expiry
      refreshTokenIfNeeded(false);
    }, 60 * 1000);

    return () => {
      window.removeEventListener('mousemove', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('click', activity);
      window.removeEventListener('touchstart', activity);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [state.isAuthenticated]);

  // Live-refresh current user's role from Supabase when their employees row changes
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !state.user?.id) return;

    const channel = sb
      .channel('realtime:self-role')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees', filter: `id=eq.${state.user.id}` },
        async () => {
          try {
            const res = await getSessionUser();
            if (res.ok) {
              dispatch({ type: 'LOAD_USER', payload: { user: res.user, token: res.token } });
            }
          } catch {}
        }
      )
      .subscribe();

    return () => {
      try { channel.unsubscribe(); } catch {}
    };
  }, [state.user?.id]);

  const isManager = (): boolean => {
    return state.user?.role === 'MANAGER';
  };

  const isEmployee = (): boolean => {
    return state.user?.role === 'EMPLOYEE';
  };

  const value: AuthContextType = {
    state,
    login,
    logout,
    isManager,
    isEmployee,
    
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

