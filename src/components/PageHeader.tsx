import { Fragment, ReactNode } from 'react';
import { ActionIcon, Group, Menu, Stack, Text } from '@mantine/core';
import { IconArrowLeft, IconDots } from '@tabler/icons-react';

export interface HeaderMenuAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
}

interface PageHeaderProps {
  onBack: () => void;
  title: ReactNode;
  badges?: ReactNode;
  // The one or two actions that matter now; everything else goes in the menu.
  actions?: ReactNode;
  menu?: HeaderMenuAction[];
  // Facts about the page's subject, shown small under the title.
  meta?: ReactNode[];
}

// Two rows: what the page is about and what you can do to it, then the facts about it in smaller type, so the first
// row never has to hold everything.
export function PageHeader({ onBack, title, badges, actions, menu = [], meta = [] }: PageHeaderProps) {
  const facts = meta.filter(Boolean);
  return (
    <Stack gap={2} mb="xs">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ActionIcon variant="subtle" onClick={onBack} aria-label="Back">
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Text fw={700} size="xl" truncate>{title}</Text>
          {badges}
        </Group>
        <Group gap="xs" wrap="nowrap">
          {actions}
          {menu.length > 0 && (
            <Menu position="bottom-end" withArrow shadow="md">
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label="More actions"><IconDots size={18} /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {menu.map(item => (
                  <Menu.Item key={item.label} leftSection={item.icon} color={item.color} disabled={item.disabled} onClick={item.onClick}>
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
      {facts.length > 0 && (
        <Group gap={8} wrap="wrap" pl={36}>
          {facts.map((fact, i) => (
            <Fragment key={i}>
              {i > 0 && <Text span size="sm" c="dimmed">·</Text>}
              <Text span size="sm" c="dimmed" component="div">{fact}</Text>
            </Fragment>
          ))}
        </Group>
      )}
    </Stack>
  );
}
