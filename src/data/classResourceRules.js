/**
 * 职业资源规则定义
 *
 * 每个职业的资源特性（狂暴次数、气点、术法点等）在此声明。
 * 用于：
 *  - 自动计算资源上限（computeResourceMax）
 *  - 选职业时自动填充资源列表
 *  - 短休/长休恢复
 *
 * 数据结构：
 *  resourceKey   — 唯一标识（存入 classResources[].resourceKey）
 *  name          — 显示名
 *  classKey      — 对应职业名（CLASS_DATA 的 key）
 *  levelTable    — 按职业等级的上限表（index 0 = 等级 0，index 1 = 等级 1 ...）
 *  formula       — 动态公式：'level' | abilityKey（如 'cha'、'wis'）
 *  abilityDep    — 依赖属性调整值的来源（'cha'/'wis'/'int' 等）
 *  recovery      — 'short'（短休恢复）| 'long'（长休恢复）| 'none' | 'special'
 *  shortRestAdd  — 短休时额外恢复次数（如狂暴短休+1）
 *  diceType      — 若资源是骰子（卓越骰/灵能骰），记录骰面
 *  group         — 分组显示用
 */

/* ── 等级表常量 ─────────────────────────────────────────────── */

// 野蛮人狂暴次数（PHB 2024）
const RAGE_TABLE = [0, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 6]
// 野蛮人伤害加值（PHB 2024）
const RAGE_DMG_TABLE = [0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
// 牧师引导神力次数
const CHANNEL_DIVINITY_TABLE = [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 4]
// 德鲁伊荒野变形次数
const WILD_SHAPE_TABLE = [0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4]
// 战士回气次数
const SECOND_WIND_TABLE = [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3]
// 战士动作如潮次数
const ACTION_SURGE_TABLE = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]
// 战士不屈次数
const INDOMITABLE_TABLE = [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3]
// 圣武士引导神力次数（同牧师）
// 圣武士圣疗池 = 等级 × 5
// 圣武士神圣惩击次数 = 等级表（同引导神力）
// 游荡者诡诈打击骰
const SNEAK_ATTACK_DICE_TABLE = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3]
// 术士术法点 = 等级（最大 20）
// 魔契师契约位单独系统（已在 classDatabase.js 中）

/* ── 资源规则注册表 ─────────────────────────────────────────── */

/**
 * @typedef {Object} ResourceRule
 * @property {string} resourceKey
 * @property {string} name
 * @property {string} classKey
 * @property {number[]} [levelTable]  按等级上限（index = 等级）
 * @property {string} [formula]       'level' | abilityKey
 * @property {string} [abilityDep]    依赖的调整值属性
 * @property {'short'|'long'|'none'|'special'} recovery
 * @property {number} [shortRestAdd]  短休额外恢复
 * @property {number} [diceType]      骰面（如 8 = d8）
 * @property {string} [group]         分组
 * @property {string} [note]          备注
 * @property {number} [minLevel]      最低职业等级（未达等级时不自动添加）
 */

