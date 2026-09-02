import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/** 投掷线速度倍率、自转角速度幅值、滚动阶段阻尼（数值越大转得越久） */
const ENTRY_SPEED_MUL = 1.58
const AV_SPIN_RANGE = 19
const LINEAR_DAMP_ROLL = 0.988
const FLOOR_SPIN_KEEP = 0.972
/** 空气阻力：每帧衰减角速度，滚动更有「重量感」 */
const AV_AIR_DAMP = 0.994
const FLOOR_BOUNCE_Y = 0.54
/** 向中心收拢强度（降低以减少不自然的牵引感） */
const CENTER_PULL = 0.22
/** 多颗骰子出生时沿 X 错开间距（世界单位） */
const SPAWN_X_STRIDE = 2.15
/** 面上数字留白比例：略收窄，避免大点数文本贴边/越界 */
const FACE_UV_FILL = 0.36
/** d12 需要更大留白，避免数字切到五边形边缘 */
const D12_FACE_UV_FILL = 0.25
/** 全局数字字号缩放（统一到参考图可读比例） */
const NUMBER_FONT_SCALE_MUL = 0.78
/** 归一化后碰撞/视觉半径（世界单位），各面型先建几何再缩放到该包围球半径 */
const TARGET_DIE_RADIUS = 0.72
/** 2D 圆碰撞额外间隙（补偿 3D 凸出、减少穿模） */
const EXTRA_COLLISION_GAP = 0.18
/** 单面数字贴图分辨率与字号基准（乘 faceFontMulBySides） */
const DICE_TEX_SIZE = 256
const DICE_FACE_FONT_SCALE = 0.38
/** 面数字相对上一档手调倍率：整体再 ×0.9 */
const FACE_FONT_GLOBAL_MUL = 0.9
/** d6 在整体缩小后再单独 ×0.8 */
const FACE_FONT_D6_EXTRA_MUL = 0.8

/**
 * 面贴图内字号倍率（手调基准再乘全局 / d6 额外缩小）。
 */
function faceFontMulBySides(sides) {
  const s = Number(sides)
  let m = 0.9
  if (s === 20) m = 0.9
  else if (s === 10) m = 0.7
  else if (s === 8) m = 0.9
  else if (s === 12) m = 0.7
  else if (s === 6) m = 2
  else if (s === 4) m = 0.7
  m *= FACE_FONT_GLOBAL_MUL
  if (s === 6) m *= FACE_FONT_D6_EXTRA_MUL
  return m
}
/** d10 去尖化强度（0~1）：越大越接近圆角实物骰外形 */
const D10_BLUNTNESS = 0.46
/** d100：个位骰 0–9，十位骰 00–90（与几何面序 0..9 一致） */
const D100_ONES_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const D100_TENS_LABELS = ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']
/** MeshStandardMaterial：略提高金属度、降低粗糙度，让受光面与背光面对比更明显 */
const DICE_METALNESS = 0.26
const DICE_ROUGHNESS = 0.34
/** 与主环境光叠加的暖/冷染色（低强度），不抢主光 */
const AMBIENT_WARM_COLOR = 0xffd4a8
const AMBIENT_WARM_INT = 0.08
const AMBIENT_COOL_COLOR = 0xa8c8ff
const AMBIENT_COOL_INT = 0.07
const AMBIENT_ACCENT_COLOR = 0xe8d4ff
const AMBIENT_ACCENT_INT = 0.05

function faceAxesFromNormal(n) {
  // 用 worldUp 在面内的投影作为基准，保证各面数字方向稳定。
  const worldUp = new THREE.Vector3(0, 1, 0)
  let tangent = new THREE.Vector3().copy(worldUp).sub(new THREE.Vector3().copy(n).multiplyScalar(worldUp.dot(n)))
  if (tangent.lengthSq() < 1e-8) {
    tangent = new THREE.Vector3(1, 0, 0).sub(new THREE.Vector3().copy(n).multiplyScalar(n.x))
  }
  tangent.normalize()
  const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize()
  return { tangent, bitangent }
}

function colorBySides(sides) {
  // 统一为参考图风格：红色面底 + 米白外框
  return 0xb81825
}

