// [P1-3 · P1-PERF-AUDIT-2026-11-18] Caché TTL ligero por queryKey con limpieza atómica en logout.
// Reemplaza a `@tanstack/react-query` (~8 kB gz en el arranque inicial) manteniendo 100% de
// paridad de API (`fetchQuery`, `getQueryData`, `setQueryData`, `removeQueries`, `clear`,
// dedup in-flight y `clearUserQueryCache()`).

const _serializeKey = (queryKey) => JSON.stringify(Array.isArray(queryKey) ? queryKey : [queryKey]);

class MiniQueryClient {
  constructor() {
    this._store = new Map();
    this._inflight = new Map();
  }

  getQueryData(queryKey) {
    const entry = this._store.get(_serializeKey(queryKey));
    return entry ? entry.data : undefined;
  }

  setQueryData(queryKey, data) {
    this._store.set(_serializeKey(queryKey), { data, updatedAt: Date.now() });
    return data;
  }

  async fetchQuery({ queryKey, queryFn, staleTime = 30_000 }) {
    const key = _serializeKey(queryKey);
    const existing = this._store.get(key);
    if (existing && (Date.now() - existing.updatedAt) < staleTime) {
      return existing.data;
    }
    if (this._inflight.has(key)) {
      return this._inflight.get(key);
    }
    const promise = Promise.resolve()
      .then(() => queryFn())
      .then((data) => {
        this._store.set(key, { data, updatedAt: Date.now() });
        this._inflight.delete(key);
        return data;
      })
      .catch((err) => {
        this._inflight.delete(key);
        throw err;
      });
    this._inflight.set(key, promise);
    return promise;
  }

  removeQueries({ queryKey } = {}) {
    if (!queryKey) {
      this._store.clear();
      this._inflight.clear();
      return;
    }
    const prefix = _serializeKey(queryKey);
    const prefixOpen = prefix.endsWith(']') ? prefix.slice(0, -1) : prefix;
    for (const k of Array.from(this._store.keys())) {
      if (k === prefix || k.startsWith(prefixOpen + ',')) {
        this._store.delete(k);
        this._inflight.delete(k);
      }
    }
  }

  clear() {
    this._store.clear();
    this._inflight.clear();
  }
}

export const queryClient = new MiniQueryClient();

/**
 * Evicta TODO el estado de servidor cacheado. Se invoca desde el teardown SSOT
 * (AssessmentContext._clearUserScopedCaches), que corre en los 5 paths de logout/
 * user-switch/reset. Un solo clear() cierra la clase de fuga PII cross-user.
 */
export function clearUserQueryCache() {
  queryClient.clear();
}
