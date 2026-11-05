---
name: start-day
description: 1日の作業を始める。引き継ぎ（docs/handoff.md）・devlog・Jira から、今日のゴールと作業の順番を示し、最初の作業に入る
disable-model-invocation: true
argument-hint: "[確認だけ]"
---

1日の作業を始めます。次の順で進めてください。

1. `date` で今日の日付と時刻を確かめる（記憶や推測で書かない）
2. 読む：`docs/handoff.md`（最初に）、`CLAUDE.md`、最新の `docs/devlog/YYYY-MM-DD.md`、`docs/jira/sprint1.md`（今のスプリントの一覧）
3. `git status`・`git branch -a`・`gh pr list` で、作業中のブランチと未マージの PR を確かめる
4. Jira（NORI）で、今のスプリントの課題の状態を確かめる（`searchJiraIssuesUsingJql`、`project = NORI AND sprint in openSprints()`）。引き継ぎと違う点があれば知らせる
5. 次を簡潔に示す
   - 今日のゴール（1〜2行）と、スプリントの残り日数
   - 作業の順番（課題キー・完了条件・目安時間）
   - 今日オーナーにお願いすること（画面での操作、承認が要ること、お金や外部サービスに関わること）。最初にまとめて伝える
   - 遅れがあれば、削る候補（スプリントの範囲の変更はオーナーの承認が要る）
6. 引数が「確認だけ」なら、ここで止める。それ以外は、CLAUDE.md の進め方に沿って最初の作業に入る（作業を始めた課題は Jira で「進行中」にする）
