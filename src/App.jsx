import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import CharacterNew from './pages/CharacterNew'
import Warehouse from './pages/Warehouse'
import Spells from './pages/Spells'
import CharacterSpellsPage from './pages/CharacterSpellsPage'
import More from './pages/More'
import HouseRules from './pages/HouseRules'
import DataMaintain from './pages/DataMaintain'
import ModuleLibrary from './pages/ModuleLibrary'
import CreatureLibraryManager from './pages/CreatureLibraryManager'

const CharacterSheet = lazy(() => import('./pages/CharacterSheet'))

/**
 * 包装 CharacterSheet，用 URL 中的角色 ID 作为 key 强制重挂载。
 * 防止切换角色时 persist 队列、useRef、useState 等跨角色泄漏。
 */
function CharacterSheetWithKey() {
  const { id } = useParams()
  return <CharacterSheet key={id} />
}

function AppRoutes() {
  const { user } = useAuth()

  if (user === undefined) {
    return (
      <div
        className="min-h-screen bg-dnd-bg flex items-center justify-center"
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#121212' }}
      >
        <p style={{ color: '#94a3b8', fontSize: '1.125rem' }}>加载中…</p>
      </div>
    )
  }
  if (!user) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/characters" element={<Dashboard />} />
        <Route path="/characters/new" element={<CharacterNew />} />
        <Route
          path="/characters/:id"
          element={
            <Suspense
              fallback={
                <div
                  className="min-h-screen flex items-center justify-center text-dnd-text-muted"
                  style={{ backgroundColor: 'var(--page-bg)' }}
                >
                  加载角色卡…
                </div>
              }
            >
              <CharacterSheetWithKey />
            </Suspense>
          }
        />
        <Route path="/character-spells" element={<CharacterSpellsPage />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/spells" element={<Spells />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/house-rules" element={<HouseRules />} />
        <Route path="/more/data" element={<DataMaintain />} />
        <Route path="/more/module-library" element={<ModuleLibrary />} />
        <Route path="/more/creature-library" element={<CreatureLibraryManager />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
