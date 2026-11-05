---
name: whats-new
description: Claude Code の最近の新機能を公式の変更履歴で調べ、このプロジェクトで役立ちそうなものを3つ紹介する
disable-model-invocation: true
---

Claude Code の最近の新機能を調べてください。

1. `claude --version` で今の版を確かめる
2. 公式の変更履歴（https://code.claude.com/docs/en/changelog）を読み、`docs/devlog/` の「Claude Code の新機能メモ」に記録した版より新しい変更を把握する（`grep -rn "新機能メモ" docs/devlog` で前回の記録を探す）
   - `/release-notes` はオーナーが実行する組み込みコマンドなので、必要なら実行と結果の貼り付けを頼む
3. 次の観点で **3つ** 選ぶ
   - このプロジェクト（3D ゲーム、Playwright の自動録画、Jira・GitHub の連携、Blender MCP）で今週試せるもの
   - オーナーの仕事（車載ソフト開発、C言語、セキュリティ分析）で役立ちそうなもの
4. それぞれ：何ができるか（1〜2行）／QCD のどれに効くか／試し方（手順・コマンド）／注意点（費用、今の版で使えるか、会社で使うときの注意）
5. 今日の devlog に「Claude Code の新機能メモ（版 x.y.z、日付）」として追記する

変更履歴に書かれていない機能を推測で紹介しない。今の版にない機能は、その旨と更新の方法を伝える。出典の URL を添える。
