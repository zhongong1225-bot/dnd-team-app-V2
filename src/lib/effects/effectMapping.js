/**
 * BUFF / 物品条目 与统一 Effect 互转
 * 保证 BuffForm、ItemAddForm 与 useBuffCalculator 使用同一套效果结构
 */

import { EFFECT_SOURCE_KIND } from './effectModel'
import { normalizeEffectCategory } from '../../data/buffTypes'
import { FEATS } from '../../data/feats'
import { ELDRITCH_INVOCATIONS, getEldritchInvocationById } from '../../data/eldritchInvocations'
import { getItemById, getItemDisplayName } from '../../data/itemDatabase'
import { loadRuleTextOverrides, resolveRuleText, buildFeatNameKey } from '../ruleTextOverrides'

const FEAT_BY_ID = new Map(FEATS.map((x) => [x.id, x]))
const INVOCATION_BY_ID = new Map(ELDRITCH_INVOCATIONS.map((x) => [x.id, x]))

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
    const patch = item.featBuffPatch
    const effects = Array.isArray(patch?.effects) && patch.effects.length ? patch.effects : []
    const duration = patch?.duration
    const enabled = patch?.enabled !== false
    out.push({
      id: `feat_${item.featId}`,
      source: name,
      effects,
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
    const stableId = `invocation_${invocationId}_${idx}`
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
export function getBuffsFromSelectedInvocations(character) {
  const rows = normalizeSelectedInvocationsForBuffs(character)
  return rows.map((item, index) => {
    const def = INVOCATION_BY_ID.get(item.invocationId)
    const patch = item.invocationBuffPatch
    const effects = Array.isArray(patch?.effects) && patch.effects.length ? patch.effects : []
    const duration = patch?.duration
    const enabled = patch?.enabled !== false
    return {
      id: `invocation_${item.invocationId}_${index}`,
      source: def?.name ?? item.invocationId,
      effects,
      ...(duration ? { duration } : {}),
      enabled,
      fromInvocation: true,
      invocationId: item.invocationId,
    }
  })
}

/**
 * 与角色卡 Buff 栏一致：专长虚拟条 + 祈唤虚拟条 + 手动 buff + 装备附魔。
 * 凡调用 useBuffCalculator 且需与栏内数值一致处，应使用此列表。
 */
export function getMergedBuffsForCalculator(character, moduleId) {
  if (!character) return []
  const manual = character.buffs ?? []
  const fromFeats = getBuffsFromSelectedFeats(character, moduleId)
  const fromInvocations = getBuffsFromSelectedInvocations(character)
  const fromItems = getBuffsFromEquipmentAndInventory(character)
  return [...fromFeats, ...fromInvocations, ...manual, ...fromItems]
}

/**
 * 从 BUFF 对象取出 Effect 数组（兼容旧单条与新 effects 数组）
 * @param {Object} buff - 单条 BUFF { effects?, category?, effectType?, value? }
 * @returns {{ effectType: string, value: any }[]} 扁平列表，供计算器使用
 */
export function getEffectsFromBuff(buff) {
  if (!buff) return []
  if (Array.isArray(buff.effects) && buff.effects.length) {
    return buff.effects.map((e) => ({
      ...e,
      effectType: e.effectType ?? '',
      value: e.value,
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
    }))
  }
  if (buff.effectType != null || buff.category != null) {
    return [{
      ...buff,
      effectType: buff.effectType ?? '',
      value: buff.value,
      category: normalizeEffectCategory(buff.effectType ?? '', buff.category),
    }]
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
    return entry.effects.map((e) => ({
      category: normalizeEffectCategory(e.effectType ?? '', e.category),
      effectType: e.effectType ?? '',
      value: e.value ?? 0,
      customText: e.customText ?? '',
    }))
  }
  const out = []
  const magicVal = entry.magicBonus != null && entry.magicBonus !== '' ? Number(entry.magicBonus) : 0
  if (magicVal !== 0) {
    out.push({ category: 'offense', effectType: 'attack_melee', value: magicVal })
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
 */
export function getFlatEffectEntries(buffs) {
  const out = []
  const list = Array.isArray(buffs) ? buffs : []
  for (const b of list) {
    const effects = getEffectsFromBuff(b)
    effects.forEach((e) => out.push({ effectType: e.effectType, value: e.value }))
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
  const shieldInventoryId = (held[1]?.inventoryId) || null
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
      id: 'item_' + (entry.id || 'inv_' + Math.random().toString(36).slice(2)),
      source: displayName,
      effects: effects.map((e) => ({ effectType: e.effectType, value: e.value, category: e.category, itemInventoryId: entry.id })),
      enabled: true,
      fromItem: true,
    })
  }
  return out
}
