import { useState, useMemo, useCallback, useEffect } from 'react'
import { Dices, Circle, Shield, ShieldHalf } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { abilityModifier, proficiencyBonus } from '../lib/characterStore'
import { SAVE_NAMES, SKILLS, SKILL_PROF_OPTIONS, skillProfFactor } from '../data/dndSkills'
import { NumberStepper } from './BuffForm'
import { ITEM_DATABASE } from '../data/itemDatabase'

const ABILITY_NAMES_ZH = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']
/** 规则书：创建角色时基础属性上限（不含魔法物品等带来的有效值提升） */
const MAX_BASE_ABILITY_SCORE = 20
const ARMOR_PROF_OPTIONS = ['轻甲', '中甲', '重甲', '盾牌']
const LANGUAGE_OPTIONS = [
  { name: '深渊语', users: '恶魔、魔鬼', script: '地狱语' },
  { name: '天界语', users: '天使', script: '天界语' },
  { name: '通用语', users: '人类', script: '通用语' },
  { name: '龙语', users: '龙', script: '龙语' },
  { name: '精灵语', users: '精灵', script: '精灵语' },
  { name: '巨人语', users: '食人魔、巨人', script: '牛头人语' },
  { name: '地精语', users: '地精', script: '通用语' },
  { name: '刻洛语', users: '刻洛', script: '刻洛语' },
  { name: '象族语', users: '象族', script: '精灵语' },
  { name: '人鱼语', users: '人鱼', script: '人鱼语' },
  { name: '牛头人语', users: '牛头人', script: '牛头人语' },
  { name: '斯芬克斯语', users: '斯芬克斯', script: '—' },
  { name: '木族语', users: '人马、树精', script: '精灵语' },
  { name: '维多肯语', users: '维多肯', script: '维多肯语' },
]
const SIMPLE_WEAPON_IDS = [
  'club', 'dagger', 'greatclub', 'handaxe', 'javelin', 'light_hammer', 'mace', 'quarterstaff', 'sickle', 'spear',
  'dart', 'light_crossbow', 'shortbow', 'sling',
]
const MARTIAL_WEAPON_IDS = [
  'battleaxe', 'flail', 'glaive', 'greataxe', 'greatsword', 'halberd', 'lance', 'longsword', 'maul',
  'morningstar', 'pike', 'rapier', 'scimitar', 'shortsword', 'trident', 'war_pick', 'warhammer', 'whip',
  'blowgun', 'hand_crossbow', 'heavy_crossbow', 'longbow',
]
const FIREARM_WEAPON_IDS = ['gun_blunderbuss', 'gun_musket', 'gun_pistol']

function normalizeProfState(profState) {
  const src = (profState && typeof profState === 'object' && !Array.isArray(profState)) ? profState : {}
  const rawWeapons = Array.isArray(src.weapons) ? src.weapons : []
  const hasLegacyFirearm = rawWeapons.some((id) => FIREARM_WEAPON_IDS.includes(id))
  const weapons = Array.from(new Set([
    ...rawWeapons.filter((id) => !FIREARM_WEAPON_IDS.includes(id) && id !== 'smart_weapon'),
    ...(hasLegacyFirearm ? ['firearms'] : []),
  ]))
  return {
    weapons,
    tools: Array.isArray(src.tools) ? src.tools : [],
    armors: Array.isArray(src.armors) ? src.armors : [],
    languages: Array.isArray(src.languages) ? src.languages : [],
  }
}

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function summarizeLabels(labels, max = 6) {
  if (!Array.isArray(labels) || labels.length === 0) return '无'
  if (labels.length <= max) return labels.join('、')
  return `${labels.slice(0, max).join('、')} 等${labels.length}项`
}

