# Blender MCP の隔離（NORI-17）

> 調べた日：2026-11-05。完了条件：**大事なファイルに届かないことを確認**（Jira NORI-17）。
> リスクの一覧は `docs/security/threat-model.md` の「Blender MCP」。

## 1. 使う MCP サーバー

| 項目       | 内容                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 選んだもの | **Blender Lab の公式 MCP サーバー**（Blender Foundation の実験的なプロジェクト）。似た名前の第三者製（ahujasid 版）は使わない                                                                                                                                        |
| 理由       | 第三者製は、テレメトリの仕組み（オンのとき、プロンプト・スクリーンショット・生成コードを送る。環境変数でオフにできる）と、外部の素材サービスへの接続がある。コード実行の脆弱性の報告（CVE-2026-10688、第三者の報告）もある。公式版は道具が少なく、外部への通信がない |
| 版         | ソース：コミット `dbbf836ad4b1025f14a2b3b504c43903f39e0b04`（2026-09-29）。アドオン：`mcp-1.0.3.zip`。Blender 5.1 以上（入っているのは 5.2.3）                                                                                                                       |
| 依存       | `mcp[cli]`・`docutils`・`pyyaml`（版は固定されていない）→ `uvx --exclude-newer 2026-10-22` で、日付を固定する（毎回同じ版になる。更新するときは日付を変えて PR で見る）                                                                                              |

出典：<https://www.blender.org/lab/mcp-server/>、ソース <https://projects.blender.org/lab/blender_mcp>（`readme.md`、`readme_tools.rst`、`addon/blender_mcp_addon/blender_manifest.toml`、`mcp/blmcp/tools_helpers/blender_cli.py`）

### 仕組み（ソースで確かめたこと）

```
Claude Code ⇐ stdio ⇒ blender-mcp（Python。オーナーのユーザーで動く） ⇐ TCP localhost:9876 ⇒ Blender の中のアドオン
```

- 公式ページの警告：「AI が生成したコードを、データの削除や外部への送信を防ぐ守りなしで Blender の中で実行する。**仮想マシンか、大事な情報のないシステム**で使うこと」
- `execute_blender_code` は、Blender の Python で何でも実行できる（`bpy` だけでなく、ファイル・ネットワークも）
- アドオンの `weak_sandbox.py` は、自分で「本当のサンドボックスではない」と書いている（`sys.exit` などを止めるだけ）
- アドオンは `localhost:9876` で待ち受ける。**認証はない**（同じ PC のプログラムなら、どれでもつなげる）
- **名前が `_for_cli` で終わる道具は、MCP サーバーが自分で `blender --background` を起動する**（`blender_cli.py:69`）。MCP サーバーはオーナーのユーザーで動くので、**この道具で実行したコードは隔離の外で動く** → 禁止する（下の 2-⑤）
- MCP サーバーとアドオンのコードに、外部への通信はない（ソースを検索して確認）。プライバシーポリシーは blender.org のもの

## 2. 隔離の方式

Windows 11 **Home** には Windows Sandbox がない（Microsoft の対応表は Pro・Enterprise・Education だけ。<https://learn.microsoft.com/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-overview>）。仮想マシンはもっと強いが、準備が重い。Jira の計画どおり **専用の標準ユーザー** で動かし、次の5つを重ねる。

