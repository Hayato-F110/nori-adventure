# 引き継ぎ（次のセッション用）

> 最終更新：2026-11-13 13:00（NORI-37・66・29・61 をマージ。承認待ちの案 6 つ。オーナーは離席中）
> 新しいセッションでは `/start-day` を使う（このファイル、`CLAUDE.md`、最新の devlog、Jira を読む）。
> 4週間の予定・成果物・学ぶことは `docs/schedule.md`（11/10 の計画の変更は「決まったこと」と「変更後のスプリント」）。

## 0. 11/13 13:00 の状態（スプリント3の1日目。オーナーは離席中、/away で進めた）

**スプリント**：スプリント2は 11/13 10:20 に終了（15 件・40 ポイントすべて完了）。スプリント3は 11/13 10:48 に開始（終了 11/17 23:00）。

**今日マージしたもの**

- PR #53 NORI-37（E2E の運転役。ステージ1〜4のクリアの E2E）→ Jira 完了
- PR #55 NORI-66（E2E の早送り：運転役が `stepsPerFrame` を決めたときだけ、1フレームにその刻みを進める。CI の 3 fps で 20 刻み）→ Jira 完了。CI の e2e は約 20 分 → 約 10 分
- PR #54 NORI-29（ステージ5：ローバー・ジャンプ台・ボス・エンディング。月面の素材と光のベイク）→ **Jira は「進行中」に戻した**（下の承認待ち）
- PR #52 NORI-61（街の車・人・自転車・バイク）→ Jira 完了（スプリントに入っていないように見える。割り当てはオーナー）

**オーナーの承認待ち（戻られたら最初に）**

| #   | 課題                    | 決めてほしいこと（おすすめ）                                                                                                      | ブランチ・ファイル                                                                                |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | NORI-29                 | ステージ5の高画質で、昼の空の HDRI を使わない（おすすめ：使わない。使うと、なかよしの星と砂の比 2.23、使わないと計算どおり 4.18） | main（Jira のコメント）                                                                           |
| 2   | NORI-38 PWA             | 案の承認と、作り方（自分で書く）・アイコン（タイトルの車の絵）・画面（全画面・横向き）                                            | `feature/NORI-38-pwa`：`docs/game-rules.md`（151 行目）・`docs/test-plans/NORI-38.md`             |
| 3   | NORI-57 リプレイ        | 案の承認（入力だけ記録・上限 10 分・メモリの中だけ・1 倍・回るカメラ）                                                            | `feature/NORI-57-replay`：`docs/game-rules.md`（176 行目）・`docs/test-plans/NORI-57.md`          |
| 4   | NORI-42 自動録画        | 案の承認と、見せ場の切り出し方（案A：秒を JSON に書き、切り出しは編集で）                                                         | `feature/NORI-42-auto-record`：`docs/video/auto-recording.md`・`docs/test-plans/NORI-42.md`       |
| 5   | NORI-63 すり抜け        | 直し方の選択（(b) 次の刻みで重なるならその場で止まる、余白 0.3 m）と案の承認                                                      | `feature/NORI-63-no-pass-through`：`docs/game-rules.md`（142 行目）・`docs/test-plans/NORI-63.md` |
| 6   | NORI-64 雲と太陽        | 案の承認（雲はカメラのまわりの輪 250 m・4〜10°、太陽は光と同じ方位で高さ 8°。光は変えない）                                       | `feature/NORI-64-sun-clouds`：`docs/game-rules.md`（165 行目）・`docs/test-plans/NORI-64.md`      |
| 7   | スプリント2のふりかえり | 案の承認（改善3つ）                                                                                                               | `feature/NORI-10-retro-sprint2`：`docs/retro/sprint-2.md`                                         |
| 8   | 手元の worktree         | `.claude/worktrees/NORI-66` が「アクセスが拒否されました」で消せなかった（PR はマージ済み）。消してよいか                         | —                                                                                                 |
| 9   | ルール違反の確認        | 応答の遅れ（E2E を表で流した）、承認なしの `rm -rf`（worktree の中に自分で作った `blender-work/`。作り直せる配置のファイルだけ）  | —                                                                                                 |

**新しく作った課題**：NORI-65（ボスの自作モデル。ポイント 2、開始 11/16・期限 11/17）、NORI-66（早送り。完了）。スプリントへの割り当てはオーナー。

