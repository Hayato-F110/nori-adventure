# NORI-56：光のベイク。ステージ1の地面に落ちる柔らかい陰（AO）を、Cycles で1枚の画像に焼き付ける。
# 専用ユーザー（noriblender）の Blender の中で実行する。
# 入力：blender-work/assets/stage1-layout.json（オーナーのユーザーで `npm run layout:export`。ゲームと同じ配置）
# 出力：blender-work/export/textures/ground_ao.webp、blender-work/stage1-bake.blend
# 取り込み：`npm run textures:import`（ほかの素材と一緒に検査して public/textures/ へ）
#
# 座標：ゲーム (x, 上 y, z) → Blender (x, −z, 上)。地面の UV は u = (x + 半分) / 大きさ、v = (−z + 半分) / 大きさ
#       （ゲームの uv1 と同じ。画像の上の端が z = −半分）
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\bake-ground-ao.py")
import json
from pathlib import Path

import bpy


def _work_dir() -> Path:
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


def _clear_scene():
    # 消してよいのは、まだ保存していないファイルか、乗り物・ベイクのファイルだけ（build-vehicles.py と同じ考え方）
    current = Path(bpy.data.filepath).name if bpy.data.filepath else ""
    allowed = {"", "stage1-bake.blend", "train.blend", "plane.blend", "sub.blend", "rover.blend"}
    if current not in allowed:
        raise RuntimeError(f"開いているファイル {current!r} は消さない。新しいファイルにしてから実行する")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)


def _box(name, x, z, w, d, h):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, h / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    return o


def bake() -> dict:
    work = _work_dir()
    data = json.loads((work / "assets" / "stage1-layout.json").read_text(encoding="utf-8"))
    stage, look = data["stage"], data["look"]
    size = stage["groundSize"]
    px = look["lightmapSize"]

    _clear_scene()
    scene = bpy.context.scene
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    # 地面（UV は平面の既定のまま 0〜1。u が +X、v が Blender の +Y ＝ ゲームの −Z）
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "ground"
    for i, b in enumerate(data["buildings"]):
        _box(f"building_{i}", b["x"], b["z"], b["halfWidth"] * 2, b["halfDepth"] * 2, b["height"])
    for i, t in enumerate(data["trees"]):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=1.6, location=(t["x"], -t["z"], 0.8), vertices=8)
        bpy.ops.mesh.primitive_ico_sphere_add(radius=1.4, subdivisions=1, location=(t["x"], -t["z"], 2.4))

    # 焼き付け先の画像（地面の材質の、選んだ画像ノード）
    image = bpy.data.images.new("ground_ao", px, px, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("ground_bake")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    mat.node_tree.nodes.active = node
    ground.data.materials.append(mat)

    # Cycles の AO：陰の届く距離は world の設定。空は一様な白（光の向きによらない陰にする）
    scene.render.engine = "CYCLES"
    scene.cycles.samples = look["bakeSamples"]
    scene.cycles.device = "CPU"
    world = scene.world or bpy.data.worlds.new("bake_world")
    scene.world = world
    world.light_settings.distance = look["aoDistance"]

    bpy.ops.object.select_all(action="DESELECT")
    ground.select_set(True)
    bpy.context.view_layer.objects.active = ground
    bpy.ops.object.bake(type="AO", margin=4, use_clear=True)

    # 白黒の画像は WebP に書けないことがある（export-textures.py と同じ）。カラーの画像に写して保存する
    out_dir = work / "export" / "textures"
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / "ground_ao.webp"
    out = bpy.data.images.new("ground_ao_out", px, px, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    pixels = [0.0] * (px * px * 4)
    image.pixels.foreach_get(pixels)
    out.pixels.foreach_set(pixels)
    out.file_format = "WEBP"
    out.save(filepath=str(dst), quality=85)
    bpy.data.images.remove(out)
    values = pixels[0::4]
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "stage1-bake.blend"))
    return {
        "ok": True,
        "file": str(dst),
        "bytes": dst.stat().st_size,
        "min": round(min(values), 3),
        "max": round(max(values), 3),
        "mean": round(sum(values) / len(values), 3),
    }


result = bake()
print(result)
