"""Wire models.

The event models are where I3 is enforced structurally: `extra="forbid"` means
a client that tries to send prompt text gets a 422 rather than having the field
silently ignored. A field that is ignored today is a field someone stores
tomorrow.
"""
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EnrollRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str


class ToolPolicy(BaseModel):
    llm_id: str
    host: str
    display_name: str
    status: Literal["approved", "blocked"]


class CategoryPolicy(BaseModel):
    key: str
    label: str
    enabled: bool


class PolicyBody(BaseModel):
    org_id: str
    org_name: str
    version: int
    tools: list[ToolPolicy]
    categories: list[CategoryPolicy]


class EnrollResponse(BaseModel):
    org_id: str
    org_name: str
    pseudo_id: str
    department: str
    policy: PolicyBody


class AccessRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pseudo_id: str
    llm_id: str
    reason: str = Field(max_length=500)


class UsageEvent(BaseModel):
    """One governance event.

    There is no field for prompt text, and `extra="forbid"` means one cannot
    be smuggled in. `finding_hash` is a salted hash reference (I3).
    """
    model_config = ConfigDict(extra="forbid")

    host: str
    type: Literal["visit_unapproved", "warn_shown", "request_sent", "ethics_block", "pii_block"]
    category: Optional[str] = None
    finding_hash: Optional[str] = None
    ts: str

    @field_validator("finding_hash")
    @classmethod
    def _hash_is_hex64(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if len(v) != 64 or any(c not in "0123456789abcdef" for c in v.lower()):
            raise ValueError("finding_hash must be a 64-character hex digest")
        return v.lower()


class EventBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pseudo_id: str
    events: list[UsageEvent] = Field(max_length=100)


class AdminLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    org_name: str
    password: str
