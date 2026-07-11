#!/usr/bin/env bash
# ==========================================================================
# param4ad — 起動中のシステムを別の USB へクローンするスクリプト
#
# 元 USB より小さい USB へもクローンできる（使用中データのみコピー）。
# Ubuntu for Raspberry Pi 用。元の起動方式（LABEL / PARTUUID / UUID）は問わず、
# クローン側の cmdline.txt / fstab はラベル参照に自動書き換えする。
#
# 【使い方（ラズパイ上で・元USBで起動した状態で）】
#   1. クローン先 USB をラズパイに挿す
#   2. lsblk でデバイス名を確認（例: /dev/sdb。起動中のディスクと間違えないこと）
#   3. sudo bash deploy/clone-usb.sh /dev/sdb
#
# 【中断からの再開】フォーマットせずコピー済みファイルを飛ばして続きから:
#   sudo bash deploy/clone-usb.sh /dev/sdb --resume
#
# 【軽量クローン】走行に不要な大物（ROS / LibreOffice / snap / ドキュメント類）を
# 除外してコピー量を減らす。小容量・不調気味の USB 向け:
#   sudo bash deploy/clone-usb.sh /dev/sdb --lite
#   ※ クローン先では Firefox 等の snap アプリ・ROS・LibreOffice は使えなくなる。
#     走行系（python3 / ydlidar / RPi.GPIO / param1.py / systemd / Wi-Fi）は動く。
#
# 完了後: シャットダウン → クローン先 USB を別のラズパイへ →
#         起動して sudo bash deploy/set-team.sh <チーム> で割当変更
# ==========================================================================
set -euo pipefail

TGT="${1:?使い方: sudo bash $0 /dev/sdX [--resume] [--lite]  （lsblk でクローン先を確認してから）}"
RESUME=0
LITE=0
for arg in "${@:2}"; do
  case "$arg" in
    --resume) RESUME=1 ;;
    --lite)   LITE=1 ;;
    *) echo "不明なオプション: $arg" >&2; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "root権限が必要です:  sudo bash $0 $TGT" >&2
  exit 1
fi

[[ -b "$TGT" ]] || { echo "デバイスが見つかりません: $TGT" >&2; exit 1; }

# --- 誤指定ガード: 起動中のディスクはクローン先にできない ---
ROOT_PART=$(findmnt -n -o SOURCE /)
ROOT_DISK="/dev/$(lsblk -no PKNAME "$ROOT_PART")"
if [[ "$TGT" == "$ROOT_DISK" ]]; then
  echo "エラー: $TGT は起動中のディスクです。クローン先を確認してください。" >&2
  lsblk
  exit 1
fi

# --- 起動構成の確認 ---
# 元が LABEL / PARTUUID / UUID のどの参照方式でもよい。
# クローン側はフォーマット時に付けるラベル（system-boot / writable）を
# 参照するよう、コピー後に cmdline.txt と fstab を書き換える。
CMDLINE=/boot/firmware/cmdline.txt
if [[ ! -f "$CMDLINE" ]]; then
  echo "エラー: $CMDLINE が見つかりません（Ubuntu for Raspberry Pi 想定）。" >&2
  exit 1
fi

# --- 容量チェック（使用量 + 2GB 余裕がクローン先に収まるか）---
USED_KB=$(df --output=used -k / | tail -1 | tr -d ' ')
TGT_BYTES=$(lsblk -bdno SIZE "$TGT")
NEED_BYTES=$(( (USED_KB + 2*1024*1024) * 1024 ))
if (( TGT_BYTES < NEED_BYTES )); then
  if (( LITE )); then
    echo "⚠ フルクローンなら容量不足（必要 約$(( NEED_BYTES / 1024 / 1024 / 1024 ))GB / 先 $(( TGT_BYTES / 1024 / 1024 / 1024 ))GB）。"
    echo "  --lite の除外で収まる可能性に賭けて続行します。"
  else
    echo "エラー: クローン先の容量が不足しています。" >&2
    echo "  必要: 約$(( NEED_BYTES / 1024 / 1024 / 1024 ))GB / クローン先: $(( TGT_BYTES / 1024 / 1024 / 1024 ))GB" >&2
    echo "  （--lite を付けると ROS/LibreOffice 等を除いた軽量クローンを試せます）" >&2
    exit 1
  fi
fi

echo "=============================================="
if (( RESUME )); then
  echo " クローン再開: $TGT  （フォーマットせず続きからコピー）"
else
  echo " クローン先: $TGT  （全データが消去されます）"
fi
echo "=============================================="
lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS "$TGT"
echo
if (( RESUME )); then
  read -r -p "$TGT へ続きからコピーします。よければ yes と入力: " ans
else
  read -r -p "本当に $TGT を初期化してクローンしますか? 続行するには yes と入力: " ans
fi
[[ "$ans" == "yes" ]] || { echo "中止しました。"; exit 1; }

# --- 電力確保: 走行プログラムを止める（LiDAR給電との併用でUSBが瞬断するため）---
if systemctl is-active -q param4ad 2>/dev/null; then
  echo "[clone] param4ad を一時停止（電力確保。終了後: sudo systemctl start param4ad）"
  systemctl stop param4ad
fi
if ls /dev/ttyUSB* >/dev/null 2>&1; then
  echo "⚠ LiDAR が接続されています。電力不足による I/O エラーを防ぐため、"
  echo "  LiDAR の USB ケーブルを抜いてから Enter を押してください。"
  read -r -p "  （抜いたら Enter）" _
