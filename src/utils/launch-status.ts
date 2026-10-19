import { LaunchRequest, RequestStatus, RuleStatus, TriggerOutcome } from '../types/launcher';

// Keyed by the type so adding a status fails to compile until it has a colour and a label.
export const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  PENDING_APPROVAL: 'yellow',
  APPROVED: 'cyan',
  SCHEDULED: 'indigo',
  LAUNCHING: 'blue',
  LAUNCHED: 'green',
  FAILED: 'red',
  REJECTED: 'gray',
  CANCELLED: 'gray',
  PENDING_SHUTDOWN_APPROVAL: 'yellow',
  SHUTDOWN_APPROVED: 'cyan',
  STOPPING: 'orange',
  STOPPED: 'gray',
  STOP_FAILED: 'red',
  SHUTDOWN_REJECTED: 'gray',
  EXPIRED: 'gray',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  LAUNCHING: 'Launching',
  LAUNCHED: 'Launched',
  FAILED: 'Failed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  PENDING_SHUTDOWN_APPROVAL: 'Awaiting shutdown approval',
  SHUTDOWN_APPROVED: 'Shutdown approved',
  STOPPING: 'Stopping',
  STOPPED: 'Stopped',
  STOP_FAILED: 'Stop failed',
  SHUTDOWN_REJECTED: 'Shutdown rejected',
  EXPIRED: 'Expired',
};

export const OUTCOME_COLORS: Record<TriggerOutcome, string> = {
  REQUESTED: 'green',
  DUPLICATE: 'gray',
  RATE_LIMITED: 'orange',
  NO_MATCH: 'gray',
  BLOCKED: 'yellow',
  ERROR: 'red',
  INVALID: 'red',
  NO_RULES: 'gray',
  EXPIRED: 'gray',
};

export const OUTCOME_LABELS: Record<TriggerOutcome, string> = {
  REQUESTED: 'Acted',
  DUPLICATE: 'Repeat',
  RATE_LIMITED: 'Rate limited',
  NO_MATCH: 'No match',
  BLOCKED: 'Blocked',
  ERROR: 'Error',
  INVALID: 'Invalid trigger',
  NO_RULES: 'No rules',
  EXPIRED: 'Too late',
};

export const RULE_STATUS_COLORS: Record<RuleStatus, string> = { active: 'green', disabled: 'gray', archived: 'dark' };

const PENDING: RequestStatus[] = ['PENDING_APPROVAL', 'PENDING_SHUTDOWN_APPROVAL'];
// Statuses a request can still leave on its own; a page showing one keeps polling.
const MOVING: RequestStatus[] = ['APPROVED', 'SCHEDULED', 'LAUNCHING', 'SHUTDOWN_APPROVED', 'STOPPING', ...PENDING];

// The sweeper marks a request EXPIRED up to five minutes after its deadline; until then it can't be approved either.
export const isExpired = (request: LaunchRequest) => !!request.expires_at && Date.parse(request.expires_at) <= Date.now();
export const isPending = (request: LaunchRequest) => PENDING.includes(request.status) && !isExpired(request);
// Whether the request's deadline still matters: it hasn't launched yet, or it ran out of time.
export const showsExpiry = (request: LaunchRequest) => !!request.expires_at
  && ['PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'EXPIRED'].includes(request.status);
export const isMoving = (request: LaunchRequest) => MOVING.includes(request.status)
  || (!!request.session_status && !['STOPPED', 'FAILED', 'MISSING'].includes(request.session_status));
export const canRetry = (request: LaunchRequest) => request.action === 'launch' && request.status === 'FAILED';
export const canCancel = (request: LaunchRequest) => request.status === 'SCHEDULED';

// "ui:mprey@…" / "slack:mason" / "launcher" / "sweeper", shown without the transport prefix.
export function actorLabel(actor: string | null | undefined): string {
  if (!actor) return '—';
  const [kind, who] = actor.includes(':') ? actor.split(/:(.*)/s, 2) : [actor, ''];
  if (kind === 'ui') return who;
  if (kind === 'slack') return `@${who} (Slack)`;
  if (kind === 'launcher' && who) return `rule ${who}`;
  return kind;
}

// A trigger's data in a few words: its first few fields, enough to tell one match or event from another.
export function triggerSummary(data: Record<string, unknown>): string {
  return Object.entries(data).slice(0, 4)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.slice(0, 3).join(',') + (v.length > 3 ? '…' : '') : String(v)}`)
    .join('  ');
}
