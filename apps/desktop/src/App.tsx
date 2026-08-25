import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./state/AuthContext";
import { ProjectProvider, useProjectContext } from "./state/ProjectContext";
import { AuthScreen } from "./screens/AuthScreen";
import { ProjectPicker } from "./screens/ProjectPicker";
import { Shell } from "./screens/Shell";
import { ToastBridge } from "./components/ToastBridge";
import { LogViewer } from "./components/LogViewer";
import { authReady } from "./lib/pocketbase";
import "@agenpic/ui/src/tokens.css";
import "./App.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Routes() {
  const { user } = useAuth();
  const { activeProject } = useProjectContext();

  if (!user) return <AuthScreen />;
  if (!activeProject) return <ProjectPicker />;
  return <Shell />;
}

function App() {
  // Wait for any persisted session to load from disk before rendering
  // auth-gated routes, so a returning user isn't flashed the login screen.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authReady.then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>
          <Routes />
          <ToastBridge />
          <LogViewer />
        </ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