function hexCss(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`
}

/**
 * 将 group 内几何统一缩放到约等于 targetR 的包围球半径，使各骰子在屏幕上大小一致；
 * 碰撞半径与 TARGET_DIE_RADIUS 一致。
 */
function normalizeDieGroupSize(group, targetR) {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty()) return targetR
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  const r0 = Math.max(sphere.radius, 1e-4)
  group.scale.setScalar(targetR / r0)
  return targetR
}

/** 视觉体积校准：以 d6 为基准，其他面型略放大以对齐“看起来的体积” */
function dieVisualScaleBySides(sides) {
  if (sides === 6) return 1.0
  // d4 单独再收小；其余非 d6 相对 d6 再放大一档，贴近「体积感」一致
  if (sides === 4) return 0.92
  if (sides === 8) return 1.45
  if (sides === 10) return 1.5
  if (sides === 12) return 1.46
  if (sides === 20) return 1.44
  return 1.4
}

function drawTextVisualCenter(ctx, text, cx, cy) {
  const m = ctx.measureText(text)
  const left = m.actualBoundingBoxLeft ?? 0
  const right = m.actualBoundingBoxRight ?? 0
  const ascent = m.actualBoundingBoxAscent ?? 0
  const descent = m.actualBoundingBoxDescent ?? 0
  const w = left + right
  const h = ascent + descent
  const ox = left - w / 2
  const oy = ascent - h / 2
  ctx.fillText(text, cx + ox, cy + oy)
}

/**
 * 单面数字贴图（与面同色底 + 字）。不设矩形描边，便于作为 mesh 材质与多面体一体受光。
 * @param {{ strokeFrame?: boolean }} [opts] 默认无描边；若需旧版线框可传 strokeFrame: true
 */
function makeNumberTexture(text, bgHex, opts = {}) {
  const strokeFrame = opts.strokeFrame === true
  const texSize = Number(opts.texSize) > 0 ? Number(opts.texSize) : 128
  const useFrame = opts.useFrame !== false
  const canvas = document.createElement('canvas')
  canvas.width = texSize
  canvas.height = texSize
  const ctx = canvas.getContext('2d')
  const frame = '#f5efe2'
  const inner = '#c01f2f'
  if (useFrame) {
    ctx.fillStyle = frame
    ctx.fillRect(0, 0, texSize, texSize)
    const pad = Math.max(8, Math.floor(texSize * 0.12))
    ctx.fillStyle = inner
    ctx.fillRect(pad, pad, texSize - pad * 2, texSize - pad * 2)
  } else {
    ctx.fillStyle = inner
    ctx.fillRect(0, 0, texSize, texSize)
  }
  if (strokeFrame) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, texSize - 8, texSize - 8)
  }
  ctx.fillStyle = '#fffaf0'
  const baseScale = Number(opts.fontScale) > 0 ? Number(opts.fontScale) : 0.42
  const fontScale = baseScale * NUMBER_FONT_SCALE_MUL
  const fs = Math.floor(texSize * fontScale)
  ctx.font = `bold ${fs}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawTextVisualCenter(ctx, String(text), texSize / 2, texSize / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

/** d10/d12 等：整面铺开 1..N，滚动时能看到多面数字 */
function makeWrappedNumbersTexture(sides, bgHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f5efe2'
  ctx.fillRect(0, 0, 512, 512)
  ctx.fillStyle = '#c01f2f'
  ctx.fillRect(52, 52, 408, 408)
  const cx = 256
  const cy = 256
  const R = Math.min(200, 80 + sides * 8)
  const fontSize = sides > 12 ? 40 : 48
  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(ang) * R
    const y = cy + Math.sin(ang) * R
    ctx.fillStyle = '#fffaf0'
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), x, y)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText(`d${sides}`, 256, 480)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

/**
 * 标准 RPG 十面骰：五方偏方面体（Pentagonal Trapezohedron），非圆锥。
 * 顶点与面片来自 dmccooey.com/polyhedra/PentagonalTrapezohedron
 */
function createPentagonalTrapezohedronGeometry(radius = 1) {
  const SQ5 = Math.sqrt(5)
  const C0 = (SQ5 - 1) / 4
  const C1 = (1 + SQ5) / 4
  const C2 = (3 + SQ5) / 4

  const raw = [
    [0, C0, C1],
    [0, C0, -C1],
    [0, -C0, C1],
    [0, -C0, -C1],
    [0.5, 0.5, 0.5],
    [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],
    [-0.5, -0.5, -0.5],
    [C2, -C1, 0],
    [-C2, C1, 0],
    [C0, C1, 0],
    [-C0, -C1, 0],
  ]
  let maxR = 0
  for (const p of raw) {
    maxR = Math.max(maxR, Math.hypot(p[0], p[1], p[2]))
  }
  const s = radius / maxR
  const verts = raw.map(([x, y, z]) => new THREE.Vector3(x * s, y * s, z * s))

  // 参考实物骰外观：将过尖顶点向统一半径收敛，得到更“圆角”的 d10 轮廓。
  const radii = verts.map((v) => v.length())
  const minR = Math.min(...radii)
  const maxRR = Math.max(...radii)
  const targetR = THREE.MathUtils.lerp(maxRR, minR, 0.58)
  for (const v of verts) {
    const r = v.length()
    if (r < 1e-8) continue
    const newR = THREE.MathUtils.lerp(r, targetR, D10_BLUNTNESS)
    v.multiplyScalar(newR / r)
  }

  const faces = [
    [8, 2, 6, 11],
    [8, 11, 7, 3],
    [8, 3, 1, 5],
    [8, 5, 10, 4],
    [8, 4, 0, 2],
    [9, 0, 4, 10],
    [9, 10, 5, 1],
    [9, 1, 3, 7],
    [9, 7, 11, 6],
    [9, 6, 2, 0],
  ]

  const pos = []
  const pushTri = (a, b, c) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }

  for (const [ia, ib, ic, id] of faces) {
    const va = verts[ia]
    const vb = verts[ib]
    const vc = verts[ic]
    const vd = verts[id]
    const fc = new THREE.Vector3().add(va).add(vb).add(vc).add(vd).multiplyScalar(0.25)
    const e1 = new THREE.Vector3().subVectors(vb, va)
    const e2 = new THREE.Vector3().subVectors(vc, va)
    const n = new THREE.Vector3().crossVectors(e1, e2)
    if (n.dot(fc) < 0) {
      pushTri(va, vc, vb)
      pushTri(va, vd, vc)
    } else {
      pushTri(va, vb, vc)
      pushTri(va, vc, vd)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  geo.userData.d10Faces = faces
  geo.userData.d10Verts = verts.map((v) => v.clone())
  return geo
}

function geometryBySides(sides) {
  if (sides === 4) return new THREE.TetrahedronGeometry(0.95, 0)
  if (sides === 6) return new THREE.BoxGeometry(1.2, 1.2, 1.2)
  if (sides === 8) return new THREE.OctahedronGeometry(0.9, 0)
  if (sides === 10) return createPentagonalTrapezohedronGeometry(0.96)
  if (sides === 12) return new THREE.DodecahedronGeometry(0.96, 0)
  if (sides === 20) return new THREE.IcosahedronGeometry(1.0, 0)
  return new THREE.BoxGeometry(1.2, 1.2, 1.2)
}

/**
 * 按每个三角面的真实形状做平面投影 UV：纹理中心 (0.5,0.5) 对齐面心，避免数字歪到棱上或跨面。
 */
function applyPlanarFaceUVs(geo, faceCount) {
  const pos = geo.attributes.position
  const uvArr = new Float32Array(pos.count * 2)

  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3
    const v0 = new THREE.Vector3().fromBufferAttribute(pos, i0)
    const v1 = new THREE.Vector3().fromBufferAttribute(pos, i0 + 1)
    const v2 = new THREE.Vector3().fromBufferAttribute(pos, i0 + 2)

    const e1 = new THREE.Vector3().subVectors(v1, v0)
    const e2 = new THREE.Vector3().subVectors(v2, v0)
    const n = new THREE.Vector3().crossVectors(e1, e2)
    const nLen = n.length()
    if (nLen < 1e-10) continue
    n.multiplyScalar(1 / nLen)

    const c = new THREE.Vector3().addVectors(v0, v1).add(v2).multiplyScalar(1 / 3)
    let tangent = new THREE.Vector3().copy(e1).normalize()
    const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize()
    tangent = new THREE.Vector3().crossVectors(bitangent, n).normalize()

    const pts = [new THREE.Vector3().subVectors(v0, c), new THREE.Vector3().subVectors(v1, c), new THREE.Vector3().subVectors(v2, c)]
    const xs = pts.map((p) => p.dot(tangent))
    const ys = pts.map((p) => p.dot(bitangent))
    let maxR = 0
    for (let k = 0; k < 3; k++) {
      maxR = Math.max(maxR, Math.hypot(xs[k], ys[k]))
    }
    const scale = maxR > 1e-8 ? FACE_UV_FILL / maxR : 1

    for (let k = 0; k < 3; k++) {
      const vi = i0 + k
      uvArr[vi * 2] = xs[k] * scale + 0.5
      uvArr[vi * 2 + 1] = ys[k] * scale + 0.5
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2))
}

/** @param {number} [vertexStride] 每面起始顶点偏移：三角面片为 3，d10 风筝面为 6（两三角共材质） */
function faceOutwardNormal(geo, faceIndex, vertexStride = 3) {
  const pos = geo.attributes.position
  const i0 = faceIndex * vertexStride
  const v0 = new THREE.Vector3().fromBufferAttribute(pos, i0)
  const v1 = new THREE.Vector3().fromBufferAttribute(pos, i0 + 1)
  const v2 = new THREE.Vector3().fromBufferAttribute(pos, i0 + 2)
  const e1 = new THREE.Vector3().subVectors(v1, v0)
  const e2 = new THREE.Vector3().subVectors(v2, v0)
  const n = new THREE.Vector3().crossVectors(e1, e2).normalize()
  const c = new THREE.Vector3().addVectors(v0, v1).add(v2).multiplyScalar(1 / 3)
  if (n.dot(c) < 0) n.negate()
  return n
}

function d6FaceNormalByValue(value) {
  // d6 贴图标签映射：+x,-x,+y,-y,+z,-z => 3/4/5/2/1/6
  if (value === 1) return new THREE.Vector3(0, 0, 1)
  if (value === 2) return new THREE.Vector3(0, -1, 0)
  if (value === 3) return new THREE.Vector3(1, 0, 0)
  if (value === 4) return new THREE.Vector3(-1, 0, 0)
  if (value === 5) return new THREE.Vector3(0, 1, 0)
  return new THREE.Vector3(0, 0, -1) // 6
}

/**
 * 多面体（non-indexed，每三角一面）：按面分组，每面一张贴图 + MeshStandardMaterial，与几何一体参与光照。
 */
function meshPolyhedronWithFaceTextures(baseGeo, faceCount, color) {
  const geo = baseGeo.clone()
  const pos = geo.attributes.position
  const nVert = pos.count
  if (nVert !== faceCount * 3) {
    geo.dispose()
    return null
  }

  const fontMul = faceFontMulBySides(faceCount)

  applyPlanarFaceUVs(geo, faceCount)
  geo.computeVertexNormals()

  geo.clearGroups()
  const materials = []
  for (let f = 0; f < faceCount; f++) {
    const map = makeNumberTexture(String(f + 1), color, {
      texSize: DICE_TEX_SIZE,
      fontScale: DICE_FACE_FONT_SCALE * fontMul,
    })
    materials.push(
      new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        metalness: DICE_METALNESS,
        roughness: DICE_ROUGHNESS,
      }),
    )
    geo.addGroup(f * 3, 3, f)
  }

  const mesh = new THREE.Mesh(geo, materials)
  mesh.renderOrder = 0
  return { mesh, geo, materials }
}

