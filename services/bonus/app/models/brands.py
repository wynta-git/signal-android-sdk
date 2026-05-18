from pydantic import BaseModel


class BrandResponse(BaseModel):
    name: str
    description: str
    site_id: int
