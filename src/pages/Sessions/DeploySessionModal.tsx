import { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  ActionIcon,
  Divider,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Strategy } from '../../types';
import { registryApi } from '../../utils/api';

interface ParamRow {
  key: string;
  value: string;
}

interface DeploySessionModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
  preselectedStrategyId?: number;
}

const MODE_OPTIONS = [
  { value: 'paper', label: 'Paper' },
  { value: 'live', label: 'Live' },
];

const STRATEGY_TYPE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
];

const QUEUE_MODEL_OPTIONS = [
  { value: 'risk_averse', label: 'Risk Averse' },
  { value: 'optimistic', label: 'Optimistic' },
  { value: 'probabilistic', label: 'Probabilistic' },
];

function DeploySessionModal({ opened, onClose, onCreated, preselectedStrategyId }: DeploySessionModalProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyId, setStrategyId] = useState<string | null>(
    preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null
  );
  const [mode, setMode] = useState<string>('paper');
  const [listings, setListings] = useState('');
  const [researchCommit, setResearchCommit] = useState('');
  const [region, setRegion] = useState('');
  const [strategyType, setStrategyType] = useState<string | null>(null);
  const [strategyClass, setStrategyClass] = useState('');
  const [params, setParams] = useState<ParamRow[]>([]);
  const [takerFee, setTakerFee] = useState<number | string>(0);
  const [makerFee, setMakerFee] = useState<number | string>(0);
  const [networkLatency, setNetworkLatency] = useState<number | string>(0);
  const [orderLatency, setOrderLatency] = useState<number | string>(0);
  const [queueModel, setQueueModel] = useState<string>('risk_averse');
  const [cancelAheadProb, setCancelAheadProb] = useState<number | string>(0.5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registryApi.listStrategies().then(setStrategies).catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedStrategyId !== undefined) {
      setStrategyId(String(preselectedStrategyId));
    }
  }, [preselectedStrategyId]);

  const handleStrategyChange = useCallback((value: string | null) => {
    setStrategyId(value);
    if (!value) {
      setParams([]);
      return;
    }
    const strategy = strategies.find(s => String(s.strategyId) === value);
    if (strategy?.parameters && typeof strategy.parameters === 'object') {
      const entries = Object.entries(strategy.parameters as Record<string, unknown>);
      setParams(entries.map(([k, v]) => ({ key: k, value: String(v) })));
    } else {
      setParams([]);
    }
  }, [strategies]);

  const handleClose = () => {
    setStrategyId(preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null);
    setMode('paper');
    setListings('');
    setResearchCommit('');
    setRegion('');
    setStrategyType(null);
    setStrategyClass('');
    setParams([]);
    setTakerFee(0);
    setMakerFee(0);
    setNetworkLatency(0);
    setOrderLatency(0);
    setQueueModel('risk_averse');
    setCancelAheadProb(0.5);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!strategyId) { setError('Strategy is required'); return; }
    if (!listings.trim()) { setError('Listings are required'); return; }

    const config: Record<string, string> = {
      'strategy.id': strategyId,
      mode,
      listings: listings.trim(),
    };

    if (strategyType) {
      config['strategy.type'] = strategyType;
      if (strategyClass.trim()) {
        config['strategy.class'] = strategyClass.trim();
      }
    }

    for (const { key, value } of params) {
      if (key.trim()) {
        config[`strategy.args.${key.trim()}`] = value;
      }
    }

    if (mode === 'paper') {
      config['simulation.taker.fee'] = String(takerFee);
      config['simulation.maker.fee'] = String(makerFee);
      config['simulation.network.latency.nanos'] = String(networkLatency);
      config['simulation.order.latency.nanos'] = String(orderLatency);
      config['simulation.queue.model'] = queueModel;
      config['simulation.queue.cancel.ahead.probability'] = String(cancelAheadProb);
    }

    setSubmitting(true);
    try {
      await registryApi.createSession({
        sessionId: crypto.randomUUID(),
        strategyId: parseInt(strategyId),
        mode,
        config,
        researchCommit: researchCommit.trim() || undefined,
        region: region.trim() || undefined,
      });
      onCreated();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deploy session');
    } finally {
      setSubmitting(false);
    }
  };

  const strategyOptions = strategies.map(s => ({ value: String(s.strategyId), label: s.name }));

  return (
    <Modal opened={opened} onClose={handleClose} title="Deploy Strategy Session" size="lg">
      <Stack gap="sm">
        <Title order={6} c="dimmed">Core</Title>
        <Select
          label="Strategy"
          data={strategyOptions}
          value={strategyId}
          onChange={handleStrategyChange}
          required
          disabled={preselectedStrategyId !== undefined}
          searchable
        />
        <Select
          label="Mode"
          data={MODE_OPTIONS}
          value={mode}
          onChange={v => setMode(v ?? 'paper')}
          required
        />
        <TextInput
          label="Listings"
          placeholder="e.g. 1,2,3"
          value={listings}
          onChange={e => setListings(e.currentTarget.value)}
          required
        />
        <TextInput
          label="Research Commit"
          placeholder="git SHA or branch (optional)"
          value={researchCommit}
          onChange={e => setResearchCommit(e.currentTarget.value)}
        />
        <TextInput
          label="Region Override"
          placeholder="e.g. us-east-1 (optional)"
          value={region}
          onChange={e => setRegion(e.currentTarget.value)}
        />

        <Divider />
        <Title order={6} c="dimmed">Strategy Class</Title>
        <Select
          label="Strategy Type"
          data={STRATEGY_TYPE_OPTIONS}
          value={strategyType}
          onChange={setStrategyType}
          clearable
          placeholder="Auto-detect"
        />
        <TextInput
          label="Strategy Class"
          placeholder="com.example.MyStrategy or module:ClassName"
          value={strategyClass}
          onChange={e => setStrategyClass(e.currentTarget.value)}
        />

        <Divider />
        <Group justify="space-between">
          <Title order={6} c="dimmed">Strategy Parameters</Title>
          <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setParams(p => [...p, { key: '', value: '' }])}>
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
        {params.map((row, i) => (
          <Group key={i} gap="xs" align="flex-end">
            <TextInput
              placeholder="key"
              value={row.key}
              onChange={e => setParams(p => p.map((r, j) => j === i ? { ...r, key: e.currentTarget.value } : r))}
              style={{ flex: 1 }}
            />
            <TextInput
              placeholder="value"
              value={row.value}
              onChange={e => setParams(p => p.map((r, j) => j === i ? { ...r, value: e.currentTarget.value } : r))}
              style={{ flex: 1 }}
            />
            <ActionIcon variant="subtle" color="red" onClick={() => setParams(p => p.filter((_, j) => j !== i))}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}

        {mode === 'paper' && (
          <>
            <Divider />
            <Title order={6} c="dimmed">Simulation Config</Title>
            <Group grow>
              <NumberInput label="Taker Fee" value={takerFee} onChange={setTakerFee} step={0.0001} decimalScale={6} />
              <NumberInput label="Maker Fee" value={makerFee} onChange={setMakerFee} step={0.0001} decimalScale={6} />
            </Group>
            <Group grow>
              <NumberInput label="Network Latency (ns)" value={networkLatency} onChange={setNetworkLatency} step={1000} />
              <NumberInput label="Order Latency (ns)" value={orderLatency} onChange={setOrderLatency} step={1000} />
            </Group>
            <Select label="Queue Model" data={QUEUE_MODEL_OPTIONS} value={queueModel} onChange={v => setQueueModel(v ?? 'risk_averse')} />
            <NumberInput
              label="Cancel Ahead Probability"
              value={cancelAheadProb}
              onChange={setCancelAheadProb}
              step={0.01}
              min={0}
              max={1}
              decimalScale={4}
            />
          </>
        )}

        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button color="green" loading={submitting} onClick={handleSubmit}>Deploy</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default DeploySessionModal;