/** d10：10 个风筝面；用 userData 角点算 UV，避免三角化绕序变化导致数字歪到棱上 */
function applyPlanarD10KiteUVs(geo) {
  const faces = geo.userData.d10Faces
  const verts = geo.userData.d10Verts
  if (!faces || !verts) return

  const pos = geo.attributes.position
  const uvArr = new Float32Array(pos.count * 2)
  const nKites = 10

  for (let f = 0; f < nKites; f++) {
    const quad = faces[f]
    const pA = verts[quad[0]]
    const pB = verts[quad[1]]
    const pC = verts[quad[2]]
    const pD = verts[quad[3]]

    const c = new THREE.Vector3().add(pA).add(pB).add(pC).add(pD).multiplyScalar(0.25)
    const e1 = new THREE.Vector3().subVectors(pB, pA)
    const e2 = new THREE.Vector3().subVectors(pC, pA)
    const nn = new THREE.Vector3().crossVectors(e1, e2)
    const nlen = nn.length()
    if (nlen < 1e-10) continue
    const n = nn.multiplyScalar(1 / nlen)
    let tangent = new THREE.Vector3().copy(e1).normalize()
    const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize()
    tangent = new THREE.Vector3().crossVectors(bitangent, n).normalize()

    const corners = [pA, pB, pC, pD]
    const proj = corners.map((p) => {
      const q = new THREE.Vector3().subVectors(p, c)
      return { x: q.dot(tangent), y: q.dot(bitangent) }
    })
    let maxR = 0
    for (const p of proj) maxR = Math.max(maxR, Math.hypot(p.x, p.y))
    const scale = maxR > 1e-8 ? FACE_UV_FILL / maxR : 1
    const cornerUV = proj.map((p) => ({ u: p.x * scale + 0.5, v: p.y * scale + 0.5 }))

    const base = f * 6
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, base + k)
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < 4; i++) {
        const d = p.distanceToSquared(verts[quad[i]])
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      uvArr[(base + k) * 2] = cornerUV[best].u
      uvArr[(base + k) * 2 + 1] = cornerUV[best].v
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2))
}

