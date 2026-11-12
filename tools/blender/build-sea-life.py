# NORI-28：ステージ4の海の生きもの（7種類）を作る。専用ユーザー（noriblender）の Blender の中で実行する。
# 決まり（docs/game-rules.md「海の生きもののモデル」）：部品は body（1つ）、三角形 1500 個以下、
# 大きさは ASSET.sea.sizes。前は Blender の +Y（書き出しで glTF の −Z）、上は +Z、原点は底の中心。
# 本物の生きものを参考にした自作の形（既存のゲームのキャラクターをまねない）。乱数は使わない（何度作っても同じ）。
#
# 使い方：blender-work/tools/ に写してから
#   runpy.run_path(r"<リポジトリ>\blender-work\tools\build-sea-life.py", init_globals={"NAME": "sea-turtle"})
#   続けて export-glb.py を init_globals={"NAME": "sea-turtle"} で動かす
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# ASSET.sea.sizes と同じ（幅＝X、長さ＝Y、高さ＝Z）
SIZES = {
    "sea-turtle": (2.0, 2.4, 0.8),
    "sea-ray": (3.6, 4.0, 0.5),
    "sea-jellyfish": (1.6, 1.6, 2.4),
    "sea-octopus": (2.2, 2.2, 1.8),
    "sea-tropical": (0.5, 1.4, 1.0),
    "sea-dolphin": (1.4, 4.0, 1.4),
    "sea-fish": (0.3, 0.8, 0.45),
}

# 色（線形の RGB, A）。粗さ。アルファが 1 未満なら半透明
COLORS = {
    "shell": ((0.12, 0.16, 0.05, 1), 0.7),
    "turtle_skin": ((0.35, 0.42, 0.18, 1), 0.8),
    "ray_top": ((0.18, 0.17, 0.15, 1), 0.7),
    "ray_belly": ((0.8, 0.8, 0.78, 1), 0.7),
    "jelly": ((1.0, 0.45, 0.75, 0.7), 0.3),
    "octopus": ((0.75, 0.16, 0.06, 1), 0.6),
    "tang": ((1.0, 0.75, 0.02, 1), 0.5),
    "tang_band": ((0.02, 0.02, 0.02, 1), 0.5),
    "dolphin_top": ((0.2, 0.26, 0.32, 1), 0.35),
    "dolphin_belly": ((0.75, 0.78, 0.8, 1), 0.35),
    "fish_top": ((0.12, 0.3, 0.5, 1), 0.3),
    "fish_belly": ((0.85, 0.88, 0.9, 1), 0.3),
    "eye": ((0.01, 0.01, 0.01, 1), 0.2),
}


def _material(key: str) -> bpy.types.Material:
    name = f"sea_{key}"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    color, rough = COLORS[key]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Alpha"].default_value = color[3]
    if color[3] < 1:
        mat.surface_render_method = "BLENDED"  # glTF の alphaMode BLEND
    return mat


