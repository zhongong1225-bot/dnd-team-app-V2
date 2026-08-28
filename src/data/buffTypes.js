/**
 * D&D 动态 BUFF 系统 - 数据字典与分类逻辑
 * 二级联动：大类 -> 具体效果
 */

/** 伤害类型选项（统一简称，无英文展示；value 为程序用键） */
export const DAMAGE_TYPES = [
  { value: 'acid', label: '强酸', desc: '腐蚀性液体，消化酶' },
  { value: 'bludgeoning', label: '钝击', desc: '钝器，压紧，坠落' },
  { value: 'cold', label: '寒冷', desc: '冰水，寒风' },
  { value: 'fire', label: '火焰', desc: '烈焰，难以忍受的高温' },
  { value: 'force', label: '力场', desc: '纯粹的魔法能量' },
  { value: 'lightning', label: '闪电', desc: '高压电' },
  { value: 'necrotic', label: '暗蚀', desc: '窃取生命的能量' },
  { value: 'piercing', label: '穿刺', desc: '獠牙，刺穿' },
  { value: 'poison', label: '毒素', desc: '毒性气体，蛇毒' },
  { value: 'psychic', label: '心灵', desc: '摧毁心灵的能量' },
  { value: 'radiant', label: '光耀', desc: '神圣能量，炽热的辐射' },
  { value: 'slashing', label: '挥砍', desc: '爪子，切割用具' },
  { value: 'thunder', label: '雷鸣', desc: '足以形成冲击波的响声' },
  { value: 'penetrate', label: '贯通', desc: '子弹造成的伤害可穿透魔法能力' },
  { value: 'healing', label: '治疗', desc: '恢复生命值' },
]

/** 状态免疫选项 */
export const CONDITION_OPTIONS = [
  { value: 'charmed', label: '魅惑' },
  { value: 'frightened', label: '恐慌' },
  { value: 'poisoned', label: '中毒' },
  { value: 'blinded', label: '目盲' },
  { value: 'deafened', label: '耳聋' },
  { value: 'paralyzed', label: '麻痹' },
  { value: 'stunned', label: '震慑' },
  { value: 'unconscious', label: '昏迷' },
  { value: 'psychic_collapse', label: '灵崩' },
  { value: 'grappled', label: '受擒' },
  { value: 'incapacitated', label: '失能' },
  { value: 'invisible', label: '隐形' },
  { value: 'petrified', label: '石化' },
  { value: 'prone', label: '倒地' },
  { value: 'restrained', label: '束缚' },
  { value: 'exhaustion', label: '力竭' },
]

/** 状态效果文案（规则摘要，选择状态后显示） */
export const CONDITION_DESCRIPTIONS = {
  blinded: `目盲状态期间，你将遭受以下这些效应。
看不见。你无法视物，且会自动失败于任何需要视觉的属性检定。
攻击影响。以你为目标的攻击检定具有优势，而你进行的攻击检定具有劣势。`,
  charmed: `魅惑状态期间，你将遭受以下这些效应。
无法伤害魅惑源。你无法攻击魅惑源，也无法将其作为伤害性能力或魔法效应的对象。
社交优势。魅惑源对你进行的任何有关社交的属性检定均具有优势。`,
  deafened: `耳聋状态期间，你将遭受以下这个效应。
听不见。你无法听声，且会自动失败于任何依赖听觉的属性检定。`,
  exhaustion: `力竭状态期间，你将遭受以下这些效应。
力竭等级。此状态可叠加。每次你获得此状态，力竭等级都增加1级。当你力竭等级累加到6级你将死亡。
D20检定影响。当你进行一次D20检定时，此次检定将减去你力竭等级2倍的值。
速度降低。你的速度减少等于你力竭等级5倍尺。
移除力竭等级。你可以依靠完成长休来降低1级力竭等级。当你力竭等级降至0时，此状态结束。`,
  frightened: `恐慌状态期间，你将遭受以下这些效应。
属性检定与攻击影响。只要恐惧源在你的视线范围内，你进行的属性检定与攻击检定就具有劣势。
无法靠近。你无法自愿地向靠近恐惧源的方向移动。`,
  grappled: `受擒状态期间，你将遭受以下这些效应。
速度归零。你的速度变为0，且无法被增加。
攻击影响。除擒抱者外，你对其他任何目标进行的攻击检定都具有劣势。
带动。擒抱者移动时，其可以拖拽或承载你，但其每移动1尺都需要为此额外消耗1尺移动力。若你的体型为微型或你的体型小于擒抱者两级及以上，擒抱者拖拽/承载你将不需要额外消耗移动力。`,
  incapacitated: `失能状态期间，你将遭受以下这些效应。
无法行动。你无法执行任何动作、附赠动作以及反应。
无法专注。你的专注将被打断。
无法说话。你无法说话。
措手不及。如果你在陷入失能状态期间投掷先攻，你的先攻检定将具有劣势。`,
  invisible: `隐形状态期间，你将获得以下这些效应。
出其不意。如果你在投掷先攻时处于隐形状态，你的先攻检定将具有优势。
隐蔽。任何需要能够看见目标的效应都不会影响到你，除非效应的源头能通过某种方式看到你。你所着装或携带的一切装备也同样会被隐蔽起来。
攻击影响。以你为目标的攻击检定具有劣势，而你进行的攻击检定具有优势。如果一个生物能以某种方式看见你，那么你在面对该生物时不会获得这一增益。`,
  paralyzed: `麻痹状态期间，你将遭受以下这些效应。
失能。你陷入失能状态。
速度归零。你的速度变为0，且无法被增加。
豁免影响。你自动失败于力量豁免检定与敏捷豁免检定。
攻击影响。以你为目标的攻击检定具有优势。
自动重击。若攻击者位于你5尺内，其任何命中你的攻击检定都会变为重击。`,
  petrified: `石化状态期间，你将遭受以下这些效应。
化为非活动材质。你与你穿着或携带的所有非魔法物品将被变化为坚固的、非活动的材质（通常是石头）。你的重量变为原本的十倍，且你将停止老化。
失能。你陷入失能状态。
速度归零。你的速度变为0，且无法被增加。
攻击影响。以你为目标的攻击检定具有优势。
豁免影响。你自动失败于力量豁免检定与敏捷豁免检定。
伤害全抗。你具有所有伤害的抗性。
中毒免疫。你具有中毒状态的免疫。`,
  poisoned: `中毒状态期间，你将遭受以下这个效应。
属性检定与攻击影响。你进行的攻击检定与属性检定具有劣势。`,
  prone: `倒地状态期间，你将遭受以下这些效应。
阻碍移动。你唯二的移动选项是匍匐移动或是消耗你速度一半数值（向下取整）的移动力起立，并由此终止这一状态。如果你的速度为0，你无法起立。
攻击影响。你进行的攻击检定具有劣势。若攻击者位于你5尺内，其以你为目标的攻击检定具有优势；若攻击者不位于你5尺内，其以你为目标的攻击检定具有劣势。`,
  restrained: `束缚状态期间，你将遭受以下这些效应。
速度归零。你的速度变为0，且无法被增加。
攻击影响。以你为目标的攻击检定具有优势，而你进行的攻击检定具有劣势。
豁免影响。你进行的敏捷豁免检定具有劣势。`,
  stunned: `震慑状态期间，你将遭受以下这些效应。
失能。你陷入失能状态。
豁免影响。你自动失败于力量豁免检定与敏捷豁免检定。
攻击影响。以你为目标的攻击检定具有优势。`,
  unconscious: `昏迷状态期间，你将遭受以下这些效应。
迟钝。你陷入失能状态与倒地状态，你手上持握的东西也会全数掉落。此状态结束时，倒地状态并不会因此结束。
速度归零。你的速度变为0，且无法被增加。
攻击影响。以你为目标的攻击检定具有优势。
豁免影响。你自动失败于力量豁免检定与敏捷豁免检定。
自动重击。若攻击者位于你5尺内，其任何命中你的攻击检定都会变为重击。
无知觉。你无法感知到你周遭的事物。`,
  psychic_collapse: `灵崩（房规 · 与魂力点灵崩症一致）：
施法（消耗法术位的施法）前，须先通过一次 DC16 的体质豁免（视为专注检定）。若失败：法术失败，法术位仍照常消耗。若成功：法术正常生效；下一回合，该法术应在原目标、原地点再结算一次（由 DM/玩家手动执行；执行后在角色卡上清除「灵崩回响」提醒）。戏法不消耗环位，不受本条环位消耗影响。`,
}

