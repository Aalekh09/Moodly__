// Self-Care Habits Management
import { getStorageItem, setStorageItem, getStorageKey } from './migration';

const DEFAULT_HABITS = [
  { id: 'exercise', name: 'Exercise', icon: '💪', category: 'physical' },
  { id: 'meditation', name: 'Meditation', icon: '🧘', category: 'mental' },
  { id: 'reading', name: 'Reading', icon: '📚', category: 'mental' },
  { id: 'journaling', name: 'Journaling', icon: '✍️', category: 'mental' },
  { id: 'water', name: 'Drink Water', icon: '💧', category: 'physical' },
  { id: 'sleep', name: 'Good Sleep', icon: '😴', category: 'physical' },
  { id: 'gratitude', name: 'Gratitude', icon: '🙏', category: 'mental' },
  { id: 'nature', name: 'Time in Nature', icon: '🌳', category: 'physical' },
  { id: 'social', name: 'Social Connection', icon: '👥', category: 'social' },
  { id: 'hobby', name: 'Hobby Time', icon: '🎨', category: 'mental' },
  { id: 'healthy_meal', name: 'Healthy Meal', icon: '🥗', category: 'physical' },
  { id: 'self_care', name: 'Self Care', icon: '✨', category: 'mental' }
];

const HABIT_CATEGORIES = {
  physical: { name: 'Physical', color: 'bg-blue-500' },
  mental: { name: 'Mental', color: 'bg-purple-500' },
  social: { name: 'Social', color: 'bg-pink-500' }
};

export const getDefaultHabits = () => DEFAULT_HABITS;

export const getHabitCategories = () => HABIT_CATEGORIES;

export const saveUserHabits = (userId, habits) => {
  try {
    setStorageItem(`habits_${userId}`, JSON.stringify(habits));
    return true;
  } catch (error) {
    console.error('Error saving habits:', error);
    return false;
  }
};

export const getUserHabits = (userId) => {
  try {
    const stored = getStorageItem(`habits_${userId}`);
    if (stored) {
      return JSON.parse(stored);
    }
    // Return default habits if none saved
    return DEFAULT_HABITS.map(h => ({ ...h, enabled: true }));
  } catch (error) {
    console.error('Error loading habits:', error);
    return DEFAULT_HABITS.map(h => ({ ...h, enabled: true }));
  }
};

export const logHabit = (userId, habitId, date = new Date().toDateString()) => {
  try {
    const key = `habit_log_${userId}`;
    const logs = JSON.parse(getStorageItem(key) || '{}');
    
    if (!logs[date]) {
      logs[date] = [];
    }
    
    if (!logs[date].includes(habitId)) {
      logs[date].push(habitId);
      setStorageItem(key, JSON.stringify(logs));
      return true;
    }
    return false; // Already logged
  } catch (error) {
    console.error('Error logging habit:', error);
    return false;
  }
};

export const unlogHabit = (userId, habitId, date = new Date().toDateString()) => {
  try {
    const key = `habit_log_${userId}`;
    const logs = JSON.parse(getStorageItem(key) || '{}');
    
    if (logs[date]) {
      logs[date] = logs[date].filter(id => id !== habitId);
      setStorageItem(key, JSON.stringify(logs));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error unlogging habit:', error);
    return false;
  }
};

export const getHabitLogs = (userId, startDate, endDate) => {
  try {
    const key = `habit_log_${userId}`;
    const logs = JSON.parse(getStorageItem(key) || '{}');
    const result = {};
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toDateString();
      result[dateStr] = logs[dateStr] || [];
    }
    
    return result;
  } catch (error) {
    console.error('Error getting habit logs:', error);
    return {};
  }
};

export const getHabitStats = (userId, days = 30) => {
  try {
    const key = `habit_log_${userId}`;
    const logs = JSON.parse(getStorageItem(key) || '{}');
    const stats = {};
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Count occurrences of each habit
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toDateString();
      const dayHabits = logs[dateStr] || [];
      dayHabits.forEach(habitId => {
        stats[habitId] = (stats[habitId] || 0) + 1;
      });
    }
    
    // Calculate completion rates
    const habits = getUserHabits(userId);
    const completionRates = {};
    
    habits.forEach(habit => {
      if (habit.enabled) {
        const count = stats[habit.id] || 0;
        completionRates[habit.id] = {
          count,
          rate: (count / days) * 100,
          habit: habit
        };
      }
    });
    
    return completionRates;
  } catch (error) {
    console.error('Error getting habit stats:', error);
    return {};
  }
};

export const getStreak = (userId, habitId) => {
  try {
    const key = `habit_log_${userId}`;
    const logs = JSON.parse(getStorageItem(key) || '{}');
    let streak = 0;
    const today = new Date();
    
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toDateString();
      
      if (logs[dateStr] && logs[dateStr].includes(habitId)) {
        streak++;
      } else if (i > 0) {
        break; // Streak broken
      }
    }
    
    return streak;
  } catch (error) {
    console.error('Error getting streak:', error);
    return 0;
  }
};

export const isHabitLoggedToday = (userId, habitId) => {
  const today = new Date().toDateString();
  const key = `habit_log_${userId}`;
  const logs = JSON.parse(getStorageItem(key) || '{}');
  return logs[today] && logs[today].includes(habitId);
};

