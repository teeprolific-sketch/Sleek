/** The admin console runs in a browser: the shared store persists to localStorage, exactly like the app's web build. */
const ls = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};
const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return ls()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      ls()?.setItem(key, value);
    } catch {
      // storage full or blocked: the demo keeps working in memory
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      ls()?.removeItem(key);
    } catch {
      // ignore
    }
  },
};
export default AsyncStorage;
