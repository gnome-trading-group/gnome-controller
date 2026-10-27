import { ConnectionScope, Source } from '../types';

export const SCOPE_NOUN: Record<ConnectionScope, string> = { IP: 'IP', KEY: 'key', ACCOUNT: 'account' };

/** How many connections the venue allows, e.g. "180 per account". */
export function connectionLimitLabel(source: Pick<Source, 'connectionsPerScope' | 'connectionScope'>): string {
  return source.connectionsPerScope === null
    ? 'No limit'
    : `${source.connectionsPerScope} per ${SCOPE_NOUN[source.connectionScope]}`;
}

/** A form's limit: blank is no limit, otherwise a positive whole number, as the registry requires. */
export function isValidLimit(value: number | ''): boolean {
  return value === '' || (Number.isInteger(value) && value > 0);
}

export function limitOrNull(value: number | ''): number | null {
  return value === '' ? null : value;
}
