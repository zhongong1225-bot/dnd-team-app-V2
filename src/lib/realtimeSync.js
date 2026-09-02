/**
 * Supabase Realtime：库表变更后自动拉取并通知界面刷新（二次开发）
 * 需在 Supabase 执行 supabase-realtime.sql（含 v3 表）
 */
import { supabase, isSupabaseEnabled } from './supabase'
import { loadAllCharactersIntoCache } from './characterStore'
import { loadWarehouseIntoCache } from './warehouseStore'
import { loadTeamVaultIntoCache } from './currencyStore'
import { loadCraftingIntoCache } from './craftingStore'
import { loadCampaignModulesFromSupabase, loadUserPrefsFromSupabase } from './moduleStore'
import { loadCustomItemsFromSupabase } from '../data/itemDatabase'
import { loadCustomSpellsFromSupabase } from '../data/spellDatabase'
import { loadCustomRacesFromSupabase } from '../data/races'

const DEBOUNCE_MS = 450

function emit(name) {
  window.dispatchEvent(new CustomEvent(name))
}

/**
 * 订阅 characters / 当前模组 warehouse 的变更
 * @returns {() => void} 取消订阅
 */
export function startSupabaseRealtime({ ownerName, isAdmin, moduleId }) {
  if (!isSupabaseEnabled() || !supabase) return () => {}

  const mod = moduleId ?? 'default'
  let charTimer = null
  let whTimer = null

  const onCharactersChange = () => {
    clearTimeout(charTimer)
    charTimer = setTimeout(async () => {
      try {
        await loadAllCharactersIntoCache(ownerName, isAdmin)
        emit('dnd-realtime-characters')
      } catch (e) {
        console.warn('[Realtime] characters refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  const onWarehouseChange = () => {
    clearTimeout(whTimer)
    whTimer = setTimeout(async () => {
      try {
        await loadWarehouseIntoCache(mod)
        emit('dnd-realtime-warehouse')
      } catch (e) {
        console.warn('[Realtime] warehouse refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  let actTimer = null
  const onActivityChange = () => {
    clearTimeout(actTimer)
    actTimer = setTimeout(() => emit('dnd-realtime-activity'), 200)
  }

  let vaultRtTimer = null
  const onTeamVaultChange = () => {
    clearTimeout(vaultRtTimer)
    vaultRtTimer = setTimeout(async () => {
      try {
        await loadTeamVaultIntoCache(mod)
        emit('dnd-realtime-team-vault')
      } catch (e) {
        console.warn('[Realtime] team_vault refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  let craftRtTimer = null
  const onCraftingChange = () => {
    clearTimeout(craftRtTimer)
    craftRtTimer = setTimeout(async () => {
      try {
        await loadCraftingIntoCache(mod)
        emit('dnd-realtime-crafting')
      } catch (e) {
        console.warn('[Realtime] crafting_projects refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  let modulesRtTimer = null
  const onCampaignModulesChange = () => {
    clearTimeout(modulesRtTimer)
    modulesRtTimer = setTimeout(async () => {
      try {
        await loadCampaignModulesFromSupabase()
        emit('dnd-realtime-modules')
      } catch (e) {
        console.warn('[Realtime] campaign_modules refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  let prefsRtTimer = null
  const onUserPrefsChange = () => {
    clearTimeout(prefsRtTimer)
    prefsRtTimer = setTimeout(async () => {
      try {
        if (ownerName) await loadUserPrefsFromSupabase(ownerName)
        emit('dnd-realtime-user-prefs')
      } catch (e) {
        console.warn('[Realtime] user_prefs refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  let customRtTimer = null
  const onCustomLibraryChange = () => {
    clearTimeout(customRtTimer)
    customRtTimer = setTimeout(async () => {
      try {
        await Promise.all([loadCustomItemsFromSupabase(), loadCustomSpellsFromSupabase(), loadCustomRacesFromSupabase()])
        emit('dnd-realtime-custom-library')
      } catch (e) {
        console.warn('[Realtime] custom_library refresh failed', e)
      }
    }, DEBOUNCE_MS)
  }

  function userPrefsFilter(name) {
    const s = String(name || '').trim()
    if (!s) return null
    if (/^[a-zA-Z0-9_-]+$/.test(s)) return `owner=eq.${s}`
    return `owner=eq."${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  const prefsFilter = userPrefsFilter(ownerName)

  const channelName = `dnd-realtime-${mod}-${Math.random().toString(36).slice(2, 9)}`
  let ch = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, onCharactersChange)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'warehouse',
        filter: `module_id=eq.${mod}`,
      },
      onWarehouseChange
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, onActivityChange)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'team_vault',
        filter: `module_id=eq.${mod}`,
      },
      onTeamVaultChange
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'crafting_projects',
        filter: `module_id=eq.${mod}`,
      },
      onCraftingChange
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_modules' }, onCampaignModulesChange)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'custom_library', filter: 'lib_key=eq.custom_items' },
      onCustomLibraryChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'custom_library', filter: 'lib_key=eq.custom_spells' },
      onCustomLibraryChange
    )

  if (prefsFilter) {
    ch = ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_prefs', filter: prefsFilter },
      onUserPrefsChange
    )
  }

  const channel = ch.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      console.warn(
        '[Realtime] 订阅失败：请在 Supabase 执行 supabase-realtime.sql，并为 v2/v3 表开启 Realtime'
      )
    }
  })

  return () => {
    clearTimeout(charTimer)
    clearTimeout(whTimer)
    clearTimeout(actTimer)
    clearTimeout(vaultRtTimer)
    clearTimeout(craftRtTimer)
    clearTimeout(modulesRtTimer)
    clearTimeout(prefsRtTimer)
    clearTimeout(customRtTimer)
    supabase.removeChannel(channel)
  }
}
