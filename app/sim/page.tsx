"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import {
  ftgControl, stepRobot, crossesLine,
  DEFAULT_SIM_PARAMS,
  type Wall, type RobotState, type FTGResult, type SimParams,
} from "@/lib/ftg-sim"
import type { Robot } from "@/app/api/robots/route"
import type { Params } from "@/lib/defaults"

// ── Circuit: 12m × 8m, scale 65px/m ─────────────────────────────────────────
const W = 12, H = 8, SCALE = 65
const CW = W * SCALE
const CH = H * SCALE

function w2c(v: number) { return v * SCALE }

const OUTER: Wall[] = [
  [{ x: 0.4, y: 0.4 }, { x: 11.6, y: 0.4 }],
  [{ x: 11.6, y: 0.4 }, { x: 11.6, y: 7.6 }],
  [{ x: 11.6, y: 7.6 }, { x: 0.4, y: 7.6 }],
  [{ x: 0.4, y: 7.6 }, { x: 0.4, y: 0.4 }],
]
const INNER: Wall[] = [
  [{ x: 2.0, y: 1.6 }, { x: 10.0, y: 1.6 }],
  [{ x: 10.0, y: 1.6 }, { x: 10.0, y: 6.0 }],
  [{ x: 10.0, y: 6.0 }, { x: 2.0, y: 6.0 }],
  [{ x: 2.0, y: 6.0 }, { x: 2.0, y: 1.6 }],
]
const CHICANE_A: Wall[] = [
  [{ x: 3.5, y: 7.6 }, { x: 3.5, y: 6.9 }],
  [{ x: 3.5, y: 6.9 }, { x: 5.2, y: 6.9 }],
  [{ x: 5.2, y: 6.9 }, { x: 5.2, y: 7.6 }],
]
const CHICANE_B: Wall[] = [
  [{ x: 5.2, y: 6.0 }, { x: 5.2, y: 6.7 }],
  [{ x: 5.2, y: 6.7 }, { x: 6.8, y: 6.7 }],
  [{ x: 6.8, y: 6.7 }, { x: 6.8, y: 6.0 }],
]
const SCURVE_C: Wall[] = [
  [{ x: 11.6, y: 4.0 }, { x: 11.0, y: 4.0 }],
  [{ x: 11.0, y: 4.0 }, { x: 11.0, y: 5.0 }],
  [{ x: 11.0, y: 5.0 }, { x: 11.6, y: 5.0 }],
]
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
const OBSTACLES = [
  { x: 2.0,  y: 1.6, w: 8.0, h: 4.4, label: "" },
  { x: 3.5,  y: 6.9, w: 1.7, h: 0.7, label: "シケイン①" },
  { x: 5.2,  y: 6.0, w: 1.6, h: 0.7, label: "シケイン②" },
  { x: 11.0, y: 4.0, w: 0.6, h: 1.0, label: "Sカーブ①" },
  { x: 10.0, y: 2.2, w: 0.8, h: 1.0, label: "Sカーブ②" },
]

const INIT_ROBOT: RobotState = { x: 3.0, y: 6.8, heading: 0 }

// ── Race constants ────────────────────────────────────────────────────────────
const FINISH_A = { x: 1.0, y: 6.2 }
const FINISH_B = { x: 1.0, y: 7.4 }
const TEAM_COLORS = ["#60a5fa", "#f87171", "#4ade80", "#facc15"]

// ── Params → SimParams ────────────────────────────────────────────────────────
function paramsToSim(p: Params): SimParams {
  return {
    fovDeg:         p.FGM_FOV_DEG,
    binDeg:         p.FGM_BIN_DEG,
    smoothWin:      p.FGM_SMOOTH_WIN,
    clearTh:        p.FGM_CLEAR_TH,
    minGapDeg:      p.FGM_MIN_GAP_DEG,
    target:         p.FGM_TARGET as "FAR" | "MID",
    bubbleRadius:   p.FGM_BUBBLE_RADIUS,
    bubbleMinDeg:   p.FGM_BUBBLE_MIN_DEG,
    bubbleMaxDeg:   p.FGM_BUBBLE_MAX_DEG,
    kp:             p.KP_GAP_ANGLE,
    maxSteer:       p.MAX_STEER,
    baseSpeed:      p.BASE_SPEED,
    speedMax:       p.SPEED_MAX,
    turnSpeed:      p.TURN_SPEED,
    speedSteerDrop: p.SPEED_STEER_DROP,
    speedFrontDrop: p.SPEED_FRONT_DROP,
    frontSlow:      p.FRONT_SLOW,
    frontStop:      p.FRONT_STOP,
    pivotEnable:    p.PIVOT_ENABLE,
    pivotSteerTh:   p.PIVOT_STEER_TH,
    pivotSoftTh:    p.PIVOT_SOFT_TH,
    pivotMinSpeed:  p.PIVOT_MIN_SPEED,
  }
}

