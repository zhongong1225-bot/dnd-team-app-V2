import { supabase } from './supabase'

function supabaseErr(e) {
  if (!e) return '未知错误'
  return [e.message, e.details, e.hint].filter(Boolean).join(' · ') || String(e)
}

export async function fetchCampaignModules() {
  const { data, error } = await supabase.from('campaign_modules').select('*').order('sort_order', { ascending: true })
  if (error) throw new Error(supabaseErr(error))
  return data || []
}

export async function insertCampaignModule(id, name, sortOrder) {
  const { error } = await supabase.from('campaign_modules').insert({
    id,
    name,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(supabaseErr(error))
}

export async function updateCampaignModuleName(id, name) {
  const { error } = await supabase
    .from('campaign_modules')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** 插入或更新模组名（无行时 UPDATE 不报错但无效，用 upsert 保证能写上） */
export async function upsertCampaignModuleName(id, name) {
  const { data: row } = await supabase.from('campaign_modules').select('sort_order').eq('id', id).maybeSingle()
  let sortOrder = 0
  if (row && typeof row.sort_order === 'number') sortOrder = row.sort_order
  else if (id !== 'default') {
    const { data: last } = await supabase
      .from('campaign_modules')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    sortOrder = (last?.[0]?.sort_order ?? -1) + 1
  }
  const { error } = await supabase.from('campaign_modules').upsert(
    {
      id,
      name,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  if (error) throw new Error(supabaseErr(error))
}

export async function deleteCampaignModule(id) {
  const { error } = await supabase.from('campaign_modules').delete().eq('id', id)
  if (error) throw error
}

export async function replaceCampaignModuleOrder(rows) {
  for (let i = 0; i < rows.length; i++) {
    const { error } = await supabase
      .from('campaign_modules')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', rows[i].id)
    if (error) throw error
  }
}

export async function fetchUserPrefs(owner) {
  if (!owner) return null
  const { data, error } = await supabase.from('user_prefs').select('*').eq('owner', owner).maybeSingle()
  if (error) throw error
  return data
}

export async function upsertUserPrefs(owner, partial) {
  if (!owner) return
  const { data: ex } = await supabase.from('user_prefs').select('*').eq('owner', owner).maybeSingle()
  const dc = ex?.default_chars && typeof ex.default_chars === 'object' && !Array.isArray(ex.default_chars) ? ex.default_chars : {}
  const row = {
    owner,
    current_module_id:
      partial.current_module_id !== undefined ? partial.current_module_id : (ex?.current_module_id ?? null),
    default_chars: partial.default_chars !== undefined ? partial.default_chars : dc,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('user_prefs').upsert(row, { onConflict: 'owner' })
  if (error) throw error
}

export async function fetchTeamVaultRow(moduleId) {
  const mod = moduleId ?? 'default'
  const { data, error } = await supabase.from('team_vault').select('*').eq('module_id', mod).maybeSingle()
  if (error) throw error
  return data?.data && typeof data.data === 'object' ? data.data : {}
}

export async function saveTeamVaultRow(moduleId, data) {
  const mod = moduleId ?? 'default'
  const { error } = await supabase.from('team_vault').upsert(
    { module_id: mod, data: data || {}, updated_at: new Date().toISOString() },
    { onConflict: 'module_id' }
  )
  if (error) throw error
}

export async function fetchCraftingRow(moduleId) {
  const mod = moduleId ?? 'default'
  const { data, error } = await supabase.from('crafting_projects').select('*').eq('module_id', mod).maybeSingle()
  if (error) throw error
  if (!data || !Array.isArray(data.data)) return []
  return data.data
}

export async function saveCraftingRow(moduleId, list) {
  const mod = moduleId ?? 'default'
  const { error } = await supabase.from('crafting_projects').upsert(
    { module_id: mod, data: Array.isArray(list) ? list : [], updated_at: new Date().toISOString() },
    { onConflict: 'module_id' }
  )
  if (error) throw error
}

export async function fetchCustomLibrary(libKey) {
  const { data, error } = await supabase.from('custom_library').select('*').eq('lib_key', libKey).maybeSingle()
  if (error) throw error
  if (!data || !Array.isArray(data.data)) return []
  return data.data
}

export async function saveCustomLibrary(libKey, list) {
  const { error } = await supabase.from('custom_library').upsert(
    { lib_key: libKey, data: Array.isArray(list) ? list : [], updated_at: new Date().toISOString() },
    { onConflict: 'lib_key' }
  )
  if (error) throw error
}

export async function fetchModuleLibrary(moduleId) {
  const mod = moduleId ?? 'default'
  return fetchCustomLibrary(`module_library_${mod}`)
}

export async function saveModuleLibrary(moduleId, data) {
  const mod = moduleId ?? 'default'
  await saveCustomLibrary(`module_library_${mod}`, data)
}
