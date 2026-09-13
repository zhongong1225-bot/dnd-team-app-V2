import { Link } from 'react-router-dom'
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { useRuleTextOverridesMap } from '../hooks/useRuleTextOverridesMap'
import {
  CLASS_LIST,
  getClassData,
  isFanxingClass,
  ELDRITCH_INVOCATIONS,
  MULTICLASS_SPELL_SLOT_ROWS,
} from '../data/classDatabase'
import { FEATS_BY_CATEGORY, formatFeatDescriptionForDisplay } from '../data/feats'
import { MARTIAL_TECHNIQUES } from '../data/martialTechniques'
import MartialStyleIntroBlock from '../components/MartialStyleIntroBlock'
import RuleTextOverrideControl from '../components/RuleTextOverrideControl'
import RuleTextPairOverrideControl from '../components/RuleTextPairOverrideControl'
import {
  buildClassFeatureKey,
  buildClassFeatureNameKey,
  buildSubclassFeatureKey,
  buildSubclassFeatureNameKey,
  buildFeatDescriptionKey,
  buildFeatNameKey,
  buildInvocationKey,
  buildMartialKey,
  buildFocusAbilityKey,
  resolveRuleText,
} from '../lib/ruleTextOverrides'
import { ABILITY_NAMES_ZH } from '../data/buffTypes'

const SPELL_TYPE_LABELS = {
  full: '全施法',
  half: '半施法',
  third: '三分之一施法',
  pact: '契约施法',
}

const MULTICLASS_SLOT_RING_LABELS = ['一环', '二环', '三环', '四环', '五环', '六环', '七环', '八环', '九环']

