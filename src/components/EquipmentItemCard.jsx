import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, Shield, Pencil, Package, Trash2, Zap, ChevronDown, Check } from 'lucide-react'
import { ShieldPoolCounter } from './CardView'
import { formatDisplayWeightLb } from '../lib/encumbrance'
import InfoTooltip from './InfoTooltip'
import ContainedSpellUseButton from './ContainedSpellUseButton'
import { getItemById, resolveEntryRequiresAttunement } from '../data/itemDatabase'
import { getItemCategoryTheme } from '../lib/itemCategoryTheme'

const cellBorder = { borderRight: '1px solid #2a3a4e' }

function energyFromCategory(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, Math.round(v)))
  return {
    border: `rgba(${r},${g},${b},0.5)`,
    bar: `linear-gradient(90deg, #0a1628, rgb(${clamp(r * 0.35)},${clamp(g * 0.35)},${clamp(b * 0.35)}), ${hex})`,
    barRight: hex,
    barLow: `linear-gradient(90deg, #3a1515, #6b2020, #8b3030)`,
    text: `rgb(${clamp(r + (255 - r) * 0.55)},${clamp(g + (255 - g) * 0.55)},${clamp(b + (255 - b) * 0.55)})`,
    badge: `rgba(${r},${g},${b},0.15)`,
    badgeBorder: `rgba(${r},${g},${b},0.4)`,
    highlight: `rgb(${clamp(r + (255 - r) * 0.3)},${clamp(g + (255 - g) * 0.3)},${clamp(b + (255 - b) * 0.3)})`,
    stripe: hex,
  }
}

