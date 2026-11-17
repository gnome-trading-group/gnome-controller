import { useSearchParams } from 'react-router-dom';

// The fills and orders lists' "what it was for" filter, kept in the URL so a link shows the same rows.
export function useRoleParam(): [string | null, (role: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const setRole = (role: string | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (role) updated.set('role', role);
    else updated.delete('role');
    return updated;
  }, { replace: true });
  return [params.get('role'), setRole];
}
