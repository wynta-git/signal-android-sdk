class BonusServiceError(Exception):
    """Base for all bonus service errors."""


class BonusHeadValidationError(BonusServiceError):
    """Raised when input data fails business-rule validation."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class BonusHeadDuplicateError(BonusServiceError):
    """Raised when (site_id, name) already exists in bonus_head."""

    def __init__(self, site_id: int, name: str) -> None:
        self.site_id = site_id
        self.name = name
        super().__init__(f"Bonus head '{name}' already exists for site {site_id}")


class BonusHeadNotFoundError(BonusServiceError):
    """Raised when a requested bonus_head row does not exist."""

    def __init__(self, head_id: int) -> None:
        self.head_id = head_id
        super().__init__(f"Bonus head {head_id} not found")


class BonusSubheadValidationError(BonusServiceError):
    """Raised when input data fails business-rule validation for a bonus_subhead."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class BonusSubheadDuplicateError(BonusServiceError):
    """Raised when (head_id, name) already exists in bonus_subhead."""

    def __init__(self, head_id: int, name: str) -> None:
        self.head_id = head_id
        self.name = name
        super().__init__(f"Bonus subhead '{name}' already exists for head {head_id}")


class BonusSubheadNotFoundError(BonusServiceError):
    """Raised when a requested bonus_subhead row does not exist."""

    def __init__(self, subhead_id: int) -> None:
        self.subhead_id = subhead_id
        super().__init__(f"Bonus subhead {subhead_id} not found")


class DatabaseError(BonusServiceError):
    """Raised when a database operation fails unexpectedly."""
