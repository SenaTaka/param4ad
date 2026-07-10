
export default function DocPage() {
  return (
    <main className="min-h-screen bg-[#04090f] p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="text-cyan-400 font-mono mr-2 text-2xl">&gt;</span>運用マニュアル
          </h1>
          <p className="text-gray-400 text-sm">電源ONから走行・停止・トラブル対応まで</p>
        </div>

        {/* 1. システム構成 */}
        <Section color="cyan" title="システム構成" emoji="🗺️">
          <p className="text-gray-300 mb-3">
            ロボット（ラズパイ）は電源ONで自動起動し、この Web UI と Upstash Redis 経由でつながります。
            チームごとに URL が分かれています。
          </p>
          <Code>{`[ブラウザ] ←→ [Vercel Web UI] ←→ [Redis]
                        ↕ 0.3秒ポーリング
                  [ラズパイ param1.py]
                    ├─ YDLiDAR
                    └─ PWMモーター`}</Code>
          <ul className="text-gray-300 text-sm mt-3 space-y-1">
            <li><K>チームURL</K> /a 〜 /e の5チーム制。ロボット側は環境変数 <M>TEAM</M> で割当（サービス定義に設定済み）</li>
            <li><K>複数台</K> 同じチーム内は <M>ROBOT_ID</M> / <M>ROBOT_NAME</M> で識別</li>
          </ul>
        </Section>

        {/* 2. 起動 */}
        <Section color="green" title="起動（電源ONだけ）" emoji="🔌">
          <p className="text-gray-300 mb-3">
            systemd（<M>param4ad.service</M>）に登録済みなので、<strong className="text-white">電源を入れるだけ</strong>で走行プログラムが自動起動します。SSH は不要です。
          </p>
          <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
            <li>電源ON → 起動後ネットワーク接続を待つ（<span className="text-yellow-300">LED点滅</span>）</li>
            <li>接続すると <span className="text-green-300">LED点灯</span>。サーバーのコマンドを PAUSE にリセット（誤発進防止）</li>
            <li>ロボット登録・パラメータ取得後、<M>armed=ON</M> で待機（勝手には走らない）</li>
            <li>Wi-Fi 接続に時間がかかっても、バックグラウンドで自動リトライして接続する</li>
          </ol>
          <Note>起動直後にネット未接続でも放置でOK。接続でき次第、自動で Web UI に現れます。</Note>
        </Section>

        {/* Wi-Fi の追加 */}
        <Section color="purple" title="別の Wi-Fi で使う（会場・テザリング）" emoji="📶">
          <p className="text-gray-300 mb-3">
            <strong className="text-white">新しい Wi-Fi は現地に行く前に登録しておく</strong>のが鉄則です。
            ネットに繋がらないと SSH もできなくなります。登録済みの Wi-Fi には起動時に自動接続します。
          </p>
          <Code>{`# ラズパイ上で（電波が届かない場所でも登録できる）
sudo bash deploy/add-wifi.sh "会場のSSID" "パスワード" 20

# 保険としてスマホのテザリングも登録しておく（優先度高め）
sudo bash deploy/add-wifi.sh "iPhone-sena" "hotspotpass" 30`}</Code>
          <ul className="text-gray-300 text-sm mt-3 space-y-1">
            <li><K>優先度</K> 数字が大きいほど優先。複数の電波が届く場所では高い方に接続</li>
            <li><K>確認</K> <M>nmcli connection show</M>（登録一覧）/ <M>nmcli device wifi list</M>（見えている電波）</li>
            <li><K>削除</K> <M>sudo nmcli connection delete &quot;SSID&quot;</M></li>
          </ul>
          <Note>
            現地で繋がらないときの復旧手段: スマホのテザリングを登録済みにしておけば、
            ホットスポットON → ラズパイが自動接続 → スマホと同じネットワークから SSH して会場 Wi-Fi を登録できます。
          </Note>
        </Section>

        {/* 3. 走行操作 */}
        <Section color="yellow" title="走行の操作（Web UI）" emoji="🎮">
          <ul className="text-gray-300 text-sm space-y-2">
            <li><K>START</K> 走行開始（RUN）。ロボットが armed 状態のときのみ有効</li>
            <li><K>STOP</K> 停止（PAUSE）。パラメータ変更はこの状態でのみロボットに反映される</li>
            <li><K>QUIT</K> プログラム終了（systemd 運用中は自動で再起動する）</li>
          </ul>
          <Note>パラメータは <strong className="text-white">PAUSE 中のみ反映</strong>。RUN 中に変更した値は次の STOP 後に適用されます。</Note>
        </Section>

        {/* 4. SSH 手動操作 */}
        <Section color="purple" title="SSH での手動操作" emoji="⌨️">
          <p className="text-gray-300 mb-3">デバッグ時は自動起動を止めて手動実行できます。</p>
          <Code>{`# 自動起動サービスを一旦停止
sudo systemctl stop param4ad

# 手動実行（チームEの場合）
cd ~/car/vivi
sudo PARAM_SERVER_URL=https://param4ad.vercel.app \\
     TEAM=e python3 param1.py`}</Code>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-300">
            <div><M>g</M> armed ON（UI受付開始）</div>
            <div><M>s</M> / Space 緊急停止</div>
            <div><M>q</M> 終了</div>
            <div><M>d</M> デバッグ表示 ON/OFF</div>
            <div><M>1/2/3</M> デバッグレベル</div>
            <div><M>p</M> 直近ログ40件ダンプ</div>
          </div>
        </Section>

        {/* 5. サービス管理 */}
        <Section color="orange" title="サービス管理コマンド" emoji="🛠️">
          <Code>{`journalctl -u param4ad -f        # ログを追う
journalctl -u param4ad -b        # 今回の起動分のログ
systemctl status param4ad        # 状態確認
sudo systemctl restart param4ad  # 再起動（コード更新後は必須）
sudo systemctl stop param4ad     # 停止
sudo systemctl disable param4ad  # 自動起動を無効化`}</Code>
          <Note><M>param1.py</M> を更新したら必ず <M>restart</M>。enable だけでは動作中のプロセスは古いままです。</Note>
        </Section>

        {/* 6. コード更新 */}
        <Section color="cyan" title="コードの更新手順" emoji="📦">
          <Code>{`# PC側: ラズパイへ転送
scp param1.py sena@<ラズパイIP>:~/car/vivi/param1.py

# ラズパイ側: 反映
sudo systemctl restart param4ad
journalctl -u param4ad -b   # team=e のバナーが出ればOK`}</Code>
          <p className="text-gray-300 text-sm mt-3">
            サービス定義（<M>deploy/param4ad.service</M>）を変えたときは <M>sudo bash deploy/install.sh</M> を再実行します。
          </p>
        </Section>

        {/* 7. トラブルシューティング */}
        <Section color="red" title="トラブルシューティング" emoji="🚨">
          <div className="space-y-4 text-sm">
            <Trouble q="Web UI にロボットが出てこない">
              <M>journalctl -u param4ad -b</M> でログ確認。
              「接続リトライスレッド開始」が出ていればネット待ち中（放置でOK）。
              URL に <M>team=e</M> が付いているか、チームのページ（/e）を開いているかも確認。
            </Trouble>
            <Trouble q="START を押しても走らない">
              ログに <M>armed=True</M> が出ているか確認。systemd 起動なら自動で armed になる。
              手動実行（SSH）の場合は <M>g</M> キーで armed にする必要がある。
            </Trouble>
            <Trouble q="暴走した / すぐ止めたい">
              Web UI の STOP。届かない場合は電源を切るか、SSH で
              <M>sudo systemctl stop param4ad</M>。
            </Trouble>
            <Trouble q="パラメータが反映されない">
              反映は PAUSE 中のみ（約3秒ごとに取得）。RUN 中なら一度 STOP する。
            </Trouble>
            <Trouble q="LED が点滅したまま">
              ネットワーク未接続。Wi-Fi 設定・ルーターを確認。接続でき次第自動復帰する。
            </Trouble>
          </div>
        </Section>

      </div>
    </main>
  );
}

function Section({
  color,
  title,
  emoji,
  children,
}: {
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
        {emoji} {title}
      </h2>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-[#04090f] border border-[#1a3048] rounded-lg p-3 overflow-x-auto text-xs text-gray-200 font-mono leading-relaxed">
      {children}
    </pre>
  );
}

function M({ children }: { children: React.ReactNode }) {
  return <code className="bg-[#04090f] border border-[#1a3048] rounded px-1.5 py-0.5 text-cyan-300 font-mono text-[0.85em] mx-0.5">{children}</code>;
}

function K({ children }: { children: React.ReactNode }) {
  return <strong className="text-white mr-2">{children}</strong>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs text-gray-400 bg-[#04090f] border border-[#1a3048] rounded-lg p-3">
      💡 {children}
    </p>
  );
}

function Trouble({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-red-300 font-bold mb-1">Q. {q}</p>
      <p className="text-gray-300 leading-relaxed">{children}</p>
    </div>
  );
}
