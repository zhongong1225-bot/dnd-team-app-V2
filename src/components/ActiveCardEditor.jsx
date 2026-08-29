/**
 * ActiveCardEditor — 主动卡编辑器
 *
 * 五段式结构：消耗 → 动作 → 效果 → 持续时间 → 保存
 * 从 BuffForm 主动模式区块提取，受控组件。
 */

import { inputClass } from '../lib/inputStyles'
import { NumberStepper } from './BuffForm'
import {
  normalizeChargeItemValue,
  RECOVERY_METHODS,
  RESOURCE_TYPE_OPTIONS,
  ACTION_COST_OPTIONS,
  recoverySupportsAmount,
  recoveryIsDiceOnly,
} from '../lib/chargeItemModel'
import DurationEditor from './DurationEditor'

/**
 * 从角色数据动态生成可用资源选项。
 * 规则：充能数始终可用 + 角色实际拥有的职业资源 + 有法术位时显示环位。
 */
function buildResourceOptions(charResources, spellSlots) {
  const opts = [{ value: 'charges', label: '充能数' }]
  const seen = new Set(['charges'])

  // 从角色职业资源中添加
  if (Array.isArray(charResources)) {
    charResources.forEach((r) => {
      const key = r.resourceKey || r.key
      if (key && !seen.has(key)) {
        const label = r.label || r.name || RESOURCE_TYPE_OPTIONS.find((o) => o.value === key)?.label || key
        opts.push({ value: key, label })
        seen.add(key)
      }
    })
  }

  // 法术位：有任何法术位时添加
  if (spellSlots && typeof spellSlots === 'object') {
    const hasSlots = Object.values(spellSlots).some((v) => (typeof v === 'number' ? v > 0 : true))
    if (hasSlots) {
      for (let level = 1; level <= 9; level++) {
        const key = `spell_slot_${level}`
        if (!seen.has(key)) {
          opts.push({ value: key, label: `${level}环法术位` })
          seen.add(key)
        }
      }
    }
  }

  return opts
}

/**
 * 主动卡编辑器。
 *
 * @param {object}   props.data              - activeChargeData（chargeItemModel 格式）
 * @param {function} props.onChange           - 数据变更回调
 * @param {object}   props.duration          - 持续时间值
 * @param {function} props.onDurationChange   - 持续时间变更回调
 * @param {function} props.renderEffects      - 渲染效果区的函数（由 BuffForm 提供 ActiveEffectsList）
 * @param {object}   props.charResources      - 角色职业资源 (char.classResources)
 * @param {object}   props.spellSlots        - 角色法术位 (char.spellSlots)
 */
