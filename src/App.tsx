import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { usePageTitle } from './hooks/usePageTitle';
import { signInWithRedirect, signOut } from 'aws-amplify/auth';
import { useAuthenticator, Authenticator } from '@aws-amplify/ui-react';
import { Container, Button, Stack, AppShell, UnstyledButton, Paper, Transition, Center, Loader, Burger, Group, Title, em } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import logo from './assets/logo.svg';
import './App.css';
import './amplify-config';
import Navbar from './components/Navbar/Navbar';
import { KillSwitchWatcher } from './components/KillSwitchWatcher';
import { GlobalStateProvider } from './context/GlobalStateContext';

// Each page is its own chunk, so the first load only downloads the shell and the page being opened.
const Collectors = lazy(() => import('./pages/MarketData/Collectors/Collectors'));
const CoverageSummary = lazy(() => import('./pages/MarketData/Coverage/CoverageSummary'));
const SecurityCoverage = lazy(() => import('./pages/MarketData/Coverage/SecurityCoverage'));
const SecurityExchangeCoverage = lazy(() => import('./pages/MarketData/Coverage/SecurityExchangeCoverage'));
const TransformJobs = lazy(() => import('./pages/MarketData/TransformJobs/TransformJobs'));
const Gaps = lazy(() => import('./pages/MarketData/Gaps/Gaps'));
const SecurityMaster = lazy(() => import('./pages/SecurityMaster/SecurityMaster'));
const ListingDetail = lazy(() => import('./pages/SecurityMaster/ListingDetail'));
const SecurityDetail = lazy(() => import('./pages/SecurityMaster/SecurityDetail'));
const LatencyProbe = lazy(() => import('./pages/LatencyProbe/LatencyProbe'));
const Strategies = lazy(() => import('./pages/Strategies/Strategies'));
const StrategyDetail = lazy(() => import('./pages/Strategies/StrategyDetail'));
const PositionDetail = lazy(() => import('./pages/Strategies/PositionDetail'));
const Blotter = lazy(() => import('./pages/Trading/Blotter'));
const SystemHealth = lazy(() => import('./pages/System/SystemHealth'));
const RiskPolicies = lazy(() => import('./pages/Risk/RiskPolicies'));
const CollectorDetail = lazy(() => import('./pages/CollectorDetail/CollectorDetail'));
const QualityIssues = lazy(() => import('./pages/MarketData/QualityIssues/QualityIssues'));
const MinuteInvestigation = lazy(() => import('./pages/MarketData/QualityIssues/MinuteInvestigation'));
const BacktestList = lazy(() => import('./pages/Backtests/BacktestList'));
const BacktestDetail = lazy(() => import('./pages/Backtests/BacktestDetail'));
const ResearchList = lazy(() => import('./pages/Research/ResearchList'));
const ResearchDetail = lazy(() => import('./pages/Research/ResearchDetail'));
const ArtifactList = lazy(() => import('./pages/Research/ArtifactList'));
const DatasetList = lazy(() => import('./pages/Research/DatasetList'));
const EventsList = lazy(() => import('./pages/Predictions/EventsList'));
const EventDetail = lazy(() => import('./pages/Predictions/EventDetail'));
const ContractRelationships = lazy(() => import('./pages/Predictions/ContractRelationships'));
const HedgeKeywords = lazy(() => import('./pages/Predictions/HedgeKeywords'));
const SessionsList = lazy(() => import('./pages/Sessions/SessionsList'));
const SessionDetail = lazy(() => import('./pages/Sessions/SessionDetail'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const ServiceConfig = lazy(() => import('./pages/Tools/ServiceConfig'));
const LaunchRules = lazy(() => import('./pages/Launcher/LaunchRules'));
const LaunchHistory = lazy(() => import('./pages/Launcher/LaunchHistory'));
const ManualTrigger = lazy(() => import('./pages/Launcher/ManualTrigger'));
const PipelineList = lazy(() => import('./pages/Pipelines/PipelineList'));
const PipelineDetail = lazy(() => import('./pages/Pipelines/PipelineDetail'));

function LoginScreen() {
  const handleLogin = () => {
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    if (currentPath && currentPath !== '/') {
      sessionStorage.setItem('postLoginRedirect', currentPath);
    }
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

  useEffect(() => {
    signOut().then(() => navigate('/'));
  }, [navigate]);

  return null;
}

// The mobile navbar covers the page, so it closes once a link has taken the user somewhere.
function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation();
  useEffect(() => { onNavigate(); }, [pathname, onNavigate]);
  return null;
}

function PageTitle() {
  usePageTitle();
  return null;
}

function AppContent() {
  const { authStatus } = useAuthenticator();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] = useDisclosure(false);
  const isMobile = useMediaQuery(`(max-width: ${em(767)})`) ?? false;
  const redirectHandled = useRef(false);

  if (authStatus !== 'authenticated') {
    return <LoginScreen />;
  }

  if (!redirectHandled.current) {
    redirectHandled.current = true;
    const saved = sessionStorage.getItem('postLoginRedirect');
    if (saved) {
      sessionStorage.removeItem('postLoginRedirect');
      window.history.replaceState(null, '', saved);
    }
  }

  // Mounted only once signed in: the provider loads registry data, which needs the user's Cognito token.
  return (
    <GlobalStateProvider>
      <Router>
        <PageTitle />
        <CloseOnNavigate onNavigate={closeMobileNav} />
        <KillSwitchWatcher />
        <AppShell
          header={{ height: 56, collapsed: !isMobile }}
          navbar={{
            width: 240,
            breakpoint: 'sm',
            collapsed: { mobile: !mobileNavOpened, desktop: !navbarOpened },
          }}
          padding="md"
        >
          <AppShell.Header px="md">
            <Group h="100%" gap="sm">
              <Burger opened={mobileNavOpened} onClick={toggleMobileNav} size="sm" aria-label="Toggle navigation" />
              <img src={logo} alt="Logo" style={{ height: '1.25rem', width: 'auto' }} />
              <Title order={4}>GTG</Title>
            </Group>
          </AppShell.Header>
          <Navbar onToggle={isMobile ? closeMobileNav : toggleNavbar} />
          <AppShell.Main>
            {/* Floating logo button when navbar is collapsed */}
            <Transition mounted={!navbarOpened && !isMobile} transition="fade" duration={200}>
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
            <Suspense fallback={<Center h="50vh"><Loader /></Center>}>
              <Routes>
                <Route path="/security-master" element={<SecurityMaster />} />
                <Route path="/security-master/listings/:listingId" element={<ListingDetail />} />
                <Route path="/security-master/securities/:securityId" element={<SecurityDetail />} />
                <Route path="/market-data/collectors" element={<Collectors />} />
                <Route path="/market-data/collectors/:listingId" element={<CollectorDetail />} />
                <Route path="/market-data/coverage" element={<CoverageSummary />} />
                <Route path="/market-data/coverage/:securityId" element={<SecurityCoverage />} />
                <Route path="/market-data/coverage/:securityId/:exchangeId" element={<SecurityExchangeCoverage />} />
                <Route path="/market-data/transform-jobs" element={<TransformJobs />} />
                <Route path="/market-data/gaps" element={<Gaps />} />
                <Route path="/market-data/quality-issues" element={<QualityIssues />} />
                <Route path="/market-data/quality-issues/investigate/:listingId/:timestamp" element={<MinuteInvestigation />} />
                <Route path="/tools/service-config" element={<ServiceConfig />} />
                <Route path="/tools/latency-probe" element={<LatencyProbe />} />
                <Route path="/strategies" element={<Strategies />} />
                <Route path="/strategies/:strategyId" element={<StrategyDetail />} />
                <Route path="/strategies/:strategyId/listings/:listingId" element={<PositionDetail />} />
                <Route path="/trading/blotter" element={<Blotter />} />
                <Route path="/system" element={<SystemHealth />} />
                <Route path="/risk/policies" element={<RiskPolicies />} />
                <Route path="/backtests" element={<BacktestList />} />
                <Route path="/backtests/:runId" element={<BacktestDetail />} />
                <Route path="/research" element={<Navigate to="/research/sessions" replace />} />
                <Route path="/research/sessions" element={<ResearchList />} />
                <Route path="/research/sessions/:sessionName" element={<ResearchDetail />} />
                <Route path="/research/artifacts" element={<ArtifactList />} />
                <Route path="/research/datasets" element={<DatasetList />} />
                <Route path="/research/pipelines" element={<PipelineList />} />
                <Route path="/research/pipelines/:pipelineName" element={<PipelineDetail />} />
                <Route path="/predictions/events" element={<EventsList />} />
                <Route path="/predictions/events/:eventId" element={<EventDetail />} />
                <Route path="/predictions/relationships" element={<ContractRelationships />} />
                <Route path="/predictions/hedge-keywords" element={<HedgeKeywords />} />
                <Route path="/sessions" element={<SessionsList />} />
                <Route path="/sessions/:sessionId" element={<SessionDetail />} />
                <Route path="/launcher/launch-rules" element={<LaunchRules />} />
                <Route path="/launcher/launch-history" element={<LaunchHistory />} />
                <Route path="/launcher/manual-trigger" element={<ManualTrigger />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/logout" element={<Logout />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </AppShell.Main>
        </AppShell>
      </Router>
    </GlobalStateProvider>
  );
}

function App() {
  return (
    <Authenticator.Provider>
      <AppContent />
    </Authenticator.Provider>
  );
}

export default App;
