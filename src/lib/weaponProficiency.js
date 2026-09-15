/**
 * 武器熟练判定：角色是否熟练这件武器。
 * 档位事实源在 Weapon.prototype.proficiencyTier，判定同时认三种授予形式：
 * 单把武器 id、整组伪 id（'simple'/'martial'/'firearms'）、整组逐一全选（旧存档）。
 */
import { getWeaponProficiencyTier, WEAPON_TIER_GRANTED_IDS } from '../data/buffTypes'

const WEAPON_ITEM_TYPES = new Set(['近战武器', '远程武器', '枪械'])

/** 从物品清单（内置 + 自定义）按档位归组出原型 id */
export function collectTierMemberIds(items) {
  const out = { simple: [], martial: [], firearm: [] }
  for (const it of items || []) {
    if (!it?.id || !WEAPON_ITEM_TYPES.has(String(it.类型 ?? '').trim())) continue
    const tier = getWeaponProficiencyTier(it)
    if (tier && out[tier]) out[tier].push(it.id)
  }
  return out
}

/**
 * @param {object|null} proto 武器原型
 * @param {string[]} profWeapons char.proficiencies.weapons
 * @param {{simple:string[],martial:string[],firearm:string[]}} tierMemberIds collectTierMemberIds 的结果
 */
export function isWeaponProtoProficient(proto, profWeapons, tierMemberIds) {
  const owned = new Set(Array.isArray(profWeapons) ? profWeapons : [])
  const tier = getWeaponProficiencyTier(proto)
  if (!tier) return true
  if (proto?.id && owned.has(proto.id)) return true
  if (owned.has(WEAPON_TIER_GRANTED_IDS[tier])) return true
  const members = tierMemberIds?.[tier] || []
  return members.length > 0 && members.every((id) => owned.has(id))
}
