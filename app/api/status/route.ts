import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import type { RaspiStatus } from "@/lib/defaults"

export type { RaspiStatus }

function robotKey(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("robot") || "default"
  return `status:${id}`
}

export async function GET(req: NextRequest) {
  const status = await storeGet<RaspiStatus | null>(robotKey(req), null)
  return NextResponse.json(status)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as RaspiStatus
  await storeSet(robotKey(req), body)
  return NextResponse.json({ ok: true })
}
