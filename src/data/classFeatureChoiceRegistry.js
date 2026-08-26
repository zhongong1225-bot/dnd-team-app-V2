/**
 * 职业特性选择注册表
 *
 * 部分职业特性需要玩家做互斥选择（如德鲁伊原初职能：术师 / 卫士）。
 * 选择存储在角色数据 char.classFeatureChoices 中（玩家级别），
 * getBuffsFromClassFeatures 据此生成对应 BUFF 效果。
 *
 * 优先级：DM 配置补丁 > 玩家选择 > 硬编码默认
 */

/**
 * 注册表
 * key = `${sourceClass}|${sourceSubclass || ''}|${featureId}`
 *
 * 每个条目：
 * - label: 选择标题
 * - options: [{ id, label, description, effects }]
 * - getEffects(optionId): 根据选中 id 返回效果数组
 */
export const CLASS_FEATURE_CHOICE_REGISTRY = {

  /* ── 德鲁伊 1 级 原初职能 ───────────────────────────────────────── */
  '德鲁伊||primal_order': {
    label: '原初职能',
    options: [
      {
        id: 'spellschool',
        label: '术师',
        description: '额外1个德鲁伊戏法 / 奥秘和自然+感知调整值',
      },
      {
        id: 'warden',
        label: '卫士',
        description: '军用武器熟练 + 中甲受训',
      },
    ],
    getEffects(optionId) {
      const desc = this.options.find((o) => o.id === optionId)?.description || ''
      const descEffect = desc
        ? [{ effectType: 'custom_condition', category: 'custom', scope: 'global', scopeDetail: [], value: desc }]
        : []
      switch (optionId) {
        case 'spellschool':
          return [
            ...descEffect,
            {
              effectType: 'skill_bonus',
              category: 'ability',
              scope: 'global',
              scopeDetail: [],
              value: {
                arcana: { ref: 'abilityModifier', ability: 'wis', min: 1 },
                nature: { ref: 'abilityModifier', ability: 'wis', min: 1 },
              },
            },
          ]
        case 'warden':
          return [
            ...descEffect,
            {
              effectType: 'weapon_proficiency',
              category: 'proficiency',
              scope: 'global',
              scopeDetail: [],
              value: { proficiencyChecklist: ['martial'] },
            },
            {
              effectType: 'armor_proficiency',
              category: 'proficiency',
              scope: 'global',
              scopeDetail: [],
              value: { proficiencyChecklist: ['medium'] },
            },
          ]
        default:
          return descEffect
      }
    },
  },

  /* ─ 德鲁伊 7 级 元素之怒 ───────────────────────────────────────── */
  '德鲁伊||elemental_fury': {
    label: '元素之怒',
    options: [
      {
        id: 'forceful',
        label: '强力施法',
        description: '戏法伤害+感知调整值',
      },
      {
        id: 'primal_strike',
        label: '原力蛮击',
        description: '每回合一次额外1d8元素伤害',
      },
    ],
    getEffects(optionId) {
      switch (optionId) {
        case 'primal_strike':
          return [
            {
              effectType: 'extra_damage_dice',
              category: 'offense',
              scope: 'weapon_or_beast',
              scopeDetail: [],
              value: { plus: '1d8', type: '寒冷/火焰/闪电/雷鸣' },
            },
          ]
        case 'forceful':
          return [
            {
              effectType: 'spell_damage_bonus',
              category: 'offense',
              scope: 'druid_cantrip',
              scopeDetail: [],
              value: {
                type: '',
                diceFloor: null,
                perDieBonus: 0,
                extraDice: '',
                flatBonus: { ref: 'abilityModifier', ability: 'wis', min: 0 },
              },
            },
          ]
        default:
          return []
      }
    },
  },
}

/**
 * 根据角色选择获取职业特性的效果
 * @param {string} buffKey - 如 '德鲁伊||primal_order'
 * @param {Object|null} classFeatureChoices - 角色已选 { [featureId]: optionId }
 * @returns {{ effects: Array, chosenOptionId: string } | null}
 */
export function getChoiceEffects(buffKey, classFeatureChoices) {
  const entry = CLASS_FEATURE_CHOICE_REGISTRY[buffKey]
  if (!entry || !classFeatureChoices) return null

  // 从 buffKey 提取 featureId（最后一段）
  const parts = buffKey.split('|')
  const featureId = parts[parts.length - 1]
  const chosenOptionId = classFeatureChoices[featureId]
  if (!chosenOptionId) return null

  const effects = entry.getEffects(chosenOptionId)
  if (effects.length === 0) return null
  return { effects, chosenOptionId }
}
