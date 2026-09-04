/**
 * equipmentSlotUtils.js
 *
 * Unified equipment slot utilities for the equipment/backpack UI refactor.
 * Maps inventory items to slot positions and provides slot change logic.
 */

import { getItemById } from '../data/itemDatabase'

/* ── Constants ────────────────────────────────────────────────────── */

/** Dropdown optgroup structure for slot selection UI */
export const SLOT_GROUPS = [
  {
    group: '手持',
    slots: [
      { value: 'held_0', label: '主手' },
      { value: 'held_1', label: '副手' },
    ],
  },
  {
    group: '备用',
    slots: [
      { value: 'held_2', label: '备用1' },
      { value: 'held_3', label: '备用2' },
      { value: 'held_4', label: '备用3' },
    ],
  },
  {
    group: '穿戴',
    slots: [
      { value: 'worn_body', label: '身穿' },
      { value: 'worn_feet', label: '脚穿' },
      { value: 'worn_hands', label: '手穿' },
      { value: 'worn_head', label: '头带' },
      { value: 'worn_neck', label: '脖带' },
      { value: 'worn_eyes', label: '指戴' },
      { value: 'worn_shoulder', label: '外袍' },
    ],
  },
  {
    group: '',
    slots: [
      { value: 'backpack', label: '背包' },
    ],
  },
]

/** Internal sort priority — lower appears first in unified list */
const SLOT_PRIORITY = {
  held_0: 0,
  held_1: 1,
  held_2: 2,
  held_3: 3,
  held_4: 4,
  worn_body: 10,
  worn_feet: 11,
  worn_hands: 12,
  worn_head: 13,
  worn_neck: 14,
  worn_eyes: 15,
  worn_shoulder: 16,
  backpack: 100,
}

const WEAPON_TYPES = new Set(['近战武器', '远程武器', '枪械', '法器'])

/* ── buildItemSlotMap ─────────────────────────────────────────────── */

/**
 * Build a Map<inventoryId, slotValue> from the held/worn slot arrays.
 *
 * @param {Array<{id, inventoryId}>} heldSlots - equippedHeld array
 * @param {Array<{id, slotId?, inventoryId}>} wornSlots - equippedWorn array
 * @returns {Map<string, string>} inventoryId → slot value string
 */
export function buildItemSlotMap(heldSlots, wornSlots) {
  const map = new Map()
  if (Array.isArray(heldSlots)) {
    heldSlots.forEach((slot, i) => {
      if (slot?.inventoryId) map.set(slot.inventoryId, `held_${i}`)
    })
  }
  if (Array.isArray(wornSlots)) {
    wornSlots.forEach((slot, i) => {
      if (slot?.inventoryId) {
        const slotValue = i === 0 ? 'worn_body' : `worn_${slot.slotId || 'body'}`
        map.set(slot.inventoryId, slotValue)
      }
    })
  }
  return map
}

/* ── buildUnifiedItemList ─────────────────────────────────────────── */

/**
 * Build a sorted unified list of all inventory items with slot assignments.
 * Excludes bag-of-holding items, bag module anchors, and wallet currency entries.
 *
 * @param {Array} inv - inventory array
 * @param {Array} heldSlots
 * @param {Array} wornSlots
 * @returns {Array<{entry, invIndex, slotValue, isEquipped, priority}>}
 */
export function buildUnifiedItemList(inv, heldSlots, wornSlots) {
  if (!Array.isArray(inv)) return []
  const slotMap = buildItemSlotMap(heldSlots, wornSlots)
  const items = []
  for (let i = 0; i < inv.length; i++) {
    const entry = inv[i]
    if (entry?.inBagOfHolding || entry?.bagModuleAnchorId || entry?.walletCurrencyId) continue
    const slotValue = slotMap.get(entry.id) || 'backpack'
    items.push({
      entry,
      invIndex: i,
      slotValue,
      isEquipped: slotValue !== 'backpack',
      priority: SLOT_PRIORITY[slotValue] ?? 99,
    })
  }
  items.sort((a, b) => a.priority - b.priority || a.invIndex - b.invIndex)
  return items
}

/* ── applySlotChange ──────────────────────────────────────────────── */

/**
 * Handle moving an item from its current slot to a new slot.
 * Returns new { heldSlots, wornSlots } arrays (shallow-cloned items).
 *
 * @param {Array} heldSlots
 * @param {Array} wornSlots
 * @param {Array} inv - inventory
 * @param {number} invIndex - index of the item being moved
 * @param {string} newSlotValue - target slot value
 * @returns {{ heldSlots: Array, wornSlots: Array }}
 */
