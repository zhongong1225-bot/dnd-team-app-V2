/**
 * 装备与背包：合并身穿装备和背包
 * 上方：手持与身穿（左右分栏）
 * 下方：背包
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  Package,
  ChevronDown,
  ChevronRight,
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
} from 'lucide-react'
import { executeAbility, canUseAbility } from '../lib/activeAbilityEngine'
import DragHandleIcon from './DragHandleIcon'
import { getItemById, getItemDisplayName, itemRequiresAttunement } from '../data/itemDatabase'
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
import { ABILITY_NAMES_ZH, hasItemStorageEffect, ITEM_STORAGE_DEFAULT_ITEM_IDS } from '../data/buffTypes'
import { getCharacterClasses, getClassDisplayName } from '../data/classDatabase'
import { inputClass, inputClassInline } from '../lib/inputStyles'
import { logTeamActivity } from '../lib/activityLog'
import { NumberStepper } from './BuffForm'
import { appendContainedSpellsBrief } from '../lib/containedSpellBrief'
import { hasContainedSpellEffect } from '../lib/containedSpellModel'
import ContainedSpellUseButton from './ContainedSpellUseButton'
import { BagModuleSection, parseDragInventoryIndex, deliverBagDrop } from './BagOfHoldingPanel'
import { normalizeBagOfHoldingVisibility } from '../lib/bagOfHoldingVisibility'
import {
  getNormalizedBagModules,
  removeBagModuleAt,
  updateModuleBagCount,
  mergeWalletDelta,
  inventoryWithBagPatch,
  MAX_BAG_OF_HOLDING_TOTAL,
  reconcileBagModuleAnchors,
  isBagModuleAnchorEntry,
  entryBelongsToBagModule,
} from '../lib/bagOfHoldingModules'
import { mergeWalletWithBagWallet, walletPartForCommittedTotal } from '../lib/currencyInventoryRows'
import {
  normalizeBackpackLayoutOrder,
  resolveInvIndexFromItemToken,
  reorderLayoutTokens,
  itemTokenForEntry,
} from '../lib/backpackLayoutOrder'
import {
  inventoryItemActionsCellClass,
  inventoryItemBriefChevronBtnClass,
  inventoryItemCardListGapClass,
  inventoryItemCardShellClass,
  inventoryItemChargeCellClass,
  inventoryItemNameExtrasClass,
  inventoryItemNameRowClass,
  inventoryItemNameTextClass,
  inventoryItemNameTitleGroupClass,
  inventoryItemQtyWeightCellClass,
  inventoryItemRowGridEditableNoCharge,
  inventoryItemRowGridEditableWithCharge,
  inventoryItemRowGridReadNoCharge,
  inventoryItemRowGridReadWithCharge,
  inventoryItemBriefIsExpandable,
} from '../lib/inventoryItemCardStyles'
import { InventoryItemBriefChevron, InventoryItemBriefExpandedText } from './InventoryItemCardBrief'
import InfoTooltip from './InfoTooltip'
import { ItemTooltipContent } from '../lib/infoTooltipContent'

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

/** 槽位：与背包区一致，弱对比、无额外盒线 */
function EquipSlotBadge({ Icon, label }) {
  return (
    <div className="flex w-[2.85rem] shrink-0 flex-col items-center justify-center gap-0.5 py-0.5 text-center" aria-hidden>
      <Icon className="h-3.5 w-3.5 text-dnd-gold-light/55" strokeWidth={1.75} />
      <span className="text-[9px] font-medium text-gray-500 leading-tight">{label}</span>
    </div>
  )
}

