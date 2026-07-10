#!/usr/bin/env bash
# ==========================================================================
# param4ad — チーム割当を変更するスクリプト
#
# USB クローンで作った2台目などで、チーム (a〜e) だけを差し替える。
#
# 【ラズパイ上で実行】
#   sudo bash deploy/set-team.sh <a|b|c|d|e> [ROBOT_ID] [ROBOT_NAME]
#
#   例: チームDに変更
#     sudo bash deploy/set-team.sh d
#   例: チームDにして名前も設定
#     sudo bash deploy/set-team.sh d robo2 "2号機"
#
# /etc/systemd/system/param4ad.service の Environment= を書き換えて再起動する。
# ==========================================================================
set -euo pipefail

TEAM="${1:?使い方: sudo bash $0 <a|b|c|d|e> [ROBOT_ID] [ROBOT_NAME]}"
ROBOT_ID="${2:-}"
ROBOT_NAME="${3:-${ROBOT_ID}}"
DST=/etc/systemd/system/param4ad.service

if [[ ! "$TEAM" =~ ^[a-e]$ ]]; then
  echo "チームは a〜e のいずれかで指定してください: $TEAM" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "root権限が必要です:  sudo bash $0 ..." >&2
  exit 1
fi

if [[ ! -f "$DST" ]]; then
  echo "サービス未インストールです。先に: sudo bash deploy/install.sh" >&2
  exit 1
fi

# TEAM を書き換え（行がなければ AUTO_ARM の次に追加）
if grep -q '^Environment=TEAM=' "$DST"; then
  sed -i "s/^Environment=TEAM=.*/Environment=TEAM=${TEAM}/" "$DST"
else
  sed -i "/^Environment=AUTO_ARM=/a Environment=TEAM=${TEAM}" "$DST"
fi

# ROBOT_ID / ROBOT_NAME（指定時のみ。既存行は置換、なければ追加）
set_env() {
  local key="$1" val="$2"
  [[ -z "$val" ]] && return 0
  if grep -q "^Environment=${key}=" "$DST"; then
    sed -i "s/^Environment=${key}=.*/Environment=${key}=${val}/" "$DST"
  else
    sed -i "/^Environment=TEAM=/a Environment=${key}=${val}" "$DST"
  fi
}
set_env ROBOT_ID "$ROBOT_ID"
set_env ROBOT_NAME "$ROBOT_NAME"

systemctl daemon-reload
systemctl restart param4ad

echo "[set-team] 変更後の設定:"
grep '^Environment=' "$DST"
echo
echo "確認: journalctl -u param4ad -f   → バナーに team=${TEAM} が出ればOK"
echo "Web UI: https://param4ad.vercel.app/${TEAM}"
