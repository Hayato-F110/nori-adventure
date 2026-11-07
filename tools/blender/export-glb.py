# NORI-18：Blender から GLB を書き出す。専用ユーザー（noriblender）の Blender の中で実行する。
# 書き出したあと、オーナーのユーザーで `npm run assets:import <名前>` を実行して検査・取り込みをする。
#
# 決まり（docs/game-rules.md「3D モデル（アセット）」）：
# - 書き出すものは、名前と同じ名前のコレクション（例：car）に入れる
# - Blender では Z が上。書き出しで glTF の Y が上に変わる（glTF の −Z ＝ Blender の +Y）。
#   → 車の前は Blender の +Y、左は −X。原点は車体の底の中心
# - 車のオブジェクトの名前：body・wheel_FL・wheel_FR・wheel_RL・wheel_RR。タイヤの回転は適用しておく
# - 画像（テクスチャ）・カメラ・ライト・アニメーション・圧縮（Draco・meshopt）は書き出さない
#
# 使い方（Blender MCP の execute_blender_code など）：
#   NAME = "car"; exec(open(r"<このファイル>", encoding="utf-8").read())
import os
import re

import bpy

EXPORT_DIR = r"C:\NoriBlender\work\export"
NAME_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,31}$")  # ファイル名に使うので、フォルダをまたぐ文字を許さない


def export_glb(name: str) -> dict:
    if not NAME_PATTERN.match(name):
        return {"ok": False, "error": f"名前が決まりに合わない：{name!r}"}
    collection = bpy.data.collections.get(name)
    if collection is None:
        return {"ok": False, "error": f"コレクション {name!r} がない"}
    os.makedirs(EXPORT_DIR, exist_ok=True)
    path = os.path.join(EXPORT_DIR, f"{name}.glb")
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    result = bpy.ops.export_scene.gltf(
        filepath=path,
        check_existing=False,
        export_format="GLB",
        collection=name,
        export_yup=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_extras=False,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        export_use_gltfpack=False,
        export_copyright="オーナー",
    )
    objects = sorted(o.name for o in collection.all_objects)
    return {"ok": result == {"FINISHED"}, "path": path, "bytes": os.path.getsize(path), "objects": objects}


print(export_glb(globals().get("NAME", "car")))
