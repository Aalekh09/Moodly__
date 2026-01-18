import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, X, RefreshCw } from 'lucide-react';
import { migrationService } from '../utils/migration';

export default function MigrationNotification() {
  const [migrationStats, setMigrationStats] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = () => {
    const stats = migrationService.getMigrationStats();
    setMigrationStats(stats);
    
    // Show notification if migration just completed and user has migrated data
    if (stats.isComplete && stats.newKeysCount > 0 && !dismissed) {
      const dismissedKey = 'fitmood_migration_notification_dismissed';
      const alreadyDismissed = localStorage.getItem(dismissedKey);
      
      if (!alreadyDismissed) {
        setShowNotification(true);
      }
    }
  };

  const handleDismiss = () => {
    setShowNotification(false);
    setDismissed(true);
    localStorage.setItem('fitmood_migration_notification_dismissed', 'true');
  };

  const handleCleanup = async () => {
    try {
      const result = migrationService.cleanupOldKeys();
      if (result.success) {
        console.log('Cleanup completed:', result.message);
        setMigrationStats(prev => ({ ...prev, oldKeysCount: 0, needsCleanup: false }));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  if (!showNotification || !migrationStats) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Welcome to FitMood!
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Your data has been successfully migrated from Moodly. All your mood history and preferences are preserved.
            </p>
            
            {migrationStats.needsCleanup && (
              <div className="mt-3">
                <button
                  onClick={handleCleanup}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clean up old data
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Migration status indicator for development/debugging
export function MigrationStatusIndicator() {
  const [stats, setStats] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const migrationStats = migrationService.getMigrationStats();
    setStats(migrationStats);
  }, []);

  if (!stats || process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
          stats.isComplete 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
        }`}
      >
        Migration: {stats.isComplete ? 'Complete' : 'Pending'}
      </button>
      
      {showDetails && (
        <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-64">
          <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">
            Migration Status
          </h4>
          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
            <div>Status: {stats.isComplete ? 'Complete' : 'Pending'}</div>
            <div>Old keys: {stats.oldKeysCount}</div>
            <div>New keys: {stats.newKeysCount}</div>
            <div>Needs cleanup: {stats.needsCleanup ? 'Yes' : 'No'}</div>
            {stats.migrationDate && (
              <div>Date: {stats.migrationDate.toLocaleDateString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}