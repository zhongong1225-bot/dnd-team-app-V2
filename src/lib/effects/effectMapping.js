/**
 * BUFF / 物品条目 与统一 Effect 互转
 * 保证 BuffForm、ItemAddForm 与 useBuffCalculator 使用同一套效果结构
 */

import { EFFECT_SOURCE_KIND } from './effectModel'
import { normalizeEffectCategory, migrateProficiencyTextToArray } from '../../data/buffTypes'
import { FEATS } from '../../data/feats'
import { ELDRITCH_INVOCATIONS, getEldritchInvocationById } from '../../data/eldritchInvocations'
import { FIGHTING_STYLES, getFightingStyleById } from '../../data/fightingStyles'
import { getItemById, getItemDisplayName } from '../../data/itemDatabase'
import { loadRuleTextOverrides, resolveRuleText, buildFeatNameKey } from '../ruleTextOverrides'
import { loadDefaultBuffPatch, mergeWithDefaultPatch, buildClassFeatureBuffKey } from '../defaultBuffPatchStore'
import { getAvailableFeatures } from '../../data/classDatabase'
import { HARDCODED_FEAT_BUFFS } from '../../data/featDefaultBuffs'
import { HARDCODED_CLASS_FEATURE_BUFFS } from '../../data/classFeatureDefaultBuffs'
import { DEFAULT_CLASS_FEATURE_ABILITIES, DEFAULT_FEAT_ABILITIES } from '../../data/defaultActiveAbilities'
import { getChoiceEffects, CLASS_FEATURE_CHOICE_REGISTRY, CHOICE_ID_ALIASES } from '../../data/classFeatureChoiceRegistry'
import { findShieldSlot } from '../equipmentLayers'
import { getMergedBuffsViaCards } from '../cardAdapter'

const FEAT_BY_ID = new Map(FEATS.map((x) => [x.id, x]))
const INVOCATION_BY_ID = new Map(ELDRITCH_INVOCATIONS.map((x) => [x.id, x]))
const FIGHTING_STYLE_BY_ID = new Map(FIGHTING_STYLES.map((x) => [x.id, x]))

/**
 * 数据迁移：将旧版 resist_type/immune_type/vulnerable_type 合并为 damage_type_relation
 * 同时将 instrument_proficiency 合并到 specific_tool_proficiency
 * @param {Array} effects - BUFF 效果数组
 * @returns {Array} 迁移后的效果数组
 */
function migrateDamageRelationAndInstrument(effects) {
  if (!Array.isArray(effects) || !effects.length) return effects

  const result = []
  const instrumentValues = [] // 收集旧版 instrument_proficiency 的值

  for (const e of effects) {
    if (!e || typeof e !== 'object') {
      result.push(e)
      continue
    }

    const { effectType, value } = e

    // 迁移 resist_type/immune_type/vulnerable_type → damage_type_relation
    if (effectType === 'resist_type' || effectType === 'immune_type' || effectType === 'vulnerable_type') {
      const relation = effectType === 'resist_type' ? 'resist'
        : effectType === 'immune_type' ? 'immune'
        : 'vulnerable'
      const types = Array.isArray(value) ? value : (value && typeof value === 'string' ? [value] : [])
      // 尝试合并到已有的 damage_type_relation（如果 relation 相同）
      const existing = result.find(r => r.effectType === 'damage_type_relation' && r.value?.relation === relation)
      if (existing) {
        const existingTypes = Array.isArray(existing.value.types) ? existing.value.types : []
        existing.value = { ...existing.value, types: [...new Set([...existingTypes, ...types])] }
      } else {
        result.push({ ...e, effectType: 'damage_type_relation', value: { types, relation } })
      }
      continue
    }

    // 收集 instrument_proficiency，稍后合并到 specific_tool_proficiency
    if (effectType === 'instrument_proficiency') {
      const vals = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : [])
      instrumentValues.push(...vals)
      continue
    }

    // 如果是 specific_tool_proficiency，检查是否需要合并 instrumentValues
    if (effectType === 'specific_tool_proficiency') {
      // 先保留，最后统一处理
      result.push(e)
      continue
    }

    result.push(e)
  }

  // 将收集到的 instrument_proficiency 合并到 specific_tool_proficiency
  if (instrumentValues.length > 0) {
    const existingTool = result.find(r => r.effectType === 'specific_tool_proficiency')
    if (existingTool) {
      const existingVals = Array.isArray(existingTool.value) ? existingTool.value : []
      existingTool.value = [...new Set([...existingVals, ...instrumentValues])]
    } else {
      result.push({
        effectType: 'specific_tool_proficiency',
        value: [...new Set(instrumentValues)],
        category: 'defense',
      })
    }
  }

  return result
}

