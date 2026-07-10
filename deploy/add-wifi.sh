#!/usr/bin/env bash
# ==========================================================================
# param4ad — Wi-Fi を事前登録するスクリプト（NetworkManager / nmcli 用）
#
# 会場の Wi-Fi やスマホのテザリングを「電波が届かない場所でも」先に登録できる。
# 登録済みの Wi-Fi は起動時に電波が届いていれば自動接続される。
#
# 【ラズパイ上で実行】
#   sudo bash deploy/add-wifi.sh <SSID> <パスワード> [優先度]
#
#   例: 会場Wi-Fi（優先度高め）
#     sudo bash deploy/add-wifi.sh "VENUE-WIFI" "pass1234" 20
#   例: スマホテザリング（保険用）
#     sudo bash deploy/add-wifi.sh "iPhone-sena" "hotspotpass" 30
#
# 優先度: 数字が大きいほど優先（省略時 10）。複数の電波が届くとき高い方に接続。
# 確認:   nmcli connection show          # 登録一覧
#         nmcli device wifi list         # 見えている電波
# 削除:   sudo nmcli connection delete "<SSID>"
# ==========================================================================
set -euo pipefail

SSID="${1:?使い方: sudo bash $0 <SSID> <パスワード> [優先度]}"
PASS="${2:?パスワードを指定してください}"
PRIO="${3:-10}"

if [[ $EUID -ne 0 ]]; then
  echo "root権限が必要です:  sudo bash $0 ..." >&2
  exit 1
fi

if ! command -v nmcli >/dev/null; then
  echo "nmcli が見つかりません（NetworkManager 未使用の環境）。" >&2
  echo "netplan 等で設定してください。" >&2
  exit 1
fi

# Wi-Fi インターフェース名を自動検出（通常 wlan0）
IFACE=$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')
IFACE="${IFACE:-wlan0}"

# 同名の登録が既にあれば作り直す
if nmcli -t -f NAME connection show | grep -Fxq "$SSID"; then
  echo "[wifi] 既存の登録を更新: $SSID"
  nmcli connection delete "$SSID" >/dev/null
fi

nmcli connection add type wifi ifname "$IFACE" con-name "$SSID" ssid "$SSID" \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASS" \
  connection.autoconnect yes connection.autoconnect-priority "$PRIO" >/dev/null

echo "[wifi] 登録完了: SSID=$SSID  優先度=$PRIO  IF=$IFACE"
echo
echo "登録済み Wi-Fi 一覧:"
nmcli -f NAME,TYPE,AUTOCONNECT-PRIORITY connection show | grep -i -e NAME -e wifi || true
echo
echo "この電波が届く場所なら今すぐ接続を試せます:"
echo "  sudo nmcli connection up \"$SSID\""
