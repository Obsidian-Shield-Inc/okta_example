# Placeholder for dependencies.py

from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from jose import jwt
from typing import Optional
import json

from . import crud, models, schemas
from .database import get_db
from .auth_utils import verify_token
from .logging_config import setup_logging

# Set up logging
logger, auth_logger = setup_logging()

async def get_id_token(request: Request) -> Optional[str]:
    return request.headers.get("X-ID-Token")

async def get_user_info(request: Request) -> Optional[dict]:
    user_info_str = request.headers.get("X-User-Info")
    if user_info_str:
        try:
            return json.loads(user_info_str)
        except json.JSONDecodeError as e:
            auth_logger.warning(f"Error decoding X-User-Info header: {str(e)}")
    return None

async def get_or_create_current_app_user(
    request: Request,
    db: Session = Depends(get_db),
    okta_claims: dict = Depends(verify_token),
    id_token: Optional[str] = Depends(get_id_token),
    user_info: Optional[dict] = Depends(get_user_info)
) -> models.User:
    auth_logger.info("Processing user authentication")
    
    # Get claims from access token
    okta_user_id = okta_claims.get("uid")  # Use uid claim for Okta ID
    email = okta_claims.get("email") or okta_claims.get("sub")  # Try email claim first, fallback to sub
    
    # Get additional claims from ID token if available
    id_token_claims = {}
    if id_token:
        try:
            id_token_claims = jwt.get_unverified_claims(id_token)
            auth_logger.info("ID Token claims received:")
            for claim, value in id_token_claims.items():
                auth_logger.info(f"  {claim}: {value}")
        except Exception as e:
            auth_logger.warning(f"Error decoding ID token: {str(e)}")
    
    # Log user info from header if available
    if user_info:
        auth_logger.info("User info from Okta:")
        for key, value in user_info.items():
            auth_logger.info(f"  {key}: {value}")
    
    # Try to get name from various sources
    full_name = (
        (user_info or {}).get("name") or  # First try user info from Okta
        id_token_claims.get("name") or    # Then ID token
        okta_claims.get("name") or        # Then access token
        " ".join(filter(None, [           # Finally try constructing from given_name + family_name
            (user_info or {}).get("given_name") or id_token_claims.get("given_name"),
            (user_info or {}).get("family_name") or id_token_claims.get("family_name")
        ])).strip() or
        None
    )

    auth_logger.info(f"Processing user: {email}")
    auth_logger.info(f"Full name from all sources: {full_name}")

    if not okta_user_id or not email:
        auth_logger.error(f"Missing required claims - Okta ID: {'✓' if okta_user_id else '✗'}, Email: {'✓' if email else '✗'}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Okta User ID (uid) or email missing from token")

    auth_logger.info(f"Checking if user exists in database - Email: {email}")
    db_user = crud.get_user_by_okta_id(db, okta_id=okta_user_id)

    if not db_user:
        auth_logger.info(f"Creating new user in database:")
        auth_logger.info(f"• Email: {email}")
        auth_logger.info(f"• Okta ID: {okta_user_id}")
        auth_logger.info(f"• Full Name: {full_name or 'Not provided'}")
        
        db_user = crud.create_user_with_basic_role(db, okta_id=okta_user_id, email=email, full_name=full_name)
        auth_logger.info(f"User successfully created with basic role")
    else:
        auth_logger.info(f"User found in database - Email: {email}")
        
        # Check for updates
        needs_update = False
        update_fields = []
        
        if db_user.email != email:
            needs_update = True
            update_fields.append(f"email: {db_user.email} → {email}")
            db_user.email = email
            
        if full_name and db_user.full_name != full_name:
            needs_update = True
            update_fields.append(f"full_name: {db_user.full_name or 'None'} → {full_name}")
            db_user.full_name = full_name
            
        if needs_update:
            auth_logger.info(f"Updating user information:")
            for field in update_fields:
                auth_logger.info(f"• {field}")
            db.commit()
            db.refresh(db_user)
            auth_logger.info(f"User information successfully updated")
        else:
            auth_logger.info(f"User information is up to date")

        # Log roles
        role_names = [role.name for role in db_user.roles]
        auth_logger.info(f"User Roles: {', '.join(role_names) or 'No roles assigned'}")
    
    return db_user 