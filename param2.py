#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
param2.py — LiDAR + PWM 自動運転（Follow the Gap）ロバスト版
param1.py からの変更点:
  1. デフォルトパラメータをロバスト走行向けに調整（速度+20%、障害物余裕拡大）
  2. _fgm_apply_bubble: 全近傍点バブル（BUBBLE_RADIUS*3以内の全点）
  3. _fgm_find_max_gap: ギャップスコア = 幅 × 深度（浅いギャップを排除）
  4. _fgm_pick_target: FARモードで端10%を除外（壁際を狙わない）
  5. _fgm_control: ステア→速度低下を steer^1.5 カーブに（緩カーブは速く）
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
# 0) 運用パラメータ（ロバスト走行向けに調整）
# ==========================================
FORWARD_DEG = 0.0

# ===== LiDAR取り付けオフセット =====
LIDAR_DX = 0.18
LIDAR_DY = 0.00

# ===== Follow-the-Gap 設定 =====
FGM_ENABLE = True

FGM_FOV_DEG      = 90.0   # 前方視野角
FGM_BIN_DEG      = 2.0    # 角度ビン幅
FGM_SMOOTH_WIN   = 9      # 平滑化窓（奇数）

FGM_CLEAR_TH     = 1.5    # 壁判定距離（param1: 1.4 → 安全側に拡大）
FGM_MIN_GAP_DEG  = 4.0    # ギャップ最小幅

FGM_BUBBLE_RADIUS  = 0.30  # バブル半径（param1: 0.27 → 衝突余裕を増やす）
FGM_BUBBLE_MIN_DEG = 4.0
FGM_BUBBLE_MAX_DEG = 25.0

FGM_TARGET    = "FAR"
KP_GAP_ANGLE  = 1.0       # ステアリング係数（param1: 0.9 → なめらかに曲がる）

MAX_STEER = 0.85

# 速度（param1より+20%、でも制御できる範囲）
BASE_SPEED       = 0.60
SPEED_MIN        = 0.0
SPEED_MAX        = 0.60
TURN_SPEED       = 0.40   # 旋回中も止まらない（param1: 0.475）

# 速度制御（steer^1.5カーブと組み合わせてカーブで確実に減速）
SPEED_STEER_DROP = 0.25   # param1: 0.1 → カーブ減速を強める
SPEED_FRONT_DROP = 0.45   # 前方障害物への減速
FRONT_SLOW       = 0.90 + LIDAR_DX   # 早めに減速開始（param1: 0.55+LIDAR_DX）
FRONT_STOP       = 0.2 + LIDAR_DX

# ===== 片輪停止設定 =====
PIVOT_ENABLE    = True
PIVOT_STEER_TH  = 0.98
PIVOT_SOFT_TH   = 0.90
PIVOT_MIN_SPEED = 0.0

# 計測レンジのバリデーション
SIDE_MIN_VALID = 0.003
MAX_VALID      = 12.0

# 前方距離のEMA
EMA_ALPHA        = 0.45
FRONT_WINDOW_DEG = 4

# LiDAR設定
LIDAR_PORT = "/dev/ttyUSB0"
LIDAR_BAUD = 230400

# PWM設定
MOTOR_FREQ      = 300
SPEED_CMD_SCALE = 1.1

# GPIOピン
PWMA, AIN1, AIN2 = 13, 21, 20
PWMB, BIN1, BIN2 = 16, 26, 19


# ==========================================
# Vercel API 連携
# ==========================================
_params_lock = threading.Lock()


def test_api_connection(url: str) -> bool:
    print(f"[API] ===== 接続テスト =====", flush=True)
    print(f"[API] URL: {url}", flush=True)
    all_ok = True

    for path in ("params", "command"):
        endpoint = f"{url}/api/{path}"
        try:
            req = urllib.request.Request(endpoint, headers={"User-Agent": "raspi-ftg/1.0"})
            with urllib.request.urlopen(req, timeout=5) as r:
                d = json.loads(r.read())
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
    def odd(v):      v = int(v); return v if v % 2 == 1 else v + 1

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
        FGM_SMOOTH_WIN     = odd(flt("FGM_SMOOTH_WIN",  FGM_SMOOTH_WIN))
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

    return before != after


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


