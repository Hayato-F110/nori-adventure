# 引き継ぎ（次のセッション用）

前の状態は Git の履歴にある。ここには今の状態だけを書く（`tests/docs/handoff.test.ts` が守る）。

## 今の状態（最終更新 2026-11-19 18:23。スプリント4の 1 日目、end-day 済み。使用量 97% で止めた）

**スプリント**（日付は Jira。詳しくは `docs/schedule.md`）

| スプリント | 日付         | ゴール                                        |
| ---------- | ------------ | --------------------------------------------- |
| 4          | 11/19〜11/21 | 家族のテストで直した v1.0 を公開 URL で出す   |
| 5          | 11/22〜11/25 | v1.0 のあとの仕上げと作りの整え               |
| 6          | 11/26〜11/30 | 紹介動画（5〜7 分）、ふりかえりと 12 月の計画 |

**CI 待ちの PR（緑ならマージして閉じる）**

| PR   | 課題    | マージのあと                                                                                                                                                       |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #111 | NORI-89 | 完了条件を読み直し、証拠の表をコメントに書いて完了。この PR は `docs/handoff.md` を直しているので、記録の PR（NORI-93）とぶつかったら、記録の PR の引き継ぎを残す  |
| #112 | NORI-86 | CI の報告の添付（`stageN-covered.json`・`stageN-judged.json`）から、CI がどちらの道（判定の前・あと）を通ったかを PR に書く → 刈り取りの表の結果を埋める PR → 完了 |
| #113 | NORI-85 | 結果を書く文書の PR。マージのあと NORI-85 を完了に移す（Hook `harvest-before-done` が origin/main の表を読む）                                                     |

**作業中**

- NORI-65（ボスのモデル）：作業場所 `.claude/worktrees/NORI-65`（ブランチ `feature/NORI-65-boss-model`）に 67dbcce をコミット（プッシュしていない）。赤は 9 件落ちを確かめた（`rules-sync` 7・`manifest` の build-boss 2 が一度通るはずのもの。`inspect.test.ts`・`bossModel.test.ts` は設定と `bossModel.ts` がなくファイルごと落ちた。PR に書く）
  - モデル：`tools/blender/build-boss.py` で作り、`blender-work/boss.blend` に保存。三角形 3,332、8.06 × 6 × 6.68 m、顔の前の端 3.62 m、親子なし。確かめの絵は `blender-work/renders/boss/`（front・side・front-smile）
  - 次：Blender を `/blender-start` で開き隔離を確かめる → `export-glb.py`（NAME boss）→ `npm run assets:import boss`（作業場所には `blender-work` がないので、取り込み元を本体の `blender-work/export` にする指定を `tools/assets/import.ts` で確かめる）→ 設定（`ASSET.boss`・`BOSS.puffScale`）・`GlbReport` の `parts`・`bossModel.ts`・`__nori.bossModel`・`bossMouthNodes` → E2E・FPS・スクリーンショット → `/code-review` → PR
- NORI-87（タップで音が動き出す E2E）：作業場所 `.claude/worktrees/NORI-87` を作り、進行中にした。テストの一覧から
- NORI-92（`npm run check` をパイプにつないだら止める Hook）：スプリント4、開始日 11/20
- 片付け：作業場所 `NORI-85`（ブランチ `feature/NORI-85-harvest`、#113）・`NORI-86`（#112）・`NORI-89`（#111）は、マージのあとに片付ける（つなぎを `cmd /c rmdir` で外してから。本体の node_modules は 116）

**11/20 の順番**

1. #111・#112・#113 の CI を見て、緑ならマージして NORI-89・86・85 を閉じる
2. NORI-65 の続き（Blender から。オーナーに `/blender-start` で開いてもらう）
3. NORI-87 → NORI-92。家族のテスト NORI-33（期限 11/20）はオーナーと日程を決める

**オーナーにお願いすること**

- NORI-93（スプリント4の日々の記録）をスプリント4に入れる
- NORI-65 の続きの前に、Blender を開く（パスワードを入れる）
- NORI-33（家族のテスト）の時間

**つまずき防止**

- プッシュはブランチの名前を書く（`git push -u origin feature/NORI-xx-…`）。`git push -u origin HEAD` は、main を守る拒否の決まりに当たって止まる。プッシュ・PR・マージは別々の操作で行う
- `npm run check` は出力をファイルに書き、終了コードを `$?` で見る（パイプにつなぐと落ちても緑に見える）。長い処理は裏で流す（Hook `guard-long-foreground`）
- コードを変える PR で `/code-review` のあとに直しのコミットを足すと、Hook `review-before-pr` が PR を止める。今は直しのコミットだけを `/code-review low` で回し、PR に「N5 のずれ」と書く（NORI-83 で直す）
- わざと壊す確かめは、型の検査を通る壊し方にする（通らないと作り直しで止まり、E2E まで進まない）。狙いの行で落ちたかまで見る
- 遷移と開始日を一緒に送ると Jira が断る（遷移の画面にその欄がない）。遷移と `editJiraIssue` を分ける。遷移は `transitionName`（「進行中」「完了」）で指定できる
- 課題を閉じる前に、全部の一覧からその課題の行を探す（`MSYS_NO_PATHCONV=1 git grep -n "| NORI-xx " origin/main -- docs/test-plans`）
- 使用量は 80% を目安に、大きな作業の前に確かめる
