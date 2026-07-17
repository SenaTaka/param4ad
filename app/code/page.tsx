import { readFileSync } from "node:fs"
import path from "node:path"
import type { ReactNode } from "react"

// ビルド時に param1.py を読み込んで全文表示する（静的プリレンダリング）
const SOURCE = readFileSync(path.join(process.cwd(), "param1.py"), "utf8")

export const metadata = {
  title: "param1.py 全コード解説",
}

// ==========================================
// Python 簡易シンタックスハイライト
// ==========================================
const KEYWORDS = new Set([
  "def", "class", "return", "if", "elif", "else", "while", "for", "in",
  "not", "and", "or", "import", "from", "as", "with", "try", "except",
  "finally", "break", "continue", "pass", "global", "nonlocal", "lambda",
  "True", "False", "None", "is", "raise", "yield", "del", "assert",
])

const TOKEN_RE =
  /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/gm

function tokenizeLine(line: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index))
    const [, comment, str, num, word] = m
    const k = `${keyPrefix}-${m.index}`
    if (comment) out.push(<span key={k} className="text-gray-600 italic">{comment}</span>)
    else if (str) out.push(<span key={k} className="text-amber-300/80">{str}</span>)
    else if (num) out.push(<span key={k} className="text-purple-300">{num}</span>)
    else if (word && KEYWORDS.has(word)) out.push(<span key={k} className="text-cyan-400">{word}</span>)
    else out.push(word ?? m[0])
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

