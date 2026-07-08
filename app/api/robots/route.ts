import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"
import { robotsKey, teamOf } from "@/lib/keys"

export type Robot = { id: string; name: string }

export async function GET(req: NextRequest) {
  const robots = await storeGet<Robot[]>(robotsKey(teamOf(req)), [])
  return NextResponse.json(robots)
}

export async function POST(req: NextRequest) {
  const k = robotsKey(teamOf(req))
  const { id, name } = await req.json() as Robot
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const robots = await storeGet<Robot[]>(k, [])
  if (!robots.find(r => r.id === id)) {
    robots.push({ id, name: name || id })
    await storeSet(k, robots)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const k = robotsKey(teamOf(req))
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const robots = await storeGet<Robot[]>(k, [])
  await storeSet(k, robots.filter(r => r.id !== id))
  return NextResponse.json({ ok: true })
}
