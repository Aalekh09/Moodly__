import React, { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { validatePassword } from '../utils/auth';
import { useAuth } from '../contexts/AuthContext';

export default function PasswordSetupPrompt() {
  const { setupPassword, skipPasswordSetup, loading, error } = useAuth();
  
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [focusedField, setFocusedField] = useState(null);

  // Password validation effect
  React.useEffect(() => {
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
    
    if (formData.password !== formData.confirmPassword) {
      return;
    }

    const validation = validatePassword(formData.password);
    if (!validation.isValid) {
      return;
    }

    await setupPassword(formData.password);
  };

  const handleSkip = () => {
    skipPasswordSetup();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Secure Your Account
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome to FitMood! Set up a password to keep your data secure.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Password Field */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Create Password
            </label>
            <div className="relative">
              <div className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                focusedField === 'password' ? 'text-blue-500 dark:text-blue-400' : ''
              }`}>
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                className={`w-full pl-10 pr-10 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                  focusedField === 'password'
                    ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <div className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors ${
                focusedField === 'confirmPassword' ? 'text-blue-500 dark:text-blue-400' : ''
              }`}>
                <Shield size={18} />
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                className={`w-full pl-10 pr-10 py-3 rounded-lg border-2 transition-all duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ${
                  focusedField === 'confirmPassword'
                    ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Passwords do not match
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip for now
            </button>
            <button
              type="submit"
              disabled={loading || formData.password !== formData.confirmPassword || passwordErrors.length > 0}
              className="flex-1 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Setting up...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Set Password
                </>
              )}
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Your password will be encrypted and stored securely. You can always set this up later in your profile settings.
          </p>
        </div>
      </div>
    </div>
  );
}