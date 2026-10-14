import { FileInput, PasswordInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconFileUpload } from '@tabler/icons-react';
import { CREDENTIAL_FIELDS, CredentialField } from '../../utils/treasury';

// Fields that are public identifiers rather than secrets, shown in the clear.
const PUBLIC_FIELDS = new Set(['signerAddress', 'funderAddress', 'subaccount', 'signatureType']);

// One venue's credential fields, as the orchestrator reads them. Secrets are masked and a loaded key file is never
// shown; nothing here is sent anywhere until the caller saves.
export function CredentialInputs({ exchangeCode, values, onChange, idPrefix, omit = [] }: {
  exchangeCode: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix: string;
  omit?: string[];
}) {
  const readFile = async (field: CredentialField, file: File | null) => {
    if (!file) return;
    onChange(field.key, (await file.text()).trim());
  };
  return (
    <Stack gap="xs">
      {(CREDENTIAL_FIELDS[exchangeCode] ?? []).filter((f) => !omit.includes(f.key)).map((field) => {
        const label = field.optional ? `${field.label} (optional)` : field.label;
        if (field.options) {
          return (
            <Select key={field.key} id={`${idPrefix}-${field.key}`} label={label} data={field.options}
              value={values[field.key] || null} onChange={(v) => onChange(field.key, v ?? '')} />
          );
        }
        if (field.file) {
          return (
            <Stack key={field.key} gap={4}>
              <FileInput label={label} placeholder={values[field.key] ? 'Loaded; choose another to replace' : 'Choose the key file'}
                leftSection={<IconFileUpload size={14} />} accept=".pem,.key,.txt" clearable={false}
                onChange={(file) => { void readFile(field, file); }} />
              {values[field.key] && <Text size="xs" c="teal">Key loaded ({values[field.key].length} characters); it isn&apos;t shown.</Text>}
            </Stack>
          );
        }
        const Input = PUBLIC_FIELDS.has(field.key) ? TextInput : PasswordInput;
        return (
          <Input key={field.key} id={`${idPrefix}-${field.key}`} label={label} value={values[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.currentTarget.value)} autoComplete="off" spellCheck={false} />
        );
      })}
    </Stack>
  );
}

// Fills credential fields from a JSON file of them, for venues whose credentials come as one.
export function CredentialsFileInput({ onFile, error }: { onFile: (file: File | null) => void; error: string | null }) {
  return (
    <FileInput label="Fill from a credentials file (optional)" placeholder="A JSON file with the fields below"
      description="Fills in whichever fields it has; nothing is sent until you save."
      leftSection={<IconFileUpload size={14} />} accept=".json,application/json" clearable={false}
      onChange={onFile} error={error} />
  );
}
