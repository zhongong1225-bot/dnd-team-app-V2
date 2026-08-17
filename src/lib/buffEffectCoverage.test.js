import { describe, it, expect } from 'vitest'
import { computeBuffStats, calculateDamage } from '../hooks/useBuffCalculator'
import { getMergedBuffsForCalculator, getEffectsFromItem } from './effects/effectMapping'
import { BUFF_EFFECT_KEY_RUNTIME, getAllVisibleBuffEffectKeys } from './buffEffectRegistry'

const baseChar = () => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  level: 1,
  xp: 0,
  buffs: [],
  inventory: [],
  equipment: {},
})

describe('BUFF 效果类型登记：每个可见效果均有 calculator / metadata 分类', () => {
  it('登记完整', () => {
    const keys = getAllVisibleBuffEffectKeys()
    for (const key of keys) {
      expect(BUFF_EFFECT_KEY_RUNTIME[key], `未登记: ${key}`).toMatch(/^(calculator|metadata)$/)
    }
    for (const k of Object.keys(BUFF_EFFECT_KEY_RUNTIME)) {
      expect(keys.includes(k), `登记多余或隐藏键: ${k}`).toBe(true)
    }
  })
})

describe('computeBuffStats：代表性效果可改变输出', () => {
  it('BUFF 栏：AC +2', () => {
    const c = baseChar()
    const buffs = [{ id: '1', source: 't', effects: [{ effectType: 'ac_bonus', value: 2 }], enabled: true }]
    const s = computeBuffStats(c, buffs)
    expect(s.acBonus).toBe(2)
  })

  it('BUFF 栏：力量 +2（属性增加）', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [{ effectType: 'ability_score_uncapped', value: { str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.abilities.str).toBe(12)
  })

  it('BUFF 栏：属性增加默认上限 20', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [{ effectType: 'ability_score_uncapped', value: { str: 30, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.abilities.str).toBe(20)
  })

  it('BUFF 栏：属性增加勾选可突破20后上限 30', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [{ effectType: 'ability_score_uncapped', value: { str: 30, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, break20: { str: true } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.abilities.str).toBe(30)
  })

  it('BUFF 栏：火焰抗性', () => {
    const c = baseChar()
    const buffs = [
      { id: '1', source: 't', effects: [{ effectType: 'resist_type', value: ['火焰'] }], enabled: true },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.resistTypes).toContain('fire')
  })

  it('合并装备附魔：已装备物品 effects → 计入 DC', () => {
    const ringId = 'inv-ring-e2e'
    const c = {
      ...baseChar(),
      inventory: [
        {
          id: ringId,
          name: '测试戒指',
          isAttuned: true,
          effects: [{ effectType: 'save_dc_bonus', value: 3 }],
        },
      ],
      equippedHeld: [{ inventoryId: ringId }, { inventoryId: null }],
      equippedWorn: [],
    }
    const merged = getMergedBuffsForCalculator(c)
    const s = computeBuffStats(c, merged)
    expect(s.saveDcBonus).toBe(3)
  })

  it('物品 legacy：magicBonus → 近战命中', () => {
    const fx = getEffectsFromItem({ id: 'x', name: 'legacy', magicBonus: 2 })
    expect(fx.some((e) => e.effectType === 'attack_melee' && e.value === 2)).toBe(true)
    const c = baseChar()
    const s = computeBuffStats(c, [{ id: 'i', source: 'x', effects: fx, enabled: true }])
    expect(s.meleeAttackBonus).toBe(2)
  })

  it('custom_condition 不参与数值', () => {
    const c = baseChar()
    const s = computeBuffStats(c, [
      { id: '1', source: 'x', effects: [{ effectType: 'custom_condition', value: '任意描述' }], enabled: true },
    ])
    expect(s.acBonus).toBe(0)
    expect(s.meleeAttackBonus).toBe(0)
  })

  it('非属性类公式使用 BUFF 后属性：感知 +10 后 AC 感知调整值按 +5 计算', () => {
    const c = { ...baseChar(), abilities: { ...baseChar().abilities, wis: 10 } }
    const buffs = [
      { id: '1', source: 'x', effects: [{ effectType: 'ability_score_uncapped', value: { wis: 10 } }], enabled: true },
      { id: '2', source: 'y', effects: [{ effectType: 'ac_bonus', value: { ref: 'abilityModifier', ability: 'wis' } }], enabled: true },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.abilities.wis).toBe(20)
    expect(s.ac).toBe(15) // 10 基础 + 0 敏调 + 5 感知调整值
  })

  it('属性类公式使用基础属性：ability_score_uncapped 的感知调整值按基础感知计算', () => {
    const c = { ...baseChar(), abilities: { ...baseChar().abilities, wis: 16 } }
    const buffs = [
      {
        id: '1',
        source: 'x',
        effects: [{ effectType: 'ability_score_uncapped', value: { wis: { ref: 'abilityModifier', ability: 'wis' } } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    // 基础感知 16 调值 +3，ability_score_uncapped 按基础属性求值，最终感知 = 16 + 3 = 19
    expect(s.abilities.wis).toBe(19)
  })

  it('BUFF 栏：属性熟练调整授予力量豁免熟练', () => {
    const c = baseChar()
    const buffs = [
      {
        id: '1',
        source: 't',
        effects: [{ effectType: 'ability_score', value: { str: true, dex: false, con: false, int: false, wis: false, cha: false } }],
        enabled: true,
      },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.saveProficiencyGranted.str).toBe(true)
    expect(s.saveProficiencyGranted.dex).toBe(false)
  })

  it('proficiency_override 影响公式引用', () => {
    const c = baseChar()
    const buffs = [
      { id: '1', source: 'x', effects: [{ effectType: 'proficiency_override', value: 6 }], enabled: true },
      { id: '2', source: 'y', effects: [{ effectType: 'ac_bonus', value: { ref: 'proficiency' } }], enabled: true },
    ]
    const s = computeBuffStats(c, buffs)
    expect(s.proficiencyOverride).toBe(6)
    expect(s.ac).toBe(16) // 10 基础 + 0 敏调 + 6 熟练
  })
})

describe('calculateDamage：抗性 / 减免 / 穿透', () => {
  it('火焰抗性减半', () => {
    const buffStats = {
      resistTypes: ['fire'],
      immuneTypes: [],
      vulnerableTypes: [],
      dmgTypeBonus: {},
      ignoreResistanceTypes: [],
      damageReduction: 0,
    }
    expect(calculateDamage(10, '火焰', buffStats)).toBe(5)
  })

  it('伤害减免 3', () => {
    const buffStats = {
      resistTypes: [],
      immuneTypes: [],
      vulnerableTypes: [],
      dmgTypeBonus: {},
      ignoreResistanceTypes: [],
      damageReduction: 3,
    }
    expect(calculateDamage(10, '火焰', buffStats)).toBe(7)
  })
})
