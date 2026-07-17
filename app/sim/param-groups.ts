// シミュレータ用パラメータメタデータ
// app/TeamController.tsx の GROUPS から「sim の物理・制御に影響する項目」のみを抜粋したコピー。
// ラベル・min/max/step・説明文は TeamController.tsx と同期を保つこと。
// （FORWARD_DEG / MOTOR_FREQ は sim に影響しないため除外）
import type { Params } from "@/lib/defaults"

export type SliderField = {
  type: "slider"
  key: keyof Params
  label: string
  min: number
  max: number
  step: number
  unit?: string
  desc?: string
}

export type ToggleField = {
  type: "toggle"
  key: keyof Params
  label: string
  desc?: string
}

export type SelectField = {
  type: "select"
  key: keyof Params
  label: string
  options: string[]
  desc?: string
}

export type Field = SliderField | ToggleField | SelectField

export type Group = { title: string; fields: Field[] }

export const SIM_GROUPS: Group[] = [
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
      { type: "slider", key: "LIDAR_DX",         label: "センサーの前後ずれ",       unit: "m",  min: -0.3, max: 0.5, step: 0.01, desc: "センサーが車の中心からどれだけ前（＋）か後ろ（−）にあるか" },
      { type: "slider", key: "LIDAR_DY",         label: "センサーの左右ずれ",       unit: "m",  min: -0.3, max: 0.3, step: 0.01, desc: "センサーが車の中心からどれだけ左（＋）か右（−）にあるか" },
      { type: "slider", key: "SPEED_CMD_SCALE",  label: "速度の調整倍率",           unit: "x",  min: 0.5,  max: 2.0,  step: 0.05, desc: "速度命令に掛ける倍率。1.0が基準。モーターが弱い場合は大きくする" },
      { type: "slider", key: "EMA_ALPHA",        label: "距離データのなめらかさ",   unit: "",   min: 0.05, max: 1.0,  step: 0.05, desc: "前の距離データと新しいデータをどう混ぜるか。1に近いほど新しい値をそのまま使う" },
      { type: "slider", key: "FRONT_WINDOW_DEG", label: "前方として見る角度の幅",   unit: "°",  min: 1,    max: 20,   step: 1,    desc: "「正面」として距離を測る角度の範囲。広いほど左右も前として使う" },
    ],
  },
]
