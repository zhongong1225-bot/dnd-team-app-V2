/**
 * 导出 Supabase 全部数据到 JSON
 * 用于迁移到微信云开发
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const outputDir = path.join(rootDir, 'tools', 'supabase-export')

/** 手动解析 .env（项目未安装 dotenv） */
function loadEnv() {
  const envPath = path.join(rootDir, '.env')
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // 去掉首尾引号
    value = value.replace(/^["']|["']$/g, '')
    env[key] = value
  }
  return env
}

const env = loadEnv()
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const tables = [
  { name: 'characters', desc: '角色表' },
  { name: 'warehouse', desc: '团队仓库表' },
  { name: 'campaign_modules', desc: '模组列表' },
  { name: 'team_vault', desc: '团队金库' },
  { name: 'crafting_projects', desc: '制作项目' },
  { name: 'user_prefs', desc: '用户偏好' },
  { name: 'custom_library', desc: '自定义库' },
]

async function exportTable(tableName) {
  const { data, error } = await supabase.from(tableName).select('*')
  if (error) {
    console.error(`✗ ${tableName} 导出失败:`, error.message)
    return { table: tableName, error: error.message, count: 0 }
  }
  const records = data || []
  const outputPath = path.join(outputDir, `${tableName}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf-8')
  console.log(`✓ ${tableName}: ${records.length} 条记录`)
  return { table: tableName, count: records.length, path: outputPath }
}

async function main() {
  console.log('开始导出 Supabase 数据...')
  console.log('URL:', supabaseUrl)
  console.log('')

  const results = []
  for (const { name } of tables) {
    results.push(await exportTable(name))
  }

  const summary = {
    exportedAt: new Date().toISOString(),
    supabaseUrl,
    results,
  }
  const summaryPath = path.join(outputDir, 'summary.json')
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8')

  console.log('')
  console.log('导出完成，文件保存在:', outputDir)
  const total = results.reduce((sum, r) => sum + r.count, 0)
  console.log(`总计: ${total} 条记录`)
}

main().catch((err) => {
  console.error('导出失败:', err)
  process.exit(1)
})
