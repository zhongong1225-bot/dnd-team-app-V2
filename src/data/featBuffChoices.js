/**
 * 专长选择时的 BUFF 配置模式。
 *  key = 专长 id（与 data/feats.js 对应）。
 *  value = 描述玩家需要做出的选择，以及选择后自动写入 featBuffPatch.effects 的效果。
 *
 *  目前支持的 kind：
 *    - abilitySingle：从 abilities 中选择一项属性，固定提升 value 点
 *    - abilityAsi：属性值提升专长专用：可选「一项属性+2」或「两项属性各+1」
 *    - damageTypeSingle：从 options（英文 value）中选择一种伤害类型，生成说明文本
 *    - choice：从多个选项中选择一项，每项直接定义 effects 数组
 */

import { ABILITY_KEYS, ABILITY_NAMES_ZH, DAMAGE_TYPES, getEffectInfo } from './buffTypes'

const ABILITY_SINGLE_VALUE_DEFAULT = 1

function withCategory(effects) {
  if (!Array.isArray(effects)) return []
  return effects.map((e) => {
    const info = getEffectInfo(e.effectType)
    return {
      category: info?.category ?? 'ability',
      effectType: e.effectType,
      value: e.value,
    }
  })
}

function abilityOptions(keys) {
  return keys.map((k) => ({ value: k, label: ABILITY_NAMES_ZH[k] ?? k }))
}

export const FEAT_BUFF_SCHEMAS = {
  /** 属性值提升：1项+2 或 2项+1 */
  ability_score_improvement: {
    kind: 'abilityAsi',
    label: '属性值提升',
    description: '选择一项属性提升 2，或者选择两项属性各提升 1。',
  },

  /** 常见「某一项属性+1」专长 */
  actor: { kind: 'abilitySingle', abilities: ['cha'], value: 1, label: '属性提升' },
  athlete: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  charger: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  chef: { kind: 'abilitySingle', abilities: ['con', 'wis'], value: 1, label: '属性提升' },
  cloud_hopper: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '施法属性' },
  crossbow_expert: { kind: 'abilitySingle', abilities: ['dex'], value: 1, label: '属性提升' },
  crusher: { kind: 'abilitySingle', abilities: ['str', 'con'], value: 1, label: '属性提升' },
  defensive_duelist: { kind: 'abilitySingle', abilities: ['dex'], value: 1, label: '属性提升' },
  dual_wielder: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  durable: { kind: 'abilitySingle', abilities: ['con'], value: 1, label: '属性提升' },
  fey_touched: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  grappler: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  great_weapon_master: { kind: 'abilitySingle', abilities: ['str'], value: 1, label: '属性提升' },
  heavily_armored: { kind: 'abilitySingle', abilities: ['con', 'str'], value: 1, label: '属性提升' },
  heavy_armor_master: { kind: 'abilitySingle', abilities: ['con', 'str'], value: 1, label: '属性提升' },
  inspiring_leader: { kind: 'abilitySingle', abilities: ['wis', 'cha'], value: 1, label: '属性提升' },
  keen_mind: { kind: 'abilitySingle', abilities: ['int'], value: 1, label: '属性提升' },
  lightly_armored: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  mage_slayer: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  martial_weapon_training: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  medium_armor_master: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  moderately_armored: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  mounted_combatant: { kind: 'abilitySingle', abilities: ['str', 'dex', 'wis'], value: 1, label: '属性提升' },
  observant: { kind: 'abilitySingle', abilities: ['int', 'wis'], value: 1, label: '属性提升' },
  piercer: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  poisoner: { kind: 'abilitySingle', abilities: ['dex', 'int'], value: 1, label: '属性提升' },
  polearm_master: { kind: 'abilitySingle', abilities: ['dex', 'str'], value: 1, label: '属性提升' },
  ritual_caster: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  sentinel: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  shadow_touched: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  sharpshooter: { kind: 'abilitySingle', abilities: ['dex'], value: 1, label: '属性提升' },
  shield_master: { kind: 'abilitySingle', abilities: ['str'], value: 1, label: '属性提升' },
  skill_expert: { kind: 'abilitySingle', abilities: ABILITY_KEYS, value: 1, label: '属性提升' },
  skulker: { kind: 'abilitySingle', abilities: ['dex'], value: 1, label: '属性提升' },
  slasher: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },
  speedy: { kind: 'abilitySingle', abilities: ['dex', 'con'], value: 1, label: '属性提升' },
  spell_sniper: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  telekinetic: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  telepathic: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  war_caster: { kind: 'abilitySingle', abilities: ['int', 'wis', 'cha'], value: 1, label: '属性提升' },
  weapon_master: { kind: 'abilitySingle', abilities: ['str', 'dex'], value: 1, label: '属性提升' },

  /** 能量掌控：选择伤害类型 */
  elemental_adept: {
    kind: 'damageTypeSingle',
    label: '能量掌控',
    options: ['acid', 'cold', 'fire', 'lightning', 'thunder'],
    description: '选择一种伤害类型：你施展的法术无视所选抗性，且该类型伤害骰投出的 1 视为 2。',
  },

  /** 强健身心：选择一项不熟练的豁免属性 */
  resilient: {
    kind: 'choice',
    label: '选择一项不具熟练的豁免属性',
    description: '该属性提升 1，并获得该属性的豁免熟练。',
    options: ABILITY_KEYS.map((k) => ({
      id: k,
      label: ABILITY_NAMES_ZH[k],
      effects: [
        { effectType: 'ability_score_uncapped', value: { [k]: 1 } },
        { effectType: 'ability_score', value: { [k]: true } },
      ],
    })),
  },
}

