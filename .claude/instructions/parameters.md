# パラメータ仕様

## 正典の場所

**`lib/defaults.ts`** が全パラメータの型・デフォルト値・バリデーションの唯一の正典。  
新パラメータを追加する順序: `lib/defaults.ts` → API Route → `param1.py`（`_apply_params_from_dict()`）

## 全パラメータ一覧

### LiDAR / 座標系

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `FORWARD_DEG` | float | 0.0 | LiDAR の 0° がロボット前方に対応する角度 |
| `LIDAR_DX` | float | 0.18 | 車軸→LiDAR オフセット（m, 前が+） |
| `LIDAR_DY` | float | 0.00 | 車軸→LiDAR オフセット（m, 左が+） |

### Follow the Gap

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `FGM_ENABLE` | bool | True | FTG 有効 / 直進のみ切替 |
| `FGM_FOV_DEG` | float | 90 | 前方視野角（deg, 左右合計） |
| `FGM_BIN_DEG` | float | 2.0 | 角度ビン幅（deg） |
| `FGM_SMOOTH_WIN` | int(奇数) | 9 | 中央値フィルタ窓幅（0=OFF） |
| `FGM_CLEAR_TH` | float | 1.4 | 壁判定距離（m）。これ未満は障害物 |
| `FGM_MIN_GAP_DEG` | float | 4.0 | 有効ギャップ最小幅（deg） |
| `FGM_TARGET` | str | `"FAR"` | `"FAR"`: 最遠点 / `"MID"`: 中央 |

### Safety Bubble

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `FGM_BUBBLE_RADIUS` | float | 0.27 | 安全バブル半径（m）。車幅/2 + 余裕 |
| `FGM_BUBBLE_MIN_DEG` | float | 4.0 | バブル角度の下限（deg） |
| `FGM_BUBBLE_MAX_DEG` | float | 25 | バブル角度の上限（deg） |

### ステアリング

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `KP_GAP_ANGLE` | float | 0.9 | ターゲット角[rad] → steer ゲイン |
| `MAX_STEER` | float | 0.85 | ステアリング上限（0..1） |

### 速度

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `BASE_SPEED` | float | 0.5 | 直進基本速度（0..1） |
| `SPEED_MIN` | float | 0.0 | 速度下限（0以上のとき） |
| `SPEED_MAX` | float | 0.5 | 速度上限 |
| `TURN_SPEED` | float | 0.475 | NOGAP 旋回時の速度 |
| `SPEED_STEER_DROP` | float | 0.1 | ステアに比例した減速量（0..1） |
| `SPEED_FRONT_DROP` | float | 0.4 | 前方距離に比例した減速量（0..1） |
| `FRONT_SLOW` | float | 0.73 | この距離より近いと減速開始（m） |
| `FRONT_STOP` | float | 0.38 | この距離より近いと最低速度（m） |

### Pivot（片輪停止旋回）

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `PIVOT_ENABLE` | bool | True | 片輪停止 ON/OFF |
| `PIVOT_STEER_TH` | float | 0.98 | 完全片輪停止になるステア閾値 |
| `PIVOT_SOFT_TH` | float | 0.90 | 片輪停止へ移行し始めるステア閾値 |
| `PIVOT_MIN_SPEED` | float | 0.0 | 片輪停止時の回転輪の下限速度 |

### システム / デバッグ

| 変数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `EMA_ALPHA` | float | 0.45 | 前方距離 EMA の係数 |
| `FRONT_WINDOW_DEG` | int | 4 | 前方距離計測の窓幅（deg） |
| `MOTOR_FREQ` | int | 300 | PWM 周波数（Hz）。高すぎると不安定 |
| `SPEED_CMD_SCALE` | float | 1.1 | PWM デューティへの最終スケール |

## `_apply_params_from_dict()` の注意点

- `FGM_SMOOTH_WIN` は `odd()` で奇数に強制変換される
- 追加した変数を `before` / `after` タプルの両方に入れ忘れると変化検出が壊れる
- `_params_lock` の中で書き込む（スレッドセーフ）
