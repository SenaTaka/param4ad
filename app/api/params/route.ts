import { NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { DEFAULT_PARAMS } from "@/lib/defaults"
import type { Params } from "@/lib/defaults"

export async function GET() {
  const params = await storeGet<Params>("params", DEFAULT_PARAMS)
  return NextResponse.json(params)
}

export async function POST(req: Request) {
  const body = await req.json()
  await storeSet("params", body)
  return NextResponse.json({ ok: true })
}
