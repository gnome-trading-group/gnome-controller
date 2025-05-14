import "@mantine/core/styles.css";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { theme } from './theme';
import App from './App';
import TimeAgo from 'javascript-time-ago'

import en from 'javascript-time-ago/locale/en'

TimeAgo.addDefaultLocale(en)


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
