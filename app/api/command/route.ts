import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { DEFAULT_COMMAND } from "@/lib/defaults"
import type { Command } from "@/lib/defaults"
import { key, teamOf, robotOf } from "@/lib/keys"

function robotKey(req: NextRequest) {
  return key("command", teamOf(req), robotOf(req))
}

export async function GET(req: NextRequest) {
  const command = await storeGet<Command>(robotKey(req), DEFAULT_COMMAND)
  return NextResponse.json({ command })
}

export async function POST(req: NextRequest) {
  const { command } = await req.json()
  await storeSet(robotKey(req), command)
  return NextResponse.json({ ok: true })
}
