import { useState } from 'react';
import { ActionIcon, Badge, Button, Card, Group, Switch, Table, Text, Tooltip } from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { RiskPolicy, StrategySession } from '../../types';
import { KILL_SWITCH_TYPE, listingKills } from '../../utils/kill-switch';
import {
  configuredListings, describeTarget, isUnrelatedListingPolicy, policiesForSession, policyLevel,
} from '../../utils/policy-target';
import { formatRiskParameters } from '../../utils/risk-parameters';
import { useListingLabels } from '../../hooks/useAsyncSearch';
import { KillOnListingModal } from '../KillOnListingModal';
import { AddRiskPolicyModal } from '../AddRiskPolicyModal';
import { EditRiskPolicyModal } from '../EditRiskPolicyModal';
import { ListingKillList } from '../ListingKillList';

interface SessionRiskPanelProps {
  session: StrategySession;
  strategyName: string | undefined;
  policies: RiskPolicy[];
  policiesLoaded: boolean;
  // A session that can still be killed can still get policies of its own.
  canKill: boolean;
  onChanged: () => void;
}

// The policies that apply to a session: its own, its strategy's and the global ones; only its own are edited here.
export function SessionRiskPanel({ session, strategyName, policies, policiesLoaded, canKill, onChanged }: SessionRiskPanelProps) {
  const { sessionId } = session;
  const [killOnListingOpen, setKillOnListingOpen] = useState(false);
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [editPolicyTarget, setEditPolicyTarget] = useState<RiskPolicy | null>(null);
  const [showAllListingPolicies, setShowAllListingPolicies] = useState(false);

  const applicablePolicies = policiesForSession(policies, sessionId, session.strategyId);
  const tradedListings = configuredListings([session]);
  const hiddenListingPolicies = applicablePolicies.filter((p) => isUnrelatedListingPolicy(p, tradedListings)).length;
  const sessionPolicies = showAllListingPolicies
    ? applicablePolicies
    : applicablePolicies.filter((p) => !isUnrelatedListingPolicy(p, tradedListings));
  const listingLabels = useListingLabels(sessionPolicies.flatMap((p) => (p.listingId != null ? [p.listingId] : [])));
  const describePolicy = (p: RiskPolicy) =>
    describeTarget(p, () => strategyName, (listingId) => listingLabels[listingId]);

  return (
    <>
      <Group justify="flex-end" mb="xs" gap="xs">
        <Switch
          size="xs"
          label={`Show all listing policies${hiddenListingPolicies ? ` (${hiddenListingPolicies} hidden)` : ''}`}
          checked={showAllListingPolicies}
          onChange={(e) => setShowAllListingPolicies(e.currentTarget.checked)}
        />
        {canKill && (
          <>
            <Button size="xs" variant="light" color="red" disabled={!policiesLoaded} onClick={() => setKillOnListingOpen(true)}>
              Kill on listing
            </Button>
            <Tooltip label="Add a policy for this session" withArrow openDelay={500}>
              <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setAddPolicyOpen(true)}>
                <IconPlus size={20} />
              </ActionIcon>
            </Tooltip>
          </>
        )}
      </Group>
      <Card withBorder p="sm">
        <ListingKillList
          kills={listingKills(sessionPolicies)}
          describe={describePolicy}
          level={policyLevel}
          onResumed={onChanged}
        />
        {sessionPolicies.length === 0 ? (
          <Text size="sm" c="dimmed">No risk policies apply to this session.</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Level</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Applies to</Table.Th>
                <Table.Th>Limits</Table.Th>
                <Table.Th>Enabled</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sessionPolicies.map((p) => {
                const level = policyLevel(p);
                return (
                  <Table.Tr key={p.policyId}>
                    <Table.Td><Badge color={level.color} variant="outline">{level.label}</Badge></Table.Td>
                    <Table.Td>{p.policyType}</Table.Td>
                    <Table.Td>{describePolicy(p)}</Table.Td>
                    <Table.Td>{formatRiskParameters(p.parameters)}</Table.Td>
                    <Table.Td>
                      <Badge color={p.enabled ? 'green' : 'gray'} variant="light">{p.enabled ? 'On' : 'Off'}</Badge>
                    </Table.Td>
                    <Table.Td>
                      {/* Only this session's own policies; strategy-wide and global ones are edited where they apply. */}
                      {p.sessionId === sessionId && p.policyType !== KILL_SWITCH_TYPE && (
                        <Tooltip label="Edit limits" withArrow openDelay={500}>
                          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditPolicyTarget(p)}>
                            <IconPencil size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <EditRiskPolicyModal
        policy={editPolicyTarget}
        targetDescription={editPolicyTarget ? describePolicy(editPolicyTarget) : undefined}
        onClose={() => setEditPolicyTarget(null)}
        onSaved={onChanged}
      />
      <AddRiskPolicyModal
        opened={addPolicyOpen}
        onClose={() => setAddPolicyOpen(false)}
        target={{ sessionId }}
        targetLabel="this session"
        onCreated={onChanged}
      />
      <KillOnListingModal
        opened={killOnListingOpen}
        onClose={() => setKillOnListingOpen(false)}
        target={{ sessionId }}
        targetLabel={`session ${sessionId}`}
        policies={policies}
        onKilled={onChanged}
      />
    </>
  );
}
