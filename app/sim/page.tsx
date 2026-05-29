"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ftgControl, stepRobot,
  DEFAULT_SIM_PARAMS,
  type Wall, type RobotState, type FTGResult, type SimParams,
} from "@/lib/ftg-sim"

// ---- Circuit ----
// World: 6m × 4m. Track width: 1m. Scale: 100px/m.
const W = 6, H = 4
const OUTER: Wall[] = [
  [{ x: 0, y: 0 }, { x: W, y: 0 }],
  [{ x: W, y: 0 }, { x: W, y: H }],
  [{ x: W, y: H }, { x: 0, y: H }],
  [{ x: 0, y: H }, { x: 0, y: 0 }],
]
const INNER: Wall[] = [
  [{ x: 1, y: 1 }, { x: 5, y: 1 }],
  [{ x: 5, y: 1 }, { x: 5, y: 3 }],
  [{ x: 5, y: 3 }, { x: 1, y: 3 }],
  [{ x: 1, y: 3 }, { x: 1, y: 1 }],
]
const WALLS: Wall[] = [...OUTER, ...INNER]

const SCALE = 100   // px/m
const CW = W * SCALE
const CH = H * SCALE

const INIT_ROBOT: RobotState = { x: 2.0, y: 3.5, heading: 0 }

// ---- Draw helpers ----
function w2c(v: number) { return v * SCALE }

