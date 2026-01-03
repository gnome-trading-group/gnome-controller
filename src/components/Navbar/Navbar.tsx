import { IconGauge, IconLockSquareRounded, IconNotes, IconTool } from "@tabler/icons-react";
import { AppShell, Paper, Group, ScrollArea, Code, Title, UnstyledButton } from '@mantine/core';
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
    initiallyOpened: true,
    links: [
      { label: 'Coverage', link: '/market-data/coverage' },
      { label: 'Collectors', link: '/market-data/collectors' },
      { label: 'Transform Jobs', link: '/market-data/transform-jobs' },
      { label: 'Gaps', link: '/market-data/gaps' },
    ],
  },
  { icon: IconLockSquareRounded, label: 'Security Master', link: '/security-master' },
  {
    label: 'Tools',
    icon: IconTool,
    links: [
      { label: 'Latency Probe', link: '/tools/latency-probe' },
    ],
  }
];

function Navbar({ onToggle }: NavbarProps) {
  const location = useLocation();

  const links = routes.map((item) => <LinksGroup {...item} key={item.label} activePath={location.pathname} />);

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
