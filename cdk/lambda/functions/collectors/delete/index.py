import os
import boto3
from db import DynamoDBClient
from utils import lambda_handler
from constants import Status

@lambda_handler
def handler(body):
    listing_id = int(body['listingId'])
    
    ecs = boto3.client('ecs')
    cluster = os.environ['COLLECTOR_ECS_CLUSTER']
    
    db = DynamoDBClient()
    
    collector = db.get_item(listing_id)
    if not collector:
        raise Exception(f'Collector with listing ID {listing_id} not found')
    
    db.update_status(listing_id, Status.INACTIVE)

    if 'taskArn' in collector:
        try:
            ecs.stop_task(
                cluster=cluster,
                task=collector['taskArn']
            )
        except ecs.exceptions.ClientError as e:
            print(e)
            pass
    
    return {'message': 'Collector stopped successfully'} 