/** 同调：复选框样式，每个已装备栏位都显示 */
function AttuneToggle({ entry, attunedCount, maxAttunementSlots, onToggle }) {
  const proto = entry?.itemId ? getItemById(entry.itemId) : null
  const requiresAttunement = itemRequiresAttunement(proto) || itemRequiresAttunement(entry)
  const active = !!entry?.isAttuned
  const disabled = !entry || (!active && attunedCount >= maxAttunementSlots)
  if (!entry) return null
  return (
    <label
      title={
        active
          ? '点击取消同调'
          : attunedCount >= maxAttunementSlots
            ? '同调位已满'
            : requiresAttunement
              ? '同调此物品'
              : '同调此物品（该物品未标记为需要同调）'
      }
      className={`shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border text-[11px] cursor-pointer transition-colors ${
        disabled
          ? 'border-gray-700 bg-gray-800/50 text-gray-600 opacity-50 cursor-not-allowed'
          : active
            ? 'border-dnd-gold/50 bg-dnd-gold/10 text-dnd-gold-light hover:bg-dnd-gold/20'
            : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      <Sparkles className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-dnd-gold-light' : 'text-gray-500'}`} strokeWidth={2} />
      <input
        type="checkbox"
        checked={active}
        disabled={disabled}
        onChange={() => entry && !disabled && onToggle(entry.id, !active)}
        className="sr-only"
      />
      同调
    </label>
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
    character?.inventory,
    character?.equippedHeld,
    character?.equippedWorn,
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

  useEffect(() => {
    if (!canEdit) return
    if (!inv.some((e) => !e?.inBagOfHolding && !e?.id)) return
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
  const setAttuned = (index, value) => {
    if (value && attunedCount >= maxAttunementSlots) return
    const next = inv.map((e, i) => (i === index ? { ...e, isAttuned: !!value } : e))
    onSave({ inventory: next })
  }

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

  /** 更新身穿身体槽条目上的瓦石层附魔数值（仅当 effects 中已有 ac_cap_stone_layer 时显示并编辑） */
  const setWornStoneLayer = (inventoryId, value) => {
    const entryIdx = inv.findIndex((e) => e.id === inventoryId)
    if (entryIdx < 0) return
    const n = Math.max(0, parseInt(value, 10) || 0)
    const entry = inv[entryIdx]
    const effects = Array.isArray(entry.effects) ? [...entry.effects] : []
    const idx = effects.findIndex((e) => e.effectType === 'ac_cap_stone_layer')
    if (idx >= 0) {
      effects[idx] = { ...effects[idx], value: n }
    } else {
      effects.push({ category: 'defense', effectType: 'ac_cap_stone_layer', value: n })
    }
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, effects } : e))
    onSave({ inventory: nextInv })
  }

  /** 瓦石甲 AC 递减（最低 12） */
  const decrementStoneArmorAC = (inventoryId) => {
    const entryIdx = inv.findIndex((e) => e.id === inventoryId)
    if (entryIdx < 0) return
    const entry = inv[entryIdx]
    const currentAC = typeof entry.stoneArmorAC === 'number' ? entry.stoneArmorAC : 21
    if (currentAC <= 12) return
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, stoneArmorAC: currentAC - 1 } : e))
    onSave({ inventory: nextInv })
  }

  /** 瓦石甲 AC 重置回 21 */
  const resetStoneArmorAC = (inventoryId) => {
    const entryIdx = inv.findIndex((e) => e.id === inventoryId)
    if (entryIdx < 0) return
    const nextInv = inv.map((e, i) => (i === entryIdx ? { ...e, stoneArmorAC: 21 } : e))
    onSave({ inventory: nextInv })
  }

  /** 判断是否为瓦石甲（通过 stoneArmorAC 字段或物品名） */
  const isStoneArmor = (entry) => {
    if (!entry) return false
    if (typeof entry.stoneArmorAC === 'number') return true
    const name = getEntryDisplayName(entry) || ''
    return name.includes('瓦石甲')
  }

  const addWornSlot = () => {
    const used = new Set(wornAddable.map((a) => a.slotId).filter(Boolean))
    const slotId = WORN_SLOT_OPTIONS.find((o) => o.id !== 'body' && !used.has(o.id))?.id ?? 'head'
    setWorn([...wornSlots, { id: 'worn_' + Date.now(), slotId, inventoryId: null }])
  }

  const removeWornSlot = (addableIndex) => {
    const next = [bodySlot, ...wornAddable.filter((_, i) => i !== addableIndex)]
    setWorn(next)
  }

  const toggleAttunedForEntry = (inventoryId, checked) => {
    const idx = inv.findIndex((e) => e.id === inventoryId)
    if (idx < 0) return
    setAttuned(idx, checked)
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
        })
        return
      }
      if (source.inBagOfHolding || target.inBagOfHolding) return
      if (isSameItemForMerge(source, target)) {
        setEditingIndex(null)
        const qtyT = Math.max(1, Number(target?.qty) ?? 1)
        const qtyS = Math.max(1, Number(source?.qty) ?? 1)
        const chargeT = Number(target?.charge) || 0
        const chargeS = Number(source?.charge) || 0
        const merged = { ...target, qty: qtyT + qtyS, charge: chargeT + chargeS }
        const nextInv = inv.filter((_, i) => i !== fromInv)
        const newToIndex = fromInv < toInv ? toInv - 1 : toInv
        nextInv[newToIndex] = merged
        const nextLayout = order.filter((_, i) => i !== fromL)
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
    const next = inv.map((e, i) => (i === index ? { ...e, charge: n } : e))
    onSave({ inventory: next })
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
    ;(e.currentTarget.closest('[data-bag-item-card]') ?? e.currentTarget).classList.add('opacity-60')
  }
  const handleEmbeddedBagRowDragEnd = (e) =>
    (e.currentTarget.closest('[data-bag-item-card]') ?? e.currentTarget).classList.remove('opacity-60')

  const renderEmbeddedBagNameExtras = (entry) => {
    const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((x) => x.effectType === 'ac_cap_stone_layer') : null
    const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
    if (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0) {
      return (
        <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
          {stoneVal}层
        </span>
      )
    }
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
    const q = qWallet != null ? qWallet : Math.max(1, Number(e.qty) ?? 1)
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
              inventory: latest.inventory ?? inv,
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

  /** 装备槽：与背包物品卡同系，避免多层盒线 */
  const equipSelectClass =
    'h-8 rounded-md bg-gray-800/90 border border-gray-600/50 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white text-xs px-2 min-w-0'
  const equipRowClass = 'flex flex-col gap-0.5 py-2.5'
  const equipAddBtnClass =
    'inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-gray-600/55 text-gray-400 text-xs hover:bg-gray-800/70 hover:text-gray-300 transition-colors'
  const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5'
  /**
   * 装备与背包整体最外框：与法术卡同系渐变与边框；阴影用黑系外投影（无 shadow-dnd-card 顶白 inset，圆角处不易像外发光）
   * 与 BuffManager BUFF_PANEL_OUTER_SHADOW / CombatStatus COMBAT_ROOT_OUTER_SHADOW 同逻辑
   */
  const equipInvOuterShellClass =
    'rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)]'
  /** 装备 / 背包分区外壳：内层不叠法术级外投影，避免三重阴影 */
  const sectionCardShellClass =
    'rounded-xl border border-gray-500/55 bg-[#141c28]/90 overflow-hidden shadow-sm shadow-black/25'
  /** 与分区壳 #141c28 同色相，避免灰条 / #1a2430 与壳体发绿不一致 */
  const cardHeadClass = 'px-2.5 py-1.5 border-b border-gray-600/70 bg-[#161e2b]'
  /** 装备卡内：手持卡、身穿卡；背包卡内：物品卡（钱包区已单独用 sectionCardShellClass，不再用本类） */
  const nestedCardClass = 'rounded-lg bg-[#141c28] overflow-hidden min-w-0'
  /** 背包列表物品卡：与团队仓库 / 次元袋共用 inventoryItemCardStyles */
  const backpackItemCardClass = inventoryItemCardShellClass

  return (
    <div className={equipInvOuterShellClass}>
      <div className="p-2 md:p-2.5 space-y-3">
        {/* —— 装备卡（内含同调、手持卡、身穿卡） —— */}
        <div className={sectionCardShellClass}>
          <div className={`${cardHeadClass} flex flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
            <h4 className={subTitleClass + ' mb-0'}>装备</h4>
            <p className="text-dnd-text-muted text-xs mb-0 tabular-nums shrink-0">
              同调位：<span className="text-white font-medium">{attunedCount}/{maxAttunementSlots}</span>
            </p>
          </div>
          <div className="p-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* 手持卡 */}
              <div className={nestedCardClass}>
                <div className="px-2 pb-1 pt-0.5">
            <div className="flex flex-col divide-y divide-gray-700/35">
              {heldSlots.slice(0, HELD_FIXED).map((slot, i) => {
                const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
                const proto = entry?.itemId ? getItemById(entry.itemId) : null
                const isShield = proto?.类型 === '盔甲' && proto?.子类型 === '盾牌'
                const shieldMagicBonus = Number(entry?.magicBonus) || 0
                const options = getHeldOptions(inv, i)
                const SlotIcon = i === 0 ? Swords : Shield
                return (
                  <div key={slot.id} className={equipRowClass}>
                    <div className="flex items-center gap-2 min-w-0">
                      <EquipSlotBadge Icon={SlotIcon} label={HELD_LABELS[i]} />
                      {canEdit ? (
                        <>
                          <select
                            value={slot.inventoryId || ''}
                            onChange={(e) => setHeldEquip(i, e.target.value)}
                            className={equipSelectClass + ' flex-1 min-w-0' + (!slot.inventoryId ? ' border-dashed border-gray-600/40 text-gray-500' : '')}
                          >
                            <option value="">未装备 · 选择物品</option>
                            {options.map((e) => (
                              <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                            ))}
                          </select>
                          {i === 1 && isShield && entry && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-gray-500 text-[10px] whitespace-nowrap">盾牌增强</span>
                              <NumberStepper
                                compact
                                narrow
                                min={0}
                                max={99}
                                value={shieldMagicBonus}
                                onChange={(v) => setWornMagicBonus(entry.id, String(v))}
                              />
                            </div>
                          )}
                          <AttuneToggle
                            entry={entry}
                            attunedCount={attunedCount}
                            maxAttunementSlots={maxAttunementSlots}
                            onToggle={toggleAttunedForEntry}
                          />
                        </>
                      ) : (
                        <>
                          <span className="text-white text-sm flex-1 min-w-0 font-medium tracking-tight">{getEntryDisplayName(entry)}</span>
                          {entry?.isAttuned && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-dnd-gold-light/85">
                              <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                              同调
                            </span>
                          )}
                          {i === 1 && isShield && shieldMagicBonus > 0 && (
                            <span className="text-dnd-gold-light/90 text-xs font-mono shrink-0" title="盾牌增强加值">+{shieldMagicBonus}</span>
                          )}
                        </>
                      )}
                    </div>
                    {i === 1 && entry && isShield && (() => {
                      const parsed = parseArmorNote(entry.附注 ?? proto?.附注 ?? '')
                      const baseAC = parsed?.isShield ? (parsed.bonus || 2) : 2
                      return (
                        <p className="text-dnd-gold-light/90 text-[10px]">
                          AC +{baseAC}{shieldMagicBonus > 0 ? <span className="ml-1">盾牌增强 +{shieldMagicBonus}</span> : null}
                        </p>
                      )
                    })()}
                  </div>
                )
              })}
              {heldSlots.slice(HELD_FIXED).map((slot, i) => {
                  const idx = HELD_FIXED + i
                  const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
                  const options = getHeldOptions(inv, idx)
                  return (
                    <div key={slot.id} className={equipRowClass}>
                      <div className="flex items-center gap-2 min-w-0">
                        <EquipSlotBadge Icon={Layers} label={`备用${i + 1}`} />
                        {canEdit ? (
                          <>
                            <select
                              value={slot.inventoryId || ''}
                              onChange={(e) => setHeldEquip(idx, e.target.value)}
                              className={equipSelectClass + ' flex-1 min-w-0' + (!slot.inventoryId ? ' border-dashed border-gray-600/40 text-gray-500' : '')}
                            >
                              <option value="">未装备 · 选择物品</option>
                              {options.map((e) => (
                                <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                              ))}
                            </select>
                            {heldSlots.length > HELD_FIXED && (
                              <button
                                type="button"
                                onClick={() => removeHeldSlot(idx)}
                                className="p-1 rounded text-gray-500 hover:text-dnd-red hover:bg-red-950/30 shrink-0"
                                title="移除备用栏"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <AttuneToggle
                              entry={entry}
                              attunedCount={attunedCount}
                              maxAttunementSlots={maxAttunementSlots}
                              onToggle={toggleAttunedForEntry}
                            />
                          </>
                        ) : (
                          <>
                            <span className="text-white text-sm flex-1 min-w-0 font-medium tracking-tight">{getEntryDisplayName(entry)}</span>
                            {entry?.isAttuned && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-dnd-gold-light/85">
                                <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                                同调
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
              {canEdit && (
                <div className="flex items-center justify-between border-t border-gray-700/30 px-0.5 pt-2 mt-1">
                  <span className="text-gray-500 text-xs">可增加备用栏</span>
                  <button type="button" onClick={addHeldSlot} className={equipAddBtnClass}>
                    <Plus className="w-3.5 h-3.5" /> 添加备用
                  </button>
                </div>
              )}
                </div>
              </div>

              {/* 身穿卡 */}
              <div className={nestedCardClass}>
                <div className="px-2 pb-1 pt-0.5">
            <div className="flex flex-col divide-y divide-gray-700/35">
            {/* 身体（固定） */}
            {(() => {
              const bodyEntry = bodySlot.inventoryId ? inv.find((e) => e.id === bodySlot.inventoryId) ?? null : null
              return (
            <div className={equipRowClass}>
              <div className="flex items-center gap-2 min-w-0">
                <EquipSlotBadge Icon={Shirt} label="身体" />
                {canEdit ? (
                  <>
                    <select
                      value={bodySlot.inventoryId || ''}
                      onChange={(e) => setWornEquip(e.target.value)}
                      className={equipSelectClass + ' flex-1 min-w-0' + (!bodySlot.inventoryId ? ' border-dashed border-gray-600/40 text-gray-500' : '')}
                    >
                      <option value="">未装备 · 选择盔甲/衣服</option>
                      {getWornOptions(inv, 'body').map((e) => (
                        <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                      ))}
                    </select>
                    {bodySlot.inventoryId && (() => {
                      const entry = inv.find((e) => e.id === bodySlot.inventoryId)
                      const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                      const hasStoneLayer = !!stoneEffect
                      const stoneValue = hasStoneLayer ? (Number(stoneEffect.value) || 0) : 0
                      const stoneAC = isStoneArmor(entry) ? (typeof entry.stoneArmorAC === 'number' ? entry.stoneArmorAC : 21) : null
                      return (
                        <>
                          {hasStoneLayer && entry && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-gray-500 text-[10px] whitespace-nowrap">瓦石层</span>
                              <NumberStepper
                                compact
                                narrow
                                min={0}
                                max={99}
                                value={stoneValue}
                                onChange={(v) => setWornStoneLayer(entry.id, String(v))}
                              />
                            </div>
                          )}
                          {stoneAC !== null && entry && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => decrementStoneArmorAC(entry.id)}
                                disabled={stoneAC <= 12}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-colors active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
                                title={stoneAC <= 12 ? 'AC 已降至最低 12' : '受击 AC-1'}
                                style={{
                                  borderColor: stoneAC <= 12 ? 'rgba(239,68,68,0.4)' : 'rgba(199,154,66,0.5)',
                                  backgroundColor: stoneAC <= 12 ? 'rgba(239,68,68,0.1)' : 'rgba(199,154,66,0.12)',
                                  color: stoneAC <= 12 ? 'rgb(239,68,68)' : 'rgb(220,190,120)',
                                }}
                              >
                                <Shield className="w-3 h-3" />
                                AC {stoneAC}
                              </button>
                              {stoneAC < 21 && (
                                <button
                                  type="button"
                                  onClick={() => resetStoneArmorAC(entry.id)}
                                  className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-colors active:scale-95"
                                  title="重置 AC 到 21"
                                >
                                  <ChevronDown className="w-3 h-3 rotate-180" />
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )
                    })()}
                    <AttuneToggle
                      entry={bodyEntry}
                      attunedCount={attunedCount}
                      maxAttunementSlots={maxAttunementSlots}
                      onToggle={toggleAttunedForEntry}
                    />
                  </>
                ) : (
                  <>
                    <span className="text-white text-sm flex-1 min-w-0 font-medium tracking-tight">{getEntryDisplayName(bodyEntry)}</span>
                    {bodyEntry?.isAttuned && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-dnd-gold-light/85">
                        <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                        同调
                      </span>
                    )}
                    {bodySlot.inventoryId && (() => {
                      const entry = inv.find((e) => e.id === bodySlot.inventoryId)
                      const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                      const stoneValue = stoneEffect != null ? (Number(stoneEffect.value) || 0) : 0
                      const stoneAC = isStoneArmor(entry) ? (typeof entry.stoneArmorAC === 'number' ? entry.stoneArmorAC : 21) : null
                      return (
                        <>
                          {stoneEffect && stoneValue > 0 && (
                            <span className="text-dnd-gold-light/90 text-xs font-mono shrink-0" title="瓦石层">{stoneValue}层</span>
                          )}
                          {stoneAC !== null && (
                            <button
                              type="button"
                              onClick={() => decrementStoneArmorAC(entry.id)}
                              disabled={stoneAC <= 12}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-colors active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed"
                              title={stoneAC <= 12 ? 'AC 已降至最低 12' : '受击 AC-1'}
                              style={{
                                borderColor: stoneAC <= 12 ? 'rgba(239,68,68,0.4)' : 'rgba(199,154,66,0.5)',
                                backgroundColor: stoneAC <= 12 ? 'rgba(239,68,68,0.1)' : 'rgba(199,154,66,0.12)',
                                color: stoneAC <= 12 ? 'rgb(239,68,68)' : 'rgb(220,190,120)',
                              }}
                            >
                              <Shield className="w-3 h-3" />
                              AC {stoneAC}
                            </button>
                          )}
                        </>
                      )
                    })()}
                  </>
                )}
              </div>
            </div>
              )
            })()}
              {wornAddable.map((slot, i) => {
                  const entry = slot.inventoryId ? inv.find((e) => e.id === slot.inventoryId) ?? null : null
                  const proto = entry?.itemId ? getItemById(entry.itemId) : null
                  const options = getWornOptions(inv, slot.slotId ?? 'head')
                  const parsed = entry ? parseArmorNote(entry.附注 ?? proto?.附注 ?? '') : null
                  const magicBonus = Number(entry?.magicBonus) || 0
                  const isArmorOrShield = proto?.类型 === '盔甲'
                  const slotLabel = WORN_SLOT_OPTIONS.find((o) => o.id === (slot.slotId ?? 'head'))?.label ?? '部位'
                  const SlotIcon = WORN_SLOT_ICONS[slot.slotId ?? 'head'] ?? Crown
                  return (
                    <div key={slot.id} className={equipRowClass}>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {canEdit ? (
                          <>
                            <EquipSlotBadge Icon={SlotIcon} label={slotLabel} />
                            <div className="flex min-w-0 flex-1 items-center gap-2 basis-[min(100%,12rem)] sm:basis-auto sm:flex-1">
                              <select
                                value={slot.slotId ?? 'head'}
                                onChange={(e) => setWornAddableSlotId(i, e.target.value)}
                                className={equipSelectClass + ' w-[4.25rem] shrink-0'}
                                title="部位"
                              >
                                {WORN_SLOT_OPTIONS.filter((o) => o.id !== 'body').map((o) => (
                                  <option key={o.id} value={o.id}>{o.label}</option>
                                ))}
                              </select>
                              <select
                                value={slot.inventoryId || ''}
                                onChange={(e) => setWornAddableEquip(i, e.target.value)}
                                className={equipSelectClass + ' min-w-0 flex-1' + (!slot.inventoryId ? ' border-dashed border-gray-600/40 text-gray-500' : '')}
                              >
                                <option value="">未装备 · 选择物品</option>
                                {options.map((e) => (
                                  <option key={e.id} value={e.id}>{getEntryDisplayName(e)}</option>
                                ))}
                              </select>
                            </div>
                            {isArmorOrShield && entry && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-gray-500 text-[10px] whitespace-nowrap">增强</span>
                                <NumberStepper
                                  compact
                                  narrow
                                  min={0}
                                  max={99}
                                  value={magicBonus}
                                  onChange={(v) => setWornMagicBonus(entry.id, String(v))}
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeWornSlot(i)}
                              className="p-1 rounded text-gray-500 hover:text-dnd-red hover:bg-red-950/30 shrink-0"
                              title="移除此身穿栏"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <AttuneToggle
                              entry={entry}
                              attunedCount={attunedCount}
                              maxAttunementSlots={maxAttunementSlots}
                              onToggle={toggleAttunedForEntry}
                            />
                          </>
                        ) : (
                          <>
                            <EquipSlotBadge Icon={SlotIcon} label={slotLabel} />
                            <span className="text-white text-sm flex-1 min-w-0 font-medium tracking-tight">{getEntryDisplayName(entry)}</span>
                            {entry?.isAttuned && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-dnd-gold-light/85">
                                <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                                同调
                              </span>
                            )}
                            {entry && isArmorOrShield && magicBonus > 0 && (
                              <span className="text-dnd-gold-light/90 text-xs font-mono shrink-0">+{magicBonus}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
              {canEdit && (
                <div className="flex items-center justify-end border-t border-gray-700/30 px-0.5 pt-2 mt-1">
                  <button type="button" onClick={addWornSlot} className={equipAddBtnClass}>
                    <Plus className="w-3.5 h-3.5" /> 添加身穿
                  </button>
                </div>
              )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* —— 背包卡：下列每一张即一件物品（次元袋也是其中一种物品卡） —— */}
        <div className={sectionCardShellClass}>
          <div className={`${cardHeadClass} flex flex-wrap items-center justify-between gap-2`}>
            <h4 className={subTitleClass + ' mb-0'}>背包</h4>
            {canEdit && (
              <>
                <button type="button" onClick={() => setAddFormOpen(true)} className="h-7 px-2 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors shrink-0">
                  添加物品
                </button>
                <ItemAddForm
                  open={addFormOpen}
                  onClose={() => setAddFormOpen(false)}
                  onSave={(entry) => {
                    onSave({ inventory: [...inv, entry] })
                    if (activityActor && character?.name) {
                      const nm = entry?.name?.trim() || '物品'
                      logTeamActivity({
                        actor: activityActor,
                        moduleId: character.moduleId ?? 'default',
                        summary: `玩家 ${activityActor} 为角色「${character.name}」的背包添加了「${nm}」`,
                      })
                    }
                    setAddFormOpen(false)
                  }}
                  submitLabel="放入背包"
                  inventory={inv}
                  spellDC={spellDC}
                  spellAttackBonus={spellAttackBonus}
                  referenceData={referenceData}
                />
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
              </>
            )}
          </div>
          <div className="p-2 space-y-2">
            <p className="text-[10px] text-dnd-text-muted leading-snug">
              拖 <span className="text-dnd-text-body">⋮</span> 或名称区排序；可拖入「次元袋」物品卡。
            </p>
            <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
              {layoutOrder.length === 0 ? (
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
                  const backpackRowGrid = isAnchor
                    ? canEdit
                      ? inventoryItemRowGridEditableWithCharge
                      : inventoryItemRowGridReadWithCharge
                    : entry?.walletCurrencyId
                      ? canEdit
                        ? inventoryItemRowGridEditableNoCharge
                        : inventoryItemRowGridReadNoCharge
                      : canEdit
                        ? showChargeCol
                          ? inventoryItemRowGridEditableWithCharge
                          : inventoryItemRowGridEditableNoCharge
                        : showChargeCol
                          ? inventoryItemRowGridReadWithCharge
                          : inventoryItemRowGridReadNoCharge
                  const walletRowOnBodyNoFunds =
                    !!entry?.walletCurrencyId &&
                    !entry?.inBagOfHolding &&
                    (entry.walletCurrencyId === 'gem_lb'
                      ? (Number(qty) || 0) <= 0
                      : Math.floor(Number(qty) || 0) <= 0)
                  const packBrief = getEntryBriefFull(entry)
                  const bbKey = entry?.id ?? `l-${layoutIdx}`
                  return (
                    <div key={entry.id ?? `inv-${i}`} className="min-w-0">
                      <div
                        data-backpack-card
                        className={`${backpackItemCardClass} ${isAnchor ? 'border-dnd-gold/35 bg-[#1b2738]/38' : ''}`}
                        onDragOver={canEdit ? handleDragOver : undefined}
                        onDrop={canEdit ? (e) => handleBackpackRowDrop(e, layoutIdx) : undefined}
                        title={
                          canEdit && isAnchor && modForAnchor && bagModuleExpanded[modForAnchor.id] === false
                            ? '折叠中：可拖到本卡将物品放入该次元袋；展开后袋内接在同一卡片下方'
                            : undefined
                        }
                      >
                        <div className={backpackRowGrid}>
                          {canEdit && (
                            <div
                              className="shrink-0 cursor-grab active:cursor-grabbing text-dnd-text-muted"
                              title="从此柄或名称区拖动排序；勿从数字、按钮起拖"
                              draggable
                              onDragStart={(e) => handleBackpackRowDragStart(e, layoutIdx)}
                              onDragEnd={handleBackpackRowDragEnd}
                            >
                              <span className="inline-flex pointer-events-none select-none p-0.5">
                                <DragHandleIcon className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          )}
                          {isAnchor && modForAnchor ? (
                            <div className={inventoryItemNameRowClass}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (e.shiftKey && inventoryItemBriefIsExpandable(packBrief)) {
                                    setBackpackItemBriefOpen((p) => ({ ...p, [bbKey]: !p[bbKey] }))
                                  } else {
                                    setBagModuleExpanded((p) => ({ ...p, [modForAnchor.id]: p[modForAnchor.id] === false }))
                                  }
                                }}
                                className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded border border-white/15 bg-[#1a2430]/70 text-gray-300 hover:bg-white/10"
                                title={
                                  inventoryItemBriefIsExpandable(packBrief)
                                    ? '单击：展开或折叠袋内；按住 Shift 再点：展开或收起物品说明'
                                    : anchorBagExpanded
                                      ? '折叠袋内'
                                      : '展开袋内'
                                }
                                aria-expanded={anchorBagExpanded}
                                aria-label={anchorBagExpanded ? '折叠袋内' : '展开袋内'}
                              >
                                {anchorBagExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" aria-hidden />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                                )}
                              </button>
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
                                  />
                                )}
                                {(() => {
                                  const activeEntry = activeAbilities.find(a => a.inventoryId === entry.id)
                                  if (!activeEntry) return null
                                  const { ability } = activeEntry
                                  return (
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        // 检查是否可用
                                        if (!canUseAbility(character, ability.id)) {
                                          alert('该技能当前不可用（可能资源不足或处于冷却中）')
                                          return
                                        }
                                        // 执行主动技能
                                        try {
                                          const result = await executeAbility(character, ability.id)
                                          if (result.success) {
                                            // 应用资源消耗和状态更新
                                            if (result.classResources) {
                                              onSave({
                                                ...character,
                                                classResources: result.classResources,
                                              })
                                            }
                                            if (result.patch) {
                                              onSave({
                                                ...character,
                                                ...result.patch,
                                              })
                                            }
                                            alert(`✅ ${ability.name} 执行成功！`)
                                          } else {
                                            alert('❌ 技能执行失败')
                                          }
                                        } catch (err) {
                                          console.error('[Equipment] 执行装备主动技能失败', err)
                                          alert('执行失败，请查看控制台')
                                        }
                                      }}
                                      className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded border border-cyan-600/70 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/40 transition-colors"
                                      title={`使用主动技能: ${ability.name}`}
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                })()}
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
                          ) : (
                            <div className={inventoryItemNameRowClass}>
                              {isContainer ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setBackpackItemBriefOpen((p) => ({ ...p, [bbKey]: !p[bbKey] }))
                                  }}
                                  className={inventoryItemBriefChevronBtnClass}
                                  title={backpackItemBriefOpen[bbKey] ? '收起容器内容' : '展开容器内容'}
                                  aria-expanded={!!backpackItemBriefOpen[bbKey]}
                                  aria-label={backpackItemBriefOpen[bbKey] ? '收起容器内容' : '展开容器内容'}
                                >
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform ${!!backpackItemBriefOpen[bbKey] ? 'rotate-180' : ''}`}
                                    aria-hidden
                                  />
                                </button>
                              ) : (
                                <InventoryItemBriefChevron
                                  brief={packBrief}
                                  expanded={!!backpackItemBriefOpen[bbKey]}
                                  onToggle={() => setBackpackItemBriefOpen((p) => ({ ...p, [bbKey]: !p[bbKey] }))}
                                />
                              )}
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
                                <span className={inventoryItemNameExtrasClass}>
                                  {(() => {
                                    const stoneEffect = Array.isArray(entry?.effects)
                                      ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer')
                                      : null
                                    const stoneVal = stoneEffect != null && stoneEffect.value != null ? Number(stoneEffect.value) : null
                                    if (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0) {
                                      return (
                                        <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
                                          {stoneVal}层
                                        </span>
                                      )
                                    }
                                    return (Number(entry.magicBonus) || 0) > 0 ? (
                                      <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                                    ) : null
                                  })()}
                                </span>
                                {hasContainedSpellEffect(entry) && (
                                  <ContainedSpellUseButton
                                    entry={entry}
                                    onChargeChange={(v) => setCharge(i, v)}
                                  />
                                )}
                              </div>
                              {/* inline charge */}
                              {showChargeCol && (
                                <span
                                  className={inventoryItemChargeCellClass}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  role="presentation"
                                >
                                  <span className="shrink-0 leading-none">充能</span>
                                  <div className="w-[5.125rem] shrink-0 max-w-full">
                                    {canEdit ? (
                                      <NumberStepper
                                        value={Number(entry.charge) || 0}
                                        onChange={(v) => setCharge(i, v)}
                                        min={0}
                                        compact
                                        pill
                                        subtle
                                      />
                                    ) : (
                                      <span className="text-dnd-text-body text-xs tabular-nums inline-block text-right w-full pr-0.5">{entry.charge}</span>
                                    )}
                                  </div>
                                </span>
                              )}
                              {/* inline qty + weight */}
                              <span className={inventoryItemQtyWeightCellClass}>
                                <div
                                  className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  role="presentation"
                                >
                                  <span className="shrink-0 leading-none">数量</span>
                                  <div className="w-[5.125rem] shrink-0 max-w-full h-6 flex items-center justify-end">
                                    {canEdit && !entry?.walletCurrencyId ? (
                                      <NumberStepper
                                        value={qty}
                                        onChange={(v) => setQty(i, v)}
                                        min={1}
                                        max={undefined}
                                        compact
                                        pill
                                        subtle
                                      />
                                    ) : (
                                      <span className="text-dnd-text-body text-xs tabular-nums inline-block text-right w-full pr-0.5">
                                        {entry?.walletCurrencyId === 'gem_lb' ? formatDisplayGemLbQty(qty) : qty}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                  {totalLb > 0 ? (
                                    <span className="text-dnd-text-body">{formatDisplayWeightLb(totalLb)} lb</span>
                                  ) : (
                                    <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                      —
                                    </span>
                                  )}
                                </div>
                              </span>
                            </div>
                          )}

                          {canEdit && (
                            <div
                              className={inventoryItemActionsCellClass}
                              onMouseDown={(e) => e.stopPropagation()}
                              role="presentation"
                            >
                              <button
                                type="button"
                                onClick={() => openStoreToVault(i)}
                                disabled={isAnchor || walletRowOnBodyNoFunds}
                                title={
                                  isAnchor
                                    ? '次元袋实体行不可整件存入仓库'
                                    : walletRowOnBodyNoFunds
                                      ? '身上该币种为 0，无法存仓库；可点垃圾桶清除此行'
                                      : '存到团队仓库'
                                }
                                className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                              >
                                <Package size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => startEdit(i)}
                                disabled={isAnchor}
                                title={isAnchor ? '袋内物品请展开后点铅笔编辑' : '编辑'}
                                className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                              >
                                <Pencil size={14} />
                              </button>
                              {isAnchor && modForAnchor ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setBagModuleDeleteUnlocked((p) => ({ ...p, [modForAnchor.id]: !p[modForAnchor.id] }))
                                    }}
                                    className={`p-1 rounded shrink-0 ${
                                      bagModuleDeleteUnlocked[modForAnchor.id]
                                        ? 'text-emerald-400 hover:bg-emerald-400/20'
                                        : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    title={
                                      bagModuleDeleteUnlocked[modForAnchor.id]
                                        ? '模块删除已解锁：点此重新上锁'
                                        : '先解锁再删整模块（与袋内单行删除不同）'
                                    }
                                    aria-label={bagModuleDeleteUnlocked[modForAnchor.id] ? '锁定模块删除' : '解锁模块删除'}
                                    aria-pressed={!!bagModuleDeleteUnlocked[modForAnchor.id]}
                                  >
                                    {bagModuleDeleteUnlocked[modForAnchor.id] ? (
                                      <Unlock size={14} aria-hidden />
                                    ) : (
                                      <Lock size={14} aria-hidden />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!bagModuleDeleteUnlocked[modForAnchor.id]}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeItem(i)
                                    }}
                                    className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                                    title={
                                      bagModuleDeleteUnlocked[modForAnchor.id]
                                        ? '删除此次元袋模块'
                                        : '请先点锁图标解锁'
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => removeItem(i)}
                                  title="移除"
                                  className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <InventoryItemBriefExpandedText
                          brief={packBrief}
                          expanded={!!backpackItemBriefOpen[bbKey]}
                          variant="body"
                        />

                        {isContainer && !!backpackItemBriefOpen[bbKey] && (
                          <div
                            className="border-t border-gray-700/45 bg-black/25 px-2 py-2 -mx-px -mb-px"
                            onDragOver={canEdit ? handleDragOver : undefined}
                            onDrop={canEdit ? (e) => handleDropIntoContainer(e, i, entry.id) : undefined}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-emerald-300/90 text-xs font-medium">容器内物品</span>
                              <span className="text-dnd-text-muted text-[10px]">
                                共 {(Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []).length} 件
                              </span>
                            </div>
                            <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
                              {(Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []).map((nested, nestedIdx) => {
                                const nestedLb = getInventoryEntryStackWeightLb(nested)
                                const nestedQty = Math.max(1, Math.floor(Number(nested?.qty) || 1))
                                const nestedCharge = Number(nested?.charge) || 0
                                const nestedHasCharge = nestedCharge > 0 || hasContainedSpellEffect(nested)
                                const nestedMagicBonus = Number(nested?.magicBonus) || 0
                                const nestedStoneEffect = Array.isArray(nested?.effects)
                                  ? nested.effects.find((e) => e.effectType === 'ac_cap_stone_layer')
                                  : null
                                const nestedStoneVal = nestedStoneEffect != null && nestedStoneEffect.value != null ? Number(nestedStoneEffect.value) : null
                                const nestedActiveEntry = activeAbilities.find(a => a.inventoryId === nested.id)
                                const nestedGridClass = canEdit
                                  ? (nestedHasCharge ? inventoryItemRowGridEditableWithCharge : inventoryItemRowGridEditableNoCharge)
                                  : (nestedHasCharge ? inventoryItemRowGridReadWithCharge : inventoryItemRowGridReadNoCharge)
                                return (
                                  <div
                                    key={nested.id ?? `nested-${nestedIdx}`}
                                    className="rounded-md border border-gray-600/40 bg-[#151c28]/60 px-2 py-1.5"
                                  >
                                    <div className={nestedGridClass}>
                                      {/* 名称列 */}
                                      <div className={inventoryItemNameRowClass}>
                                        <div className={inventoryItemNameTitleGroupClass}>
                                          <InfoTooltip
                                            content={(() => {
                                              const p = nested?.itemId ? getItemById(nested.itemId) : null
                                              return <ItemTooltipContent proto={p} entry={nested} />
                                            })()}
                                            triggerClassName={inventoryItemNameTextClass}
                                            disabled={!nested?.itemId}
                                          >
                                            <span className="break-words">{invDisplayName(nested)}</span>
                                          </InfoTooltip>
                                          <span className={inventoryItemNameExtrasClass}>
                                            {nestedStoneVal != null && !Number.isNaN(nestedStoneVal) && nestedStoneVal > 0 ? (
                                              <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
                                                {nestedStoneVal}层
                                              </span>
                                            ) : nestedMagicBonus > 0 ? (
                                              <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{nestedMagicBonus}</span>
                                            ) : null}
                                          </span>
                                          {hasContainedSpellEffect(nested) && (
                                            <ContainedSpellUseButton
                                              entry={nested}
                                              onChargeChange={(v) => {
                                                const nextNested = entry.nestedInventory.map((n, idx) =>
                                                  idx === nestedIdx ? { ...n, charge: v } : n
                                                )
                                                onSave({ inventory: inv.map((e, idx) => idx === i ? { ...e, nestedInventory: nextNested } : e) })
                                              }}
                                            />
                                          )}
                                          {nestedActiveEntry && (
                                            <button
                                              type="button"
                                              onClick={async (e) => {
                                                e.stopPropagation()
                                                if (!canUseAbility(character, nestedActiveEntry.ability.id)) {
                                                  alert('该技能当前不可用（可能资源不足或处于冷却中）')
                                                  return
                                                }
                                                try {
                                                  const result = await executeAbility(character, nestedActiveEntry.ability.id)
                                                  if (result.success) {
                                                    if (result.classResources) {
                                                      onSave({ ...character, classResources: result.classResources })
                                                    }
                                                    if (result.patch) {
                                                      onSave({ ...character, ...result.patch })
                                                    }
                                                    alert(`✅ ${nestedActiveEntry.ability.name} 执行成功！`)
                                                  } else {
                                                    alert(' 技能执行失败')
                                                  }
                                                } catch (err) {
                                                  console.error('[Equipment] 执行容器内物品主动技能失败', err)
                                                  alert('执行失败，请查看控制台')
                                                }
                                              }}
                                              className="inline-flex items-center justify-center h-6 w-6 shrink-0 rounded border border-cyan-600/70 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/40 transition-colors"
                                              title={`使用主动技能: ${nestedActiveEntry.ability.name}`}
                                            >
                                              <Sparkles className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                        {/* inline charge */}
                                        {nestedHasCharge && (
                                          <span
                                            className={inventoryItemChargeCellClass}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            role="presentation"
                                          >
                                            <span className="shrink-0 leading-none">充能</span>
                                            <div className="w-[5.125rem] shrink-0 max-w-full">
                                              {canEdit ? (
                                                <NumberStepper
                                                  value={nestedCharge}
                                                  onChange={(v) => {
                                                    const nextNested = entry.nestedInventory.map((n, idx) =>
                                                      idx === nestedIdx ? { ...n, charge: v } : n
                                                    )
                                                    onSave({ inventory: inv.map((e, idx) => idx === i ? { ...e, nestedInventory: nextNested } : e) })
                                                  }}
                                                  min={0}
                                                  compact
                                                  pill
                                                  subtle
                                                />
                                              ) : (
                                                <span className="text-dnd-text-body text-xs tabular-nums inline-block text-right w-full pr-0.5">{nestedCharge}</span>
                                              )}
                                            </div>
                                          </span>
                                        )}
                                        {/* inline qty + weight */}
                                        <span className={inventoryItemQtyWeightCellClass}>
                                          <div
                                            className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            role="presentation"
                                          >
                                            <span className="shrink-0 leading-none">数量</span>
                                            <div className="w-[5.125rem] shrink-0 max-w-full h-6 flex items-center justify-end">
                                              {canEdit ? (
                                                <NumberStepper
                                                  value={nestedQty}
                                                  onChange={(v) => setNestedQty(entry.id, nestedIdx, v)}
                                                  min={1}
                                                  compact
                                                  pill
                                                  subtle
                                                />
                                              ) : (
                                                <span className="text-dnd-text-body text-xs tabular-nums inline-block text-right w-full pr-0.5">×{nestedQty}</span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                            {nestedLb > 0 ? (
                                              <span className="text-dnd-text-body">{formatDisplayWeightLb(nestedLb)} lb</span>
                                            ) : (
                                              <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>—</span>
                                            )}
                                          </div>
                                        </span>
                                      </div>

                                      {/* 操作列 */}
                                      {canEdit && (
                                        <div
                                          className={inventoryItemActionsCellClass}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          role="presentation"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => openStoreToVaultForNested(i, nestedIdx)}
                                            title="存到团队仓库"
                                            className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                                          >
                                            <Package size={14} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingNested({ containerId: entry.id, nestedIndex: nestedIdx })}
                                            title="编辑"
                                            className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0"
                                          >
                                            <Pencil size={14} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => removeItemFromContainer(entry.id, nestedIdx)}
                                            title="取出到背包"
                                            className="p-1 rounded text-dnd-red hover:bg-dnd-red/20 shrink-0"
                                          >
                                            <ArrowUpFromLine size={14} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
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

                        {isAnchor && modForAnchor && modIndexAnchor >= 0 && anchorBagExpanded ? (
                          <div
                            className="border-t border-gray-700/45 bg-black/25 px-2 py-2 -mx-px -mb-px"
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
                              expanded
                              onToggleExpanded={() => {}}
                              hideModuleChrome
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
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
    </div>
  )
}
