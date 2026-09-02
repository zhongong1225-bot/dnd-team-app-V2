import { readFileSync } from 'node:fs'
import { computeBuffStats } from '../src/hooks/useBuffCalculator.js'

const chars = JSON.parse(readFileSync('./supabase-export/characters.json', 'utf8'))
const char = chars.find((c) => c.data?.name === '布兰卡·冯·洛维奇')
if (!char) {
  console.error('角色未找到')
  process.exit(1)
}

const data = char.data
const activeBuffs = [
  ...(data.buffs || []),
  ...(data.buffStash || []),
]

console.log('基础属性:', data.abilities)
console.log('等级/xp:', data.level, data.xp)
console.log('激活buff数量:', activeBuffs.length)
for (const b of activeBuffs) {
  console.log(' -', b.source || b.id, b.effects?.map((e) => e.effectType))
}

const stats = computeBuffStats(data, activeBuffs)
console.log('最终属性:', stats.abilities)
console.log('saveProficiencyGranted:', stats.saveProficiencyGranted)
