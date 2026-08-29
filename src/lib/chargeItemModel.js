/**
 * 统一充能物品（charge_item）数据模型
 *
 * 将充能数、回能方式、消耗效果整合到一个 effect 模块中。
 *
 * value: {
 *   resourceType: 'charges' | 'lucky_points' | ...  // 消耗资源类型
 *   charges: number,               // 充能数（仅当 resourceType === 'charges' 时有效）
 *   actionCost: 'action' | 'bonus' | 'reaction' | 'none' | 'movement',
 *   movementFeet: number,          // 移动距离消耗（仅当 actionCost === 'movement' 时有效）
 *   recovery: {                    // 回能配置
 *     method: 'short_rest' | 'long_rest' | 'dawn' | 'none' | 'absorb_energy' | 'reaction_absorb',
 *     kind: 'full' | 'fixed' | 'dice',
 *     fixed: number,
 *     diceCount: number,
 *     diceSides: number,
 *     diceBonus: number,
 *   },
 *   effects: [                     // 子效果数组，支持多种类型同时生效
 *     { id: string, type: 'spell',      value: containedSpellSub },
 *     { id: string, type: 'ability',    value: { text: string, uses: number, ... } },
 *     { id: string, type: 'shield',     value: { amount: number } },
 *     { id: string, type: 'temp_buff',  value: { buffName: string, modules: [] } },
 *     { id: string, type: 'creature_transform', value: { creatureId: string, ... } },
 *     { id: string, type: 'restore_spell_slots', value: { ringLevel: number, ... } },
 *     { id: string, type: 'summon',     value: { preset: string, creatureId: string, ... } },
 *     { id: string, type: 'custom_logic', value: { title: string, description: string, triggerCondition: string } },
 *   ]
 * }
 */

import { createEmptyContainedSpellSub } from './containedSpellModel'

export const ACTION_COST_OPTIONS = [
  { value: 'action', label: '动作' },
  { value: 'bonus', label: '附赠' },
  { value: 'reaction', label: '反应' },
  { value: 'none', label: '无' },
  { value: 'movement', label: '移速' },
]

export const RECOVERY_METHODS = [
  { value: 'short_rest', label: '短休恢复' },
  { value: 'long_rest', label: '长休恢复' },
  { value: 'dawn', label: '黎明恢复' },
  { value: 'none', label: '无法恢复' },
  { value: 'absorb_energy', label: '吸收能量' },
  { value: 'reaction_absorb', label: '反应吸收' },
]

export const RECOVERY_AMOUNT_OPTIONS = [
  { value: 'full', label: '回满' },
  { value: 'fixed', label: '固定值' },
  { value: 'dice', label: '掷骰' },
]

/** 消耗资源类型选项：充能数 + 职业资源 + 法术位 */
export const RESOURCE_TYPE_OPTIONS = [
  { value: 'none', label: '无消耗' },
  { value: 'charges', label: '充能数' },
  { value: 'rage', label: '狂暴次数' },
  { value: 'bardic_inspiration', label: '吟游诗人激励' },
  { value: 'channel_divinity', label: '引导神力' },
  { value: 'wild_shape', label: '荒野变形次数' },
  { value: 'second_wind', label: '回气' },
  { value: 'action_surge', label: '动作如潮' },
  { value: 'indomitable', label: '不屈' },
  { value: 'superiority_dice', label: '卓越骰' },
  { value: 'ki', label: '气点' },
  { value: 'lay_on_hands', label: '圣疗池' },
  { value: 'paladin_channel_divinity', label: '圣武士引导神力' },
  { value: 'sneak_attack_dice', label: '诡诈打击骰' },
  { value: 'lucky_strike', label: '幸运一击' },
  { value: 'lucky_points', label: '幸运点' },
  { value: 'sorcery_points', label: '术法点' },
  { value: 'arcane_recovery', label: '奥术回想' },
  { value: 'invocations', label: '魔能祈唤' },
  { value: 'anima_points', label: '魂力点' },
  { value: 'wild_impulse', label: '狂野冲动' },
  { value: 'focus_points', label: '专注点' },
  { value: 'artifact_sorcery', label: '器魂术法点' },
  { value: 'blade_channel_divinity', label: '圣魂之刃引导神力' },
  { value: 'arcane_fury', label: '奥术之怒' },
  { value: 'martial_rage', label: '天诛之剑怒气' },
  { value: 'shadow_summon', label: '召影' },
  { value: 'star_points', label: '星辰点' },
  { value: 'spell_slot_1', label: '一环法术位' },
  { value: 'spell_slot_2', label: '二环法术位' },
  { value: 'spell_slot_3', label: '三环法术位' },
  { value: 'spell_slot_4', label: '四环法术位' },
  { value: 'spell_slot_5', label: '五环法术位' },
  { value: 'spell_slot_6', label: '六环法术位' },
  { value: 'spell_slot_7', label: '七环法术位' },
  { value: 'spell_slot_8', label: '八环法术位' },
  { value: 'spell_slot_9', label: '九环法术位' },
]

