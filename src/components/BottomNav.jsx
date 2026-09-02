import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, User, BookOpen, Package, MoreHorizontal } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { useRoll } from '../contexts/RollContext'
import { getDefaultCharacterId, getLastEditedCharacterId } from '../lib/characterStore'
import ThreeDiceOverlay from './ThreeDiceOverlay'

const tabs = [
  { key: 'home', to: '/', label: '首页', icon: Home },
  { key: 'characters', to: '/characters', label: '我的角色', icon: User, useLastEdited: true },
  { key: 'spells', to: '/character-spells', label: '角色法术', icon: BookOpen, useLastEditedForSpells: true },
  { key: 'warehouse', to: '/warehouse', label: '团队仓库', icon: Package },
  { key: 'more', to: '/more', label: '更多', icon: MoreHorizontal },
]

const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100]
const ROLL_ANIM_MS = 1800
const RESULT_HOLD_MS = 1400

/** 底栏多分类型伤害：钝击 / 穿刺 / 挥砍（含别称劈砍）保持暗金，其余类型分色 */
function damageDetailRowClass(damageTypeLabel) {
  const t = String(damageTypeLabel || '').trim()
  if (new Set(['钝击', '穿刺', '挥砍', '劈砍']).has(t)) return 'text-dnd-gold-light'
  const byLabel = {
    强酸: 'text-emerald-400',
    寒冷: 'text-sky-400',
    火焰: 'text-orange-400',
    力场: 'text-violet-300',
    闪电: 'text-cyan-300',
    暗蚀: 'text-fuchsia-400',
    毒素: 'text-lime-400',
    心灵: 'text-pink-300',
    光耀: 'text-yellow-200',
    雷鸣: 'text-amber-300',
    贯通: 'text-teal-300',
    治疗: 'text-green-400',
  }
  return byLabel[t] || 'text-slate-300'
}

/** 根据标签文本自动识别投掷类别 */
function detectRollCategory(label) {
  const s = String(label || '')
  if (s.includes('攻击')) return 'attack'
  if (s.includes('豁免')) return 'save'
  if (s.includes('伤害') || s.includes('投掷')) return 'damage'
  return 'check'
}

const CATEGORY_TAG = {
  attack: { text: '攻击', cls: 'bg-red-900/60 text-red-200 border-red-700/50' },
  damage: { text: '伤害', cls: 'bg-amber-900/60 text-amber-200 border-amber-700/50' },
  save: { text: '豁免', cls: 'bg-blue-900/60 text-blue-200 border-blue-700/50' },
  check: { text: '检定', cls: 'bg-gray-700/60 text-gray-300 border-gray-600/50' },
}

function RollCategoryTag({ category }) {
  const cfg = CATEGORY_TAG[category] || CATEGORY_TAG.check
  return (
    <span className={`shrink-0 text-[9px] leading-none px-1 py-[1px] rounded border ${cfg.cls}`}>
      {cfg.text}
    </span>
  )
}

function roll(sides) {
  return Math.floor(Math.random() * sides) + 1
}

/** d100 拆成两颗 d10：十位 00–90，个位 0–9；100 = 00 + 0 */
function splitD100Roll(value) {
  if (value == null || !Number.isFinite(Number(value))) return { tens: 0, ones: 0 }
  const R = Math.max(1, Math.min(100, Math.round(Number(value))))
  if (R === 100) return { tens: 0, ones: 0 }
  return { tens: Math.floor(R / 10) * 10, ones: R % 10 }
}

function rollD20WithMode(mode) {
  if (mode === 'normal') {
    const r = roll(20)
    return { result: r, rolls: [r] }
  }
  const a = roll(20)
  const b = roll(20)
  if (mode === 'advantage') return { result: Math.max(a, b), rolls: [a, b] }
  return { result: Math.min(a, b), rolls: [a, b] }
}

function parseFormula(raw) {
  const normalized = String(raw || '').replace(/，/g, ',')
  const parts = normalized.split(',').map((p) => p.trim())
  if (!parts.length) return null
  const segments = []
  for (const p of parts) {
    const sub = parseCompoundPart(p)
    if (!sub) return null
    segments.push(...sub)
  }
  return segments
}

