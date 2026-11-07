# 引き継ぎ（次のセッション用）

> 最終更新：2026-11-07 20:36（スプリント1・3日目の終わり。`/end-day` で確認）
> 新しいセッションでは `/start-day` を使う（このファイル、`CLAUDE.md`、最新の devlog、Jira を読む）。
> 4週間の予定・成果物・学ぶことは `docs/schedule.md`。

## 1. いまの状態

| 項目       | 状態                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリ | `Hayato-F110/nori-adventure`（**公開**、11/7 18:38）。古い履歴は `nori-adventure-archive`（非公開。手元では `archive` リモート）。公開版 https://hayato-f110.github.io/nori-adventure/ 。ライセンスはコード MIT・素材 CC BY 4.0。開いている PR は 0。main の CI・Pages は緑        |
| Jira       | スプリント1（ID 4）は 11/5 09:00〜11/10 23:02。残りは **NORI-40** だけ（NORI-14 をスプリント2から前倒しして完了）                                                                                                                                                                  |
| 守り       | ルールセット「main を守る」、Secret scanning・Push protection、Dependabot、CodeQL、PVR。未対応の警告 0                                                                                                                                                                             |
| Blender    | 5.2.3。隔離は完了（11/7 も MCP で `isolated: true`・`isDedicatedUser: true`）。車は `C:\NoriBlender\work\car.blend`（作り方 `tools/blender/build-car.py`、書き出し `tools/blender/export-glb.py`）。スクリプトは `C:\NoriBlender\work\tools\` に写してから MCP で `runpy` で動かす |
| 車の画像   | `C:\NoriBlender\work\renders\car-front34.png`・`car-side.png`・`car-rear34.png`（1280×720、EEVEE。車と単色の地面・空だけ）                                                                                                                                                         |

### スプリント1

| 状態   | 課題                                                       |
| ------ | ---------------------------------------------------------- |
| 完了   | NORI-4、10、11、12、13、14、15、16、17、18、19、24、35、36 |
| 未着手 | **NORI-40** AI 映像テスト（11/8 の最初）                   |

## 2. 次の作業順（11/8〜）

1. **NORI-40（最初）**：オーナーが Google AI Plus に申し込み（3か月 月額 ¥180）→ **最初に「アクティビティを保持」をオフ**（https://myactivity.google.com/product/gemini）→ Claude が手順を渡し、上の車の画像3枚で 5秒×3本 → 使えるかを判断し、`docs/video/google-ai-plus.md` に結果。送るのは自作の車の画像だけ
2. スプリント1の締め（11/10）：Jira の画面での終了はオーナー（削除系の扱い）。sprint1.md の表を最終にそろえる
3. スプリント2：**NORI-25 ステージ1**（コース・ほし・チェックポイント・ゴール）。大きな機能なので、`game-rules.md` との対応を添えたテストの一覧を先に見せる。Jira の NORI-25 にカメラ（壁に入る）と窓の柱のメモあり
4. 1日の終わりに `/end-day`

## 3. 残課題・メモ

- **Google AI Plus の解約**：**12/1 ごろ**（紹介動画の後、3か月目の終わりより前。その後は月額 ¥725）。申し込んだら日付を確定してここに書く
- **カメラ**：後ろ向きで壁に押し付けると、カメラが壁の中に入る → NORI-25 で直す
- **家族のテスト（NORI-33）で見ること**：親指がハンドルの右いっぱい・◀ に届くか、ハンドルを「スライド」と分かるか、◀ を「左」と取り違えないか、長押しのメニュー（Jira にメモ）
- **空のステージ（NORI-27）**：タッチのボタンの見えやすさ（背景との差が約 3:1）を確かめる（Jira にメモ）
- **紹介動画**：ゲームは軽いローポリのまま。見せ場は同じモデルを Blender できれいに描いたカット（NORI-41 にメモ）
- **TypeScript 7**：typescript-eslint の最新 8.72.1 でも `<6.1.0`。対応したら `dependabot.yml` の `ignore` を外す
- **minimatch**：`overrides` で 11.0.5（11/7）。eslint（最新 10.14.0）が 11 系を使うようになったら `overrides` と `supply-chain.test.ts` の該当のテストを外す
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
| Blender のスクリプト   | noriblender はオーナーのフォルダを読めない。`tools/blender/*.py` を `C:\NoriBlender\work\tools\` に写してから MCP の `execute_blender_code` で `runpy.run_path`。作り直しは自分の `car` コレクションだけ（`REBUILD = True`）                              |
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

## 6. オーナーにお願いすること・今後の予定

| 事柄              | 状態                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Google AI Plus    | **11/8 の最初に申し込み**（3か月 月額 ¥180、その後 ¥725）。申し込んだら最初に「アクティビティを保持」をオフ。**解約は 12/1 ごろ** |
| スプリント1の終了 | 11/10。Jira の画面で終了する（MCP では削除系の扱い）                                                                              |
| 家族のテスト      | NORI-33（11/21）。タブレットの実機もここで                                                                                        |
| 音量の目標        | NORI-47 は「-14 LUFS 前後」、kids-play は -18 LUFS。NORI-47 の前に決める                                                          |
| Blender           | 使うときは手順書④のコマンドで noriblender として開く（ダブルクリックでは開かない）                                                |