/** 力竭等级文案（2024 规则摘要） */
export const EXHAUSTION_DESCRIPTIONS = {
  1: 'D20 检定 -2',
  2: 'D20 检定 -4，速度减 10 尺',
  3: 'D20 检定 -6，速度减 15 尺',
  4: 'D20 检定 -8，速度减 20 尺',
  5: 'D20 检定 -10，速度减 25 尺',
  6: '死亡',
}

/** 属性键 */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

/** 属性键 -> 中文名（用于列表展示，不显示英文） */
export const ABILITY_NAMES_ZH = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

/** 伤害穿透特性 - 忽略伤害抗性可选类型（与 DAMAGE_TYPES 简称一致） */
export const PIERCING_DAMAGE_OPTIONS = [
  { value: 'fire', label: '火焰' },
  { value: 'cold', label: '寒冷' },
  { value: 'lightning', label: '闪电' },
  { value: 'acid', label: '强酸' },
  { value: 'poison', label: '毒素' },
  { value: 'radiant', label: '光耀' },
  { value: 'necrotic', label: '暗蚀' },
]

/** 伤害骰一行编辑中「骰子」下拉选项：D4～D12，以及 2d6/2d8（兼容旧 UI） */
export const DAMAGE_DICE_OPTIONS = [
  { value: '1d4', label: '1d4' },
  { value: '1d6', label: '1d6' },
  { value: '1d8', label: '1d8' },
  { value: '1d10', label: '1d10' },
  { value: '1d12', label: '1d12' },
  { value: '2d6', label: '2d6' },
  { value: '2d8', label: '2d8' },
]

/** 伤害骰一行编辑中「骰子面数」下拉：仅面数 d4～d12，骰子个数用数字输入 */
export const DICE_SIDES_OPTIONS = [
  { value: 4, label: 'd4' },
  { value: 6, label: 'd6' },
  { value: 8, label: 'd8' },
  { value: 10, label: 'd10' },
  { value: 12, label: 'd12' },
]

/** 伤害骰一行编辑中「箭」下拉选项 */
export const DAMAGE_DICE_ARROW_OPTIONS = [
  { value: '', label: '无' },
  { value: '固定', label: '固定' },
  { value: '每回合', label: '每回合' },
  { value: '命中时', label: '命中时' },
]

/** 特殊感官选项 */
export const SPECIAL_SENSES_OPTIONS = [
  { value: 'blindsight', label: '盲视' },
  { value: 'darkvision', label: '黑暗视觉' },
  { value: 'tremorsense', label: '震颤感知' },
  { value: 'truesight', label: '真实视觉' },
]

/** 伤害关系类型（抗性/免疫/易伤） */
export const DAMAGE_RELATION_OPTIONS = [
  { value: 'resist', label: '抗性' },
  { value: 'immune', label: '免疫' },
  { value: 'vulnerable', label: '易伤' },
]

/** 护甲熟练选项 */
export const ARMOR_PROFICIENCY_OPTIONS = [
  { value: 'light', label: '轻甲' },
  { value: 'medium', label: '中甲' },
  { value: 'heavy', label: '重甲' },
  { value: 'shield', label: '盾牌' },
]

/** 武器熟练选项 */
export const WEAPON_PROFICIENCY_OPTIONS = [
  { value: 'simple', label: '简易武器' },
  { value: 'martial', label: '军用武器' },
]

/** 载具熟练选项 */
export const VEHICLE_PROFICIENCY_OPTIONS = [
  { value: 'land', label: '陆上载具' },
  { value: 'water', label: '水上载具' },
  { value: 'air', label: '空中载具' },
]

/** 乐器熟练选项 */
export const INSTRUMENT_PROFICIENCY_OPTIONS = [
  { value: 'bagpipes', label: '风笛' },
  { value: 'drum', label: '鼓' },
  { value: 'dulcimer', label: '扬琴' },
  { value: 'flute', label: '长笛' },
  { value: 'horn', label: '号角' },
  { value: 'lute', label: '鲁特琴' },
  { value: 'lyre', label: '里拉琴' },
  { value: 'pan_flute', label: '排箫' },
  { value: 'shawm', label: '芦笛' },
  { value: 'viol', label: '提琴' },
]

/** 工具熟练选项（工匠工具 + 工具包 + 赌具） */
export const TOOL_PROFICIENCY_OPTIONS = [
  { value: 'alchemist_supplies', label: '炼金工具' },
  { value: 'brewer_supplies', label: '酿酒工具' },
  { value: 'calligrapher_supplies', label: '书法工具' },
  { value: 'carpenter_tools', label: '木匠工具' },
  { value: 'cartographer_tools', label: '制图工具' },
  { value: 'cobbler_tools', label: '鞋匠工具' },
  { value: 'cook_utensils', label: '厨师工具' },
  { value: 'glassblower_tools', label: '玻璃匠工具' },
  { value: 'jeweler_tools', label: '珠宝匠工具' },
  { value: 'leatherworker_tools', label: '皮匠工具' },
  { value: 'mason_tools', label: '石匠工具' },
  { value: 'painter_supplies', label: '画家工具' },
  { value: 'potter_tools', label: '陶匠工具' },
  { value: 'smith_tools', label: '铁匠工具' },
  { value: 'tinker_tools', label: '修补工具' },
  { value: 'weaver_tools', label: '织布工具' },
  { value: 'woodcarver_tools', label: '木雕工具' },
  { value: 'disguise_kit', label: '易容工具' },
  { value: 'forgery_kit', label: '文书伪造工具' },
  { value: 'herbalism_kit', label: '草药工具' },
  { value: 'navigator_tools', label: '领航工具' },
  { value: 'poisoner_kit', label: '毒药工具' },
  { value: 'thieves_tools', label: '盗贼工具' },
  { value: 'gaming_set_dice', label: '赌具（子）' },
  { value: 'gaming_set_dragonchess', label: '赌具（龙棋）' },
  { value: 'gaming_set_cards', label: '赌具（纸牌）' },
  { value: 'gaming_set_three_dragon', label: '赌具（三龙牌）' },
]