/** 合并体质豁免与专注豁免上的优势/劣势（如战地施法者专注优势 + 其他来源的豁免劣势） */
function mergeSaveAndConcentrationAdvantage(saveAdv, concentrationAdv) {
  const s = saveAdv === 'advantage' ? 'advantage' : saveAdv === 'disadvantage' ? 'disadvantage' : 'normal'
  const c = concentrationAdv === 'advantage' ? 'advantage' : concentrationAdv === 'disadvantage' ? 'disadvantage' : 'normal'
  if (s === 'advantage' && c === 'disadvantage') return 'normal'
  if (s === 'disadvantage' && c === 'advantage') return 'normal'
  if (s === 'disadvantage' || c === 'disadvantage') return 'disadvantage'
  if (s === 'advantage' || c === 'advantage') return 'advantage'
  return 'normal'
}

/**
 * 根据熟练度等级返回文字颜色类名（写死完整类名，避免 Tailwind  purge 掉）
 * expertise=精通(暗金+光晕), prof=熟练(红), half=半熟练(天蓝), none=无(灰)
 */
function getProficiencyColor(level) {
  switch (level) {
    case 'expertise':
      return 'text-[#C79A42] drop-shadow-[0_0_5px_rgba(199,154,66,0.42)]'
    case 'prof':
      return 'text-[#E01C2F]'
    case 'half':
      return 'text-sky-400'
    default:
      return 'text-gray-500'
  }
}

/**
 * 豁免专用：熟练=暗金+光晕，未熟练=灰（与技能不同，豁免熟练用暗金）
 */
function getSaveProficiencyColor(level) {
  switch (level) {
    case 'prof':
      return 'text-[#C79A42] drop-shadow-[0_0_5px_rgba(199,154,66,0.42)]'
    default:
      return 'text-gray-500'
  }
}

/** 技能行：熟练→金色文案，精通→红色，半熟练→天蓝 */
function getSkillRowLabelClass(level) {
  switch (level) {
    case 'expertise':
      return 'text-[#E01C2F]'
    case 'prof':
      return 'text-[#C79A42]'
    case 'half':
      return 'text-sky-400'
    default:
      return 'text-gray-300'
  }
}

/** 技能行左侧长条：熟练=金色，精通=红色；其余不显示 */
function getSkillRowMarkerClass(level) {
  switch (level) {
    case 'prof':
      return 'bg-[#C79A42]'
    case 'expertise':
      return 'bg-[#E01C2F]'
    default:
      return ''
  }
}

/** 骰子按钮颜色：普通=灰，熟练=金，精通=红，半熟练=天蓝（与熟练度一致） */
function getSkillDiceButtonClass(level, isRolling) {
  if (isRolling) {
    if (level === 'expertise') return 'bg-white text-[#E01C2F] scale-110'
    if (level === 'prof') return 'bg-white text-[#C79A42] scale-110'
    if (level === 'half') return 'bg-white text-sky-600 scale-110'
    return 'bg-white text-gray-600 scale-110'
  }
  switch (level) {
    case 'expertise':
      return 'bg-[#E01C2F] hover:bg-[#C41828] text-white'
    case 'prof':
      return 'bg-[#C79A42] hover:bg-[#C79A42]/92 text-white'
    case 'half':
      return 'bg-sky-600 hover:bg-sky-500 text-white'
    default:
      return 'bg-gray-600 hover:bg-gray-500 text-white'
  }
}

/** 豁免骰子按钮：熟练=金，普通=灰（与技能骰子颜色体系一致） */
function getSaveDiceButtonClass(level, isRolling) {
  if (isRolling) {
    return level === 'prof' ? 'bg-white/95 text-[#C79A42] scale-110' : 'bg-white/95 text-gray-600 scale-110'
  }
  return level === 'prof'
    ? 'bg-[#C79A42]/88 hover:bg-[#C79A42]/96 text-white'
    : 'bg-gray-600/88 hover:bg-gray-500/92 text-white'
}

