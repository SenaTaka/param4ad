import { NextResponse } from "next/server"
import { storeGet } from "@/lib/store"
import { TEAMS, key, robotsKey } from "@/lib/keys"
import { DEFAULT_PARAMS, type Params } from "@/lib/defaults"
import type { Robot } from "@/app/api/robots/route"

export const dynamic = "force-dynamic"

export type ParamsOverviewRobot = {
  id: string
  name: string
  params: Params
}

export type ParamsOverview = {
  ts: number
  defaults: Params
  teams: { team: string; robots: ParamsOverviewRobot[] }[]
}

// 全チーム × 全ロボットのパラメータをまとめて返す（一覧表ページ用・読み取り専用）
export async function GET() {
  const teams = await Promise.all(
    TEAMS.map(async (team) => {
      const registered = await storeGet<Robot[]>(robotsKey(team), [])
      // 未登録チームは ROBOT_ID 未指定機体が使う "default" を表示する
      const robots = registered.length > 0 ? registered : [{ id: "default", name: "default" }]
      const withParams = await Promise.all(
        robots.map(async (r) => ({
          id: r.id,
          name: r.name,
          params: await storeGet<Params>(key("params", team, r.id), DEFAULT_PARAMS),
        }))
      )
      return { team, robots: withParams }
    })
  )
  return NextResponse.json({
    ts: Date.now() / 1000,
    defaults: DEFAULT_PARAMS,
    teams,
  } satisfies ParamsOverview)
}
