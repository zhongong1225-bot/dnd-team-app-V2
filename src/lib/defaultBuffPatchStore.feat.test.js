import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveDefaultBuffPatch,
  loadDefaultBuffPatch,
  clearDefaultBuffPatch,
  DEFAULT_BUFF_PATCHES_EVENT,
} from './defaultBuffPatchStore'

const MOD = 'test-mod'
const FEAT = 'war_caster'
const oneEffect = [{ effectType: 'ac_bonus', category: 'defense', scope: 'global', value: 1 }]

let mem, events
beforeEach(() => {
  mem = {}
  events = []
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v) },
    removeItem: (k) => { delete mem[k] },
  }
  global.window = { dispatchEvent: (e) => events.push(e) }
})

describe('专长 DM 补丁与职业特性同构', () => {
  it('保存非空效果可读回，并把卡范围同时归一为 type 与 scopeType', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, {
      effects: oneEffect, enabled: true,
      cardScope: { scopeType: 'melee_attack', scopeDetail: ['longsword'] },
    })
    const patch = loadDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(patch.effects).toEqual(oneEffect)
    expect(patch.cardScope.type).toBe('melee_attack')
    expect(patch.cardScope.scopeType).toBe('melee_attack')
    expect(patch.tombstone).toBeUndefined()
  })

  it('scope 为 global 的 cardScope 不落库，读回不带该字段', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, {
      effects: oneEffect, enabled: true, cardScope: { scopeType: 'global', scopeDetail: [] },
    })
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT).cardScope).toBeUndefined()
  })

  it('旧 {type} 约定仍可往返（向后兼容守卫）', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, {
      effects: oneEffect, enabled: true, cardScope: { type: 'ranged_attack' },
    })
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT).cardScope.type).toBe('ranged_attack')
  })

  it('DM 显式清空效果应留墓碑而非删除，以压制硬编码回退', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true })
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: [], enabled: true })
    const patch = loadDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(patch).not.toBeNull()
    expect(patch.effects).toEqual([])
    expect(patch.tombstone).toBe(true)
  })

  it('清空效果但保留卡范围 → 仍是墓碑，且卡范围随模板保留', () => {
    const cardScope = { scopeType: 'weapon_type', scopeDetail: ['longsword'] }
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true, cardScope })
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: [], enabled: true, cardScope })
    const patch = loadDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(patch.tombstone).toBe(true)
    expect(patch.effects).toEqual([])
    expect(patch.cardScope.type).toBe('weapon_type')
  })

  it('clearDefaultBuffPatch 彻底删除模板（返回 null，允许硬编码复活）', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true })
    clearDefaultBuffPatch(MOD, 'feat', FEAT)
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT)).toBeNull()
  })

  it('enabled=false 应被读回', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: false })
    expect(loadDefaultBuffPatch(MOD, 'feat', FEAT).enabled).toBe(false)
  })

  it('专长保存应广播 DEFAULT_BUFF_PATCHES_EVENT，使角色卡立即重算', () => {
    saveDefaultBuffPatch(MOD, 'feat', FEAT, { effects: oneEffect, enabled: true })
    expect(events.some((e) => e.type === DEFAULT_BUFF_PATCHES_EVENT)).toBe(true)
    expect(events[events.length - 1].detail).toEqual({ moduleId: 'test-mod' })
  })

  it('classFeature 空效果写墓碑且保留 cardName（附加字段不被墓碑吞掉）', () => {
    saveDefaultBuffPatch(MOD, 'classFeature', 'cls|sub|fid', { effects: [], enabled: true, cardName: '护盾术' })
    const patch = loadDefaultBuffPatch(MOD, 'classFeature', 'cls|sub|fid')
    expect(patch.tombstone).toBe(true)
    expect(patch.effects).toEqual([])
    expect(patch.cardName).toBe('护盾术')
  })
})
