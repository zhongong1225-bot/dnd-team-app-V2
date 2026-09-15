/**
 * 物品充能恢复规则：长休 / 短休 / 黎明
 * 由 entry.effects 中的 recharge_long_rest / recharge_dawn（旧版）
 * 或 charge_item 的 recovery（新版）驱动。
 * 新版每种恢复方式各自一份恢复量（回满 / 固定值 / 掷骰），充能总数可随角色等级缩放。
 */
import { rollDice } from '../data/weaponDatabase'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getRecoveryAmount, resolveChargeItemCharges } from './chargeItemModel'

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

/** 取出物品上的 charge_item 效果配置 */
function getChargeItemValue(entry) {
  const effects = Array.isArray(entry?.effects) ? entry.effects : []
  const eff = effects.find((e) => e?.effectType === 'charge_item' && e.value && typeof e.value === 'object')
  return eff?.value ?? null
}

/**
 * 物品充能上限：优先取 charge_item 配置的总充能（随角色等级缩放），
 * 其次物品行的 chargeMax，最后物品原型的充能上限。
 * @param {object} entry - 背包条目
 * @param {object} char - 角色数据（用于等级缩放，可缺省）
 */
export function getEntryChargeMax(entry, char = null) {
  if (entry == null) return null
  const cv = getChargeItemValue(entry)
  const resourceType = cv?.resourceType || 'charges'
  if (cv && resourceType === 'charges') {
    return resolveChargeItemCharges(cv, char)
  }
  if (entry.chargeMax != null && entry.chargeMax !== '') return Number(entry.chargeMax)
  const proto = entry.itemId ? getItemById(entry.itemId) : null
  if (proto?.充能上限 != null && proto.充能上限 !== '') return Number(proto.充能上限)
  return null
}

/**
 * 按某一种恢复方式计算恢复量（每种方式各自一份配置）
 * @param {object} recovery - charge_item 的 recovery
 * @param {string} method - 恢复方式 value
 * @param {number|null} chargeMax - 充能上限（回满时需要）
 * @param {number} current - 当前充能
 * @returns {{ amount: number, expression: string, rolls: Array }}
 */
export function computeRecoveryForMethod(recovery, method, chargeMax, current) {
  const cfg = getRecoveryAmount(recovery, method)
  const cur = Math.max(0, Number(current) || 0)
  if (cfg.kind === 'full') {
    const cap = chargeMax != null ? Number(chargeMax) : cur
    return { amount: Math.max(0, cap - cur), expression: '回满', rolls: [] }
  }
  if (cfg.kind === 'dice') {
    const diceExpr = `${cfg.diceCount}d${cfg.diceSides}`
    const { total, rolls } = rollDice(diceExpr)
    const bonus = cfg.diceBonus || 0
    return { amount: total + bonus, expression: bonus > 0 ? `${diceExpr}+${bonus}` : diceExpr, rolls }
  }
  const fixed = Math.max(0, cfg.fixed || 0)
  return { amount: fixed, expression: String(fixed), rolls: [] }
}

/**
 * 根据事件类型恢复全部物品充能
 * 同时支持旧版 recharge_long_rest/recharge_dawn 和新版 charge_item 两种数据模型。
 * @param {Array} inventory
 * @param {'long_rest' | 'short_rest' | 'dawn'} eventType
 * @param {object} char - 角色数据（充能上限随等级缩放时需要）
 * @returns {{ inventory: Array, logs: Array<{ name, from, to, restored, expression }> }}
 */
export function restoreChargesForEvent(inventory, eventType, char = null) {
  const targetKey = eventType === 'dawn' ? 'recharge_dawn' : (eventType === 'short_rest' ? 'recharge_short_rest' : 'recharge_long_rest')
  const next = []
  const logs = []
  for (const entry of inventory ?? []) {
    const effects = Array.isArray(entry?.effects) ? entry.effects : []

    /* ── 旧版：recharge_long_rest / recharge_dawn / recharge_short_rest ── */
    const legacyRecovery = effects.filter((e) => e?.effectType === targetKey)

    /* ── 新版：charge_item 内 recovery.method 匹配事件 ── */
    const cv = getChargeItemValue(entry)
    const rec = cv?.recovery && typeof cv.recovery === 'object' ? cv.recovery : null
    let ciRecovered = false
    let ciTotal = 0
    const ciExprParts = []
    if (rec) {
      const methodMatch = Array.isArray(rec.method) ? rec.method.includes(eventType) : rec.method === eventType
      if (methodMatch) {
        const current = Number(entry.charge) || 0
        const { amount, expression } = computeRecoveryForMethod(rec, eventType, getEntryChargeMax(entry, char), current)
        ciTotal = amount
        ciExprParts.push(expression)
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
    const chargeMax = getEntryChargeMax(entry, char)
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
