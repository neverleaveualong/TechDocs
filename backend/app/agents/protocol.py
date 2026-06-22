from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AgentAction(str, Enum):
    ANALYZE = "analyze"
    SEARCH = "search"
    INGEST = "ingest"
    GENERATE = "generate"
    DONE = "done"


@dataclass
class AgentMessage:
    sender: str
    action: AgentAction
    payload: dict[str, Any] = field(default_factory=dict)
    reasoning: str = ""


@dataclass
class SupervisorDecision:
    next_action: AgentAction
    reasoning: str
    parameters: dict[str, Any] = field(default_factory=dict)