class Builder:
    """1つのメッシュに、部品を足していく（部品ごとに色の番号）"""

    def __init__(self):
        self.bm = bmesh.new()
        self.keys: list[str] = []

    def _slot(self, key: str) -> int:
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def _finish(self, verts, key: str, matrix: Matrix) -> None:
        bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)
        slot = self._slot(key)
        vs = set(verts)
        for f in self.bm.faces:
            if all(v in vs for v in f.verts):
                f.material_index = slot

    def sphere(self, key, center, scale, segments=16, rings=10, rot=(0, 0, 0), shape=None):
        made = bmesh.ops.create_uvsphere(self.bm, u_segments=segments, v_segments=rings, radius=1.0)
        verts = made["verts"]
        if shape is not None:
            for v in verts:
                v.co = shape(v.co)
        m = (
            Matrix.Translation(center)
            @ Matrix.Rotation(rot[2], 4, "Z")
            @ Matrix.Rotation(rot[1], 4, "Y")
            @ Matrix.Rotation(rot[0], 4, "X")
            @ Matrix.Diagonal((*scale, 1))
        )
        self._finish(verts, key, m)
        return verts

    def cone(self, key, center, r1, r2, depth, rot=(0, 0, 0), segments=8):
        made = bmesh.ops.create_cone(
            self.bm, cap_ends=True, segments=segments, radius1=r1, radius2=r2, depth=depth
        )
        m = (
            Matrix.Translation(center)
            @ Matrix.Rotation(rot[2], 4, "Z")
            @ Matrix.Rotation(rot[1], 4, "Y")
            @ Matrix.Rotation(rot[0], 4, "X")
        )
        self._finish(made["verts"], key, m)

    def tube(self, key, points, radii, segments=6):
        """点の列に沿った、だんだん細くなる管（タコの腕・クラゲの足）"""
        rings = []
        for i, (p, r) in enumerate(zip(points, radii)):
            a = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])
            a.normalize()
            side = a.cross(Vector((0, 0, 1)))
            if side.length < 1e-3:
                side = Vector((1, 0, 0))
            side.normalize()
            up = side.cross(a)
            rings.append(
                [
                    self.bm.verts.new(
                        Vector(p) + (side * math.cos(t) + up * math.sin(t)) * r
                    )
                    for t in (2 * math.pi * k / segments for k in range(segments))
                ]
            )
        faces = []
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(segments):
                faces.append(self.bm.faces.new((r0[k], r0[(k + 1) % segments], r1[(k + 1) % segments], r1[k])))
        faces.append(self.bm.faces.new(list(reversed(rings[0]))))
        faces.append(self.bm.faces.new(rings[-1]))
        slot = self._slot(key)
        for f in faces:
            f.material_index = slot

    def fin(self, key, pts, thickness=0.02):
        """平たいひれ（点の列の多角形を、厚み thickness で押し出す。点は X=0 の面か Z の面に置く）"""
        top = [self.bm.verts.new(Vector(p)) for p in pts]
        face = self.bm.faces.new(top)
        face.normal_update()
        ext = bmesh.ops.extrude_face_region(self.bm, geom=[face])
        moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, vec=face.normal * thickness, verts=moved)
        slot = self._slot(key)
        for f in {f for v in top + moved for f in v.link_faces}:
            f.material_index = slot

    def mesh(self, name: str) -> bpy.types.Mesh:
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        bmesh.ops.triangulate(self.bm, faces=self.bm.faces[:])
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for key in self.keys:
            mesh.materials.append(_material(key))
        for p in mesh.polygons:
            p.use_smooth = True
        return mesh


def _belly(b: Builder, top: str, belly: str, below: float) -> None:
    """下を向いた面（法線の Z が below より下）を、おなかの色にする"""
    b.bm.normal_update()
    t, s = b._slot(top), b._slot(belly)
    for f in b.bm.faces:
        if f.material_index == t and f.normal.z < below:
            f.material_index = s


# ---- 種類ごとの形（大きさはあとで SIZES に合わせるので、形の比だけを決める） ----


def turtle(b: Builder) -> None:
    # 甲羅：上が丸く下が平たい
    b.sphere("shell", (0, 0, 0.35), (0.95, 1.15, 0.45), shape=lambda c: Vector((c.x, c.y, c.z if c.z > 0 else c.z * 0.35)))
    b.sphere("turtle_skin", (0, 1.35, 0.35), (0.28, 0.36, 0.24), segments=10, rings=7)  # 頭
    for sx in (-1, 1):
        # 前のひれ（長く、後ろへ反る）と後ろのひれ（短い）
        b.sphere("turtle_skin", (sx * 1.15, 0.45, 0.3), (0.75, 0.22, 0.06), segments=10, rings=6, rot=(0, 0, sx * -0.5))
        b.sphere("turtle_skin", (sx * 0.65, -1.0, 0.25), (0.35, 0.18, 0.05), segments=8, rings=5, rot=(0, 0, sx * 0.6))
    b.cone("turtle_skin", (0, -1.25, 0.3), 0.1, 0.0, 0.3, rot=(math.pi / 2, 0, 0))
    b.sphere("eye", (0.16, 1.55, 0.42), (0.04, 0.04, 0.04), segments=6, rings=4)
    b.sphere("eye", (-0.16, 1.55, 0.42), (0.04, 0.04, 0.04), segments=6, rings=4)


