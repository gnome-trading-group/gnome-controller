import { ReactNode, useEffect, useState } from 'react';
import { Alert, Anchor, Button, Group, List, Modal, Stack, Text, TextInput } from '@mantine/core';
import { Link } from 'react-router-dom';
import { AccountStatus } from '../../types/treasury';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { AccountRow } from './types';

const ACTIONS: Record<AccountStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Activate', color: 'teal' },
  DRAINING: { label: 'Drain', color: 'orange' },
  RETIRED: { label: 'Retire', color: 'red' },
  PROVISIONING: { label: 'Provision', color: 'gray' },
};

function explain(row: AccountRow, status: AccountStatus): ReactNode {
  const { account } = row;
  if (status === 'ACTIVE' && account.status === 'DRAINING') {
    return (
      <Text size="sm">
        Undoes the drain: new live sessions on {account.exchangeCode} may be bound to <b>{account.label}</b> again.
        Sessions the drain killed stay killed until they are resumed or relaunched.
      </Text>
    );
  }
  if (status === 'ACTIVE') {
    return (
      <Text size="sm">
        New live sessions on {account.exchangeCode} may be bound to <b>{account.label}</b>. Record its opening balance
        first (an OPENING transfer), so reconciliation has somewhere to start.
      </Text>
    );
  }
  if (status === 'DRAINING') {
    return (
      <Stack gap="xs">
        <Text size="sm">
          <b>{account.label}</b> gets no new sessions, and the {account.activeSessions} session
          {account.activeSessions === 1 ? '' : 's'} running on it {account.activeSessions === 1 ? 'is' : 'are'} killed
          now. Relaunch them to move them to another account.
        </Text>
        <Text size="sm" c="dimmed">
          Its {account.openPositions} open position{account.openPositions === 1 ? '' : 's'} stay here and are held to
          resolution; then redeem, withdraw, and retire it.
        </Text>
      </Stack>
    );
  }
  return (
    <Text size="sm">
      Retiring <b>{account.label}</b> is final. The registry refuses it while any session, position or open order is
      still on it. Afterwards delete its secrets from the account's menu.
    </Text>
  );
}

interface AccountStatusModalProps {
  target: { row: AccountRow; status: AccountStatus } | null;
  onClose: () => void;
  onChanged: () => void;
}

// Moves an account through its lifecycle. A drain lists the sessions it killed, since each must be relaunched.
export function AccountStatusModal({ target, onClose, onChanged }: AccountStatusModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [halted, setHalted] = useState<string[] | null>(null);

  useEffect(() => {
    if (target) {
      setReason('');
      setError(null);
      setHalted(null);
    }
  }, [target]);

  const confirm = async () => {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await registryApi.changeAccountStatus(target.row.account.accountId, target.status, reason.trim());
      onChanged();
      if (result.haltedSessions.length > 0) setHalted(result.haltedSessions);
      else onClose();
    } catch (e) {
      setError(errorMessage(e, 'Status change failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const action = target ? ACTIONS[target.status] : ACTIONS.ACTIVE;
  return (
    <Modal
      opened={!!target}
      onClose={() => { if (!submitting) onClose(); }}
      title={target ? `${action.label} ${target.row.account.label}` : ''}
      size="md"
    >
      {target && halted ? (
        <Stack>
          <Alert color="orange" title={`${target.row.account.label} is draining`}>
            <Text size="sm" mb="xs">These sessions were killed. Relaunch each to move it to another account:</Text>
            <List size="sm">
              {halted.map((sessionId) => (
                <List.Item key={sessionId}>
                  <Anchor component={Link} to={`/sessions/${sessionId}`} ff="monospace" size="sm">{sessionId}</Anchor>
                </List.Item>
              ))}
            </List>
          </Alert>
          <Group justify="flex-end">
            <Button onClick={onClose}>Done</Button>
          </Group>
        </Stack>
      ) : target && (
        <Stack>
          {explain(target.row, target.status)}
          <TextInput
            label="Reason"
            description="Recorded in the account's history"
            required
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            disabled={submitting}
          />
          {error && <Alert color="red" title="Error">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button color={action.color} loading={submitting} disabled={reason.trim().length === 0} onClick={confirm}>
              {action.label}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
