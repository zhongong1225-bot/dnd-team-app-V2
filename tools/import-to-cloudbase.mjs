/**
 * 将转换后的 JSON 数据导入微信云开发数据库
 * 需要环境变量：CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY
 *
 * 用法：
 *   npm install @cloudbase/node-sdk
 *   set CLOUDBASE_ENV_ID=你的环境ID
 *   set CLOUDBASE_SECRET_ID=你的SecretId
 *   set CLOUDBASE_SECRET_KEY=你的SecretKey
 *   node tools/import-to-cloudbase.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const importDir = path.join(rootDir, 'tools', 'cloudbase-import')

const envId = process.env.CLOUDBASE_ENV_ID
const secretId = process.env.CLOUDBASE_SECRET_ID
const secretKey = process.env.CLOUDBASE_SECRET_KEY

if (!envId || !secretId || !secretKey) {
  console.error('请设置环境变量：')
  console.error('  CLOUDBASE_ENV_ID=你的环境ID')
  console.error('  CLOUDBASE_SECRET_ID=腾讯云SecretId')
  console.error('  CLOUDBASE_SECRET_KEY=腾讯云SecretKey')
  console.error('')
  console.error('这些凭证可在「微信开发者工具 → 云开发 → 设置 → 环境设置」或腾讯云控制台获取。')
  process.exit(1)
}

let cloudbase
let db

try {
  const { default: cloudbaseMod } = await import('@cloudbase/node-sdk')
  cloudbase = cloudbaseMod.default ?? cloudbaseMod
} catch (e) {
  console.error('未找到 @cloudbase/node-sdk，请先安装：')
  console.error('  npm install @cloudbase/node-sdk')
  process.exit(1)
}

const app = cloudbase.init({
  env: envId,
  secretId,
  secretKey,
})
db = app.database()

const collections = [
  { name: 'characters', desc: '角色' },
  { name: 'warehouses', desc: '团队仓库' },
  { name: 'campaign_modules', desc: '模组列表' },
  { name: 'team_vaults', desc: '团队金库' },
  { name: 'crafting_projects', desc: '制作项目' },
  { name: 'user_prefs', desc: '用户偏好' },
  { name: 'custom_libraries', desc: '自定义库' },
]

function readDocs(collectionName) {
  const filePath = path.join(importDir, `${collectionName}.json`)
  if (!fs.existsSync(filePath)) return []
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/** 分批写入，每批 100 条 */
async function batchAdd(collectionName, docs) {
  const batchSize = 100
  const collection = db.collection(collectionName)
  let inserted = 0
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    try {
      const result = await collection.add(batch)
      inserted += result?.inserted ?? batch.length
    } catch (e) {
      console.error(`  写入 ${collectionName} 第 ${i + 1}-${i + batch.length} 条失败:`, e.message)
      throw e
    }
  }
  return inserted
}

async function clearCollection(collectionName) {
  const collection = db.collection(collectionName)
  // 查询全部 _id，然后批量删除
  const { data } = await collection.limit(500).field({ _id: true }).get()
  if (!data || data.length === 0) return 0
  const ids = data.map((d) => d._id)
  await collection.where({ _id: db.command.in(ids) }).remove()
  return ids.length
}

async function main() {
  console.log('开始导入到微信云开发数据库...')
  console.log('环境 ID:', envId)
  console.log('')

  const results = []
  for (const { name, desc } of collections) {
    const docs = readDocs(name)
    if (docs.length === 0) {
      console.log(`- ${name}（${desc}）: 无数据，跳过`)
      results.push({ collection: name, count: 0, status: 'skipped' })
      continue
    }

    process.stdout.write(`→ ${name}（${desc}）: ${docs.length} 条文档，清空旧数据...`)
    const cleared = await clearCollection(name)
    process.stdout.write(` 已清 ${cleared} 条，写入中...`)
    const inserted = await batchAdd(name, docs)
    console.log(` 成功写入 ${inserted} 条`)
    results.push({ collection: name, count: inserted, status: 'ok' })
  }

  console.log('')
  console.log('导入完成：')
  console.table(results)
}

main().catch((err) => {
  console.error('导入失败:', err)
  process.exit(1)
})
