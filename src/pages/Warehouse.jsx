import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Package, Pencil, Trash2, ChevronRight, ChevronDown, Lock, Unlock } from 'lucide-react'
import DragHandleIcon from '../components/DragHandleIcon'
import { normalizeBagOfHoldingVisibility } from '../lib/bagOfHoldingVisibility'
import {
  getNormalizedBagModules,
  entryBelongsToBagModule,
  compareBagInventoryDisplayOrder,
  applyBagItemPatch,
  mergeWalletDelta,
  MAX_BAG_OF_HOLDING_TOTAL,
} from '../lib/bagOfHoldingModules'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { logTeamActivity } from '../lib/activityLog'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { isFormulaValue, formatFormulaLabel } from '../lib/formulas'
import {
  getWarehouse,
  getArcaneChestCount,
  setArcaneChestCount,
  loadWarehouseIntoCache,
  addToWarehouse,
  addWarehouseCurrencyStack,
  removeFromWarehouse,
  updateWarehouseItem,
  reorderWarehouse,
  setWarehouse,
  moveWarehouseTopLevelIntoNestedBag,
  moveWarehouseTopLevelIntoNestedBagAtPath,
  moveWarehouseNestedPathToTopLevel,
  moveWarehouseNestedPathIntoNestedBagAtPath,
  moveWarehouseNestedPathToFlatPosition,
  patchWarehouseNestedItem,
} from '../lib/warehouseStore'
import {
  ARCANE_CHEST_VOLUME_CU_FT_PER_BOX,
  estimateArcaneChestVolumeCuFtFromWeightLb,
  estimateArcaneChestWeightLbFromVolumeCuFt,
  getArcaneChestTotalCapacityCuFt,
} from '../lib/arcaneChestCapacity'
import { migrateLegacyTeamVaultIntoArcaneChest } from '../lib/teamCurrencyPublicBags'
import { getCraftingProjects, updateCraftingProject } from '../lib/craftingStore'
import {
  normalizeProject,
  isCraftFeeClaimed,
  isCraftDeposited,
  DND_CRAFT_COMPLETED_MIME,
  parseCraftCompletedDragPayload,
} from '../lib/craftingProjectUtils'
import { getAllCharacters, updateCharacter, getCharacter } from '../lib/characterStore'
import {
  getItemWeightLb,
  parseWeightString,
  getWalletCurrencyStackWeightLb,
  formatDisplayWeightLb,
  formatDisplayGemLbQty,
  formatDisplayOneDecimal,
  getInventoryEntryStackWeightLb,
  getBagOfHoldingSelfWeightLb,
} from '../lib/encumbrance'
import ItemAddForm from '../components/ItemAddForm'
import CurrencyPanel from '../components/CurrencyPanel'
import MagicCraftingPanel from '../components/MagicCraftingPanel'
import TeamWarehouseTopBar from '../components/TeamWarehouseTopBar'
import { NumberStepper } from '../components/BuffForm'
import { inputClass } from '../lib/inputStyles'
import { appendContainedSpellsBrief } from '../lib/containedSpellBrief'
import { hasContainedSpellEffect } from '../lib/containedSpellModel'
import ContainedSpellUseButton from '../components/ContainedSpellUseButton'
import { TOPBAR_BACK_ARROW_CLASS, TOPBAR_BACK_LINK_CLASS } from '../lib/topBarShared'
import {
  inventoryItemActionsCellClass,
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
  inventoryItemBriefIsExpandable,
} from '../lib/inventoryItemCardStyles'
import { InventoryItemBriefChevron, InventoryItemBriefExpandedText } from '../components/InventoryItemCardBrief'

const subTitleClass = 'text-dnd-gold-light text-xs font-bold uppercase tracking-wider'
/** 与角色卡「装备与背包」分区一致：背包卡 / 物品卡 */
const teamOuterShellClass =
  'rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)]'
const teamSectionCardShellClass =
  'rounded-xl border border-gray-500/55 bg-[#141c28]/90 overflow-hidden shadow-sm shadow-black/25'
const teamCardHeadClass = 'px-2.5 py-1 border-b border-gray-600/70 bg-gray-800/45'
/** 与角色卡 `EquipmentAndInventory` 背包分区：袋内类型卡标题 */
const nestedCardClass = 'rounded-lg border border-gray-600/50 bg-[#1a2430]/50 overflow-hidden min-w-0'
/** 团队仓库物品卡（与 inventoryItemCardStyles 一致） */
const teamBackpackItemCardClass = inventoryItemCardShellClass
const teamBagRowGrid = inventoryItemRowGridEditableWithCharge

/** 秘法箱 ↔ 公家袋 转移时复制袋内结构，避免共享引用导致一侧清空另一侧丢内容 */
function cloneBagNestedInventory(nested) {
  if (!Array.isArray(nested)) return []
  try {
    return JSON.parse(JSON.stringify(nested))
  } catch {
    return []
  }
}

