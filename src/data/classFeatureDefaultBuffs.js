/**
 * 职业特性默认 BUFF 效果（硬编码回退）
 *
 * 优先级：DM 配置（localStorage）> 本文件硬编码
 * 当 DM 未为某职业特性配置默认 BUFF 时，getBuffsFromClassFeatures 使用本映射作为回退。
 *
 * 设计原则：
 *  - 仅有真实数值效果的特性才出现在此（无条件被动数值 → 真实 BUFF）
 *  - 纯描述/许可/主动激活类特性不在此处（由特性描述文本展示）
 *  - 有真实 BUFF 效果时不加 custom_condition，避免重复显示
 *  - 条件性/选择性效果用 custom_condition 描述或交给 CHOICE_REGISTRY
 *
 * Key 格式：`${职业}|${子职|''}|${featureId}`
 * 核心特性子职为空字符串，子职特性为子职名（如 '月亮结社'）
 */

/* ════════════════════════════════════════════════════════════════════ */
export const HARDCODED_CLASS_FEATURE_BUFFS = {

  /* ══════════════════════════════════════════════════════════════════
   *  野蛮人 (Barbarian)
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 无甲防御：AC = 10 + 敏调 + 体调，可用盾牌
  '野蛮人||unarmored_defense': [{
    effectType: 'armor_override',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: {
      base: { ref: 'abilityModifier', ability: 'con', add: 10 },
      applyDexMod: true,
      shieldCompatible: true,
    },
  }],

  // 20级 原初斗士：力量+4 体质+4，上限25
  '野蛮人||primal_champion': [{
    effectType: 'ability_score_uncapped',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: { str: 4, con: 4 },
    break20: { str: true, con: true },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  牧师 (Cleric)
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 圣职：二选一（保护者/奇术使），由 CLASS_FEATURE_CHOICE_REGISTRY 处理
  // 7级 受祝击：二选一（神圣打击/强力施法），由 CLASS_FEATURE_CHOICE_REGISTRY 处理
  // 14级 精通受祝击：升级二选一，由 CLASS_FEATURE_CHOICE_REGISTRY 处理

  /* ══════════════════════════════════════════════════════════════════
   *  德鲁伊 (Druid)
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 原初职能：二选一（术师/卫士），由 CLASS_FEATURE_CHOICE_REGISTRY 处理
  // 2级 荒野变形：主动变身，creature_transform 由 useBuffCalculator 动态构建
  // 7级 元素之怒：二选一，由 CLASS_FEATURE_CHOICE_REGISTRY 处理

  // 6级 进阶结社形态（月亮结社）：CON豁免+感知调整值
  '德鲁伊|月亮结社|improved_circle_forms': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { con: { ref: 'abilityModifier', ability: 'wis' } },
  }],

  // 14级 月辉形态（月亮结社）：攻击+2d10光耀伤害
  '德鲁伊|月亮结社|lunar_form': [{
    effectType: 'extra_damage_dice',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { plus: '2d10', type: '光耀' },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  战士 (Fighter) — 勇士子职
   * ══════════════════════════════════════════════════════════════════ */

  // 3级 精通重击（勇士）：重击范围 19-20
  '战士|勇士|improved_critical': [{
    effectType: 'crit_range_expand',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '19-20',
  }],

  // 15级 高效重击（勇士）：重击范围 18-20
  '战士|勇士|superior_critical': [{
    effectType: 'crit_range_expand',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '18-20',
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  武僧 (Monk)
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 无甲防御：AC = 10 + 敏调 + 感知调整值
  '武僧||unarmored_defense_monk': [{
    effectType: 'armor_override',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: {
      base: { ref: 'abilityModifier', ability: 'wis', add: 10 },
      applyDexMod: true,
    },
  }],

  // 14级 圆融自在：获得所有豁免熟练（str/dex 已有，补 con/int/wis/cha）
  '武僧||disciplined_survivor': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: {
      con: { ref: 'proficiency' },
      int: { ref: 'proficiency' },
      wis: { ref: 'proficiency' },
      cha: { ref: 'proficiency' },
    },
  }],

  // 20级 天人合一：敏捷+4 感知+4，上限25
  '武僧||body_and_mind': [{
    effectType: 'ability_score_uncapped',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: { dex: 4, wis: 4 },
    break20: { dex: true, wis: true },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  圣武士 (Paladin)
   * ══════════════════════════════════════════════════════════════════ */

  // 6级 守护灵光：所有豁免+魅力调整值（至少+1）
  '圣武士||aura_of_protection': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: {
      str: { ref: 'abilityModifier', ability: 'cha', min: 1 },
      dex: { ref: 'abilityModifier', ability: 'cha', min: 1 },
      con: { ref: 'abilityModifier', ability: 'cha', min: 1 },
      int: { ref: 'abilityModifier', ability: 'cha', min: 1 },
      wis: { ref: 'abilityModifier', ability: 'cha', min: 1 },
      cha: { ref: 'abilityModifier', ability: 'cha', min: 1 },
    },
  }],

  // 11级 光耀打击：近战命中+1d8光耀伤害
  '圣武士||radiant_strikes': [{
    effectType: 'extra_damage_dice',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { plus: '1d8', type: '光耀' },
  }],

  /* ── 荣耀之誓子职 ────────────────────────────────────────────────── */

  // 7级 迅捷灵光（荣耀之誓）：速度+10
  '圣武士|荣耀之誓|aura_of_alacrity': [{
    effectType: 'base_speed_increment',
    category: 'movement',
    scope: 'global',
    scopeDetail: [],
    value: { walk: 10 },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  游侠 (Ranger)
   * ══════════════════════════════════════════════════════════════════ */

  // 6级 越野：速度+10，攀爬/游泳速度=行走速度
  '游侠||roving': [{
    effectType: 'base_speed_increment',
    category: 'movement',
    scope: 'global',
    scopeDetail: [],
    value: { walk: 10, climb: { ref: 'speed' }, swim: { ref: 'speed' } },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  游荡者 (Rogue)
   * ══════════════════════════════════════════════════════════════════ */

  // 15级 圆滑心智：感知豁免和魅力豁免熟练
  '游荡者||slippery_mind': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: {
      wis: { ref: 'proficiency' },
      cha: { ref: 'proficiency' },
    },
  }],

  /* ── 盗贼子职 ────────────────────────────────────────────────────── */

  // 3级 梁上君子（盗贼）：攀爬速度=行走速度
  '游荡者|盗贼|second_story_work': [{
    effectType: 'base_speed_increment',
    category: 'movement',
    scope: 'global',
    scopeDetail: [],
    value: { climb: { ref: 'speed' } },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  魔契师 (Warlock) — 天界宗主子职
   * ══════════════════════════════════════════════════════════════════ */

  // 6级 光耀之魂（天界宗主）：光耀抗性 + 施法时光耀/火焰伤害+魅力调整值
  '魔契师|天界宗主|radiant_soul': [
    {
      effectType: 'resist_type',
      category: 'defense',
      scope: 'global',
      scopeDetail: [],
      value: ['radiant'],
    },
    {
      effectType: 'spell_damage_bonus',
      category: 'offense',
      scope: 'global',
      scopeDetail: [],
      value: {
        type: '',
        diceFloor: null,
        perDieBonus: 0,
        extraDice: '',
        flatBonus: { ref: 'abilityModifier', ability: 'cha', min: 0 },
      },
    },
  ],

  /* ══════════════════════════════════════════════════════════════════
   *  岚御法师
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 觉醒仪式：奥秘+2；历史熟练+死亡/恐惧豁免+2 为条件效果
  '岚御法师||rite_of_waking': [
    {
      effectType: 'skill_bonus',
      category: 'ability',
      scope: 'global',
      scopeDetail: [],
      value: { arcana: 2 },
    },
    {
      effectType: 'custom_condition',
      category: 'custom',
      scope: 'global',
      scopeDetail: [],
      value: '历史熟练；对抗死亡和恐惧效果的豁免+2',
    },
  ],

  /* ══════════════════════════════════════════════════════════════════
   *  斯兰亲卫
   * ══════════════════════════════════════════════════════════════════ */

  // 3级 钢铁意志：感知豁免+2
  '斯兰亲卫||iron_will': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { wis: 2 },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  武道家 (Martial Artist)
   * ══════════════════════════════════════════════════════════════════ */

  /* ── 天诛之剑子职 ────────────────────────────────────────────────── */

  // 1级 不屈灵魂（天诛之剑）：感知豁免+魅力调整值
  '武道家|天诛之剑|crusader_indomitable_soul': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { wis: { ref: 'abilityModifier', ability: 'cha' } },
  }],

  /* ── 贤者之剑子职 ────────────────────────────────────────────────── */

  // 1级 AC加值（贤者之剑）：轻甲/无盾时 AC = 10 + 敏调 + 感知调整值
  '武道家|贤者之剑|sage_ac_bonus': [{
    effectType: 'armor_override',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: {
      base: { ref: 'abilityModifier', ability: 'wis', add: 10 },
      applyDexMod: true,
    },
  }],

  // 3级 快速行动（贤者之剑）：先攻+熟练加值
  '武道家|贤者之剑|sage_quick_action': [{
    effectType: 'initiative_buff',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { proficient: true },
  }],

  /* ── 军道之剑子职 ────────────────────────────────────────────────── */

  // 1级 透析战斗（军道之剑）：敏捷豁免+智力调整值
  '武道家|军道之剑|warblade_battle_awareness': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { dex: { ref: 'abilityModifier', ability: 'int' } },
  }],

  // 3级 精通重击（军道之剑）：重击范围 19-20
  '武道家|军道之剑|warblade_improved_critical': [{
    effectType: 'crit_range_expand',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '19-20',
  }],

  // 10级 战斗技巧（军道之剑）：力量豁免+智力调整值
  '武道家|军道之剑|warblade_battle_tactics': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { str: { ref: 'abilityModifier', ability: 'int' } },
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  无相影门
   * ══════════════════════════════════════════════════════════════════ */

  // 2级 盲视：10尺盲视（无对应 BUFF 类型，用 custom_condition）
  '无相影门||blindsight': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '10尺盲视',
  }],
}
