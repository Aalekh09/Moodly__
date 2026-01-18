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

    if (isAuthenticated && currentUser) {
      if (currentPage === 'splash' || currentPage === 'auth') {
        setCurrentPage('home');
        loadUserData(currentUser.userId);
      }
    } else {
      if (currentPage !== 'splash') {
        setCurrentPage('splash');
      }
    }
  }, [isAuthenticated, currentUser, authLoading]);

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

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 overflow-x-hidden`}>
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
      
      <div className="pb-16 lg:pb-20">
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
// HOME PAGE WITH ENHANCED LAYOUT
// ========================================
function HomePage({ currentUser, moodHistory, loadUserData, userStats, darkMode, setCurrentPage }) {
  const [showMoodEntry, setShowMoodEntry] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [showHabitPopup, setShowHabitPopup] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState(null);

  // Habit suggestions based on mood and habit type
  const getHabitSuggestions = (habitName, moodLevel) => {
    const currentMood = moodLevel || (moodHistory.length > 0 ? moodHistory[0].moodLevel : 3);
    
    const suggestions = {
      'Exercise': {
        1: { // Very Sad
          title: 'Gentle Movement for Low Energy',
          description: 'When feeling down, gentle movement can help boost your mood naturally.',
          activities: [
            '🚶‍♀️ Take a 5-10 minute gentle walk outside',
            '🧘‍♀️ Try 5 minutes of gentle stretching or yoga',
            '💃 Put on your favorite song and move to the beat',
            '🏃‍♀️ Do light bodyweight exercises (wall push-ups, seated leg lifts)',
            '🌳 Spend time in nature, even just sitting outside'
          ],
          tip: 'Start small - even 5 minutes of movement can release endorphins and improve your mood.'
        },
        2: { // Sad
          title: 'Mood-Boosting Light Exercise',
          description: 'Light exercise can help lift your spirits and increase energy levels.',
          activities: [
            '🚶‍♀️ Take a 15-20 minute brisk walk',
            '🧘‍♀️ Follow a 10-15 minute beginner yoga video',
            '🏃‍♀️ Do a short bodyweight circuit (squats, lunges, push-ups)',
            '🚴‍♀️ Go for a leisurely bike ride',
            '💪 Try resistance band exercises'
          ],
          tip: 'Focus on activities that feel good rather than intense workouts.'
        },
        3: { // Neutral
          title: 'Balanced Exercise Routine',
          description: 'Maintain your energy with a well-rounded exercise routine.',
          activities: [
            '🏃‍♀️ 20-30 minute jog or run',
            '💪 Full-body strength training session',
            '🧘‍♀️ 20-30 minute yoga flow',
            '🚴‍♀️ Cycling or spinning class',
            '🏊‍♀️ Swimming laps'
          ],
          tip: 'This is a great time to stick to your regular exercise routine or try something new.'
        },
        4: { // Good
          title: 'Energizing Workouts',
          description: 'Channel your positive energy into more dynamic activities.',
          activities: [
            '🏃‍♀️ High-intensity interval training (HIIT)',
            '💪 Challenging strength training with heavier weights',
            '🧗‍♀️ Rock climbing or bouldering',
            '🏐 Play a sport with friends',
            '💃 Dance workout or Zumba class'
          ],
          tip: 'Use this positive energy to challenge yourself and try new activities!'
        },
        5: { // Very Happy
          title: 'High-Energy Activities',
          description: 'Make the most of your high energy and great mood!',
          activities: [
            '🏃‍♀️ Long run or challenging hike',
            '💪 Intense CrossFit or bootcamp workout',
            '🏐 Competitive sports or team activities',
            '💃 High-energy dance class or party',
            '🧗‍♀️ Adventure activities like rock climbing or martial arts'
          ],
          tip: 'This is the perfect time for challenging workouts and trying new adventures!'
        }
      },
      'Water': {
        1: { // Very Sad
          title: 'Gentle Hydration for Healing',
          description: 'Proper hydration supports your body during difficult times.',
          activities: [
            '💧 Aim for 6-8 glasses of water today (1.5-2L)',
            '🍵 Drink warm herbal teas (chamomile, lavender)',
            '🥤 Add lemon or cucumber to water for flavor',
            '🧊 Keep a water bottle nearby as a reminder',
            '⏰ Set gentle reminders every 2 hours to drink water'
          ],
          tip: 'Dehydration can worsen low moods. Small, frequent sips are better than forcing large amounts.'
        },
        2: { // Sad
          title: 'Hydration for Better Mood',
          description: 'Good hydration helps your brain function better and can improve mood.',
          activities: [
            '💧 Drink 8-10 glasses of water today (2-2.5L)',
            '🍵 Try mood-boosting teas (green tea, peppermint)',
            '🥤 Infuse water with fruits (berries, citrus)',
            '📱 Use a hydration tracking app',
            '🥛 Include hydrating foods (watermelon, soup, smoothies)'
          ],
          tip: 'Even mild dehydration can affect concentration and mood. Stay consistent!'
        },
        3: { // Neutral
          title: 'Optimal Daily Hydration',
          description: 'Maintain steady hydration for consistent energy and focus.',
          activities: [
            '💧 Drink 8-12 glasses of water today (2-3L)',
            '🥤 Start your day with a large glass of water',
            '🍵 Balance water with herbal teas throughout the day',
            '🏃‍♀️ Drink extra water before, during, and after exercise',
            '📊 Track your intake to build a consistent habit'
          ],
          tip: 'Aim for pale yellow urine as a sign of good hydration.'
        },
        4: { // Good
          title: 'Enhanced Hydration for Peak Performance',
          description: 'Optimize your hydration to maintain your great energy.',
          activities: [
            '💧 Drink 10-12 glasses of water today (2.5-3L)',
            '🥤 Add electrolytes if you\'re active (coconut water, sports drinks)',
            '🍵 Try energizing teas (matcha, white tea)',
            '🧊 Keep ice-cold water for refreshing hydration',
            '🥛 Include hydrating smoothies with fruits and vegetables'
          ],
          tip: 'When you feel good, it\'s easier to maintain healthy habits. Keep it up!'
        },
        5: { // Very Happy
          title: 'Celebration Hydration',
          description: 'Stay hydrated while enjoying your amazing mood!',
          activities: [
            '💧 Drink 12+ glasses of water today (3L+)',
            '🥤 Create fun flavored water combinations',
            '🍹 Make healthy mocktails with sparkling water',
            '🥛 Blend hydrating smoothie bowls',
            '🧊 Try different temperatures - hot teas, ice water, room temp'
          ],
          tip: 'High energy often means more activity - stay extra hydrated to maintain your peak state!'
        }
      },
      'Meditation': {
        1: { // Very Sad
          title: 'Gentle Mindfulness for Healing',
          description: 'Soft, compassionate practices to support you through difficult emotions.',
          activities: [
            '🧘‍♀️ 5-10 minutes of loving-kindness meditation',
            '🌬️ Simple breathing exercises (4-7-8 technique)',
            '🎵 Listen to guided meditations for sadness or grief',
            '📝 Practice gentle body scan meditation',
            '🤗 Self-compassion meditation and positive affirmations'
          ],
          tip: 'Be gentle with yourself. If sitting still is hard, try walking meditation instead.'
        },
        2: { // Sad
          title: 'Mood-Lifting Mindfulness',
          description: 'Practices to help shift your perspective and find inner calm.',
          activities: [
            '🧘‍♀️ 10-15 minutes of mindfulness meditation',
            '🌬️ Breathing exercises with visualization',
            '🎵 Guided meditations for anxiety or stress relief',
            '🙏 Gratitude meditation (find 3 things you\'re grateful for)',
            '🌅 Morning or evening meditation routine'
          ],
          tip: 'Focus on acceptance rather than trying to change how you feel right now.'
        },
        3: { // Neutral
          title: 'Balanced Mindfulness Practice',
          description: 'Maintain mental clarity and emotional balance.',
          activities: [
            '🧘‍♀️ 15-20 minutes of regular meditation practice',
            '🌬️ Alternate nostril breathing for balance',
            '🎵 Try different meditation styles (mindfulness, concentration)',
            '📝 Body scan or progressive muscle relaxation',
            '🌳 Nature meditation or outdoor mindfulness'
          ],
          tip: 'This is a great time to establish or deepen your regular practice.'
        },
        4: { // Good
          title: 'Energizing Mindfulness',
          description: 'Use meditation to enhance and sustain your positive state.',
          activities: [
            '🧘‍♀️ 20-30 minutes of focused meditation',
            '🌬️ Energizing breathwork (bellows breath, rapid breathing)',
            '🎵 Meditation for creativity and inspiration',
            '🙏 Gratitude and appreciation meditation',
            '✨ Visualization meditation for goals and dreams'
          ],
          tip: 'Use this positive energy to deepen your practice and set intentions.'
        },
        5: { // Very Happy
          title: 'Joyful Mindfulness Celebration',
          description: 'Channel your joy into deeper awareness and presence.',
          activities: [
            '🧘‍♀️ Extended meditation session (30+ minutes)',
            '🌬️ Celebratory breathwork and energy practices',
            '🎵 Meditation on joy, love, and connection',
            '🙏 Metta (loving-kindness) meditation for all beings',
            '✨ Creative visualization and manifestation meditation'
          ],
          tip: 'This high-energy state is perfect for breakthrough meditation experiences!'
        }
      },
      'Sleep': {
        1: { // Very Sad
          title: 'Restorative Sleep for Healing',
          description: 'Prioritize rest and recovery during difficult times.',
          activities: [
            '😴 Aim for 8-9 hours of sleep tonight',
            '🛏️ Create a cozy, comfortable sleep environment',
            '📱 Avoid screens 1-2 hours before bed',
            '🍵 Drink chamomile tea or warm milk before sleep',
            '📖 Try gentle bedtime reading or soft music'
          ],
          tip: 'Depression and sadness often disrupt sleep. Be patient and prioritize rest.'
        },
        2: { // Sad
          title: 'Sleep for Mood Recovery',
          description: 'Good sleep is essential for emotional regulation and healing.',
          activities: [
            '😴 Target 7-8 hours of quality sleep',
            '🛏️ Establish a calming bedtime routine',
            '🌙 Keep your bedroom cool, dark, and quiet',
            '📝 Try journaling before bed to clear your mind',
            '🧘‍♀️ Practice relaxation techniques before sleep'
          ],
          tip: 'Poor sleep can worsen mood. Make sleep a priority for emotional recovery.'
        },
        3: { // Neutral
          title: 'Optimal Sleep Habits',
          description: 'Maintain consistent sleep patterns for overall well-being.',
          activities: [
            '😴 Get 7-8 hours of sleep consistently',
            '⏰ Keep a regular sleep schedule (same bedtime/wake time)',
            '🛏️ Optimize your sleep environment (mattress, pillows, temperature)',
            '📱 Use blue light filters on devices in the evening',
            '☕ Avoid caffeine 6+ hours before bedtime'
          ],
          tip: 'Consistency is key. Try to sleep and wake at the same times every day.'
        },
        4: { // Good
          title: 'Sleep for Peak Performance',
          description: 'Maintain your positive energy with quality rest.',
          activities: [
            '😴 Aim for 7-8 hours of high-quality sleep',
            '🌅 Wake up naturally or with a sunrise alarm clock',
            '🛏️ Invest in quality sleep accessories',
            '📝 Track your sleep patterns to optimize timing',
            '🧘‍♀️ Practice gratitude or positive visualization before sleep'
          ],
          tip: 'Good moods make it easier to maintain healthy sleep habits. Keep it up!'
        },
        5: { // Very Happy
          title: 'Energized Sleep Optimization',
          description: 'Balance your high energy with restorative sleep.',
          activities: [
            '😴 Don\'t sacrifice sleep for activities - aim for 7-8 hours',
            '🏃‍♀️ Use your energy during the day, but wind down properly',
            '🛏️ Create an amazing sleep sanctuary',
            '📱 Track sleep quality and optimize your routine',
            '🌙 Practice calming activities to transition from high energy to rest'
          ],
          tip: 'High energy can make it hard to wind down. Plan your evening routine carefully.'
        }
      }
    };

    return suggestions[habitName]?.[currentMood] || suggestions[habitName]?.[3] || {
      title: 'Personalized Suggestions',
      description: 'Keep up the great work with your healthy habits!',
      activities: ['Continue your current routine', 'Stay consistent with your goals'],
      tip: 'Consistency is the key to building lasting habits.'
    };
  };

  const handleHabitClick = (habit) => {
    const currentMood = moodHistory.length > 0 ? moodHistory[0].moodLevel : 3;
    setSelectedHabit({
      ...habit,
      suggestions: getHabitSuggestions(habit.name, currentMood),
      currentMood
    });
    setShowHabitPopup(true);
  };

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
    <div className="p-3 sm:p-4 max-w-4xl mx-auto">
      {/* Enhanced Header */}
      <div className={`bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-600 dark:via-purple-600 dark:to-pink-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white mb-4 sm:mb-6 shadow-xl`}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 truncate">Hello, {currentUser?.name}! 👋</h1>
            <p className="text-white/90 text-xs sm:text-sm">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          {currentStreak() > 0 && (
            <div className="text-center bg-white/20 rounded-xl px-3 sm:px-4 py-2 flex-shrink-0">
              <div className="text-xl sm:text-2xl font-bold">{currentStreak()}</div>
              <div className="text-[10px] sm:text-xs whitespace-nowrap">Day Streak 🔥</div>
            </div>
          )}
        </div>
        <p className="text-white/90 mt-2 text-sm sm:text-base">How are you feeling today?</p>
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 border border-gray-100 dark:border-gray-700">
          <div className="text-indigo-600 dark:text-indigo-400 mb-2"><Activity size={20} className="sm:w-6 sm:h-6" /></div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{userStats?.totalEntries || 0}</div>
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Entries</div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 border border-gray-100 dark:border-gray-700">
          <div className="text-purple-600 dark:text-purple-400 mb-2"><TrendingUp size={20} className="sm:w-6 sm:h-6" /></div>
          <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{userStats?.avgMood ? userStats.avgMood.toFixed(1) : '0.0'}</div>
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Average Mood</div>
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
                  <div key={habit.id} className="relative">
                    <button
                      onClick={() => handleHabitClick(habit)}
                      className={`w-full p-3 rounded-xl transition ${
                        logged
                          ? 'bg-green-500 text-white shadow-md'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                      }`}
                    >
                      <div className="text-2xl mb-1">{habit.icon}</div>
                      <div className={`text-xs ${logged ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {habit.name}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (logged) {
                          unlogHabit(currentUser.userId, habit.id);
                        } else {
                          logHabit(currentUser.userId, habit.id);
                        }
                        loadUserData(currentUser.userId);
                      }}
                      className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs transition ${
                        logged
                          ? 'bg-white text-green-500 shadow-md'
                          : 'bg-indigo-500 text-white shadow-md hover:bg-indigo-600'
                      }`}
                    >
                      {logged ? '✓' : '+'}
                    </button>
                  </div>
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
                  {mood.triggers && mood.triggers.trim() && (
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

      {/* Habit Suggestions Popup */}
      {showHabitPopup && selectedHabit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{selectedHabit.icon}</div>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedHabit.name} Suggestions</h2>
                    <p className="text-white/90 text-sm">
                      Based on your current mood: {['😢 Very Sad', '😟 Sad', '😐 Neutral', '🙂 Good', '😊 Very Happy'][selectedHabit.currentMood - 1]}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHabitPopup(false)}
                  className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/20 rounded-lg"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Title and Description */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {selectedHabit.suggestions.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {selectedHabit.suggestions.description}
                </p>
              </div>

              {/* Activities List */}
              <div className="mb-6">
                <h4 className="font-semibold text-lg text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Sparkles className="text-indigo-500" size={20} />
                  Recommended Activities
                </h4>
                <div className="space-y-3">
                  {selectedHabit.suggestions.activities.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <div className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5">
                        {index + 1}
                      </div>
                      <span className="text-gray-700 dark:text-gray-300">{activity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pro Tip */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="text-yellow-600 dark:text-yellow-400 mt-0.5">
                    <Award size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">Pro Tip</h4>
                    <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                      {selectedHabit.suggestions.tip}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const logged = isHabitLoggedToday(currentUser.userId, selectedHabit.id);
                    if (logged) {
                      unlogHabit(currentUser.userId, selectedHabit.id);
                    } else {
                      logHabit(currentUser.userId, selectedHabit.id);
                    }
                    loadUserData(currentUser.userId);
                    setShowHabitPopup(false);
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold transition ${
                    isHabitLoggedToday(currentUser.userId, selectedHabit.id)
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                  }`}
                >
                  {isHabitLoggedToday(currentUser.userId, selectedHabit.id) ? '✓ Completed Today' : 'Mark as Done'}
                </button>
                <button
                  onClick={() => setCurrentPage('habits')}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  View All Habits
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

        <div className="flex justify-between gap-1 sm:gap-2">
          {customEmojis.map((emoji, idx) => (
            <button
              key={idx}
              onClick={() => setMoodLevel(idx + 1)}
              className={`flex-1 p-2 sm:p-4 rounded-xl transition ${
                moodLevel === idx + 1
                  ? 'bg-indigo-500 dark:bg-indigo-600 text-white shadow-lg scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <div className="text-2xl sm:text-3xl mb-1">{emoji}</div>
              <div className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-300">{moodLabels[idx]}</div>
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
  // Generate sample data for demonstration when no real data exists
  const generateSampleData = () => {
    const sampleMoodHistory = Array.from({ length: 14 }, (_, i) => ({
      timestamp: new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000).toISOString(),
      moodLevel: Math.floor(Math.random() * 3) + 2, // Random mood between 2-4
      moodEmoji: ['😐', '🙂', '😊'][Math.floor(Math.random() * 3)]
    }));
    
    return sampleMoodHistory;
  };

  const hasRealData = moodHistory && moodHistory.length > 0;
  const displayData = hasRealData ? moodHistory : generateSampleData();
  const totalEntries = hasRealData ? (userStats?.totalEntries || 0) : displayData.length;
  const avgMood = hasRealData ? (userStats?.avgMood || 0) : 3.2;

  // Enhanced chart data
  const chartData = displayData.slice(-14).map((m, index) => ({
    date: new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    mood: m.moodLevel || 3,
    fullDate: m.timestamp
  }));

  // Weekly trend data
  const weeklyData = [];
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      dateString: date.toDateString(),
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' })
    };
  });

  last7Days.forEach(({ dateString, dayName }) => {
    const dayMoods = displayData.filter(m => new Date(m.timestamp).toDateString() === dateString);
    const avgMood = dayMoods.length > 0 
      ? dayMoods.reduce((sum, m) => sum + (m.moodLevel || 3), 0) / dayMoods.length 
      : (hasRealData ? 0 : Math.random() * 2 + 2); // Sample data for empty days
    
    weeklyData.push({
      day: dayName,
      mood: avgMood ? parseFloat(avgMood.toFixed(1)) : 0
    });
  });

  // Mood distribution data
  const moodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  displayData.forEach(m => {
    const level = m.moodLevel || 3;
    if (moodCounts[level] !== undefined) {
      moodCounts[level]++;
    }
  });

  const moodDistData = Object.entries(moodCounts)
    .filter(([_, count]) => count > 0)
    .map(([level, count]) => ({
      mood: ['😢', '😟', '😐', '🙂', '😊'][parseInt(level) - 1] || '😐',
      count: count,
      level: parseInt(level),
      name: ['Very Sad', 'Sad', 'Neutral', 'Good', 'Very Happy'][parseInt(level) - 1]
    }));

  const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6'];

  return (
    <div className="p-3 sm:p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Your Analytics</h2>
        {!hasRealData && (
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
            Sample Data
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 text-white">
          <div className="text-2xl sm:text-3xl font-bold">{totalEntries}</div>
          <div className="text-xs sm:text-sm opacity-90">Total Entries</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 text-white">
          <div className="text-2xl sm:text-3xl font-bold">{avgMood.toFixed(1)}</div>
          <div className="text-xs sm:text-sm opacity-90">Average Mood</div>
        </div>
      </div>

      {/* Mood Trend Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4 text-gray-900 dark:text-white">
          Recent Mood Trend
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
              <XAxis 
                dataKey="date" 
                stroke={darkMode ? '#9ca3af' : '#6b7280'} 
                fontSize={12}
              />
              <YAxis 
                domain={[1, 5]} 
                stroke={darkMode ? '#9ca3af' : '#6b7280'} 
                fontSize={12}
                tickFormatter={(value) => ['😢', '😟', '😐', '🙂', '😊'][value - 1] || value}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                  border: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
                formatter={(value) => [
                  `${value} ${['😢', '😟', '😐', '🙂', '😊'][Math.round(value) - 1] || ''}`,
                  'Mood Level'
                ]}
              />
              <Area 
                type="monotone" 
                dataKey="mood" 
                stroke="#6366f1" 
                fillOpacity={1} 
                fill="url(#colorMood)" 
                strokeWidth={3}
                dot={{ fill: '#6366f1', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#6366f1', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <TrendingUp size={48} className="mx-auto mb-2 opacity-50" />
              <p>No mood data to display</p>
            </div>
          </div>
        )}
      </div>

      {/* Weekly Trend */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4 text-gray-900 dark:text-white">
          Weekly Overview
        </h3>
        {weeklyData.some(d => d.mood > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#e5e7eb'} />
              <XAxis 
                dataKey="day" 
                stroke={darkMode ? '#9ca3af' : '#6b7280'} 
                fontSize={12}
              />
              <YAxis 
                domain={[0, 5]} 
                stroke={darkMode ? '#9ca3af' : '#6b7280'} 
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                  border: darkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
                formatter={(value) => [value ? value.toFixed(1) : 'No data', 'Average Mood']}
              />
              <Bar 
                dataKey="mood" 
                fill="#8b5cf6" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <BarChart3 size={48} className="mx-auto mb-2 opacity-50" />
              <p>No weekly data available</p>
            </div>
          </div>
        )}
      </div>

      {/* Mood Distribution */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6 border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4 text-gray-900 dark:text-white">
          Mood Distribution
        </h3>
        {moodDistData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={moodDistData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
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
                  formatter={(value, name, props) => [
                    `${value} entries`,
                    `${props.payload.mood} ${props.payload.name}`
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {moodDistData.map((entry, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[entry.level - 1] || COLORS[2] }}
                    ></div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {entry.mood} {entry.name}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {entry.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📊</div>
              <p>No mood distribution data</p>
            </div>
          </div>
        )}
      </div>

      {/* Insights Section */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-indigo-100 dark:border-indigo-800">
        <h3 className="font-semibold text-base sm:text-lg mb-3 text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="text-indigo-600 dark:text-indigo-400" size={20} />
          Quick Insights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">Most Common Mood</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {moodDistData.length > 0 
                ? `${moodDistData.reduce((prev, curr) => prev.count > curr.count ? prev : curr).mood} ${moodDistData.reduce((prev, curr) => prev.count > curr.count ? prev : curr).name}`
                : hasRealData ? 'Not enough data' : '😐 Neutral'
              }
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">Tracking Streak</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {hasRealData ? `${totalEntries} days` : '14 days'}
            </div>
          </div>
        </div>
        {!hasRealData && (
          <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 Start logging your moods to see your personal analytics and insights!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// AI CHAT PAGE
// ========================================
// AI CHAT PAGE - REALISTIC AI ASSISTANT
// ========================================
function AIChatPage({ currentUser, darkMode }) {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: 'Hi! I\'m your AI Mood Assistant. I\'m here to listen and support you. How are you feeling today?',
      timestamp: new Date(),
      isRealAI: false
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationContext, setConversationContext] = useState({
    userMood: null,
    hasGreeted: false,
    suggestedActivities: false,
    askedFollowUp: false
  });

  // Real AI integration
  const callAIAPI = async (userMessage, conversationHistory) => {
    const API_KEY = import.meta.env.VITE_AI_API_KEY;
    const API_URL = import.meta.env.VITE_AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

    // Check if API key is properly set and not a placeholder
    if (!API_KEY || API_KEY === 'your_api_key_here' || API_KEY.includes('your_')) {
      console.log('🤖 AI API key not configured - using smart fallback responses');
      throw new Error('API key not configured');
    }

    // System prompt for mood support
    const systemPrompt = `You are a compassionate AI mood assistant for a mental health app called FitMood. Your role is to:

1. Provide empathetic, supportive responses to users sharing their emotions
2. Offer practical, evidence-based coping strategies and activities
3. Validate users' feelings and normalize their experiences
4. Ask thoughtful follow-up questions to encourage reflection
5. Suggest mood-appropriate activities (exercise, meditation, journaling, etc.)
6. Maintain a warm, professional, and non-judgmental tone
7. Keep responses concise but meaningful (2-4 sentences typically)
8. Always remind users that you're not a replacement for professional mental health care when appropriate

Guidelines:
- Be genuinely caring and empathetic
- Offer specific, actionable suggestions
- Ask open-ended questions to encourage sharing
- Validate emotions without being overly clinical
- Focus on immediate coping strategies and self-care
- Encourage professional help for serious concerns`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10), // Keep last 10 messages for context
        { role: 'user', content: userMessage }
      ];

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant', // AI model
          messages: messages,
          max_tokens: 300,
          temperature: 0.7,
          top_p: 0.9,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API Response:', response.status, errorText);
        
        if (response.status === 401) {
          console.log('🔑 Invalid API key - check your AI API key');
        } else if (response.status === 400) {
          console.log('📝 Bad request - check API parameters');
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Real AI response generated');
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.log('🔄 Falling back to predefined responses');
      throw error; // Re-throw to trigger fallback
    }
  };

  // Fallback responses if API fails
  const getFallbackResponse = (userInput) => {
    const input = userInput.toLowerCase();
    
    if (input.includes('sad') || input.includes('down')) {
      return "I'm sorry you're feeling sad. It takes courage to share that with me. Sadness is a natural emotion, and it's okay to feel this way. Would you like to talk about what's causing these feelings?";
    } else if (input.includes('happy') || input.includes('great')) {
      return "That's wonderful to hear! I'm so glad you're feeling happy. What's bringing you joy today?";
    } else if (input.includes('anxious') || input.includes('worried')) {
      return "Anxiety can feel really overwhelming. I'm here with you. Let's try to slow things down together. Can you tell me what's making you feel anxious right now?";
    } else if (input.includes('stressed')) {
      return "I hear that you're feeling stressed. That's your body and mind telling you that you're dealing with a lot right now. What's been the biggest source of pressure lately?";
    } else {
      return "Thank you for sharing that with me. I'm here to listen and support you. Can you tell me more about how you're feeling?";
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { 
      role: 'user', 
      content: input,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setIsTyping(true);

    try {
      // Convert messages to format expected by AI API
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Try to call real AI API
      const aiResponse = await callAIAPI(currentInput, conversationHistory);
      
      const assistantMsg = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        isRealAI: true
      };

      setMessages(prev => [...prev, assistantMsg]);
      setConversationContext(prev => ({ ...prev, hasGreeted: true }));
      
    } catch (error) {
      console.log('Using fallback response system');
      
      // Fallback response if API fails
      const fallbackResponse = getFallbackResponse(currentInput);
      const assistantMsg = {
        role: 'assistant',
        content: fallbackResponse,
        timestamp: new Date(),
        isRealAI: false
      };
      setMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const formatTime = (timestamp) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-6xl mx-auto bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-indigo-600 dark:to-purple-600 text-white p-4 lg:p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/20 rounded-full flex items-center justify-center">
              <MessageCircle size={24} />
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-bold">AI Mood Assistant</h2>
              <p className="text-sm lg:text-base opacity-90">Here to listen and support you</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-xs lg:text-sm opacity-80">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Smart Responses Active</span>
            </div>
            <p className="text-xs opacity-60 mt-1">Add AI API key for real AI</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-3 lg:px-6 lg:py-4 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-indigo-500 text-white rounded-br-md'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-md rounded-bl-md border border-gray-200 dark:border-gray-700'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm lg:text-base leading-relaxed">{msg.content}</p>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mt-2 text-xs opacity-60">
                    {msg.isRealAI ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>AI</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Smart Response</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-2">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          </div>
        ))}
        
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-2xl rounded-bl-md px-4 py-3 lg:px-6 lg:py-4 border border-gray-200 dark:border-gray-700">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 lg:p-6 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mb-16 lg:mb-20">
        <div className="flex gap-3 lg:gap-4 max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isTyping && sendMessage()}
            placeholder="Type your message..."
            disabled={isTyping}
            className="flex-1 px-4 py-3 lg:px-6 lg:py-4 text-sm lg:text-base rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-indigo-500 dark:focus:border-indigo-400 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isTyping}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white px-6 py-3 lg:px-8 lg:py-4 text-sm lg:text-base rounded-xl transition-colors disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 mt-3 text-center max-w-4xl mx-auto">
          This AI assistant provides supportive responses but is not a replacement for professional mental health care.
        </p>
      </div>
    </div>
  );
}

// ========================================
// HABITS PAGE - PROFESSIONAL SELF-CARE TRACKING
// ========================================
function HabitsPage({ currentUser, darkMode }) {
  const [habits, setHabits] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({});
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [showHabitDetail, setShowHabitDetail] = useState(false);

  // Professional habit data with comprehensive information
  const professionalHabitData = {
    'Exercise': {
      icon: '💪',
      category: 'physical',
      title: 'Physical Exercise',
      description: 'Regular physical activity for optimal health and mood',
      benefits: [
        'Releases endorphins and improves mood',
        'Strengthens cardiovascular system',
        'Builds muscle strength and endurance',
        'Improves sleep quality',
        'Boosts energy levels throughout the day'
      ],
      dailyGoals: {
        beginner: '15-20 minutes of light activity',
        intermediate: '30-45 minutes of moderate exercise',
        advanced: '45-60 minutes of intense training'
      },
      exercises: {
        cardio: [
          { name: 'Brisk Walking', duration: '20-30 min', intensity: 'Low', calories: '150-200' },
          { name: 'Jogging', duration: '20-30 min', intensity: 'Medium', calories: '250-350' },
          { name: 'Running', duration: '20-30 min', intensity: 'High', calories: '300-450' },
          { name: 'Cycling', duration: '30-45 min', intensity: 'Medium', calories: '200-400' },
          { name: 'Swimming', duration: '30-45 min', intensity: 'Medium-High', calories: '250-400' }
        ],
        strength: [
          { name: 'Push-ups', reps: '10-20 reps x 3 sets', target: 'Chest, Arms', equipment: 'None' },
          { name: 'Squats', reps: '15-25 reps x 3 sets', target: 'Legs, Glutes', equipment: 'None' },
          { name: 'Planks', reps: '30-60 seconds x 3 sets', target: 'Core', equipment: 'None' },
          { name: 'Lunges', reps: '10-15 per leg x 3 sets', target: 'Legs, Glutes', equipment: 'None' },
          { name: 'Burpees', reps: '5-15 reps x 3 sets', target: 'Full Body', equipment: 'None' }
        ],
        flexibility: [
          { name: 'Morning Stretch', duration: '10-15 min', focus: 'Full Body Wake-up' },
          { name: 'Yoga Flow', duration: '20-30 min', focus: 'Flexibility & Balance' },
          { name: 'Evening Stretch', duration: '10-15 min', focus: 'Relaxation' },
          { name: 'Foam Rolling', duration: '10-20 min', focus: 'Muscle Recovery' }
        ]
      },
      tips: [
        'Start with 5-10 minutes if you\'re a beginner',
        'Choose activities you enjoy to stay consistent',
        'Listen to your body and rest when needed',
        'Gradually increase intensity and duration',
        'Stay hydrated before, during, and after exercise'
      ]
    },
    'Drink Water': {
      icon: '💧',
      category: 'physical',
      title: 'Hydration Tracking',
      description: 'Maintain optimal hydration for peak physical and mental performance',
      benefits: [
        'Improves brain function and concentration',
        'Regulates body temperature',
        'Aids in digestion and nutrient absorption',
        'Maintains healthy skin',
        'Supports kidney function and detoxification'
      ],
      dailyGoals: {
        minimum: '8 glasses (2 liters) - Mandatory baseline',
        recommended: '10-12 glasses (2.5-3 liters) - Optimal hydration',
        active: '12-16 glasses (3-4 liters) - For active individuals'
      },
      hydrationSchedule: [
        { time: '6:00 AM', amount: '1-2 glasses', note: 'Start your day hydrated' },
        { time: '8:00 AM', amount: '1 glass', note: 'With breakfast' },
        { time: '10:00 AM', amount: '1 glass', note: 'Mid-morning boost' },
        { time: '12:00 PM', amount: '1-2 glasses', note: 'Before and with lunch' },
        { time: '2:00 PM', amount: '1 glass', note: 'Afternoon energy' },
        { time: '4:00 PM', amount: '1 glass', note: 'Pre-workout or snack time' },
        { time: '6:00 PM', amount: '1 glass', note: 'With dinner' },
        { time: '8:00 PM', amount: '1 glass', note: 'Evening hydration (stop 2hrs before bed)' }
      ],
      waterTypes: [
        { type: 'Plain Water', benefits: 'Pure hydration, no calories', when: 'Anytime' },
        { type: 'Lemon Water', benefits: 'Vitamin C, aids digestion', when: 'Morning' },
        { type: 'Herbal Tea', benefits: 'Hydration + herbs benefits', when: 'Evening' },
        { type: 'Coconut Water', benefits: 'Natural electrolytes', when: 'After exercise' },
        { type: 'Infused Water', benefits: 'Flavor + vitamins', when: 'Throughout day' }
      ],
      tips: [
        'Keep a water bottle with you at all times',
        'Set hourly reminders on your phone',
        'Drink a glass before each meal',
        'Monitor urine color - aim for pale yellow',
        'Increase intake during exercise or hot weather'
      ]
    },
    'Meditation': {
      icon: '🧘‍♀️',
      category: 'mental',
      title: 'Mindfulness & Meditation',
      description: 'Cultivate inner peace, focus, and emotional well-being',
      benefits: [
        'Reduces stress and anxiety levels',
        'Improves focus and concentration',
        'Enhances emotional regulation',
        'Promotes better sleep quality',
        'Increases self-awareness and mindfulness'
      ],
      dailyGoals: {
        beginner: '5-10 minutes of guided meditation',
        intermediate: '15-20 minutes of focused practice',
        advanced: '30+ minutes of deep meditation'
      },
      techniques: [
        {
          name: 'Mindfulness Meditation',
          duration: '10-20 min',
          description: 'Focus on present moment awareness',
          steps: ['Sit comfortably', 'Focus on breath', 'Notice thoughts without judgment', 'Return to breath']
        },
        {
          name: 'Loving-Kindness Meditation',
          duration: '15-25 min',
          description: 'Cultivate compassion for self and others',
          steps: ['Start with self-love', 'Extend to loved ones', 'Include neutral people', 'Embrace difficult relationships']
        },
        {
          name: 'Body Scan',
          duration: '20-30 min',
          description: 'Progressive relaxation and awareness',
          steps: ['Lie down comfortably', 'Start from toes', 'Move up through body', 'Notice sensations']
        },
        {
          name: 'Breathing Exercises',
          duration: '5-15 min',
          description: 'Various breath control techniques',
          steps: ['4-7-8 breathing', 'Box breathing', 'Alternate nostril', 'Deep belly breathing']
        }
      ],
      apps: [
        { name: 'Headspace', type: 'Guided meditations', price: 'Free/Premium' },
        { name: 'Calm', type: 'Sleep stories & meditation', price: 'Free/Premium' },
        { name: 'Insight Timer', type: 'Community & timers', price: 'Free' },
        { name: 'Ten Percent Happier', type: 'Practical meditation', price: 'Premium' }
      ],
      tips: [
        'Start with just 5 minutes daily',
        'Find a quiet, comfortable space',
        'Use guided meditations as a beginner',
        'Be patient with wandering thoughts',
        'Consistency matters more than duration'
      ]
    },
    'Good Sleep': {
      icon: '😴',
      category: 'physical',
      title: 'Quality Sleep',
      description: 'Optimize your sleep for recovery, health, and peak performance',
      benefits: [
        'Improves memory consolidation',
        'Boosts immune system function',
        'Regulates hormones and metabolism',
        'Enhances mood and emotional stability',
        'Increases physical recovery and repair'
      ],
      dailyGoals: {
        adults: '7-9 hours of quality sleep',
        teens: '8-10 hours of sleep',
        seniors: '7-8 hours of sleep'
      },
      sleepSchedule: [
        { time: '9:00 PM', activity: 'Begin wind-down routine', note: 'Dim lights, reduce stimulation' },
        { time: '9:30 PM', activity: 'No more screens', note: 'Blue light disrupts melatonin' },
        { time: '10:00 PM', activity: 'Reading or relaxation', note: 'Calm activities only' },
        { time: '10:30 PM', activity: 'Bedtime preparation', note: 'Brush teeth, comfortable clothes' },
        { time: '11:00 PM', activity: 'Lights out', note: 'Consistent sleep time' },
        { time: '6:30 AM', activity: 'Natural wake-up', note: '7.5 hours of sleep' }
      ],
      sleepHygiene: [
        { tip: 'Cool Temperature', detail: 'Keep bedroom between 60-67°F (15-19°C)' },
        { tip: 'Dark Environment', detail: 'Use blackout curtains or eye mask' },
        { tip: 'Quiet Space', detail: 'Use earplugs or white noise machine' },
        { tip: 'Comfortable Bedding', detail: 'Invest in quality mattress and pillows' },
        { tip: 'No Electronics', detail: 'Remove phones, TVs, and tablets from bedroom' }
      ],
      bedtimeRoutine: [
        '🛁 Warm bath or shower (raises then lowers body temperature)',
        '📖 Read a physical book (avoid screens)',
        '🧘‍♀️ Light stretching or meditation',
        '📝 Gratitude journaling',
        '🍵 Herbal tea (chamomile, valerian root)',
        '🌙 Progressive muscle relaxation'
      ],
      tips: [
        'Maintain consistent sleep and wake times',
        'Avoid caffeine 6+ hours before bedtime',
        'Get morning sunlight exposure',
        'Exercise regularly, but not close to bedtime',
        'Create a relaxing bedtime ritual'
      ]
    },
    'Reading': {
      icon: '📚',
      category: 'mental',
      title: 'Daily Reading',
      description: 'Expand knowledge and improve cognitive function through regular reading',
      benefits: [
        'Improves vocabulary and language skills',
        'Enhances cognitive function and memory',
        'Reduces stress and promotes relaxation',
        'Increases knowledge and cultural awareness',
        'Improves focus and concentration'
      ],
      dailyGoals: {
        beginner: '15-20 minutes of reading daily',
        intermediate: '30-45 minutes of focused reading',
        advanced: '60+ minutes across multiple genres'
      },
      readingTypes: [
        { type: 'Fiction', benefits: 'Improves empathy and creativity', when: 'Evening relaxation' },
        { type: 'Non-fiction', benefits: 'Expands knowledge and skills', when: 'Morning learning' },
        { type: 'Self-help', benefits: 'Personal development', when: 'Anytime' },
        { type: 'News/Articles', benefits: 'Stay informed', when: 'Morning routine' },
        { type: 'Poetry', benefits: 'Language appreciation', when: 'Quiet moments' }
      ],
      tips: [
        'Set aside dedicated reading time daily',
        'Choose books that genuinely interest you',
        'Keep a reading journal or notes',
        'Join a book club for discussion',
        'Mix different genres for variety'
      ]
    },
    'Journaling': {
      icon: '✍️',
      category: 'mental',
      title: 'Daily Journaling',
      description: 'Process thoughts and emotions through reflective writing',
      benefits: [
        'Improves emotional regulation and self-awareness',
        'Reduces stress and anxiety levels',
        'Enhances problem-solving abilities',
        'Preserves memories and experiences',
        'Clarifies thoughts and goals'
      ],
      dailyGoals: {
        beginner: '5-10 minutes of free writing',
        intermediate: '15-20 minutes of structured journaling',
        advanced: '30+ minutes with multiple techniques'
      },
      journalingTypes: [
        { type: 'Gratitude Journal', description: 'Write 3-5 things you\'re grateful for', when: 'Morning or evening' },
        { type: 'Stream of Consciousness', description: 'Write continuously without editing', when: 'When feeling overwhelmed' },
        { type: 'Goal Setting', description: 'Plan and track personal objectives', when: 'Weekly review' },
        { type: 'Emotional Processing', description: 'Explore and understand feelings', when: 'After difficult experiences' },
        { type: 'Daily Reflection', description: 'Review the day\'s events and lessons', when: 'Before bed' }
      ],
      prompts: [
        'What am I most grateful for today?',
        'What challenged me and how did I grow?',
        'What would make tomorrow even better?',
        'How am I feeling right now and why?',
        'What did I learn about myself today?'
      ],
      tips: [
        'Write without judgment or editing',
        'Be honest and authentic in your entries',
        'Use prompts when you feel stuck',
        'Keep your journal private and safe',
        'Review past entries to see growth'
      ]
    },
    'Gratitude': {
      icon: '🙏',
      category: 'mental',
      title: 'Gratitude Practice',
      description: 'Cultivate appreciation and positive mindset through gratitude',
      benefits: [
        'Increases overall life satisfaction',
        'Improves relationships and social connections',
        'Reduces negative emotions and stress',
        'Enhances sleep quality',
        'Boosts immune system function'
      ],
      dailyGoals: {
        beginner: 'List 3 things you\'re grateful for',
        intermediate: 'Write detailed gratitude entries',
        advanced: 'Practice gratitude meditation and sharing'
      },
      practices: [
        { name: 'Gratitude List', description: 'Write 3-5 specific things you appreciate', time: '5 minutes' },
        { name: 'Gratitude Letter', description: 'Write to someone who helped you', time: '15 minutes' },
        { name: 'Gratitude Meditation', description: 'Focus on appreciation during meditation', time: '10-20 minutes' },
        { name: 'Photo Gratitude', description: 'Take photos of things you appreciate', time: 'Throughout day' },
        { name: 'Gratitude Sharing', description: 'Express appreciation to others', time: 'Ongoing' }
      ],
      tips: [
        'Be specific rather than general',
        'Focus on people more than things',
        'Notice small, everyday blessings',
        'Express gratitude to others directly',
        'Practice even when feeling down'
      ]
    },
    'Time in Nature': {
      icon: '🌳',
      category: 'physical',
      title: 'Nature Connection',
      description: 'Spend time outdoors to restore mental and physical well-being',
      benefits: [
        'Reduces stress hormones and blood pressure',
        'Improves mood and reduces anxiety',
        'Boosts immune system function',
        'Enhances creativity and focus',
        'Increases vitamin D production'
      ],
      dailyGoals: {
        minimum: '15-20 minutes outdoors daily',
        recommended: '30-60 minutes in natural settings',
        optimal: '2+ hours in nature weekly'
      },
      activities: [
        { name: 'Walking in Park', duration: '20-30 min', benefits: 'Light exercise + nature' },
        { name: 'Gardening', duration: '30-60 min', benefits: 'Mindfulness + productivity' },
        { name: 'Hiking', duration: '1-3 hours', benefits: 'Exercise + adventure' },
        { name: 'Outdoor Meditation', duration: '10-20 min', benefits: 'Mindfulness + fresh air' },
        { name: 'Nature Photography', duration: '30-90 min', benefits: 'Creativity + observation' }
      ],
      tips: [
        'Start with your local neighborhood',
        'Leave devices behind when possible',
        'Practice mindful observation',
        'Try different natural settings',
        'Make it a social activity with others'
      ]
    },
    'Social Connection': {
      icon: '👥',
      category: 'social',
      title: 'Social Relationships',
      description: 'Nurture meaningful relationships and social bonds',
      benefits: [
        'Reduces feelings of loneliness and isolation',
        'Improves mental health and resilience',
        'Provides emotional support and understanding',
        'Increases sense of belonging and purpose',
        'May increase lifespan and health'
      ],
      dailyGoals: {
        minimum: 'One meaningful interaction daily',
        recommended: 'Multiple social touchpoints',
        optimal: 'Deep conversations and shared activities'
      },
      activities: [
        { name: 'Phone/Video Call', duration: '15-30 min', type: 'Remote connection' },
        { name: 'Coffee with Friend', duration: '1-2 hours', type: 'In-person bonding' },
        { name: 'Family Dinner', duration: '30-60 min', type: 'Family connection' },
        { name: 'Group Activity', duration: '1-3 hours', type: 'Shared interests' },
        { name: 'Community Volunteering', duration: '2-4 hours', type: 'Service connection' }
      ],
      tips: [
        'Quality matters more than quantity',
        'Be present and listen actively',
        'Share vulnerabilities appropriately',
        'Make regular check-ins with loved ones',
        'Join groups aligned with your interests'
      ]
    },
    'Hobby Time': {
      icon: '🎨',
      category: 'mental',
      title: 'Creative Hobbies',
      description: 'Engage in enjoyable activities that bring fulfillment and joy',
      benefits: [
        'Provides stress relief and relaxation',
        'Enhances creativity and problem-solving',
        'Builds sense of accomplishment',
        'Offers social connection opportunities',
        'Maintains cognitive function and learning'
      ],
      dailyGoals: {
        minimum: '15-30 minutes of hobby time',
        recommended: '45-60 minutes of focused engagement',
        optimal: 'Several hours for deep immersion'
      },
      hobbyTypes: [
        { category: 'Creative', examples: 'Drawing, painting, writing, music, crafts', benefits: 'Self-expression' },
        { category: 'Physical', examples: 'Sports, dancing, martial arts, yoga', benefits: 'Fitness + fun' },
        { category: 'Mental', examples: 'Puzzles, chess, learning languages', benefits: 'Cognitive stimulation' },
        { category: 'Social', examples: 'Board games, team sports, clubs', benefits: 'Connection + enjoyment' },
        { category: 'Outdoor', examples: 'Gardening, hiking, photography', benefits: 'Nature + activity' }
      ],
      tips: [
        'Choose activities you genuinely enjoy',
        'Don\'t worry about being perfect',
        'Set aside dedicated hobby time',
        'Try new hobbies to discover interests',
        'Share your hobbies with others'
      ]
    },
    'Healthy Meal': {
      icon: '🥗',
      category: 'physical',
      title: 'Nutritious Eating',
      description: 'Fuel your body with wholesome, balanced nutrition',
      benefits: [
        'Provides sustained energy throughout day',
        'Supports immune system function',
        'Improves mood and cognitive function',
        'Maintains healthy weight and metabolism',
        'Reduces risk of chronic diseases'
      ],
      dailyGoals: {
        minimum: 'One balanced, home-cooked meal',
        recommended: 'Majority of meals are nutritious',
        optimal: 'All meals planned and nutrient-dense'
      },
      mealComponents: [
        { component: 'Vegetables', portion: '1/2 plate', examples: 'Leafy greens, colorful veggies' },
        { component: 'Lean Protein', portion: '1/4 plate', examples: 'Fish, chicken, beans, tofu' },
        { component: 'Whole Grains', portion: '1/4 plate', examples: 'Brown rice, quinoa, oats' },
        { component: 'Healthy Fats', portion: 'Small amount', examples: 'Avocado, nuts, olive oil' },
        { component: 'Fruits', portion: '1-2 servings', examples: 'Fresh, seasonal varieties' }
      ],
      tips: [
        'Plan meals ahead of time',
        'Cook at home when possible',
        'Include variety and color',
        'Listen to hunger and fullness cues',
        'Stay hydrated with meals'
      ]
    },
    'Self Care': {
      icon: '✨',
      category: 'mental',
      title: 'Personal Self-Care',
      description: 'Prioritize your physical and emotional well-being',
      benefits: [
        'Reduces stress and prevents burnout',
        'Improves self-esteem and confidence',
        'Enhances overall life satisfaction',
        'Builds resilience for challenges',
        'Models healthy behavior for others'
      ],
      dailyGoals: {
        minimum: '15-20 minutes of intentional self-care',
        recommended: '30-45 minutes across multiple activities',
        optimal: 'Self-care integrated throughout the day'
      },
      activities: [
        { category: 'Physical', examples: 'Bath, skincare, massage, stretching', time: '15-30 min' },
        { category: 'Mental', examples: 'Meditation, reading, puzzles, music', time: '20-45 min' },
        { category: 'Emotional', examples: 'Journaling, therapy, boundaries', time: '15-60 min' },
        { category: 'Social', examples: 'Time with loved ones, saying no', time: 'Variable' },
        { category: 'Spiritual', examples: 'Prayer, nature, reflection', time: '10-30 min' }
      ],
      tips: [
        'Self-care is not selfish - it\'s necessary',
        'Find activities that truly restore you',
        'Schedule self-care like important appointments',
        'Start small and build consistency',
        'Adjust self-care based on your needs'
      ]
    }
  };

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

  const openHabitDetail = (habit) => {
    const habitData = professionalHabitData[habit.name];
    if (habitData) {
      setSelectedHabit({ ...habit, ...habitData });
      setShowHabitDetail(true);
    }
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
    <div className="p-4 max-w-6xl mx-auto">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 dark:from-green-600 dark:via-emerald-600 dark:to-teal-600 rounded-3xl p-6 text-white mb-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Professional Habits Tracker</h1>
            <p className="text-white/90 text-lg">Build lasting habits with expert guidance and detailed tracking</p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-white/20 hover:bg-white/30 rounded-xl p-3 transition"
          >
            <Settings size={28} />
          </button>
        </div>
        
        {/* Enhanced Progress */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Today's Progress</span>
              <span className="font-bold text-lg">{todayCompleted}/{totalEnabled}</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3">
              <div 
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${totalEnabled > 0 ? (todayCompleted / totalEnabled) * 100 : 0}%` }}
              />
            </div>
          </div>
          
          <div className="bg-white/20 rounded-xl p-4">
            <div className="text-sm font-medium mb-1">Weekly Average</div>
            <div className="text-2xl font-bold">
              {Object.values(stats).length > 0 
                ? Math.round(Object.values(stats).reduce((sum, stat) => sum + stat.rate, 0) / Object.values(stats).length)
                : 0}%
            </div>
          </div>
          
          <div className="bg-white/20 rounded-xl p-4">
            <div className="text-sm font-medium mb-1">Best Streak</div>
            <div className="text-2xl font-bold">
              {habits.length > 0 
                ? Math.max(...habits.map(h => getStreak(currentUser.userId, h.id)))
                : 0} days 🔥
            </div>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-xl mb-4 text-gray-900 dark:text-white">Manage Your Habits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {habits.map(habit => (
              <div key={habit.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{habit.icon}</span>
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white block">{habit.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{habit.category}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleHabitEnabled(habit.id)}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
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
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-6 py-3 rounded-xl font-medium whitespace-nowrap transition ${
              selectedCategory === cat.id
                ? 'bg-indigo-500 text-white shadow-lg scale-105'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'
            }`}
          >
            <span className="mr-2 text-lg">{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Professional Habits Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {filteredHabits.map(habit => {
          const loggedToday = isHabitLoggedToday(currentUser.userId, habit.id);
          const streak = getStreak(currentUser.userId, habit.id);
          const habitStat = stats[habit.id] || { count: 0, rate: 0 };
          const habitData = professionalHabitData[habit.name];

          return (
            <div
              key={habit.id}
              className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 transition-all duration-300 overflow-hidden ${
                loggedToday
                  ? 'border-green-500 shadow-green-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
              }`}
            >
              {/* Habit Header */}
              <div className={`p-6 ${loggedToday ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' : 'bg-gray-50 dark:bg-gray-700'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-4xl">{habit.icon}</div>
                  {loggedToday && (
                    <CheckCircle className="text-white" size={24} />
                  )}
                </div>
                <h3 className={`font-bold text-lg mb-1 ${loggedToday ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                  {habit.name}
                </h3>
                <p className={`text-sm ${loggedToday ? 'text-white/90' : 'text-gray-600 dark:text-gray-400'}`}>
                  {habitData?.description || 'Build this healthy habit'}
                </p>
              </div>

              {/* Habit Stats */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{streak}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Day Streak</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{habitStat.rate.toFixed(0)}%</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Success Rate</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={() => openHabitDetail(habit)}
                    className="w-full py-3 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
                  >
                    <Sparkles size={18} />
                    View Professional Guide
                  </button>
                  
                  <button
                    onClick={() => toggleHabit(habit.id)}
                    className={`w-full py-3 px-4 rounded-xl font-medium transition ${
                      loggedToday
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {loggedToday ? '✓ Completed Today' : 'Mark as Complete'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Professional Habit Detail Popup */}
      {showHabitDetail && selectedHabit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-5xl">{selectedHabit.icon}</div>
                  <div>
                    <h2 className="text-3xl font-bold">{selectedHabit.title}</h2>
                    <p className="text-white/90 text-lg">{selectedHabit.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHabitDetail(false)}
                  className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/20 rounded-lg"
                >
                  <X size={28} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-8">
              {/* Benefits Section */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Heart className="text-red-500" size={24} />
                  Health Benefits
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedHabit.benefits?.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={18} />
                      <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Daily Goals */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Target className="text-blue-500" size={24} />
                  Daily Goals & Recommendations
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(selectedHabit.dailyGoals || {}).map(([level, goal]) => (
                    <div key={level} className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                      <div className="font-semibold text-blue-800 dark:text-blue-200 capitalize mb-2">{level}</div>
                      <div className="text-blue-700 dark:text-blue-300 text-sm">{goal}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exercise-specific content */}
              {selectedHabit.name === 'Exercise' && selectedHabit.exercises && (
                <div className="space-y-6">
                  {/* Cardio Exercises */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Activity className="text-red-500" size={20} />
                      Cardio Exercises
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.exercises.cardio.map((exercise, index) => (
                        <div key={index} className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                          <div className="font-semibold text-red-800 dark:text-red-200 mb-2">{exercise.name}</div>
                          <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                            <div>⏱️ Duration: {exercise.duration}</div>
                            <div>🔥 Intensity: {exercise.intensity}</div>
                            <div>📊 Calories: {exercise.calories}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Strength Exercises */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Award className="text-orange-500" size={20} />
                      Strength Training
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.exercises.strength.map((exercise, index) => (
                        <div key={index} className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
                          <div className="font-semibold text-orange-800 dark:text-orange-200 mb-2">{exercise.name}</div>
                          <div className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                            <div>🔢 Reps: {exercise.reps}</div>
                            <div>🎯 Target: {exercise.target}</div>
                            <div>🏋️ Equipment: {exercise.equipment}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Flexibility */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Circle className="text-purple-500" size={20} />
                      Flexibility & Recovery
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.exercises.flexibility.map((exercise, index) => (
                        <div key={index} className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                          <div className="font-semibold text-purple-800 dark:text-purple-200 mb-2">{exercise.name}</div>
                          <div className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                            <div>⏱️ Duration: {exercise.duration}</div>
                            <div>🎯 Focus: {exercise.focus}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Water-specific content */}
              {selectedHabit.name === 'Drink Water' && selectedHabit.hydrationSchedule && (
                <div className="space-y-6">
                  {/* Hydration Schedule */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Clock className="text-blue-500" size={20} />
                      Daily Hydration Schedule
                    </h4>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                      <div className="space-y-3">
                        {selectedHabit.hydrationSchedule.map((schedule, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="text-blue-600 dark:text-blue-400 font-mono font-bold">{schedule.time}</div>
                              <div className="text-gray-700 dark:text-gray-300">{schedule.amount}</div>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{schedule.note}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Water Types */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Sparkles className="text-cyan-500" size={20} />
                      Types of Hydration
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.waterTypes.map((water, index) => (
                        <div key={index} className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-4 border border-cyan-200 dark:border-cyan-800">
                          <div className="font-semibold text-cyan-800 dark:text-cyan-200 mb-2">{water.type}</div>
                          <div className="text-sm text-cyan-700 dark:text-cyan-300 space-y-1">
                            <div>✨ Benefits: {water.benefits}</div>
                            <div>⏰ Best Time: {water.when}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Meditation-specific content */}
              {selectedHabit.name === 'Meditation' && selectedHabit.techniques && (
                <div className="space-y-6">
                  {/* Meditation Techniques */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Circle className="text-indigo-500" size={20} />
                      Meditation Techniques
                    </h4>
                    <div className="space-y-4">
                      {selectedHabit.techniques.map((technique, index) => (
                        <div key={index} className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="font-semibold text-indigo-800 dark:text-indigo-200 text-lg">{technique.name}</div>
                              <div className="text-indigo-600 dark:text-indigo-400 text-sm">{technique.duration}</div>
                            </div>
                          </div>
                          <div className="text-indigo-700 dark:text-indigo-300 mb-3">{technique.description}</div>
                          <div className="space-y-2">
                            <div className="font-medium text-indigo-800 dark:text-indigo-200 text-sm">Steps:</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {technique.steps.map((step, stepIndex) => (
                                <div key={stepIndex} className="flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-300">
                                  <div className="w-5 h-5 bg-indigo-200 dark:bg-indigo-800 rounded-full flex items-center justify-center text-xs font-bold">
                                    {stepIndex + 1}
                                  </div>
                                  {step}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Apps */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Phone className="text-green-500" size={20} />
                      Recommended Apps
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.apps.map((app, index) => (
                        <div key={index} className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                          <div className="font-semibold text-green-800 dark:text-green-200 mb-2">{app.name}</div>
                          <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                            <div>📱 Type: {app.type}</div>
                            <div>💰 Price: {app.price}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Sleep-specific content */}
              {selectedHabit.name === 'Good Sleep' && selectedHabit.sleepSchedule && (
                <div className="space-y-6">
                  {/* Sleep Schedule */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Moon className="text-purple-500" size={20} />
                      Optimal Sleep Schedule
                    </h4>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                      <div className="space-y-3">
                        {selectedHabit.sleepSchedule.map((schedule, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="text-purple-600 dark:text-purple-400 font-mono font-bold">{schedule.time}</div>
                              <div className="text-gray-700 dark:text-gray-300 font-medium">{schedule.activity}</div>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{schedule.note}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sleep Hygiene */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Shield className="text-blue-500" size={20} />
                      Sleep Hygiene Tips
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.sleepHygiene.map((tip, index) => (
                        <div key={index} className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                          <div className="font-semibold text-blue-800 dark:text-blue-200 mb-2">{tip.tip}</div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">{tip.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bedtime Routine */}
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Sun className="text-yellow-500" size={20} />
                      Bedtime Routine Ideas
                    </h4>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedHabit.bedtimeRoutine.map((routine, index) => (
                          <div key={index} className="flex items-center gap-3 p-2 bg-white dark:bg-gray-800 rounded-lg">
                            <div className="text-2xl">{routine.split(' ')[0]}</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">{routine.substring(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reading-specific content */}
              {selectedHabit.name === 'Reading' && selectedHabit.readingTypes && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Activity className="text-indigo-500" size={20} />
                    Reading Types & Benefits
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedHabit.readingTypes.map((type, index) => (
                      <div key={index} className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                        <div className="font-semibold text-indigo-800 dark:text-indigo-200 mb-2">{type.type}</div>
                        <div className="text-sm text-indigo-700 dark:text-indigo-300 space-y-1">
                          <div>📚 Benefits: {type.benefits}</div>
                          <div>⏰ Best Time: {type.when}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Journaling-specific content */}
              {selectedHabit.name === 'Journaling' && selectedHabit.journalingTypes && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Activity className="text-purple-500" size={20} />
                      Journaling Techniques
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedHabit.journalingTypes.map((type, index) => (
                        <div key={index} className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                          <div className="font-semibold text-purple-800 dark:text-purple-200 mb-2">{type.type}</div>
                          <div className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                            <div>📝 {type.description}</div>
                            <div>⏰ {type.when}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Writing Prompts</h4>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                      <div className="space-y-2">
                        {selectedHabit.prompts.map((prompt, index) => (
                          <div key={index} className="flex items-start gap-3 p-2 bg-white dark:bg-gray-800 rounded-lg">
                            <div className="w-6 h-6 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                              {index + 1}
                            </div>
                            <span className="text-sm text-gray-700 dark:text-gray-300">{prompt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Gratitude-specific content */}
              {selectedHabit.name === 'Gratitude' && selectedHabit.practices && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Heart className="text-pink-500" size={20} />
                    Gratitude Practices
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedHabit.practices.map((practice, index) => (
                      <div key={index} className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4 border border-pink-200 dark:border-pink-800">
                        <div className="font-semibold text-pink-800 dark:text-pink-200 mb-2">{practice.name}</div>
                        <div className="text-sm text-pink-700 dark:text-pink-300 space-y-1">
                          <div>📝 {practice.description}</div>
                          <div>⏱️ Time: {practice.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nature-specific content */}
              {selectedHabit.name === 'Time in Nature' && selectedHabit.activities && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Activity className="text-green-500" size={20} />
                    Nature Activities
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedHabit.activities.map((activity, index) => (
                      <div key={index} className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                        <div className="font-semibold text-green-800 dark:text-green-200 mb-2">{activity.name}</div>
                        <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                          <div>⏱️ Duration: {activity.duration}</div>
                          <div>✨ Benefits: {activity.benefits}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Connection-specific content */}
              {selectedHabit.name === 'Social Connection' && selectedHabit.activities && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Users className="text-blue-500" size={20} />
                    Connection Activities
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedHabit.activities.map((activity, index) => (
                      <div key={index} className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                        <div className="font-semibold text-blue-800 dark:text-blue-200 mb-2">{activity.name}</div>
                        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                          <div>⏱️ Duration: {activity.duration}</div>
                          <div>🤝 Type: {activity.type}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hobby-specific content */}
              {selectedHabit.name === 'Hobby Time' && selectedHabit.hobbyTypes && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Sparkles className="text-orange-500" size={20} />
                    Hobby Categories
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {selectedHabit.hobbyTypes.map((type, index) => (
                      <div key={index} className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
                        <div className="font-semibold text-orange-800 dark:text-orange-200 mb-2">{type.category}</div>
                        <div className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                          <div>🎯 Examples: {type.examples}</div>
                          <div>✨ Benefits: {type.benefits}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Healthy Meal-specific content */}
              {selectedHabit.name === 'Healthy Meal' && selectedHabit.mealComponents && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Activity className="text-emerald-500" size={20} />
                    Balanced Meal Components
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedHabit.mealComponents.map((component, index) => (
                      <div key={index} className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                        <div className="font-semibold text-emerald-800 dark:text-emerald-200 mb-2">{component.component}</div>
                        <div className="text-sm text-emerald-700 dark:text-emerald-300 space-y-1">
                          <div>🥄 Portion: {component.portion}</div>
                          <div>🥗 Examples: {component.examples}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Self Care-specific content */}
              {selectedHabit.name === 'Self Care' && selectedHabit.activities && (
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Sparkles className="text-rose-500" size={20} />
                    Self-Care Activities
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedHabit.activities.map((activity, index) => (
                      <div key={index} className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-4 border border-rose-200 dark:border-rose-800">
                        <div className="font-semibold text-rose-800 dark:text-rose-200 mb-2">{activity.category}</div>
                        <div className="text-sm text-rose-700 dark:text-rose-300 space-y-1">
                          <div>✨ Examples: {activity.examples}</div>
                          <div>⏱️ Time: {activity.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pro Tips */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Award className="text-yellow-500" size={24} />
                  Professional Tips
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedHabit.tips?.map((tip, index) => (
                    <div key={index} className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <span className="text-yellow-800 dark:text-yellow-200">{tip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    const logged = isHabitLoggedToday(currentUser.userId, selectedHabit.id);
                    if (logged) {
                      unlogHabit(currentUser.userId, selectedHabit.id);
                    } else {
                      logHabit(currentUser.userId, selectedHabit.id);
                    }
                    const habitStats = getHabitStats(currentUser.userId, 30);
                    setStats(habitStats);
                    setShowHabitDetail(false);
                  }}
                  className={`flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition ${
                    isHabitLoggedToday(currentUser.userId, selectedHabit.id)
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                  }`}
                >
                  {isHabitLoggedToday(currentUser.userId, selectedHabit.id) ? '✓ Completed Today' : 'Mark as Complete'}
                </button>
                <button
                  onClick={() => setShowHabitDetail(false)}
                  className="px-6 py-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-6 animate-fade-in-up">
            FitMood
          </h1>

          {/* Subtitle */}
          <p className="text-xl sm:text-2xl md:text-3xl text-white/90 mb-4 font-light animate-fade-in-up-delay px-4">
            Track Your Emotions, Improve Your Life
          </p>
          <p className="text-base sm:text-lg md:text-xl text-white/80 mb-12 max-w-2xl mx-auto animate-fade-in-up-delay-2 px-4">
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
      const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (user.phone && user.phone.toString().includes(searchTerm));
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
                {userDetails.user.phone && <span>{userDetails.user.phone}</span>}
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
                    <span className="font-medium text-gray-900 dark:text-white">{userDetails.user.phone || 'Not provided'}</span>
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
                      {mood.activities && Array.isArray(mood.activities) && mood.activities.length > 0 && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Activities: {mood.activities.join(', ')}
                        </div>
                      )}
                      {mood.activities && typeof mood.activities === 'string' && mood.activities.trim() && (
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Activities: {mood.activities}
                        </div>
                      )}
                      {mood.triggers && mood.triggers.trim() && (
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
    <div className="p-3 md:p-4 max-w-7xl mx-auto">
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Admin Dashboard</h1>
        <p className="text-sm md:text-base text-gray-600 dark:text-gray-400">Manage users and monitor app activity</p>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl md:rounded-2xl shadow-lg p-3 md:p-4 text-white">
          <div className="text-2xl md:text-3xl font-bold">{allUsers.length}</div>
          <div className="text-xs md:text-sm opacity-90">Total Users</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl md:rounded-2xl shadow-lg p-3 md:p-4 text-white">
          <div className="text-2xl md:text-3xl font-bold">
            {allUsers.filter(u => u.role === 'admin').length}
          </div>
          <div className="text-xs md:text-sm opacity-90">Admins</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl md:rounded-2xl shadow-lg p-3 md:p-4 text-white">
          <div className="text-2xl md:text-3xl font-bold">
            {allUsers.filter(u => u.hasPassword).length}
          </div>
          <div className="text-xs md:text-sm opacity-90">With Passwords</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl md:rounded-2xl shadow-lg p-3 md:p-4 text-white">
          <div className="text-2xl md:text-3xl font-bold">
            {allUsers.filter(u => u.migrationStatus === 'completed').length}
          </div>
          <div className="text-xs md:text-sm opacity-90">Migrated</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 md:p-6 mb-6 border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col gap-3">
          <div className="w-full">
            <input
              type="text"
              placeholder="Search users by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm md:text-base"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm md:text-base"
            >
              <option value="all">All Roles</option>
              <option value="user">Users</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm md:text-base"
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
              <div key={user.userId} className="p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{user.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => viewUserDetails(user.userId)}
                      className="flex-1 md:flex-none px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs md:text-sm transition-colors whitespace-nowrap"
                    >
                      👁️ <span className="hidden sm:inline">View Details</span><span className="sm:hidden">View</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUserForAction(user);
                        setActionType('message');
                        setShowUserModal(true);
                      }}
                      className="flex-1 md:flex-none px-3 md:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs md:text-sm transition-colors whitespace-nowrap"
                    >
                      📧 <span className="hidden sm:inline">Message</span><span className="sm:hidden">Msg</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUserForAction(user);
                        setActionType('role');
                        setShowUserModal(true);
                      }}
                      className="flex-1 md:flex-none px-3 md:px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs md:text-sm transition-colors whitespace-nowrap"
                    >
                      👑 <span className="hidden sm:inline">Role</span>
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs md:text-sm text-gray-500 dark:text-gray-400 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="flex items-center gap-1">📅 Joined: {new Date(user.createdAt).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1">🕒 Last Active: {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never'}</span>
                  {user.phone && <span className="flex items-center gap-1">📱 {user.phone}</span>}
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
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-yellow-500 dark:bg-yellow-600 text-white text-center py-1 text-xs">
          <WifiOff size={12} className="inline mr-1" />
          Offline
        </div>
      )}
      
      {/* Navigation container */}
      <div className="relative">
        {/* Desktop: Center navigation, Mobile: Scrollable */}
        <div className="lg:hidden overflow-x-auto overflow-y-hidden scrollbar-hide">
          {/* Mobile scrollable navigation */}
          <div className="flex py-2 px-2 min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`flex flex-col items-center py-2 px-3 rounded-xl transition flex-shrink-0 ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs mt-1 whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={toggleDarkMode}
              className="flex flex-col items-center py-2 px-3 rounded-xl transition text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex-shrink-0"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              <span className="text-xs mt-1 whitespace-nowrap">Theme</span>
            </button>
          </div>
        </div>

        {/* Desktop navigation - centered and properly spaced */}
        <div className="hidden lg:block">
          <div className="max-w-6xl mx-auto flex justify-center py-3 px-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`flex flex-col items-center py-3 px-6 rounded-xl transition ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`}
                >
                  <Icon size={24} />
                  <span className="text-sm mt-2 font-medium">{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={toggleDarkMode}
              className="flex flex-col items-center py-3 px-6 rounded-xl transition text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              {darkMode ? <Sun size={24} /> : <Moon size={24} />}
              <span className="text-sm mt-2 font-medium">Theme</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
