from __future__ import annotations

from ast_nodes import (
    AssignStmt,
    BinaryExpr,
    Expr,
    GateInstance,
    IdentifierExpr,
    ModuleNode,
    NumberExpr,
    PortDecl,
    UnaryExpr,
    WireDecl,
)
from errors import ParserError
from token_model import Token
from token_types import TokenType


GATE_TOKENS = {
    TokenType.KW_AND,
    TokenType.KW_OR,
    TokenType.KW_NOT,
    TokenType.KW_XOR,
    TokenType.KW_NAND,
    TokenType.KW_NOR,
}


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.index = 0

    def parse(self) -> ModuleNode:
        self._expect(TokenType.MODULE)
        name = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.LPAREN)
        ports = self._parse_ports()
        self._expect(TokenType.RPAREN)
        self._expect(TokenType.SEMICOLON)

        wires: list[WireDecl] = []
        assigns: list[AssignStmt] = []
        gates: list[GateInstance] = []

        while self._current().type != TokenType.ENDMODULE:
            token_type = self._current().type
            if token_type == TokenType.WIRE:
                wires.append(self._parse_wire_decl())
                continue
            if token_type == TokenType.ASSIGN:
                assigns.append(self._parse_assign())
                continue
            if token_type in GATE_TOKENS:
                gates.append(self._parse_gate_instance())
                continue
            self._error(f"unexpected token {self._current().type.name}")

        self._expect(TokenType.ENDMODULE)
        self._expect(TokenType.EOF)
        return ModuleNode(name=name, ports=ports, wires=wires, assigns=assigns, gates=gates)

    def _parse_ports(self) -> list[PortDecl]:
        ports: list[PortDecl] = []
        if self._current().type == TokenType.RPAREN:
            return ports

        while True:
            direction = self._parse_direction()
            names = self._parse_identifier_group()
            ports.append(PortDecl(direction=direction, names=names))
            if self._current().type == TokenType.COMMA and self._peek().type in {
                TokenType.INPUT,
                TokenType.OUTPUT,
            }:
                self._advance()
                continue
            break
        return ports

    def _parse_direction(self) -> str:
        token = self._current()
        if token.type == TokenType.INPUT:
            self._advance()
            return "input"
        if token.type == TokenType.OUTPUT:
            self._advance()
            return "output"
        self._error("expected input or output")

    def _parse_identifier_group(self) -> list[str]:
        names = [self._expect(TokenType.IDENTIFIER).value]
        while self._current().type == TokenType.COMMA and self._peek().type == TokenType.IDENTIFIER:
            self._advance()
            names.append(self._expect(TokenType.IDENTIFIER).value)
        return names

    def _parse_wire_decl(self) -> WireDecl:
        self._expect(TokenType.WIRE)
        names = self._parse_identifier_group()
        self._expect(TokenType.SEMICOLON)
        return WireDecl(names=names)

    def _parse_assign(self) -> AssignStmt:
        self._expect(TokenType.ASSIGN)
        target = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.EQUALS)
        expr = self._parse_logical_or()
        self._expect(TokenType.SEMICOLON)
        return AssignStmt(target=target, expr=expr)

    def _parse_gate_instance(self) -> GateInstance:
        gate_type = self._expect(*tuple(GATE_TOKENS)).value
        name = self._expect(TokenType.IDENTIFIER).value
        self._expect(TokenType.LPAREN)
        connections = [self._parse_connection()]
        while self._current().type == TokenType.COMMA:
            self._advance()
            connections.append(self._parse_connection())
        self._expect(TokenType.RPAREN)
        self._expect(TokenType.SEMICOLON)
        return GateInstance(gate_type=gate_type, name=name, connections=connections)

    def _parse_connection(self) -> str:
        token = self._current()
        if token.type not in {TokenType.IDENTIFIER, TokenType.NUMBER}:
            self._error("expected identifier or number in connection list")
        self._advance()
        return token.value

    def _parse_logical_or(self) -> Expr:
        expr = self._parse_logical_and()
        while self._current().type == TokenType.LOGICAL_OR:
            op = self._advance().value
            right = self._parse_logical_and()
            expr = BinaryExpr(op=op, left=expr, right=right)
        return expr

    def _parse_logical_and(self) -> Expr:
        expr = self._parse_bit_or()
        while self._current().type == TokenType.LOGICAL_AND:
            op = self._advance().value
            right = self._parse_bit_or()
            expr = BinaryExpr(op=op, left=expr, right=right)
        return expr

    def _parse_bit_or(self) -> Expr:
        expr = self._parse_bit_xor()
        while self._current().type == TokenType.BIT_OR:
            op = self._advance().value
            right = self._parse_bit_xor()
            expr = BinaryExpr(op=op, left=expr, right=right)
        return expr

    def _parse_bit_xor(self) -> Expr:
        expr = self._parse_bit_and()
        while self._current().type == TokenType.BIT_XOR:
            op = self._advance().value
            right = self._parse_bit_and()
            expr = BinaryExpr(op=op, left=expr, right=right)
        return expr

    def _parse_bit_and(self) -> Expr:
        expr = self._parse_unary()
        while self._current().type == TokenType.BIT_AND:
            op = self._advance().value
            right = self._parse_unary()
            expr = BinaryExpr(op=op, left=expr, right=right)
        return expr

    def _parse_unary(self) -> Expr:
        token = self._current()
        if token.type in {TokenType.BIT_NOT, TokenType.KW_NOT}:
            op = self._advance().value
            operand = self._parse_unary()
            return UnaryExpr(op=op, operand=operand)
        return self._parse_primary()

    def _parse_primary(self) -> Expr:
        token = self._current()
        if token.type == TokenType.IDENTIFIER:
            self._advance()
            return IdentifierExpr(name=token.value)
        if token.type == TokenType.NUMBER:
            self._advance()
            return NumberExpr(value=token.value)
        if token.type == TokenType.LPAREN:
            self._advance()
            expr = self._parse_logical_or()
            self._expect(TokenType.RPAREN)
            return expr
        self._error("expected expression")

    def _current(self) -> Token:
        return self.tokens[self.index]

    def _peek(self) -> Token:
        if self.index + 1 >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[self.index + 1]

    def _advance(self) -> Token:
        token = self._current()
        if self.index < len(self.tokens) - 1:
            self.index += 1
        return token

    def _expect(self, *expected: TokenType) -> Token:
        token = self._current()
        if token.type not in expected:
            wanted = ", ".join(t.name for t in expected)
            self._error(f"expected one of [{wanted}] got {token.type.name}")
        self._advance()
        return token

    def _error(self, message: str) -> None:
        token = self._current()
        raise ParserError(message, token.file_name, token.line, token.column)