function normalizeSelectedFeatsForBuffs(character) {
  const raw = character?.selectedFeats ?? []
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw
    .map((f) => {
      if (typeof f === 'string') return { featId: f, level: 1, sourceClass: '' }
      const patch = f.featBuffPatch
      return {
        featId: f.featId ?? f.id ?? '',
        level: Math.max(1, Math.min(20, Number(f.level) ?? 1)),
        sourceClass: f.sourceClass ?? '',
        featBuffPatch:
          patch && typeof patch === 'object'
            ? {
                effects: Array.isArray(patch.effects) ? patch.effects : [],
                ...(patch.duration != null && String(patch.duration).trim() !== ''
                  ? { duration: String(patch.duration).trim() }
                  : {}),
                ...(patch.enabled === false ? { enabled: false } : {}),
              }
            : undefined,
      }
    })
    .filter((x) => {
      if (!x.featId) return false
      if (seen.has(x.featId)) return false
      seen.add(x.featId)
      return true
    })
}

/**
 * 根据合并后的 BUFF 列表写回专长行的 featBuffPatch（与 getBuffsFromSelectedFeats 的 id 规则一致）
 * @param {Object} character
 * @param {Array} buffsList - 含 fromFeat 的虚拟条
 * @returns {Array} 新的 selectedFeats
 */
export function mergeFeatBuffPatchesFromMergedList(character, buffsList) {
  const raw = character?.selectedFeats ?? []
  if (!Array.isArray(raw)) return raw
  const featBuffs = buffsList.filter((b) => b.fromFeat)
  return raw.map((f, idx) => {
    const featId = typeof f === 'string' ? f : (f?.featId ?? f?.id ?? '')
    if (!featId) return f
    const legacyId = `feat_${idx}_${featId}`
    const stableId = `feat_${featId}`
    const fb = featBuffs.find((b) => b.id === stableId || b.id === legacyId || b.featId === featId)
    if (!fb) return f

    const base = typeof f === 'string' ? { featId, level: 1, sourceClass: '' } : { ...f }
    const eff = Array.isArray(fb.effects) ? fb.effects : []
    const durRaw = fb.duration
    const dur = durRaw != null && String(durRaw).trim() !== '' ? String(durRaw).trim() : undefined
    const en = fb.enabled !== false

    const shouldClear = eff.length === 0 && !dur && en
    if (shouldClear) {
      if (typeof f === 'string') return f
      const { featBuffPatch: _drop, ...rest } = base
      return rest
    }

    const patch = { effects: eff.map((e) => ({ ...e })) }
    if (dur) patch.duration = dur
    if (!en) patch.enabled = false

    return { ...base, featBuffPatch: patch }
  })
}

/**
 * 从角色已选专长生成虚拟 BUFF（栏内不展示规则原文；效果由用户在编辑中填写，存于 featBuffPatch）
 * @param {Object} character
 * @param {string} [moduleId] - 有则套用规则收录中的专长显示名称覆盖
 * @returns {Array<{ id: string, source: string, effects: Array, enabled: boolean, fromFeat: true, featId: string }>}
 */
export function getBuffsFromSelectedFeats(character, moduleId) {
  const rows = normalizeSelectedFeatsForBuffs(character)
  const map =
    moduleId && String(moduleId).trim()
      ? loadRuleTextOverrides(String(moduleId).trim())
      : {}
  const out = []
  rows.forEach((item, index) => {
    const def = FEAT_BY_ID.get(item.featId)
    const baseName = def?.name ?? item.featId
    const name = resolveRuleText(map, buildFeatNameKey(item.featId), baseName)
    const defaultPatch = moduleId ? loadDefaultBuffPatch(moduleId, 'feat', item.featId) : null
    const patch = mergeWithDefaultPatch(item.featBuffPatch, defaultPatch)
    let effects = Array.isArray(patch?.effects) && patch.effects.length ? patch.effects : []
    // 无自定义且无模组库默认时，回退到硬编码专长效果
    if (effects.length === 0 && !patch && HARDCODED_FEAT_BUFFS[item.featId]) {
      effects = HARDCODED_FEAT_BUFFS[item.featId]
    }
    const duration = patch?.duration
    const enabled = patch?.enabled !== false
    const defaultAbilities = DEFAULT_FEAT_ABILITIES[item.featId] || []
    out.push({
      id: `feat_${item.featId}`,
      source: name,
      effects,
      ...(defaultAbilities.length ? { activeAbilities: defaultAbilities } : {}),
      ...(duration ? { duration } : {}),
      enabled,
      fromFeat: true,
      featId: item.featId,
    })
  })
  return out
}