/** 不需要回能数量设置的方式 */
const NO_AMOUNT_METHODS = new Set(['none'])
/** 仅支持掷的方式 */
const DICE_ONLY_METHODS = new Set(['absorb_energy', 'reaction_absorb'])

export function createEmptyChargeItemValue(overrides = {}) {
  return {
    resourceType: 'charges',
    charges: 1,
    actionCost: 'action',
    movementFeet: 0,
    recovery: { method: 'long_rest', kind: 'full', fixed: 1, diceCount: 1, diceSides: 6, diceBonus: 0 },
    effects: [],
    ...overrides,
  }
}

let _nextId = 1
function genId() {
  return 'ce_' + Date.now().toString(36) + '_' + (_nextId++).toString(36)
}

export function createChargeEffectEntry(type, overrides = {}) {
  const id = genId()
  if (type === 'spell') {
    return { id, type, value: { ...createEmptyContainedSpellSub(), scalingEnabled: false, scalingPerUnit: { damageDiceCount: 0 } }, ...overrides }
  }
  if (type === 'ability') {
    return { id, type, value: { text: '', uses: 1, diceCount: 0, diceSides: 10, abilityMod: '', resultType: 'heal', scalingEnabled: false, scalingPerUnit: { diceCount: 0, flatBonus: 0 } }, ...overrides }
  }
  if (type === 'shield') {
    return { id, type, value: { amount: 1, scalingEnabled: false, scalingPerUnit: { amount: 0 } }, ...overrides }
  }
  if (type === 'temp_buff') {
    return { id, type, value: { buffName: '', modules: [] }, ...overrides }
  }
  if (type === 'creature_transform') {
    return { id, type, value: { creatureId: '', acMode: 'replace', acFormulaBase: 13, acFormulaAbility: '', hpMode: 'replace', hpFormula: null, keepAbilities: [], resourceCostType: '', resourceCostValue: 1, wildShapeMode: false, wildShapeSubclass: 'regular' }, ...overrides }
  }
  if (type === 'restore_spell_slots') {
    return { id, type, value: { mode: 'single', ringLevel: 1, costPerSlot: 1, slots: [{ ringLevel: 1, cost: 1 }], scalingEnabled: false, scalingPerUnit: { slotsCount: 0 } }, ...overrides }
  }
  if (type === 'summon') {
    return { id, type, value: { preset: '', creatureId: '', sourceType: 'library', costType: '', costAmount: 0, costDice: '', note: '', scalingEnabled: false, scalingPerUnit: { creatureCount: 0 } }, ...overrides }
  }
  if (type === 'custom_logic') {
    return { id, type, value: { title: '', description: '', triggerCondition: 'on_use' }, ...overrides }
  }
  if (type === 'damage') {
    return { id, type, value: { diceCount: 1, diceSides: 6, diceBonus: 0, damageType: 'fire', addWeaponDamage: false }, ...overrides }
  }
  if (type === 'heal') {
    return { id, type, value: { mode: 'dice', diceCount: 1, diceSides: 8, diceBonus: 0 }, ...overrides }
  }
  return { id, type, value: {}, ...overrides }
}

