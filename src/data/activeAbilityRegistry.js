/**
 * 主动技能注册表
 *
 * 每个条目定义一个可由玩家主动激活的能力。
 * 引擎（activeAbilityEngine.js）根据注册表查询角色可用技能并执行。
 *
 * 数据结构：
 *  id            — 唯一标识
 *  name          — 显示名
 *  source        — 'class' | 'subclass' | 'feat'
 *  sourceKey     — 职业名 / 专长 id
 *  subclassFilter — (可选) 仅匹配特定子职
 *  actionType    — 'action' | 'bonus_action' | 'reaction' | 'special'
 *  cost          — 消耗描述 { type, resourceKey, amount }
 *  cooldown      — 'short_rest' | 'long_rest' | 'none'
 *  effects       — 效果列表（heal / transform / save_redirect 等）
 *  icon          — lucide-react 图标名
 *  description   — 玩家可见描述
 *  needsInteraction — 'none' | 'select_creature' | 'confirm'
 */

/** @type {import('./activeAbilityTypes').ActiveAbility[]} */
export const ACTIVE_ABILITY_REGISTRY = [
  /* ── 荒野变形（德鲁伊） ─────────────────────────────── */
  {
    id: 'wild_shape',
    name: '荒野变形',
    source: 'class',
    sourceKey: '德鲁伊',
    actionType: 'action',
    cost: {
      type: 'class_resource',
      resourceKey: 'wild_shape',
      amount: 1,
    },
    cooldown: 'short_rest',
    effects: [
      {
        type: 'creature_transform',
        description: '变身为已记录的野兽形态',
      },
    ],
    icon: 'PawPrint',
    description: '消耗一次荒野变形次数，变身为已记录的野兽。',
    needsInteraction: 'select_creature',
  },

  /* ── 回气（战士） ──────────────────────────────────── */
  {
    id: 'second_wind',
    name: '回气',
    source: 'class',
    sourceKey: '战士',
    actionType: 'action',
    cost: {
      type: 'class_resource',
      resourceKey: 'second_wind',
      amount: 1,
    },
    cooldown: 'short_rest',
    effects: [
      {
        type: 'heal',
        formula: 'classLevel + 1d10',
        description: '恢复 战士等级 + 1d10 生命值',
      },
    ],
    icon: 'Wind',
    description: '恢复等同于战士等级 + 1d10 的生命值。',
    needsInteraction: 'none',
  },

  /* ── 圣疗（圣武士） ─────────────────────────────────── */
  {
    id: 'lay_on_hands',
    name: '圣疗',
    source: 'class',
    sourceKey: '圣武士',
    actionType: 'action',
    cost: {
      type: 'class_resource',
      resourceKey: 'lay_on_hands',
      amount: 1, // 每点 = 1 HP，UI 可让玩家选择花费点数
    },
    cooldown: 'long_rest',
    effects: [
      {
        type: 'heal',
        formula: 'costAmount', // 花费多少点就恢复多少 HP
        description: '从圣疗池中花费点数，每点恢复 1 HP',
      },
    ],
    icon: 'Heart',
    description: '花费圣疗池点数恢复等量 HP。',
    needsInteraction: 'confirm',
  },

  /* ── 审慎护心（巫师杀手专长） ─────────────────────────── */
  {
    id: 'mage_slayer_save_redirect',
    name: '审慎护心',
    source: 'feat',
    sourceKey: 'mage_slayer',
    actionType: 'reaction',
    cost: {
      type: 'none',
    },
    cooldown: 'short_rest',
    effects: [
      {
        type: 'save_redirect',
        description: '将智力/感知/魅力豁免失败改为成功',
        applicableAbilities: ['int', 'wis', 'cha'],
      },
    ],
    icon: 'ShieldAlert',
    description: '当智力、感知或魅力豁免失败时，将其改为成功。每短休/长休 1 次。',
    needsInteraction: 'none',
  },

  /* ── 星辰专长（繁星模组） ─────────────────────────────── */
  {
    id: 'star_memory',
    name: '星辰记忆',
    source: 'feat',
    sourceKey: 'star_memory',
    actionType: 'reaction',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'buff', description: '获得一个临时专长，持续 1 小时', duration: '1小时' }],
    icon: 'Brain',
    description: '消耗 1 星辰点，获得一个临时专长或特殊能力，持续 1 小时。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_ring_of_radiance',
    name: '光耀之环',
    source: 'feat',
    sourceKey: 'star_ring_of_radiance',
    actionType: 'action',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'buff', description: '获得悬空飞行 30 尺，持续 1 小时', duration: '1小时' }],
    icon: 'Sun',
    description: '消耗 1 星辰点，获得悬空能力，飞行速度 30 尺，持续 1 小时。可升阶。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_compassionate_care',
    name: '慈悲关怀',
    source: 'feat',
    sourceKey: 'star_compassionate_care',
    actionType: 'action',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'heal_full', description: '10 尺内所有生物恢复至满 HP' }],
    icon: 'Sparkles',
    description: '消耗 1 星辰点，10 尺内所有生物恢复至生命上限。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_divine_guidance',
    name: '神导之力',
    source: 'feat',
    sourceKey: 'star_divine_guidance',
    actionType: 'action',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'buff', description: '1 分钟内攻击检定均成功', duration: '1分钟' }],
    icon: 'Swords',
    description: '消耗 1 星辰点，1 分钟内攻击检定均为成功。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_control_blink',
    name: '控制闪烁',
    source: 'feat',
    sourceKey: 'star_control_blink',
    actionType: 'reaction',
    cost: { type: 'none' },
    cooldown: 'special', // 1d6 rounds
    effects: [{ type: 'teleport', description: '消失后以动作再现（60 尺）' }],
    icon: 'Zap',
    description: '反应消失，动作再现（60 尺）。充能 1d6 回合，不需星辰点。',
    needsInteraction: 'none',
  },
  {
    id: 'star_high_frequency',
    name: '高频连接',
    source: 'feat',
    sourceKey: 'star_high_frequency',
    actionType: 'action',
    cost: { type: 'none' }, // 恢复资源，不消耗
    cooldown: 'long_rest',
    effects: [{ type: 'restore_star_points', description: '恢复所有星辰点，1 分钟后累积 1 级力竭' }],
    icon: 'BatteryCharging',
    description: '恢复所有星辰点。1 分钟后累积 1 级力竭。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_radiant_weapon',
    name: '辉耀武器',
    source: 'feat',
    sourceKey: 'star_radiant_weapon',
    actionType: 'reaction',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'buff', description: '武器 +1d6 伤害，持续 1 分钟', duration: '1分钟' }],
    icon: 'Sword',
    description: '消耗 1 星辰点，武器获得 +1d6 伤害，持续 1 分钟。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_radiant_armor',
    name: '辉耀防具',
    source: 'feat',
    sourceKey: 'star_radiant_armor',
    actionType: 'reaction',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'buff', description: 'AC +5，持续 1 分钟', duration: '1分钟' }],
    icon: 'Shield',
    description: '消耗 1 星辰点，AC 获得 +5 加值，持续 1 分钟。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_luck',
    name: '星辰运气',
    source: 'feat',
    sourceKey: 'star_luck',
    actionType: 'reaction',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'buff', description: '检定优势，投 1 可重骰，持续 1 分钟', duration: '1分钟' }],
    icon: 'Dices',
    description: '消耗 1 星辰点，1 分钟内任何检定获得优势，投 1 可重骰。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_mana_surge',
    name: '法力涌动',
    source: 'feat',
    sourceKey: 'star_mana_surge',
    actionType: 'reaction',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'none',
    effects: [{ type: 'restore_spell_slots', description: '恢复所有 3 环法术位' }],
    icon: 'Flame',
    description: '消耗 1 星辰点，恢复所有 3 环法术位。可升阶。',
    needsInteraction: 'confirm',
  },
  {
    id: 'star_doppelganger',
    name: '星辰替身',
    source: 'feat',
    sourceKey: 'star_doppelganger',
    actionType: 'action',
    cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
    cooldown: 'long_rest', // once per 24h
    effects: [{ type: 'summon', description: '创造灵体复制体，共享 HP/法术位，持续 1 分钟' }],
    icon: 'Users',
    description: '创造灵体复制体，共享生命值与法术位，持续 1 分钟。',
    needsInteraction: 'confirm',
  },
]

/* ── 查询辅助 ─────────────────────────────────────────── */

/**
 * 按 id 快速查找
 * @param {string} abilityId
 * @returns {ActiveAbility | undefined}
 */
export function getAbilityById(abilityId) {
  return ACTIVE_ABILITY_REGISTRY.find((a) => a.id === abilityId)
}
