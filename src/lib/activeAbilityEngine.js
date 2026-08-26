/**
 * 主动技能引擎
 *
 * 职责：
 *  1. 查询角色可用的主动技能（getAbilitiesForCharacter）
 *  2. 检查使用条件（canUseAbility）
 *  3. 执行技能 → 返回效果描述 + 新状态（executeAbility）
 *
 * 不直接操作 UI / 骰子 / BUFF 系统 —— 调用方根据返回结果自行处理。
 */

import { ACTIVE_ABILITY_REGISTRY, getAbilityById } from '../data/activeAbilityRegistry.js'
import { getCharacterClasses } from '../data/classDatabase.js'

/* ─────────────────────────────────────────────────────────
 * 查询
 * ───────────────────────────────────────────────────────── */

/**
 * 获取角色当前可用的所有主动技能
 * @param {Object} char — 角色数据
 * @returns {Array<{ ability: ActiveAbility, context: Object }>}
 */
export function getAbilitiesForCharacter(char) {
  if (!char) return []
  const classes = getCharacterClasses(char)
  const classKeys = new Set(classes.map((c) => c.name))
  const classLevelMap = {}
  for (const c of classes) {
    classLevelMap[c.name] = Math.max(classLevelMap[c.name] || 0, c.level)
  }
  const featIds = new Set((char.selectedFeats || []).map((f) => f.featId))
  const results = []

  for (const ability of ACTIVE_ABILITY_REGISTRY) {
    if (ability.source === 'class' && classKeys.has(ability.sourceKey)) {
      if (ability.subclassFilter) {
        const match = classes.find(
          (c) => c.name === ability.sourceKey && c.subclass === ability.subclassFilter,
        )
        if (!match) continue
      }
      results.push({
        ability,
        context: buildContext(char, classLevelMap[ability.sourceKey] || 1),
      })
    } else if (ability.source === 'feat' && featIds.has(ability.sourceKey)) {
      results.push({
        ability,
        context: buildContext(char, char.level || 1),
      })
    }
  }

  return results
}

/* ─────────────────────────────────────────────────────────
 * 条件检查
 * ───────────────────────────────────────────────────────── */

/**
 * 检查技能是否可以使用
 * @param {ActiveAbility} ability
 * @param {Object} char
 * @returns {{ usable: boolean, reason?: string }}
 */
export function canUseAbility(ability, char) {
  if (!ability || !char) return { usable: false, reason: '无效的技能或角色' }

  // 1. 冷却中的独立技能（feat 等无 classResource 的技能）
  if (ability.cost.type === 'none' && ability.cooldown !== 'none') {
    const state = getAbilityUsageState(char, ability.id)
    if (state.used) return { usable: false, reason: '本休息周期已使用' }
  }

  // 2. classResource 消耗
  if (ability.cost.type === 'class_resource') {
    const resource = (char.classResources || []).find(
      (r) => r.resourceKey === ability.cost.resourceKey,
    )
    if (!resource) return { usable: false, reason: '缺少所需资源' }
    if (resource.current <= 0) return { usable: false, reason: '资源已耗尽' }
    if (resource.current < ability.cost.amount) {
      return { usable: false, reason: '资源不足' }
    }
  }

  return { usable: true }
}

/**
 * 读取独立冷却技能的当前使用状态
 * @param {Object} char
 * @param {string} abilityId
 * @returns {{ used: boolean, lastRestType?: string }}
 */
export function getAbilityUsageState(char, abilityId) {
  const state = char.activeAbilityState?.[abilityId]
  if (!state) return { used: false }
  return {
    used: state.used || false,
    lastRestType: state.lastRestType || null,
  }
}

/* ─────────────────────────────────────────────────────────
 * 执行
 * ───────────────────────────────────────────────────────── */

/**
 * 执行技能
 *
 * 返回：
 *  - success: boolean
 *  - effectResults: 每个 effect 的计算结果（供 UI 处理骰子 / 变身等）
 *  - patch: 需要合并到角色数据的变更（activeAbilityState 等）
 *  - resourcePatch: classResources 新数组（若有消耗）
 *
 * @param {ActiveAbility} ability
 * @param {Object} char
 * @param {Object} [options]
 * @param {number} [options.customCostAmount] — 自定义消耗量（如圣疗花多少点）
 * @returns {Object}
 */
