"use client"

import { useState, useEffect, useCallback } from "react"
import { DEFAULT_PARAMS, DEFAULT_COMMAND } from "@/lib/defaults"
import type { Params, Command } from "@/lib/defaults"

// ---- Field config ----

type SliderField = {
  type: "slider"
  key: keyof Params
  label: string
  min: number
  max: number
  step: number
  unit?: string
  desc?: string
}

type ToggleField = {
  type: "toggle"
  key: keyof Params
  label: string
}

type SelectField = {
  type: "select"
  key: keyof Params
  label: string
  options: string[]
  desc?: string
}

type Field = SliderField | ToggleField | SelectField

type Group = { title: string; fields: Field[] }

const GROUPS: Group[] = [
  {
    title: "FTG コア",
    fields: [
      { type: "toggle",  key: "FGM_ENABLE",      label: "FGM 有効" },
      { type: "slider",  key: "FGM_FOV_DEG",      label: "視野角 (FOV)",     unit: "°",  min: 45,  max: 180, step: 15,  desc: "前方視野角（左右合計）" },
      { type: "slider",  key: "FGM_CLEAR_TH",     label: "壁判定距離",       unit: "m",  min: 0.3, max: 3.0, step: 0.05, desc: "これ未満を障害物とみなす" },
      { type: "slider",  key: "FGM_MIN_GAP_DEG",  label: "最小ギャップ幅",   unit: "°",  min: 1,   max: 30,  step: 0.5,  desc: "これ未満のギャップは無視" },
      { type: "select",  key: "FGM_TARGET",        label: "ターゲット選択",   options: ["FAR", "MID"], desc: "FAR=最遠点 / MID=中央" },
      { type: "slider",  key: "FGM_BIN_DEG",       label: "ビン幅",           unit: "°",  min: 0.5, max: 5,   step: 0.5 },
      { type: "slider",  key: "FGM_SMOOTH_WIN",    label: "平滑化窓",         unit: "",   min: 1,   max: 21,  step: 2,    desc: "奇数・0でOFF" },
    ],
  },
  {
    title: "Safety Bubble",
    fields: [
      { type: "slider", key: "FGM_BUBBLE_RADIUS",  label: "Bubble 半径",   unit: "m",  min: 0.05, max: 0.6, step: 0.01, desc: "車幅/余裕に合わせる" },
      { type: "slider", key: "FGM_BUBBLE_MIN_DEG", label: "Bubble 最小角", unit: "°",  min: 1,    max: 15,  step: 0.5 },
      { type: "slider", key: "FGM_BUBBLE_MAX_DEG", label: "Bubble 最大角", unit: "°",  min: 5,    max: 60,  step: 1 },
    ],
  },
  {
    title: "速度制御",
    fields: [
      { type: "slider", key: "BASE_SPEED",        label: "基本速度",       unit: "",  min: 0,   max: 1.0, step: 0.05, desc: "0..1" },
      { type: "slider", key: "SPEED_MAX",         label: "最大速度",       unit: "",  min: 0,   max: 1.0, step: 0.05 },
      { type: "slider", key: "TURN_SPEED",        label: "旋回速度",       unit: "",  min: 0,   max: 1.0, step: 0.05 },
      { type: "slider", key: "SPEED_STEER_DROP",  label: "操舵減速係数",   unit: "",  min: 0,   max: 1.0, step: 0.05, desc: "ステア大→減速" },
      { type: "slider", key: "SPEED_FRONT_DROP",  label: "前方減速係数",   unit: "",  min: 0,   max: 1.0, step: 0.05, desc: "前方近い→減速" },
      { type: "slider", key: "FRONT_SLOW",        label: "減速開始距離",   unit: "m", min: 0.1, max: 2.0, step: 0.05 },
      { type: "slider", key: "FRONT_STOP",        label: "停止判定距離",   unit: "m", min: 0.05, max: 1.0, step: 0.05 },
    ],
  },
  {
    title: "操舵",
    fields: [
      { type: "slider", key: "KP_GAP_ANGLE", label: "ステア感度 KP", unit: "",  min: 0.1, max: 2.0, step: 0.05, desc: "ターゲット角[rad]→steer係数" },
      { type: "slider", key: "MAX_STEER",    label: "最大ステア量",   unit: "",  min: 0.3, max: 1.0, step: 0.05 },
    ],
  },
  {
    title: "片輪停止 (Pivot)",
    fields: [
      { type: "toggle", key: "PIVOT_ENABLE",     label: "片輪停止 有効" },
      { type: "slider", key: "PIVOT_STEER_TH",   label: "停止閾値",         unit: "", min: 0.5, max: 1.0, step: 0.01, desc: "これ以上で片輪停止" },
      { type: "slider", key: "PIVOT_SOFT_TH",    label: "移行開始閾値",     unit: "", min: 0.5, max: 1.0, step: 0.01 },
      { type: "slider", key: "PIVOT_MIN_SPEED",  label: "片輪時最小速度",   unit: "", min: 0,   max: 0.5, step: 0.01 },
    ],
  },
  {
    title: "ハードウェア",
    fields: [
      { type: "slider", key: "FORWARD_DEG",     label: "前方角度補正",        unit: "°",  min: 0,    max: 359, step: 1,    desc: "LiDAR前方が何度に見えるか" },
      { type: "slider", key: "LIDAR_DX",        label: "LiDAR 前後オフセット", unit: "m",  min: -0.3, max: 0.5, step: 0.01 },
      { type: "slider", key: "LIDAR_DY",        label: "LiDAR 左右オフセット", unit: "m",  min: -0.3, max: 0.3, step: 0.01 },
      { type: "slider", key: "MOTOR_FREQ",      label: "PWM 周波数",          unit: "Hz", min: 50,   max: 1000, step: 50 },
      { type: "slider", key: "SPEED_CMD_SCALE", label: "速度スケール",         unit: "x",  min: 0.5,  max: 2.0,  step: 0.05 },
      { type: "slider", key: "EMA_ALPHA",       label: "EMA 係数",            unit: "",   min: 0.05, max: 1.0,  step: 0.05, desc: "前方距離平滑化" },
      { type: "slider", key: "FRONT_WINDOW_DEG", label: "前方窓幅",           unit: "°",  min: 1,    max: 20,   step: 1 },
    ],
  },
]

