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
 *     { id: string, type: 'consume_spell_slot_to_restore_charges', value: { slotLevel: number, restoreAmount: number } },
 *   ]
 * }
 */

import { createEmptyContainedSpellSub } from './containedSpellModel'
import { getDamageTypeLabel } from '../data/buffTypes'
import { isFormulaValue, formatFormulaLabel, evaluateBuffValue } from './formulas'

/* ── 随机库（random_table）常量 ── */
export const DICE_TYPE_OPTIONS = [
  { value: 'd4', label: 'D4' },
  { value: 'd6', label: 'D6' },
  { value: 'd8', label: 'D8' },
  { value: 'd10', label: 'D10' },
  { value: 'd12', label: 'D12' },
  { value: 'd20', label: 'D20' },
  { value: 'd100', label: 'D100' },
]

export const POKER_SUITS = ['hearts', 'diamonds', 'clubs', 'spades']
export const POKER_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const POKER_JOKERS = ['big_joker', 'small_joker']

export const POKER_SUIT_LABELS = {
  hearts: '红桃', diamonds: '方块', clubs: '梅花', spades: '黑桃',
}
export const POKER_SUIT_SYMBOLS = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
}
export const POKER_SUIT_COLORS = {
  hearts: 'text-red-400', diamonds: 'text-red-400', clubs: 'text-gray-300', spades: 'text-gray-300',
}

export const RANDOM_MATCH_OPTIONS = [
  { value: 'suit', label: '按花色' },
  { value: 'rank', label: '按点数' },
  { value: 'both', label: '组合' },
  { value: 'any', label: '兜底' },
]

let _rtId = 1
function genRtId() {
  return 'rte_' + Date.now().toString(36) + '_' + (_rtId++).toString(36)
}

export function createEmptyRandomTableEntry(mode) {
  const id = genRtId()
  if (mode === 'poker') {
    return { id, matchType: 'any', suits: [], ranks: [], effects: [] }
  }
  return { id, min: 1, max: 1, effects: [] }
}

/** 获取骰子类型的最大值 */
export function getDiceMax(diceType) {
  const map = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 }
  return map[diceType] || 6
}

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
  { value: 'spell_slot', label: '法术位' },
  // ── 以下旧值保留供已有数据迁移，不在下拉中显示（normalizeChargeItemValue 会转成 spell_slot + consumptionMode）──
  { value: 'spell_slot_1', label: '一环法术位', legacy: true },
  { value: 'spell_slot_2', label: '二环法术位', legacy: true },
  { value: 'spell_slot_3', label: '三环法术位', legacy: true },
  { value: 'spell_slot_4', label: '四环法术位', legacy: true },
  { value: 'spell_slot_5', label: '五环法术位', legacy: true },
  { value: 'spell_slot_6', label: '六环法术位', legacy: true },
  { value: 'spell_slot_7', label: '七环法术位', legacy: true },
  { value: 'spell_slot_8', label: '八环法术位', legacy: true },
  { value: 'spell_slot_9', label: '九环法术位', legacy: true },
  { value: 'spell_slot_free', label: '法术位（自由消耗）', legacy: true },
]

/** 下拉可选的消耗资源（排除已迁移的旧法术位表示） */
export const SELECTABLE_RESOURCE_TYPE_OPTIONS = RESOURCE_TYPE_OPTIONS.filter((o) => !o.legacy)

/** 环位序号 → 中文 */
const RING_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 是否为法术位类资源（含旧表示） */
export function isSpellSlotResourceType(resourceType) {
  return resourceType === 'spell_slot' || /^spell_slot_([1-9]|free)$/.test(resourceType)
}

/** 归一化后的 value 是否为「法术位 · 自由消耗」 */
export function isFreeSlotConsumption(norm) {
  return norm?.resourceType === 'spell_slot' && norm?.consumptionMode === 'free'
}

/** 归一化后的 value 是否为「法术位 · 固定消耗」 */
export function isFixedSlotConsumption(norm) {
  return norm?.resourceType === 'spell_slot' && norm?.consumptionMode === 'fixed'
}

