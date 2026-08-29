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

import { getBuffsFromClassFeatures, getBuffsFromSelectedFeats } from './effects/effectMapping.js'
import { getCharacterClasses, getMaxSpellSlotsByRing } from '../data/classDatabase.js'

/* ─────────────────────────────────────────────────────────
 * 查询
 * ───────────────────────────────────────────────────────── */

/**
 * 获取角色当前可用的所有主动技能
 * @param {Object} char — 角色数据
 * @param {string} [moduleId] — 模组 ID
 * @returns {Array<{ ability: ActiveAbility, context: Object }>}
 */
export function getAbilitiesForCharacter(char, moduleId) {
  if (!char) return []
  const classes = getCharacterClasses(char)
  const classLevelMap = {}
  for (const c of classes) {
    classLevelMap[c.name] = Math.max(classLevelMap[c.name] || 0, c.level)
  }
  const results = []

  // 从职业特性 BUFF 条目提取主动技能
  const cfBuffs = getBuffsFromClassFeatures(char, moduleId)
  for (const buff of cfBuffs) {
    if (!Array.isArray(buff.activeAbilities)) continue
    const level = classLevelMap[buff.sourceClass] || 1
    for (const ab of buff.activeAbilities) {
      if (ab.minLevel && level < ab.minLevel) continue
      if (ab.subclassFilter && buff.sourceSubclass !== ab.subclassFilter) continue
      results.push({
        ability: { ...ab, sourceKey: buff.sourceClass },
        context: buildContext(char, level),
      })
    }
  }

  // 从专长 BUFF 条目提取主动技能
  const featBuffs = getBuffsFromSelectedFeats(char, moduleId)
  for (const buff of featBuffs) {
    if (!Array.isArray(buff.activeAbilities)) continue
    for (const ab of buff.activeAbilities) {
      results.push({
        ability: { ...ab, sourceKey: buff.featId },
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

  // ── 按环位缩放：从 resourceKey 提取环位 ──
  const mergedOptions = { ...options }
  if (/^spell_slot_[1-9]$/.test(ability.cost?.resourceKey)) {
    mergedOptions.slotLevel = parseInt(ability.cost.resourceKey.replace('spell_slot_', ''), 10)
  }

  // ── 计算效果 ──
  const effectResults = ability.effects.map((eff) => computeEffect(eff, ctx, mergedOptions))

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

  // ── 特殊效果处理：法术位恢复 v2 ──
  for (const result of effectResults) {
    if (result.type === 'restore_spell_slots_v2') {
      const maxSlots = getMaxSpellSlotsByRing(char)
      const currentSlots = { ...(char.spellSlots || {}) }
      const newSlots = { ...currentSlots }

      if (result.mode === 'single') {
        // 单资源恢复：从 ringLevel 向下找第一个有空位的环位，恢复 1 个
        for (let ring = result.ringLevel; ring >= 1; ring--) {
          const max = maxSlots[ring] || 0
          const current = currentSlots[ring] || 0
          if (max > 0 && current < max) {
            newSlots[ring] = current + 1
            break
          }
        }
      } else if (result.mode === 'multi') {
        // 多资源恢复：恢复 1 到 maxRing 所有环位到最大值
        for (let ring = 1; ring <= result.maxRing; ring++) {
          const max = maxSlots[ring] || 0
          if (max > 0) {
            newSlots[ring] = max
          }
        }
      }

      // 只有实际改变了才写入 patch
      if (JSON.stringify(newSlots) !== JSON.stringify(currentSlots)) {
        patch.spellSlots = newSlots
      }
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
 * @param {string} [moduleId]
 * @returns {Object|null} — activeAbilityState 补丁，null 表示无需变更
 */
export function resetAbilityCooldowns(char, restType, moduleId) {
  const state = char.activeAbilityState
  if (!state) return null

  // 从 BUFF 条目构建 abilityId → cooldown 映射
  const abilityCooldownMap = {}
  const cfBuffs = getBuffsFromClassFeatures(char, moduleId)
  for (const buff of cfBuffs) {
    for (const ab of (buff.activeAbilities || [])) {
      abilityCooldownMap[ab.id] = ab.cooldown
    }
  }
  const featBuffs = getBuffsFromSelectedFeats(char, moduleId)
  for (const buff of featBuffs) {
    for (const ab of (buff.activeAbilities || [])) {
      abilityCooldownMap[ab.id] = ab.cooldown
    }
  }

  const cooldownForRest = restType === 'long' ? ['short_rest', 'long_rest'] : ['short_rest']
  const next = { ...state }
  let changed = false

  for (const [abilityId, usage] of Object.entries(state)) {
    if (!usage?.used) continue
    const cooldown = abilityCooldownMap[abilityId]
    if (cooldown && cooldownForRest.includes(cooldown)) {
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
    case 'damage': {
      const v = effect.value || {}
      const diceCount = (v.scaleWithSlot && options?.slotLevel) ? options.slotLevel : (v.diceCount || 1)
      const dice = `${diceCount}d${v.diceSides || 6}`
      const bonus = v.diceBonus ? `+${v.diceBonus}` : ''
      const typeLabel = v.damageType || 'fire'
      const weaponPart = v.addWeaponDamage ? ' + 武器伤害' : ''
      const scaleNote = v.scaleWithSlot && options?.slotLevel ? `（${options.slotLevel}环缩放）` : ''
      return {
        type: 'damage',
        description: effect.description || `${dice}${bonus} ${typeLabel}${weaponPart}${scaleNote}`,
        diceFormula: `${dice}${bonus}`,
        damageType: v.damageType || 'fire',
        addWeaponDamage: !!v.addWeaponDamage,
      }
    }
    case 'heal':
      // 新版充能治疗（有 value.diceCount）
      if (effect.value && typeof effect.value === 'object' && effect.value.diceCount) {
        const v = effect.value
        const diceCount = (v.scaleWithSlot && options?.slotLevel) ? options.slotLevel : v.diceCount
        const dice = `${diceCount}d${v.diceSides || 8}`
        const bonus = v.diceBonus ? `+${v.diceBonus}` : ''
        const scaleNote = v.scaleWithSlot && options?.slotLevel ? `（${options.slotLevel}环缩放）` : ''
        return {
          type: 'heal',
          description: effect.description || (v.mode === 'max' ? `满疗 ${dice}${bonus}` : `治疗 ${dice}${bonus}`) + scaleNote,
          diceFormula: `${dice}${bonus}`,
          mode: v.mode || 'dice',
        }
      }
      // 旧版治疗（formula 格式）
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
    case 'restore_spell_slots_v2':
      return {
        type: 'restore_spell_slots_v2',
        description: effect.description,
        mode: effect.mode || 'single',
        ringLevel: effect.ringLevel || 1,
        maxRing: effect.maxRing || 3,
        cost: effect.cost || 1,
      }
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