/** @param {string[] | null} [faceLabels] 长度 10 时按面序覆盖默认 1–10（用于 d100 双 d10） */
function meshD10WithFaceTextures(baseGeo, color, faceLabels = null) {
  const geo = baseGeo.clone()
  const pos = geo.attributes.position
  if (pos.count !== 60) {
    geo.dispose()
    return null
  }

  applyPlanarD10KiteUVs(geo)
  geo.computeVertexNormals()

  const fontMul = faceFontMulBySides(10)

  geo.clearGroups()
  const materials = []
  for (let f = 0; f < 10; f++) {
    const label = faceLabels && faceLabels.length === 10 ? faceLabels[f] : String(f + 1)
    const map = makeNumberTexture(label, color, {
      texSize: DICE_TEX_SIZE,
      fontScale: DICE_FACE_FONT_SCALE * fontMul,
    })
    materials.push(
      new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        metalness: DICE_METALNESS,
        roughness: DICE_ROUGHNESS,
      }),
    )
    geo.addGroup(f * 6, 6, f)
  }

  const mesh = new THREE.Mesh(geo, materials)
  mesh.renderOrder = 0
  return { mesh, geo, materials }
}

function meshD12WithFaceTextures(baseGeo, color) {
  const geo = baseGeo.clone().toNonIndexed()
  const pos = geo.attributes.position
  const triCount = Math.floor(pos.count / 3)
  if (triCount !== 36) {
    geo.dispose()
    return null
  }
  const vertsPerFace = 9 // d12 每个五边形 = 3 个三角 = 9 顶点（non-indexed）
  const faceCount = 12
  const uvArr = new Float32Array(pos.count * 2)

  for (let fi = 0; fi < faceCount; fi++) {
    const vStart = fi * vertsPerFace
    const faceCenter = new THREE.Vector3()
    for (let k = 0; k < vertsPerFace; k++) {
      faceCenter.add(new THREE.Vector3().fromBufferAttribute(pos, vStart + k))
    }
    faceCenter.multiplyScalar(1 / vertsPerFace)
    let normal = new THREE.Vector3(0, 0, 0)
    for (let t = 0; t < 3; t++) {
      const i0 = vStart + t * 3
      const v0 = new THREE.Vector3().fromBufferAttribute(pos, i0)
      const v1 = new THREE.Vector3().fromBufferAttribute(pos, i0 + 1)
      const v2 = new THREE.Vector3().fromBufferAttribute(pos, i0 + 2)
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(v1, v0), new THREE.Vector3().subVectors(v2, v0))
      normal.add(n)
    }
    if (normal.dot(faceCenter) < 0) normal.negate()
    normal.normalize()
    const { tangent, bitangent } = faceAxesFromNormal(normal)

    let maxR = 0
    const proj = []
    for (let k = 0; k < vertsPerFace; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, vStart + k)
      const rel = new THREE.Vector3().subVectors(v, faceCenter)
      const x = rel.dot(tangent)
      const y = rel.dot(bitangent)
      proj.push({ x, y })
      maxR = Math.max(maxR, Math.hypot(x, y))
    }
    const scale = maxR > 1e-8 ? D12_FACE_UV_FILL / maxR : 1
    for (let k = 0; k < vertsPerFace; k++) {
      uvArr[(vStart + k) * 2] = proj[k].x * scale + 0.5
      uvArr[(vStart + k) * 2 + 1] = proj[k].y * scale + 0.5
    }
  }

  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2))
  geo.computeVertexNormals()
  geo.clearGroups()
  const fontMul = faceFontMulBySides(12)
  const materials = []
  for (let i = 0; i < faceCount; i++) {
    const map = makeNumberTexture(String(i + 1), color, {
      texSize: DICE_TEX_SIZE,
      fontScale: DICE_FACE_FONT_SCALE * fontMul,
    })
    materials.push(
      new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        metalness: DICE_METALNESS,
        roughness: DICE_ROUGHNESS,
      }),
    )
    geo.addGroup(i * vertsPerFace, vertsPerFace, i)
  }
  const mesh = new THREE.Mesh(geo, materials)
  mesh.renderOrder = 0
  return { mesh, geo, materials }
}

