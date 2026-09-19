import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import WeeklyPlannerScreen from './screens/WeeklyPlannerScreen';
import DayAssignScreen from './screens/DayAssignScreen';
import ChildrenScreen from './screens/ChildrenScreen';
import CarersScreen from './screens/CarersScreen';
import SettingsScreen from './screens/SettingsScreen';

/** Routes that sit behind the bottom navigation bar. */
const NAV_ROUTES = ['/', '/children', '/carers', '/settings'];

function AppShell() {
  const { pathname } = useLocation();
  const showNav = NAV_ROUTES.includes(pathname);

  return (
    <div className="app-shell">
      <Outlet />
      {showNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    // HashRouter: the Android WebView serves the app from a file-ish origin,
    // so hash routing avoids deep-link 404s on reload.
    <HashRouter>
      <Routes>
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/holiday/:holidayId" element={<WeeklyPlannerScreen />} />
          <Route path="/holiday/:holidayId/day/:date" element={<DayAssignScreen />} />
          <Route path="/children" element={<ChildrenScreen />} />
          <Route path="/carers" element={<CarersScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
