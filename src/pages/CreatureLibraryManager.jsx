import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  loadCreatureLibrary,
  loadCreatureLibraryFromSupabase,
  addCreature,
  updateCreature,
  deleteCreature,
  DEFAULT_CREATURE,
  CREATURE_SIZES,
  normalizeTraits,
  normalizeActions,
  createEmptyTrait,
  createEmptyAction,
} from '../data/creatureLibrary'
import { Trash2 } from 'lucide-react'
import BuffForm from '../components/BuffForm'
import { normalizeSpellName } from '../components/combat/combatMeanUtils'
import { getMergedSpells } from '../data/spellDatabase'

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

/** 将 AI 返回的数据映射到 DEFAULT_CREATURE 结构 */
function mapParsedToCreature(parsed) {
  const base = { ...DEFAULT_CREATURE, abilities: { ...DEFAULT_CREATURE.abilities }, speed: { ...DEFAULT_CREATURE.speed } }

  if (parsed.name) base.name = parsed.name
  if (parsed.size) base.size = parsed.size
  if (parsed.type) base.type = parsed.type
  if (parsed.cr != null) base.cr = Number(parsed.cr) || 0

  // Abilities
  if (parsed.abilities && typeof parsed.abilities === 'object') {
    for (const key of ABILITY_KEYS) {
      if (parsed.abilities[key] != null) {
        base.abilities[key] = Number(parsed.abilities[key]) || 10
      }
    }
  }

  // HP — may be "45 (6d8+18)" format
  if (parsed.hp != null) {
    const hpStr = String(parsed.hp)
    const numMatch = hpStr.match(/^(\d+)/)
    base.hp = numMatch ? Number(numMatch[1]) : hpStr
    const diceMatch = hpStr.match(/\(([^)]+)\)/)
    if (diceMatch) base.hitDice = diceMatch[1]
  }

  // AC
  if (parsed.ac != null) base.ac = Number(parsed.ac) || 10

  // Speed
  if (parsed.speed && typeof parsed.speed === 'object') {
    for (const key of ['walk', 'fly', 'swim', 'climb']) {
      if (parsed.speed[key] != null) {
        base.speed[key] = Number(parsed.speed[key]) || null
      }
    }
  }

  // Resistances / Immunities
  if (Array.isArray(parsed.damageResistances)) base.resistances = parsed.damageResistances
  if (Array.isArray(parsed.damageImmunities)) base.immunities = parsed.damageImmunities
  if (Array.isArray(parsed.conditionImmunities)) base.conditionImmunities = parsed.conditionImmunities
  if (Array.isArray(parsed.damageVulnerabilities)) base.vulnerabilities = parsed.damageVulnerabilities

  // Traits / Actions — normalize to structured objects
  if (Array.isArray(parsed.traits)) base.traits = normalizeTraits(parsed.traits)
  if (Array.isArray(parsed.actions)) base.actions = normalizeActions(parsed.actions)
  if (Array.isArray(parsed.bonusActions)) base.bonusActions = normalizeActions(parsed.bonusActions)
  if (parsed.reactions) base.reactions = parsed.reactions
  if (parsed.legendaryActions) base.legendaryActions = parsed.legendaryActions
  if (parsed.senses != null) base.senses = String(parsed.senses)
  
  // Spells — normalize names
  if (Array.isArray(parsed.spells)) {
    base.spells = parsed.spells.map(s => ({
      ...s,
      name: normalizeSpellName(s.name),
    }))
  }

  return base
}

/** 新建空白表单（数组字段各自独立引用，避免与 DEFAULT_CREATURE 共享） */
function createEmptyForm() {
  return {
    ...DEFAULT_CREATURE,
    id: '',
    name: '',
    abilities: { ...DEFAULT_CREATURE.abilities },
    speed: { ...DEFAULT_CREATURE.speed },
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    naturalWeapons: [],
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    spells: [],
  }
}

