from db import DynamoDBClient
from utils import lambda_handler

@lambda_handler
def handler(body):
    listing_id = int(body['listingId'])
    
    db = DynamoDBClient()
    db.update_heartbeat(listing_id)
    
    return {'message': 'Heartbeat updated successfully'} 