// ── Race types ────────────────────────────────────────────────────────────────
type RacePhase = "idle" | "setup" | "countdown" | "running" | "finished"

type RaceRobot = {
  robotId: string
  name: string
  color: string
  simParams: SimParams
  state: RobotState
  prevState: RobotState
  trail: { x: number; y: number }[]
  lap: number
  lapTimes: number[]
  lastCrossAt: number
  crossedOnce: boolean
  finished: boolean
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toFixed(1).padStart(4, "0")}`
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#4b5563"
  ctx.fillRect(0, 0, CW, CH)
  ctx.fillStyle = "#d1d5db"
  ctx.fillRect(w2c(0.4), w2c(0.4), w2c(11.2), w2c(7.2))
  ctx.fillStyle = "#6b7280"
  for (const o of OBSTACLES) ctx.fillRect(w2c(o.x), w2c(o.y), w2c(o.w), w2c(o.h))
  ctx.fillStyle = "#e5e7eb"
  ctx.font = `bold ${w2c(0.22)}px sans-serif`
  ctx.textAlign = "center"
  for (const o of OBSTACLES) {
    if (o.label) ctx.fillText(o.label, w2c(o.x + o.w / 2), w2c(o.y + o.h / 2) + w2c(0.1))
  }
  ctx.strokeStyle = "#1f2937"
  ctx.lineWidth = 3
  for (const [p1, p2] of WALLS) {
    ctx.beginPath()
    ctx.moveTo(w2c(p1.x), w2c(p1.y))
    ctx.lineTo(w2c(p2.x), w2c(p2.y))
    ctx.stroke()
  }
}

function drawFinishLine(ctx: CanvasRenderingContext2D) {
  const fx = w2c(FINISH_A.x)
  const fy1 = w2c(FINISH_A.y)
  const fy2 = w2c(FINISH_B.y)
  const segH = (fy2 - fy1) / 8
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#111827"
    ctx.fillRect(fx - 5, fy1 + i * segH, 10, segH)
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  robot: RobotState,
  result: FTGResult | null,
  trail: { x: number; y: number }[],
  layers: { rays: boolean; bubble: boolean; gap: boolean },
) {
  drawBackground(ctx)

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

function drawRaceFrame(
  ctx: CanvasRenderingContext2D,
  robots: RaceRobot[],
  countdown: number,
) {
  drawBackground(ctx)
  drawFinishLine(ctx)

  for (const robot of robots) {
    if (robot.trail.length > 1) {
      ctx.strokeStyle = robot.color + "70"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(w2c(robot.trail[0].x), w2c(robot.trail[0].y))
      for (let i = 1; i < robot.trail.length; i++) {
        ctx.lineTo(w2c(robot.trail[i].x), w2c(robot.trail[i].y))
      }
      ctx.stroke()
    }
  }

  const bw = w2c(0.22), bh = w2c(0.16)
  for (const robot of robots) {
    const rx = w2c(robot.state.x), ry = w2c(robot.state.y)
    ctx.save()
    ctx.translate(rx, ry)
    ctx.rotate(robot.state.heading)
    ctx.fillStyle = robot.finished ? robot.color + "55" : robot.color
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(bw / 2 - 7, -3, 7, 6)
    ctx.restore()
    ctx.fillStyle = robot.color
    ctx.font = `bold ${w2c(0.14)}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText(robot.name.slice(0, 8), rx, ry - w2c(0.22))
  }

  if (countdown > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.55)"
    ctx.fillRect(0, 0, CW, CH)
    ctx.fillStyle = "#ffffff"
    ctx.font = `bold ${w2c(2)}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText(String(countdown), CW / 2, CH / 2 + w2c(0.8))
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SimPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Normal sim refs
  const robotRef   = useRef<RobotState>({ ...INIT_ROBOT })
  const paramsRef  = useRef<SimParams>({ ...DEFAULT_SIM_PARAMS })
  const resultRef  = useRef<FTGResult | null>(null)
  const trailRef   = useRef<{ x: number; y: number }[]>([])
  const runningRef = useRef(false)
  const layersRef  = useRef({ rays: true, bubble: true, gap: true })

  const [running, setRunning] = useState(false)
  const [layers,  setLayers]  = useState({ rays: true, bubble: true, gap: true })
  const [params,  setParams]  = useState<SimParams>({ ...DEFAULT_SIM_PARAMS })
  const [stats,   setStats]   = useState({ steer: 0, ls: 0, rs: 0, front: 0 })

  // Race refs
  const raceModeRef   = useRef<RacePhase>("idle")
  const raceRef       = useRef<RaceRobot[]>([])
  const totalLapsRef  = useRef(3)
  const countdownRef  = useRef(0)

  const [racePhase,       setRacePhase]       = useState<RacePhase>("idle")
  const [availableRobots, setAvailableRobots] = useState<Robot[]>([])
  const [selectedIds,     setSelectedIds]     = useState<string[]>([])
  const [totalLaps,       setTotalLaps]       = useState(3)
  const [countdown,       setCountdown]       = useState(0)
  const [raceDisplay,     setRaceDisplay]     = useState<RaceRobot[]>([])

  useEffect(() => { paramsRef.current  = params },    [params])
  useEffect(() => { runningRef.current = running },   [running])
  useEffect(() => { layersRef.current  = layers },    [layers])
  useEffect(() => { raceModeRef.current = racePhase },[racePhase])
  useEffect(() => { totalLapsRef.current = totalLaps },[totalLaps])
  useEffect(() => { countdownRef.current = countdown },[countdown])

  // fetch default params on mount
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

  // Unified animation loop (single RAF, no dependency on React state)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let rafId: number
    let prev = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now
      const phase = raceModeRef.current

      if (phase === "running") {
        let anyActive = false
        for (const robot of raceRef.current) {
          if (robot.finished) continue
          anyActive = true
          const ctrl = ftgControl(robot.state, WALLS, robot.simParams)
          robot.prevState = { ...robot.state }
          robot.state = stepRobot(robot.state, ctrl.ls, ctrl.rs, dt)
          robot.trail.push({ x: robot.state.x, y: robot.state.y })
          if (robot.trail.length > 800) robot.trail.shift()

          if (crossesLine(robot.prevState, robot.state, FINISH_A, FINISH_B)) {
            if (!robot.crossedOnce) {
              robot.crossedOnce = true
              robot.lastCrossAt = Date.now()
            } else {
              robot.lapTimes.push((Date.now() - robot.lastCrossAt) / 1000)
              robot.lap++
              robot.lastCrossAt = Date.now()
              if (robot.lap >= totalLapsRef.current) robot.finished = true
            }
          }
        }
        drawRaceFrame(ctx, raceRef.current, 0)
        setRaceDisplay([...raceRef.current])
        if (!anyActive) {
          raceModeRef.current = "finished"
          setRacePhase("finished")
        }
      } else if (phase === "countdown") {
        drawRaceFrame(ctx, raceRef.current, countdownRef.current)
      } else {
        if (runningRef.current) {
          const res = ftgControl(robotRef.current, WALLS, paramsRef.current)
          robotRef.current = stepRobot(robotRef.current, res.ls, res.rs, dt)
          resultRef.current = res
          trailRef.current.push({ x: robotRef.current.x, y: robotRef.current.y })
          if (trailRef.current.length > 800) trailRef.current.shift()
          setStats({ steer: res.steer, ls: res.ls, rs: res.rs, front: res.frontDist })
        }
        drawFrame(ctx, robotRef.current, resultRef.current, trailRef.current, layersRef.current)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Countdown timer
  useEffect(() => {
    if (racePhase !== "countdown") return
    let count = 3
    setCountdown(3)
    countdownRef.current = 3
    const id = setInterval(() => {
      count--
      setCountdown(count)
      countdownRef.current = count
      if (count <= 0) {
        clearInterval(id)
        raceModeRef.current = "running"
        setRacePhase("running")
      }
    }, 1000)
    return () => clearInterval(id)
  }, [racePhase])

  const reset = useCallback(() => {
    robotRef.current = { ...INIT_ROBOT }
    resultRef.current = null
    trailRef.current = []
    setRunning(false)
  }, [])

  const openRaceSetup = useCallback(async () => {
    setRunning(false)
    runningRef.current = false
    try {
      const res = await fetch("/api/robots")
      const data: Robot[] = await res.json()
      setAvailableRobots(data)
      setSelectedIds(data.slice(0, 2).map(r => r.id))
    } catch {
      setAvailableRobots([])
      setSelectedIds([])
    }
    raceModeRef.current = "setup"
    setRacePhase("setup")
  }, [])

  const startRace = useCallback(async () => {
    if (selectedIds.length === 0) return
    const results = await Promise.all(
      selectedIds.map(id =>
        fetch(`/api/params?robot=${encodeURIComponent(id)}`)
          .then(r => r.json() as Promise<Params>)
          .catch(() => null)
      )
    )
    const n = selectedIds.length
    const robots: RaceRobot[] = selectedIds.map((id, i) => {
      const raw = results[i]
      const sp = raw ? paramsToSim(raw) : { ...DEFAULT_SIM_PARAMS }
      const yOff = (i - (n - 1) / 2) * 0.25
      const startState: RobotState = { x: 3.0, y: 6.8 + yOff, heading: 0 }
      return {
        robotId: id,
        name: availableRobots.find(r => r.id === id)?.name ?? id,
        color: TEAM_COLORS[i % TEAM_COLORS.length],
        simParams: sp,
        state: { ...startState },
        prevState: { ...startState },
        trail: [],
        lap: 0,
        lapTimes: [],
        lastCrossAt: Date.now(),
        crossedOnce: false,
        finished: false,
      }
    })
    raceRef.current = robots
    totalLapsRef.current = totalLaps
    setRaceDisplay([...robots])
    setRacePhase("countdown")
  }, [selectedIds, availableRobots, totalLaps])

  const stopRace = useCallback(() => {
    raceModeRef.current = "idle"
    setRacePhase("idle")
    setRaceDisplay([])
    raceRef.current = []
  }, [])

  const leaderboard = [...raceDisplay].sort((a, b) => {
    if (b.lap !== a.lap) return b.lap - a.lap
    return a.lastCrossAt - b.lastCrossAt
  })

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

  const isRaceActive = racePhase !== "idle"

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
        {!isRaceActive ? (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setRunning(r => !r)}
              className={`min-h-[44px] px-6 rounded-xl font-bold text-sm transition-all active:scale-[0.97] ${
                running
                  ? "bg-yellow-500 hover:bg-yellow-400 text-black"
                  : "bg-green-500 hover:bg-green-400 text-black"
              }`}>
              {running ? "⏸ 停止" : "▶ スタート"}
            </button>
            <button
              onClick={reset}
              className="min-h-[44px] px-5 rounded-xl text-sm bg-[#1a3048] hover:bg-[#243f5e] transition-all active:scale-[0.97]">
              ↺ リセット
            </button>
            <button
              onClick={openRaceSetup}
              className="min-h-[44px] px-5 rounded-xl text-sm bg-purple-800 hover:bg-purple-700 font-semibold transition-all active:scale-[0.97]">
              🏁 レース
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
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={stopRace}
              className="min-h-[44px] px-5 rounded-xl text-sm bg-[#1a3048] hover:bg-[#243f5e] transition-all active:scale-[0.97]">
              ✕ レース終了
            </button>
            {racePhase === "countdown" && countdown > 0 && (
              <span className="text-4xl font-bold text-yellow-400 font-mono">{countdown}</span>
            )}
          </div>
        )}

        {/* Race setup */}
        {racePhase === "setup" && (
          <div className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-bold text-cyan-400 font-mono">レースセットアップ</h2>

            {availableRobots.length === 0 ? (
              <p className="text-sm text-gray-400">
                ロボットが登録されていません。パラメータページからロボットを登録してください。
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs text-gray-500 mb-2 font-mono">参加チームを選択</p>
                  <div className="flex flex-wrap gap-2">
                    {availableRobots.map((robot) => {
                      const idx = selectedIds.indexOf(robot.id)
                      const selected = idx !== -1
                      return (
                        <button
                          key={robot.id}
                          onClick={() => setSelectedIds(prev =>
                            prev.includes(robot.id)
                              ? prev.filter(id => id !== robot.id)
                              : [...prev, robot.id]
                          )}
                          className={`min-h-[44px] px-4 rounded-xl text-sm font-medium transition-all active:scale-[0.97] flex items-center gap-2 ${
                            selected
                              ? "bg-purple-700 text-white"
                              : "bg-[#1a3048] text-gray-400 hover:text-white"
                          }`}
                        >
                          <span
                            className="inline-block w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor: selected
                                ? TEAM_COLORS[idx % TEAM_COLORS.length]
                                : "#4b5563",
                            }}
                          />
                          {robot.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-2 font-mono">ラップ数</p>
                  <div className="flex gap-2">
                    {[1, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setTotalLaps(n)}
                        className={`min-h-[44px] px-5 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                          totalLaps === n
                            ? "bg-cyan-600 text-white"
                            : "bg-[#1a3048] text-gray-400 hover:text-white"
                        }`}
                      >
                        {n} Lap
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={startRace}
                  disabled={selectedIds.length === 0}
                  className="min-h-[44px] px-8 rounded-xl text-sm font-bold bg-green-700 hover:bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                >
                  🏁 スタート
                </button>
              </>
            )}
          </div>
        )}

        {/* Leaderboard */}
        {(racePhase === "running" || racePhase === "finished") && raceDisplay.length > 0 && (
          <div className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest font-mono mb-3">
              {racePhase === "finished" ? "🏁 FINISH" : `RACE — ${totalLaps} Lap`}
            </h2>
            <div className="space-y-2">
              {leaderboard.map((robot, rank) => (
                <div key={robot.robotId} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-500 w-4 shrink-0">{rank + 1}</span>
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: robot.color }}
                  />
                  <span className="text-sm font-medium flex-1 truncate">{robot.name}</span>
                  <span className="text-xs font-mono text-gray-400 shrink-0">
                    L{robot.lap}/{totalLaps}
                  </span>
                  <span className="text-xs font-mono text-cyan-300 w-16 text-right shrink-0">
                    {robot.lapTimes.length > 0
                      ? fmtTime(robot.lapTimes[robot.lapTimes.length - 1])
                      : "—"}
                  </span>
                  {robot.finished && (
                    <span className="text-[10px] text-green-400 font-mono shrink-0">DONE</span>
                  )}
                </div>
              ))}
            </div>

            {racePhase === "finished" && (
              <div className="mt-4 pt-3 border-t border-[#1a3048] space-y-1">
                <p className="text-xs text-gray-500 font-mono mb-2">全ラップタイム</p>
                {leaderboard.map(robot => (
                  <div key={robot.robotId} className="text-xs font-mono text-gray-400">
                    <span style={{ color: robot.color }}>{robot.name}</span>
                    {": "}
                    {robot.lapTimes.length > 0
                      ? robot.lapTimes.map((t, i) => (
                          <span key={i}>{fmtTime(t)}{i < robot.lapTimes.length - 1 ? " / " : ""}</span>
                        ))
                      : "—"}
                  </div>
                ))}
                <button
                  onClick={() => {
                    raceRef.current = []
                    setRaceDisplay([])
                    setRacePhase("setup")
                  }}
                  className="mt-3 min-h-[44px] px-6 rounded-xl text-sm font-bold bg-purple-800 hover:bg-purple-700 text-white transition-all active:scale-[0.97]"
                >
                  もう一度
                </button>
              </div>
            )}
          </div>
        )}

        {/* sliders — hidden in race mode */}
        {!isRaceActive && (
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
        )}

        {/* legend */}
        {!isRaceActive && (
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-400 mr-1" />ロボット（→先頭）</span>
            <span><span className="inline-block w-8 h-1 bg-gradient-to-r from-red-500 to-green-400 mr-1" />LiDARレイ（近=赤/遠=緑）</span>
            <span><span className="inline-block w-3 h-3 rounded-sm bg-red-400 opacity-50 mr-1" />バブル</span>
            <span><span className="inline-block w-3 h-3 rounded-sm bg-green-400 opacity-50 mr-1" />ギャップ</span>
            <span><span className="inline-block w-4 h-1 bg-yellow-400 mr-1" />目標</span>
            <span><span className="inline-block w-4 h-1 bg-blue-300 opacity-40 mr-1" />軌跡</span>
          </div>
        )}
      </div>
    </main>
  )
}
