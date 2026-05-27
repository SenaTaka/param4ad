const memStore = new Map<string, unknown>()

function hasKv() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

export async function storeGet<T>(key: string, fallback: T): Promise<T> {
  if (hasKv()) {
    try {
      const { kv } = await import("@vercel/kv")
      const val = await kv.get<T>(key)
      return val ?? fallback
    } catch {
      // fall through
    }
  }
  return (memStore.get(key) as T) ?? fallback
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  if (hasKv()) {
    try {
      const { kv } = await import("@vercel/kv")
      await kv.set(key, value)
      return
    } catch {
      // fall through
    }
  }
  memStore.set(key, value)
}
