import { createContext, useContext, useState, useEffect } from 'react'
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
import { loadCustomItemsFromSupabase } from '../data/itemDatabase'
import { loadCustomSpellsFromSupabase } from '../data/spellDatabase'
import { startAutoBackupScheduler, stopAutoBackupScheduler } from '../lib/moduleSnapshotStore'
import { startAutoArchiveListener } from '../lib/moduleArchiveStore'

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

  useEffect(() => {
    if (!isSupabaseEnabled() || !user?.name) return
    const onModules = () => setModules(getModulesSnapshot())
    const onUserPrefs = () => {
      setCurrentModuleIdState(getCurrentModuleId(user.name))
      setModules(getModulesSnapshot())
    }
    const onCustomLib = () => setCustomLibraryEpoch((n) => n + 1)
    window.addEventListener('dnd-realtime-modules', onModules)
    window.addEventListener('dnd-realtime-user-prefs', onUserPrefs)
    window.addEventListener('dnd-realtime-custom-library', onCustomLib)
    return () => {
      window.removeEventListener('dnd-realtime-modules', onModules)
      window.removeEventListener('dnd-realtime-user-prefs', onUserPrefs)
      window.removeEventListener('dnd-realtime-custom-library', onCustomLib)
    }
  }, [user?.name])

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      setModules(getModulesSnapshot())
      setCurrentModuleIdState(getCurrentModuleId(user?.name))
      setTeamDataReady(true)
      return
    }
    if (!user?.name) {
      setTeamDataReady(false)
      return
    }
    let cancelled = false
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
      } catch (e) {
        console.warn('团队数据从 Supabase 加载失败（请执行 supabase-schema-v3-team-data.sql）', e)
        if (!cancelled) {
          setModules(getModulesSnapshot())
          setCurrentModuleIdState(getCurrentModuleId(user.name))
        }
      } finally {
        if (!cancelled) setTeamDataReady(true)
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

  const value = {
    modules,
    currentModuleId,
    setCurrentModuleId,
    refreshModules,
    teamDataReady,
    customLibraryEpoch,
  }

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

export function useModule() {
  const ctx = useContext(ModuleContext)
  if (!ctx) throw new Error('useModule must be used within ModuleProvider')
  return ctx
}
