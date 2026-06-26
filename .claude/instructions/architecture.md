# アーキテクチャ

## システム全体像

```
[ブラウザ] ←→ [Vercel / Next.js App Router] ←→ [Upstash Redis]
                                                        ↕ ポーリング 0.3秒
                                                [ラズパイ / param1.py]
                                                  ├─ YDLiDAR（/dev/ttyUSB0）
                                                  └─ PWM モーター（差動2輪）
                                                       GPIO: PWMA=13 PWMB=16
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `param1.py` | ラズパイ走行本体。LiDAR読取・FTG制御・モーター出力・APIポーリング |
| `lib/defaults.ts` | パラメータ型定義・デフォルト値・バリデーション（**全パラメータの正典**） |
| `lib/store.ts` | Redis / メモリストア抽象化（Redis 未接続時はメモリにフォールバック） |
| `lib/ftg-sim.ts` | FTG アルゴリズムの TypeScript 移植（シミュレータ用） |
| `app/page.tsx` | Web UI メインページ（パラメータ操作・コマンド送信） |
| `app/sim/` | FTG シミュレータ（`/sim` ルート） |
| `app/explain/` | アルゴリズム解説（`/explain` ルート） |
| `app/api/params/` | GET/POST パラメータ（Redis 経由） |
| `app/api/command/` | GET/POST コマンド（RUN / PAUSE / QUIT） |
| `app/api/status/` | GET/POST ラズパイステータス |
| `app/api/robots/` | GET/POST/DELETE ロボット一覧 |

## スレッド構成（param1.py）

| スレッド | 内容 | 周期 |
|---|---|---|
| メイン | `keyboard_loop()` — SSH 操作・終了制御 | イベント駆動 |
| `ap.loop()` (daemon) | LiDAR 読取 + FTG 制御ループ | 10ms |
| `poll_command()` (daemon) | Vercel API ポーリング | 0.3秒 |
| `_post_status_async()` (都度生成, daemon) | ステータス送信 | 非同期 |

## モード遷移

```
起動
 └─ PAUSE（初期）
      └─ [g キー] armed=True
            ├─ Vercel START → RUN
            ├─ Vercel STOP  → PAUSE
            └─ Vercel QUIT  → 終了
```

- `armed=True` にならないと Vercel コマンドを受け付けない（意図しない発進を防止）
- パラメータ反映は **PAUSE 中のみ**（RUN 中は次の停止まで保留）
