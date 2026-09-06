import React from 'react'
import { Sparkles, Shield, Pencil, Package, Trash2 } from 'lucide-react'
import { ShieldPoolCounter } from './CardView'
import { formatDisplayWeightLb } from '../lib/encumbrance'
import InfoTooltip from './InfoTooltip'
import ContainedSpellUseButton from './ContainedSpellUseButton'

const cellBorder = { borderRight: '1px solid #2a3a4e' }

/**
 * 装备物品卡 —— 7 列标准网格。
 *
 * Grid: 46px | 76px | 376px | 136px | 1fr | 90px | 76px  (height 52px)
 *
 * 关键设计：
 * - 同调标签竖排文字，可点击切换
 * - 名称区是能量条一体按钮（有主动技能/护盾池/内含法术时），内含充能步进器
 * - 数量+重量合并为单个90px单元格，分两个子列各自居中对齐
 * - 1fr 弹性空白列自动适配剩余宽度
 * - 最后一列三按钮：存 / 编 / 删
 */
export default function EquipmentItemCard({
  entry,
  invIndex,
  slotValue,
  canEdit,
  /** 'full'（默认）= 7 列含同调+槽位；'container' = 5 列，跳过同调与槽位列 */
  gridVariant = 'full',
  // Attunement
  isAttuned,
  attunedCount,
  maxAttunementSlots,
  onAttuneToggle,
  // Slot
  availableSlotGroups,
  onSlotChange,
  // Name / details
  displayName,
  magicBonus,
  brief,
  briefExpanded,
  onToggleBrief,
  // Charge / shield pool
  charge,
  maxCharge,
  onChargeChange,
  shieldPoolCurrent,
  shieldPoolMax,
  shieldPoolThreshold,
  onShieldPoolChange,
  // Active ability
  activeAbility,
  canUseAbilityFn,
  onUseAbility,
  // Contained spell
  hasContainedSpell,
  onContainedSpellCharge,
  containedSpellEntry,
  // Quantity / weight
  qty,
  onQtyChange,
  weightLb,
  showQty,
  // BUFF tags
  buffTags,
  // Actions
  onEdit,
  onStoreToVault,
  onDelete,
  // Tooltip
  tooltipContent,
  // Drag and drop
  draggable: isDraggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const attuneActive = !!isAttuned
  const attuneDisabled = !attuneActive && attunedCount >= maxAttunementSlots
  const hasActiveAbility = !!activeAbility
  const hasShieldPool = !hasActiveAbility && shieldPoolCurrent != null
  const displayCharge = maxCharge > 0 ? Math.min(charge, maxCharge) : charge
  const chargeRatio = maxCharge > 0 ? displayCharge / maxCharge : 0
  const shieldPoolRatio = hasShieldPool && shieldPoolMax > 0 ? shieldPoolCurrent / shieldPoolMax : 0
  const isLowCharge = hasShieldPool ? shieldPoolRatio < 0.3 : chargeRatio < 0.3

  const energyColor = hasShieldPool
    ? { border: 'rgba(30,64,120,0.6)', bar: 'linear-gradient(90deg, #0a1628, #1e3a5f, #1a5a6a, #2080a0)', barRight: '#2080a0', barLow: 'linear-gradient(90deg, #3a1515, #6b2020, #8b3030)', text: '#7ec8c0', badge: 'rgba(45,130,120,0.15)', badgeBorder: 'rgba(45,130,120,0.35)', highlight: '#38bdf8', stripe: '#40a8c0' }
    : { border: 'rgba(30,64,120,0.6)', bar: 'linear-gradient(90deg, #0a1628, #1e3a5f, #5a2040, #8b2030)', barRight: '#8b2030', barLow: 'linear-gradient(90deg, #3a1515, #6b2020, #8b3030)', text: '#c490b0', badge: 'rgba(140,50,100,0.15)', badgeBorder: 'rgba(140,50,100,0.35)', highlight: '#e04050', stripe: '#d96070' }

  /* ── 能量条内部步进器 ───────────────────────────────────── */
  const chargeStepper = maxCharge > 0 ? (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        className="w-[22px] h-[22px] flex items-center justify-center border rounded-[4px] text-[13px] cursor-pointer leading-none transition-colors bg-black/20 hover:bg-black/40"
        style={{ color: '#e0e0e0', borderColor: energyColor.badgeBorder, padding: 0 }}
        onClick={(e) => {
          e.stopPropagation()
          onChargeChange?.(Math.max(0, displayCharge - 1))
        }}
      >
        −
      </button>
      <span
        className="text-[13px] font-bold min-w-[44px] text-center tabular-nums"
        style={{ color: energyColor.text, textShadow: `0 0 6px ${energyColor.highlight}66` }}
      >
        {displayCharge}/{maxCharge}
      </span>
      <button
        type="button"
        className="w-[22px] h-[22px] flex items-center justify-center border rounded-[4px] text-[13px] cursor-pointer leading-none transition-colors bg-black/20 hover:bg-black/40"
        style={{ color: '#e0e0e0', borderColor: energyColor.badgeBorder, padding: 0 }}
        onClick={(e) => {
          e.stopPropagation()
          onChargeChange?.(Math.min(maxCharge, displayCharge + 1))
        }}
      >
        +
      </button>
    </div>
  ) : null

  /* ── 统一能量条按钮（主动技能 / 护盾池 / 内含法术） ──── */
  const hasContainedSpellBtn = !hasActiveAbility && !hasShieldPool && hasContainedSpell && containedSpellEntry
  const hasChargeOnly = !hasActiveAbility && !hasShieldPool && !hasContainedSpellBtn && maxCharge > 0
  const hasAnyUseAction = hasActiveAbility || hasShieldPool || hasContainedSpellBtn || hasChargeOnly

  const barWidth = hasActiveAbility
    ? `${chargeRatio * 100}%`
    : hasShieldPool && shieldPoolMax > 0
      ? `${(shieldPoolCurrent / shieldPoolMax) * 100}%`
      : hasChargeOnly
        ? `${chargeRatio * 100}%`
        : '100%'

  const depletedWidth = hasActiveAbility
    ? `${(1 - chargeRatio) * 100}%`
    : hasShieldPool && shieldPoolMax > 0
      ? `${(1 - shieldPoolCurrent / shieldPoolMax) * 100}%`
      : hasChargeOnly
        ? `${(1 - chargeRatio) * 100}%`
        : '0%'

  const barTitle = hasActiveAbility
    ? `使用主动技能: ${activeAbility.name || ''}`
    : hasShieldPool
      ? `护盾池: ${shieldPoolCurrent}/${shieldPoolMax}`
      : hasChargeOnly
        ? `充能: ${displayCharge}/${maxCharge}`
        : '使用内含法术'

  const unifiedButton = hasAnyUseAction ? (
    <div
      className="relative flex items-center w-full h-9 px-2.5 rounded-md overflow-hidden cursor-pointer"
      style={{
        border: `1px solid ${energyColor.border}`,
        background: 'linear-gradient(180deg, rgba(30,42,58,0.95) 0%, rgba(22,33,48,0.98) 100%)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (hasActiveAbility) onUseAbility?.()
      }}
      title={barTitle}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 2px 0 ${energyColor.highlight}44, inset 0 -1px 0 rgba(0,0,0,0.3)`
        e.currentTarget.style.borderColor = energyColor.border.replace('0.6', '0.9')
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)`
        e.currentTarget.style.borderColor = energyColor.border
      }}
    >
      {/* 能量条背景 */}
      <div className="absolute inset-0 rounded-md overflow-hidden z-0">
        <div className="absolute inset-0 bg-[#141e2e]" />
        <div
          className="absolute inset-0"
          style={{
            width: barWidth,
            background: isLowCharge ? energyColor.barLow : energyColor.bar,
          }}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: energyColor.highlight }} />
        </div>
        {/* 竖条纹层 - 双层叠加实现颜色渐变：左=stripe色，右=highlight色 */}
        <div
          className="absolute inset-0 pointer-events-none z-[3]"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${energyColor.stripe} 0px, ${energyColor.stripe} 3px, transparent 3px, transparent 6px)`,
            WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
            maskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none z-[3]"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${energyColor.highlight} 0px, ${energyColor.highlight} 3px, transparent 3px, transparent 6px)`,
            WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
            maskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
          }}
        />
      </div>
      {/* 充能分界高亮线 - 外层按钮级，贯穿全高，最高层级 */}
      <div
        className="absolute top-0 bottom-0 w-[3px] pointer-events-none z-40"
        style={{
          left: barWidth,
          background: energyColor.highlight,
          boxShadow: `0 0 8px ${energyColor.highlight}, 0 0 4px ${energyColor.highlight}`,
        }}
      />
      {/* 按钮内容 */}
      <div className="relative z-30 flex items-center w-full gap-2">
        {/* 颜色遮罩 - 全宽，压在条纹之上 */}
        <div
          className="absolute inset-0 rounded-md pointer-events-none z-[1]"
          style={{
            background: `linear-gradient(to right, rgba(10,18,32,0.6) 0%, rgba(10,18,32,0.3) 40%, rgba(10,18,32,0.5) 100%)`,
          }}
        />
        {/* 能量条同色渐变底色 - 仅充能区域，mask跟随barWidth */}
        <div
          className="absolute inset-0 rounded-md pointer-events-none z-[1]"
          style={{
            background: `linear-gradient(to right, transparent 0%, transparent 25%, ${energyColor.barRight}cc 50%, ${energyColor.barRight}f0 100%)`,
            WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 3, 100)}%)`,
            maskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 3, 100)}%)`,
          }}
        />
        {/* 耗尽遮罩 - 从右侧覆盖，高不透明度确保耗尽区域呈暗色 */}
        <div
          className="absolute top-0 right-0 h-full rounded-r-md pointer-events-none z-[2]"
          style={{
            width: depletedWidth,
            background: 'rgba(10, 18, 32, 0.95)',
          }}
        />
        {/* 内容层 - 最高层级确保文字数字在最上层 */}
        <div className="relative z-[10] flex items-center w-full gap-2">
        <span
          className="text-[13px] font-semibold text-white whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0"
          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.8)' }}
        >
          {displayName}
        </span>
        {hasActiveAbility && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Sparkles className="w-5 h-5" style={{ color: energyColor.highlight, filter: `drop-shadow(0 0 6px ${energyColor.highlight}cc)` }} />
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded tracking-wide"
              style={{
                color: energyColor.text,
                background: energyColor.badge,
                border: `1px solid ${energyColor.badgeBorder}`,
                textShadow: `0 0 6px ${energyColor.highlight}88`,
              }}
            >
              使用
            </span>
            {chargeStepper}
          </div>
        )}
        {hasChargeOnly && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {chargeStepper}
          </div>
        )}
        {hasShieldPool && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Shield className="w-5 h-5" style={{ color: energyColor.highlight, filter: `drop-shadow(0 0 6px ${energyColor.highlight}cc)` }} />
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded tracking-wide"
              style={{
                color: energyColor.text,
                background: energyColor.badge,
                border: `1px solid ${energyColor.badgeBorder}`,
                textShadow: `0 0 6px ${energyColor.highlight}88`,
              }}
            >
              护盾
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                className="w-[22px] h-[22px] flex items-center justify-center border rounded-[4px] text-[13px] cursor-pointer leading-none transition-colors bg-black/20 hover:bg-black/40"
                style={{ color: '#e0e0e0', borderColor: energyColor.badgeBorder, padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation()
                  onShieldPoolChange?.(Math.max(0, shieldPoolCurrent - 1))
                }}
              >
                −
              </button>
              <span
                className="text-[13px] font-bold min-w-[44px] text-center tabular-nums"
                style={{ color: energyColor.text, textShadow: `0 0 6px ${energyColor.highlight}66` }}
              >
                {shieldPoolCurrent}
              </span>
              <button
                type="button"
                className="w-[22px] h-[22px] flex items-center justify-center border rounded-[4px] text-[13px] cursor-pointer leading-none transition-colors bg-black/20 hover:bg-black/40"
                style={{ color: '#e0e0e0', borderColor: energyColor.badgeBorder, padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation()
                  onShieldPoolChange?.(Math.min(shieldPoolMax, shieldPoolCurrent + 1))
                }}
              >
                +
              </button>
            </div>
          </div>
        )}
        {hasContainedSpellBtn && (
          <div onClick={(e) => e.stopPropagation()}>
            <ContainedSpellUseButton
              entry={containedSpellEntry}
              onChargeChange={onContainedSpellCharge}
              compact
            />
          </div>
        )}
        </div>
      </div>
    </div>
  ) : null

  /* ── 无主动技能时的纯文字名称 + chevron ─────────────────── */
  const nameOnlyNode = (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className="text-base font-semibold text-[#f0f0f0] select-none hover:text-gray-100 transition-colors truncate"
      >
        {displayName}
      </span>
    </div>
  )

  const bonusNode = magicBonus ? (
    <span className="shrink-0 text-[11px] font-semibold" style={{ color: '#c79a42' }}>
      +{magicBonus}
    </span>
  ) : null

  /* ── Tooltip wrapper ───────────────────────────────────── */
  const nameArea = tooltipContent ? (
    <InfoTooltip content={tooltipContent}>
      {nameOnlyNode}
    </InfoTooltip>
  ) : (
    nameOnlyNode
  )

  const isContainer = gridVariant === 'container'
  const gridColumns = isContainer
    ? '376px 136px 1fr 90px 76px'
    : '46px 76px 376px 136px 1fr 90px 76px'

  return (
    <div
      className="min-w-0"
      draggable={isDraggable || undefined}
      onDragStart={isDraggable ? (e) => {
        onDragStart?.(e)
        const card = e.currentTarget.closest('[data-equipment-card]')
        if (card) card.classList.add('opacity-50')
      } : undefined}
      onDragEnd={isDraggable ? (e) => {
        onDragEnd?.(e)
        const card = e.currentTarget.closest('[data-equipment-card]')
        if (card) card.classList.remove('opacity-50')
      } : undefined}
      onDragOver={isDraggable ? onDragOver : undefined}
      onDrop={isDraggable ? onDrop : undefined}
      data-equipment-card={entry?.id}
      style={{ cursor: isDraggable ? 'grab' : undefined }}
    >
      <div
        className="rounded-md overflow-hidden"
        style={{
          marginBottom: '8px',
          background: 'linear-gradient(180deg, #161e2b 0%, #141c28 50%, #121a25 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.48), 0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.085), inset 0 -1px 0 rgba(0,0,0,0.22)',
          transition: 'box-shadow .2s, border-color .2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(199,154,66,0.25)'
          e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.24)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.boxShadow = '0 6px 22px rgba(0,0,0,0.48), 0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.085), inset 0 -1px 0 rgba(0,0,0,0.22)'
        }}
      >
        {/* 52px header row — 整行可点击折叠/展开 */}
        <div
          className="grid items-center cursor-pointer"
          style={{
            gridTemplateColumns: gridColumns,
            height: '52px',
            gap: 0,
          }}
          onClick={onToggleBrief}
        >
          {!isContainer && (
          <>
          {/* Col 1 (46px) — Attunement (竖排文字) */}
          <div
            className="flex items-center justify-center h-full"
            style={cellBorder}
          >
            <div
              title={
                attuneActive
                  ? '点击取消同调'
                  : attuneDisabled
                    ? '同调位已满'
                    : '同调此物品'
              }
              className={`shrink-0 flex items-center justify-center cursor-pointer select-none transition-colors ${
                attuneDisabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-[rgba(45,107,101,0.15)]'
              }`}
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '3px',
                padding: '8px 8px',
                color: attuneActive ? '#4ecdc4' : '#2d6b65',
                background: attuneActive ? 'rgba(78,205,196,0.08)' : 'transparent',
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (!attuneDisabled && canEdit) {
                  onAttuneToggle?.(entry?.id, !attuneActive)
                }
              }}
            >
              同调
            </div>
          </div>

          {/* Col 2 (76px) — Slot dropdown */}
          <div
            className="flex items-center justify-center h-full px-1"
            style={cellBorder}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={slotValue || 'backpack'}
              onChange={(e) => onSlotChange?.(invIndex, e.target.value)}
              disabled={!canEdit}
              className="w-full h-7 text-[11px] text-center rounded border border-[#3a4a5e] bg-[#253345] text-[#8899aa] px-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {availableSlotGroups?.map((g, gi) => (
                <optgroup key={gi} label={g.group || ''}>
                  {g.slots.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          </>
          )}

          {/* Col 3 (376px) — Name + Energy bar */}
          <div
            className="flex items-center h-full overflow-hidden"
            style={{ ...cellBorder, padding: '4px 12px' }}
          >
            {unifiedButton || (
              <div className="flex items-center w-full h-8 px-2.5 border border-[rgba(199,154,66,0.3)] rounded-md overflow-hidden bg-[#1a2535]">
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  {nameArea}
                  {bonusNode}
                </div>
              </div>
            )}
          </div>

          {/* Col 4 (136px) — BUFF tags */}
          <div
            className="flex flex-col items-start justify-center gap-0.5 h-full overflow-hidden"
            style={{ ...cellBorder, padding: '4px 6px' }}
          >
            {buffTags?.map((tag, i) => (
              <span
                key={i}
                className="text-[8px] px-1 border border-[#2a3a4e] rounded-sm bg-[#1a2535] whitespace-nowrap leading-3 h-3"
                style={{ color: '#8899aa' }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Col 5 (1fr) — 弹性空白 spacer */}
          <div />

          {/* Col 6 (90px) — 数量步进器(48px) + 重量(42px)，各自居中对齐 */}
          <div className="flex items-center h-full" style={cellBorder}>
            <div className="flex items-center justify-center gap-1" style={{ width: '48px', height: '100%' }}>
              {showQty && canEdit ? (
                <>
                  <button
                    type="button"
                    className="flex items-center justify-center rounded-[3px] text-[11px] cursor-pointer leading-none transition-colors hover:bg-white/10"
                    style={{ color: '#667788', width: '18px', height: '18px', padding: 0 }}
                    onClick={(e) => { e.stopPropagation(); onQtyChange?.(Math.max(1, qty - 1)); }}
                  >
                    −
                  </button>
                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: '#ffd700' }}>{qty}</span>
                  <button
                    type="button"
                    className="flex items-center justify-center rounded-[3px] text-[11px] cursor-pointer leading-none transition-colors hover:bg-white/10"
                    style={{ color: '#667788', width: '18px', height: '18px', padding: 0 }}
                    onClick={(e) => { e.stopPropagation(); onQtyChange?.(qty + 1); }}
                  >
                    +
                  </button>
                </>
              ) : showQty ? (
                <span className="text-[11px] tabular-nums" style={{ color: '#e0e0e0' }}>×{qty}</span>
              ) : null}
            </div>
            <div className="flex items-center justify-center" style={{ width: '42px', height: '100%' }}>
              {weightLb > 0 && (
                <span className="text-[10px] whitespace-nowrap leading-none" style={{ color: '#aabbcc' }}>
                  {formatDisplayWeightLb(weightLb)}磅
                </span>
              )}
            </div>
          </div>

          {/* Col 7 (76px) — 三按钮：存 / 编 / 删 */}
          <div className="flex items-center justify-center h-full px-2">
            <button
              type="button"
              className="flex items-center justify-center rounded-md text-dnd-text-muted cursor-pointer transition-colors hover:bg-white/[0.08] hover:text-gray-300"
              style={{ width: '20px', height: '20px' }}
              onClick={(e) => { e.stopPropagation(); onStoreToVault?.(); }}
              title="存到团队仓库"
            >
              <Package size={12} />
            </button>
            <button
              type="button"
              className="flex items-center justify-center rounded-md text-dnd-text-muted cursor-pointer transition-colors hover:bg-white/[0.08] hover:text-gray-300"
              style={{ width: '20px', height: '20px' }}
              onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
              title="编辑"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="flex items-center justify-center rounded-md text-dnd-text-muted cursor-pointer transition-colors hover:bg-dnd-red/10 hover:text-dnd-red"
              style={{ width: '20px', height: '20px' }}
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Expanded brief */}
        {briefExpanded && brief && (
          <div className="px-3 py-2 border-t border-[#2a3a4e]">
            <p className="text-[10.6px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#e0e0e0' }}>
              {brief}
            </p>
          </div>
        )}
      </div>

      {/* 动画 keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
