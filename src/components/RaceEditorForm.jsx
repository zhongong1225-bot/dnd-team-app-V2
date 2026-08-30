import { useState } from 'react'
import {
  RACE_SIZES,
  CREATURE_TYPE_OPTIONS,
  createEmptyTrait,
  createEmptyTable,
  createEmptySubrace,
} from '../data/raceModel'
import BuffForm from './BuffForm'

const inputCls = 'w-full bg-[#0d1520] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-dnd-gold/50'
const labelCls = 'text-[10px] text-dnd-text-muted block mb-0.5'
const sectionCls = 'rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2'

const SPEED_LABELS = { walk: '行走', climb: '攀爬', swim: '游泳', fly: '飞行', burrow: '掘地' }
const DICE_OPTIONS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

/**
 * RaceEditorForm — 可复用种族编辑表单
 * 
 * Props:
 * - race: 当前编辑的种族对象（含 id/name/description/source/creatureType/sizeOptions/sizeDefault/speed/darkvision/traits/tables/subraces）
 * - onChange(race): 每次字段变更时回调，父组件负责更新 state
 * - onSave(): 点击保存按钮时回调
 * - onCancel(): 点击取消按钮时回调
 * - showSaveButtons: boolean，是否显示底部保存/取消按钮（默认 true）
 */
