import { parseDamageString, formatDamageForAttack } from './src/data/buffTypes.js'

const WEAPON_DICE_CHUNK_RE = /\d+[dD\uFF44]\d+/gi

function mergeDuplicateDice(diceList) {
  if (!Array.isArray(diceList)) return diceList
  const counts = {}
  let hasMergeable = false
  for (const d of diceList) {
    const s = String(d).trim().toLowerCase()
    const m = s.match(/^(\d+)d(\d+)$/)
    if (!m) return diceList
    hasMergeable = true
    counts[m[2]] = (counts[m[2]] || 0) + (parseInt(m[1], 10) || 0)
  }
  if (!hasMergeable) return diceList
  return Object.entries(counts)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([size, count]) => `${count}d${size}`)
}

function parseWeaponAttack(attackStr) {
  if (!attackStr || typeof attackStr !== 'string') return { dice: null, diceList: [], type: '—' }
  let s = attackStr.trim()
  const hashIdx = s.lastIndexOf(' #')
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim()
  if (!s || s === '—') return { dice: null, diceList: [], type: '—' }
  const rawMatches = s.match(WEAPON_DICE_CHUNK_RE)
  const diceList = mergeDuplicateDice(rawMatches ? rawMatches.map((d) => d.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()) : [])
  const dice = diceList[0] ?? null
  let rest = s
  for (const raw of rawMatches || []) {
    rest = rest.replace(new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  rest = rest.replace(/\s+/g, ' ').trim()
  rest = rest
    .split(/\s+/)
    .filter((tok) => tok && !/^\+*\d+$/.test(tok))
    .join(' ')
    .trim()
  const type = rest && rest !== '' ? rest : '—'
  if (diceList.length === 0) {
    return { dice: null, diceList: [], type: s }
  }
  return { dice, diceList, type }
}

function stripDiceFlatMod(plus) {
  if (!plus || typeof plus !== 'string') return plus
  const m = plus.trim().match(/^(\d+)d(\d+)\s*([+-])\s*(\d+)$/i)
  if (m) return `${m[1]}d${m[2]}`
  return plus
}

function getWeaponBaseDamageObjects(weaponOpt) {
  const attack = String(weaponOpt?.攻击 ?? '').trim()
  const parsed = parseDamageString(attack)
  const plus = parsed.plus || ''
  const base = { ...parsed, plus: '', minus: '', o1: '', o2: '', o3: parsed.o3 }
  const versa = { ...parsed, plus: '', minus: '', o1: '', o2: '', o3: parsed.o3 }
  if (plus.includes('/')) {
    const [p1, p2] = plus.split('/')
    base.plus = stripDiceFlatMod(p1.trim()) || ''
    versa.plus = stripDiceFlatMod(p2.trim()) || ''
  } else {
    base.plus = stripDiceFlatMod(plus) || ''
    const note = String(weaponOpt?.entry?.附注 ?? weaponOpt?.proto?.附注 ?? '')
    const versatileMatch = note.match(/多用[（(](\d+d\d+)[）)]/i)
    versa.plus = versatileMatch ? (stripDiceFlatMod(versatileMatch[1].trim()) || base.plus) : base.plus
  }
  return { base, versa }
}

function getWeaponAttackStringForParsing(weaponOpt, mode) {
  if (!weaponOpt) return ''
  const { base, versa } = getWeaponBaseDamageObjects(weaponOpt)
  const baseAttack = formatDamageForAttack(mode === 'two_hand' ? versa : base)
  let attack = baseAttack
  const damageText = String(weaponOpt.伤害 ?? '').trim()
  if (damageText && damageText !== '—') {
    const extra = damageText.match(WEAPON_DICE_CHUNK_RE) || []
    for (const seg of extra) {
      const segNorm = seg.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()
      if (!attack.toLowerCase().includes(segNorm)) {
        attack = attack ? `${attack.replace(/\s+$/, '')}+${segNorm}` : segNorm
      }
    }
  }
  return attack
}

// 模拟兆运魔牌 weaponOpt
const weaponOpt = {
  index: 2,
  entry: {
    id: 'inv_1782152287243',
    name: '兆运魔牌',
    itemId: 'whip',
    攻击: '2d6 钝击',
    伤害: '钝击',
    附注: '灵巧，触及',
    effects: [],
    magicBonus: 2,
  },
  proto: {
    id: 'whip',
    类型: '近战武器',
    子类型: '近战',
    类别: '鞭',
    攻击: '1d4 挥砍',
    附注: '灵巧，触及',
    精通: '缓速',
    伤害: '挥砍',
    重量: '1磅',
  },
  name: '兆运魔牌',
  攻击: '2d6 钝击',
  伤害: '钝击',
}

console.log('attack string one_hand:', getWeaponAttackStringForParsing(weaponOpt, 'one_hand'))
console.log('parsed one_hand:', parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt, 'one_hand')))
console.log('attack string two_hand:', getWeaponAttackStringForParsing(weaponOpt, 'two_hand'))
console.log('parsed two_hand:', parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt, 'two_hand')))

// 也测试使用 zhaoyun_arcane_cards 原型
const weaponOpt2 = {
  ...weaponOpt,
  proto: {
    id: 'zhaoyun_arcane_cards',
    类型: '近战武器',
    子类型: '近战',
    类别: '兆运魔牌',
    攻击: '2d6 钝击',
    附注: '灵巧，触及，魔法 +2',
    精通: '',
    伤害: '钝击',
    重量: '1磅',
  },
}
console.log('--- with zhaoyun proto ---')
console.log('attack string one_hand:', getWeaponAttackStringForParsing(weaponOpt2, 'one_hand'))
console.log('parsed one_hand:', parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt2, 'one_hand')))
