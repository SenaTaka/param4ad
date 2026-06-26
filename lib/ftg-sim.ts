// FTG simulator — pure logic, no DOM
// Faithfully reproduces param1.py logic

export type Vec2 = { x: number; y: number }
export type Wall = [Vec2, Vec2]

export interface RobotState {
  x: number
  y: number
  heading: number  // radians, 0=right, positive=CCW
}

export interface SimParams {
  // FTG core
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
  emaAlpha: number       // EMA_ALPHA: smooths d_front across scans
  frontWindowDeg: number // FRONT_WINDOW_DEG: angular window for front dist
  speedCmdScale: number  // SPEED_CMD_SCALE: applied at motor driver level
  // Sim-only
  slipEnable: boolean    // tire slip (not in param1.py, adds realism)
  slipK: number
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
  frontDist: number  // EMA'd value — pass back as prevFrontDist next call
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  fovDeg:         90,     // FGM_FOV_DEG
  binDeg:         2,      // FGM_BIN_DEG
  smoothWin:      9,      // FGM_SMOOTH_WIN
  clearTh:        1.4,    // FGM_CLEAR_TH
  minGapDeg:      4,      // FGM_MIN_GAP_DEG
  target:         "FAR",  // FGM_TARGET
  bubbleRadius:   0.27,   // FGM_BUBBLE_RADIUS
  bubbleMinDeg:   4,      // FGM_BUBBLE_MIN_DEG
  bubbleMaxDeg:   25,     // FGM_BUBBLE_MAX_DEG
  kp:             0.9,    // KP_GAP_ANGLE
  maxSteer:       0.85,   // MAX_STEER
  baseSpeed:      0.5,    // BASE_SPEED
  speedMin:       0.0,    // SPEED_MIN
  speedMax:       0.5,    // SPEED_MAX
  turnSpeed:      0.475,  // TURN_SPEED (0.95*0.5)
  speedSteerDrop: 0.1,    // SPEED_STEER_DROP
  speedFrontDrop: 0.4,    // SPEED_FRONT_DROP
  frontSlow:      0.73,   // FRONT_SLOW (0.55+LIDAR_DX)
  frontStop:      0.38,   // FRONT_STOP (0.2+LIDAR_DX)
  pivotEnable:    true,   // PIVOT_ENABLE
  pivotSteerTh:   0.98,   // PIVOT_STEER_TH
  pivotSoftTh:    0.90,   // PIVOT_SOFT_TH
  pivotMinSpeed:  0.0,    // PIVOT_MIN_SPEED
  emaAlpha:       0.45,   // EMA_ALPHA
  frontWindowDeg: 4,      // FRONT_WINDOW_DEG
  speedCmdScale:  1.1,    // SPEED_CMD_SCALE
  slipEnable:     false,
  slipK:          0.3,
}

const MAX_VALID = 12.0
const WHEEL_BASE = 0.18   // m (LIDAR_DX used as proxy for wheelbase)
const REAL_SPEED = 1.5    // m/s at speed=1.0

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

// Matches _fgm_build_ranges() in param1.py
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
    const worldAngle = robot.heading - (signedDeg * Math.PI) / 180
    const dist = raycast({ x: robot.x, y: robot.y }, worldAngle, walls)
    if (dist < ranges[i]) ranges[i] = dist
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
    return { ranges: sm, angles }
  }

  return { ranges, angles }
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

// Matches _fgm_control() in param1.py
// prevFrontDist: EMA state from previous call (pass frontDist from last FTGResult)
export function ftgControl(
  robot: RobotState,
  walls: Wall[],
  p: SimParams,
  prevFrontDist: number = MAX_VALID
): FTGResult {
  const { ranges, angles } = buildRanges(robot, walls, p)
  const { ranges2, dmin, amin } = applyBubble(ranges, angles, p)
  const gap = findMaxGap(ranges2, angles, p)

  // d_front: pick min from center bins, apply EMA — matches _pick_window_min() + ema()
  const centerI = Math.floor(ranges.length / 2)
  const hw = Math.max(1, Math.floor(p.frontWindowDeg / p.binDeg))
  let frontRaw = MAX_VALID
  for (let i = Math.max(0, centerI - hw); i <= Math.min(ranges.length - 1, centerI + hw); i++) {
    if (ranges[i] < frontRaw) frontRaw = ranges[i]
  }
  const frontDist = p.emaAlpha * frontRaw + (1 - p.emaAlpha) * prevFrontDist

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
    const ls = applyMotorScale(applySpeedLimits(left, p), p)
    const rs = applyMotorScale(applySpeedLimits(right, p), p)
    return { ls, rs, steer, ranges, angles, ranges2, gap: null, tgtDeg, dmin, amin, frontDist }
  }

  const { deg: tgtDeg, dist: tgtDist } = pickTarget(ranges2, angles, gap, p)
  const steer = clamp(p.kp * (tgtDeg * Math.PI) / 180, -p.maxSteer, p.maxSteer)

  const frontEff = Math.min(frontDist, tgtDist)
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

  const ls = applyMotorScale(applySpeedLimits(left, p), p)
  const rs = applyMotorScale(applySpeedLimits(right, p), p)

  return { ls, rs, steer, ranges, angles, ranges2, gap, tgtDeg, dmin, amin, frontDist }
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
