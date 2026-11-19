import { Navigate, Route, Routes } from 'react-router'
import { AdminLayout } from './admin/AdminLayout'
import { DeploysPage } from './admin/DeploysPage'
import { DevicesPage } from './admin/DevicesPage'
import { IntegrationsPage } from './admin/IntegrationsPage'
import { RoomsPage as AdminRoomsPage } from './admin/RoomsPage'
import { SettingsPage } from './admin/SettingsPage'
import { UsersPage } from './admin/UsersPage'
import { LoginScreen } from './auth/LoginScreen'
import { RequireAdmin } from './auth/RequireAdmin'
import { RequireAuth } from './auth/RequireAuth'
import { RequireNotGuest } from './auth/RequireNotGuest'
import { SessionEndedListener } from './auth/SessionEndedListener'
import { AppShell } from './layout/AppShell'
import { AllDevicesPage } from './pages/AllDevicesPage'
import { CamerasPage } from './pages/CamerasPage'
import { DashboardPage } from './pages/DashboardPage'
import { DevicePage } from './pages/DevicePage'
import { HomePage } from './pages/HomePage'
import { RoomsPage } from './pages/RoomsPage'
import { RoutineEditorPage } from './pages/RoutineEditorPage'
import { RoutinesPage } from './pages/RoutinesPage'
import { WeatherPage } from './pages/WeatherPage'

export function AppRoutes() {
  return (
    <>
      <SessionEndedListener />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/all" element={<AllDevicesPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/rooms/all" element={<Navigate to="/all" replace />} />
            <Route path="/rooms/:roomId" element={<DashboardPage />} />
            <Route path="/devices/:id" element={<DevicePage />} />
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route element={<RequireNotGuest />}>
              <Route path="/cameras" element={<CamerasPage />} />
              <Route path="/routines/new" element={<RoutineEditorPage />} />
              <Route path="/routines/:id" element={<RoutineEditorPage />} />
            </Route>
            <Route path="/admin" element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="devices" replace />} />
                <Route path="devices" element={<DevicesPage />} />
                <Route path="rooms" element={<AdminRoomsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="integrations" element={<IntegrationsPage />} />
                <Route path="integrations/:integration" element={<IntegrationsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="deploys" element={<DeploysPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<RequireAuth />} />
      </Routes>
    </>
  )
}
