import { Trash2, Pencil } from 'lucide-react'
import { getBuffSourceKindLabel, getBuffSourceKindTitle } from '../lib/buffSourceKind'
import { getEffectInfo, getDamageTypeLabel, getConditionLabel, ABILITY_NAMES_ZH, formatDamagePiercingTraitsValue, formatDamageForAttack, formatScopeBrief, normalizeScope, formatSpellDamageBonusValue } from '../data/buffTypes'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { formatContainedSpellBrief } from '../lib/containedSpellBrief'
import { normalizeChargeRecoveryValue } from '../lib/chargeRecovery'
import { isFormulaValue, formatFormulaLabel, evaluateBuffValue } from '../lib/formulas'

/** 公式标签 + 求值后数字，例如「等级×2（+4）」、「感知调整值（+3）」 */
function formatFormulaLabelWithEval(value, context = {}) {
  if (!isFormulaValue(value)) return String(value ?? '')
  const label = formatFormulaLabel(value)
  const num = evaluateBuffValue(value, context)
  const sign = typeof num === 'number' && num >= 0 ? '+' : ''
  return `${label}（${sign}${num}）`
}

/** 统一把属性/豁免/技能条目的值格式化为带符号字符串，避免直接 Number(数组/对象) 得到 NaN */
function formatSignedEntryVal(val, context = {}) {
  if (isFormulaValue(val)) return formatFormulaLabelWithEval(val, context)
  const num = evaluateBuffValue(val, context)
  const sign = num >= 0 ? '+' : ''
  return `${sign}${num}`
}

/** 判断一个对象是否是「属性/豁免/技能」配置对象（键为属性名，而非数字索引） */
function isPlainAbilityObject(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || isFormulaValue(v)) return false
  const keys = Object.keys(v).filter((k) => k !== 'advantage')
  if (keys.length === 0) return true
  return keys.every((k) => !/^\d+$/.test(k))
}

/** 命中/伤害/攻击伤害加值：若非全局，附加起效范围摘要 */
function getScopeSuffix(effectType, scope, scopeDetail) {
  if (!['attack_bonus', 'damage_bonus', 'attack_damage_bonus'].includes(effectType)) return ''
  const { scope: ns, scopeDetail: nd } = normalizeScope(scope, scopeDetail)
  return formatScopeBrief(ns, nd)
}

/** 命中/伤害加值摘要：全局 + 分武器行 / 旧版 weaponScope + weaponCategories */
function formatAttackDamageBonusSummaryText(effectType, v, context = {}) {
  if (effectType !== 'attack_damage_bonus' || !v || typeof v !== 'object' || Array.isArray(v)) return ''
  const adv = v.advantage === 'advantage' ? ' 优势' : v.advantage === 'disadvantage' ? ' 劣势' : ''
  const parts = []
  const gnum = evaluateBuffValue(v.val, context)
  const gdisp = isFormulaValue(v.val) ? formatFormulaLabelWithEval(v.val, context) : gnum
  if (gnum !== 0) parts.push(`全局${gnum >= 0 ? '+' : ''}${gdisp}`)
  const rows = Array.isArray(v.categoryRows) ? v.categoryRows.filter((r) => String(r.key || '').trim()) : []
  if (rows.length) {
    rows.forEach((r) => {
      const nnum = evaluateBuffValue(r.val, context)
      const ndisp = isFormulaValue(r.val) ? formatFormulaLabelWithEval(r.val, context) : nnum
      parts.push(`${r.key}${nnum >= 0 ? '+' : ''}${ndisp}`)
    })
  }
  if (parts.length === 0 && v.weaponScope === 'weapon_category') {
    const cats = Array.isArray(v.weaponCategories) ? v.weaponCategories.filter(Boolean) : []
    if (cats.length) {
      const num = evaluateBuffValue(v.val, context)
      const numStr = num !== 0 ? (num >= 0 ? '+' : '') + (isFormulaValue(v.val) ? formatFormulaLabelWithEval(v.val, context) : num) : ''
      return `${cats.join('、')}${numStr}${adv}`.trim()
    }
  }
  return (parts.join('；') || '') + adv
}

