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
  desc?: string
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
      { type: "toggle", key: "FGM_ENABLE",     label: "自動運転 ON/OFF",   desc: "ロボットが自動で走る機能をONかOFFにする" },
      { type: "slider", key: "FGM_FOV_DEG",    label: "前を見る広さ",      unit: "°",  min: 45,  max: 180, step: 15,   desc: "ロボットが前を見る角度。広いほど左右までよく見える" },
      { type: "slider", key: "FGM_CLEAR_TH",   label: "かべとみなす距離",  unit: "m",  min: 0.3, max: 3.0, step: 0.05, desc: "この距離より近いものをかべと判断する。大きいと遠くの物もかべ扱い" },
      { type: "slider", key: "FGM_MIN_GAP_DEG",label: "通れる隙間の最小幅",unit: "°",  min: 1,   max: 30,  step: 0.5,  desc: "この角度より狭い隙間は通れないと判断して無視する" },
      { type: "select", key: "FGM_TARGET",      label: "目指す場所",        options: ["FAR", "MID"], desc: "FAR＝一番遠い点を目指す　MID＝隙間の真ん中を目指す" },
      { type: "slider", key: "FGM_BIN_DEG",     label: "角度の細かさ",      unit: "°",  min: 0.5, max: 5,   step: 0.5,  desc: "角度を何度ごとに区切るか。小さいほど細かく周りを見る" },
      { type: "slider", key: "FGM_SMOOTH_WIN",  label: "距離のなめらかさ",  unit: "",   min: 1,   max: 21,  step: 2,    desc: "センサーの数値をなめらかにする。大きいほどデコボコが取れる（奇数）" },
    ],
  },
  {
    title: "Safety Bubble",
    fields: [
      { type: "slider", key: "FGM_BUBBLE_RADIUS",  label: "危険ゾーンの大きさ", unit: "m", min: 0.05, max: 0.6, step: 0.01, desc: "一番近い障害物の周りに作る「近づかない範囲」。車の幅より少し大きめにする" },
      { type: "slider", key: "FGM_BUBBLE_MIN_DEG", label: "危険ゾーン 最小角度", unit: "°", min: 1,    max: 15,  step: 0.5,  desc: "危険ゾーンの最小の広がり角度" },
      { type: "slider", key: "FGM_BUBBLE_MAX_DEG", label: "危険ゾーン 最大角度", unit: "°", min: 5,    max: 60,  step: 1,    desc: "危険ゾーンの最大の広がり角度。大きくすると障害物をより大きく避ける" },
    ],
  },
  {
    title: "速度制御",
    fields: [
      { type: "slider", key: "BASE_SPEED",       label: "ふつうのスピード",        unit: "", min: 0,    max: 1.0, step: 0.05, desc: "まっすぐ走るときの基本スピード（0が止まる・1が最速）" },
      { type: "slider", key: "SPEED_MAX",        label: "最大スピード",            unit: "", min: 0,    max: 1.0, step: 0.05, desc: "どんなときでも出せる一番速いスピード" },
      { type: "slider", key: "TURN_SPEED",       label: "曲がれないときのスピード", unit: "", min: 0,    max: 1.0, step: 0.05, desc: "通れる隙間がないときにゆっくり旋回するスピード" },
      { type: "slider", key: "SPEED_STEER_DROP", label: "曲がるほど遅くなる量",    unit: "", min: 0,    max: 1.0, step: 0.05, desc: "大きくハンドルを切るほどスピードを落とす量。大きいほどコーナーで遅くなる" },
      { type: "slider", key: "SPEED_FRONT_DROP", label: "前が近いほど遅くなる量",  unit: "", min: 0,    max: 1.0, step: 0.05, desc: "前の障害物が近いほどスピードを落とす量。大きいほど手前から減速する" },
      { type: "slider", key: "FRONT_SLOW",       label: "減速を始める距離",        unit: "m", min: 0.1, max: 2.0, step: 0.05, desc: "前にこの距離より近い物があったらスピードを落とし始める" },
      { type: "slider", key: "FRONT_STOP",       label: "ほぼ止まる距離",          unit: "m", min: 0.05,max: 1.0, step: 0.05, desc: "前にこの距離より近い物があったらほぼ止まる" },
    ],
  },
  {
    title: "操舵",
    fields: [
      { type: "slider", key: "KP_GAP_ANGLE", label: "ハンドルの切れ味", unit: "", min: 0.1, max: 2.0, step: 0.05, desc: "大きいほどカクッと鋭く曲がる。小さいとゆっくりなめらかに曲がる" },
      { type: "slider", key: "MAX_STEER",    label: "ハンドルの最大量", unit: "", min: 0.3, max: 1.0, step: 0.05, desc: "ハンドルを切れる最大の量。大きいほどより急カーブを曲がれる" },
    ],
  },
  {
    title: "片輪停止 (Pivot)",
    fields: [
      { type: "toggle", key: "PIVOT_ENABLE",    label: "その場回転 ON/OFF", desc: "片方のタイヤを止めてもう片方だけ回してその場でクルッと回る機能" },
      { type: "slider", key: "PIVOT_STEER_TH",  label: "その場回転になる曲がり具合", unit: "", min: 0.5, max: 1.0, step: 0.01, desc: "ハンドルをこれ以上切ったらその場回転に切り替える。1に近いほど急カーブだけ使う" },
      { type: "slider", key: "PIVOT_SOFT_TH",   label: "その場回転に切り替え始める量", unit: "", min: 0.5, max: 1.0, step: 0.01, desc: "ここからじわじわその場回転に近づく。PIVOT_STEER_THより小さくする" },
      { type: "slider", key: "PIVOT_MIN_SPEED", label: "その場回転中の最低スピード", unit: "", min: 0,   max: 0.5, step: 0.01, desc: "その場回転中に動いているタイヤの最低スピード" },
    ],
  },
  {
    title: "ハードウェア",
    fields: [
      { type: "slider", key: "FORWARD_DEG",      label: "センサーの前方向補正",     unit: "°",  min: 0,    max: 359, step: 1,    desc: "センサーが「前」と感じている方向を合わせる数値。取り付け向きによって調整する" },
      { type: "slider", key: "LIDAR_DX",         label: "センサーの前後ずれ",       unit: "m",  min: -0.3, max: 0.5, step: 0.01, desc: "センサーが車の中心からどれだけ前（＋）か後ろ（−）にあるか" },
      { type: "slider", key: "LIDAR_DY",         label: "センサーの左右ずれ",       unit: "m",  min: -0.3, max: 0.3, step: 0.01, desc: "センサーが車の中心からどれだけ左（＋）か右（−）にあるか" },
      { type: "slider", key: "MOTOR_FREQ",       label: "モーターの振動数",         unit: "Hz", min: 50,   max: 1000, step: 50,  desc: "モーターを動かすパルスの速さ。低いほど安定するが音が出やすい" },
      { type: "slider", key: "SPEED_CMD_SCALE",  label: "速度の調整倍率",           unit: "x",  min: 0.5,  max: 2.0,  step: 0.05, desc: "速度命令に掛ける倍率。1.0が基準。モーターが弱い場合は大きくする" },
      { type: "slider", key: "EMA_ALPHA",        label: "距離データのなめらかさ",   unit: "",   min: 0.05, max: 1.0,  step: 0.05, desc: "前の距離データと新しいデータをどう混ぜるか。1に近いほど新しい値をそのまま使う" },
      { type: "slider", key: "FRONT_WINDOW_DEG", label: "前方として見る角度の幅",   unit: "°",  min: 1,    max: 20,   step: 1,    desc: "「正面」として距離を測る角度の範囲。広いほど左右も前として使う" },
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
      <div className="flex-1 min-w-0 pr-3">
        <span className="text-sm font-medium text-gray-200">{field.label}</span>
        {field.desc && <span className="text-xs text-gray-500 ml-2">{field.desc}</span>}
      </div>
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
