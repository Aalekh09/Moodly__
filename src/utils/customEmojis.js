// Custom Mood Emojis Management
import { getStorageItem, setStorageItem } from './migration';

const DEFAULT_EMOJIS = ['😢', '😟', '😐', '🙂', '😊'];
const EMOJI_PRESETS = {
  default: ['😢', '😟', '😐', '🙂', '😊'],
  colorful: ['💔', '😔', '😑', '😌', '😄'],
  nature: ['🌧️', '☁️', '🌤️', '☀️', '🌈'],
  animals: ['😿', '😾', '😼', '😸', '😻'],
  faces: ['😭', '😢', '😐', '🙂', '😁']
};

export const getCustomEmojis = (userId) => {
  const stored = getStorageItem(`emojis_${userId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_EMOJIS;
    }
  }
  return DEFAULT_EMOJIS;
};

export const saveCustomEmojis = (userId, emojis) => {
  if (emojis.length === 5) {
    setStorageItem(`emojis_${userId}`, JSON.stringify(emojis));
    return true;
  }
  return false;
};

export const getEmojiPresets = () => {
  return EMOJI_PRESETS;
};

export const applyPreset = (userId, presetName) => {
  if (EMOJI_PRESETS[presetName]) {
    saveCustomEmojis(userId, EMOJI_PRESETS[presetName]);
    return EMOJI_PRESETS[presetName];
  }
  return null;
};

export const resetToDefault = (userId) => {
  saveCustomEmojis(userId, DEFAULT_EMOJIS);
  return DEFAULT_EMOJIS;
};

