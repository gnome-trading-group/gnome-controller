import { useEffect, useState } from 'react';
import { Select, Stack, Text } from '@mantine/core';
import { RiskPolicy } from '../types';
import { useListingSearch } from '../hooks/useAsyncSearch';
import { findKillSwitch, KillSwitchTarget, setKillSwitch } from '../utils/kill-switch';
import { ReasonConfirmModal } from './ReasonConfirmModal';

interface KillOnListingModalProps {
  opened: boolean;
  onClose: () => void;
  // The strategy or session being killed; the chosen listing narrows it to that listing only.
  target: { strategyId: number } | { sessionId: string };
  // Names the target in the message, e.g. "strategy arb" or "session abc".
  targetLabel: string;
  policies: RiskPolicy[];
  onKilled: () => void;
}

export function KillOnListingModal({ opened, onClose, target, targetLabel, policies, onKilled }: KillOnListingModalProps) {
  const [listingId, setListingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { options, isLoading } = useListingSearch(search);

  useEffect(() => {
    if (opened) {
      setListingId(null);
      setSearch('');
    }
  }, [opened]);

  const confirm = async (reason: string | undefined) => {
    if (!listingId) throw new Error('Pick a listing to kill');
    const killTarget: KillSwitchTarget = { ...target, listingId: parseInt(listingId) };
    await setKillSwitch(findKillSwitch(policies, killTarget), killTarget, true, reason);
    onKilled();
  };

  return (
    <ReasonConfirmModal
      opened={opened}
      onClose={onClose}
      title="Kill on Listing"
      message={
        <Stack gap="xs">
          <Text>
            Cancels every open order {targetLabel} has on the listing and blocks it from sending more there, until
            resumed. Its other listings keep trading.
          </Text>
          <Select
            label="Listing"
            placeholder="Search listings..."
            data={options}
            value={listingId}
            onChange={setListingId}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            nothingFoundMessage={isLoading ? 'Loading...' : 'No listings found'}
            required
          />
        </Stack>
      }
      confirmLabel="Kill on listing"
      onConfirm={confirm}
    />
  );
}
