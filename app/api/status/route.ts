import { NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import type { RaspiStatus } from "@/lib/defaults"

export type { RaspiStatus }

export async function GET() {
  const status = await storeGet<RaspiStatus | null>("raspi_status", null)
  return NextResponse.json(status)
}

export async function POST(req: Request) {
  const body = await req.json() as RaspiStatus
  await storeSet("raspi_status", body)
  return NextResponse.json({ ok: true })
}
