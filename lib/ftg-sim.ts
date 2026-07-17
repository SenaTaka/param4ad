// FTG simulator — pure logic, no DOM
// Faithfully reproduces param1.py logic

import { DEFAULT_PARAMS, type Params } from "@/lib/defaults"

export type Vec2 = { x: number; y: number }
export type Wall = [Vec2, Vec2]

export interface RobotState {
  x: number
  y: number
  heading: number  // radians, 0=right, positive=CCW
}

export interface SimParams {
  // FTG core
  fgmEnable: boolean
  fovDeg: number
  binDeg: number
  smoothWin: number
  clearTh: number
  minGapDeg: number
  target: "FAR" | "MID"
  // Bubble
  bubbleRadius: number
  bubbleMinDeg: number
  bubbleMaxDeg: number
  // Steering
  kp: number
  maxSteer: number
  // Speed
  baseSpeed: number
  speedMin: number
  speedMax: number
  turnSpeed: number
  speedSteerDrop: number
  speedFrontDrop: number
  frontSlow: number
  frontStop: number
  // Pivot
  pivotEnable: boolean
  pivotSteerTh: number
  pivotSoftTh: number
  pivotMinSpeed: number
  // Hardware (reproduced from param1.py)
  lidarDx: number        // LIDAR_DX: axle→LiDAR offset, forward+ (m)
  lidarDy: number        // LIDAR_DY: axle→LiDAR offset, left+ (m)
  emaAlpha: number       // EMA_ALPHA: smooths d_front across scans
  frontWindowDeg: number // FRONT_WINDOW_DEG: angular window for front dist
  speedCmdScale: number  // SPEED_CMD_SCALE: applied at motor driver level
  // Sim-only
  slipEnable: boolean    // tire slip (not in param1.py, adds realism)
  slipK: number
}

export interface FTGResult {
  ls: number             // motor input after SPEED_CMD_SCALE (feeds stepRobot)
  rs: number
  cmdLeft: number        // command before SPEED_CMD_SCALE = what raspi status reports
  cmdRight: number
  steer: number
  ranges: number[]
  angles: number[]
  ranges2: number[]
  gap: [number, number] | null
  tgtDeg: number | null
  dmin: number | null
  amin: number | null
  frontDist: number | null  // EMA'd value — pass back as prevFrontDist next call (null until first valid scan)
}

const MAX_VALID = 12.0
const WHEEL_BASE = 0.18   // m
const REAL_SPEED = 1.5    // m/s at speed=1.0

// odd(): matches param1.py — FGM_SMOOTH_WIN is forced odd
function odd(n: number): number {
  const i = Math.round(n)
  if (i <= 0) return 0
  return i % 2 === 0 ? i + 1 : i
}

// Params (real robot keys, lib/defaults.ts) → SimParams.
// Single source of truth: defaults.ts. FORWARD_DEG / MOTOR_FREQ have no effect in sim.
export function paramsToSim(
  p: Params,
  simOnly: { slipEnable: boolean; slipK: number } = { slipEnable: false, slipK: 0.3 }
): SimParams {
  return {
    fgmEnable:      p.FGM_ENABLE,
    fovDeg:         p.FGM_FOV_DEG,
    binDeg:         p.FGM_BIN_DEG,
    smoothWin:      odd(p.FGM_SMOOTH_WIN),
    clearTh:        p.FGM_CLEAR_TH,
    minGapDeg:      p.FGM_MIN_GAP_DEG,
    target:         p.FGM_TARGET as "FAR" | "MID",
    bubbleRadius:   p.FGM_BUBBLE_RADIUS,
    bubbleMinDeg:   p.FGM_BUBBLE_MIN_DEG,
    bubbleMaxDeg:   p.FGM_BUBBLE_MAX_DEG,
    kp:             p.KP_GAP_ANGLE,
    maxSteer:       p.MAX_STEER,
    baseSpeed:      p.BASE_SPEED,
    speedMin:       p.SPEED_MIN,
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
    lidarDx:        p.LIDAR_DX,
    lidarDy:        p.LIDAR_DY,
    emaAlpha:       p.EMA_ALPHA,
    frontWindowDeg: p.FRONT_WINDOW_DEG,
    speedCmdScale:  p.SPEED_CMD_SCALE,
    slipEnable:     simOnly.slipEnable,
    slipK:          simOnly.slipK,
  }
}

export const DEFAULT_SIM_PARAMS: SimParams = paramsToSim(DEFAULT_PARAMS)

function clamp(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x
}

