// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  parseUpcastDiceFromDescription,
  applyUpcastToDamageList,
  getEffectiveCastLevel,
  computePhysicalWeaponStats,
  sanitizeLegacyCombatMeans,
} from './combatMeanUtils'
import { getItemById } from '../../data/itemDatabase'

const FIREBALL_DESC =
  '明亮的闪光从你的指间飞驰向施法距离内你指定的一点，并随着一声低吼迸成一片烈焰。目标点周围半径20尺球状区域内的每个生物必须进行一次敏捷豁免。豁免失败者将受到8d6点火焰伤害，豁免成功则伤害减半。\n区域内所有未被着装或携带的可燃物件会开始燃烧。\n升环施法：使用的法术位每比三环高一环，此伤害就增加1d6。'

describe('parseUpcastDiceFromDescription', () => {
  it('解析火球术的“增加1d6”（无显式类型）', () => {
    expect(parseUpcastDiceFromDescription(FIREBALL_DESC)).toEqual({ count: 1, sides: '6', typeRaw: '' })
  })

  it('解析“提高”“提升”动词与显式类型', () => {
    expect(parseUpcastDiceFromDescription('升环施法：使用的法术位每比一环高一环，伤害就提高1d8。'))
      .toEqual({ count: 1, sides: '8', typeRaw: '' })
    expect(parseUpcastDiceFromDescription('升环施法：使用的法术位每比一环高一环，寒冷伤害就提高1d6。'))
      .toEqual({ count: 1, sides: '6', typeRaw: '寒冷' })
    expect(parseUpcastDiceFromDescription('升环施法：你使用的法术位每比一环高一环，此法术的伤害就会提升1d6。'))
      .toEqual({ count: 1, sides: '6', typeRaw: '' })
  })

  it('治疗升环与非骰子升环不匹配', () => {
    expect(parseUpcastDiceFromDescription('升环施法：使用的法术位每比一环高一环，此法术的治疗量就增加2d8点。')).toBeNull()
    expect(parseUpcastDiceFromDescription('升环施法：你使用的法术位每比一环高一环，临时生命和寒冷伤害就各提升5。')).toBeNull()
    expect(parseUpcastDiceFromDescription('升环施法：你使用的法术位每比一环高一环，就可以多选择一个野兽作为目标。')).toBeNull()
  })
})

describe('applyUpcastToDamageList', () => {
  const fireballBase = [{ dice: '8d6', type: '火焰' }]

  it('火球术 +1 环 → 9d6 火焰（继承类型，不追加钝击）', () => {
    expect(applyUpcastToDamageList(fireballBase, FIREBALL_DESC, 1)).toEqual([{ dice: '9d6', type: '火焰' }])
  })

  it('火球术 +2 环 → 10d6 火焰', () => {
    expect(applyUpcastToDamageList(fireballBase, FIREBALL_DESC, 2)).toEqual([{ dice: '10d6', type: '火焰' }])
  })

  it('levelDiff 为 0 时原样返回', () => {
    expect(applyUpcastToDamageList(fireballBase, FIREBALL_DESC, 0)).toEqual(fireballBase)
  })

  it('显式类型升环合并进同类型项', () => {
    const base = [{ dice: '3d8', type: '寒冷' }]
    const desc = '升环施法：使用的法术位每比一环高一环，寒冷伤害就提高1d8。'
    expect(applyUpcastToDamageList(base, desc, 2)).toEqual([{ dice: '5d8', type: '寒冷' }])
  })

  it('无升环描述时原样返回', () => {
    expect(applyUpcastToDamageList(fireballBase, '一段没有升环施法的描述。', 3)).toEqual(fireballBase)
  })
})

describe('getEffectiveCastLevel', () => {
  it('消耗环位 + 增强施法者等级', () => {
    expect(getEffectiveCastLevel(3, 3, 1)).toBe(4)
    expect(getEffectiveCastLevel(3, 3, 0)).toBe(3)
    expect(getEffectiveCastLevel('3', 3, 2)).toBe(5)
  })

  it('未指定消耗环位时回退到法术基础环位', () => {
    expect(getEffectiveCastLevel('', 3, 1)).toBe(4)
    expect(getEffectiveCastLevel(0, 5, 1)).toBe(6)
  })

  it('封顶 9 环', () => {
    expect(getEffectiveCastLevel(9, 3, 2)).toBe(9)
    expect(getEffectiveCastLevel(8, 3, 5)).toBe(9)
  })

  it('戏法（0 环）不升环', () => {
    expect(getEffectiveCastLevel(0, 0, 3)).toBe(0)
    expect(getEffectiveCastLevel('', 0, 2)).toBe(0)
  })
})

