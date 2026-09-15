import { describe, it, expect } from 'vitest'
import { withInvocationBuffPatch } from './effectMapping'

describe('withInvocationBuffPatch — 祈唤角色自身配置写回', () => {
  it('字符串条目设非空配置 → 转为对象并挂 invocationBuffPatch', () => {
    const next = withInvocationBuffPatch(['a', 'b'], 'a', {
      effects: [{ effectType: 'damage_bonus', value: 2 }],
    })
    expect(next[0]).toEqual({
      invocationId: 'a',
      invocationBuffPatch: { effects: [{ effectType: 'damage_bonus', value: 2 }] },
    })
    expect(next[1]).toBe('b')
  })

  it('空配置（无效果/无时长/启用）→ 移除 invocationBuffPatch', () => {
    const src = [{ invocationId: 'a', invocationBuffPatch: { effects: [{ effectType: 'x' }] } }]
    const next = withInvocationBuffPatch(src, 'a', { effects: [], enabled: true })
    expect(next[0].invocationBuffPatch).toBeUndefined()
    expect(next[0].invocationId).toBe('a')
  })

  it('保留条目上的其他字段', () => {
    const src = [{ invocationId: 'a', slotId: 's1' }]
    const next = withInvocationBuffPatch(src, 'a', { effects: [{ effectType: 'ac_bonus', value: 1 }] })
    expect(next[0].slotId).toBe('s1')
    expect(next[0].invocationBuffPatch.effects).toHaveLength(1)
  })

  it('enabled=false 被记录', () => {
    const next = withInvocationBuffPatch(['a'], 'a', { effects: [], enabled: false })
    expect(next[0].invocationBuffPatch.enabled).toBe(false)
  })

  it('duration 非空被记录，空串被忽略', () => {
    const withDur = withInvocationBuffPatch(['a'], 'a', { effects: [], duration: '1 小时' })
    expect(withDur[0].invocationBuffPatch.duration).toBe('1 小时')
    const emptyDur = withInvocationBuffPatch(['a'], 'a', { effects: [], duration: '' })
    expect(emptyDur[0].invocationBuffPatch).toBeUndefined()
  })

  it('只改目标祈唤，其余原样返回', () => {
    const src = ['a', { invocationId: 'b', invocationBuffPatch: { effects: [{ effectType: 'keep' }] } }]
    const next = withInvocationBuffPatch(src, 'a', { effects: [{ effectType: 'new' }] })
    expect(next[1]).toBe(src[1])
  })
})
