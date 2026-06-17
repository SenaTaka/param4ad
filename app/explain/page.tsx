import Link from "next/link";

export default function ExplainPage() {
  return (
    <main className="min-h-screen bg-[#04090f] p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4 text-cyan-400 hover:text-cyan-300 transition-colors text-sm font-mono">
            ← もどる
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-cyan-400 font-mono mr-2 text-2xl">&gt;</span>ロボットカーはどうやって走るの？
          </h1>
          <p className="text-gray-400 text-sm">「Follow-the-Gap（すきまを追いかけろ）」アルゴリズムのひみつ</p>
        </div>

        {/* Step 1: LiDAR */}
        <Section step={1} color="cyan" title="まわりをスキャンする" emoji="📡">
          <p className="text-gray-300 mb-4">
            ロボットカーには <strong className="text-white">LiDAR（ライダー）</strong> というセンサーがついています。
            レーザーの光を360度に発射して、まわりの壁や障害物までの距離をはかります。
            ちょうど目をつぶって手を伸ばして、まわりを確かめるかんじです！
          </p>
          <LidarDiagram />
          <p className="text-gray-500 text-xs mt-2 text-center">LiDARが360度スキャンして距離を測るようす</p>
        </Section>

        {/* Step 2: Safety Bubble */}
        <Section step={2} color="red" title="あぶない場所に泡を貼る" emoji="🫧">
          <p className="text-gray-300 mb-4">
            障害物が近すぎると危ないので、まず近くにあるものを見つけます。
            そして、そのまわりに <strong className="text-white">「安全バブル」</strong> という見えない泡を貼って、
            「ここには進んじゃダメ！」というエリアを作ります。
          </p>
          <BubbleDiagram />
          <p className="text-gray-500 text-xs mt-2 text-center">一番近い障害物のまわりにバブル（安全ゾーン）を設定</p>
        </Section>

        {/* Step 3: Find Gap */}
        <Section step={3} color="green" title="進めるすきまを探す" emoji="🔍">
          <p className="text-gray-300 mb-4">
            バブルを貼った後、センサーのデータを見て
            <strong className="text-white">「どこが一番長く進める空間か」</strong>を探します。
            これを <strong className="text-white">「ギャップ（すきま）」</strong> といいます。
            広い場所をまとめて「窓」のようにグループにします。
          </p>
          <GapDiagram />
          <p className="text-gray-500 text-xs mt-2 text-center">一番広いすきま（ギャップ）をみつけるようす</p>
        </Section>

        {/* Step 4: Pick Target */}
        <Section step={4} color="yellow" title="目標をきめる" emoji="🎯">
          <p className="text-gray-300 mb-4">
            一番広いすきまの中から、<strong className="text-white">「どのへんに向かうか」</strong>をきめます。
            まんなかを目指したり、一番遠い点に向かったりします。
            これが「ゴール方向」になります！
          </p>
          <TargetDiagram />
          <p className="text-gray-500 text-xs mt-2 text-center">ギャップの中から目標点を選ぶ</p>
        </Section>

        {/* Step 5: Steering */}
        <Section step={5} color="purple" title="ハンドルをまわす" emoji="🎮">
          <p className="text-gray-300 mb-4">
            目標の方向に向かって <strong className="text-white">ハンドル（ステアリング）を調整</strong> します。
            真正面なら0度、右なら右に、左なら左にまわします。
            曲がり方が急なときは速度も落として安全に曲がります。
          </p>
          <SteeringDiagram />
          <p className="text-gray-500 text-xs mt-2 text-center">目標方向にハンドルを調整するようす</p>
        </Section>

        {/* Step 6: Loop */}
        <Section step={6} color="orange" title="これをくりかえす！" emoji="🔁">
          <p className="text-gray-300 mb-4">
            このスキャン→バブル→ギャップ→目標→ステアリングを、
            <strong className="text-white">1秒間に何十回も</strong>くりかえします。
            だからロボットはスムーズに走れるのです！
          </p>
          <LoopDiagram />
        </Section>

        {/* Summary */}
        <div className="bg-[#0b1828] border border-[#1a3048] border-l-4 border-l-cyan-400 rounded-xl p-5 mt-6 mb-8">
          <h2 className="text-lg font-bold text-cyan-400 mb-3 font-mono">// まとめ</h2>
          <ol className="space-y-2 text-gray-300 text-sm">
            <li><span className="text-cyan-400 font-mono mr-2">01</span><strong className="text-white">スキャン</strong>：LiDARでまわりの距離をはかる</li>
            <li><span className="text-red-400 font-mono mr-2">02</span><strong className="text-white">バブル</strong>：一番近い障害物をバブルで守る</li>
            <li><span className="text-green-400 font-mono mr-2">03</span><strong className="text-white">ギャップ探し</strong>：一番広いすきまをみつける</li>
            <li><span className="text-yellow-400 font-mono mr-2">04</span><strong className="text-white">目標決定</strong>：ギャップの中の目標点をきめる</li>
            <li><span className="text-purple-400 font-mono mr-2">05</span><strong className="text-white">ステアリング</strong>：目標に向かってハンドルをまわす</li>
            <li><span className="text-orange-400 font-mono mr-2">06</span><strong className="text-white">くりかえし</strong>：これを高速でくりかえして走る！</li>
          </ol>
        </div>

        <div className="text-center mb-8">
          <Link href="/" className="inline-block bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded-full transition-colors">
            パラメータ設定にもどる →
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({
  step,
  color,
  title,
  emoji,
  children,
}: {
  step: number;
  color: string;
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  const borderColors: Record<string, string> = {
    cyan:   "border-l-cyan-400",
    red:    "border-l-red-400",
    green:  "border-l-green-400",
    yellow: "border-l-yellow-400",
    purple: "border-l-purple-400",
    orange: "border-l-orange-400",
  };
  const headColors: Record<string, string> = {
    cyan:   "text-cyan-400",
    red:    "text-red-400",
    green:  "text-green-400",
    yellow: "text-yellow-400",
    purple: "text-purple-400",
    orange: "text-orange-400",
  };
  return (
    <div className={`bg-[#0b1828] border border-[#1a3048] border-l-4 ${borderColors[color]} rounded-xl p-5 mb-6`}>
      <h2 className={`text-lg font-bold mb-3 ${headColors[color]}`}>
        {emoji} <span className="font-mono text-sm mr-1 opacity-60">STEP {step} —</span>{title}
      </h2>
      {children}
    </div>
  );
}

function LidarDiagram() {
  return (
    <svg viewBox="0 0 300 180" className="w-full max-w-xs mx-auto block" aria-label="LiDARスキャン図">
      <rect width="300" height="180" fill="#0d1f33" rx="8" />
      <rect x="10" y="10" width="280" height="160" fill="none" stroke="#1a3048" strokeWidth="3" rx="6" />
      <rect x="130" y="75" width="40" height="30" fill="#3b82f6" rx="4" />
      <text x="150" y="95" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">🚗</text>
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const cx = 150, cy = 90;
        const len = angle === 90 ? 55 : angle === 270 ? 55 : angle === 0 || angle === 180 ? 120 : 70;
        return (
          <line
            key={angle}
            x1={cx} y1={cy}
            x2={cx + Math.cos(rad) * len}
            y2={cy + Math.sin(rad) * len}
            stroke="#22d3ee"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            opacity="0.7"
          />
        );
      })}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const cx = 150, cy = 90;
        const len = angle === 90 ? 55 : angle === 270 ? 55 : angle === 0 || angle === 180 ? 120 : 70;
        return (
          <circle
            key={angle}
            cx={cx + Math.cos(rad) * len}
            cy={cy + Math.sin(rad) * len}
            r="4"
            fill="#22d3ee"
          />
        );
      })}
      <text x="150" y="170" textAnchor="middle" fill="#94a3b8" fontSize="9">シアンの点 = 障害物や壁までの距離</text>
    </svg>
  );
}

