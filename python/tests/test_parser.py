from ast_nodes import BinaryExpr, ModuleNode, UnaryExpr
from lexer import Lexer
from parser import Parser


def _parse(source: str) -> ModuleNode:
    tokens = Lexer(source, "p.v").tokenize()
    return Parser(tokens).parse()


def test_parse_module_structure_with_wires_and_assigns() -> None:
    source = (
        "module simple_logic(input a, b, output y);\n"
        "wire temp;\n"
        "assign temp = a & b;\n"
        "assign y = temp | ~a;\n"
        "endmodule"
    )
    module = _parse(source)
    assert module.name == "simple_logic"
    assert [(port.direction, port.names) for port in module.ports] == [
        ("input", ["a", "b"]),
        ("output", ["y"]),
    ]
    assert [wire.names for wire in module.wires] == [["temp"]]
    assert len(module.assigns) == 2


def test_parse_expression_precedence() -> None:
    source = (
        "module m(input a, b, c, d, output y);"
        "assign y = a | b ^ c & ~d;"
        "endmodule"
    )
    module = _parse(source)
    expr = module.assigns[0].expr
    assert isinstance(expr, BinaryExpr)
    assert expr.op == "|"
    assert isinstance(expr.right, BinaryExpr)
    assert expr.right.op == "^"
    assert isinstance(expr.right.right, BinaryExpr)
    assert expr.right.right.op == "&"
    assert isinstance(expr.right.right.right, UnaryExpr)


def test_parse_gate_instantiation() -> None:
    source = (
        "module m(input a, b, output y);"
        "and gate1(y, a, b);"
        "endmodule"
    )
    module = _parse(source)
    assert len(module.gates) == 1
    gate = module.gates[0]
    assert gate.gate_type == "and"
    assert gate.name == "gate1"
    assert gate.connections == ["y", "a", "b"]