/** 单条效果的简化文案（用于外层一行展示），如 "心灵抗性"、"智力-2，感知+2"、"生命上限+26" */
export function getEffectSummaryShort(buff, context = {}, baseContext = context) {
  const info = getEffectInfo(buff.effectType)
  if (!info) return buff.value != null ? String(buff.value) : ''
  // 自由填写：优先 value（与保存一致），兼容 customText；空时显示占位便于记录“仅描述”类效果
  if (buff.effectType.startsWith('custom_')) {
    const text = (buff.value != null && buff.value !== '' ? String(buff.value) : '') || (buff.customText != null && buff.customText !== '' ? String(buff.customText) : '')
    return text || '（自由填写）'
  }
  const rawLabel = info.effect.label ?? buff.effectType
  const scopeSuffix = getScopeSuffix(buff.effectType, buff.scope, buff.scopeDetail)
  const effectLabel = scopeSuffix ? `${rawLabel}${scopeSuffix}` : rawLabel
  const v = buff.value

  if (info.effect.dataType === 'boolean') return buff.value ? effectLabel : ''
  if (buff.effectType === 'crit_extra_dice' && typeof v === 'number' && !Number.isNaN(v)) {
    return `${effectLabel}${v}`
  }
  if (info.effect.dataType === 'number' && (typeof v === 'number' || isFormulaValue(v))) {
    if (isFormulaValue(v)) return `${effectLabel}${formatFormulaLabelWithEval(v, context)}`
    const sign = v >= 0 ? '+' : ''
    return `${effectLabel}${sign}${v}`
  }
  if (info.effect.dataType === 'object' && v) {
    if (Array.isArray(v) || isFormulaValue(v)) return effectLabel
    if (v.type != null && (typeof v.val === 'number' || isFormulaValue(v.val))) {
      const typeLabel = getDamageTypeLabel(v.type)
      if (isFormulaValue(v.val)) return `${typeLabel}${formatFormulaLabelWithEval(v.val, context)}`
      const sign = v.val >= 0 ? '+' : ''
      return `${typeLabel}${sign}${v.val}`
    }
    if (info.effect.subSelect === 'numberAndAdvantage') {
      if (buff.effectType === 'attack_damage_bonus') {
        const detail = formatAttackDamageBonusSummaryText(buff.effectType, v, context)
        return detail ? effectLabel + detail : effectLabel
      }
      let numStr = ''
      if (isFormulaValue(v.val)) {
        numStr = formatFormulaLabelWithEval(v.val, context)
      } else {
        const val = v.val ?? (typeof v === 'number' ? v : 0)
        if (val !== 0) numStr = (val >= 0 ? '+' : '') + val
      }
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return effectLabel + (numStr ? numStr : '') + (adv ? (numStr ? ' ' : '') + adv : '')
    }
    if (info.effect.subSelect === 'flightSpeed') {
      const speed = evaluateBuffValue(v.speed, context) ?? (typeof v === 'number' ? v : 0)
      const hover = v.hover ? '悬浮' : ''
      return (speed ? speed + '尺' : '') + (hover ? (speed ? ' ' : '') + hover : '') || effectLabel
    }
    if (info.effect.subSelect === 'initBonusAndProficiency' || buff.effectType === 'initiative_buff') {
      const parts = []
      if (v.bonus != null && v.bonus !== 0) {
        const num = evaluateBuffValue(v.bonus, context)
        if (!Number.isNaN(num)) {
          if (isFormulaValue(v.bonus)) parts.push(formatFormulaLabelWithEval(v.bonus, context))
          else parts.push((num >= 0 ? '+' : '') + num)
        }
      }
      if (v.proficient) parts.push('熟练')
      return parts.length ? `${effectLabel} ${parts.join(' ')}` : effectLabel
    }
    if (info.effect.subSelect === 'abilityScoresAndAdvantage' && isPlainAbilityObject(v)) {
      const labels = buff.effectType === 'save_bonus' ? SAVE_NAMES : ABILITY_NAMES_ZH
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          const nameZh = labels[k] ?? k
          return `${nameZh}${formatSignedEntryVal(val, context)}`
        })
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return parts.join('，') + (adv ? (parts.length ? '，' : '') + adv : '')
    }
    if (info.effect.subSelect === 'skillsAndAdvantage' && isPlainAbilityObject(v)) {
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      const { scope: ns, scopeDetail: nd } = normalizeScope(buff.scope, buff.scopeDetail)
      // 为 skill_bonus 优势构造「范围下」前缀：自定义时直接取输入文本，全局显示「全局」
      const scopeLabel = (() => {
        if (ns === 'global' || ns === '') return '全局'
        if (ns === 'custom') return nd[0] || '自定义'
        // 其他范围沿用已有括号形式，但不带括号
        const brief = formatScopeBrief(ns, nd)
        return brief ? brief.replace(/^（|）$/g, '') : ns
      })()
      // 优势时保留所有已选技能（含数值为 0），以便显示「XXX范围下XXX优势」
      const shouldKeepZero = !!adv
      const entries = Object.entries(v).filter(([k, val]) => {
        if (k === 'advantage') return false
        if (val == null) return false
        if (isFormulaValue(val)) return true
        if (typeof val === 'number') return shouldKeepZero ? true : val !== 0
        return shouldKeepZero ? true : val !== 0
      })
      const parts = entries.map(([k, val]) => {
        const sk = SKILLS.find((s) => s.id === k)
        const nameZh = sk ? sk.name : k
        if (adv) {
          return `${scopeLabel}范围下${nameZh}${adv}`
        }
        return `${nameZh}${formatSignedEntryVal(val, context)}`
      })
      // 去重：同一技能可能因多条数据重复出现
      const uniqueParts = Array.from(new Set(parts))
      return uniqueParts.join('，')
    }
    if ((buff.effectType === 'ability_override' || buff.effectType === 'ability_score_uncapped') && isPlainAbilityObject(v)) {
      const entries = Object.entries(v).filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
      if (entries.length === 0) return ''
      const parts = entries.map(([k, val]) => {
        const nameZh = ABILITY_NAMES_ZH[k] ?? k
        if (isFormulaValue(val)) return `${nameZh}${formatFormulaLabelWithEval(val, baseContext)}`
        const num = evaluateBuffValue(val, baseContext)
        if (buff.effectType === 'ability_override') return `${nameZh}${num}`
        const sign = num >= 0 ? '+' : ''
        return `${nameZh}${sign}${num}`
      })
      return parts.join('，')
    }
    // ability_score 现在表示「属性熟练调整」：显示为"力量熟练，敏捷熟练"
    if (buff.effectType === 'ability_score' && v && typeof v === 'object' && !Array.isArray(v)) {
      const entries = Object.entries(v).filter(([k, val]) => {
        if (k === 'advantage') return false
        // 支持布尔值或旧数字值（非零视为 true）
        if (typeof val === 'boolean') return val
        if (typeof val === 'number') return val !== 0
        return !!val
      })
      if (entries.length === 0) return ''
      const parts = entries.map(([k]) => {
        const nameZh = ABILITY_NAMES_ZH[k] ?? k
        return `${nameZh}熟练`
      })
      return parts.join('，')
    }
    if (buff.effectType === 'spell_ability_attack' && v && typeof v === 'object' && !Array.isArray(v)) {
      const abilityLabel = ABILITY_NAMES_ZH[v.ability] ?? v.ability ?? ''
      return abilityLabel ? `${effectLabel}（${abilityLabel}）` : effectLabel
    }
    if (buff.effectType === 'contained_spell' && v && typeof v === 'object' && !Array.isArray(v)) {
      const spellLine = formatContainedSpellBrief(v, context)
      return spellLine || effectLabel
    }
    if ((buff.effectType === 'recharge_long_rest' || buff.effectType === 'recharge_dawn') && v != null) {
      const norm = normalizeChargeRecoveryValue(v)
      const text = norm.kind === 'dice' ? `${norm.diceCount}d${norm.diceSides}` : String(norm.fixed)
      return `${effectLabel} ${text}`
    }
    if (buff.effectType === 'spell_damage_bonus' && v && typeof v === 'object' && !Array.isArray(v)) {
      const text = formatSpellDamageBonusValue(v)
      return text ? effectLabel + text : effectLabel
    }
    if (buff.effectType === 'extra_damage_dice') {
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const s = formatDamageForAttack(v)
        if (!s) return ''
        const signed = /^[+-]/.test(s) ? s : `+${s}`
        return v.onlySpellDamage ? `${signed}（仅法术伤害）` : signed
      }
    }
    if (buff.effectType === 'base_speed_increment') {
      if (typeof v === 'number') return `${effectLabel}${v >= 0 ? '+' : ''}${v} 尺`
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const parts = []
        const add = (key, label) => {
          const num = Number(v[key])
          if (num) parts.push(`${label} ${num >= 0 ? '+' : ''}${num} 尺`)
        }
        add('walk', '步行')
        add('fly', '飞行')
        add('swim', '游泳')
        add('climb', '攀爬')
        return parts.length ? `${effectLabel}（${parts.join('，')}）` : effectLabel
      }
    }
    return effectLabel
  }
  if (buff.effectType === 'damage_piercing_traits' && v && typeof v === 'object' && !Array.isArray(v)) {
    const str = formatDamagePiercingTraitsValue(v)
    return str || effectLabel
  }
  if (Array.isArray(v) && v.length) {
    if (['resist_type', 'immune_type', 'vulnerable_type'].includes(buff.effectType)) {
      const labels = v.map(getDamageTypeLabel)
      const suffix = buff.effectType === 'resist_type' ? '抗性' : buff.effectType === 'immune_type' ? '免疫' : '易伤'
      return labels.map((l) => `${l}${suffix}`).join('，')
    }
    if (buff.effectType === 'ignore_resistance') {
      const labels = v.map(getDamageTypeLabel)
      return '无视' + labels.join('、') + '抗性'
    }
    if (buff.effectType === 'condition_immunity') {
      return v.map(getConditionLabel).join('、') + '免疫'
    }
  }
  return v != null ? `${effectLabel}${String(v)}` : effectLabel
}