| #   | 対策                                                                                      | 何を防ぐか                                                                                                       |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ①   | Blender を **専用の標準ユーザー `noriblender`** で動かす                                  | オーナーのユーザーフォルダ（リポジトリ、`.ssh`、書類、写真）を読めない。管理者の権限もない                       |
| ②   | 作業フォルダ **`C:\NoriBlender\`**                                                        | 書けるのはここだけ。オーナーのフォルダの中（リポジトリの `blender-work/`）は専用ユーザーから届かないので使わない |
| ③   | **ファイアウォール**で `blender.exe` の外部への通信を止める                               | 「外部への送信」を防ぐ。127.0.0.1（MCP の通信）は止めない                                                        |
| ④   | MCP サーバーの版を **コミットで固定**、依存を **日付で固定**                              | 知らないうちに中身が変わるのを防ぐ                                                                               |
| ⑤   | `_for_cli` の道具を **Claude Code の設定で禁止**し、`BLENDER_PATH` を存在しない場所にする | 隔離の外（オーナーのユーザー）での実行を、二重に止める                                                           |

この PC で確かめたこと（2026-11-05）：`C:\Users\<オーナー>` に入れるのは SYSTEM・Administrators・オーナーだけ（`icacls`）。標準ユーザーは Administrators に入らないので、読めない。`G:\` ドライブがあるので、専用ユーザーから見えないことも確認の対象にする。

残るリスク（受け入れる）：

- 専用ユーザーでも、`C:\Program Files` などの共有の場所は読める（大事な個人のファイルはない）
- アドオンの 9876 番に、オーナーのユーザーのプログラムもつなげる（権限は専用ユーザーに下がる向きなので、悪化はしない）
- AI のコードが `C:\NoriBlender\` の中を壊すことはある → 大事な作業は GLB に書き出してリポジトリ（`public/models/`）にコミットする

## 3. オーナーの作業（順番に）

画面の名前は Windows の版で違うことがある。違ったら、スクリーンショットを見せてください。

### ① 専用ユーザーを作る（設定アプリ）

1. 設定 → アカウント → 他のユーザー → 「アカウントの追加」
2. 「このユーザーのサインイン情報がありません」→「Microsoft アカウントを持たないユーザーを追加する」
3. ユーザー名 `noriblender`、パスワードを決める（ほかと使い回さない。リポジトリや Claude には書かない）
4. 作ったアカウントの種類が **標準ユーザー** であることを確かめる（「アカウントの種類の変更」で見られる。管理者にしない）
5. 一度 `noriblender` でサインインして、すぐサインアウトする（ユーザーのフォルダが作られる）

### ② 作業フォルダとファイアウォール（管理者の PowerShell）

スタートを右クリック →「ターミナル（管理者）」。1行ずつ実行する。

```powershell
# 親のフォルダだけを先に作る（子を先に作ると、C ドライブから受け継いだ広い権限が子に残るおそれがある）
New-Item -ItemType Directory -Force C:\NoriBlender
# 親から受け継ぐ権限を切り、SYSTEM・管理者・オーナー・noriblender だけが使えるようにする
icacls C:\NoriBlender /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "$($env:USERNAME):(OI)(CI)M" "noriblender:(OI)(CI)M"
# そのあとで子を作る（work：AI が作業する場所、downloads：アドオンの zip を置く場所）。権限は親から受け継ぐ
New-Item -ItemType Directory -Force C:\NoriBlender\work, C:\NoriBlender\downloads
# 確かめる：4つ（SYSTEM・Administrators・オーナー・noriblender）だけが出ればよい。Users や Authenticated Users が出たら止めて知らせる
icacls C:\NoriBlender\work
# blender.exe の外への通信を止める。127.0.0.0/8 と ::1（同じ PC の中）は範囲から外して、MCP の通信は通す
New-NetFirewallRule -DisplayName "NoriBlender - Blender の外部通信を止める" -Direction Outbound -Action Block -Profile Any -Program "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -RemoteAddress "0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"
```

- ファイアウォールの設定は、オーナーがふだん使う Blender にも効く（アドオンのオンラインの検索などが使えなくなる）。外すときは `Remove-NetFirewallRule -DisplayName "NoriBlender - Blender の外部通信を止める"`
- 出典：`New-NetFirewallRule`（<https://learn.microsoft.com/powershell/module/netsecurity/new-netfirewallrule>）、`icacls`（<https://learn.microsoft.com/windows-server/administration/windows-commands/icacls>。資料では `/inheritancelevel:r` と書かれているが、この PC の `icacls /?` には `/inheritance:e|d|r` とある。ja-JP の Windows でも `SYSTEM`・`Administrators` の名前で通ることを 11/6 に確かめた）

### ③ アドオンを取ってくる（ふつうの PowerShell）

```powershell
# 公式のアドオン（1.0.3）を downloads に保存し、ハッシュを表示する（Claude に値を伝える）
Invoke-WebRequest "https://projects.blender.org/lab/blender_mcp/releases/download/v1.0.3/mcp-1.0.3.zip" -OutFile C:\NoriBlender\downloads\mcp-1.0.3.zip
Get-FileHash C:\NoriBlender\downloads\mcp-1.0.3.zip
```

- 期待する SHA-256：`A7A9DA816192502E5A0A202A396444E266B47D8FC4F74AD4698048BD43040707`（11/6 に Claude が別に取って計算した値。大きさ 17,975 バイト。v1.0.3 は 2026-09-11 公開の最新版で、`.mcp.json` で固定したコミットと同じ版）。違ったら入れずに止める

### ④ 専用ユーザーで Blender を開き、アドオンを入れる

```powershell
# noriblender のパスワードを聞かれる
$cred = Get-Credential noriblender
# noriblender のユーザーごとの場所（設定・一時ファイル）。オーナーの環境変数を引き継がないために使う
$nb = "C:\Users\noriblender"
$nbEnv = @{ USERNAME = "noriblender"; USERPROFILE = $nb; HOMEPATH = "\Users\noriblender"; APPDATA = "$nb\AppData\Roaming"; LOCALAPPDATA = "$nb\AppData\Local"; TEMP = "$nb\AppData\Local\Temp"; TMP = "$nb\AppData\Local\Temp" }
# プロファイルを読み込み、新しい環境で、noriblender として Blender を開く（画面はいつもの画面に出る）
Start-Process "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -Credential $cred -LoadUserProfile -UseNewEnvironment -Environment $nbEnv -WorkingDirectory C:\NoriBlender\work
```

- **`-LoadUserProfile`・`-UseNewEnvironment`・`-Environment` は必須**。`Start-Process` は既定で、呼び出した側（オーナー）の環境変数を引き継ぐ（[Start-Process](https://learn.microsoft.com/powershell/module/microsoft.powershell.management/start-process)。`-Environment` は PowerShell 7.4 以降）。11/6 に `-Credential` だけで開いたら、Blender の中で `USERNAME` が `hayat`、`APPDATA` がオーナーのフォルダを指し、Blender の設定の置き場所（`bpy.utils.user_resource`）が空になって、「ディスクからインストール」が灰色になった（Blender 5.2 の `bl_extension_ops.py`：使えるユーザーのリポジトリがないと無効）。上のコマンドで `noriblender` と `C:\Users\noriblender\...` になることを確かめた
- 確かめ方：Blender の「Scripting」タブの Python コンソールで `import os; print(os.environ.get("USERNAME"), os.environ.get("APPDATA")); print(bpy.utils.user_resource('EXTENSIONS'))`

Blender の中で：

1. 編集 → プリファレンス → システム →「ネットワーク」の「オンラインアクセスを許可」は **オンのまま**にする。このアドオンは、オフだと MCP のサーバーを起動しない（v1.0.3 の `addon/blender_mcp_addon/__init__.py` の `startup_online_ok_or_error`。11/6 にソースで確かめた）。外への通信は、②のファイアウォールで止める
2. プリファレンス → 「エクステンションを入手」→ 右上の ▼ →「ディスクからインストール」→ `C:\NoriBlender\downloads\mcp-1.0.3.zip`（[Blender 5.2 の資料](https://docs.blender.org/manual/en/5.2/editors/preferences/extensions.html)。画面の名前が違ったら、スクリーンショットを見せてください）
3. アドオン「MCP」を有効にし、アドオンの設定を見る：「Auto Start」がオン（既定）、「Host」が `localhost`、「Port」が `9876`（どれも既定のまま）。「Server is running」と出ればよい
4. プリファレンスを保存する

### ⑤ 確認（隔離のテスト）

Claude が `tools/blender/isolation-check.py` を `C:\NoriBlender\work\` に置く。オーナーは次を実行する。

```powershell
# $cred・$nbEnv は④と同じ（新しい PowerShell なら④の最初の3行を先に実行する）
# noriblender の Blender（画面なし）で確認のスクリプトを動かす。守る場所は引数で渡す（結果にはパスを書かない）
Start-Process "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -Credential $cred -LoadUserProfile -UseNewEnvironment -Environment $nbEnv -WorkingDirectory C:\NoriBlender\work -Wait -ArgumentList "--background", "--factory-startup", "--python", "C:\NoriBlender\work\isolation-check.py", "--", "`"$env:USERPROFILE\Documents\nori_ClaudeCode\package.json`"", "`"$env:USERPROFILE`"", "`"$env:USERPROFILE\.ssh`"", "G:\"
```

結果は `C:\NoriBlender\work\isolation-result.json`。Claude が読み、`"isolated": true`（守る場所はすべて届かない・作業フォルダには書ける・外部につながらない・環境変数がオーナーのフォルダを指していない・Blender の設定の置き場所が決まっている）を確かめる。

### ⑥ Claude Code の設定（オーナーが `.claude/settings.json` を直す）

`permissions.deny` に次を足す（Claude は自分の権限の設定を変えられないため、オーナーが行う）。

```json
"mcp__blender__execute_blender_code_for_cli",
"mcp__blender__get_blendfile_summary_datablocks_for_cli",
"mcp__blender__get_blendfile_summary_missing_files_for_cli",
"mcp__blender__get_blendfile_summary_of_linked_libraries_for_cli",
"mcp__blender__get_blendfile_summary_path_info_for_cli",
"mcp__blender__get_blendfile_summary_usage_guess_for_cli"
```

そのあと Claude Code を開き直し、`.mcp.json` の `blender` サーバーを承認する（`/mcp` で接続を確かめられる）。

### ⑦ MCP 経由の確認（Claude が行う）

Blender（noriblender）を開いた状態で、Claude が `execute_blender_code` から同じ確認をする。①〜⑥がそろい、⑤と⑦の両方で `isolated: true` なら NORI-17 は完了。

## 4. ふだんの使い方

1. ④のコマンド（`-LoadUserProfile -UseNewEnvironment -Environment $nbEnv` つき）で、noriblender の Blender を開く（アドオンのサーバーは自動で開始）
2. Claude Code から MCP の道具を使う。モデルの作業ファイル（`.blend`）は `C:\NoriBlender\work\` に置く
3. できたモデルは GLB に書き出し（`C:\NoriBlender\work\export\`）、オーナーのユーザーでリポジトリの `public/models/` にコピーしてコミットする
4. AI 動画サービスに送るのは、自作モデルの画像だけ（CLAUDE.md「安全」）
