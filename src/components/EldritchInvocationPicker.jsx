import { useEffect, useMemo, useState } from 'react'
import { Search, X, Check, Sparkles, Settings } from 'lucide-react'
import { ELDRITCH_INVOCATIONS } from '../data/eldritchInvocations'
import { loadDefaultBuffPatch, saveDefaultBuffPatch } from '../lib/defaultBuffPatchStore'
import { useAuth } from '../contexts/AuthContext'
import { inputClass } from '../lib/inputStyles'
import BuffForm from './BuffForm'

const LEVEL_GROUPS = [
  { label: '全部', value: 0 },
  { label: '1级', value: 1 },
  { label: '2级+', value: 2 },
  { label: '5级+', value: 5 },
  { label: '7级+', value: 7 },
  { label: '9级+', value: 9 },
  { label: '12级+', value: 12 },
  { label: '15级+', value: 15 },
]

export default function EldritchInvocationPicker({
  isOpen,
  onClose,
  onConfirm,
  selectedIds = [],
  warlockLevel = 0,
  maxInvocations = 0,
  selectedCount = 0,
  moduleId = 'default',
}) {
  const { isAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState(0)
  const [selected, setSelected] = useState(new Set(selectedIds))
  const [previewId, setPreviewId] = useState(null)
  const [editingDefaultBuff, setEditingDefaultBuff] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setLevelFilter(0)
    setSelected(new Set(selectedIds))
    setPreviewId(null)
    setEditingDefaultBuff(false)
  }, [isOpen, selectedIds])

  const preview = useMemo(() => {
    if (!previewId) return null
    return ELDRITCH_INVOCATIONS.find((x) => x.id === previewId) ?? null
  }, [previewId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ELDRITCH_INVOCATIONS.filter((inv) => {
      if (levelFilter && inv.level < levelFilter) return false
      if (!q) return true
      return (
        inv.name.toLowerCase().includes(q) ||
        inv.nameEn.toLowerCase().includes(q) ||
        inv.description.toLowerCase().includes(q)
      )
    })
  }, [query, levelFilter])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selected))
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/65">
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border border-white/15 bg-[#1b2738] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-dnd-gold-light/95 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              选择魔能祈唤
            </h2>
            <p className="text-[11px] text-dnd-text-muted">勾选已习得的祈唤，确认后将固定显示在 BUFF 栏。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* List */}
          <div className="flex-1 min-w-0 flex flex-col border-r border-white/10">
            <div className="p-3 border-b border-white/10 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索祈唤名称或效果..."
                  className={inputClass + ' w-full pl-9 pr-3 h-9 text-sm'}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LEVEL_GROUPS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setLevelFilter(g.value)}
                    className={`px-2 py-1 rounded-md text-xs transition-colors ${
                      levelFilter === g.value
                        ? 'bg-dnd-red/20 text-dnd-red font-medium'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filtered.map((inv) => {
                const active = selected.has(inv.id)
                return (
                  <div
                    key={inv.id}
                    onClick={() => setPreviewId(inv.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                      previewId === inv.id
                        ? 'border-dnd-gold/50 bg-dnd-gold/10'
                        : active
                          ? 'border-dnd-red/40 bg-dnd-red/5'
                          : 'border-gray-600 bg-gray-800/40 hover:bg-gray-800/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggle(inv.id) }}
                      className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        active
                          ? 'bg-dnd-red border-dnd-red text-white'
                          : 'border-gray-500 bg-gray-800 text-transparent hover:border-gray-400'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                      <span className="text-sm text-white font-medium truncate">{inv.name}</span>
                      <span className="text-[11px] text-dnd-text-muted shrink-0">
                        {inv.level === 1 ? '1级' : (inv.prerequisite || `魔契师等级${inv.level}+`)}
                        {inv.repeatable && <span className="ml-1.5 text-dnd-gold-light/80">可重复</span>}
                      </span>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <p className="text-center text-gray-500 text-xs py-8">没有匹配的祈唤</p>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="w-80 sm:w-96 bg-[#141f2e]/60 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 bg-[#1b2738]/80 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="text-dnd-text-muted">魔契师等级</span>
                <span className="text-white font-medium">{warlockLevel > 0 ? `${warlockLevel} 级` : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-dnd-text-muted">已选 / 上限</span>
                <span className="text-white font-medium">{selectedCount} / {maxInvocations}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-dnd-text-muted">剩余可选</span>
                <span className={`font-medium ${maxInvocations - selectedCount > 0 ? 'text-dnd-gold-light' : 'text-gray-400'}`}>
                  {maxInvocations - selectedCount > 0 ? `${maxInvocations - selectedCount} 个` : '无'}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {preview ? (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-dnd-gold-light/95">{preview.name}</h3>
                    <p className="text-xs text-gray-500">{preview.nameEn}</p>
                  </div>
                  <div className="text-xs text-dnd-text-muted space-y-1">
                    <p>等级要求：{preview.level === 1 ? '1级' : `${preview.level}级+`}</p>
                    {preview.prerequisite && <p>先决：{preview.prerequisite}</p>}
                    {preview.repeatable && <p className="text-dnd-gold-light/80">本祈唤可重复选择</p>}
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{preview.description}</p>

                  {isAdmin && (
                    <div className="border-t border-white/10 pt-3 mt-3">
                      <button
                        type="button"
                        onClick={() => setEditingDefaultBuff(true)}
                        className="inline-flex items-center gap-1.5 text-xs text-dnd-gold-light hover:text-dnd-gold transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        配置默认 BUFF（DM）
                      </button>
                      <p className="text-[10px] text-dnd-text-muted mt-1">
                        配置后，其他玩家选择该祈唤时会自动获得此 BUFF。
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-xs text-center mt-20">点击左侧祈唤查看详情</p>
              )}
            </div>
            <div className="p-3 border-t border-white/10 shrink-0">
              <p className="text-xs text-dnd-text-muted mb-2">已选择 {selected.size} 个</p>
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full px-3 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red/90 text-white text-sm font-medium transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DM 默认 BUFF 编辑器 */}
      {editingDefaultBuff && preview && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 bg-black/75">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-dnd-gold-light/95">配置「{preview.name}」默认 BUFF</h3>
              <button
                type="button"
                onClick={() => setEditingDefaultBuff(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <BuffForm
              initial={{
                source: preview.name,
                effects: loadDefaultBuffPatch(moduleId, 'invocation', preview.id)?.effects ?? [],
                duration: loadDefaultBuffPatch(moduleId, 'invocation', preview.id)?.duration ?? '',
                enabled: loadDefaultBuffPatch(moduleId, 'invocation', preview.id)?.enabled !== false,
              }}
              onSave={(buff) => {
                saveDefaultBuffPatch(moduleId, 'invocation', preview.id, {
                  effects: buff.effects,
                  duration: buff.duration,
                  enabled: buff.enabled,
                })
                setEditingDefaultBuff(false)
              }}
              onCancel={() => setEditingDefaultBuff(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
