/**
 * D&D 2024 战斗与同调状态
 * - 同调位：基础上限 3 + 增益表 extra_attunement_slots
 * - 已同调：使用魔法加值/伤害；未同调强制装备：无魔法（用基础值）
 */

import { getWeaponById } from '../data/weaponDatabase'
import { getItemById, itemRequiresAttunement } from '../data/itemDatabase'
import { evaluateBuffValue, proficiencyBonus } from './formulas'

/** 同调位基础上限 */
export const BASE_ATTUNEMENT_SLOTS = 3

/** 装备槽 ID 列表（武器 + 防具） */
export const EQUIPMENT_SLOT_IDS = ['mainHand', 'offHand', 'backup1', 'backup2', 'backup3', 'backup4', 'armor']

/** 武器槽（用于攻击计算） */
export const WEAPON_SLOT_IDS = ['mainHand', 'offHand', 'backup1', 'backup2', 'backup3', 'backup4']

/** 将 buff 列表展平为单一效果（兼容 buff.effects 数组） */
function getFlatEffectEntries(buffs) {
  const out = []
  for (const b of buffs) {
    if (b.enabled === false) continue
    if (Array.isArray(b.effects) && b.effects.length) {
      b.effects.forEach((e) => out.push({ effectType: e.effectType, value: e.value }))
    } else {
      out.push({ effectType: b.effectType, value: b.value })
    }
  }
  return out
}

/**
 * 从全局增益表计算最大同调位
 * @param {Array<{ effectType?: string, value?: number, enabled?: boolean, effects?: Array }>} buffs
 * @param {object} [character] - 用于公式求值（等级、属性等）
 * @returns {number}
 */
export function getMaxAttunementSlots(buffs, character = null) {
  const list = Array.isArray(buffs) ? buffs : []
  const entries = getFlatEffectEntries(list)
  const level = Math.max(1, Math.min(20, Number(character?.level) || 1))
  const prof = proficiencyBonus(level)
  const abilities = character?.abilities ?? {}
  const formulaContext = { level, abilities, prof, spellDC: 0, spellAttack: 0 }
  let extra = 0
  for (const b of entries) {
    const type = b.effectType ?? ''
    // 兼容旧数据可能用中文标签或旧键保存的额外同调位
    if (type === 'extra_attunement_slots' || type === '额外同调位' || type === 'extraAttunementSlots') {
      const v = evaluateBuffValue(b.value, formulaContext)
      if (!Number.isNaN(v) && v > 0) extra += v
    }
  }
  return BASE_ATTUNEMENT_SLOTS + extra
}

/**
 * 判断该槽位物品是否“需要同调”（有魔法加值或自定义伤害则视为需同调）
 */
export function slotRequiresAttunement(slot, weapon) {
  if (!slot) return false
  const hasMagicBonus = Number(slot.magicBonus) !== 0
  const hasCustomDice = slot.damageDice && String(slot.damageDice).trim() && slot.damageDice !== (weapon?.damageDice ?? '')
  return hasMagicBonus || hasCustomDice
}

/**
 * 当前占用的同调位数量（从背包物品统计：所有已勾选同调的物品）
 */
export function getAttunedCountFromInventory(inventory) {
  const inv = Array.isArray(inventory) ? inventory : []
  return inv.filter((i) => i.isAttuned === true && (i.requiresAttunement || i.requiresAttunement === undefined)).length
}

/**
 * 当前已同调的背包物品（用于展示）
 * 返回 { id, name }[]
 */
export function getAttunedItemsFromInventory(inventory) {
  const inv = Array.isArray(inventory) ? inventory : []
  return inv
    .filter((i) => i.isAttuned === true && (i.requiresAttunement || i.requiresAttunement === undefined))
    .map((i) => ({ id: i.id, name: i.name?.trim() || i.类别 || '—' }))
}

/** @deprecated 保留兼容：从装备槽统计同调（旧逻辑） */
export function getAttunedCount(equipment) {
  const eq = equipment ?? {}
  let count = 0
  for (const slotId of WEAPON_SLOT_IDS) {
    const raw = eq[slotId]
    if (!raw?.weaponId && !raw?.inventoryId) continue
    if (raw.inventoryId) {
      if (raw.isAttuned !== false) count++
    } else {
      const weapon = getWeaponById(raw.weaponId)
      if (slotRequiresAttunement(raw, weapon) && raw.isAttuned !== false) count++
    }
  }
  return count
}

/** @deprecated 保留兼容 */
export function getAttunedItems(equipment) {
  const eq = equipment ?? {}
  const out = []
  for (const slotId of WEAPON_SLOT_IDS) {
    const raw = eq[slotId]
    if (raw?.inventoryId && raw.isAttuned !== false) {
      out.push({ slotId, itemId: raw.inventoryId, name: raw.name || '—' })
    } else if (raw?.weaponId) {
      const weapon = getWeaponById(raw.weaponId)
      if (slotRequiresAttunement(raw, weapon) && raw.isAttuned !== false) {
        out.push({ slotId, itemId: raw.weaponId, name: raw.name?.trim() || weapon?.name || '—' })
      }
    }
  }
  return out
}

/**
 * 单槽有效数值：根据 isAttuned 返回“当前生效”的命中加值与伤害骰
 * - 已同调：magicBonus + 自定义 damageDice 或武器基础
 * - 未同调：0 魔法，仅武器基础伤害骰
 */
export function getEffectiveSlotValues(slot, weapon) {
  const isAttuned = slot?.isAttuned !== false
  const baseDice = weapon?.damageDice ?? ''
  const magicBonus = Number(slot?.magicBonus) || 0
  const customDice = slot?.damageDice && String(slot.damageDice).trim() ? String(slot.damageDice).trim() : null

  const effectiveHitBonus = isAttuned ? magicBonus : 0
  const effectiveDamageDice = isAttuned
    ? (customDice || baseDice)
    : baseDice

  return {
    effectiveHitBonus,
    effectiveDamageDice: effectiveDamageDice || '',
    effectiveDamageBonus: isAttuned ? magicBonus : 0,
  }
}

/** 从背包物品解析伤害骰（攻击字段如 "1d8 挥砍" 或 "1d8+1 挥砍" 取骰子部分） */
function parseDiceFrom攻击(攻击) {
  if (!攻击 || typeof 攻击 !== 'string') return ''
  const m = String(攻击).trim().match(/^(\d+d\d+)/i)
  return m ? m[1] : ''
}

/**
 * 从背包物品计算有效数值（用于装备栏引用背包物品时）
 * 物品：{ 攻击, isAttuned, magicBonus }
 * 已同调才生效魔法加值；未同调仅保留基础伤害骰。
 */
export function getEffectiveFromInventoryItem(invItem) {
  if (!invItem) return { effectiveHitBonus: 0, effectiveDamageDice: '', effectiveDamageBonus: 0 }
  const isAttuned = invItem.isAttuned === true
  const magicBonus = Number(invItem.magicBonus) || 0
  const diceFrom攻击 = parseDiceFrom攻击(invItem.攻击)
  return {
    effectiveHitBonus: isAttuned ? magicBonus : 0,
    effectiveDamageDice: diceFrom攻击,
    effectiveDamageBonus: isAttuned ? magicBonus : 0,
  }
}
