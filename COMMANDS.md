# コマンドチートシート

ラズパイ LiDAR ロボット運用でよく使うコマンド集。詳しい手順は [Web の運用マニュアル](https://param4ad.vercel.app/doc) を参照。

## URL

| ページ | URL |
|---|---|
| チーム操作画面 | https://param4ad.vercel.app/a 〜 /e |
| 全チーム監視 | https://param4ad.vercel.app/admin |
| 運用マニュアル | https://param4ad.vercel.app/doc |
| シミュレータ | https://param4ad.vercel.app/sim |

## 機体一覧（テザリング時の固定IP）

| 機体 | チーム | IP |
|---|---|---|
| 1号機 | e | 172.20.10.10 |
| 2号機 | a | 172.20.10.11 |
| 3号機 | b | 172.20.10.12 |
| 4号機 | c | 172.20.10.13 |

※ ホスト名は全機 `sena-ras-ubuntu`。自宅 TP-Link は全機 192.168.24.230（同時接続不可）

## SSH / ファイル転送（Mac側）

```bash
ssh sena@172.20.10.10                                        # SSH接続（機体のIPに）
scp param1.py sena@172.20.10.10:~/car/vivi/param1.py         # 走行プログラム転送
scp deploy/clone-usb.sh sena@172.20.10.10:~/car/vivi/deploy/ # スクリプト転送
```

## サービス管理（ラズパイ側）

```bash
journalctl -u param4ad -f          # ログを追いかける
journalctl -u param4ad -b          # 今回の起動分のログ
systemctl status param4ad         # 状態確認
sudo systemctl restart param4ad   # 再起動（コード更新後は必須）
sudo systemctl stop param4ad      # 停止
sudo systemctl start param4ad     # 開始
sudo bash ~/car/vivi/deploy/install.sh    # 自動起動の(再)インストール
```

## チーム変更

```bash
sudo bash ~/car/vivi/deploy/set-team.sh a              # チームaに変更
sudo bash ~/car/vivi/deploy/set-team.sh e robo2 2号機   # 同一チーム2台目はID/名前も指定
```

## Wi-Fi（nmcli）

```bash
# 状態確認
nmcli -t -f ACTIVE,SSID,SIGNAL dev wifi | grep '^yes'         # 今つながっているSSID
nmcli -f NAME,AUTOCONNECT,AUTOCONNECT-PRIORITY connection show # 登録一覧と優先度
nmcli device wifi list                                         # 見えている電波

# Wi-Fi追加（電波が届かない場所でも事前登録できる）
sudo bash ~/car/vivi/deploy/add-wifi.sh "SSID" "パスワード" 10   # 第3引数=優先度

# 優先度変更（大きいほど優先）
sudo nmcli connection modify "SSID" connection.autoconnect-priority 100

# mirai-nomachi（自動接続OFFで登録済み）
sudo nmcli connection up "mirai-nomachi"                                    # その場で接続
sudo nmcli connection modify "mirai-nomachi" connection.autoconnect yes     # 自動接続ON
sudo nmcli connection modify "mirai-nomachi" connection.autoconnect no      # 自動接続OFF

# テザリングの静的IP変更（クローン初回セットアップで使用）
sudo nmcli connection modify sena ipv4.addresses 172.20.10.11/24
```

## USBクローン（2台目作成）

```bash
# 事前準備: LiDARのUSBを抜く（電力確保。param4adはスクリプトが自動停止）
lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS       # クローン先の名前確認（切断のたびに変わる）
tmux new -s clone                          # SSH切断対策（復帰: tmux attach -t clone）

sudo bash ~/car/vivi/deploy/clone-usb.sh /dev/sdb            # 軽量クローン（デフォルト）
sudo bash ~/car/vivi/deploy/clone-usb.sh /dev/sdb --resume   # 中断からの再開
sudo bash ~/car/vivi/deploy/clone-usb.sh /dev/sdb --full     # 全部コピー

# クローン初回セットアップ（必ず単独起動で！全クローンは最初 .10 を名乗る）
ssh sena@172.20.10.10
sudo nmcli connection modify sena ipv4.addresses 172.20.10.11/24   # 機体の番号に
sudo bash ~/car/vivi/deploy/set-team.sh a                          # 機体のチームに
sudo reboot
```

## トラブル調査

```bash
dmesg | tail -30                   # USBエラー・切断の確認
sudo dpkg --configure -a           # 「dpkg was interrupted」の復旧
sudo f3probe --destructive /dev/sdX  # USBの容量偽装チェック（中身は消える）
df -h /                            # ディスク使用量
ip a                               # 自分のIP確認
```

## キーボード操作（SSHで param1.py 直接実行時）

| キー | 動作 |
|---|---|
| `g` | armed=ON（Vercelコマンド受付開始） |
| `s` / Space | 緊急停止 |
| `q` | 終了 |
| `d` | デバッグ表示 ON/OFF |
| `1` `2` `3` | デバッグレベル |
| `p` | 直近ログ40件ダンプ |

## 手動実行（デバッグ時）

```bash
sudo systemctl stop param4ad       # 自動起動を止めてから
cd ~/car/vivi
sudo PARAM_SERVER_URL=https://param4ad.vercel.app TEAM=e python3 param1.py
```
