# 引き継ぎ（次のセッション用）

> 最終更新：2026-11-13 19:50（夜：NORI-69 の PR #60・NORI-68 の PR #62 が CI 待ち。NORI-70 は #60 のマージのあとに始める）
> 新しいセッションでは `/start-day` を使う（このファイル、`CLAUDE.md`、最新の devlog、Jira を読む）。
> 4週間の予定・成果物・学ぶことは `docs/schedule.md`（11/10 の計画の変更は「決まったこと」と「変更後のスプリント」）。

## 0. 11/13 19:50 の状態（スプリント3の1日目）

**スプリント**：スプリント2は 11/13 10:20 に終了（15 件・40 ポイントすべて完了）。スプリント3は 11/13 10:48 に開始（終了 11/17 23:00）。

**今日マージしたもの**

- 午前：PR #53 NORI-37（運転役）、#55 NORI-66（早送り）、#54 NORI-29（ステージ5）、#52 NORI-61（街の車・人。**スプリント3に入っている**。前の引き継ぎの「入っていない」は誤りだった）、#56（引き継ぎ）
- PR #57 NORI-63（ほかの車がすり抜けない）→ Jira 完了
- PR #58 スプリント2のふりかえり（`docs/retro/sprint-2.md`。オーナー承認）と改善：CLAUDE.md「E2E は2種類に分ける」、Hook `guard-long-foreground`（長い処理を裏で動かす指定なしに呼ぶと止める）・`guard-jira-fields`（Jira のポイント・期限・開始日が空なら止める）、`/end-day` に最終日のふりかえり
- PR #59 NORI-67（ステージ4のきらきらの E2E）→ Jira 完了。原因はテストが6粒のうち1粒だけを測り、潜水艇の止まる位置が時間しだいで陰に入ったこと。運転役＋早送りで、止まる位置が毎回同じになった

**作業中（夜）**

- **NORI-69（PR #60、worktree `.claude/worktrees/NORI-69`。Jira 進行中）**：レビュー待ちに切り替えた。e2e が2回落ちた（1回目：変えていない `privacy.spec.ts` の全画面のスクリーンショットが「撮れない」。初めて。2回目：ステージ3の見た目（高画質）で明るさの比 1。本物の時間で飛ぶため止まる位置が変わる。NORI-71 で直すもの）。どちらも値は変えず、落ちた e2e だけ流し直した。緑なら裏の見張りがマージする（セッションが切れると見張りも止まるので、`gh pr view 60` で確かめる）
  - 中身：テストの一覧の2列、初見レビュー2回（指摘 49＋49。`docs/test-plans/reviews-2026-11-13.md` に全部 ID・行き先・結果）、**一覧の表のハッシュ値の検査**（レビュー・承認の行にない表は落ちる）、一致テストを広げた、E2E 6 つを運転役に、見た目の E2E の画面の添付（`attachShot`）、`BOSS.carryLimit` を消した
  - 3つの一覧（NORI-29・61・63）はオーナー承認ずみ（19:03）
  - **完了にしない**：完了条件の「レビューの表の刈り取り」は NORI-70 のあと
- **NORI-68（PR #62、worktree `.claude/worktrees/NORI-68`。Jira 進行中）**：カバレッジ。下限は案 A（命令 97・分岐 89・関数 99・行 98）。分岐 93.07%。#60 と同じ `tests/core/stage5.test.ts` を変えているが、`git merge-tree` で**衝突なし**を確かめた（11/13 夜）。CI が緑なら、#60 を待たずにマージしてよい。マージしたら Jira 完了（完了条件：CI の表・ルールに関わる分岐の一覧・下限をオーナーと決めた → すべて済み）
- **この PR（devlog と引き継ぎ）**：worktree `.claude/worktrees/devlog-1113`

**オーナーが決めたこと（11/13 夜）**

