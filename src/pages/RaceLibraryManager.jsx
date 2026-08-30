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
  normalizeRace,
} from '../data/raceModel'
import RaceEditorForm from '../components/RaceEditorForm'

const inputCls = 'w-full bg-[#0d1520] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-dnd-gold/50'

export default function RaceLibraryManager() {
  const navigate = useNavigate()
  const [races, setRaces] = useState([])
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('')

  const refresh = useCallback(() => setRaces(getAllRaces()), [])
  useEffect(() => { refresh() }, [refresh])

  const filtered = races.filter(r =>
    !filter || r.name.toLowerCase().includes(filter.toLowerCase())
  )

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

  // ══════════════════════════════════════════════════════════
  // 编辑视图
  // ══════════════════════════════════════════════════════════
  if (editing) {
    return (
      <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-lg font-semibold text-white">
            {editing.id ? '编辑种族' : '新建种族'}
          </h1>
          <button onClick={() => setEditing(null)} className="text-dnd-text-muted text-sm hover:text-white">取消</button>
        </div>
        <RaceEditorForm
          race={editing}
          onChange={setEditing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
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
