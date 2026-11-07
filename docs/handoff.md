# 引き継ぎ（次のセッション用）

> 最終更新：2026-11-07 00:45（スプリント1・2日目の終わり。`/end-day` で確認）
> 新しいセッションでは `/start-day` を使う（このファイル、`CLAUDE.md`、最新の devlog、Jira を読む）。
> 4週間の予定・成果物・学ぶことは `docs/schedule.md`。

## 1. いまの状態

| 項目       | 状態                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリ | `Hayato-F110/nori-adventure`（**公開**、11/7）。古い履歴は `nori-adventure-archive`（非公開）。開いている PR は 0                       |
| Jira       | スプリント1（ID 4）は 11/5 09:00〜11/10 23:02。31pt のうち **20pt 完了**                                                                |
| Blender    | 5.2.3。**隔離は完了（NORI-17）**。MCP（Blender Lab 版 v1.0.3、`.mcp.json` でコミット固定）はつながる。`_for_cli` の6つは deny           |
| 供給網     | Dependabot（npm・Actions、毎週月曜 9:00 JST）、CI の `npm audit --audit-level=high` と SBOM。未対応の警告 0（minimatch は受け入れ済み） |

### スプリント1

| 状態   | 課題                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 完了   | NORI-4、NORI-11、NORI-12、NORI-13、NORI-15、NORI-24、NORI-35、**NORI-17 Blender MCP の隔離**                                |
| 進行中 | NORI-10（main の保護は公開後）、**NORI-36**（CodeQL・Secret scanning・Push protection は公開後）                            |
| 未着手 | NORI-18 アセットの流れ、NORI-19 車のモデル、NORI-16 Pages（**スプリント1に残す**＝11/10 までに公開）、NORI-40 AI 映像テスト |

## 2. 次の作業順（11/7〜）

