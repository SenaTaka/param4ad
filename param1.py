#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#hagh speed コーナーは、FGM_MIN_GAP_DEG = 4.0*1 
# #b/1b1f1.py
"""
LiDAR + PWM 自動運転（Follow the Gap）
- 前方FOVの距離列を作る（1degビン）
- 最接近障害物の周囲を Safety Bubble で潰す
- 残った領域から最大ギャップを抽出
- ギャップ内の最遠点（or中央）を狙って差動操舵
- キー操作（SSH想定）:
    g: 自動運転 開始/再開
    s: 一時停止（停止維持）
    q: 終了
    d: デバッグON/OFF
    1/2/3: デバッグレベル切替
    p: 直近ログをダンプ

pｗmを下げると安定する,高周波だとダメ
"""

import os
import json
import time
import math
import threading
import sys
import termios
import tty
import select
import urllib.request
from collections import deque
import ydlidar
import RPi.GPIO as GPIO

# PARAM_SERVER_URL は起動前にシェルで設定: export PARAM_SERVER_URL=https://param4ad.vercel.app

# ==========================================
# 0) 運用パラメータ（要調整）
# ==========================================
FORWARD_DEG = 0.0  # LiDARの絶対角で「前方」が何度に見えているか（表示と合わせる）


# ===== LiDAR取り付けオフセット（車軸基準へ補正）=====
LIDAR_DX = 0.18   # [m] 車軸→LiDAR（前が+）
LIDAR_DY = 0.00   # [m] 車軸→LiDAR（左が+）

# ===== Follow-the-Gap 設定 ===ss==
FGM_ENABLE = True

FGM_FOV_DEG = 90#120#90#180.0         # 前方に使う視野角（左右合計、推奨 120〜180）
FGM_BIN_DEG = 2.0           # 角度ビン幅（deg）。1.0で十分
FGM_SMOOTH_WIN = 9        # 距離列の簡易平滑化窓（奇数推奨、0でOFF）



FGM_CLEAR_TH = 1.4#0.9          # これ未満は「壁/障害物」とみなす（m）. # !!!!!!!!!
FGM_MIN_GAP_DEG = 4.0*1       # ギャップ最小幅（deg）。これ未満は無視

FGM_BUBBLE_RADIUS = 0.27#0.25#0.4     # Safeqty Bubble 半径（m）。車幅/余裕に合わせる
FGM_BUBBLE_MIN_DEG = 4.0    # Bubble の下限角（deg）
FGM_BUBBLE_MAX_DEG = 25#45#25#35.0   # Bubble の上限角（deg）

FGM_TARGET = "FAR"          # "FAR": ギャップ内最遠点 / "MID": ギャップ中央
KP_GAP_ANGLE = 0.9#0.7#1.2          # ターゲット角[rad] → steer 係数. #!!!!!!!!!!!

MAX_STEER = 0.85            # 差動操舵上限（0..1 目安）. 

# 速度（0..1）
BASE_SPEED = 1 *0.5
SPEED_MIN = 0.0
SPEED_MAX = 1.00*0.5
TURN_SPEED =0.95*0.5#0.6#0.6#0.15           # ほぼ停止旋回に寄せたい場合の下限

# 速度制御（操舵が大きいほど減速）
SPEED_STEER_DROP = 0.1#0.35#0.55*1     # steerの絶対値に比例して減速（0..1）
SPEED_FRONT_DROP = 0.4#0.70*1     # 前方距離が短いほど減速（0..1）
FRONT_SLOW = 0.55 +LIDAR_DX         # この距離より近いと速度を落とし始める（m）
FRONT_STOP = 0.2 +LIDAR_DX          # ここ未満なら停止寄り（m）

# ===== 片輪停止（Pivot / Skid）設定 =====
PIVOT_ENABLE = True

PIVOT_STEER_TH = 0.98      # |steer| がこれ以上なら片輪停止（0..1）
PIVOT_SOFT_TH  = 0.90      # ここから徐々に片輪停止へ寄せる（0..1）
PIVOT_MIN_SPEED = 0.0     # 片輪停止時のv下限（小さすぎると止まりがち）

# 計測レンジのバリデーション
SIDE_MIN_VALID = 0.003
MAX_VALID = 12.0

# 前方距離のEMA（デバッグ/速度用）
EMA_ALPHA = 0.45
FRONT_WINDOW_DEG = 4#8.0

# LiDAR設定
LIDAR_PORT = "/dev/ttyUSB0"
LIDAR_BAUD = 230400

# PWM設定
MOTOR_FREQ = 300
SPEED_CMD_SCALE = 1.1

# GPIOピン（あなたの設定を踏襲）
PWMA, AIN1, AIN2 = 13, 21, 20
PWMB, BIN1, BIN2 = 16, 26, 19


# ==========================================
# Vercel API 連携
# ==========================================
# ラズパイ起動時に export PARAM_SERVER_URL=https://param4ad.vercel.app
# を設定するとパラメータを取得し、コマンド(RUN/PAUSE)を監視する

_params_lock = threading.Lock()  # グローバルパラメータ更新のロック


