import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, Plus, Pencil, Trash2, X } from 'lucide-react'
import {
  getMergedSpells,
  getSpellById,
  SPELL_SCHOOLS,
  addCustomSpell,
  findSpellNameConflict,
  saveSpellEdits,
  removeCustomSpell,
  clearSpellOverride,
  isCustomSpellId,
  hasSpellFieldOverride,
  SPELL_OVERRIDES_CHANGED_EVENT,
} from '../data/spellDatabase'
import { getCharacter, updateCharacter } from '../lib/characterStore'
import { inputClass, textareaClass } from '../lib/inputStyles'
import { readSpellsPageViewState, writeSpellsPageViewState } from '../lib/spellsPageViewState'

function getInitialSpellsPageExpandState() {
  const s = readSpellsPageViewState()
  if (!s) {
    return { levels: new Set(), scrollY: 0 }
  }
  return {
    levels: new Set(s.expandedLevels),
    scrollY: s.scrollY,
  }
}

const LEVEL_LABELS = {
  0: '戏法',
  1: '一环',
  2: '二环',
  3: '三环',
  4: '四环',
  5: '五环',
  6: '六环',
  7: '七环',
  8: '八环',
  9: '九环',
}

/** 学派 → 标签样式（背景/文字/边框） */
const SCHOOL_TAG_STYLES = {
  防护: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  咒法: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  预言: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
  惑控: 'bg-pink-500/20 text-pink-200 border-pink-500/40',
  塑能: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  幻术: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  死灵: 'bg-purple-600/25 text-purple-200 border-purple-500/40',
  变化: 'bg-teal-500/20 text-teal-200 border-teal-500/40',
  灵能: 'bg-indigo-500/25 text-indigo-200 border-indigo-500/50',
}
function getSchoolTagStyle(school) {
  return SCHOOL_TAG_STYLES[school] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/40'
}

/** 与角色法术卡（CharacterSpells）同系 */
const SPELL_COMPENDIUM_CARD_CLASS =
  'rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/22 to-[#222f45]/18 p-3 min-w-0 flex flex-col h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'