/** 解析逗号内一段，如 2d6+5、8d12+4d6（+ 后为下一颗骰而非修饰时拆开） */
function parseCompoundPart(part) {
  const s = String(part || '').replace(/\s+/g, '')
  if (!s) return null
  const segments = []
  let i = 0
  while (i < s.length) {
    let sign = 1
    if (s[i] === '+') {
      i += 1
      sign = 1
    } else if (s[i] === '-') {
      i += 1
      sign = -1
    }
    const rest = s.slice(i)
    const dice = /^(\d*)d(\d+)/i.exec(rest)
    if (dice) {
      const countRaw = dice[1]
      const count = countRaw ? Number.parseInt(countRaw, 10) : 1
      const sides = Number.parseInt(dice[2], 10)
      if (!Number.isFinite(count) || !Number.isFinite(sides) || count < 1 || count > 100 || sides < 2 || sides > 1000) return null
      const di = dice[0].length
      const afterDice = rest.slice(di)
      const possMod = /^([+-]\d+)/.exec(afterDice)
      if (possMod) {
        const afterMod = afterDice.slice(possMod[0].length)
        if (afterMod === '' || /^[+-]/.test(afterMod)) {
          const modifier = Number.parseInt(possMod[1], 10)
          if (!Number.isFinite(modifier)) return null
          i += di + possMod[0].length
          segments.push({
            kind: 'dice',
            count,
            sides,
            modifier,
            sign,
            raw: dice[0] + possMod[0],
          })
          continue
        }
      }
      i += di
      segments.push({
        kind: 'dice',
        count,
        sides,
        modifier: 0,
        sign,
        raw: dice[0],
      })
      continue
    }
    const flat = /^(\d+)/.exec(rest)
    if (flat) {
      i += flat[0].length
      const value = sign * Number.parseInt(flat[1], 10)
      if (!Number.isFinite(value)) return null
      segments.push({ kind: 'flat', value, sign: 1, raw: flat[0] })
      continue
    }
    return null
  }
  return segments.length ? segments : null
}

function splitCommaTail(formula) {
  const f = String(formula ?? '')
  const idx = f.lastIndexOf(',')
  if (idx < 0) return { prefix: '', tail: f }
  return { prefix: f.slice(0, idx + 1), tail: f.slice(idx + 1) }
}

/** 键盘构建公式：与 splitCommaTail 的 tail 交互 */
function mergeKeypadDieTail(tail, sides) {
  const t = tail.trimEnd()
  if (!t) return `d${sides}`
  if (/^\d+$/.test(t)) return `${t}d${sides}`
  const countOp = /^(.*)([+-])(\d+)$/.exec(t)
  if (countOp) return `${countOp[1]}${countOp[2]}${countOp[3]}d${sides}`
  const ndm = /^(.*?)(\d+)d(\d+)$/i.exec(t)
  if (ndm) return `${ndm[1]}${ndm[2]}d${sides}`
  const opD = /^(.+)([+-])d(\d+)$/i.exec(t)
  if (opD) return `${opD[1]}${opD[2]}d${sides}`
  if (/[+-]$/.test(t)) return `${t}d${sides}`
  const dm = /^d(\d+)$/i.exec(t)
  if (dm) return `d${sides}`
  return `${t}1d${sides}`
}

function mergeKeypadDigitTail(tail, digit) {
  const t = tail.trimEnd()
  if (!t) return digit
  if (/^d(\d+)$/i.test(t)) return t.replace(/^d(\d+)$/i, `${digit}d$1`)
  const opD = /^(.+)([+-])d(\d+)$/i.exec(t)
  if (opD) return `${opD[1]}${opD[2]}${digit}d${opD[3]}`
  const ndm = /^(.*?)(\d+)d(\d+)$/i.exec(t)
  if (ndm) return `${ndm[1]}${digit}d${ndm[3]}`
  if (/[+-]$/.test(t)) return `${t}${digit}`
  const trailFlat = /^(.+[+-])(\d+)$/.exec(t)
  if (trailFlat) return `${trailFlat[1]}${trailFlat[2]}${digit}`
  if (/^\d+$/.test(t)) return `${t}${digit}`
  return `${t}${digit}`
}

function mergeKeypadOpTail(tail, op) {
  let t = tail.trimEnd()
  if (/^d(\d+)$/i.test(t)) t = t.replace(/^d(\d+)$/i, '1d$1')
  if (!t) return op === '-' ? '-' : ''
  const last = t[t.length - 1]
  if (last === '+' || last === '-') return t.slice(0, -1) + op
  return `${t}${op}`
}

/**
 * 高亮检定明细中的自然20（如 D20(20,4)+12=32）。
 * 仅高亮 d20 掷出的 20，不影响其它骰型/总值。
 */
/** @param {number} [critThreatMin] 自然骰 ≥ 此值（且 ≤20）时高亮为重击威胁；默认 20 仅高亮 20 */
function renderDetailsWithNat20Highlight(text, critThreatMin = 20) {
  const src = String(text || '')
  if (!src) return null
  const minNat = Math.max(1, Math.min(20, Math.floor(Number(critThreatMin) || 20)))
  const re = /([dD]20)\(([^)]*)\)/g
  const nodes = []
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(src)) !== null) {
    const start = m.index
    const end = re.lastIndex
    if (start > last) nodes.push(<span key={`t-${key++}`}>{src.slice(last, start)}</span>)
    const tag = m[1]
    const body = m[2]
    const parts = body.split(',')
    nodes.push(<span key={`tag-${key++}`}>{tag}(</span>)
    parts.forEach((p, i) => {
      const raw = p.trim()
      const n = Number(raw)
      const isThreat = Number.isFinite(n) && n >= minNat && n <= 20
      const cls = isThreat ? (n === 20 ? 'font-bold text-dnd-red' : 'font-bold text-dnd-gold-light') : ''
      nodes.push(
        <span key={`r-${key++}`} className={cls}>
          {raw}
        </span>
      )
      if (i < parts.length - 1) nodes.push(<span key={`c-${key++}`}>,</span>)
    })
    nodes.push(<span key={`e-${key++}`}>)</span>)
    last = end
  }
  if (last < src.length) nodes.push(<span key={`tail-${key++}`}>{src.slice(last)}</span>)
  return nodes.length ? nodes : src
}

