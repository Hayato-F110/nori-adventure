# NORI-65：ステージ5のボス（月のいきもの。オリジナル）を組み立てる。専用ユーザー（noriblender）の Blender の中で実行する。
# 形：まるい体に、大きく丸い目（光の点つき）・小さな丸い腕・口 3 つ（への字・まっすぐ・笑顔）。歯・爪・とげは付けない。
# 大きさ・名前・素材は docs/game-rules.md「ボスのモデル（NORI-65）」に合わせる（数値は下の定数。ゲーム側の ASSET.boss と同じ）。
# 形の数は、今の簡単な形（src/render/stage5View.ts のボス）と、docs/test-plans/NORI-65.md の「計算」の節から。
#
# Blender の座標：前 +Y、左 −X、上 +Z（書き出すと glTF の前 −Z・上 +Y）。原点は体の底の中心。
# 8 つの部品は親子にしない（ゲームは body だけをふくらませる）。body の原点は (0, 0, 0)。
# 作ったあと blender-work/boss.blend に保存する。書き出しは tools/blender/export-glb.py（NAME = "boss"）。
#
# 使い方：runpy.run_path(r"<リポジトリ>\blender-work\tools\build-boss.py", init_globals={"REBUILD": True})
#   コレクション boss にすでに物があれば止まる（REBUILD = True のときだけ、boss の中の物を消して作り直す）
import math
import os

import bmesh
import bpy

WIDTH, HEIGHT, LENGTH = 8, 6, 6.6  # ASSET.boss.size（幅・高さ・長さ）
NODES = ["body", "eye_L", "eye_R", "arm_L", "arm_R", "mouth_frown", "mouth_flat", "mouth_smile"]  # ASSET.boss.nodes
BODY_MATERIAL = "boss_body"  # ASSET.boss.materials。body・腕だけが使う（ゲームが色を塗る）

RADIUS = 3.0  # BOSS.radius（体の半径。当たり判定と同じ）
PUFF_SCALE = 0.12  # BOSS.puffScale（いちばんふくらんだときの体の前の端 ＝ 3 × 1.12 ＝ 3.36）
FACE_AHEAD = 0.2  # ASSET.boss.faceAhead（目・口の前の端は 3.36 ＋ 0.2 ＝ 3.56 より前）
FACE_FRONT = RADIUS * (1 + PUFF_SCALE) + FACE_AHEAD  # 3.56

EYE_X, EYE_Z = 1.0, RADIUS + 0.9  # 今の簡単な形と同じ（左右 1 m、高さ 3.9 m）
EYE_R, PUPIL_R, SHINE_R = 0.55, 0.28, 0.09
EYE_Y = 2.95  # 白目の中心。白目の前の端 3.5、黒目の前の端 3.63（≥ 3.56）
PUPIL_AHEAD = 0.4  # 黒目は白目の中心から前へ 0.4 m（今の簡単な形と同じ）

ARM_X, ARM_Z, ARM_TILT = RADIUS + 0.3, RADIUS * 0.8, 0.6  # 今の簡単な形と同じ（外の端 4.04 m → 幅 8.08 m）
ARM_R, ARM_LEN = 0.4, 1.2

MOUTH_R, MOUTH_THICK = 0.9, 0.14  # 弧の半径と、線の太さの半分（今の簡単な形と同じ）
# 口は、体に貼り付いた曲がった帯にする（まっすぐ前へ伸ばすと、横から見て筒になる）。
# 前の面は体と同じ中心で半径 3.68 m の球の面、後ろの面は体の面より 0.15 m 内側。
# 口ごとのいちばん前の点：への字 3.61・まっすぐ 3.67・笑顔 3.59 m（どれも FACE_FRONT 3.56 以上。NORI-65.md「計算」）
MOUTH_SHELL_R = 3.68
MOUTH_SINK = 0.15


def _work_dir():
    # 作業フォルダ = このファイルの置き場所（blender-work/tools）の1つ上。パスを直接書かない
    from pathlib import Path

    here = Path(globals().get("__file__", "")).resolve().parent
    work = here.parent if here.name == "tools" else Path.cwd()
    if work.name != "blender-work":
        raise RuntimeError("blender-work/tools/ に写してから runpy.run_path で実行する")
    return work


SAVE_PATH = str(_work_dir() / "boss.blend")


def srgb(hex_value):
    # 16進の色（sRGB）を Blender の線形の値に直す
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin((hex_value >> s) & 0xFF) for s in (16, 8, 0))


def material(name, rgb, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    # ノードの名前は Blender の言語で翻訳されることがある。種類と識別子で探す
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    inputs = {s.identifier: s for s in bsdf.inputs}
    inputs["Base Color"].default_value = (*rgb, 1.0)
    inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (*rgb, 1.0)  # Blender の画面での色（確かめの絵用。glTF には書き出さない）
    return mat


def sphere(radius, center, mat, segments, rings):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=center)
    obj = bpy.context.object
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


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


def set_origin(obj, point):
    # 原点を point に動かす（見た目の位置は変えない）
    bpy.context.scene.cursor.location = point
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)


def arc_points(kind, segments=16):
    # 口の線（前から見た x・z）。への字は上に凸、笑顔は下に凸、まっすぐは横の線（今の簡単な形と同じ高さ）
    if kind == "frown":
        zc = RADIUS - 0.2
        return [(MOUTH_R * math.cos(math.pi * i / segments), zc + MOUTH_R * math.sin(math.pi * i / segments)) for i in range(segments + 1)]
    if kind == "smile":
        zc = RADIUS + 0.1
        return [(MOUTH_R * math.cos(math.pi * i / segments), zc - MOUTH_R * math.sin(math.pi * i / segments)) for i in range(segments + 1)]
    z = RADIUS - 0.3
    return [(-0.84 + 1.68 * i / 4, z) for i in range(5)]


