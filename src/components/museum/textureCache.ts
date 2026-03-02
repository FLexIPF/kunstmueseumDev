import { SRGBColorSpace, Texture, TextureLoader } from "three";

const textureCache = new Map<string, Texture>();
const inFlight = new Map<string, Promise<Texture>>();
const listeners = new Set<() => void>();
let cacheLimit = 200;

function touchEntry(url: string, texture: Texture) {
  textureCache.delete(url);
  textureCache.set(url, texture);
}

function evictIfNeeded() {
  while (cacheLimit > 0 && textureCache.size > cacheLimit) {
    const oldest = textureCache.entries().next().value as [string, Texture] | undefined;
    if (!oldest) return;
    const [key] = oldest;
    textureCache.delete(key);
  }
}

export function setTextureCacheLimit(limit: number): void {
  cacheLimit = Math.max(0, Math.floor(limit));
  evictIfNeeded();
}

export function getCachedTexture(url: string): Texture | undefined {
  const tex = textureCache.get(url);
  if (tex) touchEntry(url, tex);
  return tex;
}

export function hasCachedTexture(url: string): boolean {
  return textureCache.has(url);
}

export function setCachedTexture(url: string, texture: Texture): void {
  textureCache.set(url, texture);
  touchEntry(url, texture);
  evictIfNeeded();
  listeners.forEach((cb) => cb());
}

export function subscribeTextureCache(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

type RetryOptions = {
  maxRetries?: number; // Infinity for endless retry
  retryIntervalMs?: number;
};

function configureTexture(tex: Texture) {
  (tex as unknown as { colorSpace: unknown }).colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
}

export function loadTextureWithRetry(url: string, options: RetryOptions = {}): Promise<Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(url);
  if (existing) return existing;

  const maxRetries = options.maxRetries ?? 2;
  const retryIntervalMs = options.retryIntervalMs ?? 1000;
  let attempts = 0;

  const promise = new Promise<Texture>((resolve, reject) => {
    const attempt = () => {
      const loader = new TextureLoader();
      loader.load(
        url,
        (tex) => {
          configureTexture(tex);
          setCachedTexture(url, tex);
          inFlight.delete(url);
          resolve(tex);
        },
        undefined,
        () => {
          attempts += 1;
          const shouldRetry = maxRetries === Infinity || attempts <= maxRetries;
          if (!shouldRetry) {
            inFlight.delete(url);
            reject(new Error(`Failed to load texture: ${url}`));
            return;
          }
          window.setTimeout(attempt, retryIntervalMs);
        },
      );
    };
    attempt();
  });

  inFlight.set(url, promise);
  return promise;
}
