"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import {
  ftgControl, stepRobot,
  DEFAULT_SIM_PARAMS,
  type Wall, type RobotState, type FTGResult, type SimParams,
} from "@/lib/ftg-sim"

// ── Circuit: 12m × 8m, scale 65px/m ─────────────────────────────────────────
// Track width ~1.6m.  Clockwise on screen (east→north→west→south).
// Chicane: bottom corridor, two alternating barriers.
// S-curve: right corridor, two barriers forcing left-right weave.

const W = 12, H = 8, SCALE = 65
const CW = W * SCALE   // 780
const CH = H * SCALE   // 520

function w2c(v: number) { return v * SCALE }

// Outer boundary
const OUTER: Wall[] = [
  [{ x: 0.4, y: 0.4 }, { x: 11.6, y: 0.4 }],
  [{ x: 11.6, y: 0.4 }, { x: 11.6, y: 7.6 }],
  [{ x: 11.6, y: 7.6 }, { x: 0.4, y: 7.6 }],
  [{ x: 0.4, y: 7.6 }, { x: 0.4, y: 0.4 }],
]

// Inner island: x 2.0-10.0, y 1.6-6.0
const INNER: Wall[] = [
  [{ x: 2.0, y: 1.6 }, { x: 10.0, y: 1.6 }],
  [{ x: 10.0, y: 1.6 }, { x: 10.0, y: 6.0 }],
  [{ x: 10.0, y: 6.0 }, { x: 2.0, y: 6.0 }],
  [{ x: 2.0, y: 6.0 }, { x: 2.0, y: 1.6 }],
]

// Chicane barrier A: from outer wall (y=7.6) up to y=6.9, x=3.5-5.2
// → robot must pass ABOVE (between y=6.0 and y=6.9, gap=0.9m)
const CHICANE_A: Wall[] = [
  [{ x: 3.5, y: 7.6 }, { x: 3.5, y: 6.9 }],
  [{ x: 3.5, y: 6.9 }, { x: 5.2, y: 6.9 }],
  [{ x: 5.2, y: 6.9 }, { x: 5.2, y: 7.6 }],
]

// Chicane barrier B: from inner wall (y=6.0) down to y=6.7, x=5.2-6.8
// → robot must pass BELOW (between y=6.7 and y=7.6, gap=0.9m)
const CHICANE_B: Wall[] = [
  [{ x: 5.2, y: 6.0 }, { x: 5.2, y: 6.7 }],
  [{ x: 5.2, y: 6.7 }, { x: 6.8, y: 6.7 }],
  [{ x: 6.8, y: 6.7 }, { x: 6.8, y: 6.0 }],
]

// S-curve barrier C: from outer wall (x=11.6) left to x=11.0, y=4.0-5.0
// → robot going north must pass LEFT (between x=10.0 and x=11.0, gap=1.0m)
const SCURVE_C: Wall[] = [
  [{ x: 11.6, y: 4.0 }, { x: 11.0, y: 4.0 }],
  [{ x: 11.0, y: 4.0 }, { x: 11.0, y: 5.0 }],
  [{ x: 11.0, y: 5.0 }, { x: 11.6, y: 5.0 }],
]

// S-curve barrier D: from inner wall (x=10.0) right to x=10.8, y=2.2-3.2
// → robot going north must pass RIGHT (between x=10.8 and x=11.6, gap=0.8m)
const SCURVE_D: Wall[] = [
  [{ x: 10.0, y: 2.2 }, { x: 10.8, y: 2.2 }],
  [{ x: 10.8, y: 2.2 }, { x: 10.8, y: 3.2 }],
  [{ x: 10.8, y: 3.2 }, { x: 10.0, y: 3.2 }],
]

const WALLS: Wall[] = [
  ...OUTER, ...INNER,
  ...CHICANE_A, ...CHICANE_B,
  ...SCURVE_C, ...SCURVE_D,
]

// Solid obstacle rects (for drawing)
const OBSTACLES = [
  { x: 2.0,  y: 1.6, w: 8.0, h: 4.4, label: "" },          // inner island
  { x: 3.5,  y: 6.9, w: 1.7, h: 0.7, label: "シケイン①" }, // chicane A
  { x: 5.2,  y: 6.0, w: 1.6, h: 0.7, label: "シケイン②" }, // chicane B
  { x: 11.0, y: 4.0, w: 0.6, h: 1.0, label: "Sカーブ①" }, // S-curve C
  { x: 10.0, y: 2.2, w: 0.8, h: 1.0, label: "Sカーブ②" }, // S-curve D
]

const INIT_ROBOT: RobotState = { x: 3.0, y: 6.8, heading: 0 }

