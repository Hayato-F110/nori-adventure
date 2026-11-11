# NORI-26：光のベイク（ステージ2）。山道の地面に落ちる柔らかい陰（AO）を、Cycles で1枚の画像に焼き付ける。
# 専用ユーザー（noriblender）の Blender の中で実行する。
# 入力：blender-work/assets/stage2-layout.json（オーナーのユーザーで `npm run layout:export`。ゲームと同じ配置）
# 出力：blender-work/export/textures/ground_ao_stage2.webp、blender-work/stage2-bake.blend
# 取り込み：`npm run textures:import`（ほかの素材と一緒に検査して public/textures/ へ）
#
# 陰を落とす物：線路の土手（上面と斜面）、木（幹の円柱と葉の球）、山（円すい）、駅のホームと屋根。
# 焼き付ける範囲は中心 (0, 0) の LOOK.mountainBakeSize m 四方（ゲームの uv1 と同じ。setGroundUv1）。
# 座標：ゲーム (x, 上 y, z) → Blender (x, −z, 上)。ゲームの向き（+Y まわり）＝ Blender の +Z まわり
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\bake-stage2-ao.py")
import json
import math
from pathlib import Path

import bmesh
import bpy


def _work_dir() -> Path:
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


def _clear_scene():
    # 消してよいのは、まだ保存していないファイルか、乗り物・ベイクのファイルだけ（bake-ground-ao.py と同じ考え方）
    current = Path(bpy.data.filepath).name if bpy.data.filepath else ""
    allowed = {"", "stage1-bake.blend", "stage2-bake.blend", "train.blend", "plane.blend", "sub.blend", "rover.blend"}
    if current not in allowed:
        raise RuntimeError(f"開いているファイル {current!r} は消さない。新しいファイルにしてから実行する")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_recursive=True)


def _link(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _embankment(track, scenery) -> bpy.types.Object:
    """線路の土手：上面（幅 bedHalf×2、高さ 線路＋bedTop）と、地面まで下ろす斜面（ゲームの stage2View と同じ断面）"""
    half, top = scenery["bedHalf"], scenery["bedTop"]
    bm = bmesh.new()
    rings = []
    for p in track:
        foot = half + 0.3 + (p["y"] + top) * 0.8
        rx, rz = math.cos(p["heading"]), -math.sin(p["heading"])  # 右（上から見て。ゲームの xz）
        ring = []
        for lateral, height in ((-foot, 0.0), (-half, p["y"] + top), (half, p["y"] + top), (foot, 0.0)):
            ring.append(bm.verts.new((p["x"] + rx * lateral, -(p["z"] + rz * lateral), height)))
        rings.append(ring)
    for i in range(len(rings)):
        a, b = rings[i], rings[(i + 1) % len(rings)]  # 閉じた輪
        for k in range(3):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    return _link("embankment", bm)


def _box(name, x, z, ground_y, heading, width, length, bottom, top):
    """ゲームの (x, z) を中心に、向き heading の箱（横 width・前後 length、高さ bottom〜top）"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= width
        v.co.y *= length
        v.co.z = bottom if v.co.z < 0 else top
    obj = _link(name, bm)
    obj.location = (x, -z, 0.0)
    obj.rotation_euler = (0.0, 0.0, heading)
    return obj


def bake() -> dict:
    work = _work_dir()
    data = json.loads((work / "assets" / "stage2-layout.json").read_text(encoding="utf-8"))
    look, scenery = data["look"], data["scenery"]
    size = look["bakeSize"]
    px = look["lightmapSize"]

    _clear_scene()
    scene = bpy.context.scene
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    # 焼き付ける地面（UV は平面の既定のまま 0〜1。u が +X、v が Blender の +Y ＝ ゲームの −Z）
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = "ground"

    _embankment(data["track"], scenery)
    for i, t in enumerate(data["trees"]):
        s = t["scale"]
        # 木（幅 3・高さ 4 m）のおおよその形：幹と、葉の丸いかたまり
        bpy.ops.mesh.primitive_cylinder_add(radius=0.25 * s, depth=1.8 * s, location=(t["x"], -t["z"], 0.9 * s), vertices=8)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.45 * s, location=(t["x"], -t["z"], 2.55 * s), segments=12, ring_count=8)
    for i, m in enumerate(data["mountains"]):
        bpy.ops.mesh.primitive_cone_add(
            vertices=7, radius1=m["radius"], depth=m["height"], location=(m["x"], -m["z"], m["height"] / 2),
            rotation=(0, 0, m["rotation"]),
        )
    plat = scenery["platform"]
    for i, p in enumerate(data["platforms"]):
        y = p["y"]
        _box(f"platform_{i}", p["x"], p["z"], y, p["heading"], plat["width"], plat["length"], 0.0, y + plat["height"])
        roof_y = y + plat["height"] + 2.7
        _box(f"roof_{i}", p["x"], p["z"], y, p["heading"], plat["width"] + 0.6, plat["length"] + 0.6, roof_y - 0.1, roof_y + 0.1)

    # 焼き付け先の画像（地面の材質の、選んだ画像ノード）
    image = bpy.data.images.new("ground_ao_stage2", px, px, alpha=False)
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
    dst = out_dir / "ground_ao_stage2.webp"
    out = bpy.data.images.new("ground_ao_stage2_out", px, px, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    pixels = [0.0] * (px * px * 4)
    image.pixels.foreach_get(pixels)
    out.pixels.foreach_set(pixels)
    out.file_format = "WEBP"
    out.save(filepath=str(dst), quality=85)
    bpy.data.images.remove(out)
    values = pixels[0::4]
    bpy.ops.wm.save_as_mainfile(filepath=str(work / "stage2-bake.blend"))
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
