import { Trash2, Pencil } from 'lucide-react'
import { getBuffSourceKindLabel, getBuffSourceKindTitle } from '../lib/buffSourceKind'
import { getCreatureById } from '../data/creatureLibrary'
import { getEffectInfo, getDamageTypeLabel, getConditionLabel, ABILITY_NAMES_ZH, formatDamagePiercingTraitsValue, formatDamageForAttack, formatScopeBrief, normalizeScope, formatSpellDamageBonusValue, ARMOR_PROFICIENCY_OPTIONS, WEAPON_PROFICIENCY_OPTIONS, VEHICLE_PROFICIENCY_OPTIONS, INSTRUMENT_PROFICIENCY_OPTIONS, TOOL_PROFICIENCY_OPTIONS, LANGUAGE_PROFICIENCY_OPTIONS, WEAPON_MASTERY_OPTIONS, SPECIAL_SENSES_OPTIONS, VISUAL_EFFECT_OPTIONS } from '../data/buffTypes'
import { SAVE_NAMES, SKILLS } from '../data/dndSkills'
import { formatContainedSpellBrief } from '../lib/containedSpellBrief'
import { normalizeChargeRecoveryValue } from '../lib/chargeRecovery'
import { formatChargeItemBrief } from '../lib/chargeItemModel'
import { formatDurationBrief } from '../lib/durationModel'
import { isFormulaValue, formatFormulaLabel, evaluateBuffValue } from '../lib/formulas'

/** 公式标签 + 求值后数字，例如「等级×2（+4）」、「感知调整值（+3）」 */
function formatFormulaLabelWithEval(value, context = {}) {
  if (!isFormulaValue(value)) return String(value ?? '')
  const label = formatFormulaLabel(value)
  const num = evaluateBuffValue(value, context)
  if (Number.isNaN(num)) return `${label}（?）`
  const sign = num >= 0 ? '+' : ''
  return `${label}（${sign}${num}）`
}

