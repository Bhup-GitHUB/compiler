from lexer import Lexer
from netlist import emit_verilog
from parser import Parser
from synthesizer import Synthesizer


def _synthesize(source: str, strict: bool = False):
    tokens = Lexer(source, "s.v").tokenize()
    module = Parser(tokens).parse()
    return Synthesizer(strict=strict).synthesize(module)


def test_synthesize_assign_chain_to_gates() -> None:
    source = (
        "module simple_logic(input a, b, output y);"
        "wire temp;"
        "assign temp = a & b;"
        "assign y = temp | ~a;"
        "endmodule"
    )
    netlist = _synthesize(source)
    assert [gate.gate_type for gate in netlist.gates] == ["and", "not", "or"]
    assert [gate.name for gate in netlist.gates] == ["gate_1", "gate_2", "gate_3"]
    assert netlist.gates[0].connections == ["temp", "a", "b"]
    assert netlist.gates[1].connections[0] == "_t1"
    assert netlist.gates[2].connections == ["y", "temp", "_t1"]
    assert "_t1" in netlist.wires


def test_gate_instances_are_preserved() -> None:
    source = (
        "module m(input a, b, output y);"
        "and g1(y, a, b);"
        "endmodule"
    )
    netlist = _synthesize(source)
    assert len(netlist.gates) == 1
    assert netlist.gates[0].name == "g1"
    assert netlist.gates[0].gate_type == "and"


def test_emit_verilog_output() -> None:
    source = (
        "module m(input a, b, output y);"
        "assign y = a & b;"
        "endmodule"
    )
    netlist = _synthesize(source)
    text = emit_verilog(netlist)
    assert "module m_netlist(a, b, y);" in text
    assert "and gate_1(y, a, b);" in text
    assert text.endswith("endmodule\n")
