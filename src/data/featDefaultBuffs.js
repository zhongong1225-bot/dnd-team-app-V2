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
 */

/* 简写辅助 */
const cond = (text) => [{
  effectType: 'custom_condition',
  category: 'custom',
  scope: 'global',
  scopeDetail: [],
  value: text,
}]

const asi = (text) => cond(`属性提升：${text}（需手动配置）`)

/* ════════════════════════════════════════════════════════════════════ */
export const HARDCODED_FEAT_BUFFS = {
  /* ── 起源专长 ────────────────────────────────────────────────────── */

  alert: [
    { effectType: 'initiative_buff', category: 'ability', scope: 'global', scopeDetail: [], value: { proficient: true } },
  ],

  crafter: cond('工具熟练×3（自选工匠工具）；非魔法物品 8 折；长休快速制作 1 件'),

  healer: cond('战地医师：消耗医疗包 1 次使用，5 尺内生物恢复 1 生命骰 + PB\n治疗重掷：恢复 HP 的骰子中 1 可重掷'),

  lucky: cond('幸运点 = PB，长休恢复\n· 花 1 点：给予 D20 检定优势\n· 花 1 点：对攻击你生物的 D20 施加劣势'),

  musician: [
    { effectType: 'instrument_proficiency', category: 'proficiency', scope: 'global', scopeDetail: [], value: ['自选乐器×3'] },
    { effectType: 'custom_condition', category: 'custom', scope: 'global', scopeDetail: [], value: '鼓舞之歌：短休/长休演奏，影响 PB 名盟友获英雄激励' },
  ],

  savage_attacker: cond('每回合 1 次：武器命中后重掷所有伤害骰，取任一组结果'),

  skilled: cond('自选技能/工具熟练共 3 项\n复选：可多次选取'),

  tavern_brawler: cond('徒手打击伤害改 1d4 + 力量调整值\n伤害骰 1 可重掷\n临时武器熟练\n推离 5 尺（每回合 1 次）'),

  tough: [
    { effectType: 'max_hp_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: { ref: 'level', mult: 2, add: 0 } },
  ],

  /* ── 通用专长 ────────────────────────────────────────────────────── */

  // 属性值提升（通用模板）
  ability_score_improvement: asi('自选 +2 或两项各 +1'),

  actor: asi('魅力 +1'),
  athlete: asi('力量或敏捷 +1'),
  charger: asi('力量或敏捷 +1'),
  chef: asi('体质或感知 +1'),
  cloud_hopper: asi('智力/感知/魅力 +1'),
  crossbow_expert: asi('敏捷 +1'),
  crusher: asi('力量或体质 +1'),
  defensive_duelist: asi('敏捷 +1'),
  dual_wielder: asi('力量或敏捷 +1'),
  durable: asi('体质 +1'),
  elemental_adept: asi('智力/感知/魅力 +1'),
  fey_touched: asi('智力/感知/魅力 +1'),
  grappler: asi('力量或敏捷 +1'),
  great_weapon_master: asi('力量 +1'),
  heavily_armored: asi('体质或力量 +1'),
  heavy_armor_master: asi('体质或力量 +1'),
  inspiring_leader: asi('感知或魅力 +1'),
  keen_mind: asi('智力 +1'),
  lightly_armored: asi('力量或敏捷 +1'),
  mage_slayer: asi('力量或敏捷 +1'),
  martial_weapon_training: asi('力量或敏捷 +1'),
  medium_armor_master: asi('力量或敏捷 +1'),
  moderately_armored: asi('力量或敏捷 +1'),
  mounted_combatant: asi('力量/敏捷/感知 +1'),
  observant: asi('智力或感知 +1'),
  piercer: asi('力量或敏捷 +1'),
  poisoner: asi('敏捷或智力 +1'),
  polearm_master: asi('敏捷或力量 +1'),
  resilient: asi('自选属性 +1'),
  ritual_caster: asi('智力/感知/魅力 +1'),
  sentinel: asi('力量或敏捷 +1'),
  shadow_touched: asi('智力/感知/魅力 +1'),

  sharpshooter: [
    asi('敏捷 +1'),
    { effectType: 'attack_bonus', category: 'offense', scope: 'ranged_attack', scopeDetail: [], value: 5 },
    { effectType: 'damage_bonus', category: 'offense', scope: 'ranged_attack', scopeDetail: [], value: 5 },
  ],

  shield_master: asi('力量 +1'),
  skill_expert: asi('自选属性 +1'),
  skulker: asi('敏捷 +1'),
  slasher: asi('力量或敏捷 +1'),

  speedy: [
    asi('敏捷或体质 +1'),
    { effectType: 'base_speed_increment', category: 'mobility_casting', scope: 'global', scopeDetail: [], value: { walk: 10 } },
  ],

  spell_sniper: asi('智力/感知/魅力 +1'),
  telekinetic: asi('智力/感知/魅力 +1'),
  telepathic: asi('智力/感知/魅力 +1'),
  war_caster: asi('智力/感知/魅力 +1'),
  weapon_master: asi('力量或敏捷 +1'),

  // 旧版变体
  artificer_initiate: asi('智力 +1'),
  chef_legacy: asi('体质或感知 +1'),
  crusher_legacy: asi('力量或体质 +1'),
  eldritch_adept: cond('自选 1 项魔能祈唤'),
  fey_touched_legacy: asi('智力/感知/魅力 +1'),
  fighting_initiate: cond('自选 1 项战斗风格'),
  gunner: asi('敏捷 +1'),

  iron_hero: asi('力量或敏捷 +1'),

  light_foot: cond('轻甲/无甲 AC+1；攻击动作可换半速移动；非魔法困难地形无视；穿过敌对空间'),

  metamagic_adept: cond('自选 2 项超魔法；2 术法点（长休恢复）'),

  piercer_legacy: asi('力量或敏捷 +1'),
  poisoner_legacy: cond('毒素伤害无视抗性；附赠动作涂毒；制毒工具熟练'),
  shadow_touched_legacy: asi('智力/感知/魅力 +1'),
  skill_expert_legacy: asi('自选属性 +1'),
  slasher_legacy: asi('力量或敏捷 +1'),
  telekinetic_legacy: asi('智力/感知/魅力 +1'),
  telepathic_legacy: asi('智力/感知/魅力 +1'),

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
  psionic_body: cond('每拥有 1 个灵能专长 → +6 HP'),
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

  epic_boon_combat_prowess: asi('自选 +1（上限 30）'),
  epic_boon_dimensional_travel: asi('自选 +1（上限 30）'),

  epic_boon_energy_resistance: [
    asi('自选 +1（上限 30）'),
    cond('自选 2 种能量抗性（长休可换）；能量重导（反应，60 尺传导）'),
  ],

  epic_boon_fate: asi('自选 +1（上限 30）'),

  epic_boon_fortitude: [
    asi('自选 +1（上限 30）'),
    { effectType: 'max_hp_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: 40 },
  ],

  epic_boon_irresistible_offense: asi('力量或敏捷 +1（上限 30）'),

  epic_boon_recovery: asi('自选 +1（上限 30）'),

  epic_boon_skill: [
    asi('自选 +1（上限 30）'),
    cond('所有技能熟练；自选 1 项获专精'),
  ],

  epic_boon_speed: [
    asi('自选 +1（上限 30）'),
    { effectType: 'base_speed_increment', category: 'mobility_casting', scope: 'global', scopeDetail: [], value: { walk: 30 } },
  ],

  epic_boon_spell_recall: asi('智力/感知/魅力 +1（上限 30）'),
  epic_boon_night_spirit: asi('自选 +1（上限 30）'),
  epic_boon_truesight: asi('自选 +1（上限 30）'),
  epic_boon_bloodshed: asi('自选 +1（上限 30）'),

  epic_boon_bountiful_health: asi('自选 +1（上限 30）'),

  epic_boon_communication: asi('智力/感知/魅力 +1（上限 30）'),
  epic_boon_desperate_resilience: asi('力量或体质 +1（上限 30）'),
  epic_boon_exquisite_radiance: asi('自选 +1（上限 30）'),
  epic_boon_fluid_forms: asi('智力/感知/魅力 +1（上限 30）'),
  epic_boon_fortunes_favor: asi('自选 +1（上限 30）'),

  epic_boon_poison_mastery: [
    asi('自选 +1（上限 30）'),
    { effectType: 'immune_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['poison'] },
    { effectType: 'condition_immunity', category: 'defense', scope: 'global', scopeDetail: [], value: ['poisoned'] },
  ],

  epic_boon_revelry: asi('智力/感知/魅力 +1（上限 30）'),

  epic_boon_terror: [
    { effectType: 'ability_score_uncapped', category: 'ability', scope: 'global', scopeDetail: [], value: { cha: 1 } },
    { effectType: 'condition_immunity', category: 'defense', scope: 'global', scopeDetail: [], value: ['frightened'] },
    { effectType: 'skill_bonus', category: 'ability', scope: 'global', scopeDetail: [], value: { intimidation: { ref: 'proficiency', mult: 2 } } },
  ],

  epic_boon_bright_sun: asi('体质/感知/魅力 +1（上限 30）'),

  epic_boon_furious_storm: [
    asi('智力/感知/魅力 +1（上限 30）'),
    { effectType: 'resist_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['lightning', 'thunder'] },
  ],

  epic_boon_soul_drinker: [
    asi('自选 +1（上限 30）'),
    { effectType: 'resist_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['cold', 'necrotic'] },
  ],

  epic_boon_blazing_dawn: [
    asi('自选 +1（上限 30）'),
    { effectType: 'immune_type', category: 'defense', scope: 'global', scopeDetail: [], value: ['radiant'] },
  ],

  epic_boon_looming_shadows: asi('自选 +1（上限 30）'),
  epic_boon_misty_escape: asi('智力/感知/魅力 +1（上限 30）'),

  /* ── 九剑特殊专长 ────────────────────────────────────────────────── */

  tob_martial_study: cond('选择 1 个流派，学习 1 个武术'),
  tob_martial_stance: cond('学习 1 个架势（需已学武术）'),
  tob_instant_clarity: cond('攻击技后附赠动作进入灵能专注（3 次/天）'),
}
