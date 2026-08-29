import { useMemo, useState, useEffect, useCallback } from 'react'
import { Package, Plus, Trash2, Pencil, ChevronDown, ChevronRight, Lock, Unlock } from 'lucide-react'
import DragHandleIcon from './DragHandleIcon'
import {
  getBagOfHoldingSelfWeightLb,
  getInventoryEntryStackWeightLb,
  formatDisplayWeightLb,
  formatDisplayGemLbQty,
} from '../lib/encumbrance'
import { getPublicBagModuleCapacityLimits } from '../lib/teamCurrencyPublicBags'
import { normalizeBagOfHoldingVisibility } from '../lib/bagOfHoldingVisibility'
import {
  entryBelongsToBagModule,
  MAX_BAG_OF_HOLDING_TOTAL,
  MAX_BAG_OF_HOLDING_MODULES,
  compareBagInventoryDisplayOrder,
} from '../lib/bagOfHoldingModules'
import { getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'
import { NumberStepper } from './BuffForm'
import { isFormulaValue, formatFormulaLabel } from '../lib/formulas'
import { inputClassInline } from '../lib/inputStyles'
import { hasContainedSpellEffect } from '../lib/containedSpellModel'
import ContainedSpellUseButton from './ContainedSpellUseButton'
import {
  inventoryItemCardListGapClass,
  inventoryItemActionsCellClass,
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
} from '../lib/inventoryItemCardStyles'
import { InventoryItemBriefExpandedText } from './InventoryItemCardBrief'

function collapseStorageKey(characterId) {
  return characterId ? `dnd-bag-panel-collapsed-${characterId}` : 'dnd-bag-panel-collapsed'
}

/**
 * 统一处理「身上物品 / 背包货币行 / 个人持有 ⋮ 货币」拖入某一模块袋内。
 * 供袋内虚线区、袋底入袋条、下方次元袋面板的快捷投放条共用。
 */
/** 从拖放数据中解析背包 inventory 下标（优先 text/plain，兼容 Safari/部分内核） */
export function parseDragInventoryIndex(dataTransfer) {
  const plain = dataTransfer.getData('text/plain') || ''
  const m = /\binv:(\d+)\b/.exec(plain)
  if (m) {
    const n = parseInt(m[1], 10)
    if (!Number.isNaN(n)) return n
  }
  const raw = parseInt(dataTransfer.getData('text/dnd-character-inv'), 10)
  return Number.isNaN(raw) ? NaN : raw
}

export function deliverBagDrop(e, { canEdit, mod, totalBags, onMoveToBag, onMoveCurrencyToBag }) {
  e.preventDefault()
  /** 阻止冒泡到背包表外层 td/tr 的 handleBackpackRowDrop，否则会再执行一次「排序」把物品插到次元袋下一行 */
  e.stopPropagation()
  if (!canEdit || !mod || totalBags <= 0) return
  const wc = e.dataTransfer.getData('text/dnd-wallet-currency')
  const wcQty = Number(e.dataTransfer.getData('text/dnd-wallet-currency-qty'))
  if (wc && onMoveCurrencyToBag) {
    onMoveCurrencyToBag(wc, mod.id, Number.isFinite(wcQty) ? wcQty : undefined)
    return
  }
  if (!onMoveToBag) return
  const fromIndex = parseDragInventoryIndex(e.dataTransfer)
  if (Number.isNaN(fromIndex)) return
  onMoveToBag(fromIndex, mod.id)
}

/**
 * 次元袋：可多个模块；每模块独立「次元袋个数」+ 私人/公家 + 袋内表。
 * 公家模块在团队仓库页列出并可与秘法箱互通；私人仅本角色卡可见。
 */
export default function BagOfHoldingPanel({
  bagModules,
  onAddModule,
  onRemoveModule,
  onSetModuleBagCount,
  onSetModuleVisibility,
  /** 若提供则替代 getPublicBagModuleCapacityLimits（如秘法箱内次元袋实体行） */
  getBagCapacityLimits,
  /** 底部说明；undefined 用默认文案；null 不渲染 */
  footerNote,
  inventory,
  onMoveToBag,
  onMoveCurrencyToBag,
  canEdit,
  invDisplayName,
  getEntryBriefFull,
  /** 袋内行内编辑：(背包 inventory 下标, { qty?, charge? }) */
  onPatchBagItem,
  /** 操作列：inventory 全局下标（与 onPatchBagItem 一致） */
  onBagRowEdit,
  onBagRowStore,
  onBagRowRemove,
  /** 用于折叠状态持久化 */
  characterId,
  /** 为 true 时不列出各模块（模块已在背包表锚点行下展开），仅保留标题栏与说明 */
  hideModuleList = false,
}) {
  const modules = Array.isArray(bagModules) ? bagModules : []
  const canAddMoreModules = modules.length < MAX_BAG_OF_HOLDING_MODULES

  /** 各模块内容区展开：新建时私人默认展开，公家默认折叠 */
  const [moduleExpanded, setModuleExpanded] = useState({})
  useEffect(() => {
    setModuleExpanded((prev) => {
      const next = { ...prev }
      for (const m of modules) {
        if (next[m.id] === undefined) {
          next[m.id] = normalizeBagOfHoldingVisibility(m.visibility) !== 'public'
        }
      }
      for (const id of Object.keys(next)) {
        if (!modules.some((m) => m.id === id)) delete next[id]
      }
      return next
    })
  }, [modules])

  const toggleModuleExpanded = useCallback((moduleId) => {
    setModuleExpanded((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }, [])

  /** 删除整个次元袋模块：默认上锁，需先点锁解锁再点垃圾桶，减少与袋内行删除误触 */
  const [moduleDeleteUnlocked, setModuleDeleteUnlocked] = useState({})
  useEffect(() => {
    setModuleDeleteUnlocked((prev) => {
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (!modules.some((m) => m.id === id)) delete next[id]
      }
      return next
    })
  }, [modules])

  const toggleModuleDeleteLock = useCallback((moduleId) => {
    setModuleDeleteUnlocked((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }, [])

  const handleSetModuleVisibility = useCallback(
    (modId, visibility) => {
      onSetModuleVisibility?.(modId, visibility)
      const pub = normalizeBagOfHoldingVisibility(visibility) === 'public'
      setModuleExpanded((prev) => ({ ...prev, [modId]: !pub }))
    },
    [onSetModuleVisibility],
  )

  const [panelCollapsed, setPanelCollapsed] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(collapseStorageKey(characterId))
      setPanelCollapsed(v === '1')
    } catch {
      setPanelCollapsed(false)
    }
  }, [characterId])

  const togglePanelCollapsed = () => {
    setPanelCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(collapseStorageKey(characterId), next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  /** 所有模块袋内物品合计重量（不含次元袋自重） */
  const allBagContentsTotalLb = useMemo(() => {
    let s = 0
    for (const m of modules) {
      const rows = inventory
        .map((entry, i) => ({ entry, i }))
        .filter(({ entry }) => entryBelongsToBagModule(entry, m, modules))
      for (const { entry } of rows) {
        s += getInventoryEntryStackWeightLb(entry)
      }
    }
    return Math.round(s * 10) / 10
  }, [inventory, modules])

  const handleDragStart = (e, globalIndex) => {
    e.dataTransfer.setData('text/dnd-character-inv', String(globalIndex))
    e.dataTransfer.setData('text/dnd-from-bag', '1')
    e.dataTransfer.setData('text/plain', `bag-inv:${globalIndex}`)
    if (characterId) {
      e.dataTransfer.setData('text/dnd-bag-source-char-id', characterId)
    }
    e.dataTransfer.effectAllowed = 'copyMove'
    ;(e.currentTarget.closest('[data-bag-item-card]') ?? e.currentTarget).classList.add('opacity-60')
  }
  const handleDragEnd = (e) =>
    (e.currentTarget.closest('[data-bag-item-card]') ?? e.currentTarget).classList.remove('opacity-60')
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copyMove'
  }

  const iconBtn =
    'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border border-gray-500/70 bg-gray-800/90 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
  const removeBagBtn =
    'inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-lg border border-dnd-red/60 bg-gray-800/90 text-dnd-red hover:bg-dnd-red/20 hover:border-dnd-red/80 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800/90 disabled:hover:border-dnd-red/60'
  const renderNameExtras = (entry) => {
    const stoneEffect = Array.isArray(entry?.effects) ? entry.effects.find((x) => x.effectType === 'ac_cap_stone_layer') : null
    const stoneRaw = stoneEffect != null ? stoneEffect.value : null
    const stoneLabel = isFormulaValue(stoneRaw) ? formatFormulaLabel(stoneRaw) : null
    const stoneVal = stoneLabel == null && stoneRaw != null ? Number(stoneRaw) : null
    if (stoneLabel || (stoneVal != null && !Number.isNaN(stoneVal) && stoneVal > 0)) {
      return (
        <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0" title="瓦石层">
          {stoneLabel ?? `${stoneVal}层`}
        </span>
      )
    }
    if ((Number(entry.magicBonus) || 0) > 0) {
      return <span className="text-dnd-gold-light/90 text-xs font-mono tabular-nums shrink-0">+{entry.magicBonus}</span>
    }
    return null
  }

  const tableColSpan = canEdit ? 5 : 3
  const patchBag = typeof onPatchBagItem === 'function' ? onPatchBagItem : null
  const hasBagRowActions =
    canEdit &&
    typeof onBagRowEdit === 'function' &&
    typeof onBagRowStore === 'function' &&
    typeof onBagRowRemove === 'function'

  const renderBagActionCell = (entry, globalIndex) => {
    if (!canEdit) return null
    if (!hasBagRowActions) {
      return <span className="text-dnd-text-muted text-xs">—</span>
    }
    const isWallet = !!entry?.walletCurrencyId
    return (
      <div
        className="flex flex-nowrap items-center justify-center gap-0.5 min-w-0 max-w-full shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <button
          type="button"
          onClick={() => onBagRowStore(globalIndex)}
          title="存到团队仓库"
          className="p-1 rounded text-emerald-400 hover:bg-emerald-400/20 shrink-0 disabled:opacity-35 disabled:pointer-events-none"
        >
          <Package size={14} />
        </button>
        <button
          type="button"
          onClick={() => onBagRowEdit(globalIndex)}
          disabled={isWallet}
          title={isWallet ? '钱币请用数量列调整' : '编辑'}
          className="p-1 rounded text-dnd-gold-light hover:bg-dnd-gold/20 shrink-0 disabled:opacity-35 disabled:pointer-events-none"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onBagRowRemove(globalIndex)}
          title={isWallet ? '删除并将钱币退回个人持有' : '移除'}
          className="p-1 rounded text-dnd-red hover:text-dnd-red/20 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dnd-gold/40 bg-[#1b2738]/80 overflow-hidden flex flex-col min-h-0 min-w-0 h-full">
      <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider px-2 py-1.5 border-b border-white/10 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
        <span className="flex items-center gap-1 min-w-0 shrink-0">
          <Package className="w-3.5 h-3.5 shrink-0" aria-hidden />
          次元袋
        </span>
        {modules.length > 0 && allBagContentsTotalLb > 0 ? (
          <span
            className="text-dnd-text-muted text-[10px] tabular-nums shrink-0"
            title="所有模块袋内物品合计重量（不含次元袋自重）"
          >
            合计 <span className="text-dnd-gold-light/95 font-semibold">{formatDisplayWeightLb(allBagContentsTotalLb)}</span> lb
          </span>
        ) : null}
        <span className="flex-1 min-w-[1rem]" aria-hidden />
        {canEdit && onAddModule && (
          <button
            type="button"
            onClick={onAddModule}
            disabled={!canAddMoreModules}
            className={iconBtn}
            title={canAddMoreModules ? '添加次元袋模块' : `已达模块上限（${MAX_BAG_OF_HOLDING_MODULES} 个）`}
            aria-label="添加次元袋模块"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={togglePanelCollapsed}
          className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg border border-white/15 bg-[#151c28]/80 text-gray-300 hover:bg-white/10 hover:text-white"
          title={panelCollapsed ? '展开' : '折叠'}
          aria-expanded={!panelCollapsed}
          aria-label={panelCollapsed ? '展开次元袋' : '折叠次元袋'}
        >
          {panelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </h3>
      {hideModuleList && modules.length > 0 && (
        <div className="px-2 py-2 border-b border-white/10 space-y-2 bg-[#151c28]/45">
          <p className="text-dnd-text-muted text-[11px] leading-relaxed">
            <strong className="text-dnd-text-body">投放区</strong>（折叠右侧「次元袋」面板时仍显示）：从背包<strong className="text-dnd-text-body">⋮ 列或名称列</strong>起拖入对应模块；货币请从<strong className="text-dnd-text-body">个人持有</strong>拖 ⋮ 柄。
          </p>
          <div className="space-y-1.5">
            {modules.map((mod, ix) => {
              const tb = Math.max(0, Math.floor(Number(mod?.bagCount) || 0))
              const allowDrop = canEdit && tb > 0
              return (
                <div
                  key={mod.id}
                  onDragEnter={
                    allowDrop
                      ? (ev) => {
                          ev.preventDefault()
                          ev.dataTransfer.dropEffect = 'copyMove'
                        }
                      : undefined
                  }
                  onDragOver={
                    allowDrop
                      ? (ev) => {
                          ev.preventDefault()
                          ev.dataTransfer.dropEffect = 'copyMove'
                        }
                      : undefined
                  }
                  onDrop={
                    canEdit
                      ? (ev) =>
                          deliverBagDrop(ev, {
                            canEdit,
                            mod,
                            totalBags: tb,
                            onMoveToBag,
                            onMoveCurrencyToBag,
                          })
                      : undefined
                  }
                  className={`rounded-md border border-dashed px-2 py-2 min-h-[2.5rem] flex flex-col justify-center gap-0.5 ${
                    tb > 0
                      ? 'border-dnd-gold/40 bg-[#151c28]/55 hover:border-dnd-gold/60'
                      : 'border-white/10 bg-[#151c28]/30 opacity-70'
                  }`}
                  title={
                    tb > 0
                      ? '拖背包身上物品、背包货币行，或个人持有货币的 ⋮ 柄至此入袋'
                      : '请先在背包表将该模块「袋个数」调到至少 1'
                  }
                >
                  <span className="text-[11px] text-dnd-gold-light/95 font-medium">
                    模块 {ix + 1} · {normalizeBagOfHoldingVisibility(mod.visibility) === 'public' ? '公家' : '私人'}
                  </span>
                  <span className="text-[10px] text-dnd-text-muted leading-snug">
                    {tb > 0 ? '拖放到此处入袋' : '袋个数为 0 时无法投放'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {!panelCollapsed && (
        <div className="p-2 space-y-2 flex-1 min-h-0 flex flex-col text-xs">
          {modules.length === 0 ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-dnd-text-muted text-[11px] leading-relaxed flex-1 min-w-0">
                当前无存档次元袋。点击标题行右侧 <span className="text-dnd-text-body">+</span> 添加<strong className="text-dnd-text-body">第一个</strong>
                模块；之后可继续增加模块，把<strong className="text-dnd-text-body">公用</strong>与
                <strong className="text-dnd-text-body">私人</strong>物品分到不同袋组。<strong className="text-dnd-text-body">公家</strong>袋会出现在
                团队仓库页并与秘法箱互通。
              </p>
            </div>
          ) : hideModuleList ? (
            <p className="text-dnd-text-muted text-[11px] leading-relaxed px-0.5">
              各模块的<strong className="text-dnd-text-body">投放条在标题下方</strong>（折叠本区也可用）。查看袋内表请在背包中展开对应「次元袋」行。
            </p>
          ) : (
            modules.map((mod, modIndex) => (
              <BagModuleSection
                key={mod.id}
                mod={mod}
                modIndex={modIndex}
                modules={modules}
                characterId={characterId}
                inventory={inventory}
                canEdit={canEdit}
                patchBag={patchBag}
                hasBagRowActions={hasBagRowActions}
                renderBagActionCell={renderBagActionCell}
                renderNameExtras={renderNameExtras}
                invDisplayName={invDisplayName}
                getEntryBriefFull={getEntryBriefFull}
                onSetModuleBagCount={onSetModuleBagCount}
                onSetModuleVisibility={handleSetModuleVisibility}
                onRemoveModule={onRemoveModule}
                getBagCapacityLimits={getBagCapacityLimits}
                moduleDeleteUnlocked={!!moduleDeleteUnlocked[mod.id]}
                onToggleModuleDeleteLock={() => toggleModuleDeleteLock(mod.id)}
                iconBtn={iconBtn}
                removeBagBtn={removeBagBtn}
                tableColSpan={tableColSpan}
                handleDragStart={handleDragStart}
                handleDragEnd={handleDragEnd}
                handleDragOver={handleDragOver}
                onMoveToBag={onMoveToBag}
                onMoveCurrencyToBag={onMoveCurrencyToBag}
                expanded={moduleExpanded[mod.id] !== false}
                onToggleExpanded={() => toggleModuleExpanded(mod.id)}
              />
            ))
          )}
          {modules.length > 0 && footerNote !== null ? (
            footerNote === undefined ? (
              <p className="text-dnd-text-muted leading-snug text-[11px] border-t border-white/10 pt-2">
                负重只算背包、钱币与各模块次元袋自重，不提高负重上限；袋内物品不计入背负。
                <strong className="text-dnd-text-body">公家</strong>模块会同步到团队仓库。
              </p>
            ) : (
              footerNote
            )
          ) : null}
        </div>
      )}
    </div>
  )
}

export function BagModuleSection({
  mod,
  modIndex,
  modules,
  characterId,
  inventory,
  canEdit,
  patchBag,
  hasBagRowActions,
  renderBagActionCell,
  renderNameExtras,
  invDisplayName,
  getEntryBriefFull,
  onSetModuleBagCount,
  onSetModuleVisibility,
  onRemoveModule,
  getBagCapacityLimits,
  moduleDeleteUnlocked,
  onToggleModuleDeleteLock,
  iconBtn,
  removeBagBtn,
  tableColSpan: _legacyTableColSpan,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  onMoveToBag,
  onMoveCurrencyToBag,
  expanded,
  onToggleExpanded,
  /** 为 true 时不渲染模块标题行（模块/个数/可见性/锁删），仅袋内表+拖放区；用于背包「锚点行」已承载这些控件时 */
  hideModuleChrome = false,
}) {
  const totalBags = mod ? mod.bagCount : 0
  const selfLb = getBagOfHoldingSelfWeightLb(totalBags)
  const isPublic = normalizeBagOfHoldingVisibility(mod.visibility) === 'public'

  const bagRows = useMemo(() => {
    if (!mod) return []
    const rows = inventory
      .map((entry, i) => ({ entry, i }))
      .filter(({ entry }) => entryBelongsToBagModule(entry, mod, modules))
    rows.sort((a, b) => compareBagInventoryDisplayOrder(a.entry, a.i, b.entry, b.i))
    return rows
  }, [inventory, mod, modules])

  const bagContentsTotalLb = useMemo(() => {
    let s = 0
    for (const { entry } of bagRows) {
      s += getInventoryEntryStackWeightLb(entry)
    }
    return Math.round(s * 10) / 10
  }, [bagRows])

  const bagCap =
    typeof getBagCapacityLimits === 'function' && mod
      ? getBagCapacityLimits(mod)
      : characterId && mod
        ? getPublicBagModuleCapacityLimits(characterId, mod.id)
        : { maxLb: 0, maxCuFt: 0, bagCount: 0 }

  const handleDropZone = (e) =>
    deliverBagDrop(e, { canEdit, mod, totalBags, onMoveToBag, onMoveCurrencyToBag })

  /** 物品卡详情：默认折叠，点名称行右侧 chevron 展开（与背包、团队仓库一致） */
  const [itemBriefOpen, setItemBriefOpen] = useState({})
  const itemBriefKey = (entry, rowIdx) => `${mod.id}:${entry?.id ?? `r-${rowIdx}`}`
  const toggleItemBrief = (key) => setItemBriefOpen((p) => ({ ...p, [key]: !p[key] }))

  const visLabelId = `bag-vis-label-${mod.id}`
  const countLabelId = `bag-count-label-${mod.id}`

  const expandedContent = (
    <>
      {totalBags <= 0 ? (
        <p
          className={`text-dnd-text-muted text-[11px] leading-snug ${
            hideModuleChrome ? 'px-1 pb-1 pt-0' : 'px-2 pb-2 pt-1'
          }`}
        >
          {hideModuleChrome
            ? '将上方「袋个数」调到至少 1 后出现袋内拖放区。'
            : '将「次元袋个数」调到至少 1 后出现袋内拖放区。'}
        </p>
      ) : (
        <div
          onDragEnter={canEdit ? handleDragOver : undefined}
          onDragOver={canEdit ? handleDragOver : undefined}
          onDrop={canEdit ? handleDropZone : undefined}
          className={
            hideModuleChrome
              ? 'rounded-b-md rounded-t-sm bg-[#0f141d]/40 flex flex-col min-h-[64px] max-h-[min(32vh,18rem)] overflow-hidden'
              : 'flex flex-col min-h-[88px] max-h-[min(32vh,18rem)] overflow-hidden'
          }
          title={
            canEdit
              ? hideModuleChrome
                ? '袋内区域与上方次元袋为同一张卡；可在此松手入袋，或使用下方灰条'
                : '列表区域内、下方灰条均可松手入袋；背包整行可拖（勿从数字、按钮上起拖）；个人持有拖货币 ⋮ 柄'
              : ''
          }
        >
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
            <div className={`flex flex-col min-w-0 ${inventoryItemCardListGapClass} ${hideModuleChrome ? 'p-1.5' : 'p-2'}`}>
              {bagRows.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed border-gray-600/80 bg-[#151c28]/40 py-8 px-3 text-center text-gray-500 text-[11px] leading-relaxed min-h-[4.5rem]"
                >
                  {canEdit ? '暂无。可拖入背包内物品，或将个人持有中货币的 ⋮ 柄拖入此处。' : '—'}
                </div>
              ) : (
                bagRows.map(({ entry, i }) => {
                  const qty = Math.max(1, Number(entry?.qty) ?? 1)
                  const brief = getEntryBriefFull ? getEntryBriefFull(entry) : ''
                  const stackLb = getInventoryEntryStackWeightLb(entry)
                  const walletQtyDisplay =
                    entry?.walletCurrencyId === 'gem_lb'
                      ? Math.max(0, Number(entry?.qty) || 0)
                      : Math.max(0, Math.floor(Number(entry?.qty) || 0))
                  const bagItemCardClass = inventoryItemCardShellClass
                  /** 钱币行：充能格占位「—」，固定 6 列与物品行对齐 */
                  const bagRowGridCurrency = canEdit
                    ? inventoryItemRowGridEditableWithCharge
                    : inventoryItemRowGridReadWithCharge

                  if (entry?.walletCurrencyId) {
                    const cfg = getCurrencyById(entry.walletCurrencyId)
                    const label = cfg ? getCurrencyDisplayName(cfg) : entry?.name ?? '—'
                    const walletBriefHelp = isPublic
                      ? '公家袋钱币数量请在团队仓库页通过「货币与金库」与拖移调整；此处只读。'
                      : '袋内钱币数量不在此修改；请用个人持有与拖移在钱包、背包、次元袋间调配。'
                    const wbKey = itemBriefKey(entry, i)
                    return (
                      <div
                        key={entry.id ?? `bag-${mod.id}-wc-${i}`}
                        data-bag-item-card
                        draggable={!!canEdit}
                        onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                        onDragEnd={canEdit ? handleDragEnd : undefined}
                        className={`${bagItemCardClass} cursor-pointer ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        onClick={() => toggleItemBrief(wbKey)}
                      >
                        <div className={bagRowGridCurrency}>
                          {canEdit && (
                            <div
                              className="shrink-0 text-dnd-text-muted pointer-events-none select-none"
                              title="拖回背包"
                              aria-hidden
                            >
                              <DragHandleIcon className="w-3.5 h-3.5 opacity-60" />
                            </div>
                          )}
                          <div className={inventoryItemNameRowClass}>
                            <div className="min-w-0 flex-1 leading-tight">
                              <span className="text-[10px] text-dnd-text-muted">钱币</span>
                              <span className="text-dnd-gold-light/95 font-medium text-sm truncate block">{label}</span>
                            </div>
                          </div>
                          <span
                            className={inventoryItemQtyWeightCellClass}
                            onMouseDown={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <span className="shrink-0 leading-none">数量</span>
                            <span className="text-dnd-text-body text-xs font-semibold tabular-nums">
                              {entry.walletCurrencyId === 'gem_lb'
                                ? formatDisplayGemLbQty(walletQtyDisplay)
                                : walletQtyDisplay}
                            </span>
                            {stackLb > 0 ? (
                              <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                            ) : null}
                          </span>
                          {canEdit && (
                            <div
                              className={inventoryItemActionsCellClass}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              role="presentation"
                            >
                              {renderBagActionCell(entry, i)}
                            </div>
                          )}
                        </div>
                        <InventoryItemBriefExpandedText
                          brief={walletBriefHelp}
                          expanded={!!itemBriefOpen[wbKey]}
                          variant="muted"
                        />
                      </div>
                    )
                  }

                  const showChargeCol = (Number(entry.charge) || 0) > 0 || hasContainedSpellEffect(entry)
                  const bagRowGridItem = canEdit
                    ? showChargeCol
                      ? inventoryItemRowGridEditableWithCharge
                      : inventoryItemRowGridEditableNoCharge
                    : showChargeCol
                      ? inventoryItemRowGridReadWithCharge
                      : inventoryItemRowGridReadNoCharge
                  const ibKey = itemBriefKey(entry, i)

                  return (
                    <div
                      key={entry.id ?? `bag-${mod.id}-${i}`}
                      data-bag-item-card
                      draggable={!!canEdit}
                      onDragStart={canEdit ? (e) => handleDragStart(e, i) : undefined}
                      onDragEnd={canEdit ? handleDragEnd : undefined}
                      className={`${bagItemCardClass} cursor-pointer ${canEdit ? 'cursor-grab active:cursor-grabbing hover:border-gray-500/65' : ''}`}
                      onClick={() => toggleItemBrief(ibKey)}
                    >
                      <div className={bagRowGridItem}>
                        {canEdit && (
                          <div
                            className="shrink-0 text-dnd-text-muted pointer-events-none select-none"
                            title="拖回背包"
                            aria-hidden
                          >
                            <DragHandleIcon className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div className={inventoryItemNameRowClass}>
                          <div className={inventoryItemNameTitleGroupClass}>
                            <span className={inventoryItemNameTextClass}>{invDisplayName(entry)}</span>
                            <span className={inventoryItemNameExtrasClass}>{renderNameExtras(entry)}</span>
                            {hasContainedSpellEffect(entry) && (
                              <ContainedSpellUseButton
                                entry={entry}
                                onChargeChange={(v) => patchBag(i, { charge: v })}
                              />
                            )}
                          </div>
                        </div>
                        {showChargeCol ? (
                          <span
                            className={`${inventoryItemChargeCellClass} self-stretch`}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            <span className="shrink-0 leading-none">充能</span>
                            {canEdit && patchBag ? (
                              <NumberStepper
                                value={Number(entry.charge) || 0}
                                onChange={(v) => patchBag(i, { charge: v })}
                                min={0}
                                compact
                                pill
                                subtle
                              />
                            ) : (
                              <span className="text-dnd-text-body text-xs tabular-nums">{entry.charge}</span>
                            )}
                          </span>
                        ) : null}
                        <span
                          className={`${inventoryItemQtyWeightCellClass} self-stretch`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <span className="shrink-0 leading-none">数量</span>
                          {canEdit && patchBag ? (
                            <NumberStepper
                              value={qty}
                              onChange={(v) => patchBag(i, { qty: v })}
                              min={1}
                              compact
                              pill
                              subtle
                            />
                          ) : (
                            <span className="text-dnd-text-body text-xs tabular-nums">{qty}</span>
                          )}
                          {stackLb > 0 ? (
                            <span className="text-dnd-text-body">{formatDisplayWeightLb(stackLb)} lb</span>
                          ) : null}
                        </span>
                        {canEdit && (
                          <div
                            className={inventoryItemActionsCellClass}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            role="presentation"
                          >
                            {renderBagActionCell(entry, i)}
                          </div>
                        )}
                      </div>
                      <InventoryItemBriefExpandedText brief={brief} expanded={!!itemBriefOpen[ibKey]} variant="body" />
                    </div>
                  )
                })
              )}
            </div>
          </div>
          {canEdit ? (
            <div
              className={
                hideModuleChrome
                  ? 'shrink-0 border-t border-white/[0.06] bg-[#0c1018]/80 px-2 py-1'
                  : 'shrink-0 border-t border-white/[0.06] bg-[#141c28]/90 px-2 py-1.5'
              }
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDrop={handleDropZone}
              title="袋内列表较长时，拖到此处更易入袋"
            >
              <p className="text-[10px] text-dnd-text-muted text-center leading-snug">
                {hideModuleChrome
                  ? '拖到此条入袋 · 或松手在上方列表区域内'
                  : '拖放到此条入袋 · 或松手在上方列表区域内'}
              </p>
            </div>
          ) : null}
        </div>
      )}
      {!hideModuleChrome ? (
        <p className="text-dnd-text-muted text-[10px] px-2 pb-2 leading-snug">
          本模块次元袋自重约 <span className="text-dnd-gold-light tabular-nums">{formatDisplayWeightLb(selfLb)}</span> lb（计入负重说明见上）。
        </p>
      ) : null}
    </>
  )

  if (hideModuleChrome) {
    if (!expanded) return null
    return <div className="min-w-0">{expandedContent}</div>
  }

  return (
    <div
      className={`rounded-lg overflow-hidden flex flex-col min-w-0 ${
        isPublic ? 'bg-[#152030]/35' : 'bg-[#151c28]/30'
      }`}
    >
      {/* 左右两组 flex：下拉不用 inputClass 的 w-full，避免 select 铺满后盖住右侧锁/删 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 border-b border-white/5 overflow-x-auto min-h-[2rem] justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleExpanded}
            className="flex items-center gap-1 min-w-0 max-w-full text-left rounded px-0.5 py-0.5 -ml-0.5 hover:bg-white/5 text-dnd-gold-light min-h-7"
            title={expanded ? '折叠本模块' : '展开本模块'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="w-4 h-4 shrink-0 text-dnd-text-muted" /> : <ChevronRight className="w-4 h-4 shrink-0 text-dnd-text-muted" />}
            <span className="text-[11px] font-semibold whitespace-nowrap shrink-0">
              模块 {modIndex + 1} · {isPublic ? '公家' : '私人'}
            </span>
            {totalBags > 0 && bagCap.maxLb > 0 ? (
              <span
                className="text-dnd-text-muted text-[10px] font-normal tabular-nums ml-1 truncate min-w-0"
                title={`${bagCap.bagCount} 个次元袋，总上限约 ${formatDisplayWeightLb(bagCap.maxLb)} lb（${bagCap.maxCuFt} ft³ 等效）`}
              >
                （袋内 {formatDisplayWeightLb(bagContentsTotalLb)} / {formatDisplayWeightLb(bagCap.maxLb)} lb）
              </span>
            ) : bagContentsTotalLb > 0 ? (
              <span className="text-dnd-text-muted text-[10px] font-normal tabular-nums ml-1 truncate min-w-0">
                （袋内 {formatDisplayWeightLb(bagContentsTotalLb)} lb）
              </span>
            ) : null}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <span id={countLabelId} className="text-dnd-text-muted text-[10px] font-medium whitespace-nowrap shrink-0 leading-none">
              次元袋个数
            </span>
            <div className="h-7 w-[6.5rem] shrink-0" aria-labelledby={countLabelId}>
              <NumberStepper
                value={mod.bagCount}
                onChange={(v) => onSetModuleBagCount?.(mod.id, v)}
                min={0}
                max={MAX_BAG_OF_HOLDING_TOTAL}
                compact
                disabled={!canEdit || !onSetModuleBagCount}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-dnd-text-muted text-[10px] font-medium whitespace-nowrap shrink-0 leading-none" id={visLabelId}>
              可见性
            </span>
            <select
              aria-labelledby={visLabelId}
              disabled={!canEdit || !onSetModuleVisibility}
              value={normalizeBagOfHoldingVisibility(mod.visibility)}
              onChange={(e) => onSetModuleVisibility?.(mod.id, e.target.value === 'public' ? 'public' : 'private')}
              title="私人：仅本角色卡可见，团队仓库不列出。公家（新建默认）：全体玩家可在团队仓库「公家次元袋」查看并与秘法箱互拖。"
              className={`${inputClassInline} box-border !h-7 w-[11rem] min-w-[11rem] max-w-[11rem] shrink-0 py-0 pl-1.5 pr-7 text-[11px] leading-none`}
            >
              <option value="public">公家（团队可见）</option>
              <option value="private">私人</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canEdit && onRemoveModule && (
            <>
              <button
                type="button"
                onClick={onToggleModuleDeleteLock}
                className={`p-1 rounded shrink-0 ${
                  moduleDeleteUnlocked ? 'text-emerald-400 hover:bg-emerald-400/20' : 'text-gray-300 hover:bg-white/10'
                }`}
                title={
                  moduleDeleteUnlocked
                    ? '模块删除已解锁：点击重新上锁，避免误删整个次元袋'
                    : '默认上锁：先点此解锁，再点右侧垃圾桶可删除整个模块（与下方袋内单行删除分开）'
                }
                aria-label={moduleDeleteUnlocked ? '锁定模块删除' : '解锁模块删除'}
                aria-pressed={moduleDeleteUnlocked}
              >
                {moduleDeleteUnlocked ? <Unlock size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
              </button>
              <button
                type="button"
                disabled={!moduleDeleteUnlocked}
                onClick={() => {
                  if (
                    !window.confirm(
                      '确定要删除此次元袋模块吗？\n\n删除后袋内物品会回到背包（身上）物品栏；此操作不可撤销。',
                    )
                  ) {
                    return
                  }
                  onRemoveModule(modIndex >= 0 ? modIndex : 0)
                }}
                className={removeBagBtn}
                title={
                  moduleDeleteUnlocked
                    ? '删除此次元袋模块'
                    : '请先点击左侧锁图标解锁后再删除整个模块'
                }
                aria-label="删除此次元袋模块"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && expandedContent}
    </div>
  )
}
