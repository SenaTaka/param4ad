"use client"

import { useRef, useState, useEffect, useCallback, useMemo } from "react"
import {
  ftgControl, stepRobot, crossesLine, collideWithWalls, paramsToSim,
  DEFAULT_SIM_PARAMS,
  type RobotState, type FTGResult, type SimParams,
} from "@/lib/ftg-sim"
import type { Robot } from "@/app/api/robots/route"
import { DEFAULT_PARAMS, type Params } from "@/lib/defaults"
import { COURSES, getCourse, type Course } from "./courses"
import { drawFrame, drawRaceFrame, type Layers, type TrailPoint } from "./draw"
import ParamPanel, { type SimOnly } from "./ParamPanel"

// 論理キャンバス幅は固定し、コースの実寸からスケールを導出する
// （12m 幅の周回コースで従来の 65px/m と一致）
const CANVAS_W = 780

const TEAM_COLORS = ["#60a5fa", "#f87171", "#4ade80", "#facc15"]

// 12Hz: matches real LiDAR scan rate constraint in param1.py
const CTRL_HZ = 12
const CTRL_DT_MS = 1000 / CTRL_HZ

// ── Race types ────────────────────────────────────────────────────────────────
type RacePhase = "idle" | "setup" | "countdown" | "running" | "finished"

