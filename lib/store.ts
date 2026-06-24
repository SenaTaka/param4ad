import { Redis } from "@upstash/redis"

const memStore = new Map<string, unknown>()

function getRedis(): Redis | null {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Redis.fromEnv()
  }
  return null
}

export async function storeGet<T>(key: string, fallback: T): Promise<T> {
  const redis = getRedis()
  if (redis) {
    try {
      const val = await redis.get<T>(key)
      return val ?? fallback
    } catch {
      // fall through to memStore
    }
  }
  return (memStore.get(key) as T) ?? fallback
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.set(key, value)
      return
    } catch {
      // fall through to memStore
    }
  }
  memStore.set(key, value)
}
