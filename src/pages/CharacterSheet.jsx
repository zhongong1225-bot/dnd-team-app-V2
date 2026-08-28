/**
 * 角色卡（重写版 - 从简出发，不依赖 formulas）
 * 含：角色名、外观/基础、经验与等级、职业、Buff、背包、同调位。
 * 备份于恢复战斗状态之前。
 */
import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, Trash2, Star, Upload, X, Plus, Settings, Zap, RefreshCw } from 'lucide-react'

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
import { ABILITY_NAMES_ZH } from '../data/buffTypes'
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
import CardView, { SlotPanel, AbilityButton } from '../components/CardView'
import EldritchInvocationPicker from '../components/EldritchInvocationPicker'
import FightingStylePicker from '../components/FightingStylePicker'
import CombatStatus from '../components/CombatStatus'
import EquipmentAndInventory from '../components/EquipmentAndInventory'
import MartialTechniquesPanel from '../components/MartialTechniquesPanel'
import AbilityModule from '../components/AbilityModule'
import AvatarCropModal from '../components/AvatarCropModal'
import CharacterSheetTopBar from '../components/CharacterSheetTopBar'
import FeatPickerModal from '../components/FeatPickerModal'
import BuffForm from '../components/BuffForm'
import { loadDefaultBuffPatch, saveDefaultBuffPatch, buildClassFeatureBuffKey } from '../lib/defaultBuffPatchStore'
import { CLASS_FEATURE_CHOICE_REGISTRY, CHOICE_ID_ALIASES } from '../data/classFeatureChoiceRegistry'
import { executeAbility, canUseAbility } from '../lib/activeAbilityEngine'
import { buildCardsFromCharacter, findActiveAbilityInCards, findAllActiveAbilitiesInCards } from '../lib/cardAdapter'
import { formatRecoveryBrief, buildAbilityDiceExpr, RESOURCE_TYPE_OPTIONS, normalizeChargeItemValue, computeScaledEffect, getMaxSpendableAmount, resolveAbilityMod } from '../lib/chargeItemModel'
import { rollDice } from '../data/weaponDatabase'
import { getCreatureById } from '../data/creatureLibrary'
import InfoTooltip from '../components/InfoTooltip'
import { ClassFeatureTooltipContent, FeatTooltipContent } from '../lib/infoTooltipContent'
import { APP_VERSION_LABEL } from '../config/version'

/** 选项专属 BUFF key：${sourceClass}|${sourceSubclass || ''}|${featureId}:${optionId} */
function buildClassFeatureOptionBuffKey(sourceClass, sourceSubclass, featureId, optionId) {
  return `${sourceClass}|${sourceSubclass || ''}|${featureId}:${optionId}`
}

