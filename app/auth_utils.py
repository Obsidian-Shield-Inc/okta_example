import time
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
import httpx
from dotenv import load_dotenv
from .logging_config import setup_logging

# Set up logging
logger, auth_logger = setup_logging()

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
        auth_logger.debug("Returning cached JWKS")
        return JWKS_CACHE["jwks"]

    if not OKTA_ISSUER:
        auth_logger.error("Okta Issuer not configured on server")
        raise HTTPException(status_code=500, detail="Okta Issuer not configured on server.")

    async with httpx.AsyncClient() as client:
        try:
            # 1. Fetch OpenID Connect discovery document
            discovery_url = f"{OKTA_ISSUER}/.well-known/openid-configuration"
            auth_logger.info(f"Fetching OIDC discovery from: {discovery_url}")
            response = await client.get(discovery_url)
            response.raise_for_status() 
            discovery_doc = response.json()
            jwks_uri = discovery_doc.get("jwks_uri")

            if not jwks_uri:
                auth_logger.error("JWKS URI not found in OIDC discovery document")
                raise HTTPException(status_code=500, detail="JWKS URI not found in OIDC discovery document")

            # 2. Fetch actual JWKS from the jwks_uri
            auth_logger.info(f"Fetching JWKS from: {jwks_uri}")
            response = await client.get(jwks_uri)
            response.raise_for_status()
            jwks = response.json()
            
            JWKS_CACHE["jwks"] = jwks
            JWKS_CACHE["timestamp"] = current_time
            auth_logger.info("Successfully fetched and cached new JWKS")
            return jwks
        except httpx.HTTPStatusError as e:
            auth_logger.error(f"HTTPStatusError fetching Okta config: {e.request.url} - Status {e.response.status_code} - Response: {e.response.text}")
            raise HTTPException(status_code=500, detail=f"Error fetching Okta configuration from {e.request.url}")
        except Exception as e:
            auth_logger.error(f"Generic error fetching Okta JWKS: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error fetching Okta JWKS: {str(e)}")

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    auth_logger.info("Verifying token for request")
    token = credentials.credentials
    if not OKTA_ISSUER or not OKTA_CLIENT_ID:
        auth_logger.error("Server Error: Okta Issuer or Client ID not configured")
        auth_logger.error(f"OKTA_ISSUER: {'set' if OKTA_ISSUER else 'not set'}")
        auth_logger.error(f"OKTA_CLIENT_ID: {'set' if OKTA_CLIENT_ID else 'not set'}")
        raise HTTPException(status_code=500, detail="Okta configuration missing on server")
    try:
        auth_logger.info("Attempting to verify token")
        jwks = await get_okta_jwks()
        unverified_header = jwt.get_unverified_header(token)
        auth_logger.debug(f"Token header: {unverified_header}")
        
        # Decode without verification first to log claims
        try:
            unverified_claims = jwt.get_unverified_claims(token)
            auth_logger.info("=== Token Claims Debug ===")
            auth_logger.info(f"All available claims: {unverified_claims}")
            auth_logger.info(f"Name claim: {unverified_claims.get('name')}")
            auth_logger.info(f"Given name: {unverified_claims.get('given_name')}")
            auth_logger.info(f"Family name: {unverified_claims.get('family_name')}")
            auth_logger.info(f"Token audience (unverified): {unverified_claims.get('aud')}")
            auth_logger.info(f"Expected audience: {OKTA_CLIENT_ID}")
            auth_logger.info(f"Token issuer (unverified): {unverified_claims.get('iss')}")
            auth_logger.info(f"Expected issuer: {OKTA_ISSUER}")
            auth_logger.info("=========================")
        except Exception as e:
            auth_logger.error(f"Error decoding unverified claims: {str(e)}")

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
            auth_logger.error("Unable to find appropriate signing key for token validation")
            raise HTTPException(status_code=401, detail="Unable to find appropriate signing key for token validation.")

        try:
            # First try with client ID as audience
            try:
                payload = jwt.decode(
                    token,
                    rsa_key,
                    algorithms=["RS256"],
                    audience=OKTA_CLIENT_ID,
                    issuer=OKTA_ISSUER
                )
            except JWTClaimsError as e:
                # If client ID fails, try with issuer as audience
                if "Invalid audience" in str(e):
                    auth_logger.info("Retrying token verification with issuer as audience")
                    payload = jwt.decode(
                        token,
                        rsa_key,
                        algorithms=["RS256"],
                        audience=OKTA_ISSUER,
                        issuer=OKTA_ISSUER
                    )
                else:
                    raise

            # Log all claims for debugging
            auth_logger.info("Token claims received:")
            for claim, value in payload.items():
                auth_logger.info(f"  {claim}: {value}")

            auth_logger.info(f"Successfully verified token for user: {payload.get('email', 'unknown')}")
            return payload
        except Exception as e:
            auth_logger.error(f"Detailed token verification error: {str(e)}")
            raise
    except ExpiredSignatureError:
        auth_logger.warning("Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"The token has expired\""})
    except JWTClaimsError as e:
        auth_logger.warning(f"Token claims invalid: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Token claims invalid: {str(e)}", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
    except JWTError as e:
        auth_logger.warning(f"Invalid token format or signature: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token format or signature: {str(e)}", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
    except HTTPException as e:
        raise e
    except Exception as e:
        auth_logger.error(f"Unexpected error during token validation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials due to an unexpected error.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        ) 