/**
 * 云函数：将 Supabase 迁移数据导入云开发数据库
 *
 * 用法：
 * 1. 在微信开发者工具中创建云函数 migrateFromSupabase
 * 2. 把 tools/cloudbase-import/*.json 复制到本函数的 data/ 目录下
 * 3. 上传并部署云函数
 * 4. 在微信开发者工具中调用该云函数
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const collections = [
  { name: 'characters', desc: '角色' },
  { name: 'warehouses', desc: '团队仓库' },
  { name: 'campaign_modules', desc: '模组列表' },
  { name: 'team_vaults', desc: '团队金库' },
  { name: 'crafting_projects', desc: '制作项目' },
  { name: 'user_prefs', desc: '用户偏好' },
  { name: 'custom_libraries', desc: '自定义库' },
]

async function clearCollection(collectionName) {
  const collection = db.collection(collectionName)
  const { data } = await collection.limit(500).field({ _id: true }).get()
  if (!data || data.length === 0) return 0
  const ids = data.map((d) => d._id)
  await collection.where({ _id: _.in(ids) }).remove()
  return ids.length
}

async function batchAdd(collectionName, docs) {
  const batchSize = 100
  const collection = db.collection(collectionName)
  let inserted = 0
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize)
    const result = await collection.add({ data: batch })
    inserted += result?.inserted ?? batch.length
  }
  return inserted
}

exports.main = async (event, context) => {
  const results = []
  const errors = []

  for (const { name, desc } of collections) {
    try {
      let docs = []
      try {
        docs = require(`./data/${name}.json`)
      } catch (e) {
        // 无数据文件则跳过
        results.push({ collection: name, desc, count: 0, status: 'no_file' })
        continue
      }
      if (!Array.isArray(docs) || docs.length === 0) {
        results.push({ collection: name, desc, count: 0, status: 'empty' })
        continue
      }

      const cleared = await clearCollection(name)
      const inserted = await batchAdd(name, docs)
      results.push({ collection: name, desc, count: inserted, cleared, status: 'ok' })
    } catch (e) {
      errors.push({ collection: name, desc, error: e.message })
      results.push({ collection: name, desc, count: 0, status: 'error', error: e.message })
    }
  }

  return {
    code: errors.length === 0 ? 0 : 1,
    message: errors.length === 0 ? '导入成功' : `部分集合导入失败: ${errors.map((e) => e.collection).join(', ')}`,
    results,
    errors,
  }
}