export function applySlotChange(heldSlots, wornSlots, inv, invIndex, newSlotValue) {
  const entry = inv[invIndex]
  if (!entry) return { heldSlots, wornSlots }

  const slotMap = buildItemSlotMap(heldSlots, wornSlots)
  const oldSlot = slotMap.get(entry.id)

  // Already in the target slot — no change
  if (oldSlot === newSlotValue) return { heldSlots, wornSlots }

  // Mutable working copies; only cloned when we actually modify
  let nextHeld = heldSlots
  let nextWorn = wornSlots

  /* Step 1: Remove from old slot */
  if (oldSlot?.startsWith('held_')) {
    const idx = parseInt(oldSlot.slice(5), 10)
    if (nextHeld === heldSlots) nextHeld = heldSlots.map((s) => ({ ...s }))
    if (nextHeld[idx]) nextHeld[idx] = { ...nextHeld[idx], inventoryId: null }
  } else if (oldSlot?.startsWith('worn_')) {
    if (nextWorn === wornSlots) nextWorn = wornSlots.map((s) => ({ ...s }))
    if (oldSlot === 'worn_body') {
      if (nextWorn[0]) nextWorn[0] = { ...nextWorn[0], inventoryId: null }
    } else {
      const sid = oldSlot.slice(5)
      const wi = nextWorn.findIndex((s) => s.slotId === sid)
      if (wi >= 0 && nextWorn[wi]) nextWorn[wi] = { ...nextWorn[wi], inventoryId: null }
    }
  }

  /* Step 2: Place in new slot */
  if (newSlotValue.startsWith('held_')) {
    const idx = parseInt(newSlotValue.slice(5), 10)
    // Ensure array is long enough, padding with empty slots
    if (nextHeld === heldSlots) nextHeld = [...heldSlots]
    while (nextHeld.length <= idx) {
      nextHeld.push({ id: `held_${nextHeld.length}`, inventoryId: null })
    }
    nextHeld[idx] = { ...nextHeld[idx], inventoryId: entry.id }
  } else if (newSlotValue === 'worn_body') {
    if (nextWorn === wornSlots) nextWorn = wornSlots.map((s) => ({ ...s }))
    if (!nextWorn[0]) {
      nextWorn[0] = { id: 'body', inventoryId: entry.id }
    } else {
      nextWorn[0] = { ...nextWorn[0], inventoryId: entry.id }
    }
  } else if (newSlotValue.startsWith('worn_')) {
    const sid = newSlotValue.slice(5)
    if (nextWorn === wornSlots) nextWorn = wornSlots.map((s) => ({ ...s }))
    const existing = nextWorn.findIndex((s) => s.slotId === sid)
    if (existing >= 0) {
      nextWorn[existing] = { ...nextWorn[existing], inventoryId: entry.id }
    } else {
      nextWorn.push({
        id: `worn_${sid}_${Date.now()}`,
        slotId: sid,
        inventoryId: entry.id,
      })
    }
  }
  // 'backpack' — removal already handled above

  return { heldSlots: nextHeld, wornSlots: nextWorn }
}

/* ── getAvailableSlotsForItem ─────────────────────────────────────── */

/**
 * Filter SLOT_GROUPS to only show valid slot options for a given item.
 *
 * Rules (based on item prototype 类型 / 子类型):
 *   held_0 (主手): 近战武器 / 远程武器 / 枪械 / 法器
 *   held_1 (副手): same as 主手 + 盔甲(盾牌)
 *   held_2+ (备用): same as 副手
 *   worn_body (身穿): 盔甲(非盾牌) + 衣服
 *   other worn slots: any item
 *   backpack: always available
 *
 * @param {Object} entry - inventory entry
 * @param {Array} inv - inventory (unused, kept for API consistency)
 * @returns {Array} filtered SLOT_GROUPS shape (empty groups removed)
 */
export function getAvailableSlotsForItem(entry, inv) {
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  const type = proto?.类型 || ''
  const sub = proto?.子类型 || ''

  const isWeapon = WEAPON_TYPES.has(type)
  const isShield = type === '盔甲' && sub === '盾牌'
  const isBodyArmor = type === '盔甲' && sub !== '盾牌'
  const isClothing = type === '衣服'

  return SLOT_GROUPS
    .map((group) => {
      const filtered = group.slots.filter(({ value }) => {
        // Backpack always available
        if (value === 'backpack') return true
        // Other worn slots (non-body) accept any item
        if (value.startsWith('worn_') && value !== 'worn_body') return true
        // worn_body: body armor or clothing only
        if (value === 'worn_body') return isBodyArmor || isClothing
        // held_0 (主手): weapons only
        if (value === 'held_0') return isWeapon
        // held_1+ (副手 / 备用): weapons or shield
        return isWeapon || isShield
      })
      return { ...group, slots: filtered }
    })
    .filter((g) => g.slots.length > 0)
}