def shell_y(radius, x, z):
    # 体と同じ中心 (0, 0, RADIUS) の、半径 radius の球の面の前（+Y）の y
    return math.sqrt(max(radius * radius - x * x - (z - RADIUS) ** 2, 0.0))


def mouth(kind, mat):
    # 線の断面（太さ 0.28 m）を、体の面の少し内側から、半径 3.68 m の球の面まで伸ばした帯。前から見ると線
    pts = arc_points(kind)
    mesh = bpy.data.meshes.new(f"mouth_{kind}")
    bm = bmesh.new()
    rings = []
    for i, (x, z) in enumerate(pts):
        # 線に直角な向き（前から見た面の中）
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        n = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / n, tx / n
        ring = []
        for s, front in ((1, False), (1, True), (-1, True), (-1, False)):
            vx, vz = x + nx * MOUTH_THICK * s, z + nz * MOUTH_THICK * s
            vy = shell_y(MOUTH_SHELL_R, vx, vz) if front else shell_y(RADIUS, vx, vz) - MOUTH_SINK
            ring.append(bm.verts.new((vx, vy, vz)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"mouth_{kind}", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    # 角は丸めない（丸めると三角形が 1 本の口で 300 個ほど増え、上限 4000 をこえる。黒い線なので角は目立たない）
    xs = [p[0] for p in pts]
    zs = [p[1] for p in pts]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    set_origin(obj, (cx, shell_y(RADIUS, cx, cz), cz))
    return obj


def arm(side, mat):
    # 丸い腕：円柱と両端の球。原点は腕の中心。y まわり（前から見て）に傾けて、体の横から少し上へ
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=ARM_R, depth=ARM_LEN, location=(0, 0, 0))
    cyl = bpy.context.object
    cyl.data.materials.append(mat)
    ends = [sphere(ARM_R, (0, 0, s * ARM_LEN / 2), mat, 12, 8) for s in (-1, 1)]
    obj = join([cyl, *ends], "arm_L" if side < 0 else "arm_R")
    bpy.ops.object.shade_smooth()
    obj.rotation_euler = (0, -side * ARM_TILT, 0)
    obj.location = (side * ARM_X, 0, ARM_Z)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def eye(side, white, dark):
    cx = side * EYE_X
    parts = [
        sphere(EYE_R, (cx, EYE_Y, EYE_Z), white, 16, 10),
        sphere(PUPIL_R, (cx, EYE_Y + PUPIL_AHEAD, EYE_Z), dark, 16, 10),
        # 光の点（黒目の左上）。やさしい目に見せる
        sphere(SHINE_R, (cx + 0.08, EYE_Y + PUPIL_AHEAD + 0.2, EYE_Z + 0.1), white, 8, 6),
    ]
    obj = join(parts, "eye_L" if side < 0 else "eye_R")
    set_origin(obj, (cx, EYE_Y, EYE_Z))
    return obj


def build():
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    col = bpy.data.collections.get("boss")
    if col is not None and len(col.objects) > 0:
        if not globals().get("REBUILD", False):
            return {"ok": False, "error": "コレクション boss に物がある。作り直すなら REBUILD = True"}
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    if col is None:
        col = bpy.data.collections.new("boss")
        bpy.context.scene.collection.children.link(col)
    layer_col = bpy.context.view_layer.layer_collection.children[col.name]
    bpy.context.view_layer.active_layer_collection = layer_col

    body_mat = material(BODY_MATERIAL, srgb(0xE8604C), 0.8)  # BOSS.angryColor（ゲームが届けた回数で塗りかえる）
    white = material("boss_eye", srgb(0xFFFFFF), 0.4)
    dark = material("boss_dark", srgb(0x1A1A22), 0.4)  # 黒目・口

    body = sphere(RADIUS, (0, 0, RADIUS), body_mat, 32, 16)
    body.name = body.data.name = "body"
    set_origin(body, (0, 0, 0))  # 原点は底の中心。ゲームはここを中心にふくらませる

    parts = [body, eye(-1, white, dark), eye(1, white, dark), arm(-1, body_mat), arm(1, body_mat)]
    parts += [mouth(k, dark) for k in ("frown", "flat", "smile")]

    os.makedirs(os.path.dirname(SAVE_PATH), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=SAVE_PATH)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tris = 0
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    fronts = {}
    for o in parts:
        ev = o.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        tris += len(mesh.loop_triangles)
        ys = []
        for v in mesh.vertices:
            w = o.matrix_world @ v.co
            for k in range(3):
                lo[k], hi[k] = min(lo[k], w[k]), max(hi[k], w[k])
            ys.append(w[1])
        fronts[o.name] = round(max(ys), 3)
        ev.to_mesh_clear()
    return {
        "ok": True,
        "objects": sorted(o.name for o in col.objects),
        "parents": {o.name: (o.parent.name if o.parent else None) for o in parts},
        "triangles": tris,
        "size_w_h_l": (round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)),
        "bottom": round(lo[2], 3),
        "body_location": tuple(round(v, 3) for v in body.location),
        "face_front_min": min(fronts[n] for n in NODES if n.startswith(("eye", "mouth"))),
        "need_front": round(FACE_FRONT, 3),
        "saved": SAVE_PATH,
    }


result = build()
print(result)
