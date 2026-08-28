import React from 'react'
import { DURATION_OPTIONS, normalizeDuration, needsNumericValue } from '../lib/durationModel'

/**
 * 结构化持续时间编辑器
 *
 * Props:
 *   value: string | DurationObject  (向后兼容旧字符串)
 *   onChange: (DurationObject) => void
 *   compact?: boolean  (紧凑模式，用于主动模式内嵌)
 */
export default function DurationEditor({ value, onChange, compact = false }) {
  const dur = normalizeDuration(value)

  const handleTypeChange = (type) => {
    const next = { type }
    if (['rounds', 'minutes', 'hours', 'days'].includes(type)) {
      next.value = 1
    }
    onChange(next)
  }

  const handleValueChange = (val) => {
    onChange({ ...dur, value: Math.max(1, parseInt(val, 10) || 1) })
  }

  const handleTextChange = (text) => {
    onChange({ ...dur, text })
  }

  const showNumber = needsNumericValue(dur)
  const showCustomText = dur.type === 'custom'

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <select
          value={dur.type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="h-7 px-1.5 rounded-md bg-gray-900/60 border border-white/10 text-gray-200 text-[11px] focus:outline-none focus:border-dnd-gold/50"
        >
          {DURATION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {showNumber && (
          <input
            type="number"
            min={1}
            value={dur.value ?? 1}
            onChange={(e) => handleValueChange(e.target.value)}
            className="h-7 w-14 px-1.5 rounded-md bg-gray-900/60 border border-white/10 text-gray-200 text-[11px] text-center focus:outline-none focus:border-dnd-gold/50"
          />
        )}
        {showCustomText && (
          <input
            type="text"
            value={dur.text ?? ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="自定义描述..."
            className="h-7 px-1.5 rounded-md bg-gray-900/60 border border-white/10 text-gray-200 text-[11px] flex-1 min-w-[6rem] focus:outline-none focus:border-dnd-gold/50"
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">
        持续时间
      </label>
      <div className="flex items-center gap-2">
        <select
          value={dur.type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="h-10 px-3 rounded-lg bg-gray-900/60 border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-dnd-gold/50 min-w-[7rem]"
        >
          {DURATION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {showNumber && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={dur.value ?? 1}
              onChange={(e) => handleValueChange(e.target.value)}
              className="h-10 w-20 px-2 rounded-lg bg-gray-900/60 border border-white/10 text-gray-200 text-sm text-center focus:outline-none focus:border-dnd-gold/50"
            />
            <span className="text-gray-500 text-xs">
              {dur.type === 'rounds' ? '回合' : dur.type === 'minutes' ? '分钟' : dur.type === 'hours' ? '小时' : '天'}
            </span>
          </div>
        )}
        {showCustomText && (
          <input
            type="text"
            value={dur.text ?? ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="自定义描述..."
            className="h-10 px-3 rounded-lg bg-gray-900/60 border border-white/10 text-gray-200 text-sm flex-1 focus:outline-none focus:border-dnd-gold/50"
          />
        )}
      </div>
      {DURATION_OPTIONS.find(o => o.value === dur.type)?.desc && (
        <p className="mt-1 text-[10px] text-gray-500">
          {DURATION_OPTIONS.find(o => o.value === dur.type).desc}
        </p>
      )}
    </div>
  )
}
