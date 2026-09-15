import { describe, it, expect } from 'vitest'
import {
  PRESET_DURATION_OPTIONS,
  DURATION_OPTIONS,
  normalizeDuration,
  formatDurationBrief,
  needsNumericValue,
} from './durationModel'

describe('持续时间快捷预设', () => {
  it('每个预设的类型都必须是下拉里真实存在的选项', () => {
    const valid = new Set(DURATION_OPTIONS.map((o) => o.value))
    for (const p of PRESET_DURATION_OPTIONS) {
      expect(valid.has(p.type), `预设「${p.label}」的类型 ${p.type} 不在下拉选项中`).toBe(true)
      expect(p.num).toBeGreaterThanOrEqual(1)
    }
  })

  it('点击预设写入的结构化值能被正常识别并显示', () => {
    for (const p of PRESET_DURATION_OPTIONS) {
      const dur = normalizeDuration({ type: p.type, value: p.num })
      expect(needsNumericValue(dur)).toBe(true)
      expect(formatDurationBrief(dur)).toBe(p.label.replace(/\s/g, ''))
    }
  })
})
