# NORI-19：ステージ1の車（オリジナル）を組み立てる。専用ユーザー（noriblender）の Blender の中で実行する。
# 形：角を丸めたおもちゃのような小さな車。オレンジの車体、クリーム色のライン、水色の窓、丸いライト。
# 大きさ・名前・向きは docs/game-rules.md「3D モデル（アセット）」に合わせる（数値は下の定数。ゲーム側の ASSET と同じ）。
#
# Blender の座標：前 +Y、左 −X、上 +Z（書き出すと glTF の前 −Z・上 +Y）。原点は車体の底の中心。
# 作ったあと C:\NoriBlender\work\car.blend に保存する。書き出しは tools/blender/export-glb.py。
#
# 使い方：REBUILD = False; exec(open(r"<このファイル>", encoding="utf-8").read())
#   コレクション car にすでに物があれば止まる（REBUILD = True のときだけ、car の中の物を消して作り直す）
import math
import os

import bpy

WIDTH, LENGTH, HEIGHT = 1.8, 3.4, 1.7  # ASSET.carSize（幅・長さ・高さ）
WHEEL_R, WHEEL_W = 0.42, 0.30
WHEEL_X, WHEEL_Y = 0.80, 1.15  # タイヤを少し外に出して、後ろからも見えるようにする（幅 1.94 m。±10% の内側）
SAVE_PATH = r"C:\NoriBlender\work\car.blend"


def material(name, rgb, roughness=0.55, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    # ノードの名前は Blender の言語で翻訳されることがある（日本語では別の名前）。種類と識別子で探す
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    inputs = {s.identifier: s for s in bsdf.inputs}
    inputs["Base Color"].default_value = (*rgb, 1.0)
    inputs["Roughness"].default_value = roughness
    if emission is not None:
        inputs["Emission Color"].default_value = (*emission, 1.0)
        inputs["Emission Strength"].default_value = 1.0
    return mat


def srgb(hex_value):
    # 16進の色（sRGB）を Blender の線形の値に直す
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin((hex_value >> s) & 0xFF) for s in (16, 8, 0))


def finish(obj, mat, bevel=0.0, segments=3):
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth_by_angle()
    return obj


def box(size, center, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel)


def cylinder(radius, depth, center, rotation, mat, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center, rotation=rotation)
    obj = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish(obj, mat)


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    return obj


def build():
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    col = bpy.data.collections.get("car")
    if col is not None and len(col.objects) > 0:
        if not globals().get("REBUILD", False):
            return {"ok": False, "error": "コレクション car に物がある。作り直すなら REBUILD = True"}
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    if col is None:
        col = bpy.data.collections.new("car")
        bpy.context.scene.collection.children.link(col)
    layer_col = bpy.context.view_layer.layer_collection.children[col.name]
    bpy.context.view_layer.active_layer_collection = layer_col

    orange = material("car_body", srgb(0xFF8A1F))
    cream = material("car_trim", srgb(0xFFF3D6), 0.6)
    glass = material("car_glass", srgb(0x6FC8FF), 0.15)
    tire = material("car_tire", srgb(0x2B2B33), 0.9)
    light = material("car_light", srgb(0xFFF7A8), 0.3, emission=srgb(0x665C10))

    # 車体（下）：タイヤの上半分を覆う高さ。角を大きく丸める
    lower_bottom, lower_top = 0.46, 0.98  # 底を上げて、タイヤを見せる
    parts = [
        box((WIDTH, LENGTH, lower_top - lower_bottom), (0, 0, (lower_bottom + lower_top) / 2), orange, bevel=0.22),
        # すそのライン（前後のバンパーを兼ねる）
        box((WIDTH - 0.02, LENGTH + 0.04, 0.12), (0, 0, lower_bottom + 0.08), cream, bevel=0.05),
        # まど（キャビン）。少し後ろ寄り
        box((WIDTH - 0.3, 1.7, 0.62), (0, -0.2, lower_top + 0.28), glass, bevel=0.14),
        # 屋根
        box((WIDTH - 0.24, 1.78, 0.12), (0, -0.2, HEIGHT - 0.06), orange, bevel=0.05),
    ]
    # 丸いライト（前の面。+Y）
    for x in (-0.55, 0.55):
        parts.append(cylinder(0.16, 0.08, (x, LENGTH / 2 - 0.01, 0.68), (math.pi / 2, 0, 0), light, vertices=20))
    # 後ろのライト（後ろの面。−Y）。追従カメラは後ろから映すので、前後が分かる目印にする。
    # 形は前（丸）と変えて横長の四角。色は赤ではなく濃いピンク（怖くない・目立つ）
    tail = material("car_tail", srgb(0xFF5C93), 0.4, emission=srgb(0x5A1430))
    for x in (-0.58, 0.58):
        parts.append(box((0.34, 0.08, 0.16), (x, -LENGTH / 2 + 0.01, 0.74), tail, bevel=0.04))
    body = join(parts, "body")

    wheels = []
    for name, x, y in (
        ("wheel_FL", -WHEEL_X, WHEEL_Y),
        ("wheel_FR", WHEEL_X, WHEEL_Y),
        ("wheel_RL", -WHEEL_X, -WHEEL_Y),
        ("wheel_RR", WHEEL_X, -WHEEL_Y),
    ):
        # 原点はタイヤの中心（回す軸）。軸は X。回転は適用して、オブジェクトの回転は 0 にする
        t = cylinder(WHEEL_R, WHEEL_W, (0, 0, 0), (0, math.pi / 2, 0), tire)
        # トレッド（接地面）の4面に1面を明るい色にする。後ろから見ても回っているのが分かる（三角形は増えない）
        t.data.materials.append(cream)
        tread = [p for p in t.data.polygons if abs(p.normal.x) < 0.5]
        tread.sort(key=lambda p: math.atan2(p.center.z, p.center.y))
        for k, p in enumerate(tread):
            if k % 4 == 0:
                p.material_index = 1
        hub = cylinder(0.2, WHEEL_W + 0.02, (0, 0, 0), (0, math.pi / 2, 0), cream, vertices=16)
        # 回っているのが分かる、ハブの横棒
        bar = box((WHEEL_W + 0.04, 0.06, 0.34), (0, 0, 0), cream)
        wheel = join([t, hub, bar], name)
        wheel.location = (x, y, WHEEL_R)
        wheels.append(wheel)

    os.makedirs(os.path.dirname(SAVE_PATH), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=SAVE_PATH)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in [body, *wheels]:
        mesh = o.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        tris += len(mesh.loop_triangles)
        o.evaluated_get(depsgraph).to_mesh_clear()
    return {
        "ok": True,
        "objects": sorted(o.name for o in col.objects),
        "triangles": tris,
        "dimensions_body": tuple(round(v, 3) for v in body.dimensions),
        "saved": SAVE_PATH,
    }


print(build())
