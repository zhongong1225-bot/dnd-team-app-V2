// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  parseUpcastDiceFromDescription,
  applyUpcastToDamageList,
  getEffectiveCastLevel,
  getCombatMeanLabel,
  getWeaponMeanDisplayName,
  deriveDisabledAutoGainKeys,
  computePhysicalWeaponStats,
  sanitizeLegacyCombatMeans,
  computeLiveGains,
  getWeaponModeOptions,
  weaponProficiencyNote,
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
    // 未受影响的元素必须是同一个对象：调用方靠引用比较决定是否写回/重渲染
    expect(out[0]).toBe(raw[1])
    expect(out[2]).toBe(raw[3])
    expect(out[1]).not.toBe(raw[2])
    // 解绑只改 primaryMeanId，其余字段一个都不能丢
    expect(out[0].spellName).toBe('火焰箭')
    expect(out[1].attachments).toEqual([{ name: '至圣斩' }])
  })

  it('无物理条目时返回同一引用（避免无谓重渲染）', () => {
    const raw = [{ id: 'a', type: 'spell_attack' }]
    expect(sanitizeLegacyCombatMeans(raw)).toBe(raw)
  })

  it('发生清理时，未受影响的 item 条目仍是同一对象且 itemInventoryIndex 不丢', () => {
    const raw = [
      { id: 'p', type: 'physical', weaponInventoryIndex: 3 },
      { id: 'i', type: 'item', itemInventoryIndex: 0 },
    ]
    const out = sanitizeLegacyCombatMeans(raw)
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(raw[1])
    expect(out[0].itemInventoryIndex).toBe(0)
  })

  it('物理条目缺 id 时，primaryMeanId 缺失的组合技不被改写', () => {
    const raw = [
      { type: 'physical', weaponInventoryIndex: 1 },
      { id: 'c1', type: 'combo', attachments: [] },
      { id: 'c2', type: 'combo', primaryMeanId: undefined, attachments: [] },
    ]
    const out = sanitizeLegacyCombatMeans(raw)
    expect(out.map((m) => m.id)).toEqual(['c1', 'c2'])
    expect(out[0]).toBe(raw[1])
    expect(out[1]).toBe(raw[2])
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

describe('computeLiveGains', () => {
  const buffsFrom = (effects) => [{ id: 'b', name: 'x', enabled: true, effects }]
  const mean = { type: 'spell_attack', spellName: '灼热之手', gains: [{ id: 'g0', type: 'damageBonus', value: 1, enabled: true }] }

  it('不持久化：同一入参重复调用返回完全相同的结果（含 id）', () => {
    const a = computeLiveGains(mean, { buffStats: {}, mergedBuffs: buffsFrom([{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }]) })
    const b = computeLiveGains(mean, { buffStats: {}, mergedBuffs: buffsFrom([{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }]) })
    expect(a).toEqual(b)
  })

  it('自动增益 id 确定性，手动增益保留原 id', () => {
    const live = computeLiveGains(mean, { buffStats: {}, mergedBuffs: buffsFrom([{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }]) })
    expect(live.find((g) => g.auto).id).toBe('auto_damageBonus')
    expect(live.find((g) => !g.auto).id).toBe('g0')
  })

  it('保留手动增益', () => {
    const live = computeLiveGains(mean, { buffStats: {}, mergedBuffs: [] })
    expect(live.some((g) => g.type === 'damageBonus' && g.value === 1 && !g.auto)).toBe(true)
  })

  it('按 disabledAutoGainKeys 只关掉现算的自动增益，不动玩家手建的同类', () => {
    const card = {
      ...mean,
      gains: [...mean.gains, { id: 'g1', type: 'extraDice', dice: '1d6 钝击', enabled: true }],
      disabledAutoGainKeys: ['extraDice'],
    }
    const live = computeLiveGains(card, {
      buffStats: {},
      mergedBuffs: buffsFrom([{ effectType: 'extra_damage_dice', scope: 'global', scopeDetail: [], value: '2d6 火焰' }]),
    })
    expect(live.filter((g) => g.type === 'extraDice').map((g) => g.id)).toEqual(['g1'])
  })

  it('存档快照里残留的 auto 条目被丢弃，不参与现算结果', () => {
    const card = { ...mean, gains: [...mean.gains, { id: 'auto_damageBonus', type: 'damageBonus', value: 9, enabled: true, auto: true }] }
    const live = computeLiveGains(card, { buffStats: {}, mergedBuffs: [] })
    expect(live.some((g) => g.value === 9)).toBe(false)
  })

  it('传 primaryForGains 时自动部分按主卡反推（组合技取其主武器卡的加成）', () => {
    const primary = { type: 'physical', weaponInventoryIndex: 0, gains: [] }
    const character = { inventory: [{ id: 'inv_0', itemId: 'longsword' }] }
    // physical_attack 范围只匹配物理来源：组合技自身不算，只有主卡算，故可据此判别取数源
    const opts = { buffStats: {}, mergedBuffs: buffsFrom([{ effectType: 'damage_bonus', scope: 'physical_attack', scopeDetail: [], value: 2 }]), character }
    const combo = { type: 'combo', gains: [], primaryMeanId: 'wielded_inv_0' }
    expect(computeLiveGains(combo, opts).some((g) => g.type === 'damageBonus')).toBe(false)
    expect(computeLiveGains(combo, { ...opts, primaryForGains: primary }).some((g) => g.type === 'damageBonus')).toBe(true)
  })

  it('源 BUFF 消失后不留残值', () => {
    const withBuff = computeLiveGains(mean, { buffStats: {}, mergedBuffs: buffsFrom([{ effectType: 'dice_floor_2', scope: 'global', scopeDetail: [], value: true }]) })
    expect(withBuff.some((g) => g.type === 'diceFloor2')).toBe(true)
    const without = computeLiveGains(mean, { buffStats: {}, mergedBuffs: [] })
    expect(without.some((g) => g.type === 'diceFloor2')).toBe(false)
  })

  it('自动与手动同类型共存时两条都保留（不互相覆盖）', () => {
    const live = computeLiveGains(mean, { buffStats: {}, mergedBuffs: buffsFrom([{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }]) })
    expect(live.filter((g) => g.type === 'damageBonus')).toHaveLength(2)
    expect(live.filter((g) => g.type === 'damageBonus').every((g) => g.enabled !== false)).toBe(true)
  })
})

describe('getCombatMeanLabel / getWeaponMeanDisplayName 武器命名口径', () => {
  const derived = { id: 'wielded_inv_9', type: 'physical', derived: true, weaponOpt: { name: '长剑' }, weaponNameSuffix: '（+1）' }

  it('优先用 weaponOpt.name，后缀紧跟名字不加空格', () => {
    expect(getCombatMeanLabel(derived, {})).toBe('长剑（+1）')
  })

  it('派生卡即使带 weaponInventoryIndex 也用 weaponOpt.name', () => {
    expect(getCombatMeanLabel({ ...derived, weaponInventoryIndex: 0 }, {})).toBe('长剑（+1）')
  })

  it('卡片名与下拉名同口径（两处不得各写一份拼接）', () => {
    expect(getCombatMeanLabel(derived, {})).toBe(getWeaponMeanDisplayName(derived))
  })

  it('无后缀时只有名字；无武器名时回退"武器"', () => {
    expect(getWeaponMeanDisplayName({ weaponOpt: { name: '匕首' }, weaponNameSuffix: '   ' })).toBe('匕首')
    expect(getWeaponMeanDisplayName({})).toBe('武器')
    expect(getWeaponMeanDisplayName(null, '主手')).toBe('主手')
  })

  it('后缀两端空白不进显示名', () => {
    expect(getWeaponMeanDisplayName({ weaponOpt: { name: '长剑' }, weaponNameSuffix: ' +1 ' })).toBe('长剑+1')
  })
})

describe('deriveDisabledAutoGainKeys', () => {
  it('记下被取消勾选的自动增益，即使清单里另有手动增益', () => {
    // 回归：旧写法用 some(x => x.type === k || !autoKeys.has(x.type))，只要有一条手动增益结果就恒空
    const gains = [
      { id: 'auto_damageBonus', type: 'damageBonus', value: 2, auto: true, enabled: false },
      { id: 'g_manual', type: 'extraDice', dice: '1d6 火焰', enabled: true },
      { id: 'auto_attackBonus', type: 'attackBonus', value: 1, auto: true, enabled: true },
    ]
    expect(deriveDisabledAutoGainKeys(gains)).toEqual(['damageBonus'])
  })

  it('未勾选的手动增益不进名单（它由 gains 自己的 enabled 表达）', () => {
    expect(deriveDisabledAutoGainKeys([{ id: 'g1', type: 'advantage', enabled: false }])).toEqual([])
  })

  it('同 type 重复关掉只记一次；非数组入参返回空', () => {
    const gains = [
      { id: 'a', type: 'extraDice', auto: true, enabled: false },
      { id: 'b', type: 'extraDice', auto: true, enabled: false },
    ]
    expect(deriveDisabledAutoGainKeys(gains)).toEqual(['extraDice'])
    expect(deriveDisabledAutoGainKeys(undefined)).toEqual([])
  })

  it('与 computeLiveGains 互为逆运算：写侧记下的 key 正好让读侧滤掉该自动增益', () => {
    const buffs = [{ id: 'b', name: 'x', enabled: true, effects: [{ effectType: 'damage_bonus', scope: 'global', scopeDetail: [], value: 2 }] }]
    const card = { type: 'spell_attack', gains: [] }
    const edited = [{ id: 'auto_damageBonus', type: 'damageBonus', value: 2, auto: true, enabled: false }]
    const keys = deriveDisabledAutoGainKeys(edited)
    expect(keys).toEqual(['damageBonus'])
    const live = computeLiveGains({ ...card, disabledAutoGainKeys: keys }, { buffStats: {}, mergedBuffs: buffs })
    expect(live.some((g) => g.type === 'damageBonus')).toBe(false)
    expect(computeLiveGains(card, { buffStats: {}, mergedBuffs: buffs }).some((g) => g.type === 'damageBonus')).toBe(true)
  })
})

describe('getWeaponModeOptions', () => {
  // 内联词条验证纯函数契约：可选集只由 子类型 / 附注 决定，不应随 DM 改词条而失效
  const modesOf = (proto) => getWeaponModeOptions({ proto }).map((o) => o.value)
  // 真表校对：这几把武器的词条必须确实落在预期档位上
  const storedModes = (id) => modesOf(getItemById(id))

  it('档位只由武器词条决定：纯单手 / 多用 / 纯双手 / 远程各自的可选集', () => {
    expect(modesOf({ 附注: '灵巧，轻型' })).toEqual(['one_hand'])
    expect(modesOf({ 附注: '多用（1d10）' })).toEqual(['one_hand', 'two_hand'])
    expect(modesOf({ 附注: '重型，双手武器' })).toEqual(['two_hand'])
    expect(modesOf({ 子类型: '远程', 附注: '装填' })).toEqual(['ranged'])
  })

  it('真表里四把代表性武器的可选集与规则预期一致', () => {
    expect(storedModes('dagger')).toEqual(['one_hand'])
    expect(storedModes('longsword')).toEqual(['one_hand', 'two_hand'])
    expect(storedModes('greatsword')).toEqual(['two_hand'])
    expect(storedModes('light_crossbow')).toEqual(['ranged'])
  })

  it('多用+投掷给单手与远程：投掷与多用双手是两回事，不能互相顶掉', () => {
    expect(modesOf({ 附注: '灵巧，轻型，多用（1d8），投掷（射程 20/60）' })).toEqual(['one_hand', 'ranged'])
  })

  it('附赠攻击永远不在可选集里：它是副手槽的属性，双持也不能把它塞进主手的档', () => {
    expect(modesOf({ 附注: '灵巧，轻型' })).not.toContain('bonus_action')
    expect(modesOf({ 附注: '重型，双手武器' })).not.toContain('bonus_action')
    expect(storedModes('longsword')).not.toContain('bonus_action')
  })

  it('无武器时给全表，由调用方按词条再收窄', () => {
    expect(getWeaponModeOptions(undefined).map((o) => o.value)).toEqual(['one_hand', 'two_hand', 'ranged'])
  })
})

describe('weaponProficiencyNote', () => {
  const cases = [
    { args: { weaponProficient: false, canAddAbilityMod: false }, text: '未熟练（命中不含熟练加值，伤害不含属性调整值）' },
    // 未熟练优先：算法在未熟练时也可能给出 true（例如非副手的默认值），文案不能被带偏
    { args: { weaponProficient: false, canAddAbilityMod: true }, text: '未熟练（命中不含熟练加值，伤害不含属性调整值）' },
    { args: { weaponProficient: true, canAddAbilityMod: true }, text: '✓ 已熟练（命中含熟练加值，伤害含属性调整值）' },
    { args: { weaponProficient: true, canAddAbilityMod: false }, text: '✓ 已熟练（命中含熟练加值；附赠攻击不加属性调整值，负值仍生效）' },
  ]

  it.each(cases)('文案与算法判据一一对应（$args.weaponProficient / $args.canAddAbilityMod）', ({ args, text }) => {
    expect(weaponProficiencyNote(args)).toBe(text)
  })
})
