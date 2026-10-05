import { useState } from 'react';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { RiskPolicy } from '../types';
import { setKillSwitch } from '../utils/kill-switch';
import { ReasonConfirmModal } from './ReasonConfirmModal';

interface ListingKillListProps {
  kills: RiskPolicy[];
  describe: (policy: RiskPolicy) => string;
  // Shown beside each kill, e.g. to tell a session's own kills from its strategy's.
  level?: (policy: RiskPolicy) => { label: string; color: string } | undefined;
  onResumed: () => void;
}

// The active kills that stop a strategy or session on one listing, each with a way to lift it.
export function ListingKillList({ kills, describe, level, onResumed }: ListingKillListProps) {
  const [resumeTarget, setResumeTarget] = useState<RiskPolicy | null>(null);
  if (kills.length === 0) return null;

  return (
    <Stack gap={4} mb="sm">
      {kills.map((kill) => {
        const badge = level?.(kill);
        return (
          <Group key={kill.policyId} gap="xs">
            <Badge color="red" variant="light">Killed</Badge>
            {badge && <Badge color={badge.color} variant="outline">{badge.label}</Badge>}
            <Text size="sm">{describe(kill)}</Text>
            <Button size="compact-xs" variant="light" color="green" onClick={() => setResumeTarget(kill)}>
              Resume
            </Button>
          </Group>
        );
      })}
      <ReasonConfirmModal
        opened={!!resumeTarget}
        onClose={() => setResumeTarget(null)}
        title="Resume on Listing"
        message={resumeTarget ? `This lifts the kill on ${describe(resumeTarget)}, so it can send orders there again. Are you sure?` : ''}
        confirmLabel="Resume"
        confirmColor="green"
        onConfirm={async (reason) => {
          if (!resumeTarget) return;
          await setKillSwitch(resumeTarget, {}, false, reason);
          onResumed();
        }}
      />
    </Stack>
  );
}
