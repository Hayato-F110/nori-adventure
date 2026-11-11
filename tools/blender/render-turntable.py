# 紹介動画（NORI-43）の素材：乗り物を1台ずつ 360° 回す動画を Cycles で描く（連番の PNG）。
# 今の Blender の画面を止めないよう、画面のない Blender（同じ noriblender・同じ隔離）を別に立ち上げて描く。
#
# 使い方：blender-work/tools/ に写してから、MCP で（まず init_globals={"MODE": "test"} で各台1枚を試す）
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\render-turntable.py")
#   → 画面のない Blender を始めて、すぐ返る（result に pid とログの場所）
# 画面のない側では、この同じファイルが `-- render` 付きで動き、描く。
# 出力：blender-work/renders/turntable/<名前>/0001.png〜（すでにある絵は描かない＝途中から続けられる）
# 動画にまとめるのはオーナーの側で ffmpeg（docs の手順）。
import math
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Vector

VEHICLES = ["car", "train", "plane", "sub", "rover"]
FPS = 24
SECONDS = 10  # 1周の長さ
RES = (1280, 720)  # GPU がない PC（CPU だけ）で、5台を数時間で描ける大きさ
SAMPLES = 24  # ノイズ除去と合わせて使う。CPU で1枚約10秒
HDRI = "kloofendal_48d_partly_cloudy_puresky_4k.hdr"  # CC0（assets/hdri/asset.json）


def _work_dir():
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから実行する")
    return work


def start(mode):
    """MCP から呼ぶ側：画面のない Blender を始めてすぐ返る。mode="test" は各台の1枚目だけを turntable-test/ に描く。"""
    work = _work_dir()
    out = work / "renders" / ("turntable-test" if mode == "test" else "turntable")
    out.mkdir(parents=True, exist_ok=True)
    log = open(out / "log.txt", "a", encoding="utf-8")
    proc = subprocess.Popen(
        [bpy.app.binary_path, "--background", "--factory-startup", "--python", str(Path(__file__).resolve()), "--", mode],
        stdout=log,
        stderr=subprocess.STDOUT,
        cwd=str(work),
    )
    return {"ok": True, "pid": proc.pid, "log": str(out / "log.txt")}


def _clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def _setup_world(scene, work):
    world = bpy.data.worlds.new("turntable_world")
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(work / "assets" / "hdri" / HDRI))
    nt.links.new(env.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
    scene.world = world


def _render_one(scene, work, name, test):
    _clear()
    bpy.ops.import_scene.gltf(filepath=str(work / "export" / f"{name}.glb"))
    imported = [o for o in bpy.context.selected_objects]
    pivot = bpy.data.objects.new("turntable_pivot", None)
    scene.collection.objects.link(pivot)
    for o in imported:
        if o.parent is None:
            o.parent = pivot
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in imported if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = (hi - lo).length / 2
    # 床（グレー。影を受ける）
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=radius * 12, fill_type="NGON", location=(center.x, center.y, lo.z))
    floor = bpy.context.active_object
    mat = bpy.data.materials.new("turntable_floor")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.32, 0.33, 0.35, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    floor.data.materials.append(mat)
    # 回転：1周を SECONDS 秒で、等速
    frames = FPS * SECONDS
    pivot.location = (0, 0, 0)
    pivot.rotation_euler = (0, 0, 0)
    pivot.keyframe_insert("rotation_euler", index=2, frame=1)
    pivot.rotation_euler = (0, 0, math.tau)
    pivot.keyframe_insert("rotation_euler", index=2, frame=frames + 1)
    for fc in _fcurves(pivot):
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"
    # カメラ：斜め前の上から
    cam_data = bpy.data.cameras.new("turntable_cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("turntable_cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = center + Vector((1.0, 1.4, 0.55)).normalized() * radius * 5.5  # 縦の画角（約23°）に、回しても入る距離
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun_data = bpy.data.lights.new("turntable_sun", "SUN")
    sun_data.energy = 2.5
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("turntable_sun", sun_data)
    sun.rotation_euler = (math.radians(45), 0, math.radians(35))
    scene.collection.objects.link(sun)
    scene.frame_start, scene.frame_end = 1, (1 if test else frames)
    out = work / "renders" / ("turntable-test" if test else "turntable") / name
    out.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(out) + "/"
    print(f"[turntable] {name}: start", flush=True)
    bpy.ops.render.render(animation=True)
    print(f"[turntable] {name}: done", flush=True)


def _fcurves(obj):
    ad = obj.animation_data
    if ad is None or ad.action is None:
        return []
    action = ad.action
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    # 5.x の層つきのアクション
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            bag = strip.channelbag(ad.action_slot)
            if bag:
                out.extend(bag.fcurves)
    return out


def render_all(test):
    work = _work_dir()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.image_settings.file_format = "PNG"
    scene.render.use_overwrite = False  # すでにある絵は描かない（続きから）
    scene.render.use_placeholder = True
    _setup_world(scene, work)
    for name in VEHICLES:
        try:
            _render_one(scene, work, name, test)
        except Exception as e:  # 1台が失敗しても、ほかの台は描く
            print(f"[turntable] {name}: error {e!r}", flush=True)
    print("[turntable] all done", flush=True)


_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if bpy.app.background and _args and _args[0] in ("render", "test"):
    render_all(_args[0] == "test")
else:
    result = start(globals().get("MODE", "render"))
    print(result)
