/**
 * 专长默认 BUFF 效果（硬编码回退）
 *
 * 优先级：个人自定义 > 模组库默认（DM 配置）> 本文件硬编码
 * 当角色选择了某专长但既无个人 BUFF 补丁、也无模组库默认时，
 * getBuffsFromSelectedFeats 使用本映射作为回退。
 *
 * 设计原则：
 *  - 无条件被动数值 → 真实 BUFF 效果（自动参与计算）
 *  - 需要玩家选择 / 主动激活 / 条件判断 → custom_condition 描述
 *  - 制作/许可类 → 空数组（无数值效果）
 *  - ASI（属性值提升）由 featBuffChoices.js 的 choice panel 处理，此处不重复
 */

/* 简写辅助 */
const cond = (text) => [{
  effectType: 'custom_condition',
  category: 'custom',
  scope: 'global',
  scopeDetail: [],
  value: text,
}]

/* ════════════════════════════════════════════════════════════════════ */
export const HARDCODED_FEAT_BUFFS = {
  /* ── 起源专长 ────────────────────────────────────────────────────── */

  alert: [
    { effectType: 'initiative_buff', category: 'ability', scope: 'global', scopeDetail: [], value: { proficient: true } },
  ],

  crafter: cond('工具熟练×3（自选工匠工具）；非魔法物品 8 折；长休快速制作 1 件'),

  healer: cond('战地医师：消耗医疗包 1 次使用，5 尺内生物恢复 1 生命骰 + PB\n治疗重掷：恢复 HP 的子中 1 可重掷'),

  lucky: cond('幸运点 = PB，长休恢复\n· 花 1 点：给予 D20 检定优势\n· 花 1 点：对攻击你生物的 D20 施加劣势'),

  magic_initiate: cond('习得 2 道戏法 + 1 道一环法术（自选列表）；施法属性自选；无需法术位施展一次/长休'),

  musician: [
    { effectType: 'instrument_proficiency', category: 'proficiency', scope: 'global', scopeDetail: [], value: ['自选乐器×3'] },
    { effectType: 'custom_condition', category: 'custom', scope: 'global', scopeDetail: [], value: '鼓舞之歌：短休/长休演奏，影响 PB 名盟友获英雄激励' },
  ],

  savage_attacker: cond('每回合 1 次：武器命中后重掷所有伤害，取任一组结果'),

  skilled: cond('自选技能/工具熟练共 3 项\n复选：可多次选取'),

  tavern_brawler: cond('徒手打击伤害改 1d4 + 力量调整值\n伤害骰 1 可重掷\n临时武器熟练\n推离 5 尺（每回合 1 次）'),

  tough: [
    { effectType: 'max_hp_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: { ref: 'level', mult: 2, add: 0 } },
  ],

  /* ── 通用专长 ────────────────────────────────────────────────────── */

  // ASI 专长由 featBuffChoices.js 处理，此处仅保留非 ASI 机械效果

  charger: cond('Dash 动作后用近战武器命中：额外 1d8 伤害（同武器类型）；目标须 ≥ 大一号否则推离 10 尺'),

  crossbow_expert: [
    { effectType: 'weapon_proficiency', category: 'proficiency', scope: 'global', scopeDetail: [], value: ['hand_crossbow'] },
    { effectType: 'attack_bonus', category: 'offense', scope: 'ranged_attack', scopeDetail: [], value: { ref: 'proficiency', mult: 1 } },
    cond('装填属性无视；5 尺内有敌时远程攻击无劣势；附赠动作可用手弩攻击'),
  ],

  crusher: cond('钝击伤害暴击范围扩大至 19-20；命中后可将目标推离 5 尺（不触发借机攻击）'),

  defensive_duelist: cond('持用灵巧武器且被近战攻击时：反应动作 AC+PB 至该次攻击'),

  dual_wielder: [
    { effectType: 'ac_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: 1 },
    { effectType: 'weapon_proficiency', category: 'proficiency', scope: 'global', scopeDetail: [], value: ['light_melee'] },
    cond('双持不必轻武器；拔出/收起两把武器只需一个动作'),
  ],

  durable: cond('死亡豁免投出 1 视为 2；短休时生命骰恢复量 += 体质调整值 + 等级'),

  elemental_adept: cond('自选能量类型：该类型法术无视抗性；伤害骰 1 视为 2'),

  fey_touched: cond('习得迷踪步 + 自选一环法术（牧师/德鲁伊/法师）；无需法术位各施展一次/长休'),

  grappler: cond('徒手打击伤害 = 1d6 + 力量调整值；擒抱检定优势；擒抱目标对你也受擒'),

  great_weapon_master: cond('重武器命中 -5/+10 可选；近战重击或击杀后可附赠动作再攻击一次'),

  heavily_armored: cond('获得重甲熟练'),

  heavy_armor_master: [
    { effectType: 'ac_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: 1 },
    cond('非魔法钝击/穿刺/挥砍伤害减免 3'),
  ],

  inspiring_leader: cond('附赠动作演讲 1 分钟：PB 名盟友获 1d8 + 等级 临时 HP（10 分钟内有效）'),

  keen_mind: cond('被动感知（察觉）+5；被动智力（调查）+5；完美回忆 30 天内所见所闻'),

  lightly_armored: cond('获得轻甲熟练'),

  mage_slayer: cond('60 尺内生物施法：反应攻击该生物；专注豁免劣势；反应打断传送'),

  martial_weapon_training: [
    { effectType: 'weapon_proficiency', category: 'proficiency', scope: 'global', scopeDetail: [], value: ['martial'] },
  ],

  medium_armor_master: cond('穿中甲时敏捷上限改为 +3（原 +2）'),

  moderately_armored: cond('获得中甲和盾牌熟练'),

  mounted_combatant: cond('骑乘时攻击优势；迫使攻击者以你为目标（DC 10 敏捷豁免失败）；落马反应减半坠落'),

  observant: cond('被动感知（察觉）+5；被动智力（调查）+5；读唇语理解无声语言'),

  piercer: cond('穿刺伤害暴击范围扩大至 19-20；每回合 1 次重掷一个穿刺伤害骰'),

  polearm_master: [
    { effectType: 'damage_bonus', category: 'offense', scope: 'melee_attack', scopeDetail: [], value: { ref: 'proficiency', mult: 1 } },
    cond('附赠动作用长柄武器另一端攻击 1d4 伤害；敌人进入触及范围触发借机攻击'),
  ],

  resilient: cond('自选属性 +1 并获得该属性豁免熟练'),

  ritual_caster: cond('习得仪式施法；自选牧师/德鲁伊/法师列表；初始 2 道一环仪式法术'),

  sentinel: cond('借机攻击命中则目标速度降为 0；反应保护 5 尺内盟友；对伪装/变形生物攻击优势'),

  sharpshooter: [
    { effectType: 'attack_bonus', category: 'offense', scope: 'ranged_attack', scopeDetail: [], value: 5 },
    { effectType: 'damage_bonus', category: 'offense', scope: 'ranged_attack', scopeDetail: [], value: 5 },
    cond('远程攻击无视半/四分之三掩护；射程内无劣势；-5/+10 可选'),
  ],

  shield_master: [
    { effectType: 'ac_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: 1 },
    cond('持盾时附赠动作 shove；成功豁免则伤害减半；反应为盟友挡远程攻击'),
  ],

  skill_expert: cond('自选技能获专精（双倍熟练加值）'),

  skulker: cond('微光中远程攻击无劣势；躲藏仅需轻度遮蔽；潜行失败位置不暴露'),

  slasher: cond('重击时目标速度 -10 尺且攻击检定 -1（持续至你下回合结束）'),

  speedy: [
    { effectType: 'base_speed_increment', category: 'mobility_casting', scope: 'global', scopeDetail: [], value: { walk: 10 } },
  ],

  spell_sniper: cond('法术射程翻倍；无视半/四分之三掩护；学习一道需攻击检定的戏法'),

  telekinetic: cond('附赠动作 shove 30 尺内生物 5 尺（智力调整值决定方向）；隐形手 30 尺操纵物体'),

  telepathic: cond('心灵感应 60 尺；侦测智慧生物思想；附赠动作传递信息'),

  war_caster: cond('专注豁免优势；反应动作以法术代替借机攻击；持武器/盾牌仍可施法'),

  weapon_master: [
    { effectType: 'weapon_proficiency', category: 'proficiency', scope: 'global', scopeDetail: [], value: ['自选武器×4'] },
  ],

  // 旧版变体
  artificer_initiate: cond('习得奇械师戏法 + 修理术；获得工匠工具熟练'),
  chef_legacy: cond('烹饪食物提供临时 HP 和治疗效果'),
  crusher_legacy: cond('钝击伤害特性；推离能力'),
  eldritch_adept: cond('自选 1 项魔能祈唤'),
  fey_touched_legacy: cond('迷踪步 + 自选法术'),
  fighting_initiate: cond('自选 1 项战斗风格'),
  gunner: cond('火器熟练；装填属性无视；5 尺内射击无劣势'),
  iron_hero: cond('获得重甲熟练；力量 +1'),
  light_foot: cond('轻甲/无甲 AC+1；攻击动作可换半速移动；非魔法困难地形无视；穿过敌对空间'),
  metamagic_adept: cond('自选 2 项超魔法；2 术法点（长休恢复）'),
  piercer_legacy: cond('穿刺伤害特性；重掷能力'),
  poisoner_legacy: cond('毒素伤害无视抗性；附赠动作涂毒；制毒工具熟练'),
  shadow_touched_legacy: cond('隐身术 + 自选法术'),
  skill_expert_legacy: cond('技能专精'),
  slasher_legacy: cond('挥砍伤害特性；减速能力'),
  telekinetic_legacy: cond('念力推移'),
  telepathic_legacy: cond('心灵感应'),

  /* ── 制作物品专长（许可类，无数值效果） ─────────────────────────── */

  scribe_scroll: [],
  brew_potion: [],
  craft_magic_arms_armor: [],
  craft_rod: [],
  craft_staff: [],
  craft_wand: [],
  craft_wondrous_item: [],
  forge_ring: [],

  /* ── 灵能专长 ────────────────────────────────────────────────────── */

  psionic_overcome_barrier: cond('消耗灵能集中，尝试对墙/力场显能（奥秘检定 DC 10+硬度+厚度）'),
  psionic_twin_power: cond('消耗灵能集中，双发异能（效果作用两次）'),
  psionic_quicken: cond('消耗灵能集中，附赠动作展现异能'),
  psionic_chain: cond('消耗灵能集中，链化异能打击多个目标（每级 1 个，最多 20）'),
  psionic_combat: cond('专注获得熟练精通；智力/感知/体质 +1'),
  psionic_burn_self: cond('力量/敏捷/体质各 -1 → 恢复 2 魂力点（按比例）'),
  psionic_crystal_affinity: cond('获得灵晶仆'),
  psionic_body: [
    { effectType: 'max_hp_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: { ref: 'psionic_feat_count', mult: 6, add: 0 } },
  ],
  psionic_focus: [
    { effectType: 'save_dc_bonus', category: 'mobility_casting', scope: 'global', scopeDetail: [], value: 1 },
  ],
  psionic_fist: cond('消耗灵能集中，徒手/天生武器额外 2d6 伤害（5 级 4d6 / 11 级 5d6 / 17 级 6d6）'),
  psionic_shot: cond('消耗灵能集中，远程攻击额外 2d6 伤害（5 级 4d6 / 11 级 5d6 / 17 级 6d6）'),
  psionic_dodge: cond('灵能集中时获得反射闪避'),
  psionic_dazzling_energy: cond('单目标能量异能附带目眩 1 分钟（攻击/搜索/侦查 -1）'),
  psionic_deep_vision: cond('灵能集中时黑暗视觉 +30 尺'),
  psionic_charged_armor: cond('消耗法术环位，反应动作减少 10 点能量伤害'),
  psionic_wild_excitement: cond('攻击/豁免/伤害 +1（12 级 +2 / 20 级 +3），持续 = 角色等级回合，长休重置'),
  psionic_focus_shield: cond('灵能集中 + 持盾时：盾牌 AC+1，体质 +1'),
  psionic_invest_armor: cond('消耗灵能集中，护甲 AC+3'),
  psionic_privileged_energy: cond('自选能量类型（寒冷/电击/火焰/音波），该类型异能每伤害骰 +1'),
  psionic_resonance: cond('灵能集中 + 10 尺内有 3 级+灵能者：能力/技能检定、豁免 +2'),
  psionic_mystic_conflux: cond('同调上限 +1（4 个）；免费施放鉴定术 1 次/长休'),

  /* ── 星辰专长 ────────────────────────────────────────────────────── */

  star_memory: cond('消耗 1 辉点 + 反应，获得临时专长/能力 1 小时'),
  star_ring_of_radiance: cond('消耗 1 辉点 + 动作，悬空飞行 30 尺 1 小时（可升阶）'),
  star_compassionate_care: cond('消耗 1 辉点 + 动作，10 尺内所有生物恢复至满 HP（不死需豁免）'),
  star_divine_guidance: cond('消耗 1 辉点 + 动作，1 分钟内攻击检定均成功'),
  star_control_blink: cond('反应动作消失，动作再现（偏离 60 尺），充能 1d6 回合'),
  star_high_frequency: cond('恢复辉点数，1 分钟后累积 1 级力竭'),
  star_radiant_weapon: cond('消耗 1 辉点 + 反应，武器 +1d6 伤害；不死生物需豁免否则死亡'),
  star_radiant_armor: cond('消耗 1 辉点 + 反应，AC+5 持续 1 分钟'),
  star_luck: cond('消耗 1 辉点 + 反应，1 分钟内任何检定优势，投 1 可重骰'),
  star_mana_surge: cond('消耗反应 + 1 辉点，恢复所有 3 环法术位（可升阶）'),
  star_doppelganger: cond('创造灵体复制体，共享 HP/法术位，60 尺内 1 分钟'),

  /* ── 传奇恩惠 ────────────────────────────────────────────────────── */

  epic_boon_combat_prowess: cond('自选属性 +1（上限 30）；攻击检定优势时可重掷一个 d20'),
  epic_boon_dimensional_travel: cond('自选属性 +1（上限 30）；附赠动作传送 30 尺'),
  epic_boon_energy_resistance: [
    cond('自选 2 种能量抗性（长休可换）；能量重导（反应，60 尺传导）'),
  ],
  epic_boon_fate: cond('自选属性 +1（上限 30）；扭曲命运之力'),
  epic_boon_fortitude: [
    { effectType: 'max_hp_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: 40 },
  ],
  epic_boon_irresistible_offense: cond('力量或敏捷 +1（上限 30）；攻击无视非魔法抗性/免疫'),
  epic_boon_recovery: cond('自选属性 +1（上限 30）；强力恢复能力'),
  epic_boon_skill: cond('所有技能熟练；自选 1 项获专精'),
  epic_boon_speed: [
    { effectType: 'base_speed_increment', category: 'mobility_casting', scope: 'global', scopeDetail: [], value: { walk: 30 } },
  ],
  epic_boon_spell_recall: cond('智力/感知/魅力 +1（上限 30）；法术溯回能力'),
  epic_boon_night_spirit: cond('自选属性 +1（上限 30）；暗夜精魂之力'),
  epic_boon_truesight: cond('自选属性 +1（上限 30）；真实视觉'),
  epic_boon_bloodshed: cond('自选属性 +1（上限 30）；血海漂橹之力'),
  epic_boon_bountiful_health: cond('自选属性 +1（上限 30）；生机勃发'),
  epic_boon_communication: cond('智力/感知/魅力 +1（上限 30）；八面玲珑'),
  epic_boon_desperate_resilience: cond('力量或体质 +1（上限 30）；绝境逢生'),
  epic_boon_exquisite_radiance: cond('自选属性 +1（上限 30）；熠熠生辉'),
  epic_boon_fluid_forms: cond('智力/感知/魅力 +1（上限 30）；变幻无常'),
  epic_boon_fortunes_favor: cond('自选属性 +1（上限 30）；命运眷顾'),
  epic_boon_poison_mastery: [
    { effectType: 'immune_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['poison'] },
    { effectType: 'condition_immunity', category: 'defense', scope: 'global', scopeDetail: [], value: ['poisoned'] },
  ],
  epic_boon_revelry: cond('智力/感知/魅力 +1（上限 30）；夜宴狂欢'),
  epic_boon_terror: [
    { effectType: 'ability_score_uncapped', category: 'ability', scope: 'global', scopeDetail: [], value: { cha: 1 } },
    { effectType: 'condition_immunity', category: 'defense', scope: 'global', scopeDetail: [], value: ['frightened'] },
    { effectType: 'skill_bonus', category: 'ability', scope: 'global', scopeDetail: [], value: { intimidation: { ref: 'proficiency', mult: 2 } } },
  ],
  epic_boon_bright_sun: cond('体质/感知/魅力 +1（上限 30）；旭日骄阳'),
  epic_boon_furious_storm: [
    { effectType: 'resist_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['lightning', 'thunder'] },
  ],
  epic_boon_soul_drinker: [
    { effectType: 'resist_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['cold', 'necrotic'] },
  ],
  epic_boon_blazing_dawn: [
    { effectType: 'immune_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['radiant'] },
  ],
  epic_boon_looming_shadows: cond('自选属性 +1（上限 30）；厄影迫现'),
  epic_boon_misty_escape: cond('智力/感知/魅力 +1（上限 30）；雾影遁形'),

  /* ── 九剑特殊专长 ────────────────────────────────────────────────── */

  tob_martial_study: cond('选择 1 个流派，学习 1 个武术'),
  tob_martial_stance: cond('学习 1 个架势（需已学武术）'),
  tob_instant_clarity: cond('攻击技后附赠动作进入灵能专注（3 次/天）'),
}
