export type NetlistGate = {
  gateType: string;
  name: string;
  connections: string[];
};

export type NetlistAssign = {
  target: string;
  source: string;
};

export type NetlistModule = {
  name: string;
  ports: string[];
  inputs: string[];
  outputs: string[];
  wires: string[];
  gates: NetlistGate[];
  assigns: NetlistAssign[];
};

export function emitVerilog(netlist: NetlistModule): string {
  const lines: string[] = [];

  lines.push(`module ${netlist.name}(${netlist.ports.join(", ")});`);

  if (netlist.inputs.length > 0) {
    lines.push(`  input ${netlist.inputs.join(", ")};`);
  }

  if (netlist.outputs.length > 0) {
    lines.push(`  output ${netlist.outputs.join(", ")};`);
  }

  if (netlist.wires.length > 0) {
    lines.push(`  wire ${netlist.wires.join(", ")};`);
  }

  for (const gate of netlist.gates) {
    lines.push(`  ${gate.gateType} ${gate.name}(${gate.connections.join(", ")});`);
  }

  for (const assign of netlist.assigns) {
    lines.push(`  assign ${assign.target} = ${assign.source};`);
  }

  lines.push("endmodule");

  return `${lines.join("\n")}\n`;
}
