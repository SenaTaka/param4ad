import { Redis } from "@upstash/redis"

const memStore = new Map<string, unknown>()

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (url && token) {
    return new Redis({ url, token })
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
