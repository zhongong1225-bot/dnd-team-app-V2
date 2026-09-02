/**
 * 战斗风格数据
 * 战士、游侠、圣武士等职业通过「战斗风格」特性选取，
 * 以虚拟 BUFF 形式集成到 BUFF 栏专长分栏。
 */

export const FIGHTING_STYLES = [
  {
    id: 'archery',
    name: '箭术',
    description: '你使用远程武器进行的攻击检定获得 +2 加值。',
  },
  {
    id: 'blind_fighting',
    name: '盲斗',
    description: '你具有 10 尺盲视。',
  },
  {
    id: 'defense',
    name: '防御',
    description: '着装轻甲、中甲或重甲期间，你的护甲等级获得 +1 加值。',
  },
  {
    id: 'dueling',
    name: '对决',
    description: '当你单手持用一把近战武器且没有持用其他武器时，你使用那把武器进行的伤害掷骰获得 +2 加值。',
  },
  {
    id: 'great_weapon_fighting',
    name: '巨武器战斗',
    description: '当你用双手持握的一把近战武器发动了一次攻击并为其进行伤害掷骰时，若该武器具有双手或多用词条，那么你便可以将伤害骰投出的 1 和 2 都视为 3。',
  },
  {
    id: 'interception',
    name: '拦截',
    description: '当一名你可见的生物以攻击检定命中你 5 尺内的另一名生物时，你能够以反应减少对目标造成的伤害，使该伤害降低 1d10+你的熟练加值。你必须持握着一面盾牌或者一把简易/军用武器才能使用这个反应。',
  },
  {
    id: 'protection',
    name: '守护',
    description: '当一名你可见的生物对一个你 5 尺内的除你以外的目标发动攻击时，若你正持握着一面盾牌，你能够以反应将盾牌挡在中间。你对触发攻击检定施加劣势，并且只要你还位于目标 5 尺内，其他所有对该目标进行的攻击检定也具有劣势，持续至你的下回合开始。',
  },
  {
    id: 'thrown_weapon_fighting',
    name: '投掷武器战斗',
    description: '当你使用具有投掷词条的武器进行远程攻击检定并命中时，你在该次伤害掷骰中获得 +2 加值。',
  },
  {
    id: 'two_weapon_fighting',
    name: '双武器战斗',
    description: '当你因使用具有轻型词条的武器而得以发动额外的攻击时，若此次额外的攻击的伤害本来无法加入你的属性调整值，你可以加入你的属性调整值。',
  },
  {
    id: 'unarmed_fighting',
    name: '徒手战斗',
    description: '当你使用徒手打击命中并造成了伤害时，你可以改为造成 1d6+你的力量调整值点钝击伤害，而非原本的徒手打击伤害。如果你进行攻击检定时并没有持握任何武器与盾牌，则上述伤害中的 d6 将变为 d8。\n每当你的回合开始时，你还可以对一个因你受擒的生物造成 1d4 点钝击伤害。',
  },
]

const STYLE_BY_ID = new Map(FIGHTING_STYLES.map((x) => [x.id, x]))

export function getFightingStyleById(id) {
  return STYLE_BY_ID.get(id) ?? null
}

export function getFightingStyleName(id) {
  return getFightingStyleById(id)?.name ?? id
}