function normalizeSelectedInvocationsForBuffs(character) {
  const raw = character?.selectedInvocations ?? []
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => {
      if (typeof x === 'string') return { invocationId: x }
      const patch = x?.invocationBuffPatch
      return {
        invocationId: x?.invocationId ?? x?.id ?? '',
        invocationBuffPatch:
          patch && typeof patch === 'object'
            ? {
                effects: Array.isArray(patch.effects) ? patch.effects : [],
                ...(patch.duration != null && String(patch.duration).trim() !== ''
                  ? { duration: String(patch.duration).trim() }
                  : {}),
                ...(patch.enabled === false ? { enabled: false } : {}),
              }
            : undefined,
      }
    })
    .filter((x) => x.invocationId && INVOCATION_BY_ID.has(x.invocationId))
}

/**
 * 根据合并后的 BUFF 列表写回魔能祈唤行的 invocationBuffPatch
 * @param {Object} character
 * @param {Array} buffsList - 含 fromInvocation 的虚拟条
 * @returns {Array} 新的 selectedInvocations
 */
export function mergeInvocationBuffPatchesFromMergedList(character, buffsList) {
  const raw = character?.selectedInvocations ?? []
  if (!Array.isArray(raw)) return raw
  const invBuffs = buffsList.filter((b) => b.fromInvocation)
  return raw.map((x, idx) => {
    const invocationId = typeof x === 'string' ? x : (x?.invocationId ?? x?.id ?? '')
    if (!invocationId) return x
    const stableId = `invocation_${invocationId}`
    const fb = invBuffs.find((b) => b.id === stableId && b.invocationId === invocationId)
    if (!fb) return x

    const base = typeof x === 'string' ? { invocationId } : { ...x }
    const eff = Array.isArray(fb.effects) ? fb.effects : []
    const durRaw = fb.duration
    const dur = durRaw != null && String(durRaw).trim() !== '' ? String(durRaw).trim() : undefined
    const en = fb.enabled !== false

    const shouldClear = eff.length === 0 && !dur && en
    if (shouldClear) {
      if (typeof x === 'string') return x
      const { invocationBuffPatch: _drop, ...rest } = base
      return rest
    }

    const patch = { effects: eff.map((e) => ({ ...e })) }
    if (dur) patch.duration = dur
    if (!en) patch.enabled = false

    return { ...base, invocationBuffPatch: patch }
  })
}

/**
 * 从角色已选魔能祈唤生成虚拟 BUFF（类似专长，数值由用户在编辑中填写，存于 invocationBuffPatch）
 * @param {Object} character
 * @returns {Array<{ id: string, source: string, effects: Array, enabled: boolean, fromInvocation: true, invocationId: string }>}
 */
export function getBuffsFromSelectedInvocations(character, moduleId) {
  const rows = normalizeSelectedInvocationsForBuffs(character)
  return rows.map((item, index) => {
    const def = INVOCATION_BY_ID.get(item.invocationId)
    const defaultPatch = moduleId ? loadDefaultBuffPatch(moduleId, 'invocation', item.invocationId) : null
    const patch = mergeWithDefaultPatch(item.invocationBuffPatch, defaultPatch)
    const effects = Array.isArray(patch?.effects) && patch.effects.length ? patch.effects : []
    const duration = patch?.duration
    const enabled = patch?.enabled !== false
    return {
      id: `invocation_${item.invocationId}`,
      source: def?.name ?? item.invocationId,
      effects,
      ...(duration ? { duration } : {}),
      enabled,
      fromInvocation: true,
      invocationId: item.invocationId,
    }
  })
}