/** @type {ResourceRule[]} */
export const RESOURCE_RULES = [
  /* ── 野蛮人 ──────────────────────────────────────────── */
  {
    resourceKey: 'rage',
    name: '狂暴',
    classKey: '野蛮人',
    levelTable: RAGE_TABLE,
    recovery: 'short',
    shortRestAdd: 1,
    note: '短休恢复全部，先攻时重置',
    group: '核心',
  },
  {
    resourceKey: 'rage_damage',
    name: '狂暴伤害加值',
    classKey: '野蛮人',
    levelTable: RAGE_DMG_TABLE,
    recovery: 'none',
    note: '被动加值，不消耗次数',
    group: '核心',
  },

  /* ── 吟游诗人 ────────────────────────────────────────── */
  {
    resourceKey: 'bardic_inspiration',
    name: '吟游诗人激励',
    classKey: '吟游诗人',
    formula: 'cha',
    abilityDep: 'cha',
    recovery: 'long',
    note: '上限 = CHA 调整值（最少 1）',
    group: '核心',
  },

  /* ── 牧师 ────────────────────────────────────────────── */
  {
    resourceKey: 'channel_divinity',
    name: '引导神力',
    classKey: '牧师',
    levelTable: CHANNEL_DIVINITY_TABLE,
    recovery: 'short',
    shortRestAdd: 1,
    group: '核心',
  },
  {
    resourceKey: 'divine_intervention',
    name: '神圣干预',
    classKey: '牧师',
    levelTable: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    recovery: 'long',
    note: '18 级起可用，每长休 1 次',
    group: '高等',
  },

  /* ── 德鲁伊 ──────────────────────────────────────────── */
  {
    resourceKey: 'wild_shape',
    name: '荒野变形',
    classKey: '德鲁伊',
    levelTable: WILD_SHAPE_TABLE,
    recovery: 'short',
    shortRestAdd: 1,
    group: '核心',
  },

  /* ── 战士 ────────────────────────────────────────────── */
  {
    resourceKey: 'second_wind',
    name: '回气',
    classKey: '战士',
    levelTable: SECOND_WIND_TABLE,
    recovery: 'short',
    group: '核心',
  },
  {
    resourceKey: 'action_surge',
    name: '动作如潮',
    classKey: '战士',
    levelTable: ACTION_SURGE_TABLE,
    recovery: 'short',
    group: '核心',
  },
  {
    resourceKey: 'indomitable',
    name: '不屈',
    classKey: '战士',
    levelTable: INDOMITABLE_TABLE,
    recovery: 'long',
    group: '核心',
  },
  {
    resourceKey: 'superiority_dice',
    name: '卓越骰',
    classKey: '战士',
    levelTable: [0, 0, 0, 0, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5],
    diceType: 8,
    recovery: 'short',
    note: '战斗大师子职业',
    group: '子职业',
  },

  /* ── 武僧 ────────────────────────────────────────────── */
  {
    resourceKey: 'ki',
    name: '气点',
    classKey: '武僧',
    formula: 'level',
    recovery: 'short',
    note: '上限 = 武僧等级',
    group: '核心',
  },
  {
    resourceKey: 'unarmored_movement',
    name: '无甲移动加值',
    classKey: '武僧',
    levelTable: [0, 0, 10, 10, 10, 15, 15, 15, 20, 20, 20, 25, 25, 25, 30, 30, 30, 35, 35, 35, 40],
    recovery: 'none',
    note: '被动速度加值（需无甲/僧服）',
    group: '被动',
  },
  {
    resourceKey: 'martial_arts_die',
    name: '武艺骰',
    classKey: '武僧',
    levelTable: [0, 4, 4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 8, 10, 10, 10, 10, 12, 12, 12, 12],
    recovery: 'none',
    note: 'd4→d6→d8→d10→d12',
    group: '被动',
  },

  /* ── 圣武士 ──────────────────────────────────────────── */
  {
    resourceKey: 'lay_on_hands',
    name: '圣疗',
    classKey: '圣武士',
    formula: 'level_x5',
    recovery: 'long',
    note: '上限 = 等级 × 5',
    group: '核心',
  },
  {
    resourceKey: 'paladin_channel_divinity',
    name: '引导神力',
    classKey: '圣武士',
    levelTable: CHANNEL_DIVINITY_TABLE,
    recovery: 'short',
    shortRestAdd: 1,
    group: '核心',
  },
  {
    resourceKey: 'divine_smite_free',
    name: '神圣惩击（免费）',
    classKey: '圣武士',
    levelTable: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    recovery: 'long',
    note: '每长休 1 次免费使用',
    group: '核心',
  },

  /* ── 游侠 ────────────────────────────────────────────── */
  {
    resourceKey: 'favored_enemy_free_cast',
    name: '宿敌（免费施法）',
    classKey: '游侠',
    levelTable: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    recovery: 'long',
    note: '猎人印记免费施放',
    group: '核心',
  },

  /* ── 游荡者 ──────────────────────────────────────────── */
  {
    resourceKey: 'sneak_attack_dice',
    name: '诡诈打击骰',
    classKey: '游荡者',
    levelTable: SNEAK_ATTACK_DICE_TABLE,
    diceType: 6,
    recovery: 'none',
    note: '被动骰子数（d6）',
    group: '核心',
  },
  {
    resourceKey: 'lucky_strike',
    name: '幸运一击',
    classKey: '游荡者',
    levelTable: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4],
    recovery: 'short',
    note: '游荡子职业特性',
    group: '子职业',
  },

  /* ── 术士 ────────────────────────────────────────────── */
  {
    resourceKey: 'sorcery_points',
    name: '术法点',
    classKey: '术士',
    formula: 'level',
    recovery: 'long',
    note: '上限 = 术士等级（最大 20）',
    group: '核心',
  },

  /* ── 魔契师 ──────────────────────────────────────────── */
  // 契约魔法法术位已在 classDatabase.js 的 PACT_SLOTS_BY_LEVEL 中单独处理
  // 此处仅记录魔能祈唤等非物质资源
  {
    resourceKey: 'invocations',
    name: '魔能祈唤',
    classKey: '魔契师',
    recovery: 'none',
    note: '通过 selectedInvocations 管理，非消耗型资源',
    group: '被动',
  },

  /* ── 法师 ────────────────────────────────────────────── */
  {
    resourceKey: 'arcane_recovery',
    name: '奥术回想',
    classKey: '法师',
    formula: 'level_half',
    recovery: 'long',
    note: '短休恢复法术位，总环阶 ≤ 等级/2（向上取整）',
    group: '核心',
  },

  /* ── 魂灵学者 ────────────────────────────────────────── */
  {
    resourceKey: 'anima_points',
    name: '魂力点',
    classKey: '魂灵学者',
    formula: 'level',
    recovery: 'long',
    note: '上限 = 角色等级',
    group: '核心',
  },

  /* ── 狂念者 ──────────────────────────────────────────── */
  {
    resourceKey: 'wild_impulse',
    name: '狂野冲动',
    classKey: '狂念者',
    formula: 'level',
    recovery: 'long',
    note: '风险资源，使用有反噬',
    group: '核心',
  },

  /* ── 火铳手 ──────────────────────────────────────────── */
  {
    resourceKey: 'focus_points',
    name: '专注点',
    classKey: '火铳手',
    formula: 'level_half_ceil',
    recovery: 'short',
    note: '上限 = ceil(等级/2)',
    group: '核心',
  },

  /* ── 器魂术士 ────────────────────────────────────────── */
  {
    resourceKey: 'artifact_sorcery',
    name: '器魂术法点',
    classKey: '器魂术士',
    formula: 'level',
    recovery: 'long',
    note: '类似术士术法点',
    group: '核心',
  },

  /* ── 圣魂之刃 ────────────────────────────────────────── */
  {
    resourceKey: 'blade_channel_divinity',
    name: '引导神力',
    classKey: '圣魂之刃',
    levelTable: CHANNEL_DIVINITY_TABLE,
    recovery: 'short',
    shortRestAdd: 1,
    group: '核心',
  },

  /* ── 岚御法师 ────────────────────────────────────────── */
  // 岚御法师的招式/步法通过 martialProgress 管理
  // 奥术之怒：一次性能力（消耗法术位），通过 BUFF 编辑器/主动技能管理，不作为资源点

  /* ── 武道家 ──────────────────────────────────────────── */
  {
    resourceKey: 'martial_rage',
    name: '天诛之剑怒气',
    classKey: '武道家',
    subclass: '天诛之剑',
    levelTable: RAGE_TABLE,
    recovery: 'short',
    shortRestAdd: 1,
    note: '类狂暴机制',
    group: '核心',
  },

  /* ── 无相影门 ────────────────────────────────────────── */
  {
    resourceKey: 'shadow_summon',
    name: '召影',
    classKey: '无相影门',
    minLevel: 8,
    formula: 'int',
    abilityDep: 'int',
    recovery: 'long',
    note: '上限 = INT 调整值，8级获得',
    group: '核心',
  },
  {
    resourceKey: 'shadow_indomitable',
    name: '不屈',
    classKey: '无相影门',
    levelTable: [0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
    recovery: 'long',
    group: '核心',
  },

  /* ── 全局资源（繁星模组） ─────────────────────────────── */
  {
    resourceKey: 'star_points',
    name: '星辰点',
    classKey: '_global',
    formula: 'totalLevel_div5',
    recovery: 'long',
    note: '总等级每5级1点，长休恢复',
    group: '星辰',
  },

  /* ── 专长资源 ─────────────────────────────────────────── */
  {
    resourceKey: 'lucky_points',
    name: '幸运点',
    classKey: '_feat',
    featId: 'lucky',
    fixedMax: 3,
    recovery: 'long',
    note: '幸运专长，固定3点，长休恢复',
    group: '专长',
  },
  {
    resourceKey: 'healer_kit',
    name: '医疗包使用次数',
    classKey: '_feat',
    featId: 'healer',
    fixedMax: 1,
    recovery: 'none',
    note: '医疗师专长，战地医师能力消耗医疗包一次使用次数',
    group: '专长',
  },
]

