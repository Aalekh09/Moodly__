// Offline Storage Utility using IndexedDB
const DB_NAME = 'fitmood_db';
const DB_VERSION = 1;
const STORES = {
  moods: 'moods',
  syncQueue: 'syncQueue',
  settings: 'settings'
};

let db = null;

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORES.moods)) {
        const moodStore = database.createObjectStore(STORES.moods, { keyPath: 'id', autoIncrement: true });
        moodStore.createIndex('userId', 'userId', { unique: false });
        moodStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.syncQueue)) {
        const syncStore = database.createObjectStore(STORES.syncQueue, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('action', 'action', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.settings)) {
        database.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };
  });
};

export const saveMoodOffline = async (moodData) => {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.moods, STORES.syncQueue], 'readwrite');
    const moodStore = transaction.objectStore(STORES.moods);
    const syncStore = transaction.objectStore(STORES.syncQueue);

    const moodWithId = {
      ...moodData,
      id: Date.now(),
      synced: false
    };

    const request = moodStore.add(moodWithId);
    
    request.onsuccess = () => {
      // Add to sync queue
      syncStore.add({
        action: 'addMood',
        payload: moodData,
        timestamp: Date.now()
      });
      resolve(moodWithId);
    };
    
    request.onerror = () => reject(request.error);
  });
};

export const getMoodsOffline = async (userId) => {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.moods], 'readonly');
    const store = transaction.objectStore(STORES.moods);
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const syncOfflineData = async (apiCall) => {
  if (!db) await initDB();
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.syncQueue], 'readonly');
    const store = transaction.objectStore(STORES.syncQueue);
    const request = store.getAll();

    request.onsuccess = async () => {
      const queue = request.result;
      let synced = 0;
      let failed = 0;

      for (const item of queue) {
        try {
          await apiCall(item.action, item.payload);
          // Remove from queue
          const deleteTransaction = db.transaction([STORES.syncQueue], 'readwrite');
          deleteTransaction.objectStore(STORES.syncQueue).delete(item.id);
          synced++;
        } catch (error) {
          console.error('Sync failed:', error);
          failed++;
        }
      }

      resolve({ synced, failed });
    };

    request.onerror = () => reject(request.error);
  });
};

export const saveSetting = async (key, value) => {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.settings], 'readwrite');
    const store = transaction.objectStore(STORES.settings);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getSetting = async (key) => {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.settings], 'readonly');
    const store = transaction.objectStore(STORES.settings);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
};

