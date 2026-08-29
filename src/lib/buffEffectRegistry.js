/**
 * BUFF 栏「效果类型」与 useBuffCalculator 的对应关系（单源登记，供测试与文档）。
 * - calculator：会改变 computeBuffStats 的数值/抗性/优势等
 * - metadata：仅展示、或在战斗/物品等其它模块处理，当前计算器不读
 */
import { BUFF_TYPES } from '../data/buffTypes'

const CATEGORY_ORDER = ['ability', 'offense', 'defense', 'mobility_casting', 'active_release', 'container', 'proficiency', 'custom']

export function getAllVisibleBuffEffectKeys() {
  const keys = []
  for (const cat of CATEGORY_ORDER) {
    const data = BUFF_TYPES[cat]
    if (!data?.effects) continue
    for (const e of data.effects) {
      if (!e.hidden) keys.push(e.key)
    }
  }
  return keys
}

/** @type {Record<string, 'calculator' | 'metadata'>} */
export const BUFF_EFFECT_KEY_RUNTIME = {
  // ability（属性/移动）
  ability_score: 'calculator',
  ability_override: 'calculator',
  ability_score_uncapped: 'calculator',
  extra_attunement_slots: 'metadata',
  save_bonus: 'calculator',
  adv_save: 'calculator',
  initiative_buff: 'calculator',
  base_speed_increment: 'calculator',
  terrain_ignore: 'calculator',
  speed_bonus: 'calculator',
  flight_speed: 'calculator',
  // offense
  attack_bonus: 'calculator',
  damage_bonus: 'calculator',
  attack_damage_bonus: 'calculator',
  attack_distance_range: 'metadata',
  attack_area: 'metadata',
  damage_piercing_traits: 'calculator',
  crit_range_expand: 'metadata',
  crit_range_override: 'metadata',
  crit_range_increment: 'metadata',
  crit_range_reduction: 'metadata',
  crit_extra_dice: 'metadata',
  extra_damage_dice: 'metadata',
  infinite_ammo: 'metadata',
  spell_ability_attack: 'metadata',
  extra_attack: 'metadata',
  extra_action_resource: 'metadata',
  // defense
  ac_bonus: 'calculator',
  armor_override: 'calculator',
  resist_type: 'calculator',
  immune_type: 'calculator',
  vulnerable_type: 'calculator',
  damage_type_relation: 'calculator',
  damage_reduction: 'calculator',
  damage_reduction_typed: 'calculator',
  max_hp_bonus: 'calculator',
  temp_hp: 'calculator',
  regeneration: 'calculator',
  condition_immunity: 'metadata',
  special_senses: 'metadata',
  healing_bonus: 'calculator',
  death_save_bonus: 'calculator',
  death_ward: 'metadata',
  shield_pool: 'calculator',
  // mobility_casting（施法）
  concentration_save_enhance: 'calculator',
  spell_range_extension: 'calculator',
  spell_attack_bonus: 'calculator',
  save_dc_bonus: 'calculator',
  spell_damage_bonus: 'calculator',
  damage_dice_bonus: 'calculator',
  min_dice_value: 'calculator',
  init_bonus: 'calculator',
  concentration: 'calculator',
  charge: 'metadata',
  // active_release（主动释放）
  charge_item: 'metadata',
  creature_transform: 'calculator',
  restore_spell_slots_v2: 'metadata',
  contained_spell: 'metadata',
  ac_cap_stone_layer: 'calculator',
  recharge_long_rest: 'metadata',
  recharge_dawn: 'metadata',
  // container
  item_storage: 'metadata',
  // proficiency（技能/熟练）
  skill_bonus: 'calculator',
  adv_skill: 'calculator',
  specific_tool_proficiency: 'metadata',
  instrument_proficiency: 'metadata',
  armor_proficiency: 'metadata',
  weapon_proficiency: 'metadata',
  language_proficiency: 'metadata',
  vehicle_proficiency: 'metadata',
  weapon_mastery: 'metadata',
  // custom
  custom_condition: 'metadata',
  // deprecated（旧存档兼容，不再出现在 BUFF_TYPES 中）
  attack_melee: 'calculator',
  attack_ranged: 'calculator',
  attack_all: 'calculator',
  dmg_bonus_melee: 'calculator',
  dmg_bonus_ranged: 'calculator',
  dmg_bonus_all: 'calculator',
  adv_melee: 'calculator',
  adv_ranged: 'calculator',
  adv_all_attack: 'calculator',
  disadv_all: 'calculator',
  dmg_type_specific: 'calculator',
  reach_bonus: 'calculator',
  ignore_resistance: 'calculator',
  proficiency_override: 'calculator',
  tool_proficiency: 'metadata',
}
