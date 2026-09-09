import weaponIcon from '../assets/category-icons/weapon.png'
import armorIcon from '../assets/category-icons/armor.png'
import armorplateIcon from '../assets/category-icons/armorplate.png'
import firearmIcon from '../assets/category-icons/firearm.png'
import focusIcon from '../assets/category-icons/focus.png'
import containerIcon from '../assets/category-icons/container.png'
import potionIcon from '../assets/category-icons/potion.png'
import gemIcon from '../assets/category-icons/gem.png'
import toolIcon from '../assets/category-icons/tool.png'
import musicIcon from '../assets/category-icons/music.png'
import otherIcon from '../assets/category-icons/other.png'

const FAMILIES = {
  weapon: { color: '#ef4444', icon: weaponIcon },
  armor: { color: '#38bdf8', icon: armorIcon },
  focus: { color: '#8b5cf6', icon: focusIcon },
  container: { color: '#fbbf24', icon: containerIcon },
  potion: { color: '#34f5c5', icon: potionIcon },
  gem: { color: '#8b5cf6', icon: gemIcon },
  tool: { color: '#fbbf24', icon: toolIcon },
  music: { color: '#2dd4bf', icon: musicIcon },
  other: { color: '#94a3b8', icon: otherIcon },
}

// 同族内按类型换造型，颜色仍跟随族色
const TYPE_ICON_OVERRIDE = {
  盔甲: armorplateIcon, 轻甲: armorplateIcon, 中甲: armorplateIcon, 重甲: armorplateIcon,
  枪械: firearmIcon, 子弹: firearmIcon, 弹药: firearmIcon,
}

const TYPE_TO_FAMILY = {
  近战武器: 'weapon', 近战: 'weapon', 远程武器: 'weapon', 远程: 'weapon', 枪械: 'weapon', 弹药: 'weapon', 子弹: 'weapon',
  盔甲: 'armor', 轻甲: 'armor', 中甲: 'armor', 重甲: 'armor', 盾牌: 'armor',
  法器: 'focus', 卷轴: 'focus',
  容器: 'container', 储物: 'container', 次元袋: 'container', 秘法箱: 'container', 套组: 'container', 工具包与套组: 'container',
  药品: 'potion', 消耗品: 'potion', 食物: 'potion', 爆炸品: 'potion',
  饰品: 'gem', 货币: 'gem',
  工具: 'tool', 工匠工具: 'tool', 赌具: 'tool', 照明与燃料: 'tool', 书写与记录: 'tool', 冒险装备: 'tool',
  乐器: 'music',
}

export function getItemCategoryTheme(type) {
  const family = FAMILIES[TYPE_TO_FAMILY[type] || 'other']
  return { ...family, icon: TYPE_ICON_OVERRIDE[type] || family.icon }
}
