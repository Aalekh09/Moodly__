import React, { useState, useEffect } from 'react';
import { 
  Home, TrendingUp, User, Users, Calendar, Activity, 
  MessageCircle, LogOut, Menu, X, Smile, Frown, Meh,
  Sun, Moon, Cloud, ChevronRight, Award, Target, Heart,
  BarChart3, Clock, AlertCircle, CheckCircle2, Wifi, WifiOff,
  Settings, Bell, BellOff, Sparkles, CheckCircle, Circle, Lock,
  Eye, EyeOff, Shield, Key, Phone
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { initDB, saveMoodOffline, getMoodsOffline, syncOfflineData, saveSetting, getSetting } from './utils/offlineStorage';
import { requestNotificationPermission, scheduleDailyReminder, showNotification, cancelReminders, isNotificationSupported } from './utils/notifications';
import { getRecommendations, getRandomActivity, getAllActivities } from './utils/moodRecommendations';
import { getCustomEmojis, saveCustomEmojis, getEmojiPresets, applyPreset, resetToDefault } from './utils/customEmojis';
import { getUserHabits, saveUserHabits, logHabit, unlogHabit, getHabitStats, getStreak, isHabitLoggedToday, getDefaultHabits } from './utils/habits';
import { AuthenticationService, validatePassword, getIdentifierType } from './utils/auth';
import { migrationService, getStorageItem, setStorageItem, getStorageKey } from './utils/migration';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ContactDisplay from './components/ContactDisplay';
import MigrationNotification, { MigrationStatusIndicator } from './components/MigrationNotification';
import PasswordSetupPrompt from './components/PasswordSetupPrompt';

// ========================================
// CONFIGURATION
// ========================================
const API_URL = 'https://script.google.com/macros/s/AKfycby7AbX2wTwcGXZE9u5sWFTa6eHn5YCzsk9wCNewL6IXzGATd2BgbsH0O_2mMLSisMC6/exec'; // Replace with your new Apps Script Web App URL

// ========================================
// API HELPER FUNCTION WITH OFFLINE SUPPORT AND AUTH HANDLING
// ========================================
async function apiCall(action, payload = {}) {
  // Check if offline
  if (!navigator.onLine) {
    // For mood entries, save offline
    if (action === 'addMood') {
      await saveMoodOffline(payload);
      return { success: true, offline: true };
    }
    throw new Error('You are offline. Your data will sync when you reconnect.');
  }

  try {
    const body = JSON.stringify({
      action,
      ...payload
    });

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: body
    });

    const text = await response.text();
    const result = JSON.parse(text);
    
    // Handle authentication errors
    if (result.error) {
      // Check for authentication-related errors
      if (result.error.includes('Invalid login credentials') || 
          result.error.includes('Unauthorized') ||
          result.error.includes('Session expired')) {
        // Trigger logout for authentication errors
        console.warn('Authentication error detected:', result.error);
        // Don't automatically logout here as it might cause loops
        // Let the calling component handle it
      }
      throw new Error(result.error);
    }

    // Sync offline data after successful API call
    if (action === 'addMood' || action === 'getUserMoods') {
      syncOfflineData(apiCall).catch(err => console.log('Sync error:', err));
    }

    return result;

  } catch (err) {
    console.error('API Error Details:', err);
    // If offline and it's a mood entry, save offline
    if (!navigator.onLine && action === 'addMood') {
      await saveMoodOffline(payload);
      return { success: true, offline: true };
    }
    throw err;
  }
}


// ========================================
// MAIN APP WRAPPER WITH AUTH PROVIDER
// ========================================
export default function App() {
  return (
    <AuthProvider apiCall={apiCall}>
      <FitMoodApp />
    </AuthProvider>
  );
}

