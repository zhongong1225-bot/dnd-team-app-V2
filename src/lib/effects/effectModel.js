/**
 * 统一被动效果模型 - BUFF 与物品效果共用
 * 与 buffTypes 的 category / effectType 对应，value 形态由具体效果类型决定
 */

/** 效果来源类型 */
export const EFFECT_SOURCE_KIND = {
  BUFF: 'buff',
  ITEM: 'item',
  CLASS_FEATURE: 'classFeature',
  FEAT: 'feat',
  OTHER: 'other',
}

/** 大类（与 buffTypes 的 key 一致） */
export const EFFECT_CATEGORY = {
  ABILITY: 'ability',
  OFFENSE: 'offense',
  DEFENSE: 'defense',
  CUSTOM: 'custom',
  MOBILITY_CASTING: 'mobility_casting',
}

/**
 * 单条效果 - 与 BuffForm / ItemAddForm 当前保存格式一致
 * @typedef {Object} Effect
 * @property {string} category - 效果大类 (ability | offense | defense | custom | mobility_casting)
 * @property {string} effectType - 具体效果 key（如 attack_melee, ac_bonus）
 * @property {number|object|boolean|string|Array} value - 数值或复合值
 * @property {string} [customText] - 自由填写类效果的文案
 */

/**
 * 效果来源 - 一个 BUFF 或一件装备对应一个 Source，下挂多条 Effect
 * @typedef {Object} EffectSource
 * @property {string} id - 唯一 ID
 * @property {string} kind - EFFECT_SOURCE_KIND 之一
 * @property {string} label - 显示名称（如 BUFF 来源名、物品名）
 * @property {boolean} enabled - 是否生效
 * @property {Effect[]} effects - 效果列表
 * @property {string} [duration] - 持续时间（BUFF 用）
 */

/**
 * 创建一条空效果（占位用）
 * @param {string} [category='ability']
 * @param {string} [effectType='attack_melee']
 * @returns {Effect}
 */
export function createEmptyEffect(category = 'ability', effectType = 'ability_score') {
  // ability_score 现在表示「属性熟练调整」，默认值为空对象
  const defaultValue = effectType === 'ability_score' ? {} : 0
  return {
    category: category || 'ability',
    effectType: effectType || 'ability_score',
    value: defaultValue,
    customText: '',
  }
}

/**
 * 判断两条效果是否为同类型（同一 category + effectType）
 */
export function isSameEffectType(a, b) {
  return a && b && a.category === b.category && a.effectType === b.effectType
}
