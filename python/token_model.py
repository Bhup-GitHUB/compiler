from dataclasses import dataclass

from token_types import TokenType


@dataclass(frozen=True)
class Token:
    type: TokenType
    value: str
    line: int
    column: int
    file_name: str