/* ── 查询函数 ─────────────────────────────────────────────── */

/**
 * 获取某职业的所有资源规则
 * @param {string} classKey 职业名
 * @returns {ResourceRule[]}
 */
export function getResourceRulesForClass(classKey) {
  return RESOURCE_RULES.filter((r) => r.classKey === classKey)
}

/**
 * 根据角色职业列表，获取所有应自动填充的资源规则
 * @param {Array<{name:string, level:number}>} classes — getCharacterClasses() 返回值
 * @returns {ResourceRule[]}
 */
export function getAutoResources(classes) {
  const rules = []
  // 全局资源（如星辰点）只添加一次
  const globalRules = RESOURCE_RULES.filter((r) => r.classKey === '_global')
  for (const r of globalRules) {
    if (r.recovery === 'none') continue
    rules.push(r)
  }
  for (const c of classes) {
    const classRules = getResourceRulesForClass(c.name)
    for (const r of classRules) {
      // 跳过"通过其他系统管理"的条目（如魔能祈唤 → selectedInvocations）
      if (r.note?.includes('selectedInvocations')) continue
      // 跳过无恢复机制的被动条目（如狂暴伤害、无甲移动、武艺骰 — 由 BUFF/速度系统处理）
      if (r.recovery === 'none') continue
      // 子职过滤：规则指定了 subclass 时，只在该子职下生效
      if (r.subclass && c.subclass !== r.subclass) continue
      // 等级门槛：未达最低等级时不自动添加
      if (r.minLevel && c.level < r.minLevel) continue
      rules.push(r)
    }
  }
  return rules
}