function MulticlassSpellSlotTable() {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[640px] text-xs text-dnd-text-muted border-collapse">
        <thead>
          <tr className="bg-white/5 border-b border-white/10">
            <th className="py-2 px-2 text-center font-semibold text-dnd-gold-light/95 sticky left-0 bg-[#1e2a3d]/95 z-[1] border-r border-white/10">
              等级
            </th>
            {MULTICLASS_SLOT_RING_LABELS.map((label) => (
              <th key={label} className="py-2 px-1.5 text-center font-semibold text-dnd-gold-light/95 whitespace-nowrap">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((lv) => {
            const row = MULTICLASS_SPELL_SLOT_ROWS[lv] || []
            return (
              <tr
                key={lv}
                className={`border-b border-white/5 ${lv % 2 === 0 ? 'bg-white/[0.03]' : 'bg-transparent'}`}
              >
                <td className="py-1.5 px-2 text-center font-mono font-semibold text-dnd-text-body tabular-nums sticky left-0 bg-inherit z-[1] border-r border-white/10">
                  {lv}
                </td>
                {MULTICLASS_SLOT_RING_LABELS.map((_, ri) => {
                  const n = row[ri + 1] ?? 0
                  return (
                    <td key={ri} className="py-1.5 px-1.5 text-center font-mono tabular-nums">
                      {n > 0 ? n : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function HouseRules() {
  const { isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const moduleId = currentModuleId || 'default'
  const overridesMap = useRuleTextOverridesMap(moduleId)

  const [expanded, setExpanded] = useState(null)
  const [expandedMartial, setExpandedMartial] = useState(null)
  const [expandedFeatIds, setExpandedFeatIds] = useState(() => new Set())

  const toggleFeat = (id) => {
    setExpandedFeatIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [expandedSections, setExpandedSections] = useState(() => new Set())
  const [expandedFeatCategories, setExpandedFeatCategories] = useState(() => new Set())
  const [expandedSubclasses, setExpandedSubclasses] = useState(() => new Set())
  const [expandedInvocations, setExpandedInvocations] = useState(false)

  const toggleSubclass = (className, subName) => {
    const key = `${className}|${subName}`
    setExpandedSubclasses((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleFeatCategory = (category) => {
    setExpandedFeatCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <Link to="/more" className="text-dnd-red text-sm mb-4 inline-block font-medium">
        ← 返回更多
      </Link>
      <h1 className="font-display text-xl font-semibold text-white mb-1 section-title">
        规则收录
      </h1>
      <p className="text-dnd-text-muted text-xs mb-4 leading-relaxed">
        规则大全：职业库、专长表、武技库等与角色卡共用数据。{isAdmin ? 'DM 可在各条旁使用铅笔图标编辑展示名称与正文（视条目而定），即时生效并随当前战役同步。' : null}
      </p>

      {/* 房规与模组说明 */}
      <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 overflow-hidden mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <button
          type="button"
          onClick={() => toggleSection('房规与模组')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('房规与模组') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-base font-bold uppercase tracking-wider">房规与模组</h2>
        </button>
        {expandedSections.has('房规与模组') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10 space-y-4">
            <p className="text-dnd-text-muted text-sm mt-3">其他模组与富文本说明可继续在此扩展。</p>

            <div className="rounded-lg border border-dnd-gold/25 bg-[#1b2738]/35 p-3 space-y-3">
              <h3 className="text-dnd-gold-light text-sm font-bold tracking-wide">兼职施法者 · 法术位</h3>
              <p className="text-dnd-text-muted text-sm leading-relaxed">
                你的法术位总量由<strong className="text-dnd-text-body">兼职施法者等级</strong>（见下述换算）对照下表决定；各职业<strong>已知/准备哪些法术</strong>仍分别遵循该职业规则。
                当你从<strong>多种</strong>具有「施法」特性的职业获得法术时，使用下表。若兼职但<strong>仅有单一职业</strong>提供「施法」（魔契师的契约魔法另计），按该职业条目中的法术位即可（与换算后查表结果一致）。
              </p>
              <div className="text-dnd-text-muted text-sm leading-relaxed space-y-2 border-l-2 border-dnd-gold/35 pl-3">
                <p>
                  <span className="text-dnd-gold-light/90 font-medium">全施法（1∶1）</span>
                  ：吟游诗人、牧师、德鲁伊、术士、法师——该职业等级全额计入。
                </p>
                <p>
                  <span className="text-dnd-gold-light/90 font-medium">半施法（½，向上取整）</span>
                  ：圣武士、游侠，以及职业库中标记为「半施法」的繁星职业——取该职业等级的一半，<strong className="text-dnd-text-body">向上取整</strong>后计入。
                </p>
                <p>
                  <span className="text-dnd-gold-light/90 font-medium">三分之一施法（⅓，向下取整）</span>
                  ：战士子职<strong>奥法骑士</strong>或<strong>奥法战士</strong>、游荡者子职<strong>诡术师</strong>——取该职业等级的三分之一，<strong className="text-dnd-text-body">向下取整</strong>后计入。
                </p>
                <p>
                  <span className="text-dnd-gold-light/90 font-medium">魔契师 · 契约魔法</span>
                  ：不计入兼职施法者等级；契约法术位按魔契师等级单独计算，与下表法术位<strong className="text-dnd-text-body">叠加</strong>（角色卡「角色法术 / 战斗状态」中已合并显示）。
                </p>
                <p className="text-[13px] text-dnd-text-muted/90 pt-1">
                  例：游侠 4 / 术士 3 → 3 + ⌈4÷2⌉ = <strong className="text-dnd-text-body">5</strong> 级施法者 → 四环及以下法术位如下表 5 级行。
                  你可能仍无法准备某些高环职业法术，但可用较高环位施展已知低环法术并享受升环效应。
                </p>
              </div>
              <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider pt-1">
                兼职施法者：每环阶的法术位
              </p>
              <MulticlassSpellSlotTable />
              <p className="text-[11px] text-dnd-text-muted/80">
                本应用角色卡的每日法术位上限按上表与上述换算由程序计算；可在角色数据中手动覆盖「各环最大法术位」以处理特殊物品或房规调整。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 职业库：供角色卡施法等级、生命骰与职业特性调用 */}
      <div className="rounded-xl bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 border border-white/10 overflow-hidden mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <button
          type="button"
          onClick={() => toggleSection('职业库')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('职业库') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-base font-bold uppercase tracking-wider">职业库</h2>
          <span className="text-dnd-text-muted text-xs">{CLASS_LIST.length} 个职业</span>
        </button>
        {expandedSections.has('职业库') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3 mb-4">
              职业数据供角色卡施法等级、生命骰与职业特性调用使用。
            </p>
            <div className="space-y-2">
          {CLASS_LIST.map((className) => {
            const data = getClassData(className)
            if (!data) return null
            const isOpen = expanded === className
            const spell = data.spellcasting
            const spellLabel = spell ? SPELL_TYPE_LABELS[spell.type] || spell.type : null
            const abilityLabel = spell?.ability ? ABILITY_NAMES_ZH[spell.ability] : null

            return (
              <div
                key={className}
                className="rounded-xl bg-[#1b2738]/80 border border-white/10 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : className)}
                  className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                  <span className="text-sm font-semibold text-white">{className}</span>
                  {isFanxingClass(className) && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide whitespace-nowrap border border-dnd-gold/35 bg-[#141210]/90 text-[#d4b878] shadow-none"
                      title="繁星模组特色职业"
                    >
                      繁星特色
                    </span>
                  )}
                  <span className="text-dnd-text-muted text-xs">
                    d{data.hitDice} 生命骰
                    {spellLabel && ` · ${spellLabel}${abilityLabel ? `（${abilityLabel}）` : ''}`}
                    {data.features?.length ? ` · ${data.features.length} 项特性` : ''}
                  </span>
                </button>
                {isOpen && data && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/10">
                    {data.flavor && (
                      <p className="text-dnd-text-muted text-xs mt-3 mb-2 italic">{data.flavor}</p>
                    )}
                    {data.requirements && (
                      <p className="text-dnd-text-muted text-xs mt-3 mb-2">
                        <span className="text-dnd-gold-light font-bold">进阶要求：</span>
                        {data.requirements}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-dnd-text-muted mt-3 mb-3">
                      <span>生命骰</span>
                      <span className="text-white font-mono">d{data.hitDice}</span>
                      {spell && (
                        <>
                          <span>施法</span>
                          <span className="text-white">{spellLabel}{abilityLabel ? `（${abilityLabel}）` : spell.ability === null ? '（继承进阶前）' : ''}</span>
                        </>
                      )}
                      {data.saveProficiencies?.length > 0 && (
                        <>
                          <span>豁免熟练</span>
                          <span className="text-white">{data.saveProficiencies.map((k) => ABILITY_NAMES_ZH[k] || k).join('、')}</span>
                        </>
                      )}
                    </div>
                    {data.features?.length > 0 && (
                      <div>
                        <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">职业特性</p>
                        <ul className="space-y-2">
                          {data.features.map((f) => (
                            <li key={f.id} className="text-sm">
                              <div className="flex items-start gap-1">
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-white">
                                    {resolveRuleText(overridesMap, buildClassFeatureNameKey(className, f.id), f.name)}
                                  </span>
                                  <span className="text-dnd-text-muted text-xs ml-2">（{f.level} 级）</span>
                                  <p className="text-dnd-text-muted text-xs mt-0.5 whitespace-pre-line">
                                    {resolveRuleText(overridesMap, buildClassFeatureKey(className, f.id), f.description)}
                                  </p>
                                </div>
                                <div className="shrink-0 self-start pt-0.5">
                                  <RuleTextPairOverrideControl
                                    moduleId={moduleId}
                                    nameKey={buildClassFeatureNameKey(className, f.id)}
                                    originalName={f.name}
                                    descKey={buildClassFeatureKey(className, f.id)}
                                    originalDescription={f.description}
                                    isAdmin={isAdmin}
                                    title={`编辑职业特性「${f.name}」`}
                                  />
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(data.martialProgress) && data.martialProgress.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">武技进展表</p>
                        <p className="text-dnd-text-muted text-[11px] mb-2 leading-relaxed">
                          下列为该职业各进阶等级在该级<strong>新增</strong>的已知招式、准备招式、已知步法；末三列为自 1 级起的累计。
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-white/10">
                          <table className="w-full text-xs min-w-[420px]">
                            <thead>
                              <tr className="bg-[#1b2738]/90 text-dnd-text-muted">
                                <th className="text-left py-2 px-2 w-14">等级</th>
                                <th className="text-center py-2 px-2">已知招式</th>
                                <th className="text-center py-2 px-2">准备招式</th>
                                <th className="text-center py-2 px-2">已知步法</th>
                                <th className="text-center py-2 px-2 border-l border-white/10">累计招式</th>
                                <th className="text-center py-2 px-2">累计准备</th>
                                <th className="text-center py-2 px-2">累计步法</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                let cK = 0
                                let cP = 0
                                let cF = 0
                                return data.martialProgress.map((row) => {
                                  cK += Number(row.knownMoves) || 0
                                  cP += Number(row.preparedMoves) || 0
                                  cF += Number(row.knownFootwork) || 0
                                  return (
                                    <tr key={row.level} className="border-t border-white/10">
                                      <td className="py-1.5 px-2 text-white font-mono tabular-nums">{row.level}</td>
                                      <td className="py-1.5 px-2 text-center text-dnd-text-body tabular-nums">{row.knownMoves}</td>
                                      <td className="py-1.5 px-2 text-center text-dnd-text-body tabular-nums">{row.preparedMoves}</td>
                                      <td className="py-1.5 px-2 text-center text-dnd-text-body tabular-nums">{row.knownFootwork}</td>
                                      <td className="py-1.5 px-2 text-center text-dnd-gold-light/90 tabular-nums border-l border-white/10 font-medium">
                                        {cK}
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-dnd-gold-light/90 tabular-nums font-medium">{cP}</td>
                                      <td className="py-1.5 px-2 text-center text-dnd-gold-light/90 tabular-nums font-medium">{cF}</td>
                                    </tr>
                                  )
                                })
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {Array.isArray(data.focusAbilities) && data.focusAbilities.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">专注点 · 特殊能力</p>
                        <p className="text-dnd-text-muted text-[11px] mb-2 leading-relaxed">
                          消耗专注点发动；带「子职限定」者仅对应子职可选用；等级为最低火铳手等级。
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-white/10">
                          <table className="w-full text-xs min-w-[560px]">
                            <thead>
                              <tr className="bg-[#1b2738]/90 text-dnd-text-muted text-[10px] uppercase tracking-wider">
                                <th className="text-left py-2 px-2 w-14 whitespace-nowrap">消耗</th>
                                <th className="text-left py-2 px-2 w-28 whitespace-nowrap">特殊能力</th>
                                <th className="text-left py-2 px-2 w-16 whitespace-nowrap">最低等级</th>
                                <th className="text-left py-2 px-2">效果</th>
                                <th className="text-left py-2 px-2 w-24 whitespace-nowrap">子职限定</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.focusAbilities.map((row) => (
                                <tr key={row.id} className="border-t border-white/10 align-top">
                                  <td className="py-2 px-2 text-white tabular-nums font-medium whitespace-nowrap">{row.cost} 点</td>
                                  <td className="py-2 px-2 text-dnd-gold-light/95 font-medium whitespace-nowrap">{row.name}</td>
                                  <td className="py-2 px-2 text-dnd-text-muted tabular-nums whitespace-nowrap">{row.minLevel}</td>
                                  <td className="py-2 px-2 text-dnd-text-muted leading-relaxed">
                                    <div className="flex items-start gap-1">
                                      <span className="min-w-0 flex-1 whitespace-pre-line">
                                        {resolveRuleText(overridesMap, buildFocusAbilityKey(className, row.id), row.effect)}
                                      </span>
                                      <RuleTextOverrideControl
                                        moduleId={moduleId}
                                        ruleKey={buildFocusAbilityKey(className, row.id)}
                                        originalText={row.effect}
                                        isAdmin={isAdmin}
                                        label={`编辑「${row.name}」效果`}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-dnd-text-muted whitespace-nowrap">{row.exclusiveSubclass ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {className === '魔契师' && ELDRITCH_INVOCATIONS?.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setExpandedInvocations((v) => !v)}
                          className="w-full flex items-center gap-2 py-2.5 px-0 text-left text-dnd-gold-light hover:text-dnd-gold-light/90 transition-colors"
                        >
                          {expandedInvocations ? (
                            <ChevronDown className="w-4 h-4 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0" />
                          )}
                          <span className="text-xs font-bold uppercase tracking-wider">魔能祈唤选项</span>
                          <span className="text-dnd-text-muted text-xs font-normal normal-case">{ELDRITCH_INVOCATIONS.length} 项</span>
                        </button>
                        {expandedInvocations && (
                          <>
                            <p className="text-dnd-text-muted text-xs mb-3 mt-1">以下为魔能祈唤特性的可选祈唤，依要求等级与首字母排序；先决满足方可选取；复选者可多次选择不同目标。</p>
                            <ul className="space-y-3">
                              {ELDRITCH_INVOCATIONS.map((inv) => (
                                <li key={inv.id} className="text-sm rounded-lg border border-white/10 p-2.5 bg-white/[0.03]">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="font-medium text-white">{inv.name}</span>
                                    {inv.repeatable && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40">复选</span>
                                    )}
                                  </div>
                                  {inv.prerequisite && (
                                    <div className="flex items-start gap-1 mb-1">
                                      <p className="text-dnd-text-muted text-xs min-w-0 flex-1">
                                        <span className="text-dnd-gold-light font-medium">先决：</span>
                                        {resolveRuleText(overridesMap, buildInvocationKey(inv.id, 'p'), inv.prerequisite)}
                                      </p>
                                      <RuleTextOverrideControl
                                        moduleId={moduleId}
                                        ruleKey={buildInvocationKey(inv.id, 'p')}
                                        originalText={inv.prerequisite}
                                        isAdmin={isAdmin}
                                        label={`编辑「${inv.name}」先决`}
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-start gap-1 mt-0.5">
                                    <p className="text-dnd-text-muted text-xs min-w-0 flex-1 whitespace-pre-line">
                                      {resolveRuleText(overridesMap, buildInvocationKey(inv.id, 'd'), inv.description)}
                                    </p>
                                    <RuleTextOverrideControl
                                      moduleId={moduleId}
                                      ruleKey={buildInvocationKey(inv.id, 'd')}
                                      originalText={inv.description}
                                      isAdmin={isAdmin}
                                      label={`编辑「${inv.name}」正文`}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                    {data.subclasses && Object.keys(data.subclasses).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-3">子职</p>
                        <div className="space-y-2">
                          {Object.entries(data.subclasses).map(([subName, sub]) => {
                            const subKey = `${className}|${subName}`
                            const isSubOpen = expandedSubclasses.has(subKey)
                            const featureCount = sub.features?.length ?? 0
                            return (
                              <div key={subName} className="rounded-lg border border-white/10 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => toggleSubclass(className, subName)}
                                  className="w-full flex items-center gap-2 py-2.5 px-3 text-left text-white hover:bg-white/5 transition-colors"
                                >
                                  {isSubOpen ? (
                                    <ChevronDown className="w-4 h-4 shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 shrink-0" />
                                  )}
                                  <span className="font-semibold text-sm">{className} · {subName}</span>
                                  {featureCount > 0 && (
                                    <span className="text-dnd-text-muted text-xs">{featureCount} 项特性</span>
                                  )}
                                </button>
                                {isSubOpen && (
                                  <div className="px-3 pb-3 pt-0 border-t border-white/10">
                                    {sub.flavor && <p className="text-dnd-text-muted text-xs italic mt-2 mb-2">{sub.flavor}</p>}
                                    {sub.features?.length > 0 ? (
                                      <ul className="space-y-2">
                                        {sub.features.map((f) => (
                                          <li key={f.id} className="text-sm">
                                            <div className="flex items-start gap-1">
                                              <div className="min-w-0 flex-1">
                                                <span className="font-medium text-white">
                                                  {resolveRuleText(
                                                    overridesMap,
                                                    buildSubclassFeatureNameKey(className, subName, f.id),
                                                    f.name,
                                                  )}
                                                </span>
                                                <span className="text-dnd-text-muted text-xs ml-2">（{f.level} 级）</span>
                                                <p className="text-dnd-text-muted text-xs mt-0.5 whitespace-pre-line">
                                                  {resolveRuleText(
                                                    overridesMap,
                                                    buildSubclassFeatureKey(className, subName, f.id),
                                                    f.description,
                                                  )}
                                                </p>
                                              </div>
                                              <div className="shrink-0 self-start pt-0.5">
                                                <RuleTextPairOverrideControl
                                                  moduleId={moduleId}
                                                  nameKey={buildSubclassFeatureNameKey(className, subName, f.id)}
                                                  originalName={f.name}
                                                  descKey={buildSubclassFeatureKey(className, subName, f.id)}
                                                  originalDescription={f.description}
                                                  isAdmin={isAdmin}
                                                  title={`编辑子职「${subName}」·「${f.name}」`}
                                                />
                                              </div>
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-dnd-text-muted text-xs mt-2">暂无子职特性数据。</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
            </div>
          </div>
        )}
      </div>

      {/* 专长表：与职业库平行，分栏展示 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => toggleSection('专长表')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('专长表') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-base font-bold uppercase tracking-wider">专长表</h2>
          <span className="text-dnd-text-muted text-xs">
            {Object.values(FEATS_BY_CATEGORY).flat().length} 项专长
          </span>
        </button>
        {expandedSections.has('专长表') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3 mb-4">
              专长数据供角色卡与房规查阅使用。
            </p>
            {Object.keys(FEATS_BY_CATEGORY).length === 0 ? (
          <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
            <p className="text-dnd-text-muted text-sm">暂无专长条目，后续可在此处添加。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(FEATS_BY_CATEGORY).map(([category, list]) => {
              const isCategoryOpen = expandedFeatCategories.has(category)
              return (
                <div key={category} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFeatCategory(category)}
                    className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                  >
                    {isCategoryOpen ? (
                      <ChevronDown className="w-5 h-5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-dnd-gold-light/90">{category}</span>
                    <span className="text-dnd-text-muted text-xs">{list.length} 项专长</span>
                  </button>
                  {isCategoryOpen && (
                    <div className="px-4 pb-4 pt-0 border-t border-white/10">
                      <div className="space-y-2 pt-3">
                        {list.map((f) => {
                          const isOpen = expandedFeatIds.has(f.id)
                    return (
                      <div key={f.id} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                        <div className="flex items-stretch min-w-0 border-b border-white/10">
                          <button
                            type="button"
                            onClick={() => toggleFeat(f.id)}
                            className="flex-1 min-w-0 flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                          >
                            {isOpen ? (
                              <ChevronDown className="w-5 h-5 shrink-0" />
                            ) : (
                              <ChevronRight className="w-5 h-5 shrink-0" />
                            )}
                            <span className="text-sm font-medium text-white">
                              {resolveRuleText(overridesMap, buildFeatNameKey(f.id), f.name)}
                            </span>
                            {f.nameEn && (
                              <span className="text-dnd-text-muted text-xs font-normal">{f.nameEn}</span>
                            )}
                            {f.source && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-dnd-text-muted border border-white/20">
                                {f.source}
                              </span>
                            )}
                          </button>
                          {isAdmin && (
                            <div className="shrink-0 flex items-center px-2 border-l border-white/10">
                              <RuleTextPairOverrideControl
                                moduleId={moduleId}
                                nameKey={buildFeatNameKey(f.id)}
                                originalName={f.name}
                                descKey={buildFeatDescriptionKey(f.id)}
                                originalDescription={f.description}
                                isAdmin={isAdmin}
                                title={`编辑专长「${f.name}」`}
                              />
                            </div>
                          )}
                        </div>
                        {isOpen && (
                          <div className="px-4 pb-4 pt-0">
                            {f.prerequisite && (
                              <p className="text-dnd-text-muted text-xs mt-3 mb-2">
                                <span className="text-dnd-gold-light font-medium">前提：</span>
                                {f.prerequisite}
                              </p>
                            )}
                            <p className="text-dnd-text-muted text-sm whitespace-pre-line min-w-0 mt-3">
                              {formatFeatDescriptionForDisplay(
                                resolveRuleText(overridesMap, buildFeatDescriptionKey(f.id), f.description),
                              )}
                            </p>
                            {f.table && (
                              <div className="mt-3 overflow-x-auto">
                                <p className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-2">
                                  快速制作
                                </p>
                                <table className="w-full text-xs text-dnd-text-muted border border-white/10 rounded-lg overflow-hidden">
                                  <thead>
                                    <tr className="bg-white/5">
                                      <th className="text-left py-2 px-3 font-semibold text-dnd-gold-light/90">
                                        工匠工具
                                      </th>
                                      <th className="text-left py-2 px-3 font-semibold text-dnd-gold-light/90">
                                        可制造的装备
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.table.map((row, i) => (
                                      <tr key={i} className="border-t border-white/10">
                                        <td className="py-1.5 px-3">{row.tools}</td>
                                        <td className="py-1.5 px-3">{row.items}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                        )}
                      </div>
                    )}
                  </div>
                )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
          </div>
        )}
      </div>

      {/* 武技库：与职业库平行，供战斗/专长等调用 */}
      <div className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => toggleSection('武技库')}
          className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
        >
          {expandedSections.has('武技库') ? (
            <ChevronDown className="w-5 h-5 shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 shrink-0" />
          )}
          <h2 className="text-dnd-gold-light text-base font-bold uppercase tracking-wider">武技库 · 繁星特色</h2>
          <span className="text-dnd-text-muted text-xs">{MARTIAL_TECHNIQUES.length} 项武技</span>
        </button>
        {expandedSections.has('武技库') && (
          <div className="px-4 pb-4 pt-0 border-t border-white/10">
            <p className="text-dnd-text-muted text-sm mt-3 mb-4">
              武技数据供战斗、专长等调用使用。展开各流派可查看与《九剑之书》对应的流派介绍。
            </p>
            {MARTIAL_TECHNIQUES.length === 0 ? (
          <div className="rounded-xl bg-dnd-card border border-white/10 p-4">
            <p className="text-dnd-text-muted text-sm">暂无武技条目，后续可在此处添加。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(new Set(MARTIAL_TECHNIQUES.map((t) => t.style))).map((style) => {
              const count = MARTIAL_TECHNIQUES.filter((t) => t.style === style).length
              const isOpen = expandedMartial === style
              return (
                <div key={style} className="rounded-xl bg-dnd-card border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedMartial(isOpen ? null : style)}
                    className="w-full flex items-center gap-2 py-3 px-4 text-left text-white hover:bg-white/5 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                    <span className="text-sm font-semibold text-white">{style}</span>
                    <span className="text-dnd-text-muted text-xs">{count} 项武技</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-0 border-t border-white/10">
                      <div className="pt-3 mb-3">
                        <MartialStyleIntroBlock styleName={style} />
                      </div>
                      <ul className="divide-y divide-white/10">
                        {MARTIAL_TECHNIQUES.filter((t) => t.style === style).map((t) => (
                          <li key={t.id} className="py-3 first:pt-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white">{t.name}</span>
                              {t.tag ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-200/95 border border-violet-400/35">
                                  {t.tag}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-dnd-text-muted text-xs flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                              {t.level != null && <span>等级：{t.level}</span>}
                              {t.requirement && <span>前提：{t.requirement}</span>}
                              <span>动作：{t.action}</span>
                              <span>距离：{t.range}</span>
                              <span>目标：{t.target}</span>
                              {t.duration && <span>持续：{t.duration}</span>}
                            </div>
                            <div className="flex items-start gap-1">
                              <p className="text-dnd-text-muted text-sm min-w-0 flex-1 whitespace-pre-line">
                                {resolveRuleText(overridesMap, buildMartialKey(t.id), t.description)}
                              </p>
                              <RuleTextOverrideControl
                                moduleId={moduleId}
                                ruleKey={buildMartialKey(t.id)}
                                originalText={t.description}
                                isAdmin={isAdmin}
                                label={`编辑武技「${t.name}」正文`}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  )
}
