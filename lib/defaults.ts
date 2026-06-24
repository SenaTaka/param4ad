export type Params = {
  // FTG Core
  FGM_ENABLE: boolean
  FGM_FOV_DEG: number
  FGM_BIN_DEG: number
  FGM_SMOOTH_WIN: number
  FGM_CLEAR_TH: number
  FGM_MIN_GAP_DEG: number
  FGM_TARGET: string
  // Safety Bubble
  FGM_BUBBLE_RADIUS: number
  FGM_BUBBLE_MIN_DEG: number
  FGM_BUBBLE_MAX_DEG: number
  // Steering
  KP_GAP_ANGLE: number
  MAX_STEER: number
  // Speed
  BASE_SPEED: number
  SPEED_MIN: number
  SPEED_MAX: number
  TURN_SPEED: number
  SPEED_STEER_DROP: number
  SPEED_FRONT_DROP: number
  FRONT_SLOW: number
  FRONT_STOP: number
  // Pivot
  PIVOT_ENABLE: boolean
  PIVOT_STEER_TH: number
  PIVOT_SOFT_TH: number
  PIVOT_MIN_SPEED: number
  // Hardware
  FORWARD_DEG: number
  LIDAR_DX: number
  LIDAR_DY: number
  EMA_ALPHA: number
  FRONT_WINDOW_DEG: number
  MOTOR_FREQ: number
  SPEED_CMD_SCALE: number
}

export type Command = "RUN" | "PAUSE" | "QUIT"

export type RaspiStatus = {
  mode: "RUN" | "PAUSE"
  armed: boolean
  d_front: number | null
  steer: number
  left: number
  right: number
  tgt_deg: number
  dmin: number | null
  gap_width: number | null
  ts: number
}

type ParamSchema = {
  type: "boolean" | "number" | "string"
  min?: number
  max?: number
  enum?: string[]
}

export const PARAM_SCHEMA: Record<keyof Params, ParamSchema> = {
  FGM_ENABLE:        { type: "boolean" },
  FGM_FOV_DEG:       { type: "number", min: 20, max: 180 },
  FGM_BIN_DEG:       { type: "number", min: 0.5, max: 5 },
  FGM_SMOOTH_WIN:    { type: "number", min: 0, max: 21 },
  FGM_CLEAR_TH:      { type: "number", min: 0.1, max: 5 },
  FGM_MIN_GAP_DEG:   { type: "number", min: 1, max: 30 },
  FGM_TARGET:        { type: "string", enum: ["FAR", "MID"] },
  FGM_BUBBLE_RADIUS: { type: "number", min: 0.05, max: 1 },
  FGM_BUBBLE_MIN_DEG:{ type: "number", min: 1, max: 15 },
  FGM_BUBBLE_MAX_DEG:{ type: "number", min: 5, max: 90 },
  KP_GAP_ANGLE:      { type: "number", min: 0.1, max: 3 },
  MAX_STEER:         { type: "number", min: 0.1, max: 1 },
  BASE_SPEED:        { type: "number", min: 0, max: 1 },
  SPEED_MIN:         { type: "number", min: 0, max: 1 },
  SPEED_MAX:         { type: "number", min: 0, max: 1 },
  TURN_SPEED:        { type: "number", min: 0, max: 1 },
  SPEED_STEER_DROP:  { type: "number", min: 0, max: 1 },
  SPEED_FRONT_DROP:  { type: "number", min: 0, max: 1 },
  FRONT_SLOW:        { type: "number", min: 0.1, max: 5 },
  FRONT_STOP:        { type: "number", min: 0.05, max: 2 },
  PIVOT_ENABLE:      { type: "boolean" },
  PIVOT_STEER_TH:    { type: "number", min: 0.5, max: 1 },
  PIVOT_SOFT_TH:     { type: "number", min: 0.3, max: 1 },
  PIVOT_MIN_SPEED:   { type: "number", min: 0, max: 0.5 },
  FORWARD_DEG:       { type: "number", min: -180, max: 180 },
  LIDAR_DX:          { type: "number", min: -0.5, max: 0.5 },
  LIDAR_DY:          { type: "number", min: -0.5, max: 0.5 },
  EMA_ALPHA:         { type: "number", min: 0.01, max: 1 },
  FRONT_WINDOW_DEG:  { type: "number", min: 1, max: 30 },
  MOTOR_FREQ:        { type: "number", min: 50, max: 1000 },
  SPEED_CMD_SCALE:   { type: "number", min: 0.5, max: 2 },
}

export function validateParams(body: unknown): { ok: true; data: Params } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" }
  }
  const input = body as Record<string, unknown>
  const result: Partial<Params> = {}

  for (const [key, schema] of Object.entries(PARAM_SCHEMA) as [keyof Params, ParamSchema][]) {
    if (!(key in input)) continue
    const val = input[key]

    if (schema.type === "boolean") {
      if (typeof val !== "boolean") return { ok: false, error: `${key} must be boolean` }
      result[key] = val as never
    } else if (schema.type === "number") {
      const n = Number(val)
      if (!isFinite(n)) return { ok: false, error: `${key} must be a finite number` }
      if (schema.min !== undefined && n < schema.min) return { ok: false, error: `${key} must be >= ${schema.min}` }
      if (schema.max !== undefined && n > schema.max) return { ok: false, error: `${key} must be <= ${schema.max}` }
      result[key] = n as never
    } else if (schema.type === "string") {
      if (typeof val !== "string") return { ok: false, error: `${key} must be a string` }
      if (schema.enum && !schema.enum.includes(val)) return { ok: false, error: `${key} must be one of ${schema.enum.join(", ")}` }
      result[key] = val as never
    }
  }

  return { ok: true, data: { ...DEFAULT_PARAMS, ...result } }
}

export const DEFAULT_PARAMS: Params = {
  FGM_ENABLE: true,
  FGM_FOV_DEG: 90,
  FGM_BIN_DEG: 2.0,
  FGM_SMOOTH_WIN: 9,
  FGM_CLEAR_TH: 1.4,
  FGM_MIN_GAP_DEG: 4.0,
  FGM_TARGET: "FAR",
  FGM_BUBBLE_RADIUS: 0.27,
  FGM_BUBBLE_MIN_DEG: 4.0,
  FGM_BUBBLE_MAX_DEG: 25,
  KP_GAP_ANGLE: 0.9,
  MAX_STEER: 0.85,
  BASE_SPEED: 0.5,
  SPEED_MIN: 0.0,
  SPEED_MAX: 0.5,
  TURN_SPEED: 0.475,
  SPEED_STEER_DROP: 0.1,
  SPEED_FRONT_DROP: 0.4,
  FRONT_SLOW: 0.73,
  FRONT_STOP: 0.38,
  PIVOT_ENABLE: true,
  PIVOT_STEER_TH: 0.98,
  PIVOT_SOFT_TH: 0.90,
  PIVOT_MIN_SPEED: 0.0,
  FORWARD_DEG: 0.0,
  LIDAR_DX: 0.18,
  LIDAR_DY: 0.00,
  EMA_ALPHA: 0.45,
  FRONT_WINDOW_DEG: 4,
  MOTOR_FREQ: 300,
  SPEED_CMD_SCALE: 1.1,
}

export const DEFAULT_COMMAND: Command = "PAUSE"
