# NORI-17：Blender MCP の隔離の確認。専用ユーザー（noriblender）の Blender の中で実行する。
#
# 確かめること（完了条件「大事なファイルに届かない」）
#   1. 守る場所（コマンドの引数で渡す。オーナーのユーザーフォルダ、リポジトリ、ほかのドライブ）を読めない・一覧できない
#   2. 作業フォルダ（<リポジトリ>/blender-work）には書ける（モデルを作れる）。リポジトリのほかの場所は読めない
#   3. 外部（インターネット）につながらない
#   4. 環境変数（APPDATA など）が、守る場所（オーナーのフォルダ）の中を指していない
#      （Start-Process -Credential だけで開くと、オーナーの環境を引き継ぐ。11/6 に起きた）
#   5. Blender の設定の置き場所（bpy.utils.user_resource）が決まっている（空だとアドオンを入れられない）
#
# 使い方（docs/security/blender-mcp-isolation.md の「確認」）
#   blender.exe --background --factory-startup --python isolation-check.py -- <守る場所1> <守る場所2> ...
# 結果は <リポジトリ>/blender-work/isolation-result.json に書き、標準出力にも出す。
# 守る場所の中身は読まない（読めたかどうかだけを記録する）。人の名前を残さないよう、パスは結果に書かない。
import getpass
import json
import os
import socket
import sys

def _work_dir() -> str:
    # 作業フォルダ = このファイルの置き場所（<リポジトリ>/blender-work/tools）の1つ上。パスを直接書かない
    here = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
    work = os.path.dirname(here) if os.path.basename(here) == "tools" else os.getcwd()
    if os.path.basename(work) != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから実行する")
    return work


WORK_DIR = _work_dir()
# 作業フォルダはリポジトリの中にある（2026-11-10 に移した）。リポジトリのほかの場所は読めてはいけない
REPO_DIR = os.path.dirname(WORK_DIR)
REPO_PROBES = [REPO_DIR, os.path.join(REPO_DIR, "package.json"), os.path.join(REPO_DIR, "CLAUDE.md")]
NETWORK_TARGETS = [("1.1.1.1", 443), ("example.com", 443)]


def protected_paths() -> list[str]:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return args


def can_read(path: str) -> dict[str, object]:
    try:
        if os.path.isdir(path):
            os.listdir(path)
        else:
            with open(path, "rb") as handle:
                handle.read(1)
        return {"reachable": True}
    except OSError as error:
        return {"reachable": False, "error": type(error).__name__}


def can_write() -> dict[str, object]:
    target = os.path.join(WORK_DIR, "isolation-write-test.txt")
    try:
        with open(target, "w", encoding="utf8") as handle:
            handle.write("ok")
        os.remove(target)
        return {"writable": True}
    except OSError as error:
        return {"writable": False, "error": type(error).__name__}


def can_connect(host: str, port: int) -> dict[str, object]:
    try:
        with socket.create_connection((host, port), timeout=5):
            return {"connected": True}
    except OSError as error:
        return {"connected": False, "error": type(error).__name__}


ENV_NAMES = ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]


def _inside(child: str, parent: str) -> bool:
    child_norm = os.path.normcase(os.path.abspath(child))
    parent_norm = os.path.normcase(os.path.abspath(parent))
    return child_norm == parent_norm or child_norm.startswith(parent_norm.rstrip("\\/") + os.sep)


def env_points_outside(paths: list[str]) -> list[dict[str, object]]:
    # 環境変数の値（パス）は結果に書かない。守る場所の中を指しているかだけを記録する
    results = []
    for name in ENV_NAMES:
        value = os.environ.get(name, "")
        inside = bool(value) and any(_inside(value, p) for p in paths if os.path.isabs(p))
        results.append({"name": name, "set": bool(value), "insideProtected": inside})
    return results


def user_resource_ok() -> dict[str, object]:
    try:
        import bpy  # Blender の中でだけ使える

        return {"extensionsDirSet": bool(bpy.utils.user_resource("EXTENSIONS"))}
    except Exception as error:  # Blender の外や、API が変わったとき
        return {"extensionsDirSet": False, "error": type(error).__name__}


def main() -> None:
    paths = protected_paths()
    read_results = [{"index": i, **can_read(p)} for i, p in enumerate(paths)]
    # リポジトリのほかの場所（ルートの一覧・package.json・CLAUDE.md）。守る場所の引数がなくても必ず確かめる
    repo_results = [{"index": i, **can_read(p)} for i, p in enumerate(REPO_PROBES)]
    network_results = [{"target": f"{h}:{p}", **can_connect(h, p)} for h, p in NETWORK_TARGETS]
    write_result = can_write()
    env_results = env_points_outside(paths)
    resource_result = user_resource_ok()
    # ユーザー名そのものは書かない（隔離に失敗するとオーナーの名前が入り、証跡と一緒にコミットされるおそれ）
    dedicated = getpass.getuser().lower() == "noriblender"
    result = {
        "isDedicatedUser": dedicated,
        "protectedChecked": len(paths),
        "protected": read_results,
        "repoOutsideWork": repo_results,
        "workDir": write_result,
        "network": network_results,
        "env": env_results,
        "blenderUserResource": resource_result,
        "isolated": dedicated
        and len(paths) > 0
        and not any(r["reachable"] for r in read_results)
        and not any(r["reachable"] for r in repo_results)
        and bool(write_result["writable"])
        and not any(r["connected"] for r in network_results)
        and not any(r["insideProtected"] for r in env_results)
        and bool(resource_result["extensionsDirSet"]),
    }
    text = json.dumps(result, ensure_ascii=False, indent=2)
    print(text)
    try:
        with open(os.path.join(WORK_DIR, "isolation-result.json"), "w", encoding="utf8") as handle:
            handle.write(text)
    except OSError as error:
        print(f"結果を書けませんでした：{type(error).__name__}")


main()