/** 统一把属性/豁免/技能条目的值格式化为带符号字符串，避免直接 Number(数组/对象) 得到 NaN */
function formatSignedEntryVal(val, context = {}) {
  if (isFormulaValue(val)) return formatFormulaLabelWithEval(val, context)
  const num = evaluateBuffValue(val, context)
  if (Number.isNaN(num)) return '?'
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

/** 起效范围前缀：若非全局，返回 "近战攻击 " 格式，否则返回空字符串 */
function getScopePrefix(scope, scopeDetail) {
  const { scope: ns, scopeDetail: nd } = normalizeScope(scope, scopeDetail)
  const brief = formatScopeBrief(ns, nd)
  // formatScopeBrief 返回 "（近战攻击）" 格式，去掉括号改为前缀
  if (brief) return brief.replace(/^（|）$/g, '') + ' '
  return ''
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
  // 自由填写：优先 value（与保存一致），兼容 customText；空时显示占位便于记录”仅描述”类效果
  if (buff.effectType.startsWith('custom_')) {
    const text = (typeof buff.value === 'string' && buff.value !== '' ? buff.value : '') || (typeof buff.customText === 'string' && buff.customText !== '' ? buff.customText : '')
    return text || '（自由填写）'
  }
  // 视觉效果：显示视觉类型 + 自定义描述
  if (buff.effectType === 'visual_effect') {
    const v = buff.value
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const typeLabel = VISUAL_EFFECT_OPTIONS.find(o => o.value === v.type)?.label || v.type || ''
      const desc = typeof v.description === 'string' && v.description.trim() ? v.description.trim() : ''
      if (typeLabel && desc) return `${typeLabel}：${desc}`
      if (typeLabel) return typeLabel
      if (desc) return desc
    }
    // 兼容旧文本格式
    const text = (typeof buff.value === 'string' && buff.value !== '' ? buff.value : '') || (typeof buff.customText === 'string' && buff.customText !== '' ? buff.customText : '')
    return text || '（视觉描述）'
  }
  const rawLabel = info.effect.label ?? buff.effectType
  const scopePrefix = getScopePrefix(buff.scope, buff.scopeDetail)
  const effectLabel = `${scopePrefix}${rawLabel}`
  const v = buff.value

  if (info.effect.dataType === 'boolean') return buff.value ? effectLabel : ''
  if (buff.effectType === 'item_storage' && typeof v === 'number') {
    return `容量（${v}磅）`
  }
  if (buff.effectType === 'crit_extra_dice' && typeof v === 'number' && !Number.isNaN(v)) {
    return `${effectLabel}${v}`
  }
  if (buff.effectType === 'crit_range_override' && typeof v === 'number' && !Number.isNaN(v)) {
    return `${effectLabel}${v}-20`
  }
  if (buff.effectType === 'crit_range_increment' && typeof v === 'number' && !Number.isNaN(v)) {
    return `${effectLabel}+${v}`
  }
  if (info.effect.dataType === 'number' && (typeof v === 'number' || isFormulaValue(v))) {
    if (isFormulaValue(v)) return `${effectLabel}${formatFormulaLabelWithEval(v, context)}`
    const sign = v >= 0 ? '+' : ''
    return `${effectLabel}${sign}${v}`
  }
  // 速度增加：数字值（种族自动生成）和对象值（手动编辑器）都需要处理
  if (buff.effectType === 'base_speed_increment') {
    if (typeof v === 'number') {
      return v !== 0 ? `${effectLabel}${v >= 0 ? '+' : ''}${v}尺` : effectLabel
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && !isFormulaValue(v)) {
      const parts = []
      const add = (key, label) => {
        const val = v[key]
        if (val == null) return
        if (isFormulaValue(val)) {
          const evalNum = evaluateBuffValue(val, context)
          const formulaLabel = formatFormulaLabel(val)
          if (!Number.isNaN(evalNum)) {
            const sign = evalNum >= 0 ? '+' : ''
            parts.push(`${label}速度${formulaLabel}（${sign}${evalNum}尺）`)
          } else {
            parts.push(`${label}速度${formulaLabel}`)
          }
        } else {
          const num = Number(val)
          if (num) parts.push(`${label}速度${num >= 0 ? '+' : ''}${num}尺`)
        }
      }
      add('walk', '步行')
      add('fly', '飞行')
      add('swim', '游泳')
      add('climb', '攀爬')
      return parts.length ? parts.join('，') : effectLabel
    }
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
      // 兼容旧格式：{proficiency: true, skills: ["arcana", "nature"]}
      if (Array.isArray(v.skills) || (v.proficiency === true && !SKILLS.some(s => s.id in v && s.id !== 'advantage'))) {
        const skillNames = Array.isArray(v.skills)
          ? v.skills.map(id => SKILLS.find(s => s.id === id)?.name || id)
          : []
        const parts = []
        if (v.proficiency) parts.push('熟练')
        if (skillNames.length) parts.push(skillNames.join('、'))
        return parts.join('：') || effectLabel
      }
      const adv = v.advantage === 'advantage' ? '优势' : v.advantage === 'disadvantage' ? '劣势' : ''
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
          return `${nameZh}${adv}`
        }
        return `${nameZh}${formatSignedEntryVal(val, context)}`
      })
      const uniqueParts = Array.from(new Set(parts))
      return uniqueParts.join('，')
    }
    if (info.effect.subSelect === 'armorOverride' && v && typeof v === 'object' && !Array.isArray(v)) {
      const baseLabel = isFormulaValue(v.base) ? formatFormulaLabelWithEval(v.base, context) : String(v.base)
      let label = `AC=${baseLabel}`
      if (v.applyDexMod !== false) {
        if (v.maxDexBonus != null) label += `（含DEX，最大+${v.maxDexBonus}）`
        else label += '（含DEX）'
      }
      if (v.extra) label += `+${v.extra}`
      if (v.shieldCompatible) label += '，可叠盾'
      return label
    }
    if (info.effect.subSelect === 'creatureTransform' && v && typeof v === 'object' && !Array.isArray(v)) {
      const creatureId = v.creatureId
      if (!creatureId) return ''
      // 从生物库获取生物名称（getCreatureById 兼容 Supabase 与 localStorage 两种模式）
      const creature = getCreatureById(creatureId)
      const creatureName = creature?.name || creatureId
      return `变身（${creatureName}）`
    }
    if (info.effect.subSelect === 'choice' && v && typeof v === 'object' && !Array.isArray(v)) {
      const opts = Array.isArray(v.choiceOptions) ? v.choiceOptions : []
      const selIdx = Math.min(Math.max(0, Number(v.choiceSelected) || 0), opts.length - 1)
      const selectedOpt = opts[selIdx]
      if (!selectedOpt) return ''
      const optName = selectedOpt.name || `选项 ${selIdx + 1}`
      const desc = selectedOpt.description || ''
      if (desc) return `${optName}：${desc}`
      const effectCount = Array.isArray(selectedOpt.effects) ? selectedOpt.effects.length : 0
      return `选择：${optName}${effectCount > 0 ? `（${effectCount}个效果）` : ''}`
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
    if (buff.effectType === 'charge_item' && v && typeof v === 'object' && !Array.isArray(v)) {
      const brief = formatChargeItemBrief(v)
      return brief || effectLabel
    }
    if (buff.effectType === 'shield_pool' && v && typeof v === 'object' && !Array.isArray(v)) {
      const max = Number(v.max) || 10
      const threshold = Number(v.threshold) || 0
      const recoverLabel = { short: '短休恢复', long: '长休恢复', dawn: '黎明恢复', manual: '手动恢复', none: '不恢复' }[v.recoverOn] || '手动恢复'
      const bonusCount = Array.isArray(v.bonusEffects) ? v.bonusEffects.length : 0
      const bonusText = bonusCount > 0 ? `，高于阈值+${bonusCount}增益` : ''
      return `上限${max}，≤${threshold}失效，${recoverLabel}${bonusText}`
    }
    if ((buff.effectType === 'recharge_long_rest' || buff.effectType === 'recharge_dawn') && v != null) {
      const norm = normalizeChargeRecoveryValue(v)
      let text
      if (norm.kind === 'dice') {
        const bonus = norm.diceBonus || 0
        text = bonus > 0 ? `${norm.diceCount}d${norm.diceSides}+${bonus}` : `${norm.diceCount}d${norm.diceSides}`
      } else {
        text = String(norm.fixed)
      }
      return `${effectLabel} ${text}`
    }
    if (buff.effectType === 'spell_damage_bonus' && v && typeof v === 'object' && !Array.isArray(v)) {
      const text = formatSpellDamageBonusValue(v)
      return text ? effectLabel + text : effectLabel
    }
    if (buff.effectType === 'extra_damage_dice') {
      if (typeof v === 'string' && v.trim()) return `${effectLabel} ${v.trim()}`.trim()
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const s = formatDamageForAttack(v)
        if (!s) return effectLabel
        const signed = /^[+-]/.test(s) ? s : `+${s}`
        const valueText = v.onlySpellDamage ? `${signed}（仅法术伤害）` : signed
        return `${effectLabel} ${valueText}`.trim()
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
    const profOptMap = {
      armor_proficiency: ARMOR_PROFICIENCY_OPTIONS,
      weapon_proficiency: WEAPON_PROFICIENCY_OPTIONS,
      vehicle_proficiency: VEHICLE_PROFICIENCY_OPTIONS,
      instrument_proficiency: INSTRUMENT_PROFICIENCY_OPTIONS,
      specific_tool_proficiency: TOOL_PROFICIENCY_OPTIONS,
      language_proficiency: LANGUAGE_PROFICIENCY_OPTIONS,
      weapon_mastery: WEAPON_MASTERY_OPTIONS,
      weapon_expertise: WEAPON_PROFICIENCY_OPTIONS,
    }
    if (profOptMap[buff.effectType]) {
      const suffix = buff.effectType === 'weapon_proficiency' ? '熟练' : buff.effectType === 'weapon_expertise' ? '专精' : ''
      const labels = v.map((val) => (profOptMap[buff.effectType].find((o) => o.value === val)?.label ?? val) + suffix)
      return labels.join('、')
    }
  }
  // 新版统一抗性格式：damage_type_relation
  if (buff.effectType === 'damage_type_relation' && v && typeof v === 'object' && !Array.isArray(v)) {
    const types = Array.isArray(v.types) ? v.types : []
    if (types.length === 0) return ''
    const relation = v.relation || 'resist'
    const suffix = relation === 'resist' ? '抗性' : relation === 'immune' ? '免疫' : '易伤'
    const labels = types.map(getDamageTypeLabel)
    return labels.map((l) => `${l}${suffix}`).join('，')
  }
  // 按伤害类型固定减免
  if (buff.effectType === 'damage_reduction_typed' && v && typeof v === 'object' && !Array.isArray(v)) {
    const types = Array.isArray(v.types) ? v.types : []
    const reduction = Number(v.reduction) || 0
    const labels = types.map(getDamageTypeLabel)
    return `${labels.join('、')}伤害减免${reduction}`
  }
  // 新增效果类型显示
  if (buff.effectType === 'special_senses' && v && typeof v === 'object') {
    const senses = Array.isArray(v.senses) ? v.senses : []
    const range = Number(v.range) || 0
    const senseLabels = senses.map(s => SPECIAL_SENSES_OPTIONS.find(o => o.value === s)?.label ?? s)
    const rangeStr = range > 0 ? `${range}尺` : ''
    return senseLabels.join('、') + (rangeStr ? `（${rangeStr}）` : '')
  }
  if (buff.effectType === 'healing_bonus') {
    return `治疗+${evaluateBuffValue(v, baseContext) || 0}`
  }
  if (buff.effectType === 'death_save_bonus') {
    return `死亡豁免+${evaluateBuffValue(v, baseContext) || 0}`
  }
  if (buff.effectType === 'extra_attack') {
    return `额外攻击+${evaluateBuffValue(v, baseContext) || 0}`
  }
  if (buff.effectType === 'extra_action_resource') {
    return `额外动作资源+${evaluateBuffValue(v, baseContext) || 0}`
  }
  // 属性类效果值异常（非对象）时不拼接原始值，避免显示"属性增加0"
  if ((buff.effectType === 'ability_override' || buff.effectType === 'ability_score_uncapped') && !isPlainAbilityObject(v)) {
    return ''
  }
  return v != null ? `${effectLabel}${String(v)}` : effectLabel
}