/** 消耗资源的显示标签（法术位会带上环位/自由区间） */
export function getResourceLabel(norm) {
  if (!norm) return ''
  if (norm.resourceType === 'spell_slot') {
    return norm.consumptionMode === 'free'
      ? `法术位（自由 1-${norm.maxSlotLevel}环）`
      : `${RING_CN[norm.slotLevel] || norm.slotLevel}环法术位`
  }
  return RESOURCE_TYPE_OPTIONS.find((o) => o.value === norm.resourceType)?.label ?? norm.resourceType
}

/** 不需要回能数量设置的方式 */
const NO_AMOUNT_METHODS = new Set(['none'])
/** 仅支持掷的方式 */
const DICE_ONLY_METHODS = new Set(['absorb_energy', 'reaction_absorb'])

export function createEmptyChargeItemValue(overrides = {}) {
  return {
    resourceType: 'charges',
    consumptionMode: 'fixed', // 'fixed' | 'free' - 固定消耗或自由消耗（仅 resourceType === 'spell_slot' 时有意义）
    slotLevel: 1, // 固定消耗模式下消耗的环位 (1-9)
    maxSlotLevel: 1, // 自由消耗模式下的最大环位 (1-9)
    charges: 1,
    actionCost: 'action',
    movementFeet: 0,
    recovery: { method: 'long_rest', kind: 'full', fixed: 1, diceCount: 1, diceSides: 6, diceBonus: 0 },
    effects: [],
    isStance: false,
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
    return { id, type, applyMultiplier: true, value: { ...createEmptyContainedSpellSub(), scalingEnabled: false, scalingPerUnit: { damageDiceCount: 0 } }, ...overrides }
  }
  if (type === 'ability') {
    return { id, type, applyMultiplier: true, value: { text: '', uses: 1, diceCount: 0, diceSides: 10, abilityMod: '', resultType: 'heal', scalingEnabled: false, scalingPerUnit: { diceCount: 0, flatBonus: 0 } }, ...overrides }
  }
  if (type === 'shield') {
    return { id, type, applyMultiplier: true, value: { amount: 1, scalingEnabled: false, scalingPerUnit: { amount: 0 } }, ...overrides }
  }
  if (type === 'temp_buff') {
    return { id, type, applyMultiplier: true, value: { buffName: '', modules: [] }, ...overrides }
  }
  if (type === 'creature_transform') {
    return { id, type, applyMultiplier: false, value: { creatureId: '', acMode: 'replace', acFormulaBase: 13, acFormulaAbility: '', hpMode: 'replace', hpFormula: null, keepAbilities: [], resourceCostType: '', resourceCostValue: 1, wildShapeMode: false, wildShapeSubclass: 'regular' }, ...overrides }
  }
  if (type === 'restore_spell_slots') {
    return { id, type, applyMultiplier: false, value: { mode: 'single', ringLevel: 1, costPerSlot: 1, slots: [{ ringLevel: 1, cost: 1 }], scalingEnabled: false, scalingPerUnit: { slotsCount: 0 } }, ...overrides }
  }
  if (type === 'summon') {
    return { id, type, applyMultiplier: false, value: { preset: '', creatureId: '', sourceType: 'library', costType: '', costAmount: 0, costDice: '', note: '', scalingEnabled: false, scalingPerUnit: { creatureCount: 0 } }, ...overrides }
  }
  if (type === 'custom_logic') {
    return { id, type, applyMultiplier: false, value: { title: '', description: '', triggerCondition: 'on_use' }, ...overrides }
  }
  if (type === 'consume_spell_slot_to_restore_charges') {
    return { id, type, applyMultiplier: false, value: { slotLevel: 2, restoreAmount: 1 }, ...overrides }
  }
  if (type === 'damage') {
    return { id, type, applyMultiplier: true, value: { diceCount: 1, diceSides: 6, diceBonus: 0, damageType: 'fire', addWeaponDamage: false }, ...overrides }
  }
  if (type === 'heal') {
    return { id, type, applyMultiplier: true, value: { mode: 'dice', diceCount: 1, diceSides: 8, diceBonus: 0 }, ...overrides }
  }
  if (type === 'attack_buff') {
    return { id, type, applyMultiplier: true, value: { hitBonusPerUnit: 0, damageBonusPerUnit: 0, extraDicePerUnit: 0, diceSides: 10, damageType: 'fire' }, ...overrides }
  }
  if (type === 'random_table') {
    return { id, type, applyMultiplier: false, value: { mode: 'dice', diceType: 'd6', includeJokers: false, entries: [] }, ...overrides }
  }
  return { id, type, applyMultiplier: true, value: {}, ...overrides }
}