/** 整条 buff 的简化一行文案：来源 | 效果1，效果2，… */
export function getBuffSummaryLine(buff, baseAbilities = {}, context = {}) {
  const source = buff.source?.trim() || '未知来源'
  const baseContext = { ...context, abilities: baseAbilities }
  const effectParts = []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    buff.effects.forEach((e) => {
      const s = getEffectSummaryShort({ effectType: e.effectType, value: e.value, customText: e.customText, scope: e.scope, scopeDetail: e.scopeDetail }, context, baseContext)
      if (s) effectParts.push(s)
    })
  } else {
    const s = getEffectSummaryShort(buff, context, baseContext)
    if (s) effectParts.push(s)
  }
  const effectsStr = effectParts.join('，')
  return effectsStr ? `${source} | ${effectsStr}` : source
}

/** 结构化效果列表：每条效果带 text 和 suppressed 标记，供逐条渲染 */
export function getBuffEffectsList(buff, baseAbilities = {}, suppressedEffectTypes = new Set(), context = {}) {
  const baseContext = { ...context, abilities: baseAbilities }
  const effectParts = []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    buff.effects.forEach((e) => {
      const s = getEffectSummaryShort({ effectType: e.effectType, value: e.value, customText: e.customText, scope: e.scope, scopeDetail: e.scopeDetail }, context, baseContext)
      if (s) effectParts.push({ text: s, suppressed: suppressedEffectTypes.has(e.effectType) })
    })
  } else {
    const s = getEffectSummaryShort(buff, context, baseContext)
    if (s) effectParts.push({ text: s, suppressed: suppressedEffectTypes.has(buff.effectType) })
  }
  return effectParts
}

