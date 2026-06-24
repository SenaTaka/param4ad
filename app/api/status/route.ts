import { NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"

export type RaspiStatus = {
  mode: "RUN" | "PAUSE"
  d_front: number | null
  steer: number
  left: number
  right: number
  tgt_deg: number
  dmin: number | null
  gap_width: number | null
  ts: number
}

export async function GET() {
  const status = await storeGet<RaspiStatus | null>("raspi_status", null)
  return NextResponse.json(status)
}

export async function POST(req: Request) {
  const body = await req.json() as RaspiStatus
  await storeSet("raspi_status", body)
  return NextResponse.json({ ok: true })
}