function BubbleDiagram() {
  return (
    <svg viewBox="0 0 300 180" className="w-full max-w-xs mx-auto block" aria-label="Safety Bubble図">
      <rect width="300" height="180" fill="#1a0a0a" rx="8" />
      <rect x="10" y="10" width="280" height="160" fill="none" stroke="#1a3048" strokeWidth="3" rx="6" />
      <rect x="130" y="100" width="40" height="28" fill="#3b82f6" rx="4" />
      <text x="150" y="118" textAnchor="middle" fill="white" fontSize="10">🚗</text>
      <rect x="60" y="50" width="30" height="30" fill="#475569" rx="4" />
      <text x="75" y="70" textAnchor="middle" fill="white" fontSize="10">🧱</text>
      <circle cx="75" cy="65" r="40" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 3" />
      <text x="75" y="130" textAnchor="middle" fill="#f87171" fontSize="9" fontWeight="bold">安全バブル</text>
      <text x="55" y="155" fill="#94a3b8" fontSize="8">このエリアには入れない！</text>
    </svg>
  );
}

function GapDiagram() {
  return (
    <svg viewBox="0 0 300 180" className="w-full max-w-xs mx-auto block" aria-label="Gap図">
      <rect width="300" height="180" fill="#0a1a0d" rx="8" />
      <rect x="10" y="10" width="280" height="160" fill="none" stroke="#1a3048" strokeWidth="3" rx="6" />
      <rect x="125" y="120" width="40" height="28" fill="#3b82f6" rx="4" />
      <text x="145" y="138" textAnchor="middle" fill="white" fontSize="10">🚗</text>
      <rect x="10" y="30" width="70" height="50" fill="#374151" rx="4" />
      <text x="45" y="60" textAnchor="middle" fill="#94a3b8" fontSize="9">壁・障害物</text>
      <rect x="210" y="50" width="80" height="50" fill="#374151" rx="4" />
      <text x="250" y="80" textAnchor="middle" fill="#94a3b8" fontSize="9">壁・障害物</text>
      <rect x="80" y="20" width="130" height="90" fill="#22c55e" fillOpacity="0.2" stroke="#22c55e" strokeWidth="2" strokeDasharray="5 3" rx="4" />
      <text x="145" y="45" textAnchor="middle" fill="#4ade80" fontSize="11" fontWeight="bold">一番広いすきま</text>
      <text x="145" y="58" textAnchor="middle" fill="#4ade80" fontSize="9">（ギャップ）</text>
    </svg>
  );
}

