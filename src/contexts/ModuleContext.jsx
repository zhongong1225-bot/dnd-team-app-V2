import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { isSupabaseEnabled } from '../lib/supabase'
import {
  getModulesSnapshot,
  getCurrentModuleId,
  setCurrentModuleId as persistModuleId,
  loadCampaignModulesFromSupabase,
  loadUserPrefsFromSupabase,
} from '../lib/moduleStore'
import { clearLegacyTeamLocalStorage } from '../lib/clearLegacyTeamLocalStorage'
import { setDefaultBuffPatchesReady, loadDefaultBuffPatchesFromSupabase } from '../lib/defaultBuffPatchStore'
import { loadCustomItemsFromSupabase } from '../data/itemDatabase'
import { loadCustomSpellsFromSupabase } from '../data/spellDatabase'
import { loadCustomRacesFromSupabase } from '../data/races'
import { loadCreatureLibraryFromSupabase } from '../data/creatureLibrary'
import { startAutoBackupScheduler, stopAutoBackupScheduler } from '../lib/moduleSnapshotStore'
import { startAutoArchiveListener } from '../lib/moduleArchiveStore'
import {
  getModuleLibrary,
  loadModuleLibraryFromSupabase,
  syncBuffTemplatesFromCharacters,
  syncItemTemplatesFromCharacters,
} from '../lib/moduleLibraryStore'
import { hydrateRuleTextOverridesFromSupabase } from '../lib/ruleTextOverrides'

const ModuleContext = createContext(null)

export function ModuleProvider({ children }) {
  const { user, isAdmin } = useAuth()
  const [modules, setModules] = useState(() => (isSupabaseEnabled() ? [] : getModulesSnapshot()))
  const [currentModuleId, setCurrentModuleIdState] = useState(() =>
    isSupabaseEnabled() ? 'default' : getCurrentModuleId()
  )
  const [teamDataReady, setTeamDataReady] = useState(() => !isSupabaseEnabled())
  /** 自定义物品/法术 Realtime 更新后递增，供 ItemPicker 等刷新列表 */
  const [customLibraryEpoch, setCustomLibraryEpoch] = useState(0)
  /** 当前模组库（BUFF/物品模板） */
  const [moduleLibrary, setModuleLibrary] = useState(() => getModuleLibrary())
  const [moduleLibraryEpoch, setModuleLibraryEpoch] = useState(0)

  useEffect(() => {
    if (!isSupabaseEnabled() || !user?.name) return
    const onModules = () => setModules(getModulesSnapshot())
    const onUserPrefs = () => {
      setCurrentModuleIdState(getCurrentModuleId(user.name))
      setModules(getModulesSnapshot())
    }
    const onCustomLib = () => setCustomLibraryEpoch((n) => n + 1)
    const onModuleLibrary = () => {
      setModuleLibrary(getModuleLibrary(currentModuleId))
      setModuleLibraryEpoch((n) => n + 1)
    }
    window.addEventListener('dnd-realtime-modules', onModules)
    window.addEventListener('dnd-realtime-user-prefs', onUserPrefs)
    window.addEventListener('dnd-realtime-custom-library', onCustomLib)
    window.addEventListener('dnd-realtime-module-library', onModuleLibrary)
    return () => {
      window.removeEventListener('dnd-realtime-modules', onModules)
      window.removeEventListener('dnd-realtime-user-prefs', onUserPrefs)
      window.removeEventListener('dnd-realtime-custom-library', onCustomLib)
      window.removeEventListener('dnd-realtime-module-library', onModuleLibrary)
    }
  }, [user?.name, currentModuleId])

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      setModules(getModulesSnapshot())
      setCurrentModuleIdState(getCurrentModuleId(user?.name))
      setTeamDataReady(true)
      setDefaultBuffPatchesReady(true)
      return
    }
    if (!user?.name) {
      setTeamDataReady(false)
      setDefaultBuffPatchesReady(false)
      return
    }
    let cancelled = false
    setDefaultBuffPatchesReady(false)
    ;(async () => {
      try {
        clearLegacyTeamLocalStorage()
        await loadCampaignModulesFromSupabase()
        await loadUserPrefsFromSupabase(user.name)
        if (cancelled) return
        setModules(getModulesSnapshot())
        setCurrentModuleIdState(getCurrentModuleId(user.name))
        await loadCustomItemsFromSupabase()
        await loadCustomSpellsFromSupabase()
        await loadCustomRacesFromSupabase()
        await loadCreatureLibraryFromSupabase()
      } catch (e) {
        console.warn('团队数据从 Supabase 加载失败（请执行 supabase-schema-v3-team-data.sql）', e)
        if (!cancelled) {
          setModules(getModulesSnapshot())
          setCurrentModuleIdState(getCurrentModuleId(user.name))
        }
      } finally {
        if (!cancelled) {
          setTeamDataReady(true)
          setDefaultBuffPatchesReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.name])

  // 自动备份调度器：仅 DM 登录时启动，卸载或非DM时停止
  useEffect(() => {
    if (isAdmin) {
      startAutoBackupScheduler()
    }
    return () => stopAutoBackupScheduler()
  }, [isAdmin])

  // 自动存档监听器：内容修改时自动保存（防抖，不卡顿）
  useEffect(() => {
    const stop = startAutoArchiveListener()
    return () => stop?.()
  }, [])

  const setCurrentModuleId = (id) => {
    persistModuleId(id, user?.name)
    setCurrentModuleIdState(id)
    setModules(getModulesSnapshot())
  }

  const refreshModules = () => {
    setModules(getModulesSnapshot())
    setCurrentModuleIdState(getCurrentModuleId(user?.name))
  }

  const refreshModuleLibrary = useCallback(async () => {
    const lib = await loadModuleLibraryFromSupabase(currentModuleId)
    setModuleLibrary(lib)
    setModuleLibraryEpoch((n) => n + 1)
  }, [currentModuleId])

  const syncModuleBuffTemplates = useCallback(async () => {
    await syncBuffTemplatesFromCharacters(currentModuleId)
    await refreshModuleLibrary()
  }, [currentModuleId, refreshModuleLibrary])

  const syncModuleItemTemplates = useCallback(async () => {
    await syncItemTemplatesFromCharacters(currentModuleId)
    await refreshModuleLibrary()
  }, [currentModuleId, refreshModuleLibrary])

  // 当前模组切换后重新加载模组库
  useEffect(() => {
    if (!teamDataReady) return
    refreshModuleLibrary()
    loadDefaultBuffPatchesFromSupabase(currentModuleId)
  }, [currentModuleId, teamDataReady, refreshModuleLibrary])

  // 规则正文覆盖随战役同步：就绪后与切战役时各合并一次
  useEffect(() => {
    if (!teamDataReady) return
    hydrateRuleTextOverridesFromSupabase(currentModuleId)
  }, [currentModuleId, teamDataReady])

  const value = {
    modules,
    currentModuleId,
    setCurrentModuleId,
    refreshModules,
    teamDataReady,
    customLibraryEpoch,
    moduleLibrary,
    moduleLibraryEpoch,
    refreshModuleLibrary,
    syncModuleBuffTemplates,
    syncModuleItemTemplates,
  }

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

export function useModule() {
  const ctx = useContext(ModuleContext)
  if (!ctx) throw new Error('useModule must be used within ModuleProvider')
  return ctx
}
