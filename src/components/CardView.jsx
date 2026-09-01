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
export function ShieldPoolCounter({ current, max, threshold = 0, onChange, compact = false }) {
  const isDepleted = current <= threshold
  const iconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <div className="inline-flex items-center gap-1">
      <Shield className={`${iconSize} ${isDepleted ? 'text-red-400' : 'text-dnd-gold'}`} />
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
