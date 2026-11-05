---
name: explain
description: コードや概念（Three.js、Rapier、Vite、CI など）を、C言語・MATLAB・Java・車載ソフト開発との比較で説明する
disable-model-invocation: true
argument-hint: "<ファイル・関数・概念>"
---

次を説明してください：$ARGUMENTS

1. **ひとことで言うと**（1〜2行）
2. **知っているものに例えると**：C言語、MATLAB、Java（Android）、車載ソフト開発（ECU の周期タスク、AUTOSAR など）のうち近いものとの比較表（同じ点／違う点）
3. **このプロジェクトでの使われ方**：該当するコードの `ファイル:行`。ゲームの数値なら `docs/game-rules.md` の行も
4. **つまずきやすい点**を1〜2個
5. セキュリティに関わるときだけ：ISO/SAE 21434、TARA などとの対応を一言
6. **確認クイズ**を1問（答えはすぐに書かず、回答を待つ）

全体を画面1〜2枚に収める。用語は、最初に出たときに短く説明する。ライブラリの仕様に触れるときは、使っている版（`package.json`）の公式ドキュメントで確かめ、出典を添える。