/** 把任意旧 value 归一化为 charge_item 结构 */
export function normalizeChargeItemValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyChargeItemValue()
  }
  // resourceType：旧数据无此字段，默认 'charges'
  const validResourceTypes = RESOURCE_TYPE_OPTIONS.map((o) => o.value)
  let resourceType = validResourceTypes.includes(value.resourceType) ? value.resourceType : 'charges'
  // consumptionMode: 'fixed' | 'free'
  let consumptionMode = value.consumptionMode === 'free' ? 'free' : 'fixed'
  // slotLevel: 固定消耗模式下消耗的环位 (1-9)
  let slotLevel = Math.max(1, Math.min(9, Number(value.slotLevel) || 1))
  // maxSlotLevel: 自由消耗模式下的最大环位 (1-9)
  const maxSlotLevel = Math.max(1, Math.min(9, Number(value.maxSlotLevel) || 1))
  // 迁移旧法术位表示：spell_slot_N → 固定消耗 N 环；spell_slot_free → 自由消耗
  const legacyRing = /^spell_slot_([1-9])$/.exec(resourceType)
  if (legacyRing) {
    resourceType = 'spell_slot'
    consumptionMode = 'fixed'
    slotLevel = Number(legacyRing[1])
  } else if (resourceType === 'spell_slot_free') {
    resourceType = 'spell_slot'
    consumptionMode = 'free'
  }
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
    const type = ['spell', 'ability', 'shield', 'temp_buff', 'creature_transform', 'restore_spell_slots', 'summon', 'custom_logic', 'damage', 'heal', 'random_table', 'attack_buff'].includes(e.type) ? e.type : 'spell'
    const id = e.id || genId()
    if (type === 'spell') {
      const rawSpellVal = e.value && typeof e.value === 'object' ? e.value : {}
      const spVal = createEmptyContainedSpellSub(rawSpellVal)
      // scaling fields
      const rawSp = rawSpellVal.scalingPerUnit && typeof rawSpellVal.scalingPerUnit === 'object' ? rawSpellVal.scalingPerUnit : {}
      spVal.scalingEnabled = !!rawSpellVal.scalingEnabled
      spVal.scalingPerUnit = { damageDiceCount: Math.max(0, Number(rawSp.damageDiceCount) || 0) }
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: spVal }
    }
    if (type === 'ability') {
      const av = e.value && typeof e.value === 'object' ? e.value : {}
      const rawSU = av.scalingPerUnit && typeof av.scalingPerUnit === 'object' ? av.scalingPerUnit : {}
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {
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
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {
        amount: Math.max(1, Number(sv.amount) || 1),
        scalingEnabled: !!sv.scalingEnabled,
        scalingPerUnit: {
          amount: Math.max(0, Number(rawSU.amount) || 0),
        },
      } }
    }
    if (type === 'temp_buff') {
      const tv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {
        buffName: typeof tv.buffName === 'string' ? tv.buffName : '',
        duration: tv.duration ?? null,
        // 模块级 applyMultiplier：自由消耗时该模块数值是否乘以消耗环位（缺省视为乘）
        modules: Array.isArray(tv.modules)
          ? tv.modules.map((m) => ({ ...m, applyMultiplier: m?.applyMultiplier !== false }))
          : [],
      } }
    }
    if (type === 'creature_transform') {
      const cv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier === true, value: {
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
      const rawSU = rv.scalingPerUnit && typeof rv.scalingPerUnit === 'object' ? rv.scalingPerUnit : {}
      return { id, type, applyMultiplier: e.applyMultiplier === true, value: {
        mode: rv.mode === 'multi' ? 'multi' : 'single',
        ringLevel: Math.max(1, Math.min(9, Number(rv.ringLevel) || 1)),
        costPerSlot: Math.max(1, Number(rv.costPerSlot) || 1),
        maxRing: Math.max(1, Math.min(9, Number(rv.maxRing) || 3)),
        cost: Math.max(1, Number(rv.cost) || 1),
        singleCostRing: Math.max(1, Math.min(9, Number(rv.singleCostRing) || Number(rv.maxRing) || 3)),
        slots: Array.isArray(rv.slots) ? rv.slots.map((s) => ({
          ringLevel: Math.max(1, Math.min(9, Number(s?.ringLevel) || 1)),
          cost: Math.max(1, Number(s?.cost) || 1),
        })) : [{ ringLevel: 1, cost: 1 }],
        scalingEnabled: !!rv.scalingEnabled,
        scalingPerUnit: { slotsCount: Math.max(0, Number(rawSU.slotsCount) || 0) },
      } }
    }
    if (type === 'summon') {
      const sv = e.value && typeof e.value === 'object' ? e.value : {}
      const rawSU = sv.scalingPerUnit && typeof sv.scalingPerUnit === 'object' ? sv.scalingPerUnit : {}
      return { id, type, applyMultiplier: e.applyMultiplier === true, value: {
        preset: sv.preset === 'stellar_double' ? 'stellar_double' : '',
        creatureId: String(sv.creatureId || ''),
        sourceType: sv.sourceType === 'attached_card' ? 'attached_card' : 'library',
        costType: ['', 'gold', 'hp'].includes(sv.costType) ? sv.costType : '',
        costAmount: Math.max(0, Number(sv.costAmount) || 0),
        costDice: typeof sv.costDice === 'string' ? sv.costDice : '',
        note: typeof sv.note === 'string' ? sv.note : '',
        scalingEnabled: !!sv.scalingEnabled,
        scalingPerUnit: { creatureCount: Math.max(0, Number(rawSU.creatureCount) || 0) },
      } }
    }
    if (type === 'custom_logic') {
      const clv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier === true, value: {
        title: typeof clv.title === 'string' ? clv.title : '',
        description: typeof clv.description === 'string' ? clv.description : '',
        triggerCondition: ['on_use', 'on_turn_start', 'on_damage_taken', 'on_save_failed'].includes(clv.triggerCondition) ? clv.triggerCondition : 'on_use',
        damageDiceCount: Math.max(0, Number(clv.damageDiceCount) || 0),
        damageDiceSides: Math.max(1, Number(clv.damageDiceSides) || 6),
      } }
    }
    if (type === 'consume_spell_slot_to_restore_charges') {
      const csv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: false, value: {
        slotLevel: Math.max(1, Math.min(9, Number(csv.slotLevel) || 2)),
        restoreAmount: Math.max(1, Number(csv.restoreAmount) || 1),
      } }
    }
    if (type === 'damage') {
      const dv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {
        diceCount: Math.max(1, Number(dv.diceCount) || 1),
        diceSides: [4, 6, 8, 10, 12, 20].includes(Number(dv.diceSides)) ? Number(dv.diceSides) : 6,
        diceBonus: isFormulaValue(dv.diceBonus) ? dv.diceBonus : (Number(dv.diceBonus) || 0),
        damageType: typeof dv.damageType === 'string' ? dv.damageType : 'fire',
        addWeaponDamage: !!dv.addWeaponDamage,
      } }
    }
    if (type === 'heal') {
      const hv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {
        mode: hv.mode === 'max' ? 'max' : 'dice',
        diceCount: Math.max(1, Number(hv.diceCount) || 1),
        diceSides: [4, 6, 8, 10, 12, 20].includes(Number(hv.diceSides)) ? Number(hv.diceSides) : 8,
        diceBonus: isFormulaValue(hv.diceBonus) ? hv.diceBonus : (Number(hv.diceBonus) || 0),
      } }
    }
    if (type === 'attack_buff') {
      const av = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {
        hitBonusPerUnit: Math.max(0, Number(av.hitBonusPerUnit) || 0),
        damageBonusPerUnit: Math.max(0, Number(av.damageBonusPerUnit) || 0),
        extraDicePerUnit: Math.max(0, Number(av.extraDicePerUnit) || 0),
        diceSides: [4, 6, 8, 10, 12, 20].includes(Number(av.diceSides)) ? Number(av.diceSides) : 10,
        damageType: typeof av.damageType === 'string' ? av.damageType : 'fire',
      } }
    }
    if (type === 'random_table') {
      const rv = e.value && typeof e.value === 'object' ? e.value : {}
      return { id, type, applyMultiplier: e.applyMultiplier === true, value: {
        mode: rv.mode === 'poker' ? 'poker' : 'dice',
        diceType: ['d4','d6','d8','d10','d12','d20','d100'].includes(rv.diceType) ? rv.diceType : 'd6',
        includeJokers: !!rv.includeJokers,
        entries: Array.isArray(rv.entries) ? rv.entries.map(entry => {
          if (!entry || typeof entry !== 'object') return createEmptyRandomTableEntry('dice')
          const entryId = entry.id || genId()
          if (rv.mode === 'poker') {
            return {
              id: entryId,
              matchType: ['suit','rank','both','any'].includes(entry.matchType) ? entry.matchType : 'any',
              suits: Array.isArray(entry.suits) ? entry.suits.filter(s => POKER_SUITS.includes(s)) : [],
              ranks: Array.isArray(entry.ranks) ? entry.ranks.filter(r => POKER_RANKS.includes(r)) : [],
              effects: Array.isArray(entry.effects) ? entry.effects : [],
            }
          }
          // dice
          return {
            id: entryId,
            min: Math.max(1, Number(entry.min) || 1),
            max: Math.max(1, Number(entry.max) || 1),
            effects: Array.isArray(entry.effects) ? entry.effects : [],
          }
        }) : [],
      } }
    }
    return { id, type, applyMultiplier: e.applyMultiplier !== false, value: {} }
  })
  return { resourceType, consumptionMode, slotLevel, maxSlotLevel, charges, actionCost, movementFeet, recovery, effects, isStance: !!value.isStance }
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
  if (norm.isStance) parts.push('【架势】')
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
        const desc = (e.value?.description || '').trim()
        const name = (e.value?.buffName || '').trim()
        if (desc) effectLabels.push(desc)
        else if (name) effectLabels.push(name)
        else effectLabels.push('临时增益')
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
        let bonusStr = ''
        if (v.diceBonus) {
          if (isFormulaValue(v.diceBonus)) {
            const evalNum = evaluateBuffValue(v.diceBonus)
            const formulaLabel = formatFormulaLabel(v.diceBonus)
            bonusStr = !Number.isNaN(evalNum) ? `+${formulaLabel}（+${evalNum}）` : `+${formulaLabel}`
          } else {
            bonusStr = `+${v.diceBonus}`
          }
        }
        const dice = `${v.diceCount || 1}d${v.diceSides || 6}${bonusStr}`
        const typeLabel = getDamageTypeLabel(v.damageType || 'fire')
        const scale = v.scaleWithSlot ? '（按环位缩放）' : ''
        effectLabels.push(`伤害 ${dice} ${typeLabel}${scale}`)
      })
    }
    const healEffects = norm.effects.filter((e) => e.type === 'heal')
    if (healEffects.length > 0) {
      healEffects.forEach((e) => {
        const v = e.value || {}
        if (v.mode === 'max') {
          effectLabels.push(`生命值恢复至上限`)
        } else {
          let bonusStr = ''
          if (v.diceBonus) {
            if (isFormulaValue(v.diceBonus)) {
              const evalNum = evaluateBuffValue(v.diceBonus)
              const formulaLabel = formatFormulaLabel(v.diceBonus)
              bonusStr = !Number.isNaN(evalNum) ? `+${formulaLabel}（+${evalNum}）` : `+${formulaLabel}`
            } else {
              bonusStr = `+${v.diceBonus}`
            }
          }
          const dice = `${v.diceCount || 1}d${v.diceSides || 8}${bonusStr}`
          const scale = v.scaleWithSlot ? '（按环位缩放）' : ''
          effectLabels.push(`治疗 ${dice}${scale}`)
        }
      })
    }
    const summonCount = norm.effects.filter((e) => e.type === 'summon').length
    if (summonCount > 0) effectLabels.push(`召唤 ×${summonCount}`)
    const clEffects = norm.effects.filter((e) => e.type === 'custom_logic')
    if (clEffects.length > 0) {
      clEffects.forEach((e) => {
        const title = (e.value?.title || '').trim()
        effectLabels.push(title || '特殊能力')
      })
    }
    const rtEffects = norm.effects.filter((e) => e.type === 'random_table')
    if (rtEffects.length > 0) {
      rtEffects.forEach((e) => {
        const rv = e.value || {}
        if (rv.mode === 'poker') {
          effectLabels.push(`扑克牌随机库 (${rv.entries?.length || 0} 条)`)
        } else {
          effectLabels.push(`${(rv.diceType || 'd6').toUpperCase()} 随机库 (${rv.entries?.length || 0} 条)`)
        }
      })
    }
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
export function computeScaledEffect(effectValue, amount, freeMode = false) {
  const amt = Math.max(1, Math.floor(Number(amount) || 1))
  const scaling = effectValue?.scalingEnabled ? (effectValue?.scalingPerUnit || {}) : {}

  // attack_buff: 根据消耗环位动态计算加值
  if (effectValue && 'hitBonusPerUnit' in effectValue && 'damageBonusPerUnit' in effectValue && 'extraDicePerUnit' in effectValue) {
    return {
      hitBonus: (Math.max(0, Number(effectValue.hitBonusPerUnit) || 0)) * amt,
      damageBonus: (Math.max(0, Number(effectValue.damageBonusPerUnit) || 0)) * amt,
      extraDiceCount: (Math.max(0, Number(effectValue.extraDicePerUnit) || 0)) * amt,
      diceSides: effectValue.diceSides || 10,
      damageType: effectValue.damageType || 'fire',
    }
  }

  // 自由消耗模式：最终值 = 基础值 × 消耗环位
  if (freeMode) {
    // ability (骰子/治疗/伤害)
    if (effectValue && 'diceCount' in effectValue && 'resultType' in effectValue) {
      return {
        diceCount: (Math.max(0, Number(effectValue.diceCount) || 0)) * amt,
        flatBonus: (Math.max(0, Number(effectValue.flatBonus ?? effectValue.diceBonus) || 0)) * amt,
      }
    }
    // spell (伤害骰)
    if (effectValue && 'damageDiceCount' in effectValue && 'hitResolution' in effectValue) {
      return {
        damageDiceCount: (Math.max(0, Number(effectValue.damageDiceCount) || 0)) * amt,
      }
    }
    // shield / 通用数值
    if (effectValue && 'amount' in effectValue && !('diceCount' in effectValue)) {
      return {
        amount: (Math.max(1, Number(effectValue.amount) || 1)) * amt,
      }
    }
    return {}
  }

  // 固定消耗模式：原有增量缩放逻辑
  const extra = amt - 1 // 基础 1 单位不叠加

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
  // 自由消耗法术位：最大可选环位 = maxSlotLevel
  if (norm.resourceType === 'spell_slot_free') {
    return Math.max(1, Math.min(9, Number(norm.maxSlotLevel) || 1))
  }
  // 法术位资源
  if (/^spell_slot_[1-9]$/.test(norm.resourceType)) {
    const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
    return Math.max(1, Math.floor(Number(char.spellSlots?.[ring]) || 0))
  }
  const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
  return res ? Math.max(1, Math.floor(Number(res.current) || 0)) : 1
}

/**
 * 架势效果缩放：将 BUFF 模块中的数值按倍率放大
 * @param {Array} modules - temp_buff 的模块数组
 * @param {number} factor - 缩放倍率（环位或消耗数量）
 * @returns {Array} 缩放后的模块副本
 */
export function scaleStanceModules(modules, factor) {
  if (!Array.isArray(modules) || factor <= 1) return Array.isArray(modules) ? modules.map(m => ({ ...m })) : []
  return modules.map((mod) => {
    const effects = Array.isArray(mod.effects)
      ? mod.effects.map((eff) => {
          const v = eff.value && typeof eff.value === 'object' ? { ...eff.value } : {}
          for (const key of Object.keys(v)) {
            if (typeof v[key] === 'number' && key !== 'diceSides') {
              v[key] = v[key] * factor
            }
          }
          return { ...eff, value: v }
        })
      : mod.effects
    return { ...mod, effects }
  })
}
