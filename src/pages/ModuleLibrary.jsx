import { useState, useMemo, useEffect } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Search } from 'lucide-react'
import { useModule } from '../contexts/ModuleContext'
import {
  addBuffTemplate,
  updateBuffTemplate,
  removeBuffTemplate,
  addItemTemplate,
  updateItemTemplate,
  removeItemTemplate,
} from '../lib/moduleLibraryStore'
import BuffForm from '../components/BuffForm'
import ItemPicker from '../components/ItemPicker'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { inputClass, labelClass } from '../lib/inputStyles'
import { BUFF_SOURCE_KIND_OPTIONS } from '../lib/buffSourceKind'

const RARITY_OPTIONS = [
  { value: '', label: '— 稀有度 —' },
  { value: '普通', label: '普通' },
  { value: '非普通', label: '非普通' },
  { value: '珍稀', label: '珍稀' },
  { value: '极珍稀', label: '极珍稀' },
  { value: '传说', label: '传说' },
  { value: '神器', label: '神器' },
]

function SectionCard({ title, children, action }) {
  return (
    <div className="rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function BuffTemplateItem({ item, onEdit, onDelete }) {
  const effectCount = Array.isArray(item.effects) ? item.effects.length : 0
  const kindLabel = BUFF_SOURCE_KIND_OPTIONS.find((o) => o.key === item.sourceKind)?.label ?? '冒险'
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1a2333]/60 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] px-1 py-0 rounded bg-gray-700/60 text-gray-300 shrink-0">{kindLabel}</span>
          <p className="text-sm text-gray-200 truncate" title={item.source}>{item.source}</p>
        </div>
        <p className="text-xs text-gray-500 truncate">
          {item.duration ? `持续 ${item.duration} · ` : ''}{effectCount} 个效果
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-700/80 hover:text-dnd-gold-light transition-colors"
          title="编辑"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
          title="删除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function ItemTemplateItem({ item, onEdit, onDelete }) {
  const proto = useMemo(() => (item.itemId ? getItemById(item.itemId) : null), [item.itemId])
  const displayName = item.name || getItemDisplayName(proto) || item.itemId || '未选择物品'
  const isAuto = item.source === 'character'
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1a2333]/60 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10px] px-1 py-0 rounded shrink-0 ${isAuto ? 'bg-dnd-gold/20 text-dnd-gold-light' : 'bg-gray-700/60 text-gray-300'}`}>
            {isAuto ? '自动' : '手动'}
          </span>
          <p className="text-sm text-gray-200 truncate" title={displayName}>{displayName}</p>
        </div>
        <p className="text-xs text-gray-500 truncate">
          {proto?.类型 ? `${proto.类型} · ` : ''}数量 {item.qty ?? 1}
          {item.rarity ? ` · ${item.rarity}` : ''}{item.isAttuned ? ' · 已同调' : ''}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-700/80 hover:text-dnd-gold-light transition-colors"
          title="编辑"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
          title="删除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function ModuleLibrary() {
  const { modules, currentModuleId, moduleLibrary, refreshModuleLibrary, syncModuleBuffTemplates, syncModuleItemTemplates } = useModule()
  const currentModule = useMemo(
    () => modules.find((m) => m.id === currentModuleId) || { id: currentModuleId || 'default', name: '默认模组' },
    [modules, currentModuleId]
  )

  const [buffForm, setBuffForm] = useState(null)
  const [itemForm, setItemForm] = useState(null)
  const [buffSearch, setBuffSearch] = useState('')
  const [buffKindFilter, setBuffKindFilter] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncingItems, setSyncingItems] = useState(false)

  const buffTemplates = moduleLibrary?.buffTemplates ?? []
  const itemTemplates = moduleLibrary?.itemTemplates ?? []

  const filteredBuffTemplates = useMemo(() => {
    const q = buffSearch.trim().toLowerCase()
    return buffTemplates.filter((t) => {
      if (buffKindFilter && t.sourceKind !== buffKindFilter) return false
      if (!q) return true
      return String(t.source ?? '').toLowerCase().includes(q)
    })
  }, [buffTemplates, buffSearch, buffKindFilter])

  const filteredItemTemplates = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return itemTemplates
    return itemTemplates.filter((t) => {
      const proto = t.itemId ? getItemById(t.itemId) : null
      const name = (t.name || getItemDisplayName(proto) || t.itemId || '').toLowerCase()
      return name.includes(q)
    })
  }, [itemTemplates, itemSearch])

  useEffect(() => {
    refreshModuleLibrary()
  }, [refreshModuleLibrary])

  const handleSaveBuff = async (payload) => {
    if (!payload?.source?.trim()) return
    if (buffForm?.id) {
      await updateBuffTemplate(currentModuleId, buffForm.id, payload)
    } else {
      await addBuffTemplate(currentModuleId, payload)
    }
    setBuffForm(null)
    await refreshModuleLibrary()
  }

  const handleDeleteBuff = async (id) => {
    await removeBuffTemplate(currentModuleId, id)
    await refreshModuleLibrary()
  }

  const handleSaveItem = async (e) => {
    e.preventDefault()
    if (!itemForm?.itemId) return
    const payload = {
      itemId: itemForm.itemId,
      name: itemForm.name?.trim() || undefined,
      qty: Math.max(1, Number(itemForm.qty) || 1),
      isAttuned: !!itemForm.isAttuned,
      rarity: itemForm.rarity || '',
    }
    if (itemForm.id) {
      await updateItemTemplate(currentModuleId, itemForm.id, payload)
    } else {
      await addItemTemplate(currentModuleId, payload)
    }
    setItemForm(null)
    await refreshModuleLibrary()
  }

  const handleDeleteItem = async (id) => {
    await removeItemTemplate(currentModuleId, id)
    await refreshModuleLibrary()
  }

  const openNewBuff = () => setBuffForm({ id: null, initial: null })
  const openEditBuff = (item) => setBuffForm({ id: item.id, initial: item })
  const openNewItem = () =>
    setItemForm({ id: null, itemId: '', name: '', qty: 1, isAttuned: false, rarity: '' })
  const openEditItem = (item) =>
    setItemForm({
      id: item.id,
      itemId: item.itemId || '',
      name: item.name || '',
      qty: item.qty ?? 1,
      isAttuned: !!item.isAttuned,
      rarity: item.rarity || '',
    })

  const handleSyncBuffs = async () => {
    setSyncing(true)
    try {
      await syncModuleBuffTemplates()
    } finally {
      setSyncing(false)
    }
  }

  const handleSyncItems = async () => {
    setSyncingItems(true)
    try {
      await syncModuleItemTemplates()
    } finally {
      setSyncingItems(false)
    }
  }

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <h1 className="font-display text-xl font-semibold text-white mb-1">模组库</h1>
      <p className="text-dnd-text-muted text-xs mb-4">
        当前模组：{currentModule.name}
        <span className="text-gray-600 ml-1">({currentModuleId || 'default'})</span>
      </p>

      <SectionCard
        title="BUFF 模板"
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSyncBuffs}
              disabled={syncing}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-600/80 text-gray-200 hover:bg-gray-700/50 text-xs font-medium transition-colors disabled:opacity-50"
              title="从当前模组所有角色卡自动汇总 BUFF"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              同步
            </button>
            <button
              type="button"
              onClick={openNewBuff}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-dnd-gold text-dnd-gold-light hover:bg-dnd-gold/20 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加
            </button>
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={buffSearch}
              onChange={(e) => setBuffSearch(e.target.value)}
              placeholder="搜索 BUFF 名称"
              className={`${inputClass} pl-7 text-xs`}
            />
          </div>
          <select
            value={buffKindFilter}
            onChange={(e) => setBuffKindFilter(e.target.value)}
            className={`${inputClass} text-xs min-w-[7rem]`}
          >
            <option value="">全部分类</option>
            {BUFF_SOURCE_KIND_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        {filteredBuffTemplates.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-3">
            {buffTemplates.length === 0 ? '暂无 BUFF 模板' : '没有匹配的 BUFF'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredBuffTemplates.map((item) => (
              <BuffTemplateItem
                key={item.id}
                item={item}
                onEdit={() => openEditBuff(item)}
                onDelete={() => handleDeleteBuff(item.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="物品模板"
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSyncItems}
              disabled={syncingItems}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-600/80 text-gray-200 hover:bg-gray-700/50 text-xs font-medium transition-colors disabled:opacity-50"
              title="从当前模组所有角色卡自动汇总物品"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingItems ? 'animate-spin' : ''}`} />
              同步
            </button>
            <button
              type="button"
              onClick={openNewItem}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-dnd-gold text-dnd-gold-light hover:bg-dnd-gold/20 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加
            </button>
          </div>
        }
      >
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="搜索物品名称"
            className={`${inputClass} pl-7 text-xs`}
          />
        </div>
        {filteredItemTemplates.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-3">
            {itemTemplates.length === 0 ? '暂无物品模板' : '没有匹配的物品'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredItemTemplates.map((item) => (
              <ItemTemplateItem
                key={item.id}
                item={item}
                onEdit={() => openEditItem(item)}
                onDelete={() => handleDeleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {buffForm && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/50" onClick={() => setBuffForm(null)} aria-hidden />
          <div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={() => setBuffForm(null)}
          >
            <div className="w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <BuffForm
                key={`module-buff-${buffForm.id ?? 'new'}`}
                initial={buffForm.initial}
                defaultSourceKind="temporary"
                onSave={handleSaveBuff}
                onCancel={() => setBuffForm(null)}
              />
            </div>
          </div>
        </>
      )}

      {itemForm && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/50" onClick={() => setItemForm(null)} aria-hidden />
          <div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={() => setItemForm(null)}
          >
            <form
              onSubmit={handleSaveItem}
              className="w-full max-w-lg bg-gray-800 rounded-xl border border-gray-600 p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wide">
                {itemForm.id ? '编辑物品模板' : '新建物品模板'}
              </h3>
              <div>
                <label className={labelClass}>选择物品</label>
                <ItemPicker
                  value={itemForm.itemId}
                  onChange={(id) => setItemForm((s) => ({ ...s, itemId: id }))}
                  className="w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>显示名称（可选）</label>
                  <input
                    type="text"
                    value={itemForm.name}
                    onChange={(e) => setItemForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder={itemForm.itemId ? getItemDisplayName(getItemById(itemForm.itemId)) : ''}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>数量</label>
                  <input
                    type="number"
                    min={1}
                    value={itemForm.qty}
                    onChange={(e) => setItemForm((s) => ({ ...s, qty: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className={labelClass}>稀有度</label>
                  <select
                    value={itemForm.rarity}
                    onChange={(e) => setItemForm((s) => ({ ...s, rarity: e.target.value }))}
                    className={inputClass}
                  >
                    {RARITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-200 pb-2">
                  <input
                    type="checkbox"
                    checked={itemForm.isAttuned}
                    onChange={(e) => setItemForm((s) => ({ ...s, isAttuned: e.target.checked }))}
                    className="rounded border-gray-600 bg-gray-700 text-dnd-gold focus:ring-dnd-gold"
                  />
                  默认同调
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setItemForm(null)}
                  className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-700 text-xs font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!itemForm.itemId}
                  className="px-3 py-1.5 rounded-lg bg-dnd-gold text-gray-900 hover:bg-dnd-gold-light text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
