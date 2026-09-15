/**
 * CardView — 通用卡片组件
 *
 * 统一职业特性、专长的卡片渲染。提供面板样式 + 展开/折叠管理。
 * 通过 headerLeft / headerRight / children 等插槽保持灵活性。
 *
 * 配套：
 *   - AbilityButton：主动技能使用按钮（统一样式）
 *   - SlotPanel：卡槽面板包装（标题 + 卡片列表）
 */

import { useState, memo } from 'react'
import { ChevronDown, ChevronUp, Settings, Zap, Shield } from 'lucide-react'
import { NumberStepper } from './BuffForm'

/* ── CardView ─────────────────────────────────────────────────── */

function CardView({
  name,
  subtitle,
  description,
  descriptionNode,
  disabled = false,
  headerLeft,
  headerRight,
  footer,
  children,
  alwaysContent,
  className = '',
  expanded = false,
  onToggleExpand,
  onConfigure,
  configureTitle,
  gridLayout = false,
  narrow = true,
  category,
  categoryColor = '#8899aa',
  sourceMain,
  sourceSub,
  buffTags = [],
  onCategoryClick,
  categoryActive = false,
}) {
  const hasDescription = Boolean(description || descriptionNode)
  const hasChildren = Boolean(children)
  const canExpand = hasDescription || hasChildren

  const toggleExpand = () => {
    if (canExpand) onToggleExpand?.()
  }

  // 默认齿轮按钮
  const defaultRight = onConfigure ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onConfigure() }}
      className="w-7 h-7 flex items-center justify-center rounded-md text-[#667788] hover:text-dnd-gold hover:bg-white/[0.06] transition-all active:scale-95"
      title={configureTitle || '配置'}
    >
      <Settings className="w-3.5 h-3.5" />
    </button>
  ) : null

  // 描述预览文本
  const previewText = description
    ? (() => {
      const firstLine = description.split('\n')[0]
      return firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine
    })()
    : null

  const gridTemplateColumns = narrow
    ? '1fr 2fr 8fr 6fr 1fr 1fr'
    : '1fr 2fr 8fr 6fr 1fr 1fr'

  const cellBorder = { borderRight: '1px solid #2a3a4e' }

  // 6列统一网格布局模式
  if (gridLayout) {
    return (
      <div
        className={`${disabled ? 'opacity-50' : ''} ${className}`}
        style={{
          background: 'linear-gradient(180deg, #161e2b 0%, #141c28 50%, #121a25 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px',
          marginBottom: '8px',
          overflow: 'hidden',
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
        {/* 6列网格标题行 — 固定52px，整行可点击展开 */}
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns,
            height: '52px',
            gridTemplateRows: '1fr',
            gap: 0,
            cursor: canExpand ? 'pointer' : 'default',
          }}
          onClick={canExpand ? toggleExpand : undefined}
        >
          {/* 第1列：类别标签（竖排） */}
          <div
            className="flex items-center justify-center h-full"
            style={{
              ...cellBorder,
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '3px',
              color: categoryColor,
              cursor: onCategoryClick ? 'pointer' : 'default',
              userSelect: 'none',
              transition: 'color 0.15s, background 0.15s',
              ...(categoryActive ? { color: '#4ecdc4', background: 'rgba(78,205,196,0.08)' } : {}),
            }}
            onClick={onCategoryClick}
          >
            {category}
          </div>

          {/* 第2列：来源信息（两行） */}
          <div
            className="flex flex-col items-center justify-center gap-px h-full"
            style={cellBorder}
          >
            {sourceMain && (
              <div style={{ fontSize: '9px', color: '#8899aa', whiteSpace: 'nowrap' }}>
                {sourceMain}
              </div>
            )}
            {sourceSub && (
              <div
                style={{ fontSize: '8px', color: '#667788', whiteSpace: 'nowrap' }}
                title={sourceSub}
              >
                {sourceSub.length > 4 ? sourceSub.slice(0, 4) + '…' : sourceSub}
              </div>
            )}
          </div>

          {/* 第3列：特性区（名称 + 按钮统一能量条） */}
          <div
            className="relative flex items-center justify-center h-full overflow-hidden"
            style={{ ...cellBorder, padding: '4px 8px' }}
          >
            {/* 纯文字名称 — 无 footer 时显示 */}
            {name && (
              typeof name === 'string' ? (
                <span
                  className="select-none hover:text-gray-100 transition-colors truncate block w-full text-center"
                  style={{ fontSize: '14px', fontWeight: 600, color: '#f0f0f0' }}
                >
                  {name}
                </span>
              ) : (
                <div className="w-full text-center">{name}</div>
              )
            )}
            {/* 主动技能能量条按钮 — 有内容时覆盖在名字上方 */}
            {footer && (
              <div className="absolute inset-0 flex items-center px-2">
                <div className="w-full">{footer}</div>
              </div>
            )}
          </div>

          {/* 第4列：BUFF简称标签 */}
          <div
            className="flex flex-col items-start justify-center gap-0.5 h-full"
            style={{ ...cellBorder, padding: '4px 8px', overflow: 'hidden' }}
          >
            {buffTags.map((tag, i) => (
              <span
                key={i}
                style={{
                  fontSize: '8px',
                  padding: '0 4px',
                  border: '1px solid #2a3a4e',
                  borderRadius: '2px',
                  background: '#1a2535',
                  color: '#8899aa',
                  whiteSpace: 'nowrap',
                  lineHeight: '12px',
                  height: '12px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* 第5列：展开指示器 */}
          <div
            className="flex items-center justify-center h-full"
            style={{ color: '#556677', transition: 'color 0.15s' }}
          >
            {canExpand && (
              <span
                className="w-6 h-6 flex items-center justify-center"
                title={expanded ? '收起详情' : '展开详情'}
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            )}
          </div>

          {/* 第6列：齿轮按钮 */}
          <div
            className="flex items-center justify-center h-full"
            style={{ color: '#556677', transition: 'color 0.15s' }}
          >
            {headerRight !== undefined ? headerRight : defaultRight}
          </div>
        </div>

        {/* 常驻内容（始终可见，不随展开隐藏） */}
        {alwaysContent && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a3a4e' }}>
            {alwaysContent}
          </div>
        )}

        {/* 展开后的内容（网格下方，全宽） */}
        {expanded && hasDescription && (
          <div style={{ padding: '8px 12px', borderTop: '1px solid #2a3a4e' }}>
            {descriptionNode || (
              <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">
                {description}
              </p>
            )}
          </div>
        )}
        {expanded && hasChildren && (
          <div style={{ padding: '8px 12px' }}>
            {children}
          </div>
        )}
        {!hasDescription && hasChildren && (
          <div style={{ padding: '8px 12px' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  // 原有flex布局模式
  return (
    <div className={`panel-card-compact ${disabled ? 'opacity-50' : ''} ${className}`}>
      {/* 标题行 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {headerLeft || (
            <>
              <span
                className="text-base font-bold text-white cursor-pointer select-none hover:text-gray-100 transition-colors truncate block"
                onClick={toggleExpand}
              >
                {name}
              </span>
              {subtitle && (
                <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">{subtitle}</span>
              )}
            </>
          )}
        </div>
        {headerRight !== undefined ? headerRight : defaultRight}
      </div>

      {/* 常驻底栏（始终可见，用于放置主动技能按钮等） */}
      {footer && (
        <div className="mt-1.5">
          {footer}
        </div>
      )}

      {/* 描述预览（未展开时） */}
      {hasDescription && !expanded && (
        <div
          className="mt-1 flex items-center gap-1.5 cursor-pointer group"
          onClick={toggleExpand}
        >
          <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors truncate flex-1">
            {previewText || '…'}
          </span>
          <span className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0">
            <ChevronDown className="w-3.5 h-3.5" />
          </span>
        </div>
      )}

      {/* 展开后的内容 */}
      {expanded && (
        <>
          {hasDescription && (
            <div className="mt-2 pt-2 border-t border-gray-700/40">
              {descriptionNode || (
                <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">
                  {description}
                </p>
              )}
            </div>
          )}
          {hasChildren && (
            <div className="mt-2">
              {children}
            </div>
          )}
        </>
      )}

      {/* 无描述时子内容始终显示 */}
      {!hasDescription && hasChildren && (
        <div className="mt-2">
          {children}
        </div>
      )}
    </div>
  )
}

/* ── AbilityButton ────────────────────────────────────────────── */

/**
 * 主动技能使用按钮（统一样式）。
 */
export function AbilityButton({ name, costText, usable, disabledReason, onUse, className = '' }) {
  return (
    <button
      type="button"
      disabled={!usable}
      onClick={(e) => { e.stopPropagation(); onUse?.() }}
      className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all active:scale-[0.98] ${
        usable
          ? 'bg-dnd-gold/10 text-dnd-gold-light border-dnd-gold/30 hover:bg-dnd-gold/20 hover:border-dnd-gold/50'
          : 'bg-gray-800/50 text-gray-500 border-gray-600/50 cursor-not-allowed'
      } ${className}`}
      title={usable ? `点击使用${name}` : disabledReason || ''}
    >
      <Zap className="w-3.5 h-3.5" />
      <span>{name}</span>
      {costText && <span className="text-[10px] opacity-70">{costText}</span>}
    </button>
  )
}

/* ── EnergyBarButton ──────────────────────────────────────────── */

/**
 * 主动释放按钮 —— 「实心金胶囊」。
 * 用于职业特性 / 专长 / 种族特性的主动释放按钮。
 * 形状语言与装备卡主动按钮一致（胶囊 + 2px outline + 左名字右动作小胶囊），
 * 区别仅在于类别色：装备卡随物品品类取色，这三类卡统一用金色。
 */
export function EnergyBarButton({
  name,
  onClick,
  disabled = false,
  disabledReason,
  chargeInfo,
  className = '',
}) {
  const gold = '#c79a42'
  const goldLight = '#f0d060'
  const baseShadow = 'inset 0 1px 0 rgba(255,240,200,0.5), inset 0 -1px 0 rgba(90,60,10,0.35), 0 2px 8px rgba(0,0,0,0.3)'
  const hoverShadow = 'inset 0 1px 0 rgba(255,246,220,0.72), inset 0 -1px 0 rgba(90,60,10,0.35), 0 2px 14px rgba(199,154,66,0.45)'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick?.(e) }}
      className={`group relative flex items-center w-full h-9 rounded-full cursor-pointer transition-[box-shadow,outline-color,filter] duration-150 active:scale-[0.98] ${disabled ? 'opacity-45 saturate-50 cursor-not-allowed' : ''} ${className}`}
      style={{
        outline: `2px solid rgba(217,176,85,0.85)`,
        outlineOffset: '-2px',
        background: 'linear-gradient(180deg, #d8ad52 0%, #c79a42 55%, #a97f2e 100%)',
        boxShadow: baseShadow,
      }}
      title={disabled ? disabledReason || '' : `点击使用${name}`}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.outlineColor = '#f5d68a'
          e.currentTarget.style.boxShadow = hoverShadow
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.outlineColor = 'rgba(217,176,85,0.85)'
        e.currentTarget.style.boxShadow = baseShadow
      }}
    >
      {/* 顶部高光线：两端淡出 */}
      <div
        className="absolute top-[2px] left-0 right-0 h-[1px] pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,244,214,0.7) 15%, rgba(255,244,214,0.7) 85%, transparent)' }}
      />
      <span className="relative grid items-center w-full pl-3 pr-1.5" style={{ gridTemplateColumns: '1fr auto', columnGap: '8px' }}>
        {/* 左列：名字 */}
        <span
          className="text-[14px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
          style={{ letterSpacing: '2px', color: '#1b1408' }}
        >
          {name}
        </span>
        {/* 右列：动作小胶囊 —— 闪电 + 充能/消耗信息 */}
        <span
          className="flex items-center gap-1.5 shrink-0 rounded-full"
          style={{
            height: '24px',
            padding: '0 8px',
            background: 'rgba(28,20,6,0.72)',
            border: '1px solid rgba(40,28,8,0.45)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          <span className="relative flex items-center justify-center w-4 h-4">
            <Zap
              className="w-4 h-4 absolute inset-0"
              style={{ color: gold }}
              strokeWidth={2.2}
            />
            {!disabled && (
              <Zap
                className="w-4 h-4 absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: goldLight, filter: `drop-shadow(0 0 5px ${goldLight}aa)` }}
                strokeWidth={2.2}
              />
            )}
          </span>
          {chargeInfo && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: goldLight, lineHeight: '16px' }}>
              {chargeInfo}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

/* ── SlotPanel ────────────────────────────────────────────────── */

/**
 * 通用卡槽面板。
 *
 * @param {object} props
 * @param {string} props.title - 面板标题
 * @param {number} [props.count] - 卡片数量（显示在标题旁）
 * @param {React.ReactNode} [props.headerActions] - 标题行右侧操作（添加按钮等）
 * @param {React.ReactNode} props.children - 卡片列表
 * @param {string} [props.className] - 额外样式
 */
export function SlotPanel({ title, count, headerActions, children, className = '' }) {
  return (
    <div className={`module-panel panel-highlight-top ${className}`}>
      {/* 标题行固定高度：带操作按钮与纯文字标题的面板，下方卡片列表起始位置一致 */}
      <div className="flex items-center justify-between mb-2" style={{ height: '26px' }}>
        <span className="text-sm font-bold text-gray-300">
          {title}{count != null ? `（${count}）` : ''}
        </span>
        {headerActions}
      </div>
      {children}
    </div>
  )
}

/* ─ ShieldPoolCounter ────────────────────────────────────────── */

/**
 * 护盾池计数器组件。
 * 使用 NumberStepper 步进器直接修改当前值，保留护盾图标与颜色提示。
 *
 * @param {object} props
 * @param {number} props.current - 当前值
 * @param {number} props.max - 上限
 * @param {number} [props.threshold=0] - 阈值（低于此值显示红色）
 * @param {function} props.onChange - 值变化回调 (newValue) => void
 * @param {boolean} [props.compact=false] - 紧凑模式（更小尺寸）
 */
export function ShieldPoolCounter({ current, max, threshold = 0, onChange, compact = false, iconColor, textColor, hideIcon = false }) {
  const isDepleted = current <= threshold
  const iconSize = compact ? 'w-4 h-4' : 'w-4 h-4'

  return (
    <div className="inline-flex items-center gap-1">
      {!hideIcon && (
        <Shield className={`${iconSize}`} style={{ color: isDepleted ? '#ef4444' : (iconColor || '#38bdf8'), filter: `drop-shadow(0 0 4px ${isDepleted ? '#ef4444' : (iconColor || '#38bdf8')}88)` }} />
      )}
      <NumberStepper
        value={current}
        min={0}
        max={max}
        compact
        pill
        unifiedColor
        onChange={(v) => onChange?.(v)}
        className={isDepleted ? '[&_input]:!text-red-400 [&_button]:!text-red-400' : ''}
      />
    </div>
  )
}

export default memo(CardView)
