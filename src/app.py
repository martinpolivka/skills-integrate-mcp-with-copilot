"""High School Management System API.

This FastAPI application lets users view activities and supports authenticated
signup/unregister flows with simple role-based access control.
"""

import base64
import hashlib
import hmac
import os
import secrets
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}


class AuthRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(AuthRequest):
    role: Literal["student", "admin"] = "student"


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return base64.b64encode(digest).decode("ascii")


def _new_user(password: str, role: str) -> dict:
    salt = os.urandom(16)
    return {
        "salt": base64.b64encode(salt).decode("ascii"),
        "password_hash": _hash_password(password, salt),
        "role": role,
    }


# In-memory user + session storage for demo purposes.
users = {
    "admin@mergington.edu": _new_user("admin123", "admin"),
}
sessions = {}


def _get_current_user(authorization: str | None) -> tuple[str, dict]:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    email = sessions.get(token)
    if not email or email not in users:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return email, users[email]


def _require_admin(user_email: str):
    if users[user_email]["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/auth/register")
def register(payload: RegisterRequest):
    email = payload.email.lower()
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    if payload.role == "admin":
        raise HTTPException(status_code=403, detail="Admin registration is not self-service")

    if email in users:
        raise HTTPException(status_code=400, detail="User already exists")

    users[email] = _new_user(payload.password, payload.role)
    return {"message": "User registered", "email": email, "role": users[email]["role"]}


@app.post("/auth/login")
def login(payload: AuthRequest):
    email = payload.email.lower()
    user = users.get(email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    salt = base64.b64decode(user["salt"])
    expected_hash = user["password_hash"]
    received_hash = _hash_password(payload.password, salt)
    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = secrets.token_urlsafe(32)
    sessions[token] = email
    return {"token": token, "email": email, "role": user["role"]}


@app.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    _, _, token = (authorization or "").partition(" ")
    if token in sessions:
        del sessions[token]
    return {"message": "Logged out"}


@app.get("/auth/me")
def me(authorization: str | None = Header(default=None)):
    email, user = _get_current_user(authorization)
    return {"email": email, "role": user["role"]}


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, authorization: str | None = Header(default=None)):
    """Sign up the authenticated user for an activity."""
    email, _ = _get_current_user(authorization)
    email = email.lower()

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(
    activity_name: str,
    email: str,
    authorization: str | None = Header(default=None),
):
    """Admin-only endpoint to unregister a student from an activity."""
    actor_email, _ = _get_current_user(authorization)
    _require_admin(actor_email)
    email = email.lower()

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
