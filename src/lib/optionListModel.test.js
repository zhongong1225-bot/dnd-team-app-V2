import { describe, it, expect } from 'vitest'
import {
  OPTION_LIST_DEFAULT_TITLE,
  normalizeOptionListValue,
  extractOptionLists,
} from './optionListModel'

describe('normalizeOptionListValue', () => {
  it('非对象输入归一化为空表', () => {
    expect(normalizeOptionListValue(undefined)).toEqual({
      title: '', note: '', costLabel: '', options: [],
    })
    expect(normalizeOptionListValue([1, 2]).options).toEqual([])
  })

  it('旧诡诈打击结构用 effect 表示说明文字，落到 detail', () => {
    const v = normalizeOptionListValue({
      title: '诡诈打击选项',
      costLabel: '偷袭骰',
      options: [{ name: '淬毒', cost: '1d6', save: '体质', effect: '目标中毒' }],
    })
    expect(v.options[0]).toEqual({ name: '淬毒', cost: '1d6', save: '体质', detail: '目标中毒' })
  })

  it('detail 优先于旧的 effect，缺字段补空串', () => {
    const v = normalizeOptionListValue({
      options: [{ name: '撤步', detail: '新说明', effect: '旧说明' }, { cost: 2 }],
    })
    expect(v.options[0].detail).toBe('新说明')
    expect(v.options[1]).toEqual({ name: '', cost: '2', save: '', detail: '' })
  })

  it('丢掉非选项对象与多余字段', () => {
    const v = normalizeOptionListValue({ options: [null, 'x', { name: 'A', junk: 1 }] })
    expect(v.options).toEqual([{ name: 'A', cost: '', save: '', detail: '' }])
  })
})

describe('extractOptionLists', () => {
  it('只取 option_list 效果，其余忽略', () => {
    const lists = extractOptionLists([
      { effectType: 'ac_bonus', value: 2 },
      { effectType: 'option_list', value: { title: OPTION_LIST_DEFAULT_TITLE, options: [{ name: 'A' }] } },
      { effectType: 'option_list', value: null },
    ])
    expect(lists).toHaveLength(1)
    expect(lists[0].options[0].name).toBe('A')
  })

  it('无效果数组时返回空', () => {
    expect(extractOptionLists(undefined)).toEqual([])
  })
})
