/**
 * 验证 Supabase 导出和云开发转换数据的完整性
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const supabaseDir = path.join(rootDir, 'tools', 'supabase-export')
const cloudbaseDir = path.join(rootDir, 'tools', 'cloudbase-import')

const collections = [
  { name: 'characters', supabaseName: 'characters', requiredFields: ['_id', 'supabaseId', 'owner', 'moduleId', 'data'] },
  { name: 'warehouses', supabaseName: 'warehouse', requiredFields: ['_id', 'moduleId', 'data'] },
  { name: 'campaign_modules', supabaseName: 'campaign_modules', requiredFields: ['_id', 'name', 'sortOrder'] },
  { name: 'team_vaults', supabaseName: 'team_vault', requiredFields: ['_id', 'moduleId', 'data'] },
  { name: 'crafting_projects', supabaseName: 'crafting_projects', requiredFields: ['_id', 'moduleId', 'data'] },
  { name: 'user_prefs', supabaseName: 'user_prefs', requiredFields: ['_id', 'owner', 'currentModuleId', 'defaultChars'] },
  { name: 'custom_libraries', supabaseName: 'custom_library', requiredFields: ['_id', 'libKey', 'data'] },
]

function readJson(dir, name) {
  const filePath = path.join(dir, `${name}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function checkIllegalKeys(obj, path = '') {
  const issues = []
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        issues.push(`${path}.${key}`)
      }
      issues.push(...checkIllegalKeys(obj[key], `${path}.${key}`))
    }
  }
  return issues
}

function validate() {
  let hasError = false
  console.log('开始验证数据完整性...\n')

  for (const { name, supabaseName, requiredFields } of collections) {
    const supabaseRows = readJson(supabaseDir, supabaseName) || []
    const cloudbaseDocs = readJson(cloudbaseDir, name) || []

    console.log(`[${name}]`)
    console.log(`  Supabase 源数据: ${supabaseRows.length} 条`)
    console.log(`  云开发转换数据: ${cloudbaseDocs.length} 条`)

    if (supabaseRows.length !== cloudbaseDocs.length) {
      console.error(`  ✗ 数量不匹配！`)
      hasError = true
    } else {
      console.log(`  ✓ 数量匹配`)
    }

    // 检查必填字段
    const missingFields = []
    for (const doc of cloudbaseDocs) {
      for (const field of requiredFields) {
        if (!(field in doc)) {
          missingFields.push(`${doc._id || 'unknown'} 缺少 ${field}`)
        }
      }
    }
    if (missingFields.length > 0) {
      console.error(`  ✗ 缺少字段:`)
      missingFields.slice(0, 5).forEach((m) => console.error(`    - ${m}`))
      hasError = true
    } else {
      console.log(`  ✓ 必填字段完整`)
    }

    // 检查 _id 长度
    const longIds = cloudbaseDocs.filter((d) => d._id && d._id.length > 32).map((d) => d._id)
    if (longIds.length > 0) {
      console.error(`  ✗ _id 超过 32 字符: ${longIds.join(', ')}`)
      hasError = true
    } else {
      console.log(`  ✓ _id 长度符合要求`)
    }

    // 检查非法字段名
    const illegalKeys = []
    for (const doc of cloudbaseDocs) {
      const keys = checkIllegalKeys(doc)
      if (keys.length > 0) illegalKeys.push(...keys)
    }
    if (illegalKeys.length > 0) {
      console.error(`  ✗ 发现非法字段名（以$开头）: ${illegalKeys.slice(0, 5).join(', ')}`)
      hasError = true
    } else {
      console.log(`  ✓ 无非法字段名`)
    }

    console.log('')
  }

  if (hasError) {
    console.error('验证失败，请检查上述错误。')
    process.exit(1)
  } else {
    console.log('✓ 所有数据验证通过，可以导入云开发。')
  }
}

validate()