fi

# マウント中のパーティションがあれば外す（中断後の残りマウント含む）
for p in $(lsblk -lno NAME "$TGT" | tail -n +2); do
  umount -q "/dev/$p" 2>/dev/null || true
done

# パーティション名（/dev/sdb → sdb1, /dev/mmcblk0 → mmcblk0p1）
P1="${TGT}1"; P2="${TGT}2"
[[ "$TGT" =~ [0-9]$ ]] && { P1="${TGT}p1"; P2="${TGT}p2"; }

if (( RESUME )); then
  # 再開時: 前回のパーティションとラベルが正しいか確認だけする
  if [[ "$(lsblk -no LABEL "$P2" 2>/dev/null)" != "writable" ]]; then
    echo "エラー: $P2 のラベルが writable ではありません。--resume なしでやり直してください。" >&2
    exit 1
  fi
else
  # --- パーティション作成（boot: FAT32 512MB / root: ext4 残り全部）---
  echo "[clone] パーティション作成..."
  parted -s "$TGT" mklabel msdos \
    mkpart primary fat32 1MiB 513MiB \
    mkpart primary ext4 513MiB 100% \
    set 1 boot on set 1 lba on
  partprobe "$TGT"
  sleep 2

  echo "[clone] フォーマット..."
  mkfs.vfat -F 32 -n system-boot "$P1" >/dev/null
  mkfs.ext4 -qF -L writable "$P2"
fi

MNT=$(mktemp -d)
mount "$P2" "$MNT"

# --- rsync 除外リスト ---
EXCLUDES=(
  --exclude=/proc/* --exclude=/sys/* --exclude=/dev/* --exclude=/run/*
  --exclude=/tmp/* --exclude=/mnt/* --exclude=/media/* --exclude=/lost+found
  --exclude=/boot/firmware/*
)
if (( LITE )); then
  echo "[clone] --lite: 走行に不要な大物を除外します（ROS / LibreOffice / snap / doc 等）"
  EXCLUDES+=(
    # ROS
    --exclude=/opt/ros --exclude=/home/*/ros2_ws
    # snap アプリ（Firefox 等）と snap 本体データ
    --exclude=/snap --exclude=/var/lib/snapd --exclude=/home/*/snap
    # オフィス・メール・Java
    --exclude=/usr/lib/libreoffice --exclude=/usr/share/libreoffice
    --exclude=/usr/lib/thunderbird --exclude=/usr/lib/jvm
    # ドキュメント・マニュアル類
    --exclude=/usr/share/doc --exclude=/usr/share/man
    --exclude=/usr/share/help --exclude=/usr/share/info
    --exclude=/usr/share/example-content
    # カーネルソース・キャッシュ・ログ・スワップ
    --exclude=/usr/src
    --exclude=/var/cache/* --exclude=/var/tmp/* --exclude=/var/log/*
    --exclude=/var/lib/apt/lists/*
    --exclude=/home/*/.cache --exclude=/root/.cache
    --exclude=/swapfile
  )
fi

echo "[clone] ルートFSをコピー（数分〜数十分かかります）..."
rsync -aHAXx --info=progress2 "${EXCLUDES[@]}" / "$MNT"

mkdir -p "$MNT"/{proc,sys,dev,run,tmp,mnt,media} "$MNT/boot/firmware"

echo "[clone] ブートパーティションをコピー..."
mount "$P1" "$MNT/boot/firmware"
rsync -a /boot/firmware/ "$MNT/boot/firmware/"

# --- クローン先の起動設定をラベル参照に書き換え ---
# 元の root= が PARTUUID/UUID のままだと、クローンが元USBを探して起動してしまう。
sed -i -E 's|root=[^ ]+|root=LABEL=writable|' "$MNT/boot/firmware/cmdline.txt"
awk '($1!~/^#/ && $2=="/"){$1="LABEL=writable"}
     ($1!~/^#/ && $2=="/boot/firmware"){$1="LABEL=system-boot"}
     {print}' "$MNT/etc/fstab" > "$MNT/etc/fstab.tmp" && mv "$MNT/etc/fstab.tmp" "$MNT/etc/fstab"
echo "[clone] 起動設定を LABEL=writable / system-boot 参照に書き換え"

# --- クローン先の個体化: machine-id リセット（IP重複防止。次回起動で再生成）---
truncate -s0 "$MNT/etc/machine-id"
rm -f "$MNT/var/lib/dbus/machine-id"

# --lite: swapfile を除外したので fstab のスワップ行を無効化（起動エラー防止）
if (( LITE )) && grep -q '^/swapfile' "$MNT/etc/fstab" 2>/dev/null; then
  sed -i 's|^/swapfile|#/swapfile|' "$MNT/etc/fstab"
  echo "[clone] --lite: fstab の swapfile 行をコメントアウト"
fi

sync
umount "$MNT/boot/firmware" "$MNT"
rmdir "$MNT"

echo
echo "=== クローン完了 ==="
echo "次の手順:"
echo "  1. sudo shutdown -h now でシャットダウン"
echo "  2. クローン先 USB を抜いて、もう1台のラズパイに挿して起動"
echo "     ※ 同じラベルのUSBを2本挿したまま起動しないこと（起動ディスクが不定になる）"
echo "  3. 起動後にチーム変更:  sudo bash ~/car/vivi/deploy/set-team.sh <a〜e>"
echo "  4. 区別用にホスト名変更（任意）: sudo hostnamectl set-hostname sena-ras-2"
