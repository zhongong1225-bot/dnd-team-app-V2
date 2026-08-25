/**
 * Supabase 持久化层：角色表 characters (id, owner, module_id, data jsonb)
 * 由 characterStore 在启用 Supabase 时调用
 */
import { supabase } from './supabase'

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
  let query = supabase.from(TABLE).select('*').order('updated_at', { ascending: false })
  if (!isAdmin && ownerName) query = query.eq('owner', ownerName)
  const { data: rows, error } = await query
  if (error) throw error
  return (rows || []).map(rowToCharacter)
}

/** 拉取并填入缓存，返回角色列表（仅自己的，或管理员全部） */
export async function fetchCharacters(ownerName, isAdmin, moduleId) {
  const mod = moduleId ?? 'default'
  let query = supabase.from(TABLE).select('*').eq('module_id', mod).order('updated_at', { ascending: false })
  if (!isAdmin && ownerName) query = query.eq('owner', ownerName)
  const { data: rows, error } = await query
  if (error) throw error
  return (rows || []).map(rowToCharacter)
}

/** 拉取指定模组内全部角色（供非 DM 查看模组内所有角色；需 RLS 允许读同模组） */
export async function fetchCharactersInModule(moduleId) {
  const mod = moduleId ?? 'default'
  const { data: rows, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('module_id', mod)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (rows || []).map(rowToCharacter)
}

/** 按 id 取一条 */
export async function fetchCharacterById(id) {
  const { data: row, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return rowToCharacter(row)
}

/** 新增角色，返回完整角色对象 */
export async function insertCharacter(character) {
  const row = characterToRow(character)
  const { data: inserted, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw error
  return rowToCharacter(inserted)
}

/** 更新角色，返回完整角色对象 */
export async function updateCharacterRow(id, patch) {
  const { data: row, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error || !row) return null
  const current = rowToCharacter(row)
  const merged = { ...current, ...patch, updatedAt: new Date().toISOString() }
  const { id: _id, owner, moduleId, createdAt, updatedAt, ...data } = merged
  const { error: updateErr } = await supabase.from(TABLE).update({ data, updated_at: merged.updatedAt }).eq('id', id)
  if (updateErr) throw updateErr
  return merged
}

/** 删除角色 */
export async function deleteCharacterRow(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
  return true
}
