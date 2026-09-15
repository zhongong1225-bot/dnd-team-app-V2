/**
 * 删除 Playwright / Vitest E2E 产生的测试角色（Supabase characters 表）。
 * 匹配规则：owner 为 E2E 测试登录名（如 bar-时间戳、save-时间戳、E2E玩家 等）。
 *
 * 用法（项目根目录）：
 *   node scripts/delete-e2e-test-characters.mjs
 *   node scripts/delete-e2e-test-characters.mjs --dry-run
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

/** 与 e2e/app-smoke.spec.js、e2e/quick-roll.spec.js 中 loginAs 前缀一致 */
const OWNER_PATTERN =
  /^(E2E玩家|vault-\d+|wh-\d+|newchar-\d+|sheet-\d+|nav-\d+|dash-\d+|qr-\d+|save-\d+|bar-\d+)$/

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const { url, key } = loadViteEnv()
  if (!url || !key) {
    console.error('.env 中缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const { data: rows, error } = await supabase.from('characters').select('id, owner')
  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  const toDelete = (rows || []).filter((r) => r?.owner && OWNER_PATTERN.test(String(r.owner).trim()))
  console.log(`共 ${rows?.length ?? 0} 条角色，匹配测试 owner 规则: ${toDelete.length} 条`)

  if (toDelete.length === 0) {
    return
  }

  for (const r of toDelete) {
    console.log(dryRun ? '[dry-run] 将删除' : '删除', r.id, r.owner)
    if (dryRun) continue
    const { error: delErr } = await supabase.from('characters').delete().eq('id', r.id)
    if (delErr) {
      console.error('删除失败', r.id, delErr.message)
    }
  }

  if (dryRun) {
    console.log('未实际删除（已加 --dry-run）')
  } else {
    console.log('完成。')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
