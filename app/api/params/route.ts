import { NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { DEFAULT_PARAMS, validateParams } from "@/lib/defaults"
import type { Params } from "@/lib/defaults"

export async function GET() {
  const params = await storeGet<Params>("params", DEFAULT_PARAMS)
  return NextResponse.json(params)
}

export async function POST(req: Request) {
  const body = await req.json()
  const result = validateParams(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  await storeSet("params", result.data)
  return NextResponse.json({ ok: true })
}
