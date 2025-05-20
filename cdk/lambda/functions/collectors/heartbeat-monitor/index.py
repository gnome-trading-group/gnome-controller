import os
import boto3
import time
from db import DynamoDBClient
from constants import Status

def check_collector(collector, current_time):
    if collector.get('status') != Status.ACTIVE.value:
        return None
        
    listing_id = collector['listingId']
    task_arn = collector.get('taskArn')
    last_heartbeat = collector.get('lastHeartbeat')
    last_status_change = collector.get('lastStatusChange')
    
    if last_heartbeat:
        seconds_elapsed = current_time - last_heartbeat
        if seconds_elapsed > 600:
            return {
                'listing_id': listing_id,
                'task_arn': task_arn,
                'reason': f'No heartbeat received for {seconds_elapsed} seconds'
            }
    elif last_status_change:
        seconds_elapsed = current_time - last_status_change
        if seconds_elapsed > 600:
            return {
                'listing_id': listing_id,
                'task_arn': task_arn,
                'reason': f'No heartbeat received since status change ({seconds_elapsed} seconds)'
            }
    
    return None

def handle_failed_collector(failed_collector, db, ecs, cluster):
    db.update_status(
        failed_collector['listing_id'],
        Status.FAILED,
        failed_collector['reason']
    )
    
    if failed_collector['task_arn']:
        try:
            ecs.stop_task(
                cluster=cluster,
                task=failed_collector['task_arn'],
                reason=failed_collector['reason']
            )
        except ecs.exceptions.ClientError as e:
            print(f'Failed to stop task {failed_collector["task_arn"]}: {str(e)}')

def lambda_handler(event, context):
    db = DynamoDBClient()
    ecs = boto3.client('ecs')
    cluster = os.environ['COLLECTOR_ECS_CLUSTER']
    
    collectors = db.get_all_items()
    current_time = int(time.time())
    
    failed_collectors = [
        collector for collector in collectors 
        if check_collector(collector, current_time) is not None
    ]
    
    for failed_collector in failed_collectors:
        handle_failed_collector(failed_collector, db, ecs, cluster) 