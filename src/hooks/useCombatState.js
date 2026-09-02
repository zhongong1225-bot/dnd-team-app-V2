import { useMemo } from 'react'
import {
  getMaxAttunementSlots,
  getAttunedCountFromInventory,
  getAttunedItemsFromInventory,
  getEffectiveSlotValues,
  getEffectiveFromInventoryItem,
} from '../lib/combatState'
import { getWeaponById } from '../data/weaponDatabase'
import { getMergedBuffsForCalculator } from '../lib/effects/effectMapping'

/**
 * 战斗与同调状态：同调位上限、已用数量（来自背包）、已同调列表、每槽有效数值
 * 装备槽可存 inventoryId，有效数值从背包物品解析
 * @param {object} character - { buffs, equipment, inventory }
 */
export function useCombatState(character) {
  return useMemo(() => {
    const mergedBuffs = getMergedBuffsForCalculator(character, character?.moduleId)
    const equipment = character?.equipment ?? {}
    const inventory = character?.inventory ?? []
    const maxSlots = getMaxAttunementSlots(mergedBuffs, character)
    const attunedCount = getAttunedCountFromInventory(inventory)
    const attunedItems = getAttunedItemsFromInventory(inventory)

    const getEffective = (slotKey) => {
      const raw = equipment[slotKey]
      if (raw?.inventoryId) {
        const item = inventory.find((e) => e.id === raw.inventoryId)
        return getEffectiveFromInventoryItem(item)
      }
      const weapon = raw?.weaponId ? getWeaponById(raw.weaponId) : null
      return getEffectiveSlotValues(raw, weapon)
    }

    return {
      maxAttunementSlots: maxSlots,
      attunedCount,
      attunedItems,
      attunementSlotsAvailable: Math.max(0, maxSlots - attunedCount),
      getEffectiveSlot: getEffective,
    }
  }, [character?.buffs, character?.equipment, character?.inventory, character?.classFeatureChoices])
}
