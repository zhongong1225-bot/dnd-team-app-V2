// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  parseUpcastDiceFromDescription,
  applyUpcastToDamageList,
  getEffectiveCastLevel,
} from './combatMeanUtils'

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
