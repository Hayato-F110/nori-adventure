# NORI-27・28：光のベイク（ステージ3の地面・ステージ4の海底）。山・気球・岩・たからばこの足元に落ちる柔らかい陰（AO）を、
# Cycles で1枚の画像に焼き付ける。専用ユーザー（noriblender）の Blender の中で実行する。
# 入力：blender-work/assets/stage<3|4>-layout.json（オーナーのユーザーで `npm run layout:export`。値は設定 STAGE3・STAGE4 のまま）
# 出力：blender-work/export/textures/ground_ao_stage<3|4>.webp、blender-work/stage<3|4>-bake.blend
# 取り込み：`npm run textures:import`（ほかの素材と一緒に検査して public/textures/ へ）
#
# 形：cones（円すい。x・z は底の中心、radius・height・sides・rotation）、spheres（球。y は地面からの中心の高さ）、
#     boxes（箱。x・z・width・length・bottom・top）。焼き付ける範囲は中心 (0, 0) の look.bakeSize m 四方（ゲームの uv1 と同じ）
# 座標：ゲーム (x, 上 y, z) → Blender (x, −z, 上)。ゲームの向き（+Y まわり）＝ Blender の +Z まわり
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\bake-sky-sea-ao.py", init_globals={"STAGE": 3})
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
    # 消してよいのは、まだ保存していないファイルか、乗り物・ベイクのファイルだけ（bake-stage2-ao.py と同じ考え方）
    current = Path(bpy.data.filepath).name if bpy.data.filepath else ""
    allowed = {"", "stage1-bake.blend", "stage2-bake.blend", "stage3-bake.blend", "stage4-bake.blend"}
    if current not in allowed:
        raise RuntimeError(f"開いているファイル {current!r} は消さない。新しいファイルにしてから実行する")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)


def bake(stage: int) -> dict:
    if stage not in (3, 4):
        raise ValueError("STAGE は 3 か 4")
    work = _work_dir()
    data = json.loads((work / "assets" / f"stage{stage}-layout.json").read_text(encoding="utf-8"))
    look = data["look"]
    size = look["bakeSize"]
    px = look["lightmapSize"]
    name = f"ground_ao_stage{stage}"

    _clear_scene()
    scene = bpy.context.scene
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    # 焼き付ける地面（UV は平面の既定のまま 0〜1。u が +X、v が Blender の +Y ＝ ゲームの −Z）
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "ground"

    for c in data["cones"]:
        bpy.ops.mesh.primitive_cone_add(
            vertices=c["sides"], radius1=c["radius"], depth=c["height"],
            location=(c["x"], -c["z"], c["height"] / 2), rotation=(0, 0, c["rotation"]),
        )
    for s in data["spheres"]:
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=s["radius"], location=(s["x"], -s["z"], s["y"]), segments=16, ring_count=10,
        )
    for b in data["boxes"]:
        h = b["top"] - b["bottom"]
        bpy.ops.mesh.primitive_cube_add(size=1, location=(b["x"], -b["z"], b["bottom"] + h / 2))
        bpy.context.object.scale = (b["width"], b["length"], h)

    # 焼き付け先の画像（地面の材質の、選んだ画像ノード）
    image = bpy.data.images.new(name, px, px, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("ground_bake")
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    mat.node_tree.nodes.active = node
    ground.data.materials.append(mat)

    # Cycles の AO：陰の届く距離は world の設定。空は一様（光の向きによらない陰）
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

    # 白黒の画像は WebP に書けないことがある（bake-ground-ao.py と同じ）。カラーの画像に写して保存する
    out_dir = work / "export" / "textures"
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f"{name}.webp"
    out = bpy.data.images.new(f"{name}_out", px, px, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    pixels = [0.0] * (px * px * 4)
    image.pixels.foreach_get(pixels)
    out.pixels.foreach_set(pixels)
    out.file_format = "WEBP"
    out.save(filepath=str(dst), quality=85)
    bpy.data.images.remove(out)
    values = pixels[0::4]
    bpy.ops.wm.save_as_mainfile(filepath=str(work / f"stage{stage}-bake.blend"))
    return {
        "ok": True,
        "file": str(dst),
        "bytes": dst.stat().st_size,
        "min": round(min(values), 3),
        "max": round(max(values), 3),
        "mean": round(sum(values) / len(values), 3),
    }


result = bake(int(globals().get("STAGE", 0)))
print(result)
