import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { signInWithRedirect, signOut } from 'aws-amplify/auth';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { Container, Button, Stack, AppShell, UnstyledButton, Paper, Transition } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import logo from './assets/logo.svg';
import './App.css';
import './amplify-config';
import Navbar from './components/Navbar/Navbar';
import Collectors from './pages/MarketData/Collectors/Collectors';
import CoverageSummary from './pages/MarketData/Coverage/CoverageSummary';
import SecurityCoverage from './pages/MarketData/Coverage/SecurityCoverage';
import SecurityExchangeCoverage from './pages/MarketData/Coverage/SecurityExchangeCoverage';
import TransformJobs from './pages/MarketData/TransformJobs/TransformJobs';
import Gaps from './pages/MarketData/Gaps/Gaps';
import SecurityMaster from './pages/SecurityMaster/SecurityMaster';
import LatencyProbe from './pages/LatencyProbe/LatencyProbe';
import { GlobalStateProvider } from './context/GlobalStateContext';
import CollectorDetail from './pages/CollectorDetail/CollectorDetail';

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
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);

  if (authStatus !== 'authenticated') {
    return <LoginScreen />;
  }

  return (
    <Router>
      <AppShell
        navbar={{
          width: 240,
          breakpoint: 0,
          collapsed: { desktop: !navbarOpened },
        }}
        padding="md"
      >
        <Navbar onToggle={toggleNavbar} />
        <AppShell.Main>
          {/* Floating logo button when navbar is collapsed */}
          <Transition mounted={!navbarOpened} transition="fade" duration={200}>
            {(styles) => (
              <UnstyledButton
                onClick={toggleNavbar}
                style={{
                  ...styles,
                  position: 'fixed',
                  top: 'var(--mantine-spacing-md)',
                  left: 'var(--mantine-spacing-md)',
                  zIndex: 100,
                }}
              >
                <Paper
                  radius="xl"
                  p="xs"
                  style={{
                    background: 'var(--mantine-primary-color-light-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '2.5rem',
                    height: '2.5rem',
                    border: '1px solid var(--mantine-primary-color-light)',
                    cursor: 'pointer',
                  }}
                >
                  <img src={logo} alt="Logo" style={{ height: '1.25rem', width: 'auto' }} />
                </Paper>
              </UnstyledButton>
            )}
          </Transition>
          <Routes>
            <Route path="/security-master" element={<SecurityMaster />} />
            <Route path="/market-data/collectors" element={<Collectors />} />
            <Route path="/market-data/collectors/:listingId" element={<CollectorDetail />} />
            <Route path="/market-data/coverage" element={<CoverageSummary />} />
            <Route path="/market-data/coverage/:securityId" element={<SecurityCoverage />} />
            <Route path="/market-data/coverage/:securityId/:exchangeId" element={<SecurityExchangeCoverage />} />
            <Route path="/market-data/transform-jobs" element={<TransformJobs />} />
            <Route path="/market-data/gaps" element={<Gaps />} />
            <Route path="/tools/latency-probe" element={<LatencyProbe />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/" element={<Navigate to="/security-master" replace />} />
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
