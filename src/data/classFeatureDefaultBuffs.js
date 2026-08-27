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

  /* ── 光明领域子职 ──────────────────────────────────────────────────── */

  // 3级 黎明曙光：消耗引导神力，30尺光环 2d10+牧师等级 光耀伤害
  '牧师|光明领域|radiance_of_the_dawn': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '消耗引导神力：30尺光环，2d10+牧师等级光耀伤害（体质豁免减半）',
  }],

  // 3级 守御之光：反应迫使30尺内攻击者劣势，次数=感知调整值（至少1）
  '牧师|光明领域|warding_flare': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '反应：迫使30尺内可见生物攻击检定劣势，次数=感知调整值（至少1），长休恢复',
  }],

  // 6级 精通守御之光：短休恢复次数；使用守御之光时给目标2d6+感知调整值临时HP
  '牧师|光明领域|improved_warding_flare': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '守御之光改为短休恢复；使用时给攻击目标2d6+感知调整值临时HP',
  }],

  // 17级 光冕：60尺明亮光照，范围内敌人对你光耀/火焰法术豁免劣势
  '牧师|光明领域|corona_of_light': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '附赠动作：60尺明亮光照+30尺微光，范围内敌人对你光耀/火焰法术豁免劣势',
  }],

  /* ── 生命领域子职 ──────────────────────────────────────────────────── */

  // 3级 生命门徒：治疗法术额外恢复 2+法术位环阶 HP
  '牧师|生命领域|disciple_of_life': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '消耗法术位施展治疗法术时，额外恢复 2+法术位环阶 生命值',
  }],

  // 3级 维持生命：消耗引导神力，恢复牧师等级×5 HP分配给浴血生物
  '牧师|生命领域|preserve_life': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '消耗引导神力：恢复牧师等级×5生命值，分配给30尺内浴血生物（至多恢复至上限一半）',
  }],

  // 6级 神祝医者：为他人施放治疗法术后，自己恢复 2+法术位环阶 HP
  '牧师|生命领域|blessed_healer': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '用法术位为他人治疗时，自己恢复 2+法术位环阶 生命值',
  }],

  // 17级 极效治疗：所有治疗骰取最大值
  '牧师|生命领域|supreme_healing': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '所有治疗骰子直接取最高值',
  }],

  /* ══════════════════════════════════════════════════════════════════
   *  德鲁伊 (Druid)
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 原初职能：二选一（术师/卫士），由 CLASS_FEATURE_CHOICE_REGISTRY 处理
  // 2级 荒野变形：主动变身，creature_transform 由 useBuffCalculator 动态构建
  // 7级 元素之怒：二选一，由 CLASS_FEATURE_CHOICE_REGISTRY 处理

  // 1级 德鲁伊语：秘密语言，DC15调查察觉
  '德鲁伊||druidic': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '德鲁伊秘密语言；始终准备动物交谈法术' },
  }],

  // 2级 荒野伙伴：消耗法术位或荒野变形次数施展寻获魔宠
  '德鲁伊||wild_companion': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '魔法动作消耗法术位或荒野变形次数施展寻获魔宠' },
  }],

  // 5级 荒野复苏：法术位与荒野变形次数互换
  '德鲁伊||wild_resurgence': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '每回合一次：无变形次数时消耗法术位获得1次；或消耗1次变形获得1个一环法术位' },
  }],

  // 18级 兽形施法：荒野变形下可施法
  '德鲁伊||beast_spells': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '可在荒野变形下施法（无需材料成分的法术）' },
  }],

  // 20级 大德鲁伊：不凋化形/自然术使/青春永驻
  '德鲁伊||archdruid': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '不凋化形：投先攻时若无变形次数则获得1次；自然术使：变形次数转法术位（1次=2环阶）；青春永驻：每10年身体仅老1年' },
  }],

  /* ── 月亮结社子职 ────────────────────────────────────────────────── */

  // 3级 结社形态（月亮结社）：CR=等级/3，AC=13+感知调整值，临时HP=等级×3
  '德鲁伊|月亮结社|circle_forms': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '荒野变形CR=德鲁伊等级÷3；AC=13+感知调整值（若更高）；临时HP=德鲁伊等级×3' },
  }],

  // 3级 月亮结社法术：始终准备特定法术
  '德鲁伊|月亮结社|circle_of_moon_spells': [{
    effectType: 'custom_condition',
    category: 'spellcasting',
    scope: 'global',
    scopeDetail: [],
    value: { description: '始终准备：3级点点星芒/疗伤术/月华之光；5级咒唤兽群；7级月光涌泉；9级群体疗伤术' },
  }],

  // 6级 进阶结社形态（月亮结社）：CON豁免+感知调整值
  '德鲁伊|月亮结社|improved_circle_forms': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { con: { ref: 'abilityModifier', ability: 'wis' } },
  }],

  // 10级 月光飞步（月亮结社）：附赠动作传送30尺
  '德鲁伊|月亮结社|moonlight_step': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '附赠动作传送30尺至可见空间，下次攻击优势；次数=感知调整值，长休恢复' },
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
    scope: 'aura',
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

  // 9级 弃绝众敌：引导神力使敌人恐慌
  '圣武士||abjure_foes': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '消耗引导神力：60尺内至多魅力调整值个目标感知豁免，失败则恐慌1分钟' },
  }],

  // 10级 勇气灵光：灵光内免疫恐慌
  '圣武士||aura_of_courage': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'aura',
    scopeDetail: [],
    value: { description: '你与守护灵光内盟友免疫恐慌' },
  }],

  // 11级 光耀打击：近战命中+1d8光耀伤害
  '圣武士||radiant_strikes': [{
    effectType: 'extra_damage_dice',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { plus: '1d8', type: '光耀' },
  }],

  // 14级 复原之触：圣疗可终止状态
  '圣武士||restoring_touch': [{
    effectType: 'custom_condition',
    category: 'utility',
    scope: 'global',
    scopeDetail: [],
    value: { description: '圣疗时每终止一种状态（目盲/魅惑/耳聋/恐慌/麻痹/震慑）花费5点' },
  }],

  // 18级 灵光增效：守护灵光范围提升至30尺
  '圣武士||aura_expansion': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'aura',
    scopeDetail: [],
    value: { description: '守护灵光范围从10尺提升至30尺' },
  }],

  /* ── 荣耀之誓子职 ────────────────────────────────────────────────── */

  // 3级 鼓舞斩（荣耀之誓）：至圣斩后消耗引导神力给临时HP
  '圣武士|荣耀之誓|inspiring_smite': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '至圣斩后消耗引导神力：30尺内生物共获得2d8+圣武士等级临时HP' },
  }],

  // 3级 荣耀之誓法术：始终准备特定法术
  '圣武士|荣耀之誓|oath_of_glory_spells': [{
    effectType: 'custom_condition',
    category: 'spellcasting',
    scope: 'global',
    scopeDetail: [],
    value: { description: '始终准备：3级光导箭/英雄气概；5级强化属性/魔化武器；9级加速术/防护能量；13级强迫术/行动自如；17级通晓传奇/悠兰德王者威仪' },
  }],

  // 3级 绝伦健将（荣耀之誓）：运动/特技优势，跳跃+10尺
  '圣武士|荣耀之誓|peerless_athlete': [{
    effectType: 'custom_condition',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: { description: '消耗引导神力1小时：力量（运动）和敏捷（特技）检定优势，跳远跳高+10尺' },
  }],

  // 7级 迅捷灵光（荣耀之誓）：速度+10
  '圣武士|荣耀之誓|aura_of_alacrity': [{
    effectType: 'base_speed_increment',
    category: 'movement',
    scope: 'global',
    scopeDetail: [],
    value: { walk: 10 },
  }],

  // 15级 辉煌防御（荣耀之誓）：反应给AC加值
  '圣武士|荣耀之誓|glorious_defense': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '反应：10尺内生物被击中时AC+魅力调整值（至少+1），失手可反击' },
  }],

  // 20级 现世传说（荣耀之誓）：魅力检定优势/重掷豁免/无误打击
  '圣武士|荣耀之誓|living_legend': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '附赠动作10分钟：魅力检定优势；反应重掷失败豁免；每回合一次武器失手改命中' },
  }],

  /* ── 守护之誓子职 ────────────────────────────────────────────────── */

  // 3级 肃卫干预（守护之誓）：反应传送替换攻击目标
  '圣武士|守护之誓|defensive_intervention': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '反应消耗引导神力：传送30尺至被攻击生物旁并成为攻击目标' },
  }],

  // 3级 刻印打击（守护之誓）：标记目标，攻击劣势/移动减速
  '圣武士|守护之誓|marking_strike': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '命中时标记目标至下回合结束：对你外目标攻击劣势，远离你时移动力2:1' },
  }],

  // 3级 守护之誓法术：始终准备特定法术
  '圣武士|守护之誓|oath_of_guardian_spells': [{
    effectType: 'custom_condition',
    category: 'spellcasting',
    scope: 'global',
    scopeDetail: [],
    value: { description: '始终准备：3级警报术/虔诚护盾；5级次等复原术/守护之链；9级希望信标/防护能量；13级防死结界/信仰守卫；17级高等复原术/死者复活' },
  }],

  // 7级 守护之仪（守护之誓）：生物可使用你的AC
  '圣武士|守护之誓|guarding_presence': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '附赠动作：5尺内魅力调整值个生物可使用你的AC代替其自身AC' },
  }],

  // 7级 振奋守御（守护之誓）：借机攻击两次
  '圣武士|守护之誓|inspiring_defense': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '你的借机攻击可攻击两次；守护之仪影响下的生物借机攻击也可两次' },
  }],

  // 15级 御者之护（守护之誓）：盟友HP降至1而非0
  '圣武士|守护之誓|ward_of_the_guardian': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '反应：被标记生物将盟友降至0HP时改为1HP，盟友可立即反击' },
  }],

  // 20级 守护天使（守护之誓）：100尺光环AC替换
  '圣武士|守护之誓|guardian_angel': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { description: '附赠动作1分钟：守护之仪变100尺光环；引导神力耗尽时重获1次；无需反应使用御者之护' },
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

  /* ── 魔契师基础特性 ────────────────────────────────────────────────── */

  // 1级 魔能祈唤：获得持久魔法能力，可随等级替换
  '魔契师||eldritch_invocations': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '获得魔能祈唤（持久魔法能力），升级时可替换一个',
  }],

  /* ── 邪魔宗主子职 ──────────────────────────────────────────────────── */

  // 3级 黑暗赐福：击杀获临时HP=魅力调整值+魔契师等级
  '魔契师|邪魔宗主|dark_ones_blessing': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '将敌人生命值降至0时（含10尺内友军击杀），获得临时HP=魅力调整值+魔契师等级',
  }],

  // 6级 黑暗强运：属性检定/豁免可加d10，次数=魅力调整值
  '魔契师|邪魔宗主|dark_ones_own_luck': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '属性检定或豁免时可加1d10（看到结果后），次数=魅力调整值（至少1），长休恢复',
  }],

  // 10级 邪魔体魄：短休后选一种伤害类型获得抗性
  '魔契师|邪魔宗主|fiendish_resilience': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '短休或长休后选一种伤害类型（除力场）获得抗性，下次短休前持续',
  }],

  /* ── 至高妖精宗主子职 ──────────────────────────────────────────────── */

  // 3级 妖精步伐：免法术位施迷踪步+可选额外效应
  '魔契师|至高妖精宗主|fey_presence': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '免法术位施展迷踪步，次数=魅力调整值（至少1），长休恢复；可选复苏/嘲弄步伐',
  }],

  // 6级 雾遁：受伤时反应施展迷踪步+可选无踪/惊惧步伐
  '魔契师|至高妖精宗主|misty_escape': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '受伤时反应施展迷踪步；可选无踪步伐（隐形）或惊惧步伐（2d10心灵伤害）',
  }],

  // 10级 斗转星移：魅惑免疫+受伤后反应减半伤害并反伤
  '魔契师|至高妖精宗主|beguiling_defenses': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '免疫魅惑；被命中后反应减半伤害并反伤攻击者（等同实际伤害），长休恢复',
  }],

  /* ── 天界宗主子职（补充） ──────────────────────────────────────────── */

  // 3级 治愈之光：d6治疗骰池，附赠动作消耗骰子治疗
  '魔契师|天界宗主|healing_light': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '治疗骰池=1+魔契师等级枚d6，附赠动作消耗骰子治疗（每轮至多魅力调整值枚），长休恢复',
  }],

  // 10级 天界韧性：秘法回流/休息后获临时HP=等级+魅力调整值
  '魔契师|天界宗主|celestial_resilience': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '秘法回流或休息后，自己获临时HP=魔契师等级+魅力调整值；可给5名可见生物临时HP=等级/2+魅力调整值',
  }],

  // （6级 光耀之魂 radiant_soul 已在上方定义：光耀抗性+施法+魅力调整值伤害）

  /* ══════════════════════════════════════════════════════════════════
   *  火铳手 (Gunslinger)
   * ══════════════════════════════════════════════════════════════════ */

  // 1级 火器专精：火器熟练+装填不引发借机攻击
  '火铳手||firearm_expertise': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '火器熟练；装填不引发借机攻击',
  }],

  // 1级 维稳射击：未移动时首次火器攻击优势
  '火铳手||steady_shot': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '未移动的回合，首次火器攻击具有优势',
  }],

  // 2级 专注点：专注点资源（每2级1点），短休恢复
  '火铳手||focus_points': [{
    effectType: 'custom_condition',
    category: 'custom',
    scope: 'global',
    scopeDetail: [],
    value: '专注点=floor(火铳手等级/2)，短休全部恢复',
  }],

  // 2级 预判射击：攻击时可加熟练加值到攻击骰或伤害骰
  '火铳手||predictive_shot': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '火器攻击时可加熟练加值到攻击骰或伤害骰',
  }],

  // 6级 精准射击：消耗1专注点，攻击骰+2（11级+3，17级+4）
  '火铳手||precise_shot': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '消耗1专注点：火器攻击骰+2（11级+3，17级+4）',
  }],

  // 7级 干扰射击：命中不造成伤害，迫使目标移动半速（最多30尺）
  '火铳手||disrupting_shot': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '火器命中时可不造成伤害，迫使目标消耗反应移动半速（最多30尺）',
  }],

  // 9级 致命专注：暴击骰-1（17级-2）
  '火铳手||deadly_focus': [{
    effectType: 'crit_range_expand',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: 2,
  }],

  // 15级 不屈精准：详见模组
  '火铳手||unwavering_precision': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '详见模组说明',
  }],

  // 20级 爆头：重击时目标≤100HP则死亡，否则额外10d10
  '火铳手||headshot': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '远程重击时：目标≤100HP则直接死亡，否则额外10d10伤害（短休恢复）',
  }],

  /* ── 战场先知子职 ──────────────────────────────────────────────────── */

  // 3级 隐匿专精：隐匿熟练或专精
  '火铳手|战场先知|gunslinger_oracle_stealth': [{
    effectType: 'custom_condition',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: '隐匿熟练；若已熟练则改为专精（熟练加值翻倍）',
  }],

  // 3级 威胁感应：察觉熟练或专精
  '火铳手|战场先知|gunslinger_oracle_perception': [{
    effectType: 'custom_condition',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: '察觉熟练；若已熟练则改为专精（熟练加值翻倍）',
  }],

  // 7级 猎手直觉：每回合一次免费察觉检定
  '火铳手|战场先知|gunslinger_oracle_hunter_instinct': [{
    effectType: 'custom_condition',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: '战斗中每回合一次不消耗动作进行察觉检定',
  }],

  // 14级 幽影身法：攻击后隐匿检定，成功则维稳射击仍生效
  '火铳手|战场先知|gunslinger_oracle_shadow_step': [{
    effectType: 'custom_condition',
    category: 'ability',
    scope: 'global',
    scopeDetail: [],
    value: '攻击后可隐匿检定，成功则本回合维稳射击优势仍生效（即使已移动）',
  }],

  /* ── 库罗骑士子职 ──────────────────────────────────────────────────── */

  // 3级 骑枪机动：骑乘时可将自身移动转移给坐骑
  '火铳手|库罗骑士|gunslinger_kuro_lance_maneuver': [{
    effectType: 'custom_condition',
    category: 'movement',
    scope: 'global',
    scopeDetail: [],
    value: '骑乘时可将自身移动距离转移给坐骑',
  }],

  // 7级 骑士守护：反应转移伤害给坐骑；坐骑豁免优势+免疫恐慌魅惑
  '火铳手|库罗骑士|gunslinger_kuro_knights_guard': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: '反应：转移伤害给坐骑；坐骑豁免优势且免疫恐慌与魅惑',
  }],

  // 14级 战场统御：骑乘攻击时坐骑可移动15尺；免疫对坐骑借机攻击
  '火铳手|库罗骑士|gunslinger_kuro_battle_command': [{
    effectType: 'custom_condition',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: '骑乘攻击时坐骑可移动15尺；骑乘期间免疫对坐骑的借机攻击',
  }],

  /* ── 敢死先锋子职 ──────────────────────────────────────────────────── */

  // 3级 血肉堡垒：每级+3HP上限；恐惧豁免优势
  '火铳手|敢死先锋|gunslinger_daredevil_fortress': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: '每火铳手等级+3HP上限；恐惧豁免优势',
  }],

  // 7级 铁血坚守：HP≤50%时感知/智力/魅力豁免优势
  '火铳手|敢死先锋|gunslinger_daredevil_iron_will': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: '当前HP≤上限一半时，感知/智力/魅力豁免优势',
  }],

  // 14级 绝命一息：致命伤害时消耗1专注点降至1HP
  '火铳手|敢死先锋|gunslinger_daredevil_last_stand': [{
    effectType: 'custom_condition',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: '致命伤害时消耗1专注点改为HP降至1（每短休一次）',
  }],

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
