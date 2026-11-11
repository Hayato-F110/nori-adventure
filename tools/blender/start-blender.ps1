#Requires -Version 7.4
# Blender を専用ユーザー noriblender として開く（オーナーが実行する）。
# 手順の元：docs/security/blender-mcp-isolation.md ④。スキル /blender-start から案内する。
# 使い方（リポジトリの一番上で）：.\tools\blender\start-blender.ps1
# パスワードは Get-Credential の画面で入れる。このファイルには書かない。

$ErrorActionPreference = 'Stop'
# エラーのとき、窓がすぐ閉じないように止める（Claude が別の窓で開くため）
trap { Write-Host "エラー: $_" -ForegroundColor Red; Read-Host 'Enter で閉じる'; exit 1 }

# Blender の版（固定して使う。winget で上げたら、ここと docs/security/blender-mcp-isolation.md を直す）
$version = '5.3'
$blender = "C:\Program Files\Blender Foundation\Blender $version\blender.exe"
# 作業フォルダ：このファイルの2つ上（リポジトリの一番上）の blender-work。noriblender が書けるのはここだけ
$work = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) 'blender-work'

if (-not (Test-Path $blender)) {
    # 版が変わったときに、入っている版を見せる（11/11 に 5.2 → 5.3 で止まった）
    $found = (Get-ChildItem 'C:\Program Files\Blender Foundation' -Directory -ErrorAction SilentlyContinue).Name -join ', '
    throw "Blender $version が見つかりません。入っている版: $found。start-blender.ps1 の `$version を直してください"
}
if (-not (Test-Path $work)) { throw "作業フォルダが見つかりません: $work" }

# 外への通信を止めるファイアウォールの規則が、この版の exe に効いているか（規則は exe のパスに結びつく。11/11 に 5.3 で外れていた）
$blocked = Get-NetFirewallRule -DisplayName 'NoriBlender*' -ErrorAction SilentlyContinue |
    Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' -and $_.Direction -eq 'Outbound' -and ($_ | Get-NetFirewallApplicationFilter).Program -eq $blender }
if (-not $blocked) {
    throw "Blender $version の外への通信を止める規則がありません。docs/security/blender-mcp-isolation.md ② の規則を、管理者の PowerShell でこの exe に合わせてください"
}

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
