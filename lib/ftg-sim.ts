// FTG simulator — pure logic, no DOM

export type Vec2 = { x: number; y: number }
export type Wall = [Vec2, Vec2]

export interface RobotState {
  x: number
  y: number
  heading: number  // radians, 0=right, positive=CCW
}

export interface SimParams {
  fovDeg: number
  binDeg: number
  smoothWin: number
  clearTh: number
  minGapDeg: number
  target: "FAR" | "MID"
  bubbleRadius: number
  bubbleMinDeg: number
  bubbleMaxDeg: number
  kp: number
  maxSteer: number
  baseSpeed: number
  speedMax: number
  turnSpeed: number
  speedSteerDrop: number
  speedFrontDrop: number
  frontSlow: number
  frontStop: number
  pivotEnable: boolean
  pivotSteerTh: number
  pivotSoftTh: number
  pivotMinSpeed: number
}

export interface FTGResult {
  ls: number
  rs: number
  steer: number
  ranges: number[]
  angles: number[]
  ranges2: number[]
  gap: [number, number] | null
  tgtDeg: number | null
  dmin: number | null
  amin: number | null
  frontDist: number
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  fovDeg: 90,
  binDeg: 2,
  smoothWin: 9,
  clearTh: 1.4,
  minGapDeg: 4,
  target: "FAR",
  bubbleRadius: 0.27,
  bubbleMinDeg: 4,
  bubbleMaxDeg: 25,
  kp: 0.9,
  maxSteer: 0.85,
  baseSpeed: 0.5,
  speedMax: 0.5,
  turnSpeed: 0.475,
  speedSteerDrop: 0.1,
  speedFrontDrop: 0.4,
  frontSlow: 0.73,
  frontStop: 0.38,
  pivotEnable: true,
  pivotSteerTh: 0.98,
  pivotSoftTh: 0.90,
  pivotMinSpeed: 0.0,
}

const MAX_VALID = 12.0
const WHEEL_BASE = 0.18   // m
const REAL_SPEED = 1.5    // m/s at speed=1.0

function clamp(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? x : x
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

export function buildRanges(robot: RobotState, walls: Wall[], p: SimParams) {
  const half = p.fovDeg / 2
  const nbin = Math.round(p.fovDeg / p.binDeg) + 1
  const ranges = new Array<number>(nbin).fill(MAX_VALID)
  const angles: number[] = []

  for (let i = 0; i < nbin; i++) {
    angles.push(-half + i * p.binDeg)
  }

  for (let i = 0; i < nbin; i++) {
    const signedDeg = angles[i]
    // signed deg: +left in robot frame. robot heading: 0=right, CCW positive.
    // In canvas: y-down, so we negate the angle for world frame
    const worldAngle = robot.heading - (signedDeg * Math.PI) / 180
    const dist = raycast({ x: robot.x, y: robot.y }, worldAngle, walls)
    if (dist < ranges[i]) ranges[i] = dist
  }

  // median smooth
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
    return { ranges: sm, angles }
  }

  return { ranges, angles }
}

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

export function findMaxGap(ranges2: number[], angles: number[], p: SimParams): [number, number] | null {
  const n = ranges2.length
  const clear = ranges2.map(r => r >= p.clearTh ? 1 : 0)
  let best: [number, number] | null = null
  let bestScore = 0

  let i = 0
  while (i < n) {
    if (!clear[i]) { i++; continue }
    let j = i
    while (j < n && clear[j]) j++
    const gapDeg = j > i ? angles[j - 1] - angles[i] : 0
    if (gapDeg >= p.minGapDeg) {
      const maxDist = Math.max(...ranges2.slice(i, j))
      const score = (j - i) * maxDist
      if (score > bestScore) {
        bestScore = score
        best = [i, j - 1]
      }
    }
    i = j
  }
  return best
}

export function pickTarget(ranges2: number[], angles: number[], gap: [number, number], p: SimParams) {
  const [i0, i1] = gap
  if (p.target === "MID") {
    const im = Math.floor((i0 + i1) / 2)
    return { deg: angles[im], dist: ranges2[im] }
  }
  // FAR — inner 80%
  const margin = Math.max(1, Math.floor((i1 - i0) / 10))
  const lo = Math.min(i0 + margin, i1)
  const hi = Math.max(i1 - margin, i0)
  const mid = (i0 + i1) / 2
  let bestD = -1
  let bestI = Math.floor((i0 + i1) / 2)
  for (let i = lo; i <= hi; i++) {
    const d = ranges2[i]
    if (d > bestD + 1e-9) { bestD = d; bestI = i }
    else if (Math.abs(d - bestD) <= 1e-9 && Math.abs(i - mid) < Math.abs(bestI - mid)) {
      bestI = i
    }
  }
  return { deg: angles[bestI], dist: ranges2[bestI] }
}

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

function applySpeedLimits(v: number, p: SimParams) {
  if (v <= 0) return 0
  return clamp(v, 0, p.speedMax)
}

export function ftgControl(robot: RobotState, walls: Wall[], p: SimParams): FTGResult {
  const { ranges, angles } = buildRanges(robot, walls, p)
  const { ranges2, dmin, amin } = applyBubble(ranges, angles, p)
  const gap = findMaxGap(ranges2, angles, p)

  // front distance (center bins)
  const centerI = Math.floor(ranges.length / 2)
  const hw = Math.max(1, Math.floor(2 / p.binDeg))
  let frontDist = MAX_VALID
  for (let i = Math.max(0, centerI - hw); i <= Math.min(ranges.length - 1, centerI + hw); i++) {
    if (ranges[i] < frontDist) frontDist = ranges[i]
  }

  if (!gap) {
    // fallback: steer to farthest point
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
    return {
      ls: applySpeedLimits(left, p), rs: applySpeedLimits(right, p),
      steer, ranges, angles, ranges2, gap: null,
      tgtDeg, dmin, amin, frontDist,
    }
  }

  const { deg: tgtDeg, dist: tgtDist } = pickTarget(ranges2, angles, gap, p)
  const steer = clamp(p.kp * (tgtDeg * Math.PI) / 180, -p.maxSteer, p.maxSteer)

  const frontEff = Math.min(frontDist, tgtDist)
  let frontDrop = 0
  if (frontEff < p.frontSlow) {
    frontDrop = clamp((p.frontSlow - frontEff) / Math.max(p.frontSlow - p.frontStop, 1e-3), 0, 1)
  }

  let v = p.baseSpeed
  v *= (1 - p.speedSteerDrop * Math.min(1, Math.abs(steer)))
  v *= (1 - p.speedFrontDrop * frontDrop)
  if (frontEff < p.frontStop) v = Math.min(v, p.turnSpeed)
  v = clamp(v, 0, p.speedMax)

  let [left, right] = mixWithPivot(v, steer, p)
  const m = Math.max(left, right)
  if (m > p.speedMax) { left *= p.speedMax / m; right *= p.speedMax / m }

  return {
    ls: applySpeedLimits(left, p), rs: applySpeedLimits(right, p),
    steer, ranges, angles, ranges2, gap,
    tgtDeg, dmin, amin, frontDist,
  }
}

export function stepRobot(robot: RobotState, ls: number, rs: number, dt: number): RobotState {
  const v = ((ls + rs) / 2) * REAL_SPEED
  const omega = ((rs - ls) / WHEEL_BASE) * REAL_SPEED
  return {
    x: robot.x + v * Math.cos(robot.heading) * dt,
    y: robot.y + v * Math.sin(robot.heading) * dt,
    heading: robot.heading + omega * dt,
  }
}
