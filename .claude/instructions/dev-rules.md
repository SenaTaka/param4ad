# 開発ルール

## 全般

- `param1.py` はラズパイ実機でのみ動作確認できる（`ydlidar`・`RPi.GPIO` 依存）
- ロジック変更時は `lib/ftg-sim.ts` も同期して更新する
- TypeScript 側のパラメータ正典は `lib/defaults.ts`。Web UI にパラメータを追加するときは必ずここから始める

## パラメータ追加の手順

1. `lib/defaults.ts` に型・デフォルト値・バリデーション追加
2. `app/api/params/route.ts` （GET/POST）に項目追加
3. `param1.py` の `_apply_params_from_dict()` に追加:
   - グローバル宣言（`global` 文）
   - `flt()` / `bln()` / `s()` で値取得
   - `before` / `after` タプルの両方に追加（変化検出が壊れる）
4. Web UI コンポーネントにスライダー/チェックボックス追加

## `FGM_SMOOTH_WIN` の特殊ルール

- 常に奇数に強制（`odd()` 関数）
- API から渡す値も整数で渡すこと

## モーター出力の上限

- PWM デューティは 0〜100%。`SPEED_CMD_SCALE` で微調整するが 100% を超えないようにクランプ済み
- `MOTOR_FREQ`（300Hz）は実験的に決定済み。高周波にすると不安定になる

## API ポーリング周期

- コマンド取得: 0.3秒ごと（`time.sleep(0.3)`）
- パラメータ取得: PAUSE 中のみ、10 tick ごと（約3秒）
- ステータス送信: 毎 tick、非同期スレッドで実行

## キーボード操作（SSH 時）

| キー | 動作 |
|---|---|
| `g` | armed=True（Vercel コマンド受付開始） |
| `s` / `Space` | 緊急停止（PAUSE モード） |
| `q` | 終了 |
| `d` | デバッグ表示 ON/OFF |
| `1` / `2` / `3` | デバッグレベル切替 |
| `p` | 直近ログ 40 件をダンプ |

## 実行コマンド

```bash
# ローカル開発
npm run dev

# ラズパイ（基本）
sudo PARAM_SERVER_URL=https://param4ad.vercel.app python3 ~/car/vivi/param1.py

# ラズパイ（複数台）
sudo PARAM_SERVER_URL=https://param4ad.vercel.app \
     ROBOT_ID=A \
     ROBOT_NAME=チームA \
     python3 ~/car/vivi/param1.py
```
