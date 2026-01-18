// Push Notifications Utility
import { getStorageItem, setStorageItem, getStorageKey } from './migration';

let registration = null;
let permission = null;

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    return { granted: false, error: 'Notifications not supported' };
  }

  if (Notification.permission === 'granted') {
    return { granted: true };
  }

  if (Notification.permission !== 'denied') {
    permission = await Notification.requestPermission();
    return { granted: permission === 'granted' };
  }

  return { granted: false, error: 'Permission denied' };
};

export const scheduleDailyReminder = async (time = '09:00') => {
  if (!('serviceWorker' in navigator)) return;

  try {
    registration = await navigator.serviceWorker.ready;
    
    // Cancel existing notifications
    const notifications = await registration.getNotifications();
    notifications.forEach(n => n.close());

    // Schedule daily notification
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime.getTime() - now.getTime();

    setTimeout(() => {
      showNotification('Daily Mood Check-in', 'How are you feeling today? Take a moment to log your mood.');
      // Schedule next day
      scheduleDailyReminder(time);
    }, delay);

    // Store reminder time
    setStorageItem('reminder_time', time);
  } catch (error) {
    console.error('Error scheduling reminder:', error);
  }
};

export const showNotification = (title, options = {}) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notificationOptions = {
    body: options.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: options.tag || 'fitmood-notification',
    requireInteraction: false,
    ...options
  };

  if (registration) {
    registration.showNotification(title, notificationOptions);
  } else {
    new Notification(title, notificationOptions);
  }
};

export const cancelReminders = () => {
  if (registration) {
    registration.getNotifications().then(notifications => {
      notifications.forEach(n => n.close());
    });
  }
  localStorage.removeItem(getStorageKey('reminder_time'));
};

export const isNotificationSupported = () => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