function TargetDiagram() {
  return (
    <svg viewBox="0 0 300 180" className="w-full max-w-xs mx-auto block" aria-label="ターゲット図">
      <rect width="300" height="180" fill="#1a160a" rx="8" />
      <rect x="10" y="10" width="280" height="160" fill="none" stroke="#1a3048" strokeWidth="3" rx="6" />
      <rect x="125" y="125" width="40" height="28" fill="#3b82f6" rx="4" />
      <text x="145" y="143" textAnchor="middle" fill="white" fontSize="10">🚗</text>
      <rect x="80" y="20" width="130" height="85" fill="#22c55e" fillOpacity="0.1" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5 3" rx="4" />
      <text x="145" y="62" textAnchor="middle" fontSize="22">⭐</text>
      <text x="145" y="78" textAnchor="middle" fill="#fbbf24" fontSize="9" fontWeight="bold">目標点</text>
      <line x1="145" y1="125" x2="145" y2="85" stroke="#f59e0b" strokeWidth="3" markerEnd="url(#arrowY)" />
      <defs>
        <marker id="arrowY" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b" />
        </marker>
      </defs>
    </svg>
  );
}

function SteeringDiagram() {
  return (
    <svg viewBox="0 0 300 180" className="w-full max-w-xs mx-auto block" aria-label="ステアリング図">
      <rect width="300" height="180" fill="#110a1a" rx="8" />
      <path d="M100 180 Q145 60 200 20" stroke="#1e293b" strokeWidth="50" fill="none" />
      <path d="M100 180 Q145 60 200 20" stroke="#334155" strokeWidth="3" strokeDasharray="12 8" fill="none" />
      <rect x="125" y="140" width="40" height="28" fill="#3b82f6" rx="4" />
      <text x="145" y="158" textAnchor="middle" fill="white" fontSize="10">🚗</text>
      <path d="M145 135 Q170 80 195 35" stroke="#c084fc" strokeWidth="3" fill="none" markerEnd="url(#arrowP)" />
      <defs>
        <marker id="arrowP" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#c084fc" />
        </marker>
      </defs>
      <text x="175" y="110" fill="#c084fc" fontSize="10" fontWeight="bold">曲がる角度</text>
      <text x="175" y="122" fill="#a78bfa" fontSize="9">(ステアリング)</text>
    </svg>
  );
}

function LoopDiagram() {
  const steps = [
    { label: "スキャン", emoji: "📡", x: 150, y: 30 },
    { label: "バブル", emoji: "🫧", x: 255, y: 80 },
    { label: "ギャップ", emoji: "🔍", x: 220, y: 155 },
    { label: "目標", emoji: "🎯", x: 80, y: 155 },
    { label: "ステアリング", emoji: "🎮", x: 45, y: 80 },
  ];
  const arrows = steps.map((_, i) => {
    const from = steps[i];
    const to = steps[(i + 1) % steps.length];
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  });
  return (
    <svg viewBox="0 0 300 200" className="w-full max-w-xs mx-auto block" aria-label="ループ図">
      <rect width="300" height="200" fill="#160d0a" rx="8" />
      <defs>
        <marker id="arrowO" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#fb923c" />
        </marker>
      </defs>
      {arrows.map((a, i) => (
        <line
          key={i}
          x1={a.x1} y1={a.y1}
          x2={a.x2} y2={a.y2}
          stroke="#fb923c" strokeWidth="2"
          markerEnd="url(#arrowO)"
        />
      ))}
      {steps.map((s) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r="22" fill="#0b1828" stroke="#fb923c" strokeWidth="2" />
          <text x={s.x} y={s.y - 4} textAnchor="middle" fontSize="13">{s.emoji}</text>
          <text x={s.x} y={s.y + 10} textAnchor="middle" fill="#fdba74" fontSize="7.5" fontWeight="bold">{s.label}</text>
        </g>
      ))}
      <text x="150" y="105" textAnchor="middle" fill="#fb923c" fontSize="11" fontWeight="bold">くりかえし！</text>
    </svg>
  );
}
