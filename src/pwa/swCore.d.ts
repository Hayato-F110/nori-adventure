// swCore.js の型（NORI-38）。swCore.js は Service Worker にそのまま入れるので、素の JavaScript で書き、型はここに置く

export type SwRequest = { url: string; method: string; mode: string };

export type SwCache<R> = {
  addAll: (urls: string[]) => Promise<void>;
  match: (url: string) => Promise<R | undefined>;
};

export type SwCacheStorage<R> = {
  open: (name: string) => Promise<SwCache<R>>;
};

export declare const CACHE_PREFIX: "nori-adventure-";
export declare function cacheName(version: string): string;
export declare function installAll<R>(
  cacheStorage: SwCacheStorage<R>,
  version: string,
  urls: string[],
): Promise<void>;
export declare function planFetch(request: SwRequest, scope: string): string | null;
export declare function respond<R, Q>(
  cacheStorage: SwCacheStorage<R>,
  version: string,
  key: string,
  request: Q,
  fetchFn: (request: Q) => Promise<R>,
): Promise<R>;
export declare function keysToDelete(keys: string[], version: string): string[];
