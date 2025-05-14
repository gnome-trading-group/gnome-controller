import os
import boto3
from db import DynamoDBClient
from utils import lambda_handler

@lambda_handler
def handler(body):
    listing_id = int(body['listingId'])
    
    ecs = boto3.client('ecs')
    cluster = os.environ['COLLECTOR_ECS_CLUSTER']
    task_definition = os.environ['COLLECTOR_ECS_TASK_DEFINITION']
    security_group_id = os.environ['COLLECTOR_SECURITY_GROUP_ID']
    subnet_ids = os.environ['COLLECTOR_SUBNET_IDS'].split(',')
    
    try:
        db = DynamoDBClient()
        existing_collector = db.get_item(listing_id)
        
        if existing_collector and 'taskArn' in existing_collector:
            try:
                ecs.stop_task(
                    cluster=cluster,
                    task=existing_collector['taskArn']
                )
            except ecs.exceptions.ClientError as e:
                print(e)
                pass
        
        response = ecs.run_task(
            cluster=cluster,
            taskDefinition=task_definition,
            launchType='FARGATE',
            networkConfiguration={
                'awsvpcConfiguration': {
                    'subnets': subnet_ids,
                    'securityGroups': [security_group_id],
                    'assignPublicIp': 'ENABLED'
                }
            },
            overrides={
                'containerOverrides': [{
                    'name': 'CollectorContainer',
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
        raise Exception(f'Failed to create collector: {str(e)}') 