/** 语言熟练选项 */
export const LANGUAGE_PROFICIENCY_OPTIONS = [
  { value: 'abyssal', label: '深渊语' },
  { value: 'celestial', label: '天界语' },
  { value: 'common', label: '通用语' },
  { value: 'draconic', label: '龙语' },
  { value: 'elvish', label: '精灵语' },
  { value: 'giant', label: '巨人语' },
  { value: 'goblin', label: '地精语' },
  { value: 'kerlo', label: '刻洛语' },
  { value: 'loxodon', label: '象族语' },
  { value: 'merfolk', label: '人鱼语' },
  { value: 'minotaur', label: '牛头人语' },
  { value: 'sphinx', label: '斯芬克斯语' },
  { value: 'sylvan', label: '木族语' },
  { value: 'vidoken', label: '维多肯语' },
]

/** D&D 2024 武器精通词条 */
export const WEAPON_MASTERY_OPTIONS = [
  { value: 'sap', label: 'Sap（命中后目标对你攻击劣势）' },
  { value: 'topple', label: 'Topple（命中后目标力量豁免失败倒地）' },
  { value: 'push', label: 'Push（命中后推开目标 10 尺）' },
  { value: 'slow', label: 'Slow（命中后目标速度减半）' },
  { value: 'vex', label: 'Vex（命中后下次攻击该目标优势）' },
  { value: 'cleave', label: 'Cleave（命中后可攻击另一生物）' },
  { value: 'nick', label: 'Nick（轻武器额外攻击不耗附赠动作）' },
  { value: 'graze', label: 'Graze（失手仍造成属性调整值伤害）' },
  { value: 'dazzle', label: 'Dazzle（命中后目标攻击劣势）' },
]

/** 从「1d6 穿刺」或「攻击」字符串解析出 { minus, plus, o1, o2, type, o3 }，用于回填伤害模块；末尾「 #附注」写入 o3 */
export function parseDamageString(str) {
  if (!str || typeof str !== 'string') return { minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }
  let s = str.trim()
  let o3 = ''
  const hashIdx = s.lastIndexOf(' #')
  if (hashIdx >= 0) {
    o3 = s.slice(hashIdx + 2).trim()
    s = s.slice(0, hashIdx).trim()
  }
  if (!s) return { minus: '', plus: '', o1: '', o2: '', type: '', o3 }
  const withPlus = s.match(/^(\d*)\s*[+＋]\s*(\d*d\d+|\d+)\s*(.*)$/i)
  if (withPlus) {
    return { minus: (withPlus[1] || '').trim(), plus: String(withPlus[2]).toLowerCase(), o1: '', o2: '', type: (withPlus[3] || '').trim(), o3 }
  }
  /** 多用武器：1d8/1d10 钝击、1d8+1/1d10+1 钝击 */
  const versatile = s.match(/^(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\/\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)(?:\s+(.+))?$/i)
  if (versatile) return { minus: '', plus: `${String(versatile[1]).toLowerCase()}/${String(versatile[2]).toLowerCase()}`, o1: '', o2: '', type: (versatile[3] || '').trim(), o3 }
  /** 2d6+5 钝击、13d6+13 闪电（骰子段可含末尾加值，兼容 1d8 + 0 钝击 等旧格式空格） */
  const diceType = s.match(/^(\d*d\d+(?:\s*[+-]\s*\d+)?)\s+(.+)$/i)
  if (diceType) return { minus: '', plus: String(diceType[1]).toLowerCase(), o1: '', o2: '', type: (diceType[2] || '').trim(), o3 }
  const simple = s.match(/^(\d*d\d+|\d+)\s+(.+)$/i)
  if (simple) return { minus: '', plus: String(simple[1]).toLowerCase(), o1: '', o2: '', type: (simple[2] || '').trim(), o3 }
  const diceOnly = s.match(/^(\d*d\d+(?:\s*[+-]\s*\d+)?)$/i)
  if (diceOnly) return { minus: '', plus: String(diceOnly[1]).toLowerCase(), o1: '', o2: '', type: '', o3 }
  /** 仅存附注时经外层 .trim() 可能变成「#备注」 */
  const onlyNote = s.match(/^#(.+)$/)
  if (onlyNote) return { minus: '', plus: '', o1: '', o2: '', type: '', o3: (onlyNote[1] || '').trim() }
  return { minus: '', plus: '', o1: '', o2: '', type: s, o3 }
}

/** 将伤害模块 value（parseDamageString 返回结构）格式化为「攻击」字段字符串，如 "1d6 穿刺"、"0+1d8 挥砍"；o3 非空时追加「 #附注」 */
export function formatDamageForAttack(obj) {
  if (!obj || typeof obj !== 'object') return ''
  const { minus, plus, type, o3 } = obj
  const parts = []
  if (minus !== '' && minus !== undefined) parts.push(minus + '+')
  if (plus) parts.push(plus)
  if (type) parts.push(type)
  let out = parts.join(' ').trim()
  const note = o3 != null && String(o3).trim() !== '' ? String(o3).trim() : ''
  if (note) out = out ? `${out} #${note}` : `#${note}`
  return out
}

/** 兼容旧 UI 的选项（仅用于迁移） */
export const PIERCING_ELEMENT_OPTIONS = PIERCING_DAMAGE_OPTIONS.slice(0, 5)
export const PIERCING_ALIGNMENT_OPTIONS = PIERCING_DAMAGE_OPTIONS.slice(5, 7)

/** 将伤害穿透特性 value（对象）格式化为展示文案，如「忽略伤害抗性：闪电、光」；兼容旧 shape（element/alignment） */
export function formatDamagePiercingTraitsValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const pierce = Array.isArray(value.pierce)
    ? value.pierce
    : [...(Array.isArray(value.element) ? value.element : []), ...(Array.isArray(value.alignment) ? value.alignment : [])]
  if (pierce.length === 0) return ''
  const labels = pierce.map((v) => PIERCING_DAMAGE_OPTIONS.find((o) => o.value === v)?.label ?? v)
  return '忽略伤害抗性：' + labels.join('、')
}

/**
 * BUFF 效果类型 - 二级联动（大类）
 * 第一级：大类 (category)
 * 第二级：具体效果 (key, label, dataType, subSelect, hidden)
 */
const CATEGORY_ORDER = ['ability', 'offense', 'defense', 'mobility_casting', 'active_release', 'container', 'proficiency', 'choice', 'custom']