/** 熟练度图标：无=灰圈, 半=天蓝半盾, 熟练=红实心盾, 精通=金实心盾+光晕；className 用 getProficiencyColor 写死颜色 */
function ProficiencyIcon({ level, className = 'w-5 h-5' }) {
  const colorClass = getProficiencyColor(level)
  const common = `${className} ${colorClass}`.trim()
  if (level === 'none') {
    return <Circle className={common} strokeWidth={2} aria-hidden />
  }
  if (level === 'half') {
    return <ShieldHalf className={common} aria-hidden />
  }
  if (level === 'expertise') {
    return (
      <Shield
        className={common}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden
      />
    )
  }
  return (
    <Shield className={common} fill="currentColor" stroke="currentColor" strokeWidth={1.5} aria-hidden />
  )
}

/** 豁免仅两种状态：未熟练 / 熟练；熟练时用暗金色 */
function SaveProficiencyIcon({ level }) {
  const colorClass = getSaveProficiencyColor(level)
  const common = `w-5 h-5 ${colorClass}`.trim()
  if (level === 'none') {
    return <Circle className={common} strokeWidth={2} aria-hidden />
  }
  return (
    <Shield className={common} fill="currentColor" stroke="currentColor" strokeWidth={1.5} aria-hidden />
  )
}

/**
 * 属性与技能/豁免 — 暗金主色 + 熟练度四色系统 + MOD/SAVE 同大并排
 */
