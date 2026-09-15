/**
 * 手持武器 → 战斗手段卡 派生器（纯函数，不写任何数据）
 *
 * 输出对象刻意保持与旧 combatMeans 条目同形（type/weaponNameSuffix/…/gains），
 * 这样 computePhysicalWeaponStats 与 WeaponAttackCard 无需第二套算法。
 */
import { getItemById, getItemDisplayName } from '../../data/itemDatabase'
import { isWeaponProtoProficient } from '../../lib/weaponProficiency'
import {
  weaponHasLight, weaponHasTwoHanded, weaponHasVersatile, getDefaultWeaponMode, getWeaponModeOptions, deriveDisabledAutoGainKeys,
} from './combatMeanUtils'

const WEAPON_TYPES = new Set(['近战武器', '远程武器', '枪械'])

export const WIELDED_UNAVAILABLE_MAIN_TWO_HANDED = '主手为双手武器，副手被占用'
export const WIELDED_UNAVAILABLE_NO_LIGHT = '缺少轻型词条，且未获得双持客'
export const WIELDED_UNAVAILABLE_NO_MAIN = '主手未持武器，副手无法发动附赠攻击'

/** 派生卡 id：必须由槽位序号 + 物品编号确定性拼出（组合技要稳定引用它） */
export function makeWieldedMeanId(slotIndex, inventoryId) {
  return `wielded_${slotIndex}_${inventoryId}`
}

function slotLabelFor(index) {
  if (index === 0) return '主手'
  if (index === 1) return '副手'
  return '备用'
}

function weaponOptFor(entry) {
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  if (!proto) return null
  const 攻击 = entry.攻击 ?? proto.攻击 ?? '—'
  const 伤害 = entry.伤害 ?? proto.伤害 ?? '—'
  const 类别 = String(proto.类别 ?? '').trim()
  // 自建物品的 类别 默认是占位值「自定义」，此时显示名要取原型自身的 名称
  const name = (entry.name && String(entry.name).trim())
    || (类别 && 类别 !== '自定义' ? 类别 : getItemDisplayName(proto))
    || '—'
  return { entry, proto, name, 攻击, 伤害 }
}

/** 副手合法性：返回 '' 表示合法 */
function offhandBlockReason(mainOpt, offOpt, ctx) {
  if (!mainOpt) return WIELDED_UNAVAILABLE_NO_MAIN
  // 多用武器可单手持有，不会占用副手
  if (weaponHasTwoHanded(mainOpt) && !weaponHasVersatile(mainOpt)) return WIELDED_UNAVAILABLE_MAIN_TWO_HANDED
  if (weaponHasLight(offOpt)) return ''
  if (ctx.offhandIgnoresLight && !weaponHasTwoHanded(offOpt)) return ''
  return WIELDED_UNAVAILABLE_NO_LIGHT
}

/**
 * @param {object} character 角色数据（读 equippedHeld / inventory）
 * @param {object} ctx
 * @param {string[]} ctx.profWeapons char.proficiencies.weapons
 * @param {object} ctx.tierMemberIds collectTierMemberIds 的结果
 * @param {boolean} ctx.offhandIgnoresLight buffStats.offhandIgnoresLight
 * @param {boolean} ctx.isTransformed buffStats.creatureTransform 是否生效
 */
