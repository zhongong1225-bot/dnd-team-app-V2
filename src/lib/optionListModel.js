/**
 * 选项清单（option_list）：纯查阅用的卡内选项表数据模型。
 * 不参与数值计算，只被角色页渲染成"名称 / 消耗 / 豁免 / 说明"的逐行折叠表。
 */

export const OPTION_LIST_DEFAULT_TITLE = '选项清单'

/** 归一化选项清单值；兼容旧诡诈打击结构里用 effect 表示说明文字 */
export function normalizeOptionListValue(value) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const options = Array.isArray(v.options)
    ? v.options
        .filter((o) => o && typeof o === 'object')
        .map((o) => ({
          name: typeof o.name === 'string' ? o.name : '',
          cost: o.cost == null ? '' : String(o.cost),
          save: typeof o.save === 'string' ? o.save : '',
          detail: typeof o.detail === 'string' ? o.detail : (typeof o.effect === 'string' ? o.effect : ''),
        }))
    : []
  return {
    title: typeof v.title === 'string' ? v.title : '',
    note: typeof v.note === 'string' ? v.note : '',
    costLabel: typeof v.costLabel === 'string' ? v.costLabel : '',
    options,
  }
}

/** 从效果数组中取出所有选项清单效果（已归一化） */
export function extractOptionLists(effects) {
  if (!Array.isArray(effects)) return []
  return effects
    .filter((e) => e?.effectType === 'option_list' && e.value && typeof e.value === 'object')
    .map((e) => normalizeOptionListValue(e.value))
}