export default function AbilityModule({ char, abilities, buffStats, level, canEdit, onSave }) {
  const { openForCheck } = useRoll()
  const effectiveAbilities = buffStats?.abilities ?? abilities
  const [rollingId, setRollingId] = useState(null) // 正在播放投掷动画的 skill/save id
  const [showProfModal, setShowProfModal] = useState(false)
  /** 技能等：可被 Buff 覆盖熟练加值 */
  const prof = buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(level ?? 1)
  /** 豁免检定：仅用角色等级熟练加值 + 是否豁免熟练，不受 proficiency_override 影响（与 PHB 一致） */
  const profBonusForSaves = proficiencyBonus(level ?? 1)
  const savesBase = char?.savingThrows ?? { str: false, dex: false, con: false, int: false, wis: false, cha: false }
  // 合并 Buff 授予的豁免熟练
  const saves = useMemo(() => {
    const buffGranted = buffStats?.saveProficiencyGranted ?? {}
    return {
      str: !!savesBase.str || !!buffGranted.str,
      dex: !!savesBase.dex || !!buffGranted.dex,
      con: !!savesBase.con || !!buffGranted.con,
      int: !!savesBase.int || !!buffGranted.int,
      wis: !!savesBase.wis || !!buffGranted.wis,
      cha: !!savesBase.cha || !!buffGranted.cha,
    }
  }, [savesBase.str, savesBase.dex, savesBase.con, savesBase.int, savesBase.wis, savesBase.cha, buffStats?.saveProficiencyGranted])
  // 仅由 BUFF 授予的豁免熟练（基础不熟练时）——用于界面区分来源
  const buffOnlySaves = useMemo(() => {
    const buffGranted = buffStats?.saveProficiencyGranted ?? {}
    return {
      str: !savesBase.str && !!buffGranted.str,
      dex: !savesBase.dex && !!buffGranted.dex,
      con: !savesBase.con && !!buffGranted.con,
      int: !savesBase.int && !!buffGranted.int,
      wis: !savesBase.wis && !!buffGranted.wis,
      cha: !savesBase.cha && !!buffGranted.cha,
    }
  }, [savesBase.str, savesBase.dex, savesBase.con, savesBase.int, savesBase.wis, savesBase.cha, buffStats?.saveProficiencyGranted])
  const skillsState = char?.skills ?? {}
  const proficiencies = useMemo(() => normalizeProfState(char?.proficiencies), [char?.proficiencies])
  const toolOptions = useMemo(() => {
    const labels = ITEM_DATABASE
      .filter((it) => it?.类型 === '工具' && it?.类别)
      .map((it) => String(it.类别).trim())
      .filter(Boolean)
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [])
  const weaponOptions = useMemo(() => {
    const list = ITEM_DATABASE
      .filter((it) => (it?.类型 === '近战武器' || it?.类型 === '远程武器') && it?.类别 && it?.id && it.id !== 'smart_weapon')
      .map((it) => ({ id: it.id, label: String(it.类别).trim() }))
      .filter((x) => x.id && x.label)
    const seen = new Set()
    const base = list.filter((x) => {
      if (seen.has(x.id)) return false
      seen.add(x.id)
      return true
    })
    return [...base, { id: 'firearms', label: '枪械' }]
  }, [])
  const weaponOptionIds = useMemo(() => weaponOptions.map((x) => x.id), [weaponOptions])
  const simpleWeaponIds = useMemo(() => SIMPLE_WEAPON_IDS.filter((id) => weaponOptionIds.includes(id)), [weaponOptionIds])
  const martialWeaponIds = useMemo(() => MARTIAL_WEAPON_IDS.filter((id) => weaponOptionIds.includes(id)), [weaponOptionIds])
  const weaponLabelById = useMemo(() => Object.fromEntries(weaponOptions.map((w) => [w.id, w.label])), [weaponOptions])
  const selectedWeaponLabels = useMemo(() => {
    const selected = new Set(proficiencies.weapons)
    const simpleAll = simpleWeaponIds.length > 0 && simpleWeaponIds.every((id) => selected.has(id))
    const martialAll = martialWeaponIds.length > 0 && martialWeaponIds.every((id) => selected.has(id))
    const labels = []
    if (martialAll) labels.push('军用武器')
    if (simpleAll) labels.push('简易武器')
    if (!martialAll) {
      martialWeaponIds.forEach((id) => {
        if (selected.has(id) && weaponLabelById[id]) labels.push(weaponLabelById[id])
      })
    }
    if (!simpleAll) {
      simpleWeaponIds.forEach((id) => {
        if (selected.has(id) && weaponLabelById[id]) labels.push(weaponLabelById[id])
      })
    }
    if (selected.has('firearms')) labels.push('枪械')
    const covered = new Set([...simpleWeaponIds, ...martialWeaponIds, 'firearms'])
    selected.forEach((id) => {
      if (!covered.has(id) && weaponLabelById[id]) labels.push(weaponLabelById[id])
    })
    return Array.from(new Set(labels))
  }, [proficiencies.weapons, simpleWeaponIds, martialWeaponIds, weaponLabelById])

  const updateAbility = useCallback((key, value) => {
    const next = { ...abilities, [key]: Math.max(1, Math.min(MAX_BASE_ABILITY_SCORE, Number(value) || 10)) }
    onSave({ abilities: next })
  }, [abilities, onSave])

  /** 旧存档若基础属性超过 20，自动钳制并写回 */
  useEffect(() => {
    if (!canEdit) return
    const next = { ...abilities }
    let changed = false
    for (const k of ABILITY_KEYS) {
      const n = Number(next[k])
      if (!Number.isNaN(n) && n > MAX_BASE_ABILITY_SCORE) {
        next[k] = MAX_BASE_ABILITY_SCORE
        changed = true
      }
    }
    if (changed) onSave({ abilities: next })
  }, [
    canEdit,
    char?.id,
    abilities?.str,
    abilities?.dex,
    abilities?.con,
    abilities?.int,
    abilities?.wis,
    abilities?.cha,
    onSave,
  ])

  const setSave = useCallback((key, checked) => {
    onSave({ savingThrows: { ...saves, [key]: checked } })
  }, [saves, onSave])

  const setSkill = useCallback((skillId, value) => {
    onSave({ skills: { ...skillsState, [skillId]: value } })
  }, [skillsState, onSave])

  const saveProficiencies = useCallback((next) => {
    onSave({ proficiencies: normalizeProfState(next) })
  }, [onSave])

  const toggleWeapon = useCallback((id) => {
    const next = { ...proficiencies, weapons: toggleInList(proficiencies.weapons, id) }
    saveProficiencies(next)
  }, [proficiencies, saveProficiencies])

  const toggleArmor = useCallback((name) => {
    const next = { ...proficiencies, armors: toggleInList(proficiencies.armors, name) }
    saveProficiencies(next)
  }, [proficiencies, saveProficiencies])

  const toggleTool = useCallback((name) => {
    const next = { ...proficiencies, tools: toggleInList(proficiencies.tools, name) }
    saveProficiencies(next)
  }, [proficiencies, saveProficiencies])

  const toggleLanguage = useCallback((name) => {
    const next = { ...proficiencies, languages: toggleInList(proficiencies.languages, name) }
    saveProficiencies(next)
  }, [proficiencies, saveProficiencies])

  const toggleWeaponGroup = useCallback((groupIds) => {
    const allSelected = groupIds.length > 0 && groupIds.every((id) => proficiencies.weapons.includes(id))
    const nextWeapons = allSelected
      ? proficiencies.weapons.filter((id) => !groupIds.includes(id))
      : Array.from(new Set([...proficiencies.weapons, ...groupIds]))
    saveProficiencies({ ...proficiencies, weapons: nextWeapons })
  }, [proficiencies, saveProficiencies])

  // 豁免 = 属性调整值 +（若该豁免熟练则 + 熟练加值）+ Buff（含 save_bonus、体质上的专注增强等）
  const saveMod = useCallback((key) => {
    const mod = abilityModifier(effectiveAbilities[key] ?? 10)
    const profPart = saves[key] ? profBonusForSaves : 0
    const buffPart = buffStats?.saveBonusPerAbility?.[key] ?? 0
    const concentrationPart = key === 'con' ? (buffStats?.concentrationBonus ?? 0) : 0
    return mod + profPart + buffPart + concentrationPart
  }, [effectiveAbilities, saves, profBonusForSaves, buffStats?.saveBonusPerAbility, buffStats?.concentrationBonus])

  const skillMod = useCallback((skill) => {
    const mod = abilityModifier(effectiveAbilities[skill.ab] ?? 10)
    const factor = skillProfFactor(skillsState[skill.id] || 'none')
    const skillBuff = buffStats?.skillBonusPerSkill?.[skill.id] ?? 0
    const concentrationPart = skill.id === 'concentration' ? (buffStats?.concentrationBonus ?? 0) : 0
    return mod + Math.floor(prof * factor) + skillBuff + concentrationPart
  }, [effectiveAbilities, skillsState, prof, buffStats?.skillBonusPerSkill, buffStats?.concentrationBonus])

  const skillsByAb = useMemo(() => {
    const m = { str: [], dex: [], con: [], int: [], wis: [], cha: [] }
    SKILLS.forEach((s) => m[s.ab].push(s))
    return m
  }, [])

  const exhaustionPenalty = buffStats?.d20ExhaustionPenalty ?? 0
  const handleSaveRoll = useCallback((key) => {
    const saveBonus = saveMod(key) + exhaustionPenalty
    const adv = mergeSaveAndConcentrationAdvantage(
      buffStats?.advantage?.save,
      key === 'con' ? buffStats?.concentrationAdvantage : undefined,
    )
    openForCheck(
      SAVE_NAMES[key],
      saveBonus,
      adv && adv !== 'normal' ? { advantage: adv, quickRoll: true } : { quickRoll: true },
    )
    setRollingId(`save-${key}`)
    setTimeout(() => setRollingId(null), 400)
  }, [saveMod, openForCheck, buffStats?.advantage?.save, buffStats?.concentrationAdvantage, exhaustionPenalty])

  const handleSkillRoll = useCallback((skill, total) => {
    const adv = mergeSaveAndConcentrationAdvantage(
      buffStats?.advantage?.skill,
      skill.id === 'concentration' ? buffStats?.concentrationAdvantage : undefined,
    )
    openForCheck(
      skill.name,
      total + exhaustionPenalty,
      adv && adv !== 'normal' ? { advantage: adv, quickRoll: true } : { quickRoll: true },
    )
    setRollingId(skill.id)
    setTimeout(() => setRollingId(null), 400)
  }, [openForCheck, buffStats?.advantage?.skill, buffStats?.concentrationAdvantage, exhaustionPenalty])

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-dnd-gold-light font-semibold text-sm backdrop-blur-[1px]">
          熟练值 +{prof}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowProfModal(true)}
            className="px-2.5 py-1 rounded-md border border-white/10 bg-gradient-to-b from-[#2a3952]/22 to-[#222f45]/18 text-gray-100 text-xs hover:bg-[#2b3a54]/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors backdrop-blur-[1px]"
          >
            熟练项
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[7px]">
        <div className="rounded-md border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">武器熟练</div>
          <div className="text-xs text-gray-50 break-words">{summarizeLabels(selectedWeaponLabels)}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">工具熟练</div>
          <div className="text-xs text-gray-50 break-words">{summarizeLabels(proficiencies.tools)}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">护甲熟练</div>
          <div className="text-xs text-gray-50 break-words">{summarizeLabels(proficiencies.armors, 4)}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">语言</div>
          <div className="text-xs text-gray-50 break-words">{summarizeLabels(proficiencies.languages)}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 max-[500px]:grid-cols-2 gap-1.5">
        {ABILITY_KEYS.map((key) => {
          const baseScore = abilities[key] ?? 10
          const effectiveScore = effectiveAbilities[key] ?? 10
          const mod = abilityModifier(effectiveScore)
          // 豁免加值显示：调整值 + 熟练加值（若熟练）+ Buff；力竭在投掷时再计入 d20 检定
          const saveBonus = saveMod(key)
          const skillList = skillsByAb[key] || []

          const saveProfLevel = saves[key] ? 'prof' : 'none'

          return (
            <div
              key={key}
              className={`rounded-lg overflow-hidden bg-gradient-to-b from-[#232c3a]/70 to-[#1e2735]/68 border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col min-w-0 transition-colors ${saveProfLevel === 'prof' ? 'border-[#C79A42]/75' : 'border-white/[0.10]'}`}
            >
              {/* A. 顶部栏：属性名 + 熟练按钮在名称右侧 */}
              <div className="flex items-center gap-1 px-1.5 py-0.5 border-b border-gray-700 min-h-[1.5rem]">
                <span className="text-sm font-bold text-white font-sans">{ABILITY_NAMES_ZH[key]}</span>
                <span className={`text-[9px] font-medium ${saveProfLevel === 'prof' ? 'text-[#C79A42]/90' : 'text-gray-500'}`}>
                  熟练
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setSave(key, !saves[key])}
                    className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-dnd-gold-light"
                    title={saves[key] ? (buffOnlySaves[key] ? '熟练（由 BUFF 授予，点击取消）' : '熟练（点击取消）') : '未熟练（点击设为熟练）'}
                  >
                    <span className="relative inline-flex">
                      <SaveProficiencyIcon level={saveProfLevel} />
                      {buffOnlySaves[key] && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-dnd-red" title="由 BUFF 授予" />
                      )}
                    </span>
                  </button>
                ) : (
                  <span className="p-0.5 relative inline-flex" title={buffOnlySaves[key] ? '熟练（由 BUFF 授予）' : ''}>
                    <SaveProficiencyIcon level={saveProfLevel} />
                    {buffOnlySaves[key] && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-dnd-red" title="由 BUFF 授予" />
                    )}
                  </span>
                )}
              </div>

              {/* B. 核心区：3 列网格，紧凑排版 */}
              <div className="px-1 py-0.5">
                <div className={`rounded-md py-0.5 px-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto] gap-x-1 gap-y-0.5 min-w-0 border ${saveProfLevel === 'prof' ? 'border-[#C79A42]/75' : 'border-white/[0.10]'}`} style={{ background: 'linear-gradient(180deg, rgba(67,78,98,0.28) 0%, rgba(35,44,58,0.22) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                  {/* 第一行：调整值文案 | 基础值输入 | 豁免文案 */}
                  <div className="col-start-1 row-start-1 flex items-center justify-center min-w-0 border-r border-white/[0.10] pr-1">
                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide leading-tight">调整值</span>
                  </div>
                  <div className="col-start-2 row-start-1 flex items-center justify-center min-w-0">
                    {canEdit ? (
                      <NumberStepper
                        value={typeof baseScore === 'number' ? baseScore : (parseInt(baseScore, 10) || 10)}
                        onChange={(v) => updateAbility(key, String(Math.max(1, Math.min(MAX_BASE_ABILITY_SCORE, v))))}
                        min={1}
                        max={MAX_BASE_ABILITY_SCORE}
                        compact
                        narrow
                      />
                    ) : (
                      <span className="text-xs font-medium font-mono text-white tabular-nums">{baseScore}</span>
                    )}
                  </div>
                  <div className="col-start-3 row-start-1 flex items-center justify-center min-w-0 border-l border-white/[0.10] pl-1">
                    <span className="text-[9px] font-semibold text-[#C79A42] uppercase tracking-wide leading-tight">豁免</span>
                  </div>
                  {/* 第二行：调整值数字 | 总值（与基础值之间无分割线） | 豁免加值+投掷 */}
                  <div className="col-start-1 row-start-2 flex flex-col items-center justify-center min-w-0 border-r border-white/[0.10] pr-1">
                    <span className="text-[1.5rem] font-bold text-white font-mono tabular-nums leading-none tracking-tight">
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                  <div className="col-start-2 row-start-2 flex flex-col items-center justify-center gap-0.5 min-w-0">
                    <span className="text-[9px] font-semibold text-gray-500/90 uppercase tracking-wide leading-tight">总值</span>
                    <span className="text-xs font-medium font-mono text-white tabular-nums">{effectiveScore}</span>
                  </div>
                  <div className="col-start-3 row-start-2 flex items-center justify-center gap-1.5 min-w-0 pl-1 border-l border-white/[0.10]">
                    <span className={`text-[1.5rem] font-bold font-mono tabular-nums leading-none tracking-tight ${saveProfLevel === 'prof' ? 'text-[#C79A42]/95' : 'text-white'}`}>
                      {saveBonus >= 0 ? '+' : ''}{saveBonus}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSaveRoll(key)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-200 ${getSaveDiceButtonClass(saveProfLevel, rollingId === `save-${key}`)}`}
                      title={`投掷 ${SAVE_NAMES[key]}`}
                    >
                      <Dices className="w-3 h-3" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>

              {/* D. 技能列表 */}
              <div className="flex-1 min-h-0">
                {skillList.length === 0 ? (
                  <div className="px-1.5 py-0.5 text-dnd-text-muted text-[9px]">无关联技能</div>
                ) : (
                  <ul className="divide-y divide-white/[0.06]">
                    {skillList.map((skill) => {
                      const total = skillMod(skill)
                      const current = skillsState[skill.id] || 'none'
                      const isRolling = rollingId === skill.id

                      return (
                        <li
                          key={skill.id}
                          className={`relative flex items-center gap-1.5 py-1 pr-1.5 bg-[#202838]/38 hover:bg-[#202838]/55 transition-colors ${
                            (current === 'expertise' || current === 'prof')
                              ? 'pl-[6px]'
                              : 'pl-1.5'
                          }`}
                        >
                          {getSkillRowMarkerClass(current) && (
                            <span className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] ${getSkillRowMarkerClass(current)}`} aria-hidden />
                          )}
                          {/* 熟练度：下拉或图标，留足宽度避免与箭头重叠 */}
                          {canEdit ? (
                            <select
                              value={current}
                              onChange={(e) => setSkill(skill.id, e.target.value)}
                              className={`h-4.5 min-w-[4rem] w-12 rounded border border-gray-600 bg-gray-800 text-[9px] pl-1 pr-4 font-medium focus:border-dnd-gold-light focus:ring-1 focus:ring-dnd-gold-light ${getSkillRowLabelClass(current)}`}
                            >
                              {SKILL_PROF_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="shrink-0 flex items-center justify-center w-4" title={current}>
                              <ProficiencyIcon level={current} className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <span className={`text-[11px] truncate flex-1 min-w-0 font-medium ${getSkillRowLabelClass(current)}`}>{skill.name}</span>
                          <span className={`font-mono text-[11px] tabular-nums shrink-0 w-7 text-right font-bold ${getSkillRowLabelClass(current)}`}>
                            {total >= 0 ? '+' : ''}{total}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSkillRoll(skill, total)}
                            className={`shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all duration-200 ${getSkillDiceButtonClass(current, isRolling)}`}
                            title={`投掷 ${skill.name}`}
                          >
                            <Dices
                              className={`w-3 h-3 ${isRolling ? 'animate-dice-roll' : ''}`}
                              aria-hidden
                            />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-dnd-text-muted text-center px-1 pt-1 border-t border-white/[0.06] mt-1">
        基于规则基础属性不能高于20
      </p>
      {showProfModal && canEdit && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowProfModal(false)}>
          <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-xl border border-gray-600 bg-gray-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h4 className="text-[#C79A42] font-bold">熟练项设置</h4>
              <button type="button" onClick={() => setShowProfModal(false)} className="px-2 py-1 text-sm rounded border border-gray-600 text-gray-300 hover:bg-gray-700">关闭</button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(85vh-62px)]">
              <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-3 space-y-2">
                <div className="text-sm font-semibold text-[#C79A42]">武器熟练</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleWeaponGroup(simpleWeaponIds)}
                    className={`px-2 py-1 rounded border text-xs ${simpleWeaponIds.every((id) => proficiencies.weapons.includes(id)) ? 'border-[#C79A42] bg-[#C79A42]/20 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                  >
                    简易武器
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWeaponGroup(martialWeaponIds)}
                    className={`px-2 py-1 rounded border text-xs ${martialWeaponIds.every((id) => proficiencies.weapons.includes(id)) ? 'border-[#C79A42] bg-[#C79A42]/20 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                  >
                    军用武器
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {weaponOptions.map((w) => {
                    const checked = proficiencies.weapons.includes(w.id)
                    return (
                      <label key={w.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer ${checked ? 'border-[#C79A42] bg-[#C79A42]/15 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700/60'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWeapon(w.id)}
                          className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                        />
                        <span className="truncate">{w.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-3 space-y-2">
                <div className="text-sm font-semibold text-[#C79A42]">工具熟练</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {toolOptions.map((name) => {
                    const checked = proficiencies.tools.includes(name)
                    return (
                      <label key={name} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer ${checked ? 'border-[#C79A42] bg-[#C79A42]/15 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700/60'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTool(name)}
                          className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-3 space-y-2">
                <div className="text-sm font-semibold text-[#C79A42]">护甲熟练</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {ARMOR_PROF_OPTIONS.map((name) => {
                    const checked = proficiencies.armors.includes(name)
                    return (
                      <label key={name} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer ${checked ? 'border-[#C79A42] bg-[#C79A42]/15 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700/60'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleArmor(name)}
                          className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                        />
                        <span>{name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-gray-600 bg-gray-700/30 p-3 space-y-2">
                <div className="text-sm font-semibold text-[#C79A42]">语言</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {LANGUAGE_OPTIONS.map((lang) => {
                    const checked = proficiencies.languages.includes(lang.name)
                    return (
                      <label key={lang.name} className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer ${checked ? 'border-[#C79A42] bg-[#C79A42]/15 text-[#C79A42]' : 'border-gray-600 text-gray-300 hover:bg-gray-700/60'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLanguage(lang.name)}
                          className="mt-0.5 rounded border-gray-600 bg-gray-800 text-dnd-red"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-100">{lang.name}</span>
                          <span className="block text-[11px] text-gray-400">典型使用者：{lang.users}</span>
                          <span className="block text-[11px] text-gray-500">文字：{lang.script}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
