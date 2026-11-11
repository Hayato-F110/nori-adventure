#Requires -Version 7.4
# Blender を専用ユーザー noriblender として開く（オーナーが実行する）。
# 手順の元：docs/security/blender-mcp-isolation.md ④。スキル /blender-start から案内する。
# 使い方（リポジトリの一番上で）：.\tools\blender\start-blender.ps1
# パスワードは Get-Credential の画面で入れる。このファイルには書かない。

$ErrorActionPreference = 'Stop'

# Blender の場所（版を固定して使う。版を上げたらここを直す）
$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
# 作業フォルダ：このファイルの2つ上（リポジトリの一番上）の blender-work。noriblender が書けるのはここだけ
$work = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) 'blender-work'

if (-not (Test-Path $blender)) { throw "Blender が見つかりません: $blender" }
if (-not (Test-Path $work)) { throw "作業フォルダが見つかりません: $work" }

# noriblender のパスワードを聞く
$cred = Get-Credential noriblender

# noriblender 専用の環境変数。オーナーの環境変数を引き継がないために必須（11/6 に起きた）
$nb = 'C:\Users\noriblender'
$nbEnv = @{
    USERNAME     = 'noriblender'
    USERPROFILE  = $nb
    HOMEPATH     = '\Users\noriblender'
    APPDATA      = "$nb\AppData\Roaming"
    LOCALAPPDATA = "$nb\AppData\Local"
    TEMP         = "$nb\AppData\Local\Temp"
    TMP          = "$nb\AppData\Local\Temp"
}

# -LoadUserProfile：noriblender のプロファイルを読む
# -UseNewEnvironment -Environment：呼び出した側の環境変数を捨て、上の値だけで始める（PowerShell 7.4 以降）
Start-Process $blender -Credential $cred -LoadUserProfile -UseNewEnvironment -Environment $nbEnv -WorkingDirectory $work
Write-Host "Blender を noriblender として開きました（作業フォルダ: $work）。Claude に「開いた」と伝えてください。"
