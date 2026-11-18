# 引き継ぎ（次のセッション用）

前の状態は Git の履歴にある。ここには今の状態だけを書く（2026-11-18 のふりかえり I3。`tests/docs/handoff.test.ts` が守る）。

## 今の状態（最終更新 2026-11-18 19:00。スプリント3の最終日、end-day 済み）

**スプリント**（オーナーが 11/18 に決め、Jira に作った。詳しくは `docs/schedule.md`・`docs/retro/sprint-3.md`）

| スプリント | 日付         | ゴール                                        | 課題                                                           |
| ---------- | ------------ | --------------------------------------------- | -------------------------------------------------------------- |
| 4          | 11/19〜11/21 | 家族のテストで直した v1.0 を公開 URL で出す   | NORI-89・90・65・85・86・87・33・34・49・39・38（17 ポイント） |
| 5          | 11/22〜11/25 | v1.0 のあとの仕上げと作りの整え               | NORI-79・57・64・75・80・32（NORI-81・83 は NORI-89 で決める） |
| 6          | 11/26〜11/30 | 紹介動画（5〜7 分）、ふりかえりと 12 月の計画 | NORI-41〜48・50・51                                            |

**スプリント3を閉じる前に**

- NORI-72・NORI-84 は完了（11/18）。NORI-73 は PR #106（ほかの一覧にある NORI-73 の行）が緑でマージされたら、完了条件を読み直して閉じる。そのあとオーナーがスプリント3を終える（Jira の画面）

**作業中：NORI-65（ボスのモデル。スプリント4から前倒し）**

- 作業場所 `.claude/worktrees/NORI-65`（ブランチ `feature/NORI-65-boss-model`）。ルールと一覧はコミット済み（5f65970。オーナーが承認、ハッシュ値 f0011296。顔の出っぱりは案 A）
- 赤のテストを書いている途中で、コミットしていない：`tests/assets/fixture.ts`（`makeBossGlb`）・`inspect.test.ts`（ボスの節）・`manifest.test.ts`（`build-boss.py` の節）・`tests/render/bossModel.test.ts`（新しく）・`e2e/stage5.spec.ts`（入口までの関数・見た目・FPS）
- 残り：`e2e/stage-clear.spec.ts:207` に `bossMouthNodes` が `["mouth_smile"]` を足す → 赤を流して落ちたテストを記録 → 設定（`ASSET.boss`・`BOSS.puffScale`）・`GlbReport` の `parts`・`bossModel.ts`・`__nori.bossModel`・`bossMouthNodes` を実装 → オーナーが `/blender-start` で Blender を開く → `tools/blender/build-boss.py` → `npm run assets:import boss` → E2E・FPS・スクリーンショット → `/code-review` → PR
- 一覧からの変更 1 つ（PR に書く）：FPS のテストで早送りをやめるのは「`stepsPerFrame` を 1 に」でなく「消す」（1 だと 1 コマ 1 刻みで、本当より軽く測る）

**11/19 の順番**

1. 朝（1〜1.5 時間）：NORI-89 ルールの見直し。オーナーが `/doctor prompt-audit` → `/doctor` → `/skill-doctor` を打つ。Claude がその結果と Hook の止めた回数（NORI-89 のコメント 10146）を `docs/retro/rule-review-2026-11-19.md` の表にし、外す・まとめる・残すの案を出す。NORI-81・83 を要るかもここで決める。11/18 夜に `git push` が許可の判定で拒否された件も、ここで扱う
2. NORI-90（課題を作るときにスプリントを指定したら止める Hook）
3. NORI-65 の続き（上）・NORI-85・86・87
4. 夕方：家族のテスト（NORI-33）

**片付け**

- マージのあと、作業場所 `NORI-73y`・`devlog-1118b` を片付ける（つなぎを `cmd /c rmdir` で外してから。本体の node_modules は 11/18 夜に隠しも含めて数えて 117）。止めている作業場所 `NORI-42`・`57`・`64`・`83` は残す
- リモートに残っているマージ済みのブランチ：`feature/NORI-84-harvest`・`feature/NORI-72-devlog-2026-11-18`（プッシュが拒否されるので消していない）

**ほかに覚えておくこと**

- picomatch の除く表の見直す日は 2026-11-25。その日を過ぎると CI が落ちる（`tools/ci/audit-allow.json`）
- NORI-38：v1.0 を出す日（11/21）に、実機で新しい版への切り替えを確かめる（画面をすべて閉じ、2 回開き直して、ボスのモデルが新しいこと）
- NORI-83 の作業場所には、初見レビュー 1 回目の行（指摘 13、ハッシュ値 587b1d4b）がある。続けるかは NORI-89 で決める

**つまずき防止**

- 11/18 夜から、`git push`（`gh pr create` と、プッシュからマージまでを 1 つにした台本も）が許可の判定で拒否される。迂回しない。オーナーに手でプッシュしてもらい、PR とマージは別々の操作で行う
- 課題を閉じる前に、全部の一覧からその課題の行を探す（`MSYS_NO_PATHCONV=1 git grep -n "| NORI-xx " origin/main -- docs/test-plans`）
- Jira の遷移は `transitionId`（`transition` ではない）。課題の種類はストーリー（10005）かバグ（10039）、親のエピックを付ける。タスク（10040）は使わない
- Git Bash で `git show origin/main:.github/...` は、パスが書きかえられて失敗する。`MSYS_NO_PATHCONV=1` を前に付ける
- `/code-review` は、作業場所の差分を指定して呼ぶ（指定しないと main を見る）
- `gh pr create` の Hook は、`/code-review` のあとにコミットを足すと止める。足したコミットは PR の説明に書き、オーナーが見る
- オーナーへの返答の Jira のリンクは、本当のサイトの URL を使う（伏せ字 `<サイト名>` はリポジトリの中だけ）
- Git Bash の `mklink` はスラッシュが書きかえられて失敗する。ジャンクションは PowerShell の `New-Item -ItemType Junction` で作る
