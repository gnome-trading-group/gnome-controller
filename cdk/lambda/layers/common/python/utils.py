import json
import functools
from typing import Any, Callable, Dict

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
}

def create_response(status_code: int, body: Any) -> Dict[str, Any]:
    """Create a standardized API response with CORS headers."""
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body)
    }

def lambda_handler(func: Callable[[Dict[str, Any]], Dict[str, Any]]) -> Callable[[Dict[str, Any], Any], Dict[str, Any]]:
    @functools.wraps(func)
    def wrapper(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
        try:
            body = json.loads(event.get('body', '{}'))
            result = func(body)
            return create_response(200, result)
        except Exception as e:
            return create_response(400, {'error': str(e)})
    return wrapper 