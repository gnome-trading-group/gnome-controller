import { useShardLogs } from '../../../../query/hooks';
import { CollectionShard, ShardTaskStatus } from '../../../../types/collection';
import { ContainerLogs } from '../../../../components/ContainerLogs';

function consoleUrl(region: string, taskId: string): string {
  const group = encodeURIComponent(encodeURIComponent(`/collection/shards-${region}`));
  const stream = encodeURIComponent(encodeURIComponent(`shard/ShardContainer/${taskId}`));
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${group}/log-events/${stream}`;
}

// The newest task's log lines, from its region's shard log group; older tasks' are in CloudWatch.
export function ShardLogsTab({ shard, status }: { shard: CollectionShard; status: ShardTaskStatus | null }) {
  const logs = useShardLogs(shard.shardId, shard.region, status?.taskId ?? null);
  return (
    <ContainerLogs
      logs={status ? [{
        id: status.taskId,
        label: `task ${status.taskId}`,
        logs: logs.data?.events ?? [],
        consoleUrl: consoleUrl(shard.region, status.taskId),
      }] : []}
      loading={logs.isFetching}
      initialLoad={logs.isLoading}
      onRefresh={() => logs.refetch()}
    />
  );
}
