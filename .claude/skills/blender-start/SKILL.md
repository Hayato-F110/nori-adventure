---
name: blender-start
description: Blender を専用ユーザー（noriblender）の隔離の中で開き、MCP でつなぎ、隔離を確かめてから作業に入る手順。Blender でモデル・描画・書き出しをする前に、毎回使う
argument-hint: "[これからする作業 例: 乗り物4台]"
---

Blender の作業を始めます。作業：$ARGUMENTS
手順の元は `docs/security/blender-mcp-isolation.md`（④・⑤・「4. ふだんの使い方」）。違いがあれば、そちらを正とし、このスキルを直す。

## 1. つながるか確かめる

MCP の `get_objects_summary` を呼ぶ。つながれば 3 へ。「Cannot connect to Blender at localhost:9876」なら 2 へ。

## 2. オーナーに開いてもらう（Claude は開かない）

Blender は**オーナーが** noriblender として開く。Claude がオーナーのアカウントで Blender を動かすことはしない（隔離の外で AI のコードが動くため）。次をそのまま渡す。

```powershell
# noriblender のパスワードを聞かれる
$cred = Get-Credential noriblender
$nb = "C:\Users\noriblender"
$nbEnv = @{ USERNAME = "noriblender"; USERPROFILE = $nb; HOMEPATH = "\Users\noriblender"; APPDATA = "$nb\AppData\Roaming"; LOCALAPPDATA = "$nb\AppData\Local"; TEMP = "$nb\AppData\Local\Temp"; TMP = "$nb\AppData\Local\Temp" }
Start-Process "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -Credential $cred -LoadUserProfile -UseNewEnvironment -Environment $nbEnv -WorkingDirectory C:\NoriBlender\work
```

- `-LoadUserProfile -UseNewEnvironment -Environment $nbEnv` は**必須**（ないとオーナーの環境変数を引き継ぐ。11/6 に起きた）
- アドオン「MCP」のサーバーは自動で始まる。「開いた」と言われたら 1 に戻る
- つながらないとき：初回の `uvx` の準備が 30 秒を超えることがある → オーナーのターミナルで `.mcp.json` と同じ `uvx … blender-mcp --help` を1回実行してから `/mcp` で Reconnect（handoff の「Blender MCP」）

## 3. 隔離を確かめる（毎回。省略しない）

`isolation-check.py` は守る場所を**引数**で受け取る。MCP から動かすときは `sys.argv` に入れる（入れないと確認数 0 で `isolated: false` になる。11/10 に起きた）。

```python
import runpy, sys, json
old = sys.argv
sys.argv = ["blender", "--", r"C:\Users\<オーナーのユーザー名>", r"<このリポジトリの絶対パス>", r"C:\Users\<オーナーのユーザー名>\Documents"]
try:
    runpy.run_path(r"C:\NoriBlender\work\tools\isolation-check.py", run_name="__main__")
finally:
    sys.argv = old
res = json.load(open(r"C:\NoriBlender\work\isolation-result.json", encoding="utf-8"))
result = {"isolated": res["isolated"], "protectedChecked": res["protectedChecked"], "dedicated": res["isDedicatedUser"]}
```

- 守る場所のパスは、この会話の作業フォルダから組み立てる。ユーザー名をリポジトリのファイルに書かない
- **`isolated: true` かつ `protectedChecked` が 1 以上**なら 4 へ
- `false` なら**作業を止めて**、どの項目が落ちたか（`protected` の `reachable`、`network` の `connected`、`env` の `insideProtected`、`isDedicatedUser`）をオーナーに伝える。直すまで Blender のコードは実行しない

## 4. スクリプトを写す

noriblender はオーナーのフォルダを読めない。使うスクリプトを `tools/blender/` から `C:\NoriBlender\work\tools\` に写す（オーナーのユーザーで `cp`）。素材は `C:\NoriBlender\work\assets\`（各フォルダに出所とライセンスの `asset.json`）。

## 5. 作業のときの決まり

- 実行は MCP の `execute_blender_code` で `runpy.run_path(r"C:\NoriBlender\work\tools\<名前>.py")`。結果は `result`（dict）で返す
- 作り直すのは自分のコレクションだけ。ほかの物は消さない
- ノードは名前でなく種類（`n.type == "BSDF_PRINCIPLED"`）、入力は `identifier` で探す（日本語の画面で名前が翻訳されるため）
- GLB を読み込んだら、部品（タイヤなど）の位置は GLB のまま。原点に戻さない
- 書き出しは `C:\NoriBlender\work\export\`。リポジトリの `public/` へは、オーナーのユーザーでコピーしてコミット
- できた絵・モデルは、Read で目で見て確かめてから「できた」と言う
