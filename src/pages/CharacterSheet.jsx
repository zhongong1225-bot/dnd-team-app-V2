/**
 * 角色卡（重写版 - 从简出发，不依赖 formulas）
 * 含：角色名、外观/基础、经验与等级、职业、Buff、背包、同调位。
 * 备份于恢复战斗状态之前。
 */
import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronRight, Trash2, Star, Upload, X, Plus, Settings, Zap, RefreshCw, Pencil } from 'lucide-react'

import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getCharacter, updateCharacter, loadCharacterById, getCharactersInModule } from '../lib/characterStore'
import { isSupabaseEnabled } from '../lib/supabase'
import { mergeCharacterPatch, mergePatchesList } from '../lib/mergeCharacterPatch'
import { resolveCreatureHpDisplay } from '../lib/creatureHpDisplay'
import { levelFromXP, xpForLevel } from '../lib/xp5e'
import { proficiencyBonus, abilityModifier, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import {
  getSpellcastingLevel,
  ALL_CLASS_NAMES,
  getClassDisplayName,
  getSubclassOptions,
  getAvailableFeatures,
  resolveSelectedFeatures,
  getPrimarySpellcastingAbility,
  getCharacterClasses,
  getClassData,
  getMaxSpellSlotsByRing,
} from '../data/classDatabase'
import { useRuleTextOverridesMap } from '../hooks/useRuleTextOverridesMap'
import {
  buildClassFeatureKey,
  buildClassFeatureNameKey,
  buildSubclassFeatureKey,
  buildSubclassFeatureNameKey,
  buildFeatDescriptionKey,
  buildFeatNameKey,
  resolveRuleText,
} from '../lib/ruleTextOverrides'
import { FANXING_PRESTIGE_CLASSES } from '../data/fanxing'
import { ABILITY_NAMES_ZH, BUFF_TYPES } from '../data/buffTypes'
import { FEATS, FEATS_BY_CATEGORY, formatFeatDescriptionForDisplay } from '../data/feats'
import { ELDRITCH_INVOCATIONS } from '../data/eldritchInvocations'
import { FIGHTING_STYLES, getFightingStyleById } from '../data/fightingStyles'
import { useCombatState } from '../hooks/useCombatState'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import {
  getMergedBuffsForCalculator,
  getEffectsFromBuff,
  mergeFeatBuffPatchesFromMergedList,
  mergeInvocationBuffPatchesFromMergedList,
  mergeFightingStyleBuffPatchesFromMergedList,
} from '../lib/effects/effectMapping'
import { HARDCODED_CLASS_FEATURE_BUFFS } from '../data/classFeatureDefaultBuffs'
import { cloneBuffTemplateToManual } from '../lib/buffStash'
import BuffManager from '../components/BuffManager'
import CardView, { SlotPanel, AbilityButton, ShieldPoolCounter } from '../components/CardView'
import EldritchInvocationPicker from '../components/EldritchInvocationPicker'
import FightingStylePicker from '../components/FightingStylePicker'
import CombatStatus from '../components/CombatStatus'
import EquipmentAndInventory from '../components/EquipmentAndInventory'
import MartialTechniquesPanel from '../components/MartialTechniquesPanel'
import { getAllRaces, getRaceById, addCustomRace, updateCustomRace, removeCustomRace, migrateLegacyRace, isLegacyRace } from '../data/races'
import { normalizeRace, normalizeAbilityScoreBonuses, inferAsiAssignmentsFromLegacy, isRaceDefinitionIncomplete, RACE_SIZES } from '../data/raceModel'
import RaceEditorForm from '../components/RaceEditorForm'
import { BACKGROUNDS, getBackgroundById } from '../data/backgrounds'
import AbilityModule from '../components/AbilityModule'
import AvatarCropModal from '../components/AvatarCropModal'
import CharacterSheetTopBar from '../components/CharacterSheetTopBar'
import FeatPickerModal from '../components/FeatPickerModal'
import BuffForm from '../components/BuffForm'
import { getEffectSummaryShort } from '../components/BuffListItem'
import BuffEditorModal from '../components/BuffEditorModal'
import { loadDefaultBuffPatch, saveDefaultBuffPatch, clearDefaultBuffPatch, buildClassFeatureBuffKey, DEFAULT_BUFF_PATCHES_EVENT } from '../lib/defaultBuffPatchStore'
import { CLASS_FEATURE_CHOICE_REGISTRY, CHOICE_ID_ALIASES } from '../data/classFeatureChoiceRegistry'
import { executeAbility, canUseAbility } from '../lib/activeAbilityEngine'
import { buildCardsFromCharacter, findActiveAbilityInCards, findAllActiveAbilitiesInCards } from '../lib/cardAdapter'
import { getShieldPoolCurrent, setShieldPoolCurrent, decrementShieldPool, resetShieldPool } from '../lib/shieldPoolUtils'
import { formatRecoveryBrief, RESOURCE_TYPE_OPTIONS } from '../lib/chargeItemModel'
import AbilityUseModal from '../components/AbilityUseModal'
import { SCOPE_TYPE_OPTIONS } from '../lib/cardModel'
import InfoTooltip from '../components/InfoTooltip'
import { ClassFeatureTooltipContent, FeatTooltipContent } from '../lib/infoTooltipContent'
import { APP_VERSION_LABEL } from '../config/version'

/** 选项专属 BUFF key：${sourceClass}|${sourceSubclass || ''}|${featureId}:${optionId} */
function buildClassFeatureOptionBuffKey(sourceClass, sourceSubclass, featureId, optionId) {
  return `${sourceClass}|${sourceSubclass || ''}|${featureId}:${optionId}`
}

/** 从 BUFF 条目查找专长对应的第一个主动技能（仅当有主动释放效果时） */
/**
 * 从任意卡的 charge_item 效果构造主动技能对象
 * @param {string} sourceKey - 卡的 sourceKey（featId / itemInventoryId / classFeature key）
 * @param {Array} cards - 所有卡数组
 * @param {string} slotKind - 可选，限定卡类型 ('feat' | 'equipment' | 'class')
 * @returns {object|null} 主动技能对象或 null
 */
function findActiveAbilityFromCard(sourceKey, cards, slotKind = null) {
  if (!Array.isArray(cards) || !sourceKey) return null
  
  const card = cards.find(c => {
    if (c.sourceKey !== sourceKey) return false
    if (slotKind && c.slotKind !== slotKind) return false
    return true
  })
  
  if (!card) return null
  
  // 从 charge_item 效果提取主动释放配置（BUFF 编辑器用 effectType）
  const chargeEffect = Array.isArray(card.buffEffects)
    ? card.buffEffects.find(e => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')
    : null

  // 优先从 buffEffects 构造，其次用 buffEntryToCard 已构建的 activeAbility
  if (!chargeEffect && card.activeAbility) return card.activeAbility
  if (!chargeEffect) return null

  const chargeValue = chargeEffect.value
  // 从 effects 中提取第一个子效果作为主效果
  const mainEffect = Array.isArray(chargeValue.effects) && chargeValue.effects.length > 0
    ? chargeValue.effects[0]
    : null

  if (!mainEffect) return card.activeAbility || null

  // 构造主动技能对象（与 activeAbilityEngine 兼容）
  return {
    id: `${sourceKey}_active`,
    name: card.name || '主动技能',
    actionType: chargeValue.actionCost || 'action',
    cost: chargeValue.resourceType === 'none'
      ? { type: 'none' }
      : { type: 'class_resource', resourceKey: chargeValue.resourceType || 'charges', amount: chargeValue.charges || 1 },
    cooldown: chargeValue.recovery?.method === 'long_rest' ? 'long_rest'
              : chargeValue.recovery?.method === 'short_rest' ? 'short_rest'
              : 'none',
    description: card.description || '',
    needsInteraction: 'confirm',
    isStance: !!chargeValue.isStance,
    effects: [{
      type: mainEffect.type,
      value: mainEffect.value,
      // custom_logic 的描述在 value.description，其他类型可能在 text
      description: mainEffect.value?.description || mainEffect.text || '',
    }],
  }
}

// 向后兼容别名
const findActiveAbilityForFeat = (featId, cards) => findActiveAbilityFromCard(featId, cards, 'feat')


import { inputClass } from '../lib/inputStyles'

const RAW_AVATAR_FILE_MAX = 12 * 1024 * 1024 // 裁剪前原图上限，裁剪后会压到约 800KB 内

/** 角色卡：职业特性 / 专长等列表卡片统一层级字号与 16px 图标 */
const CS_LIST_TITLE = 'text-sm font-semibold text-white'
const CS_LIST_META = 'text-xs text-gray-500'
const CS_LIST_BODY = 'text-sm text-gray-400 leading-relaxed'
const CS_LIST_SECTION_LBL = 'text-dnd-gold-light text-[10px] uppercase tracking-wider font-bold'
const CS_ICON_16 = 'h-4 w-4 shrink-0'
const CS_ICON_BTN = 'inline-flex shrink-0 items-center justify-center rounded p-1.5'

const NameInput = forwardRef(function NameInput({ value, onChange, onFocus, onBlur, onKeyDown, className }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder="未命名"
      className={className}
    />
  )
})

function AvatarFrame({ char, canEdit, onSave, large }) {
  const inputRef = useRef(null)
  const zoneRef = useRef(null)
  const avatar = char?.avatar ?? null
  const [cropOpen, setCropOpen] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [cropAspect, setCropAspect] = useState(1)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > RAW_AVATAR_FILE_MAX) {
      alert('请选择 12MB 以内的图片，裁剪后会自动压缩保存')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return
      let ar = 1
      if (large && zoneRef.current) {
        const r = zoneRef.current.getBoundingClientRect()
        if (r.width >= 48 && r.height >= 48) ar = r.width / r.height
      }
      setCropAspect(ar)
      setCropSrc(dataUrl)
      setCropOpen(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const closeCrop = () => {
    setCropOpen(false)
    setCropSrc(null)
  }

  const removeAvatar = () => {
    onSave({ avatar: null })
  }

  const placeholderId = 'avatar-file-input'

  if (large) {
    return (
      <>
      <AvatarCropModal
        open={cropOpen}
        imageSrc={cropSrc}
        aspect={cropAspect}
        onCancel={closeCrop}
        onConfirm={(dataUrl) => {
          onSave({ avatar: dataUrl })
          closeCrop()
        }}
      />
      <div
        ref={zoneRef}
        className="avatar-upload-zone w-full h-full min-h-[360px] max-w-full flex flex-col items-center justify-center relative overflow-hidden"
      >
        {avatar ? (
          <img src={avatar} alt="头像" className="w-full h-full object-cover object-center absolute inset-0" />
        ) : (
          <span className="text-[var(--text-muted)] text-sm">上传头像</span>
        )}
        {canEdit && (
          <>
            <input
              ref={inputRef}
              id={placeholderId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <label
              htmlFor={placeholderId}
              className="avatar-upload-btn cursor-pointer"
              title="上传"
            >
              <Upload className={CS_ICON_16} />
            </label>
            {avatar && (
              <button
                type="button"
                onClick={removeAvatar}
                className="btn-ghost absolute bottom-3 left-3 text-xs"
                title="移除"
              >
                <X className={`${CS_ICON_16} inline mr-0.5`} />
                移除
              </button>
            )}
          </>
        )}
      </div>
      </>
    )
  }

  return (
    <>
    <AvatarCropModal
      open={cropOpen}
      imageSrc={cropSrc}
      aspect={cropAspect}
      onCancel={closeCrop}
      onConfirm={(dataUrl) => {
        onSave({ avatar: dataUrl })
        closeCrop()
      }}
    />
    <div className="avatar-upload-zone flex flex-col items-center gap-1.5 flex-shrink-0 w-full p-2 rounded-lg">
      {avatar ? (
        <div className="w-36 h-36 md:w-40 md:h-40 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-[var(--border-color)] aspect-square">
          <img src={avatar} alt="头像" className="min-w-full min-h-full w-full h-full object-cover object-center" />
        </div>
      ) : canEdit ? (
        <label
          htmlFor={placeholderId}
          className="w-36 h-36 md:w-40 md:h-40 avatar-placeholder flex items-center justify-center shrink-0 cursor-pointer"
        >
          <span className="text-[var(--text-muted)] text-xs text-center px-2">上传头像</span>
        </label>
      ) : (
        <div className="w-36 h-36 md:w-40 md:h-40 avatar-placeholder flex items-center justify-center shrink-0">
          <span className="text-[var(--text-muted)] text-xs text-center px-2">上传头像</span>
        </div>
      )}
      {canEdit && (
        <>
          <input
            ref={inputRef}
            id={placeholderId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <div className="flex flex-wrap gap-1.5 justify-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-ghost inline-flex items-center gap-1"
            >
              <Upload className={CS_ICON_16} />
              上传
            </button>
            {avatar && (
              <button type="button" onClick={removeAvatar} className="btn-ghost inline-flex items-center gap-1">
                <X className={CS_ICON_16} />
                移除
              </button>
            )}
          </div>
        </>
      )}
    </div>
    </>
  )
}

/** 必须定义在模块顶层，避免父组件每次渲染时子组件类型变化导致输入框失焦 */
function AppearanceField({ label, value, setValue, onBlur, canEdit, inputCls, labelCls }) {
  const SIZE_OPTIONS = ['微型', '小型', '中型', '大型', '巨型', '超巨型']
  const isSize = label === '体型'
  return (
    <div className="form-group-compact min-w-0 w-full gap-1">
      <label className={labelCls}>{label}</label>
      {canEdit ? (
        isSize ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onBlur}
            className={`${inputCls} pl-2.5 pr-2 min-w-0 max-w-full`}
          >
            <option value="">—</option>
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onBlur}
            className={inputCls}
            placeholder="—"
          />
        )
      ) : (
        <span className="text-[var(--text-main)] text-sm truncate max-w-full block leading-snug">{value || '—'}</span>
      )}
    </div>
  )
}

/** 人物背景故事：多行文本，失焦保存；fillHeight 时填满剩余高度并纵向滚动 */
function BackstoryBlock({ char, canEdit, onSave, fillHeight }) {
  const [local, setLocal] = useState(char?.backstory ?? '')
  useEffect(() => {
    setLocal(char?.backstory ?? '')
  }, [char?.id, char?.backstory])
  const containerClass = fillHeight
    ? 'min-w-0 w-full min-h-0 flex-1 flex flex-col rounded-lg border border-gray-600 bg-gray-800/50 overflow-hidden'
    : 'min-w-0 w-full rounded-lg border border-gray-600 bg-gray-800/50 overflow-hidden'
  const inputClass = fillHeight
    ? 'input-thin w-full min-h-0 flex-1 py-2 px-3 text-sm resize-none overflow-y-auto block'
    : 'input-thin w-full min-h-[120px] max-h-[280px] py-2 px-3 text-sm resize-none overflow-y-auto block'
  const readOnlyClass = fillHeight
    ? 'min-h-0 flex-1 overflow-y-auto py-2 px-3 text-sm text-[var(--text-main)] whitespace-pre-wrap'
    : 'max-h-[280px] overflow-y-auto py-2 px-3 text-sm text-[var(--text-main)] whitespace-pre-wrap'
  return (
    <div className={containerClass}>
      {canEdit ? (
        <textarea
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onSave({ backstory: (local || '').trim() || undefined })}
          placeholder="输入角色背景故事，内容过长时可拖动右侧滚动条浏览…"
          className={inputClass}
          style={fillHeight ? { minHeight: 80 } : { minHeight: 120, maxHeight: 280 }}
        />
      ) : (
        <div className={readOnlyClass}>
          {char?.backstory || <span className="text-gray-500">—</span>}
        </div>
      )}
    </div>
  )
}

function AppearanceGrid({ char, canEdit, onSave, noBorder, compact }) {
  const app = char?.appearance ?? {}
  const [age, setAge] = useState(app.age ?? '')
  const [alignment, setAlignment] = useState(app.alignment ?? '')
  const [eyes, setEyes] = useState(app.eyes ?? '')
  const [height, setHeight] = useState(app.height ?? '')
  const [skin, setSkin] = useState(app.skin ?? '')
  const [race, setRace] = useState(app.race ?? '')
  const [weight, setWeight] = useState(app.weight ?? '')
  const [hair, setHair] = useState(app.hair ?? '')
  useEffect(() => {
    const a = char?.appearance ?? {}
    setAge(a.age ?? '')
    setAlignment(a.alignment ?? '')
    setEyes(a.eyes ?? '')
    setHeight(a.height ?? '')
    setSkin(a.skin ?? '')
    setRace(a.race ?? '')
    setWeight(a.weight ?? '')
    setHair(a.hair ?? '')
  }, [char?.id])

  const appearanceData = () => ({ age, race, alignment, height, weight, hair, eyes, skin })
  const save = () => onSave({ appearance: appearanceData() })

  const cells = [
    { label: '年龄', value: age, set: setAge },
    { label: '阵营', value: alignment, set: setAlignment },
    { label: '瞳色', value: eyes, set: setEyes },
    { label: '身高', value: height, set: setHeight },
    { label: '肤色', value: skin, set: setSkin },
    { label: '体重', value: weight, set: setWeight },
    { label: '发色', value: hair, set: setHair },
  ]

  const inputCls = compact
    ? 'input-thin h-9 min-h-9 w-full max-w-full'
    : 'profile-input h-9 min-h-9 w-full max-w-full'
  const labelCls = compact ? 'form-label block' : 'profile-label block'

  const frameClass = noBorder ? 'p-0 min-w-0 w-full' : 'profile-section p-3 min-w-0 w-full'
  return (
    <div className={frameClass}>
      <div
        className={`grid w-full min-w-0 ${compact ? 'gap-x-2 gap-y-2' : 'gap-x-3 gap-y-3.5'}`}
        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
      >
        {cells.map(({ label, value, set }) => (
          <AppearanceField
            key={label}
            label={label}
            value={value}
            setValue={set}
            onBlur={save}
            canEdit={canEdit}
            inputCls={inputCls}
            labelCls={labelCls}
          />
        ))}
      </div>
    </div>
  )
}

