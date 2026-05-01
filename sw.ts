/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServiceWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const CACHE_NAME = "resilnode-app-shell-v1";
const MODEL_CACHE_NAME = "resilnode-models-v1";
const ASSETS_TO_CACHE = ["/", "/manifest.json", "/favicon.ico"];

function heartbeatAck() {
  return {
    type: "HEARTBEAT_ACK",
    timestamp: Date.now(),
    status: "VRAM_PROTECTED",
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let handler: ServiceWorkerMLCEngineHandler | null = null;

self.addEventListener("install", (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  (self as any).skipWaiting();
});

self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== MODEL_CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );

  handler = new ServiceWorkerMLCEngineHandler();

  setInterval(() => {
    (self as any).clients.matchAll().then((clients: any[]) => {
      clients.forEach((client) => {
        client.postMessage(heartbeatAck());
      });
    });
  }, 5000);

  (self as any).clients.claim();
});

self.addEventListener("fetch", (event: any) => {
  const url = new URL(event.request.url);

  // 1. Cache-First for Heavy AI Assets (WebLLM weights, Transformers.js binaries)
  const isAIAsset =
    url.hostname.includes("huggingface.co") ||
    url.pathname.endsWith(".wasm") ||
    url.pathname.endsWith(".bin") ||
    url.pathname.includes("_model");

  if (isAIAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok || networkResponse.type === "opaque") {
            const responseClone = networkResponse.clone();
            caches.open(MODEL_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      }),
    );
    return;
  }

  // 2. Cache-First, Network Fallback for App Shell & UI
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        return (
          response ||
          fetch(event.request).then((networkResponse) => {
            if (
              event.request.method === "GET" &&
              url.protocol.startsWith("http") &&
              (networkResponse.ok || networkResponse.type === "opaque")
            ) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
        );
      })
      .catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("/");
        }
      }),
  );
});

self.addEventListener("message", (event: any) => {
  if (event.data && event.data.type === "HEARTBEAT") {
    event.source?.postMessage(heartbeatAck());
  }
});
