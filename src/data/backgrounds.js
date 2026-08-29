/**
 * D&D 5e PHB 背景数据
 *
 * 每个背景包含：id、name、description（核心特征描述）
 * 用于种族背景槽的背景卡选择与特征展示。
 */

export const BACKGROUNDS = [
  {
    id: 'acolyte',
    name: '侍僧',
    description: '庇护所。你在神殿中度过多年，作为神祇的仆人接受训练。你获得宗教与洞察技能熟练，两项语言。',
  },
  {
    id: 'criminal',
    name: '罪犯',
    description: '犯罪联系。你长期从事犯罪活动，在地下世界有经验与人脉。你获得隐匿与欺骗技能熟练，盗贼工具与一种游戏工具熟练。',
  },
  {
    id: 'folk-hero',
    name: '民间英雄',
    description: ' rustic hospitality。你来自乡间，在普通人的世界中成长。你获得动物亲和与生存技能熟练，一种工匠工具与一种载具熟练。',
  },
  {
    id: 'guild-artisan',
    name: '行会工匠',
    description: '行会成员。你是一个行会的熟练工匠，掌握一门手艺。你获得洞察与游说技能熟练，一种工匠工具与一种语言。',
  },
  {
    id: 'hermit',
    name: '隐士',
    description: '发现。你在孤独中度过多年，获得了一个独特的发现。你获得奥秘与宗教技能熟练，草药工具与一种语言。',
  },
  {
    id: 'noble',
    name: '贵族',
    description: '贵族地位。你出身贵族家族，享有特权与人脉。你获得历史与游说技能熟练，一种游戏工具与一种语言。',
  },
  {
    id: 'outlander',
    name: '外乡人',
    description: '荒野流浪。你在野外长大，远离文明。你获得运动与生存技能熟练，一种乐器与一种语言。',
  },
  {
    id: 'sage',
    name: '贤者',
    description: '研究者。你毕生致力于知识研究。你获得奥秘与历史技能熟练，两种语言。',
  },
  {
    id: 'sailor',
    name: '水手',
    description: '航海生活。你在船上度过了多年。你获得运动与感知技能熟练， navigator工具与载具（水）熟练。',
  },
  {
    id: 'soldier',
    name: '士兵',
    description: '军事生涯。你在军队服役多年。你获得运动与威慑技能熟练，一种游戏工具与载具（陆）熟练。',
  },
  {
    id: 'urchin',
    name: '流浪儿',
    description: '街头求生。你在城市街头长大，学会了在缝隙中生存。你获得隐匿与巧手技能熟练，盗贼工具与一种游戏工具。',
  },
  {
    id: 'charlatan',
    name: '骗子',
    description: '虚假身份。你善于伪装与欺骗。你获得欺骗与巧手技能熟练，伪造文书工具与一套变装道具。',
  },
  {
    id: 'entertainer',
    name: '艺人',
    description: '表演天赋。你擅长娱乐大众。你获得杂技与表演技能熟练，一种乐器与一套变装道具。',
  },
  {
    id: 'gladiator',
    name: '角斗士',
    description: '竞技场战士。你在观众面前战斗为生。你获得杂技与表演技能熟练，一种游戏工具与一套变装道具。',
  },
  {
    id: 'knight',
    name: '骑士',
    description: '贵族侍从。你是一位贵族的侍从，受过军事训练。你获得历史与游说技能熟练，一种游戏工具与一种语言。',
  },
  {
    id: 'pirate',
    name: '海盗',
    description: '海上掠夺者。你在海盗船上度过了岁月。你获得运动与威慑技能熟练，navigator工具与载具（水）熟练。',
  },
]

/** 按 ID 查找背景 */
export function getBackgroundById(id) {
  return BACKGROUNDS.find((b) => b.id === id) || null
}
