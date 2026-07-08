import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import type { RaspiStatus } from "@/lib/defaults"
import { key, teamOf, robotOf } from "@/lib/keys"

export type { RaspiStatus }

function robotKey(req: NextRequest) {
  return key("status", teamOf(req), robotOf(req))
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
