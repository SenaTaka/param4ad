# param4ad — LiDAR FTG パラメータコントローラー

ラズパイ上で動く LiDAR 自動運転（Follow the Gap）を、Web UI からリアルタイムにパラメータ操作するシステム。

- **Web UI**: https://param4ad.vercel.app
- **ロボット側**: `param1.py`（ラズパイで実行）
- **通信**: Vercel（Next.js）+ Upstash Redis 経由

---

## アーキテクチャ

```
[ブラウザ] ←→ [Vercel / Next.js] ←→ [Upstash Redis]
                                              ↕ ポーリング (0.3秒)
                                      [ラズパイ / param1.py]
                                        ├─ YDLiDAR
                                        └─ PWM モーター
```

---

## ラズパイの実行コマンド

### 基本（1台）

```bash
sudo PARAM_SERVER_URL=https://param4ad.vercel.app python3 ~/car/vivi/param1.py
```

### ROBOT_ID を指定（複数台運用）

```bash
# 1台目
sudo PARAM_SERVER_URL=https://param4ad.vercel.app \
     ROBOT_ID=left \
     ROBOT_NAME=左コース \
     python3 ~/car/vivi/param1.py

# 2台目（別ターミナルでSSH）
sudo PARAM_SERVER_URL=https://param4ad.vercel.app \
     ROBOT_ID=right \
     ROBOT_NAME=右コース \
     python3 ~/car/vivi/param1.py
```

`ROBOT_ID` を省略すると `"default"` として動作。

### 環境変数一覧

| 変数 | 必須 | 説明 | 例 |
|---|---|---|---|
| `PARAM_SERVER_URL` | ○ | Vercel の URL | `https://param4ad.vercel.app` |
| `ROBOT_ID` | — | ロボットの識別子（英数字推奨） | `left`, `robot1` |
| `ROBOT_NAME` | — | UI に表示する名前（日本語可） | `左コース` |

---

## キーボード操作（SSH ターミナル）

| キー | 動作 |
|---|---|
| `g` | 自動運転受付開始（これを押してから Web UI の START が有効になる） |
| `s` / `Space` | 緊急停止（即座にモーターを止める） |
| `q` | 終了 |
| `d` | デバッグ表示 ON/OFF |
| `1` / `2` / `3` | デバッグレベル切替（3が最詳細） |
| `p` | 直近ログをダンプ |

---

## Web UI の使い方

1. https://param4ad.vercel.app を開く
2. ラズパイで `param1.py` を起動（自動でドロップダウンに追加される）
3. ラズパイで `g` キーを押して受付開始
4. Web UI の **START** ボタンで走行開始
5. パラメータを調整 → **パラメータを保存**（PAUSE 中のみ反映）
6. **STOP** で停止

### ロボット切り替え（複数台）

- ヘッダーのドロップダウンで切り替え
- 「＋」ボタンで手動追加も可能（ラズパイ未起動でも事前登録できる）
- 「✕」ボタンでリストから削除

> **注意**: パラメータはラズパイが **PAUSE 状態のときのみ** 反映される。RUN 中は次の停止まで適用されない。

---

## セットアップ（初回）

### 1. Vercel にデプロイ

```bash
npm install
vercel --prod
```

### 2. Upstash Redis を接続

Vercel ダッシュボード → **Integrations** → **Upstash for Redis** → Add → param4ad に接続

接続後、環境変数をローカルに取得:
```bash
vercel env pull .env.local
```

### 3. ラズパイに `param1.py` を配置

```bash
scp param1.py pi@<ラズパイのIP>:~/car/vivi/param1.py
```

---

## パラメータ説明（主要）

| パラメータ | 意味 | 目安 |
|---|---|---|
| `FGM_FOV_DEG` | LiDARの前方視野角 | 90°（狭め）〜 120°（広め） |
| `FGM_CLEAR_TH` | 「壁」と判定する距離 | 1.2〜1.6 m |
| `FGM_BUBBLE_RADIUS` | 障害物の安全バブル半径 | 車幅の半分 + 余裕 |
| `BASE_SPEED` | 直進基本速度 | 0.4〜0.6 |
| `SPEED_MAX` | 最大速度上限 | BASE_SPEED 以上 |
| `KP_GAP_ANGLE` | ステアリングの鋭さ | 0.7〜1.2 |
| `PIVOT_ENABLE` | 片輪停止旋回 ON/OFF | コーナーで有効 |

---

## ファイル構成

```
param4ad/
├── param1.py          # ラズパイ走行スクリプト（本体）
├── app/
│   ├── page.tsx       # Web UI メインページ
│   ├── sim/           # FTG シミュレータ（/sim）
│   ├── explain/       # アルゴリズム解説（/explain）
│   └── api/
│       ├── params/    # GET/POST パラメータ
│       ├── command/   # GET/POST コマンド（RUN/PAUSE/QUIT）
│       ├── status/    # GET/POST ラズパイステータス
│       └── robots/    # GET/POST/DELETE ロボット一覧
├── lib/
│   ├── defaults.ts    # パラメータ型・デフォルト値・バリデーション
│   ├── store.ts       # Redis / メモリストア抽象化
│   └── ftg-sim.ts     # FTG アルゴリズム（シミュレータ用）
└── cmd.txt            # 起動コマンドメモ
```