function SpellCompendiumCard({ spell, char, charSpellIds, onEdit, onAddToChar }) {
  const canAddToChar = !!(char?.id && !charSpellIds.has(spell.id))
  const custom = isCustomSpellId(spell.id)
  const overridden = !custom && hasSpellFieldOverride(spell.id)
  const metaItems = [
    { label: '施法时间', value: spell.castingTime },
    { label: '施法距离', value: spell.range },
    { label: '法术成分', value: spell.components },
    { label: '持续时间', value: spell.duration },
  ].filter((m) => m.value)

  return (
    <div className={SPELL_COMPENDIUM_CARD_CLASS}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto">
          <div className="flex min-h-[2rem] items-start justify-between gap-2">
            <span className="block min-w-0 flex-1 break-words text-base font-semibold leading-tight text-white">{spell.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(spell.id)}
                className="shrink-0 rounded p-1 text-gray-500 hover:bg-white/10 hover:text-dnd-gold-light"
                title="编辑法术"
                aria-label={`编辑 ${spell.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {canAddToChar && (
                <button
                  type="button"
                  onClick={() => onAddToChar(spell.id)}
                  className="shrink-0 rounded border border-dnd-gold/50 bg-dnd-gold/25 px-2 py-0.5 text-[11px] font-medium text-dnd-gold-light hover:bg-dnd-gold/35"
                >
                  添加至角色
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {spell.school ? (
              <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${getSchoolTagStyle(spell.school)}`}>
                {spell.school}
              </span>
            ) : null}
            {spell.ritual ? (
              <span className="inline-flex items-center rounded border-0 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">仪式</span>
            ) : null}
            {custom ? (
              <span className="inline-flex shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200/90">
                自定义
              </span>
            ) : null}
          </div>
          {spell.source?.length > 0 ? (
            <p className="text-[10px] leading-snug text-dnd-text-muted">
              法表：{spell.source.join('、')}
            </p>
          ) : null}
          {metaItems.length > 0 ? (
            <div className="space-y-0.5 text-sm">
              {metaItems.map(({ label, value }) => {
                const isRitualCastingTime = label === '施法时间' && spell.ritual && value
                return (
                  <div key={label} className="flex min-w-0 items-baseline gap-2">
                    <span className="w-16 shrink-0 text-xs font-medium text-dnd-gold-light">{label}：</span>
                    <span
                      className={`min-w-0 flex-1 break-words text-sm ${
                        isRitualCastingTime
                          ? 'inline-block rounded border border-dnd-gold/50 bg-dnd-gold/20 px-1.5 py-0.5 text-dnd-gold'
                          : 'text-gray-300'
                      }`}
                    >
                      {value}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}
          {spell.description ? (
            <div className="border-t border-white/10 pt-1">
              <span className="mb-0.5 block text-xs font-medium text-dnd-gold-light">法术描述</span>
              <p className="whitespace-pre-line text-justify text-xs leading-relaxed text-gray-300/95">
                {highlightSpellDescription(spell.description)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const initialSpellForm = {
  name: '',
  level: 0,
  school: '',
  source: [],
  castingTime: '',
  range: '',
  components: '',
  duration: '',
  description: '',
  ritual: false,
}

const selectClass = inputClass

function spellRowToForm(s) {
  if (!s) return { ...initialSpellForm }
  return {
    name: s.name ?? '',
    level: s.level ?? 0,
    school: s.school ?? '',
    source: Array.isArray(s.source) ? s.source : [],
    castingTime: s.castingTime ?? '',
    range: s.range ?? '',
    components: s.components ?? '',
    duration: s.duration ?? '',
    description: s.description ?? '',
    ritual: !!s.ritual,
  }
}

function SpellFormGrid({ form, setForm, excludeSpellId, formInstanceId = 'default' }) {
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const sourceStr = Array.isArray(form.source) ? form.source.join('、') : form.source || ''
  const setSourceStr = (s) => update('source', s ? s.split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : [])
  const nameDup = useMemo(() => {
    const n = form.name?.trim()
    if (!n) return null
    return findSpellNameConflict(n, excludeSpellId ?? null)
  }, [form.name, excludeSpellId])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <div className="sm:col-span-2">
        <label className="block text-dnd-text-muted text-xs mb-1">名称 *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="法术名称"
          className={inputClass}
        />
        {nameDup && (
          <p className="text-amber-400/95 text-xs mt-1">
            已存在同名法术：「{nameDup.name}」（id：{nameDup.id}），请改名后再保存。
          </p>
        )}
      </div>
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">环阶</label>
        <select
          value={form.level}
          onChange={(e) => update('level', parseInt(e.target.value, 10))}
          className={selectClass}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lv) => (
            <option key={lv} value={lv}>
              {LEVEL_LABELS[lv]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">学派</label>
        <select
          value={form.school}
          onChange={(e) => update('school', e.target.value)}
          className={selectClass}
        >
          <option value="">—</option>
          {SPELL_SCHOOLS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-dnd-text-muted text-xs mb-1">法表（多个用顿号或逗号）</label>
        <input
          type="text"
          value={sourceStr}
          onChange={(e) => setSourceStr(e.target.value)}
          placeholder="术士、法师"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">施法时间</label>
        <input
          type="text"
          value={form.castingTime}
          onChange={(e) => update('castingTime', e.target.value)}
          placeholder="动作"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">距离</label>
        <input
          type="text"
          value={form.range}
          onChange={(e) => update('range', e.target.value)}
          placeholder="60 尺"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">成分</label>
        <input
          type="text"
          value={form.components}
          onChange={(e) => update('components', e.target.value)}
          placeholder="V、S"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-dnd-text-muted text-xs mb-1">持续</label>
        <input
          type="text"
          value={form.duration}
          onChange={(e) => update('duration', e.target.value)}
          placeholder="立即"
          className={inputClass}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-dnd-text-muted text-xs mb-1">描述</label>
        <textarea
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="法术效果描述"
          rows={8}
          className={textareaClass + ' w-full'}
        />
      </div>
      <div className="sm:col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          id={`spell-ritual-${formInstanceId}`}
          checked={form.ritual}
          onChange={(e) => update('ritual', e.target.checked)}
          className="rounded border-white/20 bg-gray-800 text-dnd-red focus:ring-dnd-red"
        />
        <label htmlFor={`spell-ritual-${formInstanceId}`} className="text-dnd-text-muted text-sm">
          仪式
        </label>
      </div>
    </div>
  )
}

function SpellAddForm({ form, setForm, onSave, onCancel, saveDisabledReason }) {
  const nameDup = useMemo(() => {
    const n = form.name?.trim()
    if (!n) return null
    return findSpellNameConflict(n, null)
  }, [form.name])
  const canSave = form.name.trim() && !nameDup

  return (
    <div className="rounded-xl bg-dnd-card border border-white/10 p-4 mb-4">
      <h3 className="text-white font-medium text-sm mb-3">新增自定义法术</h3>
      <SpellFormGrid form={form} setForm={setForm} excludeSpellId={null} formInstanceId="add" />
      {saveDisabledReason && <p className="text-dnd-red/90 text-xs mt-2">{saveDisabledReason}</p>}
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => canSave && onSave()}
          disabled={!canSave}
          className="px-4 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-sm font-medium"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
        >
          取消
        </button>
      </div>
    </div>
  )
}

function SpellEditModal({ spellId, form, setForm, onClose, onSaved, onDeleteCustom }) {
  const custom = spellId ? isCustomSpellId(spellId) : false
  const overridden = spellId ? hasSpellFieldOverride(spellId) : false
  const nameDup = useMemo(() => {
    const n = form.name?.trim()
    if (!n || !spellId) return null
    return findSpellNameConflict(n, spellId)
  }, [form.name, spellId])
  const canSave = form.name.trim() && !nameDup

  const handleSave = () => {
    if (!spellId || !canSave) return
    Promise.resolve(saveSpellEdits(spellId, form)).then((result) => {
      if (!result || result.ok === false) {
        if (result?.reason === 'duplicate' && result.existing) {
          window.alert(`与已有法术重名：${result.existing.name}（${result.existing.id}）`)
        } else {
          window.alert(result?.reason === 'empty_name' ? '名称不能为空' : '保存失败')
        }
        return
      }
      onSaved()
      onClose()
    })
  }

  const handleRestoreBuiltin = () => {
    if (!spellId || custom) return
    if (!overridden) return
    if (!window.confirm('确定清除本机对该内置法术的修改，恢复为数据文件原文？')) return
    clearSpellOverride(spellId)
    onSaved()
    onClose()
  }

  const handleDeleteCustom = () => {
    if (!spellId || !custom) return
    if (!window.confirm('确定删除这条自定义法术？角色卡已引用的法术 ID 将失效，请先自行调整。')) return
    Promise.resolve(removeCustomSpell(spellId)).then(() => {
      onDeleteCustom?.()
      onClose()
    })
  }

  if (!spellId) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-label="编辑法术"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 shrink-0">
          <span className="text-sm font-semibold text-dnd-gold-light/95">
            编辑法术
            {custom && (
              <span className="ml-2 text-[11px] font-normal text-dnd-text-muted">（自定义 · 写入本机/同步库）</span>
            )}
            {!custom && (
              <span className="ml-2 text-[11px] font-normal text-dnd-text-muted">（内置 · 仅本机覆盖展示）</span>
            )}
          </span>
          <button
            type="button"
            className="p-1 rounded text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="关闭"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 overflow-y-auto flex-1 min-h-0">
          <SpellFormGrid form={form} setForm={setForm} excludeSpellId={spellId} formInstanceId={`edit-${spellId}`} />
        </div>
        <div className="flex flex-wrap gap-2 px-3 pb-3 pt-2 border-t border-white/10 justify-end shrink-0">
          {!custom && overridden && (
            <button
              type="button"
              onClick={handleRestoreBuiltin}
              className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-dnd-text-muted hover:bg-white/5 mr-auto"
            >
              恢复默认
            </button>
          )}
          {custom && (
            <button
              type="button"
              onClick={handleDeleteCustom}
              className="px-3 py-1.5 rounded-lg text-xs border border-dnd-red/50 text-dnd-red hover:bg-dnd-red/15 mr-auto inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-dnd-text-muted hover:bg-white/5"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dnd-red/90 text-white hover:bg-dnd-red disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/** 把描述里的伤害骰和豁免类型高亮+加粗，返回可渲染的片段数组 */
function highlightSpellDescription(description) {
  if (!description) return null
  const re = /(\d+d\d+)|(敏捷豁免|感知豁免|体质豁免|力量豁免|智力豁免|魅力豁免)/g
  const parts = []
  let lastIndex = 0
  let key = 0
  let match
  while ((match = re.exec(description)) !== null) {
    if (match.index > lastIndex) {
      parts.push(description.slice(lastIndex, match.index))
    }
    const text = match[1] ?? match[2]
    const isDamage = match[1] != null
    parts.push(
      <span
        key={`h-${key++}`}
        className={isDamage ? 'font-bold text-amber-300' : 'font-bold text-sky-300'}
      >
        {text}
      </span>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < description.length) {
    parts.push(description.slice(lastIndex))
  }
  return parts
}

export default function Spells() {
  const [searchParams] = useSearchParams()
  const charId = searchParams.get('char')
  const char = charId ? getCharacter(charId) : null
  const charSpellIds = new Set((char?.spells ?? []).map((s) => s.spellId ?? s.id).filter(Boolean))

  const [spellsList, setSpellsList] = useState(() => getMergedSpells())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterSchool, setFilterSchool] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const initExpand = useMemo(() => getInitialSpellsPageExpandState(), [])
  const [expandedLevels, setExpandedLevels] = useState(() => initExpand.levels)
  const [showAddSpell, setShowAddSpell] = useState(false)
  const [spellForm, setSpellForm] = useState(initialSpellForm)
  const [addSpellError, setAddSpellError] = useState('')
  const [editingSpellId, setEditingSpellId] = useState(null)
  const [editSpellForm, setEditSpellForm] = useState(initialSpellForm)
  const [, setCharRefresh] = useState(0)

  const refreshSpells = () => setSpellsList(getMergedSpells())

  useEffect(() => {
    const h = () => refreshSpells()
    window.addEventListener('dnd-realtime-custom-library', h)
    window.addEventListener(SPELL_OVERRIDES_CHANGED_EVENT, h)
    return () => {
      window.removeEventListener('dnd-realtime-custom-library', h)
      window.removeEventListener(SPELL_OVERRIDES_CHANGED_EVENT, h)
    }
  }, [])

  const expandedLevelsRef = useRef(expandedLevels)
  expandedLevelsRef.current = expandedLevels

  /** 在滚动位置恢复完成前，保留 localStorage 中已有 scrollY，避免被 Layout 置顶后的 0 覆盖 */
  const scrollRestorePendingRef = useRef(initExpand.scrollY > 0)

  const persistSpellsPageView = useCallback(() => {
    const levels = expandedLevelsRef.current
    if (scrollRestorePendingRef.current) {
      const cur = readSpellsPageViewState()
      const keepY =
        cur != null && typeof cur.scrollY === 'number' && cur.scrollY > 0 ? cur.scrollY : window.scrollY
      writeSpellsPageViewState({
        expandedLevels: levels,
        expandedSpellIds: [],
        scrollY: keepY,
      })
      return
    }
    writeSpellsPageViewState({
      expandedLevels: levels,
      expandedSpellIds: [],
      scrollY: window.scrollY,
    })
  }, [])

  /** 环阶折叠变更时写入 */
  useEffect(() => {
    persistSpellsPageView()
  }, [expandedLevels, persistSpellsPageView])

  /** 滚动位置节流写入；卸载时再存一次 */
  useEffect(() => {
    let timeoutId = null
    const onScroll = () => {
      if (scrollRestorePendingRef.current) return
      if (timeoutId != null) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        timeoutId = null
        persistSpellsPageView()
      }, 150)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    const onHide = () => persistSpellsPageView()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onHide)
      if (timeoutId != null) window.clearTimeout(timeoutId)
      persistSpellsPageView()
    }
  }, [persistSpellsPageView])

  /** 在 Layout 的 ScrollToTop（useEffect）之后恢复滚动位置 */
  useEffect(() => {
    const y = initExpand.scrollY
    if (!(y > 0)) {
      scrollRestorePendingRef.current = false
      return
    }
    let raf1 = 0
    let raf2 = 0
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: 'auto' })
        scrollRestorePendingRef.current = false
      })
    })
    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
    }
  }, [initExpand.scrollY])

  const addSpellToChar = (spellId) => {
    if (!char?.id) return
    const spell = getSpellById(spellId)
    const isCantrip = spell && (spell.level ?? 0) === 0
    const current = char.spells ?? []
    const next = [...current, { spellId, prepared: isCantrip }]
    updateCharacter(char.id, { spells: next })
    setCharRefresh((r) => r + 1)
  }

  const handleSaveSpell = () => {
    setAddSpellError('')
    Promise.resolve(addCustomSpell(spellForm)).then((result) => {
      if (!result || result.ok === false) {
        if (result?.reason === 'duplicate' && result.existing) {
          setAddSpellError(`与已有法术重名：「${result.existing.name}」（${result.existing.id}）`)
        } else if (result?.reason === 'empty_name') {
          setAddSpellError('名称不能为空')
        } else {
          setAddSpellError('无法保存，请检查名称是否重复')
        }
        return
      }
      setSpellForm(initialSpellForm)
      setShowAddSpell(false)
      refreshSpells()
    })
  }

  const openEditSpell = (id) => {
    const s = getSpellById(id)
    setEditSpellForm(spellRowToForm(s))
    setEditingSpellId(id)
  }

  let list = spellsList
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    list = list.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q))
    )
  }
  if (filterLevel !== '') {
    const lv = parseInt(filterLevel, 10)
    list = list.filter((s) => s.level === lv)
  }
  if (filterSchool) list = list.filter((s) => s.school === filterSchool)
  if (filterClass) list = list.filter((s) => s.source?.includes(filterClass))

  const grouped = {}
  list.forEach((s) => {
    const lv = s.level != null ? s.level : 0
    if (!grouped[lv]) grouped[lv] = []
    grouped[lv].push(s)
  })
  const sortedLevels = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)

  const toggleLevel = (level) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const hasFilters = filterLevel !== '' || filterSchool || filterClass || searchQuery.trim()

  const allClasses = Array.from(new Set(spellsList.flatMap((s) => s.source ?? []))).sort()

  return (
    <div className="p-4 pb-32 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      {char && (
        <div className="mb-4 rounded-lg border border-dnd-gold/45 bg-dnd-gold/10 px-4 py-2 text-dnd-gold-light text-sm">
          正在为角色 <span className="font-semibold">{char.name || '未命名'}</span> 添加法术，点击「添加至角色」将法术加入角色法术卡
        </div>
      )}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="font-display text-xl font-semibold text-white section-title">
          法术大全
        </h1>
        <button
          type="button"
          onClick={() => setShowAddSpell((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" />
          新增法术
        </button>
      </div>

      {showAddSpell && (
        <SpellAddForm
          form={spellForm}
          setForm={setSpellForm}
          onSave={handleSaveSpell}
          onCancel={() => {
            setShowAddSpell(false)
            setSpellForm(initialSpellForm)
            setAddSpellError('')
          }}
          saveDisabledReason={addSpellError}
        />
      )}

      {editingSpellId && (
        <SpellEditModal
          spellId={editingSpellId}
          form={editSpellForm}
          setForm={setEditSpellForm}
          onClose={() => setEditingSpellId(null)}
          onSaved={() => refreshSpells()}
          onDeleteCustom={() => refreshSpells()}
        />
      )}

      {spellsList.length === 0 ? (
        <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-dnd-text-muted text-sm mb-2">
            法术数据尚未录入。录入后此处将按环阶分栏展示，并支持按职业、学派、仪式与关键词筛选。
          </p>
          <p className="text-dnd-text-muted text-xs">
            数据文件：<code className="bg-white/10 px-1 rounded">src/data/spellDatabase.js</code>，结构见 <code className="bg-white/10 px-1 rounded">docs/法术大全-需求分解.md</code>。
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 p-4 mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dnd-text-muted" />
                <input
                  type="text"
                  placeholder="搜索法术名或描述"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full pl-9 pr-3 rounded-lg bg-[#1b2738] text-white border border-[#3a4e69] focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-sm"
                />
              </div>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="h-10 px-3 rounded-lg bg-[#1b2738] text-white border border-[#3a4e69] text-sm min-w-[100px]"
              >
                <option value="">全部环阶</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((lv) => (
                  <option key={lv} value={lv}>
                    {LEVEL_LABELS[lv]}
                  </option>
                ))}
              </select>
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className="h-10 px-3 rounded-lg bg-[#1b2738] text-white border border-[#3a4e69] text-sm min-w-[100px]"
              >
                <option value="">全部学派</option>
                {SPELL_SCHOOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="h-10 px-3 rounded-lg bg-[#1b2738] text-white border border-[#3a4e69] text-sm min-w-[100px]"
              >
                <option value="">全部法表</option>
                {allClasses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <p className="text-dnd-text-muted text-xs mt-2">
                当前筛选结果：{list.length} 个法术
              </p>
            )}
          </div>

          <div className="space-y-4">
            {sortedLevels.length === 0 ? (
              <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
                <p className="text-dnd-text-muted text-sm">无匹配法术。</p>
              </div>
            ) : (
              sortedLevels.map((level) => {
                const isLevelOpen = expandedLevels.has(level)
                return (
                <div key={level} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dnd-gold/50 bg-dnd-gold/30 px-4 py-2 text-left shadow-md transition-colors hover:bg-dnd-gold/35 border-l-4 border-dnd-gold"
                  >
                    {isLevelOpen ? (
                      <ChevronDown className="h-5 w-5 shrink-0 text-dnd-gold-light" />
                    ) : (
                      <ChevronRight className="h-5 w-5 shrink-0 text-dnd-gold-light" />
                    )}
                    <span className="text-base font-bold tracking-wide text-dnd-gold-light">{LEVEL_LABELS[level]}</span>
                    <span className="text-xs font-normal normal-case text-dnd-text-muted">
                      （{grouped[level].length}）
                    </span>
                  </button>
                  {isLevelOpen && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {grouped[level].map((s) => (
                        <SpellCompendiumCard
                          key={s.id}
                          spell={s}
                          char={char}
                          charSpellIds={charSpellIds}
                          onEdit={openEditSpell}
                          onAddToChar={addSpellToChar}
                        />
                      ))}
                    </div>
                  )}
                </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
