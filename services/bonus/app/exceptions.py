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
        super().__init__(f"Bonus head '{name}' already exists")


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
        super().__init__(f"Bonus subhead '{name}' already exists")


class BonusSubheadNotFoundError(BonusServiceError):
    """Raised when a requested bonus_subhead row does not exist."""

    def __init__(self, subhead_id: int) -> None:
        self.subhead_id = subhead_id
        super().__init__(f"Bonus subhead {subhead_id} not found")


class BonusConfigureValidationError(BonusServiceError):
    """Raised when input data fails business-rule validation for a bonus_configure."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class BonusConfigureDuplicateError(BonusServiceError):
    """Raised when (subhead_id, name) already exists in bonus_configure."""

    def __init__(self, subhead_id: int, name: str) -> None:
        self.subhead_id = subhead_id
        self.name = name
        super().__init__(f"Bonus configure '{name}' already exists for subhead {subhead_id}")


class BonusConfigureNotFoundError(BonusServiceError):
    """Raised when a requested bonus_configure row does not exist."""

    def __init__(self, configure_id: int) -> None:
        self.configure_id = configure_id
        super().__init__(f"Bonus configure {configure_id} not found")


class BonusReleaseTriggerValidationError(BonusServiceError):
    """Raised when input data fails business-rule validation for a bonus_release_trigger."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class BonusReleaseTriggerDuplicateError(BonusServiceError):
    """Raised when (configure_id, trigger_type) already exists in bonus_release_trigger."""

    def __init__(self, configure_id: int, trigger_type: str) -> None:
        self.configure_id = configure_id
        self.trigger_type = trigger_type
        super().__init__(
            f"Release trigger '{trigger_type}' already exists for configure {configure_id}"
        )


class BonusReleaseTriggerNotFoundError(BonusServiceError):
    """Raised when a requested bonus_release_trigger row does not exist."""

    def __init__(self, trigger_id: int) -> None:
        self.trigger_id = trigger_id
        super().__init__(f"Bonus release trigger {trigger_id} not found")


class BonusCodeNotFoundError(BonusServiceError):
    """Raised when a promo code cannot be resolved to a bonus_configure."""

    def __init__(self, site_id: int, code: str) -> None:
        self.site_id = site_id
        self.code = code
        super().__init__(f"Bonus code '{code}' not found or inactive for site {site_id}")


class BonusEligibilityValidationError(BonusServiceError):
    """Raised when input data fails business-rule validation for a bonus_eligibility."""

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class BonusEligibilityNotFoundError(BonusServiceError):
    """Raised when a requested bonus_eligibility row does not exist."""

    def __init__(self, eligibility_id: int) -> None:
        self.eligibility_id = eligibility_id
        super().__init__(f"Bonus eligibility {eligibility_id} not found")


class BonusEligibilityDuplicateError(BonusServiceError):
    """Raised when (configure_id, eligibility_key) already exists in bonus_eligibility."""

    def __init__(self, configure_id: int, eligibility_key: str) -> None:
        self.configure_id = configure_id
        self.eligibility_key = eligibility_key
        super().__init__(
            f"Eligibility key '{eligibility_key}' already exists for configure {configure_id}"
        )


class DatabaseError(BonusServiceError):
    """Raised when a database operation fails unexpectedly."""


class PAMUserBonusNotFoundError(BonusServiceError):
    """Raised when a user_bonus_grant or bonus_consumed row cannot be found."""

    def __init__(self, ref: int | str) -> None:
        self.ref = ref
        super().__init__(f"PAM user bonus record {ref!r} not found")


class PAMUserBonusConsumedError(BonusServiceError):
    """Raised when a consumption is duplicated or the chunk is not in RELEASE status."""

    def __init__(self, chunk_id: int, consume_ref: str) -> None:
        self.chunk_id = chunk_id
        self.consume_ref = consume_ref
        super().__init__(
            f"Cannot consume chunk {chunk_id} with ref '{consume_ref}': "
            "chunk not in RELEASE status or consumption already recorded"
        )


class PAMUserBonusAlreadyRevertedError(BonusServiceError):
    """Raised when attempting to revert a consumption that has already been reverted."""

    def __init__(self, consumed_id: int) -> None:
        self.consumed_id = consumed_id
        super().__init__(f"Bonus consumption {consumed_id} has already been reverted")
