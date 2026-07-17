"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { Params } from "@/lib/defaults"
import type { ParamsOverview } from "@/app/api/params-overview/route"

const POLL_MS = 5000

// TeamController.tsx の GROUPS と同じ日本語ラベル（SPEED_MIN のみ UI 未掲載のため独自）
const PARAM_LABELS: Record<keyof Params, string> = {
  FGM_ENABLE: "自動運転 ON/OFF",
  FGM_FOV_DEG: "前を見る広さ",
  FGM_BIN_DEG: "角度の細かさ",
  FGM_SMOOTH_WIN: "距離のなめらかさ",
  FGM_CLEAR_TH: "かべとみなす距離",
  FGM_MIN_GAP_DEG: "通れる隙間の最小幅",
  FGM_TARGET: "目指す場所",
  FGM_BUBBLE_RADIUS: "危険ゾーンの大きさ",
  FGM_BUBBLE_MIN_DEG: "危険ゾーン 最小角度",
  FGM_BUBBLE_MAX_DEG: "危険ゾーン 最大角度",
  KP_GAP_ANGLE: "ハンドルの切れ味",
  MAX_STEER: "ハンドルの最大量",
  BASE_SPEED: "ふつうのスピード",
  SPEED_MIN: "最小スピード",
  SPEED_MAX: "最大スピード",
  TURN_SPEED: "曲がれないときのスピード",
  SPEED_STEER_DROP: "曲がるほど遅くなる量",
  SPEED_FRONT_DROP: "前が近いほど遅くなる量",
  FRONT_SLOW: "減速を始める距離",
  FRONT_STOP: "ほぼ止まる距離",
  PIVOT_ENABLE: "その場回転 ON/OFF",
  PIVOT_STEER_TH: "その場回転になる曲がり具合",
  PIVOT_SOFT_TH: "その場回転に切り替え始める量",
  PIVOT_MIN_SPEED: "その場回転中の最低スピード",
  FORWARD_DEG: "センサーの前方向補正",
  LIDAR_DX: "センサーの前後ずれ",
  LIDAR_DY: "センサーの左右ずれ",
  EMA_ALPHA: "距離データのなめらかさ",
  FRONT_WINDOW_DEG: "前方として見る角度の幅",
  MOTOR_FREQ: "モーターの振動数",
  SPEED_CMD_SCALE: "速度の調整倍率",
}

export default function ParamsTablePage() {
  const [data, setData] = useState<ParamsOverview | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const fetchOverview = async () => {
      try {
        const res = await fetch("/api/params-overview", { cache: "no-store" })
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
      <div className="max-w-full mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">
            <span className="text-cyan-400 font-mono mr-2 text-xl">&gt;</span>全チームパラメータ一覧
          </h1>
          <p className="text-gray-500 text-xs font-mono">
            {error ? "取得エラー — 再試行中…" : data ? "5秒ごとに自動更新・デフォルトと異なる値を強調表示" : "読み込み中…"}
          </p>
        </div>

        {data && <ParamsTable data={data} />}
      </div>
    </main>
  )
}

function ParamsTable({ data }: { data: ParamsOverview }) {
  const paramKeys = Object.keys(data.defaults) as (keyof Params)[]
  // 列 = デフォルト + チームごとの全ロボット（フラット化して列順を固定）
  const columns = data.teams.flatMap(({ team, robots }) =>
    robots.map((r, i) => ({ team, robot: r, first: i === 0, span: robots.length }))
  )

  return (
    <div className="bg-[#0b1828] border border-[#1a3048] rounded-xl overflow-x-auto">
      <table className="text-xs font-mono border-collapse min-w-full">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-[#0b1828] border-b border-r border-[#1a3048] px-3 py-2 text-left text-gray-400">
              パラメータ
            </th>
            <th rowSpan={2} className="border-b border-r border-[#1a3048] px-3 py-2 text-gray-500">
              デフォルト
            </th>
            {data.teams.map(({ team, robots }) => (
              <th
                key={team}
                colSpan={robots.length}
                className="border-b border-r border-[#1a3048] px-3 py-2 text-cyan-400 uppercase"
              >
                <Link href={`/${team}`} className="hover:underline">チーム {team.toUpperCase()}</Link>
              </th>
            ))}
          </tr>
          <tr>
            {columns.map(({ team, robot }) => (
              <th
                key={`${team}:${robot.id}`}
                className="border-b border-r border-[#1a3048] px-3 py-1.5 text-gray-400 font-normal whitespace-nowrap"
              >
                {robot.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paramKeys.map((k) => (
            <tr key={k} className="hover:bg-white/[0.03]">
              <td className="sticky left-0 z-10 bg-[#0b1828] border-b border-r border-[#1a3048] px-3 py-1.5 text-gray-300 whitespace-nowrap">
                {k}
                <span className="text-gray-500 ml-1">（{PARAM_LABELS[k]}）</span>
              </td>
              <td className="border-b border-r border-[#1a3048] px-3 py-1.5 text-center text-gray-500 whitespace-nowrap">
                {formatValue(data.defaults[k])}
              </td>
              {columns.map(({ team, robot }) => {
                const v = robot.params[k]
                const diff = v !== data.defaults[k]
                return (
                  <td
                    key={`${team}:${robot.id}`}
                    className={`border-b border-r border-[#1a3048] px-3 py-1.5 text-center whitespace-nowrap ${
                      diff ? "text-cyan-300 bg-cyan-500/10 font-bold" : "text-gray-400"
                    }`}
                  >
                    {formatValue(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatValue(v: Params[keyof Params]): string {
  if (typeof v === "boolean") return v ? "ON" : "OFF"
  return String(v)
}
