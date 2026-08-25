/**
 * 统一充能物品（charge_item）数据模型
 *
 * 将充能数、回能方式、消耗效果整合到一个 effect 模块中。
 *
 * value: {
 *   charges: number,               // 充能数
 *   recovery: {
 *     method: 'short_rest' | 'long_rest' | 'dawn' | 'none' | 'absorb_energy',
 *     kind: 'full' | 'fixed' | 'dice',
 *     fixed: number,
 *     diceCount: number,
 *     diceSides: number,
 *   },
 *   effects: [
 *     { id: string, type: 'spell',   value: containedSpellSub },
 *     { id: string, type: 'ability', value: { text: string, uses: number } },
 *     { id: string, type: 'shield',  value: { amount: number } },
 *   ]
 * }
 */

import { createEmptyContainedSpellSub } from './containedSpellModel'

export const RECOVERY_METHODS = [
  { value: 'short_rest', label: '短休恢复' },
  { value: 'long_rest', label: '长休恢复' },
  { value: 'dawn', label: '黎明恢复' },
  { value: 'none', label: '无法恢复' },
  { value: 'absorb_energy', label: '吸收能量恢复' },
]

export const RECOVERY_AMOUNT_OPTIONS = [
  { value: 'full', label: '回满' },
  { value: 'fixed', label: '固定值' },
  { value: 'dice', label: '掷骰' },
]

/** 不需要回能数量设置的方式 */
const NO_AMOUNT_METHODS = new Set(['none'])
/** 仅支持掷骰的方式 */
const DICE_ONLY_METHODS = new Set(['absorb_energy'])

export function createEmptyChargeItemValue(overrides = {}) {
  return {
    charges: 1,
    recovery: { method: 'long_rest', kind: 'full', fixed: 1, diceCount: 1, diceSides: 6 },
    effects: [],
    ...overrides,
  }
}

let _nextId = 1
function genId() {
  return 'ce_' + Date.now().toString(36) + '_' + (_nextId++).toString(36)
}

export function createChargeEffectEntry(type, overrides = {}) {
  const id = genId()
  if (type === 'spell') {
    return { id, type, value: createEmptyContainedSpellSub(), ...overrides }
  }
  if (type === 'ability') {
    return { id, type, value: { text: '', uses: 1, diceCount: 0, diceSides: 10, abilityMod: '', resultType: 'heal' }, ...overrides }
  }
  if (type === 'shield') {
    return { id, type, value: { amount: 1 }, ...overrides }
  }
  return { id, type, value: {}, ...overrides }
}

/** 把任意旧 value 归一化为 charge_item 结构 */
export function normalizeChargeItemValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyChargeItemValue()
  }
  const charges = typeof value.charges === 'number'
    ? Math.max(0, value.charges)
    : (parseInt(value.charges, 10) || 0)
  // recovery
  const rec = value.recovery && typeof value.recovery === 'object' ? value.recovery : {}
  const validMethods = RECOVERY_METHODS.map((m) => m.value)
  const method = validMethods.includes(rec.method) ? rec.method : 'long_rest'
  const validKinds = ['full', 'fixed', 'dice']
  const kind = validKinds.includes(rec.kind) ? rec.kind : 'full'
  const recovery = {
    method,
    kind: NO_AMOUNT_METHODS.has(method) ? 'full' : (DICE_ONLY_METHODS.has(method) ? 'dice' : kind),
    fixed: Math.max(0, Number(rec.fixed) || 0),
    diceCount: Math.max(1, Number(rec.diceCount) || 1),
    diceSides: Math.max(1, Number(rec.diceSides) || 6),
  }
  // effects
  const rawEffects = Array.isArray(value.effects) ? value.effects : []
  const effects = rawEffects.map((e) => {
    if (!e || typeof e !== 'object') return createChargeEffectEntry('spell')
    const type = ['spell', 'ability', 'shield'].includes(e.type) ? e.type : 'spell'
    const id = e.id || genId()
    if (type === 'spell') {
      return { id, type, value: createEmptyContainedSpellSub(e.value && typeof e.value === 'object' ? e.value : {}) }
    }
    if (type === 'ability') {
      const av = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        text: typeof av.text === 'string' ? av.text : '',
        uses: Math.max(1, Number(av.uses) || 1),
        diceCount: Math.max(0, Number(av.diceCount) || 0),
        diceSides: Math.max(1, Number(av.diceSides) || 10),
        abilityMod: typeof av.abilityMod === 'string' ? av.abilityMod : '',
        resultType: av.resultType === 'damage' ? 'damage' : 'heal',
      } }
    }
    if (type === 'shield') {
      const sv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: { amount: Math.max(1, Number(sv.amount) || 1) } }
    }
    return { id, type, value: {} }
  })
  return { charges, recovery, effects }
}

