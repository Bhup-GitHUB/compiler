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
    inputs: list[str]
    outputs: list[str]
    wires: list[str]
    gates: list[NetlistGate]
    assigns: list[NetlistAssign]


def emit_verilog(netlist: NetlistModule) -> str:
    raise NotImplementedError