/** 从 BUFF 条目查找专长对应的第一个主动技能（仅当有主动释放效果时） */
function findActiveAbilityForFeat(featId, cards) {
  if (!Array.isArray(cards) || !featId) return null
  const card = cards.find(c => c.slotKind === 'feat' && c.sourceKey === featId)
  if (!card) return null
  // 检查是否有 charge_item 效果（主动释放）
  const hasChargeItem = Array.isArray(card.buffEffects) && card.buffEffects.some(e => e.type === 'charge_item')
  if (!hasChargeItem) return null
  // 有主动释放才返回主动技能
  return card.activeAbility || null
}


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
        className="avatar-upload-zone w-full h-full min-h-[220px] aspect-square max-w-full flex flex-col items-center justify-center relative overflow-hidden"
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
  const [background, setBackground] = useState(app.background ?? '')
  const [race, setRace] = useState(app.race ?? '')
  const [size, setSize] = useState(app.size ?? '')
  const [weight, setWeight] = useState(app.weight ?? '')
  const [hair, setHair] = useState(app.hair ?? '')
  useEffect(() => {
    const a = char?.appearance ?? {}
    setAge(a.age ?? '')
    setAlignment(a.alignment ?? '')
    setEyes(a.eyes ?? '')
    setHeight(a.height ?? '')
    setSkin(a.skin ?? '')
    setBackground(a.background ?? '')
    setRace(a.race ?? '')
    setSize(a.size ?? '')
    setWeight(a.weight ?? '')
    setHair(a.hair ?? '')
  }, [char?.id])

  const appearanceData = () => ({ age, race, size, alignment, height, weight, hair, eyes, skin, background })
  const save = () => onSave({ appearance: appearanceData() })

  const cells = [
    { label: '年龄', value: age, set: setAge },
    { label: '阵营', value: alignment, set: setAlignment },
    { label: '瞳色', value: eyes, set: setEyes },
    { label: '身高', value: height, set: setHeight },
    { label: '肤色', value: skin, set: setSkin },
    { label: '背景', value: background, set: setBackground },
    { label: '种族', value: race, set: setRace },
    { label: '体重', value: weight, set: setWeight },
    { label: '发色', value: hair, set: setHair },
    { label: '体型', value: size, set: setSize },
  ]

  const inputCls = compact
    ? 'input-thin h-9 min-h-9 w-full max-w-full'
    : 'profile-input h-9 min-h-9 w-full max-w-full'
  const labelCls = compact ? 'form-label block' : 'profile-label block'

  const frameClass = noBorder ? 'p-0 min-w-0 w-full' : 'profile-section p-3 min-w-0 w-full'
  return (
    <div className={frameClass}>
      <div
        className={`grid w-full min-w-0 ${compact ? 'gap-x-2 gap-y-3' : 'gap-x-3 gap-y-3.5'}`}
        style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
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
function LevelStepper({ value, onChange, min = 0, max = 20, disabled }) {
  const v = Math.max(min, Math.min(max, Number(value) || 0))
  return (
    <div className="level-stepper-panel">
      <button
        type="button"
        disabled={disabled || v <= min}
        onClick={() => onChange(v - 1)}
        aria-label="减少"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <span>{v}</span>
      <button
        type="button"
        disabled={disabled || v >= max}
        onClick={() => onChange(v + 1)}
        aria-label="增加"
      >
        <ChevronUp className="w-4 h-4" />
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
  const [confirmingIdx, setConfirmingIdx] = useState(null)
  const [customAmount, setCustomAmount] = useState(1)
  const [maxAmount, setMaxAmount] = useState(1)

  const buffKey = buildClassFeatureBuffKey(feature.sourceClass, feature.sourceSubclass, feature.id)
  const defaultPatch = loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)
  const effects = Array.isArray(defaultPatch?.effects) ? defaultPatch.effects : []
  const chargeEffects = effects.filter((e) => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')

  /* ── 主动技能（从卡查找，支持多个，仅当有主动释放效果时）── */
  const classes = getCharacterClasses(char)
  const cls = classes.find((c) => c.name === feature.sourceClass)
  const classLevel = cls?.level || 1
  const subclass = cls?.subclass || ''
  const cards = buildCardsFromCharacter(char, moduleId)
  // 查找对应的卡，检查是否有 charge_item 效果
  const featureCard = cards.find(c => 
    c.slotKind === 'class' && 
    c.sourceKey === `${feature.sourceClass}|${feature.sourceSubclass || ''}|${feature.id}`
  )
  const hasChargeItemEffect = featureCard && Array.isArray(featureCard.buffEffects) && 
    featureCard.buffEffects.some(e => e.type === 'charge_item')
  // 只有有主动释放效果时才显示主动技能按钮
  const abilities = hasChargeItemEffect 
    ? findAllActiveAbilitiesInCards(cards, feature.sourceClass, feature.id, { level: classLevel, subclass })
    : []
  const abilityChecks = abilities.map((ab) => ({ ability: ab, check: canUseAbility(ab, char) }))
  const getAbilityCostText = (ab) => {
    if (ab?.cost?.type === 'class_resource') {
      const shortLabels = { wild_shape: '变', second_wind: '气', lay_on_hands: '疗', focus_points: '专注' }
      const label = shortLabels[ab.cost.resourceKey] || ''
      return `${ab.cost.amount}${label}`
    }
    return ab?.cost?.type === 'none' ? '免费' : ''
  }

  useEffect(() => {
    if (!lastResult) return
    const timer = setTimeout(() => setLastResult(null), 4000)
    return () => clearTimeout(timer)
  }, [lastResult])

  /* ── 辅助：计算法术 DC（简化版，不含 buffStats） ── */
  const computeSpellDC = useCallback(() => {
    if (!char) return null
    const totalLevel = getCharacterClasses(char).reduce((s, c) => s + (c.level || 0), 0) || 1
    const L = Math.max(1, Math.min(20, Math.floor(totalLevel)))
    const prof = proficiencyBonus(L)
    const spellAbility = getPrimarySpellcastingAbility(char)
    if (!spellAbility) return null
    const mod = abilityModifier(char.abilities?.[spellAbility] ?? 10)
    return 8 + prof + mod
  }, [char])

  const computeSpellAttack = useCallback(() => {
    if (!char) return null
    const totalLevel = getCharacterClasses(char).reduce((s, c) => s + (c.level || 0), 0) || 1
    const L = Math.max(1, Math.min(20, Math.floor(totalLevel)))
    const prof = proficiencyBonus(L)
    const spellAbility = getPrimarySpellcastingAbility(char)
    if (!spellAbility) return null
    const mod = abilityModifier(char.abilities?.[spellAbility] ?? 10)
    return prof + mod
  }, [char])

  const getResourceLabel = (resourceType) => {
    return RESOURCE_TYPE_OPTIONS.find((o) => o.value === resourceType)?.label ?? resourceType
  }

  /* ── 打开确认弹窗 ── */
  const openConfirm = (idx, chargeValue) => {
    const norm = normalizeChargeItemValue(chargeValue)
    const maxSpend = getMaxSpendableAmount(norm, char)
    setMaxAmount(maxSpend)
    setCustomAmount(1)
    setConfirmingIdx(idx)
  }

  /* ── 确认使用：执行效果 + 扣除资源 ── */
  const handleConfirmUse = () => {
    if (confirmingIdx === null || !char || !onSave) return
    const chargeValue = chargeEffects[confirmingIdx]?.value
    if (!chargeValue) return
    const norm = normalizeChargeItemValue(chargeValue)
    const amt = customAmount
    const patch = {}
    const resultLines = []

    /* 1. 资源消耗（按选择数量扣除） */
    const isSpellSlot = /^spell_slot_[1-9]$/.test(norm.resourceType)
    const isClassResource = norm.resourceType !== 'charges' && !isSpellSlot
    if (isSpellSlot) {
      const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
      const currentSlots = { ...(char.spellSlots || {}) }
      const current = currentSlots[ring] || 0
      const newCurrent = Math.max(0, current - amt)
      if (newCurrent !== current) {
        currentSlots[ring] = newCurrent
        patch.spellSlots = currentSlots
      }
      resultLines.push(`消耗 ${amt} 个${ring}环法术位（剩余 ${newCurrent}）`)
    } else if (isClassResource) {
      const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
      if (res) {
        const newResources = (char.classResources || []).map((r) => {
          if (r.resourceKey !== norm.resourceType) return r
          return { ...r, current: Math.max(0, r.current - amt) }
        })
        patch.classResources = newResources
      }
      resultLines.push(`消耗 ${amt} ${getResourceLabel(norm.resourceType)}`)
    } else {
      resultLines.push(`消耗 ${amt} 充能（共 ${norm.charges}）`)
    }

    /* 2. 逐个处理效果（使用缩放后的数值） */
    for (const eff of (norm.effects || [])) {
      const ev = eff.value || {}
      const scaled = computeScaledEffect(ev, amt)

      if (eff.type === 'spell') {
        const spellName = ev.spellName || '(未命名法术)'
        const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)

        if (ev.hitResolution === 'spell_attack') {
          const atkBonus = computeSpellAttack()
          const d20 = rollDice('1d20')
          resultLines.push(
            `${spellName} 攻击: d20=${d20.total}${atkBonus != null ? `${atkBonus >= 0 ? '+' : ''}${atkBonus}` : ''} = ${d20.total + (atkBonus || 0)}`,
          )
        } else if (ev.hitResolution && ev.hitResolution !== 'none') {
          const dc = computeSpellDC()
          const saveLabel = ev.hitResolution.replace('_save', '')
          resultLines.push(`${spellName} 豁免DC ${dc ?? '?'} (${saveLabel})`)
        } else {
          resultLines.push(`${spellName}`)
        }

        if (scaledDice > 0) {
          const diceExpr = `${scaledDice}d${ev.damageDiceSides || 6}`
          const { total, rolls } = rollDice(diceExpr)
          const damageType = ev.damageType || ''
          resultLines.push(`  伤害: ${rolls.join('+')} = ${total}${damageType ? ` ${damageType}` : ''}`)
        }
      } else if (eff.type === 'ability') {
        const scaledDice = scaled.diceCount ?? (ev.diceCount || 0)
        const scaledFlat = scaled.flatBonus ?? 0
        const sides = ev.diceSides || 10
        const mod = resolveAbilityMod(ev.abilityMod, char)
        const totalMod = mod + scaledFlat

        if (scaledDice > 0) {
          let diceExpr = `${scaledDice}d${sides}`
          if (totalMod > 0) diceExpr += `+${totalMod}`
          else if (totalMod < 0) diceExpr += `${totalMod}`
          const { total, rolls } = rollDice(diceExpr)
          const isHeal = ev.resultType !== 'damage'
          const modLabel = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : ''
          const diceStr = rolls.length > 0 ? rolls.join('+') : `${scaledDice}d${sides}`

          if (isHeal) {
            const currentHp = Number(char.hp?.current) || 0
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const newHp = Math.min(maxHp, currentHp + total)
            patch.hp = { ...char.hp, current: newHp }
            resultLines.push(`💚 治疗: ${diceStr}${modLabel} = ${total}`)
          } else {
            const currentHp = Number(char.hp?.current) || 0
            const newHp = Math.max(0, currentHp - total)
            patch.hp = { ...char.hp, current: newHp }
            resultLines.push(`⚔️ 伤害: ${diceStr}${modLabel} = ${total}`)
          }
        } else if (ev.text) {
          resultLines.push(ev.text)
        }
      } else if (eff.type === 'shield') {
        const scaledAmount = scaled.amount ?? (ev.amount || 1)
        resultLines.push(`🛡️ 护盾: ${scaledAmount}`)
      } else if (eff.type === 'temp_buff') {
        const buffName = (ev.buffName || '临时BUFF').trim()
        const modules = Array.isArray(ev.modules) ? ev.modules : []
        if (modules.length > 0) {
          const newBuff = {
            id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
            source: buffName,
            effects: modules.map((m) => ({ ...m })),
            enabled: true,
            sourceKind: 'temporary',
          }
          const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
          patch.buffs = [...currentBuffs, newBuff]
          resultLines.push(`✨ 安装临时BUFF: ${buffName}（${modules.length}个效果）`)
        } else {
          resultLines.push(`⚠️ ${buffName}：无效果模块`)
        }
      } else if (eff.type === 'creature_transform') {
        const creature = ev.creatureId ? getCreatureById(ev.creatureId) : null
        const creatureName = creature?.name || '(未选择生物)'
        resultLines.push(`🐾 变身: ${creatureName}`)
      } else if (eff.type === 'restore_spell_slots') {
        const maxSlots = getMaxSpellSlotsByRing(char)
        const currentSlots = { ...(char.spellSlots || {}) }
        const newSlots = { ...currentSlots }
        const scaledSlots = scaled.slotsCount || 1

        if (ev.mode === 'multi') {
          const maxRing = ev.maxRing || 3
          for (let ring = 1; ring <= maxRing; ring++) {
            const max = maxSlots[ring] || 0
            if (max > 0) newSlots[ring] = max
          }
        } else {
          const targetRing = ev.ringLevel || 1
          let slotsToRestore = scaledSlots
          for (let ring = targetRing; ring >= 1 && slotsToRestore > 0; ring--) {
            const max = maxSlots[ring] || 0
            const current = currentSlots[ring] || 0
            const canRestore = Math.min(slotsToRestore, max - current)
            if (canRestore > 0) {
              newSlots[ring] = current + canRestore
              slotsToRestore -= canRestore
            }
          }
        }

        if (JSON.stringify(newSlots) !== JSON.stringify(currentSlots)) {
          patch.spellSlots = newSlots
          const restored = []
          for (let r = 1; r <= 9; r++) {
            const diff = (newSlots[r] || 0) - (currentSlots[r] || 0)
            if (diff > 0) restored.push(`${r}环+${diff}`)
          }
          resultLines.push(`🔮 恢复法术位: ${restored.join(', ')}`)
        } else {
          resultLines.push(`🔮 法术位已满，无需恢复`)
        }
      } else if (eff.type === 'summon') {
        if (ev.preset === 'stellar_double') {
          // 星辰替身：消耗当前生命值的一半（不含临时生命），创建分身
          const currentHp = Number(char.hp?.current) || 0
          const tempHp = Number(char.hp?.temp) || 0
          const realCurrentHp = Math.max(0, currentHp - tempHp) // 不含临时生命
          const hpCost = Math.floor(realCurrentHp / 2)
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const cloneHp = Math.floor(maxHp / 2)

          // 扣除生命值
          const newHp = Math.max(0, currentHp - hpCost)
          patch.hp = { ...char.hp, current: newHp }

          // 创建分身数据
          const cloneData = {
            id: 'stellar_double_' + Date.now(),
            name: `${char.name}的分身`,
            type: 'stellar_double',
            hp: { current: cloneHp, max: cloneHp },
            createdAt: Date.now(),
          }

          // 添加到召唤生物列表
          const currentSummons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
          patch.summonedCreatures = [...currentSummons, cloneData]

          resultLines.push(`⭐ 星辰替身：消耗 ${hpCost} 点生命值，创建分身（${cloneHp}/${cloneHp} HP）`)
        } else {
          // 普通召唤
          const creatureName = ev.creatureId || '未命名生物'
          resultLines.push(`📦 召唤: ${creatureName}`)
        }
      }
    }

    if (resultLines.length === 0) resultLines.push('(未配置效果)')

    onSave(patch)
    setLastResult({ lines: resultLines })
    setConfirmingIdx(null)
  }

  if (abilityChecks.length === 0 && chargeEffects.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {/* 主动技能按钮（支持多个） */}
      {abilityChecks.map(({ ability: ab, check }) => (
        <button
          key={ab.id}
          type="button"
          disabled={!check.usable}
          onClick={(e) => {
            e.stopPropagation()
            const result = executeAbility(ab, char)
            if (result.success) {
              const patches = { ...result.patch }
              if (result.classResources) patches.classResources = result.classResources
              if (Object.keys(patches).length > 0) onSave(patches)
            }
          }}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all active:scale-[0.98] ${
            check.usable
              ? 'bg-dnd-gold/10 text-dnd-gold-light border-dnd-gold/30 hover:bg-dnd-gold/20 hover:border-dnd-gold/50'
              : 'bg-gray-800/50 text-gray-500 border-gray-600/50 cursor-not-allowed'
          }`}
          title={check.usable ? `点击使用${ab.name}` : check.reason}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{ab.name}</span>
          {getAbilityCostText(ab) && <span className="text-[10px] opacity-70">{getAbilityCostText(ab)}</span>}
        </button>
      ))}

      {/* 充能/BUFF 效果按钮 */}
      {chargeEffects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
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
                onClick={() => openConfirm(idx, cv)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/30 hover:bg-dnd-gold/30 transition-colors"
                title={resourceType === 'charges' ? `${charges} 充能 | ${recoveryLabel}` : `消耗: ${resLabel}`}
              >
                <Zap className="w-3 h-3" />
                使用 {feature.name}
                {resourceType === 'charges' && charges > 0 && (
                  <span className="text-[10px] opacity-70">({charges})</span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {lastResult && (
        <div className="w-full mt-1 text-[11px] text-gray-300 space-y-0.5">
          {lastResult.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* ── 确认弹窗 ── */}
      {confirmingIdx !== null && chargeEffects[confirmingIdx] && (() => {
        const cv = chargeEffects[confirmingIdx].value
        const norm = normalizeChargeItemValue(cv)
        const isSpellSlot = /^spell_slot_[1-9]$/.test(norm.resourceType)
        const isClassResource = norm.resourceType !== 'charges' && !isSpellSlot
        const resLabel = getResourceLabel(norm.resourceType)
        const amt = customAmount
        const hasScaling = norm.effects.some((e) => e.value?.scalingEnabled)

        return (
          <>
            <div className="fixed inset-0 z-[400] bg-black/60" onClick={() => setConfirmingIdx(null)} aria-hidden />
            <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={() => setConfirmingIdx(null)}>
              <div
                className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-dnd-gold-light">使用 {feature.name}</h3>
                  <button type="button" onClick={() => setConfirmingIdx(null)} className="text-gray-400 hover:text-white">
                    <X size={14} />
                  </button>
                </div>

                {/* 消耗数量选择 */}
                <div className="flex items-center gap-x-2 mb-3">
                  <span className="text-xs text-gray-300">消耗数量</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCustomAmount(Math.max(1, amt - 1))}
                      className="w-6 h-6 rounded bg-gray-700/60 text-gray-300 hover:bg-gray-600/80 flex items-center justify-center text-sm font-bold transition-colors"
                    >−</button>
                    <span className="w-8 text-center text-sm font-bold text-dnd-gold-light tabular-nums">{amt}</span>
                    <button
                      type="button"
                      onClick={() => setCustomAmount(Math.min(maxAmount, amt + 1))}
                      className="w-6 h-6 rounded bg-gray-700/60 text-gray-300 hover:bg-gray-600/80 flex items-center justify-center text-sm font-bold transition-colors"
                    >+</button>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {isSpellSlot
                      ? `${resLabel}（剩余 ${(() => { const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10); return char.spellSlots?.[ring] ?? 0 })()}）`
                      : isClassResource
                      ? `${resLabel}（剩余 ${(() => { const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType); return res ? `${res.current}/${res.max}` : '?' })()}）`
                      : `充能（总 ${norm.charges}）`
                    }
                  </span>
                </div>

                {/* 效果列表（显示缩放后的数值） */}
                {(norm.effects || []).length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">效果</div>
                    {norm.effects.map((eff, i) => {
                      const ev = eff.value || {}
                      const scaled = computeScaledEffect(ev, amt)
                      if (eff.type === 'spell') {
                        const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)
                        const diceExpr = scaledDice > 0 ? `${scaledDice}d${ev.damageDiceSides || 6}` : ''
                        return (
                          <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shrink-0" />
                            <span className="text-cyan-300">{ev.spellName || '(未命名法术)'}</span>
                            {ev.hitResolution && ev.hitResolution !== 'none' && (
                              <span className="text-[10px] text-gray-500">
                                {ev.hitResolution === 'spell_attack' ? '法术攻击' : `${ev.hitResolution.replace('_save', '')}豁免`}
                              </span>
                            )}
                            {diceExpr && (
                              <span className="text-[10px] text-red-400/80">{diceExpr}{ev.damageType ? ` ${ev.damageType}` : ''}</span>
                            )}
                            {hasScaling && amt > 1 && ev.scalingEnabled && (
                              <span className="text-[9px] text-amber-400/60">×{amt}</span>
                            )}
                          </div>
                        )
                      }
                      if (eff.type === 'ability') {
                        const scaledDice = scaled.diceCount ?? (ev.diceCount || 0)
                        const scaledFlat = scaled.flatBonus ?? 0
                        const sides = ev.diceSides || 10
                        const mod = resolveAbilityMod(ev.abilityMod, char)
                        const totalMod = mod + scaledFlat
                        let expr = ''
                        if (scaledDice > 0) {
                          expr = `${scaledDice}d${sides}`
                          if (totalMod > 0) expr += `+${totalMod}`
                          else if (totalMod < 0) expr += `${totalMod}`
                        }
                        return (
                          <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.resultType === 'damage' ? 'bg-red-400/60' : 'bg-green-400/60'}`} />
                            <span>{ev.text || '(能力)'}</span>
                            {expr && (
                              <span className={`text-[10px] ${ev.resultType === 'damage' ? 'text-red-400/80' : 'text-green-400/80'}`}>
                                {expr} {ev.resultType === 'damage' ? '伤害' : '治疗'}
                              </span>
                            )}
                            {hasScaling && amt > 1 && ev.scalingEnabled && (
                              <span className="text-[9px] text-amber-400/60">×{amt}</span>
                            )}
                          </div>
                        )
                      }
                      if (eff.type === 'shield') {
                        const scaledAmount = scaled.amount ?? (ev.amount || 1)
                        return (
                          <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 shrink-0" />
                            <span>护盾 {scaledAmount}</span>
                            {hasScaling && amt > 1 && ev.scalingEnabled && (
                              <span className="text-[9px] text-amber-400/60">×{amt}</span>
                            )}
                          </div>
                        )
                      }
                      if (eff.type === 'creature_transform') {
                        const creature = ev.creatureId ? getCreatureById(ev.creatureId) : null
                        return (
                          <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400/60 shrink-0" />
                            <span className="text-rose-300">变身: {creature?.name || '(未选择生物)'}</span>
                          </div>
                        )
                      }
                      if (eff.type === 'restore_spell_slots') {
                        const label = ev.mode === 'multi'
                          ? `恢复 ${ev.maxRing || 3} 环及以下法术位`
                          : `恢复 ${ev.ringLevel || 1} 环法术位`
                        return (
                          <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 shrink-0" />
                            <span className="text-sky-300">{label}</span>
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                )}

                {/* 确认 / 取消 */}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingIdx(null)}
                    className="px-3 py-1.5 rounded-md text-xs bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-600/50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmUse}
                    disabled={amt < 1 || amt > maxAmount}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/40 hover:bg-dnd-gold/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    确认使用{amt > 1 ? ` (${amt})` : ''}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}
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

