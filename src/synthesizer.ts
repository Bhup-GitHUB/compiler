import type {
  BinaryExpr,
  CompilationUnit,
  Expr,
  IdentifierExpr,
  ModuleNode,
  NumberExpr,
  SourceSpan,
  UnaryExpr,
} from "./ast";
import { logDebug } from "./debug";
import { createSynthesisError, formatCompilerError } from "./errors";
import type { NetlistAssign, NetlistGate, NetlistModule } from "./netlist";

type SynthesizeOptions = {
  strict?: boolean;
  debug?: boolean;
};

type SynthesisState = {
  moduleNode: ModuleNode;
  strict: boolean;
  debug: boolean;
  declaredSignals: Set<string>;
  generatedWires: string[];
  usedGateNames: Set<string>;
  gates: NetlistGate[];
  assigns: NetlistAssign[];
  tempCounter: number;
  gateCounter: number;
};

const BINARY_GATE_TYPE: Record<string, string> = {
  "&": "and",
  "&&": "and",
  "|": "or",
  "||": "or",
  "^": "xor",
};

export function synthesizeCompilationUnit(
  unit: CompilationUnit,
  options: SynthesizeOptions = {},
): NetlistModule[] {
  const seenModules = new Map<string, ModuleNode>();
  const netlists: NetlistModule[] = [];

  for (const moduleNode of unit.modules) {
    const existing = seenModules.get(moduleNode.name);

    if (existing) {
      const notes = [
        `previous definition: ${existing.fileName}:${existing.nameSpan.start.line}:${existing.nameSpan.start.column}`,
      ];
      throw new Error(
        formatCompilerError(
          createSynthesisError(
            `duplicate module definition '${moduleNode.name}'`,
            moduleNode.fileName,
            moduleNode.nameSpan.start.line,
            moduleNode.nameSpan.start.column,
            notes,
          ),
        ),
      );
    }

    seenModules.set(moduleNode.name, moduleNode);
    netlists.push(synthesize(moduleNode, options));
  }

  return netlists;
}

export function synthesize(
  moduleNode: ModuleNode,
  options: SynthesizeOptions = {},
): NetlistModule {
  const strict = options.strict === true;
  const debug = options.debug === true;
  const inputs = dedupe(
    moduleNode.ports
      .filter((port) => port.direction === "input")
      .flatMap((port) => port.names),
  );
  const outputs = dedupe(
    moduleNode.ports
      .filter((port) => port.direction === "output")
      .flatMap((port) => port.names),
  );
  const declaredWires = dedupe(moduleNode.wires.flatMap((wire) => wire.names));

  const state: SynthesisState = {
    moduleNode,
    strict,
    debug,
    declaredSignals: new Set([...inputs, ...outputs, ...declaredWires]),
    generatedWires: [],
    usedGateNames: new Set(),
    gates: [],
    assigns: [],
    tempCounter: 0,
    gateCounter: 0,
  };

  for (const gate of moduleNode.gates) {
    if (state.usedGateNames.has(gate.name)) {
      raiseSynthesisError(state, gate.nameSpan, `duplicate gate name '${gate.name}'`);
    }

    state.usedGateNames.add(gate.name);

    for (const connection of gate.connectionRefs) {
      validateSignal(state, connection.value, connection.span);
    }

    state.gates.push({
      gateType: gate.gateType,
      name: gate.name,
      connections: [...gate.connections],
    });
  }

  for (const assign of moduleNode.assigns) {
    if (!state.declaredSignals.has(assign.target)) {
      if (state.strict) {
        raiseSynthesisError(state, assign.targetSpan, `undeclared target '${assign.target}'`);
      }

      state.declaredSignals.add(assign.target);
      declaredWires.push(assign.target);
      logDebug(state, "synth", "auto-target-wire", { target: assign.target });
    }

    const source = emitExpr(state, assign.expr, assign.target);

    if (source !== assign.target) {
      state.assigns.push({
        target: assign.target,
        source,
      });
    }
  }

  const ports = dedupe(moduleNode.ports.flatMap((port) => port.names));
  const wires = dedupe([...declaredWires, ...state.generatedWires]);

  return {
    name: `${moduleNode.name}_netlist`,
    ports,
    inputs,
    outputs,
    wires,
    gates: state.gates,
    assigns: state.assigns,
  };
}

