from dataclasses import dataclass


@dataclass(frozen=True)
class NetlistGate:
    gate_type: str
    name: str
    connections: list[str]


@dataclass(frozen=True)
class NetlistAssign:
    target: str
    source: str


@dataclass(frozen=True)
class NetlistModule:
    name: str
    ports: list[str]
    inputs: list[str]
    outputs: list[str]
    wires: list[str]
    gates: list[NetlistGate]
    assigns: list[NetlistAssign]


def emit_verilog(netlist: NetlistModule) -> str:
    lines: list[str] = []
    ports = ", ".join(netlist.ports)
    lines.append(f"module {netlist.name}({ports});")
    if netlist.inputs:
        lines.append(f"  input {', '.join(netlist.inputs)};")
    if netlist.outputs:
        lines.append(f"  output {', '.join(netlist.outputs)};")
    if netlist.wires:
        lines.append(f"  wire {', '.join(netlist.wires)};")
    for gate in netlist.gates:
        lines.append(f"  {gate.gate_type} {gate.name}({', '.join(gate.connections)});")
    for assign in netlist.assigns:
        lines.append(f"  assign {assign.target} = {assign.source};")
    lines.append("endmodule")
    return "\n".join(lines) + "\n"