export default function ActiveCardEditor({
  data,
  onChange,
  duration,
  onDurationChange,
  renderEffects,
  charResources,
  spellSlots,
}) {
  const chargeData = normalizeChargeItemValue(data)
  const patch = (patchObj) => onChange({ ...chargeData, ...patchObj })
  const patchRecovery = (recPatch) => patch({ recovery: { ...chargeData.recovery, ...recPatch } })

  // 动态资源选项
  const resourceOptions = buildResourceOptions(charResources, spellSlots)
  const isCharges = chargeData.resourceType === 'charges'

  // 样式工具
  const compactInput = inputClass
    .replace(/\bh-10\b/, 'h-7')
    .replace(/\bpx-3\b/, 'px-1.5')
    .replace(/\btext-sm\b/, 'text-[11px]')
    .replace(/\bw-full\b/, '')
  const labelCls = 'text-[10px] text-dnd-text-muted shrink-0 leading-none'

  return (
    <div className="space-y-2">
      {/* ── 1+2. 消耗资源 + 恢复手段（同一行） ── */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-900/5 p-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-amber-400 text-[10px] font-bold uppercase tracking-wider shrink-0">消耗资源</span>
          <select
            value={chargeData.resourceType}
            onChange={(e) => patch({ resourceType: e.target.value })}
            className={compactInput + ' w-[7rem] shrink-0 cursor-pointer'}
          >
            {resourceOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {isCharges && (
            <>
              <span className="text-[10px] text-dnd-text-muted shrink-0">总充能</span>
              <NumberStepper
                value={chargeData.charges}
                onChange={(v) => patch({ charges: Math.max(0, Math.min(999, v)) })}
                min={0} max={999} compact narrow className="!h-7"
              />
              <span className="text-green-400 text-[10px] font-bold uppercase tracking-wider shrink-0 ml-1">恢复</span>
              <select
                value={chargeData.recovery?.method || 'long_rest'}
                onChange={(e) => {
                  const method = e.target.value
                  const next = { ...chargeData.recovery, method }
                  if (!recoverySupportsAmount(method)) next.kind = 'full'
                  else if (recoveryIsDiceOnly(method)) next.kind = 'dice'
                  patch({ recovery: next })
                }}
                className={compactInput + ' w-[6rem] shrink-0 cursor-pointer'}
              >
                {RECOVERY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {recoverySupportsAmount(chargeData.recovery?.method) && (
                <>
                  {!recoveryIsDiceOnly(chargeData.recovery?.method) && (
                    <select
                      value={chargeData.recovery?.kind || 'full'}
                      onChange={(e) => patchRecovery({ kind: e.target.value })}
                      className={compactInput + ' w-[3.5rem] shrink-0 cursor-pointer'}
                    >
                      <option value="full">回满</option>
                      <option value="fixed">固定</option>
                      <option value="dice">掷骰</option>
                    </select>
                  )}
                  {chargeData.recovery?.kind === 'fixed' && (
                    <NumberStepper
                      value={chargeData.recovery?.fixed || 0}
                      onChange={(v) => patchRecovery({ fixed: Math.max(0, v) })}
                      min={0} max={999} compact narrow className="!h-7"
                    />
                  )}
                  {(chargeData.recovery?.kind === 'dice' || recoveryIsDiceOnly(chargeData.recovery?.method)) && (
                    <div className="flex items-center gap-0.5">
                      <NumberStepper
                        value={chargeData.recovery?.diceCount || 1}
                        onChange={(v) => patchRecovery({ diceCount: Math.max(1, v) })}
                        min={1} max={99} compact narrow className="!h-7 !w-10"
                      />
                      <span className="text-gray-400 text-xs">d</span>
                      <NumberStepper
                        value={chargeData.recovery?.diceSides || 6}
                        onChange={(v) => patchRecovery({ diceSides: Math.max(1, v) })}
                        min={1} max={100} compact narrow className="!h-7 !w-10"
                      />
                      <span className="text-gray-400 text-xs">+</span>
                      <NumberStepper
                        value={chargeData.recovery?.diceBonus || 0}
                        onChange={(v) => patchRecovery({ diceBonus: Math.max(0, v) })}
                        min={0} max={99} compact narrow className="!h-7 !w-10"
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {!isCharges && (
            <span className="text-gray-500 text-[10px]">次数与恢复由职业资源管理</span>
          )}
        </div>
      </div>

      {/* ── 3. 动作消耗 ── */}
      <div className="rounded-lg border border-orange-500/20 bg-orange-900/5 p-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-orange-400 text-[10px] font-bold uppercase tracking-wider shrink-0">动作消耗</span>
          <select
            value={chargeData.actionCost || 'action'}
            onChange={(e) => patch({ actionCost: e.target.value })}
            className={compactInput + ' w-[5rem] shrink-0 cursor-pointer'}
          >
            {ACTION_COST_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {chargeData.actionCost === 'movement' && (
            <div className="flex items-center gap-1">
              <NumberStepper
                value={chargeData.movementFeet || 0}
                onChange={(v) => patch({ movementFeet: Math.max(0, v) })}
                min={0} max={999} compact narrow className="!h-7 !w-14"
              />
              <span className="text-gray-400 text-[10px]">尺</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. 释放效果（由 BuffForm 通过 renderEffects 渲染） ── */}
      {renderEffects?.()}

      {/* ── 5. 持续时间 ── */}
      <div className="rounded-lg border border-gray-500/20 bg-gray-700/10 p-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider shrink-0">持续时间</span>
          <DurationEditor value={duration} onChange={onDurationChange} compact />
        </div>
        <p className="text-gray-600 text-[9px] mt-1">即刻=即时效果 · 1小时以下短休自动取消 · 8小时以下长休自动取消</p>
      </div>
    </div>
  )
}