// ========================================
// MAIN APP COMPONENT WITH DARK MODE & OFFLINE
// ========================================
function FitMoodApp() {
  const { 
    user: currentUser, 
    isAuthenticated, 
    loading: authLoading, 
    needsPasswordSetup,
    logout 
  } = useAuth();
  
  const [currentPage, setCurrentPage] = useState('splash');
  const [loading, setLoading] = useState(false);
  const [moodHistory, setMoodHistory] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Initialize dark mode and offline storage
  useEffect(() => {
    // Initialize IndexedDB
    initDB().catch(err => console.error('DB init error:', err));
    
    // Check dark mode preference
    const savedTheme = getStorageItem('dark_mode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme ? savedTheme === 'true' : prefersDark;
    setDarkMode(shouldBeDark);
    updateTheme(shouldBeDark);

    // Monitor online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle authentication state changes
  useEffect(() => {
    if (authLoading) {
      return; // Wait for auth to initialize
    }

    if (needsPasswordSetup) {
      setCurrentPage('password-setup');
    } else if (isAuthenticated && currentUser) {
      if (currentPage === 'splash' || currentPage === 'auth' || currentPage === 'password-setup') {
        setCurrentPage('home');
        loadUserData(currentUser.userId);
      }
    } else {
      if (currentPage !== 'splash') {
        setCurrentPage('splash');
      }
    }
  }, [isAuthenticated, currentUser, needsPasswordSetup, authLoading]);

  const updateTheme = (isDark) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    setStorageItem('dark_mode', newMode.toString());
    updateTheme(newMode);
  };

  const loadUserData = async (userId) => {
    try {
      // Try online first, fallback to offline
      let moods = [];
      let stats = null;

      if (navigator.onLine) {
        try {
          const moodsResult = await apiCall('getUserMoods', { userId });
          const statsResult = await apiCall('getUserStats', { userId });
          moods = moodsResult.moods || [];
          stats = statsResult.stats || null;
        } catch (error) {
          console.log('Online fetch failed, trying offline...');
        }
      }

      // Load from offline storage
      const offlineMoods = await getMoodsOffline(userId);
      if (offlineMoods.length > 0) {
        moods = [...moods, ...offlineMoods].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      setMoodHistory(moods);
      setUserStats(stats);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // Show loading screen while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 via-pink-500 to-orange-500 flex items-center justify-center">
        <div className="text-center">
          <div className="text-7xl mb-4">😊</div>
          <div className="text-white text-xl font-semibold">Loading FitMood...</div>
        </div>
      </div>
    );
  }

  if (currentPage === 'splash') {
    return <LandingPage setCurrentPage={setCurrentPage} />;
  }

  if (currentPage === 'auth') {
    return <AuthPage setCurrentPage={setCurrentPage} />;
  }

  if (currentPage === 'password-setup') {
    return <PasswordSetupPage setCurrentPage={setCurrentPage} />;
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200`}>
      {/* Password Setup Prompt */}
      {needsPasswordSetup && <PasswordSetupPrompt />}
      
      {/* Migration Notification */}
      <MigrationNotification />
      
      {/* Migration Status Indicator (development only) */}
      <MigrationStatusIndicator />
      
      {/* Online/Offline Indicator */}
      {!isOnline && (
        <div className="bg-yellow-500 dark:bg-yellow-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff size={16} />
          <span className="text-sm">You're offline. Changes will sync when you reconnect.</span>
        </div>
      )}

      <Navigation 
        currentUser={currentUser} 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage}
        logout={logout}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        isOnline={isOnline}
      />
      
      <div className="pb-20">
        {currentPage === 'home' && (
          <HomePage 
            currentUser={currentUser} 
            moodHistory={moodHistory}
            loadUserData={loadUserData}
            userStats={userStats}
            darkMode={darkMode}
            setCurrentPage={setCurrentPage}
          />
        )}
        {currentPage === 'analytics' && (
          <AnalyticsPage userStats={userStats} moodHistory={moodHistory} darkMode={darkMode} />
        )}
        {currentPage === 'ai-chat' && (
          <AIChatPage currentUser={currentUser} darkMode={darkMode} />
        )}
        {currentPage === 'habits' && (
          <HabitsPage currentUser={currentUser} darkMode={darkMode} />
        )}
        {currentPage === 'profile' && (
          <ProfilePage 
            currentUser={currentUser} 
            userStats={userStats} 
            logout={logout}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
          />
        )}
        {currentPage === 'contact' && (
          <ContactDisplay darkMode={darkMode} />
        )}
        {currentPage === 'admin' && currentUser?.role === 'admin' && (
          <AdminPage currentUser={currentUser} allUsers={allUsers} setAllUsers={setAllUsers} darkMode={darkMode} />
        )}
      </div>
    </div>
  );
}

// ========================================
// ENHANCED AUTH PAGE WITH ANIMATIONS
// ========================================
function AuthPage({ setCurrentPage }) {
  const { login, register, error, loading, clearError } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showContent, setShowContent] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    setTimeout(() => setShowContent(true), 100);
  }, [isLogin]);

  // Password validation effect
  useEffect(() => {
    if (formData.password && !isLogin) {
      const validation = validatePassword(formData.password);
      setPasswordStrength(validation.strength);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordStrength(0);
      setPasswordErrors([]);
    }
  }, [formData.password, isLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    try {
      if (isLogin) {
        // Login flow
        const identifierType = getIdentifierType(formData.email || formData.phone);
        const identifier = formData.email || formData.phone;
        
        if (identifierType === 'unknown') {
          return; // Error will be handled by context
        }

        const result = await login({
          identifier: identifier,
          password: formData.password
        });

        if (result.success) {
          // Navigation will be handled by useEffect in FitMoodApp
        }
      } else {
        // Registration flow
        if (formData.password !== formData.confirmPassword) {
          return; // Let validation handle this
        }

        const validation = validatePassword(formData.password);
        if (!validation.isValid) {
          return; // Let validation handle this
        }

        const result = await register({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password
        });

        if (result.success) {
          // Navigation will be handled by useEffect in FitMoodApp
        }
      }
    } catch (err) {
      console.error('Authentication error:', err);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
    setPasswordStrength(0);
    setPasswordErrors([]);
    setShowForgotPassword(false);
    setResetSuccess(false);
    setShowContent(false);
    setTimeout(() => setShowContent(true), 100);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const authService = new AuthenticationService(apiCall);
      const result = await authService.requestPasswordReset(resetEmail);

      if (result.success) {
        setResetSuccess(true);
      } else {
        setError(result.error || 'Password reset request failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 via-pink-500 to-orange-500 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Floating Emojis */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="floating-emoji" style={{ left: '15%', top: '25%', animationDelay: '0s' }}>😊</div>
        <div className="floating-emoji" style={{ left: '85%', top: '35%', animationDelay: '1.5s' }}>✨</div>
        <div className="floating-emoji" style={{ left: '20%', top: '70%', animationDelay: '2s' }}>🌟</div>
        <div className="floating-emoji" style={{ left: '75%', top: '75%', animationDelay: '0.5s' }}>💫</div>
      </div>

      <div className={`relative z-10 w-full max-w-md transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        {/* Main Card */}
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
          {/* Header Section */}
          <div className="text-center mb-8 animate-fade-in-up">
            <div className="relative inline-block mb-4">
              <div className="text-7xl emoji-glow">😊</div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-lg animate-bounce-slow">
                ⭐
              </div>
            </div>
            <h2 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
              {isLogin ? 'Welcome Back!' : 'Join FitMood'}
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              {isLogin ? 'Login to continue your journey' : 'Create your account and start tracking'}
            </p>
          </div>

          {/* Toggle Buttons */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6 animate-fade-in-up-delay">
            <button
              onClick={() => !isLogin && toggleMode()}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-300 ${
                isLogin
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => isLogin && toggleMode()}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-300 ${
                !isLogin
                  ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up-delay-2">
            {!isLogin && (
              <div className="relative group">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                  focusedField === 'name' ? 'text-indigo-500 dark:text-indigo-400' : ''
                }`}>
                  <User size={20} />
                </div>
                <input
                  type="text"
                  placeholder="Full Name"
                  className={`w-full pl-12 pr-4 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                    focusedField === 'name'
                      ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } focus:outline-none`}
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  required
                />
              </div>
            )}
            
            <div className="relative group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                focusedField === 'email' ? 'text-indigo-500 dark:text-indigo-400' : ''
              }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input
                type={isLogin ? "text" : "email"}
                placeholder={isLogin ? "Email or Phone Number" : "Email Address"}
                className={`w-full pl-12 pr-4 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                  focusedField === 'email'
                    ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } focus:outline-none`}
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                required
              />
            </div>
            
            {/* Phone Field (Registration only) */}
            {!isLogin && (
              <div className="relative group">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                  focusedField === 'phone' ? 'text-indigo-500 dark:text-indigo-400' : ''
                }`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  className={`w-full pl-12 pr-4 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                    focusedField === 'phone'
                      ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } focus:outline-none`}
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  required
                />
              </div>
            )}

            {/* Password Field */}
            <div className="relative group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                focusedField === 'password' ? 'text-indigo-500 dark:text-indigo-400' : ''
              }`}>
                <Lock size={20} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className={`w-full pl-12 pr-12 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                  focusedField === 'password'
                    ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } focus:outline-none`}
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Password Strength Indicator (Registration only) */}
            {!isLogin && formData.password && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Password Strength</span>
                  <span className={`font-medium ${
                    passwordStrength >= 80 ? 'text-green-600 dark:text-green-400' :
                    passwordStrength >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                    passwordStrength >= 40 ? 'text-orange-600 dark:text-orange-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {passwordStrength >= 80 ? 'Strong' :
                     passwordStrength >= 60 ? 'Good' :
                     passwordStrength >= 40 ? 'Fair' : 'Weak'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      passwordStrength >= 80 ? 'bg-green-500' :
                      passwordStrength >= 60 ? 'bg-yellow-500' :
                      passwordStrength >= 40 ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${passwordStrength}%` }}
                  ></div>
                </div>
                {passwordErrors.length > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                    {passwordErrors.map((error, index) => (
                      <div key={index} className="flex items-center gap-1">
                        <span>•</span>
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Confirm Password Field (Registration only) */}
            {!isLogin && (
              <div className="relative group">
                <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                  focusedField === 'confirmPassword' ? 'text-indigo-500 dark:text-indigo-400' : ''
                }`}>
                  <Shield size={20} />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm Password"
                  className={`w-full pl-12 pr-12 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                    focusedField === 'confirmPassword'
                      ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } focus:outline-none`}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <div className="absolute -bottom-6 left-0 text-xs text-red-600 dark:text-red-400">
                    Passwords do not match
                  </div>
                )}
              </div>
            )}

            {/* Forgot Password Link (Login only) */}
            {isLogin && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm flex items-center gap-2 animate-fade-in-up">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-orange-500 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Please wait...</span>
                  </>
                ) : (
                  <>
                    {isLogin ? (
                      <>
                        <span>Login</span>
                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    ) : (
                      <>
                        <span>Create Account</span>
                        <CheckCircle size={20} />
                      </>
                    )}
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Toggle Link */}
          <div className="text-center mt-6 animate-fade-in-up-delay-3">
            <button
              onClick={toggleMode}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
            >
              {isLogin ? (
                <>
                  Don't have an account? <span className="font-bold">Sign Up</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="font-bold">Login</span>
                </>
              )}
            </button>
          </div>

          {/* Features Preview */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 animate-fade-in-up-delay-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl mb-1">📊</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Track Moods</div>
              </div>
              <div>
                <div className="text-2xl mb-1">💡</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Get Insights</div>
              </div>
              <div>
                <div className="text-2xl mb-1">🎯</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Build Habits</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-xs text-gray-500 dark:text-gray-400">
            <p>Powered by SAHA</p>
            <p className="mt-1">Developed by AALEKH KUMAR</p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🔑</div>
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                {resetSuccess ? 'Check Your Email' : 'Reset Password'}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {resetSuccess 
                  ? 'We\'ve sent password reset instructions to your email address.'
                  : 'Enter your email address or phone number and we\'ll send you a link to reset your password.'
                }
              </p>
            </div>

            {!resetSuccess ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Email or Phone Number"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none transition-colors"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetEmail('');
                      setError('');
                      setResetSuccess(false);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Sending...</span>
                      </div>
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 p-4 rounded-xl text-center">
                  <CheckCircle size={20} className="mx-auto mb-2" />
                  <p className="text-sm">
                    If an account exists with that email or phone number, you'll receive reset instructions shortly.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmail('');
                    setError('');
                    setResetSuccess(false);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                >
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// PASSWORD SETUP PAGE FOR EXISTING USERS
// ========================================
function PasswordSetupPage({ setCurrentPage }) {
  const { setupPassword, skipPasswordSetup, error, loading, clearError } = useAuth();
  
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [showContent, setShowContent] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setTimeout(() => setShowContent(true), 100);
  }, []);

  // Password validation effect
  useEffect(() => {
    if (formData.password) {
      const validation = validatePassword(formData.password);
      setPasswordStrength(validation.strength);
      setPasswordErrors(validation.errors);
    } else {
      setPasswordStrength(0);
      setPasswordErrors([]);
    }
  }, [formData.password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (formData.password !== formData.confirmPassword) {
      return; // Let validation handle this
    }

    const validation = validatePassword(formData.password);
    if (!validation.isValid) {
      return; // Let validation handle this
    }

    const result = await setupPassword(formData.password);
    if (result.success) {
      // Navigation will be handled by useEffect in FitMoodApp
    }
  };

  const handleSkip = () => {
    skipPasswordSetup();
    // Navigation will be handled by useEffect in FitMoodApp
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 via-pink-500 to-orange-500 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className={`relative z-10 w-full max-w-md transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
          {/* Header Section */}
          <div className="text-center mb-8 animate-fade-in-up">
            <div className="relative inline-block mb-4">
              <div className="text-7xl emoji-glow">🔐</div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-lg animate-bounce-slow">
                ⚡
              </div>
            </div>
            <h2 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
              Secure Your Account
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              Set up a password to keep your FitMood data safe
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up-delay">
            {/* Password Field */}
            <div className="relative group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                focusedField === 'password' ? 'text-indigo-500 dark:text-indigo-400' : ''
              }`}>
                <Lock size={20} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create Password"
                className={`w-full pl-12 pr-12 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                  focusedField === 'password'
                    ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } focus:outline-none`}
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Password Strength</span>
                  <span className={`font-medium ${
                    passwordStrength >= 80 ? 'text-green-600 dark:text-green-400' :
                    passwordStrength >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                    passwordStrength >= 40 ? 'text-orange-600 dark:text-orange-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {passwordStrength >= 80 ? 'Strong' :
                     passwordStrength >= 60 ? 'Good' :
                     passwordStrength >= 40 ? 'Fair' : 'Weak'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      passwordStrength >= 80 ? 'bg-green-500' :
                      passwordStrength >= 60 ? 'bg-yellow-500' :
                      passwordStrength >= 40 ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${passwordStrength}%` }}
                  ></div>
                </div>
                {passwordErrors.length > 0 && (
                  <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                    {passwordErrors.map((error, index) => (
                      <div key={index} className="flex items-center gap-1">
                        <span>•</span>
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Confirm Password Field */}
            <div className="relative group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                focusedField === 'confirmPassword' ? 'text-indigo-500 dark:text-indigo-400' : ''
              }`}>
                <Shield size={20} />
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                className={`w-full pl-12 pr-12 py-4 rounded-xl border-2 transition-all duration-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                  focusedField === 'confirmPassword'
                    ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } focus:outline-none`}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                onFocus={() => setFocusedField('confirmPassword')}
                onBlur={() => setFocusedField(null)}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <div className="absolute -bottom-6 left-0 text-xs text-red-600 dark:text-red-400">
                  Passwords do not match
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm flex items-center gap-2 animate-fade-in-up">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-orange-500 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Setting up...</span>
                  </>
                ) : (
                  <>
                    <span>Secure My Account</span>
                    <Shield size={20} />
                  </>
                )}
              </span>
            </button>

            {/* Skip Button */}
            <button
              type="button"
              onClick={handleSkip}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 py-3 text-sm transition-colors"
            >
              Skip for now (not recommended)
            </button>
          </form>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                <Shield size={16} />
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">Why set up a password?</p>
                <p>Passwords protect your mood data and enable secure sync across devices. You can always add one later in settings.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// HOME PAGE WITH ENHANCED LAYOUT
// ========================================
function HomePage({ currentUser, moodHistory, loadUserData, userStats, darkMode, setCurrentPage }) {
  const [showMoodEntry, setShowMoodEntry] = useState(false);
  const [recommendations, setRecommendations] = useState(null);

  // Get recommendations based on latest mood
  useEffect(() => {
    if (moodHistory.length > 0 && userStats?.avgMood) {
      const latestMood = moodHistory[0];
      const recs = getRecommendations(latestMood.moodLevel || userStats.avgMood);
      setRecommendations(recs);
    }
  }, [moodHistory, userStats]);

  const currentStreak = () => {
    if (moodHistory.length === 0) return 0;
    let streak = 0;
    const today = new Date().toDateString();
    for (let i = 0; i < moodHistory.length; i++) {
      const entryDate = new Date(moodHistory[i].timestamp).toDateString();
      if (entryDate === today || i === 0) {
        streak++;
        if (i > 0) {
          const prevDate = new Date(moodHistory[i - 1].timestamp);
          const currDate = new Date(moodHistory[i].timestamp);
          const daysDiff = Math.floor((prevDate - currDate) / (1000 * 60 * 60 * 24));
          if (daysDiff > 1) break;
        }
      } else break;
    }
    return streak;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Enhanced Header */}
      <div className={`bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-600 dark:via-purple-600 dark:to-pink-600 rounded-3xl p-6 text-white mb-6 shadow-xl`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold mb-1">Hello, {currentUser?.name}! 👋</h1>
            <p className="text-white/90 text-sm">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          {currentStreak() > 0 && (
            <div className="text-center bg-white/20 rounded-xl px-4 py-2">
              <div className="text-2xl font-bold">{currentStreak()}</div>
              <div className="text-xs">Day Streak 🔥</div>
            </div>
          )}
        </div>
        <p className="text-white/90 mt-2">How are you feeling today?</p>
      </div>

      {!showMoodEntry ? (
        <button
          onClick={() => setShowMoodEntry(true)}
          className="w-full bg-white rounded-2xl shadow-lg p-6 mb-6 hover:shadow-xl transition"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-4xl">📝</div>
              <div className="text-left">
                <h3 className="font-semibold text-lg">Log Your Mood</h3>
                <p className="text-gray-600 text-sm">Quick check-in</p>
              </div>
            </div>
            <ChevronRight className="text-gray-400" />
          </div>
        </button>
      ) : (
        <MoodEntryForm 
          currentUser={currentUser} 
          onClose={() => setShowMoodEntry(false)}
          onSuccess={() => {
            setShowMoodEntry(false);
            loadUserData(currentUser.userId);
          }}
        />
      )}

      {/* Enhanced Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-gray-100 dark:border-gray-700">
          <div className="text-indigo-600 dark:text-indigo-400 mb-2"><Activity size={24} /></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{userStats?.totalEntries || 0}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Entries</div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-gray-100 dark:border-gray-700">
          <div className="text-purple-600 dark:text-purple-400 mb-2"><TrendingUp size={24} /></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{userStats?.avgMood ? userStats.avgMood.toFixed(1) : '0.0'}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Average Mood</div>
        </div>
      </div>

      {/* Quick Habits Preview */}
      {currentUser && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-lg p-6 mb-6 border border-green-100 dark:border-green-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="text-green-600 dark:text-green-400" size={20} />
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Today's Habits</h3>
            </div>
            <button
              onClick={() => setCurrentPage('habits')}
              className="text-sm text-green-600 dark:text-green-400 hover:underline"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {getUserHabits(currentUser.userId)
              .filter(h => h.enabled)
              .slice(0, 4)
              .map(habit => {
                const logged = isHabitLoggedToday(currentUser.userId, habit.id);
                return (
                  <button
                    key={habit.id}
                    onClick={() => {
                      if (logged) {
                        unlogHabit(currentUser.userId, habit.id);
                      } else {
                        logHabit(currentUser.userId, habit.id);
                      }
                      loadUserData(currentUser.userId);
                    }}
                    className={`p-3 rounded-xl transition ${
                      logged
                        ? 'bg-green-500 text-white shadow-md'
                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="text-2xl mb-1">{habit.icon}</div>
                    <div className={`text-xs ${logged ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                      {habit.name}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Mood-Based Recommendations */}
      {recommendations && moodHistory.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl shadow-lg p-6 mb-6 border border-indigo-100 dark:border-indigo-800">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-indigo-600 dark:text-indigo-400" size={20} />
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Personalized Recommendations</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Based on your recent mood, here are some activities that might help:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recommendations.activities.slice(0, 4).map((activity, idx) => (
              <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl p-3 text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-indigo-500">•</span>
                <span>{activity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Recent Moods */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Recent Moods</h3>
          {moodHistory.length > 5 && (
            <button className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
              View All
            </button>
          )}
        </div>
        {moodHistory.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">📝</div>
            <p className="text-gray-500 dark:text-gray-400 mb-2">No mood entries yet.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">Start tracking your emotions!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {moodHistory.slice(0, 5).map((mood, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                <div className="text-4xl">{mood.moodEmoji || '😐'}</div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">{mood.notes || 'No notes'}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(mood.timestamp).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </div>
                  {mood.triggers && (
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                      Triggers: {mood.triggers}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-gray-400 py-4">
        <p>Powered by SAHA | Developed by AALEKH KUMAR</p>
      </div>
    </div>
  );
}

// ========================================
// MOOD ENTRY FORM WITH CUSTOM EMOJIS
// ========================================
function MoodEntryForm({ currentUser, onClose, onSuccess }) {
  const [moodLevel, setMoodLevel] = useState(3);
  const [notes, setNotes] = useState('');
  const [triggers, setTriggers] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [customEmojis, setCustomEmojis] = useState(() => getCustomEmojis(currentUser?.userId));
  const [tempEmojis, setTempEmojis] = useState(customEmojis);

  const moodLabels = ['Very Sad', 'Sad', 'Neutral', 'Good', 'Very Happy'];
  const emojiPresets = getEmojiPresets();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const moodEmoji = customEmojis[moodLevel - 1];
      const result = await apiCall('addMood', {
        userId: currentUser.userId,
        moodLevel: moodLevel,
        notes: notes,
        triggers: triggers,
        moodEmoji: moodEmoji
      });

      if (result.success) {
        // Get mood-based recommendation
        const recs = getRecommendations(moodLevel);
        const randomActivity = getRandomActivity(moodLevel);
        setSuggestion(randomActivity);
        setTimeout(() => onSuccess(), 2000);
      }
    } catch (error) {
      alert('Error saving mood: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmojiChange = (index, emoji) => {
    const newEmojis = [...tempEmojis];
    newEmojis[index] = emoji;
    setTempEmojis(newEmojis);
  };

  const handleSaveEmojis = () => {
    if (saveCustomEmojis(currentUser.userId, tempEmojis)) {
      setCustomEmojis([...tempEmojis]);
      setShowEmojiPicker(false);
    }
  };

  const applyEmojiPreset = (presetName) => {
    const preset = applyPreset(currentUser.userId, presetName);
    if (preset) {
      setTempEmojis([...preset]);
      setCustomEmojis([...preset]);
    }
  };

  if (suggestion) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="text-center">
          <div className="text-6xl mb-4">✨</div>
          <h3 className="font-semibold text-xl mb-2">Mood Saved!</h3>
          <div className="bg-indigo-50 p-4 rounded-xl mb-4">
            <p className="text-sm text-gray-600 mb-2">Suggested Activity:</p>
            <p className="font-medium text-indigo-600">{suggestion}</p>
          </div>
          <CheckCircle2 className="text-green-500 mx-auto" size={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-xl text-gray-900 dark:text-white">Log Your Mood</h3>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          <X size={24} />
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-900 dark:text-white">How are you feeling?</label>
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Customize Emojis
          </button>
        </div>
        
        {showEmojiPicker && (
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Choose emoji for each mood level:</p>
            <div className="space-y-2 mb-3">
              {tempEmojis.map((emoji, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300 w-20">{moodLabels[idx]}:</span>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => handleEmojiChange(idx, e.target.value)}
                    className="text-2xl w-16 text-center bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600"
                    maxLength={2}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <span className="text-xs text-gray-600 dark:text-gray-300">Presets:</span>
              {Object.keys(emojiPresets).map(preset => (
                <button
                  key={preset}
                  onClick={() => applyEmojiPreset(preset)}
                  className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEmojis}
                className="flex-1 px-3 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setTempEmojis([...customEmojis]);
                  setShowEmojiPicker(false);
                }}
                className="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2">
          {customEmojis.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => setMoodLevel(idx + 1)}
              className={`flex-1 p-4 rounded-xl transition ${
                moodLevel === idx + 1
                  ? 'bg-indigo-500 dark:bg-indigo-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-3xl mb-1">{emoji}</div>
              <div className="text-xs text-gray-700 dark:text-gray-300">{moodLabels[idx]}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">Notes (Optional)</label>
        <textarea
          className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none"
          rows="3"
          placeholder="What's on your mind?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">Triggers (Optional)</label>
        <input
          type="text"
          className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none"
          placeholder="e.g., work, relationships, health"
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save Mood'}
      </button>
    </div>
  );
}

// ========================================
// ANALYTICS PAGE WITH ENHANCED CHARTS
// ========================================
function AnalyticsPage({ userStats, moodHistory, darkMode }) {
  if (!userStats || moodHistory.length === 0) {
    return (
      <div className="p-4 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 text-center border border-gray-100 dark:border-gray-700">
          <BarChart3 className="mx-auto text-gray-400 dark:text-gray-500 mb-4" size={64} />
          <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">No Data Yet</h3>
          <p className="text-gray-600 dark:text-gray-400">Start logging your moods to see analytics!</p>
        </div>
      </div>
    );
  }

  // Enhanced chart data
  const chartData = (userStats.recentMoods || []).slice(-30).map(m => ({
    date: new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    mood: m.level,
    fullDate: m.date
  }));

  const moodDistData = Object.entries(userStats.moodDistribution || {}).map(([level, count]) => ({
    mood: ['😢', '😟', '😐', '🙂', '😊'][parseInt(level) - 1] || '😐',
    count: count,
    level: parseInt(level)
  }));

  // Weekly trend data
  const weeklyData = [];
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toDateString();
  });

  last7Days.forEach(day => {
    const dayMoods = moodHistory.filter(m => new Date(m.timestamp).toDateString() === day);
    const avgMood = dayMoods.length > 0 
      ? dayMoods.reduce((sum, m) => sum + (m.moodLevel || 3), 0) / dayMoods.length 
      : null;
    weeklyData.push({
      day: new Date(day).toLocaleDateString('en-US', { weekday: 'short' }),
      mood: avgMood ? parseFloat(avgMood.toFixed(1)) : null
    });
  });

  const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6'];

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Your Analytics</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="text-3xl font-bold">{userStats.totalEntries || 0}</div>
          <div className="text-sm opacity-90">Total Entries</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="text-3xl font-bold">{userStats.avgMood ? userStats.avgMood.toFixed(1) : '0.0'}</div>
          <div className="text-sm opacity-90">Average Mood</div>
        </div>
      </div>

      {/* Enhanced Line Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">Mood Trend (Last 30 Days)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
            <XAxis dataKey="date" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
            <YAxis domain={[0, 5]} stroke={darkMode ? '#9ca3af' : '#6b7280'} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                border: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="mood" 
              stroke="#6366f1" 
              fillOpacity={1} 
              fill="url(#colorMood)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly Trend */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">Weekly Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
            <XAxis dataKey="day" stroke={darkMode ? '#9ca3af' : '#6b7280'} />
            <YAxis domain={[0, 5]} stroke={darkMode ? '#9ca3af' : '#6b7280'} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                border: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            />
            <Bar dataKey="mood" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mood Distribution Pie Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">Mood Distribution</h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={moodDistData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ mood, percent }) => `${mood} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="count"
            >
              {moodDistData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.level - 1] || COLORS[2]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                border: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {userStats.topTriggers && userStats.topTriggers.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-semibold text-lg mb-4">Common Triggers</h3>
          <div className="space-y-2">
            {userStats.topTriggers.map(([trigger, count], idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                <span className="font-medium">{trigger}</span>
                <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-sm">
                  {count} times
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// AI CHAT PAGE
// ========================================
function AIChatPage({ currentUser }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m here to support you. How are you feeling today?' }
  ]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);

    const responses = {
      sad: "I'm sorry you're feeling sad. Remember, it's okay to feel this way. Try taking some deep breaths or talking to a friend.",
      happy: "That's wonderful! I'm so glad you're feeling happy. Keep spreading that positive energy!",
      anxious: "Anxiety can be tough. Try the 5-4-3-2-1 grounding technique: Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, and 1 you taste.",
      stressed: "Stress is common, but manageable. Take a short break, go for a walk, or practice some deep breathing exercises.",
      default: "Thank you for sharing. Remember, every feeling is valid. Would you like some activity suggestions?"
    };

    const lowerInput = input.toLowerCase();
    let response = responses.default;
    
    if (lowerInput.includes('sad') || lowerInput.includes('down')) response = responses.sad;
    else if (lowerInput.includes('happy') || lowerInput.includes('great')) response = responses.happy;
    else if (lowerInput.includes('anxious') || lowerInput.includes('worried')) response = responses.anxious;
    else if (lowerInput.includes('stress')) response = responses.stressed;

    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    }, 500);

    setInput('');
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-4">
        <h2 className="text-xl font-bold">AI Mood Assistant</h2>
        <p className="text-sm opacity-90">Here to listen and support you</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white shadow'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-white border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={sendMessage}
            className="bg-indigo-500 text-white px-6 py-3 rounded-xl hover:bg-indigo-600 transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// HABITS PAGE - SELF-CARE HABITS TRACKING
// ========================================
function HabitsPage({ currentUser, darkMode }) {
  const [habits, setHabits] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({});

  useEffect(() => {
    if (currentUser) {
      const userHabits = getUserHabits(currentUser.userId);
      setHabits(userHabits);
      const habitStats = getHabitStats(currentUser.userId, 30);
      setStats(habitStats);
    }
  }, [currentUser]);

  const toggleHabit = (habitId) => {
    const today = new Date().toDateString();
    const isLogged = isHabitLoggedToday(currentUser.userId, habitId);
    
    if (isLogged) {
      unlogHabit(currentUser.userId, habitId, today);
    } else {
      logHabit(currentUser.userId, habitId, today);
    }
    
    // Refresh stats
    const habitStats = getHabitStats(currentUser.userId, 30);
    setStats(habitStats);
    
    // Update habits to reflect today's status
    const updatedHabits = habits.map(h => ({
      ...h,
      loggedToday: h.id === habitId ? !isLogged : h.loggedToday
    }));
    setHabits(updatedHabits);
  };

  const toggleHabitEnabled = (habitId) => {
    const updatedHabits = habits.map(h => 
      h.id === habitId ? { ...h, enabled: !h.enabled } : h
    );
    setHabits(updatedHabits);
    saveUserHabits(currentUser.userId, updatedHabits);
  };

  const filteredHabits = selectedCategory === 'all' 
    ? habits.filter(h => h.enabled)
    : habits.filter(h => h.enabled && h.category === selectedCategory);

  const categories = [
    { id: 'all', name: 'All', icon: '🌟' },
    { id: 'physical', name: 'Physical', icon: '💪' },
    { id: 'mental', name: 'Mental', icon: '🧠' },
    { id: 'social', name: 'Social', icon: '👥' }
  ];

  const todayCompleted = habits.filter(h => 
    h.enabled && isHabitLoggedToday(currentUser.userId, h.id)
  ).length;
  const totalEnabled = habits.filter(h => h.enabled).length;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 dark:from-green-600 dark:via-emerald-600 dark:to-teal-600 rounded-3xl p-6 text-white mb-6 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold mb-1">Self-Care Habits</h1>
            <p className="text-white/90 text-sm">Build healthy routines, one day at a time</p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-white/20 hover:bg-white/30 rounded-xl p-2 transition"
          >
            <Settings size={24} />
          </button>
        </div>
        
        {/* Progress */}
        <div className="mt-4 bg-white/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">Today's Progress</span>
            <span className="font-bold">{todayCompleted}/{totalEnabled}</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div 
              className="bg-white rounded-full h-2 transition-all duration-300"
              style={{ width: `${totalEnabled > 0 ? (todayCompleted / totalEnabled) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">Manage Habits</h3>
          <div className="space-y-3">
            {habits.map(habit => (
              <div key={habit.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{habit.icon}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{habit.name}</span>
                </div>
                <button
                  onClick={() => toggleHabitEnabled(habit.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    habit.enabled
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-400'
                  }`}
                >
                  {habit.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition ${
              selectedCategory === cat.id
                ? 'bg-indigo-500 text-white shadow-lg'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            <span className="mr-2">{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Habits Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {filteredHabits.map(habit => {
          const loggedToday = isHabitLoggedToday(currentUser.userId, habit.id);
          const streak = getStreak(currentUser.userId, habit.id);
          const habitStat = stats[habit.id] || { count: 0, rate: 0 };

          return (
            <button
              key={habit.id}
              onClick={() => toggleHabit(habit.id)}
              className={`relative p-4 rounded-2xl shadow-lg transition-all transform ${
                loggedToday
                  ? 'bg-gradient-to-br from-green-400 to-emerald-500 scale-105'
                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
              } border-2 ${
                loggedToday
                  ? 'border-green-500'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {loggedToday && (
                <div className="absolute top-2 right-2">
                  <CheckCircle className="text-white" size={20} />
                </div>
              )}
              
              <div className="text-center">
                <div className="text-4xl mb-2">{habit.icon}</div>
                <div className={`font-semibold text-sm mb-1 ${
                  loggedToday ? 'text-white' : 'text-gray-900 dark:text-white'
                }`}>
                  {habit.name}
                </div>
                
                {streak > 0 && (
                  <div className={`text-xs ${
                    loggedToday ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    🔥 {streak} day streak
                  </div>
                )}
                
                {habitStat.count > 0 && (
                  <div className={`text-xs mt-1 ${
                    loggedToday ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {habitStat.count}/30 days
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Stats Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">30-Day Statistics</h3>
        <div className="space-y-3">
          {Object.entries(stats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([habitId, stat]) => {
              const habit = habits.find(h => h.id === habitId);
              if (!habit || !habit.enabled) return null;
              
              return (
                <div key={habitId} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <span className="text-2xl">{habit.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white">{habit.name}</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{stat.count} days</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="bg-indigo-500 rounded-full h-2 transition-all"
                        style={{ width: `${stat.rate}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {stat.rate.toFixed(0)}% completion rate
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ========================================
// LANDING PAGE WITH ANIMATIONS
// ========================================
function LandingPage({ setCurrentPage }) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    setTimeout(() => setShowContent(true), 500);
  }, []);

  const handleGetStarted = () => {
    setCurrentPage('auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-blue-900 to-indigo-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      </div>
      
      {/* Subtle Floating Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="floating-emoji" style={{ left: '10%', top: '20%', animationDelay: '0s', opacity: 0.6 }}>😊</div>
        <div className="floating-emoji" style={{ left: '80%', top: '30%', animationDelay: '1s', opacity: 0.5 }}>✨</div>
        <div className="floating-emoji" style={{ left: '20%', top: '60%', animationDelay: '2s', opacity: 0.6 }}>🌟</div>
        <div className="floating-emoji" style={{ left: '70%', top: '70%', animationDelay: '1.5s', opacity: 0.5 }}>💫</div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className={`text-center transition-all duration-1000 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          {/* Main Logo/Emoji with Animation */}
          <div className="mb-8 animate-bounce-slow">
            <div className="text-9xl mb-4 emoji-glow">😊</div>
          </div>

          {/* Title */}
          <h1 className="text-7xl md:text-8xl font-bold text-white mb-6 animate-fade-in-up">
            FitMood
          </h1>

          {/* Subtitle */}
          <p className="text-2xl md:text-3xl text-white/90 mb-4 font-light animate-fade-in-up-delay">
            Track Your Emotions, Improve Your Life
          </p>
          <p className="text-lg md:text-xl text-white/80 mb-12 max-w-2xl mx-auto animate-fade-in-up-delay-2">
            Your personal mood tracking companion. Understand your emotions, build better habits, and enhance your mental well-being.
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto animate-fade-in-up-delay-3">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
              <div className="text-4xl mb-3">📊</div>
              <h3 className="text-xl font-semibold text-white mb-2">Track Your Moods</h3>
              <p className="text-white/80 text-sm">Log your daily emotions and see patterns over time</p>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
              <div className="text-4xl mb-3">💡</div>
              <h3 className="text-xl font-semibold text-white mb-2">Get Insights</h3>
              <p className="text-white/80 text-sm">Personalized recommendations based on your mood</p>
            </div>
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 hover:scale-105">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="text-xl font-semibold text-white mb-2">Build Habits</h3>
              <p className="text-white/80 text-sm">Track self-care habits and maintain healthy routines</p>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleGetStarted}
            className="group relative px-12 py-4 bg-white text-slate-800 rounded-full font-bold text-xl shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110 animate-fade-in-up-delay-4 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <span className="relative z-10 group-hover:text-white transition-colors duration-300">Get Started</span>
          </button>

          {/* Footer */}
          <div className="mt-16 text-white/60 text-sm animate-fade-in-up-delay-5">
            <p>Powered by SAHA</p>
            <p className="mt-1">Developed by AALEKH KUMAR</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// ENHANCED PROFILE PAGE WITH ANIMATIONS
// ========================================
function ProfilePage({ currentUser, userStats, logout, darkMode, toggleDarkMode }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    const savedTime = getStorageItem('reminder_time');
    if (savedTime) {
      setReminderTime(savedTime);
      setNotificationsEnabled(true);
    }
    if (isNotificationSupported()) {
      Notification.permission === 'granted' && setNotificationsEnabled(true);
    }
    setTimeout(() => setShowStats(true), 300);
  }, []);

  const handleNotificationToggle = async () => {
    if (!notificationsEnabled) {
      const result = await requestNotificationPermission();
      if (result.granted) {
        setNotificationsEnabled(true);
        await scheduleDailyReminder(reminderTime);
      } else {
        alert('Please enable notifications in your browser settings.');
      }
    } else {
      cancelReminders();
      setNotificationsEnabled(false);
    }
  };

  const handleReminderTimeChange = async (time) => {
    setReminderTime(time);
    setStorageItem('reminder_time', time);
    if (notificationsEnabled) {
      cancelReminders();
      await scheduleDailyReminder(time);
    }
  };

  // Calculate mood percentage for visual
  const moodPercentage = userStats?.avgMood ? (userStats.avgMood / 5) * 100 : 0;
  const moodEmoji = userStats?.avgMood 
    ? userStats.avgMood >= 4 ? '😊' : userStats.avgMood >= 3 ? '🙂' : userStats.avgMood >= 2 ? '😐' : '😟'
    : '😐';

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Enhanced Profile Header with Animations */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 via-pink-500 to-orange-500 dark:from-indigo-600 dark:via-purple-600 dark:via-pink-600 dark:to-orange-600 rounded-3xl p-8 text-white mb-6 shadow-2xl animate-fade-in">
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="absolute bottom-10 right-10 w-40 h-40 bg-white rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-white rounded-full blur-2xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        </div>

        <div className="relative z-10 text-center">
          {/* Animated Avatar */}
          <div className="relative inline-block mb-6 animate-bounce-slow">
            <div className="w-32 h-32 bg-white/20 backdrop-blur-lg rounded-full mx-auto flex items-center justify-center text-6xl border-4 border-white/30 shadow-2xl">
              {moodEmoji}
            </div>
            <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center text-2xl animate-pulse">
              ⭐
            </div>
          </div>

          <h2 className="text-4xl font-bold mb-2 animate-fade-in-up">{currentUser?.name}</h2>
          <p className="text-white/90 text-lg mb-1">{currentUser?.email}</p>
          <p className="text-white/80 text-sm">{currentUser?.phone}</p>
          
          {/* Role Badge */}
          <div className="mt-4 inline-block">
            <span className="px-4 py-2 bg-white/20 backdrop-blur-lg rounded-full text-sm font-semibold border border-white/30">
              {currentUser?.role === 'admin' ? '👑 Admin' : '👤 Member'}
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Cards with Animations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div 
          className={`bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white transform transition-all duration-500 hover:scale-105 ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: showStats ? '0ms' : '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <Activity className="text-white/80" size={28} />
            <div className="text-4xl font-bold">{userStats?.totalEntries || 0}</div>
          </div>
          <div className="text-sm opacity-90">Total Entries</div>
          <div className="mt-3 text-xs opacity-75">Keep tracking! 📝</div>
        </div>

        <div 
          className={`bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-xl p-6 text-white transform transition-all duration-500 hover:scale-105 ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: showStats ? '100ms' : '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="text-white/80" size={28} />
            <div className="text-4xl font-bold">{userStats?.avgMood ? userStats.avgMood.toFixed(1) : '0.0'}</div>
          </div>
          <div className="text-sm opacity-90">Average Mood</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-white/20 rounded-full h-2">
              <div 
                className="bg-white rounded-full h-2 transition-all duration-1000"
                style={{ width: `${moodPercentage}%` }}
              ></div>
            </div>
            <span className="text-xs opacity-75">{moodPercentage.toFixed(0)}%</span>
          </div>
        </div>

        <div 
          className={`bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl shadow-xl p-6 text-white transform transition-all duration-500 hover:scale-105 ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: showStats ? '200ms' : '0ms' }}
        >
          <div className="flex items-center justify-between mb-2">
            <Award className="text-white/80" size={28} />
            <div className="text-4xl font-bold">{moodEmoji}</div>
          </div>
          <div className="text-sm opacity-90">Current Mood</div>
          <div className="mt-3 text-xs opacity-75">You're doing great! 🎉</div>
        </div>
      </div>

      {/* Enhanced Settings Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-6 border border-gray-100 dark:border-gray-700 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="text-indigo-600 dark:text-indigo-400" size={24} />
          <h3 className="font-bold text-xl text-gray-900 dark:text-white">Settings & Preferences</h3>
        </div>
        
        {/* Dark Mode Toggle */}
        <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-3 transition-colors">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'}`}>
              {darkMode ? <Moon className="text-indigo-600 dark:text-indigo-400" size={24} /> : <Sun className="text-yellow-600 dark:text-yellow-400" size={24} />}
            </div>
            <div>
              <span className="font-semibold text-gray-900 dark:text-white block">Dark Mode</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{darkMode ? 'Easier on the eyes' : 'Bright and cheerful'}</span>
            </div>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${
              darkMode ? 'bg-indigo-600 shadow-lg shadow-indigo-500/50' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                darkMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Notifications */}
        {isNotificationSupported() && (
          <>
            <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-3 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${notificationsEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                  {notificationsEnabled ? <Bell className="text-green-600 dark:text-green-400" size={24} /> : <BellOff className="text-gray-400" size={24} />}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white block">Daily Reminders</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Never forget to check in</span>
                </div>
              </div>
              <button
                onClick={handleNotificationToggle}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ${
                  notificationsEnabled ? 'bg-green-600 shadow-lg shadow-green-500/50' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                    notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {notificationsEnabled && (
              <div className="py-4 px-3">
                <label className="block text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Reminder Time</label>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => handleReminderTimeChange(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none transition-colors"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Enhanced Action Buttons */}
      <div className="space-y-3 mb-6">
        <button className="group w-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-2xl shadow-lg p-5 text-left hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border border-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl group-hover:bg-white/30 transition-colors">
                <Heart className="text-white" size={24} />
              </div>
              <div>
                <span className="font-semibold text-white block">Mental Health Resources</span>
                <span className="text-xs text-white/80">Get support and guidance</span>
              </div>
            </div>
            <ChevronRight className="text-white/80 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
        </button>

        <button
          onClick={logout}
          className="group w-full bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl shadow-lg p-5 text-left hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl group-hover:bg-white/30 transition-colors">
              <LogOut className="text-white" size={24} />
            </div>
            <div>
              <span className="font-semibold text-white block">Logout</span>
              <span className="text-xs text-white/80">Sign out of your account</span>
            </div>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-6">
        <p className="mb-1">Powered by SAHA</p>
        <p>Developed by AALEKH KUMAR</p>
      </div>
    </div>
  );
}

// ================= ENHANCED ADMIN PAGE =================
function AdminPage({ currentUser, allUsers, setAllUsers, darkMode }) {
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUserForAction, setSelectedUserForAction] = useState(null);
  const [actionType, setActionType] = useState('');

  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    setLoading(true);
    try {
      const result = await apiCall('getAllUsers', { requestingUserId: currentUser.userId });
      setAllUsers(result.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewUserDetails = async (userId) => {
    setLoading(true);
    try {
      const result = await apiCall('getUserDetails', {
        requesterId: currentUser.userId,
        userId
      });
      setUserDetails(result);
      setSelectedUser(userId);
    } catch (error) {
      alert('Error loading user details: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId, newRole) => {
    try {
      const result = await apiCall('updateUserRole', {
        requestingUserId: currentUser.userId,
        targetUserId: userId,
        newRole
      });
      if (result.success) {
        loadAllUsers(); // Refresh the list
        alert('User role updated successfully');
      } else {
        alert('Error updating user role: ' + result.error);
      }
    } catch (error) {
      alert('Error updating user role: ' + error.message);
    }
  };

  const resetUserPassword = async (userId) => {
    if (confirm('Are you sure you want to reset this user\'s password? They will need to set a new password on their next login.')) {
      try {
        const result = await apiCall('adminResetPassword', {
          requestingUserId: currentUser.userId,
          targetUserId: userId
        });
        if (result.success) {
          alert('Password reset successfully. User will be prompted to set a new password on next login.');
        } else {
          alert('Error resetting password: ' + result.error);
        }
      } catch (error) {
        alert('Error resetting password: ' + error.message);
      }
    }
  };

  const sendUserMessage = async (userId, message) => {
    try {
      const result = await apiCall('sendUserMessage', {
        requestingUserId: currentUser.userId,
        targetUserId: userId,
        message
      });
      if (result.success) {
        alert('Message sent successfully');
      } else {
        alert('Error sending message: ' + result.error);
      }
    } catch (error) {
      alert('Error sending message: ' + error.message);
    }
  };

  // Filter and sort users
  const filteredUsers = allUsers
    .filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.phone.includes(searchTerm);
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'email':
          return a.email.localeCompare(b.email);
        case 'role':
          return a.role.localeCompare(b.role);
        case 'created':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'lastActive':
          return new Date(b.lastActive) - new Date(a.lastActive);
        default:
          return 0;
      }
    });

  // User action modal
  const UserActionModal = () => {
    const [message, setMessage] = useState('');
    const [newRole, setNewRole] = useState('user');

    if (!showUserModal || !selectedUserForAction) return null;

    const handleAction = async () => {
      switch (actionType) {
        case 'message':
          await sendUserMessage(selectedUserForAction.userId, message);
          break;
        case 'role':
          await updateUserRole(selectedUserForAction.userId, newRole);
          break;
        case 'resetPassword':
          await resetUserPassword(selectedUserForAction.userId);
          break;
      }
      setShowUserModal(false);
      setSelectedUserForAction(null);
      setMessage('');
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            {actionType === 'message' && 'Send Message'}
            {actionType === 'role' && 'Change Role'}
            {actionType === 'resetPassword' && 'Reset Password'}
          </h3>
          
          <div className="mb-4">
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              User: <strong>{selectedUserForAction.name}</strong>
            </p>
            
            {actionType === 'message' && (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your message..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={4}
              />
            )}
            
            {actionType === 'role' && (
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            )}
            
            {actionType === 'resetPassword' && (
              <p className="text-yellow-600 dark:text-yellow-400">
                This will clear the user's password and they will need to set a new one on their next login.
              </p>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowUserModal(false)}
              className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              {actionType === 'message' && 'Send'}
              {actionType === 'role' && 'Update'}
              {actionType === 'resetPassword' && 'Reset'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (selectedUser && userDetails) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <button
          onClick={() => {
            setSelectedUser(null);
            setUserDetails(null);
          }}
          className="mb-4 flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          ← Back to Users
        </button>

        {/* User Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {userDetails.user.name}
              </h2>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>{userDetails.user.email}</span>
                <span>{userDetails.user.phone}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  userDetails.user.role === 'admin' 
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  {userDetails.user.role}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedUserForAction(userDetails.user);
                  setActionType('message');
                  setShowUserModal(true);
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
              >
                📧 Message
              </button>
              <button
                onClick={() => {
                  setSelectedUserForAction(userDetails.user);
                  setActionType('role');
                  setShowUserModal(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                👑 Role
              </button>
              <button
                onClick={() => {
                  setSelectedUserForAction(userDetails.user);
                  setActionType('resetPassword');
                  setShowUserModal(true);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
              >
                🔑 Reset Password
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {[
              { id: 'overview', label: '📊 Overview', icon: '📊' },
              { id: 'moods', label: '😊 Mood History', icon: '😊' },
              { id: 'analytics', label: '📈 Analytics', icon: '📈' },
              { id: 'activity', label: '🎯 Activity', icon: '🎯' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-4 text-white">
                <div className="text-3xl font-bold">
                  {userDetails.stats.totalEntries || userDetails.stats.totalMoods || 0}
                </div>
                <div className="text-sm opacity-90">Total Entries</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-4 text-white">
                <div className="text-3xl font-bold">
                  {userDetails.stats.avgMood ? userDetails.stats.avgMood.toFixed(1) : '0.0'}
                </div>
                <div className="text-sm opacity-90">Avg Mood</div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-4 text-white">
                <div className="text-3xl font-bold">
                  {userDetails.stats.streakDays || 0}
                </div>
                <div className="text-sm opacity-90">Day Streak</div>
              </div>
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-lg p-4 text-white">
                <div className="text-3xl font-bold">
                  {userDetails.stats.lastActive ? 
                    Math.floor((new Date() - new Date(userDetails.stats.lastActive)) / (1000 * 60 * 60 * 24)) : 'N/A'}
                </div>
                <div className="text-sm opacity-90">Days Since Active</div>
              </div>
            </div>

            {/* User Info */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-xl mb-4 text-gray-900 dark:text-white">User Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Name:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{userDetails.user.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Email:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{userDetails.user.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Phone:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{userDetails.user.phone}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Role:</span>{' '}
                    <span className="font-medium capitalize text-gray-900 dark:text-white">{userDetails.user.role}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Joined:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {new Date(userDetails.user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Last Active:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {userDetails.user.lastActive ? new Date(userDetails.user.lastActive).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'moods' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">Recent Mood Entries</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {userDetails.moods && userDetails.moods.length > 0 ? (
                userDetails.moods.map((mood, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <div className="text-4xl">{mood.moodEmoji || '😐'}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          Mood: {mood.mood || 'Not specified'}
                        </span>
                        {mood.energy && (
                          <span className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                            Energy: {mood.energy}
                          </span>
                        )}
                      </div>
                      <div className="text-gray-700 dark:text-gray-300 mb-2">
                        {mood.notes || 'No notes provided'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(mood.timestamp).toLocaleString()}
                      </div>
                      {mood.activities && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Activities: {Array.isArray(mood.activities) ? mood.activities.join(', ') : mood.activities}
                        </div>
                      )}
                      {mood.triggers && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Triggers: {mood.triggers}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No mood entries found for this user.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">Mood Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Mood Distribution</h4>
                  <div className="space-y-2">
                    {userDetails.analytics?.moodDistribution ? (
                      Object.entries(userDetails.analytics.moodDistribution).map(([mood, count]) => (
                        <div key={mood} className="flex items-center justify-between">
                          <span className="text-gray-700 dark:text-gray-300 capitalize">{mood}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 dark:text-gray-400">No mood data available</p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Activity Patterns</h4>
                  <div className="space-y-2">
                    {userDetails.analytics?.topActivities ? (
                      userDetails.analytics.topActivities.map((activity, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-gray-700 dark:text-gray-300">{activity.name}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{activity.count}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 dark:text-gray-400">No activity data available</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">User Activity Log</h3>
            <div className="space-y-3">
              {userDetails.activityLog ? (
                userDetails.activityLog.map((activity, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-2xl">{activity.icon || '📝'}</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">{activity.action}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(activity.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No activity log available for this user.
                </div>
              )}
            </div>
          </div>
        )}

        <UserActionModal />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage users and monitor app activity</p>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="text-3xl font-bold">{allUsers.length}</div>
          <div className="text-sm opacity-90">Total Users</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="text-3xl font-bold">
            {allUsers.filter(u => u.role === 'admin').length}
          </div>
          <div className="text-sm opacity-90">Admins</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="text-3xl font-bold">
            {allUsers.filter(u => u.hasPassword).length}
          </div>
          <div className="text-sm opacity-90">With Passwords</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-lg p-4 text-white">
          <div className="text-3xl font-bold">
            {allUsers.filter(u => u.migrationStatus === 'completed').length}
          </div>
          <div className="text-sm opacity-90">Migrated</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search users by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">All Roles</option>
              <option value="user">Users</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="name">Sort by Name</option>
              <option value="email">Sort by Email</option>
              <option value="role">Sort by Role</option>
              <option value="created">Sort by Created</option>
              <option value="lastActive">Sort by Last Active</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Users ({filteredUsers.length})
          </h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No users found matching your criteria.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredUsers.map((user) => (
              <div key={user.userId} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{user.name}</h3>
                      <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        }`}>
                          {user.role}
                        </span>
                        {user.hasPassword && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            🔐 Secured
                          </span>
                        )}
                        {user.migrationStatus === 'completed' && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            📦 Migrated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => viewUserDetails(user.userId)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                    >
                      👁️ View Details
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUserForAction(user);
                        setActionType('message');
                        setShowUserModal(true);
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                    >
                      📧 Message
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUserForAction(user);
                        setActionType('role');
                        setShowUserModal(true);
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors"
                    >
                      👑 Role
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-4">
                  <span>📅 Joined: {new Date(user.createdAt).toLocaleDateString()}</span>
                  <span>🕒 Last Active: {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never'}</span>
                  <span>📱 {user.phone}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UserActionModal />
    </div>
  );
}

// ================= SIMPLIFIED ADMIN PAGE FALLBACK =================
function AdminPageFallback({ currentUser, allUsers, setAllUsers, darkMode }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    setLoading(true);
    try {
      const result = await apiCall('getAllUsers', { requestingUserId: currentUser.userId });
      setAllUsers(result.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewUserDetails = async (userId) => {
    try {
      const result = await apiCall('getUserDetails', {
        requesterId: currentUser.userId,
        userId
      });
      alert(`User Details:\nName: ${result.user.name}\nEmail: ${result.user.email}\nTotal Moods: ${result.stats.totalEntries || 0}`);
    } catch (error) {
      alert('Error loading user details: ' + error.message);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-indigo-600 dark:to-purple-600 rounded-3xl p-6 text-white mb-6 shadow-xl">
        <h2 className="text-2xl font-bold mb-2">Admin Dashboard</h2>
        <p className="text-white/90">Manage and monitor all users</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-gray-100 dark:border-gray-700">
          <div className="text-indigo-600 dark:text-indigo-400 mb-2"><Users size={24} /></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{allUsers.length}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Users</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-gray-100 dark:border-gray-700">
          <div className="text-purple-600 dark:text-purple-400 mb-2"><Activity size={24} /></div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {allUsers.reduce((sum, u) => sum + (u.totalMoods || u.totalEntries || 0), 0)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Moods</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-white">All Users</h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : allUsers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">No users found</div>
        ) : (
          <div className="space-y-3">
            {allUsers.map((user, idx) => (
              <div
                key={idx}
                onClick={() => viewUserDetails(user.userId)}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition cursor-pointer"
              >
                <div className="flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white">{user.name}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{user.email}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {user.totalMoods || user.totalEntries || 0} moods • Avg: {user.avgMood ? user.avgMood.toFixed(1) : 'N/A'}
                  </div>
                </div>
                <ChevronRight className="text-gray-400 dark:text-gray-500" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ================= NAVIGATION WITH DARK MODE =================
function Navigation({ currentUser, currentPage, setCurrentPage, darkMode, toggleDarkMode, isOnline }) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'habits', icon: Target, label: 'Habits' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'ai-chat', icon: MessageCircle, label: 'AI Chat' },
    { id: 'contact', icon: Phone, label: 'Contact' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  if (currentUser?.role === 'admin') {
    navItems.push({ id: 'admin', icon: Users, label: 'Admin' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
      <div className="max-w-4xl mx-auto flex justify-around py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`flex flex-col items-center py-2 px-4 rounded-xl transition ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400'
              }`}
            >
              <Icon size={24} />
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={toggleDarkMode}
          className="flex flex-col items-center py-2 px-4 rounded-xl transition text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          <span className="text-xs mt-1">Theme</span>
        </button>
      </div>
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 dark:bg-yellow-600 text-white text-center py-1 text-xs">
          <WifiOff size={12} className="inline mr-1" />
          Offline
        </div>
      )}
    </nav>
  );
}