function cross2(a: Vec2, b: Vec2) {
  return a.x * b.y - a.y * b.x
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function raycast(origin: Vec2, angleRad: number, walls: Wall[], maxRange = MAX_VALID): number {
  const D: Vec2 = { x: Math.cos(angleRad), y: Math.sin(angleRad) }
  let best = maxRange

  for (const [P1, P2] of walls) {
    const r = sub(P1, origin)
    const seg = sub(P2, P1)
    const denom = cross2(D, seg)
    if (Math.abs(denom) < 1e-10) continue
    const t = cross2(r, seg) / denom
    const s = cross2(r, D) / denom
    if (t > 1e-6 && s >= 0 && s <= 1 && t < best) {
      best = t
    }
  }
  return best
}

// Matches _fgm_build_ranges() + _pick_window_min() in param1.py.
// Rays are cast from the LiDAR origin (axle + LIDAR_DX forward, LIDAR_DY left),
// then every hit is converted to axle-frame polar via lidar_point_to_axle_polar().
// frontRaw is the pre-smoothing min distance within ±frontWindowDeg (axle frame).
export function buildRanges(robot: RobotState, walls: Wall[], p: SimParams) {
  const h = robot.heading
  // world is y-down: forward = (cos h, sin h), left = (sin h, -cos h)
  const lx = robot.x + p.lidarDx * Math.cos(h) + p.lidarDy * Math.sin(h)
  const ly = robot.y + p.lidarDx * Math.sin(h) - p.lidarDy * Math.cos(h)

  const half = p.fovDeg / 2
  const nbin = Math.round(p.fovDeg / p.binDeg) + 1
  const ranges = new Array<number>(nbin).fill(MAX_VALID)
  const angles: number[] = []
  for (let i = 0; i < nbin; i++) angles.push(-half + i * p.binDeg)

  let frontRaw: number | null = null

  // Sweep the full LiDAR revolution finer than the bin width so that the
  // lidar→axle angle shift cannot leave holes in the bins.
  const step = Math.min(p.binDeg, 1) / 2
  for (let a = -180; a < 180; a += step) {
    const th = (a * Math.PI) / 180                 // lidar-frame signed angle, +left
    const d = raycast({ x: lx, y: ly }, h - th, walls)
    if (d >= MAX_VALID) continue                   // matches: dist < max_valid
    // lidar frame → axle frame (param1.py lidar_point_to_axle_polar)
    const xa = d * Math.cos(th) + p.lidarDx
    const ya = d * Math.sin(th) + p.lidarDy
    const da = Math.hypot(xa, ya)
    const sa = (Math.atan2(ya, xa) * 180) / Math.PI  // axle-frame signed deg, +left

    if (Math.abs(sa) <= p.frontWindowDeg && (frontRaw === null || da < frontRaw)) {
      frontRaw = da
    }
    if (sa < -half - p.binDeg / 2 || sa > half + p.binDeg / 2) continue
    const idx = Math.round((sa + half) / p.binDeg)
    if (idx >= 0 && idx < nbin && da < ranges[idx]) ranges[idx] = da
  }

  // median smooth (matches FGM_SMOOTH_WIN logic in param1.py)
  const w = p.smoothWin
  if (w >= 3 && w % 2 === 1) {
    const k = Math.floor(w / 2)
    const sm = [...ranges]
    for (let i = 0; i < nbin; i++) {
      const lo = Math.max(0, i - k)
      const hi = Math.min(nbin, i + k + 1)
      const seg = ranges.slice(lo, hi).sort((a, b) => a - b)
      sm[i] = seg[Math.floor(seg.length / 2)]
    }
    return { ranges: sm, angles, frontRaw }
  }

  return { ranges, angles, frontRaw }
}

// Matches _fgm_apply_bubble() in param1.py (single closest point)
export function applyBubble(ranges: number[], angles: number[], p: SimParams) {
  let dmin: number | null = null
  let amin: number | null = null

  for (let i = 0; i < ranges.length; i++) {
    const d = ranges[i]
    if (d <= 0) continue
    if (dmin === null || d < dmin) { dmin = d; amin = angles[i] }
  }

  if (dmin === null) return { ranges2: [...ranges], dmin: null, amin: null }

  const bubbleDeg = clamp(
    (Math.atan2(p.bubbleRadius, Math.max(dmin, 1e-3)) * 180) / Math.PI,
    p.bubbleMinDeg,
    p.bubbleMaxDeg
  )

  const out = [...ranges]
  const a0 = amin!
  for (let i = 0; i < angles.length; i++) {
    if (angles[i] >= a0 - bubbleDeg && angles[i] <= a0 + bubbleDeg) {
      out[i] = 0
    }
  }

  return { ranges2: out, dmin, amin }
}

// Matches _fgm_find_max_gap() in param1.py: best = widest gap (bin count)
export function findMaxGap(ranges2: number[], angles: number[], p: SimParams): [number, number] | null {
  const n = ranges2.length
  const clear = ranges2.map(r => r >= p.clearTh ? 1 : 0)
  let best: [number, number] | null = null
  let bestLen = 0

  let i = 0
  while (i < n) {
    if (!clear[i]) { i++; continue }
    let j = i
    while (j < n && clear[j]) j++
    const gapDeg = j > i ? angles[j - 1] - angles[i] : 0
    if (gapDeg >= p.minGapDeg && (j - i) > bestLen) {
      bestLen = j - i
      best = [i, j - 1]
    }
    i = j
  }
  return best
}

// Matches _fgm_pick_target() in param1.py: full range, closest-to-center tiebreak
export function pickTarget(ranges2: number[], angles: number[], gap: [number, number], p: SimParams) {
  const [i0, i1] = gap
  if (p.target === "MID") {
    const im = Math.floor((i0 + i1) / 2)
    return { deg: angles[im], dist: ranges2[im] }
  }
  const mid = (i0 + i1) / 2
  let bestD = -1
  let bestI = Math.floor((i0 + i1) / 2)
  for (let i = i0; i <= i1; i++) {
    const d = ranges2[i]
    if (d > bestD + 1e-9) { bestD = d; bestI = i }
    else if (Math.abs(d - bestD) <= 1e-9 && Math.abs(i - mid) < Math.abs(bestI - mid)) {
      bestI = i
    }
  }
  return { deg: angles[bestI], dist: ranges2[bestI] }
}

// Matches mix_with_pivot() in param1.py
function mixWithPivot(v: number, steer: number, p: SimParams): [number, number] {
  let left = v * (1 - steer)
  let right = v * (1 + steer)

  if (!p.pivotEnable) return [left, right]

  const s = Math.abs(steer)
  let w = 0
  if (s > p.pivotSoftTh) {
    w = s >= p.pivotSteerTh ? 1 : (s - p.pivotSoftTh) / Math.max(p.pivotSteerTh - p.pivotSoftTh, 1e-6)
  }

  const vp = Math.max(v, p.pivotMinSpeed)
  const lp = steer > 0 ? 0 : vp
  const rp = steer > 0 ? vp : 0

  left = (1 - w) * left + w * lp
  right = (1 - w) * right + w * rp
  return [left, right]
}

// Matches apply_speed_limits() in param1.py: clamp(v, SPEED_MIN, SPEED_MAX)
function applySpeedLimits(v: number, p: SimParams) {
  if (v <= 0) return 0
  return clamp(v, p.speedMin, p.speedMax)
}

// Matches MotorDriver.set_drive() scale + clip in param1.py
function applyMotorScale(v: number, p: SimParams): number {
  return Math.min(v * p.speedCmdScale, 1.0)
}

// Matches ema() in param1.py: first call returns the new value unchanged,
// missing new value keeps the previous one.
function emaFront(prev: number | null, next: number | null, alpha: number): number | null {
  if (next === null) return prev
  if (prev === null) return next
  return alpha * next + (1 - alpha) * prev
}

// Matches _fgm_control() in param1.py
// prevFrontDist: EMA state from previous call (pass frontDist from last FTGResult; null on reset)
export function ftgControl(
  robot: RobotState,
  walls: Wall[],
  p: SimParams,
  prevFrontDist: number | null = null
): FTGResult {
  const { ranges, angles, frontRaw } = buildRanges(robot, walls, p)
  const { ranges2, dmin, amin } = applyBubble(ranges, angles, p)
  const frontDist = emaFront(prevFrontDist, frontRaw, p.emaAlpha)

  // FGM_ENABLE off: drive straight at BASE_SPEED (matches loop() branch in param1.py)
  if (!p.fgmEnable) {
    const cmd = applySpeedLimits(p.baseSpeed, p)
    const m = applyMotorScale(cmd, p)
    return {
      ls: m, rs: m, cmdLeft: cmd, cmdRight: cmd, steer: 0,
      ranges, angles, ranges2, gap: null, tgtDeg: null, dmin, amin, frontDist,
    }
  }

  const gap = findMaxGap(ranges2, angles, p)

  if (!gap) {
    // NOGAP fallback: steer toward farthest point at TURN_SPEED
    let bestI = 0
    for (let i = 1; i < ranges2.length; i++) {
      if (ranges2[i] > ranges2[bestI]) bestI = i
    }
    const tgtDeg = angles[bestI]
    const steer = clamp(p.kp * (tgtDeg * Math.PI) / 180, -p.maxSteer, p.maxSteer)
    const v = p.turnSpeed
    let [left, right] = mixWithPivot(v, steer, p)
    const m = Math.max(left, right)
    if (m > p.speedMax) { left *= p.speedMax / m; right *= p.speedMax / m }
    const cmdLeft = applySpeedLimits(left, p)
    const cmdRight = applySpeedLimits(right, p)
    const ls = applyMotorScale(cmdLeft, p)
    const rs = applyMotorScale(cmdRight, p)
    return { ls, rs, cmdLeft, cmdRight, steer, ranges, angles, ranges2, gap: null, tgtDeg, dmin, amin, frontDist }
  }

  const { deg: tgtDeg, dist: tgtDist } = pickTarget(ranges2, angles, gap, p)
  const steer = clamp(p.kp * (tgtDeg * Math.PI) / 180, -p.maxSteer, p.maxSteer)

  const frontEff = Math.min(frontDist ?? MAX_VALID, tgtDist)
  let frontDrop = 0
  if (frontEff < p.frontSlow) {
    frontDrop = clamp((p.frontSlow - frontEff) / Math.max(p.frontSlow - p.frontStop, 1e-3), 0, 1)
  }

  // Speed: linear steer drop (matches Python — NOT steer^1.5)
  let v = p.baseSpeed
  v *= (1 - p.speedSteerDrop * Math.min(1, Math.abs(steer)))
  v *= (1 - p.speedFrontDrop * frontDrop)
  if (frontEff < p.frontStop) v = Math.min(v, p.turnSpeed)
  v = clamp(v, 0, p.speedMax)

  let [left, right] = mixWithPivot(v, steer, p)
  const m = Math.max(left, right)
  if (m > p.speedMax) { left *= p.speedMax / m; right *= p.speedMax / m }

  const cmdLeft = applySpeedLimits(left, p)
  const cmdRight = applySpeedLimits(right, p)
  const ls = applyMotorScale(cmdLeft, p)
  const rs = applyMotorScale(cmdRight, p)

  return { ls, rs, cmdLeft, cmdRight, steer, ranges, angles, ranges2, gap, tgtDeg, dmin, amin, frontDist }
}

// stepRobot: pure kinematics + optional tire slip
// Slip model: understeer — high omega*v reduces effective turning
export function stepRobot(
  robot: RobotState,
  ls: number, rs: number,
  dt: number,
  slipEnable = false,
  slipK = 0.0
): RobotState {
  const v = ((ls + rs) / 2) * REAL_SPEED
  const omega = ((rs - ls) / WHEEL_BASE) * REAL_SPEED

  if (!slipEnable || slipK <= 0) {
    return {
      x: robot.x + v * Math.cos(robot.heading) * dt,
      y: robot.y + v * Math.sin(robot.heading) * dt,
      heading: robot.heading - omega * dt,
    }
  }

  // Slip: lateral grip limit → robot turns less than commanded (understeer)
  const slip = Math.min(0.9, Math.abs(omega) * Math.abs(v) * slipK)
  const effectiveOmega = omega * (1 - slip)
  return {
    x: robot.x + v * Math.cos(robot.heading) * dt,
    y: robot.y + v * Math.sin(robot.heading) * dt,
    heading: robot.heading - effectiveOmega * dt,
  }
}

// Wall collision (sim-only): a robot cannot pass through a wall.
// If the movement segment crosses any wall the position is held in place while
// the heading update is kept — like a real crash, the robot can pivot free.
export function collideWithWalls(prev: RobotState, next: RobotState, walls: Wall[]): RobotState {
  for (const [a, b] of walls) {
    if (crossesLine(prev, next, a, b)) {
      return { x: prev.x, y: prev.y, heading: next.heading }
    }
  }
  return next
}

export function crossesLine(prev: Vec2, curr: Vec2, lineA: Vec2, lineB: Vec2): boolean {
  const D = sub(curr, prev)
  const seg = sub(lineB, lineA)
  const r = sub(lineA, prev)
  const denom = cross2(D, seg)
  if (Math.abs(denom) < 1e-10) return false
  const t = cross2(r, seg) / denom
  const s = cross2(r, D) / denom
  return t >= 0 && t <= 1 && s >= 0 && s <= 1
}
