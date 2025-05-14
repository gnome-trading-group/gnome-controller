import json
from typing import Dict, Any
from db import DynamoDBClient, Status

def lambda_handler(event: Dict[str, Any], context: Any) -> None:
    print(f"Received event: {json.dumps(event)}")
    
    detail = event.get('detail', {})
    task_arn = detail.get('taskArn', '')
    last_status = detail.get('lastStatus', '')
    desired_status = detail.get('desiredStatus', '')
    stopped_reason = detail.get('stoppedReason', '')
    
    db = DynamoDBClient()
    collectors = db.get_all_items()
    
    target_collector = None
    for collector in collectors:
        if collector.get('taskArn') == task_arn:
            target_collector = collector
            break
    
    if not target_collector:
        raise Exception(f"No collector found with task ARN {task_arn}")
    
    if last_status == 'RUNNING':
        db.update_status(target_collector['listingId'], Status.ACTIVE)
    elif last_status == 'STOPPED':
        if target_collector['status'] != Status.INACTIVE:
            db.update_status(target_collector['listingId'], Status.FAILED, stopped_reason)
    elif last_status == 'PENDING':
        db.update_status(target_collector['listingId'], Status.PENDING) 
