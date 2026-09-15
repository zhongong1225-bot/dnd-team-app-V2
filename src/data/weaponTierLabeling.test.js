import { describe, it, expect } from 'vitest'
import { ITEM_DATABASE, WEAPON_TYPES_FOR_BUFF_SCOPE, getItemById } from './itemDatabase'
import { isSimpleWeaponProto, isMartialWeaponProto, getWeaponProficiencyTier, scopeMatchesCombatMean, SCOPE_KIND } from './buffTypes'
import { collectTierMemberIds } from '../lib/weaponProficiency'

const VALID_TIERS = ['simple', 'martial', 'firearm']
/** 档位未标注的内置武器：走「档位不明按熟练」安全阀 */
const UNLABELED_WEAPON_IDS = ['zhaoyun_arcane_cards', 'smart_weapon']

const weapons = ITEM_DATABASE.filter((it) => WEAPON_TYPES_FOR_BUFF_SCOPE.includes(String(it.类型 ?? '').trim()))

describe('内置武器原型的 proficiencyTier 标注', () => {
  it('每把武器类型原型都带合法档位', () => {
    for (const it of weapons) {
      const tier = it.proficiencyTier ?? ''
      expect(VALID_TIERS.includes(tier) || UNLABELED_WEAPON_IDS.includes(it.id), `${it.id} 档位标注非法`).toBe(true)
    }
  })

  it('档位成员数为 14 简易 / 22 军用 / 3 火器', () => {
    const ids = collectTierMemberIds(ITEM_DATABASE)
    expect(ids.simple).toHaveLength(14)
    expect(ids.martial).toHaveLength(22)
    expect(ids.firearm).toEqual(['gun_blunderbuss', 'gun_musket', 'gun_pistol'])
    expect(new Set([...ids.simple, ...ids.martial]).size).toBe(36)
  })

  it('清单之外的原型不带档位字段', () => {
    const labeled = ITEM_DATABASE.filter((it) => it.proficiencyTier)
    expect(labeled.every((it) => WEAPON_TYPES_FOR_BUFF_SCOPE.includes(it.类型))).toBe(true)
    expect(labeled).toHaveLength(39)
  })
})

describe('档位判定读的是原型标注', () => {
  it('简易 / 军用 / 火器 / 未标注各归各位', () => {
    expect(getWeaponProficiencyTier(getItemById('dagger'))).toBe('simple')
    expect(getWeaponProficiencyTier(getItemById('longsword'))).toBe('martial')
    expect(getWeaponProficiencyTier(getItemById('gun_pistol'))).toBe('firearm')
    expect(getWeaponProficiencyTier(getItemById('smart_weapon'))).toBeNull()
    expect(isSimpleWeaponProto(getItemById('dagger'))).toBe(true)
    expect(isMartialWeaponProto(getItemById('dagger'))).toBe(false)
    expect(isMartialWeaponProto(getItemById('longsword'))).toBe(true)
    expect(isSimpleWeaponProto(getItemById('longsword'))).toBe(false)
  })
})

describe('BUFF 起效范围「简易武器 / 军用武器」按档位匹配', () => {
  const martialBuff = { scope: SCOPE_KIND.weapon_category, scopeDetail: ['军用武器'] }
  const simpleBuff = { scope: SCOPE_KIND.weapon_category, scopeDetail: ['简易武器'] }
  const ctx = (proto) => ({ sourceKind: 'physical', weaponProto: proto })

  it('军用范围只命中军用档武器', () => {
    expect(scopeMatchesCombatMean(martialBuff, ctx(getItemById('longsword')))).toBe(true)
    expect(scopeMatchesCombatMean(martialBuff, ctx(getItemById('dagger')))).toBe(false)
  })

  it('简易范围只命中简易档武器', () => {
    expect(scopeMatchesCombatMean(simpleBuff, ctx(getItemById('dagger')))).toBe(true)
    expect(scopeMatchesCombatMean(simpleBuff, ctx(getItemById('longsword')))).toBe(false)
  })
})
