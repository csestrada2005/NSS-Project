import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WorkspaceLayout } from './layouts/WorkspaceLayout';
import { StudioLayout } from './layouts/StudioLayout';
import { StudioEngine } from './pages/StudioEngine';
import DashboardPage from './pages/DashboardPage';
import ContactsPage from './pages/ContactsPage';
import ProjectsPage from './pages/ProjectsPage';
import FinancePage from './pages/FinancePage';
import MetricsPage from './pages/MetricsPage';
import SettingsPage from './pages/SettingsPage';
import AIStudioPage from './pages/AIStudioPage';
import { Login } from './components/auth/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="login" element={<Login />} />

        {/* Business OS — wrapped in the sidebar + top-nav shell */}
        <Route element={<WorkspaceLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="ai-studio" element={<AIStudioPage />} />
        </Route>

        {/* AI Web-Builder Studio — full-screen, no business chrome */}
        <Route element={<StudioLayout />}>
          <Route path="studio" element={<StudioEngine />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
