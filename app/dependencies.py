# Placeholder for dependencies.py

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import get_db
from .main import verify_token # verify_token is in main.py

async def get_or_create_current_app_user(
    db: Session = Depends(get_db),
    okta_claims: dict = Depends(verify_token) # From main.py
) -> models.User: # Return the SQLAlchemy model instance for now
    okta_user_id = okta_claims.get("sub")
    email = okta_claims.get("email")
    # Potentially get full name if available, e.g., from 'name' claim
    full_name = okta_claims.get("name") 

    if not okta_user_id or not email:
        # This should ideally not happen if token validation includes these checks or they are mandatory claims
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Okta User ID (sub) or email missing from token")

    db_user = crud.get_user_by_okta_id(db, okta_id=okta_user_id)

    if not db_user:
        # User doesn't exist in local DB, provision them with a basic role
        print(f"User with Okta ID {okta_user_id} not found in DB. Provisioning...")
        db_user = crud.create_user_with_basic_role(db, okta_id=okta_user_id, email=email, full_name=full_name)
        print(f"User {email} (Okta ID: {okta_user_id}) auto-provisioned with basic role.")
    else:
        # Optional: Update user's email or full_name if it has changed in Okta
        if db_user.email != email or (full_name and db_user.full_name != full_name):
            db_user.email = email
            if full_name:
                db_user.full_name = full_name
            db.commit()
            db.refresh(db_user)
            print(f"Updated details for user {email}")
        print(f"User {email} (Okta ID: {okta_user_id}) found in DB.")
    
    # The db_user object is an SQLAlchemy model instance.
    # If your response_model in FastAPI endpoints is a Pydantic schema (like schemas.UserInDB),
    # FastAPI will automatically convert it if orm_mode/from_attributes is True in the Pydantic model.
    return db_user 