# 引き継ぎ（次のセッション用）

> 最終更新：2026-11-12 16:15（5時間の使用量 91% で区切った）
> 新しいセッションでは `/start-day` を使う（このファイル、`CLAUDE.md`、最新の devlog、Jira を読む）。
> 4週間の予定・成果物・学ぶことは `docs/schedule.md`（11/10 の計画の変更は「決まったこと」と「変更後のスプリント」）。

## 0. 11/12 16:15 の状態

- **完了**：NORI-20〜23・25〜28・54・56・58・60・62。PR #24〜#46 はマージ済み
- **Jira の開始日**（`customfield_10015`）：未完了のストーリー全部に、`docs/schedule.md` の日割りどおりの開始予定日を入れた。作業を始めたら「進行中」にして、実際の開始日に書き換える
- **NORI-59（ステージ2の景色と列車。進行中、ブランチ `feature/NORI-59-stage2-scenery`）**：決まりの案とテストの一覧はオーナーが OK（1つの PR にまとめる・列車を選ぶのはステージ2の始めの絵のボタン3つ・速さと操作は3つとも同じ・すれ違う電車は左 4.2 m を逆向き 8 m/s・富士山風の山は 400 m 先に霧に左右されない遠景・海辺は南側 z > 105 m・雲 10 個・Blender で山3種と駅）
  - 全部できた（11/12 夜。PR を出した）：選べる列車2種（`train-commuter`・`train-bullet`）、列車を選ぶ絵のボタン3つ、すれ違う電車（2本目の線路）、海辺、富士山風の山（霧を効かせない遠景）、雲、Blender の山3種（`tools/blender/build-stage2-models.py`。頂点の色）と駅。CI が緑ならマージ → Jira を完了
  - 光のベイク（ステージ2の地面の陰）は焼き直していない（山の場所・大きさは同じ）。見た目がずれていたら `bake-stage2-ao.py` で焼き直す
  - 頂点の色で塗るモデルは `export-glb.py` に `"VERTEX_COLOR": "ACTIVE"`（既定だと COLOR_0 が白になる）。bmesh で色を入れると sRGB とみなされて暗くなるので、属性の `.color`（線形）に入れる
  - Blender の MCP：ファイルを開く（`open_mainfile`・`read_homefile`）のと、スクリプトを動かすのは、別の実行に分ける（同じ実行だと `bpy.context.object` がなくて止まる）
- **11/13（スプリント2の最終日）にスプリントのふりかえり**（`CLAUDE.md`「進め方」。11/12 にオーナーが決めた）：devlog のあと `docs/retro/sprint-2.md`。材料は Jira のポイント、CI の失敗（たまに落ちる車の E2E）、オーナーの指摘（試行錯誤・Jira の状態と開始日・シェルの引用符のミス）
- **ステージ1の車の E2E はたまに落ちる**：PR #46 で、建物に触れた回数 7（ステージ1は変えていない）。流し直すと 0 で通った。本物の時間でキーを押すので、入力が入る刻みが回ごとに変わるのが原因と考える。NORI-37 か NORI-34 で、入力の記録の再生で走らせる形に直す案
- **NORI-40（AI 動画）**：車・飛行機・潜水艇は済み。**11/13：オーナーが Firefly でローバー**（指示の文は `blender-work/ai-video/sub-prompt.txt` をローバーに直す）→ 4本を比べて判断・完了。Jira の説明は 11/12 に直した
- **Blender**：noriblender で開いたまま（11/12 15:50 に隔離を確認、`isolated: true`）。新しいセッションで使う前に、もう一度隔離を確かめる
- **覚えておくこと**
  - **数値は試行錯誤で決めない**（`CLAUDE.md` ゲーム仕様のルール6）。three.js は 色 → 光 → AgX → 霧（カメラからの距離）→ 上限 1。背景は AgX を通らない
  - 遅い CI で動く物を測るときは `window.__nori.freeze(true)` で時間を止めてから読む（ステージ4）
  - 素材を足したら `src/render/look.ts` の `STAGE_SURFACES` にも足す（使うステージだけが読む）
  - Git Bash の小文字の `c:` から Vitest を動かすと全部落ちる（vitest#11011）→ 11/12 に `tools/dev/vitest.ts`（ドライブ名を大文字に直して起動）で直した。`npm test`・`npm run check` はどこからでもよい。`npx vitest` を直接打たない
  - 画質の処理は `src/render/qualityControl.ts`。GPU のない CI では自動で低画質に下がる。E2E で画質を決めつけない
  - 手元の FPS の E2E は、PC で重い処理（別のプロジェクトの学習など）が動いていると落ちる。落ちたら画質と最低の FPS の出力を見る

## 1. いまの状態

| 項目       | 状態                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリ | `Hayato-F110/nori-adventure`（公開）。公開版 https://hayato-f110.github.io/nori-adventure/ 。開いている PR は 0（11/10 夜の時点）                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 計画       | **ブラウザ版＋PWA（GitHub Pages、無料）**。Android アプリ・Google Play は 11/10 に見送り（`docs/android/play-release.md`）。見た目はリアル寄り（NORI-56）、リプレイ（NORI-57）を追加                                                                                                                                                                                                                                                                                                                                                                                   |
| Jira       | スプリント1は終了（オーナーが画面で）。スプリント2（ID 5）は 11/11 10:43 に開始済み。終わりの日付は 11/13 23:00（直し済み。11/12 に Jira で確認）。スプリント3＝11/14〜11/17、4＝11/18〜11/23                                                                                                                                                                                                                                                                                                                                                                          |
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
| テストの一覧           | 大きな機能（ステージ・ボス・物理の仕組み）は、`game-rules.md` との対応を添えた一覧を見せて承認を待つ。小さな修正は PR に一覧を書いて進める                                                                                                                |
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
