from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator, model_validator

from shared.models.events import REGISTERED_EVENTS

MAX_FILTERS = 10
MAX_TIME_WINDOW_DAYS = 365

PropertyOp = Literal["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "starts_with", "exists"]
TraitOp = Literal["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "starts_with", "exists"]


class FrequencyClause(BaseModel):
    op: Literal["eq", "neq", "gt", "gte", "lt", "lte"]
    count: int = Field(ge=0)


class TimeWindow(BaseModel):
    last_days: int = Field(ge=1, le=MAX_TIME_WINDOW_DAYS)


class PropertyConstraint(BaseModel):
    op: PropertyOp
    value: Any = None

    @model_validator(mode="after")
    def value_required_unless_exists(self) -> "PropertyConstraint":
        if self.op != "exists" and self.value is None:
            raise ValueError(f"value is required for op '{self.op}'")
        return self


class EventFilter(BaseModel):
    type: Literal["event"]
    event_name: str
    where: dict[str, PropertyConstraint] = Field(default_factory=dict)
    frequency: FrequencyClause
    time_window: TimeWindow

    @field_validator("event_name")
    @classmethod
    def event_name_known(cls, v: str) -> str:
        if v not in REGISTERED_EVENTS:
            raise ValueError(f"unknown event_name '{v}' — not in REGISTERED_EVENTS")
        return v


class TraitFilter(BaseModel):
    type: Literal["trait"]
    trait: str
    op: TraitOp
    value: Any = None

    @model_validator(mode="after")
    def value_required_unless_exists(self) -> "TraitFilter":
        if self.op != "exists" and self.value is None:
            raise ValueError(f"value is required for op '{self.op}'")
        return self


class DidNotDoFilter(BaseModel):
    type: Literal["did_not_do"]
    event_name: str
    time_window: TimeWindow

    @field_validator("event_name")
    @classmethod
    def event_name_known(cls, v: str) -> str:
        if v not in REGISTERED_EVENTS:
            raise ValueError(f"unknown event_name '{v}' — not in REGISTERED_EVENTS")
        return v


class InSegmentFilter(BaseModel):
    type: Literal["in_segment"]
    segment_id: str


AnyFilter = Annotated[
    Union[EventFilter, TraitFilter, DidNotDoFilter, InSegmentFilter],
    Field(discriminator="type"),
]


class SegmentRule(BaseModel):
    version: Literal[1]
    match: Literal["all", "any"]
    filters: list[AnyFilter] = Field(min_length=1, max_length=MAX_FILTERS)
