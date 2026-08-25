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
        description:
          '额外学会 1 道德鲁伊戏法；智力（奥秘和自然）检定加值 = 感知调整值（最低+1）',
      },
      {
        id: 'warden',
        label: '卫士',
        description: '获得军用武器熟练和中甲受训',
      },
    ],
    getEffects(optionId) {
      switch (optionId) {
        case 'spellschool':
          return [
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
