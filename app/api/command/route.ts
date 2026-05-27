import { NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { DEFAULT_COMMAND } from "@/lib/defaults"
import type { Command } from "@/lib/defaults"

export async function GET() {
  const command = await storeGet<Command>("command", DEFAULT_COMMAND)
  return NextResponse.json({ command })
}

export async function POST(req: Request) {
  const { command } = await req.json()
  await storeSet("command", command)
  return NextResponse.json({ ok: true })
}
