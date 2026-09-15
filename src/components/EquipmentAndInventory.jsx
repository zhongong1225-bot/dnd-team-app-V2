/**
 * 装备与背包：合并身穿装备和背包
 * 上方：手持与身穿（左右分栏）
 * 下方：背包
 */
import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import {
  Plus,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  Package,
  Lock,
  Unlock,
  Sparkles,
  Swords,
  Shield,
  Shirt,
  Crown,
  Backpack,
  Wind,
  Footprints,
  Hand,
  Gem,
  Eye,
  Layers,
  MoreVertical,
} from 'lucide-react'
import AbilityUseModal from './AbilityUseModal'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { getCharacterWallet, transferCurrency } from '../lib/currencyStore'
import { getCharacter } from '../lib/characterStore'
import { addToWarehouse } from '../lib/warehouseStore'
import { useModule } from '../contexts/ModuleContext'
import { getMergedBuffsForCalculator } from '../lib/effects/effectMapping'
import { getSpellcastingCombatStats } from '../lib/spellcastingStats'
import { CurrencyGrid } from './CurrencyDisplay'
import {
  getInventoryEntryStackWeightLb,
  getBagOfHoldingSelfWeightLb,
  formatDisplayWeightLb,
  formatDisplayGemLbQty,
} from '../lib/encumbrance'
import { getMaxAttunementSlots, getAttunedCountFromInventory } from '../lib/combatState'
import ItemAddForm from './ItemAddForm'
import EncumbranceBar from './EncumbranceBar'
import TransferModal from './TransferModal'
import { parseArmorNote } from '../lib/formulas'
import { abilityModifier } from '../lib/formulas'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import { ABILITY_NAMES_ZH, hasItemStorageEffect, ITEM_STORAGE_DEFAULT_ITEM_IDS, BUFF_TYPES } from '../data/buffTypes'
import { getCharacterClasses, getClassDisplayName } from '../data/classDatabase'
import { inputClass, inputClassInline } from '../lib/inputStyles'
import { logTeamActivity } from '../lib/activityLog'
import { NumberStepper } from './BuffForm'
import { appendContainedSpellsBrief } from '../lib/containedSpellBrief'
import { hasContainedSpellEffect, buildActiveAbilityFromEntry, extractContainedSpellValueFromEntry } from '../lib/containedSpellModel'
import ContainedSpellUseButton from './ContainedSpellUseButton'
import { ShieldPoolCounter } from './CardView'
import { getShieldPoolCurrent, setShieldPoolCurrent, decrementShieldPool, resetShieldPool, buildShieldPoolKey } from '../lib/shieldPoolUtils'
import { BagModuleSection, parseDragInventoryIndex, deliverBagDrop } from './BagOfHoldingPanel'
import { normalizeBagOfHoldingVisibility } from '../lib/bagOfHoldingVisibility'
import {
  getNormalizedBagModules,
  removeBagModuleAt,
  updateModuleBagCount,
  mergeWalletDelta,
  inventoryWithBagPatch,
  MAX_BAG_OF_HOLDING_TOTAL,
  MAX_BAG_OF_HOLDING_MODULES,
  reconcileBagModuleAnchors,
  isBagModuleAnchorEntry,
  entryBelongsToBagModule,
  createInitialBagModule,
} from '../lib/bagOfHoldingModules'
import { mergeWalletWithBagWallet, walletPartForCommittedTotal } from '../lib/currencyInventoryRows'
import { getEntryChargeMax, computeRecoveryForMethod } from '../lib/chargeRecovery'
import { resolveChargeItemCharges } from '../lib/chargeItemModel'
import {
  normalizeBackpackLayoutOrder,
  resolveInvIndexFromItemToken,
  reorderLayoutTokens,
  itemTokenForEntry,
} from '../lib/backpackLayoutOrder'
import {
  inventoryItemActionsCellClass,
  inventoryItemCardShellClass,
  inventoryItemRowGridUnified,
  chargeStepperClass,
  chargeStepperBtnClass,
  chargeBarWrapClass,
  chargeBarFillClass,
  chargeBarFillGradient,
  chargeTextClass,
  releaseBtnClass,
  actionIconBtnClass,
  actionIconBtnDangerClass,
  actionDropdownBtnClass,
  actionDropdownMenuClass,
  actionMenuItemClass,
  actionMenuItemDangerClass,
  actionMenuDividerClass,
  inventoryItemNameExtrasClass,
  inventoryItemNameRowClass,
  inventoryItemNameTextClass,
  inventoryItemNameTitleGroupClass,
  inventoryItemChargeCellClass,
  inventoryItemQtyWeightCellClass,
} from '../lib/inventoryItemCardStyles'
import InfoTooltip from './InfoTooltip'
import { ItemTooltipContent } from '../lib/infoTooltipContent'
import { buildUnifiedItemList, applySlotChange, getAvailableSlotsForItem } from '../lib/equipmentSlotUtils'
import EquipmentItemCard from './EquipmentItemCard'

const HELD_LABELS = ['主手', '副手']
const WORN_SLOT_OPTIONS = [
  { id: 'head', label: '头部' },
  { id: 'body', label: '身体' },
  { id: 'shoulder', label: '肩背' },
  { id: 'coat', label: '外套' },
  { id: 'feet', label: '鞋子' },
  { id: 'hands', label: '手套' },
  { id: 'neck', label: '颈脖' },
  { id: 'eyes', label: '眼睛' },
]

const WORN_SLOT_ICONS = {
  head: Crown,
  body: Shirt,
  shoulder: Backpack,
  coat: Wind,
  feet: Footprints,
  hands: Hand,
  neck: Gem,
  eyes: Eye,
}

/** 装备护盾池计数器：从 entry.effects 检测 shield_pool 效果并渲染 */
function EquipmentShieldPoolCounter({ entry, character, onSave, compact = true }) {
  if (!entry) return <div />
  const spEffect = Array.isArray(entry.effects)
    ? entry.effects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
    : null
  if (!spEffect) return <div />
  const spMax = Number(spEffect.value.max) || 10
  const spThreshold = Number(spEffect.value.threshold) || 0
  const spCurrent = getShieldPoolCurrent(character, 'equipment', entry.id, spMax)
  return (
    <ShieldPoolCounter
      current={spCurrent}
      max={spMax}
      threshold={spThreshold}
      compact={compact}
      onChange={(v) => {
        const newState = setShieldPoolCurrent(character, 'equipment', entry.id, v)
        onSave({ shieldPoolStates: newState })
      }}
    />
  )
}


function getEntryDisplayName(entry) {
  if (!entry) return '—'
  const customName = entry.name?.trim()
  if (customName) return customName
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  return getItemDisplayName(proto) || '—'
}

/** 手持：主手 武器+法器+枪械；副手 盾牌+武器+枪械+法器；备用 与副手可选范围一致 */
function getHeldOptions(inv, slotIndex) {
  return inv.filter((e) => {
    if (e?.inBagOfHolding || e?.bagModuleAnchorId) return false
    const proto = e.itemId ? getItemById(e.itemId) : null
    const t = proto?.类型 ?? ''
    const sub = proto?.子类型 ?? ''
    const mainHandSet = t === '近战武器' || t === '远程武器' || t === '枪械' || t === '法器'
    const offHandSet = (t === '盔甲' && sub === '盾牌') || mainHandSet
    if (slotIndex === 0) return mainHandSet
    return offHandSet
  })
}

/** 身穿：身体 盔甲(非盾牌)+衣服. 其他 全部 */
function getWornOptions(inv, slotId) {
  if (slotId === 'body') {
    return inv.filter((e) => {
      if (e?.inBagOfHolding || e?.bagModuleAnchorId) return false
      const proto = e.itemId ? getItemById(e.itemId) : null
      const t = proto?.类型 ?? ''
      const sub = proto?.子类型 ?? ''
      if (t === '衣服') return true
      if (t === '盔甲' && sub !== '盾牌') return true
      return false
    })
  }
  return inv.filter((e) => !e?.inBagOfHolding && !e?.bagModuleAnchorId)
}

/** 迁移旧 equippedSlots 到 equippedHeld；旧身穿 8 槽转为 身体 + 可添加 */
function migrateSlots(character) {
  const old = character?.equippedSlots
  if (!Array.isArray(old) || old.length === 0) return null
  const held = old.map((s, i) => ({ id: s.id || 'held_' + i, inventoryId: s.inventoryId ?? null }))
  const existing = character?.equippedWorn ?? []
  const bodySlot = existing.find((w) => w.id === 'body') ?? { id: 'body', inventoryId: null }
  const addable = existing
    .filter((w) => w.id !== 'body')
    .filter((w) => w.inventoryId || (w.slotId && w.slotId !== 'body'))
    .map((w, i) => ({
      id: w.id?.startsWith('worn_') ? w.id : 'worn_migrate_' + i + '_' + Date.now(),
      slotId: w.slotId ?? w.id ?? 'head',
      inventoryId: w.inventoryId ?? null,
    }))
  const worn = [{ id: 'body', inventoryId: bodySlot.inventoryId }, ...addable]
  return { held, worn }
}

/** 构建 equipment 以支持 AC 计算（卸下时显式置空，便于 getAC 正确回退） */
function buildEquipmentForAC(heldSlots, wornSlots, inv) {
  const eq = { bodyArmor: null, shield: null }
  const bodySlot = wornSlots.find((s) => s.id === 'body' || s.slotId === 'body')
  if (bodySlot?.inventoryId) {
    const entry = inv.find((e) => e.id === bodySlot.inventoryId)
    if (entry) {
      const proto = entry.itemId ? getItemById(entry.itemId) : null
      if (proto?.类型 === '盔甲' && proto?.子类型 !== '盾牌') {
        eq.bodyArmor = { inventoryId: bodySlot.inventoryId, magicBonus: entry.magicBonus }
      }
    }
  }
  const shieldSlot = heldSlots.find((s) => {
    if (!s?.inventoryId) return false
    const entry = inv.find((e) => e.id === s.inventoryId)
    if (!entry) return false
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    return proto?.类型 === '盔甲' && proto?.子类型 === '盾牌'
  })
  if (shieldSlot?.inventoryId) {
    const entry = inv.find((e) => e.id === shieldSlot.inventoryId)
    if (entry) {
      eq.shield = { inventoryId: shieldSlot.inventoryId }
    }
  }
  return eq
}

const BAG_PANEL_ICON_BTN =
  'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border border-gray-500/70 bg-gray-800/90 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
const BAG_PANEL_REMOVE_BTN =
  'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border border-dnd-red/60 bg-gray-800/90 text-dnd-red hover:bg-dnd-red/20 hover:border-dnd-red/80 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800/90 disabled:hover:border-dnd-red/60'

/**
 * 从物品效果生成 BUFF 标签数组
 * @param {Array} effects - 物品效果数组 [{ effectType, value, ... }]
 * @returns {Array<string>} 标签字符串数组，如 ["AC+2", "命中+1"]
 */
function getBuffTagsFromEffects(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return []

  // 构建 effectType -> label 映射
  const effectLabelMap = {}
  for (const category of Object.values(BUFF_TYPES)) {
    for (const effect of category.effects || []) {
      effectLabelMap[effect.key] = effect.label
    }
  }

  const tags = []
  for (const effect of effects) {
    const label = effectLabelMap[effect.effectType] || effect.effectType
    const value = formatEffectValue(effect)
    if (value !== null && value !== undefined) {
      tags.push(`${label}${value}`)
    } else {
      tags.push(label)
    }
  }
  return tags
}

/**
 * 格式化效果值为简短字符串
 */
function formatEffectValue(effect) {
  const { effectType, value } = effect
  if (value === undefined || value === null) return null

  // 数值类型直接返回
  if (typeof value === 'number') {
    return value > 0 ? `+${value}` : `${value}`
  }

  // 布尔类型
  if (typeof value === 'boolean') {
    return value ? '✓' : null
  }

  // 对象类型 - 根据 effectType 提取关键信息
  if (typeof value === 'object') {
    // ac_bonus: { base, extra }
    if (effectType === 'ac_bonus') {
      const extra = value.extra || 0
      return extra ? `+${extra}` : null
    }
    // attack_bonus / damage_bonus: { value, advantage? }
    if (effectType === 'attack_bonus' || effectType === 'damage_bonus') {
      const v = value.value || 0
      return v ? (v > 0 ? `+${v}` : `${v}`) : null
    }
    // ability_score_uncapped: { str, dex, ... }
    if (effectType === 'ability_score_uncapped') {
      const mods = []
      for (const [ability, mod] of Object.entries(value)) {
        if (mod && mod !== 0) mods.push(`${ABILITY_NAMES_ZH[ability] || ability}+${mod}`)
      }
      return mods.length ? mods.join(',') : null
    }
    // damage_type_relation: { types, relation }
    if (effectType === 'damage_type_relation') {
      const relationLabel = value.relation === 'resist' ? '抗' : value.relation === 'immune' ? '免' : '易'
      const types = (value.types || []).slice(0, 3).join('/')
      return types ? `${relationLabel}:${types}` : null
    }
    // extra_damage_dice: { count, die, type? }
    if (effectType === 'extra_damage_dice') {
      const count = value.count || 0
      const die = value.die || ''
      return count && die ? `${count}${die}` : null
    }
    // 其他对象类型，尝试提取 value 字段
    if (value.value !== undefined) {
      const v = value.value
      if (typeof v === 'number') return v > 0 ? `+${v}` : `${v}`
      if (typeof v === 'string' && v) return v
    }
    return null
  }

  // 字符串类型
  if (typeof value === 'string') {
    return value ? `: ${value}` : null
  }

  return null
}