/** 整合到外观区的种族/背景选择器 + 基础信息 + BUFF 编辑器 */
function RaceBackgroundInline({ char, canEdit, onSave, raceBuffEditorOpen, setRaceBuffEditorOpen, backgroundBuffEditorOpen, setBackgroundBuffEditorOpen, showTraitsOnly, referenceData, baseReferenceData, formulaContext }) {
  const raceCard = char?.raceCard || {}
  const backgroundCard = char?.backgroundCard || {}

  // 职业列表（供 BUFF 编辑器使用）
  const charClasses = [
    ...(char?.['class'] ? [{ className: char['class'], level: char.classLevel || 1 }] : []),
    ...(Array.isArray(char?.multiclass) ? char.multiclass.filter(m => m['class']).map(m => ({ className: m['class'], level: m.level || 0 })) : []),
  ]

  const selectedRace = useMemo(() => {
    const byId = getRaceById(raceCard.raceId)
    if (byId) return byId
    if (raceCard.customName) {
      const name = raceCard.customName.trim()
      return getAllRaces().find(r => r.name === name) || null
    }
    return null
  }, [raceCard.raceId, raceCard.customName])
  const selectedSubrace = useMemo(() => {
    if (!selectedRace?.subraces || !raceCard.subraceId) return null
    return selectedRace.subraces.find(s => s.id === raceCard.subraceId) || null
  }, [selectedRace, raceCard.subraceId])
  const selectedBackground = useMemo(() => getBackgroundById(backgroundCard.backgroundId), [backgroundCard.backgroundId])

  // 旧数据一次性迁移：asiAssignments 键不存在时尝试从旧格式推断
  useEffect(() => {
    if (!char?.id || !raceCard.raceId || !selectedRace) return
    if ('asiAssignments' in raceCard) return
    const inferred = inferAsiAssignmentsFromLegacy(selectedRace, selectedSubrace, raceCard.raceBaseInfo?.abilityScoreIncrease)
    onSave({ raceCard: { ...raceCard, asiAssignments: inferred || [] } })
  }, [char?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubraceChange = (subraceId) => {
    const kept = (raceCard.asiAssignments || []).filter(a => a.source !== 'subrace')
    onSave({ raceCard: { ...raceCard, subraceId, asiAssignments: kept } })
  }
  const [raceTraitChoiceModal, setRaceTraitChoiceModal] = useState(null)
  const handleTraitChoiceSelect = (traitId, optionId) => {
    const choices = { ...(raceCard.traitChoices || {}), [traitId]: optionId }
    onSave({ raceCard: { ...raceCard, traitChoices: choices } })
    setRaceTraitChoiceModal(null)
  }
  const handleBackgroundChange = (backgroundId) => onSave({ backgroundCard: { ...backgroundCard, backgroundId } })

  // 背景编辑器中的名称/描述编辑状态
  const [bgEditName, setBgEditName] = useState('')
  const [bgEditDesc, setBgEditDesc] = useState('')

  // 种族编辑器弹窗
  const [editingRaceId, setEditingRaceId] = useState('')
  const [editingRaceData, setEditingRaceData] = useState(null) // 完整种族对象（RaceEditorForm 用）
  const [raceListKey, setRaceListKey] = useState(0)
  const isNewRaceRef = useRef(false)

  // 种族编辑器保存（写入种族库 + 更新角色 raceId）
  const handleRaceEditorSave = () => {
    if (!editingRaceData?.name?.trim()) return
    let finalRaceId = editingRaceId
    if (isNewRaceRef.current || !getRaceById(editingRaceId)) {
      const preId = editingRaceId || `race_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      const created = addCustomRace({ ...editingRaceData, id: preId })
      if (created) finalRaceId = created.id
    } else {
      if (isLegacyRace(editingRaceId)) migrateLegacyRace(editingRaceId)
      updateCustomRace(editingRaceId, editingRaceData)
    }
    onSave({ raceCard: { ...raceCard, raceId: finalRaceId } })
    setRaceBuffEditorOpen(false)
    setRaceListKey((k) => k + 1)
  }

  // 种族编辑器取消
  const handleRaceEditorCancel = () => {
    if (isNewRaceRef.current && editingRaceId) {
      removeCustomRace(editingRaceId)
      setRaceListKey((k) => k + 1)
    }
    setRaceBuffEditorOpen(false)
  }

  const handleBackgroundBuffSave = (buff) => {
    const next = { ...backgroundCard }
    if (bgEditName.trim()) next.customName = bgEditName.trim()
    else delete next.customName
    if (bgEditDesc.trim()) next.customDescription = bgEditDesc.trim()
    else delete next.customDescription
    if (buff.effects.length > 0) next.backgroundBuffPatch = { effects: buff.effects, enabled: buff.enabled }
    else delete next.backgroundBuffPatch
    onSave({ backgroundCard: next })
    setBackgroundBuffEditorOpen(false)
  }
  const handleBackgroundBuffClear = () => {
    const next = { ...backgroundCard }
    delete next.backgroundBuffPatch
    onSave({ backgroundCard: next })
    setBackgroundBuffEditorOpen(false)
  }

  const selCls = 'flex-1 min-w-0 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50'
  const txtCls = 'w-12 px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 text-center focus:outline-none focus:border-dnd-gold/50'

  // 效果类型→中文名映射（从 BUFF_TYPES 构建）
  const effectTypeLabelMap = useMemo(() => {
    const map = {}
    Object.values(BUFF_TYPES).forEach((cat) => {
      if (cat?.effects) cat.effects.forEach((ef) => { map[ef.key] = ef.label })
    })
    return map
  }, [])

  // 收集所有 BUFF 效果用于"增强"展示
  const allBuffEffects = []
  if (Array.isArray(raceCard.raceBuffPatch?.effects)) {
    raceCard.raceBuffPatch.effects.forEach((e, i) => allBuffEffects.push({ ...e, _source: 'race', _idx: i }))
  }
  if (Array.isArray(backgroundCard.backgroundBuffPatch?.effects)) {
    backgroundCard.backgroundBuffPatch.effects.forEach((e, i) => allBuffEffects.push({ ...e, _source: 'bg', _idx: i }))
  }

  // 仅展示特性效果模式（用于顶层全宽布局）
  if (showTraitsOnly) {
    const allTraits = []
    if (selectedRace) {
      ;(selectedRace.traits || []).forEach(t => allTraits.push({ ...t, _isSubrace: false }))
      if (raceCard.subraceId && selectedRace.subraces) {
        const sub = selectedRace.subraces.find(s => s.id === raceCard.subraceId)
        if (sub) (sub.traits || []).forEach(t => allTraits.push({ ...t, _isSubrace: true }))
      }
    }
    const choiceTrait = raceTraitChoiceModal ? allTraits.find(t => t.id === raceTraitChoiceModal) : null
    return selectedRace ? (
      <>
      <div className="mt-3 space-y-1.5">
        {allTraits.length > 0 && allTraits.map((t) => {
            const isChoice = Array.isArray(t.choiceOptions) && t.choiceOptions.length > 0
            const chosenOpt = isChoice ? (t.choiceOptions || []).find(o => o.id === raceCard.traitChoices?.[t.id]) : null
            const activeCards = isChoice ? (chosenOpt?.cards || []) : (t.cards || [])
            const effectSummaries = activeCards.map(c =>
              getEffectSummaryShort({ effectType: c.effectType, value: c.value, customText: c.customText, scope: c.scope, scopeDetail: c.scopeDetail }, {})
            ).filter(Boolean)
            return (
              <div key={t.id} className="bg-white/[0.03] rounded-md border border-gray-700/40 px-3 py-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t._isSubrace ? '亚种特性' : '种族特性'}</span>
                  <span className="text-xs font-semibold text-gray-200">{t.name}</span>
                  {isChoice && (
                    <button
                      onClick={() => setRaceTraitChoiceModal(t.id)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/15 border border-amber-400/20"
                    >
                      {chosenOpt ? chosenOpt.label : '未选择'}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  )}
                </div>
                {t.description && <p className="text-[11px] text-gray-400 leading-relaxed mb-1">{t.description}</p>}
                {effectSummaries.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {effectSummaries.map((s, i) => (
                      <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-300/80">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
      </div>
      {choiceTrait && Array.isArray(choiceTrait.choiceOptions) && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[300]" onClick={() => setRaceTraitChoiceModal(null)} />
          <div className="fixed inset-x-4 top-[20%] z-[301] max-w-lg mx-auto bg-[#1a2332] border border-white/10 rounded-lg shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-200">选择：{choiceTrait.name}</h4>
              <button onClick={() => setRaceTraitChoiceModal(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
            </div>
            {choiceTrait.description && <p className="text-[11px] text-gray-400">{choiceTrait.description}</p>}
            <div className="space-y-2">
              {choiceTrait.choiceOptions.map(opt => {
                const isSelected = raceCard.traitChoices?.[choiceTrait.id] === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleTraitChoiceSelect(choiceTrait.id, opt.id)}
                    className={`w-full text-left px-3 py-2 rounded border transition-colors ${isSelected ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-amber-400' : 'border-gray-500'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      </div>
                      <span className="text-xs font-medium text-gray-200">{opt.label}</span>
                    </div>
                    {opt.description && <p className="text-[10px] text-gray-400 mt-1 ml-5.5">{opt.description}</p>}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
      </>
    ) : null
  }

  return (
    <>
    <div className="mt-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: '0.5rem' }}>
      {/* 种族 + [亚种] + 背景按钮行 */}
      {/* 种族按钮 */}
      <button type="button" onClick={() => {
        // 旧版兼容种族自动迁移
        if (raceCard.raceId && isLegacyRace(raceCard.raceId)) migrateLegacyRace(raceCard.raceId)
        const initRaceId = raceCard.raceId || ''
        const initRace = initRaceId ? normalizeRace(getRaceById(initRaceId)) : null
        setEditingRaceId(initRaceId)
        setEditingRaceData(initRace || normalizeRace({ name: '' }))
        isNewRaceRef.current = !initRaceId
        setRaceBuffEditorOpen(true)
      }} className={`${selectedRace?.subraces?.length > 0 ? 'col-span-5' : 'col-span-7'} flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.03] border border-gray-700/40 text-xs text-gray-200 hover:border-dnd-gold/50 transition-colors min-w-0`}>
        <span className="text-gray-400 shrink-0 text-[11px] font-medium">种族</span>
        <span className="truncate text-gray-200">{
          // 优先使用 raceId 匹配的种族名称，customName 仅用于纯自定义种族（无 raceId 或 raceId 无法匹配）
          (raceCard.raceId && selectedRace?.name) 
            ? selectedRace.name 
            : (raceCard.customName || selectedRace?.name || '— 选择种族 —')
        }</span>
        <Pencil size={12} className="text-dnd-gold/60 shrink-0 ml-auto" />
      </button>
      {selectedRace && selectedRace.subraces.length > 0 && (
        <select value={raceCard.subraceId || ''} onChange={(e) => handleSubraceChange(e.target.value)} className="col-span-2 px-2 py-1.5 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50">
          <option value="">— 亚种 —</option>
          {selectedRace.subraces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {/* 背景按钮 */}
      <button type="button" onClick={() => {
        const bgName = backgroundCard.customName || selectedBackground?.name || ''
        const bgDesc = backgroundCard.customDescription || selectedBackground?.description || ''
        setBgEditName(bgName)
        setBgEditDesc(bgDesc)
        setBackgroundBuffEditorOpen(true)
      }} className="col-span-7 flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.03] border border-gray-700/40 text-xs text-gray-200 hover:border-dnd-gold/50 transition-colors min-w-0">
        <span className="text-gray-400 shrink-0 text-[11px] font-medium">背景</span>
        <span className="truncate text-gray-200">{backgroundCard.customName || selectedBackground?.name || '— 选择背景 —'}</span>
        <Pencil size={12} className="text-dnd-gold/60 shrink-0 ml-auto" />
      </button>

      {/* 基础信息行 — 仅在选了种族后渲染，占满 14 列 */}
      {raceCard.raceId && (
        <>
          {/* 体型 / 移速 / 感官 — 只读展示 — 4 + 4 + 6 = 14 */}
          <div className="col-span-4 flex items-center gap-2 bg-white/[0.03] rounded-md border border-gray-700/40 px-2 py-1.5">
            <span className="shrink-0 w-8 text-right text-[11px] text-gray-400 font-medium">体型</span>
            {(selectedRace?.sizeOptions || []).length > 1 ? (
              <select
                value={raceCard.sizeSelected || selectedRace?.sizeDefault || ''}
                onChange={e => onSave({ raceCard: { ...raceCard, sizeSelected: e.target.value } })}
                className="flex-1 min-w-0 bg-transparent border-none text-xs text-gray-200 focus:outline-none focus:ring-0 cursor-pointer"
              >
                {(selectedRace.sizeOptions || []).map(sv => (
                  <option key={sv} value={sv}>{RACE_SIZES.find(s => s.value === sv)?.label || sv}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-gray-200">{RACE_SIZES.find(s => s.value === (raceCard.sizeSelected || selectedRace?.sizeDefault))?.label || selectedRace?.sizeDefault || '—'}</span>
            )}
          </div>
          <div className="col-span-4 flex items-center gap-2 bg-white/[0.03] rounded-md border border-gray-700/40 px-2 py-1.5">
            <span className="shrink-0 w-8 text-right text-[11px] text-gray-400 font-medium">移速</span>
            <span className="text-xs text-gray-200">
              {(() => {
                const sp = selectedRace?.speed || {}
                const subSp = selectedSubrace?.speed || {}
                const walk = Number(subSp.walk ?? sp.walk ?? 30)
                const parts = [`${walk}尺`]
                if (subSp.climb || sp.climb) parts.push(`攀爬 ${subSp.climb ?? sp.climb}尺`)
                if (subSp.swim || sp.swim) parts.push(`游泳 ${subSp.swim ?? sp.swim}尺`)
                if (subSp.fly || sp.fly) parts.push(`飞行 ${subSp.fly ?? sp.fly}尺`)
                return parts.join(' ')
              })()}
            </span>
          </div>
          <div className="col-span-6 flex items-center gap-2 bg-white/[0.03] rounded-md border border-gray-700/40 px-2 py-1.5">
            <span className="shrink-0 w-8 text-right text-[11px] text-gray-400 font-medium">感官</span>
            <span className="text-xs text-gray-200">
              {(() => {
                const dv = Number(selectedSubrace?.darkvision ?? selectedRace?.darkvision ?? 0)
                return dv > 0 ? `黑暗视觉 ${dv}尺` : '无'
              })()}
            </span>
          </div>

          {/* 属性加值分配 — 从种族定义的加值槽生成下拉菜单 */}
          {(() => {
            const raceBonuses = normalizeAbilityScoreBonuses(selectedRace?.abilityScoreBonuses, [])
            const subraceBonuses = normalizeAbilityScoreBonuses(selectedSubrace?.abilityScoreBonuses, [])
            const allSlots = [
              ...raceBonuses.map((b, i) => ({ ...b, source: 'race', slotKey: `race-${i}` })),
              ...subraceBonuses.map((b, i) => ({ ...b, source: 'subrace', slotKey: `sub-${i}` })),
            ]
            if (allSlots.length === 0) return null
            const assignments = raceCard.asiAssignments || []
            const ALL_ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']
            const handleAsiChange = (slotSource, slotIndex, ability) => {
              const existing = [...assignments]
              const slotEntries = existing.filter(a => a.source === slotSource)
              const otherEntries = existing.filter(a => a.source !== slotSource)
              slotEntries[slotIndex] = { source: slotSource, ability }
              onSave({ raceCard: { ...raceCard, asiAssignments: [...otherEntries, ...slotEntries] } })
            }
            const getAvailableKeys = (b) => {
              if (Array.isArray(b.allowedAbilities) && b.allowedAbilities.length > 0) return b.allowedAbilities
              return ALL_ABILITY_KEYS
            }
            const renderHint = (b) => {
              if (!Array.isArray(b.allowedAbilities) || b.allowedAbilities.length === 0) return null
              if (b.allowedAbilities.length === ALL_ABILITY_KEYS.length) return null
              return <span className="text-[9px] text-amber-400/60">限:{b.allowedAbilities.map(k => ABILITY_NAMES_ZH[k]).join(',')}</span>
            }
            return (
              <>
                <span className="col-span-2 text-right text-[11px] text-gray-400 font-medium bg-white/[0.03] rounded-md border border-gray-700/40 px-2 py-1.5">属性加值</span>
                <div className="col-span-12 flex flex-wrap items-center gap-2 bg-white/[0.03] rounded-md border border-gray-700/40 px-2 py-1.5">
                  {raceBonuses.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-500">种族</span>
                      {raceBonuses.map((b, i) => {
                        const current = (assignments.filter(a => a.source === 'race') || [])[i]?.ability || ''
                        const takenByOthers = assignments.filter(a => a.source === 'race').map((a, idx) => idx !== i ? a.ability : null).filter(Boolean)
                        const keys = getAvailableKeys(b)
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <select value={current} onChange={e => handleAsiChange('race', i, e.target.value)}
                              className="px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50">
                              <option value="">+{b.amount} → ?</option>
                              {keys.map(k => (
                                <option key={k} value={k} disabled={takenByOthers.includes(k)}>
                                  +{b.amount} → {ABILITY_NAMES_ZH[k]}
                                </option>
                              ))}
                            </select>
                            {renderHint(b)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {subraceBonuses.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-500">亚种</span>
                      {subraceBonuses.map((b, i) => {
                        const subAssignments = assignments.filter(a => a.source === 'subrace')
                        const current = subAssignments[i]?.ability || ''
                        const takenByOthers = subAssignments.map((a, idx) => idx !== i ? a.ability : null).filter(Boolean)
                        const keys = getAvailableKeys(b)
                        return (
                          <div key={i} className="flex items-center gap-1">
                            <select value={current} onChange={e => handleAsiChange('subrace', i, e.target.value)}
                              className="px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50">
                              <option value="">+{b.amount} → ?</option>
                              {keys.map(k => (
                                <option key={k} value={k} disabled={takenByOthers.includes(k)}>
                                  +{b.amount} → {ABILITY_NAMES_ZH[k]}
                                </option>
                              ))}
                            </select>
                            {renderHint(b)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          })()}

          {/* 不完整种族提示 */}
          {isRaceDefinitionIncomplete(selectedRace) && (
            <div className="text-[10px] text-amber-400/80 bg-amber-500/5 rounded px-2 py-1" style={{ gridColumn: '1 / -1' }}>
              该种族缺少速度/暗视/加值数据，请在种族编辑器中补全
            </div>
          )}
        </>
      )}

      {/* 种族编辑器弹窗 — 左栏种族列表 + 右栏编辑 */}
      {raceBuffEditorOpen && (() => {
        const allRaces = getAllRaces()
        return (
          <>
            <div className="fixed inset-0 bg-black/60" style={{ zIndex: 300 }} onClick={handleRaceEditorCancel} aria-hidden />
            <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-8 overflow-auto" style={{ zIndex: 301 }}>
              <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#1a2332] p-4">
                <div className="flex gap-3" style={{ minHeight: 400 }}>
                  {/* 左栏：种族列表 */}
                  <div className="shrink-0 self-stretch flex flex-col border-r border-white/10 pr-3" style={{ width: 180 }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-dnd-gold-light/80">种族列表</span>
                      <button type="button" onClick={() => {
                        const preId = `race_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
                        const r = addCustomRace({ name: '', id: preId })
                        if (r) {
                          isNewRaceRef.current = true
                          setEditingRaceId(r.id)
                          setEditingRaceData(normalizeRace(r))
                          setRaceListKey((k) => k + 1)
                        }
                      }} className="p-1 rounded text-gray-400 hover:bg-white/10 hover:text-dnd-gold transition-colors" title="新增种族">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div key={raceListKey} className="flex-1 overflow-y-auto space-y-0.5">
                      {allRaces.length === 0 && (
                        <p className="text-[11px] text-gray-500 text-center py-4">暂无种族<br />点击上方 + 添加</p>
                      )}
                      {allRaces.map((r) => (
                        <button key={r.id} type="button"
                          onClick={() => {
                            setEditingRaceId(r.id)
                            setEditingRaceData(normalizeRace(getRaceById(r.id)))
                            isNewRaceRef.current = false
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors truncate ${
                            editingRaceId === r.id
                              ? 'bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/30'
                              : 'text-gray-300 hover:bg-white/5 border border-transparent'
                          }`}>
                          {r.name || '未命名种族'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 右栏：RaceEditorForm */}
                  <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ maxHeight: '85vh' }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-base font-semibold text-dnd-gold-light/90">{editingRaceData?.id ? '编辑种族' : '新建种族'}</h3>
                      <div className="flex items-center gap-1">
                        {editingRaceData?.id && (
                          <button type="button" onClick={() => {
                            if (confirm(`确定删除种族「${editingRaceData.name || '未命名'}」？`)) {
                              removeCustomRace(editingRaceId)
                              const remaining = getAllRaces()
                              if (remaining.length > 0) {
                                setEditingRaceId(remaining[0].id)
                                setEditingRaceData(normalizeRace(remaining[0]))
                              } else {
                                setEditingRaceId('')
                                setEditingRaceData(normalizeRace({ name: '' }))
                              }
                              isNewRaceRef.current = false
                              setRaceListKey((k) => k + 1)
                            }
                          }} className="p-1.5 rounded-lg text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors" title="删除此种族">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button type="button" onClick={handleRaceEditorCancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"><X className="w-5 h-5" /></button>
                      </div>
                    </div>
                    {editingRaceData ? (
                      <RaceEditorForm
                        race={editingRaceData}
                        onChange={setEditingRaceData}
                        onSave={handleRaceEditorSave}
                        onCancel={handleRaceEditorCancel}
                        showSaveButtons
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-xs text-gray-500">请从左侧选择种族，或点击 + 新增</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* 背景编辑器弹窗 */}
      {backgroundBuffEditorOpen && (() => {
        const initialEffects = Array.isArray(backgroundCard.backgroundBuffPatch?.effects) && backgroundCard.backgroundBuffPatch.effects.length ? backgroundCard.backgroundBuffPatch.effects : []
        return (
          <BuffEditorModal
            open
            onClose={() => setBackgroundBuffEditorOpen(false)}
            header={
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-dnd-gold-light/90">{backgroundCard.backgroundId ? '编辑背景' : '创建背景'}</h3>
                  <button type="button" onClick={() => setBackgroundBuffEditorOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">背景</span>
                  <select value={backgroundCard.backgroundId || ''} onChange={(e) => handleBackgroundChange(e.target.value)}
                    className="flex-1 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50">
                    <option value="">— 选择背景 —</option>
                    {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    <option value="custom">自定义背景...</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 shrink-0">名称</span>
                  <input type="text" value={bgEditName} onChange={(e) => setBgEditName(e.target.value)}
                    className="flex-1 px-2 py-1 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-dnd-gold/50"
                    placeholder={selectedBackground?.name || '背景名称'} />
                </div>
                <div>
                  <textarea value={bgEditDesc} onChange={(e) => setBgEditDesc(e.target.value)} rows={18}
                    className="w-full px-2 py-1.5 rounded-md bg-gray-800/50 border border-gray-700/50 text-xs text-gray-300 leading-relaxed whitespace-pre-line resize-y focus:outline-none focus:border-dnd-gold/50"
                    placeholder="背景描述" />
                </div>
                <p className="text-xs text-dnd-text-muted">背景效果</p>
              </div>
            }
            buffFormProps={{
              key: `background-buff-${backgroundCard.backgroundId || 'custom'}`,
              compact: true,
              hideDuration: true,
              charResources: char?.classResources,
              spellSlots: char?.spellSlots,
              charClasses,
              referenceData,
              baseReferenceData,
              formulaContext,
              initial: { source: backgroundCard.backgroundId === 'custom' ? (bgEditName || 'custom-background') : `background-${backgroundCard.backgroundId}`, effects: initialEffects, enabled: backgroundCard.backgroundBuffPatch?.enabled !== false },
              onSave: handleBackgroundBuffSave,
              onClear: handleBackgroundBuffClear,
            }}
          />
        )
      })()}
    </div>
    </>
  )
}

function CreatureSimpleBlock({ char, canEdit, onSave }) {
  const block = char?.creatureStatBlock ?? {}
  const abilities = char?.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  const abilityOrder = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  const mod = (n) => Math.floor((Number(n || 10) - 10) / 2)
  const fmt = (n) => {
    const v = Number(n) || 0
    return `${v >= 0 ? '+' : ''}${v}`
  }
  const setBlock = (patch) => onSave({ creatureStatBlock: { ...block, ...patch } })
  const { cur: hpCur, max: hpMax } = resolveCreatureHpDisplay(char)
  const hpPct = Math.max(0, Math.min(100, Math.round((hpCur / hpMax) * 100)))
  const hpTone = hpPct < 25 ? 'bg-dnd-red' : hpPct < 50 ? 'bg-amber-500' : 'bg-emerald-500/90'
  const setAbility = (key, raw) => {
    const v = Math.max(1, Math.min(30, Number.parseInt(raw, 10) || 10))
    onSave({ abilities: { ...abilities, [key]: v } })
  }

  const lineClass = 'text-[var(--text-main)] text-sm leading-relaxed'
  return (
    <div className="rounded-md border border-[var(--card-border)] bg-[rgba(30,38,50,0.35)] p-3">
      <div className="space-y-2">
        {canEdit ? (
          <>
            <input
              type="text"
              value={char?.name ?? ''}
              onChange={(e) => onSave({ name: e.target.value })}
              className="input-thin w-full text-3xl font-extrabold text-[var(--text-main)]"
              placeholder="生物名称"
            />
            <input
              type="text"
              value={block.typeLine ?? ''}
              onChange={(e) => setBlock({ typeLine: e.target.value })}
              className="input-thin w-full text-[var(--text-muted)]"
              placeholder="例如：大型植物，守序中立"
            />
          </>
        ) : (
          <>
            <h2 className="text-[2rem] leading-tight font-extrabold text-[var(--text-main)]">{char?.name || '未命名生物'}</h2>
            <p className="text-[var(--text-muted)] text-lg">{block.typeLine || '大型植物，守序中立'}</p>
          </>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--card-border)] pt-2">
          <div className={lineClass}>
            <span className="font-bold">AC</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.acText ?? ''}
                onChange={(e) => setBlock({ acText: e.target.value })}
                className="input-thin inline-block h-8 w-28 align-middle"
                placeholder="13"
              />
            ) : (
              <span>{block.acText || '13'}</span>
            )}
          </div>
          <div className={lineClass}>
            <span className="font-bold">先攻</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.initText ?? ''}
                onChange={(e) => setBlock({ initText: e.target.value })}
                className="input-thin inline-block h-8 w-40 align-middle"
                placeholder="+0（10）"
              />
            ) : (
              <span>{block.initText || '+0（10）'}</span>
            )}
          </div>
          <div className={lineClass + ' space-y-1'}>
            <span className="font-bold">HP</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.hpText ?? ''}
                onChange={(e) => setBlock({ hpText: e.target.value })}
                className="input-thin inline-block h-8 w-48 align-middle"
                placeholder="45（6d10+12）"
              />
            ) : (
              <span>{block.hpText || '45（6d10+12）'}</span>
            )}
            <div className="h-1.5 w-full rounded bg-black/30 overflow-hidden">
              <div className={`h-full rounded ${hpTone}`} style={{ width: `${hpPct}%` }} />
            </div>
          </div>
          <div className={lineClass}>
            <span className="font-bold">速度</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.speedText ?? ''}
                onChange={(e) => setBlock({ speedText: e.target.value })}
                className="input-thin inline-block h-8 w-40 align-middle"
                placeholder="30尺"
              />
            ) : (
              <span>{block.speedText || '30尺'}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-[var(--card-border)] pt-2">
          {abilityOrder.map((k) => (
            <div key={k} className="rounded bg-white/5 px-2 py-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold">{ABILITY_NAMES_ZH[k]}</span>
                {canEdit ? (
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={Number(abilities?.[k] ?? 10)}
                    onChange={(e) => setAbility(k, e.target.value)}
                    className="input-thin h-7 w-14 px-1 text-center font-mono"
                    aria-label={`${ABILITY_NAMES_ZH[k]}属性值`}
                  />
                ) : (
                  <span className="font-mono">{Number(abilities?.[k] ?? 10)}</span>
                )}
                <span className="font-mono">{fmt(mod(abilities?.[k]))}</span>
                <span className="font-mono">{fmt(mod(abilities?.[k]))}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-[var(--card-border)] pt-2">
          <div className={lineClass}>
            <span className="font-bold">感官</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.sensesText ?? ''}
                onChange={(e) => setBlock({ sensesText: e.target.value })}
                className="input-thin inline-block h-8 w-[34rem] align-middle max-w-full"
                placeholder="黑暗视觉120尺；被动察觉12"
              />
            ) : (
              <span>{block.sensesText || '黑暗视觉120尺；被动察觉12'}</span>
            )}
          </div>
          <div className={lineClass}>
            <span className="font-bold">语言</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.languagesText ?? ''}
                onChange={(e) => setBlock({ languagesText: e.target.value })}
                className="input-thin inline-block h-8 w-[34rem] align-middle max-w-full"
                placeholder="心灵感应240尺"
              />
            ) : (
              <span>{block.languagesText || '—'}</span>
            )}
          </div>
          <div className={lineClass}>
            <span className="font-bold">CR</span>{' '}
            {canEdit ? (
              <input
                type="text"
                value={block.crText ?? ''}
                onChange={(e) => setBlock({ crText: e.target.value })}
                className="input-thin inline-block h-8 w-52 align-middle"
                placeholder="2（XP450；PB+2）"
              />
            ) : (
              <span>{block.crText || '—'}</span>
            )}
          </div>
        </div>

        <div className="space-y-1 border-t border-[var(--card-border)] pt-2">
          <h3 className="text-xl font-bold text-[var(--text-main)]">特质 Traits</h3>
          {canEdit ? (
            <textarea
              value={block.traitsText ?? ''}
              onChange={(e) => setBlock({ traitsText: e.target.value })}
              className="input-thin w-full min-h-[120px] resize-y"
              placeholder="每条特质一段。"
            />
          ) : (
            <p className="whitespace-pre-wrap text-[var(--text-main)] text-lg leading-relaxed">{block.traitsText || '—'}</p>
          )}
        </div>

        <div className="space-y-1 border-t border-[var(--card-border)] pt-2">
          <h3 className="text-xl font-bold text-[var(--text-main)]">动作 Actions</h3>
          {canEdit ? (
            <textarea
              value={block.actionsText ?? ''}
              onChange={(e) => setBlock({ actionsText: e.target.value })}
              className="input-thin w-full min-h-[160px] resize-y"
              placeholder="每条动作一段。"
            />
          ) : (
            <p className="whitespace-pre-wrap text-[var(--text-main)] text-lg leading-relaxed">{block.actionsText || '—'}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** 经验与等级：进度条 + 现有经验/经验等级；剧情等级可手动输入。仅两种字号：普通文案 / 重点文案；排版紧凑。 */
function ExperienceLevelSection({ char, level, canEdit, onSave }) {
  const [xpInput, setXpInput] = useState('')
  const addXP = (raw) => {
    const n = Number(raw)
    if (isNaN(n) || n === 0) return
    const next = Math.max(0, (char.xp ?? 0) + n)
    onSave({ xp: next })
    setXpInput('')
  }
  const expLevel = Math.max(1, level)
  const xp = char.xp ?? 0
  const xpCur = xpForLevel(expLevel)
  const xpNext = expLevel >= 20 ? xpCur : xpForLevel(expLevel + 1)
  const xpProgress = expLevel >= 20 ? 1 : (xpNext > xpCur ? (xp - xpCur) / (xpNext - xpCur) : 0)
  const storyLevel = typeof char.storyLevel === 'number' && char.storyLevel >= 1 ? Math.min(20, Math.max(1, char.storyLevel)) : null
  const displayLevel = storyLevel != null && expLevel >= storyLevel ? storyLevel : expLevel
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end">
        <span className="panel-label text-right">经验等级 {expLevel}</span>
        <span className="mx-2 h-4 w-px shrink-0 bg-[var(--card-border)]" aria-hidden />
        <span className="panel-value font-mono">{xp.toLocaleString()}</span>
      </div>
      <div className="xp-progress-track w-full">
        <div className="xp-progress-fill" style={{ width: `${Math.min(100, xpProgress * 100)}%` }} />
      </div>
      {canEdit && (
        <div className="grid grid-cols-[auto_auto_auto_1fr_auto_auto] items-center gap-1">
          <input
            type="number"
            placeholder="经验值（可负）"
            value={xpInput}
            onChange={(e) => setXpInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addXP(e.target.value) }}
            className="panel-input h-8 max-w-[9rem] font-mono shrink-0"
          />
          <button type="button" onClick={() => addXP(xpInput)} className="btn-panel-add shrink-0">
            加入
          </button>
          <button
            type="button"
            onClick={() => { if (window.confirm('是否确定清空总经验？')) onSave({ xp: 0 }) }}
            className="btn-panel-clear shrink-0"
          >
            清空
          </button>
          <div />
          <div className="inline-flex h-8 items-center justify-end gap-1 shrink-0 pr-2 text-right">
            <label className="panel-label shrink-0">剧情等级</label>
            <input
              type="number"
              min={1}
              max={20}
              value={storyLevel ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1))
                onSave({ storyLevel: v })
              }}
              placeholder="可选"
              className={inputClass + ' h-8 w-20 px-2 font-mono text-center'}
            />
          </div>
          <div className="inline-flex h-8 shrink-0 items-center border-l border-[var(--card-border)] pl-2 text-right min-w-[4.5rem]">
            <p className="panel-value font-mono text-2xl sm:text-3xl font-bold leading-tight tabular-nums tracking-tight">lv.{displayLevel}</p>
          </div>
        </div>
      )}
      {!canEdit && (
        <div className="panel-card-compact flex min-h-0 flex-row items-center justify-between gap-2 py-1.5 px-2">
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {storyLevel != null ? (
              <p className="panel-label">剧情等级 {storyLevel}</p>
            ) : (
              <p className="panel-label text-[var(--text-muted)]">剧情等级 未设置</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end justify-center border-l border-[var(--card-border)] pl-2 text-right min-w-[4.5rem]">
            <p className="panel-value font-mono text-2xl sm:text-3xl font-bold leading-tight tabular-nums tracking-tight">lv.{displayLevel}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/** 等级步进器：上下箭头改数值，并限制在 [min, max]（面板内浅灰箭头风格） */
function LevelStepper({ value, onChange, min = 0, max = 20, disabled, compact }) {
  const v = Math.max(min, Math.min(max, Number(value) || 0))
  return (
    <div className={`level-stepper-panel${compact ? ' level-stepper-compact' : ''}`}>
      <button
        type="button"
        disabled={disabled || v <= min}
        onClick={() => onChange(v - 1)}
        aria-label="减少"
      >
        <ChevronDown className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
      <span>{v}</span>
      <button
        type="button"
        disabled={disabled || v >= max}
        onClick={() => onChange(v + 1)}
        aria-label="增加"
      >
        <ChevronUp className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
    </div>
  )
}

/** 职业特性 key */
function featureKey(f) {
  return f.sourceSubclass ? `${f.sourceClass}:${f.sourceSubclass}:${f.id}` : `${f.sourceClass}:${f.id}`
}

/** 是否启用星辰专长槽（繁星模组特供，后续可通过配置关闭） */
const ENABLE_STAR_FEAT_SLOT = true

/** 各职业属性值提升/额外专长的获得等级（未列出的职业视为无 ASI 槽位） */
const CLASS_ASI_LEVELS = {
  // 基础职业（5e 2024）
  野蛮人: [4, 8, 12, 16],
  吟游诗人: [4, 8, 12, 16],
  牧师: [4, 8, 12, 16],
  德鲁伊: [4, 8, 12, 16],
  战士: [4, 6, 8, 12, 14, 16],
  武僧: [4, 8, 12, 16],
  圣武士: [4, 8, 12, 16],
  游侠: [4, 8, 12, 16],
  游荡者: [4, 8, 10, 12, 16],
  术士: [4, 8, 12, 16],
  魔契师: [4, 8, 12, 16],
  法师: [4, 8, 12, 16],
  奇械师: [4, 8, 12, 16, 19],
  // 繁星基础职业
  狂念者: [4, 8, 12, 16, 19],
  火铳手: [4, 8, 12, 16, 19],
  魂灵学者: [4, 8, 12, 16, 19],
  器魂术士: [4, 8, 12, 16, 20],
  武道家: [4, 8, 12, 16],
  // 繁星进阶职业
  圣魂之刃: [4, 8],
  岚御法师: [4, 8],
  斯兰亲卫: [2],
  无相影门: [3, 7],
}

/** 各职业灵能专长槽获得等级（繁星模组特供） */
const CLASS_PSIONIC_FEAT_LEVELS = {
  魂灵学者: [5, 9, 15, 20],
}

/** 根据角色职业与总等级，计算应获得的专长槽位 */
export function computeFeatSlots(character, totalLevel) {
  const slots = []
  if (totalLevel >= 1) {
    slots.push({ id: 'origin', level: 1, sourceClass: '', category: '起源专长', label: '1级' })
  }
  const classes = getCharacterClasses(character)
  for (const { name, level } of classes) {
    const data = getClassData(name)
    if (!data) continue

    // 属性值提升（通用专长）槽位
    let asiLevels = CLASS_ASI_LEVELS[name] || []
    // 自定义职业回退：扫描特性中名为「属性值提升/属性提升/额外专长」的等级
    if (asiLevels.length === 0 && data?.features) {
      const seen = new Set()
      for (const f of data.features) {
        if (/^(属性值提升|属性提升|额外专长)$/.test(f.name)) {
          seen.add(f.level)
        }
      }
      asiLevels = [...seen]
    }
    for (const asiLevel of asiLevels) {
      if (level >= asiLevel) {
        slots.push({
          id: `asi_${name}_${asiLevel}`,
          level: asiLevel,
          sourceClass: name,
          category: '通用专长',
          label: `${name}${asiLevel}级`,
        })
      }
    }

    // 灵能专长槽位（繁星模组特供）
    const psionicLevels = CLASS_PSIONIC_FEAT_LEVELS[name] || []
    for (const psionicLevel of psionicLevels) {
      if (level >= psionicLevel) {
        slots.push({
          id: `psionic_${name}_${psionicLevel}`,
          level: psionicLevel,
          sourceClass: name,
          category: '灵能专长',
          label: `${name}${psionicLevel}级`,
        })
      }
    }

    // 传奇恩惠槽位
    if (data.features) {
      for (const f of data.features) {
        if (f.name === '传奇恩惠' && level >= f.level) {
          slots.push({
            id: `legendary_${name}_${f.level}`,
            level: f.level,
            sourceClass: name,
            category: '传奇恩惠',
            label: `${name}${f.level}级`,
          })
        }
      }
    }
  }
  if (ENABLE_STAR_FEAT_SLOT) {
    const starLevels = [5, 10, 15, 20]
    for (const starLevel of starLevels) {
      if (totalLevel >= starLevel) {
        slots.push({
          id: starLevel === 5 ? 'star' : `star_${starLevel}`,
          level: starLevel,
          sourceClass: '',
          category: '星辰专长',
          label: `${starLevel}级 ★`,
        })
      }
    }
  }
  // 按等级、再按槽位 id 稳定排序
  slots.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
  return slots
}

/** 将旧 selectedFeats 与自动计算的槽位同步；保留原 BUFF patch */
export function syncFeatsWithSlots(rawFeats, slots) {
  const featById = new Map(FEATS.map((x) => [x.id, x]))
  const normalized = (rawFeats || []).map((f) => {
    const featId = f?.featId ?? f?.id ?? ''
    const feat = featById.get(featId)
    return {
      slotId: f?.slotId || null,
      featId,
      level: f?.level === '' || f?.level == null ? '' : Math.max(1, Math.min(20, Number(f.level) || 1)),
      sourceClass: f?.sourceClass ?? '',
      category: feat?.category || '',
      featBuffPatch: f?.featBuffPatch,
    }
  })

  const slotIds = new Set(slots.map((s) => s.id))
  const assigned = new Map()

  // 1. 保留已分配且 slotId 仍有效的条目
  for (const f of normalized) {
    if (f.slotId && slotIds.has(f.slotId) && !assigned.has(f.slotId)) {
      assigned.set(f.slotId, f)
    }
  }

  // 2. 为未分配的槽位寻找匹配的旧条目（按 category 匹配）
  const usedFeatIds = new Set([...assigned.values()].map((f) => f.featId))
  for (const slot of slots) {
    if (assigned.has(slot.id)) continue
    const candidateIdx = normalized.findIndex(
      (f) => !f.slotId && !usedFeatIds.has(f.featId) && f.category === slot.category && f.featId,
    )
    if (candidateIdx !== -1) {
      const candidate = normalized[candidateIdx]
      usedFeatIds.add(candidate.featId)
      assigned.set(slot.id, candidate)
    }
  }

  // 3. 构建新的 selectedFeats
  const next = []
  for (const slot of slots) {
    const existing = assigned.get(slot.id)
    if (existing) {
      const row = {
        slotId: slot.id,
        featId: existing.featId,
        level: slot.level,
        sourceClass: slot.sourceClass,
      }
      if (existing.featBuffPatch != null && typeof existing.featBuffPatch === 'object') {
        row.featBuffPatch = existing.featBuffPatch
      }
      next.push(row)
    } else {
      next.push({ slotId: slot.id, featId: '', level: slot.level, sourceClass: slot.sourceClass })
    }
  }

  // 4. 保留未匹配的自由条目（主要是额外传奇专长），按 featId 去重
  //    只保留当前 FEATS 中真实存在的 ID，过滤掉旧数据残留或无效条目
  const freeFeatIds = new Set()
  for (const f of normalized) {
    if (!f.slotId || !slotIds.has(f.slotId)) {
      if (f.featId && featById.has(f.featId) && !freeFeatIds.has(f.featId)) {
        freeFeatIds.add(f.featId)
        const row = { featId: f.featId, level: f.level, sourceClass: f.sourceClass }
        if (f.featBuffPatch != null && typeof f.featBuffPatch === 'object') {
          row.featBuffPatch = f.featBuffPatch
        }
        next.push(row)
      }
    }
  }

  return next
}

function mergeSelectedInvocations(current, nextIds) {
  const pool = (current || []).map((x) => {
    const invocationId = typeof x === 'string' ? x : (x?.invocationId ?? x?.id ?? '')
    return {
      invocationId,
      patch: typeof x === 'string' ? undefined : x?.invocationBuffPatch,
    }
  })
  const used = new Set()
  return nextIds.map((id) => {
    const idx = pool.findIndex((p, i) => p.invocationId === id && !used.has(i))
    if (idx >= 0) {
      used.add(idx)
      return pool[idx].patch
        ? { invocationId: id, invocationBuffPatch: pool[idx].patch }
        : { invocationId: id }
    }
    return { invocationId: id }
  })
}

function mergeSelectedFightingStyles(current, nextIds, sourceFeatureId, sourceClass) {
  const pool = (current || []).map((x) => {
    const styleId = typeof x === 'string' ? x : (x?.styleId ?? x?.id ?? '')
    return {
      styleId,
      sourceFeatureId: typeof x === 'string' ? '' : (x?.sourceFeatureId ?? ''),
      sourceClass: typeof x === 'string' ? '' : (x?.sourceClass ?? ''),
      patch: typeof x === 'string' ? undefined : x?.styleBuffPatch,
    }
  })
  const used = new Set()
  return nextIds.map((id) => {
    const idx = pool.findIndex(
      (p, i) => p.styleId === id && p.sourceFeatureId === sourceFeatureId && !used.has(i),
    )
    if (idx >= 0) {
      used.add(idx)
      return pool[idx].patch
        ? { styleId: id, sourceFeatureId, sourceClass, styleBuffPatch: pool[idx].patch }
        : { styleId: id, sourceFeatureId, sourceClass }
    }
    return { styleId: id, sourceFeatureId, sourceClass }
  })
}

function getMaxInvocationsByWarlockLevel(level) {
  if (level >= 18) return 7
  if (level >= 15) return 6
  if (level >= 12) return 5
  if (level >= 9) return 4
  if (level >= 5) return 3
  if (level >= 2) return 2
  if (level >= 1) return 1
  return 0
}

/** 魔能祈唤：在「魔能祈唤」特性卡片内提供选择器与已选列表 */
function EldritchInvocationsBlock({ char, canEdit, onSave, moduleId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const selected = char?.selectedInvocations ?? []
  const byId = useMemo(() => new Map(ELDRITCH_INVOCATIONS.map((x) => [x.id, x])), [])
  const selectedIds = selected.map((x) =>
    typeof x === 'string' ? x : (x?.invocationId ?? x?.id ?? ''),
  )

  const warlockLevel = useMemo(() => {
    const classes = getCharacterClasses(char)
    return classes.find((c) => c.name === '魔契师')?.level ?? 0
  }, [char])
  const maxInvocations = getMaxInvocationsByWarlockLevel(warlockLevel)
  const selectedCount = selected.length

  const handleConfirm = (ids) => {
    const next = mergeSelectedInvocations(char?.selectedInvocations, ids)
    onSave({ selectedInvocations: next })
  }

  return (
    <div className="mt-3 border-t border-gray-600/35 pt-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-dnd-text-muted">已习得魔能祈唤</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-white/10 text-gray-300 hover:bg-white/15 border border-white/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            选择魔能祈唤
          </button>
        )}
      </div>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((x, i) => {
            const id = typeof x === 'string' ? x : (x?.invocationId ?? x?.id ?? '')
            const inv = byId.get(id)
            return (
              <span
                key={`${id}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/10 bg-[#243147]/60 text-xs text-gray-200"
                title={inv?.description ?? ''}
              >
                {inv?.name ?? id}
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-gray-500 text-xs">未选择魔能祈唤</p>
      )}
      <EldritchInvocationPicker
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        selectedIds={selectedIds}
        warlockLevel={warlockLevel}
        maxInvocations={maxInvocations}
        selectedCount={selectedCount}
        moduleId={moduleId}
      />
    </div>
  )
}

/** 判断某职业特性是否属于战斗风格选择器 */
const FIGHTING_STYLE_FEATURE_IDS = new Set([
  'fighting_style',
  'fighting_style_paladin',
  'fighting_style_ranger',
  'additional_fighting_style',
])

function getFightingStyleFeatureLabel(featureId, sourceClass) {
  if (featureId === 'additional_fighting_style') return `${sourceClass} · 额外战斗风格`
  return `${sourceClass} · 战斗风格`
}

function FightingStylesBlock({ char, feature, canEdit, onSave, moduleId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const sourceFeatureId = feature.id
  const sourceClass = feature.sourceClass ?? ''
  const selected = useMemo(
    () => (char?.selectedFightingStyles ?? []).filter((x) => x?.sourceFeatureId === sourceFeatureId),
    [char?.selectedFightingStyles, sourceFeatureId],
  )
  const byId = useMemo(() => new Map(FIGHTING_STYLES.map((x) => [x.id, x])), [])
  const selectedIds = selected.map((x) => x?.styleId ?? x?.id ?? '')
  const maxStyles = feature.id === 'additional_fighting_style' ? 1 : 1

  const handleConfirm = (ids) => {
    const currentAll = char?.selectedFightingStyles ?? []
    const other = currentAll.filter((x) => (x?.sourceFeatureId ?? '') !== sourceFeatureId)
    const nextForThis = mergeSelectedFightingStyles(selected, ids, sourceFeatureId, sourceClass)
    onSave({ selectedFightingStyles: [...other, ...nextForThis] })
  }

  return (
    <div className="mt-2 border-t border-gray-600/35 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.length > 0 ? (
          selected.map((x, i) => {
            const id = x?.styleId ?? x?.id ?? ''
            const style = byId.get(id)
            return (
              <span
                key={`${id}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/10 bg-[#243147]/60 text-[11px] text-gray-200"
                title={style?.description ?? ''}
              >
                {style ? style.name : id}
              </span>
            )
          })
        ) : (
          <span className="text-gray-500 text-[11px]">未选择</span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-gray-400 hover:text-dnd-gold hover:bg-white/5 transition-colors"
            title="选择战斗风格"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      <FightingStylePicker
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirm}
        selectedIds={selectedIds}
        maxStyles={maxStyles}
        sourceName={getFightingStyleFeatureLabel(feature.id, sourceClass)}
        moduleId={moduleId}
      />
    </div>
  )
}

/** 职业特性动作按钮：根据 BUFF 配置渲染充能使用等按钮（含确认弹窗 + 效果处理） */
function ClassFeatureActions({ feature, moduleId, char, onSave }) {
  const [lastResult, setLastResult] = useState(null)
  const [useChargeValue, setUseChargeValue] = useState(null)
  const [useActiveAbility, setUseActiveAbility] = useState(null)

  const buffKey = buildClassFeatureBuffKey(feature.sourceClass, feature.sourceSubclass, feature.id)

  /* ── 主动释放按钮（统一从 card.buffEffects 读取 charge_item）── */
  const classes = getCharacterClasses(char)
  const cls = classes.find((c) => c.name === feature.sourceClass)
  const classLevel = cls?.level || 1
  const subclass = cls?.subclass || ''
  const cards = buildCardsFromCharacter(char, moduleId)
  // 查找对应的卡
  const featureCard = cards.find(c =>
    c.slotKind === 'class' &&
    c.sourceKey === `${feature.sourceClass}|${feature.sourceSubclass || ''}|${feature.id}`
  )
  // 优先从卡读取 charge_item 效果
  let chargeEffects = featureCard && Array.isArray(featureCard.buffEffects)
    ? featureCard.buffEffects.filter((e) => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')
    : []
  // 回退：卡没有时从 defaultPatch 读取（兼容旧数据）
  if (chargeEffects.length === 0) {
    const defaultPatch = loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)
    const effects = Array.isArray(defaultPatch?.effects) ? defaultPatch.effects : []
    chargeEffects = effects.filter((e) => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')
  }

  const getResourceLabel = (resourceType) => {
    return RESOURCE_TYPE_OPTIONS.find((o) => o.value === resourceType)?.label ?? resourceType
  }

  if (chargeEffects.length === 0) return null

  return (
    <div className="space-y-1.5">
      {/* 充能/BUFF 效果按钮 */}
      {chargeEffects.map((chargeEff, idx) => {
        const cv = chargeEff.value
        const charges = cv.charges ?? 0
        const recovery = cv.recovery
        const recoveryLabel = recovery ? formatRecoveryBrief(recovery) : ''
        const resourceType = cv.resourceType || 'charges'
        const resLabel = getResourceLabel(resourceType)

        return (
          <button
            key={idx}
            type="button"
            onClick={() => setUseChargeValue(cv)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md text-sm font-medium bg-dnd-gold/20 hover:bg-dnd-gold/30 text-dnd-gold-light border border-dnd-gold/40 transition-all active:scale-[0.98]"
            title={resourceType === 'charges' ? `${charges} 充能 | ${recoveryLabel}` : `消耗: ${resLabel}`}
          >
            <Zap className="w-4 h-4" />
            使用 {feature.name}
            {resourceType === 'charges' && charges > 0 && (
              <span className="text-xs opacity-80">({charges})</span>
            )}
          </button>
        )
      })}
      {lastResult && (
        <div className="w-full mt-1 text-[11px] text-gray-300 space-y-0.5">
          {lastResult.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* ── 使用确认弹窗（AbilityUseModal） ── */}
      {useChargeValue && (
        <AbilityUseModal
          chargeValue={useChargeValue}
          char={char}
          featureName={feature.name}
          onConfirm={(patch, lines) => {
            if (patch && Object.keys(patch).length > 0) onSave(patch)
            setLastResult({ lines })
          }}
          onClose={() => setUseChargeValue(null)}
        />
      )}

      {/* ── 主动技能确认弹窗 ── */}
      {useActiveAbility && (
        <AbilityUseModal
          activeAbility={useActiveAbility}
          char={char}
          featureName={useActiveAbility.name || feature.name}
          onConfirm={(patch, lines) => {
            if (patch && Object.keys(patch).length > 0) onSave(patch)
            setLastResult({ lines })
          }}
          onClose={() => setUseActiveAbility(null)}
        />
      )}
    </div>
  )
}

/** 职业特性选择块：需要玩家做互斥选择的特性（如原初职能：术师/卫士） */
function ClassFeatureChoiceBlock({ char, feature, canEdit, onSave, modalOpen: externalModalOpen, onOpenModal, hideInline, onEditOptionBuff }) {
  const [internalModalOpen, setInternalModalOpen] = useState(false)
  const modalOpen = externalModalOpen !== undefined ? externalModalOpen : internalModalOpen
  const setModalOpen = onOpenModal || setInternalModalOpen
  const sourceClass = feature.sourceClass ?? ''
  const sourceSubclass = feature.sourceSubclass ?? ''
  const featureId = feature.id
  const buffKey = buildClassFeatureBuffKey(sourceClass, sourceSubclass, featureId)
  const registryEntry = CLASS_FEATURE_CHOICE_REGISTRY[buffKey]

  const chosenOptionId = useMemo(() => {
    const raw = char?.classFeatureChoices?.[featureId] || null
    return CHOICE_ID_ALIASES[raw] || raw
  }, [char?.classFeatureChoices, featureId])

  const chosenOption = useMemo(() => {
    if (!chosenOptionId || !registryEntry) return null
    return registryEntry.options.find((o) => o.id === chosenOptionId) || null
  }, [chosenOptionId, registryEntry])

  if (!registryEntry) return null

  const handleConfirm = (optionId) => {
    const currentChoices = { ...(char?.classFeatureChoices || {}) }
    if (optionId) {
      currentChoices[featureId] = optionId
    } else {
      delete currentChoices[featureId]
    }
    onSave({ classFeatureChoices: currentChoices })
  }

  return (
    <>
      {!hideInline && (
        <div className="mt-2 border-t border-gray-600/35 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {chosenOption ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/10 bg-[#243147]/60 text-[11px] text-gray-200" title={chosenOption.description}>
                {chosenOption.label}
              </span>
            ) : (
              <span className="text-gray-500 text-[11px]">未选择</span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-gray-400 hover:text-dnd-gold hover:bg-white/5 transition-colors"
                title={`选择${registryEntry.label}`}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/60" onClick={() => setModalOpen(false)} aria-hidden />
          <div className="fixed inset-0 z-[301] flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
            <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#1b2738] shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-dnd-gold-light/90">选择{registryEntry.label}</h3>
                  <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">{feature.name} — 选择一项</p>
              </div>
              <div className="p-4 space-y-2">
                {registryEntry.options.map((opt) => (
                  <div
                    key={opt.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      chosenOptionId === opt.id ? 'border-dnd-gold/50 bg-dnd-gold/10' : 'border-white/10'
                    }`}
                  >
                    <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => handleConfirm(opt.id)}>
                      <input
                        type="radio"
                        name={`choice-${featureId}`}
                        checked={chosenOptionId === opt.id}
                        onChange={() => handleConfirm(opt.id)}
                        className="mt-0.5 accent-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{opt.label}</div>
                        {opt.description && <p className="text-xs text-gray-400 mt-1 whitespace-pre-line">{opt.description}</p>}
                      </div>
                    </label>
                    {canEdit && onEditOptionBuff && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditOptionBuff({ feature, optionId: opt.id, optionLabel: opt.label })
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-white/10 hover:text-dnd-gold transition-colors shrink-0"
                        title={`配置 ${opt.label} BUFF 效果`}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-dnd-gold/20 text-dnd-gold-light text-sm hover:bg-dnd-gold/30 transition-colors">
                  确定
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

/** 所有职业的「子职选择」特性 ID 集合 */
const SUBCLASS_SELECTION_FEATURE_IDS = new Set([
  'barbarian_subclass', 'bard_subclass', 'cleric_subclass', 'druid_subclass',
  'fighter_subclass', 'monk_subclass', 'paladin_subclass', 'ranger_subclass',
  'roguish_archetype', 'warlock_subclass', 'wizard_subclass', 'wudao_subclass',
])

/** 职业特性：根据当前职业与等级自动展示，不可手动增删 */
function ClassFeaturesSection({ char, canEdit, onSave, isAdmin, referenceData, baseReferenceData, formulaContext, sheetModuleId, buffPatchRev }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)
  const [expandedFeatureIds, setExpandedFeatureIds] = useState(new Set())
  const [buffEditorFeature, setBuffEditorFeature] = useState(null)
  const [editCardName, setEditCardName] = useState('')
  const [editCardDesc, setEditCardDesc] = useState('')
  const [descEditing, setDescEditing] = useState(false)
  const [buffEditorOption, setBuffEditorOption] = useState(null) // { feature, optionId, optionLabel }
  const [editOptionCardName, setEditOptionCardName] = useState('')
  const [editOptionCardDesc, setEditOptionCardDesc] = useState('')
  const [optionDescEditing, setOptionDescEditing] = useState(false)
  const [choiceModalFeature, setChoiceModalFeature] = useState(null)
  const charClasses = [
    ...(char?.['class'] ? [{ className: char['class'], level: char.classLevel || 1 }] : []),
    ...(Array.isArray(char?.multiclass) ? char.multiclass.filter(m => m['class']).map(m => ({ className: m['class'], level: m.level || 0 })) : []),
  ]
  // 卡名称/描述编辑初始化
  useEffect(() => {
    if (!buffEditorFeature) { setEditCardName(''); setEditCardDesc(''); setDescEditing(false); return }
    const bk = buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id)
    const patch = loadDefaultBuffPatch(moduleId, 'classFeature', bk)
    setEditCardName(patch?.cardName || buffEditorFeature.name)
    setEditCardDesc(patch?.cardDescription || buffEditorFeature.description || '')
  }, [buffEditorFeature?.id, moduleId])
  // 选项卡名称/描述编辑初始化
  useEffect(() => {
    if (!buffEditorOption) { setEditOptionCardName(''); setEditOptionCardDesc(''); setOptionDescEditing(false); return }
    const { feature, optionId } = buffEditorOption
    const bk = buildClassFeatureBuffKey(feature.sourceClass, feature.sourceSubclass, feature.id)
    const optBk = `${bk}:${optionId}`
    const patch = loadDefaultBuffPatch(moduleId, 'classFeature', optBk)
    setEditOptionCardName(patch?.cardName || buffEditorOption.optionLabel || feature.name)
    setEditOptionCardDesc(patch?.cardDescription || '')
  }, [buffEditorOption?.optionId, moduleId])
  const toggleFeatureExpand = (key) => {
    setExpandedFeatureIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const available = useMemo(() => {
    const feats = getAvailableFeatures(char)
    // 过滤掉子职选择占位特性（职业等级区域已有子职选择器，此处冗余）
    return feats.filter((f) => !SUBCLASS_SELECTION_FEATURE_IDS.has(f.id))
  }, [char])
  const classFeatureCards = useMemo(() => buildCardsFromCharacter(char, sheetModuleId || moduleId), [char, sheetModuleId, moduleId, buffPatchRev])
  if (available.length === 0) return null
  return (
    <SlotPanel
      title="职业特性"
      count={available.length}
    >
      <ul className="space-y-2">
        {available.map((f) => {
          const key = featureKey(f)
          const isExpanded = expandedFeatureIds.has(key)
          const name = resolveRuleText(
            overridesMap,
            f.sourceSubclass
              ? buildSubclassFeatureNameKey(f.sourceClass, f.sourceSubclass, f.id)
              : buildClassFeatureNameKey(f.sourceClass, f.id),
            f.name,
          )
          const descText = resolveRuleText(
            overridesMap,
            f.sourceSubclass
              ? buildSubclassFeatureKey(f.sourceClass, f.sourceSubclass, f.id)
              : buildClassFeatureKey(f.sourceClass, f.id),
            f.description,
          )
          const isChoiceType = !!CLASS_FEATURE_CHOICE_REGISTRY[buildClassFeatureBuffKey(f.sourceClass, f.sourceSubclass, f.id)]
          const cfBuffKey = buildClassFeatureBuffKey(f.sourceClass, f.sourceSubclass, f.id)
          const cfPatch = loadDefaultBuffPatch(moduleId, 'classFeature', cfBuffKey)
          const cfScope = cfPatch?.cardScope
          const cfScopeLabel = cfScope?.type && cfScope.type !== 'global'
            ? (SCOPE_TYPE_OPTIONS.find(o => o.value === cfScope.type)?.label || cfScope.type)
            : null
          // 选择型特性的已选选项（用于在标题区显示）
          const choiceRegistryEntry = isChoiceType ? CLASS_FEATURE_CHOICE_REGISTRY[cfBuffKey] : null
          const chosenOptionId = char?.classFeatureChoices?.[f.id] || null
          const chosenOption = choiceRegistryEntry && chosenOptionId
            ? choiceRegistryEntry.options.find((o) => o.id === chosenOptionId)
            : null
          // 护盾池检测（统一从 card.buffEffects 查找，包含所有来源的效果）
          const cfCard = classFeatureCards.find(c =>
            c.slotKind === 'class' && c.sourceKey === `${f.sourceClass}|${f.sourceSubclass || ''}|${f.id}`
          )
          const cfShieldPoolEffect = cfCard && Array.isArray(cfCard.buffEffects)
            ? cfCard.buffEffects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
            : null
          const cfShieldPoolKey = `classFeature:${cfBuffKey}`
          const cfShieldCurrent = cfShieldPoolEffect
            ? getShieldPoolCurrent(char, 'classFeature', cfBuffKey, cfShieldPoolEffect.value.max || 10)
            : null
          return (
            <li key={key}>
              <CardView
                name={
                  <InfoTooltip
                    content={
                      <ClassFeatureTooltipContent
                        feature={{
                          name,
                          description: descText,
                          level: f.level,
                          sourceClass: f.sourceClass,
                          sourceSubclass: f.sourceSubclass,
                          id: f.id,
                        }}
                      />
                    }
                    triggerClassName="block"
                  >
                    <span className="text-base font-bold text-white hover:text-gray-100 transition-colors truncate inline-flex items-center gap-2">
                      {isChoiceType && chosenOption ? (
                        <>
                          {name}
                          <span className="shrink-0 inline-flex items-center px-3 py-0.5 rounded border border-white/30 bg-transparent text-white text-sm font-medium">
                            {chosenOption.label}
                          </span>
                        </>
                      ) : (
                        name
                      )}
                    </span>
                  </InfoTooltip>
                }
                subtitle={`${f.sourceClass}${f.sourceSubclass ? `（${f.sourceSubclass}）` : ''} · ${f.level} 级`}
                description={descText}
                expanded={isExpanded}
                onToggleExpand={() => toggleFeatureExpand(key)}
                gridLayout={true}
                headerLeft={
                  <div className="text-left">
                    <div className="text-[11px] text-gray-500 leading-tight">{f.level}级获得</div>
                    <div className="text-[11px] text-gray-500 leading-tight truncate">{f.sourceSubclass || f.sourceClass}</div>
                  </div>
                }
                headerRight={
                  <div className="flex items-center gap-1.5 shrink-0">
                    {cfShieldPoolEffect && (() => {
                      const spVal = cfShieldPoolEffect.value
                      const spMax = Number(spVal.max) || 10
                      const spThreshold = Number(spVal.threshold) || 0
                      return (
                        <ShieldPoolCounter
                          current={cfShieldCurrent}
                          max={spMax}
                          threshold={spThreshold}
                          compact
                          onChange={(v) => {
                            const newState = setShieldPoolCurrent(char, 'classFeature', cfBuffKey, v)
                            onSave({ shieldPoolStates: newState })
                          }}
                        />
                      )
                    })()}
                    {cfScopeLabel && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">{cfScopeLabel}</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isChoiceType) {
                          setChoiceModalFeature(f)
                        } else {
                          setBuffEditorFeature(f)
                        }
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all active:scale-95"
                      title={isChoiceType ? '选择特性选项' : '配置 BUFF 效果'}
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>
                }
                footer={<ClassFeatureActions feature={f} moduleId={moduleId} char={char} onSave={onSave} />}
              >
                {f.id === 'eldritch_invocations' && (
                  <EldritchInvocationsBlock char={char} canEdit={canEdit} onSave={onSave} moduleId={moduleId} />
                )}
                {FIGHTING_STYLE_FEATURE_IDS.has(f.id) && (
                  <FightingStylesBlock char={char} feature={f} canEdit={canEdit} onSave={onSave} moduleId={moduleId} />
                )}
                {CLASS_FEATURE_CHOICE_REGISTRY[buildClassFeatureBuffKey(f.sourceClass, f.sourceSubclass, f.id)] && (
                  <ClassFeatureChoiceBlock
                    char={char}
                    feature={f}
                    canEdit={canEdit}
                    onSave={onSave}
                    onEditOptionBuff={setBuffEditorOption}
                  />
                )}
                {SUBCLASS_SELECTION_FEATURE_IDS.has(f.id) && (() => {
                  const options = getSubclassOptions(f.sourceClass)
                  if (!options.length) return null
                  const isMainClass = f.sourceClass === char['class']
                  const currentSub = isMainClass
                    ? (char.subclass || '')
                    : (char.multiclass?.find(m => m['class'] === f.sourceClass)?.subclass || '')
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)] shrink-0">子职选择：</span>
                      <select
                        value={currentSub}
                        onChange={(e) => {
                          const val = e.target.value
                          if (isMainClass) {
                            onSave({ subclass: val })
                          } else {
                            const mc = [...(char.multiclass || [])]
                            const idx = mc.findIndex(m => m['class'] === f.sourceClass)
                            if (idx >= 0) {
                              mc[idx] = { ...mc[idx], subclass: val }
                              onSave({ multiclass: mc })
                            }
                          }
                        }}
                        className="flex-1 min-w-0 text-sm rounded-md border border-[var(--card-border)] bg-[rgba(30,38,50,0.4)] px-2 py-1 text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                      >
                        <option value="">— 未选择 —</option>
                        {options.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )
                })()}
              </CardView>
            </li>
          )
        })}
      </ul>

      {/* BUFF 编辑器弹窗 */}
      {buffEditorFeature && (
        <BuffEditorModal
          open
          onClose={() => setBuffEditorFeature(null)}
          header={
            <>
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={editCardName}
                  onChange={(e) => setEditCardName(e.target.value)}
                  className="flex-1 text-base font-semibold text-dnd-gold-light/90 bg-transparent border-b border-transparent hover:border-white/20 focus:border-dnd-gold-light/50 focus:outline-none px-1 py-0.5"
                  placeholder="卡名称"
                />
                <button
                  type="button"
                  onClick={() => setBuffEditorFeature(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-dnd-text-muted mt-1">
                {isAdmin
                  ? 'DM 配置默认 BUFF 效果，玩家选择该特性时自动获得。'
                  : '查看该职业特性的 BUFF 效果（只读）。'}
              </p>
              {descEditing ? (
                <textarea
                  value={editCardDesc}
                  onChange={(e) => setEditCardDesc(e.target.value)}
                  rows={3}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line resize-y focus:outline-none focus:border-dnd-gold-light/40"
                  placeholder="卡描述…"
                />
              ) : (
                <div className="mt-2 flex items-start gap-2">
                  <p className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line min-h-[2.5rem]">
                    {editCardDesc || '暂无描述'}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setDescEditing(true)}
                      className="shrink-0 mt-0.5 p-1 rounded text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all"
                      title="编辑描述"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </>
          }
          buffFormProps={{
            key: `cf-buff-${buffEditorFeature.sourceClass}-${buffEditorFeature.sourceSubclass || ''}-${buffEditorFeature.id}`,
            compact: true,
            readOnly: !isAdmin,
            hideDuration: true,
            charResources: char?.classResources,
            spellSlots: char?.spellSlots,
            charClasses,
            referenceData,
            baseReferenceData,
            formulaContext,
            initial: {
              source: `${buffEditorFeature.sourceClass}-${buffEditorFeature.name}`,
              cardName: editCardName,
              cardDescription: editCardDesc,
              effects: (() => {
                const patch = loadDefaultBuffPatch(
                  moduleId,
                  'classFeature',
                  buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id),
                )
                if (patch && Array.isArray(patch.effects) && patch.effects.length) return patch.effects
                const bk = buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id)
                return HARDCODED_CLASS_FEATURE_BUFFS[bk] || []
              })(),
              enabled: (() => {
                const patch = loadDefaultBuffPatch(
                  moduleId,
                  'classFeature',
                  buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id),
                )
                return patch?.enabled !== false
              })(),
              cardScope: (() => {
                const patch = loadDefaultBuffPatch(
                  moduleId,
                  'classFeature',
                  buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id),
                )
                return patch?.cardScope || undefined
              })(),
            },
            onSave: (buff) => {
              saveDefaultBuffPatch(
                moduleId,
                'classFeature',
                buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id),
                {
                  effects: buff.effects,
                  enabled: buff.enabled,
                  sourceName: `${buffEditorFeature.sourceClass}-${buffEditorFeature.name}`,
                  cardScope: buff.cardScope,
                  cardName: editCardName || undefined,
                  cardDescription: editCardDesc || undefined,
                },
              )
              setBuffEditorFeature(null)
            },
            onClear: () => {
              clearDefaultBuffPatch(
                moduleId,
                'classFeature',
                buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id),
              )
              setBuffEditorFeature(null)
            },
          }}
        />
      )}

      {/* 齿轮按钮触发的选择型特性 modal */}
      {choiceModalFeature && (
        <ClassFeatureChoiceBlock
          char={char}
          feature={choiceModalFeature}
          canEdit={canEdit}
          onSave={onSave}
          modalOpen={true}
          onOpenModal={(v) => { if (!v) setChoiceModalFeature(null) }}
          onEditOptionBuff={setBuffEditorOption}
          hideInline
        />
      )}

      {/* 选项专属 BUFF 编辑器弹窗 */}
      {buffEditorOption && (
        <BuffEditorModal
          open
          onClose={() => setBuffEditorOption(null)}
          header={
            <>
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={editOptionCardName}
                  onChange={(e) => setEditOptionCardName(e.target.value)}
                  className="flex-1 text-base font-semibold text-dnd-gold-light/90 bg-transparent border-b border-transparent hover:border-white/20 focus:border-dnd-gold-light/50 focus:outline-none px-1 py-0.5"
                  placeholder="卡名称"
                />
                <button
                  type="button"
                  onClick={() => setBuffEditorOption(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {optionDescEditing ? (
                <textarea
                  value={editOptionCardDesc}
                  onChange={(e) => setEditOptionCardDesc(e.target.value)}
                  rows={3}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line resize-y focus:outline-none focus:border-dnd-gold-light/40"
                  placeholder="卡描述…"
                />
              ) : (
                <div className="mt-2 flex items-start gap-2">
                  <p className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line min-h-[2.5rem]">
                    {editOptionCardDesc || '暂无描述'}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setOptionDescEditing(true)}
                      className="shrink-0 mt-0.5 p-1 rounded text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all"
                      title="编辑描述"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </>
          }
          buffFormProps={{
            key: `cf-opt-buff-${buffEditorOption.feature.sourceClass}-${buffEditorOption.feature.sourceSubclass || ''}-${buffEditorOption.feature.id}-${buffEditorOption.optionId}`,
            compact: true,
            readOnly: !isAdmin,
            hideDuration: true,
            charResources: char?.classResources,
            spellSlots: char?.spellSlots,
            charClasses,
            referenceData,
            baseReferenceData,
            formulaContext,
            initial: {
              source: `${buffEditorOption.feature.sourceClass}-${buffEditorOption.feature.name}（${buffEditorOption.optionLabel}）`,
              cardName: editOptionCardName,
              cardDescription: editOptionCardDesc,
              effects: (() => {
                const optBuffKey = buildClassFeatureOptionBuffKey(
                  buffEditorOption.feature.sourceClass,
                  buffEditorOption.feature.sourceSubclass,
                  buffEditorOption.feature.id,
                  buffEditorOption.optionId,
                )
                const dmPatch = loadDefaultBuffPatch(moduleId, 'classFeature', optBuffKey)
                if (dmPatch && Array.isArray(dmPatch.effects) && dmPatch.effects.length) {
                  return dmPatch.effects
                }
                const buffKey = buildClassFeatureBuffKey(
                  buffEditorOption.feature.sourceClass,
                  buffEditorOption.feature.sourceSubclass,
                  buffEditorOption.feature.id,
                )
                const registryEntry = CLASS_FEATURE_CHOICE_REGISTRY[buffKey]
                if (registryEntry) {
                  const opt = registryEntry.options.find((o) => o.id === buffEditorOption.optionId)
                  if (opt && typeof registryEntry.getEffects === 'function') {
                    return registryEntry.getEffects(opt.id) || []
                  }
                }
                return []
              })(),
              enabled: loadDefaultBuffPatch(
                moduleId,
                'classFeature',
                buildClassFeatureOptionBuffKey(
                  buffEditorOption.feature.sourceClass,
                  buffEditorOption.feature.sourceSubclass,
                  buffEditorOption.feature.id,
                  buffEditorOption.optionId,
                ),
              )?.enabled !== false,
              cardScope: loadDefaultBuffPatch(
                moduleId,
                'classFeature',
                buildClassFeatureOptionBuffKey(
                  buffEditorOption.feature.sourceClass,
                  buffEditorOption.feature.sourceSubclass,
                  buffEditorOption.feature.id,
                  buffEditorOption.optionId,
                ),
              )?.cardScope || undefined,
            },
            onSave: (buff) => {
              saveDefaultBuffPatch(
                moduleId,
                'classFeature',
                buildClassFeatureOptionBuffKey(
                  buffEditorOption.feature.sourceClass,
                  buffEditorOption.feature.sourceSubclass,
                  buffEditorOption.feature.id,
                  buffEditorOption.optionId,
                ),
                {
                  effects: buff.effects,
                  enabled: buff.enabled,
                  sourceName: `${buffEditorOption.feature.sourceClass}-${buffEditorOption.feature.name}（${buffEditorOption.optionLabel}）`,
                  cardScope: buff.cardScope,
                  cardName: editOptionCardName || undefined,
                  cardDescription: editOptionCardDesc || undefined,
                },
              )
              setBuffEditorOption(null)
            },
          }}
        />
      )}
    </SlotPanel>
  )
}

/** 根据专长分类生成「…列表」文案（如 通用专长 → 通用专长列表） */
function featListLabelFromCategory(category) {
  if (category && String(category).trim()) return `${category}列表`
  return '专长列表'
}

/** 在{职业}职业等级为{n}时，从{分类}列表中选取 */
function formatFeatAcquisitionSentence(sourceClass, level, category) {
  const cls = (sourceClass || '').trim()
  const lv = Math.max(1, Math.min(20, Number(level) ?? 1))
  const listPart = featListLabelFromCategory(category)
  if (cls) return `在${cls}职业等级为${lv}时，从${listPart}中选取`
  return `职业等级为${lv}时，从${listPart}中选取（未指定获得职业）`
}

/** 专长：按自动计算的槽位展示，每个槽位从指定分类中选取；额外传奇专长可自由添加 */
function FeatsSection({ char, level, canEdit, onSave, formulaContext, sheetModuleId, buffPatchRev, referenceData, baseReferenceData }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)
  const [expandedFeatIds, setExpandedFeatIds] = useState(new Set())
  const [featBuffEditor, setFeatBuffEditor] = useState(null) // { row, slot } for feat BUFF editor
  const [featActiveAbility, setFeatActiveAbility] = useState(null) // active ability for AbilityUseModal
  const charClasses = [
    ...(char?.['class'] ? [{ className: char['class'], level: char.classLevel || 1 }] : []),
    ...(Array.isArray(char?.multiclass) ? char.multiclass.filter(m => m['class']).map(m => ({ className: m['class'], level: m.level || 0 })) : []),
  ]
  const toggleFeatExpand = (featId) => {
    setExpandedFeatIds((prev) => {
      const next = new Set(prev)
      if (next.has(featId)) next.delete(featId)
      else next.add(featId)
      return next
    })
  }

  const slots = useMemo(() => computeFeatSlots(char, level), [char, level])
  const featById = useMemo(() => new Map(FEATS.map((x) => [x.id, x])), [])

  // 深度比较（忽略对象键序），避免 JSON.stringify 因键序不同产生误判
  const deepEqual = (a, b) => {
    if (a === b) return true
    if (a == null || b == null) return a === b
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (typeof a !== 'object' || typeof b !== 'object') return false
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false
      return a.every((v, i) => deepEqual(v, b[i]))
    }
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => keysB.includes(k) && deepEqual(a[k], b[k]))
  }

  // 自动将旧 selectedFeats 同步到槽位体系；原 featBuffPatch 会被保留
  useEffect(() => {
    const raw = char?.selectedFeats ?? []
    const synced = syncFeatsWithSlots(raw, slots)
    if (!deepEqual(synced, raw)) {
      onSave({ selectedFeats: synced })
    }
  }, [char?.selectedFeats, slots, onSave])

  const selectedFeats = char?.selectedFeats ?? []

  const slotRows = useMemo(() => {
    return slots.map((slot) => {
      const row = selectedFeats.find((f) => f?.slotId === slot.id) || {
        slotId: slot.id,
        featId: '',
        level: slot.level,
        sourceClass: slot.sourceClass,
      }
      return { slot, row }
    })
  }, [slots, selectedFeats])

  const freeRows = useMemo(() => {
    return selectedFeats.filter((f) => !f?.slotId && f?.featId)
  }, [selectedFeats])

  const allSelectedIds = useMemo(
    () => new Set(selectedFeats.map((f) => f?.featId).filter(Boolean)),
    [selectedFeats],
  )

  const [pickerState, setPickerState] = useState({ open: false, slotId: null, category: '' })
  const openPickerForSlot = (slot) => setPickerState({ open: true, slotId: slot.id, category: slot.category })
  const openPickerForExtra = () => setPickerState({ open: true, slotId: 'extra', category: '' })
  const closePicker = () => setPickerState({ open: false, slotId: null, category: '' })

  const handlePick = ({ featId, effects = [] }) => {
    if (!featId) return
    const raw = char?.selectedFeats ?? []
    let next
    if (pickerState.slotId === 'extra') {
      const row = {
        featId,
        level: level || 19,
        sourceClass: '',
        category: '额外专长',
      }
      if (effects.length > 0) row.featBuffPatch = { effects }
      next = [...raw, row]
    } else {
      next = raw.map((f) => {
        if (f?.slotId !== pickerState.slotId) return f
        const slot = slots.find((s) => s.id === pickerState.slotId)
        const updated = {
          ...f,
          featId,
          level: slot?.level ?? f?.level ?? 1,
          sourceClass: slot?.sourceClass ?? f?.sourceClass ?? '',
        }
        if (effects.length > 0) {
          updated.featBuffPatch = { effects }
        } else if (updated.featBuffPatch != null) {
          delete updated.featBuffPatch
        }
        return updated
      })
    }
    onSave({ selectedFeats: next })
    closePicker()
  }

  const clearSlot = (slotId) => {
    const raw = char?.selectedFeats ?? []
    const next = raw.map((f) => (f?.slotId === slotId ? { ...f, featId: '' } : f))
    onSave({ selectedFeats: next })
  }

  const removeFreeFeat = (freeIndex) => {
    const raw = char?.selectedFeats ?? []
    const freeIndices = raw
      .map((f, i) => (!f?.slotId && f?.featId ? i : -1))
      .filter((i) => i !== -1)
    const rawIndex = freeIndices[freeIndex]
    if (rawIndex == null) return
    const next = raw.filter((_, i) => i !== rawIndex)
    onSave({ selectedFeats: next })
  }

  const filledSlots = slotRows.filter(({ row }) => row?.featId).length
  const totalFeats = filledSlots + freeRows.length

  // 构建一次卡数组，供所有专长查找主动技能复用（使用 sheetModuleId 与 allCards 保持一致）
  const featCards = useMemo(() => buildCardsFromCharacter(char, sheetModuleId), [char, sheetModuleId, buffPatchRev])

  const FeatTypeTag = ({ category }) => {
    if (!category) return null
    // 星辰专长用金色星标，其他不显示（slot.label 已包含分类信息）
    if (category === '星辰专长') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-dnd-gold/30 to-dnd-gold/10 text-dnd-gold-light border border-dnd-gold/50">
          <Star className="w-3 h-3 fill-current mr-0.5" />
          星辰
        </span>
      )
    }
    return null
  }

  return (
    <SlotPanel
      title="已获专长"
      count={totalFeats}
      headerActions={canEdit ? (
        <button
          type="button"
          onClick={openPickerForExtra}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-700/50 text-gray-300 hover:bg-gray-600/60 hover:text-white border border-gray-600/50 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          额外添加专长
        </button>
      ) : null}
    >

      {slots.length === 0 && freeRows.length === 0 ? (
        <p className="text-gray-500 text-xs py-2">当前等级暂无专长槽位。</p>
      ) : (
        <ul className="space-y-2">
          {slotRows.map(({ slot, row }) => {
            const feat = featById.get(row?.featId)
            const legacyStyle = !feat ? getFightingStyleById(row.featId) : null
            const name = resolveRuleText(
              overridesMap,
              buildFeatNameKey(row?.featId),
              feat?.name ?? legacyStyle?.name ?? row?.featId,
            )
            const category = feat?.category || (legacyStyle ? '旧版战斗风格' : slot.category)
            const isExpanded = expandedFeatIds.has(row?.featId)
            const hasDescription = Boolean(feat?.description)
            const hasActiveAbility = row?.featId ? (() => {
              const ability = findActiveAbilityForFeat(row.featId, featCards)
              return !!ability
            })() : false

            // 副标题文本
            const subtitleText = row?.featId ? (() => {
              const lvl = row?.level || slot?.level || 1
              const src = row?.sourceClass || slot?.sourceClass || ''
              const cat = row?.category || slot?.category || feat?.category || ''
              const classPart = src ? getClassDisplayName(src) || src : ''
              const categoryPart = cat || '专长'
              return `从${lvl}级${classPart}，获得${categoryPart}`
            })() : (() => {
              const lvl = slot?.level || 1
              const src = slot?.sourceClass || ''
              const cat = slot?.category || ''
              const classPart = src ? getClassDisplayName(src) || src : ''
              const categoryPart = cat || '专长'
              return `从${lvl}级${classPart}，获得${categoryPart}`
            })()

            // 描述文本
            const descText = feat?.description
              ? formatFeatDescriptionForDisplay(
                resolveRuleText(overridesMap, buildFeatDescriptionKey(row.featId), feat.description),
              )
              : legacyStyle
                ? '该条目原属于战斗风格专长，现已迁移到「战斗风格」选择器中。'
                : ''

            // 护盾池检测（统一从 card.buffEffects 查找，包含所有来源的效果）
            const featCard = row?.featId ? featCards.find(c => c.slotKind === 'feat' && c.sourceKey === row.featId) : null
            const featShieldPoolEffect = featCard && Array.isArray(featCard.buffEffects)
              ? featCard.buffEffects.find(e => e.effectType === 'shield_pool' && e.value && typeof e.value === 'object')
              : null
            const featShieldCurrent = featShieldPoolEffect
              ? getShieldPoolCurrent(char, 'feat', row.featId, featShieldPoolEffect.value.max || 10)
              : null

            return (
              <li key={slot.id}>
                <CardView
                  name={row?.featId ? name : ''}
                  subtitle={subtitleText}
                  description={row?.featId && descText ? descText : undefined}
                  expanded={isExpanded}
                  onToggleExpand={() => toggleFeatExpand(row.featId)}
                  headerLeft={row?.featId ? (
                    <InfoTooltip
                      content={
                        <FeatTooltipContent
                          feat={{
                            id: row.featId,
                            name,
                            category,
                            prerequisite: feat?.prerequisite,
                            description: feat?.description
                              ? formatFeatDescriptionForDisplay(
                                resolveRuleText(overridesMap, buildFeatDescriptionKey(row.featId), feat.description),
                              )
                              : legacyStyle
                                ? '该条目原属于战斗风格专长，现已迁移到「战斗风格」选择器中。请点击「更换」或通过对应职业的战斗风格特性重新选择。'
                                : '',
                          }}
                        />
                      }
                      triggerClassName="inline"
                      disabled={!feat && !legacyStyle}
                    >
                      <span
                        className="text-base font-bold text-white cursor-pointer select-none hover:text-gray-100 transition-colors truncate block"
                        onClick={() => toggleFeatExpand(row.featId)}
                      >
                        {name}
                      </span>
                    </InfoTooltip>
                  ) : (
                    <span className="text-sm text-gray-500">{slot.level || 1}级，{slot.category || '专长'}</span>
                  )}
                  headerRight={
                    canEdit && row?.featId ? (() => {
                      const fScope = row.featBuffPatch?.cardScope
                      const fScopeLabel = fScope?.type && fScope.type !== 'global'
                        ? (SCOPE_TYPE_OPTIONS.find(o => o.value === fScope.type)?.label || fScope.type)
                        : null
                      return (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {featShieldPoolEffect && (() => {
                          const spVal = featShieldPoolEffect.value
                          const spMax = Number(spVal.max) || 10
                          const spThreshold = Number(spVal.threshold) || 0
                          return (
                            <ShieldPoolCounter
                              current={featShieldCurrent}
                              max={spMax}
                              threshold={spThreshold}
                              compact
                              onChange={(v) => {
                                const newState = setShieldPoolCurrent(char, 'feat', row.featId, v)
                                onSave({ shieldPoolStates: newState })
                              }}
                            />
                          )
                        })()}
                        {fScopeLabel && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">{fScopeLabel}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setFeatBuffEditor({ row, slot })}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all active:scale-95"
                          title="编辑效果"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openPickerForSlot(slot)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/50 transition-all active:scale-95"
                          title="更换专长"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => clearSlot(slot.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all active:scale-95"
                          title="清除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      )
                    })() : canEdit && !row?.featId ? (
                      <button
                        type="button"
                        onClick={() => openPickerForSlot(slot)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-dnd-gold/15 text-dnd-gold-light hover:bg-dnd-gold/25 border border-dnd-gold/40 transition-all active:scale-95 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        无专长
                      </button>
                    ) : null
                  }
                  footer={row?.featId && hasActiveAbility ? (() => {
                    const ability = findActiveAbilityForFeat(row.featId, featCards)
                    if (!ability) return null
                    const check = canUseAbility(ability, char)
                    const costText = ability.cost.type === 'class_resource'
                      ? `${ability.cost.amount}${({ star_points: '星', wild_shape: '变', second_wind: '气', lay_on_hands: '疗' }[ability.cost.resourceKey] || '')}`
                      : ability.cost.type === 'none' ? '免费' : ''
                    return (
                      <button
                        type="button"
                        disabled={!check.usable}
                        onClick={(e) => {
                          e.stopPropagation()
                          setFeatActiveAbility(ability)
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/30 hover:bg-dnd-gold/30 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        title={check.usable ? `点击使用${ability.name}` : check.reason}
                      >
                        <Zap className="w-3 h-3" />
                        使用 {ability.name}
                        {costText && <span className="text-[10px] opacity-70">{costText}</span>}
                      </button>
                    )
                  })() : undefined}
                >
                  {/* 获取描述 */}
                  {isExpanded && row?.featId && !legacyStyle && (
                    <p className="text-xs text-gray-500 mt-1.5 pt-1.5 border-t border-gray-700/30">
                      {formatFeatAcquisitionSentence(slot.sourceClass, slot.level, category)}
                    </p>
                  )}
                  {isExpanded && legacyStyle && (
                    <p className="text-sm text-dnd-red mt-2 pt-2 border-t border-dnd-red/20 leading-relaxed">
                      该条目原属于「战斗风格专长」，现已独立为职业特性选择器。请清除本槽位后，通过对应职业的「战斗风格」特性重新选择，以获得正确的虚拟 BUFF。
                    </p>
                  )}
                </CardView>
              </li>
            )
          })}

          {freeRows.map((row, i) => {
            const feat = featById.get(row.featId)
            const legacyStyle = !feat ? getFightingStyleById(row.featId) : null
            const name = resolveRuleText(
              overridesMap,
              buildFeatNameKey(row.featId),
              feat?.name ?? legacyStyle?.name ?? row.featId,
            )
            const category = feat?.category || (legacyStyle ? '旧版战斗风格' : row?.category || '')
            const isExpanded = expandedFeatIds.has(row.featId)
            const hasDescription = Boolean(feat?.description)
            const hasActiveAbility = !!findActiveAbilityForFeat(row.featId, featCards)

            // 副标题文本
            const subtitleText = (() => {
              const lvl = row?.level || 1
              const src = row?.sourceClass || ''
              const cat = row?.category || feat?.category || ''
              const classPart = src ? getClassDisplayName(src) || src : ''
              const categoryPart = cat || '专长'
              return `从${lvl}级${classPart}，获得${categoryPart}`
            })()

            // 描述文本
            const descText = feat?.description
              ? formatFeatDescriptionForDisplay(
                resolveRuleText(overridesMap, buildFeatDescriptionKey(row.featId), feat.description),
              )
              : legacyStyle
                ? '该条目原属于战斗风格专长，现已迁移到「战斗风格」选择器中。'
                : ''

            return (
              <li key={`free-${row.featId}-${i}`}>
                <CardView
                  name={name}
                  subtitle={subtitleText}
                  description={descText || undefined}
                  expanded={isExpanded}
                  onToggleExpand={() => toggleFeatExpand(row.featId)}
                  headerLeft={
                    <InfoTooltip
                      content={
                        <FeatTooltipContent
                          feat={{
                            id: row.featId,
                            name,
                            category,
                            prerequisite: feat?.prerequisite,
                            description: feat?.description
                              ? formatFeatDescriptionForDisplay(
                                resolveRuleText(overridesMap, buildFeatDescriptionKey(row.featId), feat.description),
                              )
                              : legacyStyle
                                ? '该条目原属于战斗风格专长，现已迁移到「战斗风格」选择器中。请移除后通过对应职业的战斗风格特性重新选择。'
                                : '',
                          }}
                        />
                      }
                      triggerClassName="inline"
                      disabled={!feat && !legacyStyle}
                    >
                      <span
                        className="text-base font-bold text-white cursor-pointer select-none hover:text-gray-100 transition-colors truncate block"
                        onClick={() => toggleFeatExpand(row.featId)}
                      >
                        {name}
                      </span>
                    </InfoTooltip>
                  }
                  headerRight={
                    canEdit ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => removeFreeFeat(i)}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all active:scale-95"
                          title="移除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : null
                  }
                  footer={hasActiveAbility ? (() => {
                    const ability = findActiveAbilityForFeat(row.featId, featCards)
                    if (!ability) return null
                    const check = canUseAbility(ability, char)
                    const costText = ability.cost.type === 'class_resource'
                      ? `${ability.cost.amount}${({ star_points: '星', wild_shape: '变', second_wind: '气', lay_on_hands: '疗' }[ability.cost.resourceKey] || '')}`
                      : ability.cost.type === 'none' ? '免费' : ''
                    return (
                      <button
                        type="button"
                        disabled={!check.usable}
                        onClick={(e) => {
                          e.stopPropagation()
                          setFeatActiveAbility(ability)
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/30 hover:bg-dnd-gold/30 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        title={check.usable ? `点击使用${ability.name}` : check.reason}
                      >
                        <Zap className="w-3 h-3" />
                        使用 {ability.name}
                        {costText && <span className="text-[10px] opacity-70">{costText}</span>}
                      </button>
                    )
                  })() : undefined}
                >
                  {legacyStyle && (
                    <p className="text-sm text-dnd-red mt-2 pt-2 border-t border-dnd-red/20 leading-relaxed">
                      该条目原属于「战斗风格专长」，现已独立为职业特性选择器。请移除本条目后，通过对应职业的「战斗风格」特性重新选择，以获得正确的虚拟 BUFF。
                    </p>
                  )}
                </CardView>
              </li>
            )
          })}
        </ul>
      )}

      <FeatPickerModal
        isOpen={pickerState.open}
        onClose={closePicker}
        onConfirm={handlePick}
        overridesMap={overridesMap}
        selectedIds={allSelectedIds}
        allowedCategories={pickerState.category ? [pickerState.category] : []}
        moduleId={moduleId}
        formulaContext={formulaContext}
      />

      {/* 专长 BUFF 编辑器弹窗 */}
      {featBuffEditor && (() => {
        const editRow = featBuffEditor.row
        const editFeatId = editRow?.featId
        const featName = featById.get(editFeatId)?.name || editFeatId
        const defaultPatch = loadDefaultBuffPatch(moduleId, 'feat', editFeatId)
        const initialEffects = Array.isArray(editRow?.featBuffPatch?.effects) && editRow.featBuffPatch.effects.length
          ? editRow.featBuffPatch.effects
          : Array.isArray(defaultPatch?.effects) && defaultPatch.effects.length
            ? defaultPatch.effects
            : []
        return (
          <BuffEditorModal
            open
            onClose={() => setFeatBuffEditor(null)}
            title={`编辑专长效果：${featName}`}
            description="自定义该专长的 BUFF 效果，保存后立即生效。"
            buffFormProps={{
              key: `feat-buff-${editFeatId}`,
              compact: true,
              hideDuration: true,
              charResources: char?.classResources,
              spellSlots: char?.spellSlots,
              charClasses,
              referenceData, baseReferenceData, formulaContext,
              initial: {
                source: editRow?.featBuffPatch?.source || `feat-${editFeatId}`,
                effects: initialEffects,
                duration: editRow?.featBuffPatch?.duration,
                enabled: editRow?.featBuffPatch?.enabled !== false,
                cardScope: editRow?.featBuffPatch?.cardScope || defaultPatch?.cardScope || undefined,
              },
              onSave: (buff) => {
                const raw = char?.selectedFeats ?? []
                const updated = raw.map((f) => {
                  if (f?.slotId !== editRow.slotId && f?.featId !== editFeatId) return f
                  const next = { ...f }
                  if (buff.effects.length > 0) {
                    next.featBuffPatch = { effects: buff.effects, enabled: buff.enabled, cardScope: buff.cardScope, duration: buff.duration, source: buff.source }
                  } else {
                    delete next.featBuffPatch
                  }
                  return next
                })
                onSave({ selectedFeats: updated })
                setFeatBuffEditor(null)
              },
              onClear: () => {
                const raw = char?.selectedFeats ?? []
                const updated = raw.map((f) => {
                  if (f?.slotId !== editRow.slotId && f?.featId !== editFeatId) return f
                  const next = { ...f }
                  delete next.featBuffPatch
                  return next
                })
                onSave({ selectedFeats: updated })
                setFeatBuffEditor(null)
              },
            }}
          />
        )
      })()}

      {featActiveAbility && (
        <AbilityUseModal
          activeAbility={featActiveAbility}
          char={char}
          featureName={featActiveAbility.name}
          onConfirm={(patch, lines) => {
            if (patch && Object.keys(patch).length > 0) onSave(patch)
          }}
          onClose={() => setFeatActiveAbility(null)}
        />
      )}
    </SlotPanel>
  )
}

/** 职业：起始职业、兼职、进阶、施法等级汇总、职业特性（等级上限由经验等级决定） */
function ClassSection({ char, level, canEdit, onSave, moduleId, referenceData, baseReferenceData, formulaContext }) {
  const maxLevel = Math.max(1, level)
  const [classVal, setClassVal] = useState(char?.['class'] ?? '')
  const [subclass, setSubclass] = useState(char?.subclass ?? '')
  const [classLevel, setClassLevel] = useState(() => {
    const v = char?.classLevel ?? 1
    return typeof v === 'number' ? Math.max(1, Math.min(20, v)) : 1
  })
  const [multiclass, setMulticlass] = useState(() => {
    const raw = char?.multiclass
    if (Array.isArray(raw)) return raw.map((m) => ({ 'class': m?.['class'] ?? '', subclass: m?.subclass ?? '', level: Math.max(0, Math.min(20, Number(m?.level) ?? 0)) }))
    return []
  })
  const [prestige, setPrestige] = useState(() => {
    if (Array.isArray(char?.prestige)) return char.prestige.map((p) => ({ 'class': p?.['class'] ?? '', level: Math.max(0, Math.min(20, Number(p?.level) ?? 0)) }))
    if (char?.prestigeClass) return [{ 'class': char.prestigeClass, level: Math.max(0, Math.min(20, Number(char.prestigeLevel) ?? 0)) }]
    return []
  })
  useEffect(() => {
    setClassVal(char?.['class'] ?? '')
    setSubclass(char?.subclass ?? '')
    setClassLevel(typeof char?.classLevel === 'number' ? Math.max(1, Math.min(20, char.classLevel)) : 1)
    const raw = char?.multiclass
    setMulticlass(Array.isArray(raw) ? raw.map((m) => ({ 'class': m?.['class'] ?? '', subclass: m?.subclass ?? '', level: Math.max(0, Math.min(20, Number(m?.level) ?? 0)) })) : [])
    if (Array.isArray(char?.prestige)) setPrestige(char.prestige.map((p) => ({ 'class': p?.['class'] ?? '', level: Math.max(0, Math.min(20, Number(p?.level) ?? 0)) })))
    else if (char?.prestigeClass) setPrestige([{ 'class': char.prestigeClass, level: Math.max(0, Math.min(20, Number(char.prestigeLevel) ?? 0)) }])
    else setPrestige([])
  }, [char?.id, char?.subclass])
  const prestigeLevelSum = prestige.reduce((s, p) => s + (p.level || 0), 0)
  const totalClassLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
  const overCap = totalClassLevels > maxLevel
  const charClasses = [
    ...(classVal ? [{ className: classVal, level: classLevel }] : []),
    ...multiclass.filter(m => m['class']).map(m => ({ className: m['class'], level: m.level || 0 })),
  ]

  // 子职特性 BUFF 编辑器
  const [subclassFeatureEditor, setSubclassFeatureEditor] = useState(null) // { feature }
  const [subclassBuffEditor, setSubclassBuffEditor] = useState(null) // { feature } for BUFF editor modal
  const [editSubclassCardName, setEditSubclassCardName] = useState('')
  const [editSubclassCardDesc, setEditSubclassCardDesc] = useState('')
  // 子职卡名称/描述初始化
  useEffect(() => {
    if (!subclassBuffEditor) { setEditSubclassCardName(''); setEditSubclassCardDesc(''); return }
    const { feature, className: scCls, subclassName: scSub } = subclassBuffEditor
    const bk = buildClassFeatureBuffKey(scCls, scSub, feature.id)
    const patch = loadDefaultBuffPatch(moduleId, 'classFeature', bk)
    setEditSubclassCardName(patch?.cardName || feature.name)
    setEditSubclassCardDesc(patch?.cardDescription || feature.description || '')
  }, [subclassBuffEditor?.feature?.id, moduleId])

  const persistClass = (patch) => {
    onSave({
      'class': patch['class'] !== undefined ? patch['class'] : classVal,
      subclass: patch.subclass !== undefined ? patch.subclass : subclass,
      classLevel: patch.classLevel !== undefined ? patch.classLevel : classLevel,
      multiclass: patch.multiclass !== undefined ? patch.multiclass : multiclass,
      prestige: patch.prestige !== undefined ? patch.prestige : prestige,
    })
  }

  const setMainLevel = (n) => {
    const v = Math.max(1, Math.min(maxLevel, n))
    const other = multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
    const clamped = Math.min(v, Math.max(0, maxLevel - other))
    setClassLevel(clamped)
    persistClass({ classLevel: clamped })
  }

  const setMulticlassRow = (index, field, value) => {
    let next = multiclass.map((m, i) => {
      if (i !== index) return m
      if (field === 'class') {
        const nextSubs = getSubclassOptions(value)
        const sub = nextSubs.includes(m.subclass) ? m.subclass : ''
        return { ...m, 'class': value, subclass: sub }
      }
      if (field === 'subclass') return { ...m, subclass: value }
      return { ...m, [field]: value }
    })
    if (field === 'level') {
      const v = Math.max(0, Math.min(maxLevel, Number(value) ?? 0))
      const other = classLevel + next.filter((_, i) => i !== index).reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
      next[index] = { ...next[index], level: Math.min(v, Math.max(0, maxLevel - other)) }
    }
    setMulticlass(next)
    persistClass({ multiclass: next })
  }

  const addMulticlassRow = () => {
    const next = [...multiclass, { 'class': '', subclass: '', level: 0 }]
    setMulticlass(next)
    persistClass({ multiclass: next })
  }

  const removeMulticlassRow = (index) => {
    const next = multiclass.filter((_, i) => i !== index)
    setMulticlass(next)
    persistClass({ multiclass: next })
  }

  const setPrestigeRow = (index, field, value) => {
    let next = prestige.map((p, i) => (i !== index ? p : { ...p, [field]: value }))
    if (field === 'level') {
      const v = Math.max(0, Math.min(maxLevel, Number(value) ?? 0))
      const other = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + next.filter((_, i) => i !== index).reduce((s, p) => s + (p.level || 0), 0)
      next[index] = { ...next[index], level: Math.min(v, Math.max(0, maxLevel - other)) }
    }
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const addPrestigeRow = () => {
    const next = [...prestige, { 'class': '', level: 0 }]
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const removePrestigeRow = (index) => {
    const next = prestige.filter((_, i) => i !== index)
    setPrestige(next)
    persistClass({ prestige: next })
  }

  const selectClass = 'panel-select panel-class-control-h-compact min-w-[7rem]'
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-3 gap-1">
        <div className="flex flex-col min-h-0 py-1 px-1 border-l border-[var(--card-border)] pl-2 first:border-l-0 first:pl-1">
          <label className="panel-label mb-0.5 block">起始职业</label>
          {canEdit ? (
            <div className="border border-[var(--card-border)] rounded-lg p-0.5 bg-[rgba(30,38,50,0.4)]">
              <div className="flex min-w-0 items-center gap-1 flex-nowrap">
                <select
                  value={classVal}
                  onChange={(e) => {
                    const nextClass = e.target.value
                    const nextSubs = getSubclassOptions(nextClass)
                    const keepSub = nextSubs.includes(subclass) ? subclass : ''
                    setClassVal(nextClass)
                    setSubclass(keepSub)
                    persistClass({ 'class': nextClass, subclass: keepSub })
                  }}
                  className={selectClass + ' min-w-0 flex-[1.15] basis-0'}
                >
                  <option value="">—</option>
                  {ALL_CLASS_NAMES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="w-[4.5rem] shrink-0">
                  <LevelStepper
                    value={classLevel}
                    onChange={setMainLevel}
                    min={1}
                    max={Math.max(1, maxLevel - multiclass.reduce((s, m) => s + (m.level || 0), 0) - prestigeLevelSum)}
                    disabled={!classVal}
                    compact
                  />
                </div>
                <select
                  value={subclass}
                  onChange={(e) => { setSubclass(e.target.value); persistClass({ subclass: e.target.value }) }}
                  className={selectClass + ' min-w-0 flex-1 basis-0'}
                  aria-label="子职（选填）"
                >
                  <option value="">—</option>
                  {getSubclassOptions(classVal).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {subclass && canEdit && (
                  <button
                    type="button"
                    onClick={() => setSubclassFeatureEditor({ className: classVal, subclassName: subclass })}
                    className="shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                    title="编辑子职特性 BUFF"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[var(--text-main)] font-semibold text-sm">
              {char?.['class'] ? `${getClassDisplayName(char['class'])}${char.subclass ? `（${char.subclass}）` : ''} ${char.classLevel ?? 1}` : '—'}
            </p>
          )}
        </div>
        <div className="flex flex-col min-h-0 py-1 px-1 border-l border-[var(--card-border)] pl-2 first:border-l-0 first:pl-1">
          <div className="mb-0.5 flex items-center justify-between">
            <label className="panel-label block">兼职</label>
            {canEdit && (
              <button
                type="button"
                onClick={addMulticlassRow}
                className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                + 添加兼职
              </button>
            )}
          </div>
          {canEdit ? (
            <div className="flex min-h-0 flex-1 flex-col gap-0.5">
              {multiclass.map((m, i) => {
                const otherLevels = classLevel + multiclass.reduce((s, x, j) => s + (j === i ? 0 : (x.level || 0)), 0) + prestigeLevelSum
                const rowMax = Math.max(0, maxLevel - otherLevels)
                return (
                  <div key={i} className="border border-[var(--card-border)] rounded-lg p-0.5 bg-[rgba(30,38,50,0.4)]">
                    <div className="flex gap-1 items-center flex-nowrap">
                      <select value={m['class']} onChange={(e) => setMulticlassRow(i, 'class', e.target.value)} className={selectClass + ' min-w-0 flex-[1.05] basis-0'}>
                        <option value="">—</option>
                        {ALL_CLASS_NAMES.filter((c) => c !== classVal).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className="w-[4.5rem] shrink-0">
                        <LevelStepper value={m.level} onChange={(n) => setMulticlassRow(i, 'level', n)} min={0} max={rowMax} disabled={!m['class']} compact />
                      </div>
                      <select
                        value={m.subclass ?? ''}
                        onChange={(e) => setMulticlassRow(i, 'subclass', e.target.value)}
                        className={selectClass + ' min-w-0 flex-1 basis-0'}
                        aria-label="兼职子职（选填）"
                        disabled={!m['class']}
                      >
                        <option value="">—</option>
                        {getSubclassOptions(m['class']).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeMulticlassRow(i)}
                        className="shrink-0 flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                        title="移除"
                      >
                        <Trash2 className={CS_ICON_16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[var(--text-main)] text-sm">
              {Array.isArray(char?.multiclass) && char.multiclass.length ? char.multiclass.map((m) => `${getClassDisplayName(m['class']) || '?'}${m.subclass ? `（${m.subclass}）` : ''} ${m.level ?? 0}`).join(' / ') : '—'}
            </p>
          )}
        </div>
        <div className="flex flex-col min-h-0 py-1 px-1 border-l border-[var(--card-border)] pl-2 first:border-l-0 first:pl-1">
          <div className="mb-0.5 flex items-center justify-between">
            <label className="panel-label block">进阶（选填）</label>
            {canEdit && (
              <button
                type="button"
                onClick={addPrestigeRow}
                className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                + 添加进阶
              </button>
            )}
          </div>
          {canEdit ? (
            <div className="flex min-h-0 flex-1 flex-col gap-0.5">
              {prestige.map((p, i) => {
                const otherLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestige.reduce((s, x, j) => s + (j === i ? 0 : (x.level || 0)), 0)
                const rowMax = Math.max(0, maxLevel - otherLevels)
                return (
                  <div key={i} className="border border-[var(--card-border)] rounded-lg p-0.5 bg-[rgba(30,38,50,0.4)]">
                    <div className="flex gap-1 items-center flex-nowrap">
                      <select value={p['class']} onChange={(e) => setPrestigeRow(i, 'class', e.target.value)} className={selectClass}>
                        <option value="">— 选择 —</option>
                        {FANXING_PRESTIGE_CLASSES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className="min-w-0 flex-1">
                        <LevelStepper value={p.level} onChange={(n) => setPrestigeRow(i, 'level', n)} min={0} max={rowMax} disabled={!p['class']} compact />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePrestigeRow(i)}
                        className="shrink-0 flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                        title="移除"
                      >
                        <Trash2 className={CS_ICON_16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[var(--text-main)] text-sm">
              {Array.isArray(char?.prestige) && char.prestige.length ? char.prestige.map((p) => `${getClassDisplayName(p['class']) || '?'} ${p.level || 0}`).join(' / ') : char?.prestigeClass ? `${getClassDisplayName(char.prestigeClass)} ${char.prestigeLevel ?? 0}` : '—'}
            </p>
          )}
        </div>
        </div>
      {overCap && (
        <p className="text-dnd-red text-xs font-bold">职业等级总和 ({totalClassLevels}) 已超过表定等级 ({maxLevel})，请调低各职业等级。</p>
      )}

      {/* 子职特性列表弹窗 */}
      {subclassFeatureEditor && (() => {
        const { className: scClassName, subclassName } = subclassFeatureEditor
        const classData = getClassData(scClassName)
        const features = classData?.subclasses?.[subclassName]?.features || []
        return (
          <>
            <div className="fixed inset-0 z-[300] bg-black/60" onClick={() => setSubclassFeatureEditor(null)} aria-hidden />
            <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 sm:p-8 overflow-auto" onClick={() => setSubclassFeatureEditor(null)}>
              <div className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-dnd-gold-light/90">
                      {subclassName} · 子职特性
                    </h3>
                    <button type="button" onClick={() => setSubclassFeatureEditor(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-dnd-text-muted mt-1">点击齿轮配置该特性的 BUFF 效果</p>
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  {features.length === 0 ? (
                    <p className="text-gray-500 text-xs text-center py-4">该子职暂无特性数据</p>
                  ) : (
                    features.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-white truncate">{f.name}</div>
                          <div className="text-[10px] text-gray-500">{f.level} 级</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubclassBuffEditor({ feature: f, className: scClassName, subclassName })}
                          className="shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                          title="配置 BUFF"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* 子职特性 BUFF 编辑器弹窗 */}
      {subclassBuffEditor && (() => {
        const { feature, className: scClassName, subclassName } = subclassBuffEditor
        const buffKey = buildClassFeatureBuffKey(scClassName, subclassName, feature.id)
        return (
          <BuffEditorModal
            open
            onClose={() => setSubclassBuffEditor(null)}
            zIndex={400}
            header={
              <>
                <div className="flex items-center justify-between gap-3">
                  <input
                    type="text"
                    value={editSubclassCardName}
                    onChange={(e) => setEditSubclassCardName(e.target.value)}
                    className="flex-1 text-base font-semibold text-dnd-gold-light/90 bg-transparent border-b border-transparent hover:border-white/20 focus:border-dnd-gold-light/50 focus:outline-none px-1 py-0.5"
                    placeholder="卡名称"
                  />
                  <button type="button" onClick={() => setSubclassBuffEditor(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <textarea
                  value={editSubclassCardDesc}
                  onChange={(e) => setEditSubclassCardDesc(e.target.value)}
                  rows={3}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line resize-y focus:outline-none focus:border-dnd-gold-light/40"
                  placeholder="卡描述…"
                />
              </>
            }
            buffFormProps={{
              key: `sc-buff-${scClassName}-${subclassName}-${feature.id}`,
              compact: true,
              readOnly: !canEdit,
              hideDuration: true,
              charResources: char?.classResources,
              spellSlots: char?.spellSlots,
              charClasses,
              referenceData, baseReferenceData, formulaContext,
              initial: {
                source: `${scClassName}-${feature.name}`,
                cardName: editSubclassCardName,
                cardDescription: editSubclassCardDesc,
                effects: (() => {
                  const patch = loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)
                  if (patch && Array.isArray(patch.effects) && patch.effects.length) return patch.effects
                  return HARDCODED_CLASS_FEATURE_BUFFS[buffKey] || []
                })(),
                enabled: (() => {
                  const patch = loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)
                  return patch?.enabled !== false
                })(),
                cardScope: loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)?.cardScope || undefined,
              },
              onSave: (buff) => {
                saveDefaultBuffPatch(moduleId, 'classFeature', buffKey, {
                  effects: buff.effects,
                  enabled: buff.enabled,
                  sourceName: `${scClassName}-${feature.name}`,
                  cardScope: buff.cardScope,
                  cardName: editSubclassCardName || undefined,
                  cardDescription: editSubclassCardDesc || undefined,
                })
                setSubclassBuffEditor(null)
              },
            }}
          />
        )
      })()}
    </div>
  )
}

function noop() {}

function briefClassSummary(c) {
  if (!c) return '—'
  const parts = []
  if (c.class) parts.push(`${getClassDisplayName(c.class)} ${Math.max(0, Number(c.classLevel) || 1)}`)
  if (Array.isArray(c.multiclass)) {
    c.multiclass.forEach((m) => {
      if (m?.['class'])
        parts.push(
          `${getClassDisplayName(m['class'])}${m.subclass ? `（${m.subclass}）` : ''} ${Math.max(0, Number(m.level) || 0)}`,
        )
    })
  }
  if (Array.isArray(c.prestige)) {
    c.prestige.forEach((p) => {
      if (p?.['class']) parts.push(`${getClassDisplayName(p['class'])} ${Math.max(0, Number(p.level) || 0)}`)
    })
  }
  return parts.length ? parts.join(' / ') : '—'
}

export default function CharacterSheet() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const sheetModuleId = currentModuleId || 'default'
  const [char, setChar] = useState(null)
  const [editingName, setEditingName] = useState(null)
  const [editingCodename, setEditingCodename] = useState(null)
  const nameInputRef = useRef(null)
  const charIdRef = useRef(null)
  /** Supabase 时待同步的补丁队列（乐观更新后串行合并写入，避免并发覆盖） */
  const persistQueueRef = useRef([])
  const persistFlushPromiseRef = useRef(null)
  const level = char ? levelFromXP(char.xp) : 0
  const spellLevel = char ? getSpellcastingLevel(char) : 0
  const combatState = useCombatState(char)
  // 监听 defaultBuffPatchStore 变更，触发 mergedBuffs 重算
  const [buffPatchRev, setBuffPatchRev] = useState(0)
  useEffect(() => {
    const handler = () => setBuffPatchRev((v) => v + 1)
    window.addEventListener(DEFAULT_BUFF_PATCHES_EVENT, handler)
    return () => window.removeEventListener(DEFAULT_BUFF_PATCHES_EVENT, handler)
  }, [])
  // 种族/背景 BUFF 编辑器状态（从 RaceBackgroundInline 提升）
  const [raceBuffEditorOpen, setRaceBuffEditorOpen] = useState(false)
  const [backgroundBuffEditorOpen, setBackgroundBuffEditorOpen] = useState(false)
  const [profileTraitChoiceModal, setProfileTraitChoiceModal] = useState(null)
  const [raceActiveAbility, setRaceActiveAbility] = useState(null) // 种族主动技能释放弹窗
  const handleProfileTraitChoiceSelect = (traitId, optionId) => {
    const choices = { ...(char.raceCard?.traitChoices || {}), [traitId]: optionId }
    persist({ ...char, raceCard: { ...char.raceCard, traitChoices: choices } })
    setProfileTraitChoiceModal(null)
  }
  const mergedBuffs = useMemo(
    () => getMergedBuffsForCalculator(char, sheetModuleId),
    [
      char?.buffs,
      char?.selectedFeats,
      char?.selectedInvocations,
      char?.selectedFightingStyles,
      char?.classFeatureChoices,
      char?.inventory,
      char?.equippedHeld,
      char?.equippedWorn,
      char?.raceCard,
      char?.backgroundCard,
      char?.shields,
      sheetModuleId,
      buffPatchRev, // eslint-disable-line react-hooks/exhaustive-deps
    ],
  )
  const buffStats = useBuffCalculator(char, mergedBuffs)

  // 构建统一的 Card 数组，用于所有主动技能检测
  const allCards = useMemo(() => buildCardsFromCharacter(char, sheetModuleId), [char, sheetModuleId, buffPatchRev])

  const canEdit = isAdmin || char?.owner === user?.name
  const isCreatureTemplate = char?.subordinateTemplate === 'creature'

  // 页面内调试面板（适用于无控制台的内置浏览器）
  const [cardsDebugVisible, setCardsDebugVisible] = useState(true)
  useEffect(() => {
    if (!char) return
    if (!cardsDebugVisible) {
      const panel = document.getElementById('cards-debug-panel')
      if (panel) panel.style.display = 'none'
      return
    }
    
    let panel = document.getElementById('cards-debug-panel')
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'cards-debug-panel'
      panel.style.cssText = 'position:fixed;top:10px;right:10px;width:350px;max-height:400px;overflow:auto;background:#1a2333;color:#fff;padding:10px;z-index:99999;font-size:11px;border:2px solid #c79a42;line-height:1.6;'
      
      const toggleBtn = document.createElement('button')
      toggleBtn.textContent = '✕'
      toggleBtn.style.cssText = 'position:absolute;top:4px;right:6px;background:none;border:none;color:#c79a42;cursor:pointer;font-size:14px;padding:0;line-height:1;'
      toggleBtn.onclick = () => setCardsDebugVisible(false)
      panel.appendChild(toggleBtn)
      
      document.body.appendChild(panel)
    } else {
      panel.style.display = 'block'
    }
    
    const raceActiveCards = allCards.filter(c => c.sourceType === 'race' && c.activeAbility)
    panel.innerHTML = `
      <strong>卡片调试：</strong><br/>
      allCards总数: ${allCards.length}<br/>
      种族主动卡: ${raceActiveCards.length}<br/>
      ${raceActiveCards.map(c => `- ${c.name} (${c.sourceType})`).join('<br/>') || '（无）'}
    `
  }, [char, allCards, cardsDebugVisible])

  const characterClasses = useMemo(() => (char ? getCharacterClasses(char) : []), [char])
  const charClasses = useMemo(() => characterClasses.map(c => ({ className: c.name, level: c.level })), [characterClasses])
  const classLevels = useMemo(() => {
    const map = {}
    for (const c of characterClasses) map[c.name] = c.level
    return map
  }, [characterClasses])

  const referenceData = useMemo(() => {
    if (!char) return []
    const abilities = buffStats?.abilities ?? char?.abilities ?? {}
    const prof = buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(level)
    const spellAbility = getPrimarySpellcastingAbility(char)
    const arr = []
    Object.entries(abilities).forEach(([k, v]) => {
      const label = ABILITY_NAMES_ZH[k] ?? k
      const score = Number(v) || 0
      if (v != null) {
        arr.push({ label: `${label}调整值`, value: abilityModifier(score), ref: 'abilityModifier', ability: k })
      }
    })
    arr.push({ label: '熟练加值', value: prof, ref: 'proficiency' })
    arr.push({ label: '等级', value: level, ref: 'level' })
    const speedBase = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
    const speedPenalty = buffStats?.speedExhaustionPenalty ?? 0
    const speed = Math.max(0, Math.floor(speedBase * (buffStats?.speedMultiplier ?? 1)) - speedPenalty)
    arr.push({ label: '步行移动速度', value: speed, ref: 'speed' })
    for (const c of characterClasses) {
      const displayName = getClassDisplayName(c.name) || c.name
      arr.push({ label: `${displayName}等级`, value: c.level, ref: 'classLevel', className: c.name })
    }
    if (spellAbility) {
      const mod = abilityModifier(abilities[spellAbility] ?? 10)
      const spellDC = 8 + prof + mod + (buffStats?.saveDcBonus ?? 0)
      const spellAtk = prof + mod + (buffStats?.spellAttackBonus ?? 0)
      arr.push({ label: '法术DC', value: spellDC, ref: 'spellDc' })
      arr.push({ label: '法术攻击', value: spellAtk, ref: 'spellAttack' })
    }
    return arr
  }, [char, level, buffStats, characterClasses])

  const baseReferenceData = useMemo(() => {
    if (!char) return []
    const abilities = char?.abilities ?? {}
    const prof = proficiencyBonus(level)
    const spellAbility = getPrimarySpellcastingAbility(char)
    const arr = []
    Object.entries(abilities).forEach(([k, v]) => {
      const label = ABILITY_NAMES_ZH[k] ?? k
      const score = Number(v) || 0
      if (v != null) {
        arr.push({ label: `${label}调整值`, value: abilityModifier(score), ref: 'abilityModifier', ability: k })
      }
    })
    arr.push({ label: '熟练加值', value: prof, ref: 'proficiency' })
    arr.push({ label: '等级', value: level, ref: 'level' })
    arr.push({ label: '步行移动速度', value: char?.speed ?? 30, ref: 'speed' })
    for (const c of characterClasses) {
      const displayName = getClassDisplayName(c.name) || c.name
      arr.push({ label: `${displayName}等级`, value: c.level, ref: 'classLevel', className: c.name })
    }
    if (spellAbility) {
      const mod = abilityModifier(abilities[spellAbility] ?? 10)
      const spellDC = 8 + prof + mod
      const spellAtk = prof + mod
      arr.push({ label: '法术DC', value: spellDC, ref: 'spellDc' })
      arr.push({ label: '法术攻击', value: spellAtk, ref: 'spellAttack' })
    }
    return arr
  }, [char, level, characterClasses])

  const sheetOverridesMap = useRuleTextOverridesMap(sheetModuleId)
  const sourceNameOptions = useMemo(() => {
    if (!char) return []
    const names = []
    const seen = new Set()
    // 专长
    for (const f of char.selectedFeats ?? []) {
      const featId = typeof f === 'string' ? f : (f.featId ?? f.id ?? '')
      if (!featId || seen.has(featId)) continue
      seen.add(featId)
      const feat = FEATS.find((x) => x.id === featId)
      const name = feat?.name
        ? resolveRuleText(sheetOverridesMap, buildFeatNameKey(featId), feat.name)
        : ''
      if (name && !seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    }
    // 职业特性
    for (const f of resolveSelectedFeatures(char)) {
      const nameKey = f.sourceSubclass
        ? buildSubclassFeatureNameKey(f.sourceClass, f.sourceSubclass, f.id)
        : buildClassFeatureNameKey(f.sourceClass, f.id)
      const name = resolveRuleText(sheetOverridesMap, nameKey, f.name)
      if (name && !seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    }
    // 魔能祈唤
    for (const x of char.selectedInvocations ?? []) {
      const invocationId = typeof x === 'string' ? x : (x?.invocationId ?? x?.id ?? '')
      if (!invocationId || seen.has(invocationId)) continue
      seen.add(invocationId)
      const inv = ELDRITCH_INVOCATIONS.find((i) => i.id === invocationId)
      if (inv?.name && !seen.has(inv.name)) {
        seen.add(inv.name)
        names.push(inv.name)
      }
    }
    // 战斗风格
    for (const x of char.selectedFightingStyles ?? []) {
      const styleId = typeof x === 'string' ? x : (x?.styleId ?? x?.id ?? '')
      if (!styleId || seen.has(styleId)) continue
      seen.add(styleId)
      const style = getFightingStyleById(styleId)
      if (style?.name && !seen.has(style.name)) {
        seen.add(style.name)
        names.push(`战斗风格-${style.name}`)
      }
    }
    return names
  }, [char, sheetModuleId])

  const buffFormulaContext = useMemo(() => {
    if (!char) return { level: 1, abilities: {}, prof: 0, spellDC: 0, spellAttack: 0, classLevels: {} }
    const abilities = buffStats?.abilities ?? char?.abilities ?? {}
    const prof = buffStats?.proficiencyOverride != null ? buffStats.proficiencyOverride : proficiencyBonus(level)
    const spellAbility = getPrimarySpellcastingAbility(char)
    const mod = spellAbility ? abilityModifier(abilities[spellAbility] ?? 10) : 0
    return {
      level,
      abilities,
      prof,
      spellDC: spellAbility ? 8 + prof + mod : 0,
      spellAttack: spellAbility ? prof + mod : 0,
      classLevels,
    }
  }, [char, level, buffStats, classLevels])

  /** 附属卡本地更新后递增，用于顶栏等重新读取 getCharactersInModule */
  const [subordinatesTick, setSubordinatesTick] = useState(0)

  /** 顶栏与召唤槽始终挂在主卡；浏览附属卡 URL 时仍显示主卡名/血条/槽位数据 */
  const topBarChar = useMemo(() => {
    if (!char) return null
    const pid = char.parentId
    if (!pid) return char
    return getCharacter(pid) ?? char
  }, [char, subordinatesTick])

  const summonParentId = char?.parentId || char?.id
  const subordinates = useMemo(() => {
    if (!summonParentId) return []
    const mod = currentModuleId ?? 'default'
    return getCharactersInModule(mod).filter((c) => c.parentId === summonParentId)
  }, [summonParentId, currentModuleId, subordinatesTick])

  const persistSubordinate = useCallback(
    (subId, patch) => {
      if (!canEdit || !subId || !patch) return
      updateCharacter(subId, patch)
      setSubordinatesTick((t) => t + 1)
    },
    [canEdit],
  )

  useEffect(() => {
    if (!id || id === 'new') return
    let cancelled = false
    ;(async () => {
      if (isSupabaseEnabled()) {
        let c = getCharacter(id)
        if (!c) c = await loadCharacterById(id)
        if (!cancelled) setChar(c ?? null)
      } else {
        setChar(getCharacter(id))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!id || id === 'new') return
    const onRealtime = async () => {
      if (!isSupabaseEnabled()) return
      await loadCharacterById(id)
      const next = getCharacter(id)
      if (next && next.id === id) setChar(next)
    }
    window.addEventListener('dnd-realtime-characters', onRealtime)
    return () => window.removeEventListener('dnd-realtime-characters', onRealtime)
  }, [id])

  useEffect(() => {
    charIdRef.current = char?.id ?? null
  }, [char?.id])

  // 切换角色时清空持久化队列，防止旧角色的补丁被刷到新角色上
  useEffect(() => {
    persistQueueRef.current = []
    persistFlushPromiseRef.current = null
  }, [id])

  useEffect(() => {
    setEditingName(null)
    setEditingCodename(null)
  }, [char?.id])

  const persist = useCallback((patch) => {
    const id = charIdRef.current
    if (!id) return null

    // 乐观更新：界面立即反映本次修改
    setChar((prev) => (prev ? mergeCharacterPatch(prev, patch) : prev))

    if (!isSupabaseEnabled()) {
      const updated = updateCharacter(id, patch)
      if (updated) setChar(updated)
      return updated
    }

    persistQueueRef.current.push(patch)

    const startFlushIfNeeded = () => {
      if (persistFlushPromiseRef.current) return
      const run = async () => {
        try {
          while (persistQueueRef.current.length > 0) {
            // 每次迭代重新读取当前角色 ID，避免切换角色后用旧 ID 刷入新补丁
            const currentId = charIdRef.current
            if (!currentId) {
              persistQueueRef.current = []
              break
            }
            const batch = []
            while (persistQueueRef.current.length > 0) {
              batch.push(persistQueueRef.current.shift())
            }
            const mergedPatch = mergePatchesList(batch)
            try {
              const u = await updateCharacter(currentId, mergedPatch)
              if (u) {
                if (persistQueueRef.current.length > 0) {
                  const pendingAfter = mergePatchesList([...persistQueueRef.current])
                  setChar(mergeCharacterPatch(u, pendingAfter))
                } else {
                  setChar(u)
                }
              }
            } catch (err) {
              console.error('[persist] 云端保存失败，已回滚为服务器数据', err)
              persistQueueRef.current = []
              try {
                const fresh = await loadCharacterById(currentId)
                if (fresh) setChar(fresh)
                else {
                  const c = getCharacter(currentId)
                  if (c) setChar(c)
                }
              } catch (_) {
                const c = getCharacter(currentId)
                if (c) setChar(c)
              }
              break
            }
          }
        } finally {
          persistFlushPromiseRef.current = null
          if (persistQueueRef.current.length > 0) {
            startFlushIfNeeded()
          }
        }
      }
      persistFlushPromiseRef.current = run()
    }

    startFlushIfNeeded()
    return persistFlushPromiseRef.current
  }, [])

  const persistSummonHost = useCallback(
    (patch) => {
      const hostId = topBarChar?.id
      if (!hostId || !patch) return null
      const urlId = charIdRef.current
      if (hostId === urlId) return persist(patch)

      const bump = () => setSubordinatesTick((t) => t + 1)
      if (isSupabaseEnabled()) {
        void updateCharacter(hostId, patch).then((u) => {
          if (u) bump()
        })
        return null
      }
      const updated = updateCharacter(hostId, patch)
      bump()
      return updated
    },
    [topBarChar?.id, persist],
  )

  if (!char && id && id !== 'new') {
    return (
      <div className="p-4 pb-24 min-h-screen">
        <p className="text-dnd-text-muted">未找到该角色。</p>
        <Link to="/characters" className="text-dnd-red mt-2 inline-block">返回列表</Link>
      </div>
    )
  }

  return (
    <div
      className={`px-4 pb-24 min-h-screen ${char ? 'character-sheet-page-with-topbar' : 'pt-4'}`}
      style={{ backgroundColor: 'var(--page-bg)' }}
    >
      {char ? (
        <CharacterSheetTopBar
          char={topBarChar ?? char}
          isCreatureTemplate={isCreatureTemplate}
          persistMain={persistSummonHost}
          persistSubordinate={persistSubordinate}
          canEdit={canEdit}
          subordinates={subordinates}
        />
      ) : null}
      {char ? (
        <>
          {/* 统一卡片：左 核心（生物模版不显示外貌/基础与头像）| 右 大头像 */}
          <section id="sheet-profile" className="character-sheet-section-anchor module-panel mt-4 w-full p-3">
            {isCreatureTemplate ? (
              <CreatureSimpleBlock char={char} canEdit={canEdit} onSave={persist} />
            ) : (
              <>
                {/* 左列：代号+角色名+外观 | 右列：头像（顶部对齐角色名） */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_500px] lg:gap-3">
                  <div className="min-w-0">
                    <div className="form-group-compact">
                      <label className="form-label">代号（可选）</label>
                      {canEdit ? (
                        <input
                          type="text"
                          value={editingCodename !== null ? editingCodename : (char.codename ?? '')}
                          onChange={(e) => setEditingCodename(e.target.value)}
                          onFocus={() => { if (editingCodename === null) setEditingCodename(char.codename ?? '') }}
                          onBlur={() => {
                            const value = (editingCodename !== null ? editingCodename : char.codename ?? '').trim() || undefined
                            persist({ codename: value })
                            setEditingCodename(null)
                          }}
                          placeholder="区分同名角色"
                          className="input-thin w-full text-[var(--text-muted)] text-lg"
                        />
                      ) : (
                        <p className="text-[var(--text-muted)] text-lg break-words">{char.codename || '—'}</p>
                      )}
                    </div>
                    <div className="form-group-compact">
                      <label className="form-label">角色名</label>
                      {canEdit ? (
                        <NameInput
                          ref={nameInputRef}
                          value={editingName !== null ? editingName : (char.name ?? '')}
                          onChange={(e) => setEditingName(e.target.value)}
                          onFocus={() => { if (editingName === null) setEditingName(char.name ?? '') }}
                          onBlur={() => {
                            const value = (editingName ?? char.name ?? '').trim() || '未命名'
                            persist({ name: value })
                            setEditingName(null)
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                          className="input-thin w-full font-bold text-2xl sm:text-3xl text-[var(--text-main)] py-1 break-words leading-tight"
                        />
                      ) : (
                        <p className="text-2xl sm:text-3xl font-bold text-[var(--text-main)] break-words leading-tight" style={{ fontWeight: 700 }}>{char.name || '未命名'}</p>
                      )}
                    </div>
                    <h3 className="profile-section-title mt-2 mb-0.5">外观 / 基础</h3>
                    <AppearanceGrid char={char} canEdit={canEdit} onSave={persist} noBorder compact />
                    <RaceBackgroundInline char={char} canEdit={canEdit} onSave={persist}
                      raceBuffEditorOpen={raceBuffEditorOpen} setRaceBuffEditorOpen={setRaceBuffEditorOpen}
                      backgroundBuffEditorOpen={backgroundBuffEditorOpen} setBackgroundBuffEditorOpen={setBackgroundBuffEditorOpen}
                      referenceData={referenceData} baseReferenceData={baseReferenceData} formulaContext={buffFormulaContext} />

                    {/* 种族特性展示 */}
                    {(() => {
                      let selRace = getRaceById(char.raceCard?.raceId)
                      if (!selRace && char.raceCard?.customName) {
                        const name = char.raceCard.customName.trim()
                        selRace = getAllRaces().find(r => r.name === name) || null
                      }
                      if (!selRace) return null
                      const allTraits = []
                      ;(selRace.traits || []).forEach(t => allTraits.push({ ...t, _isSubrace: false }))
                      if (char.raceCard?.subraceId && selRace.subraces) {
                        const sub = selRace.subraces.find(s => s.id === char.raceCard.subraceId)
                        if (sub) (sub.traits || []).forEach(t => allTraits.push({ ...t, _isSubrace: true }))
                      }
                      if (allTraits.length === 0) return null
                      const choiceTrait = profileTraitChoiceModal ? allTraits.find(t => t.id === profileTraitChoiceModal) : null
                      return (
                        <>
                        <div className="mt-2 space-y-1.5">
                          {allTraits.map((t) => {
                            const isChoice = Array.isArray(t.choiceOptions) && t.choiceOptions.length > 0
                            const chosenOpt = isChoice ? (t.choiceOptions || []).find(o => o.id === char.raceCard?.traitChoices?.[t.id]) : null
                            const activeCards = isChoice ? (chosenOpt?.cards || []) : (t.cards || [])
                            const effectSummaries = activeCards.map(c =>
                              getEffectSummaryShort({ effectType: c.effectType, value: c.value, customText: c.customText, scope: c.scope, scopeDetail: c.scopeDetail }, {})
                            ).filter(Boolean)
                            
                            // 从 allCards 中查找该特性的主动技能卡，并使用 findActiveAbilityFromCard 转换
                            const raceActiveCard = allCards.find(c => 
                              c.sourceType === 'race' && 
                              c.activeAbility && 
                              (c.name === t.name || c.buffEffects?.some(e => e._traitName === t.name))
                            )
                            const raceAbility = raceActiveCard ? findActiveAbilityFromCard(raceActiveCard.sourceKey, allCards, 'race') : null
                            
                            return (
                              <div key={t.id} className="bg-white/[0.03] rounded-md border border-gray-700/40 px-3 py-2">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t._isSubrace ? '亚种特性' : '种族特性'}</span>
                                  <span className="text-xs font-semibold text-gray-200">{t.name}</span>
                                  {isChoice && (
                                    <button
                                      onClick={() => setProfileTraitChoiceModal(t.id)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/15 border border-amber-400/20"
                                    >
                                      {chosenOpt ? chosenOpt.label : '未选择'}
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                  )}
                                  {/* 主动技能使用按钮 */}
                                  {raceAbility && (() => {
                                    const check = canUseAbility(raceAbility, char)
                                    const costText = raceAbility.cost.type === 'class_resource' 
                                      ? `${raceAbility.cost.amount}${({ charges: '充', spell_slot: '法' }[raceAbility.cost.resourceKey] || '')}` 
                                      : raceAbility.cost.type === 'none' ? '免费' : ''
                                    return (
                                      <button
                                        type="button"
                                        disabled={!check.usable}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setRaceActiveAbility({ ability: raceAbility, traitName: t.name })
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/30 hover:bg-dnd-gold/30 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={check.usable ? `点击使用${t.name}` : check.reason}
                                      >
                                        <Zap className="w-3 h-3" />
                                        使用
                                        {costText && <span className="text-[9px] opacity-70">({costText})</span>}
                                      </button>
                                    )
                                  })()}
                                </div>
                                {t.description && <p className="text-[11px] text-gray-400 leading-relaxed mb-1">{t.description}</p>}
                                {effectSummaries.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {effectSummaries.map((s, i) => (
                                      <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-300/80">{s}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {choiceTrait && Array.isArray(choiceTrait.choiceOptions) && (
                          <>
                            <div className="fixed inset-0 bg-black/60 z-[300]" onClick={() => setProfileTraitChoiceModal(null)} />
                            <div className="fixed inset-x-4 top-[20%] z-[301] max-w-lg mx-auto bg-[#1a2332] border border-white/10 rounded-lg shadow-xl p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-gray-200">选择：{choiceTrait.name}</h4>
                                <button onClick={() => setProfileTraitChoiceModal(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
                              </div>
                              {choiceTrait.description && <p className="text-[11px] text-gray-400">{choiceTrait.description}</p>}
                              <div className="space-y-2">
                                {choiceTrait.choiceOptions.map(opt => {
                                  const isSelected = char.raceCard?.traitChoices?.[choiceTrait.id] === opt.id
                                  return (
                                    <button
                                      key={opt.id}
                                      onClick={() => handleProfileTraitChoiceSelect(choiceTrait.id, opt.id)}
                                      className={`w-full text-left px-3 py-2 rounded border transition-colors ${isSelected ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-amber-400' : 'border-gray-500'}`}>
                                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                                        </div>
                                        <span className="text-xs font-medium text-gray-200">{opt.label}</span>
                                      </div>
                                      {opt.description && <p className="text-[10px] text-gray-400 mt-1 ml-5.5">{opt.description}</p>}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </>
                        )}
                        </>
                      )
                    })()}

                    {/* 背景特性展示（占位，背景编辑器待开发） */}
                    {char.backgroundCard?.backgroundId && (() => {
                      const selBg = getBackgroundById(char.backgroundCard.backgroundId)
                      const bgName = char.backgroundCard.customName || selBg?.name || '背景'
                      return (
                        <div className="mt-2 bg-white/[0.03] rounded-md border border-yellow-600/30 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">【{bgName}】背景特性</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">背景编辑器开发中...</p>
                        </div>
                      )
                    })()}
                  </div>
                  <div className="min-w-0 h-full">
                    <AvatarFrame char={char} canEdit={canEdit} onSave={persist} large />
                  </div>
                </div>

                {/* 人物背景故事（全宽，左右与上方对齐） */}
                <div className="mt-3">
                  <h3 className="profile-section-title mt-0 mb-1">人物背景故事</h3>
                  <div className="h-[120px]">
                    <BackstoryBlock char={char} canEdit={canEdit} onSave={persist} />
                  </div>
                </div>
              </>
            )}
          </section>
          {!isCreatureTemplate && (
            <section id="sheet-xp" className="character-sheet-section-anchor mt-3">
              <h3 className="section-title">经验与职业等级</h3>
              <div className="module-panel p-3">
                <ExperienceLevelSection char={char} level={level} canEdit={canEdit} onSave={persist} />
                <div id="sheet-class" className="mt-2 border-t border-white/10 pt-2">
                  <ClassSection char={char} level={level} canEdit={canEdit} onSave={persist} moduleId={sheetModuleId} referenceData={referenceData} baseReferenceData={baseReferenceData} formulaContext={buffFormulaContext} />
                </div>
              </div>
            </section>
          )}
          {!isCreatureTemplate && (
          <section id="sheet-abilities" className="character-sheet-section-anchor mt-6">
            <h3 className="section-title">属性与熟练</h3>
            <div className="module-panel">
              <AbilityModule
                char={char}
                abilities={char.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }}
                buffStats={buffStats}
                level={level}
                canEdit={canEdit}
                onSave={persist}
              />
            </div>
          </section>
          )}
          {!isCreatureTemplate && (
          <section id="sheet-buffs" className="character-sheet-section-anchor mt-6">
            <h3 className="section-title">被动BUFF</h3>
            <BuffManager
              buffs={mergedBuffs}
              cards={allCards}
              char={char}
              baseAbilities={char.abilities ?? {}}
              sourceNameOptions={sourceNameOptions}
              subordinates={subordinates}
              charClasses={charClasses}
              onSave={(buffsList) => {
                // 分离主动卡（含 charge_item）和被动 BUFF
                const activeCards = buffsList.filter(
                  (b) => Array.isArray(b.effects) && b.effects.some((e) => e.effectType === 'charge_item')
                )
                const passiveBuffs = buffsList.filter(
                  (b) => !(Array.isArray(b.effects) && b.effects.some((e) => e.effectType === 'charge_item'))
                )
                
                // 手动被动 BUFF 保存到 buffs[]
                const manual = passiveBuffs.filter(
                  (b) => !b.fromItem && !b.fromFeat && !b.fromInvocation && !b.fromFightingStyle && !b.fromClassFeature,
                )
                const selectedFeats = mergeFeatBuffPatchesFromMergedList(char, buffsList)
                const selectedInvocations = mergeInvocationBuffPatchesFromMergedList(char, buffsList)
                const selectedFightingStyles = mergeFightingStyleBuffPatchesFromMergedList(char, buffsList)
                
                // 主动卡保存到 cards[]（如果存在）
                const updates = { buffs: manual, selectedFeats, selectedInvocations, selectedFightingStyles }
                if (activeCards.length > 0 || (char.cards ?? []).length > 0) {
                  // 保留非主动卡的已有卡片，替换/添加新的主动卡
                  const existingNonActiveCards = (char.cards ?? []).filter(
                    (c) => !(c.buffEffects && c.buffEffects.some((e) => e.effectType === 'charge_item'))
                  )
                  updates.cards = [...existingNonActiveCards, ...activeCards]
                }
                
                persist(updates)
              }}
              onUseAbility={(card, patch, lines) => {
                // 应用资源扣除和效果
                if (patch && Object.keys(patch).length > 0) {
                  persist(patch)
                }
                console.log('[CharacterSheet] Ability used:', card.source, lines)
              }}
              stashBuffs={char.buffStash ?? []}
              onStashChange={canEdit ? (next) => persist({ buffStash: next }) : undefined}
              onApplyStashTemplate={
                canEdit
                  ? (template) => {
                      const clone = cloneBuffTemplateToManual(template)
                      if (!clone) return
                      const source = clone.source?.trim() ?? ''
                      const exists = (char.buffs ?? []).some((b) => (b.source?.trim() ?? '') === source)
                      if (exists) return
                      persist({ buffs: [...(char.buffs ?? []), clone] })
                    }
                  : undefined
              }
              buffColumnOrder={char.buffColumnOrder}
              canEdit={canEdit}
              referenceData={referenceData}
              baseReferenceData={baseReferenceData}
              formulaContext={buffFormulaContext}
              onEditRace={() => setRaceBuffEditorOpen(true)}
              onEditBackground={() => setBackgroundBuffEditorOpen(true)}
            />
          </section>
          )}
          {!isCreatureTemplate && (
          <section id="sheet-combat" className="character-sheet-section-anchor mt-6">
            <h3 className="section-title">战斗状态</h3>
            <CombatStatus
              char={char}
              hp={char.hp ?? { current: 0, max: 0, temp: 0 }}
              abilities={char.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }}
              level={level}
              canEdit={canEdit}
              onSave={persist}
              moduleId={sheetModuleId}
            />
          </section>
          )}
          {!isCreatureTemplate && (
          <section id="sheet-inventory" className="character-sheet-section-anchor mt-6">
            <h3 className="section-title">装备与背包</h3>
            <EquipmentAndInventory
              character={char}
              canEdit={canEdit}
              onSave={persist}
              onWalletSuccess={noop}
              activityActor={user?.name}
              activeAbilities={allCards.filter(c => c.slotKind === 'equipment').map(itemCard => {
                const ability = findActiveAbilityFromCard(itemCard.sourceKey, allCards, 'equipment')
                return ability ? { inventoryId: itemCard.sourceKey, ability } : null
              }).filter(Boolean)}
            />
          </section>
          )}
          {!isCreatureTemplate && (
          <section id="sheet-martial" className="character-sheet-section-anchor mt-6">
            <h3 className="section-title">武技</h3>
            <MartialTechniquesPanel
              char={char}
              canEdit={canEdit}
              onSave={persist}
            />
          </section>
          )}
          {!isCreatureTemplate && (
            <section id="sheet-features" className="character-sheet-section-anchor mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <h3 className="section-title">职业特性</h3>
                  <ClassFeaturesSection char={char} canEdit={canEdit} onSave={persist} isAdmin={isAdmin} referenceData={referenceData} baseReferenceData={baseReferenceData} formulaContext={buffFormulaContext} sheetModuleId={sheetModuleId} buffPatchRev={buffPatchRev} />
                </div>
                <div className="min-w-0">
                  <h3 className="section-title">专长</h3>
                  <FeatsSection char={char} level={level} canEdit={canEdit} onSave={persist} formulaContext={buffFormulaContext} sheetModuleId={sheetModuleId} buffPatchRev={buffPatchRev} referenceData={referenceData} baseReferenceData={baseReferenceData} />
                </div>
              </div>
            </section>
          )}
          <p className="mt-10 text-center text-xs text-dnd-text-muted">版本 {APP_VERSION_LABEL}</p>
        </>
      ) : null}

      {/* 种族主动技能释放弹窗 */}
      {raceActiveAbility && (
        <AbilityUseModal
          activeAbility={raceActiveAbility.ability}
          char={char}
          featureName={raceActiveAbility.traitName}
          onConfirm={(patch, lines) => {
            if (patch && Object.keys(patch).length > 0) persist(patch)
          }}
          onClose={() => setRaceActiveAbility(null)}
        />
      )}
    </div>
  )
}
