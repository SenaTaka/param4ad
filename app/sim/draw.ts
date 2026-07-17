// Canvas drawing for the FTG simulator — course/scale driven
import type { RobotState, FTGResult } from "@/lib/ftg-sim"
import type { Course } from "./courses"

export type Layers = { rays: boolean; bubble: boolean; gap: boolean }

export type TrailPoint = { x: number; y: number }

export function drawBackground(ctx: CanvasRenderingContext2D, course: Course, scale: number) {
  const s = (v: number) => v * scale
  ctx.fillStyle = "#4b5563"
  ctx.fillRect(0, 0, s(course.worldW), s(course.worldH))

  ctx.fillStyle = "#d1d5db"
  for (const f of course.floors) ctx.fillRect(s(f.x), s(f.y), s(f.w), s(f.h))

  ctx.fillStyle = "#6b7280"
  for (const o of course.obstacles) ctx.fillRect(s(o.x), s(o.y), s(o.w), s(o.h))

  ctx.fillStyle = "#e5e7eb"
  ctx.font = `bold ${s(0.22)}px sans-serif`
  ctx.textAlign = "center"
  for (const o of course.obstacles) {
    if (o.label) ctx.fillText(o.label, s(o.x + o.w / 2), s(o.y + o.h / 2) + s(0.1))
  }
  for (const l of course.labels) ctx.fillText(l.text, s(l.x), s(l.y))

  ctx.strokeStyle = "#1f2937"
  ctx.lineWidth = 3
  for (const [p1, p2] of course.walls) {
    ctx.beginPath()
    ctx.moveTo(s(p1.x), s(p1.y))
    ctx.lineTo(s(p2.x), s(p2.y))
    ctx.stroke()
  }
}

export function drawFinishLine(ctx: CanvasRenderingContext2D, course: Course, scale: number) {
  const ax = course.finishA.x * scale
  const ay = course.finishA.y * scale
  const bx = course.finishB.x * scale
  const by = course.finishB.y * scale
  const len = Math.hypot(bx - ax, by - ay)
  const angle = Math.atan2(by - ay, bx - ax)
  const segLen = len / 8
  ctx.save()
  ctx.translate(ax, ay)
  ctx.rotate(angle)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#111827"
    ctx.fillRect(i * segLen, -5, segLen, 10)
  }
  ctx.restore()
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  course: Course,
  scale: number,
  robot: RobotState,
  result: FTGResult | null,
  trail: TrailPoint[],
  layers: Layers,
) {
  const s = (v: number) => v * scale
  drawBackground(ctx, course, scale)
  if (course.raceMode === "sprint") drawFinishLine(ctx, course, scale)

  if (trail.length > 1) {
    ctx.strokeStyle = "rgba(96,165,250,0.5)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(s(trail[0].x), s(trail[0].y))
    for (let i = 1; i < trail.length; i++) ctx.lineTo(s(trail[i].x), s(trail[i].y))
    ctx.stroke()
  }

  if (result) {
    // rays/bubble/gap は車軸フレーム（axle 基準の距離・角度）で描画する
    const rx = s(robot.x), ry = s(robot.y)
    if (layers.rays) {
      for (let i = 0; i < result.ranges.length; i++) {
        const d = result.ranges[i]
        const t = Math.min(d / 4, 1)
        ctx.strokeStyle = `rgba(${Math.round(255 * (1 - t))},${Math.round(200 * t)},0,0.55)`
        ctx.lineWidth = 1
        const wa = robot.heading - (result.angles[i] * Math.PI) / 180
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx + s(d) * Math.cos(wa), ry + s(d) * Math.sin(wa))
        ctx.stroke()
      }
    }
    if (layers.bubble) {
      ctx.fillStyle = "rgba(239,68,68,0.18)"
      ctx.beginPath(); ctx.moveTo(rx, ry)
      for (let i = 0; i < result.angles.length; i++) {
        if (result.ranges2[i] === 0) {
          const wa = robot.heading - (result.angles[i] * Math.PI) / 180
          ctx.lineTo(rx + s(2.2) * Math.cos(wa), ry + s(2.2) * Math.sin(wa))
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
        ctx.lineTo(rx + s(d) * Math.cos(wa), ry + s(d) * Math.sin(wa))
      }
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
    if (result.tgtDeg !== null) {
      const wa = robot.heading - (result.tgtDeg * Math.PI) / 180
      const len = s(0.7)
      const tx = rx + len * Math.cos(wa), ty = ry + len * Math.sin(wa)
      ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(tx, ty); ctx.stroke()
      ctx.fillStyle = "#facc15"
      ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill()
    }
  }

  const rx = s(robot.x), ry = s(robot.y)
  const bw = s(0.22), bh = s(0.16)
  ctx.save()
  ctx.translate(rx, ry)
  ctx.rotate(robot.heading)
  ctx.fillStyle = "#3b82f6"
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
  ctx.fillStyle = "#93c5fd"
  ctx.fillRect(bw / 2 - 7, -3, 7, 6)
  ctx.restore()
}

export type RaceRobotDrawable = {
  name: string
  color: string
  state: RobotState
  trail: TrailPoint[]
  finished: boolean
}

export function drawRaceFrame(
  ctx: CanvasRenderingContext2D,
  course: Course,
  scale: number,
  robots: RaceRobotDrawable[],
  countdown: number,
) {
  const s = (v: number) => v * scale
  drawBackground(ctx, course, scale)
  drawFinishLine(ctx, course, scale)

  for (const robot of robots) {
    if (robot.trail.length > 1) {
      ctx.strokeStyle = robot.color + "70"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(s(robot.trail[0].x), s(robot.trail[0].y))
      for (let i = 1; i < robot.trail.length; i++) {
        ctx.lineTo(s(robot.trail[i].x), s(robot.trail[i].y))
      }
      ctx.stroke()
    }
  }

  const bw = s(0.22), bh = s(0.16)
  for (const robot of robots) {
    const rx = s(robot.state.x), ry = s(robot.state.y)
    ctx.save()
    ctx.translate(rx, ry)
    ctx.rotate(robot.state.heading)
    ctx.fillStyle = robot.finished ? robot.color + "55" : robot.color
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(bw / 2 - 7, -3, 7, 6)
    ctx.restore()
    ctx.fillStyle = robot.color
    ctx.font = `bold ${s(0.14)}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText(robot.name.slice(0, 8), rx, ry - s(0.22))
  }

  if (countdown > 0) {
    const cw = s(course.worldW), ch = s(course.worldH)
    ctx.fillStyle = "rgba(0,0,0,0.55)"
    ctx.fillRect(0, 0, cw, ch)
    ctx.fillStyle = "#ffffff"
    ctx.font = `bold ${s(2)}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText(String(countdown), cw / 2, ch / 2 + s(0.8))
  }
}
