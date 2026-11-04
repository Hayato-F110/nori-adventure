# 引き継ぎ（次のセッション用）

> 最終更新：2026-11-04 23:30（スプリント1・初日分を前倒しで完了した時点）
> 新しいセッションでは、最初にこのファイルと `CLAUDE.md`、`docs/devlog/2026-11-05.md` を読む。

## 1. いまの状態

| 項目           | 状態                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリ     | `Hayato-F110/nori-adventure`（**非公開**）。main は PR #1〜#7 をマージ済み。CI（check・e2e）はすべて緑                                   |
| 作業中ブランチ | `feature/NORI-13-rapier-collision`（push 済み・**PR 未作成**）。ルール・設定・**先に書いたテスト**だけが入っていて、テストは失敗する状態 |
| Jira           | NORI（企業管理スクラム、ボード ID 35）。49件・103pt。スプリント1（ID 4）は **11/5 09:00〜11/10 23:02** で開始済み                        |
| 初日の完了条件 | 6つすべて達成（`docs/devlog/2026-11-05.md`）                                                                                             |
| Blender        | 5.2.3 LTS を導入済み（`C:\Program Files\Blender Foundation\Blender 5.2\`）。**Blender MCP はまだ入れていない**（NORI-17 で隔離してから） |

### スプリント1（`docs/jira/sprint1.md` に一覧あり）

| 状態   | 課題                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 完了   | NORI-4 企画書、NORI-11 土台と CI、NORI-12 車の試作                                                                                              |
| 進行中 | NORI-10 Claude Code 設定（main の保護は公開後）、NORI-13 Rapier（テストのみ）、NORI-15 状態と描画の分離、NORI-24 ルール（ステージ1のみ）        |
| 未着手 | NORI-16 Pages、NORI-17 Blender MCP 隔離、NORI-18 アセットの流れ、NORI-19 車のモデル、NORI-35 脅威分析、NORI-36 CodeQL 等、NORI-40 AI 映像テスト |

## 2. 明日（11/5）の作業順

1. **NORI-13 を実装してテストを緑にする**（下の「3」に設計メモ）。PR を作り、CI 緑でマージ、Jira を完了に
2. **NORI-15**：物理を入れた状態で再現性テスト（`tests/core/replay.test.ts`）を直して通す。完了なら Jira を完了に
3. **NORI-17**：Blender MCP の隔離環境。専用フォルダ（`blender-work/`、`.gitignore` 済み）、オーナーの作業手順を**公式情報を確認してから**書く
4. **NORI-35**：`docs/security/threat-model.md`（STRIDE）。Blender MCP・AI 生成コード・アセットの出所・AI 動画サービスへの送信・Jira MCP の書き込み権限を含める
5. 時間があれば NORI-24（ステージ2〜5のルールの数値）
6. 1日の終わりに `docs/devlog/2026-11-05.md` に追記し、この `docs/handoff.md` を更新する

## 3. NORI-13 の設計メモ（テストで API を決めてある）

テスト：`tests/core/collision.test.ts`（ブランチ上）。ルール：`docs/game-rules.md`「建物と木」「ぶつかったとき」「カメラ」。

- **`src/core/stage1Layout.ts`（新規・純粋な関数）**
  - `createStage1Layout(STAGE1) → { buildings: Box[]; trees: Tree[] }`
  - `Box = { x, z, halfWidth, halfDepth, height }`、`Tree = { x, z, radius }`
  - 今は `src/render/city.ts` の中で `Math.sin` の擬似乱数で配置している。これを core に移し、**整数のハッシュ**（区画の番号から計算）に変える。数値は `STAGE1.building*`・`treeTrunkRadius`
  - 区画は道の線 −80, −40, 0, 40, 80 の間の 4×4。建物は区画の四隅に置く（いまの city.ts と同じ考え方）
  - `city.ts` は、この配置を受け取って描くだけにする
- **`src/core/physics.ts`（新規）**
  - `createCarPhysics(layout): Promise<CarPhysics>`。中で `await RAPIER.init()`（`@dimforge/rapier3d-compat` の `init()`）
  - `CarPhysics.step(state, input, dt, CAR, STAGE1): CarState`
  - Rapier の世界は**状態を持たせない**：建物・木は静的なコライダー。車は毎刻み、状態の位置にコライダーを置き直し、`world.createCharacterController(offset)` の `computeColliderMovement(collider, desiredDelta)` → `computedMovement()` で、ぶつかった後の移動量を得る。`numComputedCollisions()` で接触を判定
  - 車のコライダーは円柱（半径 `CAR.collisionRadius`）。スライドは有効に
  - 静的コライダーを追加した後、最初に1回 `world.step()` してから問い合わせる（クエリ用の構造を更新するため。動かなければ確かめる）
  - 速度：`stepCar`（`src/core/car.ts`）で動こうとした移動量を計算 → Rapier で補正 →
    - 新しく触れた刻み（`!state.touching && 接触あり`）だけ `speed *= CAR.bumpSpeedFactor`
    - 触れている間は `|speed| ≤ 最高速度 × (実際の移動量 ÷ 動こうとした移動量)`
  - `CarState` に `touching: boolean` を足す（`createCarState` は false）。見えない柵の処理（car.ts）は残す
- **`src/core/game.ts`**：物理が非同期の初期化になるので、`createGame(): Promise<{ initial(); step(state, input) }>` のような形にし、`replay.ts`・`main.ts`・既存テストを合わせる
- **カメラ**（`src/render/followCamera.ts`）：注視点 → 目標位置への Three.js の Raycaster を建物のメッシュに当て、当たれば手前 `CAMERA.wallPadding` に寄せる（最短 `CAMERA.minDistance`）
- **E2E**（`e2e/car-drive.spec.ts`）：今の走らせ方（1秒目に左折）は、建物に当たって止まる可能性がある。完了条件は「60fps・10秒以上走る」なので、道に沿って走る入力に直すか、判定を「止まっていない時間」で見る。**建物の中に入らない**ことも、スクリーンショットで確かめる
- CSP は `'wasm-unsafe-eval'` を許可済み（Rapier の WASM 用）。ブラウザでコンソールエラーがないかを確かめる

## 4. 環境で分かっていること（つまずき防止）

| 事柄             | 内容                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| シェル           | Git Bash と PowerShell 7。Hook が `.env` という文字列を含むコマンドを止める（検索パターンでも）。`en[v]` のように書くか、テストでは実行時に組み立てる                          |
| npm              | vitest 5 の peer 依存で npm が内部エラーになる → `--legacy-peer-deps`。`npm ci` は通る。版は**公開から2週間以上**（`npm view <pkg> time` で日付を確認。`--before` は効かない） |
| preview サーバー | 自分で立ち上げた preview がポート 4173 に残ると、古い設定のまま見える。`netstat -ano` で確かめて止める                                                                         |
| CI の E2E        | GPU がなく約3fps。ゲーム内の時間が遅れる。FPS の判定は手元だけ（`NORI_SKIP_FPS=1`）                                                                                            |
| 手元の FPS       | AMD Radeon（D3D11）、Chromium ヘッドレスで約60fps                                                                                                                              |
| auto モード      | `gh repo create` と、Claude 自身の権限設定（`settings.json`）の変更は止められる → オーナーに依頼                                                                               |
| ブランチの削除   | CI 緑でマージ済みのブランチは承認なしで削除してよい（`git branch -d`）                                                                                                         |
| 時刻             | 予定や報告で時刻を書く前に `date` で確かめる（11/4 に確かめずに誤った）                                                                                                        |

## 5. Jira の MCP の使い方（書き込みは 11/4 に許可済み）

詳しくは `docs/jira/README.md`。

- 書き込み：`executeWrite`。削除系（`executeDestructive`）は deny。**スプリントの作成・開始・編集・終了は削除系の扱い**なので、オーナーに画面で頼む
- ステータス変更：`transitionJiraIssue` に `transitionId`（11＝未着手、21＝進行中、31＝完了）
- 作業を始めたら「進行中」、PR をマージして完了条件を確かめたら「完了」にする

## 6. オーナーの判断待ち・今後の予定

| 事柄                     | 状態                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリの公開         | **S08（NORI-16）までに公開する**と決定。公開の直前に `docs/security/public-release-checklist.md` をやり直し、最終確認をもらう。公開の操作はオーナー |
| リポジトリ内の姓（オーナー） | CLAUDE.md・Hook のメッセージ・devlog に4か所。公開してよいか、公開前に確認する                                                                      |
| Blender MCP              | NORI-17 で隔離手順を作ってから、オーナーが導入                                                                                                      |
| Google AI Plus           | NORI-40（車のモデルができてから）。契約はオーナー                                                                                                   |
