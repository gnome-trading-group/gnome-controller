import { useEffect, useState } from 'react';
import { Button, Group, JsonInput, Modal, Stack, Switch, Text } from '@mantine/core';
import { SchemaFormFields } from '../../../components/SchemaFormFields';
import { Pipeline } from '../../../types/pipeline';
import { controllerApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';

// Fields left empty take the pipeline's defaults; the API checks the rest against its schema before starting a task.
function RunPipelineModal({ pipeline, opened, onClose, onStarted }: {
  pipeline: Pipeline | null;
  opened: boolean;
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [asJson, setAsJson] = useState(false);
  const [json, setJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (opened) {
      setValues({});
      setJson('{}');
      setAsJson(false);
      setError(null);
    }
  }, [opened]);

  const parameters = (): Record<string, unknown> | null => {
    if (!asJson) return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* reported below */ }
    setError('Parameters must be a JSON object');
    return null;
  };

  const toggleJson = (on: boolean) => {
    if (on) setJson(JSON.stringify(parameters() ?? {}, null, 2));
    setAsJson(on);
  };

  const start = async () => {
    if (!pipeline) return;
    const params = parameters();
    if (!params) return;
    setStarting(true);
    setError(null);
    try {
      const result = await controllerApi.runPipeline(pipeline.name, params);
      onClose();
      onStarted(result.runId);
    } catch (e) {
      setError(errorMessage(e, 'Failed to start the run'));
    } finally {
      setStarting(false);
    }
  };

  const schema = pipeline?.paramsSchema;
  const properties = schema?.properties ?? {};
  return (
    <Modal opened={opened} onClose={onClose} title={pipeline ? `Run ${pipeline.name}` : 'Run'} size="lg">
      <Stack>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {pipeline ? `${pipeline.resources.cpu / 1024} vCPU · ${pipeline.resources.memory / 1024} GB` : ''}
          </Text>
          <Switch size="xs" label="Edit as JSON" checked={asJson} onChange={e => toggleJson(e.currentTarget.checked)} />
        </Group>
        {asJson ? (
          <JsonInput value={json} onChange={setJson} autosize minRows={6} formatOnBlur validationError="Invalid JSON" />
        ) : Object.keys(properties).length === 0 ? (
          <Text size="sm" c="dimmed">This pipeline takes no parameters.</Text>
        ) : (
          <SchemaFormFields
            properties={properties}
            required={schema?.required ?? []}
            values={values}
            onChange={(key, value) => setValues(v => ({ ...v, [key]: value }))}
          />
        )}
        {error && <Text c="red" size="sm" style={{ whiteSpace: 'pre-wrap' }}>{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={start} loading={starting}>Start run</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default RunPipelineModal;