/** 整条 buff 的简化一行文案：来源 | 效果1，效果2，… */
export function getBuffSummaryLine(buff, baseAbilities = {}, context = {}) {
  const source = buff.source?.trim() || '未知来源'
  const baseContext = { ...context, abilities: baseAbilities }

  // 变身效果：笼统显示为"变身（子职：生物名）"，不展开细则
  const isCreatureTransform = buff.effectType === 'creature_transform'
    || (Array.isArray(buff.effects) && buff.effects.length === 1 && buff.effects[0].effectType === 'creature_transform')
  if (isCreatureTransform) {
    const ctValue = buff.effectType === 'creature_transform' ? buff.value : buff.effects[0]?.value
    if (ctValue && typeof ctValue === 'object' && !Array.isArray(ctValue) && ctValue.creatureId) {
      let creatureName = ctValue.creatureId
      const creature = getCreatureById(ctValue.creatureId)
      creatureName = creature?.name || ctValue.creatureId
      const subclassLabel = ctValue.wildShapeSubclass === 'moon' ? '月亮结社' : '荒野变形'
      return `${source} | 变身（${subclassLabel}：${creatureName}）`
    }
  }

  const effectParts = []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    buff.effects.forEach((e) => {
      const s = getEffectSummaryShort({ effectType: e.effectType, value: e.value, customText: e.customText, scope: e.scope, scopeDetail: e.scopeDetail }, context, baseContext)
      if (s) {
        let part = s
        if (e.upgrade && e.upgrade.className && e.upgrade.level) {
          part += `，${e.upgrade.className} ${e.upgrade.level}级↑`
        }
        effectParts.push(part)
      }
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
  const source = buff.source?.trim() || '未知来源'

  // 变身效果：笼统显示
  const isCreatureTransform = buff.effectType === 'creature_transform'
    || (Array.isArray(buff.effects) && buff.effects.length === 1 && buff.effects[0].effectType === 'creature_transform')
  if (isCreatureTransform) {
    const ctValue = buff.effectType === 'creature_transform' ? buff.value : buff.effects[0]?.value
    if (ctValue && typeof ctValue === 'object' && !Array.isArray(ctValue) && ctValue.creatureId) {
      let creatureName = ctValue.creatureId
      const creature = getCreatureById(ctValue.creatureId)
      creatureName = creature?.name || ctValue.creatureId
      const subclassLabel = ctValue.wildShapeSubclass === 'moon' ? '月亮结社' : '荒野变形'
      return [{ text: `变身（${subclassLabel}：${creatureName}）`, suppressed: false }]
    }
  }

  const effectParts = []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    buff.effects.forEach((e) => {
      const s = getEffectSummaryShort({ effectType: e.effectType, value: e.value, customText: e.customText, scope: e.scope, scopeDetail: e.scopeDetail }, context, baseContext)
      if (s) {
        let text = s
        if (e.upgrade && e.upgrade.className && e.upgrade.level) {
          text += `，${e.upgrade.className} ${e.upgrade.level}级↑`
        }
        effectParts.push({ text, suppressed: suppressedEffectTypes.has(e.effectType) })
      }
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
    const text = (typeof buff.value === 'string' && buff.value !== '' ? buff.value : '') || (typeof buff.customText === 'string' && buff.customText !== '' ? buff.customText : '')
    return { label: text || '（自由填写）', value: null }
  }
  // 视觉效果：显示视觉类型 + 自定义描述
  if (buff.effectType === 'visual_effect') {
    const v = buff.value
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const typeLabel = VISUAL_EFFECT_OPTIONS.find(o => o.value === v.type)?.label || v.type || ''
      const desc = typeof v.description === 'string' && v.description.trim() ? v.description.trim() : ''
      if (typeLabel && desc) return { label: typeLabel, value: desc }
      if (typeLabel) return { label: typeLabel, value: null }
      if (desc) return { label: desc, value: null }
    }
    // 兼容旧文本格式
    const text = (typeof buff.value === 'string' && buff.value !== '' ? buff.value : '') || (typeof buff.customText === 'string' && buff.customText !== '' ? buff.customText : '')
    return { label: text || '（视觉描述）', value: null }
  }
  const effectLabel = info.effect.label ?? buff.effectType

  if (info.effect.dataType === 'boolean') {
    return { label: effectLabel, value: buff.value ? '优势' : null }
  }
  if (buff.effectType === 'crit_extra_dice' && typeof buff.value === 'number') {
    return { label: effectLabel, value: String(buff.value) }
  }
  if (buff.effectType === 'crit_range_override' && typeof buff.value === 'number') {
    return { label: effectLabel, value: `${buff.value}-20` }
  }
  if (buff.effectType === 'crit_range_increment' && typeof buff.value === 'number') {
    return { label: effectLabel, value: `+${buff.value}` }
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
    if (buff.effectType === 'charge_item' && v && typeof v === 'object' && !Array.isArray(v)) {
      const brief = formatChargeItemBrief(v)
      return { label: effectLabel, value: brief || null }
    }
    if (buff.effectType === 'shield_pool' && v && typeof v === 'object' && !Array.isArray(v)) {
      const max = Number(v.max) || 10
      const threshold = Number(v.threshold) || 0
      const recoverLabel = { short: '短休恢复', long: '长休恢复', dawn: '黎明恢复', manual: '手动恢复', none: '不恢复' }[v.recoverOn] || '手动恢复'
      const bonusCount = Array.isArray(v.bonusEffects) ? v.bonusEffects.length : 0
      const bonusText = bonusCount > 0 ? `，高于阈值+${bonusCount}增益` : ''
      return { label: effectLabel, value: `上限${max}，≤${threshold}失效，${recoverLabel}${bonusText}` }
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
  if (buff.effectType === 'damage_reduction_typed' && buff.value && typeof buff.value === 'object' && !Array.isArray(buff.value)) {
    const types = Array.isArray(buff.value.types) ? buff.value.types : []
    const reduction = Number(buff.value.reduction) || 0
    const labels = types.map(getDamageTypeLabel)
    return { label: effectLabel, value: `${labels.join('、')}-${reduction}` }
  }
  if (buff.effectType === 'damage_type_relation' && buff.value && typeof buff.value === 'object' && !Array.isArray(buff.value)) {
    const types = Array.isArray(buff.value.types) ? buff.value.types : []
    const relation = buff.value.relation || 'resist'
    const suffix = relation === 'resist' ? '抗性' : relation === 'immune' ? '免疫' : '易伤'
    return { label: effectLabel, value: types.map(getDamageTypeLabel).map(l => `${l}${suffix}`).join('，') }
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
  columnKey,
  standalone,
  hideSourceTag = false,
  suppressedEffectTypes = new Set(),
  formulaContext = {},
}) {
  const summaryLine = getBuffSummaryLine(buff, baseAbilities, formulaContext)
  const barIdx = summaryLine.indexOf(' | ')
  const sourceName = barIdx >= 0 ? summaryLine.slice(0, barIdx) : summaryLine
  const effectsList = getBuffEffectsList(buff, baseAbilities, suppressedEffectTypes, formulaContext)
  const hasSuppressed = effectsList.some(e => e.suppressed)
  const hasEffects = effectsList.length > 0

  // 冒险/临时栏可编辑删除；职业栏BUFF由职业特性控制，不可删除；无效果时不显示操作按钮
  const editableColumn = columnKey === 'adventure' || columnKey === 'temporary'
  const showActions = canEdit && editableColumn && !buff.fromItem && hasEffects

  const rowHoverTitle = buff.fromItem
    ? '装备BUFF由装备所控'
    : buff.fromFeat
      ? '专长只能改数值不能改类别'
      : undefined

  return (
    <div
      className={`grid ${showActions ? GRID_COLS.withActions : GRID_COLS.noActions} items-center gap-x-1 px-1.5 min-h-[32px] py-0.5 h-full bg-[#202838]/36 ${standalone ? '' : 'border-b border-white/10 last:border-b-0'} ${!buff.enabled ? 'opacity-50' : ''}`}
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
          <span className="text-gray-200 text-sm" title={effectsList.map(e => e.text).join('，')}>
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
        <span className="text-gray-500 text-xs whitespace-nowrap" title={formatDurationBrief(buff.duration) || '—'}>
          {formatDurationBrief(buff.duration) || '—'}
        </span>
      </div>

      {/* 操作按钮：冒险/临时栏可编辑+删除；职业栏仅删除 */}
      {showActions && (
        <div className="flex items-center justify-end gap-0.5 shrink-0">
          {editableColumn && (
            <button
              type="button"
              onClick={() => onEdit?.(buff.id)}
              className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold transition-colors"
              title="编辑"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete?.(buff.id)}
            className="p-1 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
