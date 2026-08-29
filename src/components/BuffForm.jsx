import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { Trash2, Plus, ChevronDown, Database, X, Pencil } from 'lucide-react'
import { getEffectSummaryShort } from './BuffListItem'
import ModeSelectionModal from './ModeSelectionModal'
import {
  BUFF_TYPES,
  getCategories,
  normalizeEffectCategory,
  DAMAGE_TYPES,
  CONDITION_OPTIONS,
  ABILITY_KEYS,
  ADVANTAGE_OPTIONS,
  PIERCING_DAMAGE_OPTIONS,
  DAMAGE_DICE_ARROW_OPTIONS,
  DICE_SIDES_OPTIONS,
  parseDamageString,
  SCOPE_KIND,
  SCOPE_KIND_OPTIONS,
  CREATURE_TYPE_OPTIONS,
  WEAPON_SCOPE_CATEGORY_OPTIONS,
  normalizeScope,
  ARMOR_PROFICIENCY_OPTIONS,
  WEAPON_PROFICIENCY_OPTIONS,
  VEHICLE_PROFICIENCY_OPTIONS,
  INSTRUMENT_PROFICIENCY_OPTIONS,
  TOOL_PROFICIENCY_OPTIONS,
  LANGUAGE_PROFICIENCY_OPTIONS,
  WEAPON_MASTERY_OPTIONS,
  SPECIAL_SENSES_OPTIONS,
  VISUAL_EFFECT_OPTIONS,
  DAMAGE_RELATION_OPTIONS,
  WEAPON_PROPERTY_OPTIONS,
  migrateProficiencyTextToArray,
} from '../data/buffTypes'
import { WEAPON_BUFF_CATEGORY_SELECT_OPTIONS } from '../data/itemDatabase'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { getMergedSpells, getSpellById, getWandScrollSpellPower } from '../data/spellDatabase'
import { inputClass, inputClassInline, textareaClass } from '../lib/inputStyles'
import { formatDisplayOneDecimal } from '../lib/encumbrance'
import { isFormulaValue, formatFormulaLabel } from '../lib/formulas'
import {
  normalizeContainedSpellValue,
  createEmptyContainedSpellSub,
} from '../lib/containedSpellModel'
import { normalizeChargeRecoveryValue } from '../lib/chargeRecovery'
import {
  normalizeChargeItemValue,
  createChargeEffectEntry,
  RECOVERY_METHODS,
  RESOURCE_TYPE_OPTIONS,
  ACTION_COST_OPTIONS,
  recoverySupportsAmount,
  recoveryIsDiceOnly,
  formatRecoveryBrief,
  ALL_MOD_OPTIONS,
  RESULT_TYPE_OPTIONS,
} from '../lib/chargeItemModel'
import { loadCreatureLibrary, getCreatureById, CREATURE_SIZES } from '../data/creatureLibrary'
import DurationEditor from './DurationEditor'
import ActiveCardEditor from './ActiveCardEditor'
import { SCOPE_TYPE, SCOPE_TYPE_OPTIONS } from '../lib/cardModel'
import { normalizeDuration, formatDurationBrief } from '../lib/durationModel'
import {
  BUFF_SOURCE_KIND_OPTIONS_EDITABLE,
  normalizeBuffSourceKindKey,
  getBuffSourceKindLabel,
} from '../lib/buffSourceKind'

const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

/** 默认公式引用数据：调用方未提供 referenceData 时仍允许选择常见变量 */
const DEFAULT_FORMULA_REFERENCE_DATA = [
  { label: '力量调整值', value: 0, ref: 'abilityModifier', ability: 'str' },
  { label: '敏捷调整值', value: 0, ref: 'abilityModifier', ability: 'dex' },
  { label: '体质调整值', value: 0, ref: 'abilityModifier', ability: 'con' },
  { label: '智力调整值', value: 0, ref: 'abilityModifier', ability: 'int' },
  { label: '感知调整值', value: 0, ref: 'abilityModifier', ability: 'wis' },
  { label: '魅力调整值', value: 0, ref: 'abilityModifier', ability: 'cha' },
  { label: '熟练加值', value: 0, ref: 'proficiency' },
  { label: '等级', value: 0, ref: 'level' },
  { label: '步行移动速度', value: 30, ref: 'speed' },
]

/** Buff 效果「起效类型」：用于命中/伤害加值等可选择起效范围的效果 */
const SCOPE_OPTIONS = SCOPE_KIND_OPTIONS

/** 读取属性对象里的值：保留公式对象，避免 Number() 把公式转成 NaN */
function getAbilityFieldValue(obj, key) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0
  if (key === 'all') {
    const firstKey = ABILITY_KEYS.find((k) => obj[k] != null)
    return firstKey != null ? obj[firstKey] : 0
  }
  return obj[key] ?? 0
}

function resolveInitialSourceKind(initial, defaultSourceKind) {
  if (initial?.sourceKind != null && String(initial.sourceKind).trim() !== '') {
    return normalizeBuffSourceKindKey(initial.sourceKind)
  }
  return normalizeBuffSourceKindKey(defaultSourceKind ?? 'adventure')
}

/** 专注增强旧文案转对象（兼容历史数据） */
function normalizeConcentrationSaveEnhanceValue(value) {
  if (value != null && typeof value === 'object' && !Array.isArray(value) && 'val' in value) return value
  if (typeof value !== 'string') return typeof value === 'object' && value && !Array.isArray(value) ? value : { val: 0, advantage: '' }
  const val = (() => { const m = value.match(/[+＋](\d+)/); return m ? (parseInt(m[1], 10) || 0) : 0 })()
  const advantage = /优势/i.test(value) ? 'advantage' : /劣势/i.test(value) ? 'disadvantage' : ''
  return { val, advantage }
}

function newWeaponBonusRow(key = '', val = 0) {
  return { id: 'rw_' + Math.random().toString(36).slice(2, 11), key, val }
}

/** 命中/伤害加值：编辑态归一（val=全体；categoryRows=按武器叠加；兼容旧 weaponScope + weaponCategories） */
export function normalizeAttackDamageBonusModuleValue(value) {
  const base = { val: 0, advantage: '', categoryRows: [] }
  if (value == null) return { ...base }
  if (typeof value === 'number' && !Number.isNaN(value)) return { ...base, val: value }
  if (typeof value === 'string') {
    const attackMatch = value.match(/攻击\s*[+＋]?\s*(\d+)/i)
    const dmgMatch = value.match(/伤害\s*[+＋]?\s*(\d+)/i)
    const a = attackMatch ? (parseInt(attackMatch[1], 10) || 0) : 0
    const d = dmgMatch ? (parseInt(dmgMatch[1], 10) || 0) : 0
    const val = a || d || (parseInt(value, 10) || 0)
    const advantage = /优势/i.test(value) ? 'advantage' : /劣势/i.test(value) ? 'disadvantage' : ''
    return { ...base, val, advantage }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const advantage = value.advantage === 'advantage' || value.advantage === 'disadvantage' ? value.advantage : ''
    const valRaw = value.val
    let val = isFormulaValue(valRaw) ? valRaw : (Number.isNaN(Number(valRaw)) ? 0 : Number(valRaw))
    let categoryRows = []
    if (Array.isArray(value.categoryRows)) {
      categoryRows = value.categoryRows.map((r, i) => ({
        id: r.id || `cr_${i}_${String(r.key ?? '')}`,
        key: String(r.key ?? '').trim(),
        val: isFormulaValue(r.val) ? r.val : (Number(r.val) || 0),
      }))
    }
    const hasKeyedRows = categoryRows.some((r) => r.key)
    const weaponCategories = Array.isArray(value.weaponCategories)
      ? [...new Set(value.weaponCategories.map((x) => String(x).trim()).filter(Boolean))]
      : []
    const legacyScoped =
      value.weaponScope === 'weapon_category' && weaponCategories.length > 0 && !hasKeyedRows
    if (legacyScoped) {
      categoryRows = weaponCategories.map((k) => newWeaponBonusRow(k, val))
      val = 0
    }
    return { val, advantage, categoryRows }
  }
  return { ...base }
}

/** 保存前：同武器多行合并为一条加值 */
function mergeAttackDamageCategoryRows(rows) {
  const m = new Map()
  for (const r of rows || []) {
    const k = String(r.key ?? '').trim()
    if (!k) continue
    if (isFormulaValue(r.val)) {
      m.set(k, r.val)
    } else {
      m.set(k, (m.get(k) || 0) + (Number(r.val) || 0))
    }
  }
  return [...m.entries()].map(([key, val]) => ({ key, val }))
}

/** 持久化用的精简结构（全体 val + 可选 categoryRows，不再写 weaponScope） */
export function serializeAttackDamageBonusForSave(value) {
  const n = normalizeAttackDamageBonusModuleValue(value)
  const rows = mergeAttackDamageCategoryRows(n.categoryRows)
  const out = {
    val: isFormulaValue(n.val) ? n.val : (Number(n.val) || 0),
    advantage: n.advantage,
  }
  if (rows.length > 0) out.categoryRows = rows
  return out
}

/** 从 initial 归一化为 effects 数组（兼容旧单条与新版 effects[]，旧 4 大类规范化为 6 大类） */
function normalizeInitialEffects(initial) {
  const mapEffect = (e) => {
    let value = e.value ?? 0
    if (e.effectType === 'concentration_save_enhance') value = normalizeConcentrationSaveEnhanceValue(value)
    if (e.effectType === 'attack_damage_bonus') value = normalizeAttackDamageBonusModuleValue(value)
    if (e.effectType === 'choice') value = normalizeChoiceValue(value)
    const { scope, scopeDetail } = normalizeScope(e.scope, e.scopeDetail)
    const break20 = e.break20 && typeof e.break20 === 'object' && !Array.isArray(e.break20) ? e.break20 : {}
    return {
      id: 'e_' + Math.random().toString(36).slice(2),
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
      effectType: e.effectType ?? '',
      scope,
      scopeDetail,
      value,
      break20,
      customText: typeof e.value === 'string' && e.effectType !== 'concentration_save_enhance' ? e.value : '',
    }
  }
  if (Array.isArray(initial?.effects) && initial.effects.length) {
    return migrateProficiencyTextToArray(initial.effects).map(mapEffect)
  }
  if (initial?.category != null || initial?.effectType != null) {
    return migrateProficiencyTextToArray([initial]).map(mapEffect)
  }
  return [{ id: 'e_' + Math.random().toString(36).slice(2), category: '', effectType: '', scope: SCOPE_KIND.global, scopeDetail: [], value: 0, customText: '' }]
}

/** 根据效果类型把 value 转为保存用的最终值 */
function normalizeValueForSave(module, currentEffect) {
  const { value, customText } = module
  if (!currentEffect) return value
  const isBoolean = currentEffect.dataType === 'boolean'
  const isText = currentEffect.dataType === 'text'
  const isCustom = currentEffect.key?.startsWith('custom_')
  const needsSubSelect = currentEffect.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect.dataType === 'array'
  if (isBoolean) return value === true || value === 'true' || value === 1
  if (isText && !needsSubSelect) return typeof value === 'string' ? value : (customText ?? '')
  if (isCustom) return typeof customText === 'string' ? customText : ''
  if (needsSubSelect === 'damageType' && !isDamageTypeArray) return value
  if (isDamageTypeArray) return Array.isArray(value) ? value : []
  if (needsSubSelect === 'abilityScores') return value
  if (needsSubSelect === 'condition') return Array.isArray(value) ? value : []
  if (needsSubSelect === 'damagePiercingTraits') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const selected = value.selected ?? []
      const pierce = Array.isArray(value.pierce) ? value.pierce : [...(Array.isArray(value.element) ? value.element : []), ...(Array.isArray(value.alignment) ? value.alignment : [])]
      const hasPierce = selected.includes('pierce') || selected.includes('element') || selected.includes('alignment')
      const base = selected.filter((x) => x !== 'pierce' && x !== 'element' && x !== 'alignment')
      const normSelected = hasPierce ? [...base, 'pierce'] : base
      return { selected: normSelected, pierce }
    }
    const selected = Array.isArray(value) ? value : []
    return { selected, pierce: [] }
  }
  if (needsSubSelect === 'initBonusAndProficiency') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { bonus: isFormulaValue(value.bonus) ? value.bonus : (Number(value.bonus) || 0), proficient: !!value.proficient }
    }
    return { bonus: typeof value === 'number' && !Number.isNaN(value) ? value : 0, proficient: false }
  }
  if (currentEffect?.key === 'attack_damage_bonus') {
    return serializeAttackDamageBonusForSave(value)
  }
  if (needsSubSelect === 'numberAndAdvantage' || needsSubSelect === 'flightSpeed' || needsSubSelect === 'abilityScoresAndAdvantage' || needsSubSelect === 'skillsAndAdvantage' || needsSubSelect === 'attackAreaSize') return value
  if (needsSubSelect === 'containedSpell') {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
    return { spellId: '', spellName: '', level: 0, hitResolution: 'dex_save', range: '', area: '', damageDice: '', damageDiceCount: 1, damageDiceSides: 6, damageType: '', charges: 0 }
  }
  if (needsSubSelect === 'chargeItem') {
    return normalizeChargeItemValue(value)
  }
  if (needsSubSelect === 'armorOverride') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        base: isFormulaValue(value.base) ? value.base : (Number(value.base) || 10),
        applyDexMod: value.applyDexMod !== false,
        maxDexBonus: Number(value.maxDexBonus) || null,
        extra: Number(value.extra) || 0,
        shieldCompatible: !!value.shieldCompatible,
      }
    }
    return { base: 10, applyDexMod: true, maxDexBonus: null, extra: 0, shieldCompatible: false }
  }
  if (needsSubSelect === 'creatureTransform') {
    return normalizeCreatureTransformValue(value)
  }
  if (needsSubSelect === 'restoreSpellSlots') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        mode: ['single', 'multi'].includes(value.mode) ? value.mode : 'single',
        ringLevel: Math.max(1, Math.min(9, Number(value.ringLevel) || 1)),
        maxRing: Math.max(1, Math.min(9, Number(value.maxRing) || 3)),
        cost: Math.max(1, Math.min(99, Number(value.cost) || 1)),
      }
    }
    return { mode: 'single', ringLevel: 1, maxRing: 3, cost: 1 }
  }
  if (needsSubSelect === 'choice') {
    return normalizeChoiceValue(value)
  }
  if (needsSubSelect === 'damageTypeRelation') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        relation: ['resist', 'immune', 'vulnerable'].includes(value.relation) ? value.relation : 'resist',
        types: Array.isArray(value.types) ? value.types : [],
      }
    }
    return { relation: 'resist', types: [] }
  }
  if (needsSubSelect === 'damageReductionTyped') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        types: Array.isArray(value.types) ? value.types : [],
        reduction: Number(value.reduction) || 0,
      }
    }
    return { types: [], reduction: 0 }
  }
  if (needsSubSelect === 'specialSenses') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        senses: Array.isArray(value.senses) ? value.senses : [],
        range: Number(value.range) || 60,
      }
    }
    return { senses: [], range: 60 }
  }
  if (needsSubSelect === 'visualEffect') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        type: value.type ? String(value.type).trim() : '',
        description: typeof value.description === 'string' ? value.description : '',
      }
    }
    return { type: '', description: '' }
  }
  if (needsSubSelect === 'shieldPool') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        max: Number(value.max) || 10,
        threshold: Number(value.threshold) || 0,
        recoverOn: ['short', 'long', 'dawn', 'manual', 'none'].includes(value.recoverOn) ? value.recoverOn : 'manual',
      }
    }
    return { max: 10, threshold: 0, recoverOn: 'manual' }
  }
  if (currentEffect.key === 'recharge_long_rest' || currentEffect.key === 'recharge_dawn') {
    return normalizeChargeRecoveryValue(value)
  }
  if (currentEffect.key === 'spell_damage_bonus') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        type: value.type ? String(value.type).trim() : '',
        diceFloor: Number(value.diceFloor) > 1 ? Number(value.diceFloor) : 0,
        perDieBonus: Number(value.perDieBonus) || 0,
        extraDice: value.extraDice ? String(value.extraDice).trim() : '',
        flatBonus: value.flatBonus != null && value.flatBonus !== '' ? value.flatBonus : 0,
      }
    }
    return { type: '', diceFloor: 0, perDieBonus: 0, extraDice: '', flatBonus: 0 }
  }
  if (currentEffect.key === 'extra_damage_dice') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const { minus = '', plus = '', type = '', o3 = '', onlySpellDamage } = value
      return { minus, plus, type, o3, onlySpellDamage: !!onlySpellDamage }
    }
    if (typeof value === 'string') {
      const parsed = parseDamageString(value.trim())
      return { ...parsed, onlySpellDamage: false }
    }
    return { minus: '', plus: '', type: '', o3: '', onlySpellDamage: false }
  }
  if (currentEffect.key === 'crit_extra_dice') {
    if (isFormulaValue(value)) return value
    const n = Number(value)
    if (Number.isNaN(n) || n < 2) return 2
    return Math.min(10, Math.floor(n))
  }
  if (currentEffect.key === 'crit_range_override') {
    if (isFormulaValue(value)) return value
    const n = Number(value)
    if (Number.isNaN(n) || n < 1 || n > 20) return 19
    return Math.floor(n)
  }
  if (currentEffect.key === 'crit_range_increment') {
    if (isFormulaValue(value)) return value
    const n = Number(value)
    if (Number.isNaN(n) || n < 1) return 1
    return Math.floor(n)
  }
  if (currentEffect.key === 'base_speed_increment') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const read = (key) => {
        const val = value[key]
        if (isFormulaValue(val)) return val
        const n = Number(val)
        return Number.isNaN(n) ? 0 : n
      }
      const walk = read('walk')
      const fly = read('fly')
      const swim = read('swim')
      const climb = read('climb')
      if (fly === 0 && swim === 0 && climb === 0) return walk
      return { walk, fly, swim, climb }
    }
    if (isFormulaValue(value)) return value
    const n = Number(value)
    return Number.isNaN(n) ? 0 : n
  }
  return value
}

/** 是否需单独一行的复杂数值（多选/网格等） */
function isComplexValueType(currentEffect) {
  if (!currentEffect) return false
  const needsSubSelect = currentEffect.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect.dataType === 'array'
  return (
    isDamageTypeArray ||
    needsSubSelect === 'condition' ||
    needsSubSelect === 'damagePiercingTraits' ||
    needsSubSelect === 'containedSpell' ||
    needsSubSelect === 'proficiencyChecklist' ||
    needsSubSelect === 'damageTypeRelation' ||
    needsSubSelect === 'damageReductionTyped' ||
    needsSubSelect === 'specialSenses' ||
    needsSubSelect === 'visualEffect' ||
    needsSubSelect === 'shieldPool' ||
    needsSubSelect === 'restoreSpellSlots'
  )
}

/** 从 plus 如 "1d6"、"2d6+5"、"13d6-2" 解析骰数、面数、固定加值（加值步进器用） */
function parseDiceFromPlus(plus) {
  if (!plus || typeof plus !== 'string') return { count: 1, sides: 6, flatMod: 0 }
  const m = plus.trim().match(/^(\d*)d(\d+)([+-]\d+)?$/i)
  if (!m) return { count: 1, sides: 6, flatMod: 0 }
  const count = Math.max(1, parseInt(m[1], 10) || 1)
  const sides = parseInt(m[2], 10) || 6
  const flatMod = m[3] ? parseInt(m[3], 10) : 0
  const allowedSides = [4, 6, 8, 10, 12]
  const sidesNorm = allowedSides.includes(sides) ? sides : 6
  return { count, sides: sidesNorm, flatMod: Number.isFinite(flatMod) ? flatMod : 0 }
}

function buildPlusFromDiceParts(count, sides, flatMod) {
  const c = Math.max(1, Number(count) || 1)
  const s = Number(sides) || 6
  const base = c >= 1 && s >= 4 ? `${c}d${s}` : ''
  if (!base) return ''
  const fm = Number(flatMod) || 0
  if (fm === 0) return base
  return `${base}${fm > 0 ? '+' : ''}${fm}`
}

