import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  loadCreatureLibrary,
  saveCreatureLibrary,
  addCreature,
  updateCreature,
  deleteCreature,
  DEFAULT_CREATURE,
  CREATURE_SIZES,
} from '../data/creatureLibrary'

const CREATURE_TYPES = [
  { value: 'beast', label: '野兽' },
  { value: 'dragon', label: '龙' },
  { value: 'humanoid', label: '人形生物' },
  { value: 'undead', label: '不死生物' },
  { value: 'fiend', label: '邪魔' },
  { value: 'celestial', label: '天界生物' },
  { value: 'fey', label: '精类' },
  { value: 'elemental', label: '元素' },
  { value: 'aberration', label: '异怪' },
  { value: 'construct', label: '构装体' },
  { value: 'giant', label: '巨人' },
  { value: 'monstrosity', label: '怪兽' },
  { value: 'ooze', label: '泥怪' },
  { value: 'plant', label: '植物' },
]

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ABILITY_LABELS = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }

const inputCls = 'w-full bg-[#0d1520] border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-dnd-gold/50'
const labelCls = 'text-[10px] text-dnd-text-muted block mb-0.5'

function modStr(val) {
  const m = Math.floor((val - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

export default function CreatureLibraryManager() {
  const navigate = useNavigate()
  const [creatures, setCreatures] = useState([])
  const [editing, setEditing] = useState(null) // null = list view, object = edit form
  const [filter, setFilter] = useState('')

  const refresh = useCallback(() => {
    setCreatures(loadCreatureLibrary())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = creatures.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  )

  const startNew = () => {
    setEditing({ ...DEFAULT_CREATURE, id: '', name: '', abilities: { ...DEFAULT_CREATURE.abilities } })
  }

  const startEdit = (creature) => {
    setEditing({ ...creature, abilities: { ...creature.abilities }, speed: { ...creature.speed } })
  }

  const handleSave = () => {
    if (!editing.name.trim()) return
    if (editing.id) {
      updateCreature(editing.id, editing)
    } else {
      addCreature(editing)
    }
    setEditing(null)
    refresh()
  }

  const handleDelete = (id) => {
    if (window.confirm('确定删除此生物？')) {
      deleteCreature(id)
      refresh()
    }
  }

  const patch = (key, val) => setEditing(prev => ({ ...prev, [key]: val }))
  const patchAbility = (key, val) => setEditing(prev => ({
    ...prev,
    abilities: { ...prev.abilities, [key]: Number(val) || 10 },
  }))
  const patchSpeed = (key, val) => setEditing(prev => ({
    ...prev,
    speed: { ...prev.speed, [key]: val ? Number(val) : null },
  }))

  if (editing) {
    return (
      <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-lg font-semibold text-white">
            {editing.id ? '编辑生物' : '新建生物'}
          </h1>
          <button onClick={() => setEditing(null)} className="text-dnd-text-muted text-sm hover:text-white">取消</button>
        </div>

        <div className="space-y-3">
          {/* 基本信息 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div>
              <label className={labelCls}>名称 *</label>
              <input className={inputCls} value={editing.name} onChange={e => patch('name', e.target.value)} placeholder="例如：棕熊" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>体型</label>
                <select className={inputCls} value={editing.size} onChange={e => patch('size', e.target.value)}>
                  {CREATURE_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>类型</label>
                <select className={inputCls} value={editing.type} onChange={e => patch('type', e.target.value)}>
                  {CREATURE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>CR</label>
                <input className={inputCls} type="number" min="0" step="0.25" value={editing.cr} onChange={e => patch('cr', Number(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          {/* 六维属性 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3">
            <div className="text-[10px] text-dnd-text-muted mb-2">六维属性</div>
            <div className="grid grid-cols-6 gap-1.5">
              {ABILITY_KEYS.map(key => (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-dnd-gold-light/80">{ABILITY_LABELS[key]}</div>
                  <input
                    className={`${inputCls} text-center`}
                    type="number"
                    value={editing.abilities[key]}
                    onChange={e => patchAbility(key, e.target.value)}
                  />
                  <div className="text-[10px] text-dnd-text-muted mt-0.5">{modStr(editing.abilities[key])}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 战斗数据 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3">
            <div className="text-[10px] text-dnd-text-muted mb-2">战斗数据</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>HP</label>
                <input className={inputCls} value={editing.hp} onChange={e => patch('hp', e.target.value)} placeholder="数字或 2d8+4" />
              </div>
              <div>
                <label className={labelCls}>生命</label>
                <input className={inputCls} value={editing.hitDice} onChange={e => patch('hitDice', e.target.value)} placeholder="2d8" />
              </div>
              <div>
                <label className={labelCls}>AC</label>
                <input className={inputCls} type="number" value={editing.ac} onChange={e => patch('ac', Number(e.target.value) || 10)} />
              </div>
            </div>
          </div>

          {/* 速度 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3">
            <div className="text-[10px] text-dnd-text-muted mb-2">速度（尺）</div>
            <div className="grid grid-cols-4 gap-2">
              {['walk', 'fly', 'swim', 'climb'].map(key => (
                <div key={key}>
                  <label className={labelCls}>{key === 'walk' ? '行走' : key === 'fly' ? '飞行' : key === 'swim' ? '游泳' : '攀爬'}</label>
                  <input
                    className={inputCls}
                    type="number"
                    value={editing.speed[key] || ''}
                    onChange={e => patchSpeed(key, e.target.value)}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 抗性/免疫 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div>
              <label className={labelCls}>抗性（逗号分隔）</label>
              <input className={inputCls} value={(editing.resistances || []).join(', ')} onChange={e => patch('resistances', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
            </div>
            <div>
              <label className={labelCls}>免疫（逗号分隔）</label>
              <input className={inputCls} value={(editing.immunities || []).join(', ')} onChange={e => patch('immunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
            </div>
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
    )
  }

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="text-dnd-text-muted hover:text-white text-lg">←</button>
          <h1 className="font-display text-lg font-semibold text-white">生物库</h1>
        </div>
        <button onClick={startNew} className="px-3 py-1.5 rounded-lg bg-dnd-gold text-black text-xs font-medium">+ 新建</button>
      </div>

      {/* 搜索 */}
      <input
        className={`${inputCls} mb-3`}
        placeholder="搜索生物名称..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center text-dnd-text-muted text-sm py-8">
          {creatures.length === 0 ? '生物库为空，点击"+ 新建"添加第一个生物' : '没有匹配的生物'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="rounded-lg bg-dnd-card border border-white/10 p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0" onClick={() => startEdit(c)} style={{ cursor: 'pointer' }}>
                <div className="text-white text-sm font-medium truncate">{c.name}</div>
                <div className="text-dnd-text-muted text-[10px]">
                  {CREATURE_SIZES.find(s => s.value === c.size)?.label || c.size} · {CREATURE_TYPES.find(t => t.value === c.type)?.label || c.type} · CR {c.cr}
                </div>
                <div className="text-dnd-text-muted text-[10px]">
                  HP {c.hp} · AC {c.ac} · STR {c.abilities.str} DEX {c.abilities.dex} CON {c.abilities.con}
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
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
