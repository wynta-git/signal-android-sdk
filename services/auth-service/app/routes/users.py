from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

UserType = Literal[
    "ACCOUNT_MANAGER",
    "MARKETING_MANAGER",
    "FINANCE_MANAGER",
    "OPS_LEAD",
    "CAMPAIGN_MANAGER",
    "ADMIN",
    "ANALYST",
    "SUPPORT",
    "BRAND_MANAGER",
    "PRODUCT_MANAGER",
]


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    user_type: UserType


_USERS: list[UserResponse] = [
    UserResponse(id=1, username="alice.morgan", email="alice.morgan@example.com", user_type="ACCOUNT_MANAGER"),
    UserResponse(id=2, username="bob.chen", email="bob.chen@example.com", user_type="MARKETING_MANAGER"),
    UserResponse(id=3, username="carol.patel", email="carol.patel@example.com", user_type="FINANCE_MANAGER"),
    UserResponse(id=4, username="david.kim", email="david.kim@example.com", user_type="OPS_LEAD"),
    UserResponse(id=5, username="eva.smith", email="eva.smith@example.com", user_type="CAMPAIGN_MANAGER"),
    UserResponse(id=6, username="frank.jones", email="frank.jones@example.com", user_type="ADMIN"),
    UserResponse(id=7, username="grace.liu", email="grace.liu@example.com", user_type="ANALYST"),
    UserResponse(id=8, username="henry.obi", email="henry.obi@example.com", user_type="SUPPORT"),
    UserResponse(id=9, username="isla.reyes", email="isla.reyes@example.com", user_type="BRAND_MANAGER"),
    UserResponse(id=10, username="james.wu", email="james.wu@example.com", user_type="PRODUCT_MANAGER"),
]


@router.get("/users", response_model=list[UserResponse])
async def list_users() -> list[UserResponse]:
    """Return the list of back-office users."""
    return _USERS