/* 装备位自绘下拉：原生 select 弹出菜单的字号/对齐无法控制，故用 portal 面板替代 */
function SlotMenu({ anchorRect, groups, value, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8
  const spaceAbove = anchorRect.top - 8
  const need = 352
  const openUp = spaceBelow < need && spaceAbove > spaceBelow
  const maxHeight = Math.min(need, Math.max(openUp ? spaceAbove : spaceBelow, 140))
  const pos = openUp ? { bottom: spaceAbove + 2 } : { top: anchorRect.bottom + 6 }
  return createPortal(
    <div
      ref={ref}
      className="slot-menu fixed z-[999] rounded-lg border border-[#34455f] bg-[#1b2738] py-1 overflow-y-auto"
      style={{
        ...pos,
        left: anchorRect.left + anchorRect.width / 2,
        transform: 'translateX(-50%)',
        width: '76px',
        maxHeight: `${maxHeight}px`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {groups?.map((g, gi) => (
        <div key={gi}>
          {g.group ? (
            <div className="text-center text-[10px] leading-[18px] text-[#55677c] bg-[#16202c]">{g.group}</div>
          ) : null}
          {g.slots.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onPick(s.value)}
              className={`block w-full text-center text-[11px] leading-[24px] transition-colors ${
                s.value === value ? 'bg-[#2563eb] text-white' : 'text-[#aabbcc] hover:bg-[#26334a]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  )
}

/**
 * 装备物品卡 —— 7 列标准网格。
 *
 * Grid: 46px | 76px | 341px | 136px | 1fr | 90px | 76px  (height 60px)
 *
 * 关键设计：
 * - 列1 = 同调勾选框：勾上=已同调；物品编辑器里只有"需要同调"开关，不提供已同调开关
 * - 名称区是能量条一体按钮（有主动技能/护盾池/内含法术/吸能时）
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
  /** 是否不显示阴影（用于容器模式下由外层统一控制阴影） */
  noShadow = false,
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
  onAbsorbEnergy,
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
  const slotLabel =
    availableSlotGroups
      ?.flatMap((g) => g.slots)
      .find((s) => s.value === (slotValue || 'backpack'))?.label || '背包'
  const [slotOpen, setSlotOpen] = useState(false)
  const [slotAnchor, setSlotAnchor] = useState(null)
  const chargeDepleted = maxCharge > 0 && charge <= 0
  const hasActiveAbility = !!activeAbility && !chargeDepleted
  const hasShieldPool = !hasActiveAbility && shieldPoolCurrent != null
  const displayCharge = maxCharge > 0 ? Math.min(charge, maxCharge) : charge
  const chargeRatio = maxCharge > 0 ? displayCharge / maxCharge : 0
  const shieldPoolRatio = hasShieldPool && shieldPoolMax > 0 ? shieldPoolCurrent / shieldPoolMax : 0
  const isLowCharge = hasShieldPool ? shieldPoolRatio < 0.3 : chargeRatio < 0.3

  const proto = getItemById(entry?.itemId)
  const categoryTheme = getItemCategoryTheme(proto?.类型 ?? '')
  const attuneActive = !!isAttuned
  const attuneDisabled = !attuneActive && attunedCount >= maxAttunementSlots
  // 已同调的物品始终显示勾选框，否则无法释放被占用的同调位
  const requiresAttunement = resolveEntryRequiresAttunement(entry, proto) || attuneActive

  const energyColor = hasShieldPool
    ? { border: 'rgba(30,64,120,0.6)', bar: 'linear-gradient(90deg, #0a1628, #1e3a5f, #1a5a6a, #2080a0)', barRight: '#2080a0', barLow: 'linear-gradient(90deg, #3a1515, #6b2020, #8b3030)', text: '#7ec8c0', badge: 'rgba(45,130,120,0.15)', badgeBorder: 'rgba(45,130,120,0.35)', highlight: '#38bdf8', stripe: '#40a8c0' }
    : energyFromCategory(categoryTheme.color)

  /* ── 吸能恢复检测 ──────────────────────────────────────── */
  const effects = Array.isArray(entry?.effects) ? entry.effects : []
  const chargeItemEffect = effects.find(e => e?.effectType === 'charge_item' && e.value && typeof e.value === 'object')
  const recoveryMethod = chargeItemEffect?.value?.recovery?.method
  const methodArr = Array.isArray(recoveryMethod) ? recoveryMethod : (recoveryMethod ? [recoveryMethod] : [])
  const hasAbsorbEnergy = typeof onAbsorbEnergy === 'function' && (methodArr.includes('absorb_energy') || methodArr.includes('reaction_absorb'))
  const hasPactWeapon = effects.some((e) => e?.effectType === 'pact_weapon')
  const pactBadgeNode = hasPactWeapon ? (
    <span
      className="shrink-0 ml-1 px-1 rounded text-[10px] font-semibold leading-4 border border-dnd-gold/60 text-dnd-gold"
      title="契约武器"
    >契</span>
  ) : null

  /* ── 统一能量条按钮（主动技能 / 护盾池 / 内含法术） ──── */
  const hasContainedSpellBtn = !hasActiveAbility && !hasShieldPool && hasContainedSpell && containedSpellEntry
  const hasChargeOnly = !hasActiveAbility && !hasShieldPool && !hasContainedSpellBtn && maxCharge > 0 && !chargeDepleted
  const hasAnyUseAction = hasActiveAbility || hasShieldPool || hasContainedSpellBtn || hasChargeOnly || hasAbsorbEnergy

  const barWidth = hasActiveAbility
    ? `${chargeRatio * 100}%`
    : hasShieldPool && shieldPoolMax > 0
      ? `${(shieldPoolCurrent / shieldPoolMax) * 100}%`
      : hasChargeOnly
        ? `${chargeRatio * 100}%`
        : '100%'

  const barTitle = hasActiveAbility
    ? `释放主动技能: ${activeAbility.name || ''}`
    : hasShieldPool
      ? `护盾池: ${shieldPoolCurrent}/${shieldPoolMax}`
      : hasChargeOnly
        ? `充能: ${displayCharge}/${maxCharge}`
        : '使用内含法术'

  /* ─ 品类徽章：PNG 圆徽作按钮左端圆帽（直径=按钮高44px，左弧即按钮左边缘）── */
  const categoryMedallion = (
    <div
      className="absolute left-0 top-1/2 -translate-y-1/2 h-full rounded-full overflow-hidden pointer-events-none z-30"
      style={{ width: '44px' }}
    >
      <img src={categoryTheme.icon} alt="" draggable={false} className="w-full h-full block" />
    </div>
  )

  const unifiedButton = hasAnyUseAction ? (
    <div
      className="relative flex items-center w-full h-11 rounded-full overflow-hidden cursor-pointer transition-[box-shadow,outline-color] duration-150"
      style={{
        outline: `2px solid ${energyColor.border}`,
        outlineOffset: '-2px',
        background: 'linear-gradient(180deg, rgba(30,42,58,0.95) 0%, rgba(22,33,48,0.98) 100%)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (hasActiveAbility) onUseAbility?.()
      }}
      title={barTitle}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${energyColor.highlight}66, inset 0 2px 0 ${energyColor.highlight}55, inset 0 -1px 0 rgba(0,0,0,0.3)`
        e.currentTarget.style.outlineColor = `${energyColor.highlight}99`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3)`
        e.currentTarget.style.outlineColor = energyColor.border
      }}
    >
      {/* 底层：与普通物品相同的空充能外壳（满条渐变+右端暗带+钢蓝条纹+颜色遮罩+顶部高亮线），耗尽区直接露出它 */}
      <div className="absolute inset-0 rounded-full overflow-hidden z-0">
        <div className="absolute inset-0 bg-[#141e2e]" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, #0e1828 0%, #162840 30%, #1a3858 55%, #162840 80%, #0e1828 100%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, transparent 0%, transparent 40%, rgba(14,24,40,0.5) 70%, rgba(14,24,40,0.7) 100%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(100,140,180,0.08) 0px, rgba(100,140,180,0.08) 3px, transparent 3px, transparent 6px)',
            filter: 'blur(0.8px)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(80,120,160,0.06) 0px, rgba(80,120,160,0.06) 3px, transparent 3px, transparent 6px)',
            filter: 'blur(0.8px)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            top: '3px',
            bottom: '3px',
            left: '3px',
            right: '3px',
            background: 'linear-gradient(to right, rgba(10,18,32,0.5) 0%, rgba(10,18,32,0.25) 40%, rgba(10,18,32,0.35) 100%)',
          }}
        />
        <div
          className="absolute top-[2px] left-0 right-0 h-[1px]"
          style={{ background: 'linear-gradient(to right, transparent 0%, rgba(100,140,180,0.35) 15%, rgba(100,140,180,0.35) 85%, transparent 100%)' }}
        />
      </div>
      {/* 充能填充 - 叠在外壳之上，宽度=当前充能比例 */}
      <div className="absolute inset-y-0 left-0 overflow-hidden z-[2]" style={{ width: barWidth }}>
        <div className="absolute inset-0" style={{ background: isLowCharge ? energyColor.barLow : energyColor.bar }} />
        <div
          className="absolute top-[2px] left-0 right-0 h-[1px]"
          style={{ background: `linear-gradient(to right, transparent 0%, ${energyColor.highlight} 10%, ${energyColor.highlight} 90%, transparent 100%)` }}
        />
      </div>
      {/* 能量条同色渐变底色 - 仅充能区域，mask跟随barWidth */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none z-[5]"
        style={{
          background: `linear-gradient(to right, transparent 0%, transparent 25%, ${energyColor.barRight}cc 50%, ${energyColor.barRight}f0 100%)`,
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 3, 100)}%)`,
          maskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 3, 100)}%)`,
        }}
      />
      {/* 颜色遮罩 - 仅充能区域：外圈形状内缩2px的同形胶囊，保证亮底上文字对比度；耗尽区露出底层外壳 */}
      <div
        className="absolute rounded-full pointer-events-none z-[9]"
        style={{
          top: '2px',
          bottom: '2px',
          left: '2px',
          right: '2px',
          background: `linear-gradient(to right, rgba(10,18,32,0.7) 0%, rgba(10,18,32,0.65) 40%, rgba(10,18,32,0.6) 100%)`,
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 3, 100)}%)`,
          maskImage: `linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 3, 100)}%)`,
        }}
      />
      {/* 竖条纹层 - 位于渐变底色之上、颜色遮罩之下，全高一致；双层叠加，边缘轻微模糊柔化 */}
      <div
        className="absolute inset-0 pointer-events-none z-[8]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${energyColor.stripe} 0px, ${energyColor.stripe} 3px, transparent 3px, transparent 6px)`,
          filter: 'blur(0.8px)',
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
          maskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none z-[8]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${energyColor.highlight} 0px, ${energyColor.highlight} 3px, transparent 3px, transparent 6px)`,
          filter: 'blur(0.8px)',
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
          maskImage: `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${parseFloat(barWidth)}%, rgba(0,0,0,0) ${Math.min(parseFloat(barWidth) + 6, 100)}%)`,
        }}
      />
      {/* 充能分界高亮线 - 外层按钮级，贯穿全高，最高层级 */}
      <div
        className="absolute top-0 bottom-0 w-[3px] pointer-events-none z-40"
        style={{
          left: barWidth,
          background: energyColor.highlight,
          boxShadow: `0 0 8px ${energyColor.highlight}, 0 0 4px ${energyColor.highlight}`,
        }}
      />
      {categoryMedallion}
      {/* 按钮内容 */}
      <div className="relative z-30 flex items-center w-full gap-2">
        {/* 内容层 - 两列网格：左名字 | 右动作簇(外框 + 吸能按钮) */}
        <div
          className="relative z-[10] grid items-center w-full px-2"
          style={{ gridTemplateColumns: '1fr auto', columnGap: '8px' }}
        >
          {/* 左列：名字 */}
          <div className="flex items-center justify-start min-w-0 overflow-hidden" style={{ paddingLeft: '44px' }}>
            <span
              className="text-[13px] font-semibold text-white truncate"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.8)', maxWidth: '100px', lineHeight: '20px', letterSpacing: '2px' }}
            >
              {displayName}
            </span>
            {pactBadgeNode}
          </div>
          {/* 右列：动作簇 = 外框(图标+标签+充能/护盾数) + 吸能按钮 */}
          <div className="flex items-center justify-end gap-1.5 min-w-0">
            <div
              className="flex items-center gap-1.5 rounded-full shrink-0 transition-[border-color,background,box-shadow] duration-150"
              style={{
                height: '28px',
                padding: '0 10px',
                border: `1px solid ${energyColor.badgeBorder}`,
                background: 'rgba(8,14,24,0.5)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = energyColor.highlight
                e.currentTarget.style.background = 'rgba(8,14,24,0.72)'
                e.currentTarget.style.boxShadow = `0 0 10px ${energyColor.highlight}55, inset 0 1px 2px rgba(0,0,0,0.45)`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = energyColor.badgeBorder
                e.currentTarget.style.background = 'rgba(8,14,24,0.5)'
                e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.45)'
              }}
            >
              {hasActiveAbility && (
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: energyColor.text }} />
              )}
              {hasShieldPool && (
                <Shield className="w-4 h-4 shrink-0" style={{ color: energyColor.text }} />
              )}
              {hasContainedSpellBtn && (
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: energyColor.text }} />
              )}
              {hasContainedSpellBtn ? (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                  <ContainedSpellUseButton
                    entry={containedSpellEntry}
                    onChargeChange={onContainedSpellCharge}
                    compact
                    buttonClassName="!bg-transparent !border-0 !p-0 !h-auto"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold tracking-wide whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>施法</span>
                      {maxCharge > 0 && (
                        <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>
                          {displayCharge}/{maxCharge}
                        </span>
                      )}
                    </div>
                  </ContainedSpellUseButton>
                </div>
              ) : (
                <>
                  {hasActiveAbility && <span className="text-[12px] font-bold tracking-wide whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>释放</span>}
                  {hasShieldPool && <span className="text-[12px] font-bold tracking-wide whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>护盾</span>}
                  {hasChargeOnly && <span className="text-[12px] font-bold tracking-wide whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>充能</span>}
                  {hasShieldPool ? (
                    <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>
                      {shieldPoolCurrent}/{shieldPoolMax}
                    </span>
                  ) : maxCharge > 0 ? (
                    <span className="text-[13px] font-bold tabular-nums whitespace-nowrap" style={{ color: energyColor.text, lineHeight: '18px' }}>
                      {displayCharge}/{maxCharge}
                    </span>
                  ) : null}
                </>
              )}
            </div>
            {hasAbsorbEnergy && (
              <button
                type="button"
                className="flex items-center gap-1 rounded-full shrink-0 cursor-pointer transition-[border-color,background,box-shadow] duration-150 whitespace-nowrap"
                style={{
                  height: '28px',
                  padding: '0 10px',
                  color: '#fcd34d',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  lineHeight: '18px',
                  background: 'rgba(8,14,24,0.5)',
                  border: '1px solid rgba(251,191,36,0.45)',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onAbsorbEnergy?.()
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(251,191,36,0.9)'
                  e.currentTarget.style.background = 'rgba(251,191,36,0.12)'
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(251,191,36,0.4), inset 0 1px 2px rgba(0,0,0,0.45)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(251,191,36,0.45)'
                  e.currentTarget.style.background = 'rgba(8,14,24,0.5)'
                  e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.45)'
                }}
              >
                <Zap className="w-4 h-4" />
                吸
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null

  /* ── 无主动技能时的纯文字名称 + chevron ─────────────────── */
  const nameOnlyNode = (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className="text-[13px] font-semibold text-[#f0f0f0] select-none hover:text-gray-100 transition-colors truncate"
      >
        {displayName}
      </span>
      {pactBadgeNode}
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
    ? '341px 136px 1fr 90px 76px'
    : '46px 76px 341px 136px 1fr 90px 76px'

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
          border: noShadow ? 'none' : '1px solid rgba(255,255,255,0.06)',
          boxShadow: noShadow ? undefined : '0 6px 22px rgba(0,0,0,0.48), 0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.085), inset 0 -1px 0 rgba(0,0,0,0.22)',
          transition: 'box-shadow .2s, border-color .2s',
        }}
        onMouseEnter={(e) => {
          if (!noShadow) {
            e.currentTarget.style.borderColor = 'rgba(199,154,66,0.25)'
            e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.24)'
          }
        }}
        onMouseLeave={(e) => {
          if (!noShadow) {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.boxShadow = '0 6px 22px rgba(0,0,0,0.48), 0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.085), inset 0 -1px 0 rgba(0,0,0,0.22)'
          }
        }}
      >
        {/* 60px header row — 整行可点击折叠/展开 */}
        <div
          className="grid items-center cursor-pointer"
          style={{
            gridTemplateColumns: gridColumns,
            height: '60px',
            gap: 0,
          }}
          onClick={onToggleBrief}
        >
          {!isContainer && (
          <>
          {/* Col 1 (46px) — Attunement checkbox */}
          <div
            className="flex items-center justify-center h-full"
            style={cellBorder}
            onClick={(e) => e.stopPropagation()}
          >
            {requiresAttunement ? (
              <div className="flex flex-col items-center gap-[3px] select-none">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={attuneActive}
                  disabled={!canEdit}
                  title={attuneActive ? '点击取消同调' : attuneDisabled ? '同调位已满' : '同调此物品'}
                  onClick={() => {
                    if (attuneDisabled) {
                      alert('同调位已满')
                      return
                    }
                    onAttuneToggle?.(entry?.id, !attuneActive)
                  }}
                  className={`flex items-center justify-center rounded-[6px] border transition-colors ${
                    !canEdit
                      ? 'border-[#34455f] bg-[#1b2738] opacity-50 cursor-not-allowed'
                      : attuneActive
                        ? 'border-[#c79a42] bg-[#c79a42]/15 hover:border-[#d8b05a] cursor-pointer'
                        : attuneDisabled
                          ? 'border-[#34455f] bg-[#1b2738] opacity-40 cursor-not-allowed'
                          : 'border-[#34455f] bg-[#1b2738] hover:border-[#4e6688] cursor-pointer'
                  }`}
                  style={{
                    width: 20,
                    height: 20,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.3)',
                  }}
                >
                  {attuneActive && <Check size={13} strokeWidth={3} style={{ color: '#c79a42' }} />}
                </button>
                <span
                  className="text-[10px] font-semibold leading-none"
                  style={{ color: attuneActive ? '#c79a42' : '#55677c', letterSpacing: '1px' }}
                >
                  同调
                </span>
              </div>
            ) : null}
          </div>

          {/* Col 2 (76px) — Slot dropdown */}
          <div
            className="flex items-center justify-center h-full px-2"
            style={cellBorder}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`group relative w-11 h-11 shrink-0 ${canEdit ? '' : 'opacity-50'}`}>
              <div
                className="absolute inset-0 rounded-full border border-[#34455f] transition-[filter,border-color] duration-150 group-hover:border-[#4e6688] group-hover:brightness-110"
                style={{
                  background:
                    'radial-gradient(120% 70% at 50% 0%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, #26334a 0%, #1b2738 55%, #16202e 100%)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.45)',
                }}
              />
              <button
                type="button"
                disabled={!canEdit}
                aria-label="切换装备位"
                onClick={(e) => {
                  e.stopPropagation()
                  if (slotOpen) {
                    setSlotOpen(false)
                    return
                  }
                  setSlotAnchor(e.currentTarget.getBoundingClientRect())
                  setSlotOpen(true)
                }}
                className="absolute inset-0 w-full h-full rounded-full disabled:cursor-not-allowed"
              />
              {slotOpen && slotAnchor && (
                <SlotMenu
                  anchorRect={slotAnchor}
                  groups={availableSlotGroups}
                  value={slotValue || 'backpack'}
                  onPick={(v) => {
                    onSlotChange?.(invIndex, v)
                    setSlotOpen(false)
                  }}
                  onClose={() => setSlotOpen(false)}
                />
              )}
              {/* 竖排标签覆盖层：圆钮本身只是开关，文字由覆盖层精确居中 */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span
                  className="text-[11px] font-semibold"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    letterSpacing: '1px',
                    color: '#8899aa',
                    textShadow: '0 1px 1px rgba(0,0,0,0.55)',
                  }}
                >
                  {slotLabel}
                </span>
              </div>
              <ChevronDown
                className="w-2 h-2 absolute left-1/2 -translate-x-1/2 pointer-events-none"
                style={{ bottom: '2px', color: '#8899aa' }}
              />
            </div>
          </div>
          </>
          )}

          {/* Col 3 (341px = 按钮325 + 分割线两侧各8) — Name + Energy bar */}
          <div
            className="flex items-center h-full overflow-hidden"
            style={{ ...cellBorder, padding: '8px 8px' }}
          >
            {unifiedButton || (
              <div
                className="relative flex items-center w-full h-11 rounded-full overflow-hidden transition-[box-shadow,outline-color] duration-150"
                style={{
                  outline: `2px solid rgba(30,64,120,0.45)`,
                  outlineOffset: '-2px',
                  background: 'linear-gradient(180deg, rgba(30,42,58,0.95) 0%, rgba(22,33,48,0.98) 100%)',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.3)`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `inset 0 0 0 1px rgba(100,140,180,0.2), inset 0 2px 0 rgba(100,140,180,0.12), inset 0 -1px 0 rgba(0,0,0,0.3)`
                  e.currentTarget.style.outlineColor = 'rgba(100,140,180,0.5)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.3)`
                  e.currentTarget.style.outlineColor = 'rgba(30,64,120,0.45)'
                }}
              >
                {/* 暗底 + 微弱能量渐变（满条） */}
                <div className="absolute inset-0 rounded-full overflow-hidden z-0">
                  <div className="absolute inset-0 bg-[#141e2e]" />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, #0e1828 0%, #162840 30%, #1a3858 55%, #162840 80%, #0e1828 100%)',
                    }}
                  />
                </div>
                {/* 右端暗色渐变 — 与主动按钮同色系的文字暗带 */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none z-[5]"
                  style={{
                    background: 'linear-gradient(to right, transparent 0%, transparent 40%, rgba(14,24,40,0.5) 70%, rgba(14,24,40,0.7) 100%)',
                  }}
                />
                {/* 颜色遮罩 — 内缩3px，保证文字对比度 */}
                <div
                  className="absolute rounded-full pointer-events-none z-[9]"
                  style={{
                    top: '3px', bottom: '3px', left: '3px', right: '3px',
                    background: 'linear-gradient(to right, rgba(10,18,32,0.5) 0%, rgba(10,18,32,0.25) 40%, rgba(10,18,32,0.35) 100%)',
                  }}
                />
                {/* 竖条纹层 — 钢蓝色，极低透明度 */}
                <div
                  className="absolute inset-0 pointer-events-none z-[8]"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, rgba(100,140,180,0.08) 0px, rgba(100,140,180,0.08) 3px, transparent 3px, transparent 6px)',
                    filter: 'blur(0.8px)',
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none z-[8]"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(90deg, rgba(80,120,160,0.06) 0px, rgba(80,120,160,0.06) 3px, transparent 3px, transparent 6px)',
                    filter: 'blur(0.8px)',
                  }}
                />
                {/* 顶部高亮线 */}
                <div
                  className="absolute top-[2px] left-0 right-0 h-[1px] pointer-events-none z-20"
                  style={{
                    background: 'linear-gradient(to right, transparent 0%, rgba(100,140,180,0.35) 15%, rgba(100,140,180,0.35) 85%, transparent 100%)',
                  }}
                />
                {categoryMedallion}
                {/* 名称内容 */}
                <div className="relative z-30 flex items-center justify-center w-full" style={{ padding: '0 12px 0 48px' }}>
                  <span
                    className="text-[13px] font-semibold truncate"
                    style={{
                      color: '#c8d4e0',
                      textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.7)',
                      letterSpacing: '2px',
                      lineHeight: '20px',
                    }}
                  >
                    {displayName}
                  </span>
                  {pactBadgeNode}
                  {magicBonus ? (
                    <span className="shrink-0 ml-2 text-[11px] font-semibold" style={{ color: '#c79a42' }}>
                      +{magicBonus}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Col 4 (136px) — BUFF tags */}
          <div
            className="flex flex-col items-start justify-center gap-0.5 h-full overflow-hidden"
            style={{ ...cellBorder, padding: '4px 8px' }}
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
    </div>
  )
}