/** 职业特性：根据当前职业与等级自动展示，不可手动增删 */
function ClassFeaturesSection({ char, canEdit, onSave, isAdmin }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)
  const [expandedFeatureIds, setExpandedFeatureIds] = useState(new Set())
  const [buffEditorFeature, setBuffEditorFeature] = useState(null)
  const [buffEditorOption, setBuffEditorOption] = useState(null) // { feature, optionId, optionLabel }
  const [choiceModalFeature, setChoiceModalFeature] = useState(null)
  const toggleFeatureExpand = (key) => {
    setExpandedFeatureIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const available = useMemo(() => getAvailableFeatures(char), [char])
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
          return (
            <li key={key}>
              <CardView
                name={name}
                subtitle={`${f.sourceClass}${f.sourceSubclass ? `（${f.sourceSubclass}）` : ''} · ${f.level} 级`}
                description={descText}
                expanded={isExpanded}
                onToggleExpand={() => toggleFeatureExpand(key)}
                headerLeft={
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
                    triggerClassName="inline"
                  >
                    <span
                      className="text-base font-bold text-white cursor-pointer select-none hover:text-gray-100 transition-colors truncate block"
                      onClick={() => toggleFeatureExpand(key)}
                    >
                      {name}
                    </span>
                  </InfoTooltip>
                }
                headerRight={
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
              </CardView>
            </li>
          )
        })}
      </ul>

      {/* BUFF 编辑器弹窗 */}
      {buffEditorFeature && (
        <>
          <div
            className="fixed inset-0 z-[300] bg-black/60"
            onClick={() => setBuffEditorFeature(null)}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[301] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={() => setBuffEditorFeature(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-dnd-gold-light/90">
                    配置 BUFF：{buffEditorFeature.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setBuffEditorFeature(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-dnd-text-muted mt-1">
                  {isAdmin
                    ? 'DM 配置默认 BUFF 效果，玩家选择该特性时自动获得。'
                    : '查看该职业特性的 BUFF 效果（只读）。'}
                </p>
                {buffEditorFeature.description && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                    {resolveRuleText(
                      overridesMap,
                      buffEditorFeature.sourceSubclass
                        ? buildSubclassFeatureKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id)
                        : buildClassFeatureKey(buffEditorFeature.sourceClass, buffEditorFeature.id),
                      buffEditorFeature.description,
                    )}
                  </div>
                )}
              </div>
              <div className="p-4">
                <BuffForm
                  key={`cf-buff-${buffEditorFeature.sourceClass}-${buffEditorFeature.sourceSubclass || ''}-${buffEditorFeature.id}`}
                  compact
                  readOnly={!isAdmin}
                  hideDuration
                  initial={{
                    source: `${buffEditorFeature.sourceClass}-${buffEditorFeature.name}`,
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
                  }}
                  onSave={(buff) => {
                    saveDefaultBuffPatch(
                      moduleId,
                      'classFeature',
                      buildClassFeatureBuffKey(buffEditorFeature.sourceClass, buffEditorFeature.sourceSubclass, buffEditorFeature.id),
                      {
                        effects: buff.effects,
                        enabled: buff.enabled,
                        sourceName: `${buffEditorFeature.sourceClass}-${buffEditorFeature.name}`,
                      },
                    )
                    setBuffEditorFeature(null)
                  }}
                  onCancel={() => setBuffEditorFeature(null)}
                />
              </div>
            </div>
          </div>
        </>
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
        <>
          <div
            className="fixed inset-0 z-[300] bg-black/60"
            onClick={() => setBuffEditorOption(null)}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[301] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={() => setBuffEditorOption(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-dnd-gold-light/90">
                    配置 BUFF：{buffEditorOption.feature.name} — {buffEditorOption.optionLabel}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setBuffEditorOption(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-dnd-text-muted mt-1">
                  {isAdmin
                    ? 'DM 配置该选项的默认 BUFF 效果，玩家选择该选项时自动获得。'
                    : '查看该选项的 BUFF 效果（只读）。'}
                </p>
              </div>
              <div className="p-4">
                <BuffForm
                  key={`cf-opt-buff-${buffEditorOption.feature.sourceClass}-${buffEditorOption.feature.sourceSubclass || ''}-${buffEditorOption.feature.id}-${buffEditorOption.optionId}`}
                  compact
                  readOnly={!isAdmin}
                  hideDuration
                  initial={{
                    source: `${buffEditorOption.feature.sourceClass}-${buffEditorOption.feature.name}（${buffEditorOption.optionLabel}）`,
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
                      // 回退到硬编码默认效果
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
                  }}
                  onSave={(buff) => {
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
                      },
                    )
                    setBuffEditorOption(null)
                  }}
                  onCancel={() => setBuffEditorOption(null)}
                />
              </div>
            </div>
          </div>
        </>
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
function FeatsSection({ char, level, canEdit, onSave, formulaContext }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)
  const [expandedFeatIds, setExpandedFeatIds] = useState(new Set())
  const [featBuffEditor, setFeatBuffEditor] = useState(null) // { row, slot } for feat BUFF editor
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

  // 构建一次卡数组，供所有专长查找主动技能复用
  const featCards = useMemo(() => buildCardsFromCharacter(char, moduleId), [char, moduleId])

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
            const hasActiveAbility = row?.featId ? !!findActiveAbilityForFeat(row.featId, featCards) : false

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
                    canEdit && row?.featId ? (
                      <div className="flex items-center gap-1.5 shrink-0">
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
                    ) : canEdit && !row?.featId ? (
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
                      <AbilityButton
                        name={ability.name}
                        costText={costText}
                        usable={check.usable}
                        disabledReason={check.reason}
                        onUse={() => {
                          const result = executeAbility(ability, char)
                          if (result.success) {
                            const patches = { ...result.patch }
                            if (result.classResources) patches.classResources = result.classResources
                            if (Object.keys(patches).length > 0) onSave(patches)
                          }
                        }}
                      />
                    )
                  })() : null}
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
                      <button
                        type="button"
                        onClick={() => removeFreeFeat(i)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all active:scale-95"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
                      <AbilityButton
                        name={ability.name}
                        costText={costText}
                        usable={check.usable}
                        disabledReason={check.reason}
                        onUse={() => {
                          const result = executeAbility(ability, char)
                          if (result.success) {
                            const patches = { ...result.patch }
                            if (result.classResources) patches.classResources = result.classResources
                            if (Object.keys(patches).length > 0) onSave(patches)
                          }
                        }}
                      />
                    )
                  })() : null}
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
          <>
            <div
              className="fixed inset-0 z-[300] bg-black/60"
              onClick={() => setFeatBuffEditor(null)}
              aria-hidden
            />
            <div
              className="fixed inset-0 z-[301] flex items-center justify-center p-4 sm:p-8 overflow-auto"
              onClick={() => setFeatBuffEditor(null)}
            >
              <div
                className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-dnd-gold-light/90">
                      编辑专长效果：{featName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setFeatBuffEditor(null)}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-dnd-text-muted mt-1">
                    自定义该专长的 BUFF 效果，保存后立即生效。
                  </p>
                </div>
                <div className="p-4">
                  <BuffForm
                    key={`feat-buff-${editFeatId}`}
                    compact
                    hideDuration
                    initial={{
                      source: `feat-${editFeatId}`,
                      effects: initialEffects,
                      enabled: editRow?.featBuffPatch?.enabled !== false,
                    }}
                    onSave={(buff) => {
                      const raw = char?.selectedFeats ?? []
                      const updated = raw.map((f) => {
                        if (f?.slotId !== editRow.slotId && f?.featId !== editFeatId) return f
                        const next = { ...f }
                        if (buff.effects.length > 0) {
                          next.featBuffPatch = { effects: buff.effects, enabled: buff.enabled }
                        } else {
                          delete next.featBuffPatch
                        }
                        return next
                      })
                      onSave({ selectedFeats: updated })
                      setFeatBuffEditor(null)
                    }}
                    onCancel={() => setFeatBuffEditor(null)}
                  />
                </div>
              </div>
            </div>
          </>
        )
      })()}
    </SlotPanel>
  )
}

