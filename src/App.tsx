import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { signInWithRedirect, signOut } from 'aws-amplify/auth';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { Container, Button, Stack, AppShell, Text } from '@mantine/core';
import logo from './assets/logo.svg';
import './App.css';
import './amplify-config';
import Navbar from './components/Navbar/Navbar';
import MarketData from './pages/MarketData/MarketData';
import SecurityMaster from './pages/SecurityMaster/SecurityMaster';
import { GlobalStateProvider } from './context/GlobalStateContext';

function LoginScreen() {
  const handleLogin = () => {
    signInWithRedirect();
  };

  return (
    <Container size="xs" h="100vh">
      <Stack align="center" justify="center" h="100%">
        <img src={logo} alt="Gnome Trading Group Logo" className="logo" />
        <Button size="sm" onClick={handleLogin} variant="light">
          Sign in with SSO
        </Button>
      </Stack>
    </Container>
  );
}

function Dashboard() {
  return (
    <Container>
      <Text size="xl">Dashboard</Text>
    </Container>
  );
}

function Settings() {
  return (
    <Container>
      <Text size="md">I mean, cmon, what settings did you think we'd have?</Text>
    </Container>
  );
}

function Logout() {
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  handleLogout();
  return null;
}

function AppContent() {
  const { authStatus } = useAuthenticator();

  if (authStatus !== 'authenticated') {
    return <LoginScreen />;
  }

  return (
    <Router>
      <AppShell
        navbar={{ width: 80, breakpoint: 'sm' }}
        padding="md"
      >
        <Navbar />
        <AppShell.Main>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/market-data" element={<MarketData />} />
            <Route path="/security-master" element={<SecurityMaster />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppShell.Main>
      </AppShell>
    </Router>
  );
}

function App() {
  return (
    <Authenticator.Provider>
      <GlobalStateProvider>
        <AppContent />
      </GlobalStateProvider>
    </Authenticator.Provider>
  );
}

export default App;
