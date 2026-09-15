import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDefaultBuffPatch,
  loadDefaultBuffPatch,
  clearDefaultBuffPatch,
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

describe('职业特性 DM 补丁的墓碑语义', () => {
  it('DM 显式清空效果后应留墓碑（非 null），以压制硬编码回退', () => {
    saveDefaultBuffPatch(MOD, 'classFeature', KEY, { effects: [], enabled: true })
    const patch = loadDefaultBuffPatch(MOD, 'classFeature', KEY)
    expect(patch).not.toBeNull()
    expect(patch.effects).toEqual([])
    expect(patch.tombstone).toBe(true)
  })

  it('BuffManager 清除应彻底删除补丁（返回 null，允许硬编码回退）', () => {
    saveDefaultBuffPatch(MOD, 'classFeature', KEY, { effects: [{ effectType: 'ac_bonus', value: 1 }], enabled: true })
    clearDefaultBuffPatch(MOD, 'classFeature', KEY)
    expect(loadDefaultBuffPatch(MOD, 'classFeature', KEY)).toBeNull()
  })

  it('保存非空效果时正常存储且不带墓碑', () => {
    const effects = [{ effectType: 'ac_bonus', category: 'defense', scope: 'global', value: 2 }]
    saveDefaultBuffPatch(MOD, 'classFeature', KEY, { effects, enabled: true })
    const patch = loadDefaultBuffPatch(MOD, 'classFeature', KEY)
    expect(patch.effects).toEqual(effects)
    expect(patch.tombstone).toBeUndefined()
  })
})