/** 把任意旧 value 归一化为 charge_item 结构 */
export function normalizeChargeItemValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyChargeItemValue()
  }
  // resourceType：旧数据无此字段，默认 'charges'
  const validResourceTypes = RESOURCE_TYPE_OPTIONS.map((o) => o.value)
  const resourceType = validResourceTypes.includes(value.resourceType) ? value.resourceType : 'charges'
  const charges = typeof value.charges === 'number'
    ? Math.max(0, value.charges)
    : (parseInt(value.charges, 10) || 0)
  // actionCost
  const validActionCosts = ACTION_COST_OPTIONS.map((o) => o.value)
  const actionCost = validActionCosts.includes(value.actionCost) ? value.actionCost : 'action'
  const movementFeet = Math.max(0, Number(value.movementFeet) || 0)
  // recovery
  const rec = value.recovery && typeof value.recovery === 'object' ? value.recovery : {}
  const validMethods = RECOVERY_METHODS.map((m) => m.value)
  const method = validMethods.includes(rec.method) ? rec.method : 'long_rest'
  const validKinds = ['full', 'fixed', 'dice']
  const kind = validKinds.includes(rec.kind) ? rec.kind : 'full'
  const recovery = {
    method,
    kind: NO_AMOUNT_METHODS.has(method) ? 'full' : (DICE_ONLY_METHODS.has(method) ? 'dice' : kind),
    fixed: Math.max(0, Number(rec.fixed) || 0),
    diceCount: Math.max(1, Number(rec.diceCount) || 1),
    diceSides: Math.max(1, Number(rec.diceSides) || 6),
    diceBonus: Math.max(0, Number(rec.diceBonus) || 0),
  }
  // effects
  const rawEffects = Array.isArray(value.effects) ? value.effects : []
  const effects = rawEffects.map((e) => {
    if (!e || typeof e !== 'object') return createChargeEffectEntry('spell')
    const type = ['spell', 'ability', 'shield', 'temp_buff', 'creature_transform', 'restore_spell_slots', 'summon', 'custom_logic', 'damage', 'heal'].includes(e.type) ? e.type : 'spell'
    const id = e.id || genId()
    if (type === 'spell') {
      const rawSpellVal = e.value && typeof e.value === 'object' ? e.value : {}
      const spVal = createEmptyContainedSpellSub(rawSpellVal)
      // scaling fields
      const rawSp = rawSpellVal.scalingPerUnit && typeof rawSpellVal.scalingPerUnit === 'object' ? rawSpellVal.scalingPerUnit : {}
      spVal.scalingEnabled = !!rawSpellVal.scalingEnabled
      spVal.scalingPerUnit = { damageDiceCount: Math.max(0, Number(rawSp.damageDiceCount) || 0) }
      return { id, type, value: spVal }
    }
    if (type === 'ability') {
      const av = e.value && typeof e.value === 'object' ? e.value : {}
      const rawSU = av.scalingPerUnit && typeof av.scalingPerUnit === 'object' ? av.scalingPerUnit : {}
      return { id, type, value: {
        text: typeof av.text === 'string' ? av.text : '',
        uses: Math.max(1, Number(av.uses) || 1),
        diceCount: Math.max(0, Number(av.diceCount) || 0),
        diceSides: Math.max(1, Number(av.diceSides) || 10),
        abilityMod: typeof av.abilityMod === 'string' ? av.abilityMod : '',
        resultType: av.resultType === 'damage' ? 'damage' : 'heal',
        scalingEnabled: !!av.scalingEnabled,
        scalingPerUnit: {
          diceCount: Math.max(0, Number(rawSU.diceCount) || 0),
          flatBonus: Math.max(0, Number(rawSU.flatBonus) || 0),
        },
      } }
    }
    if (type === 'shield') {
      const sv = e.value && typeof e.value === 'object' ? e.value : {}
      const rawSU = sv.scalingPerUnit && typeof sv.scalingPerUnit === 'object' ? sv.scalingPerUnit : {}
      return { id, type, value: {
        amount: Math.max(1, Number(sv.amount) || 1),
        scalingEnabled: !!sv.scalingEnabled,
        scalingPerUnit: {
          amount: Math.max(0, Number(rawSU.amount) || 0),
        },
      } }
    }
    if (type === 'temp_buff') {
      const tv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        buffName: typeof tv.buffName === 'string' ? tv.buffName : '',
        modules: Array.isArray(tv.modules) ? tv.modules.map((m) => ({ ...m })) : [],
      } }
    }
    if (type === 'creature_transform') {
      const cv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        creatureId: String(cv.creatureId || ''),
        acMode: ['replace', 'add', 'max_formula'].includes(cv.acMode) ? cv.acMode : 'replace',
        acFormulaBase: Number(cv.acFormulaBase) || 13,
        acFormulaAbility: ['dex', 'wis', 'con', 'str', 'int', 'cha'].includes(cv.acFormulaAbility) ? cv.acFormulaAbility : '',
        hpMode: ['replace', 'add', 'keep_plus_temp'].includes(cv.hpMode) ? cv.hpMode : 'replace',
        hpFormula: cv.hpFormula && typeof cv.hpFormula === 'object' ? cv.hpFormula : null,
        keepAbilities: Array.isArray(cv.keepAbilities) ? cv.keepAbilities.filter((k) => ['int', 'wis', 'cha'].includes(k)) : [],
        resourceCostType: ['', 'wild_shape_uses', 'spell_slot', 'charges'].includes(cv.resourceCostType) ? cv.resourceCostType : '',
        resourceCostValue: Number(cv.resourceCostValue) || 1,
        wildShapeMode: !!cv.wildShapeMode,
        wildShapeSubclass: cv.wildShapeSubclass === 'moon' ? 'moon' : 'regular',
      } }
    }
    if (type === 'restore_spell_slots') {
      const rv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        mode: rv.mode === 'multi' ? 'multi' : 'single',
        ringLevel: Math.max(1, Math.min(9, Number(rv.ringLevel) || 1)),
        costPerSlot: Math.max(1, Number(rv.costPerSlot) || 1),
        maxRing: Math.max(1, Math.min(9, Number(rv.maxRing) || 3)),
        cost: Math.max(1, Number(rv.cost) || 1),
        slots: Array.isArray(rv.slots) ? rv.slots.map((s) => ({
          ringLevel: Math.max(1, Math.min(9, Number(s?.ringLevel) || 1)),
          cost: Math.max(1, Number(s?.cost) || 1),
        })) : [{ ringLevel: 1, cost: 1 }],
      } }
    }
    if (type === 'summon') {
      const sv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        preset: sv.preset === 'stellar_double' ? 'stellar_double' : '',
        creatureId: String(sv.creatureId || ''),
        sourceType: sv.sourceType === 'attached_card' ? 'attached_card' : 'library',
        costType: ['', 'gold', 'hp'].includes(sv.costType) ? sv.costType : '',
        costAmount: Math.max(0, Number(sv.costAmount) || 0),
        costDice: typeof sv.costDice === 'string' ? sv.costDice : '',
        note: typeof sv.note === 'string' ? sv.note : '',
      } }
    }
    if (type === 'custom_logic') {
      const clv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        title: typeof clv.title === 'string' ? clv.title : '',
        description: typeof clv.description === 'string' ? clv.description : '',
        triggerCondition: ['on_use', 'on_turn_start', 'on_damage_taken', 'on_save_failed'].includes(clv.triggerCondition) ? clv.triggerCondition : 'on_use',
      } }
    }
    if (type === 'damage') {
      const dv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        diceCount: Math.max(1, Number(dv.diceCount) || 1),
        diceSides: [4, 6, 8, 10, 12, 20].includes(Number(dv.diceSides)) ? Number(dv.diceSides) : 6,
        diceBonus: Number(dv.diceBonus) || 0,
        damageType: typeof dv.damageType === 'string' ? dv.damageType : 'fire',
        addWeaponDamage: !!dv.addWeaponDamage,
      } }
    }
    if (type === 'heal') {
      const hv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, value: {
        mode: hv.mode === 'max' ? 'max' : 'dice',
        diceCount: Math.max(1, Number(hv.diceCount) || 1),
        diceSides: [4, 6, 8, 10, 12, 20].includes(Number(hv.diceSides)) ? Number(hv.diceSides) : 8,
        diceBonus: Number(hv.diceBonus) || 0,
      } }
    }
    return { id, type, value: {} }
  })
  return { resourceType, charges, actionCost, movementFeet, recovery, effects }
}

