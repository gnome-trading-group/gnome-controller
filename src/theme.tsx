import { MantineColorsTuple, createTheme } from "@mantine/core";

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
  primaryColor: 'green'
});
