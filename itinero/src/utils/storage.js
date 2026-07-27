/**
 * localStorage abstraction with JSON serialization and error handling.
 * Use the useLocalStorage hook for React state — this is for raw storage access.
 *
 * Usage:
 *   storage.set('user', { name: 'Alice' });
 *   const user = storage.get('user');
 *   storage.remove('user');
 */

const PREFIX = "itinero_";

export const storage = {
  /**
   * Get a value from localStorage.
   * @param {string} key
   * @param {*} fallback - Default value if key doesn't exist
   * @returns {*} Parsed value or fallback
   */
  get(key, fallback = null) {
    try {
      const item = window.localStorage.getItem(PREFIX + key);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  },

  /**
   * Set a value in localStorage.
   * @param {string} key
   * @param {*} value - Will be JSON-serialized
   */
  set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (error) {
      console.warn(`storage.set: Failed to write "${key}"`, error);
    }
  },

  /**
   * Remove a key from localStorage.
   * @param {string} key
   */
  remove(key) {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* silent fail */
    }
  },

  /**
   * Clear all Itinero-prefixed keys from localStorage.
   */
  clear() {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith(PREFIX))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      /* silent fail */
    }
  },
};