export const BUFF_TYPES = {
  ability: {
    // 合并「属性基础修正」+「移动与机动」
    label: '属性/移动',
    color: 'gold',
    effects: [
      { key: 'ability_score', label: '属性熟练调整', dataType: 'object', subSelect: 'abilityProficiency' },
      { key: 'ability_override', label: '属性值上限', dataType: 'object', subSelect: 'abilityScores' },
      { key: 'ability_score_uncapped', label: '属性增加', dataType: 'object', subSelect: 'abilityScores' },
      { key: 'extra_attunement_slots', label: '额外同调位', dataType: 'number' },
      // 豁免检定增强：数值加值+优势配置
      { key: 'save_bonus', label: '豁免检定增强', dataType: 'object', subSelect: 'abilityScoresAndAdvantage' },
      { key: 'adv_save', label: '豁免检定优势', dataType: 'boolean', hidden: true },
      // 先攻：固定加值 + 可选「先攻获得熟练加值」（按角色等级 PB）
      { key: 'initiative_buff', label: '先攻', dataType: 'object', subSelect: 'initBonusAndProficiency' },
      // 移动相关（从 mobility_casting 迁入）
      { key: 'base_speed_increment', label: '速度增加', dataType: 'object', subSelect: 'baseSpeedIncrement' },
      { key: 'terrain_ignore', label: '地形无视', dataType: 'boolean' },
      { key: 'speed_bonus', label: '移动速度', dataType: 'number', hidden: true },
      { key: 'flight_speed', label: '飞行速度', dataType: 'object', subSelect: 'flightSpeed', hidden: true },
    ],
  },
  offense: {
    label: '攻击/伤害',
    color: 'red',
    effects: [
      // 表格：命中加值（仅影响攻击检定）
      { key: 'attack_bonus', label: '命中加值', dataType: 'object', subSelect: 'numberAndAdvantage' },
      // 表格：伤害加值（仅影响伤害）
      { key: 'damage_bonus', label: '固定伤害加值', dataType: 'object', subSelect: 'numberAndAdvantage' },
      // 旧版：命中/伤害加值。保留以兼容旧 Buff，但新建时隐藏。
      { key: 'attack_damage_bonus', label: '命中/伤害加值', dataType: 'object', subSelect: 'numberAndAdvantage', hidden: true },
      // 表格：攻击距离
      // 互动调整方式：数字输入（尺），用于记录近战/远程的基础攻击距离。
      { key: 'attack_distance_range', label: '攻击距离', dataType: 'number' },
      // 表格：攻击范围（影响到的区域/目标）
      // 互动调整方式：下拉选择「半径/直径」，配合数字输入（尺，步进 5），例如「半径 10 尺」。
      { key: 'attack_area', label: '攻击范围', dataType: 'object', subSelect: 'attackAreaSize' },
      // 表格：伤害穿透特性
      // 互动调整方式：标签多选：
      //   ☑️ 视为魔法
      //   ☑️ 视为银质
      //   ☑️ 元素穿透: 忽略 [火/冷/雷/酸/毒] 抗性
      //   ☑️ 正邪穿透: 忽略 [光/暗] 抗性
      // dataType: array + 自定义子选择器 damagePiercingTraits
      { key: 'damage_piercing_traits', label: '伤害穿透', dataType: 'array', subSelect: 'damagePiercingTraits' },
      // 暴击范围扩大：仅本件物品；武器攻击快捷投掷威胁高亮按「当前这把武器」自己的附魔，不因其它已装备武器串用
      // 互动调整方式：范围选项：默认 20，可选 19-20、18-20。
      { key: 'crit_range_expand', label: '暴击范围扩大', dataType: 'text' },
      // 暴击范围覆盖：明确范围（19-20、18-20），多个效果取最低威胁下限
      { key: 'crit_range_override', label: '暴击范围（覆盖）', dataType: 'number' },
      // 暴击范围增量：-N，多个效果可叠加
      { key: 'crit_range_increment', label: '暴击范围（+N）', dataType: 'number' },
      // 暴击×：仅作用于「该件物品」自身；战斗手段里每把武器单独读自己的附魔，不会因其它已装备武器上的×4而串用
      { key: 'crit_extra_dice', label: '暴击×', dataType: 'number' },
      // 表格：伤害骰（自定义一行：箭 - 数字 + 骰子 箭 类型 箭，箭为下拉）
      { key: 'extra_damage_dice', label: '伤害骰', dataType: 'object', subSelect: 'damageDiceInline' },
      // 表格：弹药无限
      // 互动调整方式：勾选开关，表示「远程攻击不消耗弹药」。
      { key: 'infinite_ammo', label: '弹药无限', dataType: 'boolean' },
      // 武器攻击改为使用施法属性（智力/感知/魅力）计算命中与伤害
      { key: 'spell_ability_attack', label: '施法属性命中', dataType: 'object', subSelect: 'spellAbilityForAttack' },
      // 额外攻击次数（如 haste 给一次额外攻击）
      { key: 'extra_attack', label: '额外攻击', dataType: 'number' },
      // 额外动作资源（如 action surge 给额外动作）
      { key: 'extra_action_resource', label: '额外动作资源', dataType: 'number' },
    ],
  },
  defense: {
    label: '防御/生存',
    color: 'orange',
    effects: [
      { key: 'ac_bonus', label: '额外AC', dataType: 'number' },
      /** AC覆盖：用于法师护甲、武僧无甲护甲等修改基础AC的效果。value: { base, applyDexMod, maxDexBonus?, extra, shieldCompatible? } */
      { key: 'armor_override', label: 'AC覆盖', dataType: 'object', subSelect: 'armorOverride' },
      /** 统一伤害关系：抗性/免疫/易伤合并为一个效果。value: { types: string[], relation: 'resist'|'immune'|'vulnerable' } */
      { key: 'damage_type_relation', label: '伤害关系', dataType: 'object', subSelect: 'damageTypeRelation' },
      { key: 'resist_type', label: '伤害抗性', dataType: 'array', subSelect: 'damageType', hidden: true },
      { key: 'immune_type', label: '伤害免疫', dataType: 'array', subSelect: 'damageType', hidden: true },
      { key: 'vulnerable_type', label: '伤害易伤', dataType: 'array', subSelect: 'damageType', hidden: true },
      /** 固定值：每次受到伤害时再减去该数值（在免疫/易伤/抗性之后结算，见 useBuffCalculator.calculateDamage） */
      { key: 'damage_reduction', label: '伤害减免', dataType: 'number' },
      /** 按伤害类型的固定减免。value: { types: string[], reduction: number } */
      { key: 'damage_reduction_typed', label: '类型减免', dataType: 'object', subSelect: 'damageReductionTyped' },
      { key: 'max_hp_bonus', label: '生命上限', dataType: 'number' },
      { key: 'temp_hp', label: '临时生命', dataType: 'number' },
      { key: 'regeneration', label: '再生', dataType: 'number' },
      { key: 'condition_immunity', label: '状态免疫', dataType: 'array', subSelect: 'condition' },
      /** 特殊感官：黑暗视觉、盲视等。value: { senses: string[], range: number } */
      { key: 'special_senses', label: '特殊感官', dataType: 'object', subSelect: 'specialSenses' },
      /** 治疗增强：治疗效果加值。value: number */
      { key: 'healing_bonus', label: '治疗增强', dataType: 'number' },
      /** 死亡豁免加值。value: number */
      { key: 'death_save_bonus', label: '死亡豁免加值', dataType: 'number' },
      /** 防死：一次 HP 降至 0 以下时，强制改为 1 并消耗该效果 */
      { key: 'death_ward', label: '防死', dataType: 'boolean' },
    ],
  },
  // 施法优化
  mobility_casting: {
    label: '施法',
    color: 'purple',
    effects: [
      { key: 'concentration_save_enhance', label: '专注增强', dataType: 'object', subSelect: 'numberAndAdvantage' },
      { key: 'spell_range_extension', label: '施法距离延伸', dataType: 'text' },
      { key: 'spell_attack_bonus', label: '法术攻击加值', dataType: 'number' },
      { key: 'save_dc_bonus', label: 'DC', dataType: 'number' },
      { key: 'spell_damage_bonus', label: '施法增伤', dataType: 'object', subSelect: 'spellDamageBonus' },
      { key: 'damage_dice_bonus', label: '每伤害骰+1', dataType: 'number' },
      { key: 'min_dice_value', label: '最低骰子数', dataType: 'number' },
      // 以下保留旧 key，供已有数据与计算器解析
      { key: 'init_bonus', label: '先攻', dataType: 'number', hidden: true },
      { key: 'concentration', label: '专注', dataType: 'object', subSelect: 'numberAndAdvantage', hidden: true },
      { key: 'charge', label: '充能数', dataType: 'number', hidden: true },
    ],
  },
  /** 主动释放：具有主动使用/释放能力的效果，需要配套释放按钮 UI */
  active_release: {
    label: '主动释放',
    color: 'cyan',
    effects: [
      // 统一充能物品编辑器：充能数 + 回能方式 + 消耗效果（内含法术/奇能/护盾）
      { key: 'charge_item', label: '释放效果', dataType: 'object', subSelect: 'chargeItem' },
      // 变身：引用生物库中的生物，主动激活（已迁入 charge_item 子效果）
      { key: 'creature_transform', label: '变身', dataType: 'object', subSelect: 'creatureTransform', hidden: true },
      // 法术位恢复：单环恢复 / 多环恢复（已迁入 charge_item 子效果）
      { key: 'restore_spell_slots_v2', label: '法术位恢复', dataType: 'object', subSelect: 'restoreSpellSlots', hidden: true },
      // ── 以下旧 key 保留供已有数据兼容，不在新增下拉中显示 ──
      { key: 'contained_spell', label: '内含法术', dataType: 'object', subSelect: 'containedSpell', hidden: true },
      { key: 'ac_cap_stone_layer', label: '瓦石层', dataType: 'number', hidden: true },
      { key: 'recharge_long_rest', label: '长休恢复', dataType: 'object', subSelect: 'chargeRecovery', hidden: true },
      { key: 'recharge_dawn', label: '黎明恢复', dataType: 'object', subSelect: 'chargeRecovery', hidden: true },
      { key: 'charge', label: '充能数', dataType: 'number', hidden: true },
    ],
  },
  /** 容器/储物：允许该物品卡收纳其他物品（使用 entry.nestedInventory） */
  container: {
    label: '储物',
    color: 'emerald',
    effects: [{ key: 'item_storage', label: '容量', dataType: 'number' }],
  },
  /** 技能与熟练：技能增强 + 各种熟练 */
  proficiency: {
    label: '技能/熟练',
    color: 'teal',
    effects: [
      { key: 'skill_bonus', label: '技能增强', dataType: 'object', subSelect: 'skillsAndAdvantage' },
      { key: 'adv_skill', label: '技能检定优势', dataType: 'boolean', hidden: true },
      { key: 'specific_tool_proficiency', label: '工具/乐器熟练', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'toolAndInstrument' },
      { key: 'instrument_proficiency', label: '乐器熟练', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'instrument', hidden: true },
      { key: 'armor_proficiency', label: '护甲熟练', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'armor' },
      { key: 'weapon_proficiency', label: '武器熟练', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'weapon' },
      { key: 'language_proficiency', label: '语言熟练', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'language' },
      { key: 'vehicle_proficiency', label: '各类载具熟练', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'vehicle' },
      { key: 'weapon_mastery', label: '精通武器', dataType: 'array', subSelect: 'proficiencyChecklist', proficiencyOptions: 'weaponMastery' },
    ],
  },
  /** 与防御/攻击等大类同级：自由描述类状态，不参与数值计算 */
  /** 选择型 BUFF：玩家从多个命名选项中选择一个，仅应用选中选项的效果 */
  choice: {
    label: '选项效果（多选一）',
    color: 'violet',
    choiceType: true,
    effects: [
      { key: 'choice', label: '选择', dataType: 'object', subSelect: 'choice' },
    ],
  },
  custom: {
    label: '自定义',
    color: 'slate',
    effects: [{ key: 'custom_condition', label: ' 自由填写 (状态)', dataType: 'text' }],
  },
}