function CodeView({ source }: { source: string }) {
  const lines = source.split("\n")
  let inDoc = false
  return (
    <div className="bg-[#0b1828] border border-[#1a3048] rounded-xl overflow-x-auto">
      <pre className="text-[11px] leading-[1.5] font-mono py-3 min-w-max">
        {lines.map((line, i) => {
          const n = i + 1
          const quotes = (line.match(/"""|'''/g) ?? []).length
          const isDocLine = inDoc || quotes > 0
          if (quotes % 2 === 1) inDoc = !inDoc
          return (
            <div key={n} id={`L${n}`} className="px-3 hover:bg-white/[0.04] scroll-mt-16 flex">
              <span className="text-gray-700 select-none w-10 shrink-0 text-right pr-3">{n}</span>
              <code className="text-gray-300 whitespace-pre">
                {isDocLine
                  ? <span className="text-emerald-300/60">{line}</span>
                  : tokenizeLine(line, `l${n}`)}
                {line === "" ? " " : ""}
              </code>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

// ==========================================
// 解説用の小物コンポーネント
// ==========================================
function L({ from, to }: { from: number; to?: number }) {
  return (
    <a href={`#L${from}`} className="text-cyan-400 hover:underline font-mono text-[11px] whitespace-nowrap">
      L{from}{to ? `–${to}` : ""}
    </a>
  )
}

function C({ children }: { children: ReactNode }) {
  return <code className="text-cyan-300 bg-[#04090f] px-1 py-0.5 rounded text-[0.9em] font-mono">{children}</code>
}

function Sec({ id, title, lines, children }: { id: string; title: string; lines: string; children: ReactNode }) {
  return (
    <section id={id} className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-5 mb-4 scroll-mt-16">
      <h2 className="text-base font-bold text-white mb-1">
        <span className="text-cyan-400 font-mono mr-2">&gt;</span>{title}
        <span className="text-gray-600 text-[11px] font-mono ml-3">{lines}</span>
      </h2>
      <div className="text-[13px] leading-relaxed text-gray-300 space-y-3 mt-3">{children}</div>
    </section>
  )
}

function Fn({ name, lines, children }: { name: string; lines: ReactNode; children: ReactNode }) {
  return (
    <div className="border-l-2 border-[#1a3048] pl-3">
      <p className="font-mono text-sm text-white font-bold">{name} <span className="ml-1">{lines}</span></p>
      <div className="space-y-2 mt-1">{children}</div>
    </div>
  )
}

const TOC = [
  ["overview", "全体像とスレッド構成"],
  ["imports", "import と依存ライブラリ"],
  ["params", "セクション0: 運用パラメータ"],
  ["api", "Vercel API 連携"],
  ["utils", "セクション1: 角度・距離ユーティリティ"],
  ["debuglog", "セクション1.5: DebugLog（デバッグ表示）"],
  ["led", "セクション1.9: StatusLed（接続表示LED）"],
  ["motor", "セクション2: MotorDriver（モーター制御）"],
  ["lidar", "セクション3: init_lidar（LiDAR初期化）"],
  ["autopilot", "セクション4: AutoPilot（Follow the Gap 本体）"],
  ["keyboard", "セクション5: keyboard_loop（SSH操作）"],
  ["main", "セクション6: main（起動シーケンス）"],
] as const

export default function CodePage() {
  return (
    <main className="min-h-screen bg-[#04090f] p-4 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">
            <span className="text-cyan-400 font-mono mr-2 text-xl">&gt;</span>param1.py 全コード解説
          </h1>
          <p className="text-gray-500 text-xs font-mono">
            ラズパイで動く自動運転プログラムの全文（{SOURCE.split("\n").length}行）と詳細解説
          </p>
          <p className="text-xs font-mono mt-2">
            <a href="#code" className="text-cyan-400 hover:underline mr-4">↓ コード全文</a>
            <a href="#kaisetsu" className="text-cyan-400 hover:underline">↓ 解説</a>
          </p>
        </div>

        {/* ========== コード全文 ========== */}
        <h2 id="code" className="text-lg font-bold text-white mb-2 scroll-mt-16">
          <span className="text-cyan-400 font-mono mr-2">&gt;</span>コード全文
        </h2>
        <CodeView source={SOURCE} />

        {/* ========== 解説 ========== */}
        <h2 id="kaisetsu" className="text-lg font-bold text-white mt-10 mb-2 scroll-mt-16">
          <span className="text-cyan-400 font-mono mr-2">&gt;</span>解説
        </h2>

        {/* 目次 */}
        <nav className="bg-[#0b1828] border border-[#1a3048] rounded-xl p-4 mb-4">
          <p className="text-xs text-gray-500 font-mono mb-2">目次</p>
          <ol className="text-[13px] space-y-1 list-decimal list-inside">
            {TOC.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="text-cyan-400 hover:underline">{label}</a></li>
            ))}
          </ol>
        </nav>

        <Sec id="overview" title="全体像とスレッド構成" lines="">
          <p>
            このプログラムは <strong className="text-white">LiDAR（レーザー距離センサー）で周囲を見て、いちばん広い隙間（ギャップ）に向かって走る</strong>「Follow the Gap」方式の自動運転プログラムです。
            同時に Vercel の Web UI と通信して、パラメータの受信・START/STOP コマンドの受信・走行状態の送信を行います。
          </p>
          <p>複数の処理を止めずに同時に動かすため、スレッドを分けています:</p>
          <div className="overflow-x-auto">
            <table className="text-xs font-mono border-collapse w-full">
              <thead><tr className="text-gray-500 border-b border-[#1a3048]">
                <th className="text-left py-1 pr-3">スレッド</th><th className="text-left py-1 pr-3">仕事</th><th className="text-left py-1">周期</th>
              </tr></thead>
              <tbody className="text-gray-300">
                <tr className="border-b border-[#1a3048]/50"><td className="py-1 pr-3">メイン</td><td className="py-1 pr-3">keyboard_loop（キー操作・終了待ち）</td><td className="py-1">イベント駆動</td></tr>
                <tr className="border-b border-[#1a3048]/50"><td className="py-1 pr-3">ap.loop</td><td className="py-1 pr-3">LiDAR読取 → FTG計算 → モーター出力</td><td className="py-1">10ms</td></tr>
                <tr className="border-b border-[#1a3048]/50"><td className="py-1 pr-3">poll_command</td><td className="py-1 pr-3">Vercel からコマンド/パラメータ取得</td><td className="py-1">0.3秒</td></tr>
                <tr className="border-b border-[#1a3048]/50"><td className="py-1 pr-3">_post_status_async</td><td className="py-1 pr-3">ステータス送信（都度スレッド生成）</td><td className="py-1">非同期</td></tr>
                <tr><td className="py-1 pr-3">StatusLed._loop</td><td className="py-1 pr-3">接続状態のLED点灯/点滅</td><td className="py-1">0.2〜0.3秒</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            スレッド間で共有する変数（<C>mode</C> / <C>armed</C> / <C>running</C> やパラメータ群）は、
            <C>threading.Lock</C>（<C>ap.lock</C>、<C>_params_lock</C>、<C>_status_lock</C>）で守って読み書きします。
            ロックなしで複数スレッドが同時に書き込むと値が壊れる可能性があるためです。
          </p>
        </Sec>

        <Sec id="imports" title="import と依存ライブラリ" lines="L22–34">
          <p>
            標準ライブラリのほか、ラズパイ実機でしか動かない2つのライブラリを使います（<L from={33} to={34} />）:
            <C>ydlidar</C>（YDLiDAR 公式SDKのPythonバインディング）と <C>RPi.GPIO</C>（GPIOピン制御）。
            このためこのファイルは PC 上では実行できません。
            <C>termios</C> / <C>tty</C> / <C>select</C>（<L from={28} to={30} />）は SSH 端末で1文字ずつキー入力を読むため、
            <C>urllib.request</C>（<L from={31} />）は Vercel API との HTTP 通信のために使います（外部パッケージ不要の標準ライブラリだけで通信）。
          </p>
        </Sec>

        <Sec id="params" title="セクション0: 運用パラメータ" lines="L38–111">
          <p>
            走りを決めるパラメータがすべてグローバル変数として定義されています。ここに書いてある値は<strong className="text-white">初期値</strong>で、
            起動後に Web UI から送られてくる値で上書きされます（<a href="#api" className="text-cyan-400 hover:underline">_apply_params_from_dict</a>）。
            各パラメータの意味は <a href="/params-table" className="text-cyan-400 hover:underline">/params-table</a> のカッコ書きも参照。
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><L from={41} /> <C>FORWARD_DEG</C>: LiDAR の 0° がロボットの「前」からズレている分の補正角。取り付け向きのキャリブレーション用。</li>
            <li><L from={45} to={46} /> <C>LIDAR_DX/DY</C>: LiDAR がタイヤ車軸から前に 18cm ずれて付いているための座標補正。</li>
            <li><L from={51} to={64} /> FTG 系: 視野角・ビン幅・平滑化・壁判定距離・最小ギャップ幅・バブル半径など。</li>
            <li><L from={70} to={79} /> 速度系: 注目は <L from={78} to={79} /> — <C>FRONT_SLOW/FRONT_STOP</C> の初期値は <C>0.55 + LIDAR_DX</C> のように LiDAR オフセット込みで計算されている（ただし API から来る値でそのまま上書きされる）。</li>
            <li><L from={89} to={90} /> <C>SIDE_MIN_VALID/MAX_VALID</C>: 距離データの有効範囲（3mm〜12m）。範囲外は計測ノイズとして捨てる。</li>
            <li><L from={97} to={98} /> LiDAR のシリアルポートとボーレート。</li>
            <li><L from={101} to={102} /> <C>MOTOR_FREQ</C>=300Hz（高周波だと不安定になることを実験で確認済み）、<C>SPEED_CMD_SCALE</C>=PWMデューティへの最終倍率。</li>
            <li><L from={105} to={106} /> GPIO ピン割り当て: 左モーター PWMA=13/AIN1=21/AIN2=20、右モーター PWMB=16/BIN1=26/BIN2=19（BCM番号）。</li>
            <li><L from={111} /> <C>LED_PIN</C>=12: ネットワーク接続状態を示すLED。使わない場合は <C>None</C>。</li>
          </ul>
        </Sec>

        <Sec id="api" title="Vercel API 連携" lines="L114–461">
          <p>
            Web UI（https://param4ad.vercel.app）との通信部分。チームは環境変数 <C>TEAM</C>（<L from={121} />、デフォルト &quot;a&quot;）、
            ロボットIDは <C>ROBOT_ID</C>（デフォルト &quot;default&quot;）で決まり、全エンドポイントに <C>?robot=&amp;team=</C> が付きます。
          </p>

          <Fn name="get_ip()" lines={<L from={126} to={141} />}>
            <p>
              自分のローカルIPアドレスを調べる関数。<C>8.8.8.8</C> に UDP ソケットを「接続」すると（UDPなので実際にパケットは飛ばない）、
              OS が経路選択をして自分側のIPが決まる、という定番テクニックを使っています。ネット未接続なら <C>None</C>。
            </p>
          </Fn>

          <Fn name="wait_for_network()" lines={<L from={144} to={166} />}>
            <p>
              起動直後にネットワーク接続を最大60秒待つ。待っている間は LED を点滅（blink）、つながったら点灯（on）。
              タイムアウトしたらオフラインのまま続行します（後述のリトライスレッドが再接続を試みる）。
            </p>
          </Fn>

          <Fn name="reset_command_to_pause()" lines={<L from={169} to={182} />}>
            <p>
              <strong className="text-white">誤発進防止の安全装置。</strong>サーバーには前回走行時の「RUN」コマンドが残っていることがあり、
              そのままポーリングを始めるといきなり走り出してしまう。そこで起動時に必ずコマンドを PAUSE に上書きします。
            </p>
          </Fn>

          <Fn name="test_api_connection()" lines={<L from={185} to={212} />}>
            <p><C>/api/params</C> と <C>/api/command</C> の両方に GET して疎通確認し、結果をログに出す。どちらか失敗なら <C>False</C>。</p>
          </Fn>

          <Fn name="_apply_params_from_dict()" lines={<L from={215} to={289} />}>
            <p>
              API から受け取った JSON（dict）を約30個のグローバル変数に反映する中心関数。仕組み:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><L from={227} to={230} /> 型変換ヘルパー: <C>flt()</C>=float化、<C>bln()</C>=bool化、<C>s()</C>=str化。キーが無ければ現在値を維持。<C>odd()</C> は偶数を+1して奇数に強制（中央値フィルタの窓幅は奇数が必要なため）。</li>
              <li><L from={232} /> <C>_params_lock</C> の中で書き込む — 走行ループが読んでいる最中の書き換えと衝突しないように。</li>
              <li><L from={233} to={243} /> 変更前の全値をタプル <C>before</C> に保存 → 反映 → <C>after</C> と比較（<L from={289} />）。<strong className="text-white">戻り値 True = 何かが変わった</strong>。この仕組みがあるので「変わったときだけログを出す」ことができる。新パラメータを追加するとき before/after の両方に入れ忘れると変化検出が壊れる点に注意。</li>
            </ul>
          </Fn>

          <Fn name="register_robot() / fetch_and_apply_params()" lines={<><L from={307} to={319} /> / <L from={322} to={337} /></>}>
            <p>
              起動時に <C>/api/robots</C> へ自分の id/name を POST して Web UI のロボット一覧に登録し、
              <C>/api/params</C> から初期パラメータを取得して反映します。
            </p>
          </Fn>

          <Fn name="_post_status_async()" lines={<L from={342} to={361} />}>
            <p>
              走行状態（mode / d_front / steer / 左右出力 / LiDARエラーなど）を <C>/api/status</C> に POST する。
              ポイントは<strong className="text-white">毎回使い捨てのデーモンスレッドで送る</strong>こと — 通信が遅くても
              poll_command のループ（0.3秒周期）を止めません。失敗しても無視（<C>except: pass</C>）。
              <C>ts</C> は送信時刻で常に上書きするので、Web UI 側は「10秒以内に ts 更新あり=オンライン」と判定できます。
            </p>
          </Fn>

          <Fn name="poll_command()" lines={<L from={364} to={461} />}>
            <p>専用デーモンスレッドで回る通信のメインループ。0.3秒ごとに1周し、1周で3つの仕事をします:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-white">① コマンド取得</strong>（<L from={386} to={433} />）: <C>/api/command</C> を GET。
                <C>QUIT</C> なら終了、<C>RUN</C>/<C>PAUSE</C> ならモード切替。ただし <C>armed=False</C> の間はすべて無視（<L from={415} to={416} />）—
                <C>g</C> キーを押すまで Web UI から動かせない安全設計。通信成功で LED 点灯、3回連続失敗で点滅（<L from={424} to={425} />）。</li>
              <li><strong className="text-white">② パラメータ取得</strong>（<L from={439} to={456} />）: <strong className="text-white">PAUSE 中だけ</strong>、10周に1回（約3秒ごと）<C>/api/params</C> を GET。
                走行中にパラメータが変わると挙動が急変して危険なため、RUN 中は取得しない。
                生のレスポンスバイト列を前回と比較して（<L from={447} />）、変わったときだけ JSON パース→反映する省力設計。</li>
              <li><strong className="text-white">③ ステータス送信</strong>（<L from={459} />）: 毎周 <C>_post_status_async</C> を呼ぶ。</li>
            </ul>
          </Fn>
        </Sec>

        <Sec id="utils" title="セクション1: 角度・距離ユーティリティ" lines="L473–567">
          <Fn name="clamp / circ_diff_deg / ema" lines={<L from={476} to={488} />}>
            <p>
              <C>clamp(x, lo, hi)</C> は値を範囲内に収める。<C>circ_diff_deg</C> は角度の差を 0〜180° で返す（359°と1°の差=2°）。
              <C>ema</C> は指数移動平均 — <C>alpha×新値 + (1-alpha)×前回値</C> でセンサー値のガタつきをならす。前方距離の平滑化に使用。
            </p>
          </Fn>
          <Fn name="apply_speed_limits()" lines={<L from={490} to={494} />}>
            <p>速度に上下限をかける。0 は「停止」としてそのまま許し、0より大きいときだけ <C>SPEED_MIN..SPEED_MAX</C> に収める。</p>
          </Fn>
          <Fn name="mix_with_pivot()" lines={<L from={496} to={530} />}>
            <p>
              操舵量 <C>steer</C>（-1〜+1、+が左）から左右タイヤの速度を作る関数。基本は差動操舵
              <C>left = v(1-steer), right = v(1+steer)</C>（<L from={503} to={504} />）ですが、これだけでは急カーブを曲がりきれないため
              「片輪停止（ピボット）旋回」を混ぜます:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><L from={512} to={517} /> |steer| が <C>PIVOT_SOFT_TH</C>(0.90) 以下なら通常走行（重み w=0）、<C>PIVOT_STEER_TH</C>(0.98) 以上なら完全片輪停止（w=1）、その間は線形に補間。</li>
              <li><L from={521} to={524} /> 左に曲がるなら左輪を止めて右輪だけ回す（その場でクルッと回る動き）。</li>
              <li><L from={527} to={528} /> 通常差動とピボットを w で線形合成 — 急にカクッと切り替わらず滑らかに移行する。</li>
            </ul>
          </Fn>
          <Fn name="lidar_point_to_axle_polar()" lines={<L from={549} to={567} />}>
            <p>
              このプログラムの座標系の要。LiDAR が観測した点（距離, 絶対角）を一度 XY 座標に直し（<L from={555} to={557} />）、
              LiDAR の取り付けオフセット <C>LIDAR_DX/DY</C> を足して<strong className="text-white">車軸中心から見た座標</strong>に変換（<L from={559} to={560} />）、
              再び極座標に戻します。さらに <C>rel_deg_from_forward</C>（<L from={533} />）で <C>FORWARD_DEG</C> 補正をかけ、
              <C>rel_deg_to_signed</C>（<L from={537} />）で「前=0°、左=+、右=−」の符号付き角度にします。
              これをしないと「LiDAR から 30cm」と「タイヤから 30cm」を混同してブレーキ距離がズレます。
            </p>
          </Fn>
        </Sec>

        <Sec id="debuglog" title="セクション1.5: DebugLog（デバッグ表示）" lines="L570–672">
          <p>
            SSH 画面に走行状態を見やすく出すためのロガー。工夫は「1行固定更新」— 高頻度の数値ステータス（<C>sample()</C>、<L from={633} to={653} />）は
            ANSI エスケープ <C>\r\033[2K</C>（行頭復帰+行消去、<L from={599} to={600} />）で同じ行を上書きし続け、画面がスクロールで流れないようにします。
            イベントや API ログ（<C>log()</C> / <C>event()</C>、<L from={618} to={631} />）はステータス行をいったん消してその上に改行出力→ステータス行を復元。
            すべてのログは <C>deque(maxlen=300)</C> のリングバッファ（<L from={583} />）に貯まり、<C>p</C> キーの <C>dump()</C>（<L from={655} to={672} />）で直近分をまとめて確認できます。
            <C>sample()</C> は <C>hz</C>（10Hz）で出力頻度を絞るので、10msループから毎回呼んでも端末が溢れません。
          </p>
        </Sec>

        <Sec id="led" title="セクション1.9: StatusLed（接続表示LED）" lines="L675–726">
          <p>
            GPIO 12 の LED でネットワーク状態を表示する小さなデーモンスレッド。状態は3つ: <C>off</C>（消灯）/
            <C>blink</C>（0.3秒間隔の点滅=接続待ち・通信エラー）/ <C>on</C>(点灯=接続OK)。
            <C>set()</C> で状態を変えるだけで、実際の点滅は <C>_loop()</C>（<L from={701} to={719} />）が回し続けます。
            GPIO.cleanup() 後に GPIO 操作すると例外になるため、例外が出たらループを抜ける作りです（<L from={717} to={719} />）。
          </p>
        </Sec>

        <Sec id="motor" title="セクション2: MotorDriver（モーター制御）" lines="L729–786">
          <p>
            差動2輪モーターを PWM で駆動するクラス。コンストラクタ（<L from={733} to={743} />）で6本のGPIOピンを出力に設定し、
            PWMA/PWMB に 300Hz の PWM を duty 0% で開始します。
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><C>set_drive(left, right)</C>（<L from={745} to={769} />）: 0〜1 の速度指令を受け、<C>SPEED_CMD_SCALE</C>(1.1) を掛けてから再度 0〜1 にクランプ（<L from={746} to={749} /> — PWM duty が100%を超えない保証）、duty% に変換して出力。AIN1/AIN2（方向ピン）は前進固定で、速度0なら両方 LOW にして空転停止。<strong className="text-white">後退はできない設計</strong>です。</li>
            <li><C>close()</C>（<L from={774} to={780} />）: 停止→PWM停止→<C>GPIO.cleanup()</C>。<C>__enter__/__exit__</C>（<L from={782} to={786} />）があるので <C>with MotorDriver() as motor:</C> と書け、プログラムがどう終わってもモーターが確実に止まります（LEDピンの解放もここで一括）。</li>
          </ul>
        </Sec>

        <Sec id="lidar" title="セクション3: init_lidar（LiDAR初期化）" lines="L789–819">
          <p>
            YDLiDAR を SDK 経由で初期化します。主な設定: シリアルポート <C>/dev/ttyUSB0</C>・230400bps、三角測距タイプ、
            スキャン周波数 18Hz（実測は約12Hzにフォールバック）、<strong className="text-white">角度範囲 -90°〜+90°</strong>（<L from={805} to={806} /> — 前方半分だけスキャンして無駄を省く）、
            距離範囲 0.05〜12m、自動再接続ON。<C>initialize()</C> か <C>turnOn()</C> が失敗したら例外を投げます（<L from={814} to={817} /> —
            ポート権限・電源・配線をチェックするヒント付き）。この例外は main 側で捕まえて「LiDARなし継続モード」に入ります。
          </p>
        </Sec>

        <Sec id="autopilot" title="セクション4: AutoPilot（Follow the Gap 本体）" lines="L822–1168">
          <p>自動運転の頭脳。状態（mode/armed/running）と走行ループ、FTG アルゴリズムの全段階を持ちます。</p>

          <Fn name="__init__ / set_armed / set_mode / request_quit" lines={<L from={826} to={874} />}>
            <p>
              <C>mode</C>（&quot;RUN&quot;/&quot;PAUSE&quot;）、<C>armed</C>（Web UIコマンド受付フラグ）、<C>running</C>（全スレッドの生存フラグ）を持ち、
              すべて <C>self.lock</C> 越しに読み書き。<C>_status</C> dict（<L from={845} to={851} />）は Web UI へ送るテレメトリの置き場で、専用の <C>_status_lock</C> で保護。
              <C>set_mode</C>（<L from={863} to={870} />）は同じモードへの再設定を無視し（motor.stop() の無駄な連呼防止）、PAUSE への遷移時は即モーター停止。
            </p>
          </Fn>

          <Fn name="_pick_window_min / _update_scan" lines={<><L from={876} to={889} /> / <L from={891} to={908} /></>}>
            <p>
              <C>_update_scan</C> は SDK から最新スキャンを取得。40回連続（約2秒）失敗すると <C>lidar_error</C> をステータスに立てて Web UI に警告表示させ（<L from={896} to={898} />）、復帰したら解除。
              成功時は <C>_pick_window_min</C> で「正面±FRONT_WINDOW_DEG(4°) の窓の中の最小距離」を求め、EMA で平滑化して <C>d_front</C>（前方距離）を更新。
              この値が減速・停止判断の入力になります。
            </p>
          </Fn>

          <Fn name="_fgm_build_ranges() — ①距離の地図づくり" lines={<L from={910} to={944} />}>
            <p>
              スキャン全点を前方視野 <C>FGM_FOV_DEG</C>(90°) の角度ビン（<C>FGM_BIN_DEG</C>=2°刻み、約46個）に振り分け、
              各ビンの<strong className="text-white">最小距離</strong>を記録した配列 <C>ranges</C> を作ります。各点は必ず <C>lidar_point_to_axle_polar</C> で車軸基準に変換（<L from={923} />）。
              点が入らなかったビンは <C>MAX_VALID</C>(12m)=「何もない」扱い。最後に窓幅 <C>FGM_SMOOTH_WIN</C>(9) の<strong className="text-white">中央値フィルタ</strong>（<L from={933} to={942} />）で
              1点だけ飛び出たノイズを除去します（平均と違い外れ値に強い）。
            </p>
          </Fn>

          <Fn name="_fgm_apply_bubble() — ②危険ゾーン展開" lines={<L from={946} to={970} />}>
            <p>
              最も近い障害物（<C>dmin</C>）を見つけ、その周囲を「Safety Bubble」として距離0（=通れない）に潰します。
              バブルの角度幅は <C>atan2(BUBBLE_RADIUS, dmin)</C>（<L from={959} />）— 障害物が近いほど広い角度を潰す、という幾何学的に正しい計算で、
              <C>FGM_BUBBLE_MIN_DEG..MAX_DEG</C> にクランプ。これにより「障害物のすぐ横スレスレを狙って車体をぶつける」事故を防ぎます。
              現状は最近傍の<strong className="text-white">1点のみ</strong>にバブルを張る実装（複数障害物が近接すると通れない隙間をギャップと誤認するリスクがあり、todo.md の改善候補）。
            </p>
          </Fn>

          <Fn name="_fgm_find_max_gap() — ③最大ギャップ探索" lines={<L from={972} to={993} />}>
            <p>
              各ビンを <C>FGM_CLEAR_TH</C>(1.4m) 以上なら「開放(1)」、未満なら「壁(0)」に二値化し（<L from={974} />）、
              1 が連続する区間を走査して<strong className="text-white">最長の連続開放区間</strong>を選びます。
              幅が <C>FGM_MIN_GAP_DEG</C>(4°) 未満の細い隙間は通れないので無視。ギャップが1つもなければ <C>None</C> を返し、NOGAP フォールバックへ。
              比較基準はビン数（角度幅）のみで、ギャップの深さは見ていません（これも todo.md の改善候補）。
            </p>
          </Fn>

          <Fn name="_fgm_pick_target() — ④狙う点の決定" lines={<L from={995} to={1015} />}>
            <p>
              ギャップ内のどこを狙うか。<C>FGM_TARGET=&quot;MID&quot;</C> ならギャップ中央のビン、
              <C>&quot;FAR&quot;</C>（デフォルト）なら最も遠いビンを狙います。FAR で同率一位が複数あるときは、
              よりギャップ中央に近い方を選ぶタイブレーク付き（<L from={1009} to={1011} /> — 端に吸い寄せられるのを軽減）。
            </p>
          </Fn>

          <Fn name="_fgm_control() — ⑤操舵と速度の決定（毎周期の中心）" lines={<L from={1017} to={1135} />}>
            <p>上の①〜④を順に呼び、最終的な左右タイヤ速度を返します。</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-white">NOGAP時</strong>（<L from={1024} to={1060} />）: ギャップがなければ、いちばん距離が残っているビンを強制ターゲットにし、速度を <C>TURN_SPEED</C> に落として旋回で脱出を図る。</li>
              <li><strong className="text-white">操舵</strong>（<L from={1065} to={1066} />）: ターゲット角をラジアンにして <C>steer = KP_GAP_ANGLE × 角度</C> の比例制御（P制御）。<C>±MAX_STEER</C> でクランプ。</li>
              <li><strong className="text-white">減速</strong>（<L from={1068} to={1082} />）: 実効前方距離 <C>front_eff</C> = min(正面距離, ターゲット距離)。<C>FRONT_SLOW</C>(0.73m) を切ると距離に比例して減速率 <C>front_drop</C> が 0→1 に増加。速度は <C>v = BASE_SPEED × (1 − STEER_DROP×|steer|) × (1 − FRONT_DROP×front_drop)</C> の掛け算式。<C>FRONT_STOP</C>(0.38m) 未満なら <C>TURN_SPEED</C> 以下に制限。</li>
              <li><strong className="text-white">出力</strong>（<L from={1087} to={1095} />）: <C>mix_with_pivot</C> で左右速度化 → どちらかが <C>SPEED_MAX</C> を超えたら左右比を保ったまま縮小（<L from={1089} to={1093} /> — 曲がる比率を崩さないための工夫）→ <C>apply_speed_limits</C>。</li>
              <li><strong className="text-white">記録</strong>: デバッグ行の出力（level 2 なら ±60°/±30°/0° の距離スナップショットも）と、Web UI 向け <C>_status</C> の更新（<L from={1130} to={1134} />）。</li>
            </ul>
          </Fn>

          <Fn name="loop() — 走行ループ本体" lines={<L from={1137} to={1168} />}>
            <p>
              デーモンスレッドで回る無限ループ。<C>running=False</C> で脱出。LiDAR 未接続なら停止して待機（<L from={1145} to={1148} />）、
              PAUSE 中は 50ms ごとに <C>motor.stop()</C>、RUN 中はスキャン更新 → <C>_fgm_control()</C> → <C>motor.set_drive()</C> を
              約10ms周期で回します。スキャン失敗時はその周期だけ停止して安全側に倒します（<L from={1155} to={1160} />）。
              <C>FGM_ENABLE=False</C> なら FTG を使わず単純に直進（<L from={1164} to={1165} /> — 動作確認用）。
            </p>
          </Fn>
        </Sec>

        <Sec id="keyboard" title="セクション5: keyboard_loop（SSH操作）" lines="L1171–1214">
          <p>
            メインスレッドで動くキー入力ループ。<C>tty.setraw</C>（<L from={1178} />）で端末を raw モードにして Enter なしの1文字入力を実現し、
            <C>select</C> の 0.1秒タイムアウト付き監視（<L from={1180} />）で、キーが来なくても <C>running</C> フラグを定期チェックできるようにしています
            （API の QUIT でも抜けられる）。終了時は必ず端末設定を復元（<L from={1213} to={1214} />）。キー割り当て:
            <C>g</C>=armed ON（Web UI 受付開始）、<C>s</C>/Space=緊急停止、<C>q</C>=終了、<C>d</C>=デバッグ表示切替、
            <C>1/2/3</C>=デバッグレベル、<C>p</C>=直近ログ40件ダンプ。
          </p>
        </Sec>

        <Sec id="main" title="セクション6: main（起動シーケンス）" lines="L1217–1381">
          <p>すべてを組み立てる起動処理。順番に意味があります:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li><L from={1222} to={1227} /> 環境変数読み込み。<C>sys.stdin.isatty()</C> で「SSH手動起動か systemd 自動起動か」を判別し、非対話（systemd）なら <C>armed</C> を自動ONにする（キーボードで <C>g</C> を押せないため）。SSH でも <C>AUTO_ARM=1</C> で強制可能。</li>
            <li><L from={1233} to={1243} /> LED を先に起動して点滅させ、ネットワーク接続を最大60秒待つ。</li>
            <li><L from={1247} to={1253} /> API 疎通テスト → 成功なら <strong className="text-white">PAUSEリセット → ロボット登録 → パラメータ取得</strong> の順で初期化。</li>
            <li><L from={1274} /> <C>with MotorDriver()</C> で以降のすべてを包む — どんな終わり方でも GPIO を確実に後始末。</li>
            <li><L from={1278} to={1312} /> LiDAR 初期化。<strong className="text-white">失敗してもプログラムを落とさない</strong>のがポイント: <C>lidar_error</C> を Web UI に表示しつつ、10秒ごとに再接続を試みるスレッド <C>_retry_lidar</C> を起動（USBの抜き差しや電力不足からの復帰に対応）。</li>
            <li><L from={1314} to={1315} /> 走行ループ <C>ap.loop</C> をデーモンスレッドで開始。</li>
            <li><L from={1318} to={1350} /> API 接続済みなら <C>poll_command</C> スレッド開始。未接続だった場合は <C>_retry_api_init</C> スレッドが接続成功を待ち、<strong className="text-white">必ず PAUSE リセット→登録→パラメータ取得を済ませてから</strong>ポーリングを開始する（順序を守らないと前回の RUN が残っていた場合に誤発進する）。</li>
            <li><L from={1352} to={1365} /> PAUSE で待機開始。対話モードなら <C>keyboard_loop</C>、systemd なら <C>running</C> が落ちるまでスリープループ。</li>
            <li><L from={1367} to={1377} /> 終了処理: Ctrl+C も捕捉し、LED 消灯 → LiDAR 停止・切断 → （with を抜けて）モーター停止・GPIO 解放。</li>
          </ol>
          <p className="text-gray-500 text-xs">
            起動コマンド例: <C>sudo PARAM_SERVER_URL=https://param4ad.vercel.app ROBOT_ID=A TEAM=a python3 param1.py</C>
          </p>
        </Sec>

        <p className="text-center text-xs font-mono mt-6">
          <a href="#code" className="text-cyan-400 hover:underline">↑ コード全文へ戻る</a>
        </p>
      </div>
    </main>
  )
}
