/**
 * 角色卡（重写版 - 从简出发，不依赖 formulas）
 * 含：角色名、外观/基础、经验与等级、职业、Buff、背包、同调位。
 * 备份于恢复战斗状态之前。
 */
import { useState, useEffect, useCallback, useRef, useMemo, forwardRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, Trash2, Star, Upload, X, Plus } from 'lucide-react'
import DragHandleIcon from '../components/DragHandleIcon'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getCharacter, updateCharacter, loadCharacterById, getCharactersInModule } from '../lib/characterStore'
import { isSupabaseEnabled } from '../lib/supabase'
import { mergeCharacterPatch, mergePatchesList } from '../lib/mergeCharacterPatch'
import { resolveCreatureHpDisplay } from '../lib/creatureHpDisplay'
import { levelFromXP, xpForLevel } from '../lib/xp5e'
import { proficiencyBonus, abilityModifier } from '../lib/formulas'
import {
  getSpellcastingLevel,
  ALL_CLASS_NAMES,
  getClassDisplayName,
  getSubclassOptions,
  getAvailableFeatures,
  resolveSelectedFeatures,
  getPrimarySpellcastingAbility,
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
import { useCombatState } from '../hooks/useCombatState'
import { useBuffCalculator } from '../hooks/useBuffCalculator'
import {
  getMergedBuffsForCalculator,
  mergeFeatBuffPatchesFromMergedList,
  mergeInvocationBuffPatchesFromMergedList,
} from '../lib/effects/effectMapping'
import { cloneBuffTemplateToManual } from '../lib/buffStash'
import BuffManager from '../components/BuffManager'
import EldritchInvocationPicker from '../components/EldritchInvocationPicker'
import CombatStatus from '../components/CombatStatus'
import EquipmentAndInventory from '../components/EquipmentAndInventory'
import AbilityModule from '../components/AbilityModule'
import AvatarCropModal from '../components/AvatarCropModal'
import CharacterSheetTopBar from '../components/CharacterSheetTopBar'
import FeatPickerModal from '../components/FeatPickerModal'
import InfoTooltip from '../components/InfoTooltip'
import { ClassFeatureTooltipContent, FeatTooltipContent } from '../lib/infoTooltipContent'
import { APP_VERSION_LABEL } from '../config/version'
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
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0 w-full">
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

/** 魔能祈唤：在「魔能祈唤」特性卡片内提供选择器与已选列表 */
function EldritchInvocationsBlock({ char, canEdit, onSave }) {
  const [modalOpen, setModalOpen] = useState(false)
  const selected = char?.selectedInvocations ?? []
  const byId = useMemo(() => new Map(ELDRITCH_INVOCATIONS.map((x) => [x.id, x])), [])
  const selectedIds = selected.map((x) =>
    typeof x === 'string' ? x : (x?.invocationId ?? x?.id ?? ''),
  )

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
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-dnd-red/90 text-white hover:bg-dnd-red transition-colors"
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
      />
    </div>
  )
}

