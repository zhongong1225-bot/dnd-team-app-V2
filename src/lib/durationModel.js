/**
 * 结构化持续时间模型
 *
 * 将自由文本持续时间替换为结构化选项，支持自动清理规则。
 * 向后兼容：旧自由文本存储为 { type: 'custom', text: '...' }
 */

export const DURATION_OPTIONS = [
  { value: 'instant', label: '即刻', desc: '即时效果（回血、造成伤害等），自动计算投掷' },
  { value: 'rounds', label: '回合', desc: '以战斗回合计' },
  { value: 'minutes', label: '分钟', desc: '以分钟计（<60分钟 短休自动取消）' },
  { value: 'hours', label: '小时', desc: '以小时计（<8小时 长休自动取消）' },
  { value: 'days', label: '天', desc: '以天计' },
  { value: 'until_short_rest', label: '直到短休', desc: '短休后自动取消' },
  { value: 'until_long_rest', label: '直到长休', desc: '长休后自动取消' },
  { value: 'until_dawn', label: '直到黎明', desc: '黎明后自动取消' },
  { value: 'concentration', label: '专注', desc: '需维持专注，失去专注则结束' },
  { value: 'permanent', label: '永久', desc: '永不自动取消' },
  { value: 'custom', label: '自定义', desc: '自由描述持续时间' },
]

/** 预设时长快捷选项（用于 temp_buff 等需要快速选择的场景） */
export const PRESET_DURATION_OPTIONS = [
  { value: '1_round', label: '1 回合' },
  { value: '3_rounds', label: '3 回合' },
  { value: '1_minute', label: '1 分钟' },
  { value: '10_minutes', label: '10 分钟' },
  { value: '1_hour', label: '1 小时' },
  { value: '8_hours', label: '8 小时' },
  { value: '24_hours', label: '24 小时' },
]

/** 需要数值输入的持续时间类型 */
const TIMED_TYPES = new Set(['rounds', 'minutes', 'hours', 'days'])

/**
 * 规范化持续时间（向后兼容）
 * @param {string|object} raw - 旧格式字符串 或 新格式对象
 * @returns {{ type: string, value?: number, text?: string }}
 */
export function normalizeDuration(raw) {
  if (!raw) return { type: 'permanent' }

  // 已经是新格式
  if (typeof raw === 'object' && raw.type) {
    return raw
  }

  // 旧格式：自由文本 → custom
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return { type: 'permanent' }

    // 尝试识别常见模式
    const lower = trimmed.toLowerCase()
    if (lower === '即刻' || lower === 'instant') return { type: 'instant' }
    if (lower === '专注' || lower === 'concentration') return { type: 'concentration' }
    if (lower === '永久' || lower === 'permanent') return { type: 'permanent' }
    if (lower.includes('短休') || lower.includes('short rest')) return { type: 'until_short_rest' }
    if (lower.includes('长休') || lower.includes('long rest')) return { type: 'until_long_rest' }
    if (lower.includes('黎明') || lower.includes('dawn')) return { type: 'until_dawn' }

    // 尝试解析 "X回合/分钟/小时/天"
    const numMatch = trimmed.match(/^(\d+)\s*(回合|分钟|小时|天)/)
    if (numMatch) {
      const num = parseInt(numMatch[1], 10)
      const unitMap = { '回合': 'rounds', '分钟': 'minutes', '小时': 'hours', '天': 'days' }
      return { type: unitMap[numMatch[2]], value: num }
    }

    // 无法识别 → custom
    return { type: 'custom', text: trimmed }
  }

  return { type: 'permanent' }
}

/**
 * 格式化持续时间为简短显示文本
 */
export function formatDurationBrief(dur) {
  if (!dur) return ''
  const d = normalizeDuration(dur)
  const opt = DURATION_OPTIONS.find(o => o.value === d.type)
  const label = opt?.label ?? d.type

  if (d.type === 'custom') return d.text || '自定义'
  if (TIMED_TYPES.has(d.type) && d.value != null) return `${d.value}${label}`
  return label
}

/**
 * 判断是否应在休息时自动清除
 * @param {object} dur - 结构化持续时间
 * @param {'short'|'long'} restType - 休息类型
 * @returns {boolean}
 */
export function shouldAutoClearOnRest(dur, restType) {
  const d = normalizeDuration(dur)

  // 直到短休：任何休息都清除
  if (d.type === 'until_short_rest') return true
  // 直到长休/黎明：只有长休清除
  if (d.type === 'until_long_rest' || d.type === 'until_dawn') return restType === 'long'

  // 计时型：根据时长判断
  if (d.type === 'minutes' && d.value != null && d.value < 60) return restType === 'short'
  if (d.type === 'hours' && d.value != null && d.value < 8) return restType === 'long'

  return false
}

/**
 * 是否为即刻效果
 */
export function isInstantDuration(dur) {
  return normalizeDuration(dur).type === 'instant'
}

/**
 * 是否需要数值输入
 */
export function needsNumericValue(dur) {
  return TIMED_TYPES.has(normalizeDuration(dur).type)
}
