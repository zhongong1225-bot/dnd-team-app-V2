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
      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all active:scale-95"
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
    ? '46px 76px 286px 136px 1fr 46px'
    : '46px 76px 376px 136px 1fr 46px'

  const cellBorder = { borderRight: '1px solid #2a3a4e' }

  // 6列统一网格布局模式
  if (gridLayout) {
    return (
      <div
        className={`${disabled ? 'opacity-50' : ''} ${className}`}
        style={{
          background: '#1e2a3a',
          border: '1px solid #2a3a4e',
          borderRadius: '8px',
          marginBottom: '8px',
          overflow: 'hidden',
        }}
      >
        {/* 6列网格标题行 — 固定52px */}
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns,
            height: '52px',
            gridTemplateRows: '1fr',
            gap: 0,
          }}
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
              <div style={{ fontSize: '8px', color: '#667788', whiteSpace: 'nowrap' }}>
                {sourceSub}
              </div>
            )}
          </div>

          {/* 第3列：特性区（名称 + 按钮） */}
          <div
            className="flex items-center justify-center gap-3 h-full"
            style={{ ...cellBorder, padding: '4px 8px', overflow: 'hidden' }}
          >
            {name && (
              typeof name === 'string' ? (
                <span
                  className="cursor-pointer select-none hover:text-gray-100 transition-colors truncate shrink-0"
                  style={{ fontSize: '16px', fontWeight: 600, color: '#f0f0f0' }}
                  onClick={toggleExpand}
                >
                  {name}
                </span>
              ) : (
                <div className="shrink-0" onClick={toggleExpand}>{name}</div>
              )
            )}
            {footer}
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

          {/* 第5列：留白 */}
          <div className="h-full" />

          {/* 第6列：齿轮按钮 */}
          <div
            className="flex items-center justify-center h-full"
            style={{ color: '#556677', transition: 'color 0.15s' }}
          >
            {headerRight !== undefined ? headerRight : defaultRight}
          </div>
        </div>

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
      <div className="flex items-center justify-between mb-2">
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
