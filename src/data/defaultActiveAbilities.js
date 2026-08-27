/**
 * 默认主动技能配置（硬编码回退）
 *
 * 优先级：BUFF 编辑器用户配置 > 本文件硬编码
 * 当 getBuffsFromClassFeatures / getBuffsFromSelectedFeats 生成 BUFF 条目时，
 * 据此注入 activeAbilities 字段。
 *
 * Key 格式与 HARDCODED_CLASS_FEATURE_BUFFS / HARDCODED_FEAT_BUFFS 一致：
 *   职业特性：`${职业}|${子职|''}|${featureId}`
 *   专长：    `${featId}`
 *
 * 每个 key 映射到一个主动技能数组。
 * 技能效果格式与 activeAbilityEngine 的 computeEffect 兼容。
 */

/* ════════════════════════════════════════════════════════════════════ */
export const DEFAULT_CLASS_FEATURE_ABILITIES = {

  /* ── 德鲁伊：荒野变形 ──────────────────────────────────────── */
  '德鲁伊||wild_shape': [
    {
      id: 'wild_shape',
      name: '荒野变形',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'wild_shape', amount: 1 },
      cooldown: 'short_rest',
      icon: 'PawPrint',
      description: '消耗一次荒野变形次数，变身为已记录的野兽。',
      needsInteraction: 'select_creature',
      effects: [
        { type: 'creature_transform', description: '变身为已记录的野兽形态' },
      ],
    },
  ],

  /* ── 战士：回气 ────────────────────────────────────────────── */
  '战士||second_wind': [
    {
      id: 'second_wind',
      name: '回气',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'second_wind', amount: 1 },
      cooldown: 'short_rest',
      icon: 'Wind',
      description: '恢复等同于战士等级 + 1d10 的生命值。',
      needsInteraction: 'none',
      effects: [
        { type: 'heal', formula: 'classLevel + 1d10', description: '恢复 战士等级 + 1d10 生命值' },
      ],
    },
  ],

  /* ── 圣武士：圣疗 ──────────────────────────────────────────── */
  '圣武士||lay_on_hands': [
    {
      id: 'lay_on_hands',
      name: '圣疗',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'lay_on_hands', amount: 1 },
      cooldown: 'long_rest',
      icon: 'Heart',
      description: '花费圣疗池点数恢复等量 HP。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'heal', formula: 'costAmount', description: '从圣疗池中花费点数，每点恢复 1 HP' },
      ],
    },
  ],

  /* ── 火铳手：专注点技能 ────────────────────────────────────── */
  '火铳手||focus_points': [
    {
      id: 'gs_focus_concentration',
      name: '聚精会神',
      minLevel: 2,
      actionType: 'bonus_action',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'Target',
      description: '消耗 1 专注点：选择一次火器攻击，攻击检定视为固定值（10+火铳手等级+敏捷调整值+熟练加值）。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '本次火器攻击检定视为 10+等级+敏捷调整值+熟练加值，无需掷' },
      ],
    },
    {
      id: 'gs_focus_rapid_reload',
      name: '快速装填',
      minLevel: 2,
      actionType: 'bonus_action',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'Zap',
      description: '消耗 1 专注点：当次装填可用反应完成；装填动作降级（整轮→标准，标准→附赠）。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '当次装填可用反应完成；整轮→标准动作，标准→附赠动作' },
      ],
    },
    {
      id: 'gs_focus_lock_weakness',
      name: '锁定弱点',
      minLevel: 3,
      actionType: 'bonus_action',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'Crosshair',
      description: '消耗 1 专注点：当火器攻击已成功命中时，使该次攻击视为重击。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '已命中的火器攻击视为重击' },
      ],
    },
    {
      id: 'gs_focus_never_retreat_shot',
      name: '死不旋踵',
      minLevel: 3,
      subclassFilter: '敢死先锋',
      actionType: 'reaction',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'ShieldAlert',
      description: '消耗 1 专注点（敢死先锋）：当敌对生物进入距你 10 尺内时，用反应对该生物发动一次火器攻击。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '敌对生物进入 10 尺内时，用反应发动一次火器攻击' },
      ],
    },
    {
      id: 'gs_focus_anticipation',
      name: '预判',
      minLevel: 3,
      subclassFilter: '战场先知',
      actionType: 'special',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'Eye',
      description: '消耗 1 专注点（战场先知）：每场战斗开始时，你的先攻检定具有优势。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '每场战斗开始时，先攻检定具有优势' },
      ],
    },
    {
      id: 'gs_focus_mounted_volley',
      name: '骑枪齐射',
      minLevel: 3,
      subclassFilter: '库罗骑士',
      actionType: 'bonus_action',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'Swords',
      description: '消耗 1 专注点（库罗骑士）：骑乘状态下，本回合内坐骑的移动不会使你失去「维稳射击」所给予的攻击优势。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '骑乘状态下，本回合内坐骑的移动不会使你失去维稳射击的攻击优势' },
      ],
    },
    {
      id: 'gs_focus_precise_shot',
      name: '精准射击',
      minLevel: 6,
      actionType: 'bonus_action',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 1 },
      cooldown: 'none',
      icon: 'Crosshair',
      description: '消耗 1 专注点：命中后目标进行体质豁免，成功则伤害减半，失败则倒地。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '命中后目标体质豁免：成功伤害减半，失败倒地' },
      ],
    },
    {
      id: 'gs_focus_surprise_shot',
      name: '突袭射击',
      minLevel: 13,
      actionType: 'bonus_action',
      cost: { type: 'class_resource', resourceKey: 'focus_points', amount: 4 },
      cooldown: 'none',
      icon: 'Flame',
      description: '消耗 4 专注点（仅攻击有优势时）：该次火器攻击额外造成 2d6 武器伤害，重击时武器伤害骰倍率翻倍。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'custom_condition', description: '有优势时可用：额外 2d6 武器伤害，重击时武器伤害骰倍率翻倍' },
      ],
    },
  ],
}