function normalizeSelectedFightingStylesForBuffs(character) {
  const raw = character?.selectedFightingStyles ?? []
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => {
      if (typeof x === 'string') return { styleId: x }
      const patch = x?.styleBuffPatch
      return {
        styleId: x?.styleId ?? x?.id ?? '',
        styleBuffPatch:
          patch && typeof patch === 'object'
            ? {
                effects: Array.isArray(patch.effects) ? patch.effects : [],
                ...(patch.duration != null && String(patch.duration).trim() !== ''
                  ? { duration: String(patch.duration).trim() }
                  : {}),
                ...(patch.enabled === false ? { enabled: false } : {}),
              }
            : undefined,
      }
    })
    .filter((x) => x.styleId && FIGHTING_STYLE_BY_ID.has(x.styleId))
}

/**
 * 根据合并后的 BUFF 列表写回战斗风格行的 styleBuffPatch
 * @param {Object} character
 * @param {Array} buffsList - 含 fromFightingStyle 的虚拟条
 * @returns {Array} 新的 selectedFightingStyles
 */
export function mergeFightingStyleBuffPatchesFromMergedList(character, buffsList) {
  const raw = character?.selectedFightingStyles ?? []
  if (!Array.isArray(raw)) return raw
  const styleBuffs = buffsList.filter((b) => b.fromFightingStyle)
  return raw.map((x, idx) => {
    const styleId = typeof x === 'string' ? x : (x?.styleId ?? x?.id ?? '')
    if (!styleId) return x
    const stableId = `fightingstyle_${styleId}`
    const fb = styleBuffs.find((b) => b.id === stableId && b.styleId === styleId)
    if (!fb) return x

    const base = typeof x === 'string' ? { styleId } : { ...x }
    const eff = Array.isArray(fb.effects) ? fb.effects : []
    const durRaw = fb.duration
    const dur = durRaw != null && String(durRaw).trim() !== '' ? String(durRaw).trim() : undefined
    const en = fb.enabled !== false

    const shouldClear = eff.length === 0 && !dur && en
    if (shouldClear) {
      if (typeof x === 'string') return x
      const { styleBuffPatch: _drop, ...rest } = base
      return rest
    }

    const patch = { effects: eff.map((e) => ({ ...e })) }
    if (dur) patch.duration = dur
    if (!en) patch.enabled = false

    return { ...base, styleBuffPatch: patch }
  })
}

/**
 * 从角色已选战斗风格生成虚拟 BUFF（类似专长，数值由用户在编辑中填写，存于 styleBuffPatch）
 * @param {Object} character
 * @returns {Array<{ id: string, source: string, effects: Array, enabled: boolean, fromFightingStyle: true, styleId: string }>}
 */
export function getBuffsFromSelectedFightingStyles(character, moduleId) {
  const rows = normalizeSelectedFightingStylesForBuffs(character)
  return rows.map((item, index) => {
    const def = FIGHTING_STYLE_BY_ID.get(item.styleId)
    const defaultPatch = moduleId ? loadDefaultBuffPatch(moduleId, 'fightingStyle', item.styleId) : null
    const patch = mergeWithDefaultPatch(item.styleBuffPatch, defaultPatch)
    const effects = Array.isArray(patch?.effects) && patch.effects.length ? patch.effects : []
    const duration = patch?.duration
    const enabled = patch?.enabled !== false
    return {
      id: `fightingstyle_${item.styleId}`,
      source: def?.name ? `战斗风格-${def.name}` : item.styleId,
      effects,
      ...(duration ? { duration } : {}),
      enabled,
      fromFightingStyle: true,
      styleId: item.styleId,
    }
  })
}

/**
 * 从角色职业特性生成虚拟 BUFF（类似战斗风格，数值由 DM 配置默认效果）
 * @param {Object} character
 * @param {string} moduleId
 * @returns {Array<{ id: string, source: string, effects: Array, enabled: boolean, fromClassFeature: true, featureId: string, sourceClass: string, sourceSubclass: string }>}
 */
