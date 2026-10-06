import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { RiskPolicy, RISK_POLICY_TYPES } from '../types';
import { registryApi } from '../utils/api';
import { formatRiskParameters, scaleRiskParameters, unscaleRiskParameters } from '../utils/risk-parameters';
import { errorMessage } from '../utils/kill-switch';

interface EditRiskPolicyModalProps {
  policy: RiskPolicy | null;
  // How the page names the policy's target, e.g. "strategy foo on listing 12".
  targetDescription?: string;
  onClose: () => void;
  onSaved: () => void;
}

// Changes limits with a single PATCH so the policy is never absent; delete-and-recreate left a window with no limit.
export function EditRiskPolicyModal({ policy, targetDescription, onClose, onSaved }: EditRiskPolicyModalProps) {
  const [parametersJson, setParametersJson] = useState('{}');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!policy) return;
    setParametersJson(JSON.stringify(unscaleRiskParameters(policy.parameters), null, 2));
    setReason('');
    setError(null);
  }, [policy]);

  const save = async () => {
    if (!policy) return;
    setError(null);
    let parameters: Record<string, unknown>;
    try {
      parameters = scaleRiskParameters(JSON.parse(parametersJson));
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Parameters must be valid JSON' : errorMessage(e, 'Invalid parameters'));
      return;
    }
    setSaving(true);
    try {
      await registryApi.updateRiskPolicy(policy.policyId, { parameters, reason: reason.trim() || undefined });
      onClose();
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Failed to update policy'));
    } finally {
      setSaving(false);
    }
  };

  const typeInfo = RISK_POLICY_TYPES.find((t) => t.value === policy?.policyType);

  return (
    <Modal opened={!!policy} onClose={() => { if (!saving) onClose(); }} title="Edit Risk Policy" size="md">
      {policy && (
        <Stack>
          <Text size="sm">
            <Text span fw={500}>{typeInfo?.label ?? policy.policyType}</Text>
            {targetDescription ? <> for {targetDescription}</> : null}
          </Text>
          <Text size="xs" c="dimmed">Current: {formatRiskParameters(policy.parameters)}</Text>
          <Textarea
            label="Parameters (JSON, in dollars and units)"
            description={typeInfo?.parametersHint}
            value={parametersJson}
            onChange={(e) => setParametersJson(e.currentTarget.value)}
            autosize
            minRows={3}
            disabled={saving}
          />
          <TextInput
            label="Reason (optional)"
            description="Recorded in the risk policy audit log"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            disabled={saving}
          />
          {error && <Text c="red" size="sm">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
