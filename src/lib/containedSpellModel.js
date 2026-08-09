/**
 * 内含法术（contained_spell）数据模型
 * 新结构：一个 effect 模块可包含多个法术，共享一个总充能池。
 *
 * value: {
 *   totalCharges: number, // 总能量（例如 50）
 *   spells: [
 *     {
 *       spellId?: string,
 *       spellName?: string,
 *       level: number,
 *       hitResolution: 'dex_save' | 'str_save' | ... | 'spell_attack',
 *       range?: string,
 *       area?: string,
 *       damageDiceCount: number,
 *       damageDiceSides: number,
 *       damageType?: string,
 *       cost: number, // 使用该法术消耗多少充能
 *     }
 *   ]
 * }
 */

import { getSpellById, SPELLS } from '../data/spellDatabase'

export const DEFAULT_CONTAINED_SPELL_SUB = {
  spellId: '',
  spellName: '',
  level: 1,
  hitResolution: 'dex_save',
  range: '',
  area: '',
  damageDiceCount: 1,
  damageDiceSides: 6,
  damageType: '',
  cost: 1,
}

export function createEmptyContainedSpellSub(overrides = {}) {
  return { ...DEFAULT_CONTAINED_SPELL_SUB, ...overrides }
}

export function createEmptyContainedSpellValue(overrides = {}) {
  return {
    totalCharges: 50,
    spells: [],
    ...overrides,
  }
}

const HIT_RESOLUTION_LIST = ['dex_save', 'str_save', 'con_save', 'wis_save', 'int_save', 'cha_save', 'spell_attack', 'none']
const DICE_SIDES_OPTS = [4, 6, 8, 10, 12]

function normalizeSub(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyContainedSpellSub()
  }
  const spellName = (value.spellName ?? '').trim()
  let spellId = (value.spellId ?? '').trim()
  // 如果只有 spellName 没有 spellId，尝试从法术大全反查
  if (!spellId && spellName) {
    const match = SPELLS.find((s) => s.name === spellName)
    if (match) spellId = match.id
  }
  const rawLevel = typeof value.level === 'number' ? value.level : parseInt(value.level, 10)
  const level = Number.isNaN(rawLevel) ? 1 : Math.max(0, Math.min(9, rawLevel))
  const hitResolution = HIT_RESOLUTION_LIST.includes(value.hitResolution) ? value.hitResolution : 'dex_save'
  const rawCost = typeof value.cost === 'number' ? value.cost : parseInt(value.cost, 10)
  const cost = Number.isNaN(rawCost) ? 1 : Math.max(0, rawCost)
  const rawDdc = typeof value.damageDiceCount === 'number' ? value.damageDiceCount : parseInt(value.damageDiceCount, 10)
  const damageDiceCount = Number.isNaN(rawDdc) ? 1 : Math.max(0, Math.min(99, rawDdc))
  let rawDds = typeof value.damageDiceSides === 'number' ? value.damageDiceSides : parseInt(value.damageDiceSides, 10)
  const damageDiceSides = DICE_SIDES_OPTS.includes(rawDds) ? rawDds : 6
  return {
    spellId,
    spellName,
    level,
    hitResolution,
    range: value.range ?? '',
    area: value.area ?? '',
    damageDiceCount,
    damageDiceSides,
    damageType: value.damageType ?? '',
    cost,
  }
}

/**
 * 把任意旧/新 value 归一化为新的 contained_spell 结构。
 * @param {*} value 旧单法术对象或新结构
 * @param {number} [entryCharge] 物品外层 entry.charge，作为总能量后备
 */
export function normalizeContainedSpellValue(value, entryCharge) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const total = Number(entryCharge) || 0
    return createEmptyContainedSpellValue({ totalCharges: total })
  }
  // 新结构
  if (Array.isArray(value.spells)) {
    const total = typeof value.totalCharges === 'number'
      ? value.totalCharges
      : (Number(entryCharge) || 0)
    return {
      totalCharges: total,
      spells: value.spells.map(normalizeSub),
    }
  }
  // 旧结构：单个法术对象
  const sub = normalizeSub(value)
  // 旧 value.charges 字段作为该法术的消耗（cost）；总能量优先取 entryCharge，否则取旧 charges
  const oldCharges = typeof value.charges === 'number' ? value.charges : parseInt(value.charges, 10)
  const cost = Number.isNaN(oldCharges) ? 1 : Math.max(0, oldCharges)
  const total = Number(entryCharge) || cost || 0
  return {
    totalCharges: total,
    spells: [{ ...sub, cost }],
  }
}

/**
 * 从效果列表中找出所有 contained_spell 并合并为一个新结构。
 * 用于旧数据迁移：多个独立 contained_spell effect 合并成一个。
 */
export function mergeContainedSpellEffects(effects, entryCharge) {
  if (!Array.isArray(effects)) return null
  const containedEffects = effects.filter((e) => e.effectType === 'contained_spell')
  if (containedEffects.length === 0) return null
  if (containedEffects.length === 1) {
    return normalizeContainedSpellValue(containedEffects[0].value, entryCharge)
  }
  const spells = []
  let totalCharges = 0
  containedEffects.forEach((e) => {
    const nv = normalizeContainedSpellValue(e.value, entryCharge)
    if (nv.spells.length) spells.push(...nv.spells)
    if (nv.totalCharges > totalCharges) totalCharges = nv.totalCharges
  })
  if (totalCharges === 0) totalCharges = Number(entryCharge) || 0
  return { totalCharges, spells }
}

/**
 * 判断 value 是否是新结构（含 spells 数组）
 */
export function isNewContainedSpellValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.spells)
}

/**
 * 获取总能量显示文本
 */
export function getContainedSpellTotalCharges(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0
  if (typeof value.totalCharges === 'number') return value.totalCharges
  const old = parseInt(value.charges, 10)
  return Number.isNaN(old) ? 0 : old
}

/**
 * 判断物品条目是否包含内含法术效果（用于决定背包/仓库是否显示充能列与施法按钮）
 */
export function hasContainedSpellEffect(entry) {
  return Array.isArray(entry?.effects) && entry.effects.some((e) => e?.effectType === 'contained_spell')
}