const MAX_ROLLING_DICE_RENDER = 12

function buildRollingDiceSpecs(parsedSegments) {
  const specs = []
  let overflow = 0
  for (const seg of parsedSegments) {
    if (seg?.kind !== 'dice') continue
    for (let i = 0; i < seg.count; i++) {
      const sides = Number(seg.sides) || 6
      if (sides === 100) {
        if (specs.length + 2 > MAX_ROLLING_DICE_RENDER) {
          overflow += 2
          continue
        }
        for (const role of ['tens', 'ones']) {
          specs.push({
            id: `100-${role}-${i}-${specs.length}`,
            sides: 10,
            d100Role: role,
            shape: 'd10',
            palette: 'd10',
            delayMs: (specs.length % 6) * 90,
          })
        }
        continue
      }
      if (specs.length >= MAX_ROLLING_DICE_RENDER) {
        overflow += 1
        continue
      }
      let shape = 'gem'
      if (sides === 4) shape = 'd4'
      else if (sides === 6) shape = 'cube'
      else if (sides === 8) shape = 'd8'
      else if (sides === 10) shape = 'd10'
      else if (sides === 12) shape = 'd12'
      else if (sides === 20) shape = 'd20'
      const palette =
        sides === 4 ? 'd4' :
        sides === 6 ? 'd6' :
        sides === 8 ? 'd8' :
        sides === 10 ? 'd10' :
        sides === 12 ? 'd12' :
        sides === 20 ? 'd20' : 'small'
      specs.push({ id: `${sides}-${i}-${specs.length}`, sides, shape, palette, delayMs: (specs.length % 6) * 90 })
    }
  }
  return { specs, overflow }
}

function buildRollingDiceSpecsWithValues(parsedSegments, diceValues = []) {
  const specs = []
  let overflow = 0
  let vi = 0
  for (const seg of parsedSegments) {
    if (seg?.kind !== 'dice') continue
    for (let i = 0; i < seg.count; i++) {
      const value = Number(diceValues?.[vi]) || undefined
      vi += 1
      const sides = Number(seg.sides) || 6
      if (sides === 100) {
        if (specs.length + 2 > MAX_ROLLING_DICE_RENDER) {
          overflow += 2
          continue
        }
        const { tens, ones } = splitD100Roll(value)
        specs.push({
          id: `100-tens-${i}-${specs.length}`,
          sides: 10,
          d100Role: 'tens',
          shape: 'd10',
          palette: 'd10',
          delayMs: (specs.length % 6) * 90,
          value: tens,
        })
        specs.push({
          id: `100-ones-${i}-${specs.length}`,
          sides: 10,
          d100Role: 'ones',
          shape: 'd10',
          palette: 'd10',
          delayMs: (specs.length % 6) * 90,
          value: ones,
        })
        continue
      }
      if (specs.length >= MAX_ROLLING_DICE_RENDER) {
        overflow += 1
        continue
      }
      let shape = 'gem'
      if (sides === 4) shape = 'd4'
      else if (sides === 6) shape = 'cube'
      else if (sides === 8) shape = 'd8'
      else if (sides === 10) shape = 'd10'
      else if (sides === 12) shape = 'd12'
      else if (sides === 20) shape = 'd20'
      const palette =
        sides === 4 ? 'd4' :
        sides === 6 ? 'd6' :
        sides === 8 ? 'd8' :
        sides === 10 ? 'd10' :
        sides === 12 ? 'd12' :
        sides === 20 ? 'd20' : 'small'
      specs.push({ id: `${sides}-${i}-${specs.length}`, sides, shape, palette, delayMs: (specs.length % 6) * 90, value })
    }
  }
  return { specs, overflow }
}

function DiceVisual3D({ spec }) {
  const cls = `dice3d-wrap dice3d-palette-${spec.palette}`
  if (spec.shape === 'cube') {
    return (
      <div className={cls} style={{ animationDelay: `${spec.delayMs}ms` }}>
        <div className="dice3d-shadow" />
        <div className="dice3d-cube">
          <span className="dice3d-face dice3d-front">1</span>
          <span className="dice3d-face dice3d-back">6</span>
          <span className="dice3d-face dice3d-right">3</span>
          <span className="dice3d-face dice3d-left">4</span>
          <span className="dice3d-face dice3d-top">5</span>
          <span className="dice3d-face dice3d-bottom">2</span>
        </div>
      </div>
    )
  }
  return (
    <div className={cls} style={{ animationDelay: `${spec.delayMs}ms` }}>
      <div className="dice3d-shadow" />
      <div className={`dice3d-gem ${spec.shape === 'd20' ? 'dice3d-gem-d20' : `dice3d-gem-${spec.shape}`}`}>
        <span className="dice3d-gem-text">d{spec.sides}</span>
        <span className="dice3d-gem-glow" />
      </div>
    </div>
  )
}

