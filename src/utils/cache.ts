import pako from 'pako';

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
  compression?: boolean; // Enable compression for large data
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

      // First try to get regular cached item
      const cached = storage.getItem(`cache_${fullKey}`);
      
      if (cached) {
        try {
          // Check if data is compressed
          const parsed = JSON.parse(cached);
          if (parsed.compressed && parsed.data) {
            // Decompress the data
            const compressedData = parsed.data;
            const binaryData = atob(compressedData);
            
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }
            const decompressed = pako.inflate(bytes, { to: 'string' });
            const item: CacheItem<T> = JSON.parse(decompressed);
            
            if (this.isValid(item)) {
              return item.data;
            }
            // Remove expired item
            storage.removeItem(`cache_${fullKey}`);
            return null;
          }
        } catch (e) {
          storage.removeItem(`cache_${fullKey}`);
          return null;
        }
        
        try {
          const item: CacheItem<T> = JSON.parse(cached);
          
          if (this.isValid(item)) {
            return item.data;
          }
          // Remove expired item
          storage.removeItem(`cache_${fullKey}`);
          return null;
        } catch (parseError) {
          storage.removeItem(`cache_${fullKey}`);
          return null;
        }
      }

      // Try to get chunked data
      const metaData = storage.getItem(`cache_${fullKey}_meta`);
      
      if (metaData) {
        const meta = JSON.parse(metaData);
        
        // Check if chunks are still valid
        if (Date.now() - meta.timestamp >= meta.ttl) {
          // Remove expired chunks
          storage.removeItem(`cache_${fullKey}_meta`);
          for (let i = 0; i < meta.chunks; i++) {
            storage.removeItem(`cache_${fullKey}_chunk_${i}`);
          }
          return null;
        }

        // Reconstruct data from chunks
        let reconstructed = '';
        for (let i = 0; i < meta.chunks; i++) {
          const chunk = storage.getItem(`cache_${fullKey}_chunk_${i}`);
          if (!chunk) {
            // If any chunk is missing, invalidate all
            storage.removeItem(`cache_${fullKey}_meta`);
            for (let j = 0; j < meta.chunks; j++) {
              storage.removeItem(`cache_${fullKey}_chunk_${j}`);
            }
            return null;
          }
          reconstructed += chunk;
        }

        try {
          // Check if chunks were compressed
          if (meta.compressed) {
            // Decompress chunked data
            const binaryData = atob(reconstructed);
            
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }
            const decompressed = pako.inflate(bytes, { to: 'string' });
            const item: CacheItem<T> = JSON.parse(decompressed);
            return item.data;
          } else {
            const item: CacheItem<T> = JSON.parse(reconstructed);
            return item.data;
          }
        } catch (parseError) {
          console.warn('Error parsing chunked cache data:', parseError);
          // Clean up corrupted chunks
          storage.removeItem(`cache_${fullKey}_meta`);
          for (let i = 0; i < meta.chunks; i++) {
            storage.removeItem(`cache_${fullKey}_chunk_${i}`);
          }
          return null;
        }
      }

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

      let serializedItem = JSON.stringify(item);
      let isCompressed = false;
      
      // Try compression if enabled and data is large
      if (this.defaultConfig.compression && serializedItem.length > 1024 * 1024) { // Compress if > 1MB
        try {
          const compressed = pako.deflate(serializedItem, { level: 6 });
          
          // Convert binary data to base64 safely
          const binaryString = Array.from(compressed, byte => String.fromCharCode(byte)).join('');
          const compressedString = btoa(binaryString);
          
          const compressionRatio = compressedString.length / serializedItem.length;
          
          console.log(`Compression ratio for ${fullKey}: ${(compressionRatio * 100).toFixed(1)}% (${serializedItem.length} -> ${compressedString.length} bytes)`);
          
          if (compressionRatio < 0.8) { // Only use compression if it saves > 20%
            serializedItem = compressedString;
            isCompressed = true;
          }
        } catch (compressError) {
          console.warn('Compression failed, using uncompressed data:', compressError);
        }
      }
      
      const chunkSize = 2 * 1024 * 1024; // 2MB chunks
      
      // Check if data is too large (>4MB for localStorage safety)
      if (serializedItem.length > 4 * 1024 * 1024) {
        console.warn(`Cache item too large (${serializedItem.length} bytes), attempting chunked storage for key:`, fullKey);
        
        // Try chunked storage for large items
        const chunks = Math.ceil(serializedItem.length / chunkSize);
        if (chunks > 10) { // Allow up to 10 chunks (20MB total)
          console.warn(`Data too large even for chunked storage (${chunks} chunks needed), skipping cache`);
          return;
        }
        
        try {
          // Store metadata about chunks
          storage.setItem(`cache_${fullKey}_meta`, JSON.stringify({
            chunks,
            timestamp: item.timestamp,
            ttl: item.ttl,
            key: fullKey,
            compressed: isCompressed
          }));
          
          // Store each chunk
          for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, serializedItem.length);
            const chunk = serializedItem.slice(start, end);
            storage.setItem(`cache_${fullKey}_chunk_${i}`, chunk);
          }
          
          this.enforceMaxSize();
          return;
        } catch (chunkError) {
          console.warn('Failed to store in chunks:', chunkError);
          // Clean up partial chunks
          storage.removeItem(`cache_${fullKey}_meta`);
          for (let i = 0; i < chunks; i++) {
            storage.removeItem(`cache_${fullKey}_chunk_${i}`);
          }
          
          // If quota exceeded, try clearing old entries and retry once
          if (chunkError instanceof Error && chunkError.name === 'QuotaExceededError') {
            console.warn('Quota exceeded during chunked storage, clearing old cache and retrying...');
            this.clearOldEntries();
            
            try {
              // Try again with cleaned storage
              storage.setItem(`cache_${fullKey}_meta`, JSON.stringify({
                chunks,
                timestamp: item.timestamp,
                ttl: item.ttl,
                key: fullKey,
                compressed: isCompressed
              }));
              
              for (let i = 0; i < chunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, serializedItem.length);
                const chunk = serializedItem.slice(start, end);
                storage.setItem(`cache_${fullKey}_chunk_${i}`, chunk);
              }
              
              console.log('✅ Retry successful after clearing old cache');
              this.enforceMaxSize();
              return;
            } catch (retryError) {
              console.warn('Failed to cache even after clearing old entries:', retryError);
            }
          }
          
          return;
        }
      }

      // For regular items, store with compression flag
      if (isCompressed) {
        storage.setItem(`cache_${fullKey}`, JSON.stringify({ compressed: true, data: serializedItem }));
      } else {
        storage.setItem(`cache_${fullKey}`, serializedItem);
      }
      
      this.enforceMaxSize();
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, clearing old cache entries and retrying...');
        this.clearOldEntries();
        
        // Try one more time after clearing
        try {
          const storage = this.getStorage();
          if (storage) {
            const serializedItem = JSON.stringify(item);
            if (serializedItem.length <= 2 * 1024 * 1024) { // Only cache items under 2MB after quota exceeded
              storage.setItem(`cache_${fullKey}`, serializedItem);
            }
          }
        } catch (retryError) {
          console.warn('Failed to cache after clearing old entries:', retryError);
        }
      } else {
        console.warn('Error writing to cache:', error);
      }
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

      // Remove regular cache item
      storage.removeItem(`cache_${fullKey}`);
      
      // Check for and remove chunked data
      const metaData = storage.getItem(`cache_${fullKey}_meta`);
      if (metaData) {
        const meta = JSON.parse(metaData);
        storage.removeItem(`cache_${fullKey}_meta`);
        for (let i = 0; i < meta.chunks; i++) {
          storage.removeItem(`cache_${fullKey}_chunk_${i}`);
        }
      }
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

  private clearOldEntries(): void {
    try {
      if (this.defaultConfig.storage === 'memory') {
        // For memory cache, clear half of the oldest entries
        const entries = Array.from(this.memoryCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toClear = Math.floor(entries.length / 2);
        for (let i = 0; i < toClear; i++) {
          this.memoryCache.delete(entries[i][0]);
        }
        return;
      }

      const storage = this.getStorage();
      if (!storage) return;

      // Collect all cache items with their timestamps
      const cacheItems: Array<{ key: string; timestamp: number; size: number }> = [];
      
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('cache_')) {
          try {
            const itemData = storage.getItem(key);
            if (itemData) {
              const item = JSON.parse(itemData);
              cacheItems.push({
                key,
                timestamp: item.timestamp || 0,
                size: itemData.length
              });
            }
          } catch (e) {
            // Remove invalid items
            storage.removeItem(key);
          }
        }
      }

      // Sort by timestamp (oldest first) and remove until we free up about 50% of entries
      cacheItems.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = Math.floor(cacheItems.length * 0.5) || 1; // Remove 50% of items
      
      for (let i = 0; i < toRemove && i < cacheItems.length; i++) {
        storage.removeItem(cacheItems[i].key);
      }

      console.log(`Cleared ${toRemove} old cache entries to free up storage space`);
    } catch (error) {
      console.warn('Error clearing old cache entries:', error);
    }
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
  storage: 'localStorage',
  compression: true // Enable compression for large collections
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

// Specialized cache for large collections with aggressive compression
export const collectionsCache = new CacheManager({
  ttl: 15 * 60 * 1000, // 15 minutes for collections
  maxSize: 10,
  storage: 'localStorage',
  compression: true
});