/**
 * 将 Supabase 导出的 JSON 转换为微信云开发数据库导入格式
 * 输出 JSON 数组文件，可直接在微信开发者工具中导入
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const inputDir = path.join(rootDir, 'tools', 'supabase-export')
const outputDir = path.join(rootDir, 'tools', 'cloudbase-import')

const now = new Date().toISOString()

function readJson(name) {
  const filePath = path.join(inputDir, `${name}.json`)
  if (!fs.existsSync(filePath)) return []
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJson(name, docs) {
  const filePath = path.join(outputDir, `${name}.json`)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8')
}

function writeJsonLines(name, docs) {
  const filePath = path.join(outputDir, `${name}.jsonl`)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const lines = docs.map((d) => JSON.stringify(d)).join('\n')
  fs.writeFileSync(filePath, lines, 'utf-8')
}

function addMeta(doc) {
  return {
    ...doc,
    _migrateFrom: 'supabase',
    _migrateAt: now,
  }
}

/** 生成较短的唯一 id（8位随机+时间戳），兼容云开发 _id 32字符限制 */
function shortId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function transformCharacters(rows) {
  return rows.map((row) =>
    addMeta({
      // _id 使用短 id，原 UUID 太长（36字符）超过云开发 32 字符限制
      _id: shortId(),
      supabaseId: row.id,
      owner: row.owner,
      moduleId: row.module_id ?? 'default',
      data: row.data ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  )
}

function transformWarehouse(rows) {
  return rows.map((row) =>
    addMeta({
      _id: row.module_id ?? 'default',
      moduleId: row.module_id ?? 'default',
      data: row.data ?? { items: [], arcaneChestCount: 1 },
      updatedAt: row.updated_at,
    })
  )
}

function transformCampaignModules(rows) {
  return rows.map((row) =>
    addMeta({
      _id: row.id,
      name: row.name,
      sortOrder: row.sort_order ?? 0,
      updatedAt: row.updated_at,
    })
  )
}

function transformTeamVault(rows) {
  return rows.map((row) =>
    addMeta({
      _id: row.module_id ?? 'default',
      moduleId: row.module_id ?? 'default',
      data: row.data ?? {},
      updatedAt: row.updated_at,
    })
  )
}

function transformCraftingProjects(rows) {
  return rows.map((row) =>
    addMeta({
      _id: row.module_id ?? 'default',
      moduleId: row.module_id ?? 'default',
      data: row.data ?? [],
      updatedAt: row.updated_at,
    })
  )
}

function transformUserPrefs(rows) {
  return rows.map((row) =>
    addMeta({
      _id: row.owner,
      owner: row.owner,
      currentModuleId: row.current_module_id ?? null,
      defaultChars: row.default_chars ?? {},
      updatedAt: row.updated_at,
    })
  )
}

function transformCustomLibrary(rows) {
  return rows.map((row) =>
    addMeta({
      _id: row.lib_key,
      libKey: row.lib_key,
      data: row.data ?? [],
      updatedAt: row.updated_at,
    })
  )
}

const collections = [
  { name: 'characters', transform: transformCharacters, desc: '角色' },
  { name: 'warehouses', supabaseName: 'warehouse', transform: transformWarehouse, desc: '团队仓库' },
  { name: 'campaign_modules', transform: transformCampaignModules, desc: '模组列表' },
  { name: 'team_vaults', supabaseName: 'team_vault', transform: transformTeamVault, desc: '团队金库' },
  { name: 'crafting_projects', supabaseName: 'crafting_projects', transform: transformCraftingProjects, desc: '制作项目' },
  { name: 'user_prefs', transform: transformUserPrefs, desc: '用户偏好' },
  { name: 'custom_libraries', supabaseName: 'custom_library', transform: transformCustomLibrary, desc: '自定义库' },
]

function main() {
  console.log('开始转换 Supabase 数据为云开发导入格式...')
  fs.mkdirSync(outputDir, { recursive: true })

  const summary = []
  for (const { name, supabaseName, transform, desc } of collections) {
    const sourceName = supabaseName || name
    const rows = readJson(sourceName)
    const docs = transform(rows)
    writeJson(name, docs)
    writeJsonLines(name, docs)
    summary.push({ collection: name, desc, count: docs.length })
    console.log(`✓ ${name}（${desc}）: ${docs.length} 条文档`)
  }

  // 写入集合说明
  const schemaDoc = {
    collections: summary,
    generatedAt: now,
    note: '云开发 _id 限制 32 字符，角色表使用短 id，原 UUID 保存在 supabaseId 字段',
  }
  writeJson('_schema', schemaDoc)

  console.log('')
  console.log('转换完成，文件保存在:', outputDir)
  console.log(JSON.stringify(summary, null, 2))
}

main()
