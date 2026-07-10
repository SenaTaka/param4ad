#!/usr/bin/env bash
# ==========================================================================
# param4ad — 起動時自動実行（systemd）をワンコマンドで設定するスクリプト
#
# 【ラズパイ上で実行】
#   cd ~/car/vivi          # param1.py / deploy/ があるディレクトリ
#   sudo bash deploy/install.sh
#
# 同ディレクトリの deploy/param4ad.service を /etc/systemd/system/ へ配置し、
# 電源ONで自動起動するよう有効化する。
# ==========================================================================
set -euo pipefail

SERVICE_NAME=param4ad
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/${SERVICE_NAME}.service"
DST="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ $EUID -ne 0 ]]; then
  echo "root権限が必要です:  sudo bash $0" >&2
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "サービス定義が見つかりません: $SRC" >&2
  exit 1
fi

# ExecStart のスクリプトパスが実在するか確認（パス設定ミスの早期検出）
# ExecStart=/usr/bin/env python3 /path/to/script.py の最終トークンを取る
PY_PATH=$(grep -m1 '^ExecStart=' "$SRC" | awk '{print $NF}' || true)
if [[ -n "$PY_PATH" && ! -f "$PY_PATH" ]]; then
  echo "⚠ 警告: ExecStart のスクリプトが存在しません: $PY_PATH" >&2
  echo "        $SRC の WorkingDirectory / ExecStart を環境に合わせて修正してください。" >&2
  read -r -p "このまま続行しますか? [y/N] " ans
  [[ "${ans:-N}" =~ ^[Yy]$ ]] || { echo "中止しました。"; exit 1; }
fi

echo "[install] $SRC → $DST"
cp "$SRC" "$DST"

echo "[install] daemon-reload"
systemctl daemon-reload

echo "[install] enable --now ${SERVICE_NAME}"
systemctl enable --now "${SERVICE_NAME}"

echo
systemctl --no-pager status "${SERVICE_NAME}" || true

cat <<EOF

=== 完了 ===
ログ:    journalctl -u ${SERVICE_NAME} -f
状態:    systemctl status ${SERVICE_NAME}
再起動:  sudo systemctl restart ${SERVICE_NAME}
停止:    sudo systemctl stop ${SERVICE_NAME}
無効化:  sudo systemctl disable ${SERVICE_NAME}
EOF
