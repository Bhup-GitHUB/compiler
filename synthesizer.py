from __future__ import annotations

from ast_nodes import BinaryExpr, Expr, IdentifierExpr, ModuleNode, NumberExpr, UnaryExpr
from errors import SynthesisError
from netlist import NetlistAssign, NetlistGate, NetlistModule


_BINARY_TO_GATE = {
    "&": "and",
    "&&": "and",
    "|": "or",
    "||": "or",
    "^": "xor",
}


class Synthesizer:
    def __init__(self, strict: bool = False) -> None:
        self.strict = strict
        self._gate_counter = 0
        self._temp_counter = 0
        self._used_gate_names: set[str] = set()

    def synthesize(self, module: ModuleNode) -> NetlistModule:
        inputs = self._dedupe([name for port in module.ports if port.direction == "input" for name in port.names])
        outputs = self._dedupe([name for port in module.ports if port.direction == "output" for name in port.names])
        declared_wires = self._dedupe([name for wire in module.wires for name in wire.names])
        declared = set(inputs + outputs + declared_wires)

        gates: list[NetlistGate] = []
        assigns: list[NetlistAssign] = []
        generated_wires: list[str] = []

        for gate in module.gates:
            if gate.name in self._used_gate_names:
                self._error(module.name, f"duplicate gate name '{gate.name}'")
            self._used_gate_names.add(gate.name)
            for signal in gate.connections:
                self._validate_signal(module.name, signal, declared)
            gates.append(NetlistGate(gate.gate_type, gate.name, list(gate.connections)))

        for assign in module.assigns:
            if assign.target not in declared:
                if self.strict:
                    self._error(module.name, f"undeclared target '{assign.target}'")
                declared.add(assign.target)
                declared_wires.append(assign.target)
            source = self._emit_expr(
                module_name=module.name,
                expr=assign.expr,
                declared=declared,
                gates=gates,
                generated_wires=generated_wires,
                target=assign.target,
            )
            if source != assign.target:
                assigns.append(NetlistAssign(assign.target, source))

        wires = self._dedupe(declared_wires + generated_wires)
        ports = self._dedupe(inputs + outputs)
        return NetlistModule(
            name=f"{module.name}_netlist",
            ports=ports,
            inputs=inputs,
            outputs=outputs,
            wires=wires,
            gates=gates,
            assigns=assigns,
        )

    def _emit_expr(
        self,
        module_name: str,
        expr: Expr,
        declared: set[str],
        gates: list[NetlistGate],
        generated_wires: list[str],
        target: str | None,
    ) -> str:
        if isinstance(expr, IdentifierExpr):
            self._validate_signal(module_name, expr.name, declared)
            return expr.name

        if isinstance(expr, NumberExpr):
            return expr.value

        if isinstance(expr, UnaryExpr):
            operand = self._emit_expr(module_name, expr.operand, declared, gates, generated_wires, None)
            out = self._resolve_out(target, generated_wires, declared)
            gate_name = self._next_gate_name()
            gates.append(NetlistGate("not", gate_name, [out, operand]))
            return out

        if isinstance(expr, BinaryExpr):
            gate_type = _BINARY_TO_GATE.get(expr.op)
            if gate_type is None:
                self._error(module_name, f"unsupported operator '{expr.op}'")
            left = self._emit_expr(module_name, expr.left, declared, gates, generated_wires, None)
            right = self._emit_expr(module_name, expr.right, declared, gates, generated_wires, None)
            out = self._resolve_out(target, generated_wires, declared)
            gate_name = self._next_gate_name()
            gates.append(NetlistGate(gate_type, gate_name, [out, left, right]))
            return out

        self._error(module_name, "unsupported expression")

    def _resolve_out(self, target: str | None, generated_wires: list[str], declared: set[str]) -> str:
        if target is not None:
            return target
        name = self._next_temp_wire(declared)
        generated_wires.append(name)
        declared.add(name)
        return name

    def _next_gate_name(self) -> str:
        while True:
            self._gate_counter += 1
            name = f"gate_{self._gate_counter}"
            if name not in self._used_gate_names:
                self._used_gate_names.add(name)
                return name

    def _next_temp_wire(self, declared: set[str]) -> str:
        while True:
            self._temp_counter += 1
            name = f"_t{self._temp_counter}"
            if name not in declared:
                return name

    def _validate_signal(self, module_name: str, signal: str, declared: set[str]) -> None:
        if signal in declared:
            return
        if signal.isdigit() or "'" in signal:
            return
        if self.strict:
            self._error(module_name, f"undeclared signal '{signal}'")
        declared.add(signal)

    def _error(self, module_name: str, message: str) -> None:
        raise SynthesisError(message, module_name, 1, 1)

    def _dedupe(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            if value in seen:
                continue
            seen.add(value)
            result.append(value)
        return result