function emitExpr(state: SynthesisState, expr: Expr, target: string | null): string {
  if (expr.kind === "IdentifierExpr") {
    return emitIdentifierExpr(state, expr);
  }

  if (expr.kind === "NumberExpr") {
    return emitNumberExpr(expr);
  }

  if (expr.kind === "UnaryExpr") {
    return emitUnaryExpr(state, expr, target);
  }

  return emitBinaryExpr(state, expr, target);
}

function emitIdentifierExpr(state: SynthesisState, expr: IdentifierExpr): string {
  validateSignal(state, expr.name, expr.span);
  return expr.name;
}

function emitNumberExpr(expr: NumberExpr): string {
  return expr.value;
}

function emitUnaryExpr(state: SynthesisState, expr: UnaryExpr, target: string | null): string {
  const operand = emitExpr(state, expr.operand, null);
  const out = resolveOut(state, target);
  const gateName = nextGateName(state);

  state.gates.push({
    gateType: "not",
    name: gateName,
    connections: [out, operand],
  });

  logDebug(state, "synth", "gate", {
    gateName,
    gateType: "not",
    out,
    operand,
  });

  return out;
}

function emitBinaryExpr(state: SynthesisState, expr: BinaryExpr, target: string | null): string {
  const gateType = BINARY_GATE_TYPE[expr.op];

  if (!gateType) {
    raiseSynthesisError(state, expr.span, `unsupported operator '${expr.op}'`);
  }

  const left = emitExpr(state, expr.left, null);
  const right = emitExpr(state, expr.right, null);
  const out = resolveOut(state, target);
  const gateName = nextGateName(state);

  state.gates.push({
    gateType,
    name: gateName,
    connections: [out, left, right],
  });

  logDebug(state, "synth", "gate", {
    gateName,
    gateType,
    out,
    left,
    right,
  });

  return out;
}

function resolveOut(state: SynthesisState, target: string | null): string {
  if (target) {
    return target;
  }

  const name = nextTempWire(state);
  state.generatedWires.push(name);
  state.declaredSignals.add(name);
  logDebug(state, "synth", "temp-wire", { name });
  return name;
}

function nextTempWire(state: SynthesisState): string {
  while (true) {
    state.tempCounter += 1;
    const name = `_t${state.tempCounter}`;

    if (!state.declaredSignals.has(name)) {
      return name;
    }
  }
}

function nextGateName(state: SynthesisState): string {
  while (true) {
    state.gateCounter += 1;
    const name = `gate_${state.gateCounter}`;

    if (!state.usedGateNames.has(name)) {
      state.usedGateNames.add(name);
      return name;
    }
  }
}

function validateSignal(state: SynthesisState, signal: string, span: SourceSpan): void {
  if (state.declaredSignals.has(signal) || isNumberLiteral(signal)) {
    return;
  }

  if (state.strict) {
    raiseSynthesisError(state, span, `undeclared signal '${signal}'`);
  }

  state.declaredSignals.add(signal);
  state.generatedWires.push(signal);
  logDebug(state, "synth", "auto-source-wire", { signal });
}

function isNumberLiteral(value: string): boolean {
  return /^\d+$/.test(value) || /^\d+'[bBdDhH][0-9a-fA-FxXzZ_]+$/.test(value);
}

function raiseSynthesisError(state: SynthesisState, span: SourceSpan, message: string): never {
  const error = createSynthesisError(
    message,
    span.start.fileName,
    span.start.line,
    span.start.column,
    [`module: ${state.moduleNode.name}`],
  );
  throw new Error(formatCompilerError(error));
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}
