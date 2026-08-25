/**
 * 物品充能恢复规则：长休 / 黎明
 * 由 entry.effects 中的 recharge_long_rest / recharge_dawn 驱动，
 * 支持固定值或 XdX 随机恢复。
 */
import { rollDice } from '../data/weaponDatabase'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'

export const RECHARGE_EFFECT_KEYS = ['recharge_long_rest', 'recharge_dawn']

function getEntryDisplayName(entry) {
  if (!entry) return '未命名物品'
  const customName = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (customName) return customName
  const proto = entry.itemId ? getItemById(entry.itemId) : null
  return getItemDisplayName(proto) || '未命名物品'
}

export function normalizeChargeRecoveryValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const kind = value.kind === 'dice' ? 'dice' : 'fixed'
    if (kind === 'dice') {
      return {
        kind,
        diceCount: Math.max(1, Number(value.diceCount) || 1),
        diceSides: Math.max(1, Number(value.diceSides) || 6),
      }
    }
    return { kind, fixed: Math.max(0, Number(value.fixed) || 0) }
  }
  const n = Number(value) || 0
  return { kind: 'fixed', fixed: Math.max(0, n) }
}

export function computeRecoveryAmount(value) {
  const norm = normalizeChargeRecoveryValue(value)
  if (norm.kind === 'dice') {
    const expression = `${norm.diceCount}d${norm.diceSides}`
    const { total, rolls } = rollDice(expression)
    return { amount: total, expression, rolls }
  }
  return { amount: norm.fixed, expression: String(norm.fixed), rolls: [] }
}

export function getEntryChargeMax(entry) {
  if (entry == null) return null
  if (entry.chargeMax != null && entry.chargeMax !== '') return Number(entry.chargeMax)
  const proto = entry.itemId ? getItemById(entry.itemId) : null
  if (proto?.充能上限 != null && proto.充能上限 !== '') return Number(proto.充能上限)
  return null
}

/**
 * 根据事件类型恢复全部物品充能
 * @param {Array} inventory
 * @param {'long_rest' | 'dawn'} eventType
 * @returns {{ inventory: Array, logs: Array<{ name, from, to, restored, expression }> }}
 */
export function restoreChargesForEvent(inventory, eventType) {
  const targetKey = eventType === 'dawn' ? 'recharge_dawn' : 'recharge_long_rest'
  const next = []
  const logs = []
  for (const entry of inventory ?? []) {
    const effects = Array.isArray(entry?.effects) ? entry.effects : []
    const recoveryEffects = effects.filter((e) => e?.effectType === targetKey)
    if (recoveryEffects.length === 0) {
      next.push(entry)
      continue
    }
    let total = 0
    const expressionParts = []
    for (const e of recoveryEffects) {
      const { amount, expression } = computeRecoveryAmount(e.value)
      total += amount
      expressionParts.push(expression)
    }
    const chargeMax = getEntryChargeMax(entry)
    const current = Number(entry.charge) || 0
    const nextCharge = chargeMax != null ? Math.min(current + total, chargeMax) : current + total
    next.push({ ...entry, charge: nextCharge })
    logs.push({
      name: getEntryDisplayName(entry),
      from: current,
      to: nextCharge,
      restored: nextCharge - current,
      expression: expressionParts.join('+'),
    })
  }
  return { inventory: next, logs }
}
