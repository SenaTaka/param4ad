"use client"

// シミュレータ用パラメータパネル
// 入力コンポーネント（Slider/Toggle/SelectInput）とタブバーは
// app/TeamController.tsx の実設定画面と同じ見た目・挙動を再現したコピー。
import { useState } from "react"
import type { Params } from "@/lib/defaults"
import { SIM_GROUPS } from "./param-groups"
import type { Layers } from "./draw"

type SliderProps = { label: string; min: number; max: number; step: number; unit?: string; desc?: string }
type ToggleProps = { label: string; desc?: string }
type SelectProps = { label: string; options: string[]; desc?: string }

function Slider({ field, value, onChange }: {
  field: SliderProps
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
  field: ToggleProps
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
  field: SelectProps
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

export type SimOnly = { slipEnable: boolean; slipK: number }

const SIM_TAB = SIM_GROUPS.length

export default function ParamPanel({
  params, onChange, simOnly, onSimOnlyChange, layers, onLayersChange, onReset,
}: {
  params: Params
  onChange: (key: keyof Params, value: number | boolean | string) => void
  simOnly: SimOnly
  onSimOnlyChange: (v: SimOnly) => void
  layers: Layers
  onLayersChange: (v: Layers) => void
  onReset: () => void
}) {
  const [activeTab, setActiveTab] = useState(0)
  const group = SIM_GROUPS[Math.min(activeTab, SIM_GROUPS.length - 1)]

  return (
    <section className="bg-[#0b1828] border border-[#1a3048] rounded-xl overflow-hidden">
      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-[#1a3048] scrollbar-hide">
        {SIM_GROUPS.map((g, i) => (
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
        <button
          onClick={() => setActiveTab(SIM_TAB)}
          className={`px-4 py-4 text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] ${
            activeTab === SIM_TAB
              ? "text-cyan-400 border-b-2 border-cyan-400 -mb-px"
              : "text-gray-500 hover:text-gray-200"
          }`}
        >
          シミュレータ設定
        </button>
      </div>

      {/* Fields */}
      {activeTab === SIM_TAB ? (
        <div className="p-4">
          <Toggle
            field={{ label: "タイヤスリップ", desc: "実機にはない sim 専用モデル。速く曲がるほど曲がりにくくなる（アンダーステア）" }}
            value={simOnly.slipEnable}
            onChange={v => onSimOnlyChange({ ...simOnly, slipEnable: v })}
          />
          {simOnly.slipEnable && (
            <Slider
              field={{ label: "スリップ係数", min: 0, max: 1, step: 0.05, desc: "大きいほどスリップが強くなる" }}
              value={simOnly.slipK}
              onChange={v => onSimOnlyChange({ ...simOnly, slipK: v })}
            />
          )}

          <div className="py-4 border-b border-[#1a3048]">
            <span className="text-sm font-medium text-gray-200">レイヤー表示</span>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug mb-2">キャンバスに重ねる情報を選ぶ</p>
            <div className="flex gap-1 flex-wrap">
              {(["rays", "bubble", "gap"] as const).map(k => (
                <label key={k} className="flex items-center gap-2 cursor-pointer select-none min-h-[44px] px-3 rounded-lg hover:bg-[#1a3048] transition-colors">
                  <input type="checkbox" checked={layers[k]}
                    onChange={e => onLayersChange({ ...layers, [k]: e.target.checked })}
                    className="accent-cyan-400 w-4 h-4" />
                  <span className="text-gray-300 text-sm">
                    {k === "rays" ? "LiDAR" : k === "bubble" ? "バブル" : "ギャップ"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={onReset}
              className="min-h-[44px] px-5 rounded-xl text-sm bg-[#1a3048] hover:bg-[#243f5e] text-gray-200 transition-all active:scale-[0.97]"
            >
              ↺ パラメータをデフォルトに戻す
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          {group.fields.map(field => {
            if (field.type === "slider") {
              return (
                <Slider
                  key={field.key}
                  field={field}
                  value={params[field.key] as number}
                  onChange={v => onChange(field.key, v)}
                />
              )
            }
            if (field.type === "toggle") {
              return (
                <Toggle
                  key={field.key}
                  field={field}
                  value={params[field.key] as boolean}
                  onChange={v => onChange(field.key, v)}
                />
              )
            }
            return (
              <SelectInput
                key={field.key}
                field={field}
                value={params[field.key] as string}
                onChange={v => onChange(field.key, v)}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
