# NORI-17：Blender MCP の隔離の確認。専用ユーザー（noriblender）の Blender の中で実行する。
#
# 確かめること（完了条件「大事なファイルに届かない」）
#   1. 守る場所（コマンドの引数で渡す。オーナーのユーザーフォルダ、リポジトリ、ほかのドライブ）を読めない・一覧できない
#   2. 作業フォルダ（C:\NoriBlender\work）には書ける（モデルを作れる）
#   3. 外部（インターネット）につながらない
#
# 使い方（docs/security/blender-mcp-isolation.md の「確認」）
#   blender.exe --background --factory-startup --python isolation-check.py -- <守る場所1> <守る場所2> ...
# 結果は C:\NoriBlender\work\isolation-result.json に書き、標準出力にも出す。
# 守る場所の中身は読まない（読めたかどうかだけを記録する）。人の名前を残さないよう、パスは結果に書かない。
import getpass
import json
import os
import socket
import sys

WORK_DIR = r"C:\NoriBlender\work"
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


def main() -> None:
    paths = protected_paths()
    read_results = [{"index": i, **can_read(p)} for i, p in enumerate(paths)]
    network_results = [{"target": f"{h}:{p}", **can_connect(h, p)} for h, p in NETWORK_TARGETS]
    write_result = can_write()
    result = {
        "user": getpass.getuser(),
        "protectedChecked": len(paths),
        "protected": read_results,
        "workDir": write_result,
        "network": network_results,
        "isolated": len(paths) > 0
        and not any(r["reachable"] for r in read_results)
        and bool(write_result["writable"])
        and not any(r["connected"] for r in network_results),
    }
    text = json.dumps(result, ensure_ascii=False, indent=2)
    print(text)
    try:
        with open(os.path.join(WORK_DIR, "isolation-result.json"), "w", encoding="utf8") as handle:
            handle.write(text)
    except OSError as error:
        print(f"結果を書けませんでした：{type(error).__name__}")


main()
