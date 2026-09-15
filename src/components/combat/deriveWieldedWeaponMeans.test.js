// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { deriveWieldedWeaponMeans, makeWieldedMeanId, buildWeaponMeanConfig, WIELDED_UNAVAILABLE_NO_MAIN } from './deriveWieldedWeaponMeans'

let seq = 0
/** 造一份角色：held 传原型 id 数组（null = 空槽） */
function charWith(held) {
  const inventory = []
  const equippedHeld = held.map((id, i) => {
    if (!id) return { id: i === 0 ? 'main' : i === 1 ? 'off' : `held_${i}`, inventoryId: null }
    const entry = { id: `inv_${++seq}`, itemId: id }
    inventory.push(entry)
    return { id: i === 0 ? 'main' : i === 1 ? 'off' : `held_${i}`, inventoryId: entry.id }
  })
  return { inventory, equippedHeld }
}
const TIER_IDS = {
  simple: ['club', 'dagger', 'spear', 'light_crossbow'],
  martial: ['longsword', 'greatsword', 'war_pick'],
  firearm: ['gun_pistol'],
}
const ALL_PROF = ['simple', 'martial', 'firearms']
const CTX = { profWeapons: ALL_PROF, tierMemberIds: TIER_IDS }

const bySlot = (cards) => Object.fromEntries(cards.map((c) => [c.slotIndex, c]))

