import { useSearchParams } from 'react-router-dom';
import { usePreferences } from '../context/PreferencesContext';
import { Mode } from '../types';
import { defaultMode, isMode } from '../utils/mode';

// The mode a page shows: the URL's when it names one, else the default rule. Choosing one puts it in the URL (so a
// link shows the same thing) and remembers it for next time.
export function useModeParam(modesWithData: Mode[] | undefined): [Mode, (mode: Mode) => void] {
  const [params, setParams] = useSearchParams();
  const { rememberedMode, rememberMode } = usePreferences();
  const fromUrl = params.get('mode');
  const mode = isMode(fromUrl) ? fromUrl : defaultMode(modesWithData, rememberedMode);
  const setMode = (next: Mode) => {
    rememberMode(next);
    setParams(current => {
      const updated = new URLSearchParams(current);
      updated.set('mode', next);
      return updated;
    }, { replace: true });
  };
  return [mode, setMode];
}
