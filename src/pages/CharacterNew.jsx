import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { addCharacter, loadCharacterById, loadCharactersInModule, getMainCharactersInModule } from '../lib/characterStore'
import { logTeamActivity } from '../lib/activityLog'
import { isSupabaseEnabled } from '../lib/supabase'
import { CLASS_LIST } from '../data/classDatabase'

const CARD_KINDS = [
  { value: 'main', label: '主卡' },
  { value: 'subordinate_class', label: '附属卡（职业模版）' },
  { value: 'subordinate_creature', label: '附属卡（生物模版）' },
]

const ABILITY_LABELS = [
  { key: 'str', label: '力量' },
  { key: 'dex', label: '敏捷' },
  { key: 'con', label: '体质' },
  { key: 'int', label: '智力' },
  { key: 'wis', label: '感知' },
  { key: 'cha', label: '魅力' },
]

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || min))
}

export default function CharacterNew() {
  const { user } = useAuth()
  const { currentModuleId } = useModule()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [classVal, setClassVal] = useState('')
  const [classLevel, setClassLevel] = useState(1)
  const [level, setLevel] = useState(1)
  const [hpCurrent, setHpCurrent] = useState(0)
  const [hpMax, setHpMax] = useState(0)
  const [abilities, setAbilities] = useState({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })
  const [cardKind, setCardKind] = useState('main')
  const [parentId, setParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const moduleId = String(searchParams.get('moduleId') ?? currentModuleId ?? 'default').trim() || 'default'
  const isSubordinate = cardKind !== 'main'
  const mainCards = getMainCharactersInModule(moduleId)

  useEffect(() => {
    if (isSupabaseEnabled() && user?.name && moduleId) loadCharactersInModule(moduleId).catch(() => {})
  }, [user?.name, moduleId])

  const setAbility = (key, value) => {
    setAbilities((prev) => ({ ...prev, [key]: clamp(value, 1, 30) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const n = name.trim()
    setError('')
    if (!n) return
    if (!user?.name) {
      setError('未获取到玩家名，请返回登录页重新进入。')
      return
    }
    if (isSubordinate && !parentId) {
      setError('请选择所属主卡。')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: n,
        'class': classVal.trim(),
        classLevel: clamp(classLevel, 1, 20),
        level: clamp(level, 1, 20),
        hp: { current: clamp(hpCurrent, 0, 999), max: clamp(hpMax, 0, 999), temp: 0 },
        abilities: { ...abilities },
        moduleId,
      }
      if (isSubordinate) {
        payload.cardType = 'subordinate'
        payload.parentId = parentId
        payload.subordinateTemplate = cardKind === 'subordinate_creature' ? 'creature' : 'class'
      }
      const char = await Promise.resolve(addCharacter(user.name, payload))
      if (!char?.id) {
        throw new Error('创建未成功：未返回角色 ID。')
      }
      try {
        await loadCharacterById(char.id)
      } catch (e) {
        console.warn('创建后同步角色缓存失败（将尝试直接进入角色卡）', e)
      }
      logTeamActivity({
        actor: user.name,
        moduleId,
        summary: isSubordinate ? `玩家 ${user.name} 创建了附属卡「${n}」` : `玩家 ${user.name} 创建了角色「${n}」`,
      })
      navigate(`/characters/${char.id}`, { replace: true })
    } catch (err) {
      console.error(err)
      const msg =
        err?.message ||
        err?.error_description ||
        (typeof err === 'string' ? err : '') ||
        '创建失败'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <h1 className="font-display text-xl font-semibold text-white mb-4">新建角色</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-dnd-red/50 bg-dnd-red/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {/* 类型 */}
        <div>
          <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">类型</label>
          <select
            value={cardKind}
            onChange={(e) => setCardKind(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
          >
            {CARD_KINDS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 所属主卡 */}
        {isSubordinate && (
          <div>
            <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">
              所属主卡 <span className="text-dnd-red">*</span>
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              required={isSubordinate}
              className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            >
              <option value="">请选择主卡</option>
              {mainCards.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.codename || '未命名'}</option>
              ))}
            </select>
            {mainCards.length === 0 && (
              <p className="text-dnd-text-muted text-xs mt-1">当前模组下暂无主卡，请先创建主卡。</p>
            )}
          </div>
        )}

        {/* 角色名 */}
        <div>
          <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">
            角色名 <span className="text-dnd-red">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入角色名"
            className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white placeholder:text-dnd-text-muted focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            required
          />
        </div>

        {/* 职业 */}
        <div>
          <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">职业</label>
          <select
            value={classVal}
            onChange={(e) => setClassVal(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
          >
            <option value="">请选择职业</option>
            {CLASS_LIST.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
          <p className="text-dnd-text-muted text-[10px] mt-1">选择职业后，角色卡会自动加载该职业的特性、生命骰、施法等信息。</p>
        </div>

        {/* 等级 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">职业等级</label>
            <input
              type="number"
              min={1}
              max={20}
              value={classLevel}
              onChange={(e) => setClassLevel(clamp(e.target.value, 1, 20))}
              className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">总等级</label>
            <input
              type="number"
              min={1}
              max={20}
              value={level}
              onChange={(e) => setLevel(clamp(e.target.value, 1, 20))}
              className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            />
          </div>
        </div>

        {/* 生命值 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">当前 HP</label>
            <input
              type="number"
              min={0}
              max={999}
              value={hpCurrent}
              onChange={(e) => setHpCurrent(clamp(e.target.value, 0, 999))}
              className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-1">最大 HP</label>
            <input
              type="number"
              min={0}
              max={999}
              value={hpMax}
              onChange={(e) => setHpMax(clamp(e.target.value, 0, 999))}
              className="w-full rounded-xl border border-white/20 bg-dnd-card px-4 py-3 text-white focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
            />
          </div>
        </div>

        {/* 属性 */}
        <div>
          <label className="block text-xs text-dnd-text-label uppercase tracking-label mb-2">属性值</label>
          <div className="grid grid-cols-3 gap-3">
            {ABILITY_LABELS.map((ab) => (
              <div key={ab.key}>
                <label className="block text-[10px] text-dnd-text-muted mb-1">{ab.label}</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={abilities[ab.key]}
                  onChange={(e) => setAbility(ab.key, e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-dnd-card px-3 py-2 text-white text-center focus:border-dnd-red focus:ring-2 focus:ring-dnd-red/30 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 提交 */}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full py-3 rounded-xl bg-dnd-red hover:bg-dnd-red-hover text-white font-semibold uppercase tracking-label disabled:opacity-50 transition-colors"
        >
          {saving ? '创建中…' : '创建并编辑'}
        </button>
      </form>
    </div>
  )
}
