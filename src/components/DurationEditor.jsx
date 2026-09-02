import React from 'react'
import { DURATION_OPTIONS, PRESET_DURATION_OPTIONS, normalizeDuration, needsNumericValue } from '../lib/durationModel'

/**
 * 结构化持续时间编辑器
 *
 * Props:
 *   value: string | DurationObject  (向后兼容旧字符串)
 *   onChange: (DurationObject) => void
 *   compact?: boolean  (紧凑模式，用于主动模式内嵌)
 *   showPresets?: boolean  (是否显示预设快捷选项，默认 true)
 */
export default function DurationEditor({ value, onChange, compact = false, showPresets = true }) {
  const dur = normalizeDuration(value)

  const handleTypeChange = (type) => {
    const next = { type }
    if (['rounds', 'minutes', 'hours', 'days'].includes(type)) {
      next.value = 1
    }
    onChange(next)
  }

  const handlePresetClick = (presetValue) => {
    // 解析预设值如 "3_rounds" → { type: 'rounds', value: 3 }
    const parts = presetValue.split('_')
    const num = parseInt(parts[0], 10)
    const unit = parts.slice(1).join('_')
    onChange({ type: unit, value: num })
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
      <div className="space-y-1.5">
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
        {showPresets && (
          <div className="flex flex-wrap gap-1">
            {PRESET_DURATION_OPTIONS.map(preset => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePresetClick(preset.value)}
                className="px-1.5 py-0.5 rounded border border-cyan-600/50 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/40 text-[9px] font-medium transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-1">
        持续时间
      </label>
      <div className="space-y-2">
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
        {showPresets && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-500 py-0.5">快捷选择：</span>
            {PRESET_DURATION_OPTIONS.map(preset => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePresetClick(preset.value)}
                className="px-2 py-0.5 rounded border border-cyan-600/50 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-800/40 text-[10px] font-medium transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        {DURATION_OPTIONS.find(o => o.value === dur.type)?.desc && (
          <p className="mt-1 text-[10px] text-gray-500">
            {DURATION_OPTIONS.find(o => o.value === dur.type).desc}
          </p>
        )}
      </div>
    </div>
  )
}
