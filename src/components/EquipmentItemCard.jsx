import React from 'react'
import { Sparkles, Package, Pencil, Trash2 } from 'lucide-react'
import { NumberStepper } from './BuffForm'
import { ShieldPoolCounter } from './CardView'
import { formatDisplayWeightLb } from '../lib/encumbrance'
import {
  actionIconBtnClass,
  actionIconBtnDangerClass,
  releaseBtnClass,
} from '../lib/inventoryItemCardStyles'
import InfoTooltip from './InfoTooltip'
import ContainedSpellUseButton from './ContainedSpellUseButton'

const cellBorder = { borderRight: '1px solid #2a3a4e' }

/**
 * 装备物品卡 —— 6 列标准网格。
 *
 * Grid: 46px | 76px | 376px | 136px | 1fr | 76px  (height 52px)
 *
 * 替换旧版两段式（装备面板 + 背包面板）布局，
 * 每件物品统一使用此卡片展示。
 */
export default function EquipmentItemCard({
  entry,
  invIndex,
  slotValue,
  canEdit,
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
}) {
  const attuneActive = !!isAttuned
  const attuneDisabled = !attuneActive && attunedCount >= maxAttunementSlots

  /* ── Charge stepper element ────────────────────────────────────── */
  const chargeStepper = maxCharge > 0 ? (
    <div className="flex items-center h-7 shrink-0">
      <button
        type="button"
        className="w-[22px] h-7 flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-dnd-text-muted text-sm font-semibold cursor-pointer select-none transition-colors hover:bg-white/[0.12] hover:text-gray-300 rounded-l-md border-r-0"
        onClick={() => onChargeChange(Math.max(0, charge - 1))}
      >
        −
      </button>
      <div className="flex-1 h-7 bg-white/[0.04] border-y border-white/[0.08] relative overflow-hidden min-w-[36px]">
        <div
          className="h-full transition-[width] duration-200"
          style={{
            width: `${(charge / Math.max(1, maxCharge)) * 100}%`,
            background: charge > 0
              ? 'linear-gradient(90deg, rgba(74,144,217,0.18), rgba(124,179,245,0.12))'
              : 'transparent',
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-gray-300 tracking-wide">
          {charge}
        </span>
      </div>
      <button
        type="button"
        className="w-[22px] h-7 flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-dnd-text-muted text-sm font-semibold cursor-pointer select-none transition-colors hover:bg-white/[0.12] hover:text-gray-300 rounded-r-md border-l-0"
        onClick={() => onChargeChange(charge + 1)}
      >
        +
      </button>
    </div>
  ) : null

  /* ── Energy bar element (mutually exclusive) ───────────────────── */
  const energyElement = chargeStepper
    ? chargeStepper
    : shieldPoolCurrent != null
      ? (
          <ShieldPoolCounter
            current={shieldPoolCurrent}
            max={shieldPoolMax}
            threshold={shieldPoolThreshold}
            onChange={onShieldPoolChange}
            compact
          />
        )
      : activeAbility
        ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onUseAbility?.()
              }}
              className={`${releaseBtnClass} shrink-0`}
              title={`使用主动技能: ${activeAbility.name || ''}`}
            >
              <Sparkles className="w-3 h-3" /> 释放
            </button>
          )
        : hasContainedSpell && containedSpellEntry
          ? (
              <ContainedSpellUseButton
                entry={containedSpellEntry}
                onChargeChange={onContainedSpellCharge}
                compact
              />
            )
          : null

  /* ── Name element ──────────────────────────────────────────────── */
  const nameNode = (
    <span
      className="min-w-0 shrink truncate text-white font-medium text-sm cursor-pointer select-none hover:text-gray-100 transition-colors"
      onClick={onToggleBrief}
    >
      {displayName}
    </span>
  )

  const bonusNode = magicBonus ? (
    <span className="shrink-0 text-[11px] font-semibold text-dnd-gold-light">
      +{magicBonus}
    </span>
  ) : null

  /* ── Col 5: quantity stepper or plain text ─────────────────────── */
  const qtyNode = showQty ? (
    canEdit ? (
      <NumberStepper value={qty} onChange={onQtyChange} min={1} compact pill subtle />
    ) : (
      <span className="text-xs tabular-nums text-dnd-text-body">{qty}</span>
    )
  ) : null

  const weightNode = weightLb > 0 ? (
    <span className="text-[10px] text-dnd-text-muted whitespace-nowrap">
      {formatDisplayWeightLb(weightLb)}
    </span>
  ) : (
    <span className="text-[10px] text-dnd-text-muted invisible">—</span>
  )

  /* ── Tooltip wrapper ───────────────────────────────────────────── */
  const nameArea = tooltipContent ? (
    <InfoTooltip content={tooltipContent}>
      {nameNode}
    </InfoTooltip>
  ) : (
    nameNode
  )

  return (
    <div className="min-w-0">
      <div
        className="rounded-md border border-gray-600/45 bg-gradient-to-b from-[#161e2b] via-[#141c28] to-[#121a25] overflow-hidden ring-1 ring-inset ring-white/[0.028] hover:border-gray-500/55 transition-colors"
        style={{ marginBottom: '8px' }}
      >
        {/* 52px header row */}
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: '46px 76px 376px 136px 1fr 76px',
            height: '52px',
            gap: 0,
          }}
        >
          {/* Col 1 (46px) — Attunement */}
          <div
            className="flex items-center justify-center h-full"
            style={cellBorder}
          >
            <label
              title={
                attuneActive
                  ? '点击取消同调'
                  : attuneDisabled
                    ? '同调位已满'
                    : '同调此物品'
              }
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg border text-[10px] cursor-pointer transition-colors ${
                attuneDisabled
                  ? 'border-gray-700 bg-gray-800/50 text-gray-600 opacity-50 cursor-not-allowed'
                  : attuneActive
                    ? 'border-dnd-gold/50 bg-dnd-gold/10 text-dnd-gold-light hover:bg-dnd-gold/20'
                    : 'border-gray-600 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              } ${canEdit ? 'px-1.5 py-0.5' : 'p-0.5'}`}
            >
              <Sparkles
                className={`w-3 h-3 shrink-0 ${attuneActive ? 'text-dnd-gold-light' : 'text-gray-500'}`}
                strokeWidth={2}
              />
              {canEdit && (
                <>
                  <input
                    type="checkbox"
                    checked={attuneActive}
                    disabled={attuneDisabled}
                    onChange={() => onAttuneToggle?.(entry?.id, !attuneActive)}
                    className="sr-only"
                  />
                  <span>同调</span>
                </>
              )}
            </label>
          </div>

          {/* Col 2 (76px) — Slot dropdown */}
          <div
            className="flex items-center justify-center h-full px-1"
            style={cellBorder}
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

          {/* Col 3 (376px) — Name + Energy bar */}
          <div
            className="flex items-center h-full gap-2 overflow-hidden"
            style={{ ...cellBorder, padding: '0 8px' }}
          >
            <div className="min-w-0 flex items-center gap-1.5 flex-1 overflow-hidden">
              {nameArea}
              {bonusNode}
            </div>
            {energyElement}
          </div>

          {/* Col 4 (136px) — BUFF tags */}
          <div
            className="flex flex-col items-start justify-center gap-0.5 h-full overflow-hidden"
            style={{ ...cellBorder, padding: '4px 8px' }}
          >
            {buffTags?.map((tag, i) => (
              <span
                key={i}
                className="text-[8px] px-1 border border-[#2a3a4e] rounded-sm bg-[#1a2535] text-[#8899aa] whitespace-nowrap leading-3 h-3"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Col 5 (1fr) — Quantity + Weight (right-aligned) */}
          <div className="flex items-center justify-end gap-2 h-full px-2">
            {qtyNode}
            {weightNode}
          </div>

          {/* Col 6 (76px) — 3 action icons */}
          <div className="flex items-center justify-center gap-0.5 h-full">
            <button
              type="button"
              className={actionIconBtnClass}
              onClick={onStoreToVault}
              title="存入仓库"
            >
              <Package className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={actionIconBtnClass}
              onClick={onEdit}
              title="编辑"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className={actionIconBtnDangerClass}
              onClick={onDelete}
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded brief */}
        {briefExpanded && brief && (
          <div className="px-3 py-2 border-t border-gray-700/40">
            <p className="text-[10.6px] leading-relaxed text-dnd-text-body/90 whitespace-pre-wrap break-words">
              {brief}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
