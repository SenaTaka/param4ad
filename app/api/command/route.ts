import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { DEFAULT_COMMAND } from "@/lib/defaults"
import type { Command } from "@/lib/defaults"

function robotKey(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("robot") || "default"
  return `command:${id}`
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