export default function EquipmentAndInventory({ character, canEdit, onSave, onWalletSuccess, activityActor, activeAbilities = [] }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const reconcileResult = useMemo(() => reconcileBagModuleAnchors(character), [character])
  const inv = reconcileResult.inventory

  useEffect(() => {
    if (!canEdit || !reconcileResult.changed) return
    onSave({ inventory: reconcileResult.inventory })
  }, [canEdit, reconcileResult.changed, reconcileResult.inventory, onSave])

  const bagModules = useMemo(
    () => getNormalizedBagModules(character),
    [character?.id, character?.bagOfHoldingModules, character?.bagOfHoldingSlots, character?.bagOfHoldingCount, character?.bagOfHoldingVisibility],
  )
  const modulesBagCountTotal = (mods) =>
    (mods || []).reduce((s, m) => s + (Math.max(0, Number(m.bagCount) || 0)), 0)
  const personRows = useMemo(
    () => inv.map((entry, i) => ({ entry, i })).filter(({ entry }) => !entry?.inBagOfHolding),
    [inv],
  )
  const migrated = migrateSlots(character)
  const mergedBuffs = useMemo(() => getMergedBuffsForCalculator(character, moduleId), [
    character?.buffs,
    character?.selectedFeats,
    character?.selectedInvocations,
    character?.selectedFightingStyles,
    character?.classFeatureChoices,
    character?.inventory,
    character?.equippedHeld,
    character?.equippedWorn,
    character?.raceCard,
    character?.backgroundCard,
    character?.shields,
    moduleId,
  ])
  const buffStats = useBuffCalculator(character, mergedBuffs)
  const level = Math.max(1, Math.min(20, parseInt(character?.level, 10) || 1))
  const abilities = buffStats?.abilities ?? character?.abilities ?? {}
  const { spellAbility, spellAttackBonus, spellDC, prof } = getSpellcastingCombatStats(character, buffStats, level)
  const characterClasses = useMemo(() => getCharacterClasses(character), [character])
  const referenceData = useMemo(() => {
    const arr = []
    Object.entries(abilities).forEach(([k, v]) => {
      const label = ABILITY_NAMES_ZH[k] ?? k
      const score = Number(v) || 0
      if (v != null) {
        arr.push({ label: `${label}调整值`, value: abilityModifier(score), ref: 'abilityModifier', ability: k })
      }
    })
    arr.push({ label: '熟练加值', value: prof, ref: 'proficiency' })
    arr.push({ label: '等级', value: level, ref: 'level' })
    for (const c of characterClasses) {
      const displayName = getClassDisplayName(c.name) || c.name
      arr.push({ label: `${displayName}等级`, value: c.level, ref: 'classLevel', className: c.name })
    }
    if (spellDC != null) arr.push({ label: '法术DC', value: spellDC, ref: 'spellDc' })
    if (spellAttackBonus != null) arr.push({ label: '法术攻击', value: spellAttackBonus, ref: 'spellAttack' })
    return arr
  }, [abilities, prof, level, spellDC, spellAttackBonus, characterClasses])
  const heldSlots = character?.equippedHeld ?? migrated?.held ?? [
    { id: 'main', inventoryId: null },
    { id: 'off', inventoryId: null },
  ]
  const wornSlots = (() => {
    if (migrated?.worn) return migrated.worn
    const existing = character?.equippedWorn ?? []
    const body = existing.find((w) => w.id === 'body') ?? { id: 'body', inventoryId: null }
    const addable = existing
      .filter((w) => w.id !== 'body')
      .filter((w) => w.inventoryId || w.slotId)
      .map((w, i) => ({
        id: w.id?.startsWith('worn_') ? w.id : 'worn_' + Date.now() + '_' + i,
        slotId: w.slotId ?? w.id ?? 'head',
        inventoryId: w.inventoryId ?? null,
      }))
    return [{ id: 'body', inventoryId: body.inventoryId }, ...addable]
  })()
  const bodySlot = wornSlots[0]
  const wornAddable = wornSlots.slice(1)

  const maxAttunementSlots = useMemo(() => getMaxAttunementSlots(mergedBuffs, character), [mergedBuffs, character])
  const attunedCount = getAttunedCountFromInventory(inv)
  const [wallet, setWallet] = useState({})
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirection, setTransferDirection] = useState('toVault')
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editingNested, setEditingNested] = useState(null) // { containerId, nestedIndex }
  const [storeToVaultIndex, setStoreToVaultIndex] = useState(null)
  const [storeToVaultQty, setStoreToVaultQty] = useState(1)
  const [isStoreToVaulting, setIsStoreToVaulting] = useState(false)
  const [transferHint, setTransferHint] = useState('')
  const [bagModuleDeleteUnlocked, setBagModuleDeleteUnlocked] = useState({})
  const [bagModuleExpanded, setBagModuleExpanded] = useState({})
  /** 背包物品卡详情：默认折叠，与次元袋/团队仓库一致 */
  const [backpackItemBriefOpen, setBackpackItemBriefOpen] = useState({})
  const [openActionRow, setOpenActionRow] = useState(null)
  const [equipmentUseModal, setEquipmentUseModal] = useState(null)
  const [absorbResult, setAbsorbResult] = useState(null)
  const actionMenuRef = useRef(null)
  const autoIdMigratedRef = useRef(false)

  useEffect(() => {
    if (openActionRow === null) return
    const handler = (e) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setOpenActionRow(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openActionRow])

  useEffect(() => {
    setBagModuleExpanded((prev) => {
      const next = { ...prev }
      for (const m of bagModules) {
        if (next[m.id] === undefined) {
          next[m.id] = normalizeBagOfHoldingVisibility(m.visibility) !== 'public'
        }
      }
      for (const id of Object.keys(next)) {
        if (!bagModules.some((m) => m.id === id)) delete next[id]
      }
      return next
    })
  }, [bagModules])

  useEffect(() => {
    setBagModuleDeleteUnlocked((prev) => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (!bagModules.some((m) => m.id === id)) delete next[id]
      }
      return next
    })
  }, [bagModules])

  useEffect(() => {
    if (character?.id) setWallet(getCharacterWallet(character.id))
  }, [character?.id, character?.wallet])

  /** 展示用：钱包字段 + 次元袋内钱币合计 */
  const displayWallet = useMemo(() => mergeWalletWithBagWallet(wallet, inv), [wallet, inv])

  const layoutOrder = useMemo(
    () => normalizeBackpackLayoutOrder(character?.backpackLayoutOrder, displayWallet, inv),
    [character?.backpackLayoutOrder, displayWallet, inv],
  )

  const unifiedItems = useMemo(
    () => buildUnifiedItemList(inv, heldSlots, wornSlots),
    [inv, heldSlots, wornSlots]
  )
  const equippedItems = useMemo(
    () => unifiedItems.filter(item => item.isEquipped),
    [unifiedItems]
  )

  useEffect(() => {
    if (!canEdit || autoIdMigratedRef.current) return
    if (!inv.some((e) => !e?.inBagOfHolding && !e?.id)) return
    autoIdMigratedRef.current = true
    onSave({
      inventory: inv.map((e, idx) =>
        !e?.inBagOfHolding && !e?.id ? { ...e, id: `inv_${idx}_${(e.name || 'item').replace(/\s+/g, '_')}` } : e,
      ),
    })
  }, [canEdit, inv, onSave])

  const saveWithEquipment = (patch) => {
    const nextHeld = patch.equippedHeld ?? heldSlots
    const nextWorn = patch.equippedWorn ?? wornSlots
    const nextInv = patch.inventory ?? inv
    const acEquipment = buildEquipmentForAC(nextHeld, nextWorn, nextInv)
    const equipment = { ...(character?.equipment ?? {}), ...acEquipment }
    onSave({ ...patch, equipment })
  }

  const setHeld = (next) => saveWithEquipment({ equippedHeld: next, equippedWorn: wornSlots })
  const setWorn = (next) => saveWithEquipment({ equippedHeld: heldSlots, equippedWorn: next }) 

  const setHeldEquip = (i, inventoryId) => {
    const next = [...heldSlots]
    next[i] = { ...next[i], inventoryId: inventoryId || null }
    setHeld(next)
  }
  const setWornEquip = (inventoryId) => {
    const next = [{ ...bodySlot, inventoryId: inventoryId || null }, ...wornAddable]
    setWorn(next)
  }

  const setWornAddableSlotId = (addableIndex, slotId) => {
    const next = [...wornSlots]
    const idx = addableIndex + 1
    next[idx] = { ...next[idx], slotId: slotId || 'head', inventoryId: next[idx]?.inventoryId ?? null }
    setWorn(next)
  }

  const setWornAddableEquip = (addableIndex, inventoryId) => {
    const next = [...wornSlots]
    const idx = addableIndex + 1
    next[idx] = { ...next[idx], inventoryId: inventoryId || null }
    setWorn(next)
  }

  const setWornMagicBonus = (inventoryId, value) => {
    const entryIdx = inv.findIndex((e) => e.id === inventoryId)
    if (entryIdx < 0) return
    const n = Math.max(0, parseInt(value, 10) || 0)
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, magicBonus: n } : e))
    onSave({ inventory: nextInv })
  }

  /** 更新身穿身体槽条目上的魔法装备强化加值 */

  const addWornSlot = () => {
    const used = new Set(wornAddable.map((a) => a.slotId).filter(Boolean))
    const slotId = WORN_SLOT_OPTIONS.find((o) => o.id !== 'body' && !used.has(o.id))?.id ?? 'head'
    setWorn([...wornSlots, { id: 'worn_' + Date.now(), slotId, inventoryId: null }])
  }

  const removeWornSlot = (addableIndex) => {
    const next = [bodySlot, ...wornAddable.filter((_, i) => i !== addableIndex)]
    setWorn(next)
  }

  const handleSlotChange = (invIndex, newSlotValue) => {
    const result = applySlotChange(heldSlots, wornSlots, inv, invIndex, newSlotValue)
    saveWithEquipment({
      equippedHeld: result.heldSlots,
      equippedWorn: result.wornSlots,
    })
  }

  const HELD_FIXED = 2
  const addHeldSlot = () => setHeld([...heldSlots, { id: 'held_' + Date.now(), inventoryId: null }])
  const removeHeldSlot = (i) => {
    if (i < HELD_FIXED || heldSlots.length <= HELD_FIXED) return
    setHeld(heldSlots.filter((_, j) => j !== i))
  }

  const removeItem = (index) => {
    const e = inv[index]
    if (e?.bagModuleAnchorId) {
      const mx = bagModules.findIndex((m) => m.id === e.bagModuleAnchorId)
      if (mx < 0) {
        onSave({ inventory: inv.filter((_, i) => i !== index) })
        return
      }
      if (
        !window.confirm(
          '确定删除此次元袋模块吗？\n\n删除后袋内物品会回到背包（身上）物品栏；此操作不可撤销。',
        )
      ) {
        return
      }
      handleRemoveBagModule(mx)
      return
    }
    /** 背包「钱币实体行」与 character.wallet 同步；只删 inventory 会在保存时被 sync 加回，须同时清零该币种身上钱包 */
    if (e?.walletCurrencyId && !e?.inBagOfHolding) {
      const cid = e.walletCurrencyId
      const nextWallet = { ...wallet, [cid]: 0 }
      saveWithEquipment({ wallet: nextWallet })
      return
    }
    onSave({ inventory: inv.filter((_, i) => i !== index) })
  }

  /** 次元袋行删除：钱币堆叠退回个人钱包，其余从 inventory 移除 */
  const removeBagItemByGlobalIndex = (index) => {
    const e = inv[index]
    if (!e) return
    if (e.walletCurrencyId) {
      const add = Number(e.qty) || 0
      if (add <= 0) {
        removeItem(index)
        return
      }
      const nextWallet = mergeWalletDelta(wallet, { [e.walletCurrencyId]: add })
      saveWithEquipment({ inventory: inv.filter((_, i) => i !== index), wallet: nextWallet })
      return
    }
    removeItem(index)
  }

  /** 容器储物：将背包内其他物品移入目标容器（不可嵌套容器、不可移入自身） */
  const moveItemIntoContainer = (sourceIndex, containerId) => {
    const source = inv[sourceIndex]
    const containerIdx = inv.findIndex((e) => e.id === containerId)
    if (!source || containerIdx < 0) return
    const container = inv[containerIdx]
    if (source.id === container.id) {
      alert('不能把物品放入它自身')
      return
    }
    if (hasItemStorageEffect(source)) {
      alert('容器不能放入另一个容器')
      return
    }
    const nested = Array.isArray(container.nestedInventory) ? [...container.nestedInventory] : []
    const item = { ...source }
    delete item.inBagOfHolding
    delete item.bagModuleId
    delete item.bagSlotId
    delete item.bagModuleAnchorId
    nested.push(item)
    let nextInv = inv
      .map((e, i) => {
        if (i === containerIdx) return { ...e, nestedInventory: nested }
        if (i === sourceIndex) return null
        return e
      })
      .filter(Boolean)
    let nextHeld = heldSlots
    let nextWorn = wornSlots
    let eqChanged = false
    const entryId = item.id
    if (entryId) {
      if (nextHeld.some((s) => s.inventoryId === entryId)) {
        nextHeld = nextHeld.map((s) => (s.inventoryId === entryId ? { ...s, inventoryId: null } : s))
        eqChanged = true
      }
      if (nextWorn.some((s) => s.inventoryId === entryId)) {
        nextWorn = nextWorn.map((s) => (s.inventoryId === entryId ? { ...s, inventoryId: null } : s))
        eqChanged = true
      }
    }
    setEditingIndex(null)
    if (eqChanged) saveWithEquipment({ inventory: nextInv, equippedHeld: nextHeld, equippedWorn: nextWorn })
    else onSave({ inventory: nextInv })
  }

  /** 容器储物：将容器内物品取出，放回背包末尾 */
  const removeItemFromContainer = (containerId, nestedIndex) => {
    const containerIdx = inv.findIndex((e) => e.id === containerId)
    if (containerIdx < 0) return
    const container = inv[containerIdx]
    const nested = Array.isArray(container.nestedInventory) ? [...container.nestedInventory] : []
    const [item] = nested.splice(nestedIndex, 1)
    if (!item) return
    const nextInv = [...inv]
    nextInv[containerIdx] = { ...container, nestedInventory: nested }
    nextInv.push(item)
    onSave({ inventory: nextInv })
  }

  const moveNestedToBag = (containerInvIndex, nestedIndex, moduleId) => {
    const container = inv[containerInvIndex]
    if (!container) return
    const nested = Array.isArray(container.nestedInventory) ? [...container.nestedInventory] : []
    const item = nested[nestedIndex]
    if (!item) return
    if (item.itemId === 'bag_of_holding') {
      alert('次元袋里不能放入次元袋')
      return
    }
    if (!moduleId || !bagModules.some((m) => m.id === moduleId)) return
    nested.splice(nestedIndex, 1)
    const bagItem = { ...item, inBagOfHolding: true, bagModuleId: moduleId, bagSlotId: undefined }
    delete bagItem.id
    bagItem.id = crypto.randomUUID ? crypto.randomUUID() : `nested-bag-${Date.now()}`
    const nextInv = [...inv]
    nextInv[containerInvIndex] = { ...container, nestedInventory: nested }
    nextInv.push(bagItem)
    onSave({ inventory: nextInv })
  }

  /** 容器储物：修改容器内物品数量 */
  const setNestedQty = (containerId, nestedIndex, value) => {
    const containerIdx = inv.findIndex((e) => e.id === containerId)
    if (containerIdx < 0) return
    const container = inv[containerIdx]
    const nested = Array.isArray(container.nestedInventory) ? [...container.nestedInventory] : []
    const item = nested[nestedIndex]
    if (!item) return
    const n = Math.max(1, parseInt(value, 10) || 1)
    nested[nestedIndex] = { ...item, qty: n }
    onSave({ inventory: inv.map((e, i) => (i === containerIdx ? { ...e, nestedInventory: nested } : e)) })
  }

  /** 容器内物品存到团队仓库 */
  const openStoreToVaultForNested = (containerInvIndex, nestedIndex) => {
    const container = inv[containerInvIndex]
    if (!container) return
    const nested = Array.isArray(container.nestedInventory) ? container.nestedInventory : []
    const item = nested[nestedIndex]
    if (!item) return
    const q = Math.max(1, Number(item.qty) || 1)
    const moduleId = character?.moduleId ?? 'default'
    const addPromise = item.itemId
      ? Promise.resolve(addToWarehouse(moduleId, { ...item, qty: q }))
      : Promise.resolve(addToWarehouse(moduleId, { name: item.name || '—', qty: q }))
    setIsStoreToVaulting(true)
    setTransferHint('物品存入中，请耐心等待；若长时间未完成请尝试刷新页面。')
    const nextNested = nested.filter((_, idx) => idx !== nestedIndex)
    onSave({ inventory: inv.map((e, i) => (i === containerInvIndex ? { ...e, nestedInventory: nextNested } : e)) })
    addPromise
      .catch((err) => {
        console.error('[EquipmentAndInventory] 容器内物品存到团队仓库失败', err)
        alert('存入失败，请重试或刷新页面')
      })
      .finally(() => {
        setIsStoreToVaulting(false)
        setTransferHint('')
      })
  }

  /** 容器储物：拖放背包物品到展开区域入袋 */
  const handleDropIntoContainer = (e, containerInvIndex, containerId) => {
    e.preventDefault()
    e.stopPropagation()
    const fromBag = e.dataTransfer.getData('text/dnd-from-bag') === '1'
    if (fromBag) return
    const sourceIndex = parseDragInventoryIndex(e.dataTransfer)
    if (Number.isNaN(sourceIndex) || sourceIndex === containerInvIndex) return
    const src = inv[sourceIndex]
    if (!src || src.inBagOfHolding || src.bagModuleAnchorId) return
    moveItemIntoContainer(sourceIndex, containerId)
  }

  /** 同名物品（显示名称一致）可合并数量；invDisplayName 在下方定义，此处用内联比较 */
  const getInvMergeKey = (entry) => {
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }
  const isSameItemForMerge = (a, b) => {
    if (!a || !b) return false
    if (a.walletCurrencyId || b.walletCurrencyId) return false
    if (a.inBagOfHolding || b.inBagOfHolding) return false
    if (a.bagModuleAnchorId || b.bagModuleAnchorId) return false
    return getInvMergeKey(a) === getInvMergeKey(b)
  }

  const moveEntryToBag = (fromIndex, moduleId) => {
    const entry = inv[fromIndex]
    if (!entry) return
    if (entry.itemId === 'bag_of_holding' || entry.bagModuleAnchorId) {
      alert('次元袋里不能放入次元袋')
      return
    }
    if (!moduleId || !bagModules.some((m) => m.id === moduleId)) return

    const targetMatchesModule = (e) => e?.bagModuleId === moduleId || e?.bagSlotId === moduleId
    /** 已在某模块袋内：拖到另一模块只改 bagModuleId（或袋内钱币与目标模块同堆合并） */
    if (entry.inBagOfHolding) {
      if (targetMatchesModule(entry)) return
      if (entry.walletCurrencyId) {
        const cid = entry.walletCurrencyId
        const isGem = cid === 'gem_lb'
        const add = isGem ? Math.max(0, Number(entry.qty) || 0) : Math.max(0, Math.floor(Number(entry.qty) || 0))
        if (add <= 0) return
        const mergeIdx = inv.findIndex(
          (e, idx) =>
            idx !== fromIndex && e?.inBagOfHolding && e?.walletCurrencyId === cid && targetMatchesModule(e),
        )
        if (mergeIdx >= 0) {
          const row = inv[mergeIdx]
          const prev = isGem ? Math.max(0, Number(row.qty) || 0) : Math.max(0, Math.floor(Number(row.qty) || 0))
          const nextQty = isGem ? Math.round((prev + add) * 10) / 10 : prev + add
          const cfg = getCurrencyById(cid)
          const label = cfg ? getCurrencyDisplayName(cfg) : entry.name || row.name
          const nextInv = []
          for (let idx = 0; idx < inv.length; idx++) {
            if (idx === fromIndex) continue
            if (idx === mergeIdx) {
              nextInv.push({ ...row, qty: nextQty, name: label || row.name })
            } else {
              nextInv.push(inv[idx])
            }
          }
          setEditingIndex(null)
          onSave({ inventory: nextInv })
          return
        }
      }
      setEditingIndex(null)
      onSave({
        inventory: inv.map((e, idx) =>
          idx === fromIndex ? { ...e, bagModuleId: moduleId, bagSlotId: undefined } : e,
        ),
      })
      return
    }

    if (entry.walletCurrencyId) {
      moveWalletCurrencyToBag(entry.walletCurrencyId, moduleId)
      return
    }
    const entryId = entry.id
    let nextHeld = heldSlots
    let nextWorn = wornSlots
    let eqChanged = false
    if (entryId) {
      if (nextHeld.some((s) => s.inventoryId === entryId)) {
        nextHeld = nextHeld.map((s) => (s.inventoryId === entryId ? { ...s, inventoryId: null } : s))
        eqChanged = true
      }
      if (nextWorn.some((s) => s.inventoryId === entryId)) {
        nextWorn = nextWorn.map((s) => (s.inventoryId === entryId ? { ...s, inventoryId: null } : s))
        eqChanged = true
      }
    }
    const nextInv = inv.map((e, idx) =>
      idx === fromIndex ? { ...e, inBagOfHolding: true, bagModuleId: moduleId, bagSlotId: undefined } : e,
    )
    setEditingIndex(null)
    if (eqChanged) saveWithEquipment({ inventory: nextInv, equippedHeld: nextHeld, equippedWorn: nextWorn })
    else onSave({ inventory: nextInv })
  }

  const handleAddBagModule = () => {
    if (bagModules.length >= MAX_BAG_OF_HOLDING_MODULES) return
    const m = createInitialBagModule()
    const modules = [...bagModules, m]
    saveWithEquipment({ bagOfHoldingModules: modules, bagOfHoldingCount: modulesBagCountTotal(modules) })
  }

  const handleRemoveBagModule = (moduleIndex = 0) => {
    const { modules, inventory: nextInv, walletDelta } = removeBagModuleAt(bagModules, moduleIndex, inv)
    saveWithEquipment({
      bagOfHoldingModules: modules,
      bagOfHoldingCount: modulesBagCountTotal(modules),
      inventory: nextInv,
      wallet: mergeWalletDelta(wallet, walletDelta),
      ...(modules.length === 0 ? { bagOfHoldingSlots: [] } : {}),
    })
  }

  const handleSetModuleBagCount = (moduleId, n) => {
    const idx = bagModules.findIndex((m) => m.id === moduleId)
    if (idx < 0) return
    const { modules, inventory: nextInv, walletDelta } = updateModuleBagCount(bagModules, idx, n, inv)
    saveWithEquipment({
      bagOfHoldingModules: modules,
      bagOfHoldingCount: modulesBagCountTotal(modules),
      inventory: nextInv,
      wallet: mergeWalletDelta(wallet, walletDelta),
    })
  }

  const moveWalletCurrencyToBag = (currencyId, moduleId) => {
    if (!currencyId || !moduleId || !bagModules.some((m) => m.id === moduleId)) return
    const amt = Number(wallet[currencyId]) || 0
    if (amt <= 0) return
    const isGem = currencyId === 'gem_lb'
    const take = isGem ? amt : Math.floor(amt)
    if (take <= 0) return
    setEditingIndex(null)
    const mergeIdx = inv.findIndex(
      (e) =>
        e?.inBagOfHolding &&
        e?.walletCurrencyId === currencyId &&
        (e.bagModuleId === moduleId || e.bagSlotId === moduleId),
    )
    const nextWallet = { ...wallet }
    nextWallet[currencyId] = isGem ? Math.max(0, amt - take) : Math.max(0, Math.floor(amt) - take)
    let nextInv
    if (mergeIdx >= 0) {
      const row = inv[mergeIdx]
      const q = Number(row.qty) || 0
      nextInv = inv.map((e, idx) => (idx === mergeIdx ? { ...row, qty: q + take } : e))
    } else {
      const cfg = getCurrencyById(currencyId)
      const name = getCurrencyDisplayName(cfg) || currencyId
      nextInv = [
        ...inv,
        {
          id: `inv_${crypto.randomUUID()}`,
          name,
          walletCurrencyId: currencyId,
          qty: take,
          inBagOfHolding: true,
          bagModuleId: moduleId,
          bagSlotId: undefined,
        },
      ]
    }
    saveWithEquipment({ inventory: nextInv, wallet: nextWallet })
  }

  const handleSetModuleVisibility = (moduleId, visibility) => {
    onSave({
      bagOfHoldingModules: bagModules.map((m) => (m.id === moduleId ? { ...m, visibility } : m)),
    })
  }

  const patchWalletCurrency = (currencyId, qty) => {
    const n =
      currencyId === 'gem_lb'
        ? Math.max(0, Number(qty) || 0)
        : Math.max(0, Math.floor(Number(qty) || 0))
    const stored = walletPartForCommittedTotal(currencyId, n, wallet, inv)
    onSave({ wallet: { ...wallet, [currencyId]: stored } })
  }

  const handleEquipmentDragStart = (e, invIndex) => {
    const t = e.target
    if (t && typeof t.closest === 'function' && t.closest('button, input, select, textarea, a, option, label')) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', `inv:${invIndex};src:equipment`)
    e.dataTransfer.setData('text/dnd-character-inv', String(invIndex))
    e.dataTransfer.effectAllowed = 'copyMove'
    const card = e.currentTarget.closest('[data-equipment-card]')
    if (card) card.classList.add('opacity-50')
  }

  const handleEquipmentDragEnd = (e) => {
    const card = e.currentTarget.closest('[data-equipment-card]')
    if (card) card.classList.remove('opacity-50')
  }

  const handleNestedDragStart = (e, containerInvIndex, nestedIndex) => {
    const t = e.target
    if (t && typeof t.closest === 'function' && t.closest('button, input, select, textarea')) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', `nested:${containerInvIndex}:${nestedIndex}`)
    e.dataTransfer.setData('text/dnd-nested-source', `${containerInvIndex}:${nestedIndex}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    const card = e.currentTarget.closest('[data-equipment-card]')
    if (card) card.classList.add('opacity-50')
  }

  const handleNestedDragEnd = (e) => {
    const card = e.currentTarget.closest('[data-equipment-card]')
    if (card) card.classList.remove('opacity-50')
  }

  const handleBackpackRowDragStart = (e, layoutIdx) => {
    const t = e.target
    if (t && typeof t.closest === 'function' && t.closest('button, input, select, textarea, a, option, label')) {
      e.preventDefault()
      return
    }
    const tok = layoutOrder[layoutIdx]
    let invIdx = -1
    if (tok?.startsWith('i:')) {
      invIdx = resolveInvIndexFromItemToken(tok, inv)
      if (invIdx < 0) {
        for (let idx = 0; idx < inv.length; idx++) {
          const row = inv[idx]
          if (row?.inBagOfHolding) continue
          if (itemTokenForEntry(row, idx) === tok) {
            invIdx = idx
            break
          }
        }
      }
    }
    /** text/plain 须先设且含 inv:，否则部分浏览器/内核在 drop 时读不到自定义 MIME */
    if (invIdx >= 0) {
      e.dataTransfer.setData('text/plain', `inv:${invIdx};bl:${layoutIdx}`)
      e.dataTransfer.setData('text/dnd-character-inv', String(invIdx))
    } else {
      e.dataTransfer.setData('text/plain', `bl:${layoutIdx}`)
    }
    e.dataTransfer.setData('text/dnd-backpack-layout', String(layoutIdx))
    e.dataTransfer.effectAllowed = 'copyMove'
    ;(e.currentTarget.closest('[data-backpack-card]') ?? e.currentTarget).classList.add('opacity-50')
  }
  const handleBackpackRowDragEnd = (e) => {
    ;(e.currentTarget.closest('[data-backpack-card]') ?? e.currentTarget).classList.remove('opacity-50')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-50')
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copyMove' }
  const handleBackpackRowDrop = (e, toLayoutIdx) => {
    e.preventDefault()

    const nestedSource = e.dataTransfer.getData('text/dnd-nested-source')
    if (nestedSource) {
      const parts = nestedSource.split(':').map(Number)
      const [containerIdx, nestedIdx] = parts
      if (!Number.isNaN(containerIdx) && !Number.isNaN(nestedIdx)) {
        const container = inv[containerIdx]
        if (container?.id) {
          removeItemFromContainer(container.id, nestedIdx)
        }
      }
      return
    }

    const fromBag = e.dataTransfer.getData('text/dnd-from-bag') === '1'
    const invFromBag = parseInt(e.dataTransfer.getData('text/dnd-character-inv'), 10)
    if (fromBag && !Number.isNaN(invFromBag)) {
      const entry = inv[invFromBag]
      if (!entry || !entry.inBagOfHolding) return
      setEditingIndex(null)
      if (entry.walletCurrencyId) {
        const cid = entry.walletCurrencyId
        const add = Number(entry.qty) || 0
        const nextWallet = mergeWalletDelta(wallet, { [cid]: add })
        const nextInv = inv.filter((_, i) => i !== invFromBag)
        saveWithEquipment({ inventory: nextInv, wallet: nextWallet })
        return
      }
      saveWithEquipment({
        inventory: inv.map((row, idx) =>
          idx === invFromBag ? { ...row, inBagOfHolding: false, bagModuleId: undefined, bagSlotId: undefined } : row,
        ),
        backpackLayoutOrder: (() => {
          const tok = itemTokenForEntry(entry, invFromBag)
          const next = [...layoutOrder]
          const insertAt = Math.min(toLayoutIdx, next.length)
          next.splice(insertAt, 0, tok)
          return next
        })(),
      })
      return
    }

    /** 折叠的次元袋锚点行：松手即入该模块，无需先展开袋内表 */
    const orderEarly = layoutOrder
    if (toLayoutIdx >= 0 && toLayoutIdx < orderEarly.length) {
      const toTokEarly = orderEarly[toLayoutIdx]
      if (toTokEarly?.startsWith('i:')) {
        const toInvEarly = resolveInvIndexFromItemToken(toTokEarly, inv)
        const targetEarly = inv[toInvEarly]
        if (isBagModuleAnchorEntry(targetEarly) && targetEarly.bagModuleAnchorId) {
          const modIdEarly = targetEarly.bagModuleAnchorId
          const anchorExpanded = bagModuleExpanded[modIdEarly] !== false
          if (!anchorExpanded) {
            const fromInvEarly = parseDragInventoryIndex(e.dataTransfer)
            if (!Number.isNaN(fromInvEarly) && fromInvEarly !== toInvEarly) {
              const srcEarly = inv[fromInvEarly]
              if (
                srcEarly &&
                !srcEarly.inBagOfHolding &&
                !srcEarly.bagModuleAnchorId &&
                srcEarly.itemId !== 'bag_of_holding'
              ) {
                moveEntryToBag(fromInvEarly, modIdEarly)
                return
              }
            }
          }
        }
      }
    }

    let fromL = parseInt(e.dataTransfer.getData('text/dnd-backpack-layout'), 10)
    if (Number.isNaN(fromL)) {
      const plain = e.dataTransfer.getData('text/plain')
      const m = /^bl:(\d+)$/.exec(plain)
      if (m) fromL = parseInt(m[1], 10)
    }
    if (Number.isNaN(fromL) || fromL === toLayoutIdx) return
    const order = [...layoutOrder]
    if (fromL < 0 || fromL >= order.length || toLayoutIdx < 0 || toLayoutIdx >= order.length) return
    const fromTok = order[fromL]
    const toTok = order[toLayoutIdx]

    if (fromTok.startsWith('i:') && toTok.startsWith('i:')) {
      const fromInv = resolveInvIndexFromItemToken(fromTok, inv)
      const toInv = resolveInvIndexFromItemToken(toTok, inv)
      if (fromInv < 0 || toInv < 0) return
      const source = inv[fromInv]
      const target = inv[toInv]
      if (!source || !target) return
      if (source.inBagOfHolding && !target.inBagOfHolding) {
        setEditingIndex(null)
        if (source.walletCurrencyId) {
          const cid = source.walletCurrencyId
          const add = Number(source.qty) || 0
          const nextWallet = mergeWalletDelta(wallet, { [cid]: add })
          const nextInv = inv.filter((_, i) => i !== fromInv)
          saveWithEquipment({ inventory: nextInv, wallet: nextWallet })
          return
        }
        saveWithEquipment({
          inventory: inv.map((e, idx) =>
            idx === fromInv ? { ...e, inBagOfHolding: false, bagModuleId: undefined, bagSlotId: undefined } : e,
          ),
          backpackLayoutOrder: (() => {
            const tok = itemTokenForEntry(source, fromInv)
            if (order.includes(tok)) return order
            const next = [...order]
            const insertAt = Math.min(toLayoutIdx, next.length)
            next.splice(insertAt, 0, tok)
            return next
          })(),
        })
        return
      }
      if (source.inBagOfHolding || target.inBagOfHolding) return
      if (isSameItemForMerge(source, target)) {
        if (!source.id || !target.id) return
        setEditingIndex(null)
        const qtyT = Math.max(1, Number(target?.qty) || 1)
        const qtyS = Math.max(1, Number(source?.qty) || 1)
        const chargeT = Number(target?.charge) || 0
        const chargeS = Number(source?.charge) || 0
        const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
        const targetId = target.id
        const sourceId = source.id
        const nextInv = inv
          .filter((e) => e.id !== sourceId)
          .map((e) => (e.id === targetId ? merged : e))
        const nextLayout = order.filter((tok) => tok !== `i:${sourceId}`)
        saveWithEquipment({ inventory: nextInv, backpackLayoutOrder: nextLayout })
        return
      }
      setEditingIndex(null)
      const nextInv = [...inv]
      const [item] = nextInv.splice(fromInv, 1)
      nextInv.splice(toInv, 0, item)
      const nextLayout = reorderLayoutTokens(order, fromL, toLayoutIdx)
      saveWithEquipment({ inventory: nextInv, backpackLayoutOrder: nextLayout })
      return
    }

    const nextLayout = reorderLayoutTokens(order, fromL, toLayoutIdx)
    onSave({ backpackLayoutOrder: nextLayout })
  }
  const setQty = (index, value) => {
    const entry = inv[index]
    if (entry?.bagModuleAnchorId) {
      const v = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(value) || 0)))
      handleSetModuleBagCount(entry.bagModuleAnchorId, v)
      return
    }
    if (entry?.walletCurrencyId) {
      const n =
        entry.walletCurrencyId === 'gem_lb'
          ? Math.max(0, Number(value) || 0)
          : Math.max(0, Math.floor(Number(value) || 0))
      patchWalletCurrency(entry.walletCurrencyId, n)
      return
    }
    const n = Math.max(1, parseInt(value, 10) || 1)
    const next = inv.map((e, i) => (i === index ? { ...e, qty: n } : e))
    onSave({ inventory: next })
  }
  const setMagicBonus = (index, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    const next = inv.map((e, i) => (i === index ? { ...e, magicBonus: n } : e))
    onSave({ inventory: next })
  }
  const setCharge = (index, value) => {
    if (inv[index]?.bagModuleAnchorId) return
    const n = Math.max(0, parseInt(value, 10) || 0)
    const chargeMax = getEntryChargeMax(inv[index], character)
    const clamped = chargeMax != null ? Math.min(n, chargeMax) : n
    const next = inv.map((e, i) => (i === index ? { ...e, charge: clamped } : e))
    onSave({ inventory: next })
  }

  const handleAbsorbEnergy = (index) => {
    const entry = inv[index]
    if (!entry) return
    const name = entry.name || getItemDisplayName(getItemById(entry.itemId)) || '未命名物品'
    if (!window.confirm(`是否吸收能量恢复「${name}」的充能？`)) return

    const effects = Array.isArray(entry.effects) ? entry.effects : []
    const chargeItemEffect = effects.find(e => e?.effectType === 'charge_item' && e.value && typeof e.value === 'object')
    const rec = chargeItemEffect?.value?.recovery
    const current = Number(entry.charge) || 0
    const chargeMax = getEntryChargeMax(entry, character)

    const methods = Array.isArray(rec?.method) ? rec.method : (rec?.method ? [rec.method] : [])
    const absorbMethod = methods.includes('absorb_energy') ? 'absorb_energy' : (methods.includes('reaction_absorb') ? 'reaction_absorb' : 'absorb_energy')
    const { amount: recovered, expression: expr } = computeRecoveryForMethod(rec, absorbMethod, chargeMax, current)
    const expression = expr === '回满' ? '回满' : `${expr}=${recovered}`

    const nextCharge = chargeMax != null ? Math.min(current + recovered, chargeMax) : current + recovered
    const next = inv.map((e, i) => (i === index ? { ...e, charge: nextCharge } : e))
    onSave({ inventory: next })

    setAbsorbResult({ name, expression, from: current, to: nextCharge })
  }

  /** 次元袋面板行内编辑（下标为背包 inventory 全局下标）；钱币堆数量不在此修改 */
  const patchBagItem = (globalIndex, patch) => {
    const prev = inv[globalIndex]
    onSave({ inventory: inventoryWithBagPatch(inv, globalIndex, patch) })
    if (prev?.walletCurrencyId && 'qty' in patch) {
      window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
    }
  }

  const startEdit = (index) => {
    if (inv[index]?.bagModuleAnchorId) {
      alert('次元袋：可见性、袋个数与本行操作列；袋内物品请点名称旁箭头展开后管理。')
      return
    }
    if (inv[index]) setEditingIndex(index)
  }

  const applyEmbeddedModuleVisibility = (modId, visibility) => {
    const pub = normalizeBagOfHoldingVisibility(visibility) === 'public'
    setBagModuleExpanded((prev) => ({ ...prev, [modId]: !pub }))
    onSave({
      bagOfHoldingModules: bagModules.map((m) => (m.id === modId ? { ...m, visibility } : m)),
    })
  }

  const handleEmbeddedBagRowDragStart = (e, globalIndex) => {
    e.dataTransfer.setData('text/dnd-character-inv', String(globalIndex))
    e.dataTransfer.setData('text/dnd-from-bag', '1')
    e.dataTransfer.setData('text/plain', `bag-inv:${globalIndex}`)
    if (character?.id) {
      e.dataTransfer.setData('text/dnd-bag-source-char-id', character.id)
    }
    e.dataTransfer.effectAllowed = 'copyMove'
    ;(e.currentTarget.closest('[data-bag-item-card]') ?? e.currentTarget.closest('[data-equipment-card]') ?? e.currentTarget).classList.add('opacity-60')
  }
  const handleEmbeddedBagRowDragEnd = (e) =>
    (e.currentTarget.closest('[data-bag-item-card]') ?? e.currentTarget.closest('[data-equipment-card]') ?? e.currentTarget).classList.remove('opacity-60')

  const renderEmbeddedBagNameExtras = (entry) => {
    if ((Number(entry.magicBonus) || 0) > 0) {
      return <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
    }
    return null
  }

  const renderEmbeddedBagActionCell = (entry, globalIndex) => {
    if (!canEdit) return null
    const isWallet = !!entry?.walletCurrencyId
    return (
      <div
        className="flex flex-nowrap items-center justify-center gap-0.5 min-w-0 max-w-full shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <button
          type="button"
          onClick={() => openStoreToVault(globalIndex)}
          title="存到团队仓库"
          className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0 disabled:opacity-35 disabled:pointer-events-none"
        >
          <Package size={14} />
        </button>
        <button
          type="button"
          onClick={() => startEdit(globalIndex)}
          disabled={isWallet}
          title={isWallet ? '钱币请在个人持有中调整' : '编辑'}
          className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0 disabled:opacity-35 disabled:pointer-events-none"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => removeBagItemByGlobalIndex(globalIndex)}
          title={isWallet ? '删除并将钱币退回个人持有' : '移除'}
          className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
    )
  }
  const applyEditSave = (entry) => {
    if (editingIndex == null) return
    const next = [...inv]
    next[editingIndex] = entry
    onSave({ inventory: next })
    setEditingIndex(null)
  }
  const setAttuned = (index, value) => {
    if (value && attunedCount >= maxAttunementSlots) return
    const next = inv.map((e, i) => (i === index ? { ...e, isAttuned: !!value } : e))
    onSave({ inventory: next })
  }
  const toggleAttunedForEntry = (inventoryId, checked) => {
    const idx = inv.findIndex((e) => e.id === inventoryId)
    if (idx < 0) return
    setAttuned(idx, checked)
  }
  const applyNestedEditSave = (entry) => {
    if (!editingNested) return
    const { containerId, nestedIndex } = editingNested
    const containerIdx = inv.findIndex((e) => e.id === containerId)
    if (containerIdx < 0) return
    const container = inv[containerIdx]
    const nested = Array.isArray(container.nestedInventory) ? [...container.nestedInventory] : []
    nested[nestedIndex] = entry
    onSave({
      inventory: inv.map((e, i) => (i === containerIdx ? { ...e, nestedInventory: nested } : e)),
    })
    setEditingNested(null)
  }

  const openStoreToVault = (index) => {
    setStoreToVaultIndex(index)
    setStoreToVaultQty(1)
  }
  const confirmStoreToVault = () => {
    if (storeToVaultIndex == null || isStoreToVaulting) return
    const e = inv[storeToVaultIndex]
    if (!e) { setStoreToVaultIndex(null); return }
    const qWallet =
      e.walletCurrencyId === 'gem_lb'
        ? Math.max(0, Number(e.qty) || 0)
        : e.walletCurrencyId
          ? Math.max(0, Math.floor(Number(e.qty) || 0))
          : null
    const q = qWallet != null ? qWallet : Math.max(1, Number(e.qty) || 1)
    const toStore = qWallet != null ? qWallet : Math.min(Math.max(1, storeToVaultQty), q)
    const moduleId = character?.moduleId ?? 'default'

    if (e.walletCurrencyId && character?.id) {
      setIsStoreToVaulting(true)
      setTransferHint('物品存入中，请耐心等待；若长时间未完成请尝试刷新页面。')
      if (toStore <= 0) {
        setStoreToVaultIndex(null)
        setStoreToVaultQty(1)
        return
      }
      Promise.resolve(transferCurrency(moduleId, 'toVault', character.id, e.walletCurrencyId, toStore))
        .then((res) => {
          if (!res?.success) {
            alert(res?.error || '存入团队货币失败')
            return
          }
          const latest = getCharacter(character.id)
          if (latest) {
            saveWithEquipment({
              wallet: latest.wallet ?? {},
            })
          } else {
            setWallet(getCharacterWallet(character.id))
          }
          onWalletSuccess?.()
        })
        .catch((err) => {
          console.error('[EquipmentAndInventory] 存入团队货币失败', err)
          alert('存入失败，请重试')
        })
        .finally(() => {
          setIsStoreToVaulting(false)
          setTransferHint('')
          setStoreToVaultIndex(null)
          setStoreToVaultQty(1)
        })
      return
    }

    const addPromise = e.itemId
      ? Promise.resolve(addToWarehouse(moduleId, {
        ...e,
        qty: toStore,
      }))
      : Promise.resolve(addToWarehouse(moduleId, { name: e.name || '—', qty: toStore }))
    setIsStoreToVaulting(true)
    setTransferHint('物品存入中，请耐心等待；若长时间未完成请尝试刷新页面。')
    if (toStore >= q) {
      onSave({ inventory: inv.filter((_, i) => i !== storeToVaultIndex) })
    } else {
      const next = inv.map((entry, i) => (i === storeToVaultIndex ? { ...entry, qty: q - toStore } : entry))
      onSave({ inventory: next })
    }
    addPromise
      .catch((err) => {
        console.error('[EquipmentAndInventory] 存到团队仓库失败', err)
        alert('存入失败，请重试或刷新页面')
      })
      .finally(() => {
        setIsStoreToVaulting(false)
        setTransferHint('')
      })
    setStoreToVaultIndex(null)
    setStoreToVaultQty(1)
  }

  const handleTransferSuccess = () => {
    setWallet(getCharacterWallet(character.id))
    onWalletSuccess?.()
  }

  const invDisplayName = (entry) => {
    if (entry?.walletCurrencyId) {
      const cfg = getCurrencyById(entry.walletCurrencyId)
      return getCurrencyDisplayName(cfg) || entry?.name || '—'
    }
    if (entry?.itemId) {
      const item = getItemById(entry.itemId)
      const customName = entry.name && entry.name.trim()
      if (customName) return customName
      return getItemDisplayName(item) || '—'
    }
    return entry?.name ?? '—'
  }
  const getEntryBriefFull = (entry) => {
    const brief = entry?.详细介绍?.trim()
    const range = entry?.攻击距离?.trim()
    const parts = []
    if (brief) parts.push(brief)
    if (range) parts.push(`攻击距离 ${range}`)
    let out = ''
    if (parts.length) out = parts.join('；')
    else if (entry?.附注?.trim()) out = entry.附注.trim()
    else out = getItemById(entry?.itemId)?.详细介绍 ?? ''
    return appendContainedSpellsBrief(entry?.effects, out)
  }

  const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5'
  /**
   * 装备与背包整体最外框：与法术卡同系渐变与边框；阴影用黑系外投影（无 shadow-dnd-card 顶白 inset，圆角处不易像外发光）
   * 与 BuffManager BUFF_PANEL_OUTER_SHADOW / CombatStatus COMBAT_ROOT_OUTER_SHADOW 同逻辑
   */
  const equipInvOuterShellClass =
    'rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)]'
  /** 装备 / 背包分区外壳：外层已统一处理边框和背景，内层只保留基本布局 */
  const sectionCardShellClass =
    'overflow-hidden'
  /** 与分区壳 #141c28 同色相，避免灰条 / #1a2430 与壳体发绿不一致 */
  const cardHeadClass = 'px-2.5 py-1.5 border-b border-gray-600/70 bg-[#161e2b]'
  /** 背包列表物品卡：与团队仓库 / 次元袋共用 inventoryItemCardStyles */
  const backpackItemCardClass = inventoryItemCardShellClass

  return (
    <div className={equipInvOuterShellClass}>
      <div className="p-2 md:p-2.5 space-y-3">
        {/* —— 统一装备与背包列表 —— */}
        <div className={sectionCardShellClass}>
          <div className={`${cardHeadClass} flex flex-wrap items-center justify-end gap-2`}>
            <div className="flex items-center gap-3">
              <p className="text-dnd-text-muted text-xs mb-0 tabular-nums">
                同调位：<span className="text-white font-medium">{attunedCount}/{maxAttunementSlots}</span>
              </p>
              {canEdit && (
                  <button type="button" onClick={() => setAddFormOpen(true)} className="h-7 px-2 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors shrink-0">
                    添加物品
                  </button>
              )}
            </div>
          </div>
          <div className="p-2 space-y-2">
            <p className="text-[10px] text-dnd-text-muted leading-snug">
              拖 <span className="text-dnd-text-body">⋮</span> 或名称区排序；可拖入「次元袋」物品卡。
            </p>
            <div className="flex flex-col min-w-0">
              {/* 已装备物品 */}
              {equippedItems.map((item) => {
                const entry = item.entry
                const idx = item.invIndex
                const spEffect = Array.isArray(entry?.effects)
                  ? entry.effects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
                  : null
                const chargeEffect = Array.isArray(entry?.effects)
                  ? entry.effects.find(e => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')
                  : null
                const maxChargeFromEffect = chargeEffect ? resolveChargeItemCharges(chargeEffect.value, character) : 0
                const hasSpell = hasContainedSpellEffect(entry)
                const containedSpellValue = !chargeEffect && hasSpell ? extractContainedSpellValueFromEntry(entry) : null
                const maxChargeFromContainedSpell = containedSpellValue ? (Number(containedSpellValue.totalCharges) || 0) : 0
                const spMax = spEffect ? (Number(spEffect.value.max) || 10) : null
                const spThreshold = spEffect ? (Number(spEffect.value.threshold) || 0) : null
                const spCurrent = spEffect ? getShieldPoolCurrent(character, 'equipment', entry.id, spMax) : null
                const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                const localAbility = !activeEntry ? buildActiveAbilityFromEntry(entry) : null
                const finalAbility = activeEntry?.ability || localAbility
                const totalLb = getInventoryEntryStackWeightLb(entry)
                const qty = Math.max(1, Math.floor(Number(entry?.qty) || 1))
                const bbKey = entry?.id ?? `eq-${idx}`
                const isContainer = hasItemStorageEffect(entry)
                const eqContainerExpanded = !!backpackItemBriefOpen[bbKey]
                return (
                  <Fragment key={entry.id}>
                  {isContainer ? (
                    <div className="flex flex-col min-w-0 rounded-md border border-dnd-gold/35 bg-[#141c28] overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.085),inset_0_-1px_0_rgba(0,0,0,0.22)]" style={{ marginBottom: '8px' }}>
                      <EquipmentItemCard
                        entry={entry}
                        invIndex={idx}
                        slotValue={item.slotValue}
                        canEdit={canEdit}
                        isAttuned={!!entry.isAttuned}
                        attunedCount={attunedCount}
                        maxAttunementSlots={maxAttunementSlots}
                        onAttuneToggle={toggleAttunedForEntry}
                        noShadow
                        availableSlotGroups={getAvailableSlotsForItem(entry, inv, item.slotValue)}
                        onSlotChange={handleSlotChange}
                        displayName={invDisplayName(entry)}
                        magicBonus={Number(entry.magicBonus) || 0}
                        brief={getEntryBriefFull(entry)}
                        briefExpanded={eqContainerExpanded}
                        onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [bbKey]: !prev[bbKey] }))}
                        charge={Number(entry.charge) || 0}
                        maxCharge={maxChargeFromEffect || maxChargeFromContainedSpell || Number(entry.maxCharge) || 0}
                        onChargeChange={(v) => setCharge(idx, v)}
                        onAbsorbEnergy={() => handleAbsorbEnergy(idx)}
                        shieldPoolCurrent={spCurrent}
                        shieldPoolMax={spMax}
                        shieldPoolThreshold={spThreshold}
                        onShieldPoolChange={spEffect ? (v) => {
                          const newState = setShieldPoolCurrent(character, 'equipment', entry.id, v)
                          onSave({ shieldPoolStates: newState })
                        } : undefined}
                        activeAbility={finalAbility}
                        onUseAbility={finalAbility ? () => setEquipmentUseModal(activeEntry || { inventoryId: entry.id, ability: finalAbility, chargeValue: null }) : undefined}
                        hasContainedSpell={hasSpell}
                        onContainedSpellCharge={hasSpell ? (v) => setCharge(idx, v) : undefined}
                        containedSpellEntry={hasSpell ? entry : null}
                        qty={qty}
                        onQtyChange={(v) => setQty(idx, v)}
                        weightLb={totalLb}
                        showQty={!entry?.walletCurrencyId}
                        buffTags={getBuffTagsFromEffects(entry?.effects || [])}
                        onEdit={() => startEdit(idx)}
                        onStoreToVault={() => openStoreToVault(idx)}
                        onDelete={() => removeItem(idx)}
                        tooltipContent={entry?.itemId ? (
                          <ItemTooltipContent proto={getItemById(entry.itemId)} entry={entry} />
                        ) : null}
                        draggable={canEdit}
                        onDragStart={canEdit ? (e) => handleEquipmentDragStart(e, idx) : undefined}
                        onDragEnd={canEdit ? handleEquipmentDragEnd : undefined}
                        onDragOver={canEdit ? handleDragOver : undefined}
                      />
                      {eqContainerExpanded && (
                        <div
                          className="bg-transparent px-3.5 py-2"
                          onDragOver={canEdit ? handleDragOver : undefined}
                          onDrop={canEdit ? (e) => handleDropIntoContainer(e, idx, entry.id) : undefined}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-emerald-300/90 text-xs font-medium flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5" />
                              容器内物品
                            </span>
                            <span className="text-dnd-text-muted text-[10px]">
                              共 {(Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []).length} 件
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            {(Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []).map((nested, nestedIdx) => {
                              const nestedLb = getInventoryEntryStackWeightLb(nested)
                              const nestedQty = Math.max(1, Math.floor(Number(nested?.qty) || 1))
                              const nestedCharge = Number(nested?.charge) || 0
                              const nestedMagicBonus = Number(nested?.magicBonus) || 0
                              const nestedActiveEntry = activeAbilities.find(a => a.inventoryId === nested.id)
                              const nestedLocalAbility = !nestedActiveEntry ? buildActiveAbilityFromEntry(nested) : null
                              const nestedFinalAbility = nestedActiveEntry?.ability || nestedLocalAbility
                              const nestedChargeEffect = Array.isArray(nested?.effects)
                                ? nested.effects.find(ef => ef?.effectType === 'charge_item') : null
                              const nestedCsValue = !nestedChargeEffect && hasContainedSpellEffect(nested) ? extractContainedSpellValueFromEntry(nested) : null
                              const nestedMaxCharge = nestedChargeEffect
                                ? (Number(nestedChargeEffect.value?.charges) || 0)
                                : nestedCsValue
                                  ? (Number(nestedCsValue.totalCharges) || 0)
                                  : (Number(nested?.maxCharge) || 0)
                              const nestedHasContainedSpell = hasContainedSpellEffect(nested)
                              const nestedDisplayName = invDisplayName(nested)
                              const nestedBuffTags = getBuffTagsFromEffects(nested?.effects || [])
                              const nestedBrief = getEntryBriefFull(nested)
                              const nestedBriefKey = `nested-${entry.id}-${nested.id || nestedIdx}`
                              const nestedBriefExpanded = !!backpackItemBriefOpen[nestedBriefKey]
                              const nestedSpEffect = Array.isArray(nested?.effects)
                                ? nested.effects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
                                : null
                              const nestedSpMax = nestedSpEffect ? (Number(nestedSpEffect.value.max) || 10) : null
                              const nestedSpThreshold = nestedSpEffect ? (Number(nestedSpEffect.value.threshold) || 0) : null
                              const nestedSpCurrent = nestedSpEffect ? getShieldPoolCurrent(character, 'equipment', nested.id, nestedSpMax) : null

                              return (
                                <EquipmentItemCard
                                  key={nested.id ?? `nested-eq-${idx}-${nestedIdx}`}
                                  gridVariant="container"
                                  entry={nested}
                                  invIndex={nestedIdx}
                                  slotValue="backpack"
                                  canEdit={canEdit}
                                  noShadow
                                  displayName={nestedDisplayName}
                                  magicBonus={nestedMagicBonus}
                                  brief={nestedBrief}
                                  briefExpanded={nestedBriefExpanded}
                                  onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [nestedBriefKey]: !nestedBriefExpanded }))}
                                  charge={nestedCharge}
                                  maxCharge={nestedMaxCharge}
                                  onChargeChange={(v) => {
                                    const nextNested = entry.nestedInventory.map((n, idx2) =>
                                      idx2 === nestedIdx ? { ...n, charge: v } : n
                                    )
                                    onSave({ inventory: inv.map((e2, idx2) => idx2 === idx ? { ...e2, nestedInventory: nextNested } : e2) })
                                  }}
                                  shieldPoolCurrent={nestedSpCurrent}
                                  shieldPoolMax={nestedSpMax}
                                  shieldPoolThreshold={nestedSpThreshold}
                                  onShieldPoolChange={nestedSpEffect ? (v) => {
                                    const newState = setShieldPoolCurrent(character, 'equipment', nested.id, v)
                                    onSave({ shieldPoolStates: newState })
                                  } : undefined}
                                  activeAbility={nestedFinalAbility}
                                  onUseAbility={nestedFinalAbility ? () => setEquipmentUseModal(nestedActiveEntry || { inventoryId: nested.id, ability: nestedFinalAbility, chargeValue: null }) : undefined}
                                  hasContainedSpell={nestedHasContainedSpell}
                                  onContainedSpellCharge={nestedHasContainedSpell ? (v) => {
                                    const nextNested = entry.nestedInventory.map((n, idx2) =>
                                      idx2 === nestedIdx ? { ...n, charge: v } : n
                                    )
                                    onSave({ inventory: inv.map((e2, idx2) => idx2 === idx ? { ...e2, nestedInventory: nextNested } : e2) })
                                  } : undefined}
                                  containedSpellEntry={nestedHasContainedSpell ? nested : null}
                                  qty={nestedQty}
                                  onQtyChange={(v) => setNestedQty(entry.id, nestedIdx, v)}
                                  weightLb={nestedLb}
                                  showQty={!nested?.walletCurrencyId}
                                  buffTags={nestedBuffTags}
                                  onStoreToVault={() => openStoreToVaultForNested(idx, nestedIdx)}
                                  onEdit={() => setEditingNested({ containerId: entry.id, nestedIndex: nestedIdx })}
                                  onDelete={() => removeItemFromContainer(entry.id, nestedIdx)}
                                  tooltipContent={nested?.itemId ? (
                                    <ItemTooltipContent proto={getItemById(nested.itemId)} entry={nested} />
                                  ) : null}
                                  draggable={canEdit}
                                  onDragStart={canEdit ? (e) => handleNestedDragStart(e, idx, nestedIdx) : undefined}
                                  onDragEnd={canEdit ? handleNestedDragEnd : undefined}
                                />
                              )
                            })}
                          </div>
                          {canEdit && (
                            <div className="mt-2 rounded-md border border-dashed border-dnd-gold/25 bg-[#151c28]/40 px-2 py-2 text-center">
                              <p className="text-[10px] text-dnd-text-muted leading-snug">
                                拖背包物品到此处放入容器
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <EquipmentItemCard
                      entry={entry}
                      invIndex={idx}
                      slotValue={item.slotValue}
                      canEdit={canEdit}
                      isAttuned={!!entry.isAttuned}
                      attunedCount={attunedCount}
                      maxAttunementSlots={maxAttunementSlots}
                      onAttuneToggle={toggleAttunedForEntry}
                      availableSlotGroups={getAvailableSlotsForItem(entry, inv, item.slotValue)}
                      onSlotChange={handleSlotChange}
                      displayName={invDisplayName(entry)}
                      magicBonus={Number(entry.magicBonus) || 0}
                      brief={getEntryBriefFull(entry)}
                      briefExpanded={!!backpackItemBriefOpen[bbKey]}
                      onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [bbKey]: !prev[bbKey] }))}
                      charge={Number(entry.charge) || 0}
                      maxCharge={maxChargeFromEffect || maxChargeFromContainedSpell || Number(entry.maxCharge) || 0}
                      onChargeChange={(v) => setCharge(idx, v)}
                      onAbsorbEnergy={() => handleAbsorbEnergy(idx)}
                      shieldPoolCurrent={spCurrent}
                      shieldPoolMax={spMax}
                      shieldPoolThreshold={spThreshold}
                      onShieldPoolChange={spEffect ? (v) => {
                        const newState = setShieldPoolCurrent(character, 'equipment', entry.id, v)
                        onSave({ shieldPoolStates: newState })
                      } : undefined}
                      activeAbility={finalAbility}
                      onUseAbility={finalAbility ? () => setEquipmentUseModal(activeEntry || { inventoryId: entry.id, ability: finalAbility, chargeValue: null }) : undefined}
                      hasContainedSpell={hasSpell}
                      onContainedSpellCharge={hasSpell ? (v) => setCharge(idx, v) : undefined}
                      containedSpellEntry={hasSpell ? entry : null}
                      qty={qty}
                      onQtyChange={(v) => setQty(idx, v)}
                      weightLb={totalLb}
                      showQty={!entry?.walletCurrencyId}
                      buffTags={getBuffTagsFromEffects(entry?.effects || [])}
                      onEdit={() => startEdit(idx)}
                      onStoreToVault={() => openStoreToVault(idx)}
                      onDelete={() => removeItem(idx)}
                      tooltipContent={entry?.itemId ? (
                        <ItemTooltipContent proto={getItemById(entry.itemId)} entry={entry} />
                      ) : null}
                      draggable={canEdit}
                      onDragStart={canEdit ? (e) => handleEquipmentDragStart(e, idx) : undefined}
                      onDragEnd={canEdit ? handleEquipmentDragEnd : undefined}
                      onDragOver={canEdit ? handleDragOver : undefined}
                    />
                  )}
                  </Fragment>
                )
              })}

              {/* 背包物品 */}
              {layoutOrder.length === 0 && equippedItems.length === 0 ? (
                <div
                  data-backpack-card
                  className={`rounded-lg py-8 px-4 text-dnd-text-muted text-xs text-center ${canEdit ? 'border-2 border-dashed border-dnd-gold/25 bg-[#1a2430]/35' : 'border border-gray-700/60 bg-gray-900/20'}`}
                  style={{ minHeight: 120 }}
                  onDragOver={canEdit ? handleDragOver : undefined}
                  onDrop={canEdit ? (e) => handleBackpackRowDrop(e, 0) : undefined}
                >
                  {personRows.length === 0 && inv.length > 0 ? (
                    <span>背包区仅显示身上物品。当前全部在次元袋内，可将袋内物品拖放到此处。</span>
                  ) : canEdit ? (
                    <span>背包暂无物品卡。可从次元袋拖入此处，或使用「添加物品」。</span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              ) : (
                layoutOrder.map((token, layoutIdx) => {
                  const i = resolveInvIndexFromItemToken(token, inv)
                  if (i < 0) return null
                  const entry = inv[i]
                  if (entry?.inBagOfHolding) return null
                  // 跳过已装备物品（已在 equippedItems 区域渲染）
                  const isEquipped = heldSlots.some(s => s.inventoryId === entry.id) || wornSlots.some(s => s.inventoryId === entry.id)
                  if (isEquipped) return null
                  const chargeEffect = Array.isArray(entry?.effects)
                    ? entry.effects.find(e => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')
                    : null
                  const maxChargeFromEffect = chargeEffect ? resolveChargeItemCharges(chargeEffect.value, character) : 0
                  const _bpContainedSpellValue = !chargeEffect && hasContainedSpellEffect(entry) ? extractContainedSpellValueFromEntry(entry) : null
                  const maxChargeFromContainedSpell = _bpContainedSpellValue ? (Number(_bpContainedSpellValue.totalCharges) || 0) : 0
                  const spEffect = Array.isArray(entry?.effects)
                    ? entry.effects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
                    : null
                  const spMax = spEffect ? (Number(spEffect.value.max) || 10) : null
                  const spThreshold = spEffect ? (Number(spEffect.value.threshold) || 0) : null
                  const spCurrent = spEffect ? getShieldPoolCurrent(character, 'equipment', entry.id, spMax) : null
                  const isAnchor = isBagModuleAnchorEntry(entry)
                  const isContainer = !isAnchor && hasItemStorageEffect(entry)
                  const modForAnchor = isAnchor ? bagModules.find((m) => m.id === entry.bagModuleAnchorId) : null
                  const modIndexAnchor = isAnchor ? bagModules.findIndex((m) => m.id === entry.bagModuleAnchorId) : -1
                  const totalLb = isAnchor
                    ? getBagOfHoldingSelfWeightLb(Math.max(0, Math.floor(Number(entry.qty) || 0)))
                    : getInventoryEntryStackWeightLb(entry)
                  const qty = isAnchor
                    ? Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(entry?.qty) || 0)))
                    : entry?.walletCurrencyId
                      ? entry.walletCurrencyId === 'gem_lb'
                        ? Math.max(0, Number(entry.qty) || 0)
                        : Math.max(0, Math.floor(Number(entry.qty) || 0))
                      : Math.max(1, Math.floor(Number(entry?.qty) || 1))
                  const anchorBagExpanded = isAnchor && modForAnchor ? bagModuleExpanded[modForAnchor.id] !== false : false
                  const showChargeCol =
                    !isAnchor &&
                    !entry?.walletCurrencyId &&
                    ((Number(entry.charge) || 0) > 0 || hasContainedSpellEffect(entry))
                  const backpackRowGrid = inventoryItemRowGridUnified
                  const walletRowOnBodyNoFunds =
                    !!entry?.walletCurrencyId &&
                    !entry?.inBagOfHolding &&
                    (entry.walletCurrencyId === 'gem_lb'
                      ? (Number(qty) || 0) <= 0
                      : Math.floor(Number(qty) || 0) <= 0)
                  const packBrief = getEntryBriefFull(entry)
                  const bbKey = entry?.id ?? `l-${layoutIdx}`
                  return (
                    <>
                      {isAnchor ? (
                        <div
                          className="flex flex-col min-w-0"
                          draggable={canEdit}
                          onDragStart={canEdit ? (e) => handleBackpackRowDragStart(e, layoutIdx) : undefined}
                          onDragEnd={canEdit ? handleBackpackRowDragEnd : undefined}
                          onDragOver={canEdit ? handleDragOver : undefined}
                          onDrop={canEdit ? (e) => handleBackpackRowDrop(e, layoutIdx) : undefined}
                        >
                          {/* 头部行：只有网格布局，无边框圆角内边距 */}
                          <div className={`${backpackRowGrid} px-3.5 py-2`}>
                            {/* anchor name row (col-span-7) preserved above */}
                            <div
                              className={`${inventoryItemNameRowClass} col-span-7 cursor-pointer`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (e.shiftKey) {
                                  setBagModuleExpanded((p) => ({ ...p, [modForAnchor.id]: p[modForAnchor.id] === false }))
                                } else {
                                  setBackpackItemBriefOpen((prev) => ({ ...prev, [bbKey]: !prev[bbKey] }))
                                }
                              }}
                              title={
                                bagModuleExpanded[modForAnchor.id] === false
                                  ? '点击展开说明 · Shift+点击展开袋内'
                                  : '点击收起说明 · Shift+点击收起袋内'
                              }
                            >
                              <div className={inventoryItemNameTitleGroupClass}>
                                <InfoTooltip
                                  content={(() => {
                                    const p = entry?.itemId ? getItemById(entry.itemId) : null
                                    return <ItemTooltipContent proto={p} entry={entry} />
                                  })()}
                                  triggerClassName={inventoryItemNameTextClass}
                                  disabled={!entry?.itemId}
                                >
                                  <span className="break-words">{invDisplayName(entry)}</span>
                                </InfoTooltip>
                                <span className="shrink-0 text-[10px] text-dnd-text-muted whitespace-nowrap tabular-nums">
                                  模块 {modIndexAnchor + 1} ·{' '}
                                  {normalizeBagOfHoldingVisibility(modForAnchor.visibility) === 'public' ? '公家' : '私人'}
                                </span>
                                {hasContainedSpellEffect(entry) && (
                                  <ContainedSpellUseButton
                                    entry={entry}
                                    onChargeChange={(v) => setCharge(i, v)}
                                    compact
                                  />
                                )}
                                {(() => {
                                  const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                                  const localAbility = !activeEntry ? buildActiveAbilityFromEntry(entry) : null
                                  const ability = activeEntry?.ability || localAbility
                                  if (!ability) return null
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEquipmentUseModal(activeEntry || { inventoryId: entry.id, ability, chargeValue: null })
                                      }}
                                      className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded border border-cyan-600/70 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/40 transition-colors"
                                      title={`使用主动技能: ${ability.name}`}
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                })()}
                                <EquipmentShieldPoolCounter entry={entry} character={character} onSave={onSave} />
                              </div>
                              {/* inline visibility */}
                              <span
                                className={inventoryItemChargeCellClass}
                                onMouseDown={(e) => e.stopPropagation()}
                                role="presentation"
                              >
                                <span className="shrink-0 leading-none">可见</span>
                                <div className="min-w-0 max-w-[5.5rem] shrink-0 w-full">
                                  {canEdit ? (
                                    <select
                                      aria-label="次元袋可见性"
                                      value={normalizeBagOfHoldingVisibility(modForAnchor.visibility)}
                                      onChange={(e) =>
                                        applyEmbeddedModuleVisibility(
                                          modForAnchor.id,
                                          e.target.value === 'public' ? 'public' : 'private',
                                        )
                                      }
                                      title="私人：仅本角色卡可见。公家：团队仓库可查看并与秘法箱互通。"
                                      className={`${inputClassInline} box-border !h-6 w-full max-w-[5.5rem] py-0 pl-1 pr-5 text-[10px] leading-none`}
                                    >
                                      <option value="public">公家</option>
                                      <option value="private">私人</option>
                                    </select>
                                  ) : (
                                    <span className="text-dnd-text-body text-xs tabular-nums text-right block w-full pr-0.5">
                                      {normalizeBagOfHoldingVisibility(modForAnchor.visibility) === 'public' ? '公家' : '私人'}
                                    </span>
                                  )}
                                </div>
                              </span>
                              {/* inline bag count + weight */}
                              <span className={inventoryItemQtyWeightCellClass}>
                                <div
                                  className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  role="presentation"
                                >
                                  <span className="shrink-0 leading-none">袋</span>
                                  <div className="w-[5.125rem] shrink-0 max-w-full h-6 flex items-center justify-end">
                                    {canEdit ? (
                                      <NumberStepper
                                        value={qty}
                                        onChange={(v) => setQty(i, v)}
                                        min={0}
                                        max={MAX_BAG_OF_HOLDING_TOTAL}
                                        compact
                                        pill
                                        subtle
                                      />
                                    ) : (
                                      <span className="text-dnd-text-body text-xs tabular-nums inline-block text-right w-full pr-0.5">{qty}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                  {totalLb > 0 ? (
                                    <span className="text-dnd-text-body" title="仅自重；与负重条一致">
                                      {formatDisplayWeightLb(totalLb)} lb
                                    </span>
                                  ) : (
                                    <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                      —
                                    </span>
                                  )}
                                </div>
                              </span>
                            </div>
                            {canEdit && (
                              <div className="flex items-center justify-end gap-0.5 col-span-7" onMouseDown={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className={`${actionIconBtnClass} ${walletRowOnBodyNoFunds ? 'opacity-30 pointer-events-none' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); if (!walletRowOnBodyNoFunds) openStoreToVault(i); }}
                                  title={walletRowOnBodyNoFunds ? '身上该币种为 0，无法存仓库' : '存到团队仓库'}
                                >
                                  <Package size={13} />
                                </button>
                                <button
                                  type="button"
                                  className={actionIconBtnClass}
                                  onClick={(e) => { e.stopPropagation(); startEdit(i); }}
                                  title="袋内物品请展开后点铅笔编辑"
                                >
                                  <Pencil size={13} />
                                </button>
                                {modForAnchor && (
                                  <button
                                    type="button"
                                    className={actionIconBtnClass}
                                    onClick={(e) => { e.stopPropagation(); setBagModuleDeleteUnlocked((p) => ({ ...p, [modForAnchor.id]: !p[modForAnchor.id] })); }}
                                    title={bagModuleDeleteUnlocked[modForAnchor.id] ? '重新上锁' : '解锁后可删除整模块'}
                                  >
                                    {bagModuleDeleteUnlocked[modForAnchor.id] ? <Unlock size={13} /> : <Lock size={13} />}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={`${actionIconBtnDangerClass} ${modForAnchor && !bagModuleDeleteUnlocked[modForAnchor.id] ? 'opacity-30 pointer-events-none' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); if (!(modForAnchor && !bagModuleDeleteUnlocked[modForAnchor.id])) removeItem(i); }}
                                  title={modForAnchor ? '请先点锁图标解锁' : '删除'}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                          
                          {/* 展开内容区域：说明 + BagModuleSection */}
                          {isAnchor && modForAnchor && modIndexAnchor >= 0 && anchorBagExpanded ? (
                            <>
                              {/* 说明文字区 */}
                              <div className="px-3.5 py-2">
                                <p className="text-dnd-text-muted text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                                  {entry?.brief || '—'}
                                </p>
                              </div>
                              
                              {/* 内容物品标题 */}
                              <div className="px-3.5 py-1.5">
                                <span className="text-emerald-300/90 text-xs font-medium flex items-center gap-1.5">
                                  <Package className="w-3.5 h-3.5" />
                                  内容物品
                                </span>
                              </div>
                              
                              {/* 袋内物品区 */}
                              <div
                                className="bg-transparent px-2 py-2"
                                onDragOver={canEdit ? handleDragOver : undefined}
                                onDrop={
                                  canEdit
                                    ? (e) => {
                                        if (e.dataTransfer.getData('text/dnd-from-bag') === '1') {
                                          handleBackpackRowDrop(e, layoutIdx)
                                          return
                                        }
                                        const tb = Math.max(0, Math.floor(Number(modForAnchor?.bagCount) || 0))
                                        if (modForAnchor && tb > 0) {
                                          deliverBagDrop(e, {
                                            canEdit,
                                            mod: modForAnchor,
                                            totalBags: tb,
                                            onMoveToBag: moveEntryToBag,
                                            onMoveCurrencyToBag: moveWalletCurrencyToBag,
                                            onMoveNestedToBag: moveNestedToBag,
                                          })
                                        }
                                      }
                                    : undefined
                                }
                              >
                                <BagModuleSection
                                  mod={modForAnchor}
                                  modIndex={modIndexAnchor}
                                  modules={bagModules}
                                  characterId={character?.id}
                                  character={character}
                                  onSave={onSave}
                                  getShieldPoolCurrent={getShieldPoolCurrent}
                                  setShieldPoolCurrent={setShieldPoolCurrent}
                                  inventory={inv}
                                  canEdit={canEdit}
                                  patchBag={patchBagItem}
                                  hasBagRowActions={!!canEdit}
                                  renderBagActionCell={renderEmbeddedBagActionCell}
                                  renderNameExtras={renderEmbeddedBagNameExtras}
                                  invDisplayName={invDisplayName}
                                  getEntryBriefFull={getEntryBriefFull}
                                  onSetModuleBagCount={handleSetModuleBagCount}
                                  onSetModuleVisibility={applyEmbeddedModuleVisibility}
                                  onRemoveModule={handleRemoveBagModule}
                                  moduleDeleteUnlocked={!!bagModuleDeleteUnlocked[modForAnchor.id]}
                                  onToggleModuleDeleteLock={() =>
                                    setBagModuleDeleteUnlocked((p) => ({ ...p, [modForAnchor.id]: !p[modForAnchor.id] }))
                                  }
                                  iconBtn={BAG_PANEL_ICON_BTN}
                                  removeBagBtn={BAG_PANEL_REMOVE_BTN}
                                  tableColSpan={canEdit ? 5 : 3}
                                  handleDragStart={handleEmbeddedBagRowDragStart}
                                  handleDragEnd={handleEmbeddedBagRowDragEnd}
                                  handleDragOver={handleDragOver}
                                  onMoveToBag={moveEntryToBag}
                                  onMoveCurrencyToBag={moveWalletCurrencyToBag}
                                  onMoveNestedToBag={moveNestedToBag}
                                  expanded
                                  onToggleExpanded={() => {}}
                                  hideModuleChrome
                                  activeAbilities={activeAbilities}
                                  onUseBagAbility={(entry) => {
                                    const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                                    if (activeEntry) {
                                      setEquipmentUseModal(activeEntry)
                                    } else {
                                      const localAbility = buildActiveAbilityFromEntry(entry)
                                      if (localAbility) setEquipmentUseModal({ inventoryId: entry.id, ability: localAbility, chargeValue: null })
                                    }
                                  }}
                                  getBuffTagsFromEffects={getBuffTagsFromEffects}
                                  onBagRowEdit={startEdit}
                                  onBagRowStore={openStoreToVault}
                                  onBagRowRemove={removeBagItemByGlobalIndex}
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                        ) : isContainer ? (
                          <div className="flex flex-col min-w-0 rounded-md border border-dnd-gold/35 bg-[#141c28] overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.085),inset_0_-1px_0_rgba(0,0,0,0.22)]" style={{ marginBottom: '8px' }}>
                            <EquipmentItemCard
                              key={entry.id ?? `inv-${i}`}
                              entry={entry}
                              invIndex={i}
                              slotValue="backpack"
                              canEdit={canEdit}
                              isAttuned={!!entry.isAttuned}
                              attunedCount={attunedCount}
                              maxAttunementSlots={maxAttunementSlots}
                              onAttuneToggle={toggleAttunedForEntry}
                              noShadow
                              availableSlotGroups={getAvailableSlotsForItem(entry, inv, 'backpack')}
                              onSlotChange={handleSlotChange}
                              displayName={invDisplayName(entry)}
                              magicBonus={Number(entry.magicBonus) || 0}
                              brief={packBrief}
                              briefExpanded={!!backpackItemBriefOpen[bbKey]}
                              onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [bbKey]: !prev[bbKey] }))}
                              charge={showChargeCol ? (Number(entry.charge) || 0) : 0}
                              maxCharge={maxChargeFromEffect || maxChargeFromContainedSpell || Number(entry.maxCharge) || 0}
                              onChargeChange={(v) => setCharge(i, v)}
                              onAbsorbEnergy={() => handleAbsorbEnergy(i)}
                              shieldPoolCurrent={spCurrent}
                              shieldPoolMax={spMax}
                              shieldPoolThreshold={spThreshold}
                              onShieldPoolChange={spEffect ? (v) => {
                                const newState = setShieldPoolCurrent(character, 'equipment', entry.id, v)
                                onSave({ shieldPoolStates: newState })
                              } : undefined}
                              activeAbility={(() => {
                                const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                                if (activeEntry) return activeEntry.ability
                                return buildActiveAbilityFromEntry(entry)
                              })()}
                              onUseAbility={(() => {
                                const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                                if (activeEntry) return () => setEquipmentUseModal(activeEntry)
                                const localAbility = buildActiveAbilityFromEntry(entry)
                                if (localAbility) return () => setEquipmentUseModal({ inventoryId: entry.id, ability: localAbility, chargeValue: null })
                                return undefined
                              })()}
                              hasContainedSpell={hasContainedSpellEffect(entry)}
                              onContainedSpellCharge={hasContainedSpellEffect(entry) ? (v) => setCharge(i, v) : undefined}
                              containedSpellEntry={hasContainedSpellEffect(entry) ? entry : null}
                              qty={qty}
                              onQtyChange={(v) => setQty(i, v)}
                              weightLb={totalLb}
                              showQty={!entry?.walletCurrencyId && !isAnchor}
                              buffTags={getBuffTagsFromEffects(entry?.effects || [])}
                              onEdit={() => startEdit(i)}
                              onStoreToVault={() => openStoreToVault(i)}
                              onDelete={() => removeItem(i)}
                              tooltipContent={entry?.itemId ? (
                                <ItemTooltipContent proto={getItemById(entry.itemId)} entry={entry} />
                              ) : null}
                              draggable={canEdit}
                              onDragStart={canEdit ? (e) => handleBackpackRowDragStart(e, layoutIdx) : undefined}
                              onDragEnd={canEdit ? handleBackpackRowDragEnd : undefined}
                              onDragOver={canEdit ? handleDragOver : undefined}
                              onDrop={canEdit ? (e) => handleBackpackRowDrop(e, layoutIdx) : undefined}
                            />
                            {!!backpackItemBriefOpen[bbKey] && (
                              <div
                                className="bg-transparent px-3.5 py-2"
                                onDragOver={canEdit ? handleDragOver : undefined}
                                onDrop={canEdit ? (e) => handleDropIntoContainer(e, i, entry.id) : undefined}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-emerald-300/90 text-xs font-medium flex items-center gap-1.5">
                                    <Package className="w-3.5 h-3.5" />
                                    容器内物品
                                  </span>
                                  <span className="text-dnd-text-muted text-[10px]">
                                    共 {(Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []).length} 件
                                  </span>
                                </div>
                                <div className="flex flex-col min-w-0">
                                  {(Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []).map((nested, nestedIdx) => {
                                    const nestedLb = getInventoryEntryStackWeightLb(nested)
                                    const nestedQty = Math.max(1, Math.floor(Number(nested?.qty) || 1))
                                    const nestedCharge = Number(nested?.charge) || 0
                                    const nestedMagicBonus = Number(nested?.magicBonus) || 0
                                    const nestedActiveEntry = activeAbilities.find(a => a.inventoryId === nested.id)
                                    const nestedLocalAbility = !nestedActiveEntry ? buildActiveAbilityFromEntry(nested) : null
                                    const nestedFinalAbility = nestedActiveEntry?.ability || nestedLocalAbility
                                    const nestedChargeEffect = Array.isArray(nested?.effects)
                                      ? nested.effects.find(ef => ef?.effectType === 'charge_item') : null
                                    const nestedCsValue = !nestedChargeEffect && hasContainedSpellEffect(nested) ? extractContainedSpellValueFromEntry(nested) : null
                                    const nestedMaxCharge = nestedChargeEffect
                                      ? (Number(nestedChargeEffect.value?.charges) || 0)
                                      : nestedCsValue
                                        ? (Number(nestedCsValue.totalCharges) || 0)
                                        : (Number(nested?.maxCharge) || 0)
                                    const nestedHasContainedSpell = hasContainedSpellEffect(nested)
                                    const nestedDisplayName = invDisplayName(nested)
                                    const nestedBuffTags = getBuffTagsFromEffects(nested?.effects || [])
                                    const nestedBrief = getEntryBriefFull(nested)
                                    const nestedBriefKey = `nested-${entry.id}-${nested.id || nestedIdx}`
                                    const nestedBriefExpanded = !!backpackItemBriefOpen[nestedBriefKey]
                                    const nestedSpEffect = Array.isArray(nested?.effects)
                                      ? nested.effects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
                                      : null
                                    const nestedSpMax = nestedSpEffect ? (Number(nestedSpEffect.value.max) || 10) : null
                                    const nestedSpThreshold = nestedSpEffect ? (Number(nestedSpEffect.value.threshold) || 0) : null
                                    const nestedSpCurrent = nestedSpEffect ? getShieldPoolCurrent(character, 'equipment', nested.id, nestedSpMax) : null

                                    return (
                                      <EquipmentItemCard
                                        key={nested.id ?? `nested-bag-${i}-${nestedIdx}`}
                                        gridVariant="container"
                                        entry={nested}
                                        invIndex={nestedIdx}
                                        slotValue="backpack"
                                        canEdit={canEdit}
                                        displayName={nestedDisplayName}
                                        magicBonus={nestedMagicBonus}
                                        brief={nestedBrief}
                                        briefExpanded={nestedBriefExpanded}
                                        onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [nestedBriefKey]: !nestedBriefExpanded }))}
                                        charge={nestedCharge}
                                        maxCharge={nestedMaxCharge}
                                        onChargeChange={(v) => {
                                          const nextNested = entry.nestedInventory.map((n, idx2) =>
                                            idx2 === nestedIdx ? { ...n, charge: v } : n
                                          )
                                          onSave({ inventory: inv.map((e2, idx2) => idx2 === i ? { ...e2, nestedInventory: nextNested } : e2) })
                                        }}
                                        shieldPoolCurrent={nestedSpCurrent}
                                        shieldPoolMax={nestedSpMax}
                                        shieldPoolThreshold={nestedSpThreshold}
                                        onShieldPoolChange={nestedSpEffect ? (v) => {
                                          const newState = setShieldPoolCurrent(character, 'equipment', nested.id, v)
                                          onSave({ shieldPoolStates: newState })
                                        } : undefined}
                                        activeAbility={nestedFinalAbility}
                                        onUseAbility={nestedFinalAbility ? () => setEquipmentUseModal(nestedActiveEntry || { inventoryId: nested.id, ability: nestedFinalAbility, chargeValue: null }) : undefined}
                                        hasContainedSpell={nestedHasContainedSpell}
                                        onContainedSpellCharge={nestedHasContainedSpell ? (v) => {
                                          const nextNested = entry.nestedInventory.map((n, idx2) =>
                                            idx2 === nestedIdx ? { ...n, charge: v } : n
                                          )
                                          onSave({ inventory: inv.map((e2, idx2) => idx2 === i ? { ...e2, nestedInventory: nextNested } : e2) })
                                        } : undefined}
                                        containedSpellEntry={nestedHasContainedSpell ? nested : null}
                                        qty={nestedQty}
                                        onQtyChange={(v) => setNestedQty(entry.id, nestedIdx, v)}
                                        weightLb={nestedLb}
                                        showQty={!nested?.walletCurrencyId}
                                        buffTags={nestedBuffTags}
                                        onStoreToVault={() => openStoreToVaultForNested(i, nestedIdx)}
                                        onEdit={() => setEditingNested({ containerId: entry.id, nestedIndex: nestedIdx })}
                                        onDelete={() => removeItemFromContainer(entry.id, nestedIdx)}
                                        tooltipContent={nested?.itemId ? (
                                          <ItemTooltipContent proto={getItemById(nested.itemId)} entry={nested} />
                                        ) : null}
                                        draggable={canEdit}
                                        onDragStart={canEdit ? (e) => handleNestedDragStart(e, i, nestedIdx) : undefined}
                                        onDragEnd={canEdit ? handleNestedDragEnd : undefined}
                                      />
                                    )
                                  })}
                                </div>
                                {canEdit && (
                                  <div className="mt-2 rounded-md border border-dashed border-dnd-gold/25 bg-[#151c28]/40 px-2 py-2 text-center">
                                    <p className="text-[10px] text-dnd-text-muted leading-snug">
                                      拖背包物品到此处放入容器
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <EquipmentItemCard
                            key={entry.id ?? `inv-${i}`}
                            entry={entry}
                            invIndex={i}
                            slotValue="backpack"
                            canEdit={canEdit}
                            isAttuned={!!entry.isAttuned}
                            attunedCount={attunedCount}
                            maxAttunementSlots={maxAttunementSlots}
                            onAttuneToggle={toggleAttunedForEntry}
                            availableSlotGroups={getAvailableSlotsForItem(entry, inv, 'backpack')}
                            onSlotChange={handleSlotChange}
                            displayName={invDisplayName(entry)}
                            magicBonus={Number(entry.magicBonus) || 0}
                            brief={packBrief}
                            briefExpanded={!!backpackItemBriefOpen[bbKey]}
                            onToggleBrief={() => setBackpackItemBriefOpen(prev => ({ ...prev, [bbKey]: !prev[bbKey] }))}
                            charge={showChargeCol ? (Number(entry.charge) || 0) : 0}
                            maxCharge={maxChargeFromEffect || maxChargeFromContainedSpell || Number(entry.maxCharge) || 0}
                            onChargeChange={(v) => setCharge(i, v)}
                            onAbsorbEnergy={() => handleAbsorbEnergy(i)}
                            shieldPoolCurrent={spCurrent}
                            shieldPoolMax={spMax}
                            shieldPoolThreshold={spThreshold}
                            onShieldPoolChange={spEffect ? (v) => {
                              const newState = setShieldPoolCurrent(character, 'equipment', entry.id, v)
                              onSave({ shieldPoolStates: newState })
                            } : undefined}
                            activeAbility={(() => {
                              const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                              if (activeEntry) return activeEntry.ability
                              return buildActiveAbilityFromEntry(entry)
                            })()}
                            onUseAbility={(() => {
                              const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                              if (activeEntry) return () => setEquipmentUseModal(activeEntry)
                              const localAbility = buildActiveAbilityFromEntry(entry)
                              if (localAbility) return () => setEquipmentUseModal({ inventoryId: entry.id, ability: localAbility, chargeValue: null })
                              return undefined
                            })()}
                            hasContainedSpell={hasContainedSpellEffect(entry)}
                            onContainedSpellCharge={hasContainedSpellEffect(entry) ? (v) => setCharge(i, v) : undefined}
                            containedSpellEntry={hasContainedSpellEffect(entry) ? entry : null}
                            qty={qty}
                            onQtyChange={(v) => setQty(i, v)}
                            weightLb={totalLb}
                            showQty={!entry?.walletCurrencyId && !isAnchor}
                            buffTags={getBuffTagsFromEffects(entry?.effects || [])}
                            onEdit={() => startEdit(i)}
                            onStoreToVault={() => openStoreToVault(i)}
                            onDelete={() => removeItem(i)}
                            tooltipContent={entry?.itemId ? (
                              <ItemTooltipContent proto={getItemById(entry.itemId)} entry={entry} />
                            ) : null}
                            draggable={canEdit}
                            onDragStart={canEdit ? (e) => handleBackpackRowDragStart(e, layoutIdx) : undefined}
                            onDragEnd={canEdit ? handleBackpackRowDragEnd : undefined}
                            onDragOver={canEdit ? handleDragOver : undefined}
                            onDrop={canEdit ? (e) => handleBackpackRowDrop(e, layoutIdx) : undefined}
                          />
                        )}
                      </>
                    )
                  })
              )}
              {inv.length === 0 && (
                <p className="text-gray-500 text-sm py-2 text-center">暂无物品</p>
              )}

              <div className={inventoryItemCardShellClass}>
              <div className="flex items-center justify-start min-w-0">
                <h4 className={subTitleClass + ' mb-0'}>钱包</h4>
              </div>
              <div className="flex flex-wrap items-stretch gap-2 min-h-0 mt-2">
                <div className="flex-1 min-w-[160px] min-h-0 flex flex-col">
                  <CurrencyGrid
                    balances={displayWallet}
                    embedded
                    fillHeight
                    editable={!!canEdit}
                    dragCurrencyToBag={!!canEdit}
                    onCurrencyChange={(currencyId, value) => patchWalletCurrency(currencyId, value)}
                  />
                </div>
                {canEdit && (
                  <div className="flex flex-col w-[7rem] shrink-0 gap-1 self-stretch min-h-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTransferDirection('toVault')
                        setTransferOpen(true)
                      }}
                      className="flex-1 min-h-7 w-full inline-flex items-center justify-center gap-1 rounded-md bg-dnd-gold/80 hover:bg-dnd-gold text-white text-xs font-medium"
                    >
                      <ArrowDownToLine size={14} /> 存入金库
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTransferDirection('fromVault')
                        setTransferOpen(true)
                      }}
                      className="flex-1 min-h-7 w-full inline-flex items-center justify-center gap-1 rounded-md bg-dnd-red hover:bg-dnd-red-hover text-white text-xs font-medium"
                    >
                      <ArrowUpFromLine size={14} /> 从金库取出
                    </button>
                  </div>
                )}
              </div>
              </div>
            </div>

            <div className="pt-2 mt-1 border-t border-white/[0.07]">
              <p className={`${subTitleClass} text-dnd-text-muted font-medium mb-0.5`}>负重</p>
              <p className="text-[10px] text-dnd-text-muted mb-1.5 leading-snug">背包物品、货币、各模块次元袋自重；袋内物品不计入背负。</p>
              <EncumbranceBar character={character} />
            </div>
          </div>
        </div>
      </div>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} direction={transferDirection} characterId={character?.id} characterName={character?.name} onSuccess={handleTransferSuccess} />

      {equipmentUseModal?.chargeValue ? (
        <AbilityUseModal
          chargeValue={equipmentUseModal.chargeValue}
          char={character}
          featureName={equipmentUseModal.ability?.name || '装备技能'}
          onConfirm={(patch) => { if (patch && Object.keys(patch).length > 0) onSave(patch) }}
          onClose={() => setEquipmentUseModal(null)}
        />
      ) : equipmentUseModal?.ability ? (
        <AbilityUseModal
          activeAbility={equipmentUseModal.ability}
          char={character}
          featureName={equipmentUseModal.ability.name}
          onConfirm={(patch) => { if (patch && Object.keys(patch).length > 0) onSave(patch) }}
          onClose={() => setEquipmentUseModal(null)}
        />
      ) : null}

      <ItemAddForm open={editingIndex !== null} onClose={() => setEditingIndex(null)} onSave={applyEditSave} submitLabel="保存" editEntry={editingIndex != null ? inv[editingIndex] : null} inventory={inv} spellDC={spellDC} spellAttackBonus={spellAttackBonus} referenceData={referenceData} />
      <ItemAddForm
        open={editingNested !== null}
        onClose={() => setEditingNested(null)}
        onSave={applyNestedEditSave}
        submitLabel="保存"
        editEntry={
          editingNested
            ? inv.find((e) => e.id === editingNested.containerId)?.nestedInventory?.[editingNested.nestedIndex] ?? null
            : null
        }
        inventory={inv}
        spellDC={spellDC}
        spellAttackBonus={spellAttackBonus}
        referenceData={referenceData}
      />

      {storeToVaultIndex != null && inv[storeToVaultIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setStoreToVaultIndex(null)}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-dnd-gold-light text-sm font-bold mb-2">存到团队仓库</p>
            <p className="text-dnd-text-muted text-xs mb-2">
              当前：{invDisplayName(inv[storeToVaultIndex])} ×{' '}
              {inv[storeToVaultIndex].walletCurrencyId === 'gem_lb'
                ? formatDisplayGemLbQty(Math.max(0, Number(inv[storeToVaultIndex].qty) || 0))
                : inv[storeToVaultIndex].walletCurrencyId
                  ? Math.max(0, Math.floor(Number(inv[storeToVaultIndex].qty) || 0))
                  : inv[storeToVaultIndex].qty}
            </p>
            {inv[storeToVaultIndex].walletCurrencyId ? (
              <p className="text-dnd-text-muted text-[10px] mb-4 leading-snug">
                实体钱币将<strong className="text-dnd-text-body">整堆</strong>存入团队秘法箱（不可拆分数量）。
              </p>
            ) : (
              (() => {
                const maxStoreQty = Math.max(1, Number(inv[storeToVaultIndex].qty) ?? 1)
                return (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-10 shrink-0 text-dnd-text-muted text-xs">数量</span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="max-w-[min(100%,11rem)] w-full shrink-0 min-w-0">
                          <NumberStepper
                            value={storeToVaultQty}
                            min={1}
                            max={maxStoreQty}
                            onChange={(v) => setStoreToVaultQty(v)}
                            compact
                          />
                        </div>
                        <span className="shrink-0 self-center font-mono text-sm tabular-nums leading-none text-dnd-text-muted whitespace-nowrap">
                          / {maxStoreQty}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setStoreToVaultIndex(null)} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
              <button
                type="button"
                onClick={confirmStoreToVault}
                disabled={
                  isStoreToVaulting ||
                  (() => {
                    const ev = inv[storeToVaultIndex]
                    if (!ev?.walletCurrencyId) return false
                    return ev.walletCurrencyId === 'gem_lb'
                      ? (Number(ev.qty) || 0) <= 0
                      : Math.floor(Number(ev.qty) || 0) <= 0
                  })()
                }
                className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStoreToVaulting ? '存入中...' : '确认存入'}
              </button>
            </div>
          </div>
        </div>
      )}
      {transferHint && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="pointer-events-auto rounded-lg border border-dnd-gold/40 bg-gray-900/95 px-4 py-3 shadow-xl max-w-sm mx-4">
            <p className="text-dnd-gold-light text-sm font-medium">{transferHint}</p>
          </div>
        </div>
      )}
      {absorbResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setAbsorbResult(null)}>
          <div className="rounded-lg border border-white/10 bg-[#1a1f2e] px-5 py-4 shadow-2xl max-w-xs mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[#fbbf24] text-sm font-bold mb-2">吸能恢复</h3>
            <p className="text-gray-200 text-sm mb-1">「{absorbResult.name}」</p>
            <p className="text-gray-400 text-xs mb-1">掷骰：{absorbResult.expression}</p>
            <p className="text-gray-300 text-sm">{absorbResult.from} → {absorbResult.to}</p>
            <button
              type="button"
              className="mt-3 w-full py-1.5 rounded text-sm font-medium bg-[#fbbf24]/15 text-[#fbbf24] border border-[#fbbf24]/30 hover:bg-[#fbbf24]/25 transition-colors cursor-pointer"
              onClick={() => setAbsorbResult(null)}
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
