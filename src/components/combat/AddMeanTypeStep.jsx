/**
 * 添加战斗手段 — 第1步：选择类型
 */
import React from 'react'
import { buildDefaultGainsFromBuffs, inferPhysicalWeaponAbilityFromProto, getDefaultWeaponMode } from './combatMeanUtils'

export default function AddMeanTypeStep({
  weaponsFromInv, itemMeansFromInv, combatMeans, buffStats, mergedBuffs, char,
  onPickWeapon, onPickItem, onPickSpell, onPickCombo, onCancel,
}) {
  return (
    <>
      <h3 className="text-dnd-gold-light text-sm font-bold mb-3">添加战斗手段</h3>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onPickWeapon} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
          武器攻击
        </button>
        <button type="button" onClick={onPickItem} disabled={itemMeansFromInv.length === 0} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm">
          道具攻击
        </button>
        <button type="button" onClick={onPickSpell} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
          法术攻击
        </button>
        <button type="button" onClick={onPickCombo} disabled={combatMeans.length === 0} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm">
          组合技
        </button>
      </div>
      {itemMeansFromInv.length === 0 && <p className="text-dnd-text-muted text-xs mt-1">背包中暂无消耗品、法器（法杖/魔杖/权杖）或卷轴时，道具攻击不可选。</p>}
      <button type="button" onClick={onCancel} className="mt-3 w-full py-1.5 rounded border border-gray-500 text-gray-400 text-xs">取消</button>
    </>
  )
}

/** 点击"武器攻击"时的初始化逻辑（供 CombatStatus 调用） */
export function initWeaponPick(weaponsFromInv) {
  const w0 = weaponsFromInv[0]
  return {
    weaponIndex: w0 ? w0.index : null,
    ability: w0 ? inferPhysicalWeaponAbilityFromProto(w0.proto) : 'str',
    damageType: '',
    weaponMode: w0 ? getDefaultWeaponMode(w0) : 'one_hand',
  }
}

/** 点击"组合技"时的初始化逻辑 */
export function initComboPick(combatMeans, buffStats, mergedBuffs, char) {
  const primary = combatMeans[0] || null
  const isSpellPrimary = primary && (primary.type === 'spell_attack' || primary.type === 'spell')
  return {
    primaryId: primary ? primary.id : null,
    attachments: [],
    gains: buildDefaultGainsFromBuffs(primary || {}, buffStats, mergedBuffs, !!isSpellPrimary, char),
  }
}