/** 效果描述 + 数值（用于胶囊）；属性用中文名并显示扣除后的总值 */
function getEffectDisplay(buff, baseAbilities = {}, context = {}) {
  const baseContext = { ...context, abilities: baseAbilities }
  const info = getEffectInfo(buff.effectType)
  if (!info) return { label: '—', value: buff.value != null ? String(buff.value) : null }
  if (buff.effectType.startsWith('custom_')) {
    const text = (buff.value != null && buff.value !== '' ? String(buff.value) : '') || (buff.customText != null && buff.customText !== '' ? String(buff.customText) : '')
    return { label: text || '（自由填写）', value: null }
  }
  const effectLabel = info.effect.label ?? buff.effectType

  if (info.effect.dataType === 'boolean') {
    return { label: effectLabel, value: buff.value ? '优势' : null }
  }
  if (buff.effectType === 'crit_extra_dice' && typeof buff.value === 'number') {
    return { label: effectLabel, value: String(buff.value) }
  }
  if (info.effect.dataType === 'number' && (typeof buff.value === 'number' || isFormulaValue(buff.value))) {
    if (isFormulaValue(buff.value)) return { label: effectLabel, value: formatFormulaLabelWithEval(buff.value, context) }
    const sign = buff.value >= 0 ? '+' : ''
    return { label: effectLabel, value: `${sign}${buff.value}` }
  }
  if (info.effect.dataType === 'object' && buff.value) {
    const v = buff.value
    if (v.type != null && (typeof v.val === 'number' || isFormulaValue(v.val))) {
      const typeLabel = getDamageTypeLabel(v.type)
      if (isFormulaValue(v.val)) return { label: `${effectLabel}(${typeLabel})`, value: formatFormulaLabelWithEval(v.val, context) }
      const sign = v.val >= 0 ? '+' : ''
      return { label: `${effectLabel}(${typeLabel})`, value: `${sign}${v.val}` }
    }
    if (info.effect.subSelect === 'numberAndAdvantage') {
      if (buff.effectType === 'attack_damage_bonus') {
        const detail = formatAttackDamageBonusSummaryText(buff.effectType, v, context)
        return { label: effectLabel, value: detail || null }
      }
      let numStr = ''
      if (isFormulaValue(v.val)) {
        numStr = formatFormulaLabelWithEval(v.val, context)
      } else {
        const val = v.val ?? (typeof v === 'number' ? v : 0)
        if (val !== 0) numStr = (val >= 0 ? '+' : '') + val
      }
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      const core = (numStr || adv) ? `${numStr}${adv ? ' ' + adv : ''}` : ''
      return { label: effectLabel, value: core || null }
    }
    if (info.effect.subSelect === 'flightSpeed') {
      const speed = evaluateBuffValue(v.speed, context) ?? (typeof v === 'number' ? v : 0)
      const hover = v.hover ? '悬浮' : ''
      return { label: effectLabel, value: speed ? `${speed}尺${hover ? ' ' + hover : ''}` : (hover || null) }
    }
    if (info.effect.subSelect === 'initBonusAndProficiency' || buff.effectType === 'initiative_buff') {
      const parts = []
      if (v.bonus != null && v.bonus !== 0) {
        const num = evaluateBuffValue(v.bonus, context)
        if (!Number.isNaN(num)) {
          if (isFormulaValue(v.bonus)) parts.push(formatFormulaLabelWithEval(v.bonus, context))
          else parts.push((num >= 0 ? '+' : '') + num)
        }
      }
      if (v.proficient) parts.push('熟练加值')
      return { label: effectLabel, value: parts.length ? parts.join(' ') : null }
    }
    if (info.effect.subSelect === 'abilityScoresAndAdvantage' && isPlainAbilityObject(v)) {
      const labels = buff.effectType === 'save_bonus' ? SAVE_NAMES : ABILITY_NAMES_ZH
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          return `${labels[k] ?? k} ${formatSignedEntryVal(val, context)}`
        })
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return { label: effectLabel, value: parts.length ? parts.join('、') + (adv ? ' ' + adv : '') : (adv || null) }
    }
    if (info.effect.subSelect === 'skillsAndAdvantage' && isPlainAbilityObject(v)) {
      const parts = Object.entries(v)
        .filter(([k, val]) => k !== 'advantage' && val != null && val !== 0)
        .map(([k, val]) => {
          const sk = SKILLS.find((s) => s.id === k)
          const nameZh = sk ? sk.name : k
          return `${nameZh} ${formatSignedEntryVal(val, context)}`
        })
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
      return { label: effectLabel, value: parts.length ? parts.join('、') + (adv ? ' ' + adv : '') : (adv || null) }
    }
    if (buff.effectType === 'contained_spell' && v && typeof v === 'object' && !Array.isArray(v)) {
      const spellLine = formatContainedSpellBrief(v, context)
      return { label: effectLabel, value: spellLine || null }
    }
    if (buff.effectType === 'spell_damage_bonus' && v && typeof v === 'object' && !Array.isArray(v)) {
      const text = formatSpellDamageBonusValue(v)
      return { label: effectLabel, value: text || null }
    }
    if ((buff.effectType === 'ability_override' || buff.effectType === 'ability_score_uncapped') && isPlainAbilityObject(buff.value)) {
      const entries = Object.entries(buff.value).filter(([, val]) => val != null && val !== 0)
      if (entries.length === 0) return { label: effectLabel, value: null }
      const parts = entries.map(([k, val]) => {
        const nameZh = ABILITY_NAMES_ZH[k] ?? k
        if (isFormulaValue(val)) return `${nameZh} ${formatFormulaLabelWithEval(val, baseContext)}`
        const num = evaluateBuffValue(val, baseContext)
        if (buff.effectType === 'ability_override') return `${nameZh} ${num}`
        const sign = num >= 0 ? '+' : ''
        return `${nameZh} ${sign}${num}`
      })
      return { label: effectLabel, value: parts.join('、') }
    }
    // ability_score 现在表示「属性熟练调整」：显示为"力量 熟练、敏捷 熟练"
    if (buff.effectType === 'ability_score' && buff.value && typeof buff.value === 'object' && !Array.isArray(buff.value)) {
      const entries = Object.entries(buff.value).filter(([k, val]) => {
        if (k === 'advantage') return false
        if (typeof val === 'boolean') return val
        if (typeof val === 'number') return val !== 0
        return !!val
      })
      if (entries.length === 0) return { label: effectLabel, value: null }
      const parts = entries.map(([k]) => {
        const nameZh = ABILITY_NAMES_ZH[k] ?? k
        return `${nameZh} 熟练`
      })
      return { label: effectLabel, value: parts.join('、') }
    }
    if (buff.effectType === 'extra_damage_dice') {
      const str = typeof v === 'string' ? v.trim() : formatDamageForAttack(v)
      if (!str) return { label: effectLabel, value: null }
      const signed = /^[+-]/.test(str) ? str : `+${str}`
      return { label: effectLabel, value: v?.onlySpellDamage ? `${signed}（仅法术伤害）` : signed }
    }
    if (isPlainAbilityObject(v)) {
      const parts = Object.entries(v).filter(([k, val]) => k !== 'advantage' && val != null && val !== 0).map(([k, val]) => `${ABILITY_NAMES_ZH[k] ?? k}+${formatSignedEntryVal(val, context)}`)
      return { label: effectLabel, value: parts.length ? parts.join(', ') : null }
    }
    return { label: effectLabel, value: null }
  }
  if (Array.isArray(buff.value) && buff.value.length) {
    const isDamageType = ['resist_type', 'immune_type', 'vulnerable_type', 'ignore_resistance'].includes(buff.effectType)
    const isCondition = buff.effectType === 'condition_immunity'
    const displayValue = isDamageType
      ? buff.value.map(getDamageTypeLabel).join('、')
      : isCondition
        ? buff.value.map(getConditionLabel).join('、')
        : buff.value.join(', ')
    return { label: effectLabel, value: displayValue }
  }
  if (buff.effectType === 'damage_piercing_traits' && buff.value && typeof buff.value === 'object' && !Array.isArray(buff.value)) {
    const str = formatDamagePiercingTraitsValue(buff.value)
    return { label: effectLabel, value: str || null }
  }
  return { label: effectLabel, value: buff.value != null ? String(buff.value) : null }
}

