/**
 * BUFF 栏「效果类型」与 useBuffCalculator 的对应关系（单源登记，供测试与文档）。
 * - calculator：会改变 computeBuffStats 的数值/抗性/优势等
 * - metadata：仅展示、或在战斗/物品等其它模块处理，当前计算器不读
 */
import { BUFF_TYPES } from '../data/buffTypes'

const CATEGORY_ORDER = ['ability', 'offense', 'defense', 'mobility_casting', 'charge', 'container', 'custom']

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
  // ability
  ability_score: 'calculator',
  ability_override: 'calculator',
  ability_score_uncapped: 'calculator',
  extra_attunement_slots: 'metadata',
  skill_bonus: 'calculator',
  save_bonus: 'calculator',
  initiative_buff: 'calculator',
  // offense
  attack_bonus: 'calculator',
  damage_bonus: 'calculator',
  attack_distance_range: 'metadata',
  attack_area: 'metadata',
  damage_piercing_traits: 'calculator',
  crit_range_expand: 'metadata',
  crit_extra_dice: 'metadata',
  extra_damage_dice: 'metadata',
  infinite_ammo: 'metadata',
  spell_ability_attack: 'metadata',
  // defense
  ac_bonus: 'calculator',
  resist_type: 'calculator',
  immune_type: 'calculator',
  vulnerable_type: 'calculator',
  damage_reduction: 'calculator',
  max_hp_bonus: 'calculator',
  temp_hp: 'calculator',
  regeneration: 'calculator',
  condition_immunity: 'metadata',
  death_ward: 'metadata',
  // mobility_casting
  base_speed_increment: 'calculator',
  terrain_ignore: 'calculator',
  concentration_save_enhance: 'calculator',
  spell_range_extension: 'calculator',
  spell_attack_bonus: 'calculator',
  save_dc_bonus: 'calculator',
  spell_damage_bonus: 'calculator',
  contained_spell: 'metadata',
  // charge
  ac_cap_stone_layer: 'calculator',
  // container
  item_storage: 'metadata',
  // custom
  custom_condition: 'metadata',
}
