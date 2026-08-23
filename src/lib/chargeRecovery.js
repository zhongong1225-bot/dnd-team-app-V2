import { rollDice } from '../data/weaponDatabase'

export function normalizeChargeRecoveryValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const kind = value.kind === 'dice' ? 'dice' : 'fixed'
    return {
      kind,
      fixed: Math.max(0, Number(value.fixed) || 0),
      diceCount: Math.max(1, Number(value.diceCount) || 1),
      diceSides: Math.max(1, Number(value.diceSides) || 6),
    }
  }
  const n = Number(value)
  if (!Number.isNaN(n) && value !== '' && value != null) {
    return { kind: 'fixed', fixed: Math.max(0, n), diceCount: 1, diceSides: 6 }
  }
  return { kind: 'fixed', fixed: 1, diceCount: 1, diceSides: 6 }
}

function getRecoveryEffectType(eventType) {
  if (eventType === 'dawn') return 'recharge_dawn'
  if (eventType === 'long_rest') return 'recharge_long_rest'
  return null
}

function computeRecoveryAmount(norm) {
  if (norm.kind === 'dice') {
    const expr = `${norm.diceCount}d${norm.diceSides}`
    const result = rollDice(expr)
    return { amount: result.total, expression: expr }
  }
  return { amount: norm.fixed, expression: '' }
}

export function restoreChargesForEvent(inventory, eventType) {
  const inv = Array.isArray(inventory) ? inventory : []
  const targetType = getRecoveryEffectType(eventType)
  if (!targetType) return { inventory: inv, logs: [] }

  const logs = []
  const next = inv.map((entry) => {
    const effects = Array.isArray(entry?.effects) ? entry.effects : []
    const recoveryEffect = effects.find((e) => e?.effectType === targetType)
    if (!recoveryEffect) return entry

    const chargeMax = Number(entry.chargeMax)
    if (!Number.isFinite(chargeMax) || chargeMax <= 0) return entry

    const current = Number(entry.charge) || 0
    if (current >= chargeMax) return entry

    const norm = normalizeChargeRecoveryValue(recoveryEffect.value)
    const { amount, expression } = computeRecoveryAmount(norm)
    const nextCharge = Math.min(chargeMax, current + amount)
    const restored = nextCharge - current
    if (restored <= 0) return entry

    logs.push({
      name: entry.name || '未命名物品',
      from: current,
      to: nextCharge,
      restored,
      expression,
    })
    return { ...entry, charge: nextCharge }
  })

  return { inventory: next, logs }
}