def test_api_connection(url: str) -> bool:
    """起動時に /api/params と /api/command の両方をテストして結果を表示する。"""
    print(f"[API] ===== 接続テスト =====", flush=True)
    print(f"[API] URL: {url}", flush=True)
    all_ok = True

    for path in ("params", "command"):
        endpoint = f"{url}/api/{path}"
        try:
            req = urllib.request.Request(
                endpoint, headers={"User-Agent": "raspi-ftg/1.0"}
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                body = r.read()
                d = json.loads(body)
            print(f"[API]   /api/{path}  OK  → {d}", flush=True)
        except urllib.error.URLError as e:
            print(f"[API]   /api/{path}  FAIL URLError: {e.reason}", flush=True)
            all_ok = False
        except Exception as e:
            print(f"[API]   /api/{path}  FAIL {type(e).__name__}: {e}", flush=True)
            all_ok = False

    if all_ok:
        print("[API] ===== 接続 OK =====", flush=True)
    else:
        print("[API] ===== 接続 FAIL — ネットワーク/URL を確認 =====", flush=True)
    return all_ok


def _apply_params_from_dict(d: dict) -> bool:
    """dict からグローバル変数へ反映し、変更があった場合 True を返す。"""
    global FORWARD_DEG, LIDAR_DX, LIDAR_DY
    global FGM_ENABLE, FGM_FOV_DEG, FGM_BIN_DEG, FGM_SMOOTH_WIN
    global FGM_CLEAR_TH, FGM_MIN_GAP_DEG, FGM_TARGET
    global FGM_BUBBLE_RADIUS, FGM_BUBBLE_MIN_DEG, FGM_BUBBLE_MAX_DEG
    global KP_GAP_ANGLE, MAX_STEER
    global BASE_SPEED, SPEED_MIN, SPEED_MAX, TURN_SPEED
    global SPEED_STEER_DROP, SPEED_FRONT_DROP, FRONT_SLOW, FRONT_STOP
    global PIVOT_ENABLE, PIVOT_STEER_TH, PIVOT_SOFT_TH, PIVOT_MIN_SPEED
    global EMA_ALPHA, FRONT_WINDOW_DEG, MOTOR_FREQ, SPEED_CMD_SCALE

    def flt(k, cur): return float(d[k]) if k in d else cur
    def bln(k, cur): return bool(d[k]) if k in d else cur
    def s(k, cur):   return str(d[k])   if k in d else cur
    def odd(v):      v = int(v); return v if v % 2 == 1 else v + 1  # 奇数に強制

    with _params_lock:
        before = (
            FORWARD_DEG, LIDAR_DX, LIDAR_DY,
            FGM_ENABLE, FGM_FOV_DEG, FGM_BIN_DEG, FGM_SMOOTH_WIN,
            FGM_CLEAR_TH, FGM_MIN_GAP_DEG, FGM_TARGET,
            FGM_BUBBLE_RADIUS, FGM_BUBBLE_MIN_DEG, FGM_BUBBLE_MAX_DEG,
            KP_GAP_ANGLE, MAX_STEER,
            BASE_SPEED, SPEED_MIN, SPEED_MAX, TURN_SPEED,
            SPEED_STEER_DROP, SPEED_FRONT_DROP, FRONT_SLOW, FRONT_STOP,
            PIVOT_ENABLE, PIVOT_STEER_TH, PIVOT_SOFT_TH, PIVOT_MIN_SPEED,
            EMA_ALPHA, FRONT_WINDOW_DEG, MOTOR_FREQ, SPEED_CMD_SCALE,
        )

        FORWARD_DEG        = flt("FORWARD_DEG",        FORWARD_DEG)
        LIDAR_DX           = flt("LIDAR_DX",            LIDAR_DX)
        LIDAR_DY           = flt("LIDAR_DY",            LIDAR_DY)
        FGM_ENABLE         = bln("FGM_ENABLE",          FGM_ENABLE)
        FGM_FOV_DEG        = flt("FGM_FOV_DEG",         FGM_FOV_DEG)
        FGM_BIN_DEG        = flt("FGM_BIN_DEG",         FGM_BIN_DEG)
        FGM_SMOOTH_WIN     = odd(flt("FGM_SMOOTH_WIN",  FGM_SMOOTH_WIN))  # 常に奇数
        FGM_CLEAR_TH       = flt("FGM_CLEAR_TH",        FGM_CLEAR_TH)
        FGM_MIN_GAP_DEG    = flt("FGM_MIN_GAP_DEG",     FGM_MIN_GAP_DEG)
        FGM_TARGET         = s(  "FGM_TARGET",           FGM_TARGET)
        FGM_BUBBLE_RADIUS  = flt("FGM_BUBBLE_RADIUS",    FGM_BUBBLE_RADIUS)
        FGM_BUBBLE_MIN_DEG = flt("FGM_BUBBLE_MIN_DEG",   FGM_BUBBLE_MIN_DEG)
        FGM_BUBBLE_MAX_DEG = flt("FGM_BUBBLE_MAX_DEG",   FGM_BUBBLE_MAX_DEG)
        KP_GAP_ANGLE       = flt("KP_GAP_ANGLE",         KP_GAP_ANGLE)
        MAX_STEER          = flt("MAX_STEER",             MAX_STEER)
        BASE_SPEED         = flt("BASE_SPEED",            BASE_SPEED)
        SPEED_MIN          = flt("SPEED_MIN",             SPEED_MIN)
        SPEED_MAX          = flt("SPEED_MAX",             SPEED_MAX)
        TURN_SPEED         = flt("TURN_SPEED",            TURN_SPEED)
        SPEED_STEER_DROP   = flt("SPEED_STEER_DROP",      SPEED_STEER_DROP)
        SPEED_FRONT_DROP   = flt("SPEED_FRONT_DROP",      SPEED_FRONT_DROP)
        FRONT_SLOW         = flt("FRONT_SLOW",            FRONT_SLOW)
        FRONT_STOP         = flt("FRONT_STOP",            FRONT_STOP)
        PIVOT_ENABLE       = bln("PIVOT_ENABLE",          PIVOT_ENABLE)
        PIVOT_STEER_TH     = flt("PIVOT_STEER_TH",        PIVOT_STEER_TH)
        PIVOT_SOFT_TH      = flt("PIVOT_SOFT_TH",         PIVOT_SOFT_TH)
        PIVOT_MIN_SPEED    = flt("PIVOT_MIN_SPEED",        PIVOT_MIN_SPEED)
        EMA_ALPHA          = flt("EMA_ALPHA",              EMA_ALPHA)
        FRONT_WINDOW_DEG   = int(flt("FRONT_WINDOW_DEG",  FRONT_WINDOW_DEG))
        MOTOR_FREQ         = int(flt("MOTOR_FREQ",         MOTOR_FREQ))
        SPEED_CMD_SCALE    = flt("SPEED_CMD_SCALE",        SPEED_CMD_SCALE)

        after = (
            FORWARD_DEG, LIDAR_DX, LIDAR_DY,
            FGM_ENABLE, FGM_FOV_DEG, FGM_BIN_DEG, FGM_SMOOTH_WIN,
            FGM_CLEAR_TH, FGM_MIN_GAP_DEG, FGM_TARGET,
            FGM_BUBBLE_RADIUS, FGM_BUBBLE_MIN_DEG, FGM_BUBBLE_MAX_DEG,
            KP_GAP_ANGLE, MAX_STEER,
            BASE_SPEED, SPEED_MIN, SPEED_MAX, TURN_SPEED,
            SPEED_STEER_DROP, SPEED_FRONT_DROP, FRONT_SLOW, FRONT_STOP,
            PIVOT_ENABLE, PIVOT_STEER_TH, PIVOT_SOFT_TH, PIVOT_MIN_SPEED,
            EMA_ALPHA, FRONT_WINDOW_DEG, MOTOR_FREQ, SPEED_CMD_SCALE,
        )

    return before != after  # True = 変更あり


def _print_applied_params(label: str = "適用パラメータ", dbg=None) -> None:
    lines = [
        f"[PARAM] ── {label} ──",
        f"[PARAM]  FTG    FOV={FGM_FOV_DEG}° CLEAR={FGM_CLEAR_TH}m GAP={FGM_MIN_GAP_DEG}° TGT={FGM_TARGET}",
        f"[PARAM]  Bubble R={FGM_BUBBLE_RADIUS}m [{FGM_BUBBLE_MIN_DEG}°..{FGM_BUBBLE_MAX_DEG}°]",
        f"[PARAM]  Speed  BASE={BASE_SPEED} MAX={SPEED_MAX} TURN={TURN_SPEED}",
        f"[PARAM]  Steer  KP={KP_GAP_ANGLE} MAX={MAX_STEER}  Pivot={PIVOT_ENABLE}",
    ]
    for line in lines:
        if dbg:
            dbg.log(line)
        else:
            print(line, flush=True)


def fetch_and_apply_params(url: str) -> None:
    """起動時: Vercel API からパラメータを取得して反映する。"""
    endpoint = f"{url}/api/params"
    print(f"[API] GET {endpoint}", flush=True)
    try:
        req = urllib.request.Request(endpoint, headers={"User-Agent": "raspi-ftg/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            status = r.status
            d = json.loads(r.read())
        print(f"[API] params HTTP {status}, {len(d)} keys", flush=True)
    except Exception as e:
        print(f"[API] fetch_params FAILED: {type(e).__name__}: {e}", flush=True)
        return

    _apply_params_from_dict(d)
    _print_applied_params("起動時パラメータ")




def _post_status_async(ap, status_endpoint: str) -> None:
    """ステータス POST をデーモンスレッドで非同期実行（poll_command をブロックしない）。"""
    def _do():
        with ap._status_lock:
            data = dict(ap._status)
        with ap.lock:
            data["mode"] = ap.mode
            data["armed"] = ap.armed
        data["ts"] = time.time()  # 送信時刻で常に上書き（PAUSE中も接続表示を維持）
        try:
            body = json.dumps(data).encode()
            req = urllib.request.Request(
                status_endpoint, data=body,
                headers={"Content-Type": "application/json", "User-Agent": "raspi-ftg/1.0"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=2)
        except Exception:
            pass
    threading.Thread(target=_do, daemon=True).start()


def poll_command(ap, url: str) -> None:
    """コマンドを 1 秒ごと、PAUSE 中はパラメータも 3 秒ごとに取得して反映する。"""
    cmd_endpoint    = f"{url}/api/command"
    param_endpoint  = f"{url}/api/params"
    status_endpoint = f"{url}/api/status"
    print(f"[API] poll_command started  cmd={cmd_endpoint}", flush=True)

    _last_cmd        = None
    _last_params_raw = b""   # 前回取得したパラメータ JSON (変化検出用)
    _ok_count        = 0
    _err_count       = 0
    _tick            = 0     # 経過カウンタ

    while True:
        with ap.lock:
            if not ap.running:
                ap.dbg.log("[API] 終了")
                break

        _tick += 1

        # ---- コマンド取得（毎秒）----
        try:
            req = urllib.request.Request(
                cmd_endpoint, headers={"User-Agent": "raspi-ftg/1.0"}
            )
            with urllib.request.urlopen(req, timeout=3) as r:
                d = json.loads(r.read())

            cmd = d.get("command", "PAUSE")
            _ok_count += 1
            _err_count = 0

            with ap.lock:
                armed = ap.armed
                mode  = ap.mode

            if cmd != _last_cmd:
                state = "受付中" if armed else "g キーで受付開始"
                ap.dbg.log(f"[API] コマンド変化: {_last_cmd} → {cmd}  [{state}]")
                _last_cmd = cmd

            if _ok_count % 100 == 0:  # 約30秒ごとに生存確認（0.3s×100）
                ap.dbg.log(f"[API] 通信OK  cmd={cmd}  mode={mode}  armed={armed}")

            if cmd == "QUIT" and armed:
                ap.dbg.log("[API] QUIT → 終了")
                ap.request_quit()
                break
            elif not armed:
                pass
            elif cmd == "RUN" and mode != "RUN":
                ap.set_mode("RUN")
            elif cmd == "PAUSE" and mode != "PAUSE":
                ap.set_mode("PAUSE")

        except urllib.error.URLError as e:
            _err_count += 1
            if _err_count == 1 or _err_count % 10 == 0:
                ap.dbg.log(f"[API] 通信エラー ({_err_count}回連続): {e.reason}")
        except Exception as e:
            _err_count += 1
            if _err_count == 1 or _err_count % 10 == 0:
                ap.dbg.log(f"[API] エラー ({_err_count}回連続): {type(e).__name__}: {e}")

        # ---- PAUSE 中のみ: パラメータを10tickごとに取得（約3秒）----
        with ap.lock:
            is_paused = (ap.mode == "PAUSE")

        if is_paused and _tick % 10 == 0:
            try:
                req = urllib.request.Request(
                    param_endpoint, headers={"User-Agent": "raspi-ftg/1.0"}
                )
                with urllib.request.urlopen(req, timeout=3) as r:
                    body = r.read()

                if body != _last_params_raw:
                    _last_params_raw = body
                    changed = _apply_params_from_dict(json.loads(body))
                    if changed:
                        _print_applied_params("パラメータ更新", ap.dbg)
                        with ap._status_lock:
                            ap._status["param_updated_at"] = time.time()

            except Exception as e:
                ap.dbg.log(f"[PARAM] 取得エラー: {type(e).__name__}: {e}")

        # ---- ステータスを WebUI に非同期送信 ----
        _post_status_async(ap, status_endpoint)

        time.sleep(0.3)  # 0.3秒ごとにポーリング（1秒→0.3秒）


# ==========================================
# DEBUG 設定
# ==========================================
DBG_ENABLE = True
DBG_HZ = 10.0
DBG_LEVEL = 2
DBG_RING_N = 300


# ==========================================
# 1) 角度・距離ユーティリティ
# ==========================================
def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

def circ_diff_deg(a, b):
    d = (a - b + 180.0) % 360.0 - 180.0
    return abs(d)

def ema(prev, new, alpha):
    if new is None:
        return prev
    if prev is None:
        return new
    return alpha * new + (1.0 - alpha) * prev

def apply_speed_limits(v):
    """0は許容。0より大きいときだけSPEED_MINを適用。"""
    if v <= 0.0:
        return 0.0
    return clamp(v, SPEED_MIN, SPEED_MAX)

def mix_with_pivot(v, steer):
    """
    v: 0..1
    steer: -MAX_STEER..+MAX_STEER（+が左へ曲がる）
    返り値: (left, right) 0..1
    """
    # 通常差動
    left  = v * (1.0 - steer)
    right = v * (1.0 + steer)

    if not PIVOT_ENABLE:
        return left, right

    s = abs(steer)

    # 片輪停止へ寄せる重み 0..1
    if s <= PIVOT_SOFT_TH:
        w = 0.0
    elif s >= PIVOT_STEER_TH:
        w = 1.0
    else:
        w = (s - PIVOT_SOFT_TH) / max(PIVOT_STEER_TH - PIVOT_SOFT_TH, 1e-6)

    # pivot用の目標（曲がる向きと反対側の輪を止める）
    # steer>0（左旋回）→ 左輪を止めて右だけ回す（片輪停止旋回）
    if steer > 0:
        left_p, right_p = 0.0, max(v, PIVOT_MIN_SPEED)
    else:
        left_p, right_p = max(v, PIVOT_MIN_SPEED), 0.0

    # 線形合成（滑らかに移行）
    left  = (1.0 - w) * left  + w * left_p
    right = (1.0 - w) * right + w * right_p

    return left, right


def rel_deg_from_forward(abs_deg):
    """LiDARの絶対角（0..360）→ ロボット前方基準の相対角（0..360）"""
    return (abs_deg - FORWARD_DEG + 360.0) % 360.0

def rel_deg_to_signed(rel_deg):
    """相対角 0..360 → -180..+180（+が左）"""
    return (rel_deg + 180.0) % 360.0 - 180.0

def fmt(x, nd=3):
    if x is None:
        return "None"
    try:
        return f"{float(x):.{nd}f}"
    except Exception:
        return str(x)

def lidar_point_to_axle_polar(dist_m, abs_deg):
    """
    LiDAR原点で観測した点 (dist, abs_deg) を
    車軸原点での (dist_axle, signed_deg_axle) に変換
    signed_deg: 左が+、前方0deg
    """
    th = math.radians(abs_deg)
    x_l = dist_m * math.cos(th)
    y_l = dist_m * math.sin(th)

    x_a = x_l + LIDAR_DX
    y_a = y_l + LIDAR_DY

    dist_a = math.hypot(x_a, y_a)
    abs_a_deg = (math.degrees(math.atan2(y_a, x_a)) + 360.0) % 360.0

    rel = rel_deg_from_forward(abs_a_deg)
    signed = rel_deg_to_signed(rel)
    return dist_a, signed


# ==========================================
# 1.5) DEBUG ロガー（1行固定更新）
# ==========================================
class DebugLog:
    """
    - sample(): 1行を上書き更新（数値ステータス）
    - event(): 改行でイベント出力（状態遷移など）
    - dump(): まとめて改行出力
    """
    def __init__(self, enable=True, hz=5.0, level=1, ring_n=200, one_line=True):
        self.enable = bool(enable)
        self.hz = float(hz)
        self.level = int(level)
        self.ring = deque(maxlen=int(ring_n))
        self._t_last = 0.0
        self._lock = threading.Lock()

        self.one_line = bool(one_line) and sys.stdout.isatty()
        self._last_status = ""

    def toggle(self):
        with self._lock:
            self.enable = not self.enable
            return self.enable

    def set_level(self, level: int):
        with self._lock:
            self.level = int(level)

    def _clear_line(self):
        sys.stdout.write("\r\033[2K")

    def _print_status_line(self, s: str):
        self._clear_line()
        sys.stdout.write(s)
        sys.stdout.flush()

    def _print_above(self, line: str):
        """ステータス行を壊さずその上に1行出力する（スレッドセーフ前提で呼ぶ）。"""
        if self.one_line:
            self._clear_line()
            sys.stdout.write(line + "\n")
            if self._last_status:
                sys.stdout.write(self._last_status)
            sys.stdout.flush()
        else:
            print(line, flush=True)

    def log(self, msg: str):
        """API・システムメッセージをステータス行を壊さず出力する。"""
        with self._lock:
            self.ring.append(msg)
        self._print_above(msg)

    def event(self, msg: str):
        with self._lock:
            if not self.enable:
                return
            s = f"[EVT] {msg}"
            self.ring.append(s)

        self._print_above(s)

    def sample(self, msg: str, now: float):
        with self._lock:
            if not self.enable:
                return
            period = 1.0 / max(self.hz, 0.1)
            if (now - self._t_last) < period:
                return
            self._t_last = now

            s = msg
            self.ring.append("[DBG] " + s)

            if self.one_line:
                self._last_status = s
            else:
                self._last_status = ""

        if self.one_line:
            self._print_status_line(s)
        else:
            print("\n[DBG] " + s, flush=True)

    def dump(self, n=30):
        with self._lock:
            n = int(n)
            data = list(self.ring)[-n:]
            en = self.enable
            lv = self.level
            last = self._last_status

        if self.one_line:
            self._clear_line()
        print(f"[DBG] --- dump last {len(data)} logs (enable={en}, level={lv}) ---", flush=True)
        for s in data:
            print(s, flush=True)
        print("[DBG] --- dump end ---", flush=True)

        if self.one_line and last:
            sys.stdout.write(last)
            sys.stdout.flush()


# ==========================================
# 2) モータ制御（あなたの方式を踏襲）
# ==========================================
class MotorDriver:
    def __init__(self):
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)

        for p in (PWMA, AIN1, AIN2, PWMB, BIN1, BIN2):
            GPIO.setup(p, GPIO.OUT, initial=GPIO.LOW)

        self.pwmL = GPIO.PWM(PWMA, MOTOR_FREQ)
        self.pwmR = GPIO.PWM(PWMB, MOTOR_FREQ)
        self.pwmL.start(0)
        self.pwmR.start(0)

    def set_drive(self, left_speed, right_speed):
        ls = clamp(float(left_speed), 0.0, 1.0) * float(SPEED_CMD_SCALE)
        rs = clamp(float(right_speed), 0.0, 1.0) * float(SPEED_CMD_SCALE)
        ls = clamp(ls, 0.0, 1.0)
        rs = clamp(rs, 0.0, 1.0)

        # 左（前進固定）
        if ls > 0.0:
            GPIO.output(AIN1, 1)
            GPIO.output(AIN2, 0)
            self.pwmL.ChangeDutyCycle(ls * 100.0)
        else:
            GPIO.output(AIN1, 0)
            GPIO.output(AIN2, 0)
            self.pwmL.ChangeDutyCycle(0)

        # 右（前進固定）
        if rs > 0.0:
            GPIO.output(BIN1, 1)
            GPIO.output(BIN2, 0)
            self.pwmR.ChangeDutyCycle(rs * 100.0)
        else:
            GPIO.output(BIN1, 0)
            GPIO.output(BIN2, 0)
            self.pwmR.ChangeDutyCycle(0)

    def stop(self):
        self.set_drive(0, 0)

    def close(self):
        try:
            self.stop()
            self.pwmL.stop()
            self.pwmR.stop()
        finally:
            GPIO.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ==========================================
# 3) LiDAR初期化（あなたの設定を踏襲）
# ==========================================
def init_lidar():
    ydlidar.os_init()
    laser = ydlidar.CYdLidar()

    laser.setlidaropt(ydlidar.LidarPropSerialPort, LIDAR_PORT)
    laser.setlidaropt(ydlidar.LidarPropSerialBaudrate, LIDAR_BAUD)
    laser.setlidaropt(ydlidar.LidarPropLidarType, ydlidar.TYPE_TRIANGLE)
    laser.setlidaropt(ydlidar.LidarPropDeviceType, ydlidar.YDLIDAR_TYPE_SERIAL)

    laser.setlidaropt(ydlidar.LidarPropScanFrequency, 18.0)
    laser.setlidaropt(ydlidar.LidarPropSampleRate, 4)
    laser.setlidaropt(ydlidar.LidarPropSingleChannel, False)

    laser.setlidaropt(ydlidar.LidarPropMaxAngle, 90.0)
    laser.setlidaropt(ydlidar.LidarPropMinAngle, -90.0)

    laser.setlidaropt(ydlidar.LidarPropMaxRange, 12.0)
    laser.setlidaropt(ydlidar.LidarPropMinRange, 0.05)

    laser.setlidaropt(ydlidar.LidarPropIntenstiy, True)
    laser.setlidaropt(ydlidar.LidarPropAutoReconnect, True)

    if not laser.initialize():
        raise RuntimeError("laser.initialize() が False（ポート/権限/接続を確認）")
    if not laser.turnOn():
        raise RuntimeError("laser.turnOn() が False（電源/配線/設定を確認）")

    return laser


# ==========================================
# 4) 自動運転（Follow the Gap）
# ==========================================
class AutoPilot:
    def __init__(self, motor: MotorDriver, laser: ydlidar.CYdLidar):
        self.motor = motor
        self.laser = laser
        self.scan = ydlidar.LaserScan()

        self.d_front = None
        self.mode = "PAUSE"
        self.running = True
        self.armed = False  # True になると UI コマンドを受け付ける
        self.lock = threading.Lock()

        self.dbg = DebugLog(DBG_ENABLE, DBG_HZ, DBG_LEVEL, DBG_RING_N, one_line=True)
        self.fail = {"no_scan": 0}

        self._last_target_deg = 0.0

        # ラズパイ→WebUI フィードバック用（poll_command が読んで POST）
        self._status = {
            "mode": "PAUSE", "d_front": None, "steer": 0.0,
            "left": 0.0, "right": 0.0, "tgt_deg": 0.0,
            "dmin": None, "gap_width": None, "ts": 0.0,
            "param_updated_at": None,
        }
        self._status_lock = threading.Lock()

    def set_armed(self, armed: bool):
        with self.lock:
            prev = self.armed
            self.armed = armed
        if armed and not prev:
            self.dbg.event("armed=True  UI受付開始 — Vercel で START を押すと走行")
        elif not armed and prev:
            self.dbg.event("armed=False")

    def set_mode(self, mode):
        with self.lock:
            if self.mode == mode:
                return  # 同じモードなら何もしない（motor.stop()の無駄な連呼を防ぐ）
            self.dbg.event(f"mode {self.mode} -> {mode}")
            self.mode = mode
            if mode == "PAUSE":
                self.motor.stop()

    def request_quit(self):
        with self.lock:
            self.running = False

    def _pick_window_min(self, center_signed_deg, window_deg):
        best = None
        for p in self.scan.points:
            dist = float(p.range)
            if not (SIDE_MIN_VALID < dist < MAX_VALID):  # NaN/Inf/0/負数をまとめて除外
                continue

            abs_deg = (math.degrees(p.angle) + 360.0) % 360.0
            dist_a, signed_a = lidar_point_to_axle_polar(dist, abs_deg)

            if abs(signed_a - center_signed_deg) <= window_deg:
                if best is None or dist_a < best:
                    best = dist_a
        return best

    def _update_scan(self):
        ok = self.laser.doProcessSimple(self.scan)
        if not ok:
            self.fail["no_scan"] += 1
            return False

        nf = self._pick_window_min(center_signed_deg=0.0, window_deg=FRONT_WINDOW_DEG)
        self.d_front = ema(self.d_front, nf, EMA_ALPHA)
        return True

    def _fgm_build_ranges(self):
        half = FGM_FOV_DEG * 0.5
        nbin = int(round(FGM_FOV_DEG / FGM_BIN_DEG)) + 1
        ranges = [MAX_VALID] * nbin
        angles = [(-half + i * FGM_BIN_DEG) for i in range(nbin)]  # signed deg（左+）

        for p in self.scan.points:
            dist = float(p.range)
            if not (SIDE_MIN_VALID < dist < MAX_VALID):  # NaN/Inf/0/負数をまとめて除外
                continue

            abs_deg = (math.degrees(p.angle) + 360.0) % 360.0

            dist_a, signed_a = lidar_point_to_axle_polar(dist, abs_deg)

            if signed_a < -half or signed_a > half:
                continue

            idx = int(round((signed_a + half) / FGM_BIN_DEG))
            if 0 <= idx < nbin:
                if dist_a < ranges[idx]:
                    ranges[idx] = dist_a

        if FGM_SMOOTH_WIN and FGM_SMOOTH_WIN >= 3 and (FGM_SMOOTH_WIN % 2 == 1):
            w = int(FGM_SMOOTH_WIN)
            k = w // 2
            sm = ranges[:]
            for i in range(nbin):
                lo = max(0, i - k)
                hi = min(nbin, i + k + 1)
                seg = sorted(ranges[lo:hi])
                sm[i] = seg[len(seg)//2]
            ranges = sm

        return ranges, angles

    def _fgm_apply_bubble(self, ranges, angles):
        dmin = None
        imin = None
        for i, d in enumerate(ranges):
            if d <= 0:
                continue
            if dmin is None or d < dmin:
                dmin = d
                imin = i

        if dmin is None or imin is None:
            return ranges, None, None

        bubble_deg = math.degrees(math.atan2(FGM_BUBBLE_RADIUS, max(dmin, 1e-3)))
        bubble_deg = clamp(bubble_deg, FGM_BUBBLE_MIN_DEG, FGM_BUBBLE_MAX_DEG)

        a0 = angles[imin]
        lo = a0 - bubble_deg
        hi = a0 + bubble_deg

        out = ranges[:]
        for i, a in enumerate(angles):
            if lo <= a <= hi:
                out[i] = 0.0
        return out, dmin, a0

    def _fgm_find_max_gap(self, ranges, angles):
        n = len(ranges)
        clear = [1 if r >= FGM_CLEAR_TH else 0 for r in ranges]

        best = None
        best_len = 0

        i = 0
        while i < n:
            if clear[i] == 0:
                i += 1
                continue
            j = i
            while j < n and clear[j] == 1:
                j += 1
            gap_deg = angles[j-1] - angles[i] if (j-1) >= i else 0.0
            if gap_deg >= FGM_MIN_GAP_DEG and (j - i) > best_len:
                best_len = (j - i)
                best = (i, j - 1)
            i = j

        return best

    def _fgm_pick_target(self, ranges, angles, gap):
        i0, i1 = gap
        if FGM_TARGET.upper() == "MID":
            im = (i0 + i1) // 2
            return angles[im], ranges[im]
        else:
            best_d = -1.0
            best_i = None
            mid = 0.5 * (i0 + i1)
            for i in range(i0, i1 + 1):
                d = ranges[i]
                if d > best_d + 1e-9:
                    best_d = d
                    best_i = i
                elif abs(d - best_d) <= 1e-9 and best_i is not None:
                    if abs(i - mid) < abs(best_i - mid):
                        best_i = i
            if best_i is None:
                best_i = (i0 + i1) // 2
                best_d = ranges[best_i]
            return angles[best_i], best_d

    def _fgm_control(self):
        now = time.monotonic()

        ranges, angles = self._fgm_build_ranges()
        ranges2, dmin, amin = self._fgm_apply_bubble(ranges, angles)
        gap = self._fgm_find_max_gap(ranges2, angles)

        if gap is None:
            best_i = max(range(len(ranges2)), key=lambda i: ranges2[i])
            tgt_deg = angles[best_i]
            steer = clamp(KP_GAP_ANGLE * math.radians(tgt_deg), -MAX_STEER, MAX_STEER)

            v = TURN_SPEED
        
            # --- ここを置換 ---
            # left = v * (1.0 - steer)
            # right = v * (1.0 + steer)

            left, right = mix_with_pivot(v, steer)

            m = max(left, right)
            if m > SPEED_MAX:
                k = SPEED_MAX / m
                left *= k
                right *= k

            ls, rs = apply_speed_limits(left), apply_speed_limits(right)

            if self.dbg.level >= 1:
                self.dbg.sample(
                    f"FGM NOGAP "
                    f"F{fmt(self.d_front,2)} "
                    f"dmin{fmt(dmin,2)} "
                    f"tgt{fmt(tgt_deg,1)} "
                    f"s{fmt(steer,3)} v{fmt(v,2)} "
                    f"cmd{fmt(ls,2)},{fmt(rs,2)}",
                    now
                )
            with self._status_lock:
                self._status.update({"mode": self.mode, "d_front": self.d_front,
                                     "steer": steer, "left": ls, "right": rs,
                                     "tgt_deg": tgt_deg, "dmin": dmin,
                                     "gap_width": None, "ts": time.time()})
            return (ls, rs)

        tgt_deg, tgt_dist = self._fgm_pick_target(ranges2, angles, gap)
        self._last_target_deg = tgt_deg

        tgt_rad = math.radians(tgt_deg)
        steer = clamp(KP_GAP_ANGLE * tgt_rad, -MAX_STEER, MAX_STEER)

        front = self.d_front if self.d_front is not None else MAX_VALID
        front_eff = min(front, tgt_dist if tgt_dist is not None else MAX_VALID)

        front_drop = 0.0
        if front_eff < FRONT_SLOW:
            front_drop = clamp((FRONT_SLOW - front_eff) / max(FRONT_SLOW - FRONT_STOP, 1e-3), 0.0, 1.0)

        v = BASE_SPEED
        v *= (1.0 - SPEED_STEER_DROP * min(1.0, abs(steer)))
        v *= (1.0 - SPEED_FRONT_DROP * front_drop)

        if front_eff < FRONT_STOP:
            v = min(v, TURN_SPEED)

        v = clamp(v, 0.0, SPEED_MAX)

        # left = v * (1.0 - steer)
        # right = v * (1.0 + steer)

        left, right = mix_with_pivot(v, steer)

        m = max(left, right)
        if m > SPEED_MAX:
            k = SPEED_MAX / m
            left *= k
            right *= k

        ls, rs = apply_speed_limits(left), apply_speed_limits(right)

        if self.dbg.level >= 1:
            i0, i1 = gap
            gap_w = angles[i1] - angles[i0]
            self.dbg.sample(
                f"FGM "
                f"F{fmt(front_eff,2)}(raw{fmt(front,2)}) "
                f"dmin{fmt(dmin,2)} aMin{fmt(amin,1)} "
                f"gap[{fmt(angles[i0],1)}..{fmt(angles[i1],1)}|w{fmt(gap_w,1)}] "
                f"tgt{fmt(tgt_deg,1)} d{fmt(tgt_dist,2)} "
                f"s{fmt(steer,3)} v{fmt(v,2)} "
                f"cmd{fmt(ls,2)},{fmt(rs,2)}",
                now
            )

        if self.dbg.level >= 2:
            half = FGM_FOV_DEG * 0.5

            def pick_deg(deg):
                idx = int(round((deg + half) / FGM_BIN_DEG))
                if 0 <= idx < len(ranges2):
                    return ranges2[idx]
                return None

            self.dbg.sample(
                f"R "
                f"L60{fmt(pick_deg(+60),2)} L30{fmt(pick_deg(+30),2)} "
                f"F0{fmt(pick_deg(0),2)} "
                f"R30{fmt(pick_deg(-30),2)} R60{fmt(pick_deg(-60),2)}",
                now
            )

        i0, i1 = gap
        gap_w = angles[i1] - angles[i0]
        with self._status_lock:
            self._status.update({"mode": self.mode, "d_front": self.d_front,
                                 "steer": steer, "left": ls, "right": rs,
                                 "tgt_deg": tgt_deg, "dmin": dmin,
                                 "gap_width": gap_w, "ts": time.time()})
        return (ls, rs)

    def loop(self):
        while True:
            with self.lock:
                if not self.running:
                    break
                mode = self.mode

            if mode != "RUN":
                self.motor.stop()
                time.sleep(0.05)
                continue

            ok = self._update_scan()
            if not ok:
                self.motor.stop()
                self.dbg.sample("SCAN_FAIL -> STOP", time.monotonic())
                time.sleep(0.05)
                continue

            if FGM_ENABLE:
                ls, rs = self._fgm_control()
            else:
                ls, rs = (apply_speed_limits(BASE_SPEED), apply_speed_limits(BASE_SPEED))

            self.motor.set_drive(ls, rs)
            time.sleep(0.01)


# ==========================================
# 5) キーボード（SSHでの緊急停止・終了）
# ==========================================
def keyboard_loop(ap: AutoPilot):
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        while True:
            r, _, _ = select.select([fd], [], [], 0.10)
            if not r:
                with ap.lock:
                    if not ap.running:
                        break
                continue

            key = sys.stdin.read(1).lower()

            if key == 'g':
                ap.set_armed(True)
                print("\n[AUTO] 受付開始 — Vercel UI の START で走行開始", flush=True)

            elif key == 's' or key == ' ':
                ap.set_mode("PAUSE")
                print("\n[AUTO] 緊急停止", flush=True)

            elif key == 'q':
                ap.request_quit()
                print("\n[AUTO] QUIT", flush=True)
                break

            elif key == 'd':
                on = ap.dbg.toggle()
                print(f"\n[DBG] enable={on}", flush=True)

            elif key in ('1', '2', '3'):
                ap.dbg.set_level(int(key))
                print(f"\n[DBG] level={key}", flush=True)

            elif key == 'p':
                ap.dbg.dump(40)

    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


# ==========================================
# 6) main
# ==========================================
def main():
    # ---- Vercel API 接続 ----
    _server_url = os.environ.get("PARAM_SERVER_URL", "").rstrip("/")

    print("=== 自動運転 (LiDAR + PWM) : Follow the Gap ===")
    if _server_url:
        _api_ok = test_api_connection(_server_url)
        if _api_ok:
            fetch_and_apply_params(_server_url)
        else:
            print("[API] 接続失敗のためローカルパラメータを使用", flush=True)
    else:
        print("[API] PARAM_SERVER_URL 未設定 → ローカルパラメータを使用")
        print("      (設定例: export PARAM_SERVER_URL=https://param4ad.vercel.app)")

    print(f"FORWARD_DEG   = {FORWARD_DEG}")
    print(f"FGM_FOV_DEG   = {FGM_FOV_DEG}")
    print(f"FGM_CLEAR_TH  = {FGM_CLEAR_TH}")
    print(f"BUBBLE_RADIUS = {FGM_BUBBLE_RADIUS}")
    print(f"BASE_SPEED    = {BASE_SPEED}")
    if _server_url:
        print("コマンド: Vercel UI の START/STOP、または g/s キー")
    else:
        print("g: 開始  s/Space: 停止  q: 終了  d:debug  1/2/3:level  p:dump")
    print("================================================")

    laser = None
    with MotorDriver() as motor:  # __exit__ で GPIO.cleanup() を保証
        try:
            laser = init_lidar()
            ap = AutoPilot(motor, laser)

            th = threading.Thread(target=ap.loop, daemon=True)
            th.start()

            # Vercel コマンドポーリングスレッド
            if _server_url:
                cmd_th = threading.Thread(
                    target=poll_command, args=(ap, _server_url), daemon=True
                )
                cmd_th.start()
                print(f"[API] poll_command スレッド開始 (1秒ごとに {_server_url}/api/command をチェック)", flush=True)

            ap.set_mode("PAUSE")
            keyboard_loop(ap)

        except KeyboardInterrupt:
            print("\n停止操作を受信", flush=True)
        finally:
            if laser is not None:
                try:
                    laser.turnOff()
                    laser.disconnecting()
                except Exception:
                    pass


if __name__ == "__main__":
    main()