/** 回能方式是否支持自定义回能数量 */
export function recoverySupportsAmount(method) {
  return !NO_AMOUNT_METHODS.has(method)
}

/** 回能方式是否仅支持掷骰 */
export function recoveryIsDiceOnly(method) {
  return DICE_ONLY_METHODS.has(method)
}

/** 获取回能方式显示标签 */
export function getRecoveryMethodLabel(method) {
  return RECOVERY_METHODS.find((m) => m.value === method)?.label ?? method
}

/** 格式化回能描述 */
export function formatRecoveryBrief(recovery) {
  if (!recovery || typeof recovery !== 'object') return ''
  const methodLabel = getRecoveryMethodLabel(recovery.method)
  if (recovery.method === 'none') return methodLabel
  if (recovery.kind === 'full') return `${methodLabel}（回满）`
  if (recovery.kind === 'dice') {
    const bonus = Number(recovery.diceBonus) || 0
    const diceText = `${recovery.diceCount}d${recovery.diceSides}`
    return bonus > 0 ? `${methodLabel} ${diceText}+${bonus}` : `${methodLabel} ${diceText}`
  }
  return `${methodLabel} ${recovery.fixed}`
}

/** 格式化充能物品整体摘要 */
export function formatChargeItemBrief(value) {
  const norm = normalizeChargeItemValue(value)
  const parts = []
  if (norm.resourceType === 'none') {
    // 无消耗，不显示充能信息
  } else if (norm.resourceType === 'charges') {
    parts.push(`${norm.charges} 充能`)
    parts.push(formatRecoveryBrief(norm.recovery))
  } else {
    const resLabel = RESOURCE_TYPE_OPTIONS.find((o) => o.value === norm.resourceType)?.label ?? norm.resourceType
    parts.push(`消耗：${resLabel}`)
  }
  if (norm.effects.length > 0) {
    const effectLabels = []
    const spellCount = norm.effects.filter((e) => e.type === 'spell').length
    const abilityCount = norm.effects.filter((e) => e.type === 'ability').length
    const shieldCount = norm.effects.filter((e) => e.type === 'shield').length
    if (spellCount > 0) effectLabels.push(`内含${spellCount}个法术`)
    if (abilityCount > 0) {
      norm.effects.filter((e) => e.type === 'ability').forEach((e) => {
        const text = (e.value?.text || '').trim() || '(奇能)'
        effectLabels.push(`${text} ×${e.value?.uses ?? 1}`)
      })
    }
    const tempBuffCount = norm.effects.filter((e) => e.type === 'temp_buff').length
    if (tempBuffCount > 0) {
      norm.effects.filter((e) => e.type === 'temp_buff').forEach((e) => {
        const name = (e.value?.buffName || '').trim() || '(临时BUFF)'
        const modCount = e.value?.modules?.length ?? 0
        effectLabels.push(`${name}（${modCount}个效果）`)
      })
    }
    if (shieldCount > 0) effectLabels.push(`护盾 ×${norm.effects.find((e) => e.type === 'shield').value?.amount ?? 1}`)
    const ctCount = norm.effects.filter((e) => e.type === 'creature_transform').length
    if (ctCount > 0) effectLabels.push(`变身 ×${ctCount}`)
    const rssCount = norm.effects.filter((e) => e.type === 'restore_spell_slots').length
    if (rssCount > 0) effectLabels.push(`法术位恢复 ×${rssCount}`)
    const dmgEffects = norm.effects.filter((e) => e.type === 'damage')
    if (dmgEffects.length > 0) {
      dmgEffects.forEach((e) => {
        const v = e.value || {}
        const dice = `${v.diceCount || 1}d${v.diceSides || 6}${v.diceBonus ? '+' + v.diceBonus : ''}`
        const typeLabel = v.damageType || 'fire'
        const scale = v.scaleWithSlot ? '（按环位缩放）' : ''
        effectLabels.push(`伤害 ${dice} ${typeLabel}${scale}`)
      })
    }
    const healEffects = norm.effects.filter((e) => e.type === 'heal')
    if (healEffects.length > 0) {
      healEffects.forEach((e) => {
        const v = e.value || {}
        if (v.mode === 'max') {
          effectLabels.push(`满疗`)
        } else {
          const dice = `${v.diceCount || 1}d${v.diceSides || 8}${v.diceBonus ? '+' + v.diceBonus : ''}`
          const scale = v.scaleWithSlot ? '（按环位缩放）' : ''
          effectLabels.push(`治疗 ${dice}${scale}`)
        }
      })
    }
    const summonCount = norm.effects.filter((e) => e.type === 'summon').length
    if (summonCount > 0) effectLabels.push(`召唤 ×${summonCount}`)
    const clCount = norm.effects.filter((e) => e.type === 'custom_logic').length
    if (clCount > 0) effectLabels.push(`自定义逻辑 ×${clCount}`)
    if (effectLabels.length) parts.push(effectLabels.join('；'))
  }
  return parts.join(' | ')
}

