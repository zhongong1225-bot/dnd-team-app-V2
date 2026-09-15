import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDefaultBuffPatch,
  loadDefaultBuffPatch,
  mergeWithDefaultPatch,
  buildClassFeatureBuffKey,
} from './defaultBuffPatchStore'

const MOD = 'test-mod'
const KEY = buildClassFeatureBuffKey('火铳手', '', 'deadly_focus')

let mem
beforeEach(() => {
  mem = {}
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
  }
})

describe('DM 补丁的结构化 duration 不被压成 [object Object]', () => {
  it('保存→读取往返保留结构化时长对象', () => {
    const dur = { type: 'until_long_rest' }
    saveDefaultBuffPatch(MOD, 'classFeature', KEY, {
      effects: [{ effectType: 'ac_bonus', value: 2 }],
      duration: dur,
      enabled: true,
    })
    const patch = loadDefaultBuffPatch(MOD, 'classFeature', KEY)
    expect(patch.duration).toEqual(dur)
    expect(patch.duration).not.toBe('[object Object]')
  })

  it('旧格式字符串时长仍原样保留', () => {
    saveDefaultBuffPatch(MOD, 'classFeature', KEY, {
      effects: [{ effectType: 'ac_bonus', value: 2 }],
      duration: '1分钟',
      enabled: true,
    })
    expect(loadDefaultBuffPatch(MOD, 'classFeature', KEY).duration).toBe('1分钟')
  })

  it('空时长不写入 duration 字段', () => {
    saveDefaultBuffPatch(MOD, 'classFeature', KEY, {
      effects: [{ effectType: 'ac_bonus', value: 2 }],
      duration: '',
      enabled: true,
    })
    expect(loadDefaultBuffPatch(MOD, 'classFeature', KEY).duration).toBeUndefined()
  })

  it('mergeWithDefaultPatch 优先取 DM 默认的结构化时长且保留对象形状', () => {
    const merged = mergeWithDefaultPatch(
      { effects: [], duration: '1轮' },
      { effects: [], duration: { type: 'until_short_rest' } },
    )
    expect(merged.duration).toEqual({ type: 'until_short_rest' })
  })

  it('mergeWithDefaultPatch 在 DM 默认无时长时回退个人时长', () => {
    const merged = mergeWithDefaultPatch(
      { effects: [], duration: { type: 'until_dawn' } },
      { effects: [] },
    )
    expect(merged.duration).toEqual({ type: 'until_dawn' })
  })
})
