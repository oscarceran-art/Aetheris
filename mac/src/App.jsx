import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { StoreProvider, useStore } from "./lib/store";
import Layout from "./components/Layout";
import AgentSpace from "./pages/AgentSpace";
import AgentsPage from "./pages/AgentsPage";
import GemsPage from "./pages/GemsPage";
import TodoPage from "./pages/TodoPage";
import SettingsPage from "./pages/SettingsPage";
import HomePage from "./pages/HomePage";
import GalaxyPage from "./pages/GalaxyPage";

const ThemedToaster = () => {
  const { state } = useStore();
  return <Toaster theme={state.settings.theme} position="bottom-right" toastOptions={{ className: "glass-toast" }} />;
};

function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="galaxy" element={<GalaxyPage />} />
            <Route path="agent/:agentId" element={<AgentSpace />} />
            <Route path="agent/:agentId/chat/:convId" element={<AgentSpace />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="gems" element={<GemsPage />} />
            <Route path="todo" element={<TodoPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ThemedToaster />
    </StoreProvider>
  );
}

export default App;
