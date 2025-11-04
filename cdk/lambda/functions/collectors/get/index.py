import os
import boto3
from db import DynamoDBClient
from utils import create_response

def handler(event, context):
    try:
        # Extract listingId from path parameters
        listing_id = int(event['pathParameters']['listingId'])
        
        db = DynamoDBClient()
        collector = db.get_item(listing_id)
        
        if not collector:
            raise Exception(f'Collector with listing ID {listing_id} not found')
        
        # Get ECS task details if we have task ARNs
        task_details = []
        if collector.get('taskArns'):
            ecs = boto3.client('ecs')
            cluster = os.environ['COLLECTOR_ECS_CLUSTER']
            
            try:
                response = ecs.describe_tasks(
                    cluster=cluster,
                    tasks=collector['taskArns']
                )
                task_details = response.get('tasks', [])
            except Exception as e:
                print(f"Error fetching task details: {e}")
        
        result = {
            'collector': collector,
            'taskDetails': task_details
        }
        
        return create_response(200, result)
        
    except Exception as e:
        return create_response(400, {'error': str(e)})
