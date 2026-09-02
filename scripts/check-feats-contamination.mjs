/**
 * 检查所有角色的 selectedFeats 数据是否被 persist queue 竞态 bug 污染。
 * 打印每个角色的名称、owner、module_id 以及 selectedFeats 摘要，
 * 方便人工目视检查是否有跨角色的专长泄漏。
 *
 * 用法（项目根目录）：
 *   node scripts/check-feats-contamination.mjs
 *   node scripts/check-feats-contamination.mjs --json       # 输出完整 JSON
 *   node scripts/check-feats-contamination.mjs --owner 玩家名  # 只看某个 owner
 *
 * 需存在 .env 且含 VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function loadViteEnv() {
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('未找到 .env，无法连接 Supabase。')
    process.exit(1)
  }
  const raw = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (k === 'VITE_SUPABASE_URL') out.url = v
    if (k === 'VITE_SUPABASE_ANON_KEY') out.key = v
  }
  return out
}

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const ownerIdx = args.indexOf('--owner')
const filterOwner = ownerIdx >= 0 ? args[ownerIdx + 1] : null

async function main() {
  const { url, key } = loadViteEnv()
  if (!url || !key) {
    console.error('.env 中缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  let query = supabase
    .from('characters')
    .select('id, owner, module_id, data, updated_at')
    .order('updated_at', { ascending: false })

  if (filterOwner) {
    query = query.eq('owner', filterOwner)
  }

  const { data: rows, error } = await query
  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('未找到任何角色。')
    return
  }

  console.log(`共 ${rows.length} 个角色\n`)
  console.log('='.repeat(80))

  const featAssignments = []

  for (const row of rows) {
    const d = row.data || {}
    const name = d.name || '(未命名)'
    const charClass = d.class || ''
    const level = d.classLevel || d.level || '?'
    const feats = d.selectedFeats || []
    const assignedFeats = feats.filter(f => f && f.featId)

    console.log(`\n角色: ${name}`)
    console.log(`  ID:        ${row.id}`)
    console.log(`  Owner:     ${row.owner}`)
    console.log(`  Module:    ${row.module_id || 'default'}`)
    console.log(`  Class:     ${charClass} Lv.${level}`)
    console.log(`  Updated:   ${row.updated_at || '?'}`)
    console.log(`  Feats (${assignedFeats.length}):`)

    if (assignedFeats.length === 0) {
      console.log('    (无专长)')
    } else {
      for (const f of assignedFeats) {
        const slot = f.slotId || '(no slot)'
        const src = f.sourceClass ? ` [src: ${f.sourceClass}]` : ''
        console.log(`    - featId: ${f.featId}  |  slot: ${slot}  |  level: ${f.level ?? '?'}${src}`)
        featAssignments.push({
          charId: row.id,
          charName: name,
          owner: row.owner,
          featId: f.featId,
          slotId: f.slotId || null,
        })
      }
    }

    if (jsonMode) {
      console.log(`  [RAW selectedFeats]:`)
      console.log(JSON.stringify(feats, null, 2))
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('\n--- 交叉污染检查 ---')

  const featSlotMap = new Map()
  for (const a of featAssignments) {
    const key = `${a.featId}::${a.slotId || ''}`
    if (!featSlotMap.has(key)) featSlotMap.set(key, [])
    featSlotMap.get(key).push(a)
  }

  let suspicious = 0
  for (const [key, entries] of featSlotMap) {
    if (entries.length <= 1) continue
    const owners = new Set(entries.map(e => e.owner))
    if (owners.size > 1) {
      suspicious++
      console.log(`  [!] 可疑: featId+slotId "${key}" 出现在不同 owner 的角色上:`)
      for (const e of entries) {
        console.log(`      - ${e.charName} (owner: ${e.owner}, charId: ${e.charId})`)
      }
    }
  }

  if (suspicious === 0) {
    console.log('  未发现明显的跨 owner 专长泄漏。')
    console.log('  请人工检查上方列表，确认每个角色的专长是否符合预期。')
  }

  console.log('\n完成。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
