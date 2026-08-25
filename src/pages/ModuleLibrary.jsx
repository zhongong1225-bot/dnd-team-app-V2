import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Search, ChevronDown } from 'lucide-react'
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
import ItemAddForm from '../components/ItemAddForm'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'
import { inputClass } from '../lib/inputStyles'
import { BUFF_SOURCE_KIND_LIBRARY_OPTIONS } from '../lib/buffSourceKind'
import { getEffectSummaryShort } from '../components/BuffListItem'

function SectionCard({ title, children, action }) {
  return (
    <div className="rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] p-2 mb-2">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function BuffTemplateItem({ item, onEdit, onDelete }) {
  const effectCount = Array.isArray(item.effects) ? item.effects.length : 0
  return (
    <div className="min-w-0 flex items-center justify-between gap-2 rounded-md border border-white/5 bg-[#1a2333]/40 px-2 py-1">
      <div className="min-w-0 flex-1 flex items-center gap-1.5">
        <p className="text-xs text-gray-200 truncate" title={item.source}>{item.source}</p>
        <span className="text-[10px] text-gray-500 shrink-0">
          {item.duration ? `持续 ${item.duration} · ` : ''}{effectCount} 个效果
        </span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1 rounded-md text-gray-400 hover:bg-gray-700/80 hover:text-dnd-gold-light transition-colors"
          title="编辑"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded-md text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
          title="删除"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

/** 物品模板预览：简述 + 附魔摘要 */
function ItemTemplateDetail({ itemId, compact = false, showEffects = true }) {
  const proto = useMemo(() => (itemId ? getItemById(itemId) : null), [itemId])
  const description = (proto?.详细介绍 ?? '').trim()
  const effectSummaries = useMemo(() => {
    if (!showEffects) return []
    const list = Array.isArray(proto?.effects) ? proto.effects : []
    return list
      .map((e) =>
        getEffectSummaryShort(
          {
            effectType: e.effectType,
            value: e.value,
            customText: e.customText,
            scope: e.scope,
            scopeDetail: e.scopeDetail,
          },
          {},
          {},
        ),
      )
      .filter(Boolean)
  }, [proto, showEffects])

  if (!description && effectSummaries.length === 0) return null

  if (compact) {
    const text = [description, ...effectSummaries].filter(Boolean).join(' · ')
    return (
      <p className="min-w-0 text-[10px] text-gray-400 truncate" title={text}>
        {text}
      </p>
    )
  }

  return (
    <div className="rounded-md border border-white/5 bg-[#1a2333]/40 p-2 space-y-1">
      {description && (
        <p className="text-[11px] text-gray-300 leading-relaxed">{description}</p>
      )}
      {effectSummaries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {effectSummaries.map((s, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemTemplateItem({ item, onEdit, onDelete }) {
  const proto = useMemo(() => (item.itemId ? getItemById(item.itemId) : null), [item.itemId])
  const displayName = item.name || getItemDisplayName(proto) || item.itemId || '未选择物品'
  const isAuto = item.source === 'character'
  return (
    <div className="min-w-0 flex flex-col gap-0.5 rounded-md border border-white/5 bg-[#1a2333]/40 px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          <span
            className={`text-[10px] px-1 py-0 rounded shrink-0 ${
              isAuto ? 'bg-dnd-gold/20 text-dnd-gold-light' : 'bg-gray-700/60 text-gray-300'
            }`}
          >
            {isAuto ? '自动' : '手动'}
          </span>
          <p className="text-xs text-gray-200 truncate" title={displayName}>{displayName}</p>
          <span className="text-[10px] text-gray-500 shrink-0">
            数量 {item.qty ?? 1}{item.rarity ? ` · ${item.rarity}` : ''}{item.isAttuned ? ' · 已同调' : ''}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-1 rounded-md text-gray-400 hover:bg-gray-700/80 hover:text-dnd-gold-light transition-colors"
            title="编辑"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded-md text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <ItemTemplateDetail itemId={item.itemId} compact />
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
  const [collapsedBuffGroups, setCollapsedBuffGroups] = useState(new Set())
  const [collapsedItemGroups, setCollapsedItemGroups] = useState(new Set())

  const buffTemplates = moduleLibrary?.buffTemplates ?? []
  const itemTemplates = moduleLibrary?.itemTemplates ?? []

  const filteredBuffTemplates = useMemo(() => {
    const q = buffSearch.trim().toLowerCase()
    const excluded = new Set(['equipment', 'adventure'])
    return buffTemplates.filter((t) => {
      if (excluded.has(t.sourceKind)) return false
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

  const groupedBuffTemplates = useMemo(() => {
    const map = {}
    for (const t of filteredBuffTemplates) {
      const k = t.sourceKind || 'temporary'
      if (!map[k]) map[k] = []
      map[k].push(t)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) =>
        String(a.source ?? '').localeCompare(String(b.source ?? ''), 'zh-CN'),
      )
    }
    return BUFF_SOURCE_KIND_LIBRARY_OPTIONS.map((o) => ({
      key: o.key,
      label: o.label,
      items: map[o.key] || [],
    })).filter((g) => g.items.length > 0)
  }, [filteredBuffTemplates])

  const groupedItemTemplates = useMemo(() => {
    const map = {}
    for (const t of filteredItemTemplates) {
      const proto = t.itemId ? getItemById(t.itemId) : null
      const type = proto?.类型 || '其他'
      if (!map[type]) map[type] = []
      map[type].push(t)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const nameA = (a.name || getItemDisplayName(a.itemId ? getItemById(a.itemId) : null) || a.itemId || '').toLowerCase()
        const nameB = (b.name || getItemDisplayName(b.itemId ? getItemById(b.itemId) : null) || b.itemId || '').toLowerCase()
        return nameA.localeCompare(nameB, 'zh-CN')
      })
    }
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((k) => ({ key: k, label: k, items: map[k] }))
  }, [filteredItemTemplates])

  const toggleBuffGroup = useCallback((key) => {
    setCollapsedBuffGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleItemGroup = useCallback((key) => {
    setCollapsedItemGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

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

  const handleDeleteItem = async (id) => {
    await removeItemTemplate(currentModuleId, id)
    await refreshModuleLibrary()
  }

  const openNewBuff = () => setBuffForm({ id: null, initial: null })
  const openEditBuff = (item) => setBuffForm({ id: item.id, initial: item })
  const openNewItem = () =>
    setItemForm({ id: null, editEntry: { itemId: '' } })
  const openEditItem = (tpl) => {
    setItemForm({
      id: tpl.id,
      editEntry: {
        itemId: tpl.itemId || '',
        name: tpl.name || '',
        qty: tpl.qty ?? 1,
        isAttuned: !!tpl.isAttuned,
        rarity: tpl.rarity ?? '',
        详细介绍: tpl.intro ?? '',
        攻击: tpl.攻击,
        伤害: tpl.伤害,
        攻击距离: tpl.攻击距离,
        附注: tpl.附注,
        精通: tpl.精通,
        magicBonus: tpl.magicBonus,
        charge: tpl.charge,
        spellDC: tpl.spellDC,
        spellAttackBonus: tpl.spellAttackBonus,
        爆炸半径: tpl.爆炸半径,
        effects: Array.isArray(tpl.effects) ? tpl.effects : [],
      },
    })
  }

  const handleTemplateSave = async (data) => {
    if (!data?.itemId) return
    const payload = {
      itemId: data.itemId,
      name: data.name?.trim() || undefined,
      qty: Math.max(1, Number(data.qty) || 1),
      isAttuned: !!data.isAttuned,
      rarity: data.rarity ?? '',
      intro: data.详细介绍 != null ? String(data.详细介绍).trim() : '',
      攻击: data.攻击,
      伤害: data.伤害,
      攻击距离: data.攻击距离,
      附注: data.附注,
      精通: data.精通,
      magicBonus: data.magicBonus,
      charge: data.charge,
      spellDC: data.spellDC,
      spellAttackBonus: data.spellAttackBonus,
      爆炸半径: data.爆炸半径,
      effects: Array.isArray(data.effects) ? data.effects.map((e) => ({ ...e })) : [],
    }
    if (itemForm.id) {
      await updateItemTemplate(currentModuleId, itemForm.id, payload)
    } else {
      await addItemTemplate(currentModuleId, payload)
    }
    setItemForm(null)
    await refreshModuleLibrary()
  }

  const handleTemplateItemSelect = (info) => {
    if (!itemForm) return
    setItemForm((s) => s ? {
      ...s,
      editEntry: { ...(s.editEntry || {}), itemId: info.itemId, name: info.name, 详细介绍: info.intro },
    } : s)
  }

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
        <div className="flex flex-col sm:flex-row gap-2 mb-1.5">
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
            className={`${inputClass} text-xs min-w-[6.5rem]`}
          >
            <option value="">全部分类</option>
            {BUFF_SOURCE_KIND_LIBRARY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        {filteredBuffTemplates.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-3">
            {buffTemplates.length === 0 ? '暂无 BUFF 模板' : '没有匹配的 BUFF'}
          </p>
        ) : (
          <div className="space-y-1">
            {groupedBuffTemplates.map((g) => {
              const collapsed = collapsedBuffGroups.has(g.key)
              return (
                <div key={g.key} className="rounded-md border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleBuffGroup(g.key)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 bg-[#1a2333]/80 hover:bg-[#1a2333] transition-colors"
                  >
                    <span className="text-xs font-bold text-dnd-gold-light">
                      {g.label}
                      <span className="ml-1.5 text-[10px] font-normal text-gray-500">{g.items.length}</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed && (
                    <div className="p-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 bg-[#141c28]/40">
                      {g.items.map((item) => (
                        <BuffTemplateItem
                          key={item.id}
                          item={item}
                          onEdit={() => openEditBuff(item)}
                          onDelete={() => handleDeleteBuff(item.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
        <div className="relative mb-1.5">
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
          <div className="space-y-1">
            {groupedItemTemplates.map((g) => {
              const collapsed = collapsedItemGroups.has(g.key)
              return (
                <div key={g.key} className="rounded-md border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleItemGroup(g.key)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 bg-[#1a2333]/80 hover:bg-[#1a2333] transition-colors"
                  >
                    <span className="text-xs font-bold text-dnd-gold-light">
                      {g.label}
                      <span className="ml-1.5 text-[10px] font-normal text-gray-500">{g.items.length}</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                  {!collapsed && (
                    <div className="p-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 bg-[#141c28]/40">
                      {g.items.map((item) => (
                        <ItemTemplateItem
                          key={item.id}
                          item={item}
                          onEdit={() => openEditItem(item)}
                          onDelete={() => handleDeleteItem(item.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
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
                sourceKindOptions={BUFF_SOURCE_KIND_LIBRARY_OPTIONS}
                onSave={handleSaveBuff}
                onCancel={() => setBuffForm(null)}
              />
            </div>
          </div>
        </>
      )}

      {itemForm && (
        <ItemAddForm
          open={!!itemForm}
          onClose={() => setItemForm(null)}
          onSave={handleTemplateSave}
          submitLabel="保存"
          editEntry={itemForm.editEntry}
          inventory={[]}
          spellDC={0}
          spellAttackBonus={0}
          referenceData={{}}
          templateMode
          onItemSelect={handleTemplateItemSelect}
        />
      )}
    </div>
  )
}