// ── Draw ─────────────────────────────────────────────────────────────────────
function drawFrame(
  ctx: CanvasRenderingContext2D,
  robot: RobotState,
  result: FTGResult | null,
  trail: { x: number; y: number }[],
  layers: { rays: boolean; bubble: boolean; gap: boolean },
) {
  // grass / outer area
  ctx.fillStyle = "#4b5563"
  ctx.fillRect(0, 0, CW, CH)

  // road surface (inside outer walls)
  ctx.fillStyle = "#d1d5db"
  ctx.fillRect(w2c(0.4), w2c(0.4), w2c(11.2), w2c(7.2))

  // obstacles & island
  ctx.fillStyle = "#6b7280"
  for (const o of OBSTACLES) {
    ctx.fillRect(w2c(o.x), w2c(o.y), w2c(o.w), w2c(o.h))
  }

  // obstacle labels
  ctx.fillStyle = "#e5e7eb"
  ctx.font = `bold ${w2c(0.22)}px sans-serif`
  ctx.textAlign = "center"
  for (const o of OBSTACLES) {
    if (o.label) {
      ctx.fillText(o.label, w2c(o.x + o.w / 2), w2c(o.y + o.h / 2) + w2c(0.1))
    }
  }

  // outer wall border
  ctx.strokeStyle = "#1f2937"
  ctx.lineWidth = 3
  for (const [p1, p2] of WALLS) {
    ctx.beginPath()
    ctx.moveTo(w2c(p1.x), w2c(p1.y))
    ctx.lineTo(w2c(p2.x), w2c(p2.y))
    ctx.stroke()
  }

  // trail
  if (trail.length > 1) {
    ctx.strokeStyle = "rgba(96,165,250,0.5)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(w2c(trail[0].x), w2c(trail[0].y))
    for (let i = 1; i < trail.length; i++) ctx.lineTo(w2c(trail[i].x), w2c(trail[i].y))
    ctx.stroke()
  }

  if (result) {
    const rx = w2c(robot.x), ry = w2c(robot.y)

    // LiDAR rays
    if (layers.rays) {
      for (let i = 0; i < result.ranges.length; i++) {
        const d = result.ranges[i]
        const t = Math.min(d / 4, 1)
        ctx.strokeStyle = `rgba(${Math.round(255*(1-t))},${Math.round(200*t)},0,0.55)`
        ctx.lineWidth = 1
        const wa = robot.heading - (result.angles[i] * Math.PI) / 180
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx + w2c(d) * Math.cos(wa), ry + w2c(d) * Math.sin(wa))
        ctx.stroke()
      }
    }

    // bubble sector (zeroed bins)
    if (layers.bubble) {
      ctx.fillStyle = "rgba(239,68,68,0.18)"
      ctx.beginPath(); ctx.moveTo(rx, ry)
      for (let i = 0; i < result.angles.length; i++) {
        if (result.ranges2[i] === 0) {
          const wa = robot.heading - (result.angles[i] * Math.PI) / 180
          ctx.lineTo(rx + w2c(2.2) * Math.cos(wa), ry + w2c(2.2) * Math.sin(wa))
        }
      }
      ctx.closePath(); ctx.fill()
    }

    // gap sector
    if (layers.gap && result.gap) {
      const [i0, i1] = result.gap
      ctx.fillStyle = "rgba(34,197,94,0.22)"
      ctx.strokeStyle = "rgba(34,197,94,0.7)"
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(rx, ry)
      for (let i = i0; i <= i1; i++) {
        const wa = robot.heading - (result.angles[i] * Math.PI) / 180
        const d = Math.min(result.ranges2[i], 3.5)
        ctx.lineTo(rx + w2c(d) * Math.cos(wa), ry + w2c(d) * Math.sin(wa))
      }
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }

    // target arrow
    if (result.tgtDeg !== null) {
      const wa = robot.heading - (result.tgtDeg * Math.PI) / 180
      const len = w2c(0.7)
      const tx = rx + len * Math.cos(wa), ty = ry + len * Math.sin(wa)
      ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(tx, ty); ctx.stroke()
      ctx.fillStyle = "#facc15"
      ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill()
    }
  }

  // robot body
  const rx = w2c(robot.x), ry = w2c(robot.y)
  const bw = w2c(0.22), bh = w2c(0.16)
  ctx.save()
  ctx.translate(rx, ry)
  ctx.rotate(robot.heading)
  ctx.fillStyle = "#3b82f6"
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
  ctx.fillStyle = "#93c5fd"
  ctx.fillRect(bw / 2 - 7, -3, 7, 6)
  ctx.restore()
}