/** 数值是否为负数（用于红色高亮）；不把「18-20」等范围里的连字符当负号 */
function isNegativeValue(val) {
  if (val == null) return false
  const s = String(val)
  if (/^\s*-/.test(s)) return true
  return /(?<![0-9])-\d+/.test(s)
}

/**
 * 自动识别减益：显示值为负、或原始数值为负的条目归为减益栏。
 * 支持多效果 buff：任一效果为负则整条归为减益。
 */
export function isDebuff(buff, baseAbilities = {}, context = {}) {
  if (Array.isArray(buff.effects) && buff.effects.length) {
    return buff.effects.some((e) => {
      const v = e.value
      if (typeof v === 'number' && v < 0) return true
      if (v && typeof v === 'object' && typeof v.val === 'number' && v.val < 0) return true
      const { value } = getEffectDisplay({ effectType: e.effectType, value: e.value }, baseAbilities, context)
      return isNegativeValue(value)
    })
  }
  const v = buff.value
  if (typeof v === 'number' && v < 0) return true
  if (v && typeof v === 'object' && typeof v.val === 'number' && v.val < 0) return true
  const { value } = getEffectDisplay(buff, baseAbilities, context)
  return isNegativeValue(value)
}

/**
 * 统一行布局：名字列（含来源小标签，略加宽） + 效果列 + 持续时间 + 操作
 */