/** 默认具有容器储物效果的物品 ID */
export const ITEM_STORAGE_DEFAULT_ITEM_IDS = ['bag_of_holding', 'leomund_secret_chest']

/** 判断条目是否具有容器储物效果（含默认物品） */
export function hasItemStorageEffect(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (ITEM_STORAGE_DEFAULT_ITEM_IDS.includes(entry.itemId)) return true
  const effects = entry.effects
  if (!Array.isArray(effects)) return false
  return effects.some((e) => e && e.effectType === 'item_storage' && e.value === true)
}

/** 旧称/别称 -> 统一简称（兼容历史数据） */
const DAMAGE_TYPE_ALIASES = { 贯穿: '贯通', 冷冻: '寒冷', 辐射: '光耀', 死灵: '暗蚀' }

/** 根据伤害类型 value 或已有中文简称返回统一中文 label（界面不展示英文） */
export function getDamageTypeLabel(value) {
  if (value == null || value === '') return ''
  const v = String(value).trim()
  if (DAMAGE_TYPE_ALIASES[v]) return DAMAGE_TYPE_ALIASES[v]
  const byValue = DAMAGE_TYPES.find((d) => d.value === v.toLowerCase())
  if (byValue) return byValue.label
  const byLabel = DAMAGE_TYPES.find((d) => d.label === v)
  if (byLabel) return byLabel.label
  return v
}

/** 将中文简称或英文 value 规范为英文 value（用于抗性/伤害计算匹配） */
export function getDamageTypeValue(labelOrValue) {
  if (labelOrValue == null || labelOrValue === '') return ''
  const v = String(labelOrValue).trim()
  const label = DAMAGE_TYPE_ALIASES[v] || v
  const byValue = DAMAGE_TYPES.find((d) => d.value === v.toLowerCase())
  if (byValue) return byValue.value
  const byLabel = DAMAGE_TYPES.find((d) => d.label === label)
  if (byLabel) return byLabel.value
  return v.toLowerCase()
}

/** 英文或简写 value → 中文（与 CONDITION_OPTIONS 不重复列出） */
const CONDITION_LABEL_EXTRA = {
  poison: '中毒',
  disease: '疾病',
}

/** 根据状态 value 返回中文 label */
export function getConditionLabel(value) {
  if (value == null || value === '') return ''
  const v = String(value).trim()
  const vl = v.toLowerCase()
  const found = CONDITION_OPTIONS.find((c) => c.value === vl)
  if (found) return found.label
  if (CONDITION_LABEL_EXTRA[vl]) return CONDITION_LABEL_EXTRA[vl]
  return v
}

/** 优势/劣势选项（用于 numberAndAdvantage 等）：普通、优势、劣势 */
export const ADVANTAGE_OPTIONS = [
  { value: '', label: '普通' },
  { value: 'advantage', label: '优势' },
  { value: 'disadvantage', label: '劣势' },
]

/** 与物品库选项中的某一项一致：比对 proto.类型 或 proto.类别 */
export function protoMatchesWeaponBuffKey(proto, key) {
  const k = String(key ?? '').trim()
  if (!k || !proto) return false
  const t = String(proto.类型 ?? '').trim()
  const c = String(proto.类别 ?? '').trim()
  return k === t || (!!c && k === c)
}

/** 判断武器原型是否命中 Buff 勾选项：可与 proto.类型 或 proto.类别 一致（选项来自 itemDatabase.WEAPON_BUFF_CATEGORY_SELECT_OPTIONS） */
export function weaponProtoMatchesBuffWeaponCategories(proto, categories) {
  if (!proto || !Array.isArray(categories) || categories.length === 0) return false
  return categories.some((s) => protoMatchesWeaponBuffKey(proto, s))
}