1. **NORI-18**：アセットの流れ（Blender → GLB → `public/models/`）。完了条件「1台分が自動でゲームに読み込まれる」。先にテストの一覧（`game-rules.md` との対応）を見せる
   - Blender は手順書④のコマンド（`-LoadUserProfile -UseNewEnvironment -Environment $nbEnv`）で開いてもらう。**ダブルクリックで開くとオーナーのユーザーで動く（隔離の外）**
   - 作業ファイルは `C:\NoriBlender\work\`、書き出しは `C:\NoriBlender\work\export\`
2. **NORI-19**：車のモデル（ローポリ・オリジナル）。NORI-18 の流れで読み込む
3. **公開の準備（NORI-16 の前提）**：`docs/security/public-release-checklist.md` 3章の表の1〜4（Claude）。**11/8 までに公開**、11/9 に Pages、11/10 は予備
   - 2で `uv tool install git-filter-repo`、まっさらな clone、置き換えの一覧はスクラッチだけに置く
4. **NORI-16**：Pages への自動デプロイと CSP（公開のあと）。公開直後に NORI-36 の残り（CodeQL・Secret scanning）とルールセットも
5. **NORI-40**：車のモデルができてから。契約の前に Google AI Plus の料金・規約を公式で確かめる
6. 1日の終わりに `/end-day`

## 3. 残課題・メモ

- **カメラ**：後ろ向きで壁に押し付けると、カメラが壁の中に入る（画面はふさがらない）。カメラを上に逃がす案を検討（PR #12）
- **E2E**：実際の12秒かつゲーム内6秒まで走る（PR #32）。CI はゲーム内 6.2 秒・平均 9.9 m/s
- **リモートの古いブランチ**：マージ済みの `feature/NORI-*` 9本と `dependabot/...npm-minor-patch...` は消してよい（決まりどおり `git push origin --delete`）。`dependabot/.../types/node-26.6.6`・`typescript-7.0.2` は未マージ（Dependabot が閉じた PR）なので、消すならオーナーの承認
- **TypeScript 7**：typescript-eslint が対応したら（TS 7.1 で API）、`dependabot.yml` の `ignore` を外す
- **minimatch**：eslint が 11 系を使うようになったら更新し、警告 #1 を確かめる
- **脅威分析 B-02**：DNS は止まらない（受け入れ）

## 4. 環境で分かっていること（つまずき防止）

| 事柄                 | 内容                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| シェル               | Git Bash と PowerShell 7。Hook が `.env` という文字列を含むコマンドを止める（検索パターンでも）。`en[v]` のように書くか、テストでは実行時に組み立てる                                                                                                     |
| npm                  | 版は**最新の安定版**でよい（11/6 に2週間ルールを廃止）。入れる前に公式の変更履歴を確かめる。three.js は semver に従わない（minor でも移行ガイドを見る）                                                                                                   |
| Node                 | **26.13.0**（Active LTS、2026-10-28 から。サポートは 2029-04 まで）。11/7 に 22 から上げた。PC は winget の `OpenJS.NodeJS.LTS`。CI の `node-version`・`engines`・`@types/node` の major はテストでそろえる。npm はユーザーのフォルダの 11.5.2 が使われる |
| 時間                 | `npm run check` は約2分。CI は1回 1〜3分（遅い日は8分。`playwright install --with-deps` の Ubuntu のミラーが遅い）                                                                                                                                        |
| CI を待つ            | **バックグラウンドで待つ**。マージ前に、結果が PR の最新のコミット（headRefOid）のものか確かめる。「no checks reported」は未完了として扱う。tail などへのパイプで終了コードを隠さない                                                                     |
| `pipefail`           | `git grep` は見つからないと終了コード 1 を返し、`&&` の連鎖が止まる                                                                                                                                                                                       |
| `git push`           | `git push -u origin HEAD` は deny（main への push 防止の規則に当たる）。ブランチ名を書く                                                                                                                                                                  |
| `.claude/`           | **stash・checkout・reset で動かさない**。settings.json はすぐ読み直されるので、守りが外れる。変えたらすぐコミット                                                                                                                                         |
| Blender MCP          | 初回の `uvx` の準備は 52 秒で、30 秒の制限を超える。つながらないときは、オーナーのターミナルで `uvx …（.mcp.json と同じ）… blender-mcp --help` を1回実行してから `/mcp` で Reconnect                                                                      |
| Blender の起動       | `Start-Process -Credential` だけだとオーナーの環境変数を引き継ぐ。必ず `-LoadUserProfile -UseNewEnvironment -Environment $nbEnv`（手順書④）                                                                                                               |
| 外部への書き込み     | Dependabot の警告の dismiss など、GitHub の状態を変える API は auto モードに止められることがある → オーナーに画面で頼む                                                                                                                                   |
| projects.blender.org | ページの取得は 403。Gitea の API（`/api/v1/repos/...`）と `git ls-remote`・`git clone` は使える                                                                                                                                                           |
| preview サーバー     | 自分で立ち上げた preview がポート 4173 に残ると、古い設定のまま見える。`netstat -ano` で確かめて止める                                                                                                                                                    |
| CI の E2E            | GPU がなく約2〜3fps。FPS の判定は手元だけ（`NORI_SKIP_FPS=1`）                                                                                                                                                                                            |
| 手元の FPS           | AMD Radeon（D3D11）、Chromium ヘッドレスで約60fps                                                                                                                                                                                                         |
| auto モード          | `gh repo create`、Claude 自身の権限設定の変更、外部から取ってきたコードの実行（`uvx` で MCP サーバーを試すなど）は止められる → オーナーに依頼                                                                                                             |
| ブランチ             | CI 緑でマージ済みのブランチは承認なしで削除してよい。push 済みのブランチは rebase せず merge で更新する                                                                                                                                                   |
| 時刻                 | 予定や報告で時刻を書く前に `date` で確かめる                                                                                                                                                                                                              |
| Rapier               | `@dimforge/rapier3d-compat` 0.21.0。初期化は `physics.ts` で1回だけ                                                                                                                                                                                       |
| PowerShell の罠      | `switch` は要素1つの配列を開く（`@()`）。`$Matches` は上書きされる（破壊的なコマンドの対象に使わない）。関数に渡した `--` は消える                                                                                                                        |
| コミットの文         | PowerShell では here-string を `git commit -F -` に渡せない。一時フォルダのファイルに書いて `-F`。Bash の `printf` に `\U` を入れない（Unicode の指定と解釈される）。本文は heredoc で書く                                                                |
| Python               | 外から取ったファイルは `python -I`。日本語の出力は `-X utf8` も足す                                                                                                                                                                                       |
| uv                   | `uv cache prune` が待ったままなのは、MCP サーバーが使用中のため。VS Code を閉じて外のターミナルで。`--force` は使わない                                                                                                                                   |
| GitHub               | push や PR の作成が続けて失敗したら githubstatus.com を見る                                                                                                                                                                                               |
| Docker               | 使わないときは Docker Desktop を終了する（12月の NORI-51 で使う）                                                                                                                                                                                         |
| PR                   | 重ねない。PR にコミットを足したら「VS Code でマージするなら再読み込みしてから」と添える                                                                                                                                                                   |
| テストの一覧         | 大きな機能（ステージ・ボス・物理の仕組み）は、`game-rules.md` との対応を添えた一覧を見せて承認を待つ。小さな修正は PR に一覧を書いて進める                                                                                                                |
| kids-play            | 見本は kids-play のリポジトリの `docs/handoff-to-nori.md` 7章（playbook、provenance、動画の作り方、12月用の ci.yml）                                                                                                                                      |

## 5. Jira の MCP の使い方（書き込みは 11/4 に許可済み）

詳しくは `docs/jira/README.md`。cloudId はサイト名 `<サイト名>.atlassian.net` でも通る。

- 書き込み：`executeWrite`。削除系（`executeDestructive`）は deny。**スプリントの作成・開始・編集・終了は削除系の扱い**なので、オーナーに画面で頼む
- ステータス変更：`transitionJiraIssue` に `transitionId`（11＝未着手、21＝進行中、31＝完了）

## 6. オーナーにお願いすること・今後の予定

| 事柄             | 状態                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blender          | NORI-18 で使う。手順書④のコマンドで noriblender として開く                                                                                                                                 |
| リポジトリの公開 | **11/8 まで**。方法は新しい公開リポジトリに移す（チェックリスト3章）。オーナーは最終確認・`gh repo rename`・`gh repo create`・main の push（コマンドは当日に公式の資料で確かめてから渡す） |
| 音量の目標       | NORI-47 は「-14 LUFS 前後」、kids-play は -18 LUFS。NORI-47 の前に決める                                                                                                                   |
| Google AI Plus   | NORI-40（車のモデルができてから）。契約はオーナー。契約の前に料金・規約・データの扱いを確かめる（脅威分析 V-02）                                                                           |