/** 属性名 → 中文标签（用于下拉显示） */
export const ABILITY_MOD_OPTIONS = [
  { value: '', label: '无修正' },
  { value: 'str', label: '力量' },
  { value: 'dex', label: '敏捷' },
  { value: 'con', label: '体质' },
  { value: 'int', label: '智力' },
  { value: 'wis', label: '感知' },
  { value: 'cha', label: '魅力' },
]

/** 职业等级修正：按角色主职业取等级 */
export const CLASS_LEVEL_MOD_OPTIONS = [
  { value: 'class_level', label: '职业等级' },
]

/** 所有可用的修正选项（属性 + 职业等级） */
export const ALL_MOD_OPTIONS = [
  { value: '', label: '无修正' },
  { value: 'str', label: '力量修正' },
  { value: 'dex', label: '敏捷修正' },
  { value: 'con', label: '体质修正' },
  { value: 'int', label: '智力修正' },
  { value: 'wis', label: '感知修正' },
  { value: 'cha', label: '魅力修正' },
  { value: 'class_level', label: '职业等级' },
]

export const RESULT_TYPE_OPTIONS = [
  { value: 'heal', label: '回血' },
  { value: 'damage', label: '伤害' },
]

/** 自定义逻辑触发条件选项 */
export const CUSTOM_LOGIC_TRIGGER_OPTIONS = [
  { value: 'on_use', label: '使用时触发' },
  { value: 'on_turn_start', label: '回合开始时' },
  { value: 'on_damage_taken', label: '受到伤害时' },
  { value: 'on_save_failed', label: '豁免失败时' },
]

