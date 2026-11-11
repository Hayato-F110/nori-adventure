# NORI-20〜23：作った乗り物を、確認用に絵にする（斜め前と斜め後ろの2枚）。noriblender の Blender の中で実行する。
# 一時的なカメラ・光を足して描き、描き終わったら消す（.blend には残さない。保存もしない）。
# 出力：blender-work/renders/<名前>-front.png・<名前>-rear.png
#
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\preview-vehicle.py", init_globals={"NAME": "train"})
#   AI 動画の元の画像にするときは RES=(1920, 1080)、BG=（空の色。線形の RGB）、SUFFIX="-ai" を足す
import math
from pathlib import Path

import bpy
from mathutils import Vector


def _work_dir():
    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


def preview(name):
    col = bpy.data.collections.get(name)
    if col is None:
        return {"ok": False, "error": f"コレクション {name!r} がない"}
    pts = [o.matrix_world @ Vector(c) for o in col.objects for c in o.bound_box]
    center = sum(pts, Vector()) / len(pts)
    radius = max((p - center).length for p in pts)
    scene = bpy.context.scene
    temp = []
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    temp.append(cam)
    sun_data = bpy.data.lights.new("preview_sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("preview_sun", sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    temp.append(sun)
    old = (scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath, scene.world)
    world = bpy.data.worlds.new("preview_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (*globals().get("BG", (0.75, 0.82, 0.9)), 1.0)
    bg.inputs[1].default_value = 0.8
    scene.world = world
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = globals().get("RES", (960, 640))
    out_dir = _work_dir() / "renders"
    out_dir.mkdir(exist_ok=True)
    files = []
    try:
        # 前は Blender の +Y。斜め前（右前の上）と斜め後ろ（左後ろの上）
        for label, direction in (("front", Vector((1.0, 1.4, 0.8))), ("rear", Vector((-1.0, -1.4, 0.9)))):
            cam.location = center + direction.normalized() * radius * 3.2
            cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
            path = str(out_dir / f"{name}-{label}{globals().get('SUFFIX', '')}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            files.append(path)
    finally:
        scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath, scene.world = old
        for o in temp:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.cameras.remove(cam_data)
        bpy.data.lights.remove(sun_data)
        bpy.data.worlds.remove(world)
    return {"ok": True, "files": files}


result = preview(globals().get("NAME", "train"))
print(result)
