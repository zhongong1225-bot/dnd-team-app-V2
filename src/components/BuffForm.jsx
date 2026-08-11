import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { Trash2, Plus, ChevronDown, Database, X, Pencil } from 'lucide-react'
import { getEffectSummaryShort } from './BuffListItem'
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
import {
  BUFF_SOURCE_KIND_OPTIONS_EDITABLE,
  normalizeBuffSourceKindKey,
  getBuffSourceKindLabel,
} from '../lib/buffSourceKind'

const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

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
    const { scope, scopeDetail } = normalizeScope(e.scope, e.scopeDetail)
    return {
      id: 'e_' + Math.random().toString(36).slice(2),
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
      effectType: e.effectType ?? '',
      scope,
      scopeDetail,
      value,
      customText: typeof e.value === 'string' && e.effectType !== 'concentration_save_enhance' ? e.value : '',
    }
  }
  if (Array.isArray(initial?.effects) && initial.effects.length) {
    return initial.effects.map(mapEffect)
  }
  if (initial?.category != null || initial?.effectType != null) {
    return [mapEffect(initial)]
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
    needsSubSelect === 'containedSpell'
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
  const inputCls = inputClass.replace(/\bh-10\b/, 'h-6').replace(/\bpx-3\b/, 'px-1').replace(/\btext-sm\b/, 'text-xs').replace(/\bw-full\b/, 'flex-1 min-w-0')
  const selectCls = inputCls + ' cursor-pointer'
  const HIT_RESOLUTION_OPTIONS = [
    { value: 'dex_save', label: '敏捷豁免' },
    { value: 'str_save', label: '力量豁免' },
    { value: 'con_save', label: '体质豁免' },
    { value: 'wis_save', label: '感知豁免' },
    { value: 'int_save', label: '智力豁免' },
    { value: 'cha_save', label: '魅力豁免' },
    { value: 'spell_attack', label: '法术攻击' },
    { value: 'none', label: '效应目标' },
  ]

  const patchValue = (next) => onChange({ ...module, value: next })
  const patchSpells = (nextSpells) => patchValue({ ...cs, spells: nextSpells })
  const updateSpell = (idx, patch) => patchSpells(spells.map((sp, i) => (i === idx ? { ...sp, ...patch } : sp)))
  const removeSpell = (idx) => patchSpells(spells.filter((_, i) => i !== idx))
  const addSpell = () => patchSpells([...spells, createEmptyContainedSpellSub()])

  const resolveSpellName = (sp) => {
    const name = (sp.spellName || '').trim()
    if (name) return name
    if (sp.spellId) {
      const s = getSpellById(sp.spellId)
      if (s) return s.name
    }
    return ''
  }

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
    <div className="rounded-md bg-[#161e2b]/50 p-1.5 flex flex-col gap-y-1 text-xs w-full">
      {!hideCharges && (
        <div className="flex items-center gap-x-1 w-full">
          <span className={labelCls}>总能量</span>
          <NumberStepper
            value={totalCharges}
            onChange={(v) => patchValue({ ...cs, totalCharges: Math.max(0, Math.min(999, v)) })}
            min={0}
            max={999}
            compact
            narrow
            className="!h-6"
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
          <div key={idx} className="flex flex-col gap-y-1 border-t border-gray-600/30 pt-1 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-x-1 w-full">
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
                className={inputCls}
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
                className="!h-6"
              />
              <span className={labelCls}>消耗</span>
              <NumberStepper
                value={sp.cost}
                onChange={(v) => updateSpell(idx, { cost: Math.max(0, Math.min(99, v)) })}
                min={0}
                max={99}
                compact
                narrow
                className="!h-6"
              />
              <button
                type="button"
                onClick={() => removeSpell(idx)}
                className="p-1 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors shrink-0"
                title="删除该法术"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {!primaryOnly && (
              <div className="flex items-center gap-x-1 w-full">
                <div className="flex-1 min-w-0 flex items-center gap-x-1">
                  <span className={labelCls}>命中</span>
                  <select
                    value={hitResolution}
                    onChange={(e) => updateSpell(idx, { hitResolution: e.target.value })}
                    className={selectCls}
                  >
                    {HIT_RESOLUTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {hitValueDisplay != null && (
                    <span className="text-white font-mono tabular-nums shrink-0 text-xs">{hitValueDisplay}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-x-1">
                  <span className={labelCls}>距离</span>
                  <input
                    type="text"
                    value={sp.range ?? ''}
                    onChange={(e) => updateSpell(idx, { range: e.target.value })}
                    placeholder="自身"
                    className={inputCls}
                  />
                </div>
                <div className="flex-[2] min-w-0 flex items-center gap-x-1">
                  <span className={labelCls}>伤害</span>
                  <NumberStepper
                    value={sp.damageDiceCount}
                    onChange={(v) => updateSpell(idx, { damageDiceCount: Math.max(0, Math.min(99, v)) })}
                    min={0}
                    max={99}
                    compact
                    narrow
                    className="!h-6 w-14 min-w-0 shrink-0"
                  />
                  <select
                    value={sp.damageDiceSides}
                    onChange={(e) => updateSpell(idx, { damageDiceSides: Number(e.target.value) })}
                    className={selectCls + ' w-11 shrink-0'}
                  >
                    {DICE_SIDES_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-gray-800 text-white">{o.label}</option>
                    ))}
                  </select>
                  <select
                    value={sp.damageType ?? ''}
                    onChange={(e) => updateSpell(idx, { damageType: e.target.value })}
                    className={selectCls + ' flex-1 min-w-0'}
                    title="伤害类型"
                  >
                    <option value="">类型</option>
                    {DAMAGE_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
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
                  key={`formula-${opt.ref}-${opt.ability}-${opt.mult ?? 1}`}
                  type="button"
                  onClick={() => { onSelect({ ref: opt.ref, ability: opt.ability, mult: opt.mult }); setOpen(false) }}
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
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">每骰 +X</label>
          <NumberStepper
            value={v.perDieBonus ?? 0}
            onChange={(n) => update({ perDieBonus: n })}
            compact
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
        />
      </div>
    </div>
  )
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
        <span className="truncate text-sm">{display}</span>
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
                <span className="text-sm text-gray-300">{o.label}</span>
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
    : `${inputClass} h-8 min-w-0 max-w-[6.5rem] pr-6 text-sm shrink-0`
  const chevCls = inline ? 'w-3 h-3 right-1.5' : 'w-4 h-4 right-2'
  const rowSelectCls = inline
    ? `${compactClass} min-w-0 flex-1 basis-[4.5rem] max-w-[min(100%,11rem)]`
    : `${inputClass} h-8 text-sm min-w-0 flex-1 basis-[5rem] max-w-[min(100%,14rem)]`
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
}) {
  const [selectedSkillId, setSelectedSkillId] = useState(SKILLS[0]?.id ?? 'acrobatics')
  const [selectedAbilityId, setSelectedAbilityId] = useState(ABILITY_KEYS[0] ?? 'str')
  const effects = catData?.effects ?? []
  const currentEffect = effects.find((e) => e.key === module.effectType)
  const isAbilityScoreEffect =
    currentEffect?.key === 'ability_override' ||
    currentEffect?.key === 'ability_score_uncapped'
  const activeReferenceData = isAbilityScoreEffect ? (baseReferenceData ?? referenceData) : referenceData
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
    if (currentEffect?.key === 'attack_distance_range' || currentEffect?.key === 'spell_range_extension' || currentEffect?.key === 'base_speed_increment') {
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
      return (
        <>
          <select
            value={selectedAbilityId}
            onChange={(e) => {
              const nextKey = e.target.value
              const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
              const currentVal = getAbilityFieldValue(obj, selectedAbilityId)
              const base = {}
              if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
              else base[nextKey] = currentVal
              setSelectedAbilityId(nextKey)
              onChange({ ...module, value: base })
            }}
            className={compactClass + ' w-full min-w-0 h-7'}
          >
            <option value="all">全属性</option>
            {ABILITY_KEYS.map((k) => (
              <option key={k} value={k}>{ABILITY_LABELS[k]}</option>
            ))}
          </select>
          <div className="min-w-0">
            <NumberStepper referenceData={activeReferenceData}
              value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
              onChange={(v) => {
                // 单行单属性：选中单属性时清空其它属性，避免残留导致外层摘要与表单不一致
                const base = {}
                if (selectedAbilityId === 'all') {
                  ABILITY_KEYS.forEach((k) => { base[k] = v })
                } else {
                  base[selectedAbilityId] = v
                }
                onChange({ ...module, value: base })
              }}
              compact
            />
          </div>
        </>
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
      return (
        <div className="flex min-h-7 w-full min-w-0 flex-nowrap items-stretch gap-1">
          <div className="min-w-0 basis-0 flex-[2.5]">
            <select
              value={selectedAbilityId}
              onChange={(e) => {
                const nextKey = e.target.value
                const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
                const currentVal = getAbilityFieldValue(obj, selectedAbilityId)
                const base = {}
                if (obj.advantage != null) base.advantage = obj.advantage
                if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
                else base[nextKey] = currentVal
                setSelectedAbilityId(nextKey)
                onChange({ ...module, value: base })
              }}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              <option value="all">全属性</option>
              {ABILITY_KEYS.map((k) => (
                <option key={k} value={k}>{(module.effectType === 'save_bonus' ? SAVE_NAMES[k] : ABILITY_LABELS[k]) ?? k}</option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-center">
            <NumberStepper referenceData={activeReferenceData}
              value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
              onChange={(v) => {
                // 单行单属性；保留 advantage 字段
                const base = {}
                if (typeof value === 'object' && value && !Array.isArray(value) && value.advantage != null) base.advantage = value.advantage
                if (selectedAbilityId === 'all') {
                  ABILITY_KEYS.forEach((k) => { base[k] = v })
                } else {
                  base[selectedAbilityId] = v
                }
                onChange({ ...module, value: base })
              }}
              compact
              narrow
            />
          </div>
          <div className="min-w-0 basis-0 flex-[2]">
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )
    }
    if (needsSubSelect === 'skillsAndAdvantage') {
      return (
        <div className="flex min-h-7 w-full min-w-0 flex-nowrap items-stretch gap-1">
          <div className="min-w-0 basis-0 flex-[2.5]">
            <select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              {SKILLS.map((sk) => (
                <option key={sk.id} value={sk.id}>{sk.name}</option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-center">
            <NumberStepper referenceData={activeReferenceData}
              value={(typeof value === 'object' && value && value[selectedSkillId] != null ? value[selectedSkillId] : 0) ?? 0}
              onChange={(v) => {
                const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
                base[selectedSkillId] = v
                onChange({ ...module, value: base })
              }}
              compact
              narrow
            />
          </div>
          <div className="min-w-0 basis-0 flex-[2]">
            <select
              value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
              className={compactClass + ' h-7 w-full min-w-0 max-w-full'}
            >
              {ADVANTAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
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
          <span className="text-sm text-gray-300">启用</span>
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
        <NumberStepper referenceData={activeReferenceData}
          value={value}
          onChange={(v) => onChange({ ...module, value: v })}
          compact={false}
        />
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
                <span className="text-sm text-gray-300">{d.label}</span>
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
                <span className="text-sm text-gray-300">{c.label}</span>
              </label>
            )
          })}
        </div>
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
                  <span className="text-sm text-gray-300">视为魔法</span>
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
                  <span className="text-sm text-gray-300">忽略伤害抗性</span>
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
                  <span className="text-sm text-gray-300">视为银质</span>
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
            <span className="text-gray-500 text-sm">尺</span>
          </div>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={!!(typeof value === 'object' && value && value.hover)}
              onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), hover: e.target.checked } })}
              className="rounded border-gray-600 bg-gray-800 text-dnd-red"
            />
            <span className="text-sm text-gray-300">是否悬浮</span>
          </label>
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
                  <span className="text-sm text-gray-300">先攻获得熟练加值（PB）</span>
                </label>
              </>
            )
          })()}
        </div>
      ) : needsSubSelect === 'abilityScores' ? (
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            value={selectedAbilityId}
            onChange={(e) => {
              const nextKey = e.target.value
              const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
              const currentVal = getAbilityFieldValue(obj, selectedAbilityId)
              const base = {}
              if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
              else base[nextKey] = currentVal
              setSelectedAbilityId(nextKey)
              onChange({ ...module, value: base })
            }}
            className={inputClass + ' h-8 min-w-[6.5rem]'}
          >
            <option value="all">全属性</option>
            {ABILITY_KEYS.map((k) => (
              <option key={k} value={k}>{ABILITY_LABELS[k]}</option>
            ))}
          </select>
          <NumberStepper referenceData={activeReferenceData}
            value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
            onChange={(v) => {
              const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
              if (selectedAbilityId === 'all') {
                ABILITY_KEYS.forEach((k) => { base[k] = v })
              } else {
                base[selectedAbilityId] = v
              }
              onChange({ ...module, value: base })
            }}
            compact
          />
        </div>
      ) : needsSubSelect === 'abilityProficiency' ? (
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
                <span className="text-sm text-gray-300">{ABILITY_LABELS[k]}</span>
              </label>
            )
          })}
        </div>
      ) : needsSubSelect === 'abilityScoresAndAdvantage' ? (
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            value={selectedAbilityId}
            onChange={(e) => {
              const nextKey = e.target.value
              const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
              const currentVal = getAbilityFieldValue(obj, selectedAbilityId)
              const base = {}
              if (obj.advantage != null) base.advantage = obj.advantage
              if (nextKey === 'all') ABILITY_KEYS.forEach((k) => { base[k] = currentVal })
              else base[nextKey] = currentVal
              setSelectedAbilityId(nextKey)
              onChange({ ...module, value: base })
            }}
            className={inputClass + ' h-8 min-w-[6.5rem]'}
          >
            <option value="all">全属性</option>
            {ABILITY_KEYS.map((k) => (
              <option key={k} value={k}>{(module.effectType === 'save_bonus' ? SAVE_NAMES[k] : ABILITY_LABELS[k]) ?? k}</option>
            ))}
          </select>
          <NumberStepper referenceData={activeReferenceData}
            value={(typeof value === 'object' && value && selectedAbilityId !== 'all' && value[selectedAbilityId] != null ? value[selectedAbilityId] : 0) ?? 0}
            onChange={(v) => {
              const base = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
              if (selectedAbilityId === 'all') {
                ABILITY_KEYS.forEach((k) => { base[k] = v })
              } else {
                base[selectedAbilityId] = v
              }
              onChange({ ...module, value: base })
            }}
            compact
          />
          <span className="text-gray-400 text-xs shrink-0">优势/劣势</span>
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={inputClass + ' h-8 min-w-[6rem]'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ) : needsSubSelect === 'skillsAndAdvantage' ? (
        <div className="flex items-center gap-2 flex-nowrap">
          <select
            value={selectedSkillId}
            onChange={(e) => setSelectedSkillId(e.target.value)}
            className={inputClass + ' h-8 min-w-[7rem]'}
          >
            {SKILLS.map((sk) => (
              <option key={sk.id} value={sk.id}>{sk.name}</option>
            ))}
          </select>
          <NumberStepper referenceData={activeReferenceData}
            value={(typeof value === 'object' && value && value[selectedSkillId] != null ? value[selectedSkillId] : 0) ?? 0}
            onChange={(v) => {
              const valueObj = typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {}
              valueObj[selectedSkillId] = v
              onChange({ ...module, value: valueObj })
            }}
            compact
          />
          <span className="text-gray-400 text-xs shrink-0">优势/劣势</span>
          <select
            value={(typeof value === 'object' && value && value.advantage != null ? value.advantage : '') ?? ''}
            onChange={(e) => onChange({ ...module, value: { ...(typeof value === 'object' && value && !Array.isArray(value) ? value : {}), advantage: e.target.value } })}
            className={inputClass + ' h-8 min-w-[6rem]'}
          >
            {ADVANTAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ) : needsSubSelect === 'spellDamageBonus' ? (
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
      ) : null}
    </div>
  )
}

