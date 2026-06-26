# 改善タスク（アルゴリズム）

元ファイル: `todo.md`

---

## 高優先度

### 全近傍点バブル（`_fgm_apply_bubble`）

**現状**: 最近傍の1点のみにバブルを張る  
**問題**: 2つの障害物が近接しているとき、両方にバブルが張られず「実際には通れない隙間」をギャップと判定して突っ込む  
**改善**: `FGM_BUBBLE_RADIUS * 3` 以内の全点にバブルを展開する

```python
# 変更前: 最近傍1点のみ
for i, a in enumerate(angles):
    if lo <= a <= hi:
        out[i] = 0.0

# 変更後イメージ: 閾値以内の全点に対してバブルを張る
for j, d in enumerate(ranges):
    if d <= 0 or d > FGM_BUBBLE_RADIUS * 3:
        continue
    b_deg = math.degrees(math.atan2(FGM_BUBBLE_RADIUS, max(d, 1e-3)))
    b_deg = clamp(b_deg, FGM_BUBBLE_MIN_DEG, FGM_BUBBLE_MAX_DEG)
    center = angles[j]
    for i, a in enumerate(angles):
        if center - b_deg <= a <= center + b_deg:
            out[i] = 0.0
```

---

### ギャップスコア = 幅 × 深度（`_fgm_find_max_gap`）

**現状**: `best_len = j - i`（角度幅のビン数のみで比較）  
**問題**: 「広いが浅いギャップ」が「狭いが深いギャップ」に勝ち、障害物の陰のすぐ後ろに突進するリスク  
**改善**: `gap_score = (j - i) * max(ranges[i:j])` でスコアリング

```python
# 変更前
if gap_deg >= FGM_MIN_GAP_DEG and (j - i) > best_len:
    best_len = (j - i)

# 変更後
gap_score = (j - i) * max(ranges[i:j]) if j > i else 0
if gap_deg >= FGM_MIN_GAP_DEG and gap_score > best_score:
    best_score = gap_score
```

---

## 中優先度

### FAR モードのターゲットを内側80%に制限（`_fgm_pick_target`）

**現状**: ギャップ全域で最遠点を探す  
**問題**: ギャップ端（壁際）が最遠点になる場合に壁際を狙う  
**改善**: 端10%を除外する

```python
margin = max(1, (i1 - i0) // 10)
for i in range(i0 + margin, i1 - margin + 1):
    ...
```

---

### ステアリング → 速度低下を `steer^1.5` に（`_fgm_control`）

**現状**: `v *= (1.0 - SPEED_STEER_DROP * min(1.0, abs(steer)))` — リニア  
**問題**: 小さいステアでも大きく減速する  
**改善**: 緩カーブは速く、急カーブは大きく減速

```python
v *= (1.0 - SPEED_STEER_DROP * min(1.0, abs(steer) ** 1.5))
```

---

## 低優先度

### `d_front` をbinsから再利用（`_update_scan` / `_pick_window_min`）

**現状**: `_pick_window_min` が毎回全点の三角関数計算を実行  
**問題**: `_fgm_build_ranges` で既に車軸基準のビンを計算済みのため二重計算  
**改善**: `_fgm_build_ranges` の結果から前方ビン（signed_deg ≈ 0）を直接抽出して `d_front` に使う