describe('deriveWieldedWeaponMeans', () => {
  it('空手不出卡', () => {
    expect(deriveWieldedWeaponMeans(charWith([null, null]), CTX)).toEqual([])
  })

  it('仅主手：一张主手可用卡，标签与动作正确', () => {
    const cards = deriveWieldedWeaponMeans(charWith(['longsword']), CTX)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ slotIndex: 0, slotLabel: '主手', actionLabel: '1 动作', available: true })
  })

  it('双持两把轻型：副手为附赠动作且走附赠攻击模式', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'dagger']), CTX))
    expect(cards[0].available).toBe(true)
    expect(cards[1]).toMatchObject({ slotLabel: '副手', actionLabel: '附赠动作', available: true, weaponVersatileMode: 'bonus_action' })
  })

  it('副手非轻型且无双持客 → 灰卡带原因', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'longsword']), CTX))
    expect(cards[1]).toMatchObject({ available: false, unavailableReason: '缺少轻型词条，且未获得双持客' })
    expect(cards[1].weaponProficient).toBe(true)
  })

  it('副手非轻型但有双持客 → 可用', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'war_pick']), { ...CTX, offhandIgnoresLight: true }))
    expect(cards[1].available).toBe(true)
    expect(cards[1].unavailableReason).toBe('')
  })

  it('主手双手武器 → 副手灰卡且原因为被占用', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['greatsword', 'dagger']), CTX))
    expect(cards[1]).toMatchObject({ available: false, unavailableReason: '主手为双手武器，副手被占用' })
  })

  it('备用手持位同样出卡，标签为备用、动作为 1 动作', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['longsword', null, 'spear']), CTX))
    expect(cards[2]).toMatchObject({ slotIndex: 2, slotLabel: '备用', actionLabel: '1 动作', available: true })
  })

  it('变身状态返回空数组', () => {
    expect(deriveWieldedWeaponMeans(charWith(['longsword']), { ...CTX, isTransformed: true })).toEqual([])
  })

  it('法器不出卡', () => {
    expect(deriveWieldedWeaponMeans(charWith(['focus_staff']), CTX)).toEqual([])
  })

  it('盾牌不出卡', () => {
    expect(deriveWieldedWeaponMeans(charWith(['longsword', 'shield']), CTX)).toHaveLength(1)
  })

  it('槽位指向已不存在的物品：不出卡也不抛错', () => {
    const char = { inventory: [], equippedHeld: [{ id: 'main', inventoryId: 'inv_missing' }] }
    expect(deriveWieldedWeaponMeans(char, CTX)).toEqual([])
  })

  it('不熟练的武器 weaponProficient 为 false', () => {
    const cards = deriveWieldedWeaponMeans(charWith(['war_pick']), { ...CTX, profWeapons: ['club'] })
    expect(cards[0].weaponProficient).toBe(false)
  })

  it('id 由槽位序号 + 物品编号确定性拼出', () => {
    const char = charWith(['longsword'])
    const cards = deriveWieldedWeaponMeans(char, CTX)
    expect(cards[0].id).toBe(makeWieldedMeanId(0, char.inventory[0].id))
    expect(cards[0].id).toBe(`wielded_0_${char.inventory[0].id}`)
  })

  it('武器原型解析走 getItemById（内置武器可查到 proto）', () => {
    const cards = deriveWieldedWeaponMeans(charWith(['longsword']), CTX)
    expect(cards[0].weaponOpt.proto.id).toBe('longsword')
    expect(cards[0].weaponOpt.entry.itemId).toBe('longsword')
  })

  it('旧存档槽位 id 为 held_1 时仍按序号识别副手', () => {
    const inv = [
      { id: 'inv_a', itemId: 'dagger' },
      { id: 'inv_b', itemId: 'longsword' },
    ]
    const char = {
      inventory: inv,
      equippedHeld: [
        { id: 'held_0', inventoryId: 'inv_a' },
        { id: 'held_1', inventoryId: 'inv_b' },
      ],
    }
    const cards = bySlot(deriveWieldedWeaponMeans(char, CTX))
    expect(cards[1]).toMatchObject({ slotLabel: '副手', actionLabel: '附赠动作', available: false, unavailableReason: '缺少轻型词条，且未获得双持客' })
  })

  it('主手附注同时带双手与多用：可单手持有，不占用副手', () => {
    const inv = [
      { id: 'inv_a', itemId: 'longsword', 附注: '重型，双手，多用（1d10）' },
      { id: 'inv_b', itemId: 'dagger' },
    ]
    const char = {
      inventory: inv,
      equippedHeld: [
        { id: 'main', inventoryId: 'inv_a' },
        { id: 'off', inventoryId: 'inv_b' },
      ],
    }
    const cards = bySlot(deriveWieldedWeaponMeans(char, CTX))
    expect(cards[1]).toMatchObject({ available: true, unavailableReason: '' })
  })

  it('副手卡无视存档攻击模式，恒为 bonus_action', () => {
    const char = charWith(['dagger', 'dagger'])
    char.inventory[1].combatMeanConfig = { versatileMode: 'one_hand' }
    const cards = bySlot(deriveWieldedWeaponMeans(char, CTX))
    expect(cards[1]).toMatchObject({ actionLabel: '附赠动作', weaponVersatileMode: 'bonus_action' })
  })

  it('主手卡尊重存档攻击模式（修复不外溢）', () => {
    const twoHand = charWith(['longsword'])
    twoHand.inventory[0].combatMeanConfig = { versatileMode: 'two_hand' }
    expect(deriveWieldedWeaponMeans(twoHand, CTX)[0].weaponVersatileMode).toBe('two_hand')
  })

  it('存档模式已不在可选值里：回退默认模式，不静默改掉伤害算法', () => {
    const char = charWith(['greatsword'])
    char.inventory[0].combatMeanConfig = { versatileMode: 'one_hand' }
    expect(deriveWieldedWeaponMeans(char, CTX)[0].weaponVersatileMode).toBe('two_hand')
  })

  it('主手条目里的 bonus_action 一律不采纳：附赠攻击属于副手槽，不是主手可配的档', () => {
    const dual = charWith(['dagger', 'dagger'])
    dual.inventory[0].combatMeanConfig = { versatileMode: 'bonus_action' }
    expect(bySlot(deriveWieldedWeaponMeans(dual, CTX))[0].weaponVersatileMode).toBe('one_hand')
    const solo = { inventory: dual.inventory, equippedHeld: [dual.equippedHeld[0]] }
    expect(deriveWieldedWeaponMeans(solo, CTX)[0].weaponVersatileMode).toBe('one_hand')
  })

  it('主手空槽 + 副手轻型：副手灰卡且原因为主手未持武器', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith([null, 'dagger']), CTX))
    expect(Object.keys(cards)).toEqual(['1'])
    expect(cards[1]).toMatchObject({
      slotLabel: '副手',
      available: false,
      unavailableReason: WIELDED_UNAVAILABLE_NO_MAIN,
    })
    expect(WIELDED_UNAVAILABLE_NO_MAIN).toBe('主手未持武器，副手无法发动附赠攻击')
  })

  it('主手是非武器（盾牌）+ 副手轻型：同样按主手未持武器灰卡', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['shield', 'dagger']), CTX))
    expect(Object.keys(cards)).toEqual(['1'])
    expect(cards[1]).toMatchObject({ available: false, unavailableReason: WIELDED_UNAVAILABLE_NO_MAIN })
  })

  it('武器名优先条目自定义名，其次原型类别', () => {
    const named = charWith(['longsword'])
    named.inventory[0].name = ' 破晓 '
    expect(deriveWieldedWeaponMeans(named, CTX)[0].weaponOpt.name).toBe('破晓')
    const plain = charWith(['longsword'])
    expect(deriveWieldedWeaponMeans(plain, CTX)[0].weaponOpt.name).toBe('长剑')
  })

  it('自定义武器原型（类别=自定义）回退到原型显示名', async () => {
    // 自定义物品只存在于 getItemById 的自定义分支：需临时关掉 Supabase 分支才会读 localStorage
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    vi.resetModules()
    localStorage.setItem('dnd_custom_items', JSON.stringify([
      { id: 'custom_moonblade', 类型: '近战武器', 子类型: '近战', 类别: '自定义', 名称: '月刃', 攻击: '1d4 挥砍', 附注: '轻型', 伤害: '挥砍' },
    ]))
    try {
      const { deriveWieldedWeaponMeans: deriveFresh } = await import('./deriveWieldedWeaponMeans')
      const cards = deriveFresh(charWith(['custom_moonblade']), CTX)
      expect(cards).toHaveLength(1)
      expect(cards[0].weaponOpt.proto.类别).toBe('自定义')
      expect(cards[0].weaponOpt.name).toBe('月刃')
    } finally {
      localStorage.removeItem('dnd_custom_items')
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('combatMeanConfig 透传为卡字段，且数组是浅拷贝不回写源数据', () => {
    const char = charWith(['longsword'])
    char.inventory[0].combatMeanConfig = {
      nameSuffix: ' +1',
      damageTypeOverride: 'force',
      extraDamageDice: ['1d6'],
      disabledAutoGainKeys: ['x'],
    }
    const card = deriveWieldedWeaponMeans(char, CTX)[0]
    expect(card).toMatchObject({
      weaponNameSuffix: ' +1',
      damageType: 'force',
      extraDamageDice: ['1d6'],
      disabledAutoGainKeys: ['x'],
    })
    card.extraDamageDice.push('2d8')
    card.disabledAutoGainKeys.push('y')
    expect(char.inventory[0].combatMeanConfig.extraDamageDice).toEqual(['1d6'])
    expect(char.inventory[0].combatMeanConfig.disabledAutoGainKeys).toEqual(['x'])
  })

  it('库存条目缺少 itemId：不出卡也不抛错', () => {
    const char = {
      inventory: [{ id: 'inv_bare', 名称: '自制武器' }],
      equippedHeld: [{ id: 'main', inventoryId: 'inv_bare' }],
    }
    expect(deriveWieldedWeaponMeans(char, CTX)).toEqual([])
  })

  it('副手轻型远程武器（手弩）可用且仍走附赠攻击模式', () => {
    const cards = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'hand_crossbow']), CTX))
    expect(cards[1]).toMatchObject({ available: true, weaponVersatileMode: 'bonus_action' })
  })

  it('副手双手远程武器（轻弩）不可用，双持客也不解锁', () => {
    const plain = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'light_crossbow']), CTX))
    expect(plain[1]).toMatchObject({ available: false, unavailableReason: '缺少轻型词条，且未获得双持客' })
    const dual = bySlot(deriveWieldedWeaponMeans(charWith(['dagger', 'light_crossbow']), { ...CTX, offhandIgnoresLight: true }))
    expect(dual[1]).toMatchObject({ available: false, unavailableReason: '缺少轻型词条，且未获得双持客' })
  })
})

