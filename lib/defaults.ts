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
