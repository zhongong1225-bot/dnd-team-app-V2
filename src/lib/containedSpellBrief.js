/**
 * 附魔「内含法术」在外显简述中的文案，如：
 * 总能量50 · 7环闪电束×7 · 7环咒唤圣光
 * 5环火球术 · 敏捷豁免 DC 17 · 充能3（旧单法术结构）
 * 戏法光亮术 · 法术攻击+9
 *
 * @param {object} value
 * @param {{spellDC?:number,spellAttackBonus?:number,useWandScrollTable?:boolean}} [context]
 */
import { getSpellById, getWandScrollSpellPower } from '../data/spellDatabase'

const SAVE_RESOLUTION_NAMES = {
  dex_save: '敏捷豁免',
  str_save: '力量豁免',
  con_save: '体质豁免',
  wis_save: '感知豁免',
  int_save: '智力豁免',
  cha_save: '魅力豁免',
}

function formatHitOrRangeText(hitResolution, level, context, range) {
  const hitResolutionList = ['dex_save', 'str_save', 'con_save', 'wis_save', 'int_save', 'cha_save', 'spell_attack', 'none']
  const hr = hitResolutionList.includes(hitResolution) ? hitResolution : 'dex_save'
  if (hr === 'none') {
    const r = (range || '').trim()
    return r || '效应目标'
  }
  const wandPower = context?.useWandScrollTable ? getWandScrollSpellPower(level) : null
  if (hr === 'spell_attack') {
    const atk = wandPower ? wandPower.attackBonus : (context?.spellAttackBonus ?? null)
    if (atk != null) return `法术攻击${atk >= 0 ? '+' : ''}${atk}`
  } else {
    const dc = wandPower ? wandPower.dc : (context?.spellDC ?? null)
    if (dc != null) return `${SAVE_RESOLUTION_NAMES[hr]} DC ${dc}`
  }
  return ''
}

function formatSubBrief(sub, context) {
  if (!sub || typeof sub !== 'object') return ''
  const level = typeof sub.level === 'number' ? sub.level : (parseInt(sub.level, 10) || 0)
  let name = (sub.spellName || '').trim()
  if (!name && sub.spellId) {
    const sp = getSpellById(sub.spellId)
    name = (sp?.name || '').trim()
  }
  if (!name) return ''
  const base = level <= 0 ? `戏法${name}` : `${Math.max(0, Math.min(9, level))}环${name}`
  const hitText = formatHitOrRangeText(sub.hitResolution, level, context, sub.range)
  const cost = typeof sub.cost === 'number' ? sub.cost : (parseInt(sub.cost, 10) || 0)
  const costText = cost > 0 ? `充能${cost}` : ''
  const parts = [base]
  if (costText) parts.push(costText)
  if (hitText) parts.push(hitText)
  return parts.join(' · ')
}

export function formatContainedSpellBrief(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''

  // 新结构：多个法术共享总充能
  if (Array.isArray(value.spells)) {
    const { totalText, lines } = formatContainedSpellLines(value, context)
    if (lines.length === 0) return totalText || '（未选择法术）'
    // 法术过多时只显示数量
    if (lines.length > 3) {
      const parts = []
      if (totalText) parts.push(totalText)
      parts.push(`${lines.length}个法术`)
      return parts.join(' · ')
    }
    const parts = []
    if (totalText) parts.push(totalText)
    parts.push(...lines)
    return parts.join(' · ')
  }

  // 旧结构：单个法术
  const level = typeof value.level === 'number' ? value.level : (parseInt(value.level, 10) || 0)
  let name = (value.spellName || '').trim()
  if (!name && value.spellId) {
    const sp = getSpellById(value.spellId)
    name = (sp?.name || '').trim()
  }
  if (!name) return '（未选择法术）'
  const base = level <= 0 ? `戏法${name}` : `${Math.max(0, Math.min(9, level))}环${name}`
  const hitText = formatHitOrRangeText(value.hitResolution, level, context, value.range)
  const charges = typeof value.charges === 'number' ? value.charges : (parseInt(value.charges, 10) || 0)
  const chargeText = charges > 0 ? `充能${charges}` : ''
  const parts = [base]
  if (hitText) parts.push(hitText)
  if (chargeText) parts.push(chargeText)
  return parts.join(' · ')
}

/**
 * 将内含法术拆分为“总能量”与“每行一个法术”的结构，便于在弹窗列表中竖向展示。
 * @param {object} value
 * @param {{spellDC?:number,spellAttackBonus?:number,useWandScrollTable?:boolean}} [context]
 * @returns {{totalText:string,lines:string[]}}
 */
export function formatContainedSpellLines(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { totalText: '', lines: [] }

  if (Array.isArray(value.spells)) {
    const total = typeof value.totalCharges === 'number' ? value.totalCharges : (parseInt(value.totalCharges, 10) || 0)
    const totalText = total > 0 ? `总能量${total}` : ''
    const lines = value.spells
      .slice()
      .sort((a, b) => (a.cost || 0) - (b.cost || 0))
      .map((sp) => formatSubBrief(sp, context))
      .filter(Boolean)
    return { totalText, lines }
  }

  // 旧结构：单个法术
  const line = formatContainedSpellBrief(value, context)
  return { totalText: '', lines: line ? [line] : [] }
}

/**
 * 将多条内含法术拼到简述末尾（与原有介绍用分号分隔）
 * @param {Array<{ effectType?: string, value?: unknown }>|undefined} effects
 * @param {string} existingText 已有简述（可为空）
 * @param {{spellDC?:number,spellAttackBonus?:number,useWandScrollTable?:boolean}} [context]
 */
export function appendContainedSpellsBrief(effects, existingText, context) {
  const base = (existingText && String(existingText).trim()) || ''
  if (!Array.isArray(effects) || effects.length === 0) return base
  const spells = effects
    .filter((e) => e.effectType === 'contained_spell')
    .map((e) => formatContainedSpellBrief(e.value, context))
    .filter(Boolean)
  if (spells.length === 0) return base
  const spellStr = spells.join('；')
  return base ? `${base}；${spellStr}` : spellStr
}