function DiceFallbackOverlay({ specs = [] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[72] overflow-hidden">
      {specs.map((spec, i) => {
        const fromLeft = i % 2 === 0
        const top = 18 + ((i * 13) % 52)
        return (
          <div
            key={`${spec.id}-fly`}
            className={`dice-fly-lane ${fromLeft ? 'dice-fly-from-left' : 'dice-fly-from-right'}`}
            style={{ top: `${top}%`, animationDelay: `${(i % 6) * 70}ms` }}
          >
            <DiceVisual3D spec={spec} />
          </div>
        )
      })}
    </div>
  )
}

export default function BottomNav() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const { pendingCheck, setPendingCheck } = useRoll()
  const pendingCheckOnResultRef = useRef(null) // 保存 onResult 回调
  const defaultId = getDefaultCharacterId(user?.name, currentModuleId)
  const lastEditedId = getLastEditedCharacterId(user?.name, isAdmin, currentModuleId)
  const preferredId = defaultId || lastEditedId
  const [d20Mode, setD20Mode] = useState('')
  const [formula, setFormula] = useState('1d20')
  const [formulaError, setFormulaError] = useState('')
  const [formulaMeta, setFormulaMeta] = useState(null) // { label, mode }
  const formulaInputRef = useRef(null)
  const [lastRoll, setLastRoll] = useState(null)
  const [checkResult, setCheckResult] = useState(null)
  const [isRolling, setIsRolling] = useState(false)
  const [rollingPreview, setRollingPreview] = useState(null) // { formula, specs, overflow }
  const [showFinalFace, setShowFinalFace] = useState(false)
  const rollingTimerRef = useRef(null)
  const rollingStopRef = useRef(null)
  const rollingFinalHoldRef = useRef(null)
  /** 与本次投掷绑定的一份 specs 引用，避免父组件重渲染时 inline slice 导致 Three 场景被重建 */
  const threeOverlaySpecs = useMemo(
    () => (rollingPreview?.specs || []).slice(0, MAX_ROLLING_DICE_RENDER),
    [rollingPreview?.specs],
  )

  useEffect(() => {
    return () => {
      if (rollingTimerRef.current) clearInterval(rollingTimerRef.current)
      if (rollingStopRef.current) clearTimeout(rollingStopRef.current)
      if (rollingFinalHoldRef.current) clearTimeout(rollingFinalHoldRef.current)
    }
  }, [])

  const applyExternalRollFromDetail = useCallback((detail) => {
    if (!detail) return
    if (detail.byType && typeof detail.byType === 'object') {
      const entries = Object.entries(detail.byType)
      if (!entries.length) return
      const detailParts = []
      const damageByType = []
      let totalValue = 0
      for (const [type, row] of entries) {
        const rolls = Array.isArray(row?.rolls) ? row.rolls : []
        const mod = Number(row?.modifier) || 0
        const subtotal = rolls.reduce((s, n) => s + (Number(n) || 0), 0) + mod
        totalValue += subtotal
        const line = `${type}:${rolls.join(',')}${mod ? `${mod >= 0 ? '+' : ''}${mod}` : ''}=${subtotal}`
        detailParts.push(line)
        damageByType.push({ type, line, subtotal })
      }
      setLastRoll({
        key: Date.now(),
        label: '伤害',
        result: totalValue,
        category: 'damage',
      })
      const joined = detailParts.join(', ')
      setCheckResult({
        key: Date.now(),
        label: '伤害投掷',
        formula: joined,
        mode: 'normal',
        total: totalValue,
        details: `${joined}, 伤害总值 ${totalValue}`,
        damageByType,
        category: 'damage',
      })
      return
    }
    const totalValue = Number(detail.total)
    if (!Number.isFinite(totalValue)) return
    const diceExpr = detail.dice || detail.label || '伤害'
    const mod = Number(detail.modifier) || 0
    const rolls = Array.isArray(detail.rolls) ? detail.rolls : []
    const typeTag = String(detail.damageTypeLabel || '').trim()
    const coreDetail = `${diceExpr}${rolls.length ? `(${rolls.join(',')})` : ''}${mod ? `${mod >= 0 ? '+' : ''}${mod}` : ''}=${totalValue}`
    setLastRoll({
      key: Date.now(),
      label: detail.label || diceExpr,
      result: totalValue,
      category: 'damage',
    })
    setCheckResult({
      key: Date.now(),
      label: detail.label || '伤害投掷',
      formula: diceExpr,
      mode: 'normal',
      total: totalValue,
      details: typeTag ? `${typeTag}:${coreDetail}` : coreDetail,
      category: 'damage',
      ...(typeTag
        ? {
            damageByType: [{ type: typeTag, line: `${typeTag}:${coreDetail}`, subtotal: totalValue }],
          }
        : {}),
    })
  }, [])

  /** 战斗页「快捷投掷」已算好的骰点：只播 3D，结束后再写入底栏结果（与 CombatStatus 点数一致） */
  const beginPresetDiceAnimation = useCallback(
    (formula, diceValues, detail) => {
      if (isRolling) return false
      const normalized = String(formula || '').replace(/，/g, ',').replace(/\s+/g, '')
      const parsedSegments = parseFormula(normalized)
      if (!parsedSegments) return false
      let need = 0
      for (const seg of parsedSegments) {
        if (seg.kind === 'dice') need += seg.count
      }
      const vals = (diceValues || []).map((n) => Number(n))
      if (need === 0 || vals.length !== need) return false
      const { specs, overflow } = buildRollingDiceSpecsWithValues(parsedSegments, vals)
      if (rollingTimerRef.current) clearInterval(rollingTimerRef.current)
      if (rollingStopRef.current) clearTimeout(rollingStopRef.current)
      if (rollingFinalHoldRef.current) clearTimeout(rollingFinalHoldRef.current)
      setLastRoll(null)
      setCheckResult(null)
      setIsRolling(true)
      setShowFinalFace(false)
      setRollingPreview({
        formula: normalized,
        specs,
        overflow,
      })
      rollingStopRef.current = setTimeout(() => {
        setShowFinalFace(true)
        rollingFinalHoldRef.current = setTimeout(() => {
          rollingTimerRef.current = null
          rollingStopRef.current = null
          rollingFinalHoldRef.current = null
          setIsRolling(false)
          setShowFinalFace(false)
          setRollingPreview(null)
          setFormulaError('')
          applyExternalRollFromDetail(detail)
          setFormulaMeta(null)
        }, RESULT_HOLD_MS)
      }, ROLL_ANIM_MS)
      return true
    },
    [isRolling, applyExternalRollFromDetail],
  )

  const performFormulaRoll = useCallback((formulaText, options = {}) => {
    if (isRolling) return
    const parsedSegments = parseFormula(formulaText)
    if (!parsedSegments) {
      setFormulaError('公式格式：XdN+N，可用逗号或+连接多段，如 8d12+4d6、2d6+5,5d6')
      return
    }
    const mode = options.mode || formulaMeta?.mode || d20Mode || 'normal'
    const parsed = parsedSegments.length === 1 ? parsedSegments[0] : null
    let rolls = []
    let finalTotal = 0
    let d20Result = null
    const segmentDetails = []
    const diceValues = []
    if (parsed?.kind === 'dice' && parsed.count === 1 && parsed.sides === 20 && mode !== 'normal') {
      const r = rollD20WithMode(mode)
      rolls = r.rolls
      d20Result = r.result
      finalTotal = r.result + (parsed.modifier || 0)
      segmentDetails.push(`1d20(${r.rolls.join(',')})${parsed.modifier ? `${parsed.modifier >= 0 ? '+' : ''}${parsed.modifier}` : ''}=${finalTotal}`)
      diceValues.push(r.result)
    } else {
      let detailIdx = 0
      for (const seg of parsedSegments) {
        if (seg.kind === 'flat') {
          finalTotal += seg.value
          const fp = seg.value >= 0 && detailIdx > 0 ? '+' : ''
          segmentDetails.push(`${fp}${seg.value}`)
          detailIdx += 1
          continue
        }
        const segSign = seg.sign ?? 1
        const segRolls = Array.from({ length: seg.count }, () => roll(seg.sides))
        rolls.push(...segRolls)
        diceValues.push(...segRolls)
        const segDice = segRolls.reduce((sum, n) => sum + n, 0)
        if (seg.count === 1 && seg.sides === 20) d20Result = segDice
        const mod = seg.modifier || 0
        const segTotal = segDice + mod
        const signed = segSign * segTotal
        finalTotal += signed
        const modStr = mod ? `${mod >= 0 ? '+' : ''}${mod}` : ''
        const dp = segSign < 0 ? '-' : detailIdx > 0 ? '+' : ''
        segmentDetails.push(`${dp}${seg.count}d${seg.sides}(${segRolls.join(',')})${modStr}=${signed}`)
        detailIdx += 1
      }
    }
    const normalizedFormula = String(formulaText || '').replace(/，/g, ',').replace(/\s+/g, '')
    const prepared = {
      parsed,
      mode,
      rolls,
      finalTotal,
      d20Result,
      segmentDetails,
      normalizedFormula,
    }
    const { specs, overflow } = buildRollingDiceSpecsWithValues(parsedSegments, diceValues)
    if (rollingTimerRef.current) clearInterval(rollingTimerRef.current)
    if (rollingStopRef.current) clearTimeout(rollingStopRef.current)
    if (rollingFinalHoldRef.current) clearTimeout(rollingFinalHoldRef.current)
    // 新一轮开始时先清空旧结果，避免出现“未停稳就先显示结果”的观感。
    setLastRoll(null)
    setCheckResult(null)
    setIsRolling(true)
    setShowFinalFace(false)
    setRollingPreview({
      formula: normalizedFormula,
      specs,
      overflow,
    })
    rollingStopRef.current = setTimeout(() => {
      setShowFinalFace(true)
      rollingFinalHoldRef.current = setTimeout(() => {
        rollingTimerRef.current = null
        rollingStopRef.current = null
        rollingFinalHoldRef.current = null
        setIsRolling(false)
        setShowFinalFace(false)
        setRollingPreview(null)

        setFormulaError('')
        const rollLabel = options.label || formulaMeta?.label || '通用投掷'
        const rollCat = detectRollCategory(rollLabel)
        setLastRoll({
          sides: prepared.parsed?.kind === 'dice' ? prepared.parsed.sides : 0,
          count: prepared.parsed?.kind === 'dice' ? prepared.parsed.count : 0,
          modifier: prepared.parsed?.kind === 'dice' ? prepared.parsed.modifier : 0,
          result: prepared.finalTotal,
          rawTotal: prepared.finalTotal,
          rolls: prepared.rolls,
          key: Date.now(),
          label: prepared.normalizedFormula,
          category: rollCat,
        })
        setCheckResult({
          label: rollLabel,
          modifier: prepared.parsed?.kind === 'dice' ? prepared.parsed.modifier : 0,
          d20Result: prepared.d20Result ?? null,
          rolls: prepared.rolls,
          total: prepared.finalTotal,
          key: Date.now(),
          formula: prepared.normalizedFormula,
          mode: prepared.parsed?.kind === 'dice' && prepared.parsed.count === 1 && prepared.parsed.sides === 20 ? prepared.mode : 'normal',
          details: prepared.segmentDetails.join(' ; '),
          critThreatMinNatural: options.critThreatMinNatural,
          category: rollCat,
        })
        // 调用攻击检定的 onResult 回调（用于多步交互流程）
        if (pendingCheckOnResultRef.current && typeof pendingCheckOnResultRef.current === 'function') {
          pendingCheckOnResultRef.current(prepared.finalTotal)
          pendingCheckOnResultRef.current = null
        }
        setFormulaMeta(null)
      }, RESULT_HOLD_MS)
    }, ROLL_ANIM_MS)
  }, [isRolling, formulaMeta?.mode, formulaMeta?.label, d20Mode])

  useLayoutEffect(() => {
    if (!pendingCheck) return
    const mod = Number(pendingCheck.modifier) || 0
    const nextFormula = `1d20${mod >= 0 ? '+' : ''}${mod}`
    if (pendingCheck.quickRoll) {
      // 保存 onResult 回调到 ref，以便在结果出来后调用
      pendingCheckOnResultRef.current = pendingCheck.onResult
      setPendingCheck(null)
      performFormulaRoll(nextFormula, {
        label: pendingCheck.label,
        mode: pendingCheck.advantage ?? d20Mode ?? '',
        critThreatMinNatural: pendingCheck.critThreatMinNatural,
      })
      return
    }
    setFormula(nextFormula)
    setFormulaMeta((prev) => ({ label: pendingCheck.label, mode: pendingCheck.advantage ?? prev?.mode ?? d20Mode ?? '' }))
    setFormulaError('')
    requestAnimationFrame(() => {
      const el = formulaInputRef.current
      if (!el) return
      el.focus()
      el.value = nextFormula
      const pos = nextFormula.length
      el.setSelectionRange(pos, pos)
    })
  }, [pendingCheck, d20Mode, performFormulaRoll, setPendingCheck])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onExternalRoll = (ev) => {
      const detail = ev?.detail
      if (!detail) return
      if (detail.animate === true && detail.formula && Array.isArray(detail.diceValues) && detail.diceValues.length > 0) {
        const started = beginPresetDiceAnimation(detail.formula, detail.diceValues, detail)
        if (started) return
      }
      applyExternalRollFromDetail(detail)
    }
    window.addEventListener('dnd-external-roll', onExternalRoll)
    return () => window.removeEventListener('dnd-external-roll', onExternalRoll)
  }, [beginPresetDiceAnimation, applyExternalRollFromDetail])

  const getLinkTo = (tab) => {
    if (tab.useLastEdited && preferredId) return `/characters/${preferredId}`
    if (tab.useLastEditedForSpells && preferredId) return `/character-spells?char=${preferredId}`
    return tab.to
  }

  const keypadDie = useCallback((sides) => {
    setFormula((prev) => {
      const { prefix, tail } = splitCommaTail(prev)
      return prefix + mergeKeypadDieTail(tail, sides)
    })
    setFormulaMeta(null)
    setFormulaError('')
  }, [])

  const keypadDigit = useCallback((digit) => {
    setFormula((prev) => {
      const { prefix, tail } = splitCommaTail(prev)
      return prefix + mergeKeypadDigitTail(tail, digit)
    })
    setFormulaMeta(null)
    setFormulaError('')
  }, [])

  const keypadOp = useCallback((op) => {
    setFormula((prev) => {
      const { prefix, tail } = splitCommaTail(prev)
      return prefix + mergeKeypadOpTail(tail, op)
    })
    setFormulaMeta(null)
    setFormulaError('')
  }, [])

  const keypadBackspace = useCallback(() => {
    setFormula((prev) => (prev && prev.length > 0 ? prev.slice(0, -1) : ''))
    setFormulaError('')
  }, [])

  const clearFormulaAndResult = useCallback(() => {
    setFormula('')
    setFormulaMeta(null)
    setFormulaError('')
    setLastRoll(null)
    setCheckResult(null)
    requestAnimationFrame(() => formulaInputRef.current?.focus())
  }, [])

  const rollByFormula = useCallback(() => {
    performFormulaRoll(formula)
  }, [formula, performFormulaRoll])

  return (
    <>
      {isRolling ? <ThreeDiceOverlay diceSpecs={threeOverlaySpecs} showFinal={showFinalFace} /> : null}
      {isRolling ? (
        <div className="pointer-events-none fixed inset-x-0 top-[22%] z-[71] flex justify-center">
          <div className="rounded-lg border border-white/20 bg-[#0f172acc] px-4 py-2 text-xs tracking-wide text-dnd-gold-light shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            骰子滚动中... {rollingPreview?.formula || ''}
            {rollingPreview?.overflow > 0 ? `  (+${rollingPreview.overflow} 颗未渲染)` : ''}
          </div>
        </div>
      ) : null}
      <nav className="fixed bottom-0 left-0 right-0 z-40 w-full border-t border-white/10 bg-[#2D3748]/78 backdrop-blur-md safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
      <div className="border-b border-white/10 bg-[#2D3748]/78 backdrop-blur-md">
          <div className="mx-auto w-full max-w-[1180px] min-w-0 px-2 py-1.5 sm:px-4">
            <div className="flex items-stretch gap-1.5">
              <div className="grid min-w-0 flex-1 grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,3fr)] grid-rows-2 gap-x-1 gap-y-1.5">
                <button
                  type="button"
                  onClick={() => setD20Mode((prev) => (prev === 'advantage' ? '' : 'advantage'))}
                  className={`h-6 w-full min-w-0 rounded border border-white/20 px-0.5 text-[11px] font-medium transition-colors ${
                    d20Mode === 'advantage'
                      ? 'border-dnd-red bg-dnd-red text-white'
                      : 'bg-[#1E293B]/90 text-dnd-text-muted hover:border-white/30 hover:text-white'
                  }`}
                  title="D20 优势"
                >
                  优势
                </button>
                <div className="grid min-h-6 min-w-0 grid-cols-10 gap-px">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
                    <button
                      key={`n-${d}`}
                      type="button"
                      onClick={() => keypadDigit(d)}
                      className="h-6 min-w-0 rounded border border-white/20 bg-[#1E293B]/90 px-0 text-[10px] font-mono font-semibold leading-none text-white transition-colors hover:border-dnd-red hover:bg-dnd-red hover:text-white"
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="flex h-6 min-w-0 items-center gap-0.5 overflow-hidden rounded border border-dashed border-white/25 bg-[#1E293B]/45 px-1.5 text-[11px]">
                  {(checkResult?.category || lastRoll?.category) && !formulaError && !(isRolling && rollingPreview) && (
                    <RollCategoryTag category={checkResult?.category || lastRoll?.category} />
                  )}
                  <div
                    className={`min-w-0 flex-1 ${checkResult?.damageByType?.length ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden'}`}
                    title={
                      formulaError
                        ? formulaError
                        : checkResult
                          ? String(checkResult.details || `${checkResult.formula}=${checkResult.total}`)
                          : lastRoll
                            ? `${lastRoll.label}: ${lastRoll.result}`
                            : undefined
                    }
                  >
                    {formulaError ? (
                      <span className="block min-w-0 truncate font-mono text-red-300">{formulaError}</span>
                    ) : isRolling && rollingPreview ? (
                      <span className="block min-w-0 truncate animate-pulse font-mono text-dnd-gold-light">
                        {rollingPreview.formula || '投掷中'}
                      </span>
                    ) : checkResult?.damageByType?.length ? (
                      <div className="flex min-w-0 flex-nowrap items-center gap-0 whitespace-nowrap font-mono leading-none">
                        {checkResult.damageByType.map((row, i) => (
                          <span key={`${row.type}-${i}`} className="inline-flex shrink-0 items-baseline">
                            {i > 0 ? <span className="text-dnd-text-muted/80">, </span> : null}
                            <span className={damageDetailRowClass(row.type)}>{row.line}</span>
                          </span>
                        ))}
                        <span className="inline-flex shrink-0 items-baseline">
                          <span className="text-dnd-text-muted/80">, </span>
                          <span className="font-semibold tabular-nums text-white/95">伤害总值 {checkResult.total}</span>
                        </span>
                      </div>
                    ) : checkResult ? (
                      <span className="block min-w-0 truncate font-mono text-dnd-gold-light">
                        {renderDetailsWithNat20Highlight(
                          checkResult.details || `${checkResult.formula}=${checkResult.total}`,
                          checkResult.critThreatMinNatural,
                        )}
                      </span>
                    ) : lastRoll ? (
                      <span className="block min-w-0 truncate text-gray-300">
                        {lastRoll.label}: <span className="font-mono text-white">{lastRoll.result}</span>
                      </span>
                    ) : (
                      <span className="block truncate text-dnd-text-muted/80">计算结果</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearFormulaAndResult}
                    className="h-6 shrink-0 rounded border border-white/15 px-1 text-[10px] text-dnd-text-muted hover:bg-white/10 hover:text-white"
                    title="清空公式与计算结果"
                  >
                    清空
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setD20Mode((prev) => (prev === 'disadvantage' ? '' : 'disadvantage'))}
                  className={`h-6 w-full min-w-0 rounded border border-white/20 px-0.5 text-[11px] font-medium transition-colors ${
                    d20Mode === 'disadvantage'
                      ? 'border-dnd-red bg-dnd-red text-white'
                      : 'bg-[#1E293B]/90 text-dnd-text-muted hover:border-white/30 hover:text-white'
                  }`}
                  title="D20 劣势"
                >
                  劣势
                </button>
                <div className="grid min-h-6 min-w-0 grid-cols-9 gap-px">
                  {DICE_SIDES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => keypadDie(s)}
                      className="h-6 min-w-0 rounded border border-white/20 bg-[#1E293B]/90 px-0 text-[9px] font-mono font-semibold leading-none text-white transition-colors hover:border-dnd-red hover:bg-dnd-red hover:text-white"
                    >
                      D{s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => keypadOp('+')}
                    className="h-6 min-w-0 rounded border border-white/20 bg-[#1E293B]/90 px-0 text-[10px] font-mono font-semibold text-white transition-colors hover:border-dnd-red hover:bg-dnd-red hover:text-white"
                    title="加号，开始新一段"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => keypadOp('-')}
                    className="h-6 min-w-0 rounded border border-white/20 bg-[#1E293B]/90 px-0 text-[10px] font-mono font-semibold text-white transition-colors hover:border-dnd-red hover:bg-dnd-red hover:text-white"
                    title="减号"
                  >
                    -
                  </button>
                </div>
                <div className="flex min-h-6 min-w-0 items-center gap-0.5">
                  <input
                    ref={formulaInputRef}
                    type="text"
                    value={formula}
                    onChange={(e) => {
                      setFormula(e.target.value)
                      setFormulaMeta(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        rollByFormula()
                      }
                    }}
                    className="h-6 min-w-0 flex-1 rounded border border-white/20 bg-[#1E293B]/90 px-1.5 text-[11px] font-mono text-white placeholder:text-dnd-text-muted/70 focus:border-dnd-red focus:outline-none"
                    placeholder="输入公式…"
                    aria-label="骰子公式输入"
                  />
                  <button
                    type="button"
                    onClick={keypadBackspace}
                    className="h-6 w-6 shrink-0 rounded border border-white/15 text-[10px] font-mono text-dnd-text-muted hover:bg-white/10 hover:text-white"
                    title="回退一格"
                    aria-label="回退"
                  >
                    ⌫
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={rollByFormula}
                disabled={isRolling}
                className="w-[3.75rem] shrink-0 self-stretch rounded-lg border border-[#ff4b5c] text-xs font-bold text-white shadow-[0_0_18px_rgba(224,28,47,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(165deg, #E01C2F 0%, #9E2A2B 55%, #7A1F20 100%)',
                }}
                title="按当前公式投掷"
              >
                {isRolling ? '滚动中' : '投掷'}
              </button>
            </div>
          </div>
        </div>
      <div className="mx-auto flex h-14 w-[1180px] min-w-[1180px] items-center justify-around gap-1 px-2 sm:px-4">
        {tabs.map((tab) => {
          const to = getLinkTo(tab)
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.key}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center flex-1 rounded-xl py-1.5 text-xs transition-all duration-200 ${
                  isActive ? 'text-dnd-gold-light' : 'text-dnd-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`mb-0.5 transition-all duration-200 ${
                      isActive ? 'h-7 w-7 text-dnd-gold-light' : 'h-6 w-6'
                    }`}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span className={isActive ? 'font-semibold' : ''}>{tab.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
      </nav>
    </>
  )
}
