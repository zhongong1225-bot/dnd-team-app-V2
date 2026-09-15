import { describe, it, expect } from 'vitest'
import { isWeaponProtoProficient, collectTierMemberIds } from './weaponProficiency'

const TIER_IDS = {
  simple: ['club', 'dagger'],
  martial: ['longsword', 'greatsword'],
  firearm: ['gun_pistol'],
}

describe('isWeaponProtoProficient', () => {
  it('按原型 id 命中', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, ['longsword'], TIER_IDS)).toBe(true)
  })
  it('整组全选推定熟练（老存档：点过军用武器按钮）', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, ['longsword', 'greatsword'], TIER_IDS)).toBe(true)
  })
  it('整组只选一半不算熟练', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, ['greatsword'], TIER_IDS)).toBe(false)
  })
  it('火器只认伪 id firearms，也兼容存档残留的枪 id', () => {
    expect(isWeaponProtoProficient({ id: 'gun_pistol', proficiencyTier: 'firearm' }, ['firearms'], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient({ id: 'gun_pistol', proficiencyTier: 'firearm' }, ['gun_pistol'], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient({ id: 'gun_pistol', proficiencyTier: 'firearm' }, ['longsword'], TIER_IDS)).toBe(false)
  })
  it('档位不明按熟练处理（宁滥勿缺）', () => {
    expect(isWeaponProtoProficient({ id: 'smart_weapon' }, [], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient(null, [], TIER_IDS)).toBe(true)
  })
})

describe('collectTierMemberIds', () => {
  it('按档位归组并只保留武器类型', () => {
    const ids = collectTierMemberIds([
      { id: 'club', 类型: '近战武器', proficiencyTier: 'simple' },
      { id: 'longsword', 类型: '近战武器', proficiencyTier: 'martial' },
      { id: 'gun_pistol', 类型: '枪械', proficiencyTier: 'firearm' },
      { id: 'holy_symbol_amulet', 类型: '法器', proficiencyTier: undefined },
      { id: 'zhaoyun_arcane_cards', 类型: '近战武器' },
    ])
    expect(ids).toEqual({ simple: ['club'], martial: ['longsword'], firearm: ['gun_pistol'] })
  })
})
