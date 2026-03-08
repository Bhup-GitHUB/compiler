from dataclasses import dataclass
from typing import Union


@dataclass(frozen=True)
class PortDecl:
    direction: str
    names: list[str]


@dataclass(frozen=True)
class WireDecl:
    names: list[str]


@dataclass(frozen=True)
class IdentifierExpr:
    name: str


@dataclass(frozen=True)
class NumberExpr:
    value: str


@dataclass(frozen=True)
class UnaryExpr:
    op: str
    operand: "Expr"


@dataclass(frozen=True)
class BinaryExpr:
    op: str
    left: "Expr"
    right: "Expr"


Expr = Union[IdentifierExpr, NumberExpr, UnaryExpr, BinaryExpr]


@dataclass(frozen=True)
class AssignStmt:
    target: str
    expr: Expr


@dataclass(frozen=True)
class GateInstance:
    gate_type: str
    name: str
    connections: list[str]


@dataclass(frozen=True)
class ModuleNode:
    name: str
    ports: list[PortDecl]
    wires: list[WireDecl]
    assigns: list[AssignStmt]
    gates: list[GateInstance]