/** 安全解析数量：处理带逗号的字符串（如 "1,000"） */
function safeParseQty(qty) {
  const raw = typeof qty === 'string' ? qty.replace(/,/g, '') : qty
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** 秘法箱袋内一件（非钱币）→ 角色公家袋 inventory 一行 */
function mapWarehouseNestedItemToPublicBagRow(child, bagModuleId) {
  const proto = child.itemId ? getItemById(child.itemId) : null
  return {
    id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
    itemId: child.itemId ?? undefined,
    name: (child.name && String(child.name).trim()) || (proto ? getItemDisplayName(proto) : '—'),
    攻击: child.攻击 ?? '',
    伤害: child.伤害 ?? '',
    详细介绍: child.详细介绍 != null ? String(child.详细介绍) : '',
    附注: child.附注 != null ? String(child.附注) : '',
    攻击距离: child.攻击距离 ?? undefined,
    攻击范围: child.攻击范围 ?? undefined,
    精通: child.精通 ?? undefined,
    重量: child.重量 ?? proto?.重量,
    rarity: child.rarity ?? undefined,
    qty: Math.max(1, Number(child.qty) ?? 1),
    isAttuned: !!child.isAttuned,
    magicBonus: Number(child.magicBonus) || 0,
    charge: Number(child.charge) || 0,
    spellDC: child.spellDC != null ? Number(child.spellDC) : undefined,
    effects: Array.isArray(child.effects) ? child.effects : undefined,
    爆炸半径: child.爆炸半径 != null ? Number(child.爆炸半径) : undefined,
    inBagOfHolding: true,
    bagModuleId,
    bagSlotId: undefined,
  }
}

/**
 * 秘法箱次元袋用 nestedInventory；角色公家袋用扁平 inventory。将 nested 展开为袋内多行（钱币按币种合并）。
 */
function appendWarehouseNestedToPublicBag(inv, mods, mod, nestedSrc) {
  const nested = Array.isArray(nestedSrc) ? cloneBagNestedInventory(nestedSrc) : []
  const modId = mod.id

  function mergeCurrency(cid, rawQty) {
    const q =
      cid === 'gem_lb' ? Math.max(0, Number(rawQty) || 0) : Math.max(0, Math.floor(Number(rawQty) || 0))
    if (q <= 0) return
    const cfg = getCurrencyById(cid)
    const label = cfg ? getCurrencyDisplayName(cfg) : cid
    const mergeIdx = inv.findIndex(
      (e) => e?.walletCurrencyId === cid && e.inBagOfHolding && entryBelongsToBagModule(e, mod, mods),
    )
    if (mergeIdx >= 0) {
      const e = inv[mergeIdx]
      const prev = cid === 'gem_lb' ? Math.max(0, safeParseQty(e.qty)) : Math.max(0, Math.floor(safeParseQty(e.qty)))
      const nextQty = cid === 'gem_lb' ? Math.round((prev + q) * 10) / 10 : prev + q
      inv[mergeIdx] = { ...e, qty: nextQty, name: label || e.name }
    } else {
      inv.push({
        id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        walletCurrencyId: cid,
        name: label,
        qty: q,
        inBagOfHolding: true,
        bagModuleId: modId,
      })
    }
  }

  function walk(nodes) {
    if (!Array.isArray(nodes)) return
    for (const raw of nodes) {
      if (!raw || typeof raw !== 'object') continue
      if (raw.walletCurrencyId) {
        mergeCurrency(raw.walletCurrencyId, raw.qty)
        continue
      }
      if (raw.itemId === 'bag_of_holding') {
        const proto = getItemById('bag_of_holding')
        const nm = (raw.name && String(raw.name).trim()) || (proto ? getItemDisplayName(proto) : '—')
        inv.push({
          id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          itemId: 'bag_of_holding',
          name: nm,
          攻击: raw.攻击 ?? '',
          伤害: raw.伤害 ?? '',
          详细介绍: raw.详细介绍 != null ? String(raw.详细介绍) : '',
          附注: raw.附注 != null ? String(raw.附注) : '',
          攻击距离: raw.攻击距离 ?? undefined,
          攻击范围: raw.攻击范围 ?? undefined,
          精通: raw.精通 ?? undefined,
          重量: raw.重量 ?? proto?.重量,
          rarity: raw.rarity ?? undefined,
          qty: Math.max(1, Math.floor(Number(raw.qty) || 1)),
          isAttuned: !!raw.isAttuned,
          magicBonus: Number(raw.magicBonus) || 0,
          charge: Number(raw.charge) || 0,
          spellDC: raw.spellDC != null ? Number(raw.spellDC) : undefined,
          effects: Array.isArray(raw.effects) ? raw.effects : undefined,
          爆炸半径: raw.爆炸半径 != null ? Number(raw.爆炸半径) : undefined,
          nestedInventory: [],
          inBagOfHolding: true,
          bagModuleId: modId,
          bagSlotId: undefined,
        })
        walk(raw.nestedInventory)
        continue
      }
      inv.push(mapWarehouseNestedItemToPublicBagRow(raw, modId))
    }
  }

  walk(nested)
}

/** 秘法箱袋内一件 → 角色背包 inventory 一行（非袋内） */
function mapWarehouseNestedItemToBackpackRow(child) {
  const proto = child.itemId ? getItemById(child.itemId) : null
  return {
    id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
    itemId: child.itemId ?? undefined,
    name: (child.name && String(child.name).trim()) || (proto ? getItemDisplayName(proto) : '—'),
    攻击: child.攻击 ?? '',
    伤害: child.伤害 ?? '',
    详细介绍: child.详细介绍 != null ? String(child.详细介绍) : '',
    附注: child.附注 != null ? String(child.附注) : '',
    攻击距离: child.攻击距离 ?? undefined,
    攻击范围: child.攻击范围 ?? undefined,
    精通: child.精通 ?? undefined,
    重量: child.重量 ?? proto?.重量,
    rarity: child.rarity ?? undefined,
    qty: Math.max(1, Number(child.qty) ?? 1),
    isAttuned: !!child.isAttuned,
    magicBonus: Number(child.magicBonus) || 0,
    charge: Number(child.charge) || 0,
    spellDC: child.spellDC != null ? Number(child.spellDC) : undefined,
    effects: Array.isArray(child.effects) ? child.effects : undefined,
    爆炸半径: child.爆炸半径 != null ? Number(child.爆炸半径) : undefined,
    inBagOfHolding: false,
    bagModuleId: undefined,
    bagSlotId: undefined,
  }
}

export default function Warehouse() {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const [list, setList] = useState([])
  /** 与仓库持久化同步；秘法箱每箱 12 尺³ 上限见 arcaneChestCapacity */
  const [arcaneChestQty, setArcaneChestQty] = useState(1)
  const [addFormOpen, setAddFormOpen] = useState(false)
  /** 存入角色弹窗：秘法箱行 | 公家次元袋内物品行 */
  const [depositContext, setDepositContext] = useState(null)
  const [depositCharId, setDepositCharId] = useState('')
  const [depositQty, setDepositQty] = useState(1)
  const [depositTargetBagModuleId, setDepositTargetBagModuleId] = useState('')
  /** 编辑公家次元袋内物品（与秘法箱编辑分离） */
  const [bagItemEdit, setBagItemEdit] = useState(null)
  const [isDepositing, setIsDepositing] = useState(false)
  const [transferHint, setTransferHint] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [charRefresh, setCharRefresh] = useState(0)
  /** 秘法箱内「次元袋」卡展开袋内物品：`entryId` 或顶层 `index` → boolean */
  const [arcaneBagExpanded, setArcaneBagExpanded] = useState({})
  /** 与角色卡次元袋锚点行一致：解锁后才可删除整行次元袋 */
  const [arcaneBagDeleteUnlocked, setArcaneBagDeleteUnlocked] = useState({})
  /** 团队仓库物品卡详情：默认折叠，点 chevron 展开（与次元袋、背包一致） */
  const [warehouseItemBriefOpen, setWarehouseItemBriefOpen] = useState({})

  const characters = useMemo(() => {
    void charRefresh
    return getAllCharacters(currentModuleId)
  }, [currentModuleId, charRefresh])

  /** 公家且有个数>0 的次元袋模块（角色 + 模块） */
  const publicBagTargets = useMemo(() => {
    const out = []
    for (const c of characters) {
      const mods = getNormalizedBagModules(c)
      for (const mod of mods) {
        if (normalizeBagOfHoldingVisibility(mod.visibility) !== 'public') continue
        if ((mod.bagCount || 0) <= 0) continue
        out.push({ character: c, mod })
      }
    }
    return out
  }, [characters])

  useEffect(() => {
    const h = () => setCharRefresh((x) => x + 1)
    window.addEventListener('dnd-realtime-characters', h)
    return () => window.removeEventListener('dnd-realtime-characters', h)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await loadWarehouseIntoCache(currentModuleId)
      await migrateLegacyTeamVaultIntoArcaneChest(currentModuleId)
      if (!cancelled) {
        setList(getWarehouse(currentModuleId))
        setArcaneChestQty(getArcaneChestCount(currentModuleId))
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentModuleId])

  useEffect(() => {
    const h = () => {
      loadWarehouseIntoCache(currentModuleId).then(() => {
        setList(getWarehouse(currentModuleId))
        setArcaneChestQty(getArcaneChestCount(currentModuleId))
      })
    }
    window.addEventListener('dnd-realtime-warehouse', h)
    return () => window.removeEventListener('dnd-realtime-warehouse', h)
  }, [currentModuleId])

  const refreshList = () => {
    setList(getWarehouse(currentModuleId))
    setArcaneChestQty(getArcaneChestCount(currentModuleId))
  }

  /** 公家次元袋内钱币堆整堆 → 秘法箱实物堆（与货币与金库合计一致） */
  function moveBagCurrencyToWarehouse(charId, invIdx) {
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    const entry = ch.inventory[invIdx]
    if (!entry?.inBagOfHolding || !entry.walletCurrencyId) return
    const mods = getNormalizedBagModules(ch)
    const inPublicBag = mods.some(
      (mod) =>
        normalizeBagOfHoldingVisibility(mod.visibility) === 'public' &&
        (mod.bagCount || 0) > 0 &&
        entryBelongsToBagModule(entry, mod, mods),
    )
    if (!inPublicBag) {
      alert('仅能将公家次元袋内的钱币堆拖入秘法箱。')
      return
    }
    const cid = entry.walletCurrencyId
    const rawQty = typeof entry.qty === 'string' ? entry.qty.replace(/,/g, '') : entry.qty
    const q =
      cid === 'gem_lb' ? Math.max(0, Number(rawQty) || 0) : Math.max(0, Math.floor(Number(rawQty) || 0))
    if (q <= 0) {
      alert('钱币数量无效或为零，无法移入秘法箱')
      return
    }
    const cfg = getCurrencyById(cid)
    const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
    const nextInv = ch.inventory.filter((_, i) => i !== invIdx)
    setTransferHint('钱币移入秘法箱…')
    Promise.resolve(addWarehouseCurrencyStack(currentModuleId, cid, q))
      .then((result) => {
        if (!result?.success) {
          alert(result?.error || '移入秘法箱失败，请重试')
          return Promise.reject(new Error('add-warehouse-currency'))
        }
        return updateCharacter(charId, { inventory: nextInv })
      })
      .then(() => {
        refreshList()
        setCharRefresh((x) => x + 1)
        window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将「${ch.name || '未命名'}」公家次元袋内的「${label}」移入秘法箱`,
          })
        }
      })
      .catch((err) => {
        if (err?.message !== 'add-warehouse-currency') {
          console.error('[Warehouse] 公家袋钱币移入秘法箱失败', err)
          alert('移入失败，请重试')
        }
      })
      .finally(() => setTransferHint(''))
  }

  /** 公家次元袋行 → 秘法箱（与角色背包拖动物品逻辑一致：使用独立 MIME + copyMove） */
  function moveBagItemToWarehouse(charId, invIdx) {
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    const entry = ch.inventory[invIdx]
    if (!entry?.inBagOfHolding) return
    if (entry.walletCurrencyId) {
      moveBagCurrencyToWarehouse(charId, invIdx)
      return
    }
    const qty = Math.max(1, safeParseQty(entry.qty) || 1)
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    const nm = (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—')
    const whPayload = {
      itemId: entry.itemId ?? undefined,
      name: nm,
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
      附注: entry.附注 != null ? String(entry.附注) : '',
      攻击距离: entry.攻击距离 ?? undefined,
      攻击范围: entry.攻击范围 ?? undefined,
      精通: entry.精通 ?? undefined,
      重量: entry.重量 ?? proto?.重量,
      rarity: entry.rarity ?? undefined,
      qty,
      isAttuned: Boolean(entry.isAttuned),
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
      effects: Array.isArray(entry.effects) ? entry.effects : undefined,
      爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
      ...(entry.itemId === 'bag_of_holding'
        ? {
            nestedInventory: cloneBagNestedInventory(entry.nestedInventory),
            ...(entry.bagModuleId
              ? { arcaneBagLink: { characterId: charId, moduleId: entry.bagModuleId } }
              : {}),
          }
        : {}),
    }
    const nextInv = ch.inventory.filter((_, i) => i !== invIdx)
    Promise.resolve(updateCharacter(charId, { inventory: nextInv }))
      .then(() => addToWarehouse(currentModuleId, whPayload))
      .then(() => {
        refreshList()
        setCharRefresh((x) => x + 1)
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将「${ch.name || '未命名'}」公家次元袋中的「${nm}」移入秘法箱`,
          })
        }
      })
      .catch((err) => {
        console.error('[Warehouse] 次元袋物品移入秘法箱失败', err)
        alert('移入失败，请重试')
      })
  }

  const handleRemove = (i) => {
    Promise.resolve(removeFromWarehouse(currentModuleId, i)).then(refreshList)
  }

  const reorderList = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setEditingIndex(null)
    Promise.resolve(reorderWarehouse(currentModuleId, fromIndex, toIndex)).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  /** 同名物品（显示名称一致）可合并数量；钱币堆按 walletCurrencyId */
  const isSameItemForMerge = (a, b) => {
    if (!a || !b) return false
    if (a.itemId === 'bag_of_holding' && b.itemId === 'bag_of_holding') return false
    if (a.walletCurrencyId && b.walletCurrencyId) return a.walletCurrencyId === b.walletCurrencyId
    return displayName(a) === displayName(b)
  }

  /** 与 wb: 区分，避免 plain 被误解析 */
  const WAREHOUSE_PLAIN_PREFIX = 'dnd-wh:'
  const WAREHOUSE_NESTED_DRAG_MIME = 'text/dnd-warehouse-nested'
  const WAREHOUSE_NESTED_PLAIN_PREFIX = 'dnd-wh-nested:'

  const parseWarehouseNestedDragPayload = (dataTransfer) => {
    const raw = dataTransfer.getData(WAREHOUSE_NESTED_DRAG_MIME)
    if (raw) {
      try {
        const o = JSON.parse(raw)
        if (
          o &&
          typeof o.topBagIndex === 'number' &&
          !Number.isNaN(o.topBagIndex) &&
          Array.isArray(o.path) &&
          o.path.length > 0 &&
          o.path.every((x) => typeof x === 'number' && !Number.isNaN(x))
        ) {
          return { topBagIndex: o.topBagIndex, path: o.path }
        }
      } catch (_) {}
    }
    const plain = (dataTransfer.getData('text/plain') || '').trim()
    if (plain.startsWith(WAREHOUSE_NESTED_PLAIN_PREFIX)) {
      const rest = plain.slice(WAREHOUSE_NESTED_PLAIN_PREFIX.length)
      const colon = rest.indexOf(':')
      if (colon <= 0) return null
      const top = parseInt(rest.slice(0, colon), 10)
      const pathStr = rest.slice(colon + 1)
      const path = pathStr ? pathStr.split('.').map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n)) : []
      if (!Number.isNaN(top) && path.length > 0) return { topBagIndex: top, path }
    }
    return null
  }

  const parseWarehouseDragIndex = (dataTransfer) => {
    const custom = dataTransfer.getData('text/dnd-warehouse-index')
    if (custom != null && custom !== '') {
      const n = parseInt(custom, 10)
      if (!Number.isNaN(n)) return n
    }
    const plain = (dataTransfer.getData('text/plain') || '').trim()
    if (plain.startsWith(WAREHOUSE_PLAIN_PREFIX)) {
      const n = parseInt(plain.slice(WAREHOUSE_PLAIN_PREFIX.length), 10)
      return Number.isNaN(n) ? null : n
    }
    if (/^\d+$/.test(plain)) return parseInt(plain, 10)
    return null
  }

  /** 公家次元袋接拖：copyMove 下用 move 更易被浏览器接受放下 */
  const dragOverPublicBagZone = (e) => {
    e.preventDefault()
    const dt = e.dataTransfer
    if (dt.effectAllowed === 'copyMove' || dt.effectAllowed === 'all' || dt.effectAllowed === 'move' || dt.effectAllowed === 'linkMove') {
      dt.dropEffect = 'move'
    } else if (dt.effectAllowed === 'copy') {
      dt.dropEffect = 'copy'
    } else {
      dt.dropEffect = 'move'
    }
  }

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/dnd-warehouse-index', String(index))
    e.dataTransfer.setData('text/plain', `${WAREHOUSE_PLAIN_PREFIX}${index}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    e.currentTarget.classList.add('opacity-50')
  }
  const handleDragEnd = (e) => e.currentTarget.classList.remove('opacity-50')

  const handleNestedArcaneDragStart = (e, topBagIndex, path) => {
    e.stopPropagation()
    e.dataTransfer.setData(WAREHOUSE_NESTED_DRAG_MIME, JSON.stringify({ topBagIndex, path }))
    e.dataTransfer.setData('text/plain', `${WAREHOUSE_NESTED_PLAIN_PREFIX}${topBagIndex}:${path.join('.')}`)
    e.dataTransfer.effectAllowed = 'move'
    const el = e.currentTarget.closest('[data-arcane-nested-row]') ?? e.currentTarget
    el.classList.add('opacity-50')
  }
  const handleNestedArcaneDragEnd = (e) => {
    const el = e.currentTarget.closest('[data-arcane-nested-row]') ?? e.currentTarget
    el.classList.remove('opacity-50')
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    const dt = e.dataTransfer
    if (dt.effectAllowed === 'copyMove' || dt.effectAllowed === 'all') {
      dt.dropEffect = 'move'
    } else {
      dt.dropEffect = 'move'
    }
  }
  /** 秘法箱顶层：拖到指定行 → 与目标同名则合并数量与充能，否则插入到该位置（与角色背包表行拖放一致） */
  const mergeOrReorderWarehouseTopLevel = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return
    const source = list[fromIndex]
    const target = list[toIndex]
    if (isSameItemForMerge(source, target)) {
      setEditingIndex(null)
      const isGem = source.walletCurrencyId === 'gem_lb'
      const isCur = Boolean(source.walletCurrencyId)
      const qtyT = isCur
        ? (isGem ? Math.max(0, Number(target?.qty) || 0) : Math.max(0, Math.floor(Number(target?.qty) || 0)))
        : Math.max(1, Number(target?.qty) ?? 1)
      const qtyS = isCur
        ? (isGem ? Math.max(0, Number(source?.qty) || 0) : Math.max(0, Math.floor(Number(source?.qty) || 0)))
        : Math.max(1, Number(source?.qty) ?? 1)
      const mergedQty = isCur && isGem ? Math.round((qtyT + qtyS) * 10) / 10 : isCur ? qtyT + qtyS : qtyT + qtyS
      const chargeT = Number(target?.charge) || 0
      const chargeS = Number(source?.charge) || 0
      const merged = { ...target, qty: mergedQty, charge: chargeT + chargeS }
      const next = list.filter((_, i) => i !== fromIndex)
      const mergeIdx = fromIndex < toIndex ? toIndex - 1 : toIndex
      next[mergeIdx] = merged
      Promise.resolve(setWarehouse(currentModuleId, next)).then(refreshList)
      return
    }
    reorderList(fromIndex, toIndex)
  }

  /** 释放在底部重排区：移到列表末尾；末尾同名则合并 */
  const mergeOrMoveWarehouseItemToEnd = (fromIndex) => {
    if (list.length <= 1) return
    const lastIdx = list.length - 1
    if (fromIndex === lastIdx) return
    mergeOrReorderWarehouseTopLevel(fromIndex, lastIdx)
  }

  /** 释放在秘法箱某一顶层物品卡上：重排或合并（不替代「拖入内袋」——内袋区单独 onDrop） */
  const handleDropOnArcaneTopRow = (e, toIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const wbChar = e.dataTransfer.getData('text/dnd-warehouse-bag-char')
    const wbInvRaw = e.dataTransfer.getData('text/dnd-warehouse-bag-inv')
    if (wbChar && wbInvRaw !== '') return
    const bagSrcChar = e.dataTransfer.getData('text/dnd-bag-source-char-id')
    const fromBag = e.dataTransfer.getData('text/dnd-from-bag') === '1'
    if (bagSrcChar && fromBag) {
      const invIdx = parseInt(e.dataTransfer.getData('text/dnd-character-inv'), 10)
      if (!Number.isNaN(invIdx)) moveBagItemToWarehouse(bagSrcChar, invIdx)
      return
    }
    const nestedSrc = parseWarehouseNestedDragPayload(e.dataTransfer)
    if (nestedSrc) {
      Promise.resolve(
        moveWarehouseNestedPathToFlatPosition(currentModuleId, nestedSrc.topBagIndex, nestedSrc.path, toIndex),
      ).then(refreshList)
      return
    }
    const fromIndex = parseWarehouseDragIndex(e.dataTransfer)
    if (fromIndex == null || fromIndex < 0 || fromIndex >= list.length) return
    mergeOrReorderWarehouseTopLevel(fromIndex, toIndex)
  }

  /** 秘法箱整块拖放区：次元袋→仓库；栏内物品→末尾/合并 */
  const handleWarehouseTableDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const wbChar = e.dataTransfer.getData('text/dnd-warehouse-bag-char')
    const wbInvRaw = e.dataTransfer.getData('text/dnd-warehouse-bag-inv')
    const bagSrcChar = e.dataTransfer.getData('text/dnd-bag-source-char-id')
    const fromBag = e.dataTransfer.getData('text/dnd-from-bag') === '1'
    let charId = ''
    let invIdx = NaN
    if (wbChar && wbInvRaw !== '') {
      charId = wbChar
      invIdx = parseInt(wbInvRaw, 10)
    } else if (bagSrcChar && fromBag) {
      charId = bagSrcChar
      invIdx = parseInt(e.dataTransfer.getData('text/dnd-character-inv'), 10)
    }
    if (charId && !Number.isNaN(invIdx)) {
      moveBagItemToWarehouse(charId, invIdx)
      return
    }
    const nestedToTop = parseWarehouseNestedDragPayload(e.dataTransfer)
    if (nestedToTop) {
      Promise.resolve(moveWarehouseNestedPathToTopLevel(currentModuleId, nestedToTop.topBagIndex, nestedToTop.path)).then(
        refreshList,
      )
      return
    }
    const fromIndex = parseWarehouseDragIndex(e.dataTransfer)
    if (fromIndex == null || fromIndex < 0 || fromIndex >= list.length) return
    mergeOrMoveWarehouseItemToEnd(fromIndex)
  }

  const setQty = (i, value) => {
    const entry = list[i]
    if (entry?.walletCurrencyId === 'gem_lb') {
      const n = Math.max(0, Number(value) || 0)
      const rounded = Math.round(n * 10) / 10
      if (rounded <= 0) {
        Promise.resolve(removeFromWarehouse(currentModuleId, i)).then((next) => { if (next != null) setList(next); else refreshList() })
        return
      }
      Promise.resolve(updateWarehouseItem(currentModuleId, i, { qty: rounded })).then((next) => { if (next != null) setList(next); else refreshList() })
      return
    }
    if (entry?.walletCurrencyId) {
      const n = Math.max(0, Math.floor(Number(value) || 0))
      if (n <= 0) {
        Promise.resolve(removeFromWarehouse(currentModuleId, i)).then((next) => { if (next != null) setList(next); else refreshList() })
        return
      }
      Promise.resolve(updateWarehouseItem(currentModuleId, i, { qty: n })).then((next) => { if (next != null) setList(next); else refreshList() })
      return
    }
    if (entry?.itemId === 'bag_of_holding') {
      const n = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(value) || 0)))
      Promise.resolve(updateWarehouseItem(currentModuleId, i, { qty: n })).then((next) => {
        if (next != null) setList(next)
        else refreshList()
      })
      return
    }
    const n = Math.max(1, parseInt(value, 10) || 1)
    Promise.resolve(updateWarehouseItem(currentModuleId, i, { qty: n })).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  const setCharge = (i, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0)
    Promise.resolve(updateWarehouseItem(currentModuleId, i, { charge: n })).then((next) => { if (next != null) setList(next); else refreshList() })
  }

  const startEdit = (i) => {
    if (list[i]) setEditingIndex(i)
  }

  const applyEditSave = (entry) => {
    if (editingIndex == null) return
    Promise.resolve(updateWarehouseItem(currentModuleId, editingIndex, entry)).then(() => { refreshList(); setEditingIndex(null) })
  }

  const buildInvEntryForCharacter = (entry, q) => {
    if (entry?.walletCurrencyId) {
      const cfg = getCurrencyById(entry.walletCurrencyId)
      const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
      const qty = entry.walletCurrencyId === 'gem_lb' ? Math.max(0, safeParseQty(q)) : Math.max(0, Math.floor(safeParseQty(q)))
      return {
        id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        walletCurrencyId: entry.walletCurrencyId,
        name: label,
        qty,
        inBagOfHolding: false,
      }
    }
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    return {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      itemId: entry.itemId ?? undefined,
      name: (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—'),
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
      附注: entry.附注 != null ? String(entry.附注) : '',
      攻击距离: entry.攻击距离 ?? undefined,
      攻击范围: entry.攻击范围 ?? undefined,
      精通: entry.精通 ?? undefined,
      重量: entry.重量 ?? proto?.重量,
      rarity: entry.rarity ?? undefined,
      qty: q,
      isAttuned: Boolean(entry.isAttuned),
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
      effects: Array.isArray(entry.effects) ? entry.effects : undefined,
      爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
      inBagOfHolding: false,
      bagModuleId: undefined,
      bagSlotId: undefined,
    }
  }

  /** 秘法箱带内袋的次元袋 → 存入角色背包：外壳一行 + 内物扁平（钱币进 wallet，与 syncWalletCurrencyEntries 一致） */
  const expandWarehouseBagForBackpack = (char, entry, q) => {
    const inv = [...(char.inventory || [])]
    let wallet = { ...(char.wallet || {}) }
    inv.push(buildInvEntryForCharacter({ ...entry, nestedInventory: [] }, q))
    const nested = cloneBagNestedInventory(entry.nestedInventory)
    function walk(nodes) {
      if (!Array.isArray(nodes)) return
      for (const raw of nodes) {
        if (!raw || typeof raw !== 'object') continue
        if (raw.walletCurrencyId) {
          const cid = raw.walletCurrencyId
          const add =
            cid === 'gem_lb' ? Math.max(0, Number(raw.qty) || 0) : Math.max(0, Math.floor(Number(raw.qty) || 0))
          if (add > 0) wallet = mergeWalletDelta(wallet, { [cid]: add })
          continue
        }
        if (raw.itemId === 'bag_of_holding') {
          const proto = getItemById('bag_of_holding')
          inv.push({
            id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            itemId: 'bag_of_holding',
            name: (raw.name && String(raw.name).trim()) || (proto ? getItemDisplayName(proto) : '—'),
            攻击: raw.攻击 ?? '',
            伤害: raw.伤害 ?? '',
            详细介绍: raw.详细介绍 != null ? String(raw.详细介绍) : '',
            附注: raw.附注 != null ? String(raw.附注) : '',
            攻击距离: raw.攻击距离 ?? undefined,
            攻击范围: raw.攻击范围 ?? undefined,
            精通: raw.精通 ?? undefined,
            重量: raw.重量 ?? proto?.重量,
            rarity: raw.rarity ?? undefined,
            qty: Math.max(1, Math.floor(Number(raw.qty) || 1)),
            isAttuned: !!raw.isAttuned,
            magicBonus: Number(raw.magicBonus) || 0,
            charge: Number(raw.charge) || 0,
            spellDC: raw.spellDC != null ? Number(raw.spellDC) : undefined,
            effects: Array.isArray(raw.effects) ? raw.effects : undefined,
            爆炸半径: raw.爆炸半径 != null ? Number(raw.爆炸半径) : undefined,
            nestedInventory: [],
            inBagOfHolding: false,
            bagModuleId: undefined,
            bagSlotId: undefined,
          })
          walk(raw.nestedInventory)
          continue
        }
        inv.push(mapWarehouseNestedItemToBackpackRow(raw))
      }
    }
    walk(nested)
    return { inventory: inv, wallet }
  }

  const openDeposit = (i) => {
    const e = list[i]
    if (!e) return
    setDepositContext({ type: 'warehouse', index: i })
    setDepositCharId(characters[0]?.id ?? '')
    setDepositTargetBagModuleId('')
    if (e.walletCurrencyId === 'gem_lb') {
      const gq = Math.round(Math.max(0, safeParseQty(e.qty)) * 10) / 10
      if (gq <= 0) return
      setDepositQty(gq)
    } else if (e.walletCurrencyId) {
      const fq = Math.floor(safeParseQty(e.qty))
      if (fq <= 0) return
      setDepositQty(fq)
    } else {
      setDepositQty(1)
    }
  }

  const openDepositFromPublicBag = (sourceCharId, invIdx) => {
    const ch = getCharacter(sourceCharId)
    const e = ch?.inventory?.[invIdx]
    if (!e) return
    setDepositContext({ type: 'bag', sourceCharId, invIdx })
    setDepositCharId(characters[0]?.id ?? '')
    setDepositTargetBagModuleId('')
    if (e.walletCurrencyId === 'gem_lb') {
      const gq = Math.round(Math.max(0, safeParseQty(e.qty)) * 10) / 10
      if (gq <= 0) return
      setDepositQty(gq)
    } else if (e.walletCurrencyId) {
      const fq = Math.floor(safeParseQty(e.qty))
      if (fq <= 0) return
      setDepositQty(fq)
    } else {
      setDepositQty(1)
    }
  }

  const openDepositFromNestedBag = (topBagIndex, path) => {
    const bag = list[topBagIndex]
    if (!bag || bag.itemId !== 'bag_of_holding') return
    let current = bag
    for (const key of path) {
      if (!current.nestedInventory || !Array.isArray(current.nestedInventory)) return
      current = current.nestedInventory[key]
      if (!current) return
    }
    const entry = current
    if (!entry) return
    setDepositContext({ type: 'nested', topBagIndex, path })
    setDepositCharId(characters[0]?.id ?? '')
    setDepositTargetBagModuleId('')
    if (entry.walletCurrencyId === 'gem_lb') {
      const gq = Math.round(Math.max(0, safeParseQty(entry.qty)) * 10) / 10
      if (gq <= 0) return
      setDepositQty(gq)
    } else if (entry.walletCurrencyId) {
      const fq = Math.floor(safeParseQty(entry.qty))
      if (fq <= 0) return
      setDepositQty(fq)
    } else {
      setDepositQty(1)
    }
  }

  const closeDepositModal = () => {
    setDepositContext(null)
    setDepositCharId('')
    setDepositQty(1)
    setDepositTargetBagModuleId('')
  }

  const confirmDeposit = () => {
    if (!depositContext || !depositCharId || isDepositing) return
    const char = characters.find((c) => c.id === depositCharId)
    if (!char) {
      closeDepositModal()
      return
    }

    if (depositContext.type === 'warehouse') {
      const depositIndex = depositContext.index
      const entry = list[depositIndex]
      if (!entry) {
        closeDepositModal()
        return
      }
      let q
      let nextQty
      if (entry.walletCurrencyId === 'gem_lb') {
        const maxQ = Math.max(0, safeParseQty(entry.qty))
        q = Math.max(0, Math.min(safeParseQty(depositQty), maxQ))
        nextQty = Math.round((maxQ - q) * 10) / 10
      } else if (entry.walletCurrencyId) {
        const maxQ = Math.max(0, Math.floor(safeParseQty(entry.qty)))
        q = Math.max(0, Math.min(Math.floor(safeParseQty(depositQty)), maxQ))
        nextQty = maxQ - q
      } else {
        q = Math.max(1, Math.min(depositQty, safeParseQty(entry.qty) || 1))
        nextQty = (safeParseQty(entry.qty) || 1) - q
      }
      if (entry.walletCurrencyId && q <= 0) {
        closeDepositModal()
        return
      }
      const prevList = list
      const optimisticList = nextQty <= 0
        ? list.filter((_, i) => i !== depositIndex)
        : list.map((x, i) => (i === depositIndex ? { ...x, qty: nextQty } : x))
      setList(optimisticList)
      setIsDepositing(true)
      setTransferHint('物品存入中，请耐心等待；若长时间未完成请尝试刷新页面。')

      const removePromise =
        nextQty <= 0
          ? Promise.resolve(removeFromWarehouse(currentModuleId, depositIndex))
          : Promise.resolve(removeFromWarehouse(currentModuleId, depositIndex, q))
      const hasArcaneNested =
        entry.itemId === 'bag_of_holding' && Array.isArray(entry.nestedInventory) && entry.nestedInventory.length > 0
      const invEntry = buildInvEntryForCharacter(entry, q)
      if (depositTargetBagModuleId) {
        if (entry.itemId === 'bag_of_holding') {
          alert('次元袋里不能放入次元袋')
          setIsDepositing(false)
          setTransferHint('')
          closeDepositModal()
          return
        }
        invEntry.inBagOfHolding = true
        invEntry.bagModuleId = depositTargetBagModuleId
      }
      const saveInventoryPromise = hasArcaneNested
        ? Promise.resolve(
            updateCharacter(depositCharId, expandWarehouseBagForBackpack(char, entry, q)),
          )
        : Promise.resolve(
            updateCharacter(depositCharId, {
              inventory: [...(char.inventory ?? []), invEntry],
            }),
          )
      Promise.all([saveInventoryPromise, removePromise])
        .then(() => {
          if (user?.name) {
            logTeamActivity({
              actor: user.name,
              moduleId: currentModuleId,
              summary: `玩家 ${user.name} 将秘法箱「${displayName(entry)}」存入了角色「${char.name || '未命名'}」的${depositTargetBagModuleId ? '次元袋' : '背包'}`,
            })
          }
          refreshList()
        })
        .catch((err) => {
          console.error('[Warehouse] 存入角色失败，已回滚列表', err)
          setList(prevList)
          alert('存入失败，已回滚，请重试')
        })
        .finally(() => {
          setIsDepositing(false)
          setTransferHint('')
        })
      closeDepositModal()
      return
    }

    if (depositContext.type === 'nested') {
      const { topBagIndex, path } = depositContext
      setIsDepositing(true)
      setTransferHint('物品转移中…')
      Promise.resolve(moveWarehouseNestedPathToTopLevel(currentModuleId, topBagIndex, path))
        .then((newList) => {
          const entry = newList[newList.length - 1]
          if (!entry) throw new Error('move failed')
          let q
          let nextQty
          if (entry.walletCurrencyId === 'gem_lb') {
            const maxQ = Math.max(0, safeParseQty(entry.qty))
            q = Math.max(0, Math.min(safeParseQty(depositQty), maxQ))
            nextQty = Math.round((maxQ - q) * 10) / 10
          } else if (entry.walletCurrencyId) {
            const maxQ = Math.max(0, Math.floor(safeParseQty(entry.qty)))
            q = Math.max(0, Math.min(Math.floor(safeParseQty(depositQty)), maxQ))
            nextQty = maxQ - q
          } else {
            q = Math.max(1, Math.min(depositQty, safeParseQty(entry.qty) || 1))
            nextQty = (safeParseQty(entry.qty) || 1) - q
          }
          if (entry.walletCurrencyId && q <= 0) {
            setIsDepositing(false)
            setTransferHint('')
            closeDepositModal()
            return
          }
          const depositIndex = newList.length - 1
          const prevList = newList
          const optimisticList = nextQty <= 0
            ? newList.filter((_, i) => i !== depositIndex)
            : newList.map((x, i) => (i === depositIndex ? { ...x, qty: nextQty } : x))
          const invEntry = buildInvEntryForCharacter(entry, q)
          if (depositTargetBagModuleId) {
            if (entry.itemId === 'bag_of_holding') {
              alert('次元袋里不能放入次元袋')
              setIsDepositing(false)
              setTransferHint('')
              closeDepositModal()
              return
            }
            invEntry.inBagOfHolding = true
            invEntry.bagModuleId = depositTargetBagModuleId
          }
          const removePromise =
            nextQty <= 0
              ? Promise.resolve(removeFromWarehouse(currentModuleId, depositIndex))
              : Promise.resolve(removeFromWarehouse(currentModuleId, depositIndex, q))
          const hasArcaneNested =
            entry.itemId === 'bag_of_holding' && Array.isArray(entry.nestedInventory) && entry.nestedInventory.length > 0
          const saveInventoryPromise = hasArcaneNested
            ? Promise.resolve(updateCharacter(depositCharId, expandWarehouseBagForBackpack(char, entry, q)))
            : Promise.resolve(updateCharacter(depositCharId, { inventory: [...(char.inventory ?? []), invEntry] }))
          setList(optimisticList)
          return Promise.all([saveInventoryPromise, removePromise])
            .then(() => {
              if (user?.name) {
                logTeamActivity({
                  actor: user.name,
                  moduleId: currentModuleId,
                  summary: `玩家 ${user.name} 将秘法箱次元袋内的「${displayName(entry)}」存入了角色「${char.name || '未命名'}」的${depositTargetBagModuleId ? '次元袋' : '背包'}`,
                })
              }
              refreshList()
            })
            .catch((err) => {
              console.error('[Warehouse] 存入角色失败，已回滚列表', err)
              setList(prevList)
              alert('存入失败，已回滚，请重试')
            })
            .finally(() => {
              setIsDepositing(false)
              setTransferHint('')
              closeDepositModal()
            })
        })
        .catch((err) => {
          console.error('[Warehouse] 移出次元袋失败', err)
          setIsDepositing(false)
          setTransferHint('')
          alert('移出次元袋失败，请重试')
          closeDepositModal()
        })
      return
    }

    // 公家次元袋 → 目标角色身上背包（非袋内）
    const { sourceCharId, invIdx } = depositContext
    const sourceCh = getCharacter(sourceCharId)
    if (!sourceCh || !Array.isArray(sourceCh.inventory)) {
      closeDepositModal()
      return
    }
    const entry = sourceCh.inventory[invIdx]
    if (!entry) {
      closeDepositModal()
      return
    }
    let q
    let nextQty
    if (entry.walletCurrencyId === 'gem_lb') {
      const maxQ = Math.max(0, safeParseQty(entry.qty))
      q = Math.max(0, Math.min(safeParseQty(depositQty), maxQ))
      nextQty = Math.round((maxQ - q) * 10) / 10
    } else if (entry.walletCurrencyId) {
      const maxQ = Math.max(0, Math.floor(safeParseQty(entry.qty)))
      q = Math.max(0, Math.min(Math.floor(safeParseQty(depositQty)), maxQ))
      nextQty = maxQ - q
    } else {
      q = Math.max(1, Math.min(depositQty, safeParseQty(entry.qty) || 1))
      nextQty = (safeParseQty(entry.qty) || 1) - q
    }
    if (entry.walletCurrencyId && q <= 0) {
      closeDepositModal()
      return
    }
    const invEntry = buildInvEntryForCharacter(entry, q)
    if (depositTargetBagModuleId) {
      if (entry.itemId === 'bag_of_holding') {
        alert('次元袋里不能放入次元袋')
        closeDepositModal()
        return
      }
      invEntry.inBagOfHolding = true
      invEntry.bagModuleId = depositTargetBagModuleId
    }

    const sourceName = sourceCh.name || '未命名'
    setIsDepositing(true)
    setTransferHint('物品转移中…')

    const applyBagSourceAfterPull = (inv) => {
      if (nextQty <= 0) return inv.filter((_, i) => i !== invIdx)
      return inv.map((e, i) => (i === invIdx ? { ...e, qty: nextQty } : e))
    }

    const run = () => {
      if (sourceCharId === depositCharId) {
        const inv = [...(sourceCh.inventory ?? [])]
        const nextInv = applyBagSourceAfterPull(inv)
        nextInv.push(invEntry)
        return Promise.resolve(updateCharacter(sourceCharId, { inventory: nextInv }))
      }
      const nextSource = applyBagSourceAfterPull([...(sourceCh.inventory ?? [])])
      const targetInv = [...(char.inventory ?? []), invEntry]
      return Promise.resolve(updateCharacter(sourceCharId, { inventory: nextSource })).then(() =>
        updateCharacter(depositCharId, { inventory: targetInv }),
      )
    }

    run()
      .then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将「${sourceName}」公家次元袋中的「${displayName(entry)}」存入了角色「${char.name || '未命名'}」的${depositTargetBagModuleId ? '次元袋' : '背包'}`,
          })
        }
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 次元袋内存入角色失败', err)
        alert('存入失败，请重试')
      })
      .finally(() => {
        setIsDepositing(false)
        setTransferHint('')
        closeDepositModal()
      })
  }

  const applyBagItemEditSave = (entry) => {
    if (!bagItemEdit) return
    const ch = getCharacter(bagItemEdit.charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    const idx = bagItemEdit.invIdx
    const old = ch.inventory[idx]
    if (!old) return
    const merged = {
      ...old,
      ...entry,
      id: old.id,
      inBagOfHolding: true,
      bagModuleId: old.bagModuleId,
      bagSlotId: old.bagSlotId,
    }
    const nextInv = ch.inventory.map((e, i) => (i === idx ? merged : e))
    Promise.resolve(updateCharacter(bagItemEdit.charId, { inventory: nextInv })).then(() => {
      setCharRefresh((x) => x + 1)
      setBagItemEdit(null)
    })
  }

  /** 已完成制作（已领取）拖入公家次元袋：写入袋内 inventory 并标记已入库（列表保留灰色记录） */
  const depositCraftProjectToPublicBag = (charId, bagModId, projectIndex) => {
    const list = getCraftingProjects(currentModuleId)
    const p = list[projectIndex]
    if (!p) return
    const norm = normalizeProject(p)
    if (norm.状态 !== 'COMPLETED') {
      alert('仅可将已完成的制作移入次元袋')
      return
    }
    if (!isCraftFeeClaimed(p)) {
      alert('请先在「已完成物品列表」中点击「领取结算」，支付制作成本与工匠经验后再拖入次元袋。')
      return
    }
    if (isCraftDeposited(p)) {
      alert('该制作项已入库，仅作记录，无法再次拖入次元袋。')
      return
    }
    const ownerName = user?.name?.trim() || ''
    if (!isAdmin && ownerName) {
      const del = (p.委托角色 ?? '').trim()
      if (del) {
        const delegateChar = getCharacter(del)
        if (delegateChar?.owner !== ownerName) {
          alert('无权操作此制作项')
          return
        }
      }
    }
    const ch = getCharacter(charId)
    if (!ch) return
    const name = p.物品名称?.trim() || '未命名魔法物品'
    const desc = p.详细介绍?.trim() ?? ''
    const qty = Math.max(1, Number(p.数量) || 1)
    let charge = 0
    if (p.类型 === 'wand' || p.类型 === 'staff') {
      charge = Math.max(0, Number(p.充能次数) || 0)
    }
    const invEntry = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name,
      详细介绍: desc,
      qty,
      charge,
      攻击: '',
      伤害: '',
      附注: '',
      isAttuned: false,
      magicBonus: 0,
      inBagOfHolding: true,
      bagModuleId: bagModId,
    }
    const inv = ch.inventory ?? []
    const nowIso = new Date().toISOString()
    Promise.resolve(updateCharacter(charId, { inventory: [...inv, invEntry] }))
      .then(() =>
        updateCraftingProject(currentModuleId, projectIndex, {
          已入库: true,
          入库时间: nowIso,
          入库去向: 'public_bag',
          入库角色Id: charId,
          入库次元袋模块Id: bagModId,
        }),
      )
      .then(() => {
        window.dispatchEvent(new CustomEvent('dnd-realtime-crafting'))
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将制作的「${name}」拖入了角色「${ch.name || '未命名'}」的公家次元袋`,
          })
        }
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 制作物品拖入次元袋失败', err)
        alert('存入次元袋失败，请重试')
      })
  }

  /** 秘法箱行拖入某角色公家次元袋：写入该角色 inventory 并从仓库移除 */
  const depositWarehouseToBag = (warehouseIndex, charId, moduleId) => {
    const entry = list[warehouseIndex]
    if (!entry || !charId || !moduleId) return
    if (entry?.itemId === 'bag_of_holding') {
      alert('次元袋里不能放入次元袋')
      return
    }
    const ch = getCharacter(charId)
    if (!ch) return
    const mods = getNormalizedBagModules(ch)
    const mod = mods.find((m) => m.id === moduleId)
    if (!mod) return

    if (entry.walletCurrencyId) {
      const q =
        entry.walletCurrencyId === 'gem_lb'
          ? Math.max(0, safeParseQty(entry.qty))
          : Math.max(0, Math.floor(safeParseQty(entry.qty)))
      if (q <= 0) return
      const cfg = getCurrencyById(entry.walletCurrencyId)
      const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
      const inv = [...(ch.inventory || [])]
      const mergeIdx = inv.findIndex(
        (e) =>
          e?.walletCurrencyId === entry.walletCurrencyId &&
          e.inBagOfHolding &&
          entryBelongsToBagModule(e, mod, mods),
      )
      if (mergeIdx >= 0) {
        const e = inv[mergeIdx]
        const prev = entry.walletCurrencyId === 'gem_lb' ? Math.max(0, safeParseQty(e.qty)) : Math.max(0, Math.floor(safeParseQty(e.qty)))
        const nextQty = entry.walletCurrencyId === 'gem_lb' ? Math.round((prev + q) * 10) / 10 : prev + q
        inv[mergeIdx] = { ...e, qty: nextQty }
      } else {
        inv.push({
          id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          walletCurrencyId: entry.walletCurrencyId,
          name: label,
          qty: q,
          inBagOfHolding: true,
          bagModuleId: mod.id,
        })
      }
      const prevList = list
      const nextQtyLeft =
        entry.walletCurrencyId === 'gem_lb'
          ? Math.round((safeParseQty(entry.qty) - q) * 10) / 10
          : Math.floor(safeParseQty(entry.qty)) - q
      const optimisticList =
        nextQtyLeft <= 0 ? list.filter((_, i) => i !== warehouseIndex) : list.map((x, i) => (i === warehouseIndex ? { ...x, qty: nextQtyLeft } : x))
      setList(optimisticList)
      setTransferHint('钱币存入次元袋中…')
      const removePromise =
        nextQtyLeft <= 0
          ? Promise.resolve(removeFromWarehouse(currentModuleId, warehouseIndex))
          : Promise.resolve(removeFromWarehouse(currentModuleId, warehouseIndex, q))
      Promise.resolve(updateCharacter(charId, { inventory: inv }))
        .then(() => removePromise)
        .then(() => {
          if (user?.name) {
            logTeamActivity({
              actor: user.name,
              moduleId: currentModuleId,
              summary: `玩家 ${user.name} 将秘法箱「${label}」存入了角色「${ch.name || '未命名'}」的公家次元袋`,
            })
          }
          refreshList()
          setCharRefresh((x) => x + 1)
        })
        .catch((err) => {
          console.error('[Warehouse] 钱币存入次元袋失败', err)
          setList(prevList)
          alert('存入次元袋失败，请重试')
        })
        .finally(() => setTransferHint(''))
      return
    }

    const q = Math.max(1, safeParseQty(entry.qty) || 1)
    const proto = entry.itemId ? getItemById(entry.itemId) : null
    const invEntry = {
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      itemId: entry.itemId ?? undefined,
      name: (entry.name && entry.name.trim()) || (proto ? getItemDisplayName(proto) : '—'),
      攻击: entry.攻击 ?? '',
      伤害: entry.伤害 ?? '',
      详细介绍: entry.详细介绍 != null ? String(entry.详细介绍) : '',
      附注: entry.附注 != null ? String(entry.附注) : '',
      攻击距离: entry.攻击距离 ?? undefined,
      攻击范围: entry.攻击范围 ?? undefined,
      精通: entry.精通 ?? undefined,
      重量: entry.重量 ?? proto?.重量,
      rarity: entry.rarity ?? undefined,
      qty: q,
      isAttuned: false,
      magicBonus: Number(entry.magicBonus) || 0,
      charge: Number(entry.charge) || 0,
      spellDC: entry.spellDC != null ? Number(entry.spellDC) : undefined,
      effects: Array.isArray(entry.effects) ? entry.effects : undefined,
      爆炸半径: entry.爆炸半径 != null ? Number(entry.爆炸半径) : undefined,
      inBagOfHolding: true,
      bagModuleId: moduleId,
    }
    const inv = [...(ch.inventory || [])]
    if (
      entry.itemId === 'bag_of_holding' &&
      Array.isArray(entry.nestedInventory) &&
      entry.nestedInventory.length > 0
    ) {
      inv.push({ ...invEntry, nestedInventory: [] })
      appendWarehouseNestedToPublicBag(inv, mods, mod, entry.nestedInventory)
    } else {
      inv.push(invEntry)
    }
    const prevList = list
    const nextQty = (safeParseQty(entry.qty) || 1) - q
    const optimisticList =
      nextQty <= 0 ? list.filter((_, i) => i !== warehouseIndex) : list.map((x, i) => (i === warehouseIndex ? { ...x, qty: nextQty } : x))
    setList(optimisticList)
    setTransferHint('物品存入次元袋中…')
    const removePromise =
      q >= (safeParseQty(entry.qty) || 1)
        ? Promise.resolve(removeFromWarehouse(currentModuleId, warehouseIndex))
        : Promise.resolve(removeFromWarehouse(currentModuleId, warehouseIndex, q))
    Promise.resolve(updateCharacter(charId, { inventory: inv }))
      .then(() => removePromise)
      .then(() => {
        if (user?.name) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 将团队仓库「${displayName(entry)}」存入了角色「${ch.name || '未命名'}」的公家次元袋`,
          })
        }
        refreshList()
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 存入次元袋失败', err)
        setList(prevList)
        alert('存入次元袋失败，请重试')
      })
      .finally(() => setTransferHint(''))
  }

  /** 秘法箱行释放在公家次元袋卡片内（含表格格、按钮上方）；亦接受制作工厂「已完成」拖入 */
  const handlePublicBagWarehouseDrop = (e, charId, moduleId) => {
    e.preventDefault()
    e.stopPropagation()
    const craftRaw = e.dataTransfer.getData(DND_CRAFT_COMPLETED_MIME)
    const craftPayload = parseCraftCompletedDragPayload(craftRaw)
    if (craftPayload) {
      const mod = currentModuleId ?? 'default'
      if (craftPayload.moduleId !== mod) {
        alert('制作数据不属于当前模组')
        return
      }
      const cList = getCraftingProjects(currentModuleId)
      let pIdx = -1
      if (craftPayload.projectId) {
        pIdx = cList.findIndex((x) => x.id === craftPayload.projectId)
      }
      if (pIdx < 0 && typeof craftPayload.index === 'number' && craftPayload.index >= 0 && craftPayload.index < cList.length) {
        pIdx = craftPayload.index
      }
      if (pIdx < 0) {
        alert('找不到该制作项，请刷新页面后重试')
        return
      }
      depositCraftProjectToPublicBag(charId, moduleId, pIdx)
      return
    }
    if (e.dataTransfer.getData('text/dnd-warehouse-bag-char')) return
    const idx = parseWarehouseDragIndex(e.dataTransfer)
    if (idx != null && idx >= 0 && idx < list.length) {
      depositWarehouseToBag(idx, charId, moduleId)
    }
  }

  const displayName = (entry) => {
    if (entry?.walletCurrencyId) {
      const cfg = getCurrencyById(entry.walletCurrencyId)
      return getCurrencyDisplayName(cfg) || entry?.name || '—'
    }
    if (entry.itemId) {
      const item = getItemById(entry.itemId)
      return entry.name?.trim() || getItemDisplayName(item)
    }
    return entry.name || '?'
  }

  const handlePublicBagDragStart = (e, charId, invIdx) => {
    e.dataTransfer.setData('text/dnd-warehouse-bag-char', charId)
    e.dataTransfer.setData('text/dnd-warehouse-bag-inv', String(invIdx))
    e.dataTransfer.setData('text/plain', `wb:${charId}:${invIdx}`)
    e.dataTransfer.effectAllowed = 'copyMove'
    e.currentTarget.classList.add('opacity-50')
  }

  /** 公家次元袋内物品：内联修改充能 / 数量（含钱币堆数量；钱币为 0 时移除该行并刷新金库合计） */
  const patchPublicBagInventoryItem = (charId, invIdx, patch) => {
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    if (invIdx < 0 || invIdx >= ch.inventory.length) return
    const entry = ch.inventory[invIdx]
    if (!entry?.inBagOfHolding) return
    const next = applyBagItemPatch(entry, patch)
    const nextInv =
      next.walletCurrencyId && safeParseQty(next.qty) <= 0
        ? ch.inventory.filter((_, i) => i !== invIdx)
        : ch.inventory.map((e, i) => (i === invIdx ? next : e))
    Promise.resolve(updateCharacter(charId, { inventory: nextInv }))
      .then(() => {
        window.dispatchEvent(new CustomEvent('dnd-realtime-team-vault'))
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 更新次元袋物品失败', err)
        alert('更新失败，请重试')
      })
  }

  const removeBagItemFromCharacter = (charId, invIdx) => {
    if (!window.confirm('确定删除该物品？将从角色次元袋中永久移除，无法恢复。')) return
    const ch = getCharacter(charId)
    if (!ch || !Array.isArray(ch.inventory)) return
    if (invIdx < 0 || invIdx >= ch.inventory.length) return
    const entry = ch.inventory[invIdx]
    const nextInv = ch.inventory.filter((_, i) => i !== invIdx)
    Promise.resolve(updateCharacter(charId, { inventory: nextInv }))
      .then(() => {
        if (user?.name && entry) {
          logTeamActivity({
            actor: user.name,
            moduleId: currentModuleId,
            summary: `玩家 ${user.name} 从团队仓库视图中删除了「${ch.name || '未命名'}」次元袋内的「${displayName(entry)}」`,
          })
        }
        setCharRefresh((x) => x + 1)
      })
      .catch((err) => {
        console.error('[Warehouse] 删除次元袋物品失败', err)
        alert('删除失败，请重试')
      })
  }

  const depositModalEntry = useMemo(() => {
    if (!depositContext) return null
    if (depositContext.type === 'warehouse') return list[depositContext.index] ?? null
    if (depositContext.type === 'nested') {
      const bag = list[depositContext.topBagIndex]
      if (!bag?.nestedInventory) return null
      let current = bag
      for (const key of depositContext.path) {
        if (!current?.nestedInventory || !Array.isArray(current.nestedInventory)) return null
        current = current.nestedInventory[key]
        if (!current) return null
      }
      return current ?? null
    }
    const ch = getCharacter(depositContext.sourceCharId)
    return ch?.inventory?.[depositContext.invIdx] ?? null
  }, [depositContext, list, charRefresh])

  const getEntryWeight = (entry) => {
    if (entry?.walletCurrencyId) {
      const q =
        entry.walletCurrencyId === 'gem_lb'
          ? Math.max(0, safeParseQty(entry.qty))
          : Math.max(0, Math.floor(safeParseQty(entry.qty)))
      if (q <= 0) return 0
      const tw = getWalletCurrencyStackWeightLb(entry.walletCurrencyId, q)
      return tw / q
    }
    if (entry?.重量 != null && entry?.重量 !== '') return parseWeightString(entry.重量)
    if (!entry?.itemId) return 0
    return getItemWeightLb(getItemById(entry.itemId))
  }

  const getEntryBriefFull = (entry) => {
    if (entry?.walletCurrencyId) {
      const q =
        entry.walletCurrencyId === 'gem_lb'
          ? Math.max(0, safeParseQty(entry.qty))
          : Math.max(0, Math.floor(safeParseQty(entry.qty)))
      const w = getWalletCurrencyStackWeightLb(entry.walletCurrencyId, q)
      const rule =
        entry.walletCurrencyId === 'gem_lb'
          ? '晶石按磅计重'
          : entry.walletCurrencyId === 'au'
            ? '50 奥拉 ≈ 1 磅'
            : '50 枚标准币 ≈ 1 磅'
      return `本堆约 ${formatDisplayWeightLb(w)} lb（${rule}）`
    }
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

  /** 箱内合计：次元袋只计袋子自重，不计袋内 nested 物品（袋内为异次元空间，不计入秘法箱负重） */
  const arcaneChestTotalLb = useMemo(() => {
    const lineWeight = (entry) => {
      if (!entry) return 0
      if (entry.walletCurrencyId) {
        const q =
          entry.walletCurrencyId === 'gem_lb'
            ? Math.max(0, safeParseQty(entry.qty))
            : Math.max(0, Math.floor(safeParseQty(entry.qty)))
        return getWalletCurrencyStackWeightLb(entry.walletCurrencyId, q)
      }
      const q = Math.max(1, safeParseQty(entry?.qty) || 1)
      return getEntryWeight(entry) * q
    }
    return Math.round(list.reduce((s, entry) => s + lineWeight(entry), 0) * 100) / 100
  }, [list])

  const arcaneVolumeCuFtEst = useMemo(
    () => estimateArcaneChestVolumeCuFtFromWeightLb(arcaneChestTotalLb),
    [arcaneChestTotalLb],
  )
  const arcaneCapacityCuFt = useMemo(
    () => getArcaneChestTotalCapacityCuFt(arcaneChestQty),
    [arcaneChestQty],
  )
  const arcaneCapacityEquivLb = useMemo(
    () => estimateArcaneChestWeightLbFromVolumeCuFt(arcaneCapacityCuFt),
    [arcaneCapacityCuFt],
  )
  const arcaneVolumeOverCapacity = arcaneVolumeCuFtEst > arcaneCapacityCuFt + 1e-6

  /** 秘法箱顶层：钱币堆与其它物品分块展示（钱币无「钱币」分类卡外壳）、非钱币按 list 顺序 */
  const arcaneGrouped = useMemo(() => {
    const currency = []
    list.forEach((entry, index) => {
      if (entry?.walletCurrencyId) currency.push({ entry, index })
    })
    return { currency }
  }, [list])

  /** 秘法箱内除钱币外，按 list 原顺序平铺（与角色背包物品/次元袋交错一致） */
  const arcaneNonCurrencyOrdered = useMemo(() => {
    const out = []
    list.forEach((entry, index) => {
      if (entry?.walletCurrencyId) return
      out.push({ entry, index })
    })
    return out
  }, [list])

  const groupPublicBagRows = (rows) => {
    const currency = []
    const otherRows = []
    for (const row of rows) {
      const { entry, invIdx } = row
      if (entry?.walletCurrencyId) {
        currency.push({ entry, invIdx })
        continue
      }
      otherRows.push({ entry, invIdx })
    }
    return { currency, otherRows }
  }

  const arcaneBagKey = (entry, index) => entry?.id ?? `wh-bag-${index}`

  const toggleArcaneBagExpanded = (key) => {
    setArcaneBagExpanded((p) => ({ ...p, [key]: p[key] === false ? true : false }))
  }

  const handleDropIntoArcaneBag = (e, bagIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const wbChar = e.dataTransfer.getData('text/dnd-warehouse-bag-char')
    const wbInvRaw = e.dataTransfer.getData('text/dnd-warehouse-bag-inv')
    if (wbChar && wbInvRaw !== '') return
    const nestedSrc = parseWarehouseNestedDragPayload(e.dataTransfer)
    if (nestedSrc) {
      let sourceEntry = list[nestedSrc.topBagIndex]
      for (const key of nestedSrc.path) {
        if (!sourceEntry?.nestedInventory) break
        sourceEntry = sourceEntry.nestedInventory[key]
      }
      if (sourceEntry?.itemId === 'bag_of_holding') {
        alert('次元袋里不能放入次元袋')
        return
      }
      Promise.resolve(
        moveWarehouseNestedPathIntoNestedBagAtPath(currentModuleId, nestedSrc.topBagIndex, nestedSrc.path, bagIndex, []),
      ).then(refreshList)
      return
    }
    const fromIndex = parseWarehouseDragIndex(e.dataTransfer)
    if (fromIndex == null || fromIndex < 0 || fromIndex >= list.length) return
    if (fromIndex === bagIndex) return
    if (list[fromIndex]?.itemId === 'bag_of_holding') {
      alert('次元袋里不能放入次元袋')
      return
    }
    Promise.resolve(moveWarehouseTopLevelIntoNestedBag(currentModuleId, fromIndex, bagIndex)).then(refreshList)
  }

  /** 秘法箱顶层物品 → 箱内「嵌套」次元袋（path 指向子袋） */
  const handleDropIntoNestedArcaneBag = (e, topBagIndex, pathToTargetBag) => {
    e.preventDefault()
    e.stopPropagation()
    const wbChar = e.dataTransfer.getData('text/dnd-warehouse-bag-char')
    const wbInvRaw = e.dataTransfer.getData('text/dnd-warehouse-bag-inv')
    if (wbChar && wbInvRaw !== '') return
    const nestedSrc = parseWarehouseNestedDragPayload(e.dataTransfer)
    if (nestedSrc) {
      let sourceEntry = list[nestedSrc.topBagIndex]
      for (const key of nestedSrc.path) {
        if (!sourceEntry?.nestedInventory) break
        sourceEntry = sourceEntry.nestedInventory[key]
      }
      if (sourceEntry?.itemId === 'bag_of_holding') {
        alert('次元袋里不能放入次元袋')
        return
      }
      Promise.resolve(
        moveWarehouseNestedPathIntoNestedBagAtPath(
          currentModuleId,
          nestedSrc.topBagIndex,
          nestedSrc.path,
          topBagIndex,
          pathToTargetBag,
        ),
      ).then(refreshList)
      return
    }
    const fromIndex = parseWarehouseDragIndex(e.dataTransfer)
    if (fromIndex == null || fromIndex < 0 || fromIndex >= list.length) return
    if (fromIndex === topBagIndex) return
    if (list[fromIndex]?.itemId === 'bag_of_holding') {
      alert('次元袋里不能放入次元袋')
      return
    }
    Promise.resolve(
      moveWarehouseTopLevelIntoNestedBagAtPath(currentModuleId, fromIndex, topBagIndex, pathToTargetBag),
    ).then(refreshList)
  }

  const pullNestedPathToArcaneTop = (topBagIndex, path) => {
    Promise.resolve(moveWarehouseNestedPathToTopLevel(currentModuleId, topBagIndex, path)).then(refreshList)
  }

  function groupNodesWithPaths(nodes, pathPrefix) {
    const currency = []
    const bags = []
    const otherItems = []
    if (!Array.isArray(nodes)) return { currency, bags, otherItems }
    nodes.forEach((entry, nidx) => {
      const path = [...pathPrefix, nidx]
      if (entry?.walletCurrencyId) {
        currency.push({ entry, path })
        return
      }
      if (entry?.itemId === 'bag_of_holding') {
        bags.push({ entry, path })
        return
      }
      otherItems.push({ entry, path })
    })
    return { currency, bags, otherItems }
  }

  /** 秘法箱袋内：钱币与其它物品同一列表平铺（无「钱币」分类卡外壳） */
  function renderArcaneNestedTree(topBagIndex, nodes, pathPrefix) {
    if (!Array.isArray(nodes) || nodes.length === 0) return null
    const gp = groupNodesWithPaths(nodes, pathPrefix)
    const hasOthers = gp.otherItems.length > 0
    if (gp.currency.length + gp.bags.length === 0 && !hasOthers) return null
    return (
      <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
        {gp.currency.length > 0 ? (
          <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
              {gp.currency.map(({ entry: nEntry, path }) => {
                const nk = nEntry?.id ?? `wh-nc-${topBagIndex}-${path.join('-')}`
                const cfg = getCurrencyById(nEntry.walletCurrencyId)
                const label = cfg ? getCurrencyDisplayName(cfg) : nEntry?.name ?? '—'
                const cq =
                  nEntry.walletCurrencyId === 'gem_lb'
                    ? Math.max(0, Number(nEntry?.qty) || 0)
                    : Math.max(0, Math.floor(Number(nEntry?.qty) || 0))
                const stackLb = getInventoryEntryStackWeightLb(nEntry)
                return (
                  <div
                    key={nk}
                    data-arcane-nested-row
                    className={`${teamBackpackItemCardClass} bg-[#1e2a3d]/35 cursor-grab active:cursor-grabbing`}
                    draggable
                    onDragStart={(e) => handleNestedArcaneDragStart(e, topBagIndex, path)}
                    onDragEnd={handleNestedArcaneDragEnd}
                    title="可拖到秘法箱顶层卡片、底部重排区，或其它次元袋内袋区"
                  >
                    <div className={teamBagRowGrid}>
                      <div className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted pointer-events-none select-none" aria-hidden>
                        <DragHandleIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className={inventoryItemNameRowClass}>
                        <InventoryItemBriefChevron
                          brief="袋内钱币请用「出袋」移到秘法箱顶层后再调数量；此处与角色袋内钱币行一致为只读展示。"
                          expanded={!!warehouseItemBriefOpen[`wncc-${nk}`]}
                          onToggle={() =>
                            setWarehouseItemBriefOpen((p) => ({ ...p, [`wncc-${nk}`]: !p[`wncc-${nk}`] }))
                          }
                        />
                        <div className="min-w-0 flex-1 leading-tight">
                          <span className="block text-[10px] text-dnd-text-muted leading-tight">钱币</span>
                          <span className="text-dnd-gold-light/95 font-medium text-sm truncate block">{label}</span>
                        </div>
                        <span className={`${inventoryItemChargeCellClass} justify-center`}>
                          <span className="text-dnd-text-muted text-xs tabular-nums">—</span>
                        </span>
                        <span className={inventoryItemQtyWeightCellClass}>
                          <div
                            className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                            onMouseDown={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <span className="shrink-0 leading-none">数量</span>
                            <div className="w-[5.125rem] shrink-0 max-w-full h-6 flex items-center justify-end">
                              <span className="text-dnd-text-body text-xs font-semibold tabular-nums inline-block text-right w-full pr-0.5">
                                {nEntry.walletCurrencyId === 'gem_lb' ? formatDisplayGemLbQty(cq) : cq.toLocaleString('en-US')}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                            {stackLb > 0 ? (
                              <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                            ) : (
                              <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                —
                              </span>
                            )}
                          </div>
                        </span>
                      </div>
                      <div className={inventoryItemActionsCellClass}>
                        <button
                          type="button"
                          onClick={() => openDepositFromNestedBag(topBagIndex, path)}
                          title="存入角色"
                          className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                        >
                          <Package size={14} />
                        </button>
                      </div>
                    </div>
                    <InventoryItemBriefExpandedText
                      brief="袋内钱币请用「出袋」移到秘法箱顶层后再调数量；此处与角色袋内钱币行一致为只读展示。"
                      expanded={!!warehouseItemBriefOpen[`wncc-${nk}`]}
                      variant="muted"
                    />
                  </div>
                )
              })}
          </div>
        ) : null}
        {gp.bags.map(({ entry: nEntry, path }) => {
          const nk = nEntry?.id ?? `wh-nb-${topBagIndex}-${path.join('-')}`
          const inner = Array.isArray(nEntry.nestedInventory) ? nEntry.nestedInventory : []
          const nBagQty = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(nEntry?.qty) || 0)))
          const expandKey = `${topBagIndex}-n-${path.join('-')}`
          const expanded = arcaneBagExpanded[expandKey] !== false
          const nestedSelfLb = getBagOfHoldingSelfWeightLb(nBagQty)
          const canNestDropHere = nEntry?.itemId === 'bag_of_holding' && nBagQty > 0
          return (
            <div
              key={nk}
              data-arcane-nested-row
              className={`${nestedCardClass} border-dnd-gold/35 bg-[#1b2738]/38`}
              onDragOverCapture={canNestDropHere ? handleDragOver : undefined}
              onDragOver={canNestDropHere ? handleDragOver : undefined}
              onDrop={canNestDropHere ? (e) => handleDropIntoNestedArcaneBag(e, topBagIndex, path) : undefined}
            >
              <div className="p-1.5">
                <div className={teamBagRowGrid}>
                  <div
                    className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => handleNestedArcaneDragStart(e, topBagIndex, path)}
                    onDragEnd={handleNestedArcaneDragEnd}
                    title="拖动可移出袋内或装入其它袋"
                  >
                    <DragHandleIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className={`min-w-0 flex min-h-7 items-center ${inventoryItemNameRowClass}`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const nbBrief = getEntryBriefFull(nEntry)
                        if (e.shiftKey && inventoryItemBriefIsExpandable(nbBrief)) {
                          setWarehouseItemBriefOpen((p) => ({ ...p, [`nb-${expandKey}`]: !p[`nb-${expandKey}`] }))
                        } else {
                          toggleArcaneBagExpanded(expandKey)
                        }
                      }}
                      className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded border border-white/15 bg-[#1a2430]/70 text-gray-300 hover:bg-white/10"
                      title={
                        inventoryItemBriefIsExpandable(getEntryBriefFull(nEntry))
                          ? '单击：展开或折叠袋内；按住 Shift 再点：展开或收起物品说明'
                          : expanded
                            ? '折叠袋内'
                            : '展开袋内'
                      }
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" aria-hidden /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden />}
                    </button>
                    <div className={inventoryItemNameTitleGroupClass}>
                      <span className={inventoryItemNameTextClass}>{displayName(nEntry)}</span>
                    </div>
                    <span
                      className={inventoryItemChargeCellClass}
                      onMouseDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <span className="shrink-0 leading-none">可见</span>
                      <div className="min-w-0 max-w-[5.5rem] shrink-0 w-full flex justify-end">
                        <span className="text-dnd-text-muted text-xs">—</span>
                      </div>
                    </span>
                    <span className={inventoryItemQtyWeightCellClass}>
                      <div
                        className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                        onMouseDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <span className="shrink-0 leading-none">袋</span>
                        <div className="w-[5.125rem] shrink-0 max-w-full">
                          <NumberStepper
                            value={nBagQty}
                            onChange={(v) => {
                              const n = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(v) || 0)))
                              Promise.resolve(patchWarehouseNestedItem(currentModuleId, topBagIndex, path, { qty: n })).then(refreshList)
                            }}
                            min={0}
                            max={MAX_BAG_OF_HOLDING_TOTAL}
                            compact
                            pill
                            subtle
                          />
                        </div>
                      </div>
                      <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                        {nestedSelfLb > 0 ? (
                          <span className="text-dnd-text-body" title="仅子袋自重">
                            {formatDisplayWeightLb(nestedSelfLb)} lb
                          </span>
                        ) : (
                          <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                            —
                          </span>
                        )}
                      </div>
                    </span>
                  </div>
                  <div className={inventoryItemActionsCellClass}>
                    <button
                      type="button"
                      onClick={() => openDepositFromNestedBag(topBagIndex, path)}
                      title="存入角色"
                      className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                    >
                      <Package size={14} />
                    </button>
                  </div>
                </div>
                <InventoryItemBriefExpandedText
                  brief={getEntryBriefFull(nEntry)}
                  expanded={!!warehouseItemBriefOpen[`nb-${expandKey}`]}
                  variant="body"
                />
              </div>
              {expanded ? (
                <div
                  className="border-t border-gray-700/45 bg-black/25 px-2 py-2 space-y-2 mt-1.5 flex flex-col min-h-0"
                  onDragOverCapture={canNestDropHere ? handleDragOver : undefined}
                  onDragOver={canNestDropHere ? handleDragOver : undefined}
                  onDrop={canNestDropHere ? (e) => handleDropIntoNestedArcaneBag(e, topBagIndex, path) : undefined}
                >
                  <div className="flex-1 min-h-0 flex flex-col max-h-[min(32vh,18rem)] overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                      {inner.length > 0 ? (
                        renderArcaneNestedTree(topBagIndex, inner, path)
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-600/80 bg-[#151c28]/40 py-8 px-3 text-center text-gray-500 text-[11px] leading-relaxed min-h-[4.5rem]">
                          {nBagQty > 0
                            ? '暂无。可将秘法箱其它物品拖入此处；多件子袋拖入会拆出一行单件袋承接袋内。'
                            : '将「袋」个数调到至少 1 后出现袋内拖放区。'}
                        </div>
                      )}
                    </div>
                    <div
                      className="shrink-0 border-t border-white/[0.06] bg-[#0c1018]/80 px-2 py-1 mt-1"
                      onDragEnter={handleDragOver}
                      onDragOver={handleDragOver}
                      onDrop={canNestDropHere ? (e) => handleDropIntoNestedArcaneBag(e, topBagIndex, path) : undefined}
                      title="袋内列表较长时，拖到此处更易入袋"
                    >
                      <p className="text-[10px] text-dnd-text-muted text-center leading-snug">
                        拖到此条入袋，或松手在上方列表区域内
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
        {gp.otherItems.length > 0 ? (
          <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
            {gp.otherItems.map(({ entry: nEntry, path }) => {
              const nk = nEntry?.id ?? `wh-ni-${topBagIndex}-${path.join('-')}`
              const nQty = Math.max(1, Number(nEntry?.qty) ?? 1)
              const stoneEffect = Array.isArray(nEntry?.effects) ? nEntry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
              const stoneRaw = stoneEffect != null ? stoneEffect.value : null
              const stoneLabel = isFormulaValue(stoneRaw) ? formatFormulaLabel(stoneRaw) : null
              const stoneVal = stoneLabel == null && stoneRaw != null ? Number(stoneRaw) : null
              const nameExtra =
                stoneLabel || (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0) ? (
                  <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
                    {stoneLabel ?? `${stoneVal}层`}
                  </span>
                ) : (Number(nEntry.magicBonus) || 0) > 0 ? (
                  <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{nEntry.magicBonus}</span>
                ) : null
              const stackLb = getInventoryEntryStackWeightLb(nEntry)
              const showCharge = (Number(nEntry.charge) || 0) > 0 || hasContainedSpellEffect(nEntry)
              const nBrief = getEntryBriefFull(nEntry)
              const nBriefKey = `wni-${nk}`
              return (
                <div
                  key={nk}
                  data-arcane-nested-row
                  className={`${teamBackpackItemCardClass} cursor-grab active:cursor-grabbing`}
                  draggable
                  onDragStart={(e) => handleNestedArcaneDragStart(e, topBagIndex, path)}
                  onDragEnd={handleNestedArcaneDragEnd}
                >
                  <div className={teamBagRowGrid}>
                    <div className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted pointer-events-none select-none" aria-hidden>
                      <DragHandleIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className={`min-w-0 ${inventoryItemNameRowClass}`}>
                      <InventoryItemBriefChevron
                        brief={nBrief}
                        expanded={!!warehouseItemBriefOpen[nBriefKey]}
                        onToggle={() =>
                          setWarehouseItemBriefOpen((p) => ({ ...p, [nBriefKey]: !p[nBriefKey] }))
                        }
                      />
                      <div className={inventoryItemNameTitleGroupClass}>
                        <span className={inventoryItemNameTextClass}>{displayName(nEntry)}</span>
                        <span className={inventoryItemNameExtrasClass}>{nameExtra}</span>
                      </div>
                      {showCharge ? (
                        <span
                          className={inventoryItemChargeCellClass}
                          onMouseDown={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <span className="shrink-0 leading-none">充能</span>
                          <div className="w-[5.125rem] shrink-0 max-w-full">
                            <NumberStepper
                              value={Number(nEntry.charge) || 0}
                              onChange={(v) => {
                                Promise.resolve(
                                  patchWarehouseNestedItem(currentModuleId, topBagIndex, path, { charge: Math.max(0, parseInt(v, 10) || 0) }),
                                ).then(refreshList)
                              }}
                              min={0}
                              compact
                              pill
                              subtle
                            />
                          </div>
                        </span>
                      ) : (
                        <span className={inventoryItemChargeCellClass} aria-hidden>
                          <span className="opacity-0 select-none">—</span>
                        </span>
                      )}
                      <span className={inventoryItemQtyWeightCellClass}>
                        <div
                          className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                          onMouseDown={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <span className="shrink-0 leading-none">数量</span>
                          <div className="w-[5.125rem] shrink-0 max-w-full">
                            <NumberStepper
                              value={nQty}
                              onChange={(v) => {
                                const n = Math.max(1, parseInt(v, 10) || 1)
                                Promise.resolve(patchWarehouseNestedItem(currentModuleId, topBagIndex, path, { qty: n })).then(refreshList)
                              }}
                              min={1}
                              compact
                              pill
                              subtle
                            />
                          </div>
                        </div>
                        <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                          {stackLb > 0 ? (
                            <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                          ) : (
                            <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                              —
                          </span>
                        )}
                      </div>
                    </span>
                    </div>
                    <div className={inventoryItemActionsCellClass}>
                      <button
                        type="button"
                        onClick={() => openDepositFromNestedBag(topBagIndex, path)}
                        title="存入角色"
                        className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                      >
                        <Package size={14} />
                      </button>
                    </div>
                  </div>
                  <InventoryItemBriefExpandedText
                    brief={nBrief}
                    expanded={!!warehouseItemBriefOpen[nBriefKey]}
                    variant="body"
                  />
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="character-sheet-page-with-topbar p-4 pb-40 min-h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))]"
      style={{ backgroundColor: 'var(--page-bg)' }}
    >
      <TeamWarehouseTopBar>
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 py-2 sm:gap-3 sm:py-2.5">
          <Link
            to="/more"
            className={TOPBAR_BACK_LINK_CLASS}
            title="返回更多"
            aria-label="返回更多"
          >
            <ArrowLeft className={TOPBAR_BACK_ARROW_CLASS} strokeWidth={2} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-white sm:text-base">团队仓库</h1>
            <p className="text-[11px] text-dnd-text-muted">公家次元袋、秘法箱与金库管理</p>
          </div>
          <div className="shrink-0">
            <CurrencyPanel variant="topbar" showControls showTotals={false} />
          </div>
        </div>
      </TeamWarehouseTopBar>

      <section className="mb-6">
        <CurrencyPanel showControls={false} showTotals />
      </section>

      <div className={`${teamOuterShellClass} p-3 space-y-2`}>
        <div className="px-1.5 py-0.5 border-b border-white/10 flex flex-nowrap items-center gap-2 min-w-0">
          <Package className="w-4 h-4 text-dnd-gold-light shrink-0" aria-hidden />
          <h3 className={subTitleClass + ' mb-0'}>次元袋 · 团队可见储物</h3>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => setAddFormOpen(true)}
              className="h-7 px-2 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors"
            >
              添加物品
            </button>
            <ItemAddForm
              open={addFormOpen}
              onClose={() => setAddFormOpen(false)}
              onSave={(entry) => {
                Promise.resolve(addToWarehouse(currentModuleId, entry)).then(() => {
                  const nm = entry?.name?.trim() || entry?.itemId || '物品'
                  if (user?.name) {
                    logTeamActivity({
                      actor: user.name,
                      moduleId: currentModuleId,
                      summary: `玩家 ${user.name} 向团队仓库放入了「${nm}」`,
                    })
                  }
                  refreshList()
                  setAddFormOpen(false)
                })
              }}
              submitLabel="放入仓库"
              inventory={list}
            />
            <ItemAddForm
              open={editingIndex !== null}
              onClose={() => setEditingIndex(null)}
              onSave={applyEditSave}
              submitLabel="保存"
              editEntry={editingIndex != null ? list[editingIndex] : null}
              inventory={list}
            />
            <ItemAddForm
              open={bagItemEdit != null}
              onClose={() => setBagItemEdit(null)}
              onSave={applyBagItemEditSave}
              submitLabel="保存"
              editEntry={
                bagItemEdit
                  ? getCharacter(bagItemEdit.charId)?.inventory?.[bagItemEdit.invIdx] ?? null
                  : null
              }
              inventory={bagItemEdit ? getCharacter(bagItemEdit.charId)?.inventory ?? [] : []}
            />
            </div>
          </div>
          {publicBagTargets.length === 0 ? (
            <div className="rounded-lg border border-white/10 py-4 px-3 text-gray-500 text-center text-[11px]">
              暂无公家次元袋。请在角色卡将次元袋设为「公家」，且「次元袋个数」至少 1。
            </div>
          ) : (
            publicBagTargets.map(({ character: c, mod }) => {
              const mods = getNormalizedBagModules(c)
              const bagItemRows = (c.inventory || [])
                .map((entry, invIdx) => ({ entry, invIdx }))
                .filter(({ entry }) => entryBelongsToBagModule(entry, mod, mods))
                .sort((a, b) => compareBagInventoryDisplayOrder(a.entry, a.invIdx, b.entry, b.invIdx))
              const bagTotalLb =
                Math.round(
                  bagItemRows.reduce((s, { entry }) => {
                    const q = Math.max(1, Number(entry?.qty) ?? 1)
                    return s + getEntryWeight(entry) * q
                  }, 0) * 100,
                ) / 100
              const { currency: pubCurrencyRows, otherRows: pubOtherRows } = groupPublicBagRows(bagItemRows)
              return (
                <div
                  key={`${c.id}-${mod.id}`}
                  className={`${teamSectionCardShellClass} overflow-hidden ring-offset-0`}
                  onDragEnter={(e) => {
                    e.preventDefault()
                  }}
                  onDragOverCapture={dragOverPublicBagZone}
                  onDragOver={dragOverPublicBagZone}
                  onDrop={(e) => handlePublicBagWarehouseDrop(e, c.id, mod.id)}
                >
                  <div className={`${teamCardHeadClass} flex items-center justify-between gap-2 min-w-0`}>
                    <span className="text-dnd-gold-light text-[11px] font-semibold truncate min-w-0">
                      {c.name || '未命名'} 的公家次元袋
                    </span>
                    <span
                      className="text-dnd-text-muted text-[10px] tabular-nums shrink-0"
                      title="袋内物品合计重量（不含次元袋自重）"
                    >
                      合计{' '}
                      <span className="text-dnd-gold-light/95 font-semibold">{bagTotalLb}</span> lb
                    </span>
                  </div>
                  <div
                    className="p-1.5 space-y-1.5 min-w-0"
                    onDragOverCapture={dragOverPublicBagZone}
                    onDragOver={dragOverPublicBagZone}
                    onDrop={(e) => handlePublicBagWarehouseDrop(e, c.id, mod.id)}
                  >
                    {bagItemRows.length === 0 ? (
                      <div
                        className="rounded-lg py-8 px-3 text-center text-dnd-text-muted text-[11px] border border-dashed border-gray-600/50 bg-[#1a2430]/25"
                        onDragOverCapture={dragOverPublicBagZone}
                        onDragOver={dragOverPublicBagZone}
                        onDrop={(e) => handlePublicBagWarehouseDrop(e, c.id, mod.id)}
                      >
                        袋内暂无物品
                      </div>
                    ) : (
                      <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
                        {pubCurrencyRows.length > 0 ? (
                          <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
                              {pubCurrencyRows.map(({ entry, invIdx }) => {
                                const cfg = getCurrencyById(entry.walletCurrencyId)
                                const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
                                const cq =
                                  entry.walletCurrencyId === 'gem_lb'
                                    ? Math.max(0, Number(entry?.qty) || 0)
                                    : Math.max(0, Math.floor(Number(entry?.qty) || 0))
                                const stackLb = getInventoryEntryStackWeightLb(entry)
                                return (
                                  <div
                                    key={entry.id ?? `bagpub-${c.id}-${invIdx}`}
                                    className={`${teamBackpackItemCardClass} bg-[#1e2a3d]/35 cursor-grab active:cursor-grabbing`}
                                    draggable
                                    onDragOver={dragOverPublicBagZone}
                                    onDragStart={(e) => handlePublicBagDragStart(e, c.id, invIdx)}
                                    onDragEnd={handleDragEnd}
                                  >
                                    <div className={teamBagRowGrid}>
                                      <div className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted pointer-events-none select-none" aria-hidden>
                                        <DragHandleIcon className="w-3.5 h-3.5" />
                                      </div>
                                      <div className={inventoryItemNameRowClass}>
                                        <InventoryItemBriefChevron
                                          brief="公家袋内钱币堆，计入「货币与金库」团队合计；与角色个人钱包无关。数量不可在此修改，请通过「货币与金库」与秘法箱、拖移等流程调整。"
                                          expanded={!!warehouseItemBriefOpen[`pcc-${c.id}-${invIdx}`]}
                                          onToggle={() =>
                                            setWarehouseItemBriefOpen((p) => ({
                                              ...p,
                                              [`pcc-${c.id}-${invIdx}`]: !p[`pcc-${c.id}-${invIdx}`],
                                            }))
                                          }
                                        />
                                        <div className="min-w-0 flex-1 leading-tight">
                                          <span className="block text-[10px] text-dnd-text-muted leading-tight">钱币</span>
                                          <span className="text-dnd-gold-light/95 font-medium text-sm truncate block">{label}</span>
                                        </div>
                                        <span className={`${inventoryItemChargeCellClass} justify-center`}>
                                          <span className="text-dnd-text-muted text-xs">—</span>
                                        </span>
                                        <span className={inventoryItemQtyWeightCellClass}>
                                          <div
                                            className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            role="presentation"
                                          >
                                            <span className="shrink-0 leading-none">数量</span>
                                            <div className="w-[5.125rem] shrink-0 max-w-full h-6 flex items-center justify-end">
                                              <span className="text-dnd-text-body text-xs font-semibold tabular-nums text-right block w-full pr-0.5">
                                                {entry.walletCurrencyId === 'gem_lb' ? formatDisplayGemLbQty(cq) : cq.toLocaleString('en-US')}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                            {stackLb > 0 ? (
                                              <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                                            ) : (
                                              <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                                —
                                              </span>
                                            )}
                                          </div>
                                        </span>
                                      </div>
                                      <div
                                        className={inventoryItemActionsCellClass}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        role="presentation"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => moveBagItemToWarehouse(c.id, invIdx)}
                                          title="存入秘法箱"
                                          className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                                        >
                                          <Package size={14} />
                                        </button>
                                      </div>
                                    </div>
                                    <InventoryItemBriefExpandedText
                                      brief="公家袋内钱币堆，计入「货币与金库」团队合计；与角色个人钱包无关。数量不可在此修改，请通过「货币与金库」与秘法箱、拖移等流程调整。"
                                      expanded={!!warehouseItemBriefOpen[`pcc-${c.id}-${invIdx}`]}
                                      variant="muted"
                                    />
                                  </div>
                                )
                              })}
                          </div>
                        ) : null}
                        {pubOtherRows.length > 0 ? (
                          <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
                            {pubOtherRows.map(({ entry, invIdx }) => {
                              const qty = Math.max(1, Number(entry?.qty) ?? 1)
                              const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                              const stoneRaw = stoneEffect != null ? stoneEffect.value : null
                              const stoneLabel = isFormulaValue(stoneRaw) ? formatFormulaLabel(stoneRaw) : null
                              const stoneVal = stoneLabel == null && stoneRaw != null ? Number(stoneRaw) : null
                              const nameExtra =
                                stoneLabel || (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0) ? (
                                  <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
                                    {stoneLabel ?? `${stoneVal}层`}
                                  </span>
                                ) : (Number(entry.magicBonus) || 0) > 0 ? (
                                  <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                                ) : null
                              const stackLb = getInventoryEntryStackWeightLb(entry)
                              const showCharge = (Number(entry.charge) || 0) > 0 || hasContainedSpellEffect(entry)
                              const pubBrief = getEntryBriefFull(entry)
                              const pubBriefKey = `pio-${c.id}-${entry?.id ?? invIdx}`
                              return (
                                <div
                                  key={entry.id ?? `bagpub-${c.id}-${invIdx}`}
                                  className={`${teamBackpackItemCardClass} cursor-grab active:cursor-grabbing`}
                                  draggable
                                  onDragOver={dragOverPublicBagZone}
                                  onDragStart={(e) => handlePublicBagDragStart(e, c.id, invIdx)}
                                  onDragEnd={handleDragEnd}
                                >
                                  <div className={teamBagRowGrid}>
                                    <div className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted pointer-events-none select-none" aria-hidden>
                                      <DragHandleIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className={`min-w-0 ${inventoryItemNameRowClass}`}>
                                      <InventoryItemBriefChevron
                                        brief={pubBrief}
                                        expanded={!!warehouseItemBriefOpen[pubBriefKey]}
                                        onToggle={() =>
                                          setWarehouseItemBriefOpen((p) => ({ ...p, [pubBriefKey]: !p[pubBriefKey] }))
                                        }
                                      />
                                      <div className={inventoryItemNameTitleGroupClass}>
                                        <span className={inventoryItemNameTextClass}>{displayName(entry)}</span>
                                        <span className={inventoryItemNameExtrasClass}>{nameExtra}</span>
                                      </div>
                                      {showCharge ? (
                                        <span
                                          className={inventoryItemChargeCellClass}
                                          onMouseDown={(e) => e.stopPropagation()}
                                          role="presentation"
                                        >
                                          <span className="shrink-0 leading-none">充能</span>
                                          <div className="w-[5.125rem] shrink-0 max-w-full">
                                            <NumberStepper
                                              value={Number(entry.charge) || 0}
                                              onChange={(v) => patchPublicBagInventoryItem(c.id, invIdx, { charge: v })}
                                              min={0}
                                              compact
                                              pill
                                              subtle
                                            />
                                          </div>
                                        </span>
                                      ) : (
                                        <span className={inventoryItemChargeCellClass} aria-hidden>
                                          <span className="opacity-0 select-none">—</span>
                                        </span>
                                      )}
                                      <span className={inventoryItemQtyWeightCellClass}>
                                        <div
                                          className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                          onMouseDown={(e) => e.stopPropagation()}
                                          role="presentation"
                                        >
                                          <span className="shrink-0 leading-none">数量</span>
                                          <div className="w-[5.125rem] shrink-0 max-w-full">
                                            <NumberStepper
                                              value={qty}
                                              onChange={(v) => patchPublicBagInventoryItem(c.id, invIdx, { qty: v })}
                                              min={1}
                                              compact
                                              pill
                                              subtle
                                            />
                                          </div>
                                        </div>
                                        <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                          {stackLb > 0 ? (
                                            <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                                          ) : (
                                            <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                              —
                                            </span>
                                          )}
                                        </div>
                                      </span>
                                    </div>
                                    <div
                                      className={inventoryItemActionsCellClass}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      role="presentation"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => openDepositFromPublicBag(c.id, invIdx)}
                                        title="存入角色（目标角色身上背包，非次元袋）"
                                        className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0"
                                      >
                                        <Package size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setBagItemEdit({ charId: c.id, invIdx })}
                                        title="编辑"
                                        className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0"
                                      >
                                        <Pencil size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeBagItemFromCharacter(c.id, invIdx)}
                                        title="删除"
                                        className="p-1 rounded text-dnd-red hover:bg-dnd-red/20 shrink-0"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  <InventoryItemBriefExpandedText
                                    brief={pubBrief}
                                    expanded={!!warehouseItemBriefOpen[pubBriefKey]}
                                    variant="body"
                                  />
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
      </div>

      <div className={`${teamOuterShellClass} mt-6 p-3 space-y-2`}>
        <div className="px-1.5 py-0.5 border-b border-white/10 flex flex-nowrap items-center gap-2 min-w-0">
          <Package className="w-4 h-4 text-dnd-gold-light shrink-0" aria-hidden />
          <h3 className={subTitleClass + ' mb-0'}>秘法箱（团队共享）</h3>
          <span
            className="text-dnd-text-muted text-[10px] tabular-nums shrink-0 ml-auto whitespace-nowrap"
            title="秘法箱内全部条目合计重量（钱币按 50 枚/50 奥拉≈1 磅；晶石按磅；次元袋仅计袋自重）"
          >
            箱内合计 <span className="text-dnd-gold-light/95 font-semibold">{arcaneChestTotalLb}</span> lb
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-dnd-text-muted min-w-0 leading-snug">
          <span className="shrink-0">秘法箱数量</span>
          <NumberStepper
            value={arcaneChestQty}
            onChange={(v) => {
              const n = Math.max(1, Math.min(99, Math.floor(Number(v) || 1)))
              Promise.resolve(setArcaneChestCount(currentModuleId, n))
                .then(() => refreshList())
                .catch((err) => {
                  console.error('[Warehouse] 秘法箱数量保存失败', err)
                  alert('保存失败，请重试')
                })
            }}
            min={1}
            max={99}
            compact
            pill
            subtle
          />
          <span
            className="text-dnd-text-muted/90 shrink-0"
            title={`每箱 ${ARCANE_CHEST_VOLUME_CU_FT_PER_BOX} 立方尺；总容积 ${formatDisplayOneDecimal(arcaneCapacityCuFt)} 尺³ 若按 500lb≈64 尺³ 换算约等于 ${formatDisplayWeightLb(arcaneCapacityEquivLb)} lb`}
          >
            容积上限{' '}
            <span className="text-dnd-gold-light/90 font-semibold tabular-nums">
              {arcaneChestQty}×{ARCANE_CHEST_VOLUME_CU_FT_PER_BOX}
            </span>
            {' = '}
            <span className="text-dnd-gold-light/95 font-semibold tabular-nums">{formatDisplayOneDecimal(arcaneCapacityCuFt)}</span>
            {' 尺³ '}
            <span className="text-dnd-text-muted">(≈{formatDisplayWeightLb(arcaneCapacityEquivLb)} lb)</span>
          </span>
          <span
            className={`shrink-0 tabular-nums ${arcaneVolumeOverCapacity ? 'text-amber-400 font-semibold' : 'text-dnd-text-body'}`}
            title="由箱内总重按 500lb≈64 尺³ 估算所占立方尺，用于与容积上限对照（非精确几何体积）"
          >
            估算占用 ≈{formatDisplayOneDecimal(arcaneVolumeCuFtEst)} 尺³
            {arcaneVolumeOverCapacity ? ' · 超出容积上限' : ''}
          </span>
        </div>
        <div
          className={`${teamSectionCardShellClass} min-w-0`}
          onDragOverCapture={handleDragOver}
          onDrop={handleWarehouseTableDrop}
        >
            <div
              className="p-1.5 space-y-2.5 min-w-0"
              onDragOverCapture={handleDragOver}
              onDrop={handleWarehouseTableDrop}
            >
              {list.length === 0 ? (
                <div
                  className="rounded-lg py-7 px-3 text-center text-dnd-text-muted text-[11px] border-2 border-dashed border-dnd-gold/25 bg-[#151c28]/25"
                  onDragOverCapture={handleDragOver}
                  onDragOver={handleDragOver}
                  onDrop={handleWarehouseTableDrop}
                >
                  秘法箱暂无物品。可从公家次元袋拖入物品，或在上方「货币与金库」加入钱币。
                </div>
              ) : (
                <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
                  {arcaneGrouped.currency.length > 0 ? (
                    <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass}`}>
                        {arcaneGrouped.currency.map(({ entry, index: i }) => {
                          const rowKey = entry?.id ?? `wh-row-${i}`
                          const qty =
                            entry.walletCurrencyId === 'gem_lb'
                              ? Math.max(0, Number(entry?.qty) || 0)
                              : Math.max(0, Math.floor(Number(entry?.qty) || 0))
                          const stackLb = getInventoryEntryStackWeightLb(entry)
                          const topItemBrief = getEntryBriefFull(entry)
                          return (
                            <div
                              key={rowKey}
                              className={`${teamBackpackItemCardClass} bg-[#1e2a3d]/35 cursor-grab active:cursor-grabbing`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, i)}
                              onDragEnd={handleDragEnd}
                              onDragOverCapture={handleDragOver}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDropOnArcaneTopRow(e, i)}
                            >
                              <div className={teamBagRowGrid}>
                                <div className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted pointer-events-none select-none" aria-hidden>
                                  <DragHandleIcon className="w-3.5 h-3.5" />
                                </div>
                                <div className={inventoryItemNameRowClass}>
                                  <InventoryItemBriefChevron
                                    brief={topItemBrief}
                                    expanded={!!warehouseItemBriefOpen[`acc-${rowKey}`]}
                                    onToggle={() =>
                                      setWarehouseItemBriefOpen((p) => ({ ...p, [`acc-${rowKey}`]: !p[`acc-${rowKey}`] }))
                                    }
                                  />
                                  <div className="min-w-0 flex-1 leading-tight">
                                    <span className="block text-[10px] text-dnd-text-muted leading-tight">钱币</span>
                                    <span className="text-dnd-gold-light/95 font-medium text-sm truncate block">{displayName(entry)}</span>
                                  </div>
                                  <span className={`${inventoryItemChargeCellClass} justify-center`}>
                                    <span className="text-dnd-text-muted text-xs">—</span>
                                  </span>
                                  <span className={inventoryItemQtyWeightCellClass}>
                                    <div
                                      className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      role="presentation"
                                    >
                                      <span className="shrink-0 leading-none">数量</span>
                                      <div className="w-[5.125rem] shrink-0 max-w-full">
                                        <NumberStepper
                                          value={qty}
                                          onChange={(v) => setQty(i, v)}
                                          min={0}
                                          compact
                                          pill
                                          subtle
                                        />
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                      {stackLb > 0 ? (
                                        <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                                      ) : (
                                        <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                          —
                                        </span>
                                      )}
                                    </div>
                                  </span>
                                </div>
                                <div
                                  className={inventoryItemActionsCellClass}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  role="presentation"
                                >
                                  <button type="button" onClick={() => openDeposit(i)} title="存入角色背包" className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0">
                                    <Package size={14} />
                                  </button>
                                  <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0">
                                    <Pencil size={14} />
                                  </button>
                                  <button type="button" onClick={() => handleRemove(i)} title="移除" className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <InventoryItemBriefExpandedText
                                brief={topItemBrief}
                                expanded={!!warehouseItemBriefOpen[`acc-${rowKey}`]}
                                variant="muted"
                              />
                            </div>
                          )
                        })}
                    </div>
                  ) : null}
                  {arcaneNonCurrencyOrdered.map(({ entry, index: i }) => {
                    if (entry?.itemId === 'bag_of_holding') {
                      const rowKey = entry?.id ?? `wh-row-${i}`
                      const nested = Array.isArray(entry.nestedInventory) ? entry.nestedInventory : []
                      const bKey = arcaneBagKey(entry, i)
                      const bagExpanded = arcaneBagExpanded[bKey] !== false
                      const bagQty = Math.max(0, Math.min(MAX_BAG_OF_HOLDING_TOTAL, Math.floor(Number(entry?.qty) || 0)))
                      const canNestDrop = true
                      const selfLb = getBagOfHoldingSelfWeightLb(bagQty)
                      const deleteUnlocked = !!arcaneBagDeleteUnlocked[bKey]
                      const bagTopBrief = getEntryBriefFull(entry)
                      const bagTopBriefKey = `wh-bag-desc-${rowKey}`
                      return (
                        <div key={rowKey} className="min-w-0">
                          <div
                            className={`${inventoryItemCardShellClass} border-dnd-gold/35 bg-[#1b2738]/38 ${
                              bagExpanded ? 'h-auto min-h-0 overflow-visible' : 'min-h-0 overflow-hidden'
                            }`}
                          >
                            <div
                              className="min-w-0"
                              onDragOverCapture={handleDragOver}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDropOnArcaneTopRow(e, i)}
                            >
                              <div className={teamBagRowGrid}>
                                <div
                                  className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted cursor-grab active:cursor-grabbing"
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, i)}
                                  onDragEnd={handleDragEnd}
                                  title="拖到其他卡上调整顺序；拖到展开后的内袋区可装袋"
                                >
                                  <DragHandleIcon className="w-3.5 h-3.5" />
                                </div>
                                <div
                                  className={`min-w-0 flex min-h-7 items-center cursor-grab active:cursor-grabbing ${inventoryItemNameRowClass}`}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, i)}
                                  onDragEnd={handleDragEnd}
                                  title="拖到其他卡上调整顺序；拖到展开后的内袋区可装袋"
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (e.shiftKey && inventoryItemBriefIsExpandable(bagTopBrief)) {
                                        setWarehouseItemBriefOpen((p) => ({ ...p, [bagTopBriefKey]: !p[bagTopBriefKey] }))
                                      } else {
                                        toggleArcaneBagExpanded(bKey)
                                      }
                                    }}
                                    className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded border border-white/15 bg-[#1a2430]/70 text-gray-300 hover:bg-white/10"
                                    title={
                                      inventoryItemBriefIsExpandable(bagTopBrief)
                                        ? '单击：展开或折叠袋内；按住 Shift 再点：展开或收起物品说明'
                                        : bagExpanded
                                          ? '折叠袋内'
                                          : '展开袋内'
                                    }
                                    aria-expanded={bagExpanded}
                                  >
                                    {bagExpanded ? <ChevronDown className="w-3.5 h-3.5" aria-hidden /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden />}
                                  </button>
                                  <div className={inventoryItemNameTitleGroupClass}>
                                    <span className={inventoryItemNameTextClass}>{displayName(entry)}</span>
                                  </div>
                                  <span className={inventoryItemChargeCellClass} aria-hidden>
                                    <span className="opacity-0 select-none">—</span>
                                  </span>
                                  <span className={inventoryItemQtyWeightCellClass}>
                                    <div
                                      className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      role="presentation"
                                    >
                                      <span className="shrink-0 leading-none">袋</span>
                                      <div className="w-[5.125rem] shrink-0 max-w-full">
                                        <NumberStepper
                                          value={bagQty}
                                          onChange={(v) => setQty(i, v)}
                                          min={0}
                                          max={MAX_BAG_OF_HOLDING_TOTAL}
                                          compact
                                          pill
                                          subtle
                                        />
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                      {selfLb > 0 ? (
                                        <span className="text-dnd-text-body" title="仅次元袋自重；袋内重量不计入此行">
                                          {formatDisplayWeightLb(selfLb)} lb
                                        </span>
                                      ) : (
                                        <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                          —
                                        </span>
                                      )}
                                    </div>
                                  </span>
                                </div>
                                <div
                                  className={inventoryItemActionsCellClass}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  role="presentation"
                                >
                                  <button
                                    type="button"
                                    disabled
                                    title="次元袋实体行不可整件存入角色背包；请展开后操作袋内物品"
                                    className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                                  >
                                    <Package size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled
                                    title="袋内物品请展开后编辑；次元袋本体请在角色卡调整"
                                    className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setArcaneBagDeleteUnlocked((p) => ({ ...p, [bKey]: !p[bKey] }))
                                    }}
                                    className={`p-1 rounded shrink-0 ${
                                      deleteUnlocked ? 'text-emerald-400 hover:bg-emerald-400/20' : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                    title={deleteUnlocked ? '重新上锁，避免误删整行次元袋' : '先解锁再删整行（与袋内单行「出袋」不同）'}
                                    aria-pressed={deleteUnlocked}
                                  >
                                    {deleteUnlocked ? <Unlock size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!deleteUnlocked}
                                    onClick={() => handleRemove(i)}
                                    className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0 disabled:opacity-30 disabled:pointer-events-none"
                                    title={deleteUnlocked ? '移除该次元袋（含袋内）' : '请先点锁图标解锁'}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <InventoryItemBriefExpandedText
                                brief={bagTopBrief}
                                expanded={!!warehouseItemBriefOpen[bagTopBriefKey]}
                                variant="body"
                              />
                            </div>
                            {bagExpanded ? (
                              <div
                                className="border-t border-gray-700/45 bg-black/25 px-2 py-2 space-y-2 mt-1.5 -mx-px -mb-px flex flex-col min-h-0"
                                onDragOverCapture={canNestDrop ? handleDragOver : undefined}
                                onDragOver={canNestDrop ? handleDragOver : undefined}
                                onDrop={canNestDrop && bagQty > 0 ? (e) => handleDropIntoArcaneBag(e, i) : undefined}
                              >
                                <div className="flex-1 min-h-0 flex flex-col max-h-[min(32vh,18rem)] overflow-hidden">
                                  <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                                    {nested.length > 0 ? (
                                      renderArcaneNestedTree(i, nested, [])
                                    ) : (
                                      <div className="rounded-lg border border-dashed border-gray-600/80 bg-[#151c28]/40 py-8 px-3 text-center text-gray-500 text-[11px] leading-relaxed min-h-[4.5rem]">
                                        暂无。可将秘法箱其它物品拖入此处；多件次元袋拖入会拆出一行单件袋承接袋内。
                                      </div>
                                    )}
                                  </div>
                                  <div
                                    className="shrink-0 border-t border-white/[0.06] bg-[#0c1018]/80 px-2 py-1 mt-1"
                                    onDragEnter={handleDragOver}
                                    onDragOver={handleDragOver}
                                    onDrop={canNestDrop && bagQty > 0 ? (e) => handleDropIntoArcaneBag(e, i) : undefined}
                                    title="袋内列表较长时，拖到此处更易入袋"
                                  >
                                    <p className="text-[10px] text-dnd-text-muted text-center leading-snug">
                                      拖到此条入袋，或松手在上方列表区域内
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    }
                    const rowKey = entry?.id ?? `wh-row-${i}`
                    const qty = Math.max(1, Number(entry?.qty) ?? 1)
                    const se = Array.isArray(entry?.effects) ? entry.effects.find((e) => e.effectType === 'ac_cap_stone_layer') : null
                    const sr = se != null ? se.value : null
                    const sl = isFormulaValue(sr) ? formatFormulaLabel(sr) : null
                    const sv = sl == null && sr != null ? Number(sr) : null
                    const nameExtra =
                      sl || (sv != null && !Number.isNaN(sv) && sv > 0) ? (
                        <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
                          {sl ?? `${sv}层`}
                        </span>
                      ) : (Number(entry.magicBonus) || 0) > 0 ? (
                        <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
                      ) : null
                    const stackLb = getInventoryEntryStackWeightLb(entry)
                    const showCharge = (Number(entry.charge) || 0) > 0 || hasContainedSpellEffect(entry)
                    const topItemBrief = getEntryBriefFull(entry)
                    const topItemBriefKey = `ati-${rowKey}`
                    return (
                      <div
                        key={rowKey}
                        className={`${teamBackpackItemCardClass} cursor-grab active:cursor-grabbing`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragEnd={handleDragEnd}
                        onDragOverCapture={handleDragOver}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnArcaneTopRow(e, i)}
                      >
                        <div className={teamBagRowGrid}>
                          <div className="shrink-0 flex items-center justify-center min-h-7 text-dnd-text-muted pointer-events-none select-none" aria-hidden>
                            <DragHandleIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className={`min-w-0 ${inventoryItemNameRowClass}`}>
                            <InventoryItemBriefChevron
                              brief={topItemBrief}
                              expanded={!!warehouseItemBriefOpen[topItemBriefKey]}
                              onToggle={() =>
                                setWarehouseItemBriefOpen((p) => ({ ...p, [topItemBriefKey]: !p[topItemBriefKey] }))
                              }
                            />
                            <div className={inventoryItemNameTitleGroupClass}>
                              <span className={inventoryItemNameTextClass}>{displayName(entry)}</span>
                              <span className={inventoryItemNameExtrasClass}>{nameExtra}</span>
                              {hasContainedSpellEffect(entry) && (
                                <ContainedSpellUseButton
                                  entry={entry}
                                  onChargeChange={(v) => setCharge(i, v)}
                                  compact
                                />
                              )}
                            </div>
                            {showCharge ? (
                              <span
                                className={inventoryItemChargeCellClass}
                                onMouseDown={(e) => e.stopPropagation()}
                                role="presentation"
                              >
                                <span className="shrink-0 leading-none">充能</span>
                                <div className="w-[5.125rem] shrink-0 max-w-full">
                                  <NumberStepper value={Number(entry.charge) || 0} onChange={(v) => setCharge(i, v)} min={0} compact pill subtle />
                                </div>
                              </span>
                            ) : (
                              <span className={inventoryItemChargeCellClass} aria-hidden>
                                <span className="opacity-0 select-none">—</span>
                              </span>
                            )}
                            <span className={inventoryItemQtyWeightCellClass}>
                              <div
                                className="flex shrink-0 min-h-7 items-center justify-end gap-1 text-[10px] text-dnd-text-muted"
                                onMouseDown={(e) => e.stopPropagation()}
                                role="presentation"
                              >
                                <span className="shrink-0 leading-none">数量</span>
                                <div className="w-[5.125rem] shrink-0 max-w-full">
                                  <NumberStepper value={qty} onChange={(v) => setQty(i, v)} min={1} compact pill subtle />
                                </div>
                              </div>
                              <div className="flex shrink-0 min-h-7 w-16 items-center justify-end text-[10px] tabular-nums whitespace-nowrap">
                                {stackLb > 0 ? (
                                  <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                                ) : (
                                  <span className="opacity-0 select-none text-dnd-text-muted" aria-hidden>
                                    —
                                  </span>
                                )}
                              </div>
                            </span>
                          </div>
                          <div
                            className={inventoryItemActionsCellClass}
                            onMouseDown={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <button type="button" onClick={() => openDeposit(i)} title="存入角色" className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20">
                              <Package size={14} />
                            </button>
                            <button type="button" onClick={() => startEdit(i)} title="编辑" className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20">
                              <Pencil size={14} />
                            </button>
                            <button type="button" onClick={() => handleRemove(i)} title="移除" className="p-1 rounded text-dnd-red hover:text-dnd-red/20">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <InventoryItemBriefExpandedText
                          brief={topItemBrief}
                          expanded={!!warehouseItemBriefOpen[topItemBriefKey]}
                          variant="body"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              {list.length > 0 ? (
                <div
                  className="rounded-lg border border-dashed border-dnd-gold/25 bg-[#151c28]/30 py-3 px-2 text-center text-dnd-text-muted text-[10px]"
                  onDragOverCapture={handleDragOver}
                  onDrop={handleWarehouseTableDrop}
                >
                  重排区：拖放到此处 → 移至列表末尾（末尾同名则合并）。拖到上方各物品卡上可插到该行位置或合并。
                </div>
              ) : null}
            </div>
        </div>
      </div>

      {/* 魔法物品制作工厂 */}
      <section className="mt-8">
        <MagicCraftingPanel />
      </section>

      {/* 存入角色弹窗（样式与背包「存到团队仓库」一致） */}
      {depositContext && depositModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeDepositModal}>
          <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-4 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-dnd-gold-light text-sm font-bold mb-2">存入角色</p>
            {depositContext.type === 'bag' ? (
              <p className="text-dnd-text-muted text-[10px] mb-1">
                来源：{getCharacter(depositContext.sourceCharId)?.name || '未命名'} 的公家次元袋 → 目标角色身上背包
              </p>
            ) : depositContext.type === 'nested' ? (
              <p className="text-dnd-text-muted text-[10px] mb-1">
                来源：秘法箱次元袋内 → 目标角色
              </p>
            ) : null}
            <p className="text-dnd-text-muted text-xs mb-2">
              当前：{displayName(depositModalEntry)} ×{' '}
              {depositModalEntry?.walletCurrencyId === 'gem_lb'
                ? formatDisplayWeightLb(safeParseQty(depositModalEntry.qty))
                : depositModalEntry?.walletCurrencyId
                  ? Math.floor(safeParseQty(depositModalEntry.qty))
                  : depositModalEntry.qty}
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-dnd-text-muted text-xs shrink-0">选择角色</label>
                <select
                  value={depositCharId}
                  onChange={(e) => {
                    setDepositCharId(e.target.value)
                    setDepositTargetBagModuleId('')
                  }}
                  className={inputClass + ' h-10 w-full mt-1'}
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || '未命名'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-dnd-text-muted text-xs shrink-0">存放位置</label>
                <select
                  value={depositTargetBagModuleId}
                  onChange={(e) => setDepositTargetBagModuleId(e.target.value)}
                  className={inputClass + ' h-10 w-full mt-1'}
                >
                  <option value="">角色背包</option>
                  {(() => {
                    const targetChar = characters.find((c) => c.id === depositCharId)
                    const mods = targetChar ? getNormalizedBagModules(targetChar) : []
                    return mods.map((m, i) => (
                      <option key={m.id} value={m.id}>
                        次元袋 #{i + 1}{m.visibility === 'public' ? '（公家）' : '（私人）'}
                      </option>
                    ))
                  })()}
                </select>
              </div>
              {(() => {
                const maxDepositQty = depositModalEntry?.walletCurrencyId === 'gem_lb'
                  ? Math.max(0, safeParseQty(depositModalEntry?.qty))
                  : depositModalEntry?.walletCurrencyId
                    ? Math.max(0, Math.floor(safeParseQty(depositModalEntry?.qty)))
                    : Math.max(1, safeParseQty(depositModalEntry?.qty) || 1)
                const stepGem = depositModalEntry?.walletCurrencyId === 'gem_lb' ? 0.1 : 1
                const minDep = depositModalEntry?.walletCurrencyId ? 0 : 1
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-10 shrink-0 text-dnd-text-muted text-xs">数量</span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="max-w-[min(100%,11rem)] w-full shrink-0 min-w-0">
                        <NumberStepper
                          value={depositQty}
                          min={minDep}
                          max={Math.max(minDep, maxDepositQty)}
                          step={stepGem}
                          onChange={(v) => setDepositQty(v)}
                          compact
                        />
                      </div>
                      <span className="shrink-0 self-center font-mono text-sm tabular-nums leading-none text-dnd-text-muted whitespace-nowrap">
                        / {maxDepositQty}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeDepositModal} className="h-10 px-4 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-bold text-sm">取消</button>
              <button type="button" onClick={confirmDeposit} disabled={!depositCharId || isDepositing} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">{isDepositing ? '存入中...' : '确认存入'}</button>
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
