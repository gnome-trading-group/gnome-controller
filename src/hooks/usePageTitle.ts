import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function toTitleCase(segment: string): string {
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function usePageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean);
    document.title = segments.length > 0
      ? 'GTG - ' + segments.map(toTitleCase).join(' - ')
      : 'GTG';
  }, [pathname]);
}
