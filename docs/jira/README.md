# Jira の取り込み用 CSV

| ファイル                       | 中身                                       | 使い方                          |
| ------------------------------ | ------------------------------------------ | ------------------------------- |
| `nori_backlog_test1.csv`       | テスト用：エピック1件・ストーリー1件       | 元のファイル（ID は `E1` 形式） |
| `nori_backlog_full.csv`        | 本番用：エピック6件・ストーリー43件・103pt | 元のファイル                    |
| `nori_backlog_test1_numid.csv` | 上と同じ内容で、ID を数字にしたもの        | **取り込みにはこちらを使う**    |
| `nori_backlog_full_numid.csv`  | 上と同じ内容で、ID を数字にしたもの        | **取り込みにはこちらを使う**    |

ID の置きかえ：エピック `E1` → `1`、ストーリー `S01` → `101`（Atlassian の公式記事が、親子関係を保つ取り込みを数字の ID で説明しているため）。

## テスト取り込みで分かったこと（2026-11-04）

- 数字の ID で、ストーリーの親（Parent）がエピックになった
- 2列の Labels は、1つのラベル欄にまとまって入った
- `Story Points` の列は **Story point estimate**（`customfield_10016`）に入った。ボードの見積もりが **Story Points**（`customfield_10034`）のままだと合計が 0 になるため、ボードの設定 → 見積もりを Story point estimate に合わせる
- 取り込み機能が「External issue ID」フィールドを自動で作り、CSV の ID を記録する（害はない）
- NORI プロジェクトには「対応しない」ステータスがない。テストの課題は削除せず、「完了」＋ラベル `test-import` で閉じる

## Jira の ID（MCP で使う）

| 項目                | 値                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------ |
| サイト              | `<サイト名>.atlassian.net`                                                                 |
| プロジェクト        | `NORI`（ID 10034、企業管理）                                                               |
| ボード              | NORI board（ID 35）                                                                        |
| スプリント          | Sprint 1〜4 = ID 4・5・6・7                                                                |
| 課題タイプ          | エピック 10000、ストーリー 10005                                                           |
| ポイント            | **Story Points = `customfield_10034`**（ボードの見積もり）。`customfield_10016` は使わない |
| ステータスの遷移 ID | 11 = 未着手、21 = 進行中、31 = 完了                                                        |
| エピック            | NORI-3 基盤、5 乗り物、6 ステージ、7 品質、8 動画、9 振り返り                              |
| テストの課題        | NORI-1・2（完了＋ラベル `test-import`。数えるときは除く）                                  |

## MCP の操作の書き方（2026-11-04 に試して分かったこと）

- 課題の作成：`createJiraIssue` に `projectKey`、`issueType`（日本語名「ストーリー」）、`summary`、`description`、`parent`（エピックのキー）、`additional_fields`（`priority`・`labels`・`customfield_10034`）
- 課題の編集：`editJiraIssue` に `issueIdOrKey` と `fields`（例：`{"labels": [...]}`。ラベルは**全部の一覧**を渡す）
- ステータス・スプリント：`transitionJiraIssue` に `issueIdOrKey` と `transitionId` または `sprintId`
- 一覧：`getJiraBoardIssueData`（boardId 35、`jql`、`fields`）。エピックはボードの一覧に出ないので、`getJiraIssue` で個別に見る
- スプリントの作成・開始・編集・終了（`manageJiraSprint`）は**削除系**の扱い → 使わず、オーナーに画面で頼む
- 書き込みに必要だった許可：Claude Code の deny、claude.ai のコネクター（Write は常に許可・Destructive はブロック）、Atlassian 管理画面の MCP サーバーの **Write と Search**（Jira だけ）。許可を変えたらコネクターをつなぎ直す