/* ════════════════════════════════════════════════════════════════════ */
export const DEFAULT_FEAT_ABILITIES = {

  /* ── 巫师杀手 ──────────────────────────────────────────────── */
  mage_slayer: [
    {
      id: 'mage_slayer_save_redirect',
      name: '审慎护心',
      actionType: 'reaction',
      cost: { type: 'none' },
      cooldown: 'short_rest',
      icon: 'ShieldAlert',
      description: '当智力、感知或魅力豁免失败时，将其改为成功。每短休/长休 1 次。',
      needsInteraction: 'none',
      effects: [
        {
          type: 'save_redirect',
          description: '将智力/感知/魅力豁免失败改为成功',
          applicableAbilities: ['int', 'wis', 'cha'],
        },
      ],
    },
  ],

  /* ── 星辰专长 ──────────────────────────────────────────────── */
  star_memory: [
    {
      id: 'star_memory',
      name: '星辰记忆',
      actionType: 'reaction',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Brain',
      description: '消耗 1 星辰点，获得一个临时专长或特殊能力，持续 1 小时。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'buff', description: '获得一个临时专长，持续 1 小时', duration: '1小时' },
      ],
    },
  ],

  star_ring_of_radiance: [
    {
      id: 'star_ring_of_radiance',
      name: '光耀之环',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Sun',
      description: '消耗 1 星辰点，获得悬空能力，飞行速度 30 尺，持续 1 小时。可升阶。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'buff', description: '获得悬空飞行 30 尺，持续 1 小时', duration: '1小时' },
      ],
    },
  ],

  star_compassionate_care: [
    {
      id: 'star_compassionate_care',
      name: '慈悲关怀',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Sparkles',
      description: '消耗 1 星辰点，10 尺内所有生物恢复至生命上限。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'heal_full', description: '10 尺内所有生物恢复至满 HP' },
      ],
    },
  ],

  star_divine_guidance: [
    {
      id: 'star_divine_guidance',
      name: '神导之力',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Swords',
      description: '消耗 1 星辰点，1 分钟内攻击检定均为成功。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'buff', description: '1 分钟内攻击检定均成功', duration: '1分钟' },
      ],
    },
  ],

  star_control_blink: [
    {
      id: 'star_control_blink',
      name: '控制闪烁',
      actionType: 'reaction',
      cost: { type: 'none' },
      cooldown: 'special',
      icon: 'Zap',
      description: '反应消失，动作再现（60 尺）。充能 1d6 回合，不需星辰点。',
      needsInteraction: 'none',
      effects: [
        { type: 'teleport', description: '消失后以动作再现（60 尺）' },
      ],
    },
  ],

  star_high_frequency: [
    {
      id: 'star_high_frequency',
      name: '高频连接',
      actionType: 'action',
      cost: { type: 'none' },
      cooldown: 'long_rest',
      icon: 'BatteryCharging',
      description: '恢复所有星辰点。1 分钟后累积 1 级力竭。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'restore_star_points', description: '恢复所有星辰点，1 分钟后累积 1 级力竭' },
      ],
    },
  ],

  star_radiant_weapon: [
    {
      id: 'star_radiant_weapon',
      name: '辉耀武器',
      actionType: 'reaction',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Sword',
      description: '消耗 1 星辰点，武器获得 +1d6 伤害，持续 1 分钟。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'buff', description: '武器 +1d6 伤害，持续 1 分钟', duration: '1分钟' },
      ],
    },
  ],

  star_radiant_armor: [
    {
      id: 'star_radiant_armor',
      name: '辉耀防具',
      actionType: 'reaction',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Shield',
      description: '消耗 1 星辰点，AC 获得 +5 加值，持续 1 分钟。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'buff', description: 'AC +5，持续 1 分钟', duration: '1分钟' },
      ],
    },
  ],

  star_luck: [
    {
      id: 'star_luck',
      name: '星辰运气',
      actionType: 'reaction',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Dices',
      description: '消耗 1 星辰点，1 分钟内任何检定获得优势，投 1 可重骰。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'buff', description: '检定优势，投 1 可重骰，持续 1 分钟', duration: '1分钟' },
      ],
    },
  ],

  star_mana_surge: [
    {
      id: 'star_mana_surge',
      name: '法力涌动',
      actionType: 'reaction',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'none',
      icon: 'Flame',
      description: '消耗 1 星辰点，恢复所有 3 环法术位。可升阶。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'restore_spell_slots', description: '恢复所有 3 环法术位', ringLevel: 3 },
      ],
    },
  ],

  star_doppelganger: [
    {
      id: 'star_doppelganger',
      name: '星辰替身',
      actionType: 'action',
      cost: { type: 'class_resource', resourceKey: 'star_points', amount: 1 },
      cooldown: 'long_rest',
      icon: 'Users',
      description: '创造灵体复制体，共享生命值与法术位，持续 1 分钟。',
      needsInteraction: 'confirm',
      effects: [
        { type: 'summon', description: '创造灵体复制体，共享 HP/法术位，持续 1 分钟', duration: '1分钟' },
      ],
    },
  ],
}