// ---- Sub components ----

function Slider({ field, value, onChange }: {
  field: SliderField
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="py-3 border-b border-gray-800 last:border-0">
      <div className="flex justify-between items-center mb-2">
        <div className="flex-1 min-w-0 pr-3">
          <span className="text-sm font-medium text-gray-200">{field.label}</span>
          {field.desc && (
            <span className="text-xs text-gray-500 ml-2">{field.desc}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            value={value}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) onChange(v)
            }}
            className="w-20 text-right bg-gray-800 text-white border border-gray-700 rounded px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          {field.unit && (
            <span className="text-xs text-gray-500 w-6 shrink-0">{field.unit}</span>
          )}
        </div>
      </div>
      <input
        type="range"
        className="slider"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

function Toggle({ field, value, onChange }: {
  field: ToggleField
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="py-3 border-b border-gray-800 last:border-0 flex items-center justify-between">
      <span className="text-sm font-medium text-gray-200">{field.label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-gray-700"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? "translate-x-6" : "translate-x-0"}`}
        />
      </button>
    </div>
  )
}

function SelectInput({ field, value, onChange }: {
  field: SelectField
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="py-3 border-b border-gray-800 last:border-0 flex items-center justify-between">
      <div>
        <span className="text-sm font-medium text-gray-200">{field.label}</span>
        {field.desc && (
          <span className="text-xs text-gray-500 ml-2">{field.desc}</span>
        )}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
      >
        {field.options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

// ---- Main page ----

export default function Home() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)
  const [command, setCommand] = useState<Command>(DEFAULT_COMMAND)
  const [activeTab, setActiveTab] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // Load initial state
  useEffect(() => {
    fetch("/api/params")
      .then(r => r.json())
      .then(setParams)
      .catch(() => {})

    fetch("/api/command")
      .then(r => r.json())
      .then(d => setCommand(d.command))
      .catch(() => {})
  }, [])

  // Poll command every 2s
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/command")
        .then(r => r.json())
        .then(d => setCommand(d.command))
        .catch(() => {})
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const updateParam = useCallback((key: keyof Params, value: number | boolean | string) => {
    setParams(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaveStatus("saving")
    try {
      const r = await fetch("/api/params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      setSaveStatus(r.ok ? "saved" : "error")
    } catch {
      setSaveStatus("error")
    }
    setTimeout(() => setSaveStatus("idle"), 3000)
  }

  const handleCommand = async (cmd: Command) => {
    setCommand(cmd)
    await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    }).catch(() => {})
  }

  const handleReset = () => {
    if (confirm("デフォルト値にリセットしますか？")) {
      setParams(DEFAULT_PARAMS)
    }
  }

  const group = GROUPS[activeTab]

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">FTG Param Controller</h1>
        <p className="text-sm text-gray-500 mt-0.5">LiDAR Follow-the-Gap — Raspberry Pi</p>
      </div>

      {/* Command */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">コマンド</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${command === "RUN" ? "bg-green-400" : "bg-yellow-400"}`} />
            <span className={`text-sm font-bold ${command === "RUN" ? "text-green-400" : "text-yellow-400"}`}>
              {command}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleCommand("RUN")}
              disabled={command === "RUN"}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-green-700 hover:bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              START
            </button>
            <button
              onClick={() => handleCommand("PAUSE")}
              disabled={command === "PAUSE"}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-yellow-700 hover:bg-yellow-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              STOP
            </button>
          </div>
        </div>
      </section>

      {/* Params */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-800 scrollbar-hide">
          {GROUPS.map((g, i) => (
            <button
              key={g.title}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === i
                  ? "text-blue-400 border-b-2 border-blue-400 -mb-px"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="p-4">
          {group.fields.map(field => {
            if (field.type === "slider") {
              return (
                <Slider
                  key={field.key}
                  field={field}
                  value={params[field.key] as number}
                  onChange={v => updateParam(field.key, v)}
                />
              )
            }
            if (field.type === "toggle") {
              return (
                <Toggle
                  key={field.key}
                  field={field}
                  value={params[field.key] as boolean}
                  onChange={v => updateParam(field.key, v)}
                />
              )
            }
            if (field.type === "select") {
              return (
                <SelectInput
                  key={field.key}
                  field={field}
                  value={params[field.key] as string}
                  onChange={v => updateParam(field.key, v)}
                />
              )
            }
            return null
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-950/50">
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            デフォルトに戻す
          </button>
          <button
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              saveStatus === "saved"
                ? "bg-green-700 text-white"
                : saveStatus === "error"
                ? "bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60"
            }`}
          >
            {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "保存完了" : saveStatus === "error" ? "エラー" : "パラメータを保存"}
          </button>
        </div>
      </section>

      {/* API info */}
      <p className="text-xs text-gray-600 text-center">
        GET /api/params — ラズパイはこのエンドポイントで取得
      </p>
    </main>
  )
}