/** 已移除的效果类型（仅用于显示旧数据，不可新增） */
const DEPRECATED_EFFECTS = {
  dmg_bonus_all: { key: 'dmg_bonus_all', label: '通用伤害', dataType: 'number' },
  dmg_type_specific: { key: 'dmg_type_specific', label: '特定类型伤害', dataType: 'object', subSelect: 'damageType' },
  disadv_all: { key: 'disadv_all', label: '通用劣势', dataType: 'boolean' },
  proficiency_override: { key: 'proficiency_override', label: '熟练加值覆写', dataType: 'number' },
}

/** 扁平化：所有 effect key -> { category, effect } */
export function getEffectInfo(key) {
  if (DEPRECATED_EFFECTS[key]) {
    return { category: 'defense', effect: DEPRECATED_EFFECTS[key] }
  }
  for (const cat of CATEGORY_ORDER) {
    const data = BUFF_TYPES[cat]
    if (!data) continue
    const effect = data.effects.find((e) => e.key === key)
    if (effect) return { category: cat, ...data, effect }
  }
  return null
}

/** 获取大类列表（用于第一级下拉） */
export function getCategories() {
  return CATEGORY_ORDER.map((key) => ({ key, label: BUFF_TYPES[key].label }))
}

/** 旧大类 -> 当前大类（兼容旧存档） */
const OLD_CATEGORY_TO_NEW = {
  attack: 'offense',
  damage: 'defense',
  attribute: 'ability',
  condition: 'defense',
  mobility: 'mobility_casting',
  casting: 'mobility_casting',
  transformation: 'active_release',
}

/**
 * 规范化 category：优先按 effectType 查当前大类，否则按旧 category 映射
 * @param {string} effectType - 效果 key
 * @param {string} [oldCategory] - 旧存档可能为 attack/damage/attribute/condition
 * @returns {string} 当前大类 key（含自定义）
 */
export function normalizeEffectCategory(effectType, oldCategory) {
  const info = getEffectInfo(effectType)
  if (info) return info.category
  if (oldCategory && OLD_CATEGORY_TO_NEW[oldCategory]) return OLD_CATEGORY_TO_NEW[oldCategory]
  return 'ability'
}

/** ═════════════════════════════════════════════════════════════════════════════
 * 命中/伤害加值「起效范围」扩展：本武器 / 全局 / 某类生物 / 某类伤害类型 / 某类武器
 * ═════════════════════════════════════════════════════════════════════════════ */

/** 范围 kind */
export const SCOPE_KIND = {
  global: 'global',
  self_weapon: 'self_weapon',
  physical_attack: 'physical_attack',
  melee_attack: 'melee_attack',
  ranged_attack: 'ranged_attack',
  natural_weapon: 'natural_weapon',
  creature_type: 'creature_type',
  damage_type: 'damage_type',
  weapon_category: 'weapon_category',
  druid_cantrip: 'druid_cantrip',
  weapon_or_beast: 'weapon_or_beast',
  aura: 'aura',
  custom: 'custom',
}

/** 范围 kind 下拉选项（用于 BuffForm） */
export const SCOPE_KIND_OPTIONS = [
  { value: SCOPE_KIND.global, label: '全局', tooltip: '对所有战斗手段生效' },
  { value: SCOPE_KIND.self_weapon, label: '本武器', tooltip: '仅对该物品自身的攻击生效' },
  { value: SCOPE_KIND.physical_attack, label: '物理攻击', tooltip: '对所有物理武器攻击生效' },
  { value: SCOPE_KIND.melee_attack, label: '近战攻击', tooltip: '仅对近战武器攻击生效' },
  { value: SCOPE_KIND.ranged_attack, label: '远射攻击', tooltip: '仅对远程武器攻击生效' },
  { value: SCOPE_KIND.natural_weapon, label: '天生武器', tooltip: '仅对天生武器（爪、啮咬等）生效' },
  { value: SCOPE_KIND.creature_type, label: '某类生物', tooltip: '仅对指定类型的目标生效' },
  { value: SCOPE_KIND.damage_type, label: '某类伤害类型', tooltip: '仅对指定类型的伤害生效' },
  { value: SCOPE_KIND.weapon_category, label: '某类武器', tooltip: '仅对指定类别的武器生效' },
  { value: SCOPE_KIND.aura, label: '灵光', tooltip: '灵光范围内的友方目标生效' },
  { value: SCOPE_KIND.custom, label: '自定义', tooltip: '自定义条件，由 DM 描述生效范围' },
]

/** 生物类型选项（D&D 5e 常见生物类型） */
export const CREATURE_TYPE_OPTIONS = [
  { value: 'aberration', label: '异怪' },
  { value: 'beast', label: '野兽' },
  { value: 'celestial', label: '天界生物' },
  { value: 'construct', label: '构装生物' },
  { value: 'dragon', label: '龙' },
  { value: 'elemental', label: '元素生物' },
  { value: 'fey', label: '妖精' },
  { value: 'fiend', label: '恶魔' },
  { value: 'giant', label: '巨人' },
  { value: 'monstrosity', label: '怪兽' },
  { value: 'ooze', label: '泥怪' },
  { value: 'plant', label: '植物' },
  { value: 'undead', label: '不死生物' },
  { value: 'humanoid', label: '类人生物' },
]

/** 范围用武器类别选项（抽象类别） */
export const WEAPON_SCOPE_CATEGORY_OPTIONS = [
  { value: '简易武器', label: '简易武器' },
  { value: '军用武器', label: '军用武器' },
  { value: '近战武器', label: '近战武器' },
  { value: '远程武器', label: '远程武器' },
  { value: '触及武器', label: '触及武器' },
  { value: '枪械', label: '枪械' },
]

/** 已知简易武器类别（2014 规则常用；可扩展） */
const SIMPLE_WEAPON_CATEGORIES = new Set([
  '短棒', '匕首', '巨棒', '手斧', '标枪', '轻锤', '硬头锤', '长棍', '镰刀',
  '轻弩', '短弓', '投石索', '吹箭筒',
])

/** 已知军用武器类别（2014 规则常用；可扩展） */
const MARTIAL_WEAPON_CATEGORIES = new Set([
  '战斧', '链枷', '巨斧', '巨剑', '弯刀', '长剑', '刺剑', '短剑', '三叉戟', '战锤', '战镰',
  '晨星', '矛', '戟', '钐镰', '长矛', '网', '轻剑', '重弩', '长弓', '手弩',
])

/** 武器是否属于简易武器 */
function isSimpleWeaponProto(proto) {
  if (!proto) return false
  if (proto.isSimple === true) return true
  if (proto.isMartial === true) return false
  const cat = String(proto.类别 ?? '').trim()
  if (SIMPLE_WEAPON_CATEGORIES.has(cat)) return true
  if (MARTIAL_WEAPON_CATEGORIES.has(cat)) return false
  return false
}

/** 武器是否属于军用武器 */
function isMartialWeaponProto(proto) {
  if (!proto) return false
  if (proto.isMartial === true) return true
  if (proto.isSimple === true) return false
  const cat = String(proto.类别 ?? '').trim()
  if (MARTIAL_WEAPON_CATEGORIES.has(cat)) return true
  if (SIMPLE_WEAPON_CATEGORIES.has(cat)) return false
  return false
}

