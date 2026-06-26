# Follow the Gap アルゴリズム

## 処理フロー（`_fgm_control()` 内）

```
LiDAR全点
  │
  ▼ 1. build_ranges()    前方FOVをビン分割 → 最小距離配列
  │     座標変換: LiDAR原点 → 車軸基準 (lidar_point_to_axle_polar)
  │     中央値フィルタで平滑化 (FGM_SMOOTH_WIN)
  ▼
  │ 2. apply_bubble()    最近傍点を中心にSafety Bubbleを展開 → 距離0に潰す
  │     bubble_deg = atan2(BUBBLE_RADIUS, dmin), クランプ[MIN_DEG..MAX_DEG]
  ▼
  │ 3. find_max_gap()    FGM_CLEAR_TH以上のビン = 「開放」
  │                       最大連続開放区間を選ぶ
  ▼
  │ 4. pick_target()     FAR: ギャップ内の最遠点
  │                       MID: ギャップ中央
  ▼
  │ 5. 速度制御          v = BASE_SPEED × (1 - steer_drop) × (1 - front_drop)
  │                       前方距離 < FRONT_SLOW で減速開始
  │                       前方距離 < FRONT_STOP で TURN_SPEED に制限
  ▼
  │ 6. mix_with_pivot()  |steer| > PIVOT_SOFT_TH で片輪停止へ滑らかに移行
  ▼
モーター出力 (left, right)
```

## ギャップなし時（NOGAP）のフォールバック

全ビンが壁判定の場合、最大距離のビンを強制ターゲットにして `TURN_SPEED` で旋回。

## 座標系

- LiDAR の `angle` は `math.degrees(p.angle)` で deg 変換、右手系
- `FORWARD_DEG = 0.0`: LiDAR の 0° がロボット前方（要キャリブレーション）
- `lidar_point_to_axle_polar()`: LiDAR → 車軸原点へオフセット補正（`LIDAR_DX / LIDAR_DY`）
- signed_deg: 左が +、前方が 0°

## TypeScript 側との同期

`lib/ftg-sim.ts` は `param1.py` の FTG ロジックを TS で再実装したもの。  
アルゴリズムを変更するときは **両方を同期して更新**する。