/** 回能方式是否支持自定义回能数量 */
export function recoverySupportsAmount(method) {
  return !NO_AMOUNT_METHODS.has(method)
}

/** 回能方式是否仅支持掷骰 */
export function recoveryIsDiceOnly(method) {
  return DICE_ONLY_METHODS.has(method)
}

/** 获取回能方式显示标签 */
export function getRecoveryMethodLabel(method) {
  return RECOVERY_METHODS.find((m) => m.value === method)?.label ?? method
}

/** 格式化回能描述 */
export function formatRecoveryBrief(recovery) {
  if (!recovery || typeof recovery !== 'object') return ''
  const methodLabel = getRecoveryMethodLabel(recovery.method)
  if (recovery.method === 'none') return methodLabel
  if (recovery.kind === 'full') return `${methodLabel}（回满）`
  if (recovery.kind === 'dice') return `${methodLabel} ${recovery.diceCount}d${recovery.diceSides}`
  return `${methodLabel} ${recovery.fixed}`
}

/** 格式化充能物品整体摘要 */
export function formatChargeItemBrief(value) {
  const norm = normalizeChargeItemValue(value)
  const parts = []
  parts.push(`${norm.charges} 充能`)
  parts.push(formatRecoveryBrief(norm.recovery))
  if (norm.effects.length > 0) {
    const effectLabels = norm.effects.map((e) => {
      if (e.type === 'spell') {
        const name = (e.value?.spellName || '').trim() || (e.value?.spellId ? '(法术)' : '(法术)')
        const cost = e.value?.cost ?? 1
        return `${name} ${cost}充能`
      }
      if (e.type === 'ability') {
        const text = (e.value?.text || '').trim() || '(奇能)'
        return `${text} ×${e.value?.uses ?? 1}`
      }
      if (e.type === 'shield') {
        return `护盾 ×${e.value?.amount ?? 1}`
      }
      return ''
    }).filter(Boolean)
    if (effectLabels.length) parts.push(effectLabels.join('；'))
  }
  return parts.join(' | ')
}

/** 属性名 → 中文标签（用于下拉显示） */
export const ABILITY_MOD_OPTIONS = [
  { value: '', label: '无修正' },
  { value: 'str', label: '力量' },
  { value: 'dex', label: '敏捷' },
  { value: 'con', label: '体质' },
  { value: 'int', label: '智力' },
  { value: 'wis', label: '感知' },
  { value: 'cha', label: '魅力' },
]

/** 职业等级修正：按角色主职业取等级 */
export const CLASS_LEVEL_MOD_OPTIONS = [
  { value: 'class_level', label: '职业等级' },
]

/** 所有可用的修正选项（属性 + 职业等级） */
export const ALL_MOD_OPTIONS = [
  { value: '', label: '无修正' },
  { value: 'str', label: '力量修正' },
  { value: 'dex', label: '敏捷修正' },
  { value: 'con', label: '体质修正' },
  { value: 'int', label: '智力修正' },
  { value: 'wis', label: '感知修正' },
  { value: 'cha', label: '魅力修正' },
  { value: 'class_level', label: '职业等级' },
]

export const RESULT_TYPE_OPTIONS = [
  { value: 'heal', label: '回血' },
  { value: 'damage', label: '伤害' },
]

/**
 * 解析 abilityMod 为数值
 * @param {string} abilityMod - '' | 'str' | 'dex' | ... | 'class_level'
 * @param {object} character - 角色数据
 * @returns {number} 修正值
 */
export function resolveAbilityMod(abilityMod, character) {
  if (!abilityMod || !character) return 0
  if (abilityMod === 'class_level') {
    return Math.max(0, Number(character.classLevel) || 0)
  }
  // 属性修正：abilityModifier 从 formulas.js 导入
  const score = character?.abilities?.[abilityMod] ?? 10
  return Math.floor((score - 10) / 2)
}

/**
 * 构建骰子表达式字符串
 * @param {object} abilityValue - ability 效果值
 * @param {object} character - 角色数据（用于解析修正值）
 * @returns {{ expr: string, mod: number }} expr 如 "2d10+5"，mod 为修正数值
 */
export function buildAbilityDiceExpr(abilityValue, character) {
  const count = abilityValue?.diceCount ?? 0
  const sides = abilityValue?.diceSides ?? 10
  const mod = resolveAbilityMod(abilityValue?.abilityMod, character)
  if (count <= 0) return { expr: '', mod }
  let expr = `${count}d${sides}`
  if (mod > 0) expr += `+${mod}`
  else if (mod < 0) expr += `${mod}`
  return { expr, mod }
}
