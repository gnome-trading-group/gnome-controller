import { IconGauge, IconHeartbeat, IconLockSquareRounded, IconNotes, IconTool, IconChartLine, IconTestPipe, IconFlask, IconScale, IconRocket } from "@tabler/icons-react";
import { AppShell, Box, Paper, Group, ScrollArea, Code, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { useSystemHealth } from '../../query/hooks';
import { AlarmsSection } from '../../types';
import { useLocation } from 'react-router-dom';
import logo from '../../assets/logo.svg';
import classes from './Navbar.module.css';
import { LinksGroup } from '../NavbarLinksGroup/NavbarLinksGroup';
import { UserButton } from '../UserButton/UserButton';

interface NavbarProps {
  onToggle: () => void;
}

const routes = [
  { icon: IconGauge, label: 'Dashboard', link: '/dashboard' },
  {
    label: 'Market Data',
    icon: IconNotes,
    links: [
      { label: 'Coverage', link: '/market-data/coverage' },
      { label: 'Collectors', link: '/market-data/collectors' },
      { label: 'Transform Jobs', link: '/market-data/transform-jobs' },
      { label: 'Gaps', link: '/market-data/gaps' },
      { label: 'Quality Issues', link: '/market-data/quality-issues' },
    ],
  },
  { icon: IconLockSquareRounded, label: 'Security Master', link: '/security-master' },
  {
    label: 'Prediction Markets',
    icon: IconScale,
    links: [
      { label: 'Events', link: '/predictions/events' },
      { label: 'Relationships', link: '/predictions/relationships' },
      { label: 'Hedge Keywords', link: '/predictions/hedge-keywords' },
    ],
  },
  {
    label: 'Trading',
    icon: IconChartLine,
    links: [
      { label: 'Strategies', link: '/strategies' },
      { label: 'Sessions', link: '/sessions' },
      { label: 'Fills & Orders', link: '/trading/blotter' },
      { label: 'Risk Policies', link: '/risk/policies' },
    ],
  },
  {
    label: 'Launcher',
    icon: IconRocket,
    links: [
      { label: 'Launch Rules', link: '/launcher/launch-rules' },
      { label: 'Launch History', link: '/launcher/launch-history' },
      { label: 'Manual Trigger', link: '/launcher/manual-trigger' },
    ],
  },
  { icon: IconTestPipe, label: 'Backtests', link: '/backtests' },
  {
    label: 'Research',
    icon: IconFlask,
    links: [
      { label: 'Sessions', link: '/research/sessions' },
      { label: 'Artifacts', link: '/research/artifacts' },
      { label: 'Datasets', link: '/research/datasets' },
      { label: 'Pipelines', link: '/research/pipelines' },
    ],
  },
  { icon: IconHeartbeat, label: 'System', link: '/system' },
  {
    label: 'Tools',
    icon: IconTool,
    links: [
      { label: 'Service Config', link: '/tools/service-config' },
      { label: 'Latency Probe', link: '/tools/latency-probe' },
    ],
  }
];

function Navbar({ onToggle }: NavbarProps) {
  const location = useLocation();

  const alarms = useSystemHealth<AlarmsSection>('alarms');
  const firing = alarms.data?.services.reduce((sum, s) => sum + s.firing, 0) ?? 0;
  const indicators: Record<string, React.ReactNode> = {
    System: firing > 0 && (
      <Tooltip label={`${firing} alarm${firing > 1 ? 's' : ''} firing`} withArrow position="right">
        <Box w={9} h={9} mr="xs" style={{ borderRadius: '50%', background: 'var(--mantine-color-red-6)' }} />
      </Tooltip>
    ),
  };

  const links = routes.map((item) => (
    <LinksGroup {...item} key={item.label} activePath={location.pathname} indicator={indicators[item.label]} />
  ));

  return (
    <AppShell.Navbar p="md" className={classes.navbar}>
      <div className={classes.header}>
        <Group justify="space-between">
          <Group justify="flex-start">
            <UnstyledButton onClick={onToggle} className={classes.logoButton}>
              <Paper radius="xl" p="xs" className={classes.logoContainer}>
                <img src={logo} alt="Logo" className={classes.logo} />
              </Paper>
            </UnstyledButton>
            <Title order={4}>GTG</Title>
          </Group>
          <Code fw={700}>v{import.meta.env.VITE_APP_VERSION}</Code>
        </Group>
      </div>

      <ScrollArea className={classes.links}>
        <div className={classes.linksInner}>{links}</div>
      </ScrollArea>

      <div className={classes.footer}>
        <UserButton />
      </div>
    </AppShell.Navbar>
  );
}

export default Navbar;
