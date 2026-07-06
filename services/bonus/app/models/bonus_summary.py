from decimal import Decimal

from pydantic import BaseModel


class BonusSummary(BaseModel):
    active_heads:      int
    active_subheads:   int
    active_configures: int
    active_codes:      int
    monthly_granted:   Decimal
    monthly_released:  Decimal
    monthly_consumed:  Decimal
    monthly_pending:   Decimal
    monthly_forfeit:   Decimal
    monthly_expiring:  Decimal
    monthly_limit:     Decimal
    monthly_pct:       float
