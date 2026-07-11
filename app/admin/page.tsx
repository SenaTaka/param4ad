"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { Overview, OverviewRobot } from "@/app/api/overview/route"

const POLL_MS = 3000

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const fetchOverview = async () => {
      try {
        const res = await fetch("/api/overview", { cache: "no-store" })
        if (!alive) return
        setData(await res.json())
        setError(false)
      } catch {
        if (alive) setError(true)
      }
    }
    fetchOverview()
    const t = setInterval(fetchOverview, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return (
    <main className="min-h-screen bg-[#04090f] p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">
            <span className="text-cyan-400 font-mono mr-2 text-xl">&gt;</span>全チーム接続状況
          </h1>
          <p className="text-gray-500 text-xs font-mono">
            {error ? "取得エラー — 再試行中…" : data ? "3秒ごとに自動更新" : "読み込み中…"}
          </p>
        </div>

        {data?.teams.map(({ team, robots }) => (
          <section key={team} className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-white font-mono uppercase">
                チーム {team.toUpperCase()}
              </h2>
              <Link href={`/${team}`} className="text-[11px] text-cyan-400 hover:underline font-mono">
                操作画面 →
              </Link>
            </div>
            {robots.length === 0 ? (
              <p className="text-xs text-gray-600 font-mono py-1">ロボット未登録</p>
            ) : (
              <div className="space-y-2">
                {robots.map((r) => (
                  <RobotRow key={r.id} robot={r} serverTs={data.ts} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  )
}

function RobotRow({ robot, serverTs }: { robot: OverviewRobot; serverTs: number }) {
  const s = robot.status
  const age = s ? serverTs - s.ts : Infinity
  const online = age < 10
  const lidarErr = online && s?.lidar_error

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
      lidarErr ? "border-red-500/40 bg-red-500/5"
      : online ? "border-[#1a3048] bg-[#04090f]"
      : "border-[#1a3048] bg-[#04090f] opacity-60"
    }`}>
      <span className={`inline-flex h-2.5 w-2.5 rounded-full shrink-0 ${
        lidarErr ? "bg-red-400" : online ? "bg-green-400" : "bg-gray-600"
      }`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white font-mono truncate">
          {robot.name}
          <span className="text-gray-500 text-[10px] ml-2">({robot.id})</span>
        </p>
        <p className="text-[11px] font-mono text-gray-500 truncate">
          {!s ? "ステータスなし"
            : !online ? `切断（最終 ${formatAge(age)}前）`
            : lidarErr ? `⚠ LiDARエラー: ${s.lidar_error}`
            : `${s.mode}${s.armed ? "・受付中" : ""}${s.ip ? `・${s.ip}` : ""}`}
        </p>
      </div>
      {online && s && (
        <span className={`text-[10px] font-bold font-mono shrink-0 ${
          lidarErr ? "text-red-400" : s.mode === "RUN" ? "text-green-400" : "text-yellow-400"
        }`}>
          {lidarErr ? "LIDAR" : s.mode}
        </span>
      )}
    </div>
  )
}

function formatAge(sec: number): string {
  if (!isFinite(sec)) return "不明"
  if (sec < 60) return `${Math.round(sec)}秒`
  if (sec < 3600) return `${Math.round(sec / 60)}分`
  return `${Math.round(sec / 3600)}時間`
}