// ── Page ─────────────────────────────────────────────────────────────────────
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

  useEffect(() => { paramsRef.current = params }, [params])
  useEffect(() => { runningRef.current = running }, [running])

  // fetch from /api/params on mount
  useEffect(() => {
    fetch("/api/params").then(r => r.json()).then((d: Record<string, unknown>) => {
      setParams(prev => ({
        ...prev,
        fovDeg:       typeof d.FGM_FOV_DEG === "number"       ? d.FGM_FOV_DEG       : prev.fovDeg,
        clearTh:      typeof d.FGM_CLEAR_TH === "number"      ? d.FGM_CLEAR_TH      : prev.clearTh,
        bubbleRadius: typeof d.FGM_BUBBLE_RADIUS === "number" ? d.FGM_BUBBLE_RADIUS  : prev.bubbleRadius,
        kp:           typeof d.KP_GAP_ANGLE === "number"      ? d.KP_GAP_ANGLE       : prev.kp,
        maxSteer:     typeof d.MAX_STEER === "number"         ? d.MAX_STEER          : prev.maxSteer,
        baseSpeed:    typeof d.BASE_SPEED === "number"        ? d.BASE_SPEED         : prev.baseSpeed,
        speedMax:     typeof d.SPEED_MAX === "number"         ? d.SPEED_MAX          : prev.speedMax,
        turnSpeed:    typeof d.TURN_SPEED === "number"        ? d.TURN_SPEED         : prev.turnSpeed,
      }))
    }).catch(() => {})
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
        if (trailRef.current.length > 800) trailRef.current.shift()
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
          <span>{label}</span>
          <span className="font-mono">{val.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={val}
          onChange={e => setParams(prev => ({ ...prev, [k]: parseFloat(e.target.value) }))}
          className="w-full accent-cyan-400" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#04090f] text-white p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* header */}
        <div>
          <h1 className="text-xl font-bold text-cyan-400 tracking-tight">
            <span className="font-mono mr-1 opacity-60">&gt;</span>FTG シミュレータ
          </h1>
          <p className="text-xs text-gray-500 font-mono">シケイン + Sカーブ コース — トップダウン2D</p>
        </div>

        {/* canvas */}
        <div className="rounded-xl overflow-hidden border border-[#1a3048]">
          <canvas ref={canvasRef} width={CW} height={CH} className="w-full h-auto block" />
        </div>

        {/* controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => setRunning(r => !r)}
            className={`min-h-[44px] px-6 rounded-xl font-bold text-sm transition-all active:scale-[0.97] ${running
              ? "bg-yellow-500 hover:bg-yellow-400 text-black"
              : "bg-green-500 hover:bg-green-400 text-black"}`}>
            {running ? "⏸ 停止" : "▶ スタート"}
          </button>
          <button onClick={reset} className="min-h-[44px] px-5 rounded-xl text-sm bg-[#1a3048] hover:bg-[#243f5e] transition-all active:scale-[0.97]">
            ↺ リセット
          </button>

          <div className="flex gap-1 ml-2">
            {(["rays", "bubble", "gap"] as const).map(k => (
              <label key={k} className="flex items-center gap-2 cursor-pointer select-none min-h-[44px] px-3 rounded-lg hover:bg-[#1a3048] transition-colors">
                <input type="checkbox" checked={layers[k]}
                  onChange={e => setLayers(prev => ({ ...prev, [k]: e.target.checked }))}
                  className="accent-cyan-400 w-4 h-4" />
                <span className="text-gray-300 text-sm">
                  {k === "rays" ? "LiDAR" : k === "bubble" ? "バブル" : "ギャップ"}
                </span>
              </label>
            ))}
          </div>

          <div className="ml-auto font-mono text-xs text-gray-400 flex gap-3">
            <span>steer <span className="text-white">{stats.steer.toFixed(2)}</span></span>
            <span>L <span className="text-white">{stats.ls.toFixed(2)}</span></span>
            <span>R <span className="text-white">{stats.rs.toFixed(2)}</span></span>
            <span>前方 <span className="text-white">{stats.front.toFixed(2)}m</span></span>
          </div>
        </div>

        {/* sliders */}
        <div className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          <Slider label="視野角 FOV (°)" k="fovDeg" min={60} max={180} step={5} />
          <Slider label="障害物閾値 CLEAR_TH (m)" k="clearTh" min={0.3} max={3} step={0.05} />
          <Slider label="バブル半径 (m)" k="bubbleRadius" min={0.05} max={0.6} step={0.01} />
          <Slider label="ゲイン KP" k="kp" min={0.1} max={2} step={0.05} />
          <Slider label="基本速度" k="baseSpeed" min={0.1} max={1} step={0.05} />
          <Slider label="最大速度" k="speedMax" min={0.1} max={1} step={0.05} />
          <Slider label="旋回速度" k="turnSpeed" min={0.05} max={0.8} step={0.05} />
          <Slider label="ステア減速" k="speedSteerDrop" min={0} max={1} step={0.05} />
          <Slider label="前方減速" k="speedFrontDrop" min={0} max={1} step={0.05} />
        </div>

        {/* legend */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-400 mr-1" />ロボット（→先頭）</span>
          <span><span className="inline-block w-8 h-1 bg-gradient-to-r from-red-500 to-green-400 mr-1" />LiDARレイ（近=赤/遠=緑）</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-red-400 opacity-50 mr-1" />バブル</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-400 opacity-50 mr-1" />ギャップ</span>
          <span><span className="inline-block w-4 h-1 bg-yellow-400 mr-1" />目標</span>
          <span><span className="inline-block w-4 h-1 bg-blue-300 opacity-40 mr-1" />軌跡</span>
        </div>
      </div>
    </main>
  )
}
