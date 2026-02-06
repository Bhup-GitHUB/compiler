from __future__ import annotations

import re
from dataclasses import dataclass

from errors import LexerError
from token_model import Token
from token_types import TokenType


@dataclass(frozen=True)
class _Rule:
    pattern: re.Pattern
    token_type: TokenType | None


class Lexer:
    def __init__(self, source: str, file_name: str = "<memory>") -> None:
        self.source = source
        self.file_name = file_name
        self.position = 0
        self.line = 1
        self.column = 1
        self._rules = self._build_rules()

    def tokenize(self) -> list[Token]:
        tokens: list[Token] = []
        while self.position < len(self.source):
            token = self._next_token()
            if token is not None:
                tokens.append(token)
        tokens.append(Token(TokenType.EOF, "", self.line, self.column, self.file_name))
        return tokens

    def _next_token(self) -> Token | None:
        remaining = self.source[self.position :]
        for rule in self._rules:
            match = rule.pattern.match(remaining)
            if match is None:
                continue
            text = match.group(0)
            start_line = self.line
            start_column = self.column
            self._advance(text)
            if rule.token_type is None:
                return None
            return Token(rule.token_type, text, start_line, start_column, self.file_name)
        self._raise_error(f"invalid character '{self.source[self.position]}'", self.line, self.column)

    def _build_rules(self) -> list[_Rule]:
        return [
            _Rule(re.compile(r"[ \t\r\n]+"), None),
            _Rule(re.compile(r"//[^\n]*"), None),
            _Rule(re.compile(r"/\*[\s\S]*?\*/"), None),
            _Rule(re.compile(r"\bmodule\b"), TokenType.MODULE),
            _Rule(re.compile(r"\bendmodule\b"), TokenType.ENDMODULE),
            _Rule(re.compile(r"\binput\b"), TokenType.INPUT),
            _Rule(re.compile(r"\boutput\b"), TokenType.OUTPUT),
            _Rule(re.compile(r"\bwire\b"), TokenType.WIRE),
            _Rule(re.compile(r"\bassign\b"), TokenType.ASSIGN),
            _Rule(re.compile(r"\band\b"), TokenType.KW_AND),
            _Rule(re.compile(r"\bor\b"), TokenType.KW_OR),
            _Rule(re.compile(r"\bnot\b"), TokenType.KW_NOT),
            _Rule(re.compile(r"\bxor\b"), TokenType.KW_XOR),
            _Rule(re.compile(r"\bnand\b"), TokenType.KW_NAND),
            _Rule(re.compile(r"\bnor\b"), TokenType.KW_NOR),
            _Rule(re.compile(r"&&"), TokenType.LOGICAL_AND),
            _Rule(re.compile(r"\|\|"), TokenType.LOGICAL_OR),
            _Rule(re.compile(r"&"), TokenType.BIT_AND),
            _Rule(re.compile(r"\|"), TokenType.BIT_OR),
            _Rule(re.compile(r"~"), TokenType.BIT_NOT),
            _Rule(re.compile(r"\^"), TokenType.BIT_XOR),
            _Rule(re.compile(r"="), TokenType.EQUALS),
            _Rule(re.compile(r"\("), TokenType.LPAREN),
            _Rule(re.compile(r"\)"), TokenType.RPAREN),
            _Rule(re.compile(r";"), TokenType.SEMICOLON),
            _Rule(re.compile(r","), TokenType.COMMA),
            _Rule(re.compile(r"\d+"), TokenType.NUMBER),
            _Rule(re.compile(r"[A-Za-z_][A-Za-z0-9_]*"), TokenType.IDENTIFIER),
        ]

    def _advance(self, text: str) -> None:
        self.position += len(text)
        lines = text.split("\n")
        if len(lines) == 1:
            self.column += len(text)
            return
        self.line += len(lines) - 1
        self.column = len(lines[-1]) + 1

    def _raise_error(self, message: str, line: int, column: int) -> None:
        raise LexerError(message, self.file_name, line, column)