/**
 * 解析 abilityMod 为数值
 * @param {string} abilityMod - '' | 'str' | 'dex' | ... | 'class_level'
 * @param {object} character - 角色数据
 * @returns {number} 修正值
 */
export function resolveAbilityMod(abilityMod, character) {
  if (!abilityMod || !character) return 0
  if (abilityMod === 'class_level') {
    return Math.max(0, Number(character.classLevel) || 0)
  }
  // 属性修正：abilityModifier 从 formulas.js 导入
  const score = character?.abilities?.[abilityMod] ?? 10
  return Math.floor((score - 10) / 2)
}

/**
 * 构建骰子表达式字符串
 * @param {object} abilityValue - ability 效果值
 * @param {object} character - 角色数据（用于解析修正值）
 * @returns {{ expr: string, mod: number }} expr 如 "2d10+5"，mod 为修正数值
 */
export function buildAbilityDiceExpr(abilityValue, character) {
  const count = abilityValue?.diceCount ?? 0
  const sides = abilityValue?.diceSides ?? 10
  const mod = resolveAbilityMod(abilityValue?.abilityMod, character)
  if (count <= 0) return { expr: '', mod }
  let expr = `${count}d${sides}`
  if (mod > 0) expr += `+${mod}`
  else if (mod < 0) expr += `${mod}`
  return { expr, mod }
}

