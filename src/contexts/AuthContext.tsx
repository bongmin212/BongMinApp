import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Employee, AuthState } from '../types';
import { Database } from '../utils/database';

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

  // Check for existing session on app start (validate token exp, bind user)
  useEffect(() => {
    const checkAuth = async () => {
      Database.initializeDefaultData();
      const rawToken = Database.getAuthToken();
      if (rawToken) {
        try {
          const { parseAppToken } = await import('../utils/auth');
          const parsed = parseAppToken(rawToken);
          if (!parsed) {
            Database.clearAuthToken();
            dispatch({ type: 'LOGOUT' });
            return;
          }
          const employees = Database.getEmployees();
          const current = parsed.uid ? employees.find(e => e.id === parsed.uid) : undefined;
          if (current) {
            dispatch({ type: 'LOAD_USER', payload: { user: current, token: rawToken } });
          } else {
            Database.clearAuthToken();
            dispatch({ type: 'LOGOUT' });
          }
        } catch (error) {
          Database.clearAuthToken();
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    checkAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const inputUsername = username.trim();
      const inputPassword = password;

      // Throttling đơn giản: 5 lần trong 30s theo username
      const key = 'bongmin_login_attempts';
      const now = Date.now();
      const windowMs = 30000;
      const limit = 5;
      const raw = localStorage.getItem(key);
      const arr = raw ? (JSON.parse(raw) as Array<{ u: string; t: number }>) : [];
      const recent = arr.filter(x => now - x.t < windowMs && x.u === inputUsername);
      if (recent.length >= limit) {
        dispatch({ type: 'SET_LOADING', payload: false });
        return false;
      }

      const employees = Database.getEmployees();
      const employee = employees.find(e => e.username === inputUsername);
      if (!employee) {
        localStorage.setItem(key, JSON.stringify([...recent, { u: inputUsername, t: now }]));
        dispatch({ type: 'SET_LOADING', payload: false });
        return false;
      }

      const { verifyPassword, serializePasswordRecord, createPasswordRecord, createAppToken } = await import('../utils/auth');
      const result = await verifyPassword(inputPassword, employee.passwordHash);
      if (!result.ok) {
        localStorage.setItem(key, JSON.stringify([...recent, { u: inputUsername, t: now }]));
        dispatch({ type: 'SET_LOADING', payload: false });
        return false;
      }

      // Auto-upgrade legacy plaintext to PBKDF2
      if (result.upgraded) {
        const upgradedStr = serializePasswordRecord(result.upgraded);
        Database.updateEmployee(employee.id, { passwordHash: upgradedStr });
      }

      const token = createAppToken({ uid: employee.id });
      Database.setAuthToken(token);

      Database.saveActivityLog({
        employeeId: employee.id,
        action: 'Đăng nhập hệ thống',
        details: `Nhân viên ${employee.username} đăng nhập`
      });

      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: employee, token } });
      return true;
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return false;
    }
  };

  const logout = () => {
    if (state.user) {
      // Log activity
      Database.saveActivityLog({
        employeeId: state.user.id,
        action: 'Đăng xuất hệ thống',
        details: `Nhân viên ${state.user.username} đăng xuất`
      });
    }
    
    Database.clearAuthToken();
    dispatch({ type: 'LOGOUT' });
  };

  // Idle timeout with rolling refresh (30 minutes)
  useEffect(() => {
    if (!state.isAuthenticated) return;

    let lastRefreshAt = 0;
    let intervalId: number | undefined;
    const IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    const MIN_REFRESH_GAP_MS = 60 * 1000; // don't refresh more than once per minute

    const refreshTokenIfNeeded = async (force: boolean = false) => {
      try {
        const rawToken = Database.getAuthToken();
        const { parseAppToken, createAppToken } = await import('../utils/auth');
        const parsed = parseAppToken(rawToken);
        const now = Date.now();
        if (!parsed) {
          logout();
          return;
        }
        const timeLeft = parsed.exp - now;
        if (force || timeLeft < IDLE_TTL_MS / 2) {
          if (!force && now - lastRefreshAt < MIN_REFRESH_GAP_MS) return;
          lastRefreshAt = now;
          const newTok = createAppToken({ uid: parsed.uid, ttlMs: IDLE_TTL_MS });
          Database.setAuthToken(newTok);
        }
      } catch {
        logout();
      }
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
    isEmployee
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