def register_robot(url: str, robot_id: str, robot_name: str) -> None:
    try:
        body = json.dumps({"id": robot_id, "name": robot_name}).encode()
        req = urllib.request.Request(
            f"{url}/api/robots", data=body,
            headers={"Content-Type": "application/json", "User-Agent": "raspi-ftg/1.0"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
        print(f"[API] ロボット登録: id={robot_id} name={robot_name}", flush=True)
    except Exception as e:
        print(f"[API] ロボット登録失敗: {e}", flush=True)


def fetch_and_apply_params(url: str, robot_id: str) -> None:
    endpoint = f"{url}/api/params?robot={robot_id}"
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
    def _do():
        with ap._status_lock:
            data = dict(ap._status)
        with ap.lock:
            data["mode"] = ap.mode
            data["armed"] = ap.armed
        data["ts"] = time.time()
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


def poll_command(ap, url: str, robot_id: str) -> None:
    cmd_endpoint    = f"{url}/api/command?robot={robot_id}"
    param_endpoint  = f"{url}/api/params?robot={robot_id}"
    status_endpoint = f"{url}/api/status?robot={robot_id}"
    print(f"[API] poll_command started  cmd={cmd_endpoint}", flush=True)

    _last_cmd        = None
    _last_params_raw = b""
    _ok_count        = 0
    _err_count       = 0
    _tick            = 0

    while True:
        with ap.lock:
            if not ap.running:
                ap.dbg.log("[API] 終了")
                break

        _tick += 1

        try:
            req = urllib.request.Request(cmd_endpoint, headers={"User-Agent": "raspi-ftg/1.0"})
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

            if _ok_count % 100 == 0:
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

        with ap.lock:
            is_paused = (ap.mode == "PAUSE")

        if is_paused and _tick % 10 == 0:
            try:
                req = urllib.request.Request(param_endpoint, headers={"User-Agent": "raspi-ftg/1.0"})
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

        _post_status_async(ap, status_endpoint)
        time.sleep(0.3)


# ==========================================
# DEBUG 設定
# ==========================================
DBG_ENABLE = True
DBG_HZ     = 10.0
DBG_LEVEL  = 2
DBG_RING_N = 300


# ==========================================
# 1) 角度・距離ユーティリティ
# ==========================================
def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

def ema(prev, new, alpha):
    if new is None: return prev
    if prev is None: return new
    return alpha * new + (1.0 - alpha) * prev

def apply_speed_limits(v):
    if v <= 0.0: return 0.0
    return clamp(v, SPEED_MIN, SPEED_MAX)

def mix_with_pivot(v, steer):
    left  = v * (1.0 - steer)
    right = v * (1.0 + steer)

    if not PIVOT_ENABLE:
        return left, right

    s = abs(steer)
    if s <= PIVOT_SOFT_TH:
        w = 0.0
    elif s >= PIVOT_STEER_TH:
        w = 1.0
    else:
        w = (s - PIVOT_SOFT_TH) / max(PIVOT_STEER_TH - PIVOT_SOFT_TH, 1e-6)

    if steer > 0:
        left_p, right_p = 0.0, max(v, PIVOT_MIN_SPEED)
    else:
        left_p, right_p = max(v, PIVOT_MIN_SPEED), 0.0

    left  = (1.0 - w) * left  + w * left_p
    right = (1.0 - w) * right + w * right_p
    return left, right

def rel_deg_from_forward(abs_deg):
    return (abs_deg - FORWARD_DEG + 360.0) % 360.0

def rel_deg_to_signed(rel_deg):
    return (rel_deg + 180.0) % 360.0 - 180.0

def fmt(x, nd=3):
    if x is None: return "None"
    try: return f"{float(x):.{nd}f}"
    except Exception: return str(x)

def lidar_point_to_axle_polar(dist_m, abs_deg):
    th = math.radians(abs_deg)
    x_a = dist_m * math.cos(th) + LIDAR_DX
    y_a = dist_m * math.sin(th) + LIDAR_DY
    dist_a = math.hypot(x_a, y_a)
    abs_a_deg = (math.degrees(math.atan2(y_a, x_a)) + 360.0) % 360.0
    rel = rel_deg_from_forward(abs_a_deg)
    signed = rel_deg_to_signed(rel)
    return dist_a, signed


# ==========================================
# 1.5) DEBUG ロガー
# ==========================================
class DebugLog:
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
        if self.one_line:
            self._clear_line()
            sys.stdout.write(line + "\n")
            if self._last_status:
                sys.stdout.write(self._last_status)
            sys.stdout.flush()
        else:
            print(line, flush=True)

    def log(self, msg: str):
        with self._lock:
            self.ring.append(msg)
        self._print_above(msg)

    def event(self, msg: str):
        with self._lock:
            if not self.enable: return
            s = f"[EVT] {msg}"
            self.ring.append(s)
        self._print_above(s)

    def sample(self, msg: str, now: float):
        with self._lock:
            if not self.enable: return
            period = 1.0 / max(self.hz, 0.1)
            if (now - self._t_last) < period: return
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
# 2) モータ制御
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
        ls = clamp(clamp(float(left_speed), 0.0, 1.0) * float(SPEED_CMD_SCALE), 0.0, 1.0)
        rs = clamp(clamp(float(right_speed), 0.0, 1.0) * float(SPEED_CMD_SCALE), 0.0, 1.0)
        if ls > 0.0:
            GPIO.output(AIN1, 1); GPIO.output(AIN2, 0)
            self.pwmL.ChangeDutyCycle(ls * 100.0)
        else:
            GPIO.output(AIN1, 0); GPIO.output(AIN2, 0)
            self.pwmL.ChangeDutyCycle(0)
        if rs > 0.0:
            GPIO.output(BIN1, 1); GPIO.output(BIN2, 0)
            self.pwmR.ChangeDutyCycle(rs * 100.0)
        else:
            GPIO.output(BIN1, 0); GPIO.output(BIN2, 0)
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

    def __enter__(self): return self
    def __exit__(self, *_): self.close()


# ==========================================
# 3) LiDAR初期化
# ==========================================
def init_lidar():
    ydlidar.os_init()
    laser = ydlidar.CYdLidar()
    laser.setlidaropt(ydlidar.LidarPropSerialPort,    LIDAR_PORT)
    laser.setlidaropt(ydlidar.LidarPropSerialBaudrate, LIDAR_BAUD)
    laser.setlidaropt(ydlidar.LidarPropLidarType,      ydlidar.TYPE_TRIANGLE)
    laser.setlidaropt(ydlidar.LidarPropDeviceType,     ydlidar.YDLIDAR_TYPE_SERIAL)
    laser.setlidaropt(ydlidar.LidarPropScanFrequency,  18.0)
    laser.setlidaropt(ydlidar.LidarPropSampleRate,     4)
    laser.setlidaropt(ydlidar.LidarPropSingleChannel,  False)
    laser.setlidaropt(ydlidar.LidarPropMaxAngle,       90.0)
    laser.setlidaropt(ydlidar.LidarPropMinAngle,      -90.0)
    laser.setlidaropt(ydlidar.LidarPropMaxRange,       12.0)
    laser.setlidaropt(ydlidar.LidarPropMinRange,       0.05)
    laser.setlidaropt(ydlidar.LidarPropIntenstiy,      True)
    laser.setlidaropt(ydlidar.LidarPropAutoReconnect,  True)
    if not laser.initialize():
        raise RuntimeError("laser.initialize() が False（ポート/権限/接続を確認）")
    if not laser.turnOn():
        raise RuntimeError("laser.turnOn() が False（電源/配線/設定を確認）")
    return laser


# ==========================================
# 4) 自動運転（Follow the Gap）— ロバスト版
# ==========================================
class AutoPilot:
    def __init__(self, motor: MotorDriver, laser: ydlidar.CYdLidar):
        self.motor = motor
        self.laser = laser
        self.scan  = ydlidar.LaserScan()

        self.d_front = None
        self.mode    = "PAUSE"
        self.running = True
        self.armed   = False
        self.lock    = threading.Lock()

        self.dbg  = DebugLog(DBG_ENABLE, DBG_HZ, DBG_LEVEL, DBG_RING_N, one_line=True)
        self.fail = {"no_scan": 0}
        self._last_target_deg = 0.0

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
            if self.mode == mode: return
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
            if not (SIDE_MIN_VALID < dist < MAX_VALID): continue
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
        angles = [(-half + i * FGM_BIN_DEG) for i in range(nbin)]

        for p in self.scan.points:
            dist = float(p.range)
            if not (SIDE_MIN_VALID < dist < MAX_VALID): continue
            abs_deg = (math.degrees(p.angle) + 360.0) % 360.0
            dist_a, signed_a = lidar_point_to_axle_polar(dist, abs_deg)
            if signed_a < -half or signed_a > half: continue
            idx = int(round((signed_a + half) / FGM_BIN_DEG))
            if 0 <= idx < nbin:
                if dist_a < ranges[idx]:
                    ranges[idx] = dist_a

        if FGM_SMOOTH_WIN and FGM_SMOOTH_WIN >= 3 and (FGM_SMOOTH_WIN % 2 == 1):
            k = FGM_SMOOTH_WIN // 2
            sm = ranges[:]
            for i in range(nbin):
                seg = sorted(ranges[max(0, i-k):min(nbin, i+k+1)])
                sm[i] = seg[len(seg)//2]
            ranges = sm

        return ranges, angles

    def _fgm_apply_bubble(self, ranges, angles):
        # 改善: BUBBLE_RADIUS*3 以内の全点にバブルを張る（偽ギャップ防止）
        threshold = FGM_BUBBLE_RADIUS * 3
        out = ranges[:]
        dmin = None
        amin = None

        for i, (d, a) in enumerate(zip(ranges, angles)):
            if d <= 0:
                continue
            if dmin is None or d < dmin:
                dmin, amin = d, a
            if d < threshold:
                bubble_deg = clamp(
                    math.degrees(math.atan2(FGM_BUBBLE_RADIUS, max(d, 1e-3))),
                    FGM_BUBBLE_MIN_DEG, FGM_BUBBLE_MAX_DEG
                )
                lo, hi = a - bubble_deg, a + bubble_deg
                for j, aj in enumerate(angles):
                    if lo <= aj <= hi:
                        out[j] = 0.0

        if dmin is None:
            return ranges, None, None
        return out, dmin, amin

    def _fgm_find_max_gap(self, ranges, angles):
        # 改善: スコア = 幅 × 深度（浅いが広いギャップを排除）
        n = len(ranges)
        clear = [1 if r >= FGM_CLEAR_TH else 0 for r in ranges]

        best       = None
        best_score = 0.0

        i = 0
        while i < n:
            if clear[i] == 0:
                i += 1
                continue
            j = i
            while j < n and clear[j] == 1:
                j += 1
            gap_deg = angles[j-1] - angles[i] if (j-1) >= i else 0.0
            if gap_deg >= FGM_MIN_GAP_DEG:
                score = (j - i) * max(ranges[i:j])
                if score > best_score:
                    best_score = score
                    best = (i, j - 1)
            i = j

        return best

    def _fgm_pick_target(self, ranges, angles, gap):
        i0, i1 = gap
        if FGM_TARGET.upper() == "MID":
            im = (i0 + i1) // 2
            return angles[im], ranges[im]
        else:
            # 改善: 端10%を除外して壁際を狙わない
            margin = max(1, (i1 - i0) // 10)
            lo = min(i0 + margin, i1)
            hi = max(i1 - margin, i0)

            best_d = -1.0
            best_i = None
            mid = 0.5 * (lo + hi)
            for i in range(lo, hi + 1):
                d = ranges[i]
                if d > best_d + 1e-9:
                    best_d, best_i = d, i
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

            left, right = mix_with_pivot(v, steer)
            m = max(left, right)
            if m > SPEED_MAX:
                k = SPEED_MAX / m; left *= k; right *= k

            ls, rs = apply_speed_limits(left), apply_speed_limits(right)

            if self.dbg.level >= 1:
                self.dbg.sample(
                    f"FGM NOGAP F{fmt(self.d_front,2)} dmin{fmt(dmin,2)} "
                    f"tgt{fmt(tgt_deg,1)} s{fmt(steer,3)} v{fmt(v,2)} "
                    f"cmd{fmt(ls,2)},{fmt(rs,2)}", now)
            with self._status_lock:
                self._status.update({"mode": self.mode, "d_front": self.d_front,
                                     "steer": steer, "left": ls, "right": rs,
                                     "tgt_deg": tgt_deg, "dmin": dmin,
                                     "gap_width": None, "ts": time.time()})
            return (ls, rs)

        tgt_deg, tgt_dist = self._fgm_pick_target(ranges2, angles, gap)
        self._last_target_deg = tgt_deg

        steer = clamp(KP_GAP_ANGLE * math.radians(tgt_deg), -MAX_STEER, MAX_STEER)

        front = self.d_front if self.d_front is not None else MAX_VALID
        front_eff = min(front, tgt_dist if tgt_dist is not None else MAX_VALID)

        front_drop = 0.0
        if front_eff < FRONT_SLOW:
            front_drop = clamp(
                (FRONT_SLOW - front_eff) / max(FRONT_SLOW - FRONT_STOP, 1e-3), 0.0, 1.0)

        v = BASE_SPEED
        # 改善: steer^1.5 カーブ（緩カーブは速く、急カーブは大きく減速）
        v *= (1.0 - SPEED_STEER_DROP * min(1.0, abs(steer) ** 1.5))
        v *= (1.0 - SPEED_FRONT_DROP * front_drop)

        if front_eff < FRONT_STOP:
            v = min(v, TURN_SPEED)

        v = clamp(v, 0.0, SPEED_MAX)

        left, right = mix_with_pivot(v, steer)
        m = max(left, right)
        if m > SPEED_MAX:
            k = SPEED_MAX / m; left *= k; right *= k

        ls, rs = apply_speed_limits(left), apply_speed_limits(right)

        if self.dbg.level >= 1:
            i0, i1 = gap
            gap_w = angles[i1] - angles[i0]
            self.dbg.sample(
                f"FGM F{fmt(front_eff,2)}(raw{fmt(front,2)}) "
                f"dmin{fmt(dmin,2)} aMin{fmt(amin,1)} "
                f"gap[{fmt(angles[i0],1)}..{fmt(angles[i1],1)}|w{fmt(gap_w,1)}] "
                f"tgt{fmt(tgt_deg,1)} d{fmt(tgt_dist,2)} "
                f"s{fmt(steer,3)} v{fmt(v,2)} cmd{fmt(ls,2)},{fmt(rs,2)}", now)

        if self.dbg.level >= 2:
            half = FGM_FOV_DEG * 0.5
            def pick_deg(deg):
                idx = int(round((deg + half) / FGM_BIN_DEG))
                return ranges2[idx] if 0 <= idx < len(ranges2) else None
            self.dbg.sample(
                f"R L60{fmt(pick_deg(+60),2)} L30{fmt(pick_deg(+30),2)} "
                f"F0{fmt(pick_deg(0),2)} "
                f"R30{fmt(pick_deg(-30),2)} R60{fmt(pick_deg(-60),2)}", now)

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
                if not self.running: break
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
# 5) キーボード
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
                    if not ap.running: break
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
    _server_url = os.environ.get("PARAM_SERVER_URL", "").rstrip("/")
    _robot_id   = os.environ.get("ROBOT_ID", "default")
    _robot_name = os.environ.get("ROBOT_NAME", _robot_id)

    print(f"=== 自動運転 (LiDAR + PWM) : Follow the Gap [ロバスト版]  robot={_robot_id} ===")
    if _server_url:
        _api_ok = test_api_connection(_server_url)
        if _api_ok:
            register_robot(_server_url, _robot_id, _robot_name)
            fetch_and_apply_params(_server_url, _robot_id)
        else:
            print("[API] 接続失敗のためローカルパラメータを使用", flush=True)
    else:
        print("[API] PARAM_SERVER_URL 未設定 → ローカルパラメータを使用")

    print(f"FORWARD_DEG   = {FORWARD_DEG}")
    print(f"FGM_FOV_DEG   = {FGM_FOV_DEG}")
    print(f"FGM_CLEAR_TH  = {FGM_CLEAR_TH}  (param1: 1.4)")
    print(f"BUBBLE_RADIUS = {FGM_BUBBLE_RADIUS}  (param1: 0.27, 全近傍点バブル)")
    print(f"BASE_SPEED    = {BASE_SPEED}  (param1: 0.5)")
    print(f"SPEED_STEER_DROP = {SPEED_STEER_DROP}  (steer^1.5カーブ)")
    if _server_url:
        print("コマンド: Vercel UI の START/STOP、または g/s キー")
    else:
        print("g: 開始  s/Space: 停止  q: 終了  d:debug  1/2/3:level  p:dump")
    print("================================================")

    laser = None
    with MotorDriver() as motor:
        try:
            laser = init_lidar()
            ap = AutoPilot(motor, laser)

            th = threading.Thread(target=ap.loop, daemon=True)
            th.start()

            if _server_url:
                cmd_th = threading.Thread(
                    target=poll_command, args=(ap, _server_url, _robot_id), daemon=True
                )
                cmd_th.start()
                print(f"[API] poll_command スレッド開始", flush=True)

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