**次にやること（承認のあと）**：NORI-63・64 → NORI-38 → NORI-57 → NORI-42。NORI-34（性能）は各ステージの平均 FPS を表に残すところから（今日、CPU 4 倍遅くして全ステージ 30fps 以上を確かめた。ステージ1は街の車・人が入って平均 55.6）。

**覚えておくこと（今日わかったこと）**

- **E2E のクリアは早送りで流す**（`stepsPerFrame: 20`）。FPS を測るテストでは使わない
- **ステージ4のきらきらの E2E は、CI だけでたまに落ちる**（11/12 に直したあと、11/13 にまた1回。流し直しで通った）。また落ちたら課題を作る
- **`npx playwright test` の絞り込み（ファイル名・`-g`・`--grep`）が効かず、全部流れることがある**（Git Bash から）。原因はまだ調べていない。流すときは記録をすべてファイルに残す（最後の 30 行だけにしない）
- **Blender は noriblender で開いたまま**（11/13 11:52 に隔離を確認）。焼き付けは月面で 10 秒
- **worktree の中のファイルを渡すときは、リンクを `.claude/worktrees/…` から書き、`test -f` で確かめる**（メモリー `verify-links-before-sharing`）
- **`blender-work/` は本体のフォルダのもの**（worktree の中ではない）。noriblender が読めるのは本体だけ
- `src/core/stage2Layout.ts` の import をファイル名まで書いた（node で直接動かす `npm run layout:export` が、フォルダの import を読めなかった）

## 1. いまの状態

