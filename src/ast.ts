export type SourceLocation = {
  fileName: string;
  line: number;
  column: number;
};

export type SourceSpan = {
  start: SourceLocation;
  end: SourceLocation;
};

export type PortDirection = "input" | "output";

export type PortDecl = {
  direction: PortDirection;
  names: string[];
  span: SourceSpan;
};

export type WireDecl = {
  names: string[];
  span: SourceSpan;
};

export type IdentifierExpr = {
  kind: "IdentifierExpr";
  name: string;
  span: SourceSpan;
};

export type NumberExpr = {
  kind: "NumberExpr";
  value: string;
  span: SourceSpan;
};

export type UnaryExpr = {
  kind: "UnaryExpr";
  op: string;
  operand: Expr;
  span: SourceSpan;
};

export type BinaryExpr = {
  kind: "BinaryExpr";
  op: string;
  left: Expr;
  right: Expr;
  span: SourceSpan;
};

export type Expr = IdentifierExpr | NumberExpr | UnaryExpr | BinaryExpr;

export type AssignStmt = {
  target: string;
  expr: Expr;
  span: SourceSpan;
  targetSpan: SourceSpan;
};

export type ConnectionRef = {
  value: string;
  span: SourceSpan;
};

export type GateInstance = {
  gateType: string;
  name: string;
  connections: string[];
  connectionRefs: ConnectionRef[];
  span: SourceSpan;
  nameSpan: SourceSpan;
};

export type ModuleNode = {
  name: string;
  ports: PortDecl[];
  wires: WireDecl[];
  assigns: AssignStmt[];
  gates: GateInstance[];
  span: SourceSpan;
  nameSpan: SourceSpan;
  fileName: string;
};

export type CompilationUnit = {
  modules: ModuleNode[];
};
