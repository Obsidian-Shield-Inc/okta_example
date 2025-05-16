# Placeholder for schemas.py
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- Role Schemas ---
class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None

class RoleCreate(RoleBase):
    pass

class Role(RoleBase):
    id: int

    # For Pydantic V1, orm_mode = True
    # For Pydantic V2, from_attributes = True
    class Config:
        from_attributes = True # Pydantic V2
        # orm_mode = True # Pydantic V1

# --- User Schemas ---
class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    # okta_user_id will be passed separately or derived from token
    pass

class User(UserBase):
    id: int
    okta_user_id: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    roles: List[Role] = [] # Populate with Role schemas

    class Config:
        from_attributes = True # Pydantic V2
        # orm_mode = True # Pydantic V1

# Schema for returning user info, might be same as User or specialized
class UserInDB(User):
    pass

    class Config:
        from_attributes = True # Pydantic V2
        # orm_mode = True # or from_attributes = True for Pydantic v2 