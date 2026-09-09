import { describe, it, expect } from 'vitest'
import { cloneBuffTemplateToManual } from './buffStash'
import { cloneDurationRaw, normalizeDuration, shouldAutoClearOnRest } from './durationModel'

describe('cloneDurationRaw（跨存储拷贝模板时保留持续时间原始形状）', () => {
  it('结构化对象原样保留，不被压成 "[object Object]"', () => {
    expect(cloneDurationRaw({ type: 'until_long_rest' })).toEqual({ type: 'until_long_rest' })
    expect(cloneDurationRaw({ type: 'rounds', value: 3 })).toEqual({ type: 'rounds', value: 3 })
  })

  it('旧格式字符串保留并去空白', () => {
    expect(cloneDurationRaw('  1 小时  ')).toBe('1 小时')
  })

  it('空值 / 空串 / 无 type 的对象一律归为 undefined', () => {
    expect(cloneDurationRaw(null)).toBeUndefined()
    expect(cloneDurationRaw(undefined)).toBeUndefined()
    expect(cloneDurationRaw('   ')).toBeUndefined()
    expect(cloneDurationRaw({})).toBeUndefined()
  })

  it('返回的是副本，改动不影响原模板', () => {
    const src = { type: 'until_short_rest' }
    const copy = cloneDurationRaw(src)
    copy.type = 'permanent'
    expect(src.type).toBe('until_short_rest')
  })

  it('保留后的对象能被 normalizeDuration 正确识别（休息清除依赖此路径）', () => {
    expect(normalizeDuration(cloneDurationRaw({ type: 'until_long_rest' })).type).toBe('until_long_rest')
  })
})

describe('cloneBuffTemplateToManual（暂存「应用到当前 Buff」）', () => {
  const template = {
    source: '冒险祝福',
    sourceKind: 'adventure',
    duration: { type: 'until_long_rest' },
    enabled: false,
    effects: [{ category: 'defense', effectType: 'ac_bonus', scope: 'global', value: 2 }],
  }

  it('结构化持续时间在拷贝后保持原样，仍可随长休自动清除', () => {
    const clone = cloneBuffTemplateToManual(template)
    expect(clone.duration).toEqual({ type: 'until_long_rest' })
    expect(normalizeDuration(clone.duration).type).toBe('until_long_rest')
    expect(shouldAutoClearOnRest(clone.duration, 'long')).toBe(true)
    expect(shouldAutoClearOnRest(clone.duration, 'short')).toBe(false)
  })

  it('旧格式字符串持续时间同样保留', () => {
    expect(cloneBuffTemplateToManual({ ...template, duration: '专注' }).duration).toBe('专注')
  })

  it('应用后一律启用，并生成新 id', () => {
    const clone = cloneBuffTemplateToManual(template)
    expect(clone.enabled).toBe(true)
    expect(clone.id).toBeTruthy()
    expect(clone.id).not.toBe(template.id)
  })

  it('非对象输入返回 null', () => {
    expect(cloneBuffTemplateToManual(null)).toBeNull()
    expect(cloneBuffTemplateToManual('x')).toBeNull()
  })
})