def ray(b: Builder) -> None:
    # ひし形の平たい体：翼の先ほど後ろへ反り、薄くなる
    def wing(c):
        x = c.x
        return Vector((x, c.y - abs(x) * 0.35, c.z * (1 - 0.8 * abs(x))))

    b.sphere("ray_top", (0, 0.4, 0.25), (1.8, 1.1, 0.22), segments=20, rings=8, shape=wing)
    _belly(b, "ray_top", "ray_belly", -0.4)
    b.tube("ray_top", [(0, -0.3, 0.25), (0, -0.9, 0.25), (0, -1.5, 0.27), (0, -2.0, 0.3)], [0.12, 0.07, 0.04, 0.015])
    b.sphere("eye", (0.25, 1.05, 0.38), (0.05, 0.05, 0.05), segments=6, rings=4)
    b.sphere("eye", (-0.25, 1.05, 0.38), (0.05, 0.05, 0.05), segments=6, rings=4)


def jellyfish(b: Builder) -> None:
    # かさ（上半分の球）と、ゆるく波打つ足 8 本
    b.sphere("jelly", (0, 0, 1.6), (0.8, 0.8, 0.7), segments=16, rings=8, shape=lambda c: Vector((c.x, c.y, max(c.z, -0.05))))
    for k in range(8):
        a = 2 * math.pi * k / 8
        pts = []
        for i in range(5):
            t = i / 4
            r = 0.5 - 0.15 * t
            wob = 0.12 * math.sin(t * 5 + k)
            pts.append((math.cos(a) * r + wob, math.sin(a) * r, 1.55 - 1.5 * t))
        b.tube("jelly", pts, [0.06, 0.05, 0.04, 0.03, 0.015], segments=5)


def octopus(b: Builder) -> None:
    # 頭（後ろ上へ伸びた丸）と、外へ広がって先が丸まる腕 8 本
    b.sphere("octopus", (0, -0.15, 1.15), (0.5, 0.6, 0.6), rot=(-0.4, 0, 0))
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        pts = []
        for i in range(6):
            t = i / 5
            r = 0.25 + 0.8 * t
            z = 0.55 - 0.45 * math.sin(t * math.pi * 0.7) + 0.25 * t * t
            pts.append((math.cos(a) * r, math.sin(a) * r, z))
        b.tube("octopus", pts, [0.16, 0.13, 0.1, 0.07, 0.05, 0.03], segments=6)
    b.sphere("eye", (0.2, 0.35, 0.9), (0.08, 0.08, 0.08), segments=8, rings=5)
    b.sphere("eye", (-0.2, 0.35, 0.9), (0.08, 0.08, 0.08), segments=8, rings=5)


def tropical(b: Builder) -> None:
    # チョウチョウウオ風：高くて平たい黄色い体、目を通る黒い帯、背びれ・しりびれ・尾びれ
    b.sphere("tang", (0, 0, 0.5), (0.12, 0.45, 0.38), segments=14, rings=10)
    b.sphere("tang_band", (0, 0.22, 0.52), (0.13, 0.06, 0.3), segments=10, rings=6)
    b.fin("tang", [(0, -0.3, 0.8), (0, 0.15, 0.86), (0, -0.4, 0.95)])
    b.fin("tang", [(0, -0.3, 0.2), (0, 0.05, 0.14), (0, -0.4, 0.05)])
    b.fin("tang", [(0, -0.42, 0.5), (0, -0.68, 0.72), (0, -0.62, 0.5), (0, -0.68, 0.28)])
    b.sphere("eye", (0.1, 0.28, 0.6), (0.03, 0.03, 0.03), segments=6, rings=4)
    b.sphere("eye", (-0.1, 0.28, 0.6), (0.03, 0.03, 0.03), segments=6, rings=4)