function drawFrame(
  ctx: CanvasRenderingContext2D,
  robot: RobotState,
  result: FTGResult | null,
  trail: { x: number; y: number }[],
  layers: { rays: boolean; bubble: boolean; gap: boolean },
) {
  ctx.clearRect(0, 0, CW, CH)

  // background road
  ctx.fillStyle = "#e5e7eb"
  ctx.fillRect(0, 0, CW, CH)

  // inner island
  ctx.fillStyle = "#9ca3af"
  ctx.fillRect(w2c(1), w2c(1), w2c(4), w2c(2))

  // track surface
  ctx.fillStyle = "#f3f4f6"
  ctx.fillRect(0, 0, CW, CH)
  ctx.fillStyle = "#9ca3af"
  ctx.fillRect(w2c(1), w2c(1), w2c(4), w2c(2))

  // walls
  ctx.strokeStyle = "#374151"
  ctx.lineWidth = 3
  for (const [p1, p2] of WALLS) {
    ctx.beginPath()
    ctx.moveTo(w2c(p1.x), w2c(p1.y))
    ctx.lineTo(w2c(p2.x), w2c(p2.y))
    ctx.stroke()
  }

  // trail
  if (trail.length > 1) {
    ctx.strokeStyle = "rgba(96,165,250,0.4)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(w2c(trail[0].x), w2c(trail[0].y))
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(w2c(trail[i].x), w2c(trail[i].y))
    }
    ctx.stroke()
  }

  if (result) {
    const rx = w2c(robot.x)
    const ry = w2c(robot.y)

    // LiDAR rays
    if (layers.rays) {
      const { ranges, angles } = result
      for (let i = 0; i < ranges.length; i++) {
        const d = ranges[i]
        const t = Math.min(d / 4, 1)
        const r = Math.round(255 * (1 - t))
        const g = Math.round(200 * t)
        ctx.strokeStyle = `rgba(${r},${g},0,0.5)`
        ctx.lineWidth = 1
        const worldAngle = robot.heading - (angles[i] * Math.PI) / 180
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx + w2c(d) * Math.cos(worldAngle), ry + w2c(d) * Math.sin(worldAngle))
        ctx.stroke()
      }
    }

    // bubble sector
    if (layers.bubble && result.dmin !== null && result.amin !== null) {
      const { angles, ranges2 } = result
      ctx.fillStyle = "rgba(239,68,68,0.15)"
      ctx.strokeStyle = "rgba(239,68,68,0.5)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      for (let i = 0; i < angles.length; i++) {
        if (ranges2[i] === 0) {
          const wa = robot.heading - (angles[i] * Math.PI) / 180
          const maxR = w2c(2.5)
          ctx.lineTo(rx + maxR * Math.cos(wa), ry + maxR * Math.sin(wa))
        }
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // gap sector
    if (layers.gap && result.gap) {
      const [i0, i1] = result.gap
      const { angles, ranges2 } = result
      ctx.fillStyle = "rgba(34,197,94,0.2)"
      ctx.strokeStyle = "rgba(34,197,94,0.6)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      for (let i = i0; i <= i1; i++) {
        const wa = robot.heading - (angles[i] * Math.PI) / 180
        const d = Math.min(ranges2[i], 4)
        ctx.lineTo(rx + w2c(d) * Math.cos(wa), ry + w2c(d) * Math.sin(wa))
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // target arrow
    if (result.tgtDeg !== null) {
      const wa = robot.heading - (result.tgtDeg * Math.PI) / 180
      const len = w2c(0.6)
      const tx = rx + len * Math.cos(wa)
      const ty = ry + len * Math.sin(wa)
      ctx.strokeStyle = "#facc15"
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(rx, ry)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      ctx.fillStyle = "#facc15"
      ctx.beginPath()
      ctx.arc(tx, ty, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // robot body
  const rx = w2c(robot.x)
  const ry = w2c(robot.y)
  const bw = w2c(0.2), bh = w2c(0.15)
  ctx.save()
  ctx.translate(rx, ry)
  ctx.rotate(robot.heading)
  ctx.fillStyle = "#3b82f6"
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
  // direction indicator
  ctx.fillStyle = "#93c5fd"
  ctx.fillRect(bw / 2 - 6, -3, 6, 6)
  ctx.restore()
}

// ---- Page ----
export default function SimPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const robotRef = useRef<RobotState>({ ...INIT_ROBOT })
  const paramsRef = useRef<SimParams>({ ...DEFAULT_SIM_PARAMS })
  const resultRef = useRef<FTGResult | null>(null)
  const trailRef = useRef<{ x: number; y: number }[]>([])
  const runningRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [layers, setLayers] = useState({ rays: true, bubble: true, gap: true })
  const [params, setParams] = useState<SimParams>({ ...DEFAULT_SIM_PARAMS })
  const [stats, setStats] = useState({ steer: 0, ls: 0, rs: 0, front: 0 })

  // sync params to ref
  useEffect(() => { paramsRef.current = params }, [params])
  useEffect(() => { runningRef.current = running }, [running])

  // fetch from API on mount
  useEffect(() => {
    fetch("/api/params")
      .then(r => r.json())
      .then((d: Record<string, unknown>) => {
        setParams(prev => ({
          ...prev,
          fovDeg:        typeof d.FGM_FOV_DEG === "number"       ? d.FGM_FOV_DEG        : prev.fovDeg,
          binDeg:        typeof d.FGM_BIN_DEG === "number"       ? d.FGM_BIN_DEG        : prev.binDeg,
          smoothWin:     typeof d.FGM_SMOOTH_WIN === "number"    ? d.FGM_SMOOTH_WIN     : prev.smoothWin,
          clearTh:       typeof d.FGM_CLEAR_TH === "number"      ? d.FGM_CLEAR_TH       : prev.clearTh,
          minGapDeg:     typeof d.FGM_MIN_GAP_DEG === "number"   ? d.FGM_MIN_GAP_DEG    : prev.minGapDeg,
          target:        d.FGM_TARGET === "MID"                  ? "MID"                : prev.target,
          bubbleRadius:  typeof d.FGM_BUBBLE_RADIUS === "number" ? d.FGM_BUBBLE_RADIUS  : prev.bubbleRadius,
          kp:            typeof d.KP_GAP_ANGLE === "number"      ? d.KP_GAP_ANGLE       : prev.kp,
          maxSteer:      typeof d.MAX_STEER === "number"         ? d.MAX_STEER          : prev.maxSteer,
          baseSpeed:     typeof d.BASE_SPEED === "number"        ? d.BASE_SPEED         : prev.baseSpeed,
          speedMax:      typeof d.SPEED_MAX === "number"         ? d.SPEED_MAX          : prev.speedMax,
          turnSpeed:     typeof d.TURN_SPEED === "number"        ? d.TURN_SPEED         : prev.turnSpeed,
          frontSlow:     typeof d.FRONT_SLOW === "number"        ? d.FRONT_SLOW         : prev.frontSlow,
          frontStop:     typeof d.FRONT_STOP === "number"        ? d.FRONT_STOP         : prev.frontStop,
        }))
      })
      .catch(() => {})
  }, [])

  // animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let rafId: number
    let prev = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now

      if (runningRef.current) {
        const res = ftgControl(robotRef.current, WALLS, paramsRef.current)
        robotRef.current = stepRobot(robotRef.current, res.ls, res.rs, dt)
        resultRef.current = res
        trailRef.current.push({ x: robotRef.current.x, y: robotRef.current.y })
        if (trailRef.current.length > 600) trailRef.current.shift()
        setStats({ steer: res.steer, ls: res.ls, rs: res.rs, front: res.frontDist })
      }

      drawFrame(ctx, robotRef.current, resultRef.current, trailRef.current, layers)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [layers])

  const reset = useCallback(() => {
    robotRef.current = { ...INIT_ROBOT }
    resultRef.current = null
    trailRef.current = []
    setRunning(false)
  }, [])

  function Slider({ label, k, min, max, step }: {
    label: string; k: keyof SimParams; min: number; max: number; step: number
  }) {
    const val = params[k] as number
    return (
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-0.5">
          <span>{label}</span><span className="font-mono">{val.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={val}
          onChange={e => setParams(prev => ({ ...prev, [k]: parseFloat(e.target.value) }))}
          className="w-full accent-blue-500" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-400">FTG シミュレータ</h1>
            <p className="text-xs text-gray-500">Follow-the-Gap — トップダウン2D</p>
          </div>
          <div className="flex gap-3 text-xs">
            <Link href="/explain" className="text-blue-400 hover:underline">アルゴ解説</Link>
            <Link href="/" className="text-gray-400 hover:underline">← パラメータ設定</Link>
          </div>
        </div>

        {/* canvas */}
        <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-900">
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            className="w-full h-auto block"
          />
        </div>

        {/* controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setRunning(r => !r)}
            className={`px-5 py-2 rounded-lg font-bold text-sm ${running ? "bg-yellow-500 hover:bg-yellow-400 text-black" : "bg-green-500 hover:bg-green-400 text-black"}`}
          >
            {running ? "⏸ 停止" : "▶ スタート"}
          </button>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600"
          >
            ↺ リセット
          </button>

          <div className="flex gap-3 ml-2 text-sm">
            {(["rays", "bubble", "gap"] as const).map(k => (
              <label key={k} className="flex items-center gap-1 cursor-pointer select-none">
                <input type="checkbox" checked={layers[k]}
                  onChange={e => setLayers(prev => ({ ...prev, [k]: e.target.checked }))}
                  className="accent-blue-500" />
                <span className="text-gray-300 text-xs">
                  {k === "rays" ? "LiDAR" : k === "bubble" ? "バブル" : "ギャップ"}
                </span>
              </label>
            ))}
          </div>

          {/* live stats */}
          <div className="ml-auto font-mono text-xs text-gray-400 flex gap-3">
            <span>steer <span className="text-white">{stats.steer.toFixed(2)}</span></span>
            <span>L <span className="text-white">{stats.ls.toFixed(2)}</span></span>
            <span>R <span className="text-white">{stats.rs.toFixed(2)}</span></span>
            <span>前方 <span className="text-white">{stats.front.toFixed(2)}m</span></span>
          </div>
        </div>

        {/* params */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <Slider label="視野角 FOV (°)" k="fovDeg" min={30} max={180} step={5} />
          <Slider label="障害物閾値 CLEAR_TH (m)" k="clearTh" min={0.3} max={3} step={0.05} />
          <Slider label="バブル半径 (m)" k="bubbleRadius" min={0.05} max={0.8} step={0.01} />
          <Slider label="ゲイン KP" k="kp" min={0.1} max={2} step={0.05} />
          <Slider label="基本速度" k="baseSpeed" min={0.1} max={1} step={0.05} />
          <Slider label="最大速度" k="speedMax" min={0.1} max={1} step={0.05} />
          <Slider label="旋回速度" k="turnSpeed" min={0.05} max={0.8} step={0.05} />
          <Slider label="ステア減速" k="speedSteerDrop" min={0} max={1} step={0.05} />
          <Slider label="前方減速" k="speedFrontDrop" min={0} max={1} step={0.05} />
        </div>

        {/* legend */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-400 mr-1" />ロボット</span>
          <span><span className="inline-block w-3 h-1 bg-gradient-to-r from-red-500 to-green-400 mr-1" />LiDARレイ (近=赤/遠=緑)</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-red-400 opacity-50 mr-1" />バブル</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-400 opacity-50 mr-1" />ギャップ</span>
          <span><span className="inline-block w-3 h-1 bg-yellow-400 mr-1" />目標</span>
          <span><span className="inline-block w-3 h-1 bg-blue-300 opacity-40 mr-1" />軌跡</span>
        </div>
      </div>
    </main>
  )
}