export function getBuffsFromClassFeatures(character, moduleId) {
  if (!character) return []
  const features = getAvailableFeatures(character)
  const classFeatureChoices = character.classFeatureChoices || null
  return features
    .map((f, index) => {
      const buffKey = buildClassFeatureBuffKey(f.sourceClass, f.sourceSubclass, f.id)
      const defaultPatch = moduleId ? loadDefaultBuffPatch(moduleId, 'classFeature', buffKey) : null
      let effects = Array.isArray(defaultPatch?.effects) && defaultPatch.effects.length ? defaultPatch.effects : []
      let duration = defaultPatch?.duration
      let enabled = defaultPatch?.enabled !== false
      let sourceLabel = f.name
      let optionId = null

      // 选择型特性：检查玩家选择和选项专属 DM 补丁
      const registryEntry = CLASS_FEATURE_CHOICE_REGISTRY[buffKey]
      if (registryEntry) {
        // DM 特性级补丁的 choiceSelected 覆盖（DM 可强制指定选项）
        const dmChoiceOverride = defaultPatch?.choiceSelected != null ? defaultPatch.choiceSelected : null

        const rawChosenId = dmChoiceOverride != null
          ? registryEntry.options[dmChoiceOverride]?.id || null
          : (classFeatureChoices?.[f.id] || null)
        // 兼容旧 ID：改名后自动映射到新 ID
        const chosenOptionId = CHOICE_ID_ALIASES[rawChosenId] || rawChosenId

        // 构建 choice 结构：每个选项包含各自效果，BUFF 编辑器可展示/编辑
        const choiceOptions = registryEntry.options.map((opt) => {
          const optBuffKey = `${buffKey}:${opt.id}`
          const optPatch = moduleId ? loadDefaultBuffPatch(moduleId, 'classFeature', optBuffKey) : null
          if (optPatch && Array.isArray(optPatch.effects) && optPatch.effects.length) {
            return { name: opt.label, description: opt.description || '', effects: optPatch.effects }
          }
          return { name: opt.label, description: opt.description || '', effects: registryEntry.getEffects(opt.id) }
        })

        const selIdx = chosenOptionId
          ? registryEntry.options.findIndex((o) => o.id === chosenOptionId)
          : -1

        if (selIdx >= 0) {
          optionId = chosenOptionId
          // sourceLabel 显示职业名和具体选择的选项名
          const selectedOption = registryEntry.options[selIdx]
          sourceLabel = `${f.name}：${selectedOption.label}`
        }

        effects = [{
          effectType: 'choice',
          category: 'custom',
          scope: 'global',
          scopeDetail: [],
          value: {
            choiceOptions,
            choiceSelected: selIdx >= 0 ? selIdx : 0,
          },
        }]
      }

      // 非选择型特性或无玩家选择时：回退到硬编码默认
      if (effects.length === 0 && !optionId && !registryEntry) {
        const choiceResult = getChoiceEffects(buffKey, classFeatureChoices)
        if (choiceResult) effects = choiceResult.effects
      }
      if (effects.length === 0 && !registryEntry && HARDCODED_CLASS_FEATURE_BUFFS[buffKey]) {
        effects = HARDCODED_CLASS_FEATURE_BUFFS[buffKey]
      }
      // 注入默认主动技能（即使无被动效果也保留条目）
      // 优先级：DM 补丁配置 > 硬编码默认
      const patchAbilities = Array.isArray(defaultPatch?.activeAbilities) ? defaultPatch.activeAbilities : null
      const defaultAbilities = patchAbilities || DEFAULT_CLASS_FEATURE_ABILITIES[buffKey] || []
      if (effects.length === 0 && defaultAbilities.length === 0) return null
      return {
        id: `classfeature_${f.sourceClass}_${f.sourceSubclass || ''}_${f.id}${optionId ? `_${optionId}` : ''}`,
        source: sourceLabel,
        effects,
        ...(defaultAbilities.length ? { activeAbilities: defaultAbilities } : {}),
        ...(duration ? { duration } : {}),
        enabled,
        fromClassFeature: true,
        featureId: f.id,
        sourceClass: f.sourceClass,
        sourceSubclass: f.sourceSubclass || '',
        ...(optionId ? { optionId } : {}),
      }
    })
    .filter(Boolean)
}

/**
 * 与角色卡 Buff 栏一致：专长虚拟条 + 祈唤虚拟条 + 战斗风格虚拟条 + 职业特性虚拟条 + 手动 buff + 装备附魔。
 * 凡调用 useBuffCalculator 且需与栏内数值一致处，应使用此列表。
 */
