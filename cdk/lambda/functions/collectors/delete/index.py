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

    service_name = f'collector-{listing_id}'

    # Update status to inactive first
    db.update_status(listing_id, Status.INACTIVE)

    # Delete the ECS service
    try:
        # First, scale down to 0
        ecs.update_service(
            cluster=cluster,
            service=service_name,
            desiredCount=0
        )

        # Then delete the service
        ecs.delete_service(
            cluster=cluster,
            service=service_name,
            force=True
        )

        return {
            'message': 'Collector service deleted successfully',
            'serviceName': service_name
        }
    except ecs.exceptions.ServiceNotFoundException:
        return {
            'message': 'Collector service not found (may have been already deleted)',
            'serviceName': service_name
        }
    except ecs.exceptions.ClientError as e:
        print(f'Error deleting service: {e}')
        raise Exception(f'Failed to delete collector service: {str(e)}')