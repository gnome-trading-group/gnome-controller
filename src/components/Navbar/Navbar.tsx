import { IconSettings, IconGauge, IconLogout, IconArchive, IconLockSquareRounded, IconActivityHeartbeat } from "@tabler/icons-react";
import { Stack, AppShell, UnstyledButton, Tooltip, Center, Space, Paper } from '@mantine/core';
import { Link, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.svg';
import classes from './Navbar.module.css';

interface NavbarLinkProps {
  icon: typeof IconGauge;
  label: string;
  route: string;
  active?: boolean;
}

function NavbarLink({ icon: Icon, label, active, route }: NavbarLinkProps) {
  return (
    <Tooltip label={label} position="right" transitionProps={{ duration: 0 }}>
      <UnstyledButton component={Link} to={route} className={classes.link} data-active={active || undefined}>
        <Icon size={20} stroke={1.5} />
      </UnstyledButton>
    </Tooltip>
  );
}

const routes = [
  { icon: IconGauge, label: 'Dashboard', route: '/dashboard' },
  { icon: IconArchive, label: 'Market Data', route: '/market-data' },
  { icon: IconLockSquareRounded, label: 'Security Master', route: '/security-master' },
  { icon: IconActivityHeartbeat, label: 'Latency Probe', route: '/latency-probe' },
  { icon: IconSettings, label: 'Settings', route: '/settings' },
];

function Navbar() {
  const location = useLocation();

  const links = routes.map((link) => (
    <NavbarLink
      {...link}
      key={link.label}
      active={location.pathname === link.route}
    />
  ));

  return (
    <AppShell.Navbar p="md" className={classes.navbar}>
      <AppShell.Section>
        <Center>
          <Paper radius="xl" p="xs" className={classes.logoContainer}>
            <img src={logo} alt="Logo" className={classes.logo} />
          </Paper>
        </Center>
        <Space h="xl" />
      </AppShell.Section>
      
      <AppShell.Section grow>
        <Stack>
          {links}
        </Stack>
      </AppShell.Section>

      <AppShell.Section>
        <NavbarLink icon={IconLogout} label="Logout" route="/logout" />
      </AppShell.Section>
    </AppShell.Navbar>
  );
}

export default Navbar;
