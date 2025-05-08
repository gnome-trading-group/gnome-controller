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
    task_definition = os.environ['COLLECTOR_ECS_TASK_DEFINITION']
    
    try:
        db = DynamoDBClient()
        existing_collector = db.get_item(listing_id)
        
        if existing_collector and 'taskArn' in existing_collector:
            try:
                ecs.stop_task(
                    cluster=cluster,
                    task=existing_collector['taskArn']
                )
            except ecs.exceptions.ClientError:
                pass
        
        response = ecs.run_task(
            cluster=cluster,
            taskDefinition=task_definition,
            launchType='EC2',
            overrides={
                'containerOverrides': [{
                    'name': f'collector-{listing_id}',
                    'environment': [
                        {
                            'name': 'LISTING_ID',
                            'value': str(listing_id)
                        }
                    ]
                }]
            }
        )
        
        task_arn = response['tasks'][0]['taskArn']
        db.put_item(listing_id, task_arn)
        
        return {
            'message': 'Collector created successfully',
            'taskArn': task_arn,
            'restarted': existing_collector is not None
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': {
                'error': f'Failed to create collector: {str(e)}'
            }
        } 