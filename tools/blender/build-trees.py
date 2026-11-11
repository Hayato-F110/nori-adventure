# NORI-26：ステージ1・2で共通の木（2種類）を作る。専用ユーザー（noriblender）の Blender の中で実行する。
# 決まり（docs/game-rules.md「木」）：幅 3 m・高さ 4 m・奥行き 3 m、部品は trunk（幹）・leaves（葉）、
# 三角形 800 個以下。原点は幹の底の中心。Blender では Z が上（書き出しで glTF の Y が上になる）。
# UV はメートル単位（ゲームの素材は LOOK.surfaces の tileMeters で繰り返す）。色は低画質のときの単色。
# 形は決まった式で作る（乱数を使わない。何度作っても同じ木）。
#
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\build-trees.py", init_globals={"NAME": "tree-a"})
#   続けて export-glb.py を init_globals={"NAME": "tree-a", "TEXCOORDS": True} で動かす
import math

import bmesh
import bpy
from mathutils import Vector

WIDTH, HEIGHT = 3.0, 4.0  # ASSET.tree.size
TRUNK_COLOR = (0.27, 0.11, 0.03, 1.0)  # 線形の RGB（今の簡単な木の幹 #8d5a2b に近い）
LEAF_COLOR = (0.05, 0.37, 0.07, 1.0)  # 線形の RGB（今の簡単な木の葉 #3fa34d に近い）

# 種類ごとの形：幹の曲がり（x・y）と、葉のかたまり（中心 x・y・z、半径、つぶれ具合）
SHAPES = {
    "tree-a": {
        "bend": (0.18, 0.05),
        "blobs": [((0.0, 0.0, 2.55), 1.15, 0.85), ((0.45, 0.15, 3.2), 0.75, 0.9), ((-0.4, -0.25, 3.1), 0.7, 0.9)],
    },
    "tree-b": {
        "bend": (-0.1, 0.16),
        "blobs": [
            ((0.0, 0.0, 2.4), 1.05, 0.8),
            ((-0.5, 0.3, 2.9), 0.75, 0.85),
            ((0.4, -0.35, 3.0), 0.7, 0.85),
            ((0.05, 0.1, 3.45), 0.55, 0.9),
        ],
    },
}


def _hash(i: float) -> float:
    """0〜1 の決まった値（葉のでこぼこに使う）"""
    v = math.sin(i * 12.9898 + 78.233) * 43758.5453
    return v - math.floor(v)


def _material(name: str, color) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.9
    return mat


def _uv_meters(bm: bmesh.types.BMesh) -> None:
    """面の向きに近い軸で投影した UV（1 = 1 m）。素材が伸びない"""
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        axis = max(range(3), key=lambda k: abs(n[k]))
        for loop in face.loops:
            co = loop.vert.co
            loop[uv].uv = (co.y, co.z) if axis == 0 else (co.x, co.z) if axis == 1 else (co.x, co.y)


def _trunk(bend) -> bpy.types.Mesh:
    bm = bmesh.new()
    # 7角の円柱を3段に分け、上ほど細く・曲げる
    rings = 4
    sides = 7
    height = 2.2
    verts = []
    for r in range(rings):
        t = r / (rings - 1)
        radius = 0.26 - 0.11 * t
        ox, oy = bend[0] * t * t, bend[1] * t * t
        verts.append(
            [
                bm.verts.new((ox + radius * math.cos(a), oy + radius * math.sin(a), height * t))
                for a in (2 * math.pi * k / sides for k in range(sides))
            ]
        )
    for r in range(rings - 1):
        for k in range(sides):
            a, b = verts[r][k], verts[r][(k + 1) % sides]
            c, d = verts[r + 1][(k + 1) % sides], verts[r + 1][k]
            bm.faces.new((a, b, c, d))
    bm.faces.new(list(reversed(verts[0])))  # 底（葉の中に入る上の端はふさがない）
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    _uv_meters(bm)
    mesh = bpy.data.meshes.new("trunk")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    return mesh


def _leaves(blobs) -> bpy.types.Mesh:
    bm = bmesh.new()
    for i, (center, radius, squash) in enumerate(blobs):
        # 大きなかたまり（半径 1 m 以上）は細かく丸く、小さいのは粗く（三角形 800 個以下に収める）
        made = bmesh.ops.create_icosphere(bm, subdivisions=2 if radius >= 1.0 else 1, radius=radius)
        for j, v in enumerate(made["verts"]):
            # でこぼこ（±10%）と、上下のつぶれ
            k = 1 + (_hash(i * 97 + j) - 0.5) * 0.2
            v.co = Vector((v.co.x * k + center[0], v.co.y * k + center[1], v.co.z * k * squash + center[2]))
    bm.normal_update()
    _uv_meters(bm)
    mesh = bpy.data.meshes.new("leaves")
    bm.to_mesh(mesh)
    bm.free()
    return mesh  # 平らな面のまま（今の木と同じ、角のあるおもちゃのような見た目）


def _fit(objs) -> dict:
    """全体を幅・奥行き 3 m・高さ 4 m に合わせる（原点は幹の底の中心のまま）"""
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    sxy = WIDTH / max(hi.x - lo.x, hi.y - lo.y)
    sz = HEIGHT / (hi.z - lo.z)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for o in objs:
        for v in o.data.vertices:
            v.co = Vector(((v.co.x - cx) * sxy, (v.co.y - cy) * sxy, (v.co.z - lo.z) * sz))
        o.data.update()
    return {"scaleXY": round(sxy, 3), "scaleZ": round(sz, 3)}


def build(name: str) -> dict:
    if name not in SHAPES:
        return {"ok": False, "error": f"知らない木：{name!r}"}
    # 前の木（同じ名前の部品）を消してから作る。ほかのコレクションには触れない
    for old in [c for c in bpy.data.collections if c.name in SHAPES]:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    for mesh in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(mesh)
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    shape = SHAPES[name]
    trunk = bpy.data.objects.new("trunk", _trunk(shape["bend"]))
    leaves = bpy.data.objects.new("leaves", _leaves(shape["blobs"]))
    trunk.data.materials.append(_material("tree_trunk", TRUNK_COLOR))
    leaves.data.materials.append(_material("tree_leaves", LEAF_COLOR))
    for o in (trunk, leaves):
        col.objects.link(o)
    fit = _fit([trunk, leaves])
    tris = sum(len(p.vertices) - 2 for o in (trunk, leaves) for p in o.data.polygons)
    return {"ok": True, "name": name, "objects": [trunk.name, leaves.name], "triangles": tris, **fit}


result = build(globals().get("NAME", "tree-a"))
print(result)