describe('buildWeaponMeanConfig', () => {
  const form = {
    nameSuffix: '（+1）',
    damageType: '火焰',
    versatileMode: 'two_hand',
    extraDamageDice: ['1d6 寒冷'],
    targetCreatureType: '异怪',
    ability: 'dex',
    gains: [
      { id: 'auto_damageBonus', type: 'damageBonus', value: 2, auto: true, enabled: false },
      { id: 'g_manual', type: 'attackBonus', value: 1, enabled: true },
    ],
  }

  it('主手写满七项，含被关掉的自动增益', () => {
    expect(buildWeaponMeanConfig({ slotIndex: 0 }, form)).toEqual({
      nameSuffix: '（+1）',
      damageTypeOverride: '火焰',
      versatileMode: 'two_hand',
      extraDamageDice: ['1d6 寒冷'],
      targetCreatureType: '异怪',
      abilityForAttack: 'dex',
      disabledAutoGainKeys: ['damageBonus'],
    })
  })

  it('副手一个键都不多写：versatileMode 不落，否则武器回主手会静默改掉主手卡伤害骰', () => {
    const cfg = buildWeaponMeanConfig({ slotIndex: 1 }, form)
    expect('versatileMode' in cfg).toBe(false)
    expect(cfg.nameSuffix).toBe('（+1）')
  })

  it('缺项按空值写，不留 undefined（merge 进旧配置时要把上次的值清掉）', () => {
    const cfg = buildWeaponMeanConfig({ slotIndex: 0 }, {})
    expect(cfg).toMatchObject({ nameSuffix: '', damageTypeOverride: '', versatileMode: '', abilityForAttack: '' })
    expect(cfg.extraDamageDice).toEqual([])
    expect(cfg.disabledAutoGainKeys).toEqual([])
  })

  it('额外伤害骰是拷贝，写侧不回改表单数组', () => {
    const cfg = buildWeaponMeanConfig({ slotIndex: 0 }, form)
    cfg.extraDamageDice.push('2d8')
    expect(form.extraDamageDice).toEqual(['1d6 寒冷'])
  })

  it('属性与词条推断相同就不存档：存了会快照住 DM 之后改词条的效果', () => {
    const finesse = { slotIndex: 0, weaponOpt: { proto: { 附注: '灵巧，轻型' } } }
    expect(buildWeaponMeanConfig(finesse, { ...form, ability: 'dex' }).abilityForAttack).toBe('')
    expect(buildWeaponMeanConfig(finesse, { ...form, ability: 'str' }).abilityForAttack).toBe('str')
  })

  it('往返：写进物品条目后重新派生的卡读回同一组值', () => {
    const char = charWith(['longsword', 'dagger'])
    char.inventory[0].combatMeanConfig = buildWeaponMeanConfig({ slotIndex: 0 }, form)
    char.inventory[1].combatMeanConfig = buildWeaponMeanConfig({ slotIndex: 1 }, form)
    const cards = bySlot(deriveWieldedWeaponMeans(char, CTX))
    for (const card of [cards[0], cards[1]]) {
      expect(card).toMatchObject({
        weaponNameSuffix: '（+1）',
        damageType: '火焰',
        targetCreatureType: '异怪',
        abilityForAttack: 'dex',
        extraDamageDice: ['1d6 寒冷'],
        disabledAutoGainKeys: ['damageBonus'],
      })
    }
    expect(cards[0].weaponVersatileMode).toBe('two_hand')
    expect(cards[1].weaponVersatileMode).toBe('bonus_action')
  })
})