export default function RaceEditorForm({ race, onChange, onSave, onCancel, showSaveButtons = true }) {
  const [editingTraitBuffId, setEditingTraitBuffId] = useState(null) // { type:'race'|'subrace', subraceId?, traitId }

  const patch = (key, val) => onChange({ ...race, [key]: val })
  const patchSpeed = (key, val) => onChange({
    ...race,
    speed: { ...race.speed, [key]: val ? Number(val) : null },
  })

  const toggleSize = (size) => {
    const opts = race.sizeOptions || []
    const has = opts.includes(size)
    const next = has ? opts.filter(s => s !== size) : [...opts, size]
    const def = next.includes(race.sizeDefault) ? race.sizeDefault : (next[0] || 'Medium')
    onChange({ ...race, sizeOptions: next.length ? next : ['Medium'], sizeDefault: def })
  }

  // ── 特性编辑 ──────────────────────────────────────────────
  const addTrait = () => {
    const t = createEmptyTrait()
    onChange({ ...race, traits: [...(race.traits || []), t] })
  }
  const removeTrait = (id) => {
    onChange({ ...race, traits: (race.traits || []).filter(t => t.id !== id) })
  }
  const patchTrait = (id, key, val) => {
    onChange({
      ...race,
      traits: (race.traits || []).map(t => t.id === id ? { ...t, [key]: val } : t),
    })
  }
  const saveTraitBuff = (traitId, buffPayload) => {
    onChange({
      ...race,
      traits: (race.traits || []).map(t =>
        t.id === traitId ? { ...t, cards: buffPayload?.effects || [] } : t
      ),
    })
    setEditingTraitBuffId(null)
  }

  // ── 表格编辑 ──────────────────────────────────────────────
  const addTable = () => {
    const t = createEmptyTable()
    onChange({ ...race, tables: [...(race.tables || []), t] })
  }
  const removeTable = (id) => {
    onChange({ ...race, tables: (race.tables || []).filter(t => t.id !== id) })
  }
  const patchTable = (id, key, val) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t => t.id === id ? { ...t, [key]: val } : t),
    })
  }
  const addTableRow = (tableId) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t =>
        t.id === tableId ? { ...t, rows: [...t.rows, { roll: String(t.rows.length + 1), text: '' }] } : t
      ),
    })
  }
  const removeTableRow = (tableId, rowIdx) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t =>
        t.id === tableId ? { ...t, rows: t.rows.filter((_, i) => i !== rowIdx) } : t
      ),
    })
  }
  const patchTableRow = (tableId, rowIdx, key, val) => {
    onChange({
      ...race,
      tables: (race.tables || []).map(t =>
        t.id === tableId
          ? { ...t, rows: t.rows.map((r, i) => i === rowIdx ? { ...r, [key]: val } : r) }
          : t
      ),
    })
  }

  // ─ 亚种编辑 ──────────────────────────────────────────────
  const addSubrace = () => {
    const s = createEmptySubrace()
    onChange({ ...race, subraces: [...(race.subraces || []), s] })
  }
  const removeSubrace = (id) => {
    onChange({ ...race, subraces: (race.subraces || []).filter(s => s.id !== id) })
  }
  const patchSubrace = (id, key, val) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s => s.id === id ? { ...s, [key]: val } : s),
    })
  }
  const addSubraceTrait = (subraceId) => {
    const t = createEmptyTrait()
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId ? { ...s, traits: [...(s.traits || []), t] } : s
      ),
    })
  }
  const removeSubraceTrait = (subraceId, traitId) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId ? { ...s, traits: (s.traits || []).filter(t => t.id !== traitId) } : s
      ),
    })
  }
  const patchSubraceTrait = (subraceId, traitId, key, val) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId
          ? { ...s, traits: (s.traits || []).map(t => t.id === traitId ? { ...t, [key]: val } : t) }
          : s
      ),
    })
  }
  const saveSubraceTraitBuff = (subraceId, traitId, buffPayload) => {
    onChange({
      ...race,
      subraces: (race.subraces || []).map(s =>
        s.id === subraceId
          ? {
              ...s,
              traits: (s.traits || []).map(t =>
                t.id === traitId ? { ...t, cards: buffPayload?.effects || [] } : t
              ),
            }
          : s
      ),
    })
    setEditingTraitBuffId(null)
  }

  // ── BuffForm 保存分发 ────────────────────────────────────
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
    if (!editingTraitBuffId) return null
    if (editingTraitBuffId.type === 'race') {
      return (race.traits || []).find(t => t.id === editingTraitBuffId.traitId)
    }
    const sub = (race.subraces || []).find(s => s.id === editingTraitBuffId.subraceId)
    return sub ? (sub.traits || []).find(t => t.id === editingTraitBuffId.traitId) : null
  }

  const buffTrait = findBuffTrait()
  const buffLabel = editingTraitBuffId?.type === 'subrace'
    ? (race.subraces || []).find(s => s.id === editingTraitBuffId?.subraceId)?.name
    : race.name

  return (
    <>
      <div className="space-y-3">
        {/* 基本信息 */}
        <div className={sectionCls}>
          <div>
            <label className={labelCls}>名称 *</label>
            <input className={inputCls} value={race.name} onChange={e => patch('name', e.target.value)} placeholder="例如：半血裔" />
          </div>
          <div>
            <label className={labelCls}>背景描述</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={5}
              placeholder="种族背景故事 / 风味文字"
              value={race.description}
              onChange={e => patch('description', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>来源</label>
              <input className={inputCls} value={race.source} onChange={e => patch('source', e.target.value)} placeholder="例如：Van Richten's Guide" />
            </div>
            <div>
              <label className={labelCls}>生物类型</label>
              <select className={inputCls} value={race.creatureType} onChange={e => patch('creatureType', e.target.value)}>
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
                  checked={(race.sizeOptions || []).includes(s.value)}
                  onChange={() => toggleSize(s.value)}
                  className="accent-[#c79a42]"
                />
                {s.label}
              </label>
            ))}
          </div>
          {(race.sizeOptions || []).length > 1 && (
            <div>
              <label className={labelCls}>默认体型</label>
              <select className={inputCls} value={race.sizeDefault} onChange={e => patch('sizeDefault', e.target.value)}>
                {(race.sizeOptions || []).map(s => (
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
                  value={race.speed?.[key] || ''}
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
              value={race.darkvision ?? ''}
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
          {(race.traits || []).length === 0 && <div className="text-[10px] text-gray-600">无特性</div>}
          {(race.traits || []).map((t, idx) => (
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
                rows={3}
                placeholder="特性描述"
                value={t.description}
                onChange={e => patchTrait(t.id, 'description', e.target.value)}
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEditingTraitBuffId({ type: 'race', traitId: t.id })}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/15 border border-indigo-400/20"
                  title="编辑BUFF效果"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  效果 {(t.cards || []).length > 0 && `(${t.cards.length})`}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 参考表格 */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-dnd-text-muted">参考表格</span>
            <button onClick={addTable} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
          </div>
          {(race.tables || []).length === 0 && <div className="text-[10px] text-gray-600">无参考表格</div>}
          {(race.tables || []).map((table) => (
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
          {(race.subraces || []).length === 0 && <div className="text-[10px] text-gray-600">无亚种</div>}
          {(race.subraces || []).map((sub) => (
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
                rows={3}
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
                      rows={3}
                      placeholder="特性描述"
                      value={st.description}
                      onChange={e => patchSubraceTrait(sub.id, st.id, 'description', e.target.value)}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditingTraitBuffId({ type: 'subrace', subraceId: sub.id, traitId: st.id })}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 hover:text-indigo-200 hover:bg-indigo-500/15 border border-indigo-400/20"
                        title="编辑BUFF效果"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        效果 {(st.cards || []).length > 0 && `(${st.cards.length})`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        {showSaveButtons && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={onSave}
              disabled={!race.name.trim()}
              className="flex-1 py-2 rounded-lg bg-dnd-gold text-black font-medium text-sm disabled:opacity-40"
            >
              保存
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-white/20 text-dnd-text-muted text-sm"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* BUFF 编辑器嵌套弹窗 */}
      {buffTrait && editingTraitBuffId && (
        <>
          <div className="fixed inset-0 bg-black/50" style={{ zIndex: 400 }} onClick={() => setEditingTraitBuffId(null)} aria-hidden />
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 401 }}>
            <div className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-white/10 bg-[#1a2332] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-semibold text-dnd-gold-light/90">
                  编辑效果 — {buffLabel} · {buffTrait.name}
                </h2>
                <button
                  onClick={() => setEditingTraitBuffId(null)}
                  className="p-1 rounded text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <BuffForm
                  compact
                  initial={{ effects: buffTrait.cards || [], source: buffTrait.name }}
                  onSave={handleBuffSave}
                  onCancel={() => setEditingTraitBuffId(null)}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