/** 职业特性：从职业库调出可选特性，在角色卡上勾选展示；已添加的显示在上方列表 */
function ClassFeaturesSection({ char, canEdit, onSave }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)
  const [expandedFeatureIds, setExpandedFeatureIds] = useState(new Set())
  const toggleFeatureExpand = (key) => {
    setExpandedFeatureIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selected = resolveSelectedFeatures(char)
  const available = getAvailableFeatures(char)
  const selectedKeys = new Set(char?.selectedClassFeatures ?? [])
  const toAdd = available.filter((f) => !selectedKeys.has(featureKey(f)))
  const addFeature = (key) => {
    const next = [...(char?.selectedClassFeatures ?? []), key]
    onSave({ selectedClassFeatures: next })
  }
  const removeFeature = (key) => {
    const next = (char?.selectedClassFeatures ?? []).filter((k) => k !== key)
    onSave({ selectedClassFeatures: next })
  }
  if (available.length === 0 && selected.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="space-y-3">
        <p className="text-gray-500 text-xs">根据当前职业与等级从职业库调出可选特性，可添加至下方以便查阅。</p>
      {canEdit && toAdd.length > 0 && (
        <div>
          <p className={`${CS_LIST_SECTION_LBL} mb-1`}>从职业库添加</p>
          <select
            className={inputClass + ' max-w-md'}
            value=""
            onChange={(e) => {
              const key = e.target.value
              if (key) { addFeature(key); e.target.value = '' }
            }}
          >
            <option value="">— 选择特性 —</option>
            {toAdd.map((f) => {
              const key = featureKey(f)
              const displayName = resolveRuleText(
                overridesMap,
                f.sourceSubclass
                  ? buildSubclassFeatureNameKey(f.sourceClass, f.sourceSubclass, f.id)
                  : buildClassFeatureNameKey(f.sourceClass, f.id),
                f.name,
              )
              return (
                <option key={key} value={key}>
                  {f.sourceClass}{f.sourceSubclass ? `（${f.sourceSubclass}）` : ''} · {displayName}（{f.level} 级）
                </option>
              )
            })}
          </select>
        </div>
      )}
      {/* 已添加的特性 */}
      <div>
        <p className={`${CS_LIST_SECTION_LBL} mb-2`}>已添加</p>
        {selected.length > 0 ? (
          <ul className="space-y-2">
            {selected.map((f) => {
              const isExpanded = expandedFeatureIds.has(f.selectedKey)
              const descText = resolveRuleText(
                overridesMap,
                f.sourceSubclass
                  ? buildSubclassFeatureKey(f.sourceClass, f.sourceSubclass, f.id)
                  : buildClassFeatureKey(f.sourceClass, f.id),
                f.description,
              )
              return (
              <li key={f.selectedKey} className="rounded-lg border border-gray-600 bg-gray-800/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="flex-1 min-w-0 cursor-pointer select-none"
                    onClick={() => toggleFeatureExpand(f.selectedKey)}
                  >
                    <InfoTooltip
                      content={
                        <ClassFeatureTooltipContent
                          feature={{
                            name: resolveRuleText(
                              overridesMap,
                              f.sourceSubclass
                                ? buildSubclassFeatureNameKey(f.sourceClass, f.sourceSubclass, f.id)
                                : buildClassFeatureNameKey(f.sourceClass, f.id),
                              f.name,
                            ),
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
                      <span className={CS_LIST_TITLE}>
                        {resolveRuleText(
                          overridesMap,
                          f.sourceSubclass
                            ? buildSubclassFeatureNameKey(f.sourceClass, f.sourceSubclass, f.id)
                            : buildClassFeatureNameKey(f.sourceClass, f.id),
                          f.name,
                        )}
                      </span>
                    </InfoTooltip>
                    <span className={`${CS_LIST_META} ml-2`}>{f.sourceClass}{f.sourceSubclass ? `（${f.sourceSubclass}）` : ''} · {f.level} 级</span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFeature(f.selectedKey) }}
                      className={`${CS_ICON_BTN} text-gray-500 hover:bg-red-900/30 hover:text-red-400`}
                      title="从角色卡移除"
                    >
                      <Trash2 className={CS_ICON_16} />
                    </button>
                  )}
                </div>
                {isExpanded && descText && (
                  <p className={`${CS_LIST_BODY} mt-2 border-t border-gray-700/35 pt-2 whitespace-pre-line`}>
                    {descText}
                  </p>
                )}
                {f.id === 'eldritch_invocations' && (
                  <EldritchInvocationsBlock char={char} canEdit={canEdit} onSave={onSave} />
                )}
              </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-gray-500 text-xs py-2">暂无已添加的特性</p>
        )}
      </div>
      </div>
    </div>
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

/** 专长：从专长库调出，每项可选获得等级与获得职业；先选类型再选专长，列表标出类型（星辰用星标）；可拖动排序 */
function FeatsSection({ char, canEdit, onSave }) {
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)
  const [expandedFeatIds, setExpandedFeatIds] = useState(new Set())
  const toggleFeatExpand = (featId) => {
    setExpandedFeatIds((prev) => {
      const next = new Set(prev)
      if (next.has(featId)) next.delete(featId)
      else next.add(featId)
      return next
    })
  }

  const raw = char?.selectedFeats ?? []
  const featDragFrom = useRef(null)
  const [featDragOver, setFeatDragOver] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const feats = raw.map((f) => {
    if (typeof f === 'string') return { featId: f, level: 1, sourceClass: '' }
    const featId = f.featId ?? f.id ?? ''
    const row = {
      featId,
      level: f.level === '' || f.level == null ? '' : Math.max(1, Math.min(20, Number(f.level) ?? 1)),
      sourceClass: f.sourceClass ?? '',
    }
    // 与 Buff 栏联动的专长效果存在 featBuffPatch；规范化时不可丢弃，否则一改等级/职业就会清空
    if (f.featBuffPatch != null && typeof f.featBuffPatch === 'object') {
      row.featBuffPatch = f.featBuffPatch
    }
    return row
  })
  const featById = new Map(FEATS.map((x) => [x.id, x]))
  const alreadyIds = new Set(feats.map((f) => f.featId))

  const addFeat = ({ featId, effects = [] }) => {
    if (!featId) return
    if (alreadyIds.has(featId)) return
    const row = { featId, level: 1, sourceClass: char?.['class'] ?? '' }
    if (effects.length > 0) {
      row.featBuffPatch = { effects }
    }
    const next = [...feats, row]
    onSave({ selectedFeats: next })
  }
  const updateFeat = (index, field, value) => {
    const next = feats.map((item, i) =>
      i !== index
        ? item
        : {
            ...item,
            [field]:
              field === 'level'
                ? value === '' || value == null
                  ? ''
                  : Math.max(1, Math.min(20, Number(value) || 1))
                : value,
          }
    )
    onSave({ selectedFeats: next })
  }
  const removeFeat = (index) => {
    const next = feats.filter((_, i) => i !== index)
    onSave({ selectedFeats: next })
  }

  const reorderFeats = (fromIndex, toIndex) => {
    if (fromIndex == null || fromIndex === toIndex) return
    const next = [...feats]
    const [row] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, row)
    onSave({ selectedFeats: next })
  }

  const selectClass = 'h-9 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white text-xs px-2 min-w-0'
  /** 专长行内控件：略矮以省垂直空间 */
  const selectClassFeatRow = 'h-8 rounded-lg bg-gray-800 border border-gray-600 focus:border-dnd-red focus:ring-1 focus:ring-dnd-red text-white text-xs px-1.5 min-w-0'
  /** 与 CS_LIST_META 同级：获得句式内联控件 */
  const featAcquireText = `${CS_LIST_META} leading-normal`
  const featAcquireControl =
    'h-8 box-border rounded-md border border-gray-500/70 bg-gray-800/90 text-white text-xs leading-none px-1.5 align-middle focus:border-dnd-red focus:ring-1 focus:ring-dnd-red focus:outline-none'
  const featAcquireSelect = `${featAcquireControl} py-0 pr-7 max-w-[11rem] w-max min-w-[4.25rem] shrink-0`
  const featAcquireLevelInput = `${featAcquireControl} w-9 min-w-9 shrink-0 text-center font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`

  const FeatTypeTag = ({ category }) => {
    if (!category) return null
    if (category === '星辰专长') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/40">
          <Star className={`${CS_ICON_16} fill-current`} />
          星辰
        </span>
      )
    }
    return <span className={CS_LIST_META}>{category}</span>
  }

  return (
    <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      {canEdit && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-dnd-red/90 text-white hover:bg-dnd-red transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加专长
          </button>
          <FeatPickerModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            onConfirm={addFeat}
            overridesMap={overridesMap}
            selectedIds={alreadyIds}
          />
        </div>
      )}
      {feats.length > 0 ? (
        <ul className="space-y-2">
          {feats.map((item, i) => {
            const feat = featById.get(item.featId)
            const name = resolveRuleText(
              overridesMap,
              buildFeatNameKey(item.featId),
              feat?.name ?? item.featId,
            )
            const category = feat?.category
            const featHasDescription = Boolean(feat?.description)
            return (
              <li
                key={item.featId}
                className={`rounded-lg border bg-gray-800/50 p-3 transition-colors ${
                  featDragOver === i ? 'border-dnd-gold/70 ring-1 ring-dnd-gold/30' : 'border-gray-600'
                }`}
                onDragOver={
                  canEdit
                    ? (e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setFeatDragOver(i)
                      }
                    : undefined
                }
                onDragLeave={canEdit ? () => setFeatDragOver((v) => (v === i ? null : v)) : undefined}
                onDrop={
                  canEdit
                    ? (e) => {
                        e.preventDefault()
                        setFeatDragOver(null)
                        const from = featDragFrom.current
                        featDragFrom.current = null
                        reorderFeats(from, i)
                      }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div
                    className="flex items-center gap-2 flex-wrap min-w-0 flex-1 cursor-pointer select-none"
                    onClick={() => toggleFeatExpand(item.featId)}
                  >
                    {canEdit && (
                      <span
                        aria-label="拖动排序"
                        title="拖动调整顺序"
                        draggable
                        className="shrink-0 inline-flex text-gray-500 hover:text-dnd-gold-light cursor-grab active:cursor-grabbing touch-none select-none"
                        onDragStart={(e) => {
                          featDragFrom.current = i
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', String(i))
                        }}
                        onDragEnd={() => {
                          featDragFrom.current = null
                          setFeatDragOver(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DragHandleIcon className={`${CS_ICON_16} text-dnd-text-muted`} aria-hidden />
                      </span>
                    )}
                    <InfoTooltip
                      content={
                        <FeatTooltipContent
                          feat={{
                            id: item.featId,
                            name,
                            category,
                            prerequisite: feat?.prerequisite,
                            description: feat?.description
                              ? formatFeatDescriptionForDisplay(
                                  resolveRuleText(overridesMap, buildFeatDescriptionKey(item.featId), feat.description),
                                )
                              : '',
                          }}
                        />
                      }
                      triggerClassName="inline"
                      disabled={!feat}
                    >
                      <span className={CS_LIST_TITLE}>{name}</span>
                    </InfoTooltip>
                    <FeatTypeTag category={category} />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFeat(i) }}
                      className={`${CS_ICON_BTN} text-gray-500 hover:text-dnd-red`}
                      title="移除"
                    >
                      <Trash2 className={CS_ICON_16} />
                    </button>
                  )}
                </div>
                {expandedFeatIds.has(item.featId) && feat?.description && (
                  <p className={`${CS_LIST_BODY} mt-2 border-t border-gray-700/35 pt-2 whitespace-pre-line`}>
                    {formatFeatDescriptionForDisplay(
                      resolveRuleText(overridesMap, buildFeatDescriptionKey(item.featId), feat.description),
                    )}
                  </p>
                )}
                {expandedFeatIds.has(item.featId) && (canEdit ? (
                  <div className="mt-3 min-w-0 w-full border-t border-gray-600/35 pt-3">
                    <div
                      className={`${featAcquireText} flex flex-wrap items-center gap-x-0.5 gap-y-1.5`}
                      role="group"
                      aria-label="获得本专长的职业与等级"
                    >
                      <span className="shrink-0 select-none">在</span>
                      <select
                        value={item.sourceClass}
                        onChange={(e) => updateFeat(i, 'sourceClass', e.target.value)}
                        className={featAcquireSelect}
                        aria-label="获得职业"
                      >
                        <option value="">—</option>
                        {ALL_CLASS_NAMES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <span className="shrink-0 select-none">职业等级为</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={item.level ?? ''}
                        onChange={(e) => updateFeat(i, 'level', e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value
                          updateFeat(i, 'level', v === '' || v == null ? 1 : v)
                        }}
                        className={featAcquireLevelInput}
                        aria-label="在该职业中的等级"
                      />
                      <span className="shrink-0 select-none">时，从</span>
                      <span
                        className="inline-flex h-8 max-w-full items-center px-0.5 text-xs font-medium leading-none text-dnd-gold-light/90"
                        title="由当前专长所属分类自动显示"
                      >
                        {featListLabelFromCategory(category)}
                      </span>
                      <span className="shrink-0 select-none">中选取</span>
                    </div>
                  </div>
                ) : (
                  <p className={`${CS_LIST_META} mt-3 border-t border-gray-600/35 pt-3 leading-relaxed`}>
                    {formatFeatAcquisitionSentence(item.sourceClass, item.level, category)}
                  </p>
                ))}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-gray-500 text-xs py-2">从上方选择专长添加后，将显示在此处。</p>
      )}
    </div>
  )
}

/** 职业：起始职业、兼职、进阶、施法等级汇总、职业特性（等级上限由经验等级决定） */
function ClassSection({ char, level, canEdit, onSave }) {
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
      char?.inventory,
      char?.equippedHeld,
      char?.equippedWorn,
      sheetModuleId,
    ],
  )
  const buffStats = useBuffCalculator(char, mergedBuffs)
  const canEdit = isAdmin || char?.owner === user?.name
  const isCreatureTemplate = char?.subordinateTemplate === 'creature'

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
    if (spellAbility) {
      const mod = abilityModifier(abilities[spellAbility] ?? 10)
      const spellDC = 8 + prof + mod + (buffStats?.saveDcBonus ?? 0)
      const spellAtk = prof + mod + (buffStats?.spellAttackBonus ?? 0)
      arr.push({ label: '法术DC', value: spellDC, ref: 'spellDc' })
      arr.push({ label: '法术攻击', value: spellAtk, ref: 'spellAttack' })
    }
    return arr
  }, [char, level, buffStats])

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
    if (spellAbility) {
      const mod = abilityModifier(abilities[spellAbility] ?? 10)
      const spellDC = 8 + prof + mod
      const spellAtk = prof + mod
      arr.push({ label: '法术DC', value: spellDC, ref: 'spellDc' })
      arr.push({ label: '法术攻击', value: spellAtk, ref: 'spellAttack' })
    }
    return arr
  }, [char, level])

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
    return names
  }, [char, sheetModuleId])

  const buffFormulaContext = useMemo(() => {
    if (!char) return { level: 1, abilities: {}, prof: 0, spellDC: 0, spellAttack: 0 }
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
    }
  }, [char, level, buffStats])

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
            const batch = []
            while (persistQueueRef.current.length > 0) {
              batch.push(persistQueueRef.current.shift())
            }
            const mergedPatch = mergePatchesList(batch)
            try {
              const u = await updateCharacter(id, mergedPatch)
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
                const fresh = await loadCharacterById(id)
                if (fresh) setChar(fresh)
                else {
                  const c = getCharacter(id)
                  if (c) setChar(c)
                }
              } catch (_) {
                const c = getCharacter(id)
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
                  <ClassSection char={char} level={level} canEdit={canEdit} onSave={persist} />
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
              onSave={(buffsList) => {
                const manual = buffsList.filter((b) => !b.fromItem && !b.fromFeat && !b.fromInvocation)
                const selectedFeats = mergeFeatBuffPatchesFromMergedList(char, buffsList)
                const selectedInvocations = mergeInvocationBuffPatchesFromMergedList(char, buffsList)
                persist({ buffs: manual, selectedFeats, selectedInvocations })
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
            <section id="sheet-features" className="character-sheet-section-anchor mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <h3 className="section-title">职业特性</h3>
                  <ClassFeaturesSection char={char} canEdit={canEdit} onSave={persist} />
                </div>
                <div className="min-w-0">
                  <h3 className="section-title">专长</h3>
                  <FeatsSection char={char} canEdit={canEdit} onSave={persist} />
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