- 一覧を変えたら、承認の前に初見レビューを回し直す。表のハッシュ値をレビューか承認の行に書く。**回すのは2回まで**、残りはオーナーの承認で閉じる
- 一般的でない用語を使わない（HUD → 上の表示）。必要な用語は初出で一言の意味を添える
- NORI-70 は分けずにポイント 3 → 5（37 件）。R2-29-40（クリアのあと入力を受け付けない）を NORI-70 で足す
- NORI-71（ステージ3・4の見た目の E2E を運転役に。2 ポイント、11/16 → 11/17）を NORI-69 から分けた
- `BOSS.carryLimit` は設定から消す

**次にやること**

1. PR #60 のマージを確かめる → 本体の main を `pull --ff-only` → NORI-69 の worktree とブランチを片付ける（`git worktree remove`・`git branch -d`）
2. PR #62 に main を取り込む → CI → マージ → NORI-68 完了
3. **NORI-70**（37 件。11/14 → 11/16）を `origin/main` から。最初に、表の 29-14 の行を「NORI-69 で直した」に、テストの名前の「高さより上」を「以上」に直す。ステージ5 → 街 → E2E の順。Jira NORI-70 のコメントに 28 行の ID
4. NORI-71 → NORI-64・38・57・42（実装の前に一覧の2列と初見レビュー2回まで）→ 11/17 ふりかえり（前回の改善が効いたかを数値で）
   - NORI-71 の一覧を書くときに分かっていること（11/13 夜に調べた。一覧はまだ書いていない）：飛行機は入力なしでも 14 m/s（`cruiseSpeed`）、潜水艇は 4 m/s で進む。**`waitForGo` を使うと、待った時間で止まる位置が変わる**ので、見た目のテストは NORI-67 と同じく1刻み目から運転役が動かす。ステージ3は、輪まで 60 m で手を離し、水平に戻った刻み（bank・pitch が 0）で `freeze`。ステージ3のカメラは `lerp` で追うので（`src/stage3Main.ts` 185 行目）、止めたあとカメラが動かないこと（同じ点の画面の位置が2コマで同じ）も確かめる。ステージ4は `installSubApproachDriver` の目標に、たからばこを選べるようにする
5. **待つときは、同じファイルを触らない別の課題を探して進める**（11/13 にオーナーの指摘）

**覚えておくこと（今日わかったこと）**

- **worktree を作ったら、すぐ node_modules を本体にジャンクションでつなぐ**（PowerShell の `New-Item -ItemType Junction`。Git Bash の `mklink` は書き方の変換で通らない）。つながないと、書いたときの自動の整形が動かず、CI が整形で落ちる（PR #58 で起きた）
- **テストの一覧は、実装をわざと壊して落ちるかを確かめる**（NORI-63 の 2 は、壊しても通るテストだった）
- **E2E のクリア・近づく場面は運転役＋早送り**（`stepsPerFrame: 20`）。止める場面は運転役が `freeze` を呼ぶ（`installSubApproachDriver`）。FPS を測るテストでは早送りを使わない
- **`waitForFunction` に渡す関数はブラウザの中で動く**。外の関数を呼ぶ書き方（`() => f()`）は使えない。関数そのものを渡す
- **`npx playwright test` の絞り込みが効かず、全部流れることがある**（Git Bash から）。PowerShell からは `-g` が効いた
- **Blender は noriblender で開いたまま**（11/13 11:52 に隔離を確認）。スプリント3の残りに、Blender の長い作業はない
- **worktree の中のファイルを渡すときは、リンクを `.claude/worktrees/…` から書き、`test -f` で確かめる**
- **`blender-work/` は本体のフォルダのもの**（worktree の中ではない）。noriblender が読めるのは本体だけ
- **push はブランチ名を明示する**（`git push origin feature/NORI-xx-…`）。`git push origin HEAD` は、main への push を防ぐ権限の設定で拒否される（正常）- **11/13 夕方、VS Code の再起動と Claude Code のログアウトが起きた**：前に道具が「403：Cloudflare（Anthropic の通信の入口）に止められた」を返していた。裏の見張りはセッションが切れると止まるので、再開したら PR の状態を `gh pr view` で確かめ、見張りを張り直す

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