export default function CreatureLibraryManager() {
  const navigate = useNavigate()
  const [creatures, setCreatures] = useState([])
  const [editing, setEditing] = useState(null) // null = list view, object = edit form
  const [filter, setFilter] = useState('')
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError, setParseError] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateProgress, setTranslateProgress] = useState('')
  const [pendingImages, setPendingImages] = useState([])
  const [pendingText, setPendingText] = useState('')
  const [supabaseLoading, setSupabaseLoading] = useState(false)
  const [duplicateDialog, setDuplicateDialog] = useState(null) // { pending, existing }
  const [duplicateSaving, setDuplicateSaving] = useState(false)
  const [spellNameDialog, setSpellNameDialog] = useState(null) // { spellIdx, userInput, matchedSpell }
  const fileInputRef = useRef(null)
  const listFileInputRef = useRef(null)

  const refresh = useCallback(() => {
    const loaded = loadCreatureLibrary()
    // 标准化所有生物的法术名称
    const normalized = loaded.map(c => ({
      ...c,
      spells: (c.spells || []).map(s => ({
        ...s,
        name: normalizeSpellName(s.name),
      })),
    }))
    setCreatures(normalized)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSupabaseLoading(true)
      await loadCreatureLibraryFromSupabase()
      if (!cancelled) {
        refresh()
        setSupabaseLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [refresh])

  useEffect(() => {
    const onRealtime = () => refresh()
    window.addEventListener('dnd-realtime-custom-library', onRealtime)
    return () => window.removeEventListener('dnd-realtime-custom-library', onRealtime)
  }, [refresh])

  const filtered = creatures.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  )

  const startNew = () => {
    setEditing(createEmptyForm())
  }

  const startEdit = (creature) => {
    setEditing({
      ...creature,
      abilities: { ...creature.abilities },
      speed: { ...creature.speed },
      traits: normalizeTraits(creature.traits),
      actions: normalizeActions(creature.actions),
      // 标准化法术名称
      spells: (creature.spells || []).map(s => ({
        ...s,
        name: normalizeSpellName(s.name),
      })),
    })
  }

  // ── 重复检测 ──────────────────────────────────────────────────────
  const findDuplicateCreature = useCallback((creature) => {
    const existing = loadCreatureLibrary()
    const name = (creature.name || '').trim().toLowerCase()
    if (!name) return null

    // 同名
    const nameMatch = existing.find(c => c.name.trim().toLowerCase() === name)
    if (nameMatch) return nameMatch

    // 内容相似度（特质+动作名称的 Jaccard）
    const getNames = (arr) => new Set((arr || []).map(t => (typeof t === 'string' ? t : t.name || '').trim().toLowerCase()).filter(Boolean))
    const newNames = new Set([...getNames(creature.traits), ...getNames(creature.actions)])
    if (newNames.size === 0) return null

    for (const c of existing) {
      const existNames = new Set([...getNames(c.traits), ...getNames(c.actions)])
      if (existNames.size === 0) continue
      const intersection = [...newNames].filter(n => existNames.has(n)).length
      const union = new Set([...newNames, ...existNames]).size
      if (union > 0 && intersection / union >= 0.6) return c
    }
    return null
  }, [])

  const handleSave = () => {
    if (!editing.name.trim()) return
    // 保存前确保法术名称已标准化
    const normalizedEditing = {
      ...editing,
      spells: (editing.spells || []).map(s => ({
        ...s,
        name: normalizeSpellName(s.name),
      })),
    }
    // 新建时检测重复（编辑已有生物不检测）
    if (!normalizedEditing.id) {
      const dup = findDuplicateCreature(normalizedEditing)
      if (dup) {
        setDuplicateDialog({ pending: { ...normalizedEditing }, existing: dup })
        return
      }
    }
    if (normalizedEditing.id) {
      updateCreature(normalizedEditing.id, normalizedEditing)
    } else {
      addCreature(normalizedEditing)
    }
    setEditing(null)
    refresh()
  }

  // ── 重复对话框处理 ──────────────────────────────────────────────────
  const doSave = useCallback((result, pending) => {
    const finalize = () => {
      setEditing(null)
      setDuplicateDialog(null)
      setDuplicateSaving(false)
      refresh()
    }
    if (result && typeof result.then === 'function') {
      result.then(finalize)
    } else {
      finalize()
    }
  }, [refresh])

  const handleResolveDuplicate = useCallback((action) => {
    if (!duplicateDialog || duplicateSaving) return
    const { pending, existing } = duplicateDialog
    setDuplicateSaving(true)
    if (action === 'overwrite') {
      const result = updateCreature(existing.id, { ...pending, id: existing.id })
      doSave(result, pending)
    } else if (action === 'keepBoth') {
      const result = addCreature(pending)
      doSave(result, pending)
    } else {
      // cancel
      setDuplicateDialog(null)
      setDuplicateSaving(false)
    }
  }, [duplicateDialog, duplicateSaving, doSave])

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

  // ── 特质 & 动作 编辑 ──────────────────────────────────────────────
  const [editingTraitBuffId, setEditingTraitBuffId] = useState(null) // 正在用 BuffForm 编辑效果的特质 id

  const addTrait = () => {
    const t = createEmptyTrait('新特质')
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
  const saveTraitEffects = (traitId, buffPayload) => {
    const effects = (buffPayload?.effects || []).map(e => ({
      effectType: e.effectType,
      value: e.value,
      scope: e.scope,
      scopeDetail: e.scopeDetail,
      category: e.category,
    }))
    setEditing(prev => ({
      ...prev,
      traits: (prev.traits || []).map(t => t.id === traitId ? { ...t, effects } : t),
    }))
    setEditingTraitBuffId(null)
  }

  const addAction = () => {
    const a = createEmptyAction('新动作')
    setEditing(prev => ({ ...prev, actions: [...(prev.actions || []), a] }))
  }
  const removeAction = (id) => {
    setEditing(prev => ({ ...prev, actions: (prev.actions || []).filter(a => a.id !== id) }))
  }
  const patchAction = (id, key, val) => {
    setEditing(prev => ({
      ...prev,
      actions: (prev.actions || []).map(a => a.id === id ? { ...a, [key]: val } : a),
    }))
  }

  // ── 天生武器 编辑 ──────────────────────────────────────────────
  const addNaturalWeapon = () => {
    patch('naturalWeapons', [
      ...(editing.naturalWeapons || []),
      { name: '', attackBonus: 0, damage: '' },
    ])
  }
  const updateNaturalWeapon = (idx, key, value) => {
    const weapons = [...(editing.naturalWeapons || [])]
    weapons[idx] = { ...weapons[idx], [key]: value }
    patch('naturalWeapons', weapons)
  }
  const removeNaturalWeapon = (idx) => {
    const weapons = [...(editing.naturalWeapons || [])]
    weapons.splice(idx, 1)
    patch('naturalWeapons', weapons)
  }

  // ── 反应动作 编辑 ──────────────────────────────────────────────
  const addReaction = () => {
    patch('reactions', [
      ...(editing.reactions || []),
      { name: '', description: '' },
    ])
  }
  const updateReaction = (idx, key, value) => {
    const reactions = [...(editing.reactions || [])]
    reactions[idx] = { ...reactions[idx], [key]: value }
    patch('reactions', reactions)
  }
  const removeReaction = (idx) => {
    const reactions = [...(editing.reactions || [])]
    reactions.splice(idx, 1)
    patch('reactions', reactions)
  }

  // ── 附赠动作 编辑 ──────────────────────────────────────────────
  const addBonusAction = () => {
    patch('bonusActions', [
      ...(editing.bonusActions || []),
      { name: '', description: '' },
    ])
  }
  const updateBonusAction = (idx, key, value) => {
    const bonusActions = [...(editing.bonusActions || [])]
    bonusActions[idx] = { ...bonusActions[idx], [key]: value }
    patch('bonusActions', bonusActions)
  }
  const removeBonusAction = (idx) => {
    const bonusActions = [...(editing.bonusActions || [])]
    bonusActions.splice(idx, 1)
    patch('bonusActions', bonusActions)
  }

  // ── 传奇动作 编辑 ──────────────────────────────────────────────
  const addLegendaryAction = () => {
    patch('legendaryActions', [
      ...(editing.legendaryActions || []),
      { name: '', description: '', cost: 1 },
    ])
  }
  const updateLegendaryAction = (idx, key, value) => {
    const actions = [...(editing.legendaryActions || [])]
    actions[idx] = { ...actions[idx], [key]: value }
    patch('legendaryActions', actions)
  }
  const removeLegendaryAction = (idx) => {
    const actions = [...(editing.legendaryActions || [])]
    actions.splice(idx, 1)
    patch('legendaryActions', actions)
  }

  // ── 法术 编辑 ──────────────────────────────────────────────
  const addSpell = () => {
    patch('spells', [
      ...(editing.spells || []),
      { name: '', castMode: 'at-will', timesPerDay: 1, slotLevel: 1, description: '' },
    ])
  }
  const updateSpell = (idx, key, value) => {
    const spells = [...(editing.spells || [])]
    // 如果是名称字段，检查是否有匹配的标准翻译
    if (key === 'name' && value && value.trim()) {
      const trimmed = value.trim()
      const allSpells = getMergedSpells()
      
      // 精确匹配
      let matched = allSpells.find(s => s.name === trimmed)
      
      // 模糊匹配：去除括号、空格后比较
      if (!matched) {
        const normalize = (n) => n.replace(/[\s（）()]/g, '').toLowerCase()
        const normalizedInput = normalize(trimmed)
        matched = allSpells.find(s => normalize(s.name) === normalizedInput)
      }
      
      // 如果找到匹配项且与输入不同，弹出确认对话框
      if (matched && matched.name !== trimmed) {
        setSpellNameDialog({ spellIdx: idx, userInput: trimmed, matchedSpell: matched })
        // 先不更新，等待用户确认
        return
      }
      
      // 没有匹配或完全相同，直接更新
      value = normalizeSpellName(value)
    }
    spells[idx] = { ...spells[idx], [key]: value }
    patch('spells', spells)
  }
  
  // 处理法术名称确认对话框
  const handleSpellNameConfirm = (useStandard) => {
    if (!spellNameDialog) return
    const { spellIdx, userInput, matchedSpell } = spellNameDialog
    
    const spells = [...(editing.spells || [])]
    // 用户选择使用标准翻译
    const finalName = useStandard ? matchedSpell.name : normalizeSpellName(userInput)
    spells[spellIdx] = { ...spells[spellIdx], name: finalName }
    patch('spells', spells)
    
    setSpellNameDialog(null)
  }
  const removeSpell = (idx) => {
    const spells = [...(editing.spells || [])]
    spells.splice(idx, 1)
    patch('spells', spells)
  }

  // ── 素材暂存与解析 ──────────────────────────────────────────────
  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const ensureFormOpen = useCallback(() => {
    setEditing(prev => prev || createEmptyForm())
  }, [])

  const stageImageFiles = useCallback(async (files) => {
    const urls = []
    for (const file of files) {
      if (!file || !file.type.startsWith('image/')) continue
      urls.push(await readAsDataUrl(file))
    }
    if (urls.length === 0) return
    setPendingImages(prev => [...prev, ...urls])
    ensureFormOpen()
  }, [ensureFormOpen])

  const stageText = useCallback((text) => {
    setPendingText(prev => (prev ? `${prev}\n\n${text}` : text))
    ensureFormOpen()
  }, [ensureFormOpen])

  const runParse = useCallback(async ({ images, text, preserveId }) => {
    setParseError('')
    setParseLoading(true)
    try {
      const res = await fetch('/api/parse-creature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.detail || '解析失败')
      const mapped = mapParsedToCreature(data)
      setEditing(prev => ({ ...mapped, id: preserveId && prev ? prev.id : '' }))
      setPendingImages([])
      setPendingText('')
      return true
    } catch (err) {
      console.error('Parse creature error:', err)
      setParseError(err.message || '解析失败，请手动填写')
      return false
    } finally {
      setParseLoading(false)
    }
  }, [])

  const handleParseStaged = () => {
    runParse({ images: pendingImages, text: pendingText, preserveId: true })
  }

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      stageImageFiles(imageFiles)
      return
    }
    const target = e.target
    const inField = target && (
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
    )
    if (inField) return
    const text = (e.clipboardData?.getData('text/plain') || '').trim()
    if (!text) return
    e.preventDefault()
    stageText(text)
  }, [stageImageFiles, stageText])

  // 全局粘贴监听：列表页与编辑页都生效，素材先入暂存区
  useEffect(() => {
    const handler = (e) => handlePaste(e)
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [handlePaste])

  // ── 批量翻译 ──────────────────────────────────────────────────────
  const handleTranslateAll = useCallback(async () => {
    const all = loadCreatureLibrary()
    if (all.length === 0) return
    if (!window.confirm(`确定翻译全部 ${all.length} 个生物为中文？将逐个调用 AI 翻译。`)) return
    setTranslating(true)
    setTranslateProgress('')
    let done = 0
    for (const creature of all) {
      setTranslateProgress(`正在翻译：${creature.name} (${done + 1}/${all.length})`)
      try {
        const res = await fetch('/api/translate-creature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creature }),
        })
        if (res.ok) {
          const translated = await res.json().catch(() => ({}))
          updateCreature(creature.id, {
            ...creature,
            name: translated.name || creature.name,
            alignment: translated.alignment || creature.alignment,
            savingThrows: translated.savingThrows || creature.savingThrows,
            skills: translated.skills || creature.skills,
            damageVulnerabilities: translated.damageVulnerabilities || creature.vulnerabilities,
            damageResistances: translated.damageResistances || creature.resistances,
            damageImmunities: translated.damageImmunities || creature.immunities,
            conditionImmunities: translated.conditionImmunities || creature.conditionImmunities,
            senses: translated.senses || creature.senses,
            languages: translated.languages || creature.languages,
            traits: normalizeTraits(translated.traits || creature.traits),
            actions: normalizeActions(translated.actions || creature.actions),
          })
        }
      } catch (err) {
        console.error(`Translate failed for ${creature.name}:`, err)
      }
      done++
    }
    setTranslating(false)
    setTranslateProgress('')
    refresh()
  }, [refresh])

  if (editing) {
    const editingTrait = editingTraitBuffId ? (editing.traits || []).find(t => t.id === editingTraitBuffId) : null
    return (
      <>
      <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-lg font-semibold text-white">
            {editing.id ? '编辑生物' : '新建生物'}
          </h1>
          <button onClick={() => setEditing(null)} className="text-dnd-text-muted text-sm hover:text-white">取消</button>
        </div>

        <div className="space-y-3">
          {/* 素材暂存与解析 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={parseLoading}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium shrink-0"
              >
                上传截图
              </button>
              <button
                onClick={handleParseStaged}
                disabled={parseLoading || (pendingImages.length === 0 && !pendingText.trim())}
                className="px-3 py-1.5 rounded-lg bg-dnd-gold hover:bg-dnd-gold-light disabled:opacity-40 text-black text-xs font-medium shrink-0"
              >
                {parseLoading
                  ? '解析中...'
                  : `解析${pendingImages.length > 0 || pendingText.trim() ? `（${pendingImages.length} 图${pendingText.trim() ? ' + 文字' : ''}）` : ''}`}
              </button>
              <span className="text-[10px] text-dnd-text-muted">可多选；或 Ctrl+V 粘贴截图/文字，攒齐后一次解析</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  if (files.length) stageImageFiles(files)
                  e.target.value = ''
                }}
              />
            </div>
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((url, idx) => (
                  <div key={idx} className="relative">
                    <img src={url} alt={`待解析截图 ${idx + 1}`} className="h-20 rounded border border-white/10" />
                    <button
                      onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-dnd-red text-white text-[10px] leading-4 text-center"
                      title="移除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pendingText && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className={labelCls}>粘贴的文字（可编辑）</label>
                  <button onClick={() => setPendingText('')} className="text-dnd-red/60 hover:text-dnd-red text-[10px]">清空</button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={4}
                  value={pendingText}
                  onChange={e => setPendingText(e.target.value)}
                />
              </div>
            )}
            {parseLoading && (
              <div className="text-xs text-indigo-400 animate-pulse">AI 正在识别生物数据...</div>
            )}
            {parseError && (
              <div className="text-xs text-dnd-red bg-dnd-red/10 rounded px-2 py-1">{parseError}</div>
            )}
          </div>

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
            <div>
              <label className={labelCls}>视觉</label>
              <input
                className={inputCls}
                value={editing.senses || ''}
                onChange={e => patch('senses', e.target.value)}
                placeholder="黑暗视觉 60 尺，被动感知 15"
              />
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
            <div>
              <label className={labelCls}>易伤（逗号分隔）</label>
              <input className={inputCls} value={(editing.vulnerabilities || []).join(', ')} onChange={e => patch('vulnerabilities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="火, 冰霜" />
            </div>
            <div>
              <label className={labelCls}>状态免疫（逗号分隔）</label>
              <input className={inputCls} value={(editing.conditionImmunities || []).join(', ')} onChange={e => patch('conditionImmunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="魅惑, 恐慌, 擒抱" />
            </div>
          </div>

          {/* 天生武器 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="text-[10px] text-dnd-text-muted">天生武器</div>
            {(editing.naturalWeapons || []).length === 0 && <div className="text-[10px] text-gray-600">无天生武器</div>}
            {(editing.naturalWeapons || []).map((w, idx) => (
              <div key={idx} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="名字（如爪击）"
                    value={w.name || ''}
                    onChange={e => updateNaturalWeapon(idx, 'name', e.target.value)}
                  />
                  <button
                    onClick={() => removeNaturalWeapon(idx)}
                    className="text-dnd-red/60 hover:text-dnd-red shrink-0 px-1"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputCls} w-20 shrink-0`}
                    type="number"
                    placeholder="攻击加值"
                    value={w.attackBonus ?? 0}
                    onChange={e => updateNaturalWeapon(idx, 'attackBonus', Number(e.target.value) || 0)}
                  />
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="伤害（如 2d6+3 挥砍）"
                    value={w.damage || ''}
                    onChange={e => updateNaturalWeapon(idx, 'damage', e.target.value)}
                  />
                </div>
              </div>
            ))}
            <button onClick={addNaturalWeapon} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加天生武器</button>
          </div>

          {/* 动作 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">动作</span>
              <button onClick={addAction} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {(editing.actions || []).length === 0 && <div className="text-[10px] text-gray-600">无动作</div>}
            {(editing.actions || []).map((a, idx) => (
              <div key={a.id} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input className={`${inputCls} flex-1`} placeholder="动作名称" value={a.name} onChange={e => patchAction(a.id, 'name', e.target.value)} />
                  <button onClick={() => removeAction(a.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="动作描述（如：命中 +5，伤害 2d6+3 挥砍）"
                  value={a.description}
                  onChange={e => patchAction(a.id, 'description', e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* 附赠动作 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">附赠动作</span>
              <button onClick={addBonusAction} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {(editing.bonusActions || []).length === 0 && <div className="text-[10px] text-gray-600">无附赠动作</div>}
            {(editing.bonusActions || []).map((a, idx) => (
              <div key={idx} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="附赠动作名称"
                    value={a.name || ''}
                    onChange={e => updateBonusAction(idx, 'name', e.target.value)}
                  />
                  <button
                    onClick={() => removeBonusAction(idx)}
                    className="text-dnd-red/60 hover:text-dnd-red shrink-0 px-1"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="附赠动作描述"
                  value={a.description || ''}
                  onChange={e => updateBonusAction(idx, 'description', e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* 特质 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">特质</span>
              <button onClick={addTrait} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加</button>
            </div>
            {(editing.traits || []).length === 0 && <div className="text-[10px] text-gray-600">无特质</div>}
            {(editing.traits || []).map((t, idx) => (
              <div key={t.id} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input className={`${inputCls} flex-1`} placeholder="特质名称" value={t.name} onChange={e => patchTrait(t.id, 'name', e.target.value)} />
                  <button onClick={() => removeTrait(t.id)} className="text-dnd-red/60 hover:text-dnd-red text-xs shrink-0 px-1">×</button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="特质描述（可选）"
                  value={t.description}
                  onChange={e => patchTrait(t.id, 'description', e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingTraitBuffId(t.id)}
                    className="px-2 py-0.5 rounded bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px]"
                  >
                    编辑效果 {(t.effects || []).length > 0 && `(${t.effects.length})`}
                  </button>
                  {(t.effects || []).length > 0 && (
                    <span className="text-[10px] text-indigo-400">
                      {t.effects.map(e => e.effectType).filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 反应动作 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">反应动作</span>
              <button onClick={addReaction} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加反应</button>
            </div>
            {(editing.reactions || []).length === 0 && <div className="text-[10px] text-gray-600">无反应动作</div>}
            {(editing.reactions || []).map((r, idx) => (
              <div key={idx} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="反应名称"
                    value={r.name || ''}
                    onChange={e => updateReaction(idx, 'name', e.target.value)}
                  />
                  <button
                    onClick={() => removeReaction(idx)}
                    className="text-dnd-red/60 hover:text-dnd-red shrink-0 px-1"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="反应描述"
                  value={r.description || ''}
                  onChange={e => updateReaction(idx, 'description', e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* 传奇动作 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-dnd-text-muted">传奇动作</span>
              <button onClick={addLegendaryAction} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加传奇动作</button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-dnd-text-muted">传奇动作点数</label>
              <input
                type="number"
                className={`${inputCls} w-16`}
                value={editing.legendaryActionPoints ?? 0}
                onChange={e => patch('legendaryActionPoints', Number(e.target.value) || 0)}
                min="0"
              />
            </div>
            {(editing.legendaryActions || []).length === 0 && <div className="text-[10px] text-gray-600">无传奇动作</div>}
            {(editing.legendaryActions || []).map((la, idx) => (
              <div key={idx} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="传奇动作名称"
                    value={la.name || ''}
                    onChange={e => updateLegendaryAction(idx, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    className={`${inputCls} w-14 shrink-0`}
                    placeholder="消耗"
                    value={la.cost ?? 1}
                    onChange={e => updateLegendaryAction(idx, 'cost', Number(e.target.value) || 1)}
                    min="1"
                  />
                  <button
                    onClick={() => removeLegendaryAction(idx)}
                    className="text-dnd-red/60 hover:text-dnd-red shrink-0 px-1"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="传奇动作描述"
                  value={la.description || ''}
                  onChange={e => updateLegendaryAction(idx, 'description', e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* 法术 */}
          <div className="rounded-lg bg-dnd-card border border-white/10 p-3 space-y-2">
            <div className="text-[10px] text-dnd-text-muted">法术</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>施法属性</label>
                <select
                  className={inputCls}
                  value={editing.spellcastingAbility || ''}
                  onChange={e => patch('spellcastingAbility', e.target.value || null)}
                >
                  <option value="">无</option>
                  <option value="int">智力</option>
                  <option value="wis">感知</option>
                  <option value="cha">魅力</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>法术豁免 DC</label>
                <input
                  type="number"
                  className={inputCls}
                  value={editing.spellSaveDC ?? 0}
                  onChange={e => patch('spellSaveDC', Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className={labelCls}>法术攻击加值</label>
                <input
                  type="number"
                  className={inputCls}
                  value={editing.spellAttackBonus ?? 0}
                  onChange={e => patch('spellAttackBonus', Number(e.target.value) || 0)}
                />
              </div>
            </div>

            {(editing.spells || []).length === 0 && <div className="text-[10px] text-gray-600">无法术</div>}
            {(editing.spells || []).map((spell, idx) => (
              <div key={idx} className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-dnd-text-muted w-5 shrink-0">{idx + 1}.</span>
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder="法术名称"
                    value={spell.name || ''}
                    onChange={e => updateSpell(idx, 'name', e.target.value)}
                  />
                  <select
                    className={`${inputCls} w-24 shrink-0`}
                    value={spell.castMode || 'at-will'}
                    onChange={e => updateSpell(idx, 'castMode', e.target.value)}
                  >
                    <option value="at-will">随意</option>
                    <option value="per-day">每天 N 次</option>
                    <option value="slot">需要法术位</option>
                  </select>
                  {(spell.castMode === 'per-day') && (
                    <input
                      type="number"
                      className={`${inputCls} w-14 shrink-0`}
                      value={spell.timesPerDay || 1}
                      onChange={e => updateSpell(idx, 'timesPerDay', Number(e.target.value) || 1)}
                      min="1"
                    />
                  )}
                  {(spell.castMode === 'slot') && (
                    <select
                      className={`${inputCls} w-16 shrink-0`}
                      value={spell.slotLevel || 1}
                      onChange={e => updateSpell(idx, 'slotLevel', Number(e.target.value))}
                    >
                      {[1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{l} 环</option>)}
                    </select>
                  )}
                  <button
                    onClick={() => removeSpell(idx)}
                    className="text-dnd-red/60 hover:text-dnd-red shrink-0 px-1"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="法术描述（可选）"
                  value={spell.description || ''}
                  onChange={e => updateSpell(idx, 'description', e.target.value)}
                />
              </div>
            ))}
            <button onClick={addSpell} className="text-dnd-gold text-xs hover:text-dnd-gold-light">+ 添加法术</button>
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

      {editingTrait && (
        <div className="fixed inset-0 z-50 bg-[var(--page-bg)] overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold text-white">
                编辑特质效果 — {editingTrait.name}
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
              initial={{ effects: editingTrait.effects || [], source: editingTrait.name }}
              onSave={(payload) => saveTraitEffects(editingTrait.id, payload)}
              onCancel={() => setEditingTraitBuffId(null)}
            />
          </div>
        </div>
      )}
      </>
    )
  }

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="text-dnd-text-muted hover:text-white text-lg">←</button>
          <h1 className="font-display text-lg font-semibold text-white">生物库</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startNew} className="px-3 py-1.5 rounded-lg bg-dnd-gold text-black text-xs font-medium">+ 新建</button>
          <button
            onClick={handleTranslateAll}
            disabled={translating || creatures.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium"
          >
            {translating ? '翻译中...' : '翻译全部'}
          </button>
          <button
            onClick={() => listFileInputRef.current?.click()}
            disabled={parseLoading}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium"
          >
            {parseLoading ? '解析中...' : '截图新建'}
          </button>
          <input
            ref={listFileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async e => {
              const files = Array.from(e.target.files || [])
              e.target.value = ''
              if (files.length === 0) return
              const urls = []
              for (const file of files) {
                if (file.type.startsWith('image/')) urls.push(await readAsDataUrl(file))
              }
              if (urls.length === 0) return
              const ok = await runParse({ images: urls, text: '', preserveId: false })
              if (!ok) setEditing(createEmptyForm())
            }}
          />
        </div>
      </div>

      {/* 搜索 */}
      <input
        className={`${inputCls} mb-3`}
        placeholder="搜索生物名称..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {/* Supabase 加载中 */}
      {supabaseLoading && (
        <div className="mb-3 text-xs text-indigo-400 animate-pulse">正在加载远程生物库...</div>
      )}

      {/* 截图新建状态 */}
      {parseLoading && !editing && (
        <div className="mb-3 text-xs text-indigo-400 animate-pulse">AI 正在识别生物数据...</div>
      )}
      {parseError && !editing && (
        <div className="mb-3 text-xs text-dnd-red bg-dnd-red/10 rounded px-2 py-1">
          {parseError}
          <button onClick={() => setParseError('')} className="ml-2 underline">关闭</button>
        </div>
      )}
      {translating && translateProgress && (
        <div className="mb-3 text-xs text-emerald-400 animate-pulse">{translateProgress}</div>
      )}

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

      {/* 重复检测对话框 */}
      {duplicateDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#1a2332] rounded-xl border border-white/10 p-4 max-w-sm w-full space-y-3">
            <h3 className="text-white font-semibold text-sm">发现重复生物</h3>
            <div className="text-xs text-dnd-text-muted space-y-1">
              <div>已存在：<span className="text-white">{duplicateDialog.existing.name}</span></div>
              <div>待保存：<span className="text-white">{duplicateDialog.pending.name}</span></div>
            </div>
            <div className="text-xs text-dnd-text-muted">如何处理？</div>
            <div className="flex gap-2">
              <button
                onClick={() => handleResolveDuplicate('overwrite')}
                disabled={duplicateSaving}
                className="flex-1 py-1.5 rounded-lg bg-dnd-gold text-black text-xs font-medium disabled:opacity-50"
              >
                {duplicateSaving ? '保存中...' : '覆盖已有'}
              </button>
              <button
                onClick={() => handleResolveDuplicate('keepBoth')}
                disabled={duplicateSaving}
                className="flex-1 py-1.5 rounded-lg border border-white/20 text-dnd-text-muted text-xs disabled:opacity-50"
              >
                保留两个
              </button>
              <button
                onClick={() => handleResolveDuplicate('cancel')}
                disabled={duplicateSaving}
                className="px-3 py-1.5 rounded-lg bg-dnd-red/80 hover:bg-dnd-red text-white text-xs disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 法术名称校对对话框 */}
      {spellNameDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#1a2332] rounded-xl border border-white/10 p-4 max-w-sm w-full space-y-3">
            <h3 className="text-white font-semibold text-sm">法术名称标准化建议</h3>
            <div className="text-xs text-dnd-text-muted space-y-2">
              <div>你输入的名称：<span className="text-yellow-400">{spellNameDialog.userInput}</span></div>
              <div>系统标准翻译：<span className="text-green-400">{spellNameDialog.matchedSpell.name}</span></div>
              <div className="text-gray-400 mt-2">是否使用标准翻译以确保一致性？</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSpellNameConfirm(true)}
                className="flex-1 py-1.5 rounded-lg bg-dnd-gold text-black text-xs font-medium"
              >
                使用标准翻译
              </button>
              <button
                onClick={() => handleSpellNameConfirm(false)}
                className="flex-1 py-1.5 rounded-lg border border-white/20 text-dnd-text-muted text-xs"
              >
                保持原样
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
