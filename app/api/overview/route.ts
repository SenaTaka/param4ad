import { NextResponse } from "next/server"
import { storeGet } from "@/lib/store"
import { TEAMS, key, robotsKey } from "@/lib/keys"
import type { RaspiStatus } from "@/lib/defaults"
import type { Robot } from "@/app/api/robots/route"

export const dynamic = "force-dynamic"

export type OverviewRobot = {
  id: string
  name: string
  status: RaspiStatus | null
}

export type Overview = {
  ts: number
  teams: { team: string; robots: OverviewRobot[] }[]
}

// 全チームのロボット一覧 + 各ロボットの最新ステータスをまとめて返す（管理画面用）
export async function GET() {
  const teams = await Promise.all(
    TEAMS.map(async (team) => {
      const robots = await storeGet<Robot[]>(robotsKey(team), [])
      const withStatus = await Promise.all(
        robots.map(async (r) => ({
          id: r.id,
          name: r.name,
          status: await storeGet<RaspiStatus | null>(key("status", team, r.id), null),
        }))
      )
      return { team, robots: withStatus }
    })
  )
  return NextResponse.json({ ts: Date.now() / 1000, teams } satisfies Overview)
}