export function deriveWieldedWeaponMeans(character, ctx = {}) {
  if (ctx.isTransformed) return []
  const heldSlots = Array.isArray(character?.equippedHeld) ? character.equippedHeld : []
  const inventory = Array.isArray(character?.inventory) ? character.inventory : []

  const resolved = heldSlots.map((slot, i) => {
    const inventoryId = slot?.inventoryId
    if (!inventoryId) return null
    const invIndex = inventory.findIndex((e) => e?.id === inventoryId)
    if (invIndex < 0) return null
    const opt = weaponOptFor(inventory[invIndex])
    if (!opt || !WEAPON_TYPES.has(String(opt.proto.类型 ?? '').trim())) return null
    return { ...opt, invIndex, inventoryId }
  })

  const mainOpt = resolved[0]

  return resolved
    .map((opt, i) => {
      if (!opt) return null
      const cfg = (opt.entry.combatMeanConfig && typeof opt.entry.combatMeanConfig === 'object') ? opt.entry.combatMeanConfig : {}
      const isOffhand = i === 1
      let available = true
      let unavailableReason = ''
      if (isOffhand) {
        unavailableReason = offhandBlockReason(mainOpt, opt, ctx)
        available = unavailableReason === ''
      }
      // 存档模式必须仍是当前可选值：双持一解除，主手条目里的 bonus_action 就成了孤儿，
      // 照单采纳会得到「标签 1 动作、伤害却剥属性调整值」的卡，而选择器此刻只读，玩家看不见也改不回
      const modeFromConfig = getWeaponModeOptions(opt, character).some((o) => o.value === cfg.versatileMode) ? cfg.versatileMode : null
      // 副手卡的 actionLabel 恒为附赠动作，若沿用存档模式会出现「标签附赠动作、伤害却加满属性调整值」
      const weaponVersatileMode = isOffhand ? 'bonus_action' : (modeFromConfig || getDefaultWeaponMode(opt))
      return {
        id: makeWieldedMeanId(i, opt.inventoryId),
        type: 'physical',
        derived: true,
        slotIndex: i,
        slotLabel: slotLabelFor(i),
        actionLabel: isOffhand ? '附赠动作' : '1 动作',
        available,
        unavailableReason,
        weaponInventoryId: opt.inventoryId,
        weaponInventoryIndex: opt.invIndex,
        weaponOpt: opt,
        weaponProficient: isWeaponProtoProficient(opt.proto, ctx.profWeapons, ctx.tierMemberIds),
        weaponNameSuffix: typeof cfg.nameSuffix === 'string' ? cfg.nameSuffix : '',
        damageType: typeof cfg.damageTypeOverride === 'string' ? cfg.damageTypeOverride : '',
        weaponVersatileMode,
        // 复制而非透传：数组来自持久化的物品条目，下游 push 会改写 DM 数据
        extraDamageDice: Array.isArray(cfg.extraDamageDice) ? [...cfg.extraDamageDice] : [],
        targetCreatureType: typeof cfg.targetCreatureType === 'string' ? cfg.targetCreatureType : '',
        abilityForAttack: typeof cfg.abilityForAttack === 'string' && cfg.abilityForAttack ? cfg.abilityForAttack : null,
        disabledAutoGainKeys: Array.isArray(cfg.disabledAutoGainKeys) ? [...cfg.disabledAutoGainKeys] : [],
        gains: [],
      }
    })
    .filter(Boolean)
}

/**
 * 武器编辑器表单值 → 物品条目的 combatMeanConfig（本文件读侧 cfg 的写侧，七项一一对应）
 *
 * 副手卡不写 versatileMode：上面 :91 对副手恒为 bonus_action，
 * 若把 one_hand / two_hand 存进条目，这把武器回到主手时会静默改掉主手卡的伤害骰。
 */
export function buildWeaponMeanConfig(mean, form = {}) {
  const str = (v) => (typeof v === 'string' ? v : '')
  const cfg = {
    nameSuffix: str(form.nameSuffix),
    damageTypeOverride: str(form.damageType),
    extraDamageDice: Array.isArray(form.extraDamageDice) ? [...form.extraDamageDice] : [],
    targetCreatureType: str(form.targetCreatureType),
    abilityForAttack: str(form.ability),
    disabledAutoGainKeys: deriveDisabledAutoGainKeys(form.gains),
  }
  if (mean?.slotIndex !== 1) cfg.versatileMode = str(form.versatileMode)
  return cfg
}