/** 武器是否远程武器 */
function isRangedWeaponProto(proto) {
  if (!proto) return false
  if (proto.isRanged === true) return true
  if (proto.isMelee === true) return false
  if (proto.子类型 === '远程') return true
  if (proto.类型 === '远程武器') return true
  if (proto.类型 === '枪械') return true
  return false
}

/** 武器是否触及武器 */
function isReachWeaponProto(proto) {
  if (!proto) return false
  return /触及/i.test(String(proto.附注 ?? ''))
}

/** 天生武器关键词（名称/类别/附注命中其一即视为天生武器，但需排除普通制造武器） */
const NATURAL_WEAPON_KEYWORDS = ['爪', '啮咬', '角', '蹄', '尾', '拳', '触须', '蛰刺', '钳', '牙', '天生武器']

/** 武器是否为天生武器（无明确 isNatural 标记时按名称/类别/附注启发式判断） */
function isNaturalWeaponProto(proto) {
  if (!proto) return false
  if (proto.isNatural === true) return true
  if (proto.isNatural === false) return false
  const type = String(proto.类型 ?? '').trim()
  const cat = String(proto.类别 ?? '').trim()
  const name = String(proto.name ?? proto.名称 ?? '').trim()
  const note = String(proto.附注 ?? '').trim()
  if (type === '天生武器' || cat === '天生武器') return true
  const text = `${name} ${cat} ${note}`
  if (NATURAL_WEAPON_KEYWORDS.some((k) => text.includes(k))) {
    // 命中关键词后，再排除已知的普通武器（避免「爪钩」等误伤）
    if (SIMPLE_WEAPON_CATEGORIES.has(cat) || MARTIAL_WEAPON_CATEGORIES.has(cat)) return false
    return true
  }
  return false
}

/**
 * 规范化 scope：旧版 scope（global/melee/ranged/firearm/空）统一迁移到新的 { scope, scopeDetail } 结构。
 * 返回 { scope, scopeDetail }，scopeDetail 始终为数组（空数组表示无条件）。
 */
export function normalizeScope(rawScope, rawScopeDetail) {
  const s = String(rawScope ?? '').trim()
  // 新的 kind 直接保留
  if (SCOPE_KIND_OPTIONS.some((o) => o.value === s)) {
    return { scope: s, scopeDetail: Array.isArray(rawScopeDetail) ? rawScopeDetail : [] }
  }
  // 旧版近战/远程/枪械迁移到「某类武器」
  if (s === 'melee') return { scope: SCOPE_KIND.weapon_category, scopeDetail: ['近战武器'] }
  if (s === 'ranged') return { scope: SCOPE_KIND.weapon_category, scopeDetail: ['远程武器'] }
  if (s === 'firearm') return { scope: SCOPE_KIND.weapon_category, scopeDetail: ['枪械'] }
  // 默认全局
  return { scope: SCOPE_KIND.global, scopeDetail: [] }
}

/**
 * 判断一个条件范围 effect 是否匹配当前战斗手段。
 * @param {Object} effect - { scope, scopeDetail, itemInventoryId? }
 * @param {Object} ctx - 战斗手段上下文
 * @param {string} ctx.sourceKind - 'physical' | 'spell_attack' | 'item'
 * @param {Object} [ctx.weaponProto] - 武器原型
 * @param {string} [ctx.damageType] - 当前伤害类型（中文 label）
 * @param {string} [ctx.targetCreatureType] - 目标生物类型（英文 value）
 * @param {string} [ctx.sourceItemInventoryId] - 本武器范围所需的来源物品 id
 * @returns {boolean}
 */
export function scopeMatchesCombatMean(effect, ctx = {}) {
  if (!effect) return false
  const scope = String(effect.scope ?? 'global').trim()
  if (scope === SCOPE_KIND.global || scope === '') return true
  if (scope === SCOPE_KIND.self_weapon) {
    if (!ctx.sourceItemInventoryId || !effect.itemInventoryId) return false
    return String(effect.itemInventoryId) === String(ctx.sourceItemInventoryId)
  }
  // 物理攻击 / 近战攻击 / 远射攻击 / 天生武器：仅匹配物理战斗手段，不需要 scopeDetail
  if (scope === SCOPE_KIND.physical_attack) return ctx.sourceKind === 'physical'
  if (scope === SCOPE_KIND.melee_attack) {
    return ctx.sourceKind === 'physical' && !!ctx.weaponProto && !isRangedWeaponProto(ctx.weaponProto)
  }
  if (scope === SCOPE_KIND.ranged_attack) {
    return ctx.sourceKind === 'physical' && !!ctx.weaponProto && isRangedWeaponProto(ctx.weaponProto)
  }
  if (scope === SCOPE_KIND.natural_weapon) {
    return ctx.sourceKind === 'physical' && !!ctx.weaponProto && isNaturalWeaponProto(ctx.weaponProto)
  }
  // 德鲁伊戏法：仅匹配法术攻击且为戏法（level === 0）
  if (scope === SCOPE_KIND.druid_cantrip) {
    if (ctx.sourceKind !== 'spell_attack') return false
    // spellLevel === 0 表示戏法；null/undefined 也视为戏法（未指定环阶的法术攻击）
    const lvl = ctx.spellLevel != null ? Number(ctx.spellLevel) : 0
    return lvl === 0
  }
  // 武器/野兽攻击：匹配物理攻击（武器或荒野变形野兽攻击）
  if (scope === SCOPE_KIND.weapon_or_beast) {
    return ctx.sourceKind === 'physical'
  }
  // 灵光：被动区域效果，系统无法建模空间范围，视为始终生效
  if (scope === SCOPE_KIND.aura) return true
  const details = Array.isArray(effect.scopeDetail) ? effect.scopeDetail.filter(Boolean) : []
  if (details.length === 0) return false
  if (scope === SCOPE_KIND.creature_type) {
    if (!ctx.targetCreatureType) return false
    return details.includes(String(ctx.targetCreatureType))
  }
  if (scope === SCOPE_KIND.damage_type) {
    if (!ctx.damageType) return false
    return details.some((d) => getDamageTypeLabel(d) === getDamageTypeLabel(ctx.damageType))
  }
  if (scope === SCOPE_KIND.weapon_category) {
    if (!ctx.weaponProto) return false
    return details.some((key) => {
      const k = String(key).trim()
      if (k === '近战武器') return ctx.weaponProto.类型 === '近战武器'
      if (k === '远程武器') return ctx.weaponProto.类型 === '远程武器' || ctx.weaponProto.子类型 === '远程'
      if (k === '枪械') return ctx.weaponProto.类型 === '枪械'
      if (k === '触及武器') return isReachWeaponProto(ctx.weaponProto)
      if (k === '简易武器') return isSimpleWeaponProto(ctx.weaponProto)
      if (k === '军用武器') return isMartialWeaponProto(ctx.weaponProto)
      // 兼容旧版具体类别（如长剑、短弓）
      return protoMatchesWeaponBuffKey(ctx.weaponProto, k)
    })
  }
  // 自定义范围：未提供明确匹配规则，默认不匹配战斗手段上下文（仅作展示）
  if (scope === SCOPE_KIND.custom) return false
  return false
}

/**
 * 将范围条件格式化为简短文本，用于 BuffListItem 摘要。
 */