/**
 * 构建带面上数字的骰子：d6 六面贴图；d4/d8/d20 每三角面材质贴图（与面一体）；d10 五方偏方面体贴图；d12 用整体贴图。
 * d100 在规格里拆成两颗 d10（opts.d100Role：tens / ones）。
 * 返回 { group, r, dispose }
 */
function createNumberedDie(sides, opts = {}) {
  const d100Role = opts.d100Role === 'tens' || opts.d100Role === 'ones' ? opts.d100Role : null
  const color = colorBySides(sides)
  const group = new THREE.Group()
  const disposeList = []
  const finish = (bodyMesh) => {
    const visualScale = dieVisualScaleBySides(Number(sides))
    const r = normalizeDieGroupSize(group, TARGET_DIE_RADIUS * visualScale)
    return { group, r, bodyMesh, dispose: () => disposeList.forEach((fn) => fn()) }
  }

  if (sides === 6) {
    const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2)
    // +x,-x,+y,-y,+z,-z → 标准对位 3/4/5/2/1/6
    const labels = ['3', '4', '5', '2', '1', '6']
    const fontMul = faceFontMulBySides(6)
    const mats = labels.map((lab) => {
      const map = makeNumberTexture(lab, color, {
        texSize: DICE_TEX_SIZE,
        fontScale: DICE_FACE_FONT_SCALE * fontMul,
        useFrame: false,
      })
      return new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        metalness: DICE_METALNESS,
        roughness: DICE_ROUGHNESS,
      })
    })
    const mesh = new THREE.Mesh(geo, mats)
    group.add(mesh)
    disposeList.push(() => geo.dispose())
    mats.forEach((m) => {
      disposeList.push(() => {
        if (m.map) m.map.dispose()
        m.dispose()
      })
    })
    return finish(mesh)
  }

  const geo = geometryBySides(sides)
  let mainMat

  if (sides === 4 || sides === 8 || sides === 20) {
    const faceCount = sides === 4 ? 4 : sides === 8 ? 8 : 20
    const built = meshPolyhedronWithFaceTextures(geo, faceCount, color)
    if (!built) {
      geo.dispose()
      return finish(null)
    }
    const { mesh, geo: g2, materials } = built
    group.add(mesh)
    disposeList.push(() => g2.dispose())
    materials.forEach((m) => {
      disposeList.push(() => {
        if (m.map) m.map.dispose()
        m.dispose()
      })
    })
    geo.dispose()
    return finish(mesh)
  }

  if (sides === 10) {
    const faceLabels =
      d100Role === 'ones' ? D100_ONES_LABELS : d100Role === 'tens' ? D100_TENS_LABELS : null
    const built = meshD10WithFaceTextures(geo, color, faceLabels)
    if (!built) {
      geo.dispose()
      return finish(null)
    }
    const { mesh, geo: g2, materials } = built
    group.add(mesh)
    disposeList.push(() => g2.dispose())
    materials.forEach((m) => {
      disposeList.push(() => {
        if (m.map) m.map.dispose()
        m.dispose()
      })
    })
    // 仅保留轻微比例修正，主要钝化由几何本身完成。
    mesh.scale.set(1.04, 0.93, 1.04)
    geo.dispose()
    return finish(mesh)
  }

  if (sides === 12) {
    const built = meshD12WithFaceTextures(geo, color)
    if (!built) {
      const map = makeWrappedNumbersTexture(sides, color)
      const fallbackMat = new THREE.MeshBasicMaterial({
        map,
        color: 0xffffff,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
      const fallbackMesh = new THREE.Mesh(geo, fallbackMat)
      fallbackMesh.renderOrder = 0
      group.add(fallbackMesh)
      disposeList.push(() => geo.dispose())
      disposeList.push(() => {
        if (fallbackMat.map) fallbackMat.map.dispose()
        fallbackMat.dispose()
      })
      return finish(fallbackMesh)
    }
    const { mesh, geo: g2, materials } = built
    group.add(mesh)
    disposeList.push(() => g2.dispose())
    materials.forEach((m) => {
      disposeList.push(() => {
        if (m.map) m.map.dispose()
        m.dispose()
      })
    })
    geo.dispose()
    return finish(mesh)
  }

  // d12 / fallback：主体整张贴图含 1..N（Basic 保证数字不被光照吃掉）
  const map = makeWrappedNumbersTexture(sides, color)
  mainMat = new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mainMat)
  mesh.renderOrder = 0
  group.add(mesh)
  disposeList.push(() => geo.dispose())
  disposeList.push(() => {
    if (mainMat.map) mainMat.map.dispose()
    mainMat.dispose()
  })
  return finish(mesh)
}

