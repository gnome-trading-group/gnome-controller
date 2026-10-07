import { useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { Box, Collapse, Group, ThemeIcon, UnstyledButton } from '@mantine/core';
import classes from './NavbarLinksGroup.module.css';
import { Link } from 'react-router-dom';

interface LinksGroupProps {
  icon: React.FC<any>;
  label: string;
  activePath: string;
  initiallyOpened?: boolean;
  link?: string;
  links?: { label: string; link: string }[];
  // Shown at the end of a single link, e.g. a status dot.
  indicator?: React.ReactNode;
}

function ExpandableLinks({ icon: Icon, label, initiallyOpened, activePath, links }: LinksGroupProps) {
  const [opened, setOpened] = useState(initiallyOpened || false);
  const items = (links || []).map((link) => (
    <UnstyledButton
      component={Link}
      className={classes.link}
      to={link.link}
      key={link.label}
      style={{ fontWeight: activePath === link.link ? 600 : 500 }}
    >
      {link.label}
    </UnstyledButton>
  ));

  return (
    <>
      <UnstyledButton onClick={() => setOpened((o) => !o)} className={classes.control}>
        <Group justify="space-between" gap={0}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            <ThemeIcon variant="light" size={30}>
              <Icon size={18} />
            </ThemeIcon>
            <Box ml="md">{label}</Box>
          </Box>
          <IconChevronRight
            className={classes.chevron}
            stroke={1.5}
            size={16}
            style={{ transform: opened ? 'rotate(-90deg)' : 'none' }}
          />
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>{items}</Collapse>
    </>
  );
}

function SingleLink({ icon: Icon, label, activePath, link, indicator }: LinksGroupProps) {
  return (
    <UnstyledButton
      component={Link}
      className={classes.control}
      to={link!}
      style={{ fontWeight: activePath === link ? 600 : 500 }}
    >
      <Group justify="space-between" gap={0}>
        <Box style={{ display: 'flex', alignItems: 'center' }}>
          <ThemeIcon variant="light" size={30}>
            <Icon size={18} />
          </ThemeIcon>
          <Box ml="md">{label}</Box>
        </Box>
        {indicator}
      </Group>
    </UnstyledButton>
  );
}

export function LinksGroup(props: LinksGroupProps) {
  return Array.isArray(props.links) ? <ExpandableLinks {...props} /> : <SingleLink {...props} />;
}
