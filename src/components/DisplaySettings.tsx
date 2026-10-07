import { ActionIcon, Popover, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { usePreferences } from '../context/PreferencesContext';
import { zoneName } from '../utils/format';

// Per-viewer display choices, remembered in this browser.
export function DisplaySettings() {
  const { timeZone, setTimeZone } = usePreferences();
  return (
    <Popover position="top-end" withArrow shadow="md" width={280}>
      <Popover.Target>
        <Tooltip label="Display settings" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="gray" aria-label="Display settings">
            <IconSettings size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={600}>Display</Text>
          <div>
            <Text size="sm" mb={4}>Time zone</Text>
            <SegmentedControl
              fullWidth
              size="xs"
              value={timeZone}
              onChange={value => setTimeZone(value as 'UTC' | 'local')}
              data={[{ value: 'UTC', label: 'UTC' }, { value: 'local', label: `Local (${zoneName('local')})` }]}
            />
            <Text size="xs" c="dimmed" mt={4}>
              For times on the trading pages, and where each "today" and daily bar starts.
            </Text>
          </div>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