export function formatScopeBrief(scope, scopeDetail) {
  const s = String(scope ?? 'global').trim()
  if (s === SCOPE_KIND.global || s === '') return ''
  if (s === SCOPE_KIND.self_weapon) return '（本武器）'
  if (s === SCOPE_KIND.physical_attack) return '（物理攻击）'
  if (s === SCOPE_KIND.melee_attack) return '（近战攻击）'
  if (s === SCOPE_KIND.ranged_attack) return '（远射攻击）'
  if (s === SCOPE_KIND.natural_weapon) return '（天生武器）'
  if (s === SCOPE_KIND.druid_cantrip) return '（德鲁伊戏法）'
  if (s === SCOPE_KIND.weapon_or_beast) return '（武器/野兽攻击）'
  if (s === SCOPE_KIND.aura) return '（灵光）'
  const details = Array.isArray(scopeDetail) ? scopeDetail.filter(Boolean) : []
  if (details.length === 0) return ''
  if (s === SCOPE_KIND.creature_type) {
    const labels = details.map((v) => CREATURE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v)
    return `（${labels.join('/')}）`
  }
  if (s === SCOPE_KIND.damage_type) {
    const labels = details.map((v) => getDamageTypeLabel(v))
    return `（${labels.join('/')}）`
  }
  if (s === SCOPE_KIND.weapon_category) {
    return `（${details.join('/')}）`
  }
  if (s === SCOPE_KIND.custom) {
    const text = details[0] ?? ''
    return text ? `（${text}）` : ''
  }
  return ''
}

/** ═════════════════════════════════════════════════════════════════════════════
 * 施法增伤（spell_damage_bonus）：伤害类型 / 伤害骰下限 / 每骰 +X / 追加骰 / 公式固定加值
 * ═════════════════════════════════════════════════════════════════════════════ */

/** 施法增伤 value 结构说明：
 * {
 *   type: 'fire',          // 伤害类型（英文 value 或中文 label）
 *   diceFloor: 2,          // 伤害骰结果不能低于此值（>=2 生效）
 *   perDieBonus: 1,        // 每颗伤害骰 +X
 *   extraDice: '1d6',      // 追加伤害骰
 *   flatBonus: 0 | formula // 固定加值，支持公式
 * }
 */

/** 格式化施法增伤为展示文本 */
export function formatSpellDamageBonusValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const parts = []
  if (value.type) parts.push(getDamageTypeLabel(value.type))
  if (value.diceFloor != null && Number(value.diceFloor) > 1) parts.push(`骰子最低${value.diceFloor}`)
  if (value.perDieBonus) parts.push(`每骰+${value.perDieBonus}`)
  if (value.extraDice) parts.push(`追加${value.extraDice}`)
  if (value.flatBonus != null && value.flatBonus !== 0 && value.flatBonus !== '') {
    parts.push(`固定${value.flatBonus}`)
  }
  return parts.join('，')
}

/** ═════════════════════════════════════════════════════════════════════════════
 * 熟练效果数据迁移：将旧版文本值转换为数组格式
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * 迁移 BUFF 效果中的熟练数据（旧版文本 → 新版数组）
 * - tool_proficiency → specific_tool_proficiency（文本 → 数组）
 * - instrument_proficiency（文本 → 数组）
 * - language_proficiency（文本 → 数组）
 * - weapon_mastery（文本 → 数组）
 *
 * 文本格式支持：逗号分隔、中文顿号分隔、单个值
 * 示例："风笛，鼓" → ["bagpipes", "drum"]
 *
 * @param {Array} effects - BUFF 效果数组
 * @returns {Array} 迁移后的效果数组
 */
export function migrateProficiencyTextToArray(effects) {
  if (!Array.isArray(effects)) return effects

  // 文本值到选项 value 的映射
  const textToValueMap = {
    // 乐器
    '风笛': 'bagpipes', '鼓': 'drum', '扬琴': 'dulcimer', '长笛': 'flute',
    '号角': 'horn', '鲁特琴': 'lute', '里拉琴': 'lyre', '排箫': 'pan_flute',
    '芦笛': 'shawm', '提琴': 'viol',
    // 语言
    '深渊语': 'abyssal', '天界语': 'celestial', '通用语': 'common',
    '龙语': 'draconic', '精灵语': 'elvish', '巨人语': 'giant',
    '地精语': 'goblin', '刻洛语': 'kerlo', '象族语': 'loxodon',
    '人鱼语': 'merfolk', '牛头人语': 'minotaur', '斯芬克斯语': 'sphinx',
    '木族语': 'sylvan', '维多肯语': 'vidoken',
  }

  // 工具名称映射（部分常见工具）
  const toolTextToValueMap = {
    '炼金工具': 'alchemist_supplies', '酿酒工具': 'brewer_supplies',
    '书法工具': 'calligrapher_supplies', '木匠工具': 'carpenter_tools',
    '制图工具': 'cartographer_tools', '鞋匠工具': 'cobbler_tools',
    '厨师工具': 'cook_utensils', '玻璃匠工具': 'glassblower_tools',
    '珠宝匠工具': 'jeweler_tools', '皮匠工具': 'leatherworker_tools',
    '石匠工具': 'mason_tools', '画家工具': 'painter_supplies',
    '陶匠工具': 'potter_tools', '铁匠工具': 'smith_tools',
    '修补工具': 'tinker_tools', '织布工具': 'weaver_tools',
    '木雕工具': 'woodcarver_tools', '易容工具': 'disguise_kit',
    '文书伪造工具': 'forgery_kit', '草药工具': 'herbalism_kit',
    '领航工具': 'navigator_tools', '毒药工具': 'poisoner_kit',
    '盗贼工具': 'thieves_tools',
  }

  // 武器精通词条映射
  const masteryTextToValueMap = {
    'sap': 'sap', 'topple': 'topple', 'push': 'push', 'slow': 'slow',
    'vex': 'vex', 'cleave': 'cleave', 'nick': 'nick', 'graze': 'graze',
    'dazzle': 'dazzle',
  }

  return effects.map((effect) => {
    if (!effect || typeof effect !== 'object') return effect

    const { effectType, value } = effect

    // 合并 tool_proficiency 到 specific_tool_proficiency
    if (effectType === 'tool_proficiency') {
      const newValue = parseProficiencyText(value, toolTextToValueMap)
      return { ...effect, effectType: 'specific_tool_proficiency', value: newValue }
    }

    // 迁移其他熟练效果
    if (effectType === 'instrument_proficiency') {
      return { ...effect, value: parseProficiencyText(value, textToValueMap) }
    }
    if (effectType === 'language_proficiency') {
      return { ...effect, value: parseProficiencyText(value, textToValueMap) }
    }
    if (effectType === 'weapon_mastery') {
      return { ...effect, value: parseProficiencyText(value, masteryTextToValueMap) }
    }

    return effect
  })
}

/**
 * 解析熟练文本值为数组
 * 支持格式："风笛，鼓"、"风笛、鼓"、"风笛"
 */
function parseProficiencyText(value, textToValueMap) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'string') return []

  // 按逗号或顿号分割
  const items = String(value)
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return items
    .map((item) => {
      // 先尝试直接匹配 value
      if (Object.values(textToValueMap).includes(item)) return item
      // 再尝试文本映射
      return textToValueMap[item] || item
    })
    .filter(Boolean)
}