export function getMergedBuffsForCalculator(character, moduleId) {
  // Phase 1: 通过卡适配器统一数据源，确保 BUFF 栏与面板数据一致
  return getMergedBuffsViaCards(character, moduleId)
}

/**
 * 从 BUFF 对象取出 Effect 数组（兼容旧单条与新 effects 数组）
 * @param {Object} buff - 单条 BUFF { effects?, category?, effectType?, value? }
 * @returns {{ effectType: string, value: any }[]} 扁平列表，供计算器使用
 */
export function getEffectsFromBuff(buff) {
  if (!buff) return []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    const migrated = migrateDamageRelationAndInstrument(migrateProficiencyTextToArray(buff.effects))
    return migrated.map((e) => ({
      ...e,
      effectType: e.effectType ?? '',
      value: e.value,
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
    }))
  }
  if (buff.effectType != null || buff.category != null) {
    const migrated = migrateDamageRelationAndInstrument(migrateProficiencyTextToArray([buff]))
    return migrated.map((e) => ({
      ...e,
      effectType: e.effectType ?? '',
      value: e.value,
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
    }))
  }
  return []
}

/**
 * 从物品条目取出 Effect 数组（用于统一计算时合并装备效果）
 * @param {Object} entry - 背包条目 { effects?, magicBonus?, charge?, 附注?, ... }
 * @returns {Array<{ category: string, effectType: string, value: any }>}
 */
export function getEffectsFromItem(entry) {
  if (!entry) return []
  if (Array.isArray(entry.effects) && entry.effects.length) {
    const migrated = migrateDamageRelationAndInstrument(migrateProficiencyTextToArray(entry.effects))
    return migrated.map((e) => ({
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
      effectType: e.effectType ?? '',
      value: e.value ?? 0,
      customText: e.customText ?? '',
      break20: e.break20,
    }))
  }
  const out = []
  const magicVal = entry.magicBonus != null && entry.magicBonus !== '' ? Number(entry.magicBonus) : 0
  if (magicVal !== 0) {
    out.push({ category: 'offense', effectType: 'attack_all', value: magicVal })
    out.push({ category: 'offense', effectType: 'dmg_bonus_all', value: magicVal })
  }
  if (entry.charge != null && entry.charge !== '') {
    out.push({ category: 'mobility_casting', effectType: 'charge', value: Number(entry.charge) || 0 })
  }
  const 附注 = (entry.附注 ?? '').trim()
  const acMatch = 附注.match(/AC\s*\+\s*(\d+)/i)
  if (acMatch) {
    out.push({ category: 'defense', effectType: 'ac_bonus', value: parseInt(acMatch[1], 10) || 0 })
  }
  if (entry.spellDC != null && entry.spellDC !== '') {
    out.push({
      category: 'mobility_casting',
      effectType: 'save_dc_bonus',
      value: { val: Number(entry.spellDC) || 0, advantage: '' },
    })
  }
  if (entry.spellAttackBonus != null && entry.spellAttackBonus !== '') {
    out.push({
      category: 'mobility_casting',
      effectType: 'spell_attack_bonus',
      value: { val: Number(entry.spellAttackBonus) || 0, advantage: '' },
    })
  }
  const 攻击距离 = (entry.攻击距离 ?? '').trim()
  const reachNum = 攻击距离.match(/(\d+)/)?.[1]
  if (reachNum) {
    out.push({ category: 'offense', effectType: 'reach_bonus', value: parseInt(reachNum, 10) || 0 })
  }
  if ((entry.攻击范围 ?? '').trim()) {
    out.push({ category: 'offense', effectType: 'attack_range', value: 0, customText: String(entry.攻击范围).trim() })
  }
  return out
}

/**
 * 将 BUFF 列表展平为计算器用的 { effectType, value } 列表（兼容旧格式）
 * 与 useBuffCalculator 原 getFlatEffectEntries 行为一致，统一入口
 * 保留 scope/scopeDetail/itemInventoryId，供 CombatStatus 等处的条件范围匹配使用。
 */
