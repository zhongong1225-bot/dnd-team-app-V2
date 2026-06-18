import { useState, useEffect, useCallback } from 'react'
import { Save, RotateCcw, Upload, Download, Trash2, X, Github, Settings, HardDrive, Cloud } from 'lucide-react'
import {
  saveManualArchive,
  listArchives,
  getArchive,
  deleteArchive,
  uploadArchiveToGitHub,
  getGitHubConfig,
  setGitHubConfig,
  exportArchiveAsBlob,
} from '../lib/moduleArchiveStore'

export default function ModuleArchivePanel({ moduleId, moduleName, isAdmin }) {
  const [tab, setTab] = useState('local') // 'local' | 'github'
  const [archives, setArchives] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [restoringId, setRestoringId] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [githubConfig, setGithubConfig] = useState(() => getGitHubConfig() || {
    owner: 'zhong184556267',
    repo: 'dnd-team-app-V2',
    branch: 'main',
    pathPrefix: 'dnd-backups',
  })
  const [githubFiles, setGithubFiles] = useState([])
  const [githubLoading, setGithubLoading] = useState(false)
  const [message, setMessage] = useState('')

  const showMsg = (text) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 3000)
  }

  const loadLocal = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listArchives(moduleId, 'all')
      setArchives(list)
    } catch (e) {
      console.warn('加载存档失败', e)
    } finally {
      setLoading(false)
    }
  }, [moduleId])

  const loadGitHub = useCallback(async () => {
    const config = getGitHubConfig()
    if (!config?.token || !config?.owner || !config?.repo) {
      setGithubFiles([])
      return
    }
    setGithubLoading(true)
    try {
      const pathPrefix = config.pathPrefix || 'dnd-backups'
      const mod = (moduleId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
      const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${pathPrefix}/${mod}?ref=${config.branch || 'main'}`
      const res = await fetch(url, {
        headers: {
          Authorization: `token ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (res.status === 404) {
        setGithubFiles([])
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const files = (Array.isArray(data) ? data : [])
        .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
        .sort((a, b) => new Date(b.name) - new Date(a.name))
      setGithubFiles(files)
    } catch (e) {
      console.warn('GitHub 加载失败', e)
      setGithubFiles([])
    } finally {
      setGithubLoading(false)
    }
  }, [moduleId])

  useEffect(() => {
    if (tab === 'local') loadLocal()
    else loadGitHub()
  }, [tab, loadLocal, loadGitHub])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const result = await saveManualArchive(moduleId, `手动存档 ${moduleName || ''}`)
      showMsg('存档成功')
      await loadLocal()
      // 如果配置了 GitHub，自动上传
      const config = getGitHubConfig()
      if (config?.token && config?.owner && config?.repo) {
        setUploadingId(result.id)
        const up = await uploadArchiveToGitHub(result.id)
        if (up.success) showMsg('已同步到 GitHub')
        else showMsg('GitHub 同步失败: ' + up.error)
        setUploadingId(null)
      }
    } catch (e) {
      showMsg('存档失败: ' + (e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (archiveId) => {
    setUploadingId(archiveId)
    try {
      const result = await uploadArchiveToGitHub(archiveId)
      if (result.success) showMsg('已上传到 GitHub')
      else showMsg('上传失败: ' + result.error)
    } catch (e) {
      showMsg('上传失败: ' + (e?.message || String(e)))
    } finally {
      setUploadingId(null)
    }
  }

  const handleDownload = async (archiveId) => {
    try {
      const { blob, filename } = await exportArchiveAsBlob(archiveId)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      showMsg('已下载到本地')
    } catch (e) {
      showMsg('下载失败: ' + (e?.message || String(e)))
    }
  }

  const handleDelete = async (archiveId) => {
    if (!confirm('确定删除此存档？')) return
    setDeletingId(archiveId)
    try {
      await deleteArchive(archiveId)
      showMsg('已删除')
      await loadLocal()
    } catch (e) {
      showMsg('删除失败: ' + (e?.message || String(e)))
    } finally {
      setDeletingId(null)
    }
  }

  const handleRestoreLocal = async (archiveId) => {
    if (!confirm('确定从本地存档恢复？当前数据将被覆盖。')) return
    setRestoringId(archiveId)
    try {
      const archive = await getArchive(archiveId)
      if (!archive) throw new Error('存档不存在')
      // 触发恢复事件，由 ModuleContext 或外部处理
      window.dispatchEvent(new CustomEvent('dnd-restore-archive', { detail: { archive } }))
      showMsg('恢复成功，请刷新页面')
    } catch (e) {
      showMsg('恢复失败: ' + (e?.message || String(e)))
    } finally {
      setRestoringId(null)
    }
  }

  const handleDownloadFromGitHub = async (file) => {
    const config = getGitHubConfig()
    if (!config) return
    try {
      const res = await fetch(file.download_url, {
        headers: {
          Authorization: `token ${config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const archive = await res.json()
      // 触发恢复事件
      window.dispatchEvent(new CustomEvent('dnd-restore-archive', { detail: { archive } }))
      showMsg('已从 GitHub 恢复，请刷新页面')
    } catch (e) {
      showMsg('GitHub 下载失败: ' + (e?.message || String(e)))
    }
  }

  const handleSaveGitHubConfig = () => {
    setGitHubConfig(githubConfig)
    setShowConfig(false)
    showMsg('GitHub 配置已保存')
    if (tab === 'github') loadGitHub()
  }

  const manualArchives = archives.filter((a) => a.type === 'manual')
  const autoArchives = archives.filter((a) => a.type === 'auto')

  return (
    <div className="space-y-3">
      {/* 顶部操作栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? '保存中...' : '保存存档'}
        </button>

        <div className="flex items-center bg-black/30 rounded-lg border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setTab('local')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${tab === 'local' ? 'bg-white/10 text-white' : 'text-dnd-text-muted hover:text-white'}`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            本地
          </button>
          <button
            type="button"
            onClick={() => setTab('github')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${tab === 'github' ? 'bg-white/10 text-white' : 'text-dnd-text-muted hover:text-white'}`}
          >
            <Cloud className="w-3.5 h-3.5" />
            GitHub
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowConfig(true)}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-dnd-text-muted hover:text-white text-xs transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          配置
        </button>

        {message && (
          <span className="text-xs text-emerald-400 animate-pulse">{message}</span>
        )}
      </div>

      {/* 本地存档列表 */}
      {tab === 'local' && (
        <div className="space-y-3">
          {manualArchives.length > 0 && (
            <div>
              <p className="text-[11px] text-dnd-text-muted mb-1.5 uppercase tracking-wider">手动存档 ({manualArchives.length}/30)</p>
              <ul className="space-y-1.5">
                {manualArchives.map((arch) => (
                  <li
                    key={arch.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{arch.label}</p>
                      <p className="text-dnd-text-muted text-[10px]">
                        {new Date(arch.timestamp).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreLocal(arch.id)}
                        disabled={restoringId === arch.id}
                        title="恢复"
                        className="p-1.5 rounded text-dnd-text-muted hover:text-blue-400 hover:bg-blue-500/15 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpload(arch.id)}
                        disabled={uploadingId === arch.id}
                        title="上传到 GitHub"
                        className="p-1.5 rounded text-dnd-text-muted hover:text-purple-400 hover:bg-purple-500/15 transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(arch.id)}
                        title="下载 JSON"
                        className="p-1.5 rounded text-dnd-text-muted hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(arch.id)}
                        disabled={deletingId === arch.id}
                        title="删除"
                        className="p-1.5 rounded text-dnd-text-muted hover:text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {autoArchives.length > 0 && (
            <div>
              <p className="text-[11px] text-dnd-text-muted mb-1.5 uppercase tracking-wider">自动存档 ({autoArchives.length}/5)</p>
              <ul className="space-y-1.5">
                {autoArchives.map((arch) => (
                  <li
                    key={arch.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 opacity-80"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{arch.label}</p>
                      <p className="text-dnd-text-muted text-[10px]">
                        {new Date(arch.timestamp).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreLocal(arch.id)}
                        disabled={restoringId === arch.id}
                        title="恢复"
                        className="p-1.5 rounded text-dnd-text-muted hover:text-blue-400 hover:bg-blue-500/15 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {manualArchives.length === 0 && autoArchives.length === 0 && (
            <p className="text-dnd-text-muted text-sm py-4 text-center">该模组暂无存档</p>
          )}
        </div>
      )}

      {/* GitHub 备份列表 */}
      {tab === 'github' && (
        <div className="space-y-3">
          {!getGitHubConfig()?.token && (
            <p className="text-dnd-text-muted text-sm py-4 text-center">
              尚未配置 GitHub，请点击「配置」填写 Token 和仓库信息
            </p>
          )}
          {githubLoading && <p className="text-dnd-text-muted text-sm py-4 text-center">加载中...</p>}
          {!githubLoading && githubFiles.length > 0 && (
            <ul className="space-y-1.5">
              {githubFiles.map((file) => (
                <li
                  key={file.sha}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{file.name}</p>
                    <p className="text-dnd-text-muted text-[10px]">
                      {file.size > 1024 ? (file.size / 1024).toFixed(1) + ' KB' : file.size + ' B'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadFromGitHub(file)}
                    className="shrink-0 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                  >
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!githubLoading && getGitHubConfig()?.token && githubFiles.length === 0 && (
            <p className="text-dnd-text-muted text-sm py-4 text-center">GitHub 上暂无该模组备份</p>
          )}
        </div>
      )}

      {/* GitHub 配置弹窗 */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowConfig(false)}>
          <div className="w-full max-w-sm rounded-xl bg-gray-900 border border-white/15 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Github className="w-4 h-4" />
                GitHub 备份配置
              </h3>
              <button type="button" onClick={() => setShowConfig(false)} className="p-1 rounded text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">Personal Access Token</label>
                <input
                  type="password"
                  value={githubConfig.token || ''}
                  onChange={(e) => setGithubConfig((c) => ({ ...c, token: e.target.value }))}
                  placeholder="ghp_xxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-dnd-gold/50"
                />
                <p className="text-[10px] text-dnd-text-muted mt-1">需要 repo 权限，令牌仅保存在本地浏览器</p>
              </div>
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">仓库所有者</label>
                <input
                  type="text"
                  value={githubConfig.owner || ''}
                  onChange={(e) => setGithubConfig((c) => ({ ...c, owner: e.target.value }))}
                  placeholder="你的 GitHub 用户名"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-dnd-gold/50"
                />
              </div>
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">仓库名</label>
                <input
                  type="text"
                  value={githubConfig.repo || ''}
                  onChange={(e) => setGithubConfig((c) => ({ ...c, repo: e.target.value }))}
                  placeholder="例如：dnd-backups"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-dnd-gold/50"
                />
              </div>
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">分支</label>
                <input
                  type="text"
                  value={githubConfig.branch || 'main'}
                  onChange={(e) => setGithubConfig((c) => ({ ...c, branch: e.target.value }))}
                  placeholder="main"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-dnd-gold/50"
                />
              </div>
              <div>
                <label className="block text-dnd-text-muted text-xs mb-1">路径前缀</label>
                <input
                  type="text"
                  value={githubConfig.pathPrefix || 'dnd-backups'}
                  onChange={(e) => setGithubConfig((c) => ({ ...c, pathPrefix: e.target.value }))}
                  placeholder="dnd-backups"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-dnd-gold/50"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveGitHubConfig}
                className="flex-1 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
