import { useEffect, useCallback } from 'react';
import { dataCache, statsCache, userCache, quickCache, collectionsCache } from '../utils/cache';

interface CacheInvalidationConfig {
  patterns: string[];
  dependencies?: any[];
}

export function useCacheInvalidation(config: CacheInvalidationConfig) {
  const { patterns, dependencies = [] } = config;

  const invalidatePatterns = useCallback(() => {
    patterns.forEach(pattern => {
      // Invalidate from all cache managers
      dataCache.invalidatePrefix(pattern);
      statsCache.invalidatePrefix(pattern);
      userCache.invalidatePrefix(pattern);
      quickCache.invalidatePrefix(pattern);
    });
  }, [patterns]);

  // Invalidate when dependencies change
  useEffect(() => {
    if (dependencies.length > 0) {
      invalidatePatterns();
    }
  }, dependencies);

  return { invalidatePatterns };
}

// Hook for real-time cache invalidation
export function useRealtimeCacheInvalidation() {
  const invalidateCollections = useCallback(() => {
    console.log('Invalidating collections cache due to real-time update');
    collectionsCache.invalidatePrefix('collections');
    dataCache.invalidatePrefix('client-groups');
    dataCache.invalidatePrefix('dashboard-stats');
    statsCache.invalidatePrefix('performance');
    statsCache.invalidatePrefix('filtered-collections');
  }, []);

  const invalidatePayments = useCallback(() => {
    console.log('Invalidating payments cache due to real-time update');
    dataCache.invalidatePrefix('sale-payments');
    dataCache.invalidatePrefix('dashboard-stats');
    statsCache.invalidatePrefix('performance');
  }, []);

  const invalidateUsers = useCallback(() => {
    console.log('Invalidating users cache due to real-time update');
    userCache.invalidatePrefix('users');
    userCache.invalidatePrefix('collector-stores');
    statsCache.invalidatePrefix('performance');
  }, []);

  const invalidateVisits = useCallback(() => {
    console.log('Invalidating visits cache due to real-time update');
    dataCache.invalidatePrefix('visits');
    dataCache.invalidatePrefix('scheduled-visits');
    statsCache.invalidatePrefix('visit-stats');
  }, []);

  const invalidateAll = useCallback(() => {
    console.log('Invalidating all cache due to major update');
    dataCache.clear();
    statsCache.clear();
    // Keep user cache as it changes less frequently
  }, []);

  return {
    invalidateCollections,
    invalidatePayments,
    invalidateUsers,
    invalidateVisits,
    invalidateAll
  };
}

// Hook for offline sync cache invalidation
export function useOfflineSyncCacheInvalidation() {
  const invalidateAfterSync = useCallback(() => {
    console.log('Invalidating cache after offline sync');
    // Invalidate all data caches but keep user preferences
    dataCache.clear();
    statsCache.clear();
    quickCache.clear();
  }, []);

  useEffect(() => {
    const handleOfflineSync = () => {
      invalidateAfterSync();
    };

    window.addEventListener('offlineDataSynced', handleOfflineSync);
    
    return () => {
      window.removeEventListener('offlineDataSynced', handleOfflineSync);
    };
  }, [invalidateAfterSync]);

  return { invalidateAfterSync };
}