type RaceRobot = {
  robotId: string
  name: string
  color: string
  simParams: SimParams
  state: RobotState
  prevState: RobotState
  trail: TrailPoint[]
  lap: number
  lapTimes: number[]
  bestLap: number
  totalTime: number
  lastCrossAt: number
  crossedOnce: boolean
  finished: boolean
  // 12Hz control state
  lastCtrl: number
  lastCmd: { ls: number; rs: number }
  frontDist: number | null  // EMA state (null until first valid scan)
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toFixed(1).padStart(4, "0")}`
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SimPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Course
  const [courseId, setCourseId] = useState("circuit")
  const course = getCourse(courseId)
  const scale = CANVAS_W / course.worldW
  const canvasH = Math.round(course.worldH * scale)
  const courseRef = useRef<Course>(course)

  // Normal sim refs
  const robotRef    = useRef<RobotState>({ ...course.start })
  const paramsRef   = useRef<SimParams>({ ...DEFAULT_SIM_PARAMS })
  const resultRef   = useRef<FTGResult | null>(null)
  const trailRef    = useRef<TrailPoint[]>([])
  const runningRef  = useRef(false)
  const layersRef   = useRef<Layers>({ rays: true, bubble: true, gap: true })

  // 12Hz control state
  const lastCtrlRef  = useRef<number>(0)
  const lastCmdRef   = useRef<{ ls: number; rs: number }>({ ls: 0, rs: 0 })
  const frontDistRef = useRef<number | null>(null)  // EMA state for d_front

  const [running,   setRunning]   = useState(false)
  const [layers,    setLayers]    = useState<Layers>({ rays: true, bubble: true, gap: true })
  const [rawParams, setRawParams] = useState<Params>({ ...DEFAULT_PARAMS })
  const [simOnly,   setSimOnly]   = useState<SimOnly>({ slipEnable: false, slipK: 0.3 })
  const [stats,     setStats]     = useState<{ steer: number; ls: number; rs: number; front: number | null }>(
    { steer: 0, ls: 0, rs: 0, front: null }
  )

  // 実機キー（Params）が真実のソース。SimParams は導出値
  const simParams = useMemo(() => paramsToSim(rawParams, simOnly), [rawParams, simOnly])

  // Race refs
  const raceModeRef    = useRef<RacePhase>("idle")
  const raceRef        = useRef<RaceRobot[]>([])
  const totalLapsRef   = useRef(3)
  const countdownRef   = useRef(0)
  const raceStartAtRef = useRef(0)  // sprint: race clock start (countdown end)

  const [racePhase,       setRacePhase]       = useState<RacePhase>("idle")
  const [availableRobots, setAvailableRobots] = useState<Robot[]>([])
  const [selectedIds,     setSelectedIds]     = useState<string[]>([])
  const [totalLaps,       setTotalLaps]       = useState(3)
  const [countdown,       setCountdown]       = useState(0)
  const [raceDisplay,     setRaceDisplay]     = useState<RaceRobot[]>([])

  useEffect(() => { paramsRef.current  = simParams },  [simParams])
  useEffect(() => { runningRef.current = running },    [running])
  useEffect(() => { layersRef.current  = layers },     [layers])
  useEffect(() => { raceModeRef.current = racePhase }, [racePhase])
  useEffect(() => { totalLapsRef.current = totalLaps },[totalLaps])
  useEffect(() => { countdownRef.current = countdown },[countdown])

  // Load all server params on mount
  useEffect(() => {
    fetch("/api/params").then(r => r.json()).then((d: Params) => {
      setRawParams({ ...DEFAULT_PARAMS, ...d })
    }).catch(() => {})
  }, [])

  // Unified animation loop
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
      const crs = courseRef.current
      const scl = CANVAS_W / crs.worldW

      if (phase === "running") {
        let anyActive = false
        for (const robot of raceRef.current) {
          if (robot.finished) continue
          anyActive = true

          // 12Hz control: only call ftgControl when a new "scan" would arrive
          if ((now - robot.lastCtrl) >= CTRL_DT_MS) {
            const ctrl = ftgControl(robot.state, crs.walls, robot.simParams, robot.frontDist)
            robot.lastCmd = { ls: ctrl.ls, rs: ctrl.rs }
            robot.frontDist = ctrl.frontDist
            robot.lastCtrl = now
          }

          robot.prevState = { ...robot.state }
          robot.state = collideWithWalls(
            robot.prevState,
            stepRobot(
              robot.state,
              robot.lastCmd.ls, robot.lastCmd.rs,
              dt,
              robot.simParams.slipEnable, robot.simParams.slipK
            ),
            crs.walls
          )
          robot.trail.push({ x: robot.state.x, y: robot.state.y })
          if (robot.trail.length > 800) robot.trail.shift()

          if (crossesLine(robot.prevState, robot.state, crs.finishA, crs.finishB)) {
            if (crs.raceMode === "sprint") {
              // point-to-point: 初回横断でゴール
              const total = (Date.now() - raceStartAtRef.current) / 1000
              robot.totalTime = total
              robot.lapTimes = [total]
              robot.bestLap = total
              robot.lap = 1
              robot.finished = true
            } else if (!robot.crossedOnce) {
              robot.crossedOnce = true
              robot.lastCrossAt = Date.now()
            } else {
              const lapTime = (Date.now() - robot.lastCrossAt) / 1000
              robot.lapTimes.push(lapTime)
              robot.totalTime += lapTime
              if (lapTime < robot.bestLap) robot.bestLap = lapTime
              robot.lap++
              robot.lastCrossAt = Date.now()
              if (robot.lap >= totalLapsRef.current) robot.finished = true
            }
          }
        }
        drawRaceFrame(ctx, crs, scl, raceRef.current, 0)
        setRaceDisplay([...raceRef.current])
        if (!anyActive) {
          raceModeRef.current = "finished"
          setRacePhase("finished")
        }
      } else if (phase === "countdown") {
        drawRaceFrame(ctx, crs, scl, raceRef.current, countdownRef.current)
      } else {
        if (runningRef.current) {
          // 12Hz control: only update FTG when a new LiDAR scan would arrive
          if ((now - lastCtrlRef.current) >= CTRL_DT_MS) {
            const res = ftgControl(robotRef.current, crs.walls, paramsRef.current, frontDistRef.current)
            lastCmdRef.current = { ls: res.ls, rs: res.rs }
            frontDistRef.current = res.frontDist
            lastCtrlRef.current = now
            resultRef.current = res
            // L/R は SPEED_CMD_SCALE 適用前（実機ステータスと同じ定義）を表示
            setStats({ steer: res.steer, ls: res.cmdLeft, rs: res.cmdRight, front: res.frontDist })
          }

          // Physics runs every frame (high-rate integration)
          const { ls, rs } = lastCmdRef.current
          robotRef.current = collideWithWalls(
            robotRef.current,
            stepRobot(
              robotRef.current, ls, rs, dt,
              paramsRef.current.slipEnable, paramsRef.current.slipK
            ),
            crs.walls
          )
          trailRef.current.push({ x: robotRef.current.x, y: robotRef.current.y })
          if (trailRef.current.length > 800) trailRef.current.shift()
        }
        drawFrame(ctx, crs, scl, robotRef.current, resultRef.current, trailRef.current, layersRef.current)
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
        raceStartAtRef.current = Date.now()
        raceModeRef.current = "running"
        setRacePhase("running")
      }
    }, 1000)
    return () => clearInterval(id)
  }, [racePhase])

  const resetRun = useCallback((c: Course) => {
    robotRef.current = { ...c.start }
    resultRef.current = null
    trailRef.current = []
    frontDistRef.current = null
    lastCtrlRef.current = 0
    lastCmdRef.current = { ls: 0, rs: 0 }
    setRunning(false)
    setStats({ steer: 0, ls: 0, rs: 0, front: null })
  }, [])

  const reset = useCallback(() => {
    resetRun(courseRef.current)
  }, [resetRun])

  const changeCourse = useCallback((id: string) => {
    const c = getCourse(id)
    setCourseId(id)
    courseRef.current = c
    resetRun(c)
  }, [resetRun])

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
    const c = courseRef.current
    const n = selectedIds.length
    const robots: RaceRobot[] = selectedIds.map((id, i) => {
      const raw = results[i]
      const sp = raw ? paramsToSim({ ...DEFAULT_PARAMS, ...raw }) : { ...DEFAULT_SIM_PARAMS }
      // スタート地点から heading の左方向に横並びオフセット
      const off = (i - (n - 1) / 2) * 0.25
      const h = c.start.heading
      const startState: RobotState = {
        x: c.start.x + off * Math.sin(h),
        y: c.start.y - off * Math.cos(h),
        heading: h,
      }
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
        bestLap: Infinity,
        totalTime: 0,
        lastCrossAt: Date.now(),
        crossedOnce: false,
        finished: false,
        lastCtrl: 0,
        lastCmd: { ls: 0, rs: 0 },
        frontDist: null,
      }
    })
    raceRef.current = robots
    totalLapsRef.current = course.raceMode === "sprint" ? 1 : totalLaps
    setRaceDisplay([...robots])
    setRacePhase("countdown")
  }, [selectedIds, availableRobots, totalLaps, course.raceMode])

  const stopRace = useCallback(() => {
    raceModeRef.current = "idle"
    setRacePhase("idle")
    setRaceDisplay([])
    raceRef.current = []
  }, [])

  const isSprint = course.raceMode === "sprint"

  const leaderboard = [...raceDisplay].sort((a, b) => {
    if (isSprint) {
      if (a.finished !== b.finished) return a.finished ? -1 : 1
      if (a.finished && b.finished) return a.totalTime - b.totalTime
      return 0
    }
    if (b.lap !== a.lap) return b.lap - a.lap
    return a.lastCrossAt - b.lastCrossAt
  })

  const isRaceActive = racePhase !== "idle"

  return (
    <main className="min-h-screen bg-[#04090f] text-white p-4">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* header */}
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-cyan-400 tracking-tight">
              <span className="font-mono mr-1 opacity-60">&gt;</span>FTG シミュレータ
            </h1>
            <p className="text-xs text-gray-500 font-mono">12Hz制御 / param1.py 再現</p>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-xs text-gray-500">コース</span>
            <select
              value={courseId}
              onChange={e => changeCourse(e.target.value)}
              disabled={isRaceActive}
              className="bg-[#0b1828] text-white border border-[#1a3048] rounded-lg px-3 py-2 text-sm min-h-[40px] focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:opacity-50"
            >
              {COURSES.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* canvas */}
        <div className="rounded-xl overflow-hidden border border-[#1a3048]">
          <canvas ref={canvasRef} width={CANVAS_W} height={canvasH} className="w-full h-auto block" />
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

            <div className="ml-auto font-mono text-xs text-gray-400 flex gap-3 flex-wrap">
              <span className="text-gray-600">12Hz</span>
              <span>steer <span className="text-white">{stats.steer.toFixed(2)}</span></span>
              <span>L <span className="text-white">{stats.ls.toFixed(2)}</span></span>
              <span>R <span className="text-white">{stats.rs.toFixed(2)}</span></span>
              <span>前方 <span className="text-white">{stats.front === null ? "—" : `${stats.front.toFixed(2)}m`}</span></span>
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

                {!isSprint && (
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
                )}
                {isSprint && (
                  <p className="text-xs text-gray-500 font-mono">
                    スプリント（point-to-point）: スタートからゴールまでのタイムを競う
                  </p>
                )}

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
              {racePhase === "finished"
                ? "🏁 FINISH"
                : isSprint ? "RACE — スプリント" : `RACE — ${totalLaps} Lap`}
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
                    {isSprint
                      ? (robot.finished ? "GOAL" : "走行中")
                      : `L${robot.lap}/${totalLaps}`}
                  </span>
                  <span className="text-xs font-mono text-cyan-300 w-16 text-right shrink-0">
                    {isSprint
                      ? (robot.finished ? fmtTime(robot.totalTime) : "—")
                      : robot.lapTimes.length > 0
                        ? fmtTime(robot.lapTimes[robot.lapTimes.length - 1])
                        : "—"}
                  </span>
                  {!isSprint && (
                    <span className="text-xs font-mono text-yellow-400 w-16 text-right shrink-0">
                      {robot.bestLap < Infinity ? `B:${fmtTime(robot.bestLap)}` : ""}
                    </span>
                  )}
                  {robot.finished && (
                    <span className="text-[10px] text-green-400 font-mono shrink-0">DONE</span>
                  )}
                </div>
              ))}
            </div>

            {racePhase === "finished" && (
              <div className="mt-4 pt-3 border-t border-[#1a3048] space-y-2">
                <p className="text-xs text-gray-500 font-mono mb-2">
                  {isSprint ? "ゴールタイム" : "全ラップタイム"}
                </p>
                {leaderboard.map(robot => (
                  <div key={robot.robotId} className="text-xs font-mono">
                    <span style={{ color: robot.color }} className="font-semibold">{robot.name}</span>
                    <span className="text-gray-500 ml-2">
                      {robot.lapTimes.length > 0
                        ? robot.lapTimes.map((t, i) => (
                            <span key={i}>{fmtTime(t)}{i < robot.lapTimes.length - 1 ? " / " : ""}</span>
                          ))
                        : "—"}
                    </span>
                    {!isSprint && robot.bestLap < Infinity && (
                      <span className="text-yellow-400 ml-3">Best: {fmtTime(robot.bestLap)}</span>
                    )}
                    {!isSprint && robot.totalTime > 0 && (
                      <span className="text-gray-400 ml-3">Total: {fmtTime(robot.totalTime)}</span>
                    )}
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

        {/* params — hidden in race mode */}
        {!isRaceActive && (
          <ParamPanel
            params={rawParams}
            onChange={(key, value) => setRawParams(prev => ({ ...prev, [key]: value }))}
            simOnly={simOnly}
            onSimOnlyChange={setSimOnly}
            layers={layers}
            onLayersChange={setLayers}
            onReset={() => setRawParams({ ...DEFAULT_PARAMS })}
          />
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