export default function ThreeDiceOverlay({ diceSpecs = [], showFinal = false }) {
  const mountRef = useRef(null)
  const rafRef = useRef(0)
  const showFinalRef = useRef(showFinal)

  useEffect(() => {
    showFinalRef.current = showFinal
  }, [showFinal])

  const normalized = useMemo(
    () =>
      (diceSpecs || []).map((d, i) => ({
        id: `${d.id || i}`,
        sides: Number(d.sides) || 6,
        value: d.value != null && d.value !== '' ? Number(d.value) : null,
        d100Role: d.d100Role === 'tens' || d.d100Role === 'ones' ? d.d100Role : null,
      })),
    [diceSpecs],
  )

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const w = window.innerWidth
    const h = window.innerHeight
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100)
    camera.position.set(0, 0.2, 12)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    // 压低环境光、加强主光 + 半球光；再叠暖/冷/淡紫三色低强度环境光，丰富整体色调。
    const ambient = new THREE.AmbientLight(0xfff8f5, 0.22)
    const ambientWarm = new THREE.AmbientLight(AMBIENT_WARM_COLOR, AMBIENT_WARM_INT)
    const ambientCool = new THREE.AmbientLight(AMBIENT_COOL_COLOR, AMBIENT_COOL_INT)
    const ambientAccent = new THREE.AmbientLight(AMBIENT_ACCENT_COLOR, AMBIENT_ACCENT_INT)
    const hemi = new THREE.HemisphereLight(0xeef4ff, 0x3a2420, 0.52)
    const dir = new THREE.DirectionalLight(0xfffaf5, 2.05)
    dir.position.set(3.8, 7.0, 4.8)
    scene.add(ambient, ambientWarm, ambientCool, ambientAccent, hemi, dir)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 24),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -4.6
    scene.add(floor)

    const disposers = []
    const nDice = normalized.length

    const worldUp = new THREE.Vector3(0, 1, 0)
    // 结果展示以“玩家可见面”为准：停稳后将目标点数面朝向镜头方向。
    const resultFaceDir = new THREE.Vector3(0, 0, 1)

    const dice = normalized.map((d, i) => {
      const { group, r, dispose, bodyMesh } = createNumberedDie(d.sides, { d100Role: d.d100Role })
      disposers.push(dispose)

      const entry = Math.floor(Math.random() * 4)
      const lane = (Math.random() - 0.5) * 9.2
      const spreadX = nDice > 1 ? (i - (nDice - 1) / 2) * SPAWN_X_STRIDE : 0
      let spawnX = 0
      let spawnY = 0
      let velocity = new THREE.Vector3(0, 0, 0)
      if (entry === 0) {
        spawnX = lane
        spawnY = 7.2 + Math.random() * 1.2
        velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2.2,
          -3.9 - Math.random() * 2.2,
          (Math.random() - 0.5) * 0.9,
        ).multiplyScalar(ENTRY_SPEED_MUL)
      } else if (entry === 1) {
        spawnX = 12.6 + Math.random() * 1.4
        spawnY = lane * 0.34
        velocity = new THREE.Vector3(
          -6.8 - Math.random() * 2.4,
          -0.9 - Math.random() * 1.2,
          (Math.random() - 0.5) * 0.9,
        ).multiplyScalar(ENTRY_SPEED_MUL)
      } else if (entry === 2) {
        spawnX = lane
        spawnY = -7.2 - Math.random() * 1.2
        velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 2.2,
          4.8 + Math.random() * 2.2,
          (Math.random() - 0.5) * 0.9,
        ).multiplyScalar(ENTRY_SPEED_MUL)
      } else {
        spawnX = -12.6 - Math.random() * 1.4
        spawnY = lane * 0.34
        velocity = new THREE.Vector3(
          6.8 + Math.random() * 2.4,
          -0.9 - Math.random() * 1.2,
          (Math.random() - 0.5) * 0.9,
        ).multiplyScalar(ENTRY_SPEED_MUL)
      }
      spawnX += spreadX
      velocity.z = 0
      group.position.set(spawnX, spawnY, 0)
      scene.add(group)

      return {
        group,
        r,
        v: velocity,
        av: new THREE.Vector3(
          (Math.random() - 0.5) * AV_SPIN_RANGE,
          (Math.random() - 0.5) * AV_SPIN_RANGE,
          (Math.random() - 0.5) * AV_SPIN_RANGE,
        ),
        finalValue: d.value,
        sides: d.sides,
        bodyMesh,
        d100Role: d.d100Role,
      }
    })

    let prev = performance.now()
    const step = () => {
      const now = performance.now()
      const dt = Math.min(0.033, (now - prev) / 1000)
      prev = now
      const g = -3.8
      const floorY = -4.0
      const center = new THREE.Vector3(0, 0, 0)
      const minX = -7.2
      const maxX = 7.2
      const minY = -4.6
      const maxY = 4.6
      const settled = showFinalRef.current

      for (let i = 0; i < dice.length; i++) {
        const a = dice[i]
        const root = a.group
        const toCenter = new THREE.Vector3().subVectors(center, root.position)
        toCenter.z = 0
        a.v.addScaledVector(toCenter, CENTER_PULL * dt)
        a.v.y += g * dt
        a.v.z = 0
        root.position.addScaledVector(a.v, dt)
        root.position.z = 0
        root.rotation.x += a.av.x * dt
        root.rotation.y += a.av.y * dt
        root.rotation.z += a.av.z * dt
        if (!settled) {
          a.v.multiplyScalar(LINEAR_DAMP_ROLL)
          a.av.multiplyScalar(AV_AIR_DAMP)
        } else {
          a.v.multiplyScalar(0.992)
        }

        if (root.position.y - a.r < floorY) {
          root.position.y = floorY + a.r
          a.v.y = Math.abs(a.v.y) * FLOOR_BOUNCE_Y
          a.v.x *= 0.94
          a.v.z *= 0.94
          a.av.multiplyScalar(settled ? 0.96 : FLOOR_SPIN_KEEP)
        }
        if (root.position.x - a.r < minX) {
          root.position.x = minX + a.r
          a.v.x = Math.abs(a.v.x) * 0.82
        }
        if (root.position.x + a.r > maxX) {
          root.position.x = maxX - a.r
          a.v.x = -Math.abs(a.v.x) * 0.82
        }
        if (root.position.y + a.r > maxY) {
          root.position.y = maxY - a.r
          a.v.y = -Math.abs(a.v.y) * 0.82
        }
        if (root.position.y - a.r < minY) {
          root.position.y = minY + a.r
          a.v.y = Math.abs(a.v.y) * 0.82
        }
        if (settled) {
          a.v.multiplyScalar(0.92)
          // 停稳阶段使用更平缓的角速度阻尼，避免最后几秒快速减速的不自然感
          a.av.multiplyScalar(0.95)
        }

        // 停稳后：把本次点数所在面旋向世界上方，结果只看贴图，不再叠 HTML 圆标
        if (settled && a.bodyMesh?.geometry && a.finalValue != null) {
          const sd = Number(a.sides)
          if (sd === 4 || sd === 8 || sd === 20) {
            const fv = Math.max(1, Math.min(sd, Math.round(Number(a.finalValue))))
            const fi = fv - 1
            const ln = faceOutwardNormal(a.bodyMesh.geometry, fi, 3)
            if (ln.lengthSq() > 1e-12) {
              const qTarget = new THREE.Quaternion().setFromUnitVectors(ln, resultFaceDir)
              // 使用极小的 slerp 值让旋转非常平缓，避免"突然找面"的感觉
              a.group.quaternion.slerp(qTarget, 0.03)
              a.group.quaternion.normalize()
            }
          } else if (sd === 6) {
            const fv = Math.max(1, Math.min(6, Math.round(Number(a.finalValue))))
            const ln = d6FaceNormalByValue(fv)
            if (ln.lengthSq() > 1e-12) {
              const qTarget = new THREE.Quaternion().setFromUnitVectors(ln, resultFaceDir)
              a.group.quaternion.slerp(qTarget, 0.03)
              a.group.quaternion.normalize()
            }
          } else if (sd === 10) {
            let fi
            if (a.d100Role === 'ones') {
              const v = Math.max(0, Math.min(9, Math.round(Number(a.finalValue))))
              fi = v
            } else if (a.d100Role === 'tens') {
              const t = Math.max(0, Math.min(90, Math.round(Number(a.finalValue))))
              fi = Math.round(t / 10)
            } else {
              const fv = Math.max(1, Math.min(10, Math.round(Number(a.finalValue))))
              fi = fv - 1
            }
            const ln = faceOutwardNormal(a.bodyMesh.geometry, fi, 6)
            if (ln.lengthSq() > 1e-12) {
              const qTarget = new THREE.Quaternion().setFromUnitVectors(ln, resultFaceDir)
              a.group.quaternion.slerp(qTarget, 0.03)
              a.group.quaternion.normalize()
            }
          } else if (sd === 12) {
            const fv = Math.max(1, Math.min(12, Math.round(Number(a.finalValue))))
            const fi = fv - 1
            const ln = faceOutwardNormal(a.bodyMesh.geometry, fi, 9)
            if (ln.lengthSq() > 1e-12) {
              const qTarget = new THREE.Quaternion().setFromUnitVectors(ln, resultFaceDir)
              a.group.quaternion.slerp(qTarget, 0.03)
              a.group.quaternion.normalize()
            }
          }
        }
      }

      // 减少碰撞迭代次数以提升性能，同时保持合理的分离效果
      const collisionIterations = 3
      const separationBias = 1.08
      for (let iter = 0; iter < collisionIterations; iter++) {
        for (let i = 0; i < dice.length; i++) {
          for (let j = i + 1; j < dice.length; j++) {
            const a = dice[i]
            const b = dice[j]
            const dx = b.group.position.x - a.group.position.x
            const dy = b.group.position.y - a.group.position.y
            let dist = Math.hypot(dx, dy)
            const minDist = a.r + b.r + EXTRA_COLLISION_GAP
            if (dist >= minDist) continue

            let nx
            let ny
            if (dist < 1e-6) {
              const ang = Math.random() * Math.PI * 2
              nx = Math.cos(ang)
              ny = Math.sin(ang)
              dist = 1e-6
            } else {
              nx = dx / dist
              ny = dy / dist
            }

            const overlap = (minDist - dist) * separationBias
            const corr = overlap * 0.5
            a.group.position.x -= nx * corr
            a.group.position.y -= ny * corr
            b.group.position.x += nx * corr
            b.group.position.y += ny * corr

            const relx = b.v.x - a.v.x
            const rely = b.v.y - a.v.y
            const sep = relx * nx + rely * ny
            if (sep < 0) {
              const restitution = settled ? 0.18 : 0.32
              const imp = (-(1 + restitution) * sep) / 2
              a.v.x -= nx * imp
              a.v.y -= ny * imp
              b.v.x += nx * imp
              b.v.y += ny * imp
            }
          }
        }
      }

      for (let k = 0; k < dice.length; k++) {
        dice[k].group.position.z = 0
        dice[k].v.z = 0
      }

      renderer.render(scene, camera)
      rafRef.current = window.requestAnimationFrame(step)
    }
    rafRef.current = window.requestAnimationFrame(step)

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      disposers.forEach((fn) => {
        try {
          fn()
        } catch {
          /* ignore */
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [normalized])

  return (
    <div
      ref={mountRef}
      className="pointer-events-none fixed inset-0 z-[72]"
      data-testid="three-dice-overlay"
      role="presentation"
      aria-hidden
    />
  )
}