export function executeAbility(ability, char, options = {}) {
  const check = canUseAbility(ability, char)
  if (!check.usable) return { success: false, reason: check.reason }

  const classes = getCharacterClasses(char)
  const classLevelMap = {}
  for (const c of classes) {
    classLevelMap[c.name] = Math.max(classLevelMap[c.name] || 0, c.level)
  }
  const ctx = buildContext(char, classLevelMap[ability.sourceKey] || char.level || 1)

  const patch = {}
  let newClassResources = null
  let resourcePatchNeeded = false

  // ── 扣除 classResource ──
  if (ability.cost.type === 'class_resource') {
    newClassResources = (char.classResources || []).map((r) => {
      if (r.resourceKey !== ability.cost.resourceKey) return r
      return { ...r, current: Math.max(0, r.current - ability.cost.amount) }
    })
    resourcePatchNeeded = true
  }

  // ── 标记独立冷却 ──
  if (ability.cost.type === 'none' && ability.cooldown !== 'none') {
    patch.activeAbilityState = {
      ...(char.activeAbilityState || {}),
      [ability.id]: { used: true },
    }
  }

  // ── 计算效果 ──
  const effectResults = ability.effects.map((eff) => computeEffect(eff, ctx, options))

  // ── 特殊效果处理：恢复星辰点 ──
  for (const result of effectResults) {
    if (result.type === 'restore_star_points') {
      // 确保有 classResources 可以修改
      if (!newClassResources) {
        newClassResources = (char.classResources || []).map((r) => ({ ...r }))
      }
      // 恢复所有星辰点到上限
      newClassResources = newClassResources.map((r) => {
        if (r.resourceKey !== 'star_points') return r
        return { ...r, current: r.max }
      })
      resourcePatchNeeded = true
    }
  }

  return {
    success: true,
    abilityId: ability.id,
    abilityName: ability.name,
    effectResults,
    patch,
    ...(resourcePatchNeeded ? { classResources: newClassResources } : {}),
  }
}

/* ─────────────────────────────────────────────────────────
 * 休息联动
 * ───────────────────────────────────────────────────────── */

/**
 * 短休 / 长休时重置独立冷却技能
 * @param {Object} char
 * @param {'short'|'long'} restType
 * @returns {Object|null} — activeAbilityState 补丁，null 表示无需变更
 */
export function resetAbilityCooldowns(char, restType) {
  const state = char.activeAbilityState
  if (!state) return null

  const cooldownForRest = restType === 'long' ? ['short_rest', 'long_rest'] : ['short_rest']
  const next = { ...state }
  let changed = false

  for (const [abilityId, usage] of Object.entries(state)) {
    if (!usage?.used) continue
    const ability = getAbilityById(abilityId)
    if (ability && cooldownForRest.includes(ability.cooldown)) {
      next[abilityId] = { used: false }
      changed = true
    }
  }

  return changed ? next : null
}

/* ─────────────────────────────────────────────────────────
 * 内部工具
 * ───────────────────────────────────────────────────────── */

function buildContext(char, classLevel) {
  return {
    classLevel,
    totalLevel: char.level || 1,
    abilities: char.abilities || {},
    proficiency: computeProficiency(char.level || 1),
  }
}

function computeProficiency(level) {
  const lv = Math.max(1, Math.min(20, Math.floor(level)))
  return Math.ceil(lv / 4) + 1 // 2,3,4,5,6
}

/**
 * 计算单个效果的结果
 */
function computeEffect(effect, ctx, options) {
  switch (effect.type) {
    case 'heal':
      return computeHealEffect(effect, ctx, options)
    case 'creature_transform':
      return { type: 'creature_transform', description: effect.description }
    case 'save_redirect':
      return {
        type: 'save_redirect',
        description: effect.description,
        applicableAbilities: effect.applicableAbilities || [],
      }
    case 'buff':
      return { type: 'buff', description: effect.description, duration: effect.duration || '1分钟' }
    case 'heal_full':
      return { type: 'heal_full', description: effect.description }
    case 'teleport':
      return { type: 'teleport', description: effect.description }
    case 'restore_star_points':
      return { type: 'restore_star_points', description: effect.description }
    case 'restore_spell_slots':
      return { type: 'restore_spell_slots', description: effect.description, ringLevel: options.ringLevel || 3 }
    case 'summon':
      return { type: 'summon', description: effect.description, duration: effect.duration || '1分钟' }
    default:
      return { type: effect.type, description: effect.description }
  }
}

function computeHealEffect(effect, ctx, options) {
  const { formula } = effect
  let baseValue = 0
  let dicePart = null

  if (formula === 'costAmount') {
    baseValue = options.customCostAmount || 1
  } else if (formula) {
    // 解析 "classLevel + 1d10" 格式
    const parts = formula.split('+').map((s) => s.trim())
    for (const part of parts) {
      if (part === 'classLevel') {
        baseValue += ctx.classLevel
      } else if (/^\d+d\d+$/.test(part)) {
        const [count, size] = part.split('d').map(Number)
        dicePart = { count, size }
      } else {
        const n = Number(part)
        if (!isNaN(n)) baseValue += n
      }
    }
  }

  const expectedDice = dicePart
    ? dicePart.count * (dicePart.size + 1) / 2
    : 0

  return {
    type: 'heal',
    baseValue,
    dicePart,
    expectedTotal: Math.round(baseValue + expectedDice),
    description: effect.description,
  }
}
