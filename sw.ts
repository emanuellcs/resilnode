/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServiceWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const CACHE_NAME = 'resilnode-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let handler: ServiceWorkerMLCEngineHandler | null = null;

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  (self as any).skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  
  // Instantiate the WebLLM engine handler
  handler = new ServiceWorkerMLCEngineHandler();
  
  // Heartbeat Protocol: 5000ms loop to keep VRAM from being evicted
  // Broadcasts to all connected clients
  setInterval(() => {
    (self as any).clients.matchAll().then((clients: any[]) => {
      clients.forEach(client => {
        client.postMessage({ 
          type: 'HEARTBEAT_ACK', 
          timestamp: Date.now(),
          status: 'VRAM_PROTECTED'
        });
      });
    });
  }, 5000);

  (self as any).clients.claim();
});

self.addEventListener('fetch', (event: any) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Acknowledge incoming client-side heartbeats if necessary
self.addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'HEARTBEAT') {
    // Optional: Log or process heartbeat from main thread
  }
});