def dolphin(b: Builder) -> None:
    # 前ほど細い流線形の体、口先、背びれ、胸びれ、横向きの尾びれ
    b.sphere("dolphin_top", (0, 0.1, 0.55), (0.42, 1.6, 0.42), segments=16, rings=12)
    # 前後に伸ばした球に、細り方をつける（前ほど細い）
    for v in b.bm.verts:
        y = (v.co.y - 0.1) / 1.6
        t = (y + 1) / 2
        k = 0.4 + 0.6 * math.sin(min(1.0, max(0.0, t) * 1.15) * math.pi * 0.7)
        v.co.x *= k
        v.co.z = 0.55 + (v.co.z - 0.55) * k
    _belly(b, "dolphin_top", "dolphin_belly", -0.2)
    b.cone("dolphin_top", (0, 1.85, 0.5), 0.12, 0.06, 0.4, rot=(-math.pi / 2, 0, 0))  # 口先
    b.fin("dolphin_top", [(0, -0.1, 0.9), (0, 0.35, 0.92), (0, -0.35, 1.3)], 0.06)  # 背びれ
    for sx in (-1, 1):
        b.sphere("dolphin_top", (sx * 0.45, 0.7, 0.35), (0.3, 0.14, 0.04), segments=8, rings=5, rot=(0, sx * 0.3, sx * 0.5))
    b.fin("dolphin_top", [(-0.7, -1.95, 0.55), (0, -1.55, 0.55), (0.7, -1.95, 0.55), (0, -1.75, 0.55)], 0.05)  # 尾びれ
    b.sphere("eye", (0.2, 1.35, 0.62), (0.04, 0.04, 0.04), segments=6, rings=4)
    b.sphere("eye", (-0.2, 1.35, 0.62), (0.04, 0.04, 0.04), segments=6, rings=4)


def fish(b: Builder) -> None:
    # イワシ風：細長い銀色の体（背は青）と尾びれ
    b.sphere("fish_top", (0, 0.05, 0.22), (0.09, 0.32, 0.12), segments=10, rings=8)
    _belly(b, "fish_top", "fish_belly", 0.1)
    b.fin("fish_top", [(0, -0.25, 0.22), (0, -0.4, 0.35), (0, -0.36, 0.22), (0, -0.4, 0.09)])
    b.sphere("eye", (0.06, 0.25, 0.25), (0.015, 0.015, 0.015), segments=6, rings=4)
    b.sphere("eye", (-0.06, 0.25, 0.25), (0.015, 0.015, 0.015), segments=6, rings=4)


SHAPES = {
    "sea-turtle": turtle,
    "sea-ray": ray,
    "sea-jellyfish": jellyfish,
    "sea-octopus": octopus,
    "sea-tropical": tropical,
    "sea-dolphin": dolphin,
    "sea-fish": fish,
}


def _fit(obj: bpy.types.Object, size) -> dict:
    """幅（X）・長さ（Y）・高さ（Z）を SIZES に合わせ、原点を底の中心にする"""
    pts = [v.co.copy() for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    sx, sy, sz = (size[i] / max(1e-6, hi[i] - lo[i]) for i in range(3))
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    for v in obj.data.vertices:
        v.co = Vector(((v.co.x - cx) * sx, (v.co.y - cy) * sy, (v.co.z - lo.z) * sz))
    obj.data.update()
    return {"scale": [round(sx, 3), round(sy, 3), round(sz, 3)]}


def build(name: str) -> dict:
    if name not in SHAPES:
        return {"ok": False, "error": f"知らない生きもの：{name!r}"}
    # 前に作った同じ名前のコレクションだけ消して作り直す（ほかには触れない）
    old = bpy.data.collections.get(name)
    if old is not None:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    for mesh in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(mesh)
    # Blender の名前は全体で1つだけ。前に作った生きものの body は、書き出し済みなので名前を変えておく
    for o in bpy.data.objects:
        if o.name == "body":
            owner = o.users_collection[0].name if o.users_collection else "old"
            o.name = f"{owner}-body"
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    b = Builder()
    SHAPES[name](b)
    body = bpy.data.objects.new("body", b.mesh(f"{name}-body"))
    col.objects.link(body)
    fit = _fit(body, SIZES[name])
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    return {"ok": True, "name": name, "triangles": tris, "materials": len(body.data.materials), **fit}


result = build(globals().get("NAME", "sea-turtle"))
print(result)
