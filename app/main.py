import logging
import sys
from fastapi import FastAPI, Depends, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
import httpx
from typing import Optional, List, Set
import os
from dotenv import load_dotenv
from .dependencies import get_or_create_current_app_user
from .schemas import UserInDB
import time
from .database import create_tables, get_db
from . import models, crud
from .auth_utils import verify_token
from .logging_config import setup_logging
from sqlalchemy.orm import Session
from .crud import get_users

# Set up logging
logger, auth_logger = setup_logging()

# Load environment variables
load_dotenv()

# Get environment variables
OKTA_ISSUER = os.getenv("OKTA_ISSUER")
OKTA_CLIENT_ID = os.getenv("OKTA_CLIENT_ID")

# Initialize FastAPI app
app = FastAPI()

# Set development mode - we'll use this for CORS
IS_DEVELOPMENT = os.getenv("ENVIRONMENT", "development") == "development"
FRONTEND_URL = "http://localhost:3000" if IS_DEVELOPMENT else "https://your-production-domain.com"

# Log application startup and environment variables
logger.info("Starting FastAPI application...")
logger.info(f"Environment: {'development' if IS_DEVELOPMENT else 'production'}")
logger.info(f"Frontend URL: {FRONTEND_URL}")
logger.info(f"OKTA_ISSUER: {OKTA_ISSUER}")
logger.info(f"OKTA_CLIENT_ID: {OKTA_CLIENT_ID}")

if not OKTA_ISSUER or not OKTA_CLIENT_ID:
    logger.error("Missing required environment variables!")
    if not OKTA_ISSUER:
        logger.error("OKTA_ISSUER is not set")
    if not OKTA_CLIENT_ID:
        logger.error("OKTA_CLIENT_ID is not set")
    raise ValueError("Missing required Okta configuration. Check your .env file.")

# Add logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    auth_logger.info(f"Incoming request: {request.method} {request.url.path}")
    if request.url.path.startswith("/api/"):
        auth_header = request.headers.get("authorization")
        if auth_header:
            auth_logger.info(f"Request contains authorization header")
        else:
            auth_logger.warning(f"No authorization header present for API request")
    
    response = await call_next(request)
    auth_logger.info(f"Request completed: {request.method} {request.url.path} - Status: {response.status_code}")
    return response

# CORS middleware - must be added before any routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization", 
        "Content-Type", 
        "Accept", 
        "X-Requested-With", 
        "X-ID-Token",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers"
    ],
    expose_headers=["*"],
    max_age=3600,
)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response

# Call create_tables() to ensure DB and tables are created on startup
# In a production app, you would use Alembic migrations instead.
@app.on_event("startup")
def on_startup():
    logger.info("Creating database tables...")
    create_tables()
    logger.info("Database tables created successfully.")
    # You could also pre-populate default roles here if needed
    # with next(get_db()) as db:
    #     crud.get_or_create_default_role(db, "ROLE_ADMIN", "Administrator Role")
    #     crud.get_or_create_default_role(db, "ROLE_EDITOR", "Editor Role")

# Security
security = HTTPBearer()

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

@app.get("/api/public")
async def public_route():
    return {"message": "This is a public route"}

@app.get("/api/protected", dependencies=[Depends(verify_token)])
async def protected_route():
    auth_logger.info("Protected route accessed - token is valid")
    return {
        "message": "This is a protected route, token is valid"
    }

@app.get("/api/users/me", response_model=UserInDB)
async def read_users_me(current_user: models.User = Depends(get_or_create_current_app_user)):
    auth_logger.info(f"User info requested for: {current_user.email}")
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

@app.get("/api/test-logging")
async def test_logging():
    logger.debug("This is a debug message")
    logger.info("This is an info message")
    logger.warning("This is a warning message")
    logger.error("This is an error message")
    auth_logger.info("Testing auth logger")
    return {"message": "Logging test completed"}

@app.get("/api/users", response_model=List[UserInDB])
async def list_users(current_user: models.User = Depends(get_or_create_current_app_user), db: Session = Depends(get_db)):
    # Only users with ROLE_ADMIN can list users
    user_role_names = {role.name for role in current_user.roles}
    if "ROLE_ADMIN" not in user_role_names:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can view the users list"
        )
    
    auth_logger.info(f"User {current_user.email} requesting users list")
    users = get_users(db)
    return users

@app.put("/api/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    role_name: str = Body(..., example="ROLE_BASIC_USER"),
    current_user: models.User = Depends(get_or_create_current_app_user),
    db: Session = Depends(get_db)
):
    # Verify the current user is an admin
    if not any(role.name == "ROLE_ADMIN" for role in current_user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can modify user roles"
        )
    
    # Get the target user
    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Validate role name
    valid_roles = {"ROLE_BASIC_USER", "ROLE_ADMIN"}
    if role_name not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role name: {role_name}"
        )
    
    try:
        # Get or create the role
        role = db.query(models.Role).filter(models.Role.name == role_name).first()
        if not role:
            role = models.Role(name=role_name, description=f"{role_name} Role")
            db.add(role)
            db.flush()
        
        # Update user role (single role)
        target_user.roles = [role]
        db.commit()
        
        auth_logger.info(f"User {current_user.email} updated role for user {target_user.email} to: {role_name}")
        return {"message": f"Updated role for user {target_user.email}", "role": role_name}
    
    except Exception as e:
        db.rollback()
        auth_logger.error(f"Error updating role: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating user role"
        ) 