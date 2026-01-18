import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { AuthenticationService } from '../utils/auth';
import { migrationService, getStorageItem, setStorageItem, getStorageKey } from '../utils/migration';

// Authentication context
const AuthContext = createContext();

// Authentication actions
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_USER: 'SET_USER',
  SET_ERROR: 'SET_ERROR',
  CLEAR_AUTH: 'CLEAR_AUTH'
};

// Authentication reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload, error: null };
    case AUTH_ACTIONS.SET_USER:
      return { 
        ...state, 
        user: action.payload, 
        isAuthenticated: !!action.payload,
        loading: false,
        error: null
      };
    case AUTH_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    case AUTH_ACTIONS.CLEAR_AUTH:
      return { 
        ...state, 
        user: null, 
        isAuthenticated: false, 
        loading: false, 
        error: null
      };
    default:
      return state;
  }
}

// Initial state
const initialState = {
  user: null,
  isAuthenticated: false,
  loading: true,
  error: null
};

// Authentication provider component
export function AuthProvider({ children, apiCall }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

      // Run migration first if needed
      await runMigrationIfNeeded();

      const savedUser = getStorageItem('user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        
        // Validate user data structure
        if (!user.userId || !user.name || !user.email) {
          console.warn('Invalid user data found, clearing session');
          clearAuth();
          return;
        }
        
        // Normal authenticated state
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: user });
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    } catch (error) {
      console.error('Error initializing authentication state:', error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      clearAuth();
    }
  };

  const runMigrationIfNeeded = async () => {
    try {
      if (!migrationService.isMigrationComplete()) {
        console.log('Running localStorage migration...');
        const result = await migrationService.migrateStorageKeys();
        if (result.success) {
          console.log('Migration completed successfully:', result.message);
          
          // Show user notification about migration
          if (result.migratedKeys && result.migratedKeys.length > 0) {
            console.log(`Migrated ${result.migratedKeys.length} data keys from Moodly to FitMood`);
          }
        } else {
          console.error('Migration failed:', result.errors);
          // Don't block app startup for migration failures
        }
      }
    } catch (error) {
      console.error('Migration error:', error);
      // Don't block app startup for migration errors
    }
  };

  const login = async (credentials) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const authService = new AuthenticationService(apiCall);
      const result = await authService.login(credentials);

      if (result.success) {
        const user = {
          userId: result.userId,
          name: result.name,
          email: result.email,
          phone: result.phone,
          role: result.role
        };
        
        setStorageItem('user', JSON.stringify(user));
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: user });
        return { success: true, user };
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: result.error });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error.message || 'Login failed';
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const register = async (userData) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const authService = new AuthenticationService(apiCall);
      const result = await authService.register(userData);

      if (result.success) {
        const user = {
          userId: result.userId,
          name: result.name,
          email: result.email,
          phone: result.phone,
          role: result.role
        };
        
        setStorageItem('user', JSON.stringify(user));
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: user });
        return { success: true, user };
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: result.error });
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = error.message || 'Registration failed';
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: errorMessage });
      return { success: false, error: errorMessage };
    }
  };

  const requestPasswordReset = async (identifier) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const authService = new AuthenticationService(apiCall);
      const result = await authService.requestPasswordReset(identifier);
      
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return result;
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      return { success: false, error: error.message };
    }
  };

  const resetPassword = async (token, newPassword) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      
      const authService = new AuthenticationService(apiCall);
      const result = await authService.resetPassword(token, newPassword);
      
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return result;
    } catch (error) {
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    clearAuth();
  };

  const clearAuth = () => {
    localStorage.removeItem(getStorageKey('user'));
    dispatch({ type: AUTH_ACTIONS.CLEAR_AUTH });
  };

  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: null });
  };

  const contextValue = {
    ...state,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    logout,
    clearError
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use authentication context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}