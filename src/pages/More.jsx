import { useAuth } from '../contexts/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import { APP_VERSION_LABEL } from '../config/version'

export default function More() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <h1 className="font-display text-xl font-semibold text-white mb-4">
        更多
      </h1>
      <div className="space-y-2">
        <Link
          to="/spells"
          className="block py-3 px-4 rounded-xl bg-dnd-card border border-white/10 text-white hover:border-dnd-red/50 transition-colors"
        >
          法术大全
        </Link>
        <Link
          to="/more/house-rules"
          className="block py-3 px-4 rounded-xl bg-dnd-card border border-white/10 text-white hover:border-dnd-red/50 transition-colors"
        >
          <span className="font-medium">规则收录</span>
          <span className="block text-dnd-text-muted text-xs font-normal mt-0.5">规则大全 · DM 可编辑职业/专长等正文</span>
        </Link>
        <Link
          to="/more/module-library"
          className="block py-3 px-4 rounded-xl bg-dnd-card border border-white/10 text-white hover:border-dnd-red/50 transition-colors"
        >
          <span className="font-medium">模组库</span>
          <span className="block text-dnd-text-muted text-xs font-normal mt-0.5">管理当前模组的 BUFF/物品模板</span>
        </Link>
        <Link
          to="/more/creature-library"
          className="block py-3 px-4 rounded-xl bg-dnd-card border border-white/10 text-white hover:border-dnd-red/50 transition-colors"
        >
          <span className="font-medium">生物库</span>
          <span className="block text-dnd-text-muted text-xs font-normal mt-0.5">变身效果引用的生物数据</span>
        </Link>
        <Link
          to="/more/race-library"
          className="block py-3 px-4 rounded-xl bg-dnd-card border border-white/10 text-white hover:border-dnd-red/50 transition-colors"
        >
          <span className="font-medium">种族库</span>
          <span className="block text-dnd-text-muted text-xs font-normal mt-0.5">管理种族数据、特性与参考表格</span>
        </Link>
        <p className="text-dnd-text-muted text-sm pt-2">
          当前：{user?.name}
          {isAdmin && ' (DM)'}
        </p>
        <p className="text-dnd-text-muted text-xs pt-1 opacity-80">
          {APP_VERSION_LABEL} · D&D 团队小助手
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 w-full py-3 rounded-xl border border-dnd-red text-dnd-red hover:bg-dnd-red/10 font-medium uppercase text-xs tracking-label"
        >
          登出
        </button>
      </div>
    </div>
  )
}
