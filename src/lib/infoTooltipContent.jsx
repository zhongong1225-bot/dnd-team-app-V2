/**
 * 悬停提示内容生成工具
 * 为武技、装备、物品、职业特性、专长等条目生成结构化的提示内容（React 节点）。
 * 用于 InfoTooltip 组件的 content 属性。
 */
import React from 'react'
import { itemRequiresAttunement } from '../data/itemDatabase'

const SECTION_LABEL = 'text-dnd-gold-light/85 font-bold tracking-wider uppercase text-[10px]'
const FIELD_LABEL = 'text-gray-500 text-[10px] uppercase tracking-wider'
const FIELD_VALUE = 'text-gray-200 text-xs'
const DIVIDER = 'border-t border-gray-700/40 my-2'

/** 字段行：标签 + 值 */
function Field({ label, value }) {
  if (value == null || value === '' || value === false) return null
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className={`${FIELD_LABEL} shrink-0`}>{label}</span>
      <span className={`${FIELD_VALUE} break-words`}>{value}</span>
    </div>
  )
}

/** 区块标题 */
function SectionLabel({ children }) {
  return <p className={SECTION_LABEL}>{children}</p>
}

/** 描述段落（支持 \n 多行） */
function DescriptionBlock({ text }) {
  if (!text || !String(text).trim()) return null
  const lines = String(text).split(/\r?\n/)
  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-gray-300 leading-relaxed break-words whitespace-pre-line">
          {line}
        </p>
      ))}
    </div>
  )
}

/**
 * 武技悬停提示内容
 * @param {object} tech 武技数据（martialTechniques 中的条目）
 */
export function MartialTechTooltipContent({ tech }) {
  if (!tech) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-sm font-bold text-white break-words">{tech.name}</span>
        {tech.level ? (
          <span className="text-[10px] text-dnd-gold-light/80 shrink-0">{tech.level} 级</span>
        ) : null}
      </div>
      {(tech.style || tech.type) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {tech.style && (
            <span className="text-[10px] text-violet-300/85 bg-violet-900/30 px-1.5 py-0.5 rounded">
              {tech.style}
            </span>
          )}
          {tech.type && (
            <span className="text-[10px] text-sky-300/85 bg-sky-900/30 px-1.5 py-0.5 rounded">
              {tech.type}
            </span>
          )}
        </div>
      )}
      <div className="space-y-0.5">
        <Field label="动作" value={tech.action} />
        <Field label="范围" value={tech.range} />
        <Field label="目标" value={tech.target} />
        <Field label="持续" value={tech.duration} />
        <Field label="先决" value={tech.requirement} />
      </div>
      {tech.description && (
        <>
          <div className={DIVIDER} />
          <DescriptionBlock text={tech.description} />
        </>
      )}
    </div>
  )
}

/**
 * 物品/装备悬停提示内容
 * @param {object} proto 物品原型（itemDatabase 中的条目，字段名为中文：类型/类别/攻击/伤害/重量/价格/详细介绍/附注等）
 * @param {object} entry 可选，背包条目（包含 qty/magicBonus/charge/isAttuned 等运行时数据）
 */
export function ItemTooltipContent({ proto, entry }) {
  if (!proto) return null
  const isInventoryEntry = !!entry
  const magicBonus = Number(entry?.magicBonus) || 0
  const charge = Number(entry?.charge) || 0
  const qty = Number(entry?.qty) || 1
  const hasMagic = magicBonus > 0
  const hasCharge = charge > 0
  const isAttuned = entry?.isAttuned === true
  const requiresAttunement = itemRequiresAttunement(proto)
  const hasExtraEntryInfo = isInventoryEntry && (hasMagic || hasCharge || isAttuned || qty > 1)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-sm font-bold text-white break-words">
          {proto.名称 || proto.类别 || proto.id}
        </span>
        {hasExtraEntryInfo && (
          <span className="shrink-0 text-[10px] text-amber-300/90 font-mono">
            {qty > 1 && `×${qty}`}
            {hasMagic && ` +${magicBonus}`}
            {isAttuned && ' · 同调'}
          </span>
        )}
      </div>
      {(proto.类型 || proto.子类型) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {proto.类型 && (
            <span className="text-[10px] text-sky-300/85 bg-sky-900/30 px-1.5 py-0.5 rounded">
              {proto.类型}
            </span>
          )}
          {proto.子类型 && (
            <span className="text-[10px] text-emerald-300/85 bg-emerald-900/30 px-1.5 py-0.5 rounded">
              {proto.子类型}
            </span>
          )}
          {hasMagic && (
            <span className="text-[10px] text-amber-300/85 bg-amber-900/30 px-1.5 py-0.5 rounded">
              魔法 +{magicBonus}
            </span>
          )}
          {requiresAttunement && (
            <span className="text-[10px] text-violet-300/85 bg-violet-900/30 px-1.5 py-0.5 rounded">
              需要同调
            </span>
          )}
        </div>
      )}
      {proto.详细介绍 && (
        <div className="rounded-md border border-dnd-gold-light/25 bg-dnd-gold-light/[0.08] p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-dnd-gold-light/90">简介</p>
          <DescriptionBlock text={proto.详细介绍} />
        </div>
      )}
      <div className="space-y-0.5">
        <Field label="类别" value={proto.类别} />
        <Field label="攻击" value={proto.攻击} />
        <Field label="伤害" value={proto.伤害} />
        <Field label="精通" value={proto.精通} />
        <Field label="附注" value={proto.附注} />
        {hasCharge && <Field label="充能" value={`${charge}`} />}
      </div>
    </div>
  )
}

/**
 * 职业特性悬停提示内容
 * @param {object} feature 特性对象 { id, name, description, level, sourceClass, sourceSubclass }
 */
export function ClassFeatureTooltipContent({ feature }) {
  if (!feature) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-sm font-bold text-white break-words">{feature.name}</span>
        {feature.level != null && (
          <span className="text-[10px] text-dnd-gold-light/80 shrink-0">{feature.level} 级</span>
        )}
      </div>
      {(feature.sourceClass || feature.sourceSubclass) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {feature.sourceClass && (
            <span className="text-[10px] text-sky-300/85 bg-sky-900/30 px-1.5 py-0.5 rounded">
              {feature.sourceClass}
            </span>
          )}
          {feature.sourceSubclass && (
            <span className="text-[10px] text-violet-300/85 bg-violet-900/30 px-1.5 py-0.5 rounded">
              {feature.sourceSubclass}
            </span>
          )}
        </div>
      )}
      {feature.description && (
        <>
          <div className={DIVIDER} />
          <DescriptionBlock text={feature.description} />
        </>
      )}
    </div>
  )
}

/**
 * 专长悬停提示内容
 * @param {object} feat 专长对象 { id, name, category, prerequisite, description, source }
 */
export function FeatTooltipContent({ feat }) {
  if (!feat) return null
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-bold text-white break-words block">{feat.name}</span>
      {(feat.category || feat.prerequisite) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {feat.category && (
            <span className="text-[10px] text-emerald-300/85 bg-emerald-900/30 px-1.5 py-0.5 rounded">
              {feat.category}
            </span>
          )}
          {feat.prerequisite && (
            <span className="text-[10px] text-amber-300/85 bg-amber-900/30 px-1.5 py-0.5 rounded">
              先决：{feat.prerequisite}
            </span>
          )}
        </div>
      )}
      {feat.description && (
        <>
          <div className={DIVIDER} />
          <DescriptionBlock text={feat.description} />
        </>
      )}
    </div>
  )
}
