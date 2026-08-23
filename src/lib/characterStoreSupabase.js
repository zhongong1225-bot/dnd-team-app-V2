/**
 * Supabase 持久化层：角色表 characters (id, owner, module_id, data jsonb)
 * 当前为本地复现栈溢出临时 mock：所有读取返回固定生产角色，写入无操作。
 */
import char from './mockChar.json'

const TABLE = 'characters'

/** 行 → 角色对象 */
function rowToCharacter(row) {
  if (!row) return null
  const data = row.data || {}
  return {
    id: row.id,
    owner: row.owner,
    moduleId: row.module_id ?? 'default',
    ...data,
    createdAt: row.created_at ?? data.createdAt,
    updatedAt: row.updated_at ?? data.updatedAt,
  }
}

/** 角色对象 → 写入行（data 不含 id, owner, moduleId） */
function characterToRow(character) {
  const { id, owner, moduleId, createdAt, updatedAt, ...rest } = character
  return {
    id,
    owner: owner ?? '',
    module_id: moduleId ?? 'default',
    data: rest,
    updated_at: new Date().toISOString(),
  }
}

/** 拉取当前用户可见的全部角色（跨模组，用于首页与 Realtime 刷新） */
export async function fetchAllCharacters(ownerName, isAdmin) {
  return [rowToCharacter(characterToRow(char))]
}

/** 拉取并填入缓存，返回角色列表（仅自己的，或管理员全部） */
export async function fetchCharacters(ownerName, isAdmin, moduleId) {
  return [rowToCharacter(characterToRow(char))]
}

/** 拉取指定模组内全部角色 */
export async function fetchCharactersInModule(moduleId) {
  return [rowToCharacter(characterToRow(char))]
}

/** 按 id 取一条 */
export async function fetchCharacterById(id) {
  if (id === char.id) return rowToCharacter(characterToRow(char))
  return null
}

/** 新增角色，返回完整角色对象 */
export async function insertCharacter(character) {
  return rowToCharacter(characterToRow(character))
}

/** 更新角色，返回完整角色对象 */
export async function updateCharacterRow(id, patch) {
  if (id !== char.id) return null
  const merged = { ...char, ...patch, updatedAt: new Date().toISOString() }
  return rowToCharacter(characterToRow(merged))
}

/** 删除角色 */
export async function deleteCharacterRow(id) {
  return true
}
