from typing import Literal

from pydantic import BaseModel

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
