import os
import boto3
from db import DynamoDBClient
from utils import lambda_handler
from constants import Status

@lambda_handler
def handler(event, context):
    body = event['body']
    listing_id = int(body['listingId'])
    
    ecs = boto3.client('ecs')
    cluster = os.environ['COLLECTOR_ECS_CLUSTER']
    
    db = DynamoDBClient()
    
    collector = db.get_item(listing_id)
    if not collector:
        return {
            'statusCode': 404,
            'body': {
                'error': f'Collector with listing ID {listing_id} not found'
            }
        }
    
    if 'taskArn' in collector:
        try:
            ecs.stop_task(
                cluster=cluster,
                task=collector['taskArn']
            )
        except ecs.exceptions.ClientError:
            pass
    
    db.update_status(listing_id, Status.INACTIVE)
    
    return {'message': 'Collector stopped successfully'} 