| 項目       | 状態                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリ | `Hayato-F110/nori-adventure`（公開）。公開版 https://hayato-f110.github.io/nori-adventure/ 。開いている PR は 0（11/10 夜の時点）                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 計画       | **ブラウザ版＋PWA（GitHub Pages、無料）**。Android アプリ・Google Play は 11/10 に見送り（`docs/android/play-release.md`）。見た目はリアル寄り（NORI-56）、リプレイ（NORI-57）を追加                                                                                                                                                                                                                                                                                                                                                                                   |
| Jira       | スプリント2（ID 5）は 11/13 10:20 に終了。スプリント3（ID 6）は 11/13 10:48 に開始、終わり 11/17 23:00。4＝11/18〜11/23                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 守り       | Vite 8.3.7（GHSA-p4f5-76q4-ffq7 の修正版）、Playwright 1.65.0。未対応の警告 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Blender    | **5.3.0**（11/11 にオーナーが winget で更新。ファイアウォールの規則の付け替えと、初回の「Import Preferences From Previous Version」が要る）。起動は `/blender-start`（`tools/blender/start-blender.ps1` を別の窓で開く）。**作業フォルダはリポジトリの中の `blender-work/`**（11/10 に `C:\NoriBlender\` から移した。Git の対象外。noriblender の権限はこのフォルダだけ）。移したあとも `isolated: true`（リポジトリのほかの場所も読めない）。素材は `blender-work/assets/`（CC0。各フォルダに `asset.json`）。古い `C:\NoriBlender\` は、オーナーが消すまで残っている |
| NORI-56    | 試作の静止画（2版目）を描いた：`blender-work/renders/stage1-after.png`。作り方は `tools/blender/build-stage1-look.py`。オーナーが方向を承認                                                                                                                                                                                                                                                                                                                                                                                                                            |
| NORI-40    | Firefly 1本・DeeVid 1本を作って比べた（`docs/video/ai-video-comparison.md`）。Firefly の無料枠は1日1本                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

> **11/11 に日程を前倒し**：スプリント2＝11/11〜11/13、3＝11/14〜11/17、4＝11/18〜11/23（スプリント2・3は作業時間2倍）。日割りは `docs/schedule.md`「日割り（11/11 の前倒し）」、Jira の期限もそろえ済み。

### スプリント2（11/11〜11/13）

| 課題              | 内容                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| NORI-20〜23       | 乗り物2〜5 の GLB                                                          |
| NORI-25〜28       | ステージ1〜4                                                               |
| NORI-56（進行中） | リアル寄りの見た目をゲームに組み込む                                       |
| NORI-54           | プライバシーポリシー（日本語・英語、GitHub Pages）                         |
| NORI-40（進行中） | 11/11 飛行機・11/12 潜水艇は済み。11/13 ローバー → 判断（Jira のコメント） |

## 2. 次の作業順（11/11〜）

1. **`/start-day`**（いつもどおり最初に。このファイル・`CLAUDE.md`・最新の devlog・Jira を読む）
2. **オーナー**：Jira でスプリント2を開始する。Firefly で `car-side.png` の動画を1本（指示は `blender-work/ai-video/prompt.txt`、保存は同じフォルダ）。Blender は `/blender-start` のコマンドで noriblender として開く。日割りの表は 11/10 の夜に Jira の期限にそろえ済み。課題を作る・移すときは、期限の欄もそろえる
3. **NORI-20〜23 乗り物4台（11/11 の最初）**：`/blender-start 乗り物4台` で開く・つなぐ・隔離の確認（`isolated: true`）をしてから、4台をまとめて作る。車（`tools/blender/build-car.py`）と同じ作り方・大きさの決まり（`game-rules.md`「3D モデル」）
4. **NORI-25 ステージ1（11/11）**：コース・ほし・チェックポイント・ゴール。`game-rules.md` との対応を添えたテストの一覧を先に見せる。カメラが壁に入る問題もここで直す
5. **NORI-56（11/12）**：ゲームへの組み込みの前に、テストの一覧（FPS・画質の切り替え・素材の出所の記録・子どもに大事なものの見分けやすさ）を見せて承認をもらう。素材を `public/` へ（出所とライセンスを `asset.json`・クレジットに）。HDRI・AgX（three.js の `AgXToneMapping`）・PBR。道路は暗く、芝は鮮やかに（2版目の値）。11/12 に Firefly の3本目がそろったら NORI-40 を判断
6. 1日の終わりに `/end-day`

## 3. 残課題・メモ

- **Google AI Plus**：申し込んでいない。「3か月 ¥180」は 11/10 の公式のページになく、¥725/月
- **OpenAI の Sora は終了**（Web・アプリ 2026-04-26、API 2026-09-24。kids-play の `docs/security/provenance.md`）
- **DeeVid**：無料の 20 クレジットは使い切った。運営会社の記載がなく、有料にしない
- **c2patool**：この PC で見つからない。来歴（C2PA）を読むなら kids-play で使った置き場所を確かめる
- **カメラ**：後ろ向きで壁に押し付けると、カメラが壁の中に入る → NORI-25
- **家族のテスト（NORI-33）で見ること**：親指がハンドルの右いっぱい・◀ に届くか、ハンドルを「スライド」と分かるか、◀ を「左」と取り違えないか、長押しのメニュー（Jira にメモ）
- **空のステージ（NORI-27）**：タッチのボタンの見えやすさ（背景との差が約 3:1）
- **TypeScript 7**：typescript-eslint が対応したら `dependabot.yml` の `ignore` を外す
- **minimatch**：eslint が 11 系を使うようになったら `overrides` と該当のテストを外す
- **脅威分析 B-02**：DNS は止まらない（受け入れ）

## 4. 環境で分かっていること（つまずき防止）

| 事柄                   | 内容                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| シェル                 | Git Bash と PowerShell 7。Hook が `.env` という文字列を含むコマンドを止める（検索パターンでも）。`en[v]` のように書くか、テストでは実行時に組み立てる                                                                                                     |
| npm                    | 版は**最新の安定版**でよい（11/6 に2週間ルールを廃止）。入れる前に公式の変更履歴を確かめる。three.js は semver に従わない（minor でも移行ガイドを見る）                                                                                                   |
| Node                   | **26.13.0**（Active LTS、2026-10-28 から。サポートは 2029-04 まで）。11/7 に 22 から上げた。PC は winget の `OpenJS.NodeJS.LTS`。CI の `node-version`・`engines`・`@types/node` の major はテストでそろえる。npm はユーザーのフォルダの 11.5.2 が使われる |
| 時間                   | `npm run check` は約2分。CI は1回 1〜3分（遅い日は8分。`playwright install --with-deps` の Ubuntu のミラーが遅い）                                                                                                                                        |
| CI を待つ              | **バックグラウンドで待つ**。マージ前に、結果が PR の最新のコミット（headRefOid）のものか確かめる。「no checks reported」は未完了として扱う。tail などへのパイプで終了コードを隠さない                                                                     |
| `pipefail`             | `git grep` は見つからないと終了コード 1 を返し、`&&` の連鎖が止まる                                                                                                                                                                                       |
| `git push`             | `git push -u origin HEAD` は deny（main への push 防止の規則に当たる）。ブランチ名を書く                                                                                                                                                                  |
| `.claude/`             | **stash・checkout・reset で動かさない**。settings.json はすぐ読み直されるので、守りが外れる。変えたらすぐコミット                                                                                                                                         |
| Blender MCP            | 初回の `uvx` の準備は 52 秒で、30 秒の制限を超える。つながらないときは、オーナーのターミナルで `uvx …（.mcp.json と同じ）… blender-mcp --help` を1回実行してから `/mcp` で Reconnect                                                                      |
| Blender の起動         | `Start-Process -Credential` だけだとオーナーの環境変数を引き継ぐ。必ず `-LoadUserProfile -UseNewEnvironment -Environment $nbEnv`（手順書④）                                                                                                               |
| 外部への書き込み       | Dependabot の警告の dismiss など、GitHub の状態を変える API は auto モードに止められることがある → オーナーに画面で頼む                                                                                                                                   |
| projects.blender.org   | ページの取得は 403。Gitea の API（`/api/v1/repos/...`）と `git ls-remote`・`git clone` は使える                                                                                                                                                           |
| preview サーバー       | 自分で立ち上げた preview がポート 4173 に残ると、古い設定のまま見える。`netstat -ano` で確かめて止める                                                                                                                                                    |
| CI の E2E（約3fps）    | 速さなどは「その時点の値」と比べる（読んでいる間にも進む）。11/7 に PR #11 で失敗                                                                                                                                                                         |
| CI の E2E              | GPU がなく約2〜3fps。FPS の判定は手元だけ（`NORI_SKIP_FPS=1`）                                                                                                                                                                                            |
| 手元の FPS             | AMD Radeon（D3D11）、Chromium ヘッドレスで約60fps                                                                                                                                                                                                         |
| auto モード            | `gh repo create`、Claude 自身の権限設定の変更、外部から取ってきたコードの実行（`uvx` で MCP サーバーを試すなど）は止められる → オーナーに依頼                                                                                                             |
| ブランチ               | CI 緑でマージ済みのブランチは承認なしで削除してよい。push 済みのブランチは rebase せず merge で更新する                                                                                                                                                   |
| 時刻                   | 予定や報告で時刻を書く前に `date` で確かめる                                                                                                                                                                                                              |
| Rapier                 | `@dimforge/rapier3d-compat` 0.21.0。初期化は `physics.ts` で1回だけ                                                                                                                                                                                       |
| PowerShell の罠        | `switch` は要素1つの配列を開く（`@()`）。`$Matches` は上書きされる（破壊的なコマンドの対象に使わない）。関数に渡した `--` は消える                                                                                                                        |
| コミットの文           | PowerShell では here-string を `git commit -F -` に渡せない。一時フォルダのファイルに書いて `-F`。Bash の `printf` に `\U` を入れない（Unicode の指定と解釈される）。本文は heredoc で書く                                                                |
| Python                 | 外から取ったファイルは `python -I`。日本語の出力は `-X utf8` も足す                                                                                                                                                                                       |
| uv                     | `uv cache prune` が待ったままなのは、MCP サーバーが使用中のため。VS Code を閉じて外のターミナルで。`--force` は使わない                                                                                                                                   |
| GitHub                 | push や PR の作成が続けて失敗したら githubstatus.com を見る                                                                                                                                                                                               |
| Docker                 | 使わないときは Docker Desktop を終了する（12月の NORI-51 で使う）                                                                                                                                                                                         |
| PR                     | 重ねない。PR にコミットを足したら「VS Code でマージするなら再読み込みしてから」と添える                                                                                                                                                                   |
| テストの一覧           | 大きな機能（ステージ・ボス・物理の仕組み）は、`game-rules.md` との対応を添えた一覧を見せて承認を待つ。**承認した一覧は `docs/test-plans/NORI-xx.md` に残す**（承認の日時つき。11/13 にオーナーが指示）。小さな修正は PR に一覧を書いて進める              |
| kids-play              | 見本は kids-play のリポジトリの `docs/handoff-to-nori.md` 7章（playbook、provenance、動画の作り方、12月用の ci.yml）                                                                                                                                      |
| Blender の日本語の画面 | 新しく作ったノードの名前が翻訳される（`nodes.get("Principled BSDF")` が None）。ノードは種類（`n.type == "BSDF_PRINCIPLED"`）、入力は `identifier` で探す                                                                                                 |
| Blender のスクリプト   | noriblender が読み書きできるのは `blender-work/` だけ。`tools/blender/*.py` を `blender-work/tools/` に写してから MCP の `execute_blender_code` で `runpy.run_path`。作り直しは自分の `car` コレクションだけ（`REBUILD = True`）                          |
| バックスラッシュ       | `node -e` や Bash の文字列に入れると消えることがある（正規表現の `\s`、Windows のパス）。含む書き換えは Edit の道具で行う                                                                                                                                 |
| Hook と jq             | jq の `.key` が「鍵のファイル（.key）」と判定されて止まる。`map_values` などに書き換える                                                                                                                                                                  |
| 遅い CI の再現         | 手元で CDP の `Emulation.setCPUThrottlingRate`（20倍）を使うと、CI の約3fps に近い状態でテストできる                                                                                                                                                      |
| CodeQL                 | テストのコードも調べる。タグを正規表現で取り除く書き方（`replace(/<[^>]+>/g, "")`）は high の警告になる                                                                                                                                                   |
| 公開版の E2E           | `NORI_BASE_URL=https://hayato-f110.github.io/nori-adventure/ npm run e2e`                                                                                                                                                                                 |
| 時刻の変換             | Git Bash の `date -d` に `TZ=Asia/Tokyo` は効かない。UTC の値は +9 時間して書く                                                                                                                                                                           |
| 外部の料金             | 公式の説明のページと、申し込みの画面で値が違うことがある（11/7 の AI Plus）。判断の前に、申し込みの画面をオーナーに見てもらう                                                                                                                             |

## 5. Jira の MCP の使い方（書き込みは 11/4 に許可済み）

詳しくは `docs/jira/README.md`。cloudId はサイト名 `<サイト名>.atlassian.net` でも通る。

- 書き込み：`executeWrite`。削除系（`executeDestructive`）は deny。**スプリントの作成・開始・編集・終了は削除系の扱い**なので、オーナーに画面で頼む
- ステータス変更：`transitionJiraIssue` に `transitionId`（11＝未着手、21＝進行中、31＝完了）
  | Vitest と Git Bash | Git Bash の小文字の `c:` から Vitest を起動すると、二重に読み込まれて全件失敗する（vitest#11011）。11/12 に `npm test` を `tools/dev/vitest.ts` 経由にして直した。`npx vitest` を直接打たない |
  | Playwright を上げたら | `npx playwright install chromium` を手元で実行する（ブラウザの版が変わる） |
  | 隔離の確認（MCP から） | `isolation-check.py` は守る場所を引数で受け取る。MCP から動かすときは `sys.argv` に守る場所を入れる（入れないと `isolated: false`） |
  | GLB を Blender に読む | 部品（タイヤなど）は別の物体で、位置は GLB のまま。原点に戻さない |
  | 方針の変更 | 費用・公開される情報・品質への効果を先に調べてから文書にする（11/10 に同じ日に2回変えた） |

## 6. オーナーにお願いすること・今後の予定

| 事柄              | 状態                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| スプリント2の開始 | 済み（11/11）                                                              |
| Firefly           | 11/13：ローバー（NORI-40 の4本目）。11/13〜11/19 は NORI-44 の素材を1日1本 |
| 家族のテスト      | NORI-33（**11/15**、11/11 に前倒し）。タブレットの実機もここで             |
| スプリントの日付  | 済み（2＝〜11/13、3＝11/14〜11/17、4＝11/18〜11/23。11/12 に確認）         |
| 音量の目標        | NORI-47 は「-14 LUFS 前後」、kids-play は -18 LUFS。NORI-47 の前に決める   |
| Blender           | 使うときは手順書④のコマンドで noriblender として開く                       |
