import { describe, it, expect } from 'vitest'
import { mergeRuleTextOverrideRecords } from './ruleTextOverrides'

describe('mergeRuleTextOverrideRecords 保存时间新者赢', () => {
  const local = { entries: { 'cf|德鲁伊|spellcasting_druid|n': '本机版' }, updatedAt: 100 }
  const remote = { entries: { 'cf|德鲁伊|spellcasting_druid|n': '云端版' }, updatedAt: 200 }

  it('云端更新 → 落地本地，不回传', () => {
    const r = mergeRuleTextOverrideRecords(local, remote)
    expect(r.replaceLocal).toBe(true)
    expect(r.upload).toBe(false)
    expect(r.winner.entries['cf|德鲁伊|spellcasting_druid|n']).toBe('云端版')
  })

  it('本地更新 → 保留本地并首连回传', () => {
    const r = mergeRuleTextOverrideRecords({ ...local, updatedAt: 300 }, remote)
    expect(r.replaceLocal).toBe(false)
    expect(r.upload).toBe(true)
    expect(r.winner.entries['cf|德鲁伊|spellcasting_druid|n']).toBe('本机版')
  })

  it('时间相同 → 两侧都不动', () => {
    const r = mergeRuleTextOverrideRecords(local, { ...remote, updatedAt: 100 })
    expect(r.replaceLocal).toBe(false)
    expect(r.upload).toBe(false)
  })

  it('云端无记录且本地有内容 → 上传本地', () => {
    const r = mergeRuleTextOverrideRecords(local, null)
    expect(r.upload).toBe(true)
    expect(r.replaceLocal).toBe(false)
  })

  it('云端无记录且本地为空 → 什么都不做', () => {
    expect(mergeRuleTextOverrideRecords(null, null).upload).toBe(false)
    expect(mergeRuleTextOverrideRecords({ entries: {}, updatedAt: 5 }, null).upload).toBe(false)
  })

  it('本地无记录而云端有 → 落地本地', () => {
    const r = mergeRuleTextOverrideRecords(null, remote)
    expect(r.replaceLocal).toBe(true)
    expect(r.upload).toBe(false)
  })

  it('entries 形状非法的记录视为不存在', () => {
    const r = mergeRuleTextOverrideRecords(local, { entries: '坏数据', updatedAt: 999 })
    expect(r.upload).toBe(true)
    expect(r.replaceLocal).toBe(false)
  })
})