function optFor(itemId) {
  const proto = getItemById(itemId)
  return { entry: { id: 'inv_x', itemId }, proto, name: proto.类别, 攻击: proto.攻击, 伤害: proto.伤害 }
}
const CTX = {
  effectiveAbilities: { str: 6, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  prof: 3, spellAbility: 'int', buffStats: {}, flatBuffEffects: [], itemFormulaContext: {},
}
const cm = (over) => ({ type: 'physical', weaponProficient: true, gains: [], ...over })

describe('computePhysicalWeaponStats 属性调整值门控', () => {
  // 副手用例用手斧而非匕首：匕首附注含「灵巧」会被推断为 dex 属性，测不到 str 门控
  it('熟练 + 主手 → 命中加熟练、伤害加调整值', () => {
    const s = computePhysicalWeaponStats(cm({}), optFor('longsword'), CTX)
    expect(s.abilityMod).toBe(-2)
    expect(s.physicalAttackBonus).toBe(-2 + 3)
    expect(s.damageMod).toBe(-2)
    expect(s.canAddAbilityMod).toBe(true)
    expect(s.totalDamageMod).toBe(-2)
  })

  it('不熟练 → 命中不加熟练加值', () => {
    const s = computePhysicalWeaponStats(cm({ weaponProficient: false }), optFor('longsword'), CTX)
    expect(s.physicalAttackBonus).toBe(-2)
    expect(s.damageMod).toBe(-2)
  })

  it('不熟练 + 正调整值 → 伤害为 0', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 } }
    const s = computePhysicalWeaponStats(cm({ weaponProficient: false }), optFor('longsword'), ctx)
    expect(s.abilityMod).toBe(5)
    expect(s.damageMod).toBe(0)
    expect(s.canAddAbilityMod).toBe(false)
    expect(s.totalDamageMod).toBe(0)
  })

  it('副手附赠攻击 → 不加调整值（正数被剥夺）', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 } }
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('handaxe'), ctx)
    expect(s.damageMod).toBe(0)
    expect(s.canAddAbilityMod).toBe(false)
  })

  it('副手附赠攻击被剥夺属性调整值 → BUFF 给的伤害加值照常生效（规则只剥夺属性调整值）', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 }, buffStats: { meleeDamageBonus: 3 } }
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('handaxe'), ctx)
    expect(s.damageMod).toBe(0)
    expect(s.totalDamageMod).toBe(3)
  })

  it('副手附赠攻击 + 双武器战斗效果 → 加调整值', () => {
    const ctx = { ...CTX, effectiveAbilities: { ...CTX.effectiveAbilities, str: 20 }, buffStats: { twoWeaponFightingBonus: true } }
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('handaxe'), ctx)
    expect(s.damageMod).toBe(5)
  })

  it('规则原文"除非为负数"：负调整值被剥夺时仍照常扣', () => {
    const s = computePhysicalWeaponStats(cm({ weaponVersatileMode: 'bonus_action' }), optFor('handaxe'), CTX)
    expect(s.abilityMod).toBe(-2)
    expect(s.damageMod).toBe(-2)
  })
})

describe('sanitizeLegacyCombatMeans', () => {
  it('清掉物理条目并把引用它的组合技解绑', () => {
    const raw = [
      { id: 'cm_0_physical', type: 'physical', weaponInventoryIndex: 2 },
      { id: 'cm_1_spell', type: 'spell_attack', spellName: '火焰箭' },
      { id: 'cm_2_combo', type: 'combo', primaryMeanId: 'cm_0_physical', attachments: [{ name: '至圣斩' }] },
      { id: 'cm_3_combo', type: 'combo', primaryMeanId: 'cm_1_spell', attachments: [] },
    ]
    const out = sanitizeLegacyCombatMeans(raw)
    expect(out.map((m) => m.id)).toEqual(['cm_1_spell', 'cm_2_combo', 'cm_3_combo'])
    expect(out[1].primaryMeanId).toBe(null)
    expect(out[2].primaryMeanId).toBe('cm_1_spell')
  })

  it('无物理条目时返回同一引用（避免无谓重渲染）', () => {
    const raw = [{ id: 'a', type: 'spell_attack' }]
    expect(sanitizeLegacyCombatMeans(raw)).toBe(raw)
  })

  it('非物理条目原样保留字段', () => {
    const raw = [{ id: 'i', type: 'item', itemInventoryIndex: 0 }]
    expect(sanitizeLegacyCombatMeans(raw)).toEqual(raw)
  })

  it('老存档没写 type 的武器条目也要清掉，并解绑引用它的组合技', () => {
    const raw = [
      { id: 'legacy_0', weaponInventoryIndex: 1 },
      { id: 'c', type: 'combo', primaryMeanId: 'legacy_0', attachments: [] },
    ]
    const out = sanitizeLegacyCombatMeans(raw)
    expect(out.map((m) => m.id)).toEqual(['c'])
    expect(out[0].primaryMeanId).toBe(null)
  })

  it('type 拼错/未知值按物理处理（与 normalizeCombatMeanType 同口径）', () => {
    const raw = [
      { id: 'x', type: 'melee' },
      { id: 's', type: 'spell' },
      { id: 'c', type: 'combo', primaryMeanId: 'x', attachments: [] },
    ]
    const out = sanitizeLegacyCombatMeans(raw)
    expect(out.map((m) => m.id)).toEqual(['s', 'c'])
    expect(out[1].primaryMeanId).toBe(null)
  })

  it('传入非数组时返回空数组', () => {
    expect(sanitizeLegacyCombatMeans(undefined)).toEqual([])
    expect(sanitizeLegacyCombatMeans(null)).toEqual([])
    expect(sanitizeLegacyCombatMeans([])).toEqual([])
  })
})
