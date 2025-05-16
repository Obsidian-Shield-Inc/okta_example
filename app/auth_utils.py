import time
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

security = HTTPBearer()

OKTA_ISSUER = os.getenv("OKTA_ISSUER")
OKTA_CLIENT_ID = os.getenv("OKTA_CLIENT_ID")

# --- JWKS Caching (Simple in-memory example) ---
JWKS_CACHE = {
    "jwks": None,
    "timestamp": 0
}
JWKS_CACHE_TTL = 3600  # 1 hour in seconds

async def get_okta_jwks():
    current_time = time.time()
    if JWKS_CACHE["jwks"] and (current_time - JWKS_CACHE["timestamp"] < JWKS_CACHE_TTL):
        print("Returning cached JWKS") # For debugging, remove in prod
        return JWKS_CACHE["jwks"]

    if not OKTA_ISSUER:
        raise HTTPException(status_code=500, detail="Okta Issuer not configured on server.")

    async with httpx.AsyncClient() as client:
        try:
            # 1. Fetch OpenID Connect discovery document
            discovery_url = f"{OKTA_ISSUER}/.well-known/openid-configuration"
            print(f"Fetching OIDC discovery from: {discovery_url}") # Debug
            response = await client.get(discovery_url)
            response.raise_for_status() 
            discovery_doc = response.json()
            jwks_uri = discovery_doc.get("jwks_uri")

            if not jwks_uri:
                print("Error: JWKS URI not found in OIDC discovery document")
                raise HTTPException(status_code=500, detail="JWKS URI not found in OIDC discovery document")

            # 2. Fetch actual JWKS from the jwks_uri
            print(f"Fetching JWKS from: {jwks_uri}") # Debug
            response = await client.get(jwks_uri)
            response.raise_for_status()
            jwks = response.json()
            
            JWKS_CACHE["jwks"] = jwks
            JWKS_CACHE["timestamp"] = current_time
            print("Fetched and cached new JWKS") # Debug
            return jwks
        except httpx.HTTPStatusError as e:
            print(f"HTTPStatusError fetching Okta config: {e.request.url} - Status {e.response.status_code} - Response: {e.response.text}")
            raise HTTPException(status_code=500, detail=f"Error fetching Okta configuration from {e.request.url}")
        except Exception as e:
            print(f"Generic error fetching Okta JWKS: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error fetching Okta JWKS: {str(e)}")

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    if not OKTA_ISSUER or not OKTA_CLIENT_ID:
        print("Server Error: Okta Issuer or Client ID not configured.")
        raise HTTPException(status_code=500, detail="Okta configuration missing on server")
    try:
        jwks = await get_okta_jwks()
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}
        for key_spec in jwks.get("keys", []):
            if key_spec.get("kid") == unverified_header.get("kid"):
                rsa_key = {
                    "kty": key_spec.get("kty"),
                    "kid": key_spec.get("kid"),
                    "use": key_spec.get("use"),
                    "n": key_spec.get("n"),
                    "e": key_spec.get("e")
                }
                break 
        
        if not rsa_key:
            raise HTTPException(status_code=401, detail="Unable to find appropriate signing key for token validation.")

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"], 
            audience=OKTA_CLIENT_ID,
            issuer=OKTA_ISSUER
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"The token has expired\""})
    except JWTClaimsError as e:
        raise HTTPException(status_code=401, detail=f"Token claims invalid: {str(e)}", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token format or signature: {str(e)}", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials due to an unexpected error.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        ) 