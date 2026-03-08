export type PortDirection = "input" | "output";

export type PortDecl = {
  direction: PortDirection;
  names: string[];
};

export type WireDecl = {
  names: string[];
};

export type IdentifierExpr = {
  kind: "IdentifierExpr";
  name: string;
};

export type NumberExpr = {
  kind: "NumberExpr";
  value: string;
};

export type UnaryExpr = {
  kind: "UnaryExpr";
  op: string;
  operand: Expr;
};

export type BinaryExpr = {
  kind: "BinaryExpr";
  op: string;
  left: Expr;
  right: Expr;
};

export type Expr = IdentifierExpr | NumberExpr | UnaryExpr | BinaryExpr;

export type AssignStmt = {
  target: string;
  expr: Expr;
};

export type GateInstance = {
  gateType: string;
  name: string;
  connections: string[];
};

export type ModuleNode = {
  name: string;
  ports: PortDecl[];
  wires: WireDecl[];
  assigns: AssignStmt[];
  gates: GateInstance[];
};
