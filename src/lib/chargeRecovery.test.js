import { describe, it, expect } from 'vitest'
import { restoreChargesForEvent, getEntryChargeMax, computeRecoveryForMethod } from './chargeRecovery'
import { normalizeChargeItemValue, formatRecoveryBrief, resolveChargeItemCharges } from './chargeItemModel'

function entryWith(charge, value) {
  return { id: 'i1', name: '测试法杖', charge, effects: [{ effectType: 'charge_item', value }] }
}

const warrior5 = { class: '战士', classLevel: 5 }
const warrior11 = { class: '战士', classLevel: 11 }

describe('每种恢复方式各自一份恢复量', () => {
  const value = normalizeChargeItemValue({
    charges: 5,
    recovery: {
      method: ['short_rest', 'long_rest'],
      amounts: {
        short_rest: { kind: 'fixed', fixed: 1 },
        long_rest: { kind: 'full' },
      },
    },
  })

  it('短休只按短休那一档恢复', () => {
    const { inventory, logs } = restoreChargesForEvent([entryWith(0, value)], 'short_rest')
    expect(inventory[0].charge).toBe(1)
    expect(logs[0].expression).toBe('1')
  })

  it('长休按长休那一档回满', () => {
    const { inventory, logs } = restoreChargesForEvent([entryWith(1, value)], 'long_rest')
    expect(inventory[0].charge).toBe(5)
    expect(logs[0].expression).toBe('回满')
  })

  it('未启用的方式不触发恢复', () => {
    const { inventory, logs } = restoreChargesForEvent([entryWith(0, value)], 'dawn')
    expect(inventory[0].charge).toBe(0)
    expect(logs).toHaveLength(0)
  })

  it('吸能类方式只能掷骰，即使配成回满也被纠正', () => {
    const v = normalizeChargeItemValue({
      charges: 2,
      recovery: { method: ['absorb_energy'], amounts: { absorb_energy: { kind: 'full' } } },
    })
    expect(v.recovery.amounts.absorb_energy.kind).toBe('dice')
  })

  it('旧数据（无 amounts，只有顶层共享字段）仍可恢复', () => {
    const legacy = { charges: 4, recovery: { method: 'dawn', kind: 'fixed', fixed: 2 } }
    const { inventory } = restoreChargesForEvent([entryWith(0, legacy)], 'dawn')
    expect(inventory[0].charge).toBe(2)
  })

  it('掷骰档落在骰子区间内', () => {
    const rec = { method: ['long_rest'], amounts: { long_rest: { kind: 'dice', diceCount: 2, diceSides: 6, diceBonus: 1 } } }
    const { amount, expression } = computeRecoveryForMethod(rec, 'long_rest', 99, 0)
    expect(expression).toBe('2d6+1')
    expect(amount).toBeGreaterThanOrEqual(3)
    expect(amount).toBeLessThanOrEqual(13)
  })
})

describe('充能总数随等级提高', () => {
  const value = normalizeChargeItemValue({
    charges: 3,
    levelScaling: [{ className: '战士', level: 11, charges: 6 }],
    recovery: { method: ['long_rest'], amounts: { long_rest: { kind: 'full' } } },
  })

  it('未到阈值时用基础充能数', () => {
    expect(resolveChargeItemCharges(value, warrior5)).toBe(3)
    expect(getEntryChargeMax(entryWith(0, value), warrior5)).toBe(3)
  })

  it('达到阈值后用缩放后的充能数', () => {
    expect(resolveChargeItemCharges(value, warrior11)).toBe(6)
    expect(getEntryChargeMax(entryWith(0, value), warrior11)).toBe(6)
  })

  it('回满按当前等级的上限封顶', () => {
    expect(restoreChargesForEvent([entryWith(0, value)], 'long_rest', warrior5).inventory[0].charge).toBe(3)
    expect(restoreChargesForEvent([entryWith(0, value)], 'long_rest', warrior11).inventory[0].charge).toBe(6)
  })

  it('固定值恢复也不越级上限', () => {
    const v = normalizeChargeItemValue({
      charges: 3,
      levelScaling: [{ className: '战士', level: 11, charges: 6 }],
      recovery: { method: ['long_rest'], amounts: { long_rest: { kind: 'fixed', fixed: 9 } } },
    })
    expect(restoreChargesForEvent([entryWith(0, v)], 'long_rest', warrior5).inventory[0].charge).toBe(3)
    expect(restoreChargesForEvent([entryWith(0, v)], 'long_rest', warrior11).inventory[0].charge).toBe(6)
  })

  it('无缩放配置时上限就是基础充能数', () => {
    const plain = normalizeChargeItemValue({ charges: 2 })
    expect(getEntryChargeMax(entryWith(0, plain), warrior11)).toBe(2)
  })
})

describe('恢复摘要文案', () => {
  it('各方式恢复量不同时逐方式列出', () => {
    const rec = normalizeChargeItemValue({
      charges: 5,
      recovery: {
        method: ['short_rest', 'long_rest'],
        amounts: { short_rest: { kind: 'fixed', fixed: 1 }, long_rest: { kind: 'full' } },
      },
    }).recovery
    expect(formatRecoveryBrief(rec)).toBe('短休回1，长休回满')
  })

  it('各方式恢复量相同时合并标签', () => {
    const rec = normalizeChargeItemValue({
      charges: 5,
      recovery: { method: ['short_rest', 'long_rest'] },
    }).recovery
    expect(formatRecoveryBrief(rec)).toBe('短休、长休回满')
  })

  it('黎明与吸能用「恢复」动词', () => {
    const dawn = normalizeChargeItemValue({
      charges: 3,
      recovery: { method: ['dawn'], amounts: { dawn: { kind: 'fixed', fixed: 3 } } },
    }).recovery
    expect(formatRecoveryBrief(dawn)).toBe('黎明恢复3')

    const react = normalizeChargeItemValue({
      charges: 3,
      recovery: { method: ['reaction_absorb'], amounts: { reaction_absorb: { kind: 'dice', diceCount: 2, diceSides: 6 } } },
    }).recovery
    expect(formatRecoveryBrief(react)).toBe('反应恢复2d6')
  })

  it('无法恢复显示「不恢复」', () => {
    const rec = normalizeChargeItemValue({ charges: 1, recovery: { method: ['none'] } }).recovery
    expect(formatRecoveryBrief(rec)).toBe('不恢复')
  })
})
