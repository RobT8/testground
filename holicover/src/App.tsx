import { useState } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { useDatabase } from './hooks/useDatabase';
import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import WeeklyPlannerScreen from './screens/WeeklyPlannerScreen';
import DayAssignScreen from './screens/DayAssignScreen';
import ChildrenScreen from './screens/ChildrenScreen';
import CarersScreen from './screens/CarersScreen';
import SettingsScreen from './screens/SettingsScreen';

/**
 * Routes that sit behind the bottom navigation bar. The weekly planner keeps
 * it; the day assignment screen below it does not, so that screen is a focused
 * task the back arrow returns from.
 */
const NAV_PATTERNS = ['/', '/children', '/carers', '/settings', '/holiday/:holidayId'];

function AppShell() {
  const { pathname } = useLocation();
  const showNav = NAV_PATTERNS.some((pattern) => matchPath({ path: pattern, end: true }, pathname));

  return (
    <div className="app-shell">
      <Outlet />
      {showNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  const { ready, onboarded: storedOnboarded, error } = useDatabase();
  // Finishing setup flips the guard immediately; without this the redirect
  // below would bounce the user straight back into the wizard they just left.
  const [justOnboarded, setJustOnboarded] = useState(false);
  const onboarded = justOnboarded || storedOnboarded;

  if (error) {
    return (
      <div className="app-shell">
        <div className="screen">
          <h1 className="page-title">Something went wrong</h1>
          <p className="placeholder-note">
            HoliCover could not open its database. Restarting the app usually fixes this.
          </p>
          <p className="placeholder-note">{error.message}</p>
        </div>
      </div>
    );
  }

  // Nothing renders until the schema exists — every screen below assumes it.
  if (!ready) {
    return (
      <div className="app-shell">
        <div className="screen screen--centred">
          <p className="placeholder-note">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    // HashRouter: the Android WebView serves the app from a file-ish origin,
    // so hash routing avoids deep-link 404s on reload.
    <HashRouter>
      <Routes>
        {/* The wizard runs once: first launch is sent to it, and anyone
            arriving at its URL afterwards (a reload, a stale link) is sent
            home rather than stranded on it with no way back. */}
        <Route
          path="/onboarding"
          element={
            onboarded ? (
              <Navigate to="/" replace />
            ) : (
              <OnboardingScreen onComplete={() => setJustOnboarded(true)} />
            )
          }
        />
        {!onboarded && <Route path="/" element={<Navigate to="/onboarding" replace />} />}
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
