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
        diceBonus: Math.max(0, Number(value.diceBonus) || 0),
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
    const bonus = norm.diceBonus || 0
    return { amount: total + bonus, expression: bonus > 0 ? `${expression}+${bonus}` : expression, rolls }
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
 * 同时支持旧版 recharge_long_rest/recharge_dawn 和新版 charge_item 两种数据模型。
 * @param {Array} inventory
 * @param {'long_rest' | 'short_rest' | 'dawn'} eventType
 * @returns {{ inventory: Array, logs: Array<{ name, from, to, restored, expression }> }}
 */
export function restoreChargesForEvent(inventory, eventType) {
  const targetKey = eventType === 'dawn' ? 'recharge_dawn' : (eventType === 'short_rest' ? 'recharge_short_rest' : 'recharge_long_rest')
  const next = []
  const logs = []
  for (const entry of inventory ?? []) {
    const effects = Array.isArray(entry?.effects) ? entry.effects : []

    /* ── 旧版：recharge_long_rest / recharge_dawn / recharge_short_rest ── */
    const legacyRecovery = effects.filter((e) => e?.effectType === targetKey)

    /* ── 新版：charge_item 内 recovery.method 匹配事件 ── */
    const chargeItemEffect = effects.find((e) => e?.effectType === 'charge_item' && e.value && typeof e.value === 'object')
    let ciRecovered = false
    let ciTotal = 0
    const ciExprParts = []
    if (chargeItemEffect) {
      const cv = chargeItemEffect.value
      const rec = cv.recovery && typeof cv.recovery === 'object' ? cv.recovery : null
      if (rec && rec.method === eventType) {
        const maxCharge = typeof cv.charges === 'number' ? cv.charges : (getEntryChargeMax(entry) ?? null)
        const current = Number(entry.charge) || 0
        if (rec.kind === 'full') {
          ciTotal = (maxCharge != null ? maxCharge : current) - current
          ciExprParts.push(`回满`)
        } else if (rec.kind === 'dice') {
          const diceExpr = `${Math.max(1, Number(rec.diceCount) || 1)}d${Math.max(1, Number(rec.diceSides) || 6)}`
          const { total, rolls } = rollDice(diceExpr)
          const bonus = Math.max(0, Number(rec.diceBonus) || 0)
          ciTotal = total + bonus
          ciExprParts.push(bonus > 0 ? `${diceExpr}+${bonus}` : diceExpr)
        } else {
          // fixed
          ciTotal = Math.max(0, Number(rec.fixed) || 0)
          ciExprParts.push(String(ciTotal))
        }
        ciRecovered = true
      }
    }

    if (legacyRecovery.length === 0 && !ciRecovered) {
      next.push(entry)
      continue
    }

    // 计算旧版恢复量
    let legacyTotal = 0
    const legacyExprParts = []
    for (const e of legacyRecovery) {
      const { amount, expression } = computeRecoveryAmount(e.value)
      legacyTotal += amount
      legacyExprParts.push(expression)
    }

    const total = legacyTotal + ciTotal
    const chargeMax = getEntryChargeMax(entry)
    const current = Number(entry.charge) || 0
    const nextCharge = chargeMax != null ? Math.min(current + total, chargeMax) : current + total
    next.push({ ...entry, charge: nextCharge })
    const allExpr = [...legacyExprParts, ...ciExprParts].join('+')
    logs.push({
      name: getEntryDisplayName(entry),
      from: current,
      to: nextCharge,
      restored: nextCharge - current,
      expression: allExpr,
    })
  }
  return { inventory: next, logs }
}
