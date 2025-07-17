import { useState, useEffect, useCallback, useRef } from 'react';
import { dataCache, statsCache, userCache, quickCache } from '../utils/cache';

type CacheType = 'data' | 'stats' | 'user' | 'quick';

interface UseCacheOptions {
  cacheType?: CacheType;
  ttl?: number;
  enabled?: boolean;
  staleWhileRevalidate?: boolean;
  dependencies?: any[];
}

export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCacheOptions = {}
) {
  const {
    cacheType = 'data',
    ttl,
    enabled = true,
    staleWhileRevalidate = true,
    dependencies = []
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const getCacheManager = () => {
    switch (cacheType) {
      case 'stats': return statsCache;
      case 'user': return userCache;
      case 'quick': return quickCache;
      default: return dataCache;
    }
  };

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const cache = getCacheManager();
    const params = dependencies.length > 0 ? { deps: dependencies } : undefined;
    
    // Try to get from cache first
    if (!forceRefresh) {
      const cachedData = cache.get<T>(key, params);
      if (cachedData !== null) {
        setData(cachedData);
        setLoading(false);
        setError(null);
        
        // If staleWhileRevalidate is enabled, fetch fresh data in background
        if (staleWhileRevalidate) {
          // Don't await this - let it run in background
          fetchData(true);
        }
        return;
      }
    }

    // If no cache or force refresh, fetch fresh data
    setLoading(true);
    setError(null);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const result = await fetcher();
      
      if (!isMountedRef.current) return;
      
      // Cache the result
      cache.set(key, result, params, ttl);
      
      setData(result);
      setLastFetch(Date.now());
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      // Only set error if it's not an abort error
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [key, fetcher, enabled, ttl, staleWhileRevalidate, ...dependencies]);

  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    const cache = getCacheManager();
    const params = dependencies.length > 0 ? { deps: dependencies } : undefined;
    cache.invalidate(key, params);
  }, [key, cacheType, ...dependencies]);

  const clear = useCallback(() => {
    const cache = getCacheManager();
    cache.clear();
  }, [cacheType]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refresh,
    invalidate,
    clear,
    lastFetch
  };
}

export function useCachedQuery<T>(
  key: string,
  query: () => Promise<T>,
  options?: UseCacheOptions
) {
  return useCache(key, query, options);
}

// Hook specifically for Supabase queries
export function useSupabaseCache<T>(
  key: string,
  queryFn: () => Promise<{ data: T | null; error: any }>,
  options?: UseCacheOptions
) {
  const wrappedFetcher = useCallback(async () => {
    const result = await queryFn();
    if (result.error) {
      throw new Error(result.error.message || 'Database error');
    }
    return result.data;
  }, [queryFn]);

  return useCache(key, wrappedFetcher, options);
}