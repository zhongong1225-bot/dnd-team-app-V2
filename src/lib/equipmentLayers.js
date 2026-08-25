/**
 * D&D 2024 装备三层穿戴系统（内袍 / 身体盔甲 / 外袍）+ 盾牌
 * 槽位与背包物品类型过滤（解析 AC 由 formulas 层完成，避免循环依赖）
 * getLayerSlotData 内联于此，避免 equipmentLayersSlot 单独打包时的语法错误
 */
import { getItemById } from '../data/itemDatabase'

const NOTE_KEY = '\u9644\u6CE8'  // 附注
const TYPE_KEY = '\u7C7B\u578B'   // 类型
const SUBTYPE_KEY = '\u5B50\u7C7B\u578B'  // 子类型

/**
 * 从 equippedHeld 中查找盾牌槽位（遍历所有手持槽位，而非硬编码 held[1]）
 * @param {Array} held - equippedHeld 数组
 * @param {Array} inventory - inventory 数组
 * @returns {{ inventoryId: string } | null}
 */
export function findShieldSlot(held, inventory) {
  if (!Array.isArray(held)) return null
  for (const slot of held) {
    if (!slot?.inventoryId) continue
    const entry = inventory.find((e) => e.id === slot.inventoryId)
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    if (proto?.[TYPE_KEY] === '盔甲' && proto?.[SUBTYPE_KEY] === '盾牌') return slot
  }
  return null
}

export function getLayerSlotData(character, layerId) {
  const equipment = character?.equipment ?? {}
  const inventory = character?.inventory ?? []
  let slot = equipment[layerId]
  if (!slot?.inventoryId && layerId === 'bodyArmor') {
    const worn = character?.equippedWorn ?? []
    const bodySlot = worn.find((w) => w.id === 'body')
    if (bodySlot?.inventoryId) slot = { inventoryId: bodySlot.inventoryId }
  }
  if (!slot?.inventoryId && layerId === 'shield') {
    const held = character?.equippedHeld ?? []
    const shieldSlot = findShieldSlot(held, inventory)
    if (shieldSlot?.inventoryId) slot = { inventoryId: shieldSlot.inventoryId }
  }
  const inventoryId = slot?.inventoryId
  const entry = inventoryId ? (inventory.find((e) => e.id === inventoryId) ?? null) : null
  let note = ''
  if (entry && entry[NOTE_KEY] != null) {
    note = String(entry[NOTE_KEY]).trim() || ''
  } else if (entry && entry.itemId) {
    const proto = getItemById(entry.itemId)
    note = (proto && proto[NOTE_KEY] != null) ? String(proto[NOTE_KEY]).trim() : ''
  }
  return { entry, note }
}

/** 防御槽位 ID：L1 内袍、L2 身体盔甲、L3 外袍、盾牌 */
export const DEFENSE_LAYER_IDS = ['innerRobe', 'bodyArmor', 'outerRobe', 'shield']

/** 槽位显示名 */
export const DEFENSE_LAYER_LABELS = {
  innerRobe: '内袍 (L1)',
  bodyArmor: '身体盔甲 (L2)',
  outerRobe: '外袍 (L3)',
  shield: '盾牌',
}

/**
 * 从背包中筛选可放入指定防御槽位的物品
 */

export function getInventoryForLayer(inventory, layerId) {
  const inv = Array.isArray(inventory) ? inventory : []
  return inv.filter((entry) => {
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    if (!proto) return false
    const typeVal = proto[TYPE_KEY] ?? String()
    const subVal = proto[SUBTYPE_KEY] ?? String()
    switch (layerId) {
      case 'innerRobe':
        return typeVal === '\u8863\u670D'  // 衣服
      case 'bodyArmor':
        return typeVal === '\u76D4\u7532' && subVal !== '\u76FE\u724C'  // 盔甲 盾牌
      case 'outerRobe':
        return typeVal === '\u8863\u670D' || typeVal === '\u9970\u54C1'  // 衣服 饰品
      case 'shield':
        return typeVal === '\u76D4\u7532' && subVal === '\u76FE\u724C'  // 盔甲 盾牌
      default:
        return false
    }
  })
}

/**
 * 判断当前是否使用“三层穿戴”数据（任一防御槽位有 inventoryId）
 * 也检查 equippedWorn(body) 和 equippedHeld(off=shield)
 */
export function useLayersForAC(equipment, character) {
  const eq = equipment ?? {}
  if (DEFENSE_LAYER_IDS.some((id) => !!eq[id]?.inventoryId)) return true
  const worn = character?.equippedWorn ?? []
  if (worn.some((w) => w.id === 'body' && w.inventoryId)) return true
  const held = character?.equippedHeld ?? []
  const shieldSlot = findShieldSlot(held, character?.inventory ?? [])
  if (shieldSlot?.inventoryId) return true
  return false
}
