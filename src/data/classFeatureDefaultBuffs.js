/**
 * 职业特性默认 BUFF 效果初始化
 * 
 * 为需要数值改变的常驻效果提供默认配置，通过 defaultBuffPatchStore 持久化。
 * 主动消耗类（如专注点）不在此配置，由用户自行计算或通过主动释放配置。
 * 条件性效果（如变身期间的AC加成）也不在此配置，应通过变身系统或主动技能处理。
 *
 * Key 格式：`${职业}|${子职|''}|${featureId}`
 */

import { saveDefaultBuffPatch, buildClassFeatureBuffKey } from '../lib/defaultBuffPatchStore'

/**
 * 初始化职业特性默认BUFF（仅在localStorage无配置时执行）
 * @param {string} moduleId - 模组ID
 */
export function initializeClassFeatureDefaultBuffs(moduleId) {
  if (!moduleId) return
  
  // 火铳手 - 致命专注：暴击范围-N（9级-1，17级-2）
  // 使用专用的 crit_range_reduction 效果类型，语义清晰且与通用增量机制隔离
  saveDefaultBuffPatch(moduleId, 'classFeature', '火铳手||deadly_focus', {
    effects: [
      { effectType: 'crit_range_reduction', value: 1 },
    ],
    enabled: true,
  })
  
  // 预留扩展点：未来如需添加更多默认配置，可在此处继续添加
}

/* ════════════════════════════════════════════════════════════════════ */
export const HARDCODED_CLASS_FEATURE_BUFFS = {
  // 血肉堡垒：火铳手等级×3 生命值上限
  '火铳手|敢死先锋|gunslinger_daredevil_fortress': {
    source: '血肉堡垒',
    effects: [
      {
        category: 'ability',
        effectType: 'max_hp_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: { ref: 'classLevel', className: '火铳手', mult: 3 } },
      },
    ],
  },
  // AC加值：贤者之剑将感知调整值加到AC上
  '武道家|贤者之剑|sage_ac_bonus': {
    source: 'AC加值',
    effects: [
      {
        category: 'defense',
        effectType: 'ac_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { ref: 'abilityModifier', ability: 'wis' },
      },
    ],
  },
}
