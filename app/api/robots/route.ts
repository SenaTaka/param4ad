import { NextRequest, NextResponse } from "next/server"
import { storeGet, storeSet } from "@/lib/store"

export type Robot = { id: string; name: string }

export async function GET() {
  const robots = await storeGet<Robot[]>("robots", [])
  return NextResponse.json(robots)
}

export async function POST(req: NextRequest) {
  const { id, name } = await req.json() as Robot
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const robots = await storeGet<Robot[]>("robots", [])
  if (!robots.find(r => r.id === id)) {
    robots.push({ id, name: name || id })
    await storeSet("robots", robots)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const robots = await storeGet<Robot[]>("robots", [])
  await storeSet("robots", robots.filter(r => r.id !== id))
  return NextResponse.json({ ok: true })
}