/** 内含法术编辑器：一个 effect 可包含多个法术，共享总充能 */
function ContainedSpellEditor({
  module,
  onChange,
  spellDC,
  spellAttackBonus,
  useWandScrollTable,
  primaryOnly = false,
  hideCharges = false,
  rowPrefix,
}) {
  const value = module.value
  const cs = normalizeContainedSpellValue(value)
  const { totalCharges, spells } = cs
  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const inputCls = inputClass.replace(/\bh-10\b/, 'h-5').replace(/\bpx-3\b/, 'px-1').replace(/\btext-sm\b/, 'text-[11px]').replace(/\bw-full\b/, 'flex-1 min-w-0')
  const selectCls = inputCls + ' cursor-pointer'
  const HIT_RESOLUTION_OPTIONS = [
    { value: 'dex_save', label: '敏捷' },
    { value: 'str_save', label: '力量' },
    { value: 'con_save', label: '体质' },
    { value: 'wis_save', label: '感知' },
    { value: 'int_save', label: '智力' },
    { value: 'cha_save', label: '魅力' },
    { value: 'spell_attack', label: '法攻' },
    { value: 'none', label: '效应' },
  ]

  const patchValue = (next) => onChange({ ...module, value: next })
  const patchSpells = (nextSpells) => patchValue({ ...cs, spells: nextSpells })
  const updateSpell = (idx, patch) => patchSpells(spells.map((sp, i) => (i === idx ? { ...sp, ...patch } : sp)))
  const removeSpell = (idx) => patchSpells(spells.filter((_, i) => i !== idx))
  const addSpell = () => patchSpells([...spells, createEmptyContainedSpellSub()])

  const spellInputValue = (sp) => {
    const name = (sp.spellName || '').trim()
    if (name) return name
    if (sp.spellId) {
      const s = getSpellById(sp.spellId)
      if (s) return s.name
    }
    return ''
  }

  return (
    <div className="flex flex-col gap-y-1 w-full">
      {!hideCharges && (
        <div className="flex items-center gap-x-1.5">
          <span className="text-[10px] text-dnd-text-muted">总能量</span>
          <NumberStepper
            value={totalCharges}
            onChange={(v) => patchValue({ ...cs, totalCharges: Math.max(0, Math.min(999, v)) })}
            min={0}
            max={999}
            compact
            narrow
            className="!h-5"
          />
          <span className="text-gray-500 text-[10px]">所有内含法术共用</span>
        </div>
      )}
      {spells.length === 0 && (
        <p className="text-gray-500 text-[10px]">尚未添加法术</p>
      )}
      {spells.map((sp, idx) => {
        const level = typeof sp.level === 'number' ? sp.level : (parseInt(sp.level, 10) || 0)
        const hitResolution = HIT_RESOLUTION_OPTIONS.some((o) => o.value === sp.hitResolution) ? sp.hitResolution : 'dex_save'
        const wandPower = useWandScrollTable ? getWandScrollSpellPower(level) : null
        const hitValueDisplay = hitResolution === 'none'
          ? null
          : (useWandScrollTable && wandPower
            ? (hitResolution === 'spell_attack' ? (wandPower.attackBonus >= 0 ? '+' : '') + wandPower.attackBonus : String(wandPower.dc))
            : (hitResolution === 'spell_attack' && spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : (spellDC != null ? String(spellDC) : null)))
        const prefix = rowPrefix != null ? String(rowPrefix).trim() : ''
        return (
          <div key={idx} className="rounded border border-white/[0.06] bg-[#161e2b]/60 px-1.5 py-1">
            <div className="flex items-center gap-x-1 w-full flex-wrap">
              {prefix && <span className="text-dnd-text-muted shrink-0 tabular-nums select-none text-[10px]">{prefix.replace(/\d+$/, (n) => Number(n) + idx)}</span>}
              <span className={labelCls}>法术</span>
              <input
                type="text"
                value={spellInputValue(sp)}
                onChange={(e) => {
                  const name = e.target.value
                  const match = name.trim() ? getMergedSpells().find((s) => s.name === name.trim()) : null
                  const nextSpellId = match ? match.id : ''
                  const nextLevel = match ? match.level : sp.level
                  updateSpell(idx, {
                    spellName: name,
                    spellId: nextSpellId,
                    level: nextLevel,
                    range: match ? (match.range ?? '') : sp.range,
                    area: match ? (match.range ?? '') : sp.area,
                  })
                }}
                placeholder="名称"
                className={inputCls + ' min-w-[5rem]'}
                list={'contained-spell-datalist-' + (module.id ?? '') + '-' + idx}
                title="法术名称"
              />
              <datalist id={'contained-spell-datalist-' + (module.id ?? '') + '-' + idx}>
                {getMergedSpells().map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
              <span className={labelCls}>环位</span>
              <NumberStepper
                value={Math.max(0, Math.min(9, level))}
                onChange={(v) => updateSpell(idx, { level: Math.max(0, Math.min(9, v)) })}
                min={0}
                max={9}
                compact
                narrow
                className="!h-5 !w-10"
              />
              <span className={labelCls}>消耗</span>
              <NumberStepper
                value={sp.cost}
                onChange={(v) => updateSpell(idx, { cost: Math.max(0, Math.min(99, v)) })}
                min={0}
                max={99}
                compact
                narrow
                className="!h-5 !w-10"
              />
              {!primaryOnly && (
                <>
                  <span className="text-gray-600 mx-0.5">|</span>
                  <span className={labelCls}>命中</span>
                  <select
                    value={hitResolution}
                    onChange={(e) => updateSpell(idx, { hitResolution: e.target.value })}
                    className={selectCls + ' !w-[3.5rem]'}
                  >
                    {HIT_RESOLUTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {hitValueDisplay != null && (
                    <span className="text-white font-mono tabular-nums shrink-0 text-[11px]">{hitValueDisplay}</span>
                  )}
                  <span className={labelCls}>距离</span>
                  <input
                    type="text"
                    value={sp.range ?? ''}
                    onChange={(e) => updateSpell(idx, { range: e.target.value })}
                    placeholder="自身"
                    className={inputCls + ' !w-[3rem]'}
                  />
                  <span className={labelCls}>伤害</span>
                  <NumberStepper
                    value={sp.damageDiceCount}
                    onChange={(v) => updateSpell(idx, { damageDiceCount: Math.max(0, Math.min(99, v)) })}
                    min={0}
                    max={99}
                    compact
                    narrow
                    className="!h-5 !w-10 min-w-0 shrink-0"
                  />
                  <select
                    value={sp.damageDiceSides}
                    onChange={(e) => updateSpell(idx, { damageDiceSides: Number(e.target.value) })}
                    className={selectCls + ' !w-[2.8rem] shrink-0'}
                  >
                    {DICE_SIDES_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-gray-800 text-white">{o.label}</option>
                    ))}
                  </select>
                  <select
                    value={sp.damageType ?? ''}
                    onChange={(e) => updateSpell(idx, { damageType: e.target.value })}
                    className={selectCls + ' !w-[3rem]'}
                    title="伤害类型"
                  >
                    <option value="">类型</option>
                    {DAMAGE_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() => removeSpell(idx)}
                className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto"
                title="删除该法术"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )
      })}
      <button
        type="button"
        onClick={addSpell}
        className="flex items-center justify-center gap-1 px-2 py-1 rounded border border-dnd-gold/60 text-dnd-gold-light hover:bg-dnd-gold/20 text-[10px] font-medium w-full"
      >
        <Plus className="w-3 h-3" />
        添加法术
      </button>
    </div>
  )
}

/** 伤害模块一行：narrowBlocks 更窄块宽；evenSpacing 统一间隔；unifiedColor 同色基线对齐；evenSpread 时占满宽度且模块内均分平铺 */
function DamageDiceInlineRow({ value, onChange, module, compact, minusStepper, hideFlatMod, trailing, leftLabel, narrowBlocks, evenSpacing, unifiedColor, evenSpread }) {
  const isLegacy = typeof value === 'string'
  const parsed = isLegacy && value ? parseDamageString(value) : {}
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const plus = raw.plus ?? parsed.plus ?? ''
  const type = raw.type ?? parsed.type ?? ''
  const o3 = raw.o3 ?? parsed.o3 ?? ''
  const { count: diceCount, sides: diceSides, flatMod: diceFlatMod } = parseDiceFromPlus(plus)
  const update = (part, v) => {
    const base = isLegacy ? parseDamageString(value || '') : { ...raw }
    const next = { ...base, [part]: v, minus: '' }
    onChange({ ...module, value: next })
  }
  const setDice = (count, sides) => {
    const fm = hideFlatMod ? 0 : parseDiceFromPlus(plus).flatMod
    update('plus', buildPlusFromDiceParts(count, sides, fm))
  }
  const setFlatMod = (fm) => {
    update('plus', buildPlusFromDiceParts(diceCount, diceSides, fm))
  }
  const rowH = compact ? 'h-7' : 'h-8'
  const selCls = compact ? (inputClass + ' h-7 text-xs px-1 pr-4') : (inputClass + ' h-8 text-sm px-1 pr-4')
  const noteInputCls =
    inputClassInline.replace(/\bh-10\b/, rowH).replace(/\brounded-lg\b/, 'rounded-md') +
    ' shrink-0 min-w-[3rem] w-[5rem] max-w-[9rem] px-2 py-0 border-gray-500/60 bg-gray-800/90 focus:ring-amber-500/40 ' +
    (compact ? 'text-xs' : 'text-sm')
  const labelCls = unifiedColor ? 'text-gray-200 shrink-0 text-xs' : ('text-dnd-text-muted shrink-0 ' + (compact ? 'text-[11px]' : 'text-xs'))
  const selColorCls = unifiedColor ? ' text-gray-200' : ''
  const sidesValue = DICE_SIDES_OPTIONS.some((o) => o.value === diceSides) ? diceSides : (diceSides || 6)
  const blockW = narrowBlocks ? { width: '5rem', minWidth: '5rem' } : { width: '7.5rem', minWidth: '7.5rem' }
  const blockGap = evenSpacing ? 'gap-1' : (narrowBlocks ? 'gap-2' : 'gap-5')
  const stepperBlockStyle = narrowBlocks ? { width: 'fit-content', minWidth: 'fit-content' } : blockW
  const selectBlockStyle = narrowBlocks ? { width: '5.25rem', minWidth: '5.25rem' } : blockW
  const selCenter = ' text-center'
  const selectPad = evenSpacing ? 'pl-2 pr-7' : 'pl-6 pr-7'
  const selectWrapperCls = evenSpacing ? 'shrink-0 w-[5.5rem] min-w-[5rem]' : 'shrink-0'
  const damageBlockFlex = evenSpread ? 'min-w-0 flex-1 justify-evenly' : (evenSpacing ? 'min-w-0' : 'min-w-0 flex-1')
  const damageBlock = (
    <div className={`flex items-stretch ${blockGap} flex-nowrap ${damageBlockFlex}`}>
      {/* 骰子数：narrowBlocks 时仅够数字+箭头 */}
      <div className={`flex items-center shrink-0 ${rowH}`} style={stepperBlockStyle}>
        <NumberStepper
          value={diceCount}
          onChange={(c) => setDice(c, diceSides)}
          min={1}
          max={99}
          step={1}
          compact={compact}
          narrow={narrowBlocks}
          unifiedColor={unifiedColor}
        />
      </div>
      {/* 骰子面数 d4～d12 */}
      <div className={`flex items-center ${selectWrapperCls} ${rowH}`} style={!evenSpacing ? selectBlockStyle : undefined}>
        <select
          value={String(sidesValue)}
          onChange={(e) => setDice(diceCount, parseInt(e.target.value, 10) || 6)}
          className={selCls + selCenter + selColorCls + ' w-full min-w-0 h-full ' + selectPad}
          title="骰子大小"
        >
          {DICE_SIDES_OPTIONS.map((o) => (
            <option key={o.value} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </div>
      {!hideFlatMod && (
        <div className={`flex items-center shrink-0 ${rowH}`} style={stepperBlockStyle} title="伤害加值（如 +5，与骰子合计为总伤害骰部分）">
          <NumberStepper
            value={diceFlatMod}
            onChange={setFlatMod}
            min={-99}
            max={99}
            step={1}
            compact={compact}
            narrow={narrowBlocks}
            unifiedColor={unifiedColor}
          />
        </div>
      )}
      {/* 伤害类型：evenSpacing 时缩小左右内边距以完整显示二字类型 */}
      <div className={`flex items-center ${selectWrapperCls} ${rowH}`} style={!evenSpacing ? selectBlockStyle : undefined}>
        <select value={type} onChange={(e) => update('type', e.target.value)} className={selCls + selCenter + selColorCls + ' w-full min-w-0 h-full ' + selectPad} title="伤害类型">
          <option value="">类型</option>
          {DAMAGE_TYPES.map((d) => (
            <option key={d.value} value={d.label}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className={`flex items-center shrink-0 min-w-0 ${rowH}`} title="附注（写入攻击字段末尾「 #…」）">
        <input
          type="text"
          value={o3}
          onChange={(e) => update('o3', e.target.value)}
          className={noteInputCls + selColorCls}
          placeholder="附注"
          maxLength={80}
        />
      </div>
    </div>
  )
  const labelGap = evenSpacing ? 'gap-1' : 'gap-3'
  const alignCls = unifiedColor ? 'items-baseline' : 'items-stretch'
  if (trailing != null) {
    return (
      <div className={`flex ${alignCls} ${evenSpacing ? 'gap-3' : 'gap-6'} flex-nowrap w-full min-w-0 ${rowH}`}>
        <div className={`flex ${alignCls} ${labelGap} flex-1 min-w-0 justify-start ${rowH}`}>
          {leftLabel != null && leftLabel !== '' && <span className={labelCls}>{leftLabel}</span>}
          {damageBlock}
        </div>
        <div className={`flex items-center gap-1.5 shrink-0 justify-end ${rowH}`}>
          {trailing}
        </div>
      </div>
    )
  }
  const rootCls = evenSpread ? 'w-full min-w-0 flex-1' : (evenSpacing ? 'shrink-0 max-w-full' : 'w-full min-w-0')
  const rootJustify = evenSpread ? 'justify-evenly' : ''
  return (
    <div className={`flex ${alignCls} ${labelGap} ${rootJustify} flex-nowrap text-left ${rootCls} ${rowH}`}>
      {leftLabel != null && leftLabel !== '' && <span className={labelCls}>{leftLabel}</span>}
      {damageBlock}
    </div>
  )
}

/** 步进器显示用：消除浮点串；整数不显示小数，否则一位小数（与 encumbrance 展示一致） */
function formatStepperFieldString(num) {
  if (typeof num !== 'number' || !Number.isFinite(num)) return '0'
  if (Math.abs(num - Math.round(num)) < 1e-8) return String(Math.round(num))
  return formatDisplayOneDecimal(num)
}

/** 引用现有数据：在步进器旁显示小下拉，可「引用为公式」或「直接填入当前值」。使用 fixed 定位避免被父容器 overflow 截断。 */
function ReferenceValuePicker({ options, onSelect, compact }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!options || options.length === 0) return null
  const formulaOptions = options.filter((opt) => typeof opt.ref === 'string')
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen((v) => !v)
  }
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        className={`rounded border border-gray-600/60 text-gray-400 hover:text-dnd-gold-light hover:border-dnd-gold/40 bg-gray-800/80 flex items-center justify-center transition-colors ${compact ? 'w-6 h-6' : 'w-7 h-7'}`}
        title="引用现有数据"
      >
        <Database className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
      </button>
      {open && (
        <div
          className="fixed z-50 min-w-[9rem] max-w-[16rem] max-h-[18rem] overflow-y-auto rounded-md border border-gray-600 bg-gray-800 shadow-lg py-1"
          style={{ top: pos.top, right: pos.right }}
        >
          {formulaOptions.length > 0 && (
            <>
              <div className="px-2.5 py-1 text-[10px] text-dnd-text-muted uppercase tracking-wider">引用为公式</div>
              {formulaOptions.map((opt) => (
                <button
                  key={`formula-${opt.ref}-${opt.ability || ''}-${opt.className || ''}-${opt.mult ?? 1}`}
                  type="button"
                  onClick={() => { onSelect({ ref: opt.ref, ability: opt.ability, className: opt.className, mult: opt.mult }); setOpen(false) }}
                  className="w-full text-left px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center justify-between gap-2"
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="text-dnd-gold-light font-mono tabular-nums shrink-0">{opt.value}</span>
                </button>
              ))}
            </>
          )}
          <div className="border-t border-gray-600/50 my-1" />
          <div className="px-2.5 py-1 text-[10px] text-dnd-text-muted uppercase tracking-wider">直接填入当前值</div>
          {options.map((opt) => (
            <button
              key={`static-${opt.label}`}
              type="button"
              onClick={() => { onSelect(opt.value); setOpen(false) }}
              className="w-full text-left px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center justify-between gap-2"
            >
              <span className="truncate">{opt.label}</span>
              <span className="text-dnd-gold-light font-mono tabular-nums shrink-0">{opt.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 公式后缀输入：在公式胶囊后手动输入 *2、/2、+3、*2+1 等系数 */
function FormulaSuffixInput({ value, onChange }) {
  const formatSuffix = (v) => {
    const m = Number(v?.mult) || 1
    const a = Number(v?.add) || 0
    let s = ''
    if (m !== 1) {
      s += `*${Number.isInteger(m) ? String(m) : parseFloat(m.toFixed(3))}`
    }
    if (a > 0) s += `+${a}`
    if (a < 0) s += `${a}`
    return s
  }

  const parseSuffix = (text) => {
    const s = String(text ?? '').trim().replace(/\s+/g, '')
    if (!s) return { ...value, mult: 1, add: 0 }
    const norm = s.replace(/×/g, '*').replace(/÷/g, '/')
    const m = norm.match(/^([*/]?(-?\d+(\.\d+)?))?([+-]?(-?\d+(\.\d+)?))?$/)
    if (!m) return value
    let mult = 1
    let add = 0
    if (m[1]) {
      const op = m[1][0]
      const num = parseFloat(m[1].slice(1))
      if (op === '*') mult = Number.isFinite(num) ? num : 1
      else if (op === '/') mult = num === 0 ? 0 : 1 / num
      else mult = parseFloat(m[1]) || 0
    }
    if (m[4]) {
      add = parseFloat(m[4]) || 0
    }
    return { ...value, mult, add }
  }

  const [text, setText] = useState(() => formatSuffix(value))
  useEffect(() => { setText(formatSuffix(value)) }, [value])

  const commit = () => {
    const next = parseSuffix(text)
    if (next !== value) onChange(next)
    else setText(formatSuffix(value))
  }

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
      placeholder="*2+1"
      title="输入系数，如 *2、/2、+3、*2+1"
      className="w-[4.5rem] h-7 px-1.5 text-xs text-center text-white bg-gray-800/90 border border-gray-500/60 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500/40 placeholder:text-gray-600 tabular-nums"
    />
  )
}

/** 数字输入：统一使用「中间数字 + 上下箭头」设计。narrow 时容器仅够数字与箭头；unifiedColor 时与行内标签同色；pill 为行内胶囊（无底色，用于背包/袋内表）；subtle 时文字更淡。value 也支持公式对象。className 可覆盖外层宽度等样式。 */
function NumberStepper({ value, onChange, min = -999, max = 999, step = 1, compact, narrow, unifiedColor, pill, subtle, disabled, referenceData, className }) {
  const rowH = pill ? 'h-6' : 'h-7'
  const textSize = compact || pill ? 'text-xs' : 'text-sm'
  const colorCls = disabled
    ? 'text-gray-600 cursor-not-allowed'
    : unifiedColor
      ? 'text-gray-200 hover:text-gray-100'
      : subtle
        ? 'text-gray-500 hover:text-gray-300'
        : 'text-gray-400 hover:text-white'
  const inputColorCls = disabled
    ? 'text-gray-500'
    : unifiedColor
      ? 'text-gray-200'
      : subtle
        ? 'text-gray-300'
        : 'text-white'

  if (isFormulaValue(value)) {
    return (
      <div className="flex items-center gap-1">
        <div className={`flex items-center gap-1 px-2 rounded border border-dnd-gold/40 bg-dnd-gold/10 ${rowH}`}>
          <span className={`${textSize} text-dnd-gold-light truncate max-w-[4rem]`}>{formatFormulaLabel(value)}</span>
          <button
            type="button"
            onClick={() => onChange(0)}
            className="text-dnd-gold-light/70 hover:text-white disabled:opacity-50 disabled:pointer-events-none"
            disabled={disabled}
            title="清除公式"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <FormulaSuffixInput value={value} onChange={onChange} />
        <ReferenceValuePicker options={referenceData} onSelect={onChange} compact={compact || pill} />
      </div>
    )
  }

  const num = typeof value === 'number' ? value : (parseInt(value, 10) || 0)
  const clamp = (v) => Math.min(max, Math.max(min, v))
  const handleInputChange = (e) => {
    if (disabled) return
    const s = e.target.value
    if (s === '' || s === '-') onChange(clamp(0))
    else { const v = parseInt(s, 10); if (!Number.isNaN(v)) onChange(clamp(v)) }
  }
  const padX = pill ? 'pl-0.5 pr-0.5' : narrow ? 'px-5' : 'px-7'
  const inputWidth = pill ? 'min-w-[1.25rem] w-7 flex-1' : narrow ? 'min-w-[2rem] w-11' : compact ? 'min-w-[2rem] flex-1' : 'min-w-[3.5rem] w-20'
  /** compact 默认拉满父级；若同时 narrow（如属性卡、伤害骰行），用固定最小宽度，避免三列网格把步进器压扁导致箭头与数字重叠 */
  const compactWidthCls =
    compact && narrow
      ? 'w-[6.75rem] min-w-[6.5rem] max-w-[min(100%,7.5rem)] shrink-0'
      : compact && !narrow
        ? 'w-full min-w-0 max-w-full'
        : ''
  const pillBtn = subtle
    ? 'w-5 h-5 rounded-full hover:bg-white/[0.06]'
    : 'w-5 h-5 rounded-full hover:bg-white/10'
  const chev = 'w-3 h-3'
  /** pill 仅用于表格式背包/仓库行：不要灰底胶囊，避免与行背景叠成「歪歪扭扭」的块 */
  const pillShell = 'rounded-full bg-transparent border-0 shadow-none'
  const pillFocusRing = pill ? 'focus-within:ring-2 focus-within:ring-amber-500/35' : ''
  const wrapperCls = pill
    ? `relative flex items-center ${pillShell} ${padX} ${rowH} max-w-full ${pillFocusRing} ${disabled ? 'opacity-60' : ''} ${className || ''}`
    : `relative flex items-center border border-gray-500/60 rounded-md bg-gray-800/90 shadow-sm ${padX} ${rowH} ${compactWidthCls} ${disabled ? 'opacity-60' : ''} ${className || ''}`
  const core = (
    <div className={wrapperCls}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(clamp(num - step))}
        className={`shrink-0 flex items-center justify-center ${colorCls} ${textSize} ${pill ? pillBtn : 'absolute left-1'} disabled:pointer-events-none`}
        aria-label="减少"
      >
        <ChevronDown className={`${chev} ${compact && !pill ? '' : ''}`} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={formatStepperFieldString(num)}
        disabled={disabled}
        onChange={handleInputChange}
        className={`flex-1 min-w-0 ${inputWidth} text-center ${inputColorCls} bg-transparent border-0 focus:outline-none focus:ring-0 ${rowH} ${textSize} tabular-nums ${pill ? 'px-0' : ''} disabled:cursor-not-allowed`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(clamp(num + step))}
        className={`shrink-0 flex items-center justify-center ${colorCls} ${textSize} ${pill ? pillBtn : 'absolute right-1'} disabled:pointer-events-none`}
        aria-label="增加"
      >
        <ChevronDown className={`${chev} rotate-180 ${compact && !pill ? '' : ''}`} />
      </button>
    </div>
  )
  if (!referenceData || referenceData.length === 0) return core
  return (
    <div className="flex items-center gap-1">
      {core}
      <ReferenceValuePicker options={referenceData} onSelect={onChange} compact={compact || pill} />
    </div>
  )
}

/** 施法增伤编辑器：伤害类型 / 伤害骰下限 / 每骰 +X / 追加骰 / 公式固定加值 */
function SpellDamageBonusEditor({ value, onChange, referenceData }) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const update = (patch) => onChange({ ...v, ...patch })
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">伤害类型（可选）</label>
          <select
            value={v.type || ''}
            onChange={(e) => update({ type: e.target.value })}
            className={inputClass + ' h-8 text-xs w-full min-w-0'}
          >
            <option value="">全部</option>
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">伤害骰下限</label>
          <NumberStepper
            value={v.diceFloor ?? 0}
            min={0}
            max={20}
            onChange={(n) => update({ diceFloor: n })}
            compact
            narrow
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">每 +X</label>
          <NumberStepper
            value={v.perDieBonus ?? 0}
            onChange={(n) => update({ perDieBonus: n })}
            compact
            narrow
          />
        </div>
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">追加骰（如 1d6）</label>
          <input
            type="text"
            value={v.extraDice || ''}
            onChange={(e) => update({ extraDice: e.target.value })}
            placeholder="1d6"
            className={inputClass + ' h-8 text-xs w-full min-w-0'}
          />
        </div>
      </div>
      <div>
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">固定加值（支持公式）</label>
        <NumberStepper
          referenceData={referenceData}
          value={v.flatBonus ?? 0}
          onChange={(n) => update({ flatBonus: n })}
          compact
          narrow
        />
      </div>
    </div>
  )
}

/** 充能恢复编辑器：固定值或 XdX+Z */
function ChargeRecoveryEditor({ value, onChange }) {
  const v = normalizeChargeRecoveryValue(value)
  const update = (patch) => onChange({ ...v, ...patch })
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={v.kind}
          onChange={(e) => onChange({ kind: e.target.value, fixed: 1, diceCount: 1, diceSides: 6, diceBonus: 0 })}
          className={inputClass + ' h-8 text-xs w-28 min-w-0'}
        >
          <option value="fixed">固定值</option>
          <option value="dice">掷骰</option>
        </select>
        {v.kind === 'fixed' ? (
          <NumberStepper
            value={v.fixed}
            min={0}
            max={99}
            onChange={(n) => update({ fixed: n })}
            compact
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <NumberStepper
              value={v.diceCount}
              min={1}
              max={99}
              onChange={(n) => update({ diceCount: n })}
              compact
            />
            <span className="text-gray-400 text-xs">d</span>
            <NumberStepper
              value={v.diceSides}
              min={1}
              max={100}
              onChange={(n) => update({ diceSides: n })}
              compact
            />
            <span className="text-gray-400 text-xs">+</span>
            <NumberStepper
              value={v.diceBonus || 0}
              min={0}
              max={99}
              onChange={(n) => update({ diceBonus: n })}
              compact
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** 统一充能物品编辑器：消耗资源选择 + 充能数/回能方式 + 消耗效果（内含法术/临时BUFF/护盾） */
function ChargeItemEditor({ module, onChange, spellDC, spellAttackBonus, useWandScrollTable, referenceData, baseReferenceData, subordinates = [] }) {
  const data = normalizeChargeItemValue(module.value)
  const patchData = (patch) => onChange({ ...module, value: { ...data, ...patch } })

  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const inputCls = inputClass.replace(/\bh-10\b/, 'h-7').replace(/\bpx-3\b/, 'px-1.5').replace(/\btext-sm\b/, 'text-[11px]').replace(/\bw-full\b/, 'flex-1 min-w-0')
  const selectCls = inputCls + ' cursor-pointer'

  const HIT_OPTIONS = [
    { value: 'dex_save', label: '敏捷' },
    { value: 'str_save', label: '力量' },
    { value: 'con_save', label: '体质' },
    { value: 'wis_save', label: '感知' },
    { value: 'int_save', label: '智力' },
    { value: 'cha_save', label: '魅力' },
    { value: 'spell_attack', label: '法攻' },
    { value: 'none', label: '效应' },
  ]

  const isChargesMode = data.resourceType === 'charges'

  // ── 造成能量下拉 ─
  const [energyDropdownOpen, setEnergyDropdownOpen] = useState(false)
  const energyDropdownRef = useRef(null)
  useEffect(() => {
    if (!energyDropdownOpen) return
    const handler = (e) => {
      if (energyDropdownRef.current && !energyDropdownRef.current.contains(e.target)) {
        setEnergyDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [energyDropdownOpen])

  // ── recovery helpers ──
  const rec = data.recovery
  const updateRecovery = (patch) => patchData({ recovery: { ...rec, ...patch } })
  const setRecoveryMethod = (method) => {
    const next = { ...rec, method }
    if (!recoverySupportsAmount(method)) {
      next.kind = 'full'
    } else if (recoveryIsDiceOnly(method)) {
      next.kind = 'dice'
    }
    updateRecovery(next)
  }

  // ── effects helpers ──
  const effects = data.effects
  const updateEffects = (next) => patchData({ effects: next })
  const addEffect = (type) => updateEffects([...effects, createChargeEffectEntry(type)])
  const removeEffect = (idx) => updateEffects(effects.filter((_, i) => i !== idx))
  const updateEffect = (idx, patch) => updateEffects(effects.map((e, i) => {
    if (i !== idx) return e
    if (patch.type && patch.type !== e.type) {
      return createChargeEffectEntry(patch.type, { id: e.id })
    }
    return { ...e, ...patch }
  }))

  // ── spell sub-helpers ──
  const spellInputValue = (sp) => {
    const name = (sp?.spellName || '').trim()
    if (name) return name
    if (sp?.spellId) {
      const s = getSpellById(sp.spellId)
      if (s) return s.name
    }
    return ''
  }

  // ── creature library for summon ──
  const _chargeItemCreatureLib = useMemo(() => loadCreatureLibrary(), [])

  // ── temp_buff modal state ──
  // { effectIdx, moduleIdx (-1 = new) } | null
  const [tempBuffModal, setTempBuffModal] = useState(null)
  const [tempBuffDraft, setTempBuffDraft] = useState(null)

  const openTempBuffModal = (effectIdx, moduleIdx) => {
    const eff = effects[effectIdx]
    if (!eff || eff.type !== 'temp_buff') return
    const modules = eff.value?.modules || []
    if (moduleIdx >= 0 && moduleIdx < modules.length) {
      setTempBuffDraft({ ...modules[moduleIdx] })
    } else {
      // new module — default to first category, first effect
      const cats = getCategories()
      const firstCat = cats[0]?.key || 'ability'
      const firstEffects = BUFF_TYPES[firstCat]?.effects || []
      setTempBuffDraft({
        id: 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        category: firstCat,
        effectType: firstEffects[0]?.key || '',
        scope: 'global',
        scopeDetail: [],
        value: {},
      })
    }
    setTempBuffModal({ effectIdx, moduleIdx })
  }
  const closeTempBuffModal = () => { setTempBuffModal(null); setTempBuffDraft(null) }
  const saveTempBuffModule = (draft) => {
    if (!tempBuffModal) return
    const { effectIdx, moduleIdx } = tempBuffModal
    const eff = effects[effectIdx]
    if (!eff || eff.type !== 'temp_buff') return
    const modules = [...(eff.value?.modules || [])]
    if (moduleIdx >= 0 && moduleIdx < modules.length) {
      modules[moduleIdx] = draft
    } else {
      modules.push(draft)
    }
    updateEffect(effectIdx, { value: { ...eff.value, modules } })
    closeTempBuffModal()
  }
  const removeTempBuffModule = (effectIdx, moduleIdx) => {
    const eff = effects[effectIdx]
    if (!eff || eff.type !== 'temp_buff') return
    const modules = (eff.value?.modules || []).filter((_, i) => i !== moduleIdx)
    updateEffect(effectIdx, { value: { ...eff.value, modules } })
  }

  return (
    <div className="rounded-md bg-[#161e2b]/40 p-1.5 flex flex-col gap-y-1 w-full text-xs">
      {/* ── 消耗资源 + 总充能（同行） ── */}
      <div className="flex items-center gap-x-1.5 flex-wrap">
        <span className={labelCls}>消耗资源</span>
        <select
          value={data.resourceType}
          onChange={(e) => patchData({ resourceType: e.target.value })}
          className={selectCls + ' min-w-[8rem] max-w-[14rem] shrink-0'}
        >
          {RESOURCE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {isChargesMode && (
          <>
            <span className={labelCls}>总充能</span>
            <NumberStepper
              value={data.charges}
              onChange={(v) => patchData({ charges: Math.max(0, Math.min(999, v)) })}
              min={0}
              max={999}
              compact
              narrow
              className="!h-6"
              referenceData={referenceData}
            />
          </>
        )}
        {!isChargesMode && (
          <span className="text-gray-500 text-[10px]">次数与恢复由职业资源管理</span>
        )}
        <label className="flex items-center gap-1 text-[10px] text-amber-400 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={!!data.isStance}
            onChange={(e) => patchData({ isStance: e.target.checked })}
            className="accent-amber-500 w-3 h-3"
          />
          架势
        </label>
      </div>

      {/* ── 回能方式（仅充能数模式） ── */}
      {isChargesMode && (
        <div className="flex items-center gap-x-1.5 flex-wrap">
          <span className={labelCls}>回能方式</span>
          <select
            value={rec.method}
            onChange={(e) => setRecoveryMethod(e.target.value)}
            className={selectCls + ' !w-[5rem] shrink-0'}
          >
            {RECOVERY_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {recoverySupportsAmount(rec.method) && (
            <div className="flex items-center gap-x-0.5 min-w-[10rem]">
              {!recoveryIsDiceOnly(rec.method) && (
                <select
                  value={rec.kind}
                  onChange={(e) => updateRecovery({ kind: e.target.value })}
                  className={selectCls + ' !w-[3.5rem] shrink-0'}
                >
                  <option value="full">回满</option>
                  <option value="fixed">固定</option>
                  <option value="dice">掷骰</option>
                </select>
              )}
              {rec.kind === 'fixed' && (
                <NumberStepper
                  value={rec.fixed}
                  onChange={(v) => updateRecovery({ fixed: Math.max(0, v) })}
                  min={0}
                  max={999}
                  compact
                  narrow
                  className="!h-6"
                />
              )}
              {(rec.kind === 'dice' || recoveryIsDiceOnly(rec.method)) && (
                <div className="flex items-center gap-x-0.5">
                  <NumberStepper
                    value={rec.diceCount}
                    onChange={(v) => updateRecovery({ diceCount: Math.max(1, v) })}
                    min={1}
                    max={99}
                    compact
                    narrow
                    className="!h-6 !w-10"
                  />
                  <span className="text-gray-300 text-xs font-medium">d</span>
                  <NumberStepper
                    value={rec.diceSides}
                    onChange={(v) => updateRecovery({ diceSides: Math.max(1, v) })}
                    min={1}
                    max={100}
                    compact
                    narrow
                    className="!h-6 !w-10"
                  />
                  <span className="text-gray-300 text-xs font-medium">+</span>
                  <NumberStepper
                    value={rec.diceBonus || 0}
                    onChange={(v) => updateRecovery({ diceBonus: Math.max(0, v) })}
                    min={0}
                    max={99}
                    compact
                    narrow
                    className="!h-6 !w-10"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 动作消耗 ── */}
      <div className="flex items-center gap-x-1.5 flex-wrap">
        <span className={labelCls}>动作消耗</span>
        <select
          value={data.actionCost}
          onChange={(e) => patchData({ actionCost: e.target.value })}
          className={selectCls + ' !w-[5rem] shrink-0'}
        >
          {ACTION_COST_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {data.actionCost === 'movement' && (
          <div className="flex items-center gap-x-1">
            <NumberStepper
              value={data.movementFeet}
              onChange={(v) => patchData({ movementFeet: Math.max(0, v) })}
              min={0}
              max={999}
              compact
              narrow
              className="!h-6 !w-14"
            />
            <span className="text-gray-400 text-[10px]">尺</span>
          </div>
        )}
      </div>

      {/* ── 消耗效果 ── */}
      <div className="flex flex-col gap-y-1 pt-1 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <span className={labelCls}>消耗效果</span>
          <div className="flex items-center gap-x-1 flex-wrap">
            <div className="relative" ref={energyDropdownRef}>
              <button type="button" onClick={() => setEnergyDropdownOpen(!energyDropdownOpen)} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center" title="造成能量">⚡ 造成能量 </button>
              {energyDropdownOpen && (
                <div className="absolute left-0 top-[calc(100%+4px)] min-w-[100px] bg-[#1e2836] border border-white/10 rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-[100] overflow-hidden">
                  <button type="button" onClick={() => { addEffect('damage'); setEnergyDropdownOpen(false) }} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06] w-full text-left transition-colors">
                    <span className="text-red-400">⚔</span> 伤害
                  </button>
                  <button type="button" onClick={() => { addEffect('heal'); setEnergyDropdownOpen(false) }} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06] w-full text-left transition-colors">
                    <span className="text-green-400">✚</span> 治疗
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={() => addEffect('spell')} className="px-1.5 py-0.5 rounded border border-cyan-600/70 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/40 hover:border-cyan-500/80 text-[10px] font-medium transition-colors" title="添加内含法术">+ 法术</button>
            <button type="button" onClick={() => addEffect('temp_buff')} className="px-1.5 py-0.5 rounded border border-violet-600/70 bg-violet-900/20 text-violet-300 hover:bg-violet-800/40 hover:border-violet-500/80 text-[10px] font-medium transition-colors" title="添加临时BUFF">+ 临时BUFF</button>
            <button type="button" onClick={() => addEffect('shield')} className="px-1.5 py-0.5 rounded border border-emerald-600/70 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-800/40 hover:border-emerald-500/80 text-[10px] font-medium transition-colors" title="添加内含护盾">+ 护盾</button>
            <button type="button" onClick={() => addEffect('creature_transform')} className="px-1.5 py-0.5 rounded border border-rose-600/70 bg-rose-900/20 text-rose-300 hover:bg-rose-800/40 hover:border-rose-500/80 text-[10px] font-medium transition-colors" title="添加变身效果">+ 变身</button>
            <button type="button" onClick={() => addEffect('restore_spell_slots')} className="px-1.5 py-0.5 rounded border border-sky-600/70 bg-sky-900/20 text-sky-300 hover:bg-sky-800/40 hover:border-sky-500/80 text-[10px] font-medium transition-colors" title="添加法术位恢复">+ 法术位恢复</button>
            <button type="button" onClick={() => addEffect('summon')} className="px-1.5 py-0.5 rounded border border-indigo-600/70 bg-indigo-900/20 text-indigo-300 hover:bg-indigo-800/40 hover:border-indigo-500/80 text-[10px] font-medium transition-colors" title="添加召唤效果">+ 召唤</button>
          </div>
        </div>

        {effects.length === 0 && (
          <p className="text-gray-500 text-[10px]">尚未添加消耗效果</p>
        )}

        {effects.map((eff, idx) => {
          if (eff.type === 'spell') {
            const sp = eff.value || {}
            const level = typeof sp.level === 'number' ? sp.level : (parseInt(sp.level, 10) || 0)
            const hitRes = HIT_OPTIONS.some((o) => o.value === sp.hitResolution) ? sp.hitResolution : 'dex_save'
            const wandPower = useWandScrollTable ? getWandScrollSpellPower(level) : null
            const hitVal = hitRes === 'none' ? null
              : (useWandScrollTable && wandPower
                ? (hitRes === 'spell_attack' ? (wandPower.attackBonus >= 0 ? '+' : '') + wandPower.attackBonus : String(wandPower.dc))
                : (hitRes === 'spell_attack' && spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : (spellDC != null ? String(spellDC) : null)))
            const spellScalingEnabled = !!sp.scalingEnabled
            const spellSU = sp.scalingPerUnit || {}
            return (
              <div key={eff.id} className="rounded-md border border-cyan-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 flex-wrap">
                  <input
                    type="text"
                    value={spellInputValue(sp)}
                    onChange={(e) => {
                      const name = e.target.value
                      const match = name.trim() ? getMergedSpells().find((s) => s.name === name.trim()) : null
                      const newLevel = match ? match.level : sp.level
                      updateEffect(idx, {
                        value: {
                          ...sp,
                          spellName: name,
                          spellId: match ? match.id : '',
                          level: newLevel,
                          cost: match ? Math.max(1, newLevel) : sp.cost,
                          range: match ? (match.range ?? '') : sp.range,
                          area: match ? (match.range ?? '') : sp.area,
                        },
                      })
                    }}
                    placeholder="法术名称"
                    className={inputCls + ' min-w-[6rem] flex-1'}
                    list={'charge-spell-' + (module.id ?? '') + '-' + idx}
                    title="法术名称"
                  />
                  <span className={labelCls}>环</span>
                  <NumberStepper value={Math.max(0, Math.min(9, level))} onChange={(v) => updateEffect(idx, { value: { ...sp, level: Math.max(0, Math.min(9, v)) } })} min={0} max={9} compact narrow className="!h-7 !w-10" />
                  <span className={labelCls}>消耗</span>
                  <NumberStepper value={sp.cost ?? 1} onChange={(v) => updateEffect(idx, { value: { ...sp, cost: Math.max(0, Math.min(99, v)) } })} min={0} max={99} compact narrow className="!h-7 !w-10" />
                  <span className="text-gray-600 mx-0.5">|</span>
                  <span className={labelCls}>命中</span>
                  <select value={hitRes} onChange={(e) => updateEffect(idx, { value: { ...sp, hitResolution: e.target.value } })} className={selectCls + ' !w-[3rem]'}>
                    {HIT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                  {hitVal != null && <span className="text-white font-mono tabular-nums text-xs shrink-0">{hitVal}</span>}
                  <span className={labelCls}>距离</span>
                  <input type="text" value={sp.range ?? ''} onChange={(e) => updateEffect(idx, { value: { ...sp, range: e.target.value } })} placeholder="自身" className={inputCls + ' !w-[4rem]'} />
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* 缩放配置行 */}
                <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={spellScalingEnabled}
                      onChange={(e) => updateEffect(idx, { value: { ...sp, scalingEnabled: e.target.checked } })}
                      className="w-3 h-3 accent-cyan-500"
                    />
                    <span className="text-cyan-300/80 text-[10px]">每额外+1资源</span>
                  </label>
                  {spellScalingEnabled && (
                    <>
                      <span className={labelCls}>+伤害骰</span>
                      <NumberStepper value={spellSU.damageDiceCount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...sp, scalingPerUnit: { ...spellSU, damageDiceCount: Math.max(0, v) } } })} min={0} max={20} compact narrow className="!h-7 !w-10" />
                    </>
                  )}
                </div>
              </div>
            )
          }

          if (eff.type === 'ability') {
            const av = eff.value || {}
            const scalingEnabled = !!av.scalingEnabled
            const su = av.scalingPerUnit || {}
            return (
              <div key={eff.id} className="rounded-md border border-amber-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 flex-wrap">
                  <span className="text-amber-400 text-[10px] shrink-0 font-medium">奇能</span>
                  <input
                    type="text"
                    value={av.text ?? ''}
                    onChange={(e) => updateEffect(idx, { value: { ...av, text: e.target.value } })}
                    placeholder="描述效果"
                    className={inputCls + ' min-w-[6rem]'}
                  />
                  <span className={labelCls}>次数</span>
                  <NumberStepper value={av.uses ?? 1} onChange={(v) => updateEffect(idx, { value: { ...av, uses: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-10" />
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* 骰子配置行 */}
                <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                  <span className={labelCls}>骰子</span>
                  <NumberStepper value={av.diceCount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...av, diceCount: Math.max(0, v) } })} min={0} max={20} compact narrow className="!h-7 !w-10" />
                  <span className="text-gray-300 text-xs font-medium">d</span>
                  <select
                    value={av.diceSides ?? 10}
                    onChange={(e) => updateEffect(idx, { value: { ...av, diceSides: Number(e.target.value) } })}
                    className={inputCls + ' !h-7 !w-14 !text-[11px] !px-1'}
                  >
                    {[4, 6, 8, 10, 12, 20].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="text-gray-300 text-xs font-medium">+</span>
                  <select
                    value={av.abilityMod ?? ''}
                    onChange={(e) => updateEffect(idx, { value: { ...av, abilityMod: e.target.value } })}
                    className={inputCls + ' !h-7 !w-20 !text-[11px] !px-1'}
                  >
                    {ALL_MOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    value={av.resultType ?? 'heal'}
                    onChange={(e) => updateEffect(idx, { value: { ...av, resultType: e.target.value } })}
                    className={inputCls + ' !h-7 !w-16 !text-[11px] !px-1'}
                  >
                    {RESULT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {/* 缩放配置行 */}
                <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scalingEnabled}
                      onChange={(e) => updateEffect(idx, { value: { ...av, scalingEnabled: e.target.checked } })}
                      className="w-3 h-3 accent-amber-500"
                    />
                    <span className="text-amber-300/80 text-[10px]">每额外+1资源</span>
                  </label>
                  {scalingEnabled && (
                    <>
                      <span className={labelCls}>+骰</span>
                      <NumberStepper value={su.diceCount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...av, scalingPerUnit: { ...su, diceCount: Math.max(0, v) } } })} min={0} max={20} compact narrow className="!h-7 !w-10" />
                      <span className={labelCls}>+固定</span>
                      <NumberStepper value={su.flatBonus ?? 0} onChange={(v) => updateEffect(idx, { value: { ...av, scalingPerUnit: { ...su, flatBonus: Math.max(0, v) } } })} min={0} max={99} compact narrow className="!h-7 !w-10" />
                    </>
                  )}
                </div>
              </div>
            )
          }

          if (eff.type === 'temp_buff') {
            const tv = eff.value || {}
            const modules = tv.modules || []
            return (
              <div key={eff.id} className="rounded-md border border-violet-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 flex-wrap">
                  <span className="text-violet-400 text-[10px] shrink-0 font-medium">临时BUFF</span>
                  <input
                    type="text"
                    value={tv.buffName ?? ''}
                    onChange={(e) => updateEffect(idx, { value: { ...tv, buffName: e.target.value } })}
                    placeholder="BUFF名称"
                    className={inputCls + ' min-w-[6rem]'}
                  />
                  <DurationEditor value={tv.duration} onChange={(newDur) => updateEffect(idx, { value: { ...tv, duration: newDur } })} compact showPresets={false} />
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* 效果模块列表 */}
                {modules.length > 0 && (
                  <div className="flex flex-col gap-y-0.5 mt-1.5">
                    {modules.map((mod, mi) => {
                      const catLabel = BUFF_TYPES[mod.category]?.label || mod.category
                      const effectLabel = BUFF_TYPES[mod.category]?.effects?.find((e) => e.key === mod.effectType)?.label || mod.effectType
                      const summary = getEffectSummaryShort(mod, {})
                      return (
                        <div key={mod.id || mi} className="flex items-center gap-x-1 text-[10px]">
                          <span className="text-gray-500 shrink-0">{catLabel}</span>
                          <span className="text-violet-300/80 truncate">{summary || effectLabel}</span>
                          <button type="button" onClick={() => openTempBuffModal(idx, mi)} className="p-0.5 rounded text-gray-500 hover:text-amber-400 transition-colors shrink-0 ml-auto" title="编辑">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button type="button" onClick={() => removeTempBuffModule(idx, mi)} className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors shrink-0" title="删除">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* 添加效果按钮 */}
                <button type="button" onClick={() => openTempBuffModal(idx, -1)} className="mt-1.5 px-2 py-0.5 rounded-md border border-violet-600/50 bg-violet-900/10 text-violet-300/80 hover:bg-violet-800/30 hover:border-violet-500/60 text-[10px] font-medium transition-colors">
                  + 添加效果
                </button>
              </div>
            )
          }

          if (eff.type === 'shield') {
            const sv = eff.value || {}
            const shieldScalingEnabled = !!sv.scalingEnabled
            const shieldSU = sv.scalingPerUnit || {}
            return (
              <div key={eff.id} className="rounded-md border border-emerald-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 flex-wrap">
                  <span className="text-emerald-400 text-[10px] shrink-0 font-medium">护盾</span>
                  <span className={labelCls}>层数</span>
                  <NumberStepper value={sv.amount ?? 1} onChange={(v) => updateEffect(idx, { value: { ...sv, amount: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-12" />
                  <span className="text-gray-500 text-[10px]">每次消耗1层</span>
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* 缩放配置行 */}
                <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shieldScalingEnabled}
                      onChange={(e) => updateEffect(idx, { value: { ...sv, scalingEnabled: e.target.checked } })}
                      className="w-3 h-3 accent-emerald-500"
                    />
                    <span className="text-emerald-300/80 text-[10px]">每额外+1资源</span>
                  </label>
                  {shieldScalingEnabled && (
                    <>
                      <span className={labelCls}>+层数</span>
                      <NumberStepper value={shieldSU.amount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...sv, scalingPerUnit: { ...shieldSU, amount: Math.max(0, v) } } })} min={0} max={99} compact narrow className="!h-7 !w-10" />
                    </>
                  )}
                </div>
              </div>
            )
          }

          if (eff.type === 'creature_transform') {
            return (
              <div key={eff.id} className="rounded-md border border-rose-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 mb-1">
                  <span className="text-rose-400 text-[10px] shrink-0 font-medium">变身</span>
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <CreatureTransformEditor
                  value={eff.value}
                  onChange={(newValue) => updateEffect(idx, { value: newValue })}
                />
              </div>
            )
          }

          if (eff.type === 'restore_spell_slots') {
            const syntheticModule = { value: eff.value || {} }
            return (
              <div key={eff.id} className="rounded-md border border-sky-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 mb-1">
                  <span className="text-sky-400 text-[10px] shrink-0 font-medium">法术位恢复</span>
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <RestoreSpellSlotsEditor
                  module={syntheticModule}
                  onChange={(newModule) => updateEffect(idx, { value: newModule.value })}
                />
              </div>
            )
          }

          if (eff.type === 'summon') {
            const sv = eff.value || {}
            const _cl = _chargeItemCreatureLib
            const isStellarDouble = sv.preset === 'stellar_double'
            return (
              <div key={eff.id} className="rounded-md border border-indigo-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 flex-wrap">
                  <span className="text-indigo-400 text-[10px] shrink-0 font-medium">召唤</span>
                  <select value={sv.preset || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, preset: e.target.value } })} className={selectCls + ' !w-[6rem] shrink-0'}>
                    <option value="">自定义</option>
                    <option value="stellar_double">星辰替身</option>
                  </select>
                  {!isStellarDouble && (
                    <>
                      <select value={sv.sourceType || 'library'} onChange={(e) => updateEffect(idx, { value: { ...sv, sourceType: e.target.value } })} className={selectCls + ' !w-[5rem] shrink-0'}>
                        <option value="library">生物库</option>
                        <option value="attached_card">附属卡</option>
                      </select>
                      {sv.sourceType === 'library' && (
                        <select value={sv.creatureId || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, creatureId: e.target.value } })} className={selectCls + ' min-w-[6rem] flex-1'}>
                          <option value="">选择生物...</option>
                          {_cl.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                      )}
                      {sv.sourceType === 'attached_card' && (
                        <select value={sv.creatureId || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, creatureId: e.target.value } })} className={selectCls + ' min-w-[6rem] flex-1'}>
                          <option value="">选择附属卡...</option>
                          {subordinates.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                        </select>
                      )}
                    </>
                  )}
                  {isStellarDouble && (
                    <span className="text-xs text-purple-300 flex-1">创建自身分身，分身为你的复制品</span>
                  )}
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {isStellarDouble ? (
                  <div className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
                    <span className="text-purple-300 font-medium">星辰替身：</span>消耗当前生命值的一半（不含临时生命），创建一个与你完全相同的分身。分身拥有你最大生命值的一半作为其血量。
                  </div>
                ) : (
                  <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                    <span className={labelCls}>额外消耗</span>
                    <select value={sv.costType || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, costType: e.target.value } })} className={selectCls + ' !w-[4rem] shrink-0'}>
                      <option value="">无</option>
                      <option value="gold">金币</option>
                      <option value="hp">生命</option>
                    </select>
                    {sv.costType && (<>
                      <NumberStepper value={sv.costAmount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...sv, costAmount: Math.max(0, v) } })} min={0} max={9999} compact narrow className="!h-7 !w-14" />
                      <input type="text" value={sv.costDice || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, costDice: e.target.value } })} placeholder="骰子(如1d4)" className={inputCls + ' !w-[4rem]'} />
                    </>)}
                    <input type="text" value={sv.note || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, note: e.target.value } })} placeholder="备注" className={inputCls + ' min-w-[4rem] flex-1'} />
                  </div>
                )}
              </div>
            )
          }

          /* ── 伤害 ── */
          if (eff.type === 'damage') {
            const dv = eff.value || {}
            return (
              <div key={eff.id} className="rounded-md border border-red-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 mb-1">
                  <span className="text-red-400 text-[10px] shrink-0 font-medium">伤害</span>
                  <div className="flex items-center gap-x-1">
                    <NumberStepper value={dv.diceCount ?? 1} onChange={(v) => updateEffect(idx, { value: { ...dv, diceCount: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-12" />
                    <span className="text-[10px] text-gray-500">d</span>
                    <select value={dv.diceSides ?? 6} onChange={(e) => updateEffect(idx, { value: { ...dv, diceSides: Number(e.target.value) } })} className={selectCls + ' !w-[3.5rem]'}>
                      {[4, 6, 8, 10, 12, 20].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="text-[10px] text-gray-500">+</span>
                    <NumberStepper value={dv.diceBonus ?? 0} onChange={(v) => updateEffect(idx, { value: { ...dv, diceBonus: v } })} min={-99} max={999} compact narrow className="!h-7 !w-12" />
                  </div>
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-x-2 flex-wrap">
                  <select value={dv.damageType ?? 'fire'} onChange={(e) => updateEffect(idx, { value: { ...dv, damageType: e.target.value } })} className={selectCls + ' !w-[4.5rem]'}>
                    {DAMAGE_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer select-none">
                    <input type="checkbox" checked={!!dv.addWeaponDamage} onChange={(e) => updateEffect(idx, { value: { ...dv, addWeaponDamage: e.target.checked } })} className="accent-amber-500 w-3 h-3" />
                    附加手持武器伤害
                  </label>
                  {/^spell_slot_[1-9]$/.test(data.resourceType) && (
                    <label className="flex items-center gap-1 text-[10px] text-purple-400 cursor-pointer select-none">
                      <input type="checkbox" checked={!!dv.scaleWithSlot} onChange={(e) => updateEffect(idx, { value: { ...dv, scaleWithSlot: e.target.checked } })} className="accent-purple-500 w-3 h-3" />
                      按环位缩放
                    </label>
                  )}
                </div>
              </div>
            )
          }

          /* ── 治疗 ── */
          if (eff.type === 'heal') {
            const hv = eff.value || {}
            const isMaxMode = hv.mode === 'max'
            return (
              <div key={eff.id} className="rounded-md border border-green-800/30 bg-[#0d1520]/50 px-2 py-1.5">
                <div className="flex items-center gap-x-1.5 mb-1">
                  <span className="text-green-400 text-[10px] shrink-0 font-medium">治疗</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => updateEffect(idx, { value: { ...hv, mode: 'dice' } })} className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${!isMaxMode ? 'bg-green-800/50 text-green-300 border border-green-600/50' : 'text-gray-500 hover:text-gray-400'}`}>骰子</button>
                    <button type="button" onClick={() => updateEffect(idx, { value: { ...hv, mode: 'max' } })} className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${isMaxMode ? 'bg-green-800/50 text-green-300 border border-green-600/50' : 'text-gray-500 hover:text-gray-400'}`}>满疗</button>
                  </div>
                  <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!isMaxMode && (
                  <div className="flex items-center gap-x-1">
                    <NumberStepper value={hv.diceCount ?? 1} onChange={(v) => updateEffect(idx, { value: { ...hv, diceCount: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-12" />
                    <span className="text-[10px] text-gray-500">d</span>
                    <select value={hv.diceSides ?? 8} onChange={(e) => updateEffect(idx, { value: { ...hv, diceSides: Number(e.target.value) } })} className={selectCls + ' !w-[3.5rem]'}>
                      {[4, 6, 8, 10, 12, 20].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="text-[10px] text-gray-500">+</span>
                    <NumberStepper value={hv.diceBonus ?? 0} onChange={(v) => updateEffect(idx, { value: { ...hv, diceBonus: v } })} min={-99} max={999} compact narrow className="!h-7 !w-12" />
                  </div>
                )}
                {isMaxMode && (
                  <span className="text-[10px] text-gray-500">恢复骰子最大值</span>
                )}
                {/^spell_slot_[1-9]$/.test(data.resourceType) && (
                  <label className="flex items-center gap-1 text-[10px] text-purple-400 cursor-pointer select-none mt-1">
                    <input type="checkbox" checked={!!hv.scaleWithSlot} onChange={(e) => updateEffect(idx, { value: { ...hv, scaleWithSlot: e.target.checked } })} className="accent-purple-500 w-3 h-3" />
                    按环位缩放
                  </label>
                )}
              </div>
            )
          }

          return null
        })}
      </div>

      {/* ── 临时BUFF效果编辑弹窗 ── */}
      {tempBuffModal && tempBuffDraft && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={closeTempBuffModal}>
          <div className="relative max-w-md w-full mx-2 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <EffectModuleModal
              module={tempBuffDraft}
              onSave={saveTempBuffModule}
              onCancel={closeTempBuffModal}
              referenceData={referenceData}
              baseReferenceData={baseReferenceData}
              spellDC={spellDC}
              spellAttackBonus={spellAttackBonus}
              useWandScrollTable={useWandScrollTable}
              isNew={tempBuffModal.moduleIdx < 0}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** 主动模式效果列表：渲染 activeChargeData.effects 的子编辑器 */
function ActiveEffectsList({ data, onChange, spellDC, spellAttackBonus, useWandScrollTable, referenceData, baseReferenceData, subordinates = [] }) {
  const effects = data.effects || []
  const patchEffects = (next) => onChange({ ...data, effects: next })
  const removeEffect = (idx) => patchEffects(effects.filter((_, i) => i !== idx))
  const updateEffect = (idx, patch) => patchEffects(effects.map((e, i) => {
    if (i !== idx) return e
    if (patch.type && patch.type !== e.type) return createChargeEffectEntry(patch.type, { id: e.id })
    return { ...e, ...patch }
  }))

  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const inputCls = inputClass.replace(/\bh-10\b/, 'h-7').replace(/\bpx-3\b/, 'px-1.5').replace(/\btext-sm\b/, 'text-[11px]').replace(/\bw-full\b/, 'flex-1 min-w-0')
  const selectCls = inputCls + ' cursor-pointer'

  const HIT_OPTIONS = [
    { value: 'dex_save', label: '敏捷' }, { value: 'str_save', label: '力量' },
    { value: 'con_save', label: '体质' }, { value: 'wis_save', label: '感知' },
    { value: 'int_save', label: '智力' }, { value: 'cha_save', label: '魅力' },
    { value: 'spell_attack', label: '法攻' }, { value: 'none', label: '效应' },
  ]

  // ── temp_buff modal ──
  const [tempBuffModal, setTempBuffModal] = useState(null)
  const [tempBuffDraft, setTempBuffDraft] = useState(null)

  const openTempBuffModal = (effectIdx, moduleIdx) => {
    const eff = effects[effectIdx]
    if (!eff || eff.type !== 'temp_buff') return
    const modules = eff.value?.modules || []
    if (moduleIdx >= 0 && moduleIdx < modules.length) {
      setTempBuffDraft({ ...modules[moduleIdx] })
    } else {
      const cats = getCategories()
      const firstCat = cats[0]?.key || 'ability'
      const firstEffects = BUFF_TYPES[firstCat]?.effects || []
      setTempBuffDraft({
        id: 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        category: firstCat, effectType: firstEffects[0]?.key || '',
        scope: 'global', scopeDetail: [], value: {},
      })
    }
    setTempBuffModal({ effectIdx, moduleIdx })
  }
  const closeTempBuffModal = () => { setTempBuffModal(null); setTempBuffDraft(null) }
  const saveTempBuffModule = (draft) => {
    if (!tempBuffModal) return
    const { effectIdx, moduleIdx } = tempBuffModal
    const eff = effects[effectIdx]
    if (!eff || eff.type !== 'temp_buff') return
    const modules = [...(eff.value?.modules || [])]
    if (moduleIdx >= 0 && moduleIdx < modules.length) modules[moduleIdx] = draft
    else modules.push(draft)
    updateEffect(effectIdx, { value: { ...eff.value, modules } })
    closeTempBuffModal()
  }
  const removeTempBuffModule = (effectIdx, moduleIdx) => {
    const eff = effects[effectIdx]
    if (!eff || eff.type !== 'temp_buff') return
    updateEffect(effectIdx, { value: { ...eff.value, modules: (eff.value?.modules || []).filter((_, i) => i !== moduleIdx) } })
  }

  const spellInputValue = (sp) => {
    const name = (sp?.spellName || '').trim()
    if (name) return name
    if (sp?.spellId) { const s = getSpellById(sp.spellId); if (s) return s.name }
    return ''
  }

  const creatureLibrary = useMemo(() => loadCreatureLibrary(), [])

  return (
    <>
      {effects.map((eff, idx) => {
        /* ── 法术 ── */
        if (eff.type === 'spell') {
          const sp = eff.value || {}
          const level = typeof sp.level === 'number' ? sp.level : (parseInt(sp.level, 10) || 0)
          const hitRes = HIT_OPTIONS.some((o) => o.value === sp.hitResolution) ? sp.hitResolution : 'dex_save'
          const wandPower = useWandScrollTable ? getWandScrollSpellPower(level) : null
          const hitVal = hitRes === 'none' ? null
            : (useWandScrollTable && wandPower
              ? (hitRes === 'spell_attack' ? (wandPower.attackBonus >= 0 ? '+' : '') + wandPower.attackBonus : String(wandPower.dc))
              : (hitRes === 'spell_attack' && spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : (spellDC != null ? String(spellDC) : null)))
          const spellScalingEnabled = !!sp.scalingEnabled
          const spellSU = sp.scalingPerUnit || {}
          return (
            <div key={eff.id} className="rounded-md border border-cyan-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 flex-wrap">
                <input type="text" value={spellInputValue(sp)}
                  onChange={(e) => {
                    const name = e.target.value
                    const match = name.trim() ? getMergedSpells().find((s) => s.name === name.trim()) : null
                    updateEffect(idx, { value: { ...sp, spellName: name, spellId: match ? match.id : '', level: match ? match.level : sp.level, cost: match ? Math.max(1, match.level) : sp.cost, range: match ? (match.range ?? '') : sp.range, area: match ? (match.range ?? '') : sp.area } })
                  }}
                  placeholder="法术名称" className={inputCls + ' min-w-[6rem] flex-1'}
                  list={'active-spell-' + idx} title="法术名称" />
                <span className={labelCls}>环</span>
                <NumberStepper value={Math.max(0, Math.min(9, level))} onChange={(v) => updateEffect(idx, { value: { ...sp, level: Math.max(0, Math.min(9, v)) } })} min={0} max={9} compact narrow className="!h-7 !w-10" />
                <span className={labelCls}>消耗</span>
                <NumberStepper value={sp.cost ?? 1} onChange={(v) => updateEffect(idx, { value: { ...sp, cost: Math.max(0, Math.min(99, v)) } })} min={0} max={99} compact narrow className="!h-7 !w-10" />
                <span className="text-gray-600 mx-0.5">|</span>
                <span className={labelCls}>命中</span>
                <select value={hitRes} onChange={(e) => updateEffect(idx, { value: { ...sp, hitResolution: e.target.value } })} className={selectCls + ' !w-[3rem]'}>
                  {HIT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
                {hitVal != null && <span className="text-white font-mono tabular-nums text-xs shrink-0">{hitVal}</span>}
                <span className={labelCls}>距离</span>
                <input type="text" value={sp.range ?? ''} onChange={(e) => updateEffect(idx, { value: { ...sp, range: e.target.value } })} placeholder="自身" className={inputCls + ' !w-[4rem]'} />
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={spellScalingEnabled} onChange={(e) => updateEffect(idx, { value: { ...sp, scalingEnabled: e.target.checked } })} className="w-3 h-3 accent-cyan-500" />
                  <span className="text-cyan-300/80 text-[10px]">每额外+1资源</span>
                </label>
                {spellScalingEnabled && (<>
                  <span className={labelCls}>+伤害骰</span>
                  <NumberStepper value={spellSU.damageDiceCount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...sp, scalingPerUnit: { ...spellSU, damageDiceCount: Math.max(0, v) } } })} min={0} max={20} compact narrow className="!h-7 !w-10" />
                </>)}
              </div>
            </div>
          )
        }

        /* ── 临时BUFF ── */
        if (eff.type === 'temp_buff') {
          const tv = eff.value || {}
          const modules = tv.modules || []
          return (
            <div key={eff.id} className="rounded-md border border-violet-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 flex-wrap">
                <span className="text-violet-400 text-[10px] shrink-0 font-medium">临时BUFF</span>
                <input type="text" value={tv.buffName ?? ''} onChange={(e) => updateEffect(idx, { value: { ...tv, buffName: e.target.value } })} placeholder="BUFF名称" className={inputCls + ' min-w-[6rem]'} />
                <DurationEditor value={tv.duration} onChange={(newDur) => updateEffect(idx, { value: { ...tv, duration: newDur } })} compact showPresets={false} />
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {modules.length > 0 && (
                <div className="flex flex-col gap-y-0.5 mt-1.5">
                  {modules.map((mod, mi) => {
                    const summary = getEffectSummaryShort(mod, {})
                    const effectLabel = BUFF_TYPES[mod.category]?.effects?.find((e) => e.key === mod.effectType)?.label || mod.effectType
                    return (
                      <div key={mod.id || mi} className="flex items-center gap-x-1 text-[10px]">
                        <span className="text-gray-500 shrink-0">{BUFF_TYPES[mod.category]?.label || mod.category}</span>
                        <span className="text-violet-300/80 truncate">{summary || effectLabel}</span>
                        <button type="button" onClick={() => openTempBuffModal(idx, mi)} className="p-0.5 rounded text-gray-500 hover:text-amber-400 transition-colors shrink-0 ml-auto" title="编辑"><Pencil className="w-3 h-3" /></button>
                        <button type="button" onClick={() => removeTempBuffModule(idx, mi)} className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors shrink-0" title="删除"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={() => openTempBuffModal(idx, -1)} className="mt-1.5 px-2 py-0.5 rounded-md border border-violet-600/50 bg-violet-900/10 text-violet-300/80 hover:bg-violet-800/30 hover:border-violet-500/60 text-[10px] font-medium transition-colors">+ 添加效果</button>
            </div>
          )
        }

        /* ── 护盾 ── */
        if (eff.type === 'shield') {
          const sv = eff.value || {}
          const shieldScalingEnabled = !!sv.scalingEnabled
          const shieldSU = sv.scalingPerUnit || {}
          return (
            <div key={eff.id} className="rounded-md border border-emerald-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 flex-wrap">
                <span className="text-emerald-400 text-[10px] shrink-0 font-medium">护盾</span>
                <span className={labelCls}>层数</span>
                <NumberStepper value={sv.amount ?? 1} onChange={(v) => updateEffect(idx, { value: { ...sv, amount: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-12" />
                <span className="text-gray-500 text-[10px]">每次消耗1层</span>
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={shieldScalingEnabled} onChange={(e) => updateEffect(idx, { value: { ...sv, scalingEnabled: e.target.checked } })} className="w-3 h-3 accent-emerald-500" />
                  <span className="text-emerald-300/80 text-[10px]">每额外+1资源</span>
                </label>
                {shieldScalingEnabled && (<>
                  <span className={labelCls}>+层数</span>
                  <NumberStepper value={shieldSU.amount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...sv, scalingPerUnit: { ...shieldSU, amount: Math.max(0, v) } } })} min={0} max={99} compact narrow className="!h-7 !w-10" />
                </>)}
              </div>
            </div>
          )
        }

        /* ── 变身 ── */
        if (eff.type === 'creature_transform') {
          return (
            <div key={eff.id} className="rounded-md border border-rose-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 mb-1">
                <span className="text-rose-400 text-[10px] shrink-0 font-medium">变身</span>
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <CreatureTransformEditor value={eff.value} onChange={(newValue) => updateEffect(idx, { value: newValue })} />
            </div>
          )
        }

        /* ── 法术位恢复 ── */
        if (eff.type === 'restore_spell_slots') {
          const syntheticModule = { value: eff.value || {} }
          return (
            <div key={eff.id} className="rounded-md border border-sky-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 mb-1">
                <span className="text-sky-400 text-[10px] shrink-0 font-medium">法术位恢复</span>
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <RestoreSpellSlotsEditor module={syntheticModule} onChange={(newModule) => updateEffect(idx, { value: newModule.value })} />
            </div>
          )
        }

        /* ── 召唤 ── */
        if (eff.type === 'summon') {
          const sv = eff.value || {}
          const isStellarDouble = sv.preset === 'stellar_double'
          return (
            <div key={eff.id} className="rounded-md border border-indigo-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 flex-wrap">
                <span className="text-indigo-400 text-[10px] shrink-0 font-medium">召唤</span>
                <select value={sv.preset || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, preset: e.target.value } })} className={selectCls + ' !w-[6rem] shrink-0'}>
                  <option value="">自定义</option>
                  <option value="stellar_double">星辰替身</option>
                </select>
                {!isStellarDouble && (
                  <>
                    <select value={sv.sourceType || 'library'} onChange={(e) => updateEffect(idx, { value: { ...sv, sourceType: e.target.value } })} className={selectCls + ' !w-[5rem] shrink-0'}>
                      <option value="library">生物库</option>
                      <option value="attached_card">附属卡</option>
                    </select>
                    {sv.sourceType === 'library' && (
                      <select value={sv.creatureId || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, creatureId: e.target.value } })} className={selectCls + ' min-w-[6rem] flex-1'}>
                        <option value="">选择生物...</option>
                        {creatureLibrary.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                    )}
                    {sv.sourceType === 'attached_card' && (
                      <select value={sv.creatureId || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, creatureId: e.target.value } })} className={selectCls + ' min-w-[6rem] flex-1'}>
                        <option value="">选择附属卡...</option>
                        {subordinates.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                    )}
                  </>
                )}
                {isStellarDouble && (
                  <span className="text-xs text-purple-300 flex-1">创建自身分身，分身为你的复制品</span>
                )}
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {isStellarDouble ? (
                <div className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-purple-300 font-medium">星辰替身：</span>消耗当前生命值的一半（不含临时生命），创建一个与你完全相同的分身。分身拥有你最大生命值的一半作为其血量。
                </div>
              ) : (
                <div className="flex items-center gap-x-1.5 flex-wrap mt-1.5">
                  <span className={labelCls}>额外消耗</span>
                  <select value={sv.costType || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, costType: e.target.value } })} className={selectCls + ' !w-[4rem] shrink-0'}>
                    <option value="">无</option>
                    <option value="gold">金币</option>
                    <option value="hp">生命</option>
                  </select>
                  {sv.costType && (<>
                    <NumberStepper value={sv.costAmount ?? 0} onChange={(v) => updateEffect(idx, { value: { ...sv, costAmount: Math.max(0, v) } })} min={0} max={9999} compact narrow className="!h-7 !w-14" />
                    <input type="text" value={sv.costDice || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, costDice: e.target.value } })} placeholder="骰子(如1d4)" className={inputCls + ' !w-[4rem]'} />
                  </>)}
                  <input type="text" value={sv.note || ''} onChange={(e) => updateEffect(idx, { value: { ...sv, note: e.target.value } })} placeholder="备注" className={inputCls + ' min-w-[4rem] flex-1'} />
                </div>
              )}
            </div>
          )
        }

        /* ── 伤害 ── */
        if (eff.type === 'damage') {
          const dv = eff.value || {}
          return (
            <div key={eff.id} className="rounded-md border border-red-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 mb-1">
                <span className="text-red-400 text-[10px] shrink-0 font-medium">伤害</span>
                <div className="flex items-center gap-x-1">
                  <NumberStepper value={dv.diceCount ?? 1} onChange={(v) => updateEffect(idx, { value: { ...dv, diceCount: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-12" />
                  <span className="text-[10px] text-gray-500">d</span>
                  <select value={dv.diceSides ?? 6} onChange={(e) => updateEffect(idx, { value: { ...dv, diceSides: Number(e.target.value) } })} className={selectCls + ' !w-[3.5rem]'}>
                    {[4, 6, 8, 10, 12, 20].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="text-[10px] text-gray-500">+</span>
                  <NumberStepper value={dv.diceBonus ?? 0} onChange={(v) => updateEffect(idx, { value: { ...dv, diceBonus: v } })} min={-99} max={999} compact narrow className="!h-7 !w-12" />
                </div>
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-x-2 flex-wrap">
                <select value={dv.damageType ?? 'fire'} onChange={(e) => updateEffect(idx, { value: { ...dv, damageType: e.target.value } })} className={selectCls + ' !w-[4.5rem]'}>
                  {DAMAGE_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer select-none">
                  <input type="checkbox" checked={!!dv.addWeaponDamage} onChange={(e) => updateEffect(idx, { value: { ...dv, addWeaponDamage: e.target.checked } })} className="accent-amber-500 w-3 h-3" />
                  附加手持武器伤害
                </label>
                {/^spell_slot_[1-9]$/.test(data.resourceType) && (
                  <label className="flex items-center gap-1 text-[10px] text-purple-400 cursor-pointer select-none">
                    <input type="checkbox" checked={!!dv.scaleWithSlot} onChange={(e) => updateEffect(idx, { value: { ...dv, scaleWithSlot: e.target.checked } })} className="accent-purple-500 w-3 h-3" />
                    按环位缩放
                  </label>
                )}
              </div>
            </div>
          )
        }

        /* ── 治疗 ── */
        if (eff.type === 'heal') {
          const hv = eff.value || {}
          const isMaxMode = hv.mode === 'max'
          return (
            <div key={eff.id} className="rounded-md border border-green-800/30 bg-[#0d1520]/50 px-2 py-1.5">
              <div className="flex items-center gap-x-1.5 mb-1">
                <span className="text-green-400 text-[10px] shrink-0 font-medium">治疗</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => updateEffect(idx, { value: { ...hv, mode: 'dice' } })} className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${!isMaxMode ? 'bg-green-800/50 text-green-300 border border-green-600/50' : 'text-gray-500 hover:text-gray-400'}`}>骰子</button>
                  <button type="button" onClick={() => updateEffect(idx, { value: { ...hv, mode: 'max' } })} className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${isMaxMode ? 'bg-green-800/50 text-green-300 border border-green-600/50' : 'text-gray-500 hover:text-gray-400'}`}>满疗</button>
                </div>
                <button type="button" onClick={() => removeEffect(idx)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0 ml-auto" title="删除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {!isMaxMode && (
                <div className="flex items-center gap-x-1">
                  <NumberStepper value={hv.diceCount ?? 1} onChange={(v) => updateEffect(idx, { value: { ...hv, diceCount: Math.max(1, v) } })} min={1} max={99} compact narrow className="!h-7 !w-12" />
                  <span className="text-[10px] text-gray-500">d</span>
                  <select value={hv.diceSides ?? 8} onChange={(e) => updateEffect(idx, { value: { ...hv, diceSides: Number(e.target.value) } })} className={selectCls + ' !w-[3.5rem]'}>
                    {[4, 6, 8, 10, 12, 20].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="text-[10px] text-gray-500">+</span>
                  <NumberStepper value={hv.diceBonus ?? 0} onChange={(v) => updateEffect(idx, { value: { ...hv, diceBonus: v } })} min={-99} max={999} compact narrow className="!h-7 !w-12" />
                </div>
              )}
              {isMaxMode && (
                <span className="text-[10px] text-gray-500">恢复骰子最大值</span>
              )}
              {/^spell_slot_[1-9]$/.test(data.resourceType) && (
                <label className="flex items-center gap-1 text-[10px] text-purple-400 cursor-pointer select-none mt-1">
                  <input type="checkbox" checked={!!hv.scaleWithSlot} onChange={(e) => updateEffect(idx, { value: { ...hv, scaleWithSlot: e.target.checked } })} className="accent-purple-500 w-3 h-3" />
                  按环位缩放
                </label>
              )}
            </div>
          )
        }

        return null
      })}

      {/* ── temp_buff 效果编辑弹窗 ── */}
      {tempBuffModal && tempBuffDraft && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={closeTempBuffModal}>
          <div className="relative max-w-md w-full mx-2 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <EffectModuleModal
              module={tempBuffDraft}
              onSave={saveTempBuffModule}
              onCancel={closeTempBuffModal}
              referenceData={referenceData}
              baseReferenceData={baseReferenceData}
              spellDC={spellDC}
              spellAttackBonus={spellAttackBonus}
              useWandScrollTable={useWandScrollTable}
              isNew={tempBuffModal.moduleIdx < 0}
            />
          </div>
        </div>
      )}
    </>
  )
}

/** 法术位恢复编辑器：单环恢复 / 多环恢复 */
function RestoreSpellSlotsEditor({ module, onChange }) {
  const data = module.value || {}
  const patchData = (patch) => onChange({ ...module, value: { ...data, ...patch } })

  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const inputCls = inputClass.replace(/\bh-10\b/, 'h-7').replace(/\bpx-3\b/, 'px-1.5').replace(/\btext-sm\b/, 'text-[11px]').replace(/\bw-full\b/, 'flex-1 min-w-0')
  const selectCls = inputCls + ' cursor-pointer'

  const mode = data.mode || 'single'
  const ringLevel = typeof data.ringLevel === 'number' ? data.ringLevel : (parseInt(data.ringLevel, 10) || 1)
  const maxRing = typeof data.maxRing === 'number' ? data.maxRing : (parseInt(data.maxRing, 10) || 3)
  const cost = typeof data.cost === 'number' ? data.cost : (parseInt(data.cost, 10) || 1)

  return (
    <div className="rounded-md bg-[#161e2b]/40 p-2 flex flex-col gap-y-1.5 w-full text-xs">
      {/* 模式选择 */}
      <div className="flex items-center gap-x-2">
        <span className={labelCls}>模式</span>
        <select
          value={mode}
          onChange={(e) => patchData({ mode: e.target.value })}
          className={selectCls + ' !w-[8rem] shrink-0'}
        >
          <option value="single">单资源恢复</option>
          <option value="multi">多资源恢复</option>
        </select>
      </div>

      {mode === 'single' ? (
        /* ─ 单资源恢复 ── */
        <div className="flex items-center gap-x-2 flex-wrap">
          <span className="text-cyan-400 text-[10px] shrink-0 font-medium">恢复</span>
          <span className={labelCls}>环位</span>
          <NumberStepper
            value={Math.max(1, Math.min(9, ringLevel))}
            onChange={(v) => patchData({ ringLevel: Math.max(1, Math.min(9, v)) })}
            min={1}
            max={9}
            compact
            narrow
            className="!h-7 !w-10"
          />
          <span className="text-gray-500 text-[10px]">消耗1资源，恢复1个该环位法术位（已满则向下找空位）</span>
        </div>
      ) : (
        /* ── 多资源恢复 ── */
        <div className="flex items-center gap-x-2 flex-wrap">
          <span className="text-cyan-400 text-[10px] shrink-0 font-medium">恢复</span>
          <span className={labelCls}>最高环位</span>
          <NumberStepper
            value={Math.max(1, Math.min(9, maxRing))}
            onChange={(v) => patchData({ maxRing: Math.max(1, Math.min(9, v)) })}
            min={1}
            max={9}
            compact
            narrow
            className="!h-7 !w-10"
          />
          <span className="text-gray-500 text-[10px]">消耗</span>
          <NumberStepper
            value={Math.max(1, Math.min(99, cost))}
            onChange={(v) => patchData({ cost: Math.max(1, Math.min(99, v)) })}
            min={1}
            max={99}
            compact
            narrow
            className="!h-7 !w-10"
          />
          <span className="text-gray-500 text-[10px]">资源，恢复所有1~{maxRing}环法术位到满</span>
        </div>
      )}
    </div>
  )
}

/** 护甲覆盖编辑器：用于法师护甲、武僧无甲护甲等修改基础AC的效果 */
function ArmorOverrideEditor({ value, onChange, referenceData }) {
  const data = normalizeArmorOverrideValue(value)
  const patchData = (patch) => onChange({ ...data, ...patch })

  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const inputCls = inputClass.replace(/\bh-10\b/, 'h-6').replace(/\bpx-3\b/, 'px-1').replace(/\btext-sm\b/, 'text-xs')
  const selectCls = inputCls + ' cursor-pointer'

  return (
    <div className="rounded-md bg-[#161e2b]/50 p-2 flex flex-col gap-y-1.5 w-full text-xs">
      {/* 基础AC */}
      <div className="flex items-center gap-x-1.5">
        <span className={labelCls}>基础AC</span>
        <NumberStepper
          referenceData={referenceData}
          value={data.base}
          onChange={(v) => patchData({ base: Math.max(1, Math.min(99, v)) })}
          min={1}
          max={99}
          compact
          narrow
          className="!h-6"
        />
      </div>

      {/* 应用敏捷调整值 */}
      <label className="flex items-center gap-x-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!data.applyDexMod}
          onChange={(e) => patchData({ applyDexMod: e.target.checked })}
          className="rounded border-gray-600 bg-gray-800 text-dnd-red h-3.5 w-3.5"
        />
        <span className={labelCls}>应用敏捷调整值</span>
      </label>

      {/* 最大DEX加值限制 */}
      {data.applyDexMod && (
        <div className="flex items-center gap-x-1.5">
          <span className={labelCls}>最大DEX</span>
          <select
            value={data.maxDexBonus ?? ''}
            onChange={(e) => patchData({ maxDexBonus: e.target.value ? Number(e.target.value) : null })}
            className={selectCls + ' !w-[4rem] shrink-0'}
          >
            <option value="">无限制</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>+{n}</option>
            ))}
          </select>
        </div>
      )}

      {/* 额外增加 */}
      <div className="flex items-center gap-x-1.5">
        <span className={labelCls}>额外增加</span>
        <NumberStepper
          value={data.extra}
          onChange={(v) => patchData({ extra: v })}
          step={1}
          compact
          narrow
          className="!h-6"
        />
      </div>

      {/* 盾牌兼容 */}
      <label className="flex items-center gap-x-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!data.shieldCompatible}
          onChange={(e) => patchData({ shieldCompatible: e.target.checked })}
          className="rounded border-gray-600 bg-gray-800 text-dnd-red h-3.5 w-3.5"
        />
        <span className={labelCls}>可与盾牌叠加</span>
      </label>
    </div>
  )
}

/** 变身效果编辑器：引用生物库 + AC/HP/属性/资源 全方位配置 */
function CreatureTransformEditor({ value, onChange }) {
  const data = normalizeCreatureTransformValue(value)
  const patchData = (patch) => onChange({ ...data, ...patch })
  const [showAdvanced, setShowAdvanced] = useState(!data.wildShapeMode && (data.acMode !== 'max_formula' || data.hpMode !== 'keep_plus_temp' || data.resourceCostType !== ''))

  const creatures = useMemo(() => loadCreatureLibrary(), [])
  const selectedCreature = data.creatureId ? getCreatureById(data.creatureId) : null

  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const selectCls = inputClass.replace(/\bh-10\b/, 'h-6').replace(/\bpx-3\b/, 'px-1').replace(/\btext-sm\b/, 'text-xs') + ' cursor-pointer'
  const inputCls = selectCls

  const abilityOptions = [
    { key: 'int', label: '智力' },
    { key: 'wis', label: '感知' },
    { key: 'cha', label: '魅力' },
  ]
  const abilityRefOptions = [
    { value: '', label: '—' },
    { value: 'str', label: '力量' },
    { value: 'dex', label: '敏捷' },
    { value: 'con', label: '体质' },
    { value: 'int', label: '智力' },
    { value: 'wis', label: '感知' },
    { value: 'cha', label: '魅力' },
  ]
  const hpRefOptions = [
    { value: '', label: '无' },
    { value: 'classLevel', label: '职业等级' },
    { value: 'level', label: '角色等级' },
    { value: 'abilityModifier', label: '属性调整值' },
    { value: 'proficiency', label: '熟练加值' },
  ]

  const toggleKeepAbility = (key) => {
    const next = data.keepAbilities.includes(key)
      ? data.keepAbilities.filter((k) => k !== key)
      : [...data.keepAbilities, key]
    patchData({ keepAbilities: next })
  }

  /** 切换荒野变形模式：自动配置所有参数 */
  const toggleWildShapeMode = (enabled) => {
    if (enabled) {
      const isMoon = data.wildShapeSubclass === 'moon'
      patchData({
        wildShapeMode: true,
        keepAbilities: ['int', 'wis', 'cha'],
        acMode: 'max_formula',
        acFormulaBase: 13,
        acFormulaAbility: 'wis',
        hpMode: 'keep_plus_temp',
        hpFormula: { ref: 'classLevel', className: '德鲁伊', mult: isMoon ? 3 : 1, add: 0 },
        resourceCostType: 'wild_shape_uses',
        resourceCostValue: 1,
      })
    } else {
      patchData({ wildShapeMode: false })
    }
  }

  /** 切换荒野变形子职：自动更新临时HP倍率 */
  const changeWildShapeSubclass = (subclass) => {
    const isMoon = subclass === 'moon'
    patchData({
      wildShapeSubclass: subclass,
      hpFormula: { ref: 'classLevel', className: '德鲁伊', mult: isMoon ? 3 : 1, add: 0 },
    })
  }

  return (
    <div className="rounded-md bg-[#161e2b]/50 p-2 flex flex-col gap-y-1.5 w-full text-xs">
      {/* 荒野变形模式开关 */}
      <div className="flex items-center gap-x-1.5">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={data.wildShapeMode}
            onChange={(e) => toggleWildShapeMode(e.target.checked)}
            className="w-3.5 h-3.5 accent-amber-500"
          />
          <span className="text-[10px] text-dnd-gold-light font-medium">荒野变形模式</span>
        </label>
      </div>

      {/* 荒野变形子职选择 + CR 提示 */}
      {data.wildShapeMode && (
        <div className="rounded border border-amber-900/40 bg-amber-950/20 px-2 py-1.5 space-y-1">
          <div className="flex items-center gap-x-1.5">
            <span className={labelCls}>子职</span>
            <select
              value={data.wildShapeSubclass}
              onChange={(e) => changeWildShapeSubclass(e.target.value)}
              className={selectCls + ' flex-1 min-w-0'}
            >
              <option value="regular">普通德鲁伊</option>
              <option value="moon">月亮结社</option>
            </select>
          </div>
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <div>保留属性：智力/感知/魅力 | AC = max(野兽AC, 13+感知调整值)</div>
            <div>临时HP = 德鲁伊等级 × {data.wildShapeSubclass === 'moon' ? '3' : '1'} | 消耗 1 次荒野变形</div>
            {data.wildShapeSubclass === 'regular' && (
              <div className="text-amber-400/70">CR上限: 2级¼ → 4级½ → 8级1（8级起可飞行）</div>
            )}
            {data.wildShapeSubclass === 'moon' && (
              <div className="text-amber-400/70">CR上限: 2级1 → 6级=等级÷3 | 10级元素形态</div>
            )}
          </div>
        </div>
      )}

      {/* 选择生物 */}
      <div className="flex items-center gap-x-1.5">
        <span className={labelCls}>生物</span>
        <select
          value={data.creatureId}
          onChange={(e) => patchData({ creatureId: e.target.value })}
          className={selectCls + ' flex-1 min-w-0'}
        >
          <option value="">-- 选择生物 --</option>
          {creatures.map((c) => (
            <option key={c.id} value={c.id}>{c.name} (CR {c.cr})</option>
          ))}
        </select>
      </div>

      {/* 生物预览 */}
      {selectedCreature && (
        <div className="rounded border border-gray-700 bg-[#0d1520]/50 px-1.5 py-1 space-y-0.5">
          <div className="text-dnd-gold-light/80 text-[10px]">{selectedCreature.name} - {CREATURE_SIZES.find(s => s.value === selectedCreature.size)?.label || selectedCreature.size}</div>
          <div className="text-gray-400 text-[10px]">HP: {selectedCreature.hp} | AC: {selectedCreature.ac}</div>
          <div className="text-gray-400 text-[10px]">
            STR:{selectedCreature.abilities.str} DEX:{selectedCreature.abilities.dex} CON:{selectedCreature.abilities.con}
            INT:{selectedCreature.abilities.int} WIS:{selectedCreature.abilities.wis} CHA:{selectedCreature.abilities.cha}
          </div>
        </div>
      )}

      {/* ── 荒野变形模式：锁定自动配置，隐藏手动设置 ── */}
      {data.wildShapeMode ? (
        <div className="text-[10px] text-gray-500 italic text-center py-1">
          荒野变形模式下，属性/AC/HP/消耗已自动配置
        </div>
      ) : (
        <>
          {/* 高级配置折叠开关 */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 transition-colors mt-0.5"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-0' : '-rotate-90'}`} />
            高级配置
          </button>

          {showAdvanced && (
            <div className="space-y-1.5 pl-1 border-l border-white/[0.06] ml-0.5">
              {/* 保留原角色属性 */}
              <div className="flex items-center gap-x-1.5">
                <span className={labelCls}>保留属性</span>
                <div className="flex gap-x-2">
                  {abilityOptions.map(({ key, label }) => (
                    <label key={key} className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.keepAbilities.includes(key)}
                        onChange={() => toggleKeepAbility(key)}
                        className="w-3 h-3 accent-amber-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* AC 模式 */}
              <div className="flex items-center gap-x-1.5">
                <span className={labelCls}>AC处理</span>
                <select
                  value={data.acMode}
                  onChange={(e) => patchData({ acMode: e.target.value })}
                  className={selectCls + ' !w-auto flex-1 min-w-0'}
                >
                  <option value="replace">替换为生物AC</option>
                  <option value="add">叠加生物AC</option>
                  <option value="max_formula">取高值（公式 vs 生物AC）</option>
                </select>
              </div>

              {/* AC 公式（仅 max_formula 模式） */}
              {data.acMode === 'max_formula' && (
                <div className="flex items-center gap-x-1.5 pl-2">
                  <span className={labelCls}>公式</span>
                  <input
                    type="number"
                    value={data.acFormulaBase}
                    onChange={(e) => patchData({ acFormulaBase: Number(e.target.value) || 0 })}
                    className={inputCls + ' !w-12'}
                    placeholder="13"
                  />
                  <span className="text-gray-300 text-xs font-medium">+</span>
                  <select
                    value={data.acFormulaAbility}
                    onChange={(e) => patchData({ acFormulaAbility: e.target.value })}
                    className={selectCls + ' !w-auto flex-1 min-w-0'}
                  >
                    {abilityRefOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="text-gray-500 text-[10px]">调整值</span>
                </div>
              )}

              {/* HP 模式 */}
              <div className="flex items-center gap-x-1.5">
                <span className={labelCls}>HP处理</span>
                <select
                  value={data.hpMode}
                  onChange={(e) => patchData({ hpMode: e.target.value })}
                  className={selectCls + ' !w-auto flex-1 min-w-0'}
                >
                  <option value="replace">替换为生物HP</option>
                  <option value="add">生物HP作临时HP</option>
                  <option value="keep_plus_temp">保留原HP + 公式临时HP</option>
                </select>
              </div>

              {/* HP 公式（仅 keep_plus_temp 模式） */}
              {data.hpMode === 'keep_plus_temp' && (
                <div className="flex items-center gap-x-1.5 pl-2 flex-wrap">
                  <span className={labelCls}>公式</span>
                  <select
                    value={data.hpFormula?.ref || ''}
                    onChange={(e) => patchData({ hpFormula: { ...data.hpFormula, ref: e.target.value } || { ref: e.target.value, mult: 1, add: 0 } })}
                    className={selectCls + ' !w-auto flex-1 min-w-0'}
                  >
                    {hpRefOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {data.hpFormula?.ref === 'classLevel' && (
                    <>
                      <input
                        type="text"
                        value={data.hpFormula?.className || ''}
                        onChange={(e) => patchData({ hpFormula: { ...data.hpFormula, className: e.target.value } })}
                        className={inputCls + ' !w-16'}
                        placeholder="职业名"
                      />
                    </>
                  )}
                  {data.hpFormula?.ref === 'abilityModifier' && (
                    <select
                      value={data.hpFormula?.ability || ''}
                      onChange={(e) => patchData({ hpFormula: { ...data.hpFormula, ability: e.target.value } })}
                      className={selectCls + ' !w-auto flex-1 min-w-0'}
                    >
                      {abilityRefOptions.filter((o) => o.value).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                  <span className="text-gray-500 text-[10px]">×</span>
                  <input
                    type="number"
                    value={data.hpFormula?.mult ?? 1}
                    onChange={(e) => patchData({ hpFormula: { ...data.hpFormula, mult: Number(e.target.value) || 1 } })}
                    className={inputCls + ' !w-10'}
                  />
                </div>
              )}

              {/* 资源消耗 */}
              <div className="flex items-center gap-x-1.5">
                <span className={labelCls}>消耗</span>
                <select
                  value={data.resourceCostType}
                  onChange={(e) => patchData({ resourceCostType: e.target.value })}
                  className={selectCls + ' !w-auto flex-1 min-w-0'}
                >
                  <option value="">无</option>
                  <option value="wild_shape_uses">荒野变形次数</option>
                  <option value="spell_slot">法术位</option>
                  <option value="charges">充能次数</option>
                </select>
              </div>

              {/* 资源消耗详细 */}
              {data.resourceCostType === 'spell_slot' && (
                <div className="flex items-center gap-x-1.5 pl-2">
                  <span className={labelCls}>环位</span>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={data.resourceCostValue}
                    onChange={(e) => patchData({ resourceCostValue: Number(e.target.value) || 1 })}
                    className={inputCls + ' !w-12'}
                  />
                </div>
              )}
              {(data.resourceCostType === 'wild_shape_uses' || data.resourceCostType === 'charges') && (
                <div className="flex items-center gap-x-1.5 pl-2">
                  <span className={labelCls}>次数</span>
                  <input
                    type="number"
                    min={1}
                    value={data.resourceCostValue}
                    onChange={(e) => patchData({ resourceCostValue: Number(e.target.value) || 1 })}
                    className={inputCls + ' !w-12'}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 规范化护甲覆盖值 */
function normalizeArmorOverrideValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { base: 10, applyDexMod: true, maxDexBonus: null, extra: 0, shieldCompatible: false }
  }
  return {
    base: isFormulaValue(value.base) ? value.base : (Number(value.base) || 10),
    applyDexMod: value.applyDexMod !== false,
    maxDexBonus: Number(value.maxDexBonus) || null,
    extra: Number(value.extra) || 0,
    shieldCompatible: !!value.shieldCompatible,
  }
}

/** 规范化生物变身值 */
function normalizeCreatureTransformValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { creatureId: '', acMode: 'replace', acFormulaBase: 13, acFormulaAbility: '', hpMode: 'replace', hpFormula: null, keepAbilities: [], resourceCostType: '', resourceCostValue: 1, wildShapeMode: false, wildShapeSubclass: 'regular' }
  }
  const ka = Array.isArray(value.keepAbilities) ? value.keepAbilities.filter((k) => ['int', 'wis', 'cha'].includes(k)) : []
  return {
    creatureId: String(value.creatureId || ''),
    acMode: ['replace', 'add', 'max_formula'].includes(value.acMode) ? value.acMode : 'replace',
    acFormulaBase: Number(value.acFormulaBase) || 13,
    acFormulaAbility: ['dex', 'wis', 'con', 'str', 'int', 'cha'].includes(value.acFormulaAbility) ? value.acFormulaAbility : '',
    hpMode: ['replace', 'add', 'keep_plus_temp'].includes(value.hpMode) ? value.hpMode : 'replace',
    hpFormula: value.hpFormula && typeof value.hpFormula === 'object' ? value.hpFormula : null,
    keepAbilities: ka,
    resourceCostType: ['', 'wild_shape_uses', 'spell_slot', 'charges'].includes(value.resourceCostType) ? value.resourceCostType : '',
    resourceCostValue: Number(value.resourceCostValue) || 1,
    wildShapeMode: !!value.wildShapeMode,
    wildShapeSubclass: value.wildShapeSubclass === 'moon' ? 'moon' : 'regular',
  }
}

/** 规范化选择型 BUFF 值 */
function normalizeChoiceValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { choiceOptions: [{ name: '选项 A', effects: [] }], choiceSelected: 0 }
  }
  const opts = Array.isArray(value.choiceOptions) && value.choiceOptions.length > 0
    ? value.choiceOptions.map((o) => ({
        name: String(o?.name || '选项'),
        effects: Array.isArray(o?.effects) ? o.effects.map((e) => ({
          id: e.id || 'e_' + Math.random().toString(36).slice(2),
          category: e.category || '',
          effectType: e.effectType || '',
          scope: e.scope || 'global',
          scopeDetail: Array.isArray(e.scopeDetail) ? e.scopeDetail : [],
          value: e.value ?? 0,
          break20: e.break20 && typeof e.break20 === 'object' ? e.break20 : {},
          customText: typeof e.customText === 'string' ? e.customText : '',
        })) : [],
      }))
    : [{ name: '选项 A', effects: [] }]
  const sel = Number(value.choiceSelected) || 0
  return { choiceOptions: opts, choiceSelected: Math.min(Math.max(0, sel), opts.length - 1) }
}

/** 多选下拉：点击显示已选，展开后为复选框列表，选择感强 */
function MultiSelectDropdown({ options, selected, onChange, placeholder, id, className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const labels = selected.map((v) => options.find((o) => o.value === v)?.label ?? v).filter(Boolean)
  const display = labels.length > 0 ? labels.join('、') : placeholder
  return (
    <div ref={ref} className={className ?? 'relative min-w-0 max-w-[12rem]'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={inputClass + ' h-8 w-full flex items-center justify-between gap-1 text-left pr-7'}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate text-xs">{display}</span>
        <ChevronDown className={'w-4 h-4 shrink-0 absolute right-2 top-1/2 -translate-y-1/2 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 py-1.5 px-2 rounded-md border border-gray-600 bg-gray-800 shadow-lg" role="listbox">
          {options.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <label
                key={o.value}
                role="option"
                aria-selected={checked}
                className="flex items-center gap-2 cursor-pointer py-1 px-1.5 rounded hover:bg-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value)
                    onChange(next)
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-xs text-gray-300">{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 命中/伤害加值：variant=all 时单行 flex-wrap；global / weapons 供 BuffForm 分两行且第二行全宽顶格；hideWeaponAddButtons 时由外侧「局部生效」统一添加行 */
function AttackDamageBonusFields({ module, onChange, compactClass, inline, variant = 'all', hideWeaponAddButtons = false, referenceData }) {
  const obj = normalizeAttackDamageBonusModuleValue(module.value)
  const patch = (p) => onChange({ ...module, value: { ...obj, ...p } })
  const rows = obj.categoryRows || []
  const selectCls = inline
    ? `${compactClass} min-w-0 max-w-[5.75rem] pr-6 w-auto shrink-0`
    : `${inputClass} h-8 min-w-0 max-w-[6.5rem] pr-6 text-xs shrink-0`
  const chevCls = inline ? 'w-3 h-3 right-1.5' : 'w-4 h-4 right-2'
  const rowSelectCls = inline
    ? `${compactClass} min-w-0 flex-1 basis-[4.5rem] max-w-[min(100%,11rem)]`
    : `${inputClass} h-8 text-xs min-w-0 flex-1 basis-[5rem] max-w-[min(100%,14rem)]`
  const delBtnClass = inline
    ? 'h-7 w-7 shrink-0 rounded border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 flex items-center justify-center'
    : 'h-8 w-8 shrink-0 rounded border border-gray-600 text-gray-400 hover:bg-red-900/40 hover:text-red-400 flex items-center justify-center'
  const addIconBtnClass = inline
    ? 'h-7 w-7 shrink-0 rounded border border-amber-500/60 text-amber-400/90 hover:bg-amber-500/15 flex items-center justify-center'
    : 'h-8 w-8 shrink-0 rounded border border-amber-500/60 text-amber-400/90 hover:bg-amber-500/15 flex items-center justify-center'
  const stepperCompact = true
  const stepperNarrow = true

  const setRows = (nextRows) => patch({ categoryRows: nextRows })
  const updateRow = (id, field, v) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: v } : r)))
  }
  const removeRow = (id) => {
    setRows(rows.filter((r) => r.id !== id))
  }
  const addRow = () => setRows([...rows, newWeaponBonusRow('', 0)])

  const advantageBlock = (
    <div className="relative shrink-0">
      <select
        value={obj.advantage ?? ''}
        onChange={(e) => patch({ advantage: e.target.value })}
        className={selectCls}
        title="优势/劣势"
        aria-label="优势或劣势"
      >
        {ADVANTAGE_OPTIONS.map((o) => (
          <option key={o.value || 'n'} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className={`${chevCls} text-gray-400 absolute top-1/2 -translate-y-1/2 pointer-events-none`} />
    </div>
  )

  const weaponExtraTitle =
    '在全局加值之外，仅对所选武器类型或类别再叠加；可选近战/远程等或具体类别（如长剑）。'

  const globalTitle = `全局命中/伤害加值与优势/劣势。${weaponExtraTitle}`

  const globalBlock = (
    <>
      <span className="text-[10px] font-bold uppercase tracking-wider text-dnd-gold-light shrink-0">全局生效</span>
      <NumberStepper referenceData={referenceData}
        value={obj.val ?? 0}
        onChange={(v) => patch({ val: v })}
        compact={stepperCompact}
        narrow={stepperNarrow}
      />
      {advantageBlock}
    </>
  )

  const weaponRowsContent = (
    <>
      {rows.map((r, idx) => (
        <Fragment key={r.id}>
          <select
            value={r.key || ''}
            onChange={(e) => updateRow(r.id, 'key', e.target.value)}
            className={rowSelectCls}
            title={weaponExtraTitle}
            aria-label="武器类型或类别"
          >
            <option value="">— 选择武器 —</option>
            {WEAPON_BUFF_CATEGORY_SELECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <NumberStepper referenceData={referenceData}
            value={r.val ?? 0}
            onChange={(v) => updateRow(r.id, 'val', v)}
            compact={stepperCompact}
            narrow={stepperNarrow}
          />
          <button
            type="button"
            onClick={() => removeRow(r.id)}
            className={delBtnClass}
            title="删除此行"
            aria-label="删除此行"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {!hideWeaponAddButtons && idx === rows.length - 1 && (
            <button
              type="button"
              onClick={addRow}
              className={addIconBtnClass}
              title="添加武器限定行"
              aria-label="添加武器限定行"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </Fragment>
      ))}
      {!hideWeaponAddButtons && rows.length === 0 && (
        <button
          type="button"
          onClick={addRow}
          className={addIconBtnClass}
          title="添加武器限定行"
          aria-label="添加武器限定行"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </>
  )

  if (variant === 'global') {
    return (
      <div className="flex flex-wrap items-center gap-1 min-w-0 overflow-x-hidden" title={globalTitle}>
        {globalBlock}
      </div>
    )
  }
  if (variant === 'weapons') {
    return (
      <div
        className="flex flex-wrap items-center gap-1 min-w-0 w-full overflow-x-hidden"
        title={weaponExtraTitle}
      >
        {weaponRowsContent}
      </div>
    )
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 min-w-0 flex-1 basis-[min(100%,10rem)] overflow-x-hidden"
      title={globalTitle}
    >
      {globalBlock}
      {weaponRowsContent}
    </div>
  )
}

/** 单条效果的数值/选项编辑区；inline 时仅渲染紧凑控件（同一行用），无 label。可选 spellDC/spellAttackBonus 用于内含法术命中判断旁显示实际数值；useWandScrollTable 为真时改用魔杖/卷轴法强表按环阶显示 */
function EffectValueEditor({
  module,
  onChange,
  catData,
  inline,
  spellDC,
  spellAttackBonus,
  useWandScrollTable,
  /** 引用现有数据（角色属性、熟练加值等），供 NumberStepper 旁小按钮快速填入 */
  referenceData,
  /** 基于基础属性的引用数据，供 ability_score / ability_override 等效果使用 */
  baseReferenceData,
  /** 内含法术：仅第一行（法术名 / 环位 / 充能），隐藏命中、距离、伤害；用于制作队列新建等场景，细项在入库后背包编辑 */
  containedSpellPrimaryOnly = false,
  /** 内含法术第一行不显示「充能数」步进器（充能由表单其它控件统一提供，如制作工厂的「充能次数」） */
  containedSpellHideChargesInPrimary = false,
  /** 内含法术第一行「内含法术」文案前的序号（与内含法术同一 flex 行），如 "1." */
  containedSpellRowPrefix,
  /** 为真时不显示顶部的「选项」等区块标题（制作工厂等场景） */
  hideSectionLabel = false,
  /** 附属卡列表，供召唤效果选择 */
  subordinates = [],
}) {
  const [selectedSkillId, setSelectedSkillId] = useState(() => {
    const val = module?.value
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = SKILLS.find(sk => val[sk.id] != null && val[sk.id] !== 0)
      if (found) return found.id
    }
    return SKILLS[0]?.id ?? 'acrobatics'
  })
  const [selectedAbilityId, setSelectedAbilityId] = useState(() => {
    const val = module?.value
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = ABILITY_KEYS.find(k => val[k] != null && val[k] !== 0)
      if (found) return found
    }
    return ABILITY_KEYS[0] ?? 'str'
  })
  const [profSearch, setProfSearch] = useState('')
  const effects = catData?.effects ?? []
  const currentEffect = effects.find((e) => e.key === module.effectType)
  const isAbilityScoreEffect =
    currentEffect?.key === 'ability_override' ||
    currentEffect?.key === 'ability_score_uncapped'
  const effectiveReferenceData = referenceData?.length ? referenceData : DEFAULT_FORMULA_REFERENCE_DATA
  const activeReferenceData = isAbilityScoreEffect ? (baseReferenceData ?? effectiveReferenceData) : effectiveReferenceData
  const isBoolean = currentEffect?.dataType === 'boolean'
  const isText = currentEffect?.dataType === 'text'
  const isCustom = currentEffect?.key?.startsWith('custom_')
  const isNumber = currentEffect?.dataType === 'number'
  const needsSubSelect = currentEffect?.subSelect
  const isDamageTypeArray = needsSubSelect === 'damageType' && currentEffect?.dataType === 'array'
  const value = module.value
  const customText = module.customText ?? ''
  const textDisplay = typeof value === 'string' ? value : (isCustom ? customText : '')

  useEffect(() => {
    if (!['abilityScores', 'abilityScoresAndAdvantage'].includes(needsSubSelect)) return
    if (!(value && typeof value === 'object' && !Array.isArray(value))) return
    const preferred = ABILITY_KEYS.find((k) => value[k] != null && (typeof value[k] === 'object' || Number(value[k]) !== 0)) || ABILITY_KEYS.find((k) => value[k] != null)
    if (preferred && preferred !== selectedAbilityId) setSelectedAbilityId(preferred)
  }, [module.id, module.effectType, needsSubSelect])

  const compactClass = inputClass + ' h-8 text-xs'
  if (isBoolean) {
    if (inline) {
      return (
        <label className="flex items-center gap-1 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange({ ...module, value: e.target.checked })}
            className="rounded border-gray-600 bg-gray-800 text-dnd-red"
          />
          <span className="text-xs text-gray-400">启用</span>
        </label>
      )
    }
    return null
  }
  if (inline) {
    if (currentEffect?.key === 'attack_distance_range' || currentEffect?.key === 'base_speed_increment') {
      return (
        <>
          <div className="flex items-center gap-1.5 min-w-0">
            <NumberStepper referenceData={activeReferenceData}
              value={value}
              onChange={(v) => onChange({ ...module, value: v })}
              step={5}
              compact
            />
            <span className="text-xs text-gray-400 shrink-0">尺</span>
          </div>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'spell_range_extension') {
      return (
        <>
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange({ ...module, value: e.target.value })}
            placeholder="x2 或 +30"
            className={compactClass + ' w-full min-w-0'}
          />
          <div />
          <div />
        </>
      )
    }
    if (needsSubSelect === 'baseSpeedIncrement') {
      const isFormula = isFormulaValue(value)
      const obj = (value && typeof value === 'object' && !Array.isArray(value) && !isFormula)
        ? value
        : { walk: isFormula ? value : (typeof value === 'number' ? value : 0), fly: 0, swim: 0, climb: 0 }
      return (
        <>
          <div className="flex items-center gap-1.5 min-w-0">
            <NumberStepper referenceData={activeReferenceData}
              value={obj.walk ?? 0}
              onChange={(v) => onChange({ ...module, value: { ...obj, walk: v } })}
              step={5}
              compact
            />
            <span className="text-xs text-gray-400 shrink-0">尺（步行）</span>
          </div>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'attack_area' || needsSubSelect === 'attackAreaSize') {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { kind: 'radius', size: 0 }
      return (
        <>
          <select
            value={obj.kind || 'radius'}
            onChange={(e) => onChange({ ...module, value: { ...obj, kind: e.target.value || 'radius' } })}
            className={compactClass + ' w-full min-w-0 pr-4'}
          >
            <option value="radius">半径</option>
            <option value="diameter">直径</option>
          </select>
          <div className="flex items-center gap-1 min-w-0">
            <NumberStepper referenceData={activeReferenceData}
              value={obj.size}
              onChange={(v) => onChange({ ...module, value: { ...obj, size: v } })}
              step={5}
              compact
            />
            <span className="text-xs text-gray-400 shrink-0">尺</span>
          </div>
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'crit_range_expand') {
      const options = ['', '19-20', '18-20', '17-20', '16-20']
      return (
        <>
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange({ ...module, value: e.target.value })}
            className={compactClass + ' w-full min-w-0'}
          >
            <option value="">{'20'}</option>
            {options.filter((o) => o).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'crit_range_override') {
      const options = [19, 18, 17, 16]
      return (
        <>
          <select
            value={value || 19}
            onChange={(e) => onChange({ ...module, value: Number(e.target.value) })}
            className={compactClass + ' w-full min-w-0'}
          >
            {options.map((o) => (
              <option key={o} value={o}>{o}-20</option>
            ))}
          </select>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'crit_range_increment') {
      return (
        <>
          <NumberStepper
            value={value || 1}
            min={1}
            max={5}
            onChange={(v) => onChange({ ...module, value: v })}
            compact
            narrow
          />
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'spell_ability_attack') {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { ability: 'int' }
      return (
        <>
          <select
            value={obj.ability || 'int'}
            onChange={(e) => onChange({ ...module, value: { ...obj, ability: e.target.value || 'int' } })}
            className={compactClass + ' w-full min-w-0'}
          >
            <option value="int">智力</option>
            <option value="wis">感知</option>
            <option value="cha">魅力</option>
          </select>
          <div />
          <div />
        </>
      )
    }
    if (currentEffect?.key === 'extra_damage_dice' || needsSubSelect === 'damageDiceInline') {
      const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
      return (
        <>
          <div className="min-w-0 w-full">
            <DamageDiceInlineRow value={value} onChange={onChange} module={module} compact />
          </div>
          {currentEffect?.key === 'extra_damage_dice' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-300 col-span-full">
              <input
                type="checkbox"
                checked={!!raw.onlySpellDamage}
                onChange={(e) => onChange({ ...module, value: { ...raw, onlySpellDamage: e.target.checked } })}
                className="rounded border-gray-600 bg-gray-800 text-dnd-red"
              />
              仅法术伤害生效
            </label>
          )}
        </>
      )
    }
    if (isText || isCustom) {
      return (
        <>
          <input
            type="text"
            value={isCustom ? customText : textDisplay}
            onChange={(e) => onChange(isCustom ? { ...module, customText: e.target.value } : { ...module, value: e.target.value })}
            placeholder={isCustom ? '描述...' : '填写...'}
            className={compactClass + ' w-full min-w-0'}
          />
        </>
      )
    }
    if (needsSubSelect === 'abilityScores') {
      const isUncapped = currentEffect?.key === 'ability_score_uncapped'
      const breakObj = module.break20 && typeof module.break20 === 'object' && !Array.isArray(module.break20) ? module.break20 : {}
      const setBreak20 = (k, checked) => {
        const next = { ...breakObj, [k]: checked }
        if (!checked) delete next[k]
        onChange({ ...module, break20: next })
      }
      const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? value : {}
      const selectedAbilities = ABILITY_KEYS.filter(k => valueObj[k] != null)
      const allChecked = ABILITY_KEYS.every(k => valueObj[k] != null)
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 items-center">
            {ABILITY_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-0.5 text-[10px] text-gray-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={valueObj[k] != null}
                  onChange={(e) => {
                    const base = { ...valueObj }
                    if (e.target.checked) base[k] = 0
                    else delete base[k]
                    onChange({ ...module, value: base })
                  }}
                  className="w-2.5 h-2.5 accent-dnd-red"
                />
                {ABILITY_LABELS[k]}
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                if (allChecked) {
                  onChange({ ...module, value: {} })
                } else {
                  const base = {}
                  ABILITY_KEYS.forEach(k => { base[k] = valueObj[k] ?? 0 })
                  onChange({ ...module, value: base })
                }
              }}
              className="text-[10px] text-dnd-gold-light/70 hover:text-dnd-gold-light"
            >
              {allChecked ? '取消全选' : '全属性'}
            </button>
          </div>
          {selectedAbilities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {selectedAbilities.map((k) => (
                <div key={k} className="flex items-center gap-0.5">
                  <span className="text-[10px] text-dnd-gold-light/80">{ABILITY_LABELS[k]}</span>
                  <NumberStepper referenceData={activeReferenceData}
                    value={valueObj[k] ?? 0}
                    onChange={(v) => onChange({ ...module, value: { ...valueObj, [k]: v } })}
                    compact
                    narrow
                  />
                  {isUncapped && (
                    <label className="flex items-center gap-0.5 cursor-pointer text-[9px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={!!breakObj[k]}
                        onChange={(e) => setBreak20(k, e.target.checked)}
                        className="w-2.5 h-2.5 rounded border-gray-600 bg-gray-800 text-dnd-red"
                      />
                      破20
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    if (needsSubSelect === 'abilityProficiency') {
      const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
      // 迁移：旧数字值（非零）视为 true
      const toBool = (v) => {
        if (typeof v === 'boolean') return v
        if (typeof v === 'number') return v !== 0
        return !!v
      }
      return (
        <div className="flex flex-wrap gap-2 min-w-0">
          {ABILITY_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-1 cursor-pointer text-xs text-gray-200">
              <input
                type="checkbox"
                checked={toBool(obj[k])}
                onChange={(e) => {
                  const next = { ...obj, [k]: e.target.checked }
                  onChange({ ...module, value: next })
                }}
                className="rounded border-gray-600 bg-gray-800 text-dnd-red"
              />
              {ABILITY_LABELS[k]}
            </label>
          ))}
        </div>
      )
    }
    if (needsSubSelect === 'abilityScoresAndAdvantage') {
      const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? value : {}
      const labels = module.effectType === 'save_bonus' ? SAVE_NAMES : ABILITY_LABELS
      const selectedAbilities = ABILITY_KEYS.filter(k => valueObj[k] != null)
      const allChecked = ABILITY_KEYS.every(k => valueObj[k] != null)
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 items-center">
            {ABILITY_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-0.5 text-[10px] text-gray-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={valueObj[k] != null}
                  onChange={(e) => {
                    const base = { ...valueObj }
                    if (e.target.checked) base[k] = 0
                    else delete base[k]
                    onChange({ ...module, value: base })
                  }}
                  className="w-2.5 h-2.5 accent-dnd-red"
                />
                {labels[k]}
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                if (allChecked) {
                  const base = {}
                  if (valueObj.advantage) base.advantage = valueObj.advantage
                  onChange({ ...module, value: base })
                } else {
                  const base = {}
                  ABILITY_KEYS.forEach(k => { base[k] = valueObj[k] ?? 0 })
                  if (valueObj.advantage) base.advantage = valueObj.advantage
                  onChange({ ...module, value: base })
                }
              }}
              className="text-[10px] text-dnd-gold-light/70 hover:text-dnd-gold-light"
            >
              {allChecked ? '取消全选' : '全属性'}
            </button>
          </div>
          {selectedAbilities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {selectedAbilities.map((k) => (
                <div key={k} className="flex items-center gap-0.5">
                  <span className="text-[10px] text-dnd-gold-light/80">{labels[k]}</span>
                  <NumberStepper referenceData={activeReferenceData}
                    value={valueObj[k] ?? 0}
                    onChange={(v) => onChange({ ...module, value: { ...valueObj, [k]: v } })}
                    compact
                    narrow
                  />
                </div>
              ))}
              <select
                value={valueObj.advantage ?? ''}
                onChange={(e) => onChange({ ...module, value: { ...valueObj, advantage: e.target.value } })}
                className={compactClass + ' h-7 min-w-[4.5rem]'}
              >
                {ADVANTAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )
    }
    if (needsSubSelect === 'skillsAndAdvantage') {
      const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? value : {}
      const selectedSkills = SKILLS.filter(sk => valueObj[sk.id] != null)
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
            {SKILLS.map((sk) => (
              <label key={sk.id} className="flex items-center gap-0.5 text-[10px] text-gray-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={valueObj[sk.id] != null}
                  onChange={(e) => {
                    const base = { ...valueObj }
                    if (e.target.checked) {
                      base[sk.id] = 0
                    } else {
                      delete base[sk.id]
                    }
                    onChange({ ...module, value: base })
                  }}
                  className="w-2.5 h-2.5 accent-dnd-red"
                />
                {sk.name}
              </label>
            ))}
          </div>
          {selectedSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {selectedSkills.map((sk) => (
                <div key={sk.id} className="flex items-center gap-0.5">
                  <span className="text-[10px] text-dnd-gold-light/80">{sk.name}</span>
                  <NumberStepper referenceData={activeReferenceData}
                    value={valueObj[sk.id] ?? 0}
                    onChange={(v) => onChange({ ...module, value: { ...valueObj, [sk.id]: v } })}
                    compact
                    narrow
                  />
                </div>
              ))}
              <select
                value={valueObj.advantage ?? ''}
                onChange={(e) => onChange({ ...module, value: { ...valueObj, advantage: e.target.value } })}
                className={compactClass + ' h-7 min-w-[4.5rem]'}
              >
                {ADVANTAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )
    }
    if (currentEffect?.key === 'crit_extra_dice') {
      return (
        <div className="min-w-0 w-full flex flex-col gap-0.5">
          <NumberStepper
            value={value}
            min={2}
            max={10}
            onChange={(v) => onChange({ ...module, value: v })}
            compact
            narrow
          />
          <p className="text-[10px] leading-tight text-gray-500">仅本件物品生效；各武器重击倍数互不串用；Buff 栏此项不参与投掷；法术重击×2</p>
        </div>
      )
    }
    if (currentEffect?.key === 'spell_ability_attack') {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { ability: 'int' }
      return (
        <div className="min-w-0 w-full">
          <select
            value={obj.ability || 'int'}
            onChange={(e) => onChange({ ...module, value: { ...obj, ability: e.target.value || 'int' } })}
            className={compactClass + ' w-full min-w-0'}
          >
            <option value="int">智力</option>
            <option value="wis">感知</option>
            <option value="cha">魅力</option>
          </select>
        </div>
      )
    }
    if (isNumber) {
      return (
        <>
          <div className="min-w-0">
            <NumberStepper referenceData={activeReferenceData}
              value={value}
              onChange={(v) => onChange({ ...module, value: v })}
              compact
            />
          </div>
          <div />
          <div />
        </>
      )
    }
    if (needsSubSelect === 'damageType' && !isDamageTypeArray) {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { type: 'bludgeoning', val: 0 }
      return (
        <>
          <select
            value={obj.type || 'bludgeoning'}
            onChange={(e) => onChange({ ...module, value: { ...obj, type: e.target.value } })}
            className={compactClass + ' w-full min-w-0'}
          >
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <div className="min-w-0">
            <NumberStepper referenceData={activeReferenceData}
              value={obj.val}
              onChange={(v) => onChange({ ...module, value: { ...obj, val: v } })}
              compact
            />
          </div>
          <div />
        </>
      )
    }
    const numAdvVal = typeof value === 'object' && value && !Array.isArray(value) ? value : { val: typeof value === 'number' ? value : 0, advantage: '' }
    if (needsSubSelect === 'numberAndAdvantage') {
      return (
        <div className="flex items-center gap-1.5 flex-nowrap">
          <NumberStepper referenceData={activeReferenceData}
            value={numAdvVal.val ?? 0}
            onChange={(v) => onChange({ ...module, value: { ...numAdvVal, val: v } })}
            compact
          />
          <div className="relative shrink-0">
            <select
              value={numAdvVal.advantage ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...numAdvVal, advantage: e.target.value } })}
              className={compactClass + ' min-w-[5.5rem] w-auto pr-6'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )
    }
    if (needsSubSelect === 'flightSpeed') {
      const fs = typeof value === 'object' && value && !Array.isArray(value) ? value : { speed: typeof value === 'number' ? value : 0, hover: false }
      return (
        <div className="flex items-center gap-1.5">
          <NumberStepper referenceData={activeReferenceData}
            value={fs.speed}
            onChange={(v) => onChange({ ...module, value: { ...fs, speed: v } })}
            step={5}
            compact
          />
          <span className="text-gray-500 text-xs">尺</span>
          <label className="flex items-center gap-1 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={!!fs.hover}
              onChange={(e) => onChange({ ...module, value: { ...fs, hover: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-xs text-gray-400">悬浮</span>
          </label>
        </div>
      )
    }
    if (needsSubSelect === 'initBonusAndProficiency') {
      const ib = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : { bonus: typeof value === 'number' ? value : 0, proficient: false }
      return (
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
          <NumberStepper referenceData={activeReferenceData}
            value={ib.bonus}
            onChange={(v) => onChange({ ...module, value: { ...ib, bonus: v } })}
            compact
          />
          <label className="flex items-center gap-1 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={!!ib.proficient}
              onChange={(e) => onChange({ ...module, value: { ...ib, proficient: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-xs text-gray-400">先攻熟练</span>
          </label>
        </div>
      )
    }
    if (isComplexValueType(currentEffect)) return null
    return null
  }

  if (currentEffect?.key === 'crit_range_expand') {
    const options = ['', '19-20', '18-20', '17-20', '16-20']
    return (
      <div className="flex items-center gap-2">
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange({ ...module, value: e.target.value })}
          className={inputClass + ' min-w-[7rem]'}
        >
          <option value="">{'20'}</option>
          {options.filter((o) => o).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    )
  }
  if (currentEffect?.key === 'crit_range_override') {
    const options = [19, 18, 17, 16]
    return (
      <div className="flex items-center gap-2">
        <select
          value={value || 19}
          onChange={(e) => onChange({ ...module, value: Number(e.target.value) })}
          className={inputClass + ' min-w-[7rem]'}
        >
          {options.map((o) => (
            <option key={o} value={o}>{o}-20</option>
          ))}
        </select>
        <span className="text-xs text-gray-500">覆盖，多个取最低</span>
      </div>
    )
  }
  if (currentEffect?.key === 'crit_range_increment') {
    return (
      <div className="flex items-center gap-2">
        <NumberStepper
          value={value || 1}
          min={1}
          max={5}
          onChange={(v) => onChange({ ...module, value: v })}
          compact={false}
        />
        <span className="text-xs text-gray-500">可叠加</span>
      </div>
    )
  }

  if (currentEffect?.key === 'extra_damage_dice' || needsSubSelect === 'damageDiceInline') {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return (
      <div className="space-y-1">
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">伤害骰</label>
        <DamageDiceInlineRow value={value} onChange={onChange} module={module} compact={false} />
        {currentEffect?.key === 'extra_damage_dice' && (
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
            <input
              type="checkbox"
              checked={!!raw.onlySpellDamage}
              onChange={(e) => onChange({ ...module, value: { ...raw, onlySpellDamage: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            仅法术伤害生效
          </label>
        )}
      </div>
    )
  }

  if (currentEffect?.key === 'attack_area' || needsSubSelect === 'attackAreaSize') {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { kind: 'radius', size: 0 }
    return (
      <div className="space-y-0.5">
        {!hideSectionLabel && (
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">范围</label>
        )}
        <div className="flex items-center gap-2">
          <select
            value={obj.kind || 'radius'}
            onChange={(e) => onChange({ ...module, value: { ...obj, kind: e.target.value || 'radius' } })}
            className={inputClass + ' min-w-[6rem]'}
          >
            <option value="radius">半径</option>
            <option value="diameter">直径</option>
          </select>
          <NumberStepper referenceData={activeReferenceData}
            value={obj.size}
            onChange={(v) => onChange({ ...module, value: { ...obj, size: v } })}
            step={5}
          />
          <span className="text-gray-500 text-xs">尺</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {!hideSectionLabel && (
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5 leading-none">
          {isCustom ? '效果描述' : isText ? '填写内容' : isBoolean ? '开关' : isNumber ? '数字输入' : '选项'}
        </label>
      )}
      {isBoolean ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange({ ...module, value: e.target.checked })}
            className="rounded border-gray-600 bg-gray-800 text-dnd-red"
          />
          <span className="text-xs text-gray-300">启用</span>
        </label>
      ) : isText && !isCustom ? (
        <input
          type="text"
          value={textDisplay}
          onChange={(e) => onChange({ ...module, value: e.target.value })}
          placeholder="按说明填写..."
          className={inputClass}
        />
      ) : isCustom ? (
        <textarea
          value={customText}
          onChange={(e) => onChange({ ...module, customText: e.target.value })}
          placeholder="自由填写规则描述..."
          rows={2}
          className={textareaClass}
        />
      ) : currentEffect?.key === 'crit_extra_dice' ? (
        <div className="space-y-1">
          <NumberStepper
            value={value}
            min={2}
            max={10}
            onChange={(v) => onChange({ ...module, value: v })}
            compact={false}
          />
          <p className="text-xs text-gray-500">写在装备上时：只影响「这一件」武器的战斗快捷投掷，其它已装备武器上的暴击×不会串到本武器。角色 Buff 栏此项不生效。法术重击始终×2。武器加值仍只加一次。</p>
        </div>
      ) : isNumber ? (
        <div className="flex items-center gap-2">
          <NumberStepper referenceData={activeReferenceData}
            value={value}
            onChange={(v) => onChange({ ...module, value: v })}
            compact={false}
          />
          {(currentEffect?.key === 'attack_distance_range' || currentEffect?.key === 'base_speed_increment') && (
            <span className="text-gray-500 text-xs">尺</span>
          )}
        </div>
      ) : isDamageTypeArray ? (
        <div className="flex flex-wrap gap-2">
          {DAMAGE_TYPES.map((d) => {
            const arr = Array.isArray(value) ? value : []
            const checked = arr.includes(d.value)
            return (
              <label key={d.value} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...arr, d.value] : arr.filter((x) => x !== d.value)
                    onChange({ ...module, value: next })
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-xs text-gray-300">{d.label}</span>
              </label>
            )
          })}
        </div>
      ) : needsSubSelect === 'damageType' ? (
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={(typeof value === 'object' && value?.type) || 'bludgeoning'}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), type: e.target.value } })}
            className={inputClass + ' min-w-[8rem]'}
          >
            {DAMAGE_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <NumberStepper referenceData={activeReferenceData}
            value={(typeof value === 'object' && value?.val) ?? 0}
            onChange={(v) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: v } })}
          />
        </div>
      ) : needsSubSelect === 'condition' ? (
        <div className="flex flex-wrap gap-2">
          {CONDITION_OPTIONS.map((c) => {
            const arr = Array.isArray(value) ? value : []
            const checked = arr.includes(c.value)
            return (
              <label key={c.value} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...arr, c.value] : arr.filter((x) => x !== c.value)
                    onChange({ ...module, value: next })
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-xs text-gray-300">{c.label}</span>
              </label>
            )
          })}
        </div>
      ) : needsSubSelect === 'proficiencyChecklist' ? (
        (() => {
          const optKey = currentEffect?.proficiencyOptions
          const allOptions =
            optKey === 'armor' ? ARMOR_PROFICIENCY_OPTIONS :
            optKey === 'weapon' ? WEAPON_PROFICIENCY_OPTIONS :
            optKey === 'vehicle' ? VEHICLE_PROFICIENCY_OPTIONS :
            optKey === 'instrument' ? INSTRUMENT_PROFICIENCY_OPTIONS :
            optKey === 'tool' ? TOOL_PROFICIENCY_OPTIONS :
            optKey === 'toolAndInstrument' ? [...TOOL_PROFICIENCY_OPTIONS, ...INSTRUMENT_PROFICIENCY_OPTIONS] :
            optKey === 'language' ? LANGUAGE_PROFICIENCY_OPTIONS :
            optKey === 'weaponMastery' ? WEAPON_MASTERY_OPTIONS :
            []
          const arr = Array.isArray(value) ? value : []
          const filter = profSearch.trim().toLowerCase()
          const filtered = filter ? allOptions.filter((o) => o.label.toLowerCase().includes(filter)) : allOptions
          return (
            <div className="space-y-1.5">
              {/* 搜索 + 已选计数 */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    value={profSearch}
                    onChange={(e) => setProfSearch(e.target.value)}
                    placeholder="搜索..."
                    className={inputClass + ' h-6 text-xs w-full pl-2 pr-6'}
                  />
                  {profSearch && (
                    <button type="button" onClick={() => setProfSearch('')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-gray-500 whitespace-nowrap">已选 {arr.length}</span>
              </div>
              {/* 已选项标签 */}
              {arr.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {arr.map((v) => {
                    const opt = allOptions.find((o) => o.value === v)
                    if (!opt) return null
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onChange({ ...module, value: arr.filter((x) => x !== v) })}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] hover:bg-amber-500/25 transition-colors"
                      >
                        {opt.label}
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )
                  })}
                </div>
              )}
              {/* 过滤后的选项列表 */}
              <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {filtered.length === 0 ? (
                  <p className="text-gray-500 text-[10px] text-center py-1">无匹配项</p>
                ) : (
                  filtered.map((o) => {
                    const checked = arr.includes(o.value)
                    return (
                      <label key={o.value} className="flex items-center gap-1.5 cursor-pointer px-1 py-0.5 rounded hover:bg-white/[0.03] transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value)
                            onChange({ ...module, value: next })
                          }}
                          className="rounded border-gray-600 bg-gray-800 text-dnd-red w-3.5 h-3.5"
                        />
                        <span className={`text-xs ${checked ? 'text-gray-200' : 'text-gray-400'}`}>{o.label}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          )
        })()
      ) : needsSubSelect === 'damagePiercingTraits' ? (
        (() => {
          const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : { selected: Array.isArray(value) ? value : [], element: [], alignment: [] }
          const selected = obj.selected ?? []
          const pierceArr = Array.isArray(obj.pierce)
            ? obj.pierce
            : [...(Array.isArray(obj.element) ? obj.element : []), ...(Array.isArray(obj.alignment) ? obj.alignment : [])]
          const hasPierce = selected.includes('pierce') || selected.includes('element') || selected.includes('alignment')
          const sel = (k) => selected.includes(k)
          const toggle = (k, checked) => (checked ? [...selected, k] : selected.filter((x) => x !== k))
          const rowClass = 'grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-0 min-w-0'
          const labelClass = 'flex items-center gap-1.5 cursor-pointer whitespace-nowrap'
          return (
            <div className="flex flex-col gap-1">
              <div className={rowClass}>
                <label className={labelClass}>
                  <input
                    type="checkbox"
                    checked={sel('magic')}
                    onChange={(e) => onChange({ ...module, value: { ...obj, selected: toggle('magic', e.target.checked) } })}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red shrink-0"
                  />
                  <span className="text-xs text-gray-300">视为魔法</span>
                </label>
                <label className={labelClass}>
                  <input
                    type="checkbox"
                    checked={hasPierce}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected.filter((x) => x !== 'element' && x !== 'alignment'), 'pierce'] : selected.filter((x) => x !== 'pierce' && x !== 'element' && x !== 'alignment')
                      onChange({ ...module, value: { ...obj, selected: next, pierce: e.target.checked ? pierceArr : [] } })
                    }}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red shrink-0"
                  />
                  <span className="text-xs text-gray-300">忽略伤害抗性</span>
                </label>
                {hasPierce ? (
                  <MultiSelectDropdown
                    id="pierce"
                    options={PIERCING_DAMAGE_OPTIONS}
                    selected={pierceArr}
                    onChange={(next) => onChange({ ...module, value: { ...obj, pierce: next } })}
                    placeholder="选择忽视抗性"
                  />
                ) : (
                  <span />
                )}
              </div>
              <div className={rowClass}>
                <label className={labelClass}>
                  <input
                    type="checkbox"
                    checked={sel('silver')}
                    onChange={(e) => onChange({ ...module, value: { ...obj, selected: toggle('silver', e.target.checked) } })}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red shrink-0"
                  />
                  <span className="text-xs text-gray-300">视为银质</span>
                </label>
                <span />
                <span />
              </div>
            </div>
          )
        })()
      ) : needsSubSelect === 'numberAndAdvantage' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <NumberStepper referenceData={activeReferenceData}
            value={(typeof value === 'object' && value && 'val' in value ? value.val : (typeof value === 'number' ? value : 0)) ?? 0}
            onChange={(v) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), val: v } })}
            compact
          />
          <div className="relative">
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={inputClass + ' min-w-[6rem] pr-6'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      ) : needsSubSelect === 'flightSpeed' ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <NumberStepper referenceData={activeReferenceData}
              value={(typeof value === 'object' && value && 'speed' in value ? value.speed : (typeof value === 'number' ? value : 0)) ?? 0}
              onChange={(v) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), speed: v } })}
              step={5}
            />
            <span className="text-gray-500 text-xs">尺</span>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={!!(typeof value === 'object' && value && value.hover)}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), hover: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-xs text-gray-300">是否悬浮</span>
          </label>
        </div>
      ) : needsSubSelect === 'baseSpeedIncrement' ? (
        <div className="space-y-1.5">
          {(() => {
            const isFormula = isFormulaValue(value)
            const obj = (value && typeof value === 'object' && !Array.isArray(value) && !isFormula)
              ? value
              : { walk: isFormula ? value : (typeof value === 'number' ? value : 0), fly: 0, swim: 0, climb: 0 }
            const fields = [
              { key: 'walk', label: '步行' },
              { key: 'fly', label: '飞行' },
              { key: 'swim', label: '游泳' },
              { key: 'climb', label: '攀爬' },
            ]
            return fields.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-gray-300 w-12">{label}</span>
                <NumberStepper referenceData={activeReferenceData}
                  value={obj[key] ?? 0}
                  onChange={(v) => onChange({ ...module, value: { ...obj, [key]: v } })}
                  step={5}
                />
                <span className="text-gray-500 text-xs">尺</span>
              </div>
            ))
          })()}
        </div>
      ) : needsSubSelect === 'initBonusAndProficiency' ? (
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const ib = value && typeof value === 'object' && !Array.isArray(value)
              ? value
              : { bonus: typeof value === 'number' ? value : 0, proficient: false }
            return (
              <>
                <NumberStepper referenceData={activeReferenceData}
                  value={ib.bonus}
                  onChange={(v) => onChange({ ...module, value: { ...ib, bonus: v } })}
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!ib.proficient}
                    onChange={(e) => onChange({ ...module, value: { ...ib, proficient: e.target.checked } })}
                    className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                  />
                  <span className="text-xs text-gray-300">先攻获得熟练加值（PB）</span>
                </label>
              </>
            )
          })()}
        </div>
      ) : needsSubSelect === 'abilityScores' ? (() => {
        const isUncapped = currentEffect?.key === 'ability_score_uncapped'
        const breakObj = module.break20 && typeof module.break20 === 'object' && !Array.isArray(module.break20) ? module.break20 : {}
        const setBreak20 = (k, checked) => {
          const next = { ...breakObj, [k]: checked }
          if (!checked) delete next[k]
          onChange({ ...module, break20: next })
        }
        const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? value : {}
        const selectedAbilities = ABILITY_KEYS.filter(k => valueObj[k] != null)
        const allChecked = ABILITY_KEYS.every(k => valueObj[k] != null)
        return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
            {ABILITY_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={valueObj[k] != null}
                  onChange={(e) => {
                    const base = { ...valueObj }
                    if (e.target.checked) base[k] = 0
                    else delete base[k]
                    onChange({ ...module, value: base })
                  }}
                  className="w-3 h-3 accent-dnd-red"
                />
                {ABILITY_LABELS[k]}
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                if (allChecked) {
                  onChange({ ...module, value: {} })
                } else {
                  const base = {}
                  ABILITY_KEYS.forEach(k => { base[k] = valueObj[k] ?? 0 })
                  onChange({ ...module, value: base })
                }
              }}
              className="text-xs text-dnd-gold-light/70 hover:text-dnd-gold-light"
            >
              {allChecked ? '取消全选' : '全属性'}
            </button>
          </div>
          {selectedAbilities.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {selectedAbilities.map((k) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="text-xs text-dnd-gold-light/80">{ABILITY_LABELS[k]}</span>
                  <NumberStepper referenceData={activeReferenceData}
                    value={valueObj[k] ?? 0}
                    onChange={(v) => onChange({ ...module, value: { ...valueObj, [k]: v } })}
                    compact
                  />
                  {isUncapped && (
                    <label className="flex items-center gap-0.5 cursor-pointer text-[10px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={!!breakObj[k]}
                        onChange={(e) => setBreak20(k, e.target.checked)}
                        className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-dnd-red"
                      />
                      破20
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )
      })() : needsSubSelect === 'abilityProficiency' ? (
        <div className="flex flex-wrap gap-2">
          {ABILITY_KEYS.map((k) => {
            const toBool = (v) => {
              if (typeof v === 'boolean') return v
              if (typeof v === 'number') return v !== 0
              return !!v
            }
            const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
            return (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={toBool(obj[k])}
                  onChange={(e) => onChange({ ...module, value: { ...obj, [k]: e.target.checked } })}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-xs text-gray-300">{ABILITY_LABELS[k]}</span>
              </label>
            )
          })}
        </div>
      ) : needsSubSelect === 'spellAbilityForAttack' ? (
        <div className="flex items-center gap-2">
          <select
            value={(value && typeof value === 'object' && !Array.isArray(value) ? value.ability : 'int') || 'int'}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), ability: e.target.value || 'int' } })}
            className={inputClass + ' h-8 min-w-[6rem]'}
          >
            <option value="int">智力</option>
            <option value="wis">感知</option>
            <option value="cha">魅力</option>
          </select>
        </div>
      ) : needsSubSelect === 'abilityScoresAndAdvantage' ? (() => {
        const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? value : {}
        const labels = module.effectType === 'save_bonus' ? SAVE_NAMES : ABILITY_LABELS
        const selectedAbilities = ABILITY_KEYS.filter(k => valueObj[k] != null)
        const allChecked = ABILITY_KEYS.every(k => valueObj[k] != null)
        return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
            {ABILITY_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={valueObj[k] != null}
                  onChange={(e) => {
                    const base = { ...valueObj }
                    if (e.target.checked) base[k] = 0
                    else delete base[k]
                    onChange({ ...module, value: base })
                  }}
                  className="w-3 h-3 accent-dnd-red"
                />
                {labels[k]}
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                if (allChecked) {
                  const base = {}
                  if (valueObj.advantage) base.advantage = valueObj.advantage
                  onChange({ ...module, value: base })
                } else {
                  const base = {}
                  ABILITY_KEYS.forEach(k => { base[k] = valueObj[k] ?? 0 })
                  if (valueObj.advantage) base.advantage = valueObj.advantage
                  onChange({ ...module, value: base })
                }
              }}
              className="text-xs text-dnd-gold-light/70 hover:text-dnd-gold-light"
            >
              {allChecked ? '取消全选' : '全属性'}
            </button>
          </div>
          {selectedAbilities.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {selectedAbilities.map((k) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="text-xs text-dnd-gold-light/80">{labels[k]}</span>
                  <NumberStepper referenceData={activeReferenceData}
                    value={valueObj[k] ?? 0}
                    onChange={(v) => onChange({ ...module, value: { ...valueObj, [k]: v } })}
                    compact
                  />
                </div>
              ))}
              <span className="text-gray-400 text-xs shrink-0">优势/劣势</span>
              <select
                value={valueObj.advantage ?? ''}
                onChange={(e) => onChange({ ...module, value: { ...valueObj, advantage: e.target.value } })}
                className={inputClass + ' h-8 min-w-[6rem]'}
              >
                {ADVANTAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        )
      })() : needsSubSelect === 'skillsAndAdvantage' ? (() => {
        const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? value : {}
        const selectedSkills = SKILLS.filter(sk => valueObj[sk.id] != null)
        return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {SKILLS.map((sk) => (
              <label key={sk.id} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={valueObj[sk.id] != null}
                  onChange={(e) => {
                    const base = { ...valueObj }
                    if (e.target.checked) {
                      base[sk.id] = 0
                    } else {
                      delete base[sk.id]
                    }
                    onChange({ ...module, value: base })
                  }}
                  className="w-3 h-3 accent-dnd-red"
                />
                {sk.name}
              </label>
            ))}
          </div>
          {selectedSkills.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              {selectedSkills.map((sk) => (
                <div key={sk.id} className="flex items-center gap-1">
                  <span className="text-xs text-dnd-gold-light/80">{sk.name}</span>
                  <NumberStepper referenceData={activeReferenceData}
                    value={valueObj[sk.id] ?? 0}
                    onChange={(v) => onChange({ ...module, value: { ...valueObj, [sk.id]: v } })}
                    compact
                  />
                </div>
              ))}
              <span className="text-gray-400 text-xs shrink-0">优势/劣势</span>
              <select
                value={valueObj.advantage ?? ''}
                onChange={(e) => onChange({ ...module, value: { ...valueObj, advantage: e.target.value } })}
                className={inputClass + ' h-8 min-w-[6rem]'}
              >
                {ADVANTAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        )
      })() : needsSubSelect === 'spellDamageBonus' ? (
        <SpellDamageBonusEditor
          value={value}
          onChange={(v) => onChange({ ...module, value: v })}
          referenceData={activeReferenceData}
        />
      ) : needsSubSelect === 'containedSpell' ? (
        <ContainedSpellEditor
          module={module}
          onChange={onChange}
          spellDC={spellDC}
          spellAttackBonus={spellAttackBonus}
          useWandScrollTable={useWandScrollTable}
          primaryOnly={containedSpellPrimaryOnly}
          hideCharges={containedSpellHideChargesInPrimary}
          rowPrefix={containedSpellRowPrefix}
        />
      ) : needsSubSelect === 'chargeRecovery' ? (
        <ChargeRecoveryEditor
          value={value}
          onChange={(v) => onChange({ ...module, value: v })}
        />
      ) : needsSubSelect === 'chargeItem' ? (
        <ChargeItemEditor
          module={module}
          onChange={onChange}
          spellDC={spellDC}
          spellAttackBonus={spellAttackBonus}
          useWandScrollTable={useWandScrollTable}
          referenceData={referenceData}
          baseReferenceData={baseReferenceData}
          subordinates={subordinates}
        />
      ) : needsSubSelect === 'armorOverride' ? (
        <ArmorOverrideEditor
          value={value}
          onChange={(v) => onChange({ ...module, value: v })}
          referenceData={activeReferenceData}
        />
      ) : needsSubSelect === 'creatureTransform' ? (
        <CreatureTransformEditor
          value={value}
          onChange={(v) => onChange({ ...module, value: v })}
        />
      ) : needsSubSelect === 'restoreSpellSlots' ? (
        <RestoreSpellSlotsEditor
          module={module}
          onChange={onChange}
        />
      ) : needsSubSelect === 'choice' ? (
        <ChoiceBUFFEditor
          choiceOptions={value?.choiceOptions}
          choiceSelected={value?.choiceSelected}
          onChange={(v) => onChange({ ...module, value: v })}
        />
      ) : needsSubSelect === 'damageTypeRelation' ? (
        (() => {
          const rel = value && typeof value === 'object' ? value : {}
          const relation = rel.relation || 'resist'
          const types = Array.isArray(rel.types) ? rel.types : []
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">关系类型</span>
                <select
                  value={relation}
                  onChange={(e) => onChange({ ...module, value: { ...rel, relation: e.target.value } })}
                  className={inputClass + ' !py-1 text-xs'}
                >
                  {DAMAGE_RELATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {DAMAGE_TYPES.map((dt) => {
                  const checked = types.includes(dt.value)
                  return (
                    <label key={dt.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...types, dt.value] : types.filter((x) => x !== dt.value)
                          onChange({ ...module, value: { ...rel, types: next } })
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                      />
                      <span className="text-xs text-gray-300">{dt.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })()
      ) : needsSubSelect === 'damageReductionTyped' ? (
        (() => {
          const dv = value && typeof value === 'object' ? value : {}
          const types = Array.isArray(dv.types) ? dv.types : []
          const reduction = dv.reduction != null ? Number(dv.reduction) || 0 : 0
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">减免量</span>
                <input
                  type="number"
                  value={reduction}
                  onChange={(e) => onChange({ ...module, value: { ...dv, reduction: Number(e.target.value) || 0 } })}
                  className={inputClass + ' !py-1 !w-20 text-xs'}
                  min={0}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {DAMAGE_TYPES.map((dt) => {
                  const checked = types.includes(dt.value)
                  return (
                    <label key={dt.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...types, dt.value] : types.filter((x) => x !== dt.value)
                          onChange({ ...module, value: { ...dv, types: next } })
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                      />
                      <span className="text-xs text-gray-300">{dt.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })()
      ) : needsSubSelect === 'specialSenses' ? (
        (() => {
          const sv = value && typeof value === 'object' ? value : {}
          const senses = Array.isArray(sv.senses) ? sv.senses : []
          const range = sv.range != null ? sv.range : 60
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">范围（尺）</span>
                <input
                  type="number"
                  value={range}
                  onChange={(e) => onChange({ ...module, value: { ...sv, range: Number(e.target.value) || 0 } })}
                  className={inputClass + ' !py-1 !w-20 text-xs'}
                  min={0}
                  step={10}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {SPECIAL_SENSES_OPTIONS.map((o) => {
                  const checked = senses.includes(o.value)
                  return (
                    <label key={o.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...senses, o.value] : senses.filter((x) => x !== o.value)
                          onChange({ ...module, value: { ...sv, senses: next } })
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                      />
                      <span className="text-xs text-gray-300">{o.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })()
      ) : needsSubSelect === 'visualEffect' ? (
        (() => {
          const sv = value && typeof value === 'object' ? value : {}
          const selectedType = sv.type || ''
          const description = typeof sv.description === 'string' ? sv.description : ''
          return (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">视觉类型</label>
                <select
                  value={selectedType}
                  onChange={(e) => onChange({ ...module, value: { ...sv, type: e.target.value } })}
                  className={inputClass + ' !py-1.5 text-xs w-full'}
                >
                  <option value="">请选择</option>
                  {VISUAL_EFFECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {selectedType === 'custom' || description ? (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">描述</label>
                  <textarea
                    value={description}
                    onChange={(e) => onChange({ ...module, value: { ...sv, description: e.target.value } })}
                    placeholder="描述视觉效果..."
                    className={inputClass + ' !py-1.5 text-xs w-full'}
                    rows={2}
                  />
                </div>
              ) : null}
            </div>
          )
        })()
      ) : needsSubSelect === 'shieldPool' ? (
        (() => {
          const sv = value && typeof value === 'object' ? value : {}
          const max = sv.max != null ? Number(sv.max) || 10 : 10
          const threshold = sv.threshold != null ? Number(sv.threshold) || 0 : 0
          const recoverOn = sv.recoverOn || 'manual'
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16">上限</span>
                <input
                  type="number"
                  value={max}
                  onChange={(e) => onChange({ ...module, value: { ...sv, max: Number(e.target.value) || 10 } })}
                  className={inputClass + ' !py-1 !w-20 text-xs'}
                  min={1}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16">阈值</span>
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => onChange({ ...module, value: { ...sv, threshold: Number(e.target.value) || 0 } })}
                  className={inputClass + ' !py-1 !w-20 text-xs'}
                  min={0}
                />
                <span className="text-[10px] text-gray-500">低于此值时效果关闭</span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block mb-1">恢复条件</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'short', label: '短休' },
                    { value: 'long', label: '长休' },
                    { value: 'dawn', label: '黎明' },
                    { value: 'manual', label: '仅手动' },
                    { value: 'none', label: '不可恢复' },
                  ].map((o) => (
                    <label key={o.value} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="shieldPoolRecover"
                        checked={recoverOn === o.value}
                        onChange={() => onChange({ ...module, value: { ...sv, recoverOn: o.value } })}
                        className="border-gray-600 bg-gray-800 text-dnd-gold"
                      />
                      <span className="text-xs text-gray-300">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )
        })()
      ) : null}
    </div>
  )
}

/** 选择型 BUFF 编辑器：多选项 + 每选项独立效果列表 */
function ChoiceBUFFEditor({ choiceOptions = [], choiceSelected = 0, onChange }) {
  const [editingOptionIdx, setEditingOptionIdx] = useState(null)
  const [editingModule, setEditingModule] = useState(null)

  const safeOptions = Array.isArray(choiceOptions) && choiceOptions.length > 0 ? choiceOptions : [{ name: '选项 A', effects: [] }]
  const selectedIdx = Math.min(Math.max(0, Number(choiceSelected) || 0), safeOptions.length - 1)
  const selectedOption = safeOptions[selectedIdx]

  const updateOptions = (next) => onChange({ choiceOptions: next, choiceSelected: Math.min(selectedIdx, next.length - 1) })

  const addOption = () => {
    const next = [...safeOptions, { name: `选项 ${String.fromCharCode(65 + safeOptions.length)}`, effects: [] }]
    updateOptions(next)
  }

  const removeOption = (idx) => {
    if (safeOptions.length <= 1) return
    const next = safeOptions.filter((_, i) => i !== idx)
    const newSelected = selectedIdx >= next.length ? next.length - 1 : selectedIdx
    onChange({ choiceOptions: next, choiceSelected: newSelected })
  }

  const renameOption = (idx, name) => {
    const next = safeOptions.map((o, i) => (i === idx ? { ...o, name } : o))
    updateOptions(next)
  }

  const openEditModule = (modId) => {
    const mod = selectedOption.effects.find((m) => m.id === modId)
    if (mod) setEditingModule({ ...mod })
  }

  const saveModule = (draft) => {
    const opts = safeOptions.map((o, i) => {
      if (i !== selectedIdx) return o
      const exists = o.effects.some((m) => m.id === draft.id)
      return {
        ...o,
        effects: exists ? o.effects.map((m) => (m.id === draft.id ? draft : m)) : [...o.effects, draft],
      }
    })
    updateOptions(opts)
    setEditingModule(null)
  }

  const addModule = () => {
    setEditingModule({
      id: 'e_' + Math.random().toString(36).slice(2),
      category: '',
      effectType: '',
      scope: SCOPE_KIND.global,
      scopeDetail: [],
      value: 0,
      break20: {},
      customText: '',
    })
  }

  const removeModule = (modId) => {
    const opts = safeOptions.map((o, i) =>
      i === selectedIdx ? { ...o, effects: o.effects.filter((m) => m.id !== modId) } : o
    )
    updateOptions(opts)
  }

  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'
  const selectCls = inputClass.replace(/\bh-10\b/, 'h-6').replace(/\bpx-3\b/, 'px-1').replace(/\btext-sm\b/, 'text-xs') + ' cursor-pointer'

  return (
    <div className="space-y-2">
      {/* 选项选择器 */}
      <div>
        <span className={labelCls + ' block mb-1'}>选项</span>
        <div className="flex flex-wrap gap-1">
          {safeOptions.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onChange({ choiceOptions: safeOptions, choiceSelected: idx })}
                className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                  idx === selectedIdx
                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                    : 'border-gray-600 bg-gray-800/50 text-gray-400 hover:text-gray-300'
                }`}
              >
                {opt.name || `选项 ${idx + 1}`}
              </button>
              {safeOptions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOption(idx)}
                  className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                  title="删除选项"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-gray-500 hover:text-violet-400 hover:bg-violet-500/10 border border-dashed border-gray-600 hover:border-violet-500/50 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 当前选中选项的名称编辑 */}
      <div className="flex items-center gap-x-1.5">
        <span className={labelCls}>选项名</span>
        <input
          type="text"
          value={selectedOption.name || ''}
          onChange={(e) => renameOption(selectedIdx, e.target.value)}
          className={selectCls + ' flex-1 min-w-0'}
          placeholder={`选项 ${selectedIdx + 1}`}
        />
      </div>

      {/* 当前选项的效果列表 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelCls}>效果（{selectedOption.name || `选项 ${selectedIdx + 1}`}）</span>
          <button
            type="button"
            onClick={addModule}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-violet-500 text-violet-400 hover:bg-violet-500/20 text-[10px] font-medium"
          >
            <Plus className="w-3 h-3" />
            添加效果
          </button>
        </div>
        {selectedOption.effects.length === 0 ? (
          <p className="text-gray-500 text-[10px] text-center py-1.5">暂无效果，点击添加</p>
        ) : (
          <div className="space-y-1">
            {selectedOption.effects.map((mod) => {
              const catData = BUFF_TYPES[mod.category]
              const currentEffect = catData?.effects?.find((e) => e.key === mod.effectType)
              const summary = currentEffect
                ? getEffectSummaryShort({ effectType: mod.effectType, value: mod.value, customText: mod.customText, scope: mod.scope, scopeDetail: mod.scopeDetail }, {})
                : '未选择效果'
              const rawLabel = currentEffect ? (currentEffect.label ?? mod.effectType) : '—'
              const displayLabel = summary && summary !== rawLabel && summary !== '未选择效果' ? summary : rawLabel
              return (
                <div
                  key={mod.id}
                  className="rounded border border-white/[0.08] bg-[#1a2333]/60 px-2 py-1 flex items-center justify-between gap-2"
                >
                  <span className="text-dnd-gold-light/90 text-[11px] font-medium truncate">{displayLabel}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => openEditModule(mod.id)} className="p-0.5 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold transition-colors" title="编辑">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => removeModule(mod.id)} className="p-0.5 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors" title="删除">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 效果编辑：内嵌（避免第三层弹窗） */}
      {editingModule && (
        <div className="rounded-lg border border-violet-500/30 bg-[#1e2738]/80 p-2 mt-1">
          <EffectModuleModal
            module={editingModule}
            onSave={saveModule}
            onCancel={() => setEditingModule(null)}
          />
        </div>
      )}
    </div>
  )
}

export default function BuffForm({ initial, onSave, onCancel, onClear, defaultSourceKind, spellDC, spellAttackBonus, useWandScrollTable, referenceData, baseReferenceData, sourceNameOptions = [], sourceKindOptions = BUFF_SOURCE_KIND_OPTIONS_EDITABLE, compact = false, readOnly = false, hideDuration = false, subordinates = [], charResources, spellSlots }) {
  const sourceKindLocked = !!(initial?.fromFeat || initial?.fromItem)
  const [source, setSource] = useState(initial?.source ?? '')
  const [duration, setDuration] = useState(() => normalizeDuration(initial?.duration))
  const [sourceKind, setSourceKind] = useState(() => {
    if (sourceKindLocked) return normalizeBuffSourceKindKey('adventure')
    const resolved = resolveInitialSourceKind(initial, defaultSourceKind)
    return sourceKindOptions.some((o) => o.key === resolved) ? resolved : normalizeBuffSourceKindKey(defaultSourceKind ?? 'adventure')
  })
  
  /** 模式选择弹窗显示状态：空卡首次配置时显示 */
  const [showModeSelection, setShowModeSelection] = useState(() => {
    // 如果没有任何 effects 且没有 modeSelected 标记，显示模式选择
    // modeSelected 用于区分"从未配置"和"已清空所有效果"
    return (!initial?.effects || initial.effects.length === 0) && !initial?.modeSelected
  })

  /** 造成能量下拉（Location A: 释放效果按钮行） */
  const [energyDropdownAOpen, setEnergyDropdownAOpen] = useState(false)
  const energyDropdownARef = useRef(null)
  useEffect(() => {
    if (!energyDropdownAOpen) return
    const handler = (e) => {
      if (energyDropdownARef.current && !energyDropdownARef.current.contains(e.target)) {
        setEnergyDropdownAOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [energyDropdownAOpen])

  const sourceListId = useMemo(() => 'buff-source-options-' + Math.random().toString(36).slice(2, 9), [])
  /** 用于效果简写求值与内含法术 DC/法攻/充能显示 */
  const effectSummaryContext = useMemo(() => ({
    ...(referenceData || {}),
    spellDC,
    spellAttackBonus,
    useWandScrollTable,
  }), [referenceData, spellDC, spellAttackBonus, useWandScrollTable])
  // custom_text 纯描述性效果无实际功能，过滤掉避免显示在编辑器中
  // charge_item 属于主动释放效果，不应出现在被动模式中（由 activeChargeData 管理）
  const filteredInitial = Array.isArray(initial?.effects)
    ? { ...initial, effects: initial.effects.filter(e => e.effectType !== 'custom_text' && e.effectType !== 'charge_item') }
    : initial
  
  const [effectModules, setEffectModules] = useState(() => normalizeInitialEffects(filteredInitial))
  /** 行内效果类型选择器开关 */
  const [showEffectPicker, setShowEffectPicker] = useState(false)
  const [pickerCategory, setPickerCategory] = useState('ability')

  const addModule = () => {
    setShowEffectPicker((prev) => !prev)
  }

  /** 直接添加指定类型效果到列表（不弹窗） */
  const addEffectDirectly = (category, effectKey) => {
    const newMod = {
      id: 'e_' + Math.random().toString(36).slice(2),
      category,
      effectType: effectKey,
      scope: SCOPE_KIND.global,
      scopeDetail: [],
      value: 0,
      break20: {},
      customText: '',
    }
    setEffectModules((prev) => [...prev, newMod])
    setShowEffectPicker(false)
    // 添加后自动打开行内编辑
    setEditingModuleId(newMod.id)
  }
  /** 主动释放区域显示开关 */
  const _initEffects = Array.isArray(initial?.effects) ? initial.effects : []
  const [showActiveRelease, setShowActiveRelease] = useState(() => {
    return _initEffects.some((e) => e.effectType === 'charge_item')
  })
  /** 主动模式的充能物品数据 */
  const [activeChargeData, setActiveChargeData] = useState(() => {
    const chargeEffect = _initEffects.find((e) => e.effectType === 'charge_item')
    if (chargeEffect?.value && typeof chargeEffect.value === 'object') {
      return normalizeChargeItemValue(chargeEffect.value)
    }
    return normalizeChargeItemValue({})
  })
  
  /** Tab模式：'passive' | 'active' */
  const [editMode, setEditMode] = useState(() => {
    // 如果已有charge_item效果，默认进入主动模式；否则进入被动模式
    return _initEffects.some((e) => e.effectType === 'charge_item') ? 'active' : 'passive'
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!source.trim()) return
    const catDataByKey = BUFF_TYPES
    // 被动效果
    const passiveEffects = effectModules.map((mod) => {
      const catData = catDataByKey[mod.category]
      const effList = catData?.effects ?? []
      const effectType = effList.some((e) => e.key === mod.effectType) ? mod.effectType : (effList[0]?.key ?? '')
      const currentEffect = effList.find((x) => x.key === effectType)
      let val = normalizeValueForSave(mod, currentEffect)
      // 自由填写类：统一用 customText 写入 value，保证持久化与外层展示
      if (currentEffect?.key?.startsWith('custom_')) {
        val = typeof mod.customText === 'string' ? mod.customText : (typeof val === 'string' ? val : '')
      }
      const { scope, scopeDetail } = normalizeScope(mod.scope, mod.scopeDetail)
      const out = { category: mod.category, effectType, scope, scopeDetail, value: val }
      if (effectType === 'ability_score_uncapped' && mod.break20 && typeof mod.break20 === 'object' && Object.keys(mod.break20).length) {
        out.break20 = mod.break20
      }
      return out
    }).filter((ef) => ef.effectType)
    // 主动释放效果：从 activeChargeData 构造 charge_item
    const activeEffects = (activeChargeData.effects?.length > 0)
      ? [{ category: 'active_release', effectType: 'charge_item', scope: 'global', scopeDetail: [], value: { ...activeChargeData } }]
      : []
    // 去重：如果主动模式有 charge_item，则从被动效果中移除所有 charge_item（避免重复）
    const passiveEffectsFiltered = activeEffects.length > 0
      ? passiveEffects.filter(ef => ef.effectType !== 'charge_item')
      : passiveEffects
    const effects = [...passiveEffectsFiltered, ...activeEffects]
    const payload = {
      ...initial,
      source: source.trim(),
      duration: duration?.type ? duration : (duration || undefined),
      effects,
      enabled: initial?.enabled !== false,
      // 标记已完成模式选择，避免下次打开再次弹窗
      modeSelected: effects.length > 0 ? true : (initial?.modeSelected || false),
    }
    if (!initial?.fromFeat && !initial?.fromItem) {
      payload.sourceKind = normalizeBuffSourceKindKey(sourceKind)
    }
    onSave(payload)
  }

  const [editingModuleId, setEditingModuleId] = useState(null)

  const handleToggleEdit = (id) => {
    setEditingModuleId(prev => prev === id ? null : id)
  }

  const updateModule = (id, patch) => {
    setEffectModules(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  const removeModule = (id) => {
    setEffectModules(prev => prev.filter(m => m.id !== id))
    if (editingModuleId === id) setEditingModuleId(null)
  }

  /** 首次配置时显示模式选择弹窗 */
  if (showModeSelection) {
    return (
      <ModeSelectionModal 
        onSelect={(mode) => {
          setEditMode(mode);
          setShowModeSelection(false);
        }}
        onCancel={onCancel}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-2 bg-gray-800 rounded-lg border border-gray-700">
      {!compact && (
      <div>
        <label className="block text-gray-300 text-xs mb-1">来源名称 *</label>
        <input
          type="text"
          list={sourceListId}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="牧师的祝福术、狂暴、法师护甲..."
          className={inputClass}
          required
        />
        {sourceNameOptions.length > 0 && (
          <datalist id={sourceListId}>
            {sourceNameOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
      </div>
      )}
      {!hideDuration && (
      <div>
        <DurationEditor value={duration} onChange={setDuration} />
      </div>
      )}

      {/* ── 模式切换 Tab ─ */}
      <div className="flex items-center gap-1 mb-2 border-b border-gray-700 pb-1">
        <button
          type="button"
          onClick={() => setEditMode('passive')}
          className={`px-2 py-1 text-xs transition-colors ${
            editMode === 'passive'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          被动效果
        </button>
        <button
          type="button"
          onClick={() => setEditMode('active')}
          className={`px-2 py-1 text-xs transition-colors ${
            editMode === 'active'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          主动释放
        </button>
      </div>

      {/* ── 标签页内容区（固定高度，内部滚动，标签不动） ── */}
      <div className="h-[340px] overflow-y-auto">

      {/* ══════ 主动模式：ActiveCardEditor ══════ */}
      {editMode === 'active' && (
        <ActiveCardEditor
          data={activeChargeData}
          onChange={setActiveChargeData}
          duration={duration}
          onDurationChange={setDuration}
          charResources={charResources}
          spellSlots={spellSlots}
          renderEffects={() => (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[10px]">释放效果</span>
                <div className="flex items-center gap-1 flex-wrap">
                  <div className="relative" ref={energyDropdownARef}>
                    <button type="button" onClick={() => setEnergyDropdownAOpen(!energyDropdownAOpen)} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center" title="造成能量">⚡ 造成能量 ▾</button>
                    {energyDropdownAOpen && (
                      <div className="absolute left-0 top-[calc(100%+4px)] min-w-[100px] bg-[#1e2836] border border-white/10 rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-[100] overflow-hidden">
                        <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('damage')] })); setEnergyDropdownAOpen(false) }} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06] w-full text-left transition-colors">
                          <span className="text-red-400">⚔</span> 伤害
                        </button>
                        <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('heal')] })); setEnergyDropdownAOpen(false) }} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.06] w-full text-left transition-colors">
                          <span className="text-green-400">✚</span> 治疗
                        </button>
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('spell')] })) }} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center">+ 法术</button>
                  <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('temp_buff')] })) }} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center">+ 增益</button>
                  <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('shield')] })) }} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center">+ 护盾</button>
                  <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('creature_transform')] })) }} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center">+ 变身</button>
                  <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('restore_spell_slots')] })) }} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center">+ 环位恢复</button>
                  <button type="button" onClick={() => { const effs = activeChargeData.effects || []; setActiveChargeData(prev => ({ ...prev, effects: [...effs, createChargeEffectEntry('summon')] })) }} className="h-6 px-2 rounded border border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] leading-none flex items-center">+ 召唤</button>
                </div>
              </div>
              {(activeChargeData.effects || []).length === 0 && (
                <p className="text-gray-500 text-[10px]">点击上方按钮添加释放效果</p>
              )}
              <ActiveEffectsList
                data={activeChargeData}
                onChange={setActiveChargeData}
                spellDC={spellDC}
                spellAttackBonus={spellAttackBonus}
                useWandScrollTable={useWandScrollTable}
                referenceData={referenceData}
                baseReferenceData={baseReferenceData}
                subordinates={subordinates}
              />
            </div>
          )}
        />
      )}

      {/* ══════ 被动模式：传统附魔效果编辑器 ══════ */}
      {editMode === 'passive' && (
      <>
      {!compact && (
      <div>
        <label className="block text-gray-300 text-xs mb-1">来源归类</label>
        {sourceKindLocked ? (
          <div
            className={
              inputClass +
              ' flex items-center h-10 cursor-default bg-gray-900/50 text-gray-300 border-gray-600/80'
            }
            title="专长与装备由系统自动归类，不可修改"
          >
            <span>{getBuffSourceKindLabel(initial)}</span>
            <span className="ml-2 text-[10px] font-normal text-gray-500 tracking-normal">自动</span>
          </div>
        ) : (
          <select
            value={sourceKind}
            onChange={(e) => setSourceKind(normalizeBuffSourceKindKey(e.target.value))}
            className={inputClass + ' cursor-pointer'}
            title="Buff 在列表中的小标签归类"
          >
            {sourceKindOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-gray-300 text-[10px]">效果（可多条）</label>
          {!readOnly && (
          <button
            type="button"
            onClick={addModule}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
              showEffectPicker
                ? 'border-gray-600 bg-gray-700 text-gray-300'
                : 'border-gray-600 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Plus className="w-3 h-3" />
            {showEffectPicker ? '收起' : '添加效果'}
          </button>
          )}
        </div>

        {/* ── 行内效果类型选择器（双下拉） ── */}
        {showEffectPicker && !readOnly && (
          <div className="flex items-center gap-1.5 mb-2">
            <select
              value={pickerCategory}
              onChange={(e) => setPickerCategory(e.target.value)}
              className="h-7 px-1.5 rounded border border-gray-600 bg-gray-700 text-gray-300 text-[10px] cursor-pointer shrink-0"
            >
              {Object.entries(BUFF_TYPES)
                .filter(([k]) => k !== 'active_release')
                .map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
            </select>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addEffectDirectly(pickerCategory, e.target.value)
                  e.target.value = ''
                }
              }}
              defaultValue=""
              className="h-7 px-1.5 rounded border border-gray-600 bg-gray-700 text-gray-300 text-[10px] cursor-pointer flex-1 min-w-0"
            >
              <option value="" disabled>选择效果类型…</option>
              {(BUFF_TYPES[pickerCategory]?.effects || [])
                .filter(e => !e.hidden)
                .map(eff => (
                  <option key={eff.key} value={eff.key}>{eff.label}</option>
                ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          {effectModules.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-2">暂无效果，点击右上角添加</p>
          ) : (
            effectModules.map((mod) => {
              const catData = BUFF_TYPES[mod.category]
              const currentEffect = catData?.effects?.find((e) => e.key === mod.effectType)
              const isCustomText = mod.effectType === 'custom_condition'
              const summary = currentEffect
                ? getEffectSummaryShort({ effectType: mod.effectType, value: mod.value, customText: mod.customText, scope: mod.scope, scopeDetail: mod.scopeDetail }, effectSummaryContext)
                : '未选择效果'
              const rawLabel = currentEffect ? (currentEffect.label ?? mod.effectType) : '—'
              const displayLabel = summary && summary !== rawLabel && summary !== '未选择效果' ? summary : rawLabel
              const isEditing = editingModuleId === mod.id
              // 判断是否为新建效果（刚添加，尚未保存过）
              const isNewEffect = !_initEffects.some((e) => e.effectType === mod.effectType && JSON.stringify(e.value) === JSON.stringify(mod.value))
              // 判断效果是否配置完整（有 value 且不为默认值）
              const isIncomplete = !mod.value || (typeof mod.value === 'number' && mod.value === 0) || (typeof mod.value === 'object' && Object.keys(mod.value).length === 0)
              
              return (
                <div key={mod.id}>
                  <div
                    className={`rounded-lg border px-2 py-1.5 flex items-center justify-between gap-2 ${
                      isEditing
                        ? 'border-gray-600 bg-gray-700/50'
                        : isCustomText
                          ? 'border-dashed border-gray-600/50 bg-gray-800/30'
                          : isIncomplete && !readOnly
                            ? 'border-dashed border-yellow-500/40 bg-yellow-500/5'
                            : 'border-gray-700 bg-gray-800/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      {isCustomText && (
                        <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1 py-0.5 rounded shrink-0">文案</span>
                      )}
                      {isIncomplete && !readOnly && !isEditing && (
                        <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-1 py-0.5 rounded shrink-0">待配置</span>
                      )}
                      <span className={`text-xs ${isCustomText ? 'text-gray-400' : 'text-gray-300'} font-medium`}>{displayLabel}</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!readOnly && (
                      <>
                      <button
                        type="button"
                        onClick={() => handleToggleEdit(mod.id)}
                        className={`p-1 rounded transition-colors ${isEditing ? 'text-gray-300 bg-gray-700' : 'text-gray-500 hover:bg-gray-700 hover:text-gray-300'}`}
                        title={isEditing ? '收起编辑' : '编辑'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeModule(mod.id)}
                        className="p-1 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      </>
                      )}
                    </div>
                  </div>
                  {isEditing && !readOnly && (
                    <div className="mt-1 p-2 rounded-lg border border-gray-600 bg-gray-800 space-y-1.5">
                      {/* 状态标签 */}
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-gray-700">
                        <span className="text-[10px] text-gray-400 font-medium">
                          {isNewEffect ? '新建效果' : '编辑效果'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleEdit(mod.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                          title="收起编辑区"
                        >
                          收起
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <select
                          value={mod.category || ''}
                          onChange={(e) => {
                            const newEffects = BUFF_TYPES[e.target.value]?.effects ?? []
                            updateModule(mod.id, { category: e.target.value, effectType: newEffects[0]?.key ?? '' })
                          }}
                          className="h-7 px-1.5 rounded border border-gray-600 bg-gray-700 text-gray-300 text-[10px] cursor-pointer shrink-0"
                        >
                          {Object.entries(BUFF_TYPES)
                            .filter(([k]) => k !== 'active_release')
                            .map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                        <select
                          value={mod.effectType || ''}
                          onChange={(e) => {
                            const patch = { effectType: e.target.value }
                            if (e.target.value === 'initiative_buff') patch.value = { bonus: 0, proficient: false }
                            if (e.target.value === 'attack_damage_bonus') patch.value = normalizeAttackDamageBonusModuleValue(mod.value)
                            if (e.target.value === 'spell_damage_bonus') patch.value = { type: '', diceFloor: 0, perDieBonus: 0, extraDice: '', flatBonus: 0 }
                            if (e.target.value === 'spell_ability_attack') patch.value = { ability: 'int' }
                            if (e.target.value === 'base_speed_increment') patch.value = { walk: 0, fly: 0, swim: 0, climb: 0 }
                            if (e.target.value === 'ability_score_uncapped') patch.break20 = {}
                            if (e.target.value === 'choice') patch.value = { choiceOptions: [{ name: '选项 A', effects: [] }, { name: '选项 B', effects: [] }], choiceSelected: 0 }
                            updateModule(mod.id, patch)
                          }}
                          className="h-7 px-1.5 rounded border border-gray-600 bg-gray-700 text-gray-300 text-[10px] cursor-pointer flex-1 min-w-0"
                        >
                          <option value="" disabled>选择效果类型…</option>
                          {(BUFF_TYPES[mod.category]?.effects || [])
                            .filter(e => !e.hidden)
                            .map(eff => (
                              <option key={eff.key} value={eff.key}>{eff.label}</option>
                            ))}
                        </select>
                      </div>
                      {mod.effectType && (
                        <ScopeEditor scope={mod.scope} scopeDetail={mod.scopeDetail} onChange={(next) => updateModule(mod.id, next)} />
                      )}
                      {currentEffect && (
                        <EffectValueEditor
                          module={{ ...mod }}
                          onChange={(next) => updateModule(mod.id, next)}
                          catData={catData}
                          spellDC={spellDC}
                          spellAttackBonus={spellAttackBonus}
                          useWandScrollTable={useWandScrollTable}
                          referenceData={referenceData}
                          baseReferenceData={baseReferenceData}
                          subordinates={subordinates}
                        />
                      )}
                      
                      {/* 编辑区底部操作按钮 */}
                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-amber-500/20">
                        {isNewEffect && (
                          <button
                            type="button"
                            onClick={() => removeModule(mod.id)}
                            className="text-[10px] px-2 py-0.5 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors"
                            title="取消新建并删除"
                          >
                            ✕ 取消新建
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleEdit(mod.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                        >
                          完成编辑
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      </>
      )}

      </div>{/* ── /标签页内容区 ── */}



      {!readOnly && (
      <div className={`flex gap-1.5 justify-end ${compact ? 'pt-1' : 'pt-1.5'}`}>
        <button type="button" onClick={onCancel} className={`${compact ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2'} rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700`}>
          取消
        </button>
        {onClear && (
          <button type="button" onClick={onClear} className={`${compact ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2'} rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700`}>
            清除
          </button>
        )}
        <button type="submit" className={`${compact ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-2'} rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium`}>
          保存
        </button>
      </div>
      )}
    </form>
  )
}

/** scope 条件编辑器：命中/伤害加值选择起效范围后，按 kind 渲染对应的 scopeDetail 多选 */
function ScopeEditor({ scope, scopeDetail, onChange }) {
  const currentScope = scope || SCOPE_KIND.global
  const details = Array.isArray(scopeDetail) ? scopeDetail.filter(Boolean) : []
  const showDetail =
    currentScope === SCOPE_KIND.creature_type ||
    currentScope === SCOPE_KIND.damage_type ||
    currentScope === SCOPE_KIND.weapon_category ||
    currentScope === SCOPE_KIND.weapon_property ||
    currentScope === SCOPE_KIND.custom

  const detailOptions = useMemo(() => {
    if (currentScope === SCOPE_KIND.creature_type) return CREATURE_TYPE_OPTIONS
    if (currentScope === SCOPE_KIND.damage_type) return DAMAGE_TYPES
    if (currentScope === SCOPE_KIND.weapon_category) return WEAPON_SCOPE_CATEGORY_OPTIONS
    if (currentScope === SCOPE_KIND.weapon_property) return WEAPON_PROPERTY_OPTIONS
    return []
  }, [currentScope])

  const handleScopeChange = (nextScope) => {
    onChange({ scope: nextScope || SCOPE_KIND.global, scopeDetail: [] })
  }

  const toggleDetail = (value, checked) => {
    const next = checked ? [...details, value] : details.filter((v) => v !== value)
    onChange({ scopeDetail: next })
  }

  const handleCustomTextChange = (text) => {
    onChange({ scopeDetail: [text] })
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">起效范围</label>
        <select
          value={currentScope}
          onChange={(e) => handleScopeChange(e.target.value)}
          className={inputClass + ' h-8 text-xs w-full sm:w-48 min-w-0'}
        >
          {SCOPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {showDetail && currentScope !== SCOPE_KIND.custom && (
        <div className="flex flex-wrap gap-2">
          {detailOptions.map((o) => {
            const checked = details.includes(o.value)
            return (
              <label key={o.value} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleDetail(o.value, e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                />
                <span className="text-xs text-gray-300">{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
      {currentScope === SCOPE_KIND.custom && (
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">自定义范围</label>
          <input
            type="text"
            value={details[0] ?? ''}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder="例如：水下、风暴天气、夜间…"
            className={inputClass + ' h-8 text-xs w-full sm:w-64 min-w-0'}
          />
        </div>
      )}
      {currentScope === SCOPE_KIND.self_weapon && (
        <p className="text-xs text-gray-500">仅对来自同一件物品的武器战斗手段生效。</p>
      )}
      {currentScope === SCOPE_KIND.specific_target && (
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">特定目标</label>
          <input
            type="text"
            value={details[0] ?? ''}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder="例如：对 undead 类型生物、对龙类、对某件装备…"
            className={inputClass + ' h-8 text-xs w-full sm:w-64 min-w-0'}
          />
          <p className="text-xs text-gray-500 mt-0.5">特定目标范围需手动计算，系统不自动匹配。</p>
        </div>
      )}
    </div>
  )
}

/** 单条效果（附魔）弹窗编辑器：选择分类/效果类型/scope 后用 EffectValueEditor 编辑值 */
function EffectModuleModal({
  module,
  onSave,
  onCancel,
  referenceData,
  baseReferenceData,
  spellDC,
  spellAttackBonus,
  useWandScrollTable,
  isNew = false,
  subordinates = [],
}) {
  const [draft, setDraft] = useState(module)

  const catData = BUFF_TYPES[draft.category]
  const effects = catData?.effects ?? []
  const visibleEffects = effects.filter((e) => !e.hidden)
  const hasCategory = !!draft.category && !!catData
  const effectTypeValid = hasCategory && effects.some((e) => e.key === draft.effectType)
  const effectiveEffectType = hasCategory && effectTypeValid ? draft.effectType : ''
  const currentEffect = effects.find((e) => e.key === effectiveEffectType)
  const showScope = !!effectiveEffectType

  const updateDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }))

  return (
    <div className="rounded-lg border border-white/[0.1] bg-[#1e2736] shadow-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">
          {isNew || !module.id ? '添加附魔' : '编辑附魔'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-white"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 效果大类 + 具体效果：双下拉 */}
      <div className="flex items-center gap-1.5">
        <select
          value={draft.category || ''}
          onChange={(e) => {
            const newEffects = BUFF_TYPES[e.target.value]?.effects ?? []
            updateDraft({ category: e.target.value, effectType: newEffects[0]?.key ?? '' })
          }}
          className="h-7 px-1.5 rounded border border-amber-500/30 bg-dnd-bg text-amber-300 text-[10px] cursor-pointer shrink-0"
        >
          {Object.entries(BUFF_TYPES)
            .filter(([k]) => k !== 'active_release')
            .map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
        </select>
        <select
          value={effectiveEffectType || ''}
          onChange={(e) => {
            const patch = { effectType: e.target.value }
            if (e.target.value === 'initiative_buff') patch.value = { bonus: 0, proficient: false }
            if (e.target.value === 'attack_damage_bonus') patch.value = normalizeAttackDamageBonusModuleValue(draft.value)
            if (e.target.value === 'spell_damage_bonus') patch.value = { type: '', diceFloor: 0, perDieBonus: 0, extraDice: '', flatBonus: 0 }
            if (e.target.value === 'spell_ability_attack') patch.value = { ability: 'int' }
            if (e.target.value === 'base_speed_increment') patch.value = { walk: 0, fly: 0, swim: 0, climb: 0 }
            if (e.target.value === 'ability_score_uncapped') patch.break20 = {}
            if (e.target.value === 'choice') patch.value = { choiceOptions: [{ name: '选项 A', effects: [] }, { name: '选项 B', effects: [] }], choiceSelected: 0 }
            updateDraft(patch)
          }}
          className="h-7 px-1.5 rounded border border-amber-500/30 bg-dnd-bg text-amber-300 text-[10px] cursor-pointer flex-1 min-w-0"
        >
          <option value="" disabled>选择效果类型…</option>
          {(BUFF_TYPES[draft.category]?.effects || [])
            .filter(e => !e.hidden)
            .map(eff => (
              <option key={eff.key} value={eff.key}>{eff.label}</option>
            ))}
        </select>
      </div>

      {showScope && (
        <ScopeEditor
          scope={draft.scope}
          scopeDetail={draft.scopeDetail}
          onChange={(next) => updateDraft(next)}
        />
      )}

      {currentEffect && (
        <EffectValueEditor
          module={{ ...draft, effectType: effectiveEffectType }}
          onChange={(next) => setDraft(next)}
          catData={catData}
          spellDC={spellDC}
          spellAttackBonus={spellAttackBonus}
          useWandScrollTable={useWandScrollTable}
          referenceData={referenceData}
          baseReferenceData={baseReferenceData}
          subordinates={subordinates}
        />
      )}

      <div className="flex gap-1.5 justify-end pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-xs"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={!effectiveEffectType}
          className="px-2.5 py-1 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs"
        >
          保存
        </button>
      </div>
    </div>
  )
}

export { EffectValueEditor, isComplexValueType, DamageDiceInlineRow, NumberStepper, AttackDamageBonusFields, newWeaponBonusRow, EffectModuleModal, ArmorOverrideEditor, CreatureTransformEditor, RestoreSpellSlotsEditor, ChoiceBUFFEditor }
