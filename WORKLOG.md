# 作業記録

## 2026-07-10: 自動起動・チームE割当・Wi-Fi・USBクローン

### やったこと

#### 1. 電源ONで自動起動（systemd）+ チームE割当
- `param1.py` に `TEAM` 環境変数対応を追加（全APIに `&team=` 付与）。
  それまでは team を送っておらず全ロボットが `/a` に入っていた
- `deploy/param4ad.service` に `Environment=TEAM=e` を設定
- ラズパイ1号機に `sudo bash deploy/install.sh` でインストール済み・動作確認済み
  （ログに `team=e`、Web UI は https://param4ad.vercel.app/e ）
- 注意: **サービス起動中に `enable --now` しても再起動されない**。コード更新後は
  `sudo systemctl restart param4ad` が必須

#### 2. 起動時ネット未接続対策
- 再起動テストで Wi-Fi 接続が60秒に間に合わず API 初期化が抜ける問題が発覚
- `param1.py` に接続リトライスレッドを追加:
  接続でき次第 PAUSEリセット → ロボット登録 → パラメータ取得 → ポーリング開始
  （先にポーリングすると前回の RUN で誤発進するため、この順序が重要）

#### 3. Wi-Fi 複数登録（会場・テザリング対応）
- `deploy/add-wifi.sh`: 電波が届かない場所でも事前登録できる（nmcli）
- スマホのテザリングを優先度100で登録済み → 両方の電波があるときスマホ優先
- **優先度が効くのは接続の瞬間だけ**: スマホ優先にするには
  「ホットスポットON → ラズパイ電源ON」の順。あとからONにしても乗り換えない
- 会場Wi-Fiは現地に行く前に登録すること（未接続だとSSHもできず詰む）

#### 4. 2台目作成（USBクローン）— 進行中
- 元USB 248GB → 新USB 128GB なので dd 不可。rsync方式の `deploy/clone-usb.sh` を作成
- **1回目の失敗**: LiDAR + 走行プログラム稼働中で電力不足 → クローン先USBが
  I/Oエラーで瞬断（約1.9GB地点）。対策としてスクリプトに param4ad 自動停止 +
  LiDAR取り外し確認を組み込み
- **2回目**: 対策後は順調に進行（7.2GB超）したが、所要時間の都合でユーザーが Ctrl-C 中断
- `--resume` オプションを追加済み（フォーマットせず続きからコピー）

### 現在の状態（次回はここから）

- [ ] **クローン再開が未完**。ラズパイで:
  ```bash
  # Mac から最新スクリプトを転送してから
  scp deploy/clone-usb.sh sena@<ラズパイIP>:~/car/vivi/deploy/
  sudo bash ~/car/vivi/deploy/clone-usb.sh /dev/sdb --resume
  ```
- [ ] クローン完了後: 新USBを2号機へ → `sudo bash ~/car/vivi/deploy/set-team.sh <チーム>`
      （+ 任意で `sudo hostnamectl set-hostname sena-ras-2`）
- [ ] ラズパイ1号機の `param4ad` はクローン用に停止中。走行に戻すには
      LiDAR を挿して `sudo systemctl start param4ad`
- [ ] 会場Wi-Fiが分かったら: `sudo bash ~/car/vivi/deploy/add-wifi.sh "SSID" "パス" 20`

### 追加したファイル

| ファイル | 役割 |
|---|---|
| `deploy/install.sh` | systemd 自動起動をワンコマンド設定 |
| `deploy/param4ad.service` | systemd ユニット（TEAM=e, AUTO_ARM=1） |
| `deploy/add-wifi.sh` | Wi-Fi 事前登録（優先度指定可） |
| `deploy/set-team.sh` | チーム/ROBOT_ID 変更 + 再起動 |
| `deploy/clone-usb.sh` | 小容量USBへのクローン（--resume 対応） |
| `app/doc/page.tsx` | Web UI 運用マニュアル（/doc、ナビに「運用」タブ） |

### 関連コミット

`29d22dd`〜`0f0b38d`（2026-07-10）
