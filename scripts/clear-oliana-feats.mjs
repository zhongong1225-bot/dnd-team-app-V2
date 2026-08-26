/**
 * 清空奥利安娜·希尔的 selectedFeats（被布兰卡的专长数据污染）。
 * 仅修改 selectedFeats 字段，不影响其他数据。
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
    console.error('未找到 .env')
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

const TARGET_ID = '7e709ae4-55a9-4f28-abaf-f76eb3eef8fc' // 奥利安娜·希尔

async function main() {
  const { url, key } = loadViteEnv()
  const supabase = createClient(url, key)

  // 1. 先读取当前数据
  const { data: row, error: fetchErr } = await supabase
    .from('characters')
    .select('id, data, owner')
    .eq('id', TARGET_ID)
    .single()

  if (fetchErr) {
    console.error('读取失败:', fetchErr.message)
    process.exit(1)
  }

  const name = row.data?.name || '(未命名)'
  const currentFeats = row.data?.selectedFeats || []
  console.log(`角色: ${name} (owner: ${row.owner})`)
  console.log(`当前专长数: ${currentFeats.length}`)
  for (const f of currentFeats) {
    console.log(`  - ${f.featId} | slot: ${f.slotId || '(none)'} | src: ${f.sourceClass || '-'}`)
  }

  // 2. 确认
  console.log(`\n即将清空以上 ${currentFeats.length} 个专长。`)

  // 3. 更新：将 selectedFeats 设为空数组
  const patch = { selectedFeats: [] }
  const { data: updated, error: updateErr } = await supabase
    .from('characters')
    .update({ data: { ...row.data, selectedFeats: [] }, updated_at: new Date().toISOString() })
    .eq('id', TARGET_ID)
    .select('data')
    .single()

  if (updateErr) {
    console.error('更新失败:', updateErr.message)
    process.exit(1)
  }

  const newFeats = updated.data?.selectedFeats || []
  console.log(`\n更新成功。当前专长数: ${newFeats.length}`)
  console.log('完成。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