/** 职业：起始职业、兼职、进阶、施法等级汇总、职业特性（等级上限由经验等级决定） */
function ClassSection({ char, level, canEdit, onSave, moduleId }) {
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
  }, [char?.id])
  const prestigeLevelSum = prestige.reduce((s, p) => s + (p.level || 0), 0)
  const totalClassLevels = classLevel + multiclass.reduce((s, m) => s + (m.level || 0), 0) + prestigeLevelSum
  const overCap = totalClassLevels > maxLevel

  // 子职特性 BUFF 编辑器
  const [subclassFeatureEditor, setSubclassFeatureEditor] = useState(null) // { feature }
  const [subclassBuffEditor, setSubclassBuffEditor] = useState(null) // { feature } for BUFF editor modal

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

  const selectClass = 'panel-select panel-class-control-h min-w-[7rem]'
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
                <div className="w-[6.25rem] shrink-0">
                  <LevelStepper
                    value={classLevel}
                    onChange={setMainLevel}
                    min={1}
                    max={Math.max(1, maxLevel - multiclass.reduce((s, m) => s + (m.level || 0), 0) - prestigeLevelSum)}
                    disabled={!classVal}
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
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all active:scale-90"
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
                      <div className="w-[6.25rem] shrink-0">
                        <LevelStepper value={m.level} onChange={(n) => setMulticlassRow(i, 'level', n)} min={0} max={rowMax} disabled={!m['class']} />
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
                        className={`${CS_ICON_BTN} text-[var(--text-muted)] hover:text-[var(--btn-primary)]`}
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
                        <LevelStepper value={p.level} onChange={(n) => setPrestigeRow(i, 'level', n)} min={0} max={rowMax} disabled={!p['class']} />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePrestigeRow(i)}
                        className={`${CS_ICON_BTN} text-[var(--text-muted)] hover:text-[var(--btn-primary)]`}
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
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all active:scale-90"
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
          <>
            <div className="fixed inset-0 z-[400] bg-black/60" onClick={() => setSubclassBuffEditor(null)} aria-hidden />
            <div className="fixed inset-0 z-[401] flex items-center justify-center p-4 sm:p-8 overflow-auto" onClick={() => setSubclassBuffEditor(null)}>
              <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-dnd-gold-light/90">
                      配置 BUFF：{feature.name}
                    </h3>
                    <button type="button" onClick={() => setSubclassBuffEditor(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-dnd-text-muted mt-1">配置该子职特性的默认 BUFF 效果，角色选择该子职时自动获得。</p>
                  {feature.description && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                      {feature.description}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <BuffForm
                    key={`sc-buff-${scClassName}-${subclassName}-${feature.id}`}
                    compact
                    readOnly={!canEdit}
                    hideDuration
                    initial={{
                      source: `${scClassName}-${feature.name}`,
                      effects: (() => {
                        const patch = loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)
                        if (patch && Array.isArray(patch.effects) && patch.effects.length) return patch.effects
                        return HARDCODED_CLASS_FEATURE_BUFFS[buffKey] || []
                      })(),
                      enabled: (() => {
                        const patch = loadDefaultBuffPatch(moduleId, 'classFeature', buffKey)
                        return patch?.enabled !== false
                      })(),
                    }}
                    onSave={(buff) => {
                      saveDefaultBuffPatch(moduleId, 'classFeature', buffKey, {
                        effects: buff.effects,
                        enabled: buff.enabled,
                        sourceName: `${scClassName}-${feature.name}`,
                      })
                      setSubclassBuffEditor(null)
                    }}
                    onCancel={() => setSubclassBuffEditor(null)}
                  />
                </div>
              </div>
            </div>
          </>
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
      sheetModuleId,
    ],
  )
  const buffStats = useBuffCalculator(char, mergedBuffs)

  // 自动同步 BUFF 中的工具/乐器熟练项到 char.proficiencies.tools
  useEffect(() => {
    if (!char) return
    const buffTools = new Set()
    for (const buff of mergedBuffs) {
      for (const eff of getEffectsFromBuff(buff)) {
        if (eff.effectType === 'specific_tool_proficiency' && Array.isArray(eff.value)) {
          eff.value.forEach((t) => buffTools.add(t))
        }
      }
    }
    const desired = [...buffTools].sort()
    const current = [...(char.proficiencies?.tools ?? [])].sort()
    if (JSON.stringify(desired) !== JSON.stringify(current)) {
      persist({ proficiencies: { ...(char.proficiencies ?? {}), tools: desired } })
    }
  }, [mergedBuffs])

  const canEdit = isAdmin || char?.owner === user?.name
  const isCreatureTemplate = char?.subordinateTemplate === 'creature'

  const characterClasses = useMemo(() => (char ? getCharacterClasses(char) : []), [char])
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
              <div className="grid grid-cols-1 items-stretch lg:grid-cols-[1fr_1fr] min-h-[280px] lg:gap-[2ch]">
                <div className="min-w-0 flex flex-col gap-2 lg:gap-1.5 min-h-0">
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
                  <h3 className="profile-section-title mt-0.5 mb-0.5">外观 / 基础</h3>
                  <AppearanceGrid char={char} canEdit={canEdit} onSave={persist} noBorder compact />
                  <h3 className="profile-section-title mt-2 mb-1 shrink-0">人物背景故事</h3>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <BackstoryBlock char={char} canEdit={canEdit} onSave={persist} fillHeight />
                  </div>
                </div>
                <div
                  className="character-sheet-profile-avatar-sticky min-w-0 flex flex-col min-h-[200px] lg:min-h-0 lg:aspect-square lg:w-full"
                >
                  <AvatarFrame char={char} canEdit={canEdit} onSave={persist} large />
                </div>
              </div>
            )}
          </section>
          {!isCreatureTemplate && (
            <section id="sheet-xp" className="character-sheet-section-anchor mt-3">
              <h3 className="section-title">经验与职业等级</h3>
              <div className="module-panel p-3">
                <ExperienceLevelSection char={char} level={level} canEdit={canEdit} onSave={persist} />
                <div id="sheet-class" className="mt-2 border-t border-white/10 pt-2">
                  <ClassSection char={char} level={level} canEdit={canEdit} onSave={persist} moduleId={sheetModuleId} />
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
            <h3 className="section-title">Buff / 状态</h3>
            <BuffManager
              buffs={mergedBuffs}
              baseAbilities={char.abilities ?? {}}
              sourceNameOptions={sourceNameOptions}
              subordinates={subordinates}
              onSave={(buffsList) => {
                const manual = buffsList.filter(
                  (b) => !b.fromItem && !b.fromFeat && !b.fromInvocation && !b.fromFightingStyle && !b.fromClassFeature,
                )
                const selectedFeats = mergeFeatBuffPatchesFromMergedList(char, buffsList)
                const selectedInvocations = mergeInvocationBuffPatchesFromMergedList(char, buffsList)
                const selectedFightingStyles = mergeFightingStyleBuffPatchesFromMergedList(char, buffsList)
                persist({ buffs: manual, selectedFeats, selectedInvocations, selectedFightingStyles })
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
              onBuffColumnOrderChange={canEdit ? (order) => persist({ buffColumnOrder: order }) : undefined}
              canEdit={canEdit}
              referenceData={referenceData}
              baseReferenceData={baseReferenceData}
              formulaContext={buffFormulaContext}
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
                  <ClassFeaturesSection char={char} canEdit={canEdit} onSave={persist} isAdmin={isAdmin} />
                </div>
                <div className="min-w-0">
                  <h3 className="section-title">专长</h3>
                  <FeatsSection char={char} level={level} canEdit={canEdit} onSave={persist} formulaContext={buffFormulaContext} />
                </div>
              </div>
            </section>
          )}
          <p className="mt-10 text-center text-xs text-dnd-text-muted">版本 {APP_VERSION_LABEL}</p>
        </>
      ) : null}
    </div>
  )
}
