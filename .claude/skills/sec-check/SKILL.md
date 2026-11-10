---
name: sec-check
description: 秘密情報・個人名・家族のデータ・危険なコード・CI の権限・依存関係のリスクを確かめ、表にする。公開前のチェックにも使う
disable-model-invocation: true
---

リポジトリ全体と、今の変更のセキュリティを確かめてください。対象は自分のリポジトリだけです。

1. **秘密情報**
   - `git ls-files` に、追跡すべきでないファイル（環境変数のファイル、`*.pem`、`*.key`、トークン、認証情報）がないか
   - 追跡中のファイルに、鍵やトークンらしい文字列（`AKIA`、`-----BEGIN`、`ghp_`、`token=`、`password=` など）がないか
   - `.gitignore` と `.claude/settings.json` の deny に漏れがないか
   - 見つけたら値は書かず、場所だけを報告して止まる（CLAUDE.md「必ず止まる」2）
2. **個人と家族のデータ**
   - 人の名前（作業者の姓名。`git log` の作者名・メールも含む）が、ファイル・コミット・PR にないか
   - 写真・音声・動画のファイルが追跡されていないか。`screenshots/`、`test-results/`、`blender-work/` が除外されているか
3. **危険なコード**
   - `innerHTML`、`eval`、`new Function`、外部への `fetch`・`WebSocket`、外部 CDN、解析タグ
   - `index.html` の CSP（`'wasm-unsafe-eval'` 以外の緩め方がないか）
   - リプレイなど外から来るデータを、形と範囲を確かめてから使っているか
4. **CI と公開**
   - `.github/workflows/`：`permissions` が必要な分だけか、外部のアクションがコミット ID（SHA）で固定されているか、公開されるフォルダが `dist/` だけか
   - リポジトリの公開に向けて `docs/security/public-release-checklist.md` の項目を確かめる（公開範囲の変更そのものはオーナーの承認が要る）
5. **依存関係**：`npm audit`、`package.json` の版が固定（`save-exact`）か、新しい依存の公式の変更履歴・セキュリティ情報を確かめたか
6. **AI と道具**：Blender MCP が専用ユーザーで動き、書けるのが `blender-work/`（Git の対象外）だけか（`docs/security/blender-mcp-isolation.md`）、`.mcp.json` の版が固定されているか、`_for_cli` の道具が deny か、Jira の MCP の削除系が deny のままか、AI 動画サービスに送るものが自作モデルの画像だけか
7. `docs/security/threat-model.md`（あれば）の対策と照らし、**実施済み／未実施／新しく見つかった脅威**を表にする

報告は「重大度（高・中・低）／場所（ファイル:行）／内容／対処案」の表にする。deny で読めないファイルは、読もうとせず「読めないので未確認」と書く。
直すのは、表を示したあと（秘密情報・公開範囲・履歴の書き換えはオーナーの承認を取ってから）。