export function getFlatEffectEntries(buffs) {
  const out = []
  const list = Array.isArray(buffs) ? buffs : []
  for (const b of list) {
    if (b && b.enabled === false) continue
    const effects = getEffectsFromBuff(b)
    for (const e of effects) {
      // 选择型 BUFF：展开选中选项的效果
      if (e.effectType === 'choice' && e.value && typeof e.value === 'object' && !Array.isArray(e.value)) {
        const opts = Array.isArray(e.value.choiceOptions) ? e.value.choiceOptions : []
        const selIdx = Math.min(Math.max(0, Number(e.value.choiceSelected) || 0), opts.length - 1)
        const selectedOpt = opts[selIdx]
        if (selectedOpt && Array.isArray(selectedOpt.effects)) {
          for (const se of selectedOpt.effects) {
            out.push({
              effectType: se.effectType ?? '',
              value: se.value,
              scope: se.scope,
              scopeDetail: se.scopeDetail,
              itemInventoryId: se.itemInventoryId ?? b?.itemInventoryId,
              break20: se.break20,
            })
          }
        }
        continue
      }
      out.push({
        effectType: e.effectType,
        value: e.value,
        scope: e.scope,
        scopeDetail: e.scopeDetail,
        itemInventoryId: e.itemInventoryId ?? b?.itemInventoryId,
        break20: e.break20,
      })
    }
  }
  return out
}

/**
 * 将 BUFF 转为 EffectSource（用于统一模型展示/计算）
 */
export function buffToEffectSource(buff) {
  const effects = getEffectsFromBuff(buff).map((e) => ({
    category: e.category ?? 'ability',
    effectType: e.effectType ?? '',
    value: e.value ?? 0,
    customText: typeof e.value === 'string' ? e.value : '',
  }))
  return {
    id: buff.id ?? '',
    kind: EFFECT_SOURCE_KIND.BUFF,
    label: buff.source ?? '',
    enabled: buff.enabled !== false,
    effects,
    duration: buff.duration,
  }
}

/**
 * 将物品条目转为 EffectSource（用于统一模型）
 */
export function itemToEffectSource(entry, label = '') {
  const effects = getEffectsFromItem(entry)
  return {
    id: entry.id ?? '',
    kind: EFFECT_SOURCE_KIND.ITEM,
    label: label || entry.name || '',
    enabled: true,
    effects,
  }
}

/**
 * 从角色「已装备」物品（手持 + 身穿槽位）中收集带附魔的条目，生成虚拟 BUFF 列表（用于 BUFF 栏展示与计算）
 * 仅统计装备在身上的，背包中未装备的不显示。
 * @param {Object} character - 角色 { inventory?, equippedHeld?, equippedWorn? }
 * @returns {Array<{ id: string, source: string, effects: Array, enabled: boolean, fromItem: true }>}
 */
export function getBuffsFromEquipmentAndInventory(character) {
  const inv = character?.inventory ?? []
  const held = character?.equippedHeld ?? []
  const worn = character?.equippedWorn ?? []
  const bodyInventoryId = (worn.find((s) => s?.id === 'body' || s?.slotId === 'body')?.inventoryId) || null
  const shieldInventoryId = findShieldSlot(held, inv)?.inventoryId || null
  const equippedIds = new Set()
  for (const slot of held) {
    if (slot?.inventoryId) equippedIds.add(slot.inventoryId)
  }
  for (const slot of worn) {
    if (slot?.inventoryId) equippedIds.add(slot.inventoryId)
  }

  const out = []
  for (const entry of inv) {
    if (!equippedIds.has(entry?.id)) continue
    // 未同调装备不生效其 BUFF/效果
    if (entry.isAttuned !== true) continue
    let effects = getEffectsFromItem(entry)
    // Defensive body/shield slots already contribute AC via formulas.getAC (magicBonus etc).
    // Avoid counting the same AC enchantment again through item effect mapping.
    if (entry?.id === bodyInventoryId || entry?.id === shieldInventoryId) {
      effects = effects.filter((e) => e.effectType !== 'ac_bonus')
    }
    if (effects.length === 0) continue
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    const displayName = (entry.name && String(entry.name).trim()) ? String(entry.name).trim() : (getItemDisplayName(proto) || '未命名物品')
    out.push({
      id: 'item_' + (entry.id || 'inv_' + (entry.itemId || 'unknown')),
      source: displayName,
      effects: effects.map((e) => ({ effectType: e.effectType, value: e.value, category: e.category, itemInventoryId: entry.id })),
      enabled: true,
      fromItem: true,
    })
  }
  return out
}
