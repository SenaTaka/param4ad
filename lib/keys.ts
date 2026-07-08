import type { NextRequest } from "next/server"

// 有効チーム（a〜e の5チーム）
export const TEAMS = ["a", "b", "c", "d", "e"] as const
export type Team = (typeof TEAMS)[number]
const TEAM_SET = new Set<string>(TEAMS)

export function isValidTeam(t: string | null | undefined): t is Team {
  return !!t && TEAM_SET.has(t)
}

// リクエストからチームを取得（不正・未指定は "a" にフォールバック）
export function teamOf(req: NextRequest): Team {
  const t = req.nextUrl.searchParams.get("team")
  return isValidTeam(t) ? t : "a"
}

// リクエストからロボットIDを取得（未指定は "default"）
export function robotOf(req: NextRequest): string {
  return req.nextUrl.searchParams.get("robot") || "default"
}

// team + robot でスコープしたストアキー
export const key = (base: string, team: string, robot: string) =>
  `${base}:${team}:${robot}`

// チームごとのロボット一覧キー
export const robotsKey = (team: string) => `robots:${team}`