/**
 * 计算缩放后的效果数值
 * @param {object} effectValue - 效果值（ability/spell/shield 的 value）
 * @param {number} amount - 消耗资源数量（≥1）
 * @returns {object} 缩放后的数值
 */
export function computeScaledEffect(effectValue, amount) {
  const amt = Math.max(1, Math.floor(Number(amount) || 1))
  const extra = amt - 1 // 基础 1 单位不叠加
  const scaling = effectValue?.scalingEnabled ? (effectValue?.scalingPerUnit || {}) : {}

  // ability
  if (effectValue && 'diceCount' in effectValue && 'resultType' in effectValue) {
    const baseDice = Math.max(0, Number(effectValue.diceCount) || 0)
    const perUnitDice = Math.max(0, Number(scaling.diceCount) || 0)
    const flatBonus = Math.max(0, Number(scaling.flatBonus) || 0)
    return {
      diceCount: baseDice + perUnitDice * extra,
      flatBonus: flatBonus * extra,
    }
  }
  // spell
  if (effectValue && 'damageDiceCount' in effectValue && 'hitResolution' in effectValue) {
    const baseDmgDice = Math.max(0, Number(effectValue.damageDiceCount) || 0)
    const perUnitDmgDice = Math.max(0, Number(scaling.damageDiceCount) || 0)
    return {
      damageDiceCount: baseDmgDice + perUnitDmgDice * extra,
    }
  }
  // shield
  if (effectValue && 'amount' in effectValue && !('diceCount' in effectValue)) {
    const baseAmount = Math.max(1, Number(effectValue.amount) || 1)
    const perUnitAmount = Math.max(0, Number(scaling.amount) || 0)
    return {
      amount: baseAmount + perUnitAmount * extra,
    }
  }
  // restore_spell_slots
  if (effectValue && 'ringLevel' in effectValue && 'costPerSlot' in effectValue) {
    const baseSlots = 1
    const perUnitSlots = Math.max(0, Number(scaling.slotsCount) || 0)
    return {
      slotsCount: baseSlots + perUnitSlots * extra,
    }
  }
  // summon
  if (effectValue && 'creatureId' in effectValue && 'sourceType' in effectValue) {
    const baseCount = 1
    const perUnitCount = Math.max(0, Number(scaling.creatureCount) || 0)
    return {
      creatureCount: baseCount + perUnitCount * extra,
    }
  }
  return {}
}

/**
 * 获取资源可用上限（用于确认弹窗的数量选择器）
 * @param {object} norm - normalizeChargeItemValue 的结果
 * @param {object} char - 角色数据
 * @returns {number} 可用上限
 */
export function getMaxSpendableAmount(norm, char) {
  if (!norm || !char) return 1
  if (norm.resourceType === 'none') return 1
  if (norm.resourceType === 'charges') {
    return Math.max(1, Math.floor(Number(norm.charges) || 1))
  }
  // 法术位资源
  if (/^spell_slot_[1-9]$/.test(norm.resourceType)) {
    const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
    return Math.max(1, Math.floor(Number(char.spellSlots?.[ring]) || 0))
  }
  const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
  return res ? Math.max(1, Math.floor(Number(res.current) || 0)) : 1
}
