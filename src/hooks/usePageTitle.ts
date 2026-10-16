import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisteredTitleLabels } from '../context/PageTitleContext';

function toTitleCase(segment: string): string {
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function usePageTitle() {
  const { pathname } = useLocation();
  const labels = useRegisteredTitleLabels();

  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    let next = 0;
    const parts = segments.map(segment => {
      const entry = labels[next];
      if (entry && entry.segment === segment) {
        next++;
        if (entry.label) return entry.label;
      }
      return toTitleCase(segment);
    });
    document.title = parts.length > 0 ? 'GTG - ' + parts.join(' - ') : 'GTG';
  }, [pathname, labels]);
}