export default function BuffForm({ initial, onSave, onCancel, defaultSourceKind, spellDC, spellAttackBonus, useWandScrollTable, referenceData, baseReferenceData, sourceNameOptions = [] }) {
  const sourceKindLocked = !!(initial?.fromFeat || initial?.fromItem)
  const [source, setSource] = useState(initial?.source ?? '')
  const [duration, setDuration] = useState(initial?.duration ?? '')
  const [sourceKind, setSourceKind] = useState(() =>
    sourceKindLocked ? normalizeBuffSourceKindKey('adventure') : resolveInitialSourceKind(initial, defaultSourceKind),
  )
  const sourceListId = useMemo(() => 'buff-source-options-' + Math.random().toString(36).slice(2, 9), [])
  /** 用于效果简写求值与内含法术 DC/法攻/充能显示 */
  const effectSummaryContext = useMemo(() => ({
    ...(referenceData || {}),
    spellDC,
    spellAttackBonus,
    useWandScrollTable,
  }), [referenceData, spellDC, spellAttackBonus, useWandScrollTable])
  const [effectModules, setEffectModules] = useState(() => normalizeInitialEffects(initial))
  /** null | module object：弹窗内正在添加/编辑的效果模块 */
  const [editingModule, setEditingModule] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!source.trim()) return
    const catDataByKey = BUFF_TYPES
    // 保存为统一 Effect 结构（与 src/lib/effects/effectModel 一致），供 useBuffCalculator 与物品效果共用
    const effects = effectModules.map((mod) => {
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
      return { category: mod.category, effectType, scope, scopeDetail, value: val }
    }).filter((ef) => ef.effectType)
    if (!effects.length && !initial?.fromFeat) return
    const payload = {
      ...initial,
      source: source.trim(),
      duration: duration.trim() || undefined,
      effects,
      enabled: initial?.enabled !== false,
    }
    if (!initial?.fromFeat && !initial?.fromItem) {
      payload.sourceKind = normalizeBuffSourceKindKey(sourceKind)
    }
    onSave(payload)
  }

  const newEmptyModule = () => ({
    id: 'e_' + Math.random().toString(36).slice(2),
    category: '',
    effectType: '',
    scope: SCOPE_KIND.global,
    scopeDetail: [],
    value: 0,
    customText: '',
  })

  const addModule = () => {
    setEditingModule(newEmptyModule())
  }

  const handleEditModule = (id) => {
    const m = effectModules.find((x) => x.id === id)
    if (m) setEditingModule({ ...m })
  }

  const handleSaveModule = (draft) => {
    setEffectModules((prev) => {
      const exists = prev.some((m) => m.id === draft.id)
      if (exists) {
        return prev.map((m) => (m.id === draft.id ? draft : m))
      }
      return [...prev, draft]
    })
    setEditingModule(null)
  }

  const handleCancelModule = () => {
    setEditingModule(null)
  }

  const removeModule = (id) => {
    setEffectModules((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-gray-800 rounded-xl border border-gray-600">
      <div>
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">来源名称 *</label>
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
      <div>
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">持续时间</label>
        <input
          type="text"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="1分钟、直到下次长休、专注..."
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">来源归类</label>
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
            {BUFF_SOURCE_KIND_OPTIONS_EDITABLE.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">附魔效果（可多条）</label>
          <button
            type="button"
            onClick={addModule}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500 text-amber-400 hover:bg-amber-500/20 text-[10px] font-medium"
          >
            <Plus className="w-3 h-3" />
            添加附魔
          </button>
        </div>
        <div className="space-y-1.5">
          {effectModules.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-2">暂无附魔效果，点击右上角添加</p>
          ) : (
            effectModules.map((mod) => {
              const catData = BUFF_TYPES[mod.category]
              const currentEffect = catData?.effects?.find((e) => e.key === mod.effectType)
              const summary = currentEffect
                ? getEffectSummaryShort({ effectType: mod.effectType, value: mod.value, customText: mod.customText, scope: mod.scope, scopeDetail: mod.scopeDetail }, effectSummaryContext)
                : '未选择效果'
              const label = currentEffect ? (currentEffect.label ?? mod.effectType) : '—'
              return (
                <div
                  key={mod.id}
                  className="rounded-lg border border-white/[0.08] bg-[#1a2333]/60 px-2 py-1.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="text-dnd-gold-light/90 text-xs font-medium shrink-0">{label}</span>
                    <span className="text-gray-200 text-sm truncate" title={summary}>{summary}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditModule(mod.id)}
                      className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold transition-colors"
                      title="编辑"
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
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {editingModule && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={handleCancelModule}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={handleCancelModule}
          >
            <div
              className="w-full max-w-2xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <EffectModuleModal
                module={editingModule}
                onSave={handleSaveModule}
                onCancel={handleCancelModule}
                referenceData={referenceData}
                baseReferenceData={baseReferenceData}
                spellDC={spellDC}
                spellAttackBonus={spellAttackBonus}
                useWandScrollTable={useWandScrollTable}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex gap-1.5 justify-end pt-1.5">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">
          取消
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium">
          保存
        </button>
      </div>
    </form>
  )
}

/** scope 条件编辑器：命中/伤害加值选择起效范围后，按 kind 渲染对应的 scopeDetail 多选 */
function ScopeEditor({ scope, scopeDetail, onChange }) {
  const currentScope = scope || SCOPE_KIND.global
  const details = Array.isArray(scopeDetail) ? scopeDetail.filter(Boolean) : []
  const showDetail = currentScope === SCOPE_KIND.creature_type || currentScope === SCOPE_KIND.damage_type || currentScope === SCOPE_KIND.weapon_category

  const detailOptions = useMemo(() => {
    if (currentScope === SCOPE_KIND.creature_type) return CREATURE_TYPE_OPTIONS
    if (currentScope === SCOPE_KIND.damage_type) return DAMAGE_TYPES
    if (currentScope === SCOPE_KIND.weapon_category) return WEAPON_SCOPE_CATEGORY_OPTIONS
    return []
  }, [currentScope])

  const handleScopeChange = (nextScope) => {
    onChange({ scope: nextScope || SCOPE_KIND.global, scopeDetail: [] })
  }

  const toggleDetail = (value, checked) => {
    const next = checked ? [...details, value] : details.filter((v) => v !== value)
    onChange({ scopeDetail: next })
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
      {showDetail && (
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
                <span className="text-sm text-gray-300">{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
      {currentScope === SCOPE_KIND.self_weapon && (
        <p className="text-xs text-gray-500">仅对来自同一件物品的武器战斗手段生效。</p>
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
}) {
  const [draft, setDraft] = useState(module)

  const catData = BUFF_TYPES[draft.category]
  const effects = catData?.effects ?? []
  const visibleEffects = effects.filter((e) => !e.hidden)
  const hasCategory = !!draft.category && !!catData
  const effectTypeValid = hasCategory && effects.some((e) => e.key === draft.effectType)
  const effectiveEffectType = hasCategory && effectTypeValid ? draft.effectType : ''
  const currentEffect = effects.find((e) => e.key === effectiveEffectType)
  const showScope = ['attack_bonus', 'damage_bonus', 'attack_damage_bonus'].includes(effectiveEffectType)

  const updateDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }))

  return (
    <div className="rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wider">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">效果大类</label>
          <select
            value={draft.category || ''}
            onChange={(e) => {
              const newCat = e.target.value
              const newEffects = BUFF_TYPES[newCat]?.effects ?? []
              updateDraft({ category: newCat, effectType: newCat ? (newEffects[0]?.key ?? '') : '' })
            }}
            className={inputClass + ' h-8 text-xs w-full min-w-0'}
          >
            <option value="">&lt;选择大类&gt;</option>
            {getCategories().map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-0.5">具体效果</label>
          <select
            value={effectiveEffectType}
            onChange={(e) => {
              const nextType = e.target.value
              const patch = { effectType: nextType }
              if (nextType === 'initiative_buff') patch.value = { bonus: 0, proficient: false }
              if (nextType === 'attack_damage_bonus') patch.value = normalizeAttackDamageBonusModuleValue(draft.value)
              if (nextType === 'spell_damage_bonus') patch.value = { type: '', diceFloor: 0, perDieBonus: 0, extraDice: '', flatBonus: 0 }
              updateDraft(patch)
            }}
            className={inputClass + ' h-8 text-xs w-full min-w-0'}
            disabled={!hasCategory}
          >
            <option value="">&lt;选择效果&gt;</option>
            {visibleEffects.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      {showScope && (
        <ScopeEditor
          scope={draft.scope}
          scopeDetail={draft.scopeDetail}
          onChange={(next) => updateDraft(next)}
        />
      )}

      {currentEffect && (
        <div className="rounded-lg bg-[#161e2b]/50 p-2.5 space-y-2">
          <EffectValueEditor
            module={{ ...draft, effectType: effectiveEffectType }}
            onChange={(next) => setDraft(next)}
            catData={catData}
            spellDC={spellDC}
            spellAttackBonus={spellAttackBonus}
            useWandScrollTable={useWandScrollTable}
            referenceData={referenceData}
            baseReferenceData={baseReferenceData}
          />
        </div>
      )}

      <div className="flex gap-1.5 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={!effectiveEffectType}
          className="px-3 py-1.5 rounded-lg bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm"
        >
          保存
        </button>
      </div>
    </div>
  )
}

export { EffectValueEditor, isComplexValueType, DamageDiceInlineRow, NumberStepper, AttackDamageBonusFields, newWeaponBonusRow, EffectModuleModal }
