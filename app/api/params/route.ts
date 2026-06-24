import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { DEFAULT_PARAMS, validateParams } from "@/lib/defaults"
import type { Params } from "@/lib/defaults"

function robotKey(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("robot") || "default"
  return `params:${id}`
}

export async function GET(req: NextRequest) {
  const params = await storeGet<Params>(robotKey(req), DEFAULT_PARAMS)
  return NextResponse.json(params)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const result = validateParams(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  await storeSet(robotKey(req), result.data)
  return NextResponse.json({ ok: true })
}