const GRID_COLS = {
  withActions: 'grid-cols-[minmax(6.25rem,9.5em)_1fr_auto_auto]',
  noActions: 'grid-cols-[minmax(6.25rem,9.5em)_1fr_auto]',
}

/** 多效果时渲染为多组 (label, value) 胶囊（供 isDebuff 等内部用） */
function getEffectDisplays(buff, baseAbilities, context = {}) {
  if (Array.isArray(buff.effects) && buff.effects.length) {
    return buff.effects.map((e) => getEffectDisplay({ effectType: e.effectType, value: e.value, customText: e.customText }, baseAbilities, context))
  }
  return [getEffectDisplay(buff, baseAbilities, context)]
}

export default function BuffListItem({
  buff,
  baseAbilities,
  onEdit,
  onDelete,
  canEdit,
  standalone,
  hideSourceTag = false,
  showDragHint = false,
  suppressedEffectTypes = new Set(),
  formulaContext = {},
}) {
  const summaryLine = getBuffSummaryLine(buff, baseAbilities, formulaContext)
  const barIdx = summaryLine.indexOf(' | ')
  const sourceName = barIdx >= 0 ? summaryLine.slice(0, barIdx) : summaryLine
  const effectsList = getBuffEffectsList(buff, baseAbilities, suppressedEffectTypes, formulaContext)
  const hasSuppressed = effectsList.some(e => e.suppressed)

  const rowHoverTitle = buff.fromItem
    ? '装备BUFF由装备所控'
    : buff.fromFeat
      ? '专长只能改数值不能改类别'
      : showDragHint
        ? '可通过拖动改变BUFF类型'
        : undefined

  return (
    <div
      className={`grid ${canEdit && !buff.fromItem ? GRID_COLS.withActions : GRID_COLS.noActions} items-center gap-x-1 px-1.5 min-h-[32px] py-0.5 h-full bg-[#202838]/36 ${standalone ? '' : 'border-b border-white/10 last:border-b-0'} ${!buff.enabled ? 'opacity-50' : ''}`}
      role="row"
      title={rowHoverTitle}
    >
      {/* 名字：约 7 字宽，过长截断；来自装备时显示标签 */}
      <div className="min-w-0 shrink-0 w-full max-w-[9.5em] overflow-hidden flex items-center gap-1">
        <span
          className="text-dnd-gold-light/95 text-sm truncate block"
          title={standalone && rowHoverTitle ? undefined : sourceName}
        >
          {sourceName}
        </span>
        {!hideSourceTag && (
          <span className="text-gray-500 text-[10px] shrink-0 whitespace-nowrap" title={getBuffSourceKindTitle(buff)}>
            {getBuffSourceKindLabel(buff)}
          </span>
        )}
      </div>
      {/* 效果：垂直对齐；负值红色；被抑制的DC/法术攻击加值灰色；略左移约 3 字宽贴近名称列 */}
      <div className="min-w-0 -ml-[3ch]">
        {effectsList.length > 0 ? (
          <span className="text-gray-200 text-sm truncate block" title={effectsList.map(e => e.text).join('，')}>
            {effectsList.map((eff, i) => {
              const sep = i > 0 ? '，' : ''
              // 被抑制的效果：灰色 + 删除线
              if (eff.suppressed) {
                return <span key={i}>{sep}<span className="text-gray-500 line-through">{eff.text}</span></span>
              }
              // 正常效果：负值红色
              const parts = eff.text.split(/((?<![0-9])-\d+)/g)
              if (parts.length <= 1) {
                return <span key={i}>{sep}{eff.text}</span>
              }
              return <span key={i}>{sep}{parts.map((part, j) =>
                /^-\d+$/.test(part) ? (
                  <span key={j} className="text-red-400">{part}</span>
                ) : (
                  part
                )
              )}</span>
            })}
          </span>
        ) : null}
      </div>

      {/* 持续时间（可选，小字） */}
      <div className="shrink-0">
        <span className="text-gray-500 text-xs whitespace-nowrap" title={buff.duration || '—'}>
          {buff.duration || '—'}
        </span>
      </div>

      {/* 操作按钮（装备不可改；专长仅可编辑、不可在此删除） */}
      {canEdit && !buff.fromItem && (
        <div className="flex items-center justify-end gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onEdit?.(buff.id)}
            className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold transition-colors"
            title="编辑"
          >
            <Pencil className="w-4 h-4" />
          </button>
          {!buff.fromFeat && (
            <button
              type="button"
              onClick={() => onDelete?.(buff.id)}
              className="p-1 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-500 transition-colors"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
