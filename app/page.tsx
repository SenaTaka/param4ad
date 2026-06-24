"use client"

import { useState, useEffect, useCallback } from "react"
import { DEFAULT_PARAMS, DEFAULT_COMMAND } from "@/lib/defaults"
import type { Params, Command, RaspiStatus } from "@/lib/defaults"

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
      { type: "slider", key: "FGM_FOV_DEG",    label: "前を見る広さ",      unit: "°",  min: 45,  max: 180, step: 5,   desc: "ロボットが前を見る角度。広いほど左右までよく見える" },
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
    <div className="py-4 border-b border-[#1a3048] last:border-0">
      <div className="flex justify-between items-start mb-1 gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-200">{field.label}</span>
          {field.desc && (
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">{field.desc}</p>
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
            className="w-20 text-right bg-[#0b1828] text-white border border-[#1a3048] rounded-lg px-2 py-2 text-sm font-mono focus:border-cyan-400 focus:outline-none min-h-[40px]"
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
    <div className="py-4 border-b border-[#1a3048] last:border-0 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-200">{field.label}</span>
        {field.desc && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{field.desc}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative shrink-0 w-14 h-8 rounded-full transition-colors duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1828] ${value ? "bg-cyan-600" : "bg-[#1a3048]"}`}
      >
        <span
          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200 ${value ? "translate-x-6" : "translate-x-0"}`}
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
    <div className="py-4 border-b border-[#1a3048] last:border-0 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-200">{field.label}</span>
        {field.desc && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{field.desc}</p>}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[#0b1828] text-white border border-[#1a3048] rounded-lg px-3 py-2 text-sm font-mono min-h-[40px] focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 shrink-0"
      >
        {field.options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

// ---- Raspi Status Panel ----

function SteerBar({ value }: { value: number }) {
  const pct = Math.round(Math.abs(value) * 50)
  const isLeft = value > 0
  return (
    <div className="flex items-center gap-1.5 w-full">
      <span className="text-[10px] text-gray-500 w-3 text-right">L</span>
      <div className="flex-1 h-2 bg-[#1a3048] rounded-full overflow-hidden flex">
        <div className="w-1/2 flex justify-end">
          {isLeft && <div className="h-full bg-cyan-400 rounded-l-full" style={{ width: `${pct}%` }} />}
        </div>
        <div className="w-px bg-gray-600" />
        <div className="w-1/2">
          {!isLeft && <div className="h-full bg-cyan-400 rounded-r-full" style={{ width: `${pct}%` }} />}
        </div>
      </div>
      <span className="text-[10px] text-gray-500 w-3">R</span>
    </div>
  )
}

function RaspiStatusPanel({ status }: { status: RaspiStatus | null }) {
  const now = Date.now() / 1000
  const age = status ? now - status.ts : Infinity
  const connected = age < 5

  return (
    <section className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest font-mono">ラズパイ状態</h2>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-gray-600"}`} />
          <span className="text-[10px] font-mono text-gray-500">
            {connected ? `${Math.round(age)}秒前` : status ? "切断" : "未接続"}
          </span>
        </div>
      </div>

      {!connected ? (
        <p className="text-xs text-gray-600 font-mono text-center py-2">ラズパイからのデータなし</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <div>
            <span className="text-[10px] text-gray-500 font-mono">モード</span>
            <p className={`text-sm font-bold font-mono ${status!.mode === "RUN" ? "text-green-400" : "text-yellow-400"}`}>
              {status!.mode}
            </p>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-mono">前方距離</span>
            <p className="text-sm font-bold font-mono text-white">
              {status!.d_front !== null ? `${status!.d_front.toFixed(2)} m` : "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-mono">左モーター</span>
            <p className="text-sm font-bold font-mono text-cyan-300">{status!.left.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 font-mono">右モーター</span>
            <p className="text-sm font-bold font-mono text-cyan-300">{status!.right.toFixed(2)}</p>
          </div>
          <div className="col-span-2">
            <span className="text-[10px] text-gray-500 font-mono block mb-1">
              ステア {status!.steer >= 0 ? "←" : "→"} {Math.abs(status!.steer).toFixed(2)}
            </span>
            <SteerBar value={status!.steer} />
          </div>
          {status!.dmin !== null && (
            <div>
              <span className="text-[10px] text-gray-500 font-mono">最近障害物</span>
              <p className="text-sm font-mono text-gray-300">{status!.dmin.toFixed(2)} m</p>
            </div>
          )}
          {status!.gap_width !== null && (
            <div>
              <span className="text-[10px] text-gray-500 font-mono">ギャップ幅</span>
              <p className="text-sm font-mono text-gray-300">{status!.gap_width.toFixed(1)}°</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---- Main page ----

export default function Home() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)
  const [command, setCommand] = useState<Command>(DEFAULT_COMMAND)
  const [activeTab, setActiveTab] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [raspiStatus, setRaspiStatus] = useState<RaspiStatus | null>(null)

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

  // コマンドはユーザー操作のみで更新（サーバーポーリング廃止）
  // → マルチインスタンス不整合でUIが逆転するのを防ぐ

  // Poll raspi status every 2s
  useEffect(() => {
    const poll = () => {
      fetch("/api/status")
        .then(r => r.json())
        .then((d: RaspiStatus | null) => setRaspiStatus(d))
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 2000)
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
      if (r.ok) {
        setSaveStatus("saved")
        setLastSavedAt(new Date())
      } else {
        setSaveStatus("error")
      }
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            <span className="text-cyan-400 font-mono mr-1.5 select-none">&gt;</span>FTG Param Controller
          </h1>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 font-mono">LiDAR Follow-the-Gap — Raspberry Pi</p>
      </div>

      {/* Command */}
      <section className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 font-mono">コマンド</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {command === "RUN" && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${command === "RUN" ? "bg-green-400" : "bg-yellow-400"}`} />
            </span>
            <span className={`text-sm font-bold font-mono ${command === "RUN" ? "text-green-400" : "text-yellow-400"}`}>
              {command}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleCommand("RUN")}
              disabled={command === "RUN"}
              className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-green-700 hover:bg-green-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
            >
              START
            </button>
            <button
              onClick={() => handleCommand("PAUSE")}
              disabled={command === "PAUSE"}
              className="min-h-[44px] px-6 rounded-xl text-sm font-bold bg-yellow-700 hover:bg-yellow-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
            >
              STOP
            </button>
          </div>
        </div>
      </section>

      {/* Raspi Status */}
      <RaspiStatusPanel status={raspiStatus} />

      {/* Params */}
      <section className="bg-[#0b1828] border border-[#1a3048] rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-[#1a3048] scrollbar-hide">
          {GROUPS.map((g, i) => (
            <button
              key={g.title}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-4 text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
                activeTab === i
                  ? "text-cyan-400 border-b-2 border-cyan-400 -mb-px"
                  : "text-gray-500 hover:text-gray-200"
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
        <div className="border-t border-[#1a3048] bg-[#04090f]/50">
          {command === "RUN" && (
            <p className="text-xs text-yellow-400/80 text-center py-2 font-mono border-b border-[#1a3048]">
              ⚠ RUN中はパラメータが反映されません — STOPしてから保存してください
            </p>
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <button
                onClick={handleReset}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs text-gray-500 hover:text-gray-200 hover:bg-[#1a3048] transition-all active:scale-[0.97] font-mono text-left"
              >
                デフォルトに戻す
              </button>
              {lastSavedAt && (
                <span className="text-[10px] text-gray-600 font-mono pl-4">
                  最終保存 {lastSavedAt.toLocaleTimeString("ja-JP")}
                </span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className={`min-h-[44px] px-6 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                saveStatus === "saved"
                  ? "bg-green-700 text-white"
                  : saveStatus === "error"
                  ? "bg-red-700 text-white"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-60"
              }`}
            >
              {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "✓ 保存完了" : saveStatus === "error" ? "エラー" : "パラメータを保存"}
            </button>
          </div>
        </div>
      </section>

      {/* API info */}
      <p className="text-xs text-[#1a3048] text-center font-mono select-none">
        GET /api/params
      </p>
    </main>
  )
}