export function getFeatBuffSchema(featId) {
  return FEAT_BUFF_SCHEMAS[featId] ?? null
}

export function buildDefaultChoiceState(schema) {
  if (!schema) return {}
  switch (schema.kind) {
    case 'abilitySingle':
      return { ability: schema.abilities?.[0] ?? ABILITY_KEYS[0] }
    case 'abilityAsi':
      return { mode: 'single', single: ABILITY_KEYS[0], double: [ABILITY_KEYS[0], ABILITY_KEYS[1]] }
    case 'damageTypeSingle':
      return { type: schema.options?.[0] ?? '' }
    case 'choice':
      return { optionId: schema.options?.[0]?.id ?? '' }
    default:
      return {}
  }
}

export function validateChoiceState(schema, state) {
  if (!schema) return true
  switch (schema.kind) {
    case 'abilitySingle':
      return !!state.ability
    case 'abilityAsi': {
      if (state.mode === 'single') return !!state.single
      if (state.mode === 'double') {
        const [a, b] = state.double || []
        return !!a && !!b && a !== b
      }
      return false
    }
    case 'damageTypeSingle':
      return !!state.type
    case 'choice':
      return !!state.optionId
    default:
      return true
  }
}

export function buildFeatBuffEffects(featId, state) {
  const schema = getFeatBuffSchema(featId)
  if (!schema) return []

  switch (schema.kind) {
    case 'abilitySingle': {
      const value = schema.value ?? ABILITY_SINGLE_VALUE_DEFAULT
      return withCategory([{ effectType: 'ability_score_uncapped', value: { [state.ability]: value } }])
    }
    case 'abilityAsi': {
      if (state.mode === 'single') {
        return withCategory([{ effectType: 'ability_score_uncapped', value: { [state.single]: 2 } }])
      }
      const [a, b] = state.double || []
      if (!a || !b) return []
      return withCategory([{ effectType: 'ability_score_uncapped', value: { [a]: 1, [b]: 1 } }])
    }
    case 'damageTypeSingle': {
      const cfg = DAMAGE_TYPES.find((d) => d.value === state.type)
      const label = cfg?.label ?? state.type
      return withCategory([
        {
          effectType: 'custom_condition',
          value: `元素掌控：无视${label}抗性；造成${label}伤害的法术伤害骰投出1视为2`,
        },
      ])
    }
    case 'choice': {
      const option = schema.options.find((o) => o.id === state.optionId)
      if (!option) return []
      return withCategory(option.effects)
    }
    default:
      return []
  }
}

export { abilityOptions }
