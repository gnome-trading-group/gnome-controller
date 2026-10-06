import { useEffect, useState } from 'react';
import { Button, Checkbox, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { RISK_POLICY_TYPES } from '../types';
import { registryApi } from '../utils/api';
import { scaleRiskParameters } from '../utils/risk-parameters';
import { errorMessage } from '../utils/kill-switch';
import { useListingSearch } from '../hooks/useAsyncSearch';

interface AddRiskPolicyModalProps {
  opened: boolean;
  onClose: () => void;
  // The strategy or session the policy applies to; an optional listing narrows it to that listing only.
  target: { strategyId: number } | { sessionId: string };
  // Names the target in the listing hint, e.g. "this strategy" or "this session".
  targetLabel: string;
  onCreated: () => void;
}

const EMPTY_FORM = { policyType: '', listingId: '', parametersJson: '{}', enabled: true };

export function AddRiskPolicyModal({ opened, onClose, target, targetLabel, onCreated }: AddRiskPolicyModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [listingSearch, setListingSearch] = useState('');
  const { options: listingOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearch);

  useEffect(() => {
    if (opened) {
      setForm(EMPTY_FORM);
      setError(null);
      setListingSearch('');
    }
  }, [opened]);

  const create = async () => {
    setError(null);
    setCreating(true);
    try {
      await registryApi.createRiskPolicy({
        policyType: form.policyType,
        ...target,
        listingId: form.listingId ? parseInt(form.listingId) : undefined,
        parameters: scaleRiskParameters(JSON.parse(form.parametersJson)),
        enabled: form.enabled,
      });
      onClose();
      onCreated();
    } catch (e) {
      setError(errorMessage(e, 'Failed to create policy'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal opened={opened} onClose={() => { if (!creating) onClose(); }} title="Add Risk Policy" size="md">
      <Stack>
        <Select
          label="Policy Type"
          data={RISK_POLICY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          value={form.policyType}
          onChange={(v) => {
            const template = RISK_POLICY_TYPES.find((t) => t.value === v)?.parametersTemplate ?? '{}';
            setForm((f) => ({ ...f, policyType: v ?? '', parametersJson: template }));
          }}
          required
        />
        <Select
          label="Listing"
          description={`Leave empty for all of ${targetLabel}'s listings`}
          placeholder="Search listings..."
          data={listingOptions}
          value={form.listingId || null}
          onChange={(v) => setForm((f) => ({ ...f, listingId: v ?? '' }))}
          searchable
          clearable
          searchValue={listingSearch}
          onSearchChange={setListingSearch}
          nothingFoundMessage={listingSearchLoading ? 'Loading...' : 'No listings found'}
        />
        <Textarea
          label="Parameters (JSON, in dollars and units)"
          description={RISK_POLICY_TYPES.find((t) => t.value === form.policyType)?.parametersHint}
          value={form.parametersJson}
          onChange={(e) => setForm((f) => ({ ...f, parametersJson: e.target.value }))}
          autosize
          minRows={3}
        />
        <Checkbox
          label="Enabled"
          checked={form.enabled}
          onChange={(e) => { const checked = e.currentTarget.checked; setForm((f) => ({ ...f, enabled: checked })); }}
        />
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={create} disabled={!form.policyType} loading={creating}>Add</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
