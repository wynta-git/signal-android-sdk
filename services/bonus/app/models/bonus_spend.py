from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class SpendPeriod(BaseModel):
    period_type:   str
    period_start:  date
    period_end:    date
    consume_count: int
    total_amount:  Decimal
