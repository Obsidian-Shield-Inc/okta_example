from sqlalchemy.orm import Session
from . import models, schemas
from typing import Optional, List

# --- Role CRUD ---
def get_role(db: Session, role_id: int) -> Optional[models.Role]:
    return db.query(models.Role).filter(models.Role.id == role_id).first()

def get_role_by_name(db: Session, name: str) -> Optional[models.Role]:
    return db.query(models.Role).filter(models.Role.name == name).first()

def get_roles(db: Session, skip: int = 0, limit: int = 100) -> List[models.Role]:
    return db.query(models.Role).offset(skip).limit(limit).all()

def create_role(db: Session, role: schemas.RoleCreate) -> models.Role:
    db_role = models.Role(name=role.name, description=role.description)
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role

# --- User CRUD ---
def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_okta_id(db: Session, okta_id: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.okta_user_id == okta_id).first()

def get_users(db: Session) -> List[models.User]:
    """Get all users from the database."""
    return db.query(models.User).all()

def create_user(db: Session, user_data: schemas.UserCreate, okta_id: str, full_name: Optional[str] = None) -> models.User:
    db_user = models.User(
        email=user_data.email, 
        okta_user_id=okta_id,
        full_name=full_name or user_data.full_name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def assign_role_to_user(db: Session, user: models.User, role: models.Role) -> models.User:
    if role not in user.roles:
        user.roles.append(role)
        db.commit()
        db.refresh(user)
    return user

def get_or_create_default_role(db: Session, role_name: str = "ROLE_BASIC_USER", description: str = "Basic user role") -> models.Role:
    role = get_role_by_name(db, name=role_name)
    if not role:
        role_create = schemas.RoleCreate(name=role_name, description=description)
        role = create_role(db, role=role_create)
    return role

def create_user_with_basic_role(db: Session, okta_id: str, email: str, full_name: Optional[str] = None) -> models.User:
    user_create_schema = schemas.UserCreate(email=email, full_name=full_name)
    db_user = create_user(db, user_data=user_create_schema, okta_id=okta_id, full_name=full_name)
    
    # Get or create the default basic role
    basic_role = get_or_create_default_role(db)
    
    # Assign the basic role to the new user
    db_user = assign_role_to_user(db, user=db_user, role=basic_role)
    return db_user

def get_or_create_admin_role(db: Session) -> models.Role:
    """Get or create the admin role."""
    admin_role = db.query(models.Role).filter(models.Role.name == "ROLE_ADMIN").first()
    if not admin_role:
        admin_role = models.Role(name="ROLE_ADMIN", description="Administrator Role")
        db.add(admin_role)
        db.commit()
        db.refresh(admin_role)
    return admin_role

def make_user_admin(db: Session, user: models.User) -> models.User:
    # Get or create the admin role
    admin_role = db.query(models.Role).filter(models.Role.name == "ROLE_ADMIN").first()
    if not admin_role:
        admin_role = models.Role(name="ROLE_ADMIN", description="Administrator Role")
        db.add(admin_role)
        db.flush()  # Flush to get the role ID but don't commit yet
    
    # Check if user already has admin role
    if not any(role.name == "ROLE_ADMIN" for role in user.roles):
        # Merge the user into the current session to avoid attachment issues
        user = db.merge(user)
        user.roles.append(admin_role)
        db.commit()
    
    return user 