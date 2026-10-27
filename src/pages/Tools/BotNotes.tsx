import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconBrandSlack, IconPencil, IconRefresh, IconTrash } from '@tabler/icons-react';
import { botApi, BotNote } from '../../utils/api';

const MAX_NOTE_CHARS = 500;
const SCOPE = /^[A-Za-z0-9_.:-]{1,64}$/;

// Lessons people saved for gnome-bot from Slack threads ("Remember this for next time?" → Save). Triage reads the notes
// for its alert type plus the general ones; answers read the general ones and can look up the rest.
function BotNotes() {
  const [notes, setNotes] = useState<BotNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<BotNote | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [draftScope, setDraftScope] = useState('');
  const [deleting, setDeleting] = useState<BotNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotes(await botApi.listNotes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const scopes = useMemo(() => [...new Set((notes ?? []).map((n) => n.scope))].sort(), [notes]);
  const shown = (notes ?? []).filter((n) => !scopeFilter || n.scope === scopeFilter);

  const openEdit = (note: BotNote) => {
    setEditing(note);
    setDraftNote(note.note);
    setDraftScope(note.scope);
    setActionError(null);
  };

  const trimmedNote = draftNote.trim();
  const editProblem = !trimmedNote ? 'The note is empty'
    : trimmedNote.length > MAX_NOTE_CHARS ? `At most ${MAX_NOTE_CHARS} characters`
    : !SCOPE.test(draftScope.trim()) ? 'Scope is an alert type (e.g. COST_ANOMALY) or general'
    : null;

  const saveEdit = async () => {
    if (!editing || editProblem) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await botApi.editNote(editing.id, { note: trimmedNote, scope: draftScope.trim() });
      setNotes((current) => (current ?? []).map((n) => (n.id === updated.id ? updated : n)));
      setEditing(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save the note');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await botApi.deleteNote(deleting.id);
      setNotes((current) => (current ?? []).filter((n) => n.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete the note');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container size="xl">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>Bot Notes</Title>
            <Text size="sm" c="dimmed">
              Lessons people saved for Gnome Bot in Slack. Triage reads its alert type's notes and the general ones.
            </Text>
          </div>
          <Group>
            <Select
              placeholder="All scopes"
              data={scopes}
              value={scopeFilter}
              onChange={setScopeFilter}
              clearable
              w={220}
            />
            <Tooltip label="Refresh">
              <ActionIcon variant="subtle" onClick={load} loading={loading}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {notes === null && loading && <Center py="xl"><Loader /></Center>}

        {notes !== null && shown.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            {notes.length === 0
              ? 'No notes yet. When the bot offers "Remember this for next time?" in Slack, Save keeps it here.'
              : 'No notes in this scope.'}
          </Text>
        )}

        {shown.length > 0 && (
          <Table striped highlightOnHover withTableBorder verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={160}>Scope</Table.Th>
                <Table.Th>Note</Table.Th>
                <Table.Th w={230}>Saved</Table.Th>
                <Table.Th w={110} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((note) => (
                <Table.Tr key={note.id}>
                  <Table.Td>
                    <Badge variant="light" color={note.scope === 'general' ? 'gray' : 'blue'}>{note.scope}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{note.note}</Text>
                    <Text size="xs" c="dimmed" ff="monospace">{note.id}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{note.saved_at} by {note.saved_by}</Text>
                    {note.edited_by && (
                      <Text size="xs" c="dimmed">edited {note.edited_at} by {note.edited_by}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {note.link && (
                        <Tooltip label="Open the Slack thread it came from">
                          <ActionIcon component="a" href={note.link} target="_blank" rel="noreferrer" variant="subtle">
                            <IconBrandSlack size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" onClick={() => openEdit(note)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" onClick={() => { setDeleting(note); setActionError(null); }}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={`Edit ${editing?.id ?? ''}`} size="lg">
        <Stack>
          <TextInput
            label="Scope"
            description="The alert type it's about (e.g. COST_ANOMALY), or general"
            value={draftScope}
            onChange={(e) => setDraftScope(e.currentTarget.value)}
          />
          <Textarea
            label="Note"
            autosize
            minRows={3}
            value={draftNote}
            onChange={(e) => setDraftNote(e.currentTarget.value)}
            description={`${trimmedNote.length}/${MAX_NOTE_CHARS}`}
          />
          {(editProblem || actionError) && (
            <Text size="sm" c="red">{actionError ?? editProblem}</Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} loading={busy} disabled={editProblem !== null}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title="Delete this note?">
        <Stack>
          <Text size="sm">{deleting?.note}</Text>
          <Text size="xs" c="dimmed">Gnome Bot stops using it at once. This can't be undone.</Text>
          {actionError && <Text size="sm" c="red">{actionError}</Text>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button color="red" onClick={confirmDelete} loading={busy}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default BotNotes;
