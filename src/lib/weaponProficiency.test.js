import { describe, it, expect } from 'vitest'
import { isWeaponProtoProficient, isWeaponTierGranted, collectTierMemberIds } from './weaponProficiency'
import { ITEM_DATABASE } from '../data/itemDatabase'

const TIER_IDS = {
  simple: ['club', 'dagger'],
  martial: ['longsword', 'greatsword'],
  firearm: ['gun_pistol'],
}

describe('isWeaponTierGranted', () => {
  it('旧存档逐一全选（内置军用武器全部拥有、不带伪 id）判定为整组已授予', () => {
    const ids = collectTierMemberIds(ITEM_DATABASE)
    expect(ids.martial.length).toBeGreaterThan(0)
    expect(isWeaponTierGranted('martial', ids.martial, ids)).toBe(true)
  })
  it('只存伪 id 也判定为整组已授予', () => {
    expect(isWeaponTierGranted('martial', ['martial'], TIER_IDS)).toBe(true)
    expect(isWeaponTierGranted('firearm', ['firearms'], TIER_IDS)).toBe(true)
  })
  it('只选一半不算整组已授予', () => {
    expect(isWeaponTierGranted('martial', ['longsword'], TIER_IDS)).toBe(false)
    expect(isWeaponTierGranted('martial', ['longsword', 'club'], TIER_IDS)).toBe(false)
  })
  it('成员表为空时不放行（避免空数组 every 恒真）', () => {
    expect(isWeaponTierGranted('martial', [], { ...TIER_IDS, martial: [] })).toBe(false)
    expect(isWeaponTierGranted('martial', ['longsword'], {})).toBe(false)
  })
  it('熟练数组缺失时不整组放行', () => {
    expect(isWeaponTierGranted('martial', undefined, TIER_IDS)).toBe(false)
    expect(isWeaponTierGranted('martial', null, TIER_IDS)).toBe(false)
  })
})

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
  it('未标档位时按 类型=枪械 推定火器档', () => {
    expect(isWeaponProtoProficient({ id: 'gun_pistol', 类型: '枪械' }, ['firearms'], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient({ id: 'gun_pistol', 类型: '枪械' }, ['longsword'], TIER_IDS)).toBe(false)
  })
  it('未标档位时按 isMartial 遗留标记推定军用档', () => {
    expect(isWeaponProtoProficient({ id: 'legacy_blade', isMartial: true }, ['martial'], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient({ id: 'legacy_blade', isMartial: true }, ['longsword'], TIER_IDS)).toBe(false)
  })
  it('档位不明按熟练处理（宁滥勿缺）', () => {
    expect(isWeaponProtoProficient({ id: 'smart_weapon' }, [], TIER_IDS)).toBe(true)
    expect(isWeaponProtoProficient(null, [], TIER_IDS)).toBe(true)
  })
  it('熟练数组缺失时不整组放行', () => {
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, undefined, TIER_IDS)).toBe(false)
    expect(isWeaponProtoProficient({ id: 'longsword', proficiencyTier: 'martial' }, null, TIER_IDS)).toBe(false)
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
