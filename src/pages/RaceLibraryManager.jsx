import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAllRaces,
  addCustomRace,
  updateCustomRace,
  removeCustomRace,
} from '../data/races'
import {
  DEFAULT_RACE,
  RACE_SIZES,
  CREATURE_TYPE_OPTIONS,
  createEmptyTrait,
  createEmptyTable,
  createEmptySubrace,
  normalizeRace,
} from '../data/raceModel'
import BuffForm from '../components/BuffForm'

const inputCls = 'w-full bg-[#0d1520] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-dnd-gold/50'
const labelCls = 'text-[10px] text-dnd-text-muted block mb-0.5'
const sectionCls = 'rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2'

const SPEED_LABELS = { walk: '行走', climb: '攀爬', swim: '游泳', fly: '飞行', burrow: '掘地' }
const DICE_OPTIONS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

export default function RaceLibraryManager() {
  const navigate = useNavigate()
  const [races, setRaces] = useState([])
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('')
  const [editingTraitBuffId, setEditingTraitBuffId] = useState(null) // { type:'race'|'subrace', subraceId?, traitId }

  const refresh = useCallback(() => setRaces(getAllRaces()), [])
  useEffect(() => { refresh() }, [refresh])

  const filtered = races.filter(r =>
    !filter || r.name.toLowerCase().includes(filter.toLowerCase())
  )

  // ── 基础操作 ──────────────────────────────────────────────
  const startNew = () => setEditing(normalizeRace({ ...DEFAULT_RACE, id: '' }))

  const startEdit = (race) => setEditing(normalizeRace(race))

  const handleSave = () => {
    if (!editing.name.trim()) return
    if (editing.id) {
      updateCustomRace(editing.id, editing)
    } else {
      addCustomRace(editing)
    }
    setEditing(null)
    refresh()
  }

  const handleDelete = (id) => {
    if (window.confirm('确定删除此种族？')) {
      removeCustomRace(id)
      refresh()
    }
  }

  const patch = (key, val) => setEditing(prev => ({ ...prev, [key]: val }))
  const patchSpeed = (key, val) => setEditing(prev => ({
    ...prev,
    speed: { ...prev.speed, [key]: val ? Number(val) : null },
  }))

  const toggleSize = (size) => {
    setEditing(prev => {
      const opts = prev.sizeOptions || []
      const has = opts.includes(size)
      const next = has ? opts.filter(s => s !== size) : [...opts, size]
      const def = next.includes(prev.sizeDefault) ? prev.sizeDefault : (next[0] || 'Medium')
      return { ...prev, sizeOptions: next.length ? next : ['Medium'], sizeDefault: def }
    })
  }

  // ── 特性编辑 ──────────────────────────────────────────────
  const addTrait = () => {
    const t = createEmptyTrait()
    setEditing(prev => ({ ...prev, traits: [...(prev.traits || []), t] }))
  }
  const removeTrait = (id) => {
    setEditing(prev => ({ ...prev, traits: (prev.traits || []).filter(t => t.id !== id) }))
  }
  const patchTrait = (id, key, val) => {
    setEditing(prev => ({
      ...prev,
      traits: (prev.traits || []).map(t => t.id === id ? { ...t, [key]: val } : t),
    }))
  }
  const saveTraitBuff = (traitId, buffPayload) => {
    setEditing(prev => ({
      ...prev,
      traits: (prev.traits || []).map(t =>
        t.id === traitId ? { ...t, cards: buffPayload?.effects || [] } : t
      ),
    }))
    setEditingTraitBuffId(null)
  }

  // ── 表格编辑 ──────────────────────────────────────────────
  const addTable = () => {
    const t = createEmptyTable()
    setEditing(prev => ({ ...prev, tables: [...(prev.tables || []), t] }))
  }
  const removeTable = (id) => {
    setEditing(prev => ({ ...prev, tables: (prev.tables || []).filter(t => t.id !== id) }))
  }
  const patchTable = (id, key, val) => {
    setEditing(prev => ({
      ...prev,
      tables: (prev.tables || []).map(t => t.id === id ? { ...t, [key]: val } : t),
    }))
  }
  const addTableRow = (tableId) => {
    setEditing(prev => ({
      ...prev,
      tables: (prev.tables || []).map(t =>
        t.id === tableId ? { ...t, rows: [...t.rows, { roll: String(t.rows.length + 1), text: '' }] } : t
      ),
    }))
  }
  const removeTableRow = (tableId, rowIdx) => {
    setEditing(prev => ({
      ...prev,
      tables: (prev.tables || []).map(t =>
        t.id === tableId ? { ...t, rows: t.rows.filter((_, i) => i !== rowIdx) } : t
      ),
    }))
  }
  const patchTableRow = (tableId, rowIdx, key, val) => {
    setEditing(prev => ({
      ...prev,
      tables: (prev.tables || []).map(t =>
        t.id === tableId
          ? { ...t, rows: t.rows.map((r, i) => i === rowIdx ? { ...r, [key]: val } : r) }
          : t
      ),
    }))
  }

  // ── 亚种编辑 ──────────────────────────────────────────────
  const addSubrace = () => {
    const s = createEmptySubrace()
    setEditing(prev => ({ ...prev, subraces: [...(prev.subraces || []), s] }))
  }
  const removeSubrace = (id) => {
    setEditing(prev => ({ ...prev, subraces: (prev.subraces || []).filter(s => s.id !== id) }))
  }
  const patchSubrace = (id, key, val) => {
    setEditing(prev => ({
      ...prev,
      subraces: (prev.subraces || []).map(s => s.id === id ? { ...s, [key]: val } : s),
    }))
  }
  const addSubraceTrait = (subraceId) => {
    const t = createEmptyTrait()
    setEditing(prev => ({
      ...prev,
      subraces: (prev.subraces || []).map(s =>
        s.id === subraceId ? { ...s, traits: [...(s.traits || []), t] } : s
      ),
    }))
  }
  const removeSubraceTrait = (subraceId, traitId) => {
    setEditing(prev => ({
      ...prev,
      subraces: (prev.subraces || []).map(s =>
        s.id === subraceId ? { ...s, traits: (s.traits || []).filter(t => t.id !== traitId) } : s
      ),
    }))
  }
  const patchSubraceTrait = (subraceId, traitId, key, val) => {
    setEditing(prev => ({
      ...prev,
      subraces: (prev.subraces || []).map(s =>
        s.id === subraceId
          ? { ...s, traits: (s.traits || []).map(t => t.id === traitId ? { ...t, [key]: val } : t) }
          : s
      ),
    }))
  }
  const saveSubraceTraitBuff = (subraceId, traitId, buffPayload) => {
    setEditing(prev => ({
      ...prev,
      subraces: (prev.subraces || []).map(s =>
        s.id === subraceId
          ? {
              ...s,
              traits: (s.traits || []).map(t =>
                t.id === traitId ? { ...t, cards: buffPayload?.effects || [] } : t
              ),
            }
          : s
      ),
    }))
    setEditingTraitBuffId(null)
  }

  // ── BuffForm 保存分发 ─────────────────────────────────────
  const handleBuffSave = (buffPayload) => {
    if (!editingTraitBuffId) return
    if (editingTraitBuffId.type === 'race') {
      saveTraitBuff(editingTraitBuffId.traitId, buffPayload)
    } else {
      saveSubraceTraitBuff(editingTraitBuffId.subraceId, editingTraitBuffId.traitId, buffPayload)
    }
  }

  // ── 查找当前正在编辑 BUFF 的特性 ──────────────────────────
  const findBuffTrait = () => {
    if (!editingTraitBuffId || !editing) return null
    if (editingTraitBuffId.type === 'race') {
      return (editing.traits || []).find(t => t.id === editingTraitBuffId.traitId)
    }
    const sub = (editing.subraces || []).find(s => s.id === editingTraitBuffId.subraceId)
    return sub ? (sub.traits || []).find(t => t.id === editingTraitBuffId.traitId) : null
  }

  // ══════════════════════════════════════════════════════════
  // 编辑视图
  // ══════════════════════════════════════════════════════════
  if (editing) {
    const buffTrait = findBuffTrait()
    const buffLabel = editingTraitBuffId?.type === 'subrace'
      ? (editing.subraces || []).find(s => s.id === editingTraitBuffId?.subraceId)?.name
      : editing.name

    return (
      <>
      <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-lg font-semibold text-white">
            {editing.id ? '编辑种族' : '新建种族'}
          </h1>
          <button onClick={() => setEditing(null)} className="text-dnd-text-muted text-sm hover:text-white">取消</button>
        </div>

        <div className="space-y-3">
          {/* 基本信息 */}
          <div className={sectionCls}>
            <div>
              <label className={labelCls}>名称 *</label>
              <input className={inputCls} value={editing.name} onChange={e => patch('name', e.target.value)} placeholder="例如：半血裔" />
            </div>
            <div>
              <label className={labelCls}>背景描述</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={10}
                placeholder="种族背景故事 / 风味文字"
                value={editing.description}
                onChange={e => patch('description', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>来源</label>
                <input className={inputCls} value={editing.source} onChange={e => patch('source', e.target.value)} placeholder="例如：Van Richten's Guide" />
              </div>
              <div>
                <label className={labelCls}>生物类型</label>
                <select className={inputCls} value={editing.creatureType} onChange={e => patch('creatureType', e.target.value)}>
                  {CREATURE_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 体型 */}
          <div className={sectionCls}>
            <div className="text-[10px] text-dnd-text-muted">可选体型（可多选）</div>
            <div className="flex gap-3">
              {RACE_SIZES.map(s => (
                <label key={s.value} className="flex items-center gap-1.5 text-xs text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(editing.sizeOptions || []).includes(s.value)}
                    onChange={() => toggleSize(s.value)}
                    className="accent-[#c79a42]"
                  />
                  {s.label}
                </label>
              ))}
            </div>
            {(editing.sizeOptions || []).length > 1 && (
              <div>
                <label className={labelCls}>默认体型</label>
                <select className={inputCls} value={editing.sizeDefault} onChange={e => patch('sizeDefault', e.target.value)}>
                  {(editing.sizeOptions || []).map(s => (
                    <option key={s} value={s}>{RACE_SIZES.find(rs => rs.value === s)?.label || s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 速度 */}
          <div className={sectionCls}>
            <div className="text-[10px] text-dnd-text-muted">速度（尺）</div>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(SPEED_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={editing.speed?.[key] || ''}
                    onChange={e => patchSpeed(key, e.target.value)}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 黑暗视觉 */}
          <div className={sectionCls}>
            <div>
              <label className={labelCls}>黑暗视觉（尺，留空表示无）</label>
              <input
                className={inputCls}
                type="number"
                value={editing.darkvision ?? ''}
                onChange={e => patch('darkvision', e.target.value ? Number(e.target.value) : null)}
                placeholder="例如：60"
              />
            </div>
          </div>

          {/* 特性 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">特性</span>
              <button onClick={addTrait} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {(editing.traits || []).length === 0 && <div className="text-[10px] text-gray-600">无特性</div>}
            {(editing.traits || []).map((t, idx) => (
              <div key={t.id} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="特性名称"
                    value={t.name}
                    onChange={e => patchTrait(t.id, 'name', e.target.value)}
                  />
                  <button onClick={() => removeTrait(t.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="特性描述"
                  value={t.description}
                  onChange={e => patchTrait(t.id, 'description', e.target.value)}
                />
                <button
                  onClick={() => setEditingTraitBuffId({ type: 'race', traitId: t.id })}
                  className="px-2 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px]"
                >
                  编辑效果 {(t.cards || []).length > 0 && `(${t.cards.length})`}
                </button>
              </div>
            ))}
          </div>

          {/* 参考表格 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">参考表格</span>
              <button onClick={addTable} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {(editing.tables || []).length === 0 && <div className="text-[10px] text-gray-600">无参考表格</div>}
            {(editing.tables || []).map((table) => (
              <div key={table.id} className="space-y-1.5 border-t border-white/5 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="表格名称"
                    value={table.name}
                    onChange={e => patchTable(table.id, 'name', e.target.value)}
                  />
                  <select
                    className={`${inputCls} w-20`}
                    value={table.dice}
                    onChange={e => patchTable(table.id, 'dice', e.target.value)}
                  >
                    {DICE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button onClick={() => removeTable(table.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
                </div>
                {table.rows.map((row, rIdx) => (
                  <div key={rIdx} className="flex items-center gap-1.5 pl-2">
                    <input
                      className={`${inputCls} w-16 shrink-0`}
                      placeholder="掷骰"
                      value={row.roll}
                      onChange={e => patchTableRow(table.id, rIdx, 'roll', e.target.value)}
                    />
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder="结果"
                      value={row.text}
                      onChange={e => patchTableRow(table.id, rIdx, 'text', e.target.value)}
                    />
                    <button
                      onClick={() => removeTableRow(table.id, rIdx)}
                      className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addTableRow(table.id)}
                  className="text-[10px] text-dnd-gold/70 hover:text-dnd-gold pl-2"
                >
                  + 添加行
                </button>
              </div>
            ))}
          </div>

          {/* 亚种 */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">亚种</span>
              <button onClick={addSubrace} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {(editing.subraces || []).length === 0 && <div className="text-[10px] text-gray-600">无亚种</div>}
            {(editing.subraces || []).map((sub) => (
              <div key={sub.id} className="space-y-1.5 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="亚种名称"
                    value={sub.name}
                    onChange={e => patchSubrace(sub.id, 'name', e.target.value)}
                  />
                  <button onClick={() => removeSubrace(sub.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="亚种描述"
                  value={sub.description}
                  onChange={e => patchSubrace(sub.id, 'description', e.target.value)}
                />
                {/* 亚种特性 */}
                <div className="pl-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-dnd-text-muted">亚种特性</span>
                    <button
                      onClick={() => addSubraceTrait(sub.id)}
                      className="text-dnd-gold/70 text-[10px] hover:text-dnd-gold"
                    >
                      + 添加
                    </button>
                  </div>
                  {(sub.traits || []).map((st, stIdx) => (
                    <div key={st.id} className="space-y-1 border-l-2 border-white/5 pl-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-dnd-text-muted w-4 shrink-0">{stIdx + 1}.</span>
                        <input
                          className={`${inputCls} flex-1`}
                          placeholder="特性名称"
                          value={st.name}
                          onChange={e => patchSubraceTrait(sub.id, st.id, 'name', e.target.value)}
                        />
                        <button
                          onClick={() => removeSubraceTrait(sub.id, st.id)}
                          className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1"
                        >
                          ×
                        </button>
                      </div>
                      <textarea
                        className={`${inputCls} resize-none`}
                        rows={2}
                        placeholder="特性描述"
                        value={st.description}
                        onChange={e => patchSubraceTrait(sub.id, st.id, 'description', e.target.value)}
                      />
                      <button
                        onClick={() => setEditingTraitBuffId({ type: 'subrace', subraceId: sub.id, traitId: st.id })}
                        className="px-2 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px]"
                      >
                        编辑效果 {(st.cards || []).length > 0 && `(${st.cards.length})`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={!editing.name.trim()}
              className="flex-1 py-2 rounded-lg bg-dnd-gold text-black font-medium text-sm disabled:opacity-40"
            >
              保存
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-lg border border-white/20 text-dnd-text-muted text-sm"
            >
              取消
            </button>
          </div>
        </div>
      </div>

      {/* BUFF 编辑器全屏覆盖 */}
      {buffTrait && editingTraitBuffId && (
        <div className="fixed inset-0 z-50 bg-[var(--page-bg)] overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold text-white">
                编辑效果 — {buffLabel} · {buffTrait.name}
              </h2>
              <button
                onClick={() => setEditingTraitBuffId(null)}
                className="text-dnd-text-muted text-sm hover:text-white"
              >
                取消
              </button>
            </div>
            <BuffForm
              compact
              initial={{ effects: buffTrait.cards || [], source: buffTrait.name }}
              onSave={handleBuffSave}
              onCancel={() => setEditingTraitBuffId(null)}
            />
          </div>
        </div>
      )}
      </>
    )
  }

  // ══════════════════════════════════════════════════════════
  // 列表视图
  // ══════════════════════════════════════════════════════════
  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="text-dnd-text-muted hover:text-white text-lg">←</button>
          <h1 className="font-display text-lg font-semibold text-white">种族库</h1>
        </div>
        <button onClick={startNew} className="px-3 py-1.5 rounded-lg bg-dnd-gold text-black text-xs font-medium">+ 新建</button>
      </div>

      {/* 搜索 */}
      <input
        className={`${inputCls} mb-3`}
        placeholder="搜索种族名称..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center text-dnd-text-muted text-sm py-8">
          {races.length === 0 ? '种族库为空，点击"+ 新建"添加第一个种族' : '没有匹配的种族'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="rounded-lg bg-dnd-card border border-white/10 p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0" onClick={() => startEdit(r)} style={{ cursor: 'pointer' }}>
                <div className="text-white text-sm font-medium truncate">{r.name}</div>
                <div className="text-dnd-text-muted text-[10px]">
                  {(r.sizeOptions || []).map(s => RACE_SIZES.find(rs => rs.value === s)?.label || s).join('/')}
                  {' · '}
                  {CREATURE_TYPE_OPTIONS.find(t => t.value === r.creatureType)?.label || r.creatureType}
                  {r.source && ` · ${r.source}`}
                </div>
                <div className="text-dnd-text-muted text-[10px]">
                  {(r.traits || []).length} 个特性
                  {(r.subraces || []).length > 0 && ` · ${(r.subraces || []).length} 个亚种`}
                  {(r.tables || []).length > 0 && ` · ${(r.tables || []).length} 张表格`}
                  {r.darkvision ? ` · 黑暗视觉 ${r.darkvision}尺` : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                className="ml-2 text-dnd-red/60 hover:text-dnd-red text-xs shrink-0"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
