import { Badge, MantineColorsTuple, createTheme } from "@mantine/core";

const myColor: MantineColorsTuple = [
  '#effde7',
  '#e1f8d4',
  '#c3efab',
  '#a2e67e',
  '#87de58',
  '#75d93f',
  '#6bd731',
  '#59be23',
  '#4da91b',
  '#3d920d'
];

export const theme = createTheme({
  colors: {
    myColor,
  },
  primaryColor: 'green',
  components: {
    // Mantine's badge is one fixed-height line that cuts its text with "…" when its column is narrower than it, which
    // hid statuses and kinds in fixed-width table columns. A badge that doesn't fit wraps onto more lines instead; one
    // that fits looks as before.
    Badge: Badge.extend({
      styles: {
        root: {
          height: 'auto',
          minHeight: 'var(--badge-height)',
          maxWidth: '100%',
          paddingTop: 2,
          paddingBottom: 2,
          lineHeight: 1.2,
        },
        label: {
          whiteSpace: 'normal',
          overflow: 'visible',
          textOverflow: 'clip',
          overflowWrap: 'break-word',
          textAlign: 'center',
        },
      },
    }),
  },
});