/**
 * 计算单个资源的上限
 * @param {ResourceRule} rule
 * @param {Object} ctx
 * @param {number} ctx.classLevel   — 该职业等级
 * @param {number} ctx.totalLevel   — 角色总等级
 * @param {Object} ctx.abilities    — { str, dex, con, int, wis, cha }
 * @returns {number}
 */
export function computeResourceMax(rule, { classLevel = 1, totalLevel = 1, abilities = {} } = {}) {
  const lv = Math.max(0, Math.min(20, Math.floor(classLevel)))
  const abilityMod = (key) => {
    if (!key || !abilities[key]) return 0
    return Math.floor((Number(abilities[key]) - 10) / 2)
  }

  // 0. 固定值
  if (rule.fixedMax != null) {
    return rule.fixedMax
  }

  // 1. 等级表
  if (rule.levelTable) {
    return rule.levelTable[lv] ?? 0
  }

  // 2. 公式
  if (rule.formula) {
    switch (rule.formula) {
      case 'level':
        return Math.max(1, lv)
      case 'level_x5':
        return Math.max(5, lv * 5)
      case 'level_half':
        return Math.max(1, Math.ceil(lv / 2))
      case 'level_half_ceil':
        return Math.max(1, Math.ceil(lv / 2))
      case 'totalLevel_div5':
        return Math.max(0, Math.floor(totalLevel / 5))
      case 'cha':
        return Math.max(1, abilityMod('cha'))
      case 'wis':
        return Math.max(1, abilityMod('wis'))
      case 'int':
        return Math.max(1, abilityMod('int'))
      default:
        // 尝试作为属性 key
        if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(rule.formula)) {
          return Math.max(1, abilityMod(rule.formula))
        }
        return 0
    }
  }

  return 0
}

/**
 * 生成资源条目（用于写入 char.classResources）
 * @param {ResourceRule} rule
 * @param {Object} ctx — 传给 computeResourceMax
 * @returns {{ id: string, name: string, current: number, max: number, resourceKey: string, recovery: string }}
 */
export function createResourceEntry(rule, ctx) {
  const max = computeResourceMax(rule, ctx)
  return {
    id: `res_${rule.resourceKey}_${Date.now()}`,
    name: rule.name,
    current: max,
    max,
    resourceKey: rule.resourceKey,
    recovery: rule.recovery,
    ...(rule.diceType ? { diceType: rule.diceType } : {}),
    ...(rule.note ? { note: rule.note } : {}),
  }
}
