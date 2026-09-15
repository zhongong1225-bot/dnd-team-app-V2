// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { deriveWieldedWeaponMeans, makeWieldedMeanId } from './deriveWieldedWeaponMeans'

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
})
