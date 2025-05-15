from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
import httpx
from typing import Optional
import os
from dotenv import load_dotenv
from .dependencies import get_or_create_current_app_user
from .schemas import UserInDB
import time
from .database import create_tables, get_db
from . import models

# Load environment variables
load_dotenv()

# Call create_tables() to ensure DB and tables are created on startup
# In a production app, you would use Alembic migrations instead.
@app.on_event("startup")
def on_startup():
    print("Creating database tables...")
    create_tables()
    print("Database tables created.")
    # You could also pre-populate default roles here if needed
    # with next(get_db()) as db:
    #     crud.get_or_create_default_role(db, "ROLE_ADMIN", "Administrator Role")
    #     crud.get_or_create_default_role(db, "ROLE_EDITOR", "Editor Role")

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Okta configuration
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
                # Log this server-side
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
            # Log this server-side with more detail
            print(f"HTTPStatusError fetching Okta config: {e.request.url} - Status {e.response.status_code} - Response: {e.response.text}")
            raise HTTPException(status_code=500, detail=f"Error fetching Okta configuration from {e.request.url}")
        except Exception as e:
            # Log this server-side
            print(f"Generic error fetching Okta JWKS: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error fetching Okta JWKS: {str(e)}")

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    if not OKTA_ISSUER or not OKTA_CLIENT_ID: # Check again inside dependency for safety
        # Log this server-side
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
            # Log this: print(f"Token KID: {unverified_header.get('kid')}, JWKS Kids: {[k.get('kid') for k in jwks.get('keys', [])]}")
            raise HTTPException(status_code=401, detail="Unable to find appropriate signing key for token validation.")

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"], 
            audience=OKTA_CLIENT_ID,
            issuer=OKTA_ISSUER
        )
        return payload # This is the dict of claims
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\", error_description=\"The token has expired\""})
    except JWTClaimsError as e: # E.g. audience or issuer mismatch
        raise HTTPException(status_code=401, detail=f"Token claims invalid: {str(e)}", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
    except JWTError as e: # Other JWT related errors from jose library
        raise HTTPException(status_code=401, detail=f"Invalid token format or signature: {str(e)}", headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""})
    except HTTPException as e: # Re-raise HTTPExceptions from get_okta_jwks if they occur
        raise e
    except Exception as e: # Catch-all for truly unexpected errors during validation
        # Log this critical error for server-side investigation: print(f"CRITICAL: Unexpected token validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials due to an unexpected error.",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )

@app.get("/api/public")
async def public_route():
    return {"message": "This is a public route"}

@app.get("/api/protected", dependencies=[Depends(verify_token)])
async def protected_route():
    return {
        "message": "This is a protected route, token is valid"
    }

@app.get("/users/me", response_model=UserInDB)
async def read_users_me(current_user: models.User = Depends(get_or_create_current_app_user)):
    # current_user is now an SQLAlchemy model instance from dependencies
    # Pydantic will convert it to schemas.UserInDB based on orm_mode/from_attributes
    return current_user

@app.post("/items")
async def create_item(item_data: dict, current_user: models.User = Depends(get_or_create_current_app_user)):
    # current_user is an SQLAlchemy model instance with a `roles` attribute (List[models.Role])
    # Extract role names for easier checking:
    user_role_names = {role.name for role in current_user.roles}
    
    print(f"User {current_user.email} with roles {user_role_names} attempting to create item: {item_data}")

    # Example: only users with 'ROLE_EDITOR' or 'ROLE_ADMIN' can create items
    if not {"ROLE_EDITOR", "ROLE_ADMIN"}.intersection(user_role_names):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create items")
    
    return {"message": "Item created successfully", "item": item_data, "user_email": current_user.email, "user_roles": list(user_role_names)} 