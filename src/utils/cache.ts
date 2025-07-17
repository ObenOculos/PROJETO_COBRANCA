export interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  key: string;
}

export interface CacheConfig {
  ttl: number; // Default TTL in milliseconds
  maxSize: number; // Maximum number of items to store
  storage: 'localStorage' | 'sessionStorage' | 'memory';
}

class CacheManager {
  private memoryCache = new Map<string, CacheItem<any>>();
  private defaultConfig: CacheConfig = {
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 100,
    storage: 'localStorage'
  };

  constructor(config?: Partial<CacheConfig>) {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  private getStorage() {
    switch (this.defaultConfig.storage) {
      case 'sessionStorage':
        return sessionStorage;
      case 'localStorage':
        return localStorage;
      case 'memory':
        return null;
      default:
        return localStorage;
    }
  }

  private generateKey(baseKey: string, params?: Record<string, any>): string {
    if (!params) return baseKey;
    
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${JSON.stringify(params[key])}`)
      .join('|');
    
    return `${baseKey}__${paramString}`;
  }

  get<T>(key: string, params?: Record<string, any>): T | null {
    const fullKey = this.generateKey(key, params);
    
    try {
      if (this.defaultConfig.storage === 'memory') {
        const item = this.memoryCache.get(fullKey);
        if (item && this.isValid(item)) {
          return item.data;
        }
        this.memoryCache.delete(fullKey);
        return null;
      }

      const storage = this.getStorage();
      if (!storage) return null;

      const cached = storage.getItem(`cache_${fullKey}`);
      if (!cached) return null;

      const item: CacheItem<T> = JSON.parse(cached);
      
      if (this.isValid(item)) {
        return item.data;
      }

      // Remove expired item
      storage.removeItem(`cache_${fullKey}`);
      return null;
    } catch (error) {
      console.warn('Error reading from cache:', error);
      return null;
    }
  }

  set<T>(key: string, data: T, params?: Record<string, any>, ttl?: number): void {
    const fullKey = this.generateKey(key, params);
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultConfig.ttl,
      key: fullKey
    };

    try {
      if (this.defaultConfig.storage === 'memory') {
        this.memoryCache.set(fullKey, item);
        this.enforceMaxSize();
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      storage.setItem(`cache_${fullKey}`, JSON.stringify(item));
      this.enforceMaxSize();
    } catch (error) {
      console.warn('Error writing to cache:', error);
    }
  }

  invalidate(key: string, params?: Record<string, any>): void {
    const fullKey = this.generateKey(key, params);
    
    try {
      if (this.defaultConfig.storage === 'memory') {
        this.memoryCache.delete(fullKey);
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      storage.removeItem(`cache_${fullKey}`);
    } catch (error) {
      console.warn('Error invalidating cache:', error);
    }
  }

  invalidatePrefix(prefix: string): void {
    try {
      if (this.defaultConfig.storage === 'memory') {
        const keysToDelete = Array.from(this.memoryCache.keys()).filter(key => 
          key.startsWith(prefix)
        );
        keysToDelete.forEach(key => this.memoryCache.delete(key));
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(`cache_${prefix}`)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => storage.removeItem(key));
    } catch (error) {
      console.warn('Error invalidating cache prefix:', error);
    }
  }

  clear(): void {
    try {
      if (this.defaultConfig.storage === 'memory') {
        this.memoryCache.clear();
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('cache_')) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => storage.removeItem(key));
    } catch (error) {
      console.warn('Error clearing cache:', error);
    }
  }

  private isValid<T>(item: CacheItem<T>): boolean {
    return Date.now() - item.timestamp < item.ttl;
  }

  private enforceMaxSize(): void {
    if (this.defaultConfig.storage === 'memory') {
      if (this.memoryCache.size <= this.defaultConfig.maxSize) return;
      
      // Remove oldest items
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, entries.length - this.defaultConfig.maxSize);
      toDelete.forEach(([key]) => this.memoryCache.delete(key));
      return;
    }

    const storage = this.getStorage();
    if (!storage) return;

    const cacheItems: Array<{ key: string; item: CacheItem<any> }> = [];
    
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('cache_')) {
        try {
          const item = JSON.parse(storage.getItem(key)!);
          cacheItems.push({ key, item });
        } catch (e) {
          // Remove invalid items
          storage.removeItem(key);
        }
      }
    }

    if (cacheItems.length <= this.defaultConfig.maxSize) return;

    // Sort by timestamp and remove oldest
    cacheItems.sort((a, b) => a.item.timestamp - b.item.timestamp);
    const toDelete = cacheItems.slice(0, cacheItems.length - this.defaultConfig.maxSize);
    toDelete.forEach(({ key }) => storage.removeItem(key));
  }

  getStats(): {
    memorySize: number;
    storageSize: number;
    config: CacheConfig;
  } {
    let storageSize = 0;
    
    if (this.defaultConfig.storage !== 'memory') {
      const storage = this.getStorage();
      if (storage) {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith('cache_')) {
            storageSize++;
          }
        }
      }
    }

    return {
      memorySize: this.memoryCache.size,
      storageSize,
      config: this.defaultConfig
    };
  }
}

// Create instances for different types of data
export const dataCache = new CacheManager({
  ttl: 10 * 60 * 1000, // 10 minutes for main data
  maxSize: 50,
  storage: 'localStorage'
});

export const statsCache = new CacheManager({
  ttl: 2 * 60 * 1000, // 2 minutes for stats
  maxSize: 20,
  storage: 'sessionStorage'
});

export const userCache = new CacheManager({
  ttl: 30 * 60 * 1000, // 30 minutes for user data
  maxSize: 10,
  storage: 'localStorage'
});

export const quickCache = new CacheManager({
  ttl: 30 * 1000, // 30 seconds for quick data
  maxSize: 100,
  storage: 'memory'
});