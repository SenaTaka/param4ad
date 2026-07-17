// Course definitions for the FTG simulator
import type { Wall, Vec2, RobotState } from "@/lib/ftg-sim"

export type CourseRect = { x: number; y: number; w: number; h: number; label?: string }
export type CourseLabel = { x: number; y: number; text: string }

export type Course = {
  id: string
  name: string
  worldW: number   // m
  worldH: number   // m
  walls: Wall[]
  floors: CourseRect[]      // drivable area (light fill)
  obstacles: CourseRect[]   // filled blocks (dark fill + label)
  labels: CourseLabel[]     // free-standing text annotations
  start: RobotState
  finishA: Vec2
  finishB: Vec2
  raceMode: "loop" | "sprint"
}

// ── Circuit: 12m × 8m loop（シケイン + Sカーブ）──────────────────────────────
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

export const CIRCUIT: Course = {
  id: "circuit",
  name: "周回コース（シケイン + Sカーブ）",
  worldW: 12,
  worldH: 8,
  walls: [...OUTER, ...INNER, ...CHICANE_A, ...CHICANE_B, ...SCURVE_C, ...SCURVE_D],
  floors: [{ x: 0.4, y: 0.4, w: 11.2, h: 7.2 }],
  obstacles: [
    { x: 2.0,  y: 1.6, w: 8.0, h: 4.4, label: "" },
    { x: 3.5,  y: 6.9, w: 1.7, h: 0.7, label: "シケイン①" },
    { x: 5.2,  y: 6.0, w: 1.6, h: 0.7, label: "シケイン②" },
    { x: 11.0, y: 4.0, w: 0.6, h: 1.0, label: "Sカーブ①" },
    { x: 10.0, y: 2.2, w: 0.8, h: 1.0, label: "Sカーブ②" },
  ],
  labels: [],
  start: { x: 3.0, y: 6.8, heading: 0 },
  // 西レーンを北上する走行ラインと直交する水平線（レーン全幅をカバー）
  finishA: { x: 0.4, y: 5.0 },
  finishB: { x: 2.0, y: 5.0 },
  raceMode: "loop",
}

// ── Venue: 実会場コース（スタート→S字→シケインカーブ→Uターン→ゴール）────────────
// 会場図面のトポロジーを再現した point-to-point コース。廊下幅 2.0m。
// ルート: 右上スタート→西進→S字スラローム→中央仕切りで北へ→シケインカーブ
// （ジグザグバー+ヘアピン）→南下→西進→左端で南下→最下部Uターン→北上してゴール
const VENUE_WALLS: Wall[] = [
  // メイン廊下 y∈[5.5,7.5]
  [{ x: 16.5, y: 5.5 }, { x: 16.5, y: 7.5 }],   // 東端（スタート背後）
  [{ x: 16.5, y: 5.5 }, { x: 10.3, y: 5.5 }],   // 上壁・東側
  [{ x: 6.3,  y: 5.5 }, { x: 0.5,  y: 5.5 }],   // 上壁・西側
  [{ x: 16.5, y: 7.5 }, { x: 2.6,  y: 7.5 }],   // 下壁（上りレグ天井を兼ねる）
  // S字スラローム（上下から交互に突き出すバー、開口 1.0m）
  [{ x: 14.0, y: 7.5 }, { x: 14.0, y: 6.5 }],
  [{ x: 12.8, y: 5.5 }, { x: 12.8, y: 6.5 }],
  [{ x: 11.6, y: 7.5 }, { x: 11.6, y: 6.5 }],
  // シケインカーブ・ループ x∈[6.3,10.3], y∈[0.5,5.5]
  [{ x: 6.3,  y: 0.5 }, { x: 10.3, y: 0.5 }],   // 北端
  [{ x: 6.3,  y: 0.5 }, { x: 6.3,  y: 5.5 }],   // 西外壁
  [{ x: 10.3, y: 0.5 }, { x: 10.3, y: 5.5 }],   // 東外壁
  [{ x: 8.3,  y: 2.4 }, { x: 8.3,  y: 5.5 }],   // 中央仕切り（上端 y=2.4 でヘアピン余地 1.9m）
  [{ x: 8.3,  y: 5.5 }, { x: 7.6,  y: 7.5 }],   // 仕切り下端の導壁（廊下を塞ぎ、北へ導く斜め壁）
  [{ x: 10.3, y: 1.6 }, { x: 9.4,  y: 0.5 }],   // ヘアピン北東角の面取り（左旋回へ導く）
  [{ x: 6.3,  y: 1.6 }, { x: 7.2,  y: 0.5 }],   // ヘアピン北西角の面取り（南下レグへ導く）
  // ジグザグバー（北上レグ内、左右交互、突出 0.9m / 開口 1.1m）
  [{ x: 10.3, y: 4.5 }, { x: 9.4,  y: 4.5 }],
  [{ x: 8.3,  y: 3.1 }, { x: 9.2,  y: 3.1 }],
  // 西側セクション + Uターン
  [{ x: 0.5, y: 5.5 },  { x: 0.5, y: 12.5 }],   // 西壁
  [{ x: 1.4, y: 5.5 },  { x: 0.5, y: 6.4 }],    // 廊下西端の面取り（南下へ導く）
  [{ x: 0.5, y: 12.5 }, { x: 4.7, y: 12.5 }],   // 南端
  [{ x: 0.5, y: 11.7 }, { x: 1.3, y: 12.5 }],   // Uターン南西角の面取り（左旋回へ導く）
  [{ x: 3.8, y: 12.5 }, { x: 4.7, y: 11.6 }],   // Uターン南東角の面取り（北上へ導く）
  [{ x: 4.7, y: 12.5 }, { x: 4.7, y: 7.5 }],    // 上りレグ東壁
  [{ x: 2.6, y: 7.5 },  { x: 2.6, y: 11.0 }],   // Uターン中央仕切り（下端に回頭余地 1.5m）
]

export const VENUE: Course = {
  id: "venue",
  name: "実コース（S字 → シケインカーブ → Uターン）",
  worldW: 17,
  worldH: 13,
  walls: VENUE_WALLS,
  floors: [
    { x: 0.5, y: 5.5, w: 16.0, h: 2.0 },   // メイン廊下
    { x: 6.3, y: 0.5, w: 4.0,  h: 5.0 },   // シケインカーブ
    { x: 0.5, y: 7.5, w: 4.2,  h: 5.0 },   // Uターン区画
  ],
  obstacles: [],
  labels: [
    { x: 15.5, y: 5.0,  text: "スタート" },
    { x: 12.8, y: 4.9,  text: "S字カーブ" },
    { x: 11.6, y: 2.5,  text: "シケインカーブ" },
    { x: 6.0,  y: 11.5, text: "Uターン" },
    { x: 5.9,  y: 8.5,  text: "ゴール" },
  ],
  start: { x: 15.5, y: 6.5, heading: Math.PI },
  finishA: { x: 2.6, y: 8.4 },
  finishB: { x: 4.7, y: 8.4 },
  raceMode: "sprint",
}

export const COURSES: Course[] = [CIRCUIT, VENUE]

export function getCourse(id: string): Course {
  return COURSES.find(c => c.id === id) ?? CIRCUIT
}
