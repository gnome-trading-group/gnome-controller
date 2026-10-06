import { ReactNode } from 'react';
import { Collapse, Group, Title, UnstyledButton } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconChevronRight } from '@tabler/icons-react';

interface CollapsibleSectionProps {
  title: ReactNode;
  // Persists open/closed per section (across pages and sessions) so a folded section stays folded.
  storageKey: string;
  defaultOpened?: boolean;
  // Section actions; hidden while folded since they act on content that isn't visible.
  rightSection?: ReactNode;
  mb?: string;
  children: ReactNode;
}

export function CollapsibleSection({ title, storageKey, defaultOpened = true, rightSection, mb = 'md', children }: CollapsibleSectionProps) {
  // Read synchronously: the default "read in an effect" would flash a folded section open for a frame.
  const [opened, setOpened] = useLocalStorage<boolean>({
    key: `section-open:${storageKey}`,
    defaultValue: defaultOpened,
    getInitialValueInEffect: false,
  });

  return (
    <div style={{ marginBottom: `var(--mantine-spacing-${mb})` }}>
      <Group justify="space-between" mb={opened ? 'xs' : 0} wrap="nowrap">
        {/* A plain value, not an updater: Mantine's useLocalStorage fires its sync event from inside a functional
            update, which StrictMode runs twice, so a click could toggle twice and appear to do nothing. */}
        <UnstyledButton onClick={() => setOpened(!opened)} aria-expanded={opened}>
          <Group gap={6} wrap="nowrap">
            <IconChevronRight
              size={18}
              style={{ transform: opened ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}
            />
            {typeof title === 'string' ? <Title order={4}>{title}</Title> : title}
          </Group>
        </UnstyledButton>
        {opened && rightSection}
      </Group>
      <Collapse in={opened}>{children}</Collapse>
    </div>
  );
}
