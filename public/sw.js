const CACHE_NAME = 'sistema-cobranca-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-48.webp',
  '/icons/icon-72.webp',
  '/icons/icon-96.webp',
  '/icons/icon-128.webp',
  '/icons/icon-192.webp',
  '/icons/icon-256.webp',
  '/icons/icon-512.webp'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições que não são do mesmo domínio
  if (url.origin !== location.origin) {
    return;
  }

  // Ignora requisições de desenvolvimento do Vite
  if (
    request.url.includes('?t=') || // Arquivos com timestamp do Vite
    request.url.includes('/@vite/') || // Recursos do Vite
    request.url.includes('/src/') || // Arquivos fonte em desenvolvimento
    request.url.includes('?import') || // Imports dinâmicos do Vite
    request.url.includes('.tsx') || // Arquivos TypeScript/React
    request.url.includes('.ts') || // Arquivos TypeScript
    request.url.includes('.jsx') || // Arquivos React
    request.url.includes('?v=') || // Versionamento do Vite
    request.url.includes('/node_modules/') // Módulos do Node
  ) {
    return; // Deixa o Vite lidar com essas requisições
  }

  // Estratégia para API do Supabase - Network First
  if (request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clona a resposta para armazenar em cache
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(request, responseToCache);
            });
          return response;
        })
        .catch(() => {
          // Se offline, tenta buscar do cache
          return caches.match(request);
        })
    );
    return;
  }

  // Estratégia para assets estáticos - Cache First
  if (request.url.match(/\.(js|css|png|jpg|jpeg|svg|webp|ico)$/)) {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(request).then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseToCache);
              });
            return response;
          });
        })
    );
    return;
  }

  // Estratégia padrão - Network First com fallback para cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Sincronização em background
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Implementar sincronização de dados offline
}

// Notificações push (opcional)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação',
    icon: '/icons/icon-192.webp',
    badge: '/icons/icon-72.webp'
  };

  event.waitUntil(
    self.registration.showNotification('Sistema de Cobrança', options)
  );
});