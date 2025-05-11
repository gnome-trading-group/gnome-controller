from db import DynamoDBClient
from utils import lambda_handler
from constants import Status

@lambda_handler
def handler(body):
    listing_id = int(body['listingId'])
    status_str = body['status']
    failure_reason = body.get('failureReason')
    
    try:
        status = Status(status_str)
    except ValueError:
        raise Exception(f'Invalid status: {status_str}. Must be one of: {[s.value for s in Status]}')
    
    db = DynamoDBClient()
    db.update_status(listing_id, status, failure_reason)
    
    return {
        'message': 'Collector status updated successfully',
        'listingId': listing_id,
        'status': status.value
    } 