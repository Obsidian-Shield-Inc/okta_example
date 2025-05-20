import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, Role
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Use the same DATABASE_URL as the backend
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:changeme@db:5432/appdb")

def make_user_admin(email: str):
    """Make a user an admin by their email address."""
    print(f"Using database URL: {SQLALCHEMY_DATABASE_URL}")
    
    # Create database engine and session
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Get the user
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User with email {email} not found!")
            return
        
        # Get or create admin role
        admin_role = db.query(Role).filter(Role.name == "ROLE_ADMIN").first()
        if not admin_role:
            admin_role = Role(name="ROLE_ADMIN", description="Administrator Role")
            db.add(admin_role)
            db.flush()
        
        # Check if user is already admin
        if any(role.name == "ROLE_ADMIN" for role in user.roles):
            print(f"User {email} is already an admin!")
            return
        
        # Make user admin
        user.roles.append(admin_role)
        db.commit()
        print(f"Successfully made {email} an admin!")
    
    except Exception as e:
        print(f"Error making user admin: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python make_admin.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    make_user_admin(email) 