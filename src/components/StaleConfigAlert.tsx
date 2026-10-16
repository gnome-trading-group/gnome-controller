import { Alert, Button, Code, Group, List, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { ReactNode } from 'react';
import { describePath, LostField } from '../utils/round-trip';

function show(v: unknown): string {
  return v === undefined ? 'dropped' : JSON.stringify(v);
}

// A stored config this form can't fully edit, and what it couldn't hold. Shown above the JSON it falls back to.
export function StaleConfigAlert({ lost, what = 'This', onBackToForm, onDropAndUseForm, children }: {
  lost: LostField[];
  what?: string;
  onBackToForm?: () => void;
  onDropAndUseForm?: () => void;
  children?: ReactNode;
}) {
  if (lost.length === 0) return null;
  return (
    <Alert color="yellow" icon={<IconAlertTriangle size={18} />}
      title={`${what} was saved in a format this form can't fully edit`}>
      <Text size="sm" mb={4}>Editing it in the form would lose or change:</Text>
      <List size="sm" spacing={2}>
        {lost.slice(0, 12).map(l => (
          <List.Item key={describePath(l.path)}>
            <Code>{describePath(l.path)}</Code> = <Code>{JSON.stringify(l.stored)}</Code>
            {l.saved !== undefined && <> (would become <Code>{show(l.saved)}</Code>)</>}
          </List.Item>
        ))}
        {lost.length > 12 && <List.Item>…and {lost.length - 12} more</List.Item>}
      </List>
      {children}
      {(onBackToForm || onDropAndUseForm) && (
        <Group mt="xs" gap="xs">
          {onBackToForm && <Button size="xs" variant="light" onClick={onBackToForm}>Back to the form</Button>}
          {onDropAndUseForm && (
            <Button size="xs" variant="subtle" color="red" onClick={onDropAndUseForm}>Edit in the form anyway (drops these)</Button>
          )}
        </Group>
      )}
    </Alert>
  );
}
