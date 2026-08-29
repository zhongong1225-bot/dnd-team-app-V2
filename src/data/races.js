/**
 * D&D 5e PHB 种族数据
 *
 * 每个种族包含：id、name、subraces（亚种）、traits（种族特性描述）
 * 用于种族背景槽的种族卡选择与特性展示。
 */

export const RACES = [
  {
    id: 'dwarf',
    name: '矮人',
    subraces: [
      { id: 'hill', name: '丘陵矮人' },
      { id: 'mountain', name: '山地矮人' },
    ],
    traits: '黑暗视觉 60 尺；毒素抗性；矮人坚韧（对抗毒素豁免优势）；石工工具熟练；与速度无关的地形（山地）',
  },
  {
    id: 'elf',
    name: '精灵',
    subraces: [
      { id: 'high', name: '高精灵' },
      { id: 'wood', name: '木精灵' },
      { id: 'drow', name: '暗精灵（卓尔）' },
    ],
    traits: '黑暗视觉 60 尺；敏锐感官（察觉察觉检定优势）；妖精血统（魅惑免疫，睡眠魔法优势）；恍惚（不需要睡眠，冥想 4 小时代替长休）',
  },
  {
    id: 'halfling',
    name: '半身人',
    subraces: [
      { id: 'lightfoot', name: '轻足半身人' },
      { id: 'stout', name: '健壮半身人' },
    ],
    traits: '幸运（掷出1时可重掷）；勇敢（对抗恐惧豁免优势）；半身人敏捷（移动可穿过大型生物空间）',
  },
  {
    id: 'human',
    name: '人类',
    subraces: [
      { id: 'standard', name: '标准人类' },
      { id: 'variant', name: '变体人类' },
    ],
    traits: '全属性 +1（标准）或自选两项 +1 加一项技能/专长（变体）；额外语言',
  },
  {
    id: 'dragonborn',
    name: '龙裔',
    subraces: [],
    traits: '龙息武器（锥形/线形区域，敏捷豁免减半伤害）；伤害抗性（对应龙种伤害类型）；龙语者',
  },
  {
    id: 'gnome',
    name: '侏儒',
    subraces: [
      { id: 'forest', name: '森林侏儒' },
      { id: 'rock', name: '岩石侏儒' },
    ],
    traits: '黑暗视觉 60 尺；侏儒狡诈（智力/感知/魅力豁免优势）；小体型',
  },
  {
    id: 'half-elf',
    name: '半精灵',
    subraces: [
      { id: 'standard', name: '标准半精灵' },
      { id: 'wood', name: '木精灵血统' },
      { id: 'drow', name: '卓尔血统' },
    ],
    traits: '黑暗视觉 60 尺；妖精血统（魅惑免疫，睡眠魔法优势）；两项自选属性 +1；两项自选技能熟练',
  },
  {
    id: 'half-orc',
    name: '半兽人',
    subraces: [],
    traits: '黑暗视觉 60 尺；不屈（降至 0 HP 时可保留 1 HP，长休前不可重复）；凶猛攻击（暴击时多掷一个伤害骰）；兽人耐力（对抗力竭豁免优势）',
  },
  {
    id: 'tiefling',
    name: '提夫林',
    subraces: [
      { id: 'standard', name: '标准提夫林' },
      { id: 'variant', name: '变体提夫林' },
    ],
    traits: '黑暗视觉 60 尺；地狱抗性（火焰抗性）；炼狱遗产（施法能力：奇术 → 地狱斥责 → 黑暗术）',
  },
]

/** 按 ID 查找种族 */
export function getRaceById(id) {
  return RACES.find((r) => r.id === id) || null
}

/** 按种族 ID + 亚种 ID 查找亚种 */
export function getSubraceById(raceId, subraceId) {
  const race = getRaceById(raceId)
  if (!race) return null
  return race.subraces.find((s) => s.id === subraceId) || null
}
