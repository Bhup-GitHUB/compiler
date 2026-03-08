import type {
  AssignStmt,
  BinaryExpr,
  Expr,
  GateInstance,
  IdentifierExpr,
  ModuleNode,
  NumberExpr,
  PortDecl,
  PortDirection,
  UnaryExpr,
  WireDecl,
} from "./ast";
import { createParserError, formatCompilerError } from "./errors";
import type { Token } from "./token";
import { TokenType } from "./token-types";

type CreateParserOptions = {
  debug?: boolean;
};

type Parser = {
  tokens: Token[];
  index: number;
  debug: boolean;
  parse: () => ModuleNode;
};

const GATE_TOKEN_TYPES = new Set<Token["type"]>([
  TokenType.KW_AND,
  TokenType.KW_OR,
  TokenType.KW_NOT,
  TokenType.KW_XOR,
  TokenType.KW_NAND,
  TokenType.KW_NOR,
]);

export function createParser(
  tokens: Token[],
  options: CreateParserOptions = {},
): Parser {
  const parser: Parser = {
    tokens,
    index: 0,
    debug: options.debug === true,
    parse: () => parseModule(parser),
  };

  return parser;
}

function parseModule(parser: Parser): ModuleNode {
  expect(parser, TokenType.MODULE);
  const name = expect(parser, TokenType.IDENTIFIER).value;
  expect(parser, TokenType.LPAREN);
  const ports = parsePorts(parser);
  expect(parser, TokenType.RPAREN);
  expect(parser, TokenType.SEMICOLON);

  const wires: WireDecl[] = [];
  const assigns: AssignStmt[] = [];
  const gates: GateInstance[] = [];

  while (current(parser).type !== TokenType.ENDMODULE) {
    logDebug(parser, "parsing token", current(parser).type);

    if (current(parser).type === TokenType.WIRE) {
      wires.push(parseWireDecl(parser));
      continue;
    }

    if (current(parser).type === TokenType.ASSIGN) {
      assigns.push(parseAssign(parser));
      continue;
    }

    if (GATE_TOKEN_TYPES.has(current(parser).type)) {
      gates.push(parseGateInstance(parser));
      continue;
    }

    raiseParserError(parser, `unexpected token ${current(parser).type}`);
  }

  expect(parser, TokenType.ENDMODULE);
  expect(parser, TokenType.EOF);

  return {
    name,
    ports,
    wires,
    assigns,
    gates,
  };
}

function parsePorts(parser: Parser): PortDecl[] {
  const ports: PortDecl[] = [];

  if (current(parser).type === TokenType.RPAREN) {
    return ports;
  }

  while (true) {
    const direction = parseDirection(parser);
    const names = parseIdentifierGroup(parser);

    ports.push({
      direction,
      names,
    });

    if (
      current(parser).type === TokenType.COMMA &&
      (peek(parser).type === TokenType.INPUT || peek(parser).type === TokenType.OUTPUT)
    ) {
      advance(parser);
      continue;
    }

    break;
  }

  return ports;
}

function parseDirection(parser: Parser): PortDirection {
  if (current(parser).type === TokenType.INPUT) {
    advance(parser);
    return "input";
  }

  if (current(parser).type === TokenType.OUTPUT) {
    advance(parser);
    return "output";
  }

  raiseParserError(parser, "expected input or output");
}

function parseIdentifierGroup(parser: Parser): string[] {
  const names = [expect(parser, TokenType.IDENTIFIER).value];

  while (
    current(parser).type === TokenType.COMMA &&
    peek(parser).type === TokenType.IDENTIFIER
  ) {
    advance(parser);
    names.push(expect(parser, TokenType.IDENTIFIER).value);
  }

  return names;
}

function parseWireDecl(parser: Parser): WireDecl {
  expect(parser, TokenType.WIRE);
  const names = parseIdentifierGroup(parser);
  expect(parser, TokenType.SEMICOLON);

  return {
    names,
  };
}

function parseAssign(parser: Parser): AssignStmt {
  expect(parser, TokenType.ASSIGN);
  const target = expect(parser, TokenType.IDENTIFIER).value;
  expect(parser, TokenType.EQUALS);
  const expr = parseLogicalOr(parser);
  expect(parser, TokenType.SEMICOLON);

  return {
    target,
    expr,
  };
}

function parseGateInstance(parser: Parser): GateInstance {
  const gateType = expect(parser, ...Array.from(GATE_TOKEN_TYPES)).value;
  const name = expect(parser, TokenType.IDENTIFIER).value;
  expect(parser, TokenType.LPAREN);

  const connections = [parseConnection(parser)];

  while (current(parser).type === TokenType.COMMA) {
    advance(parser);
    connections.push(parseConnection(parser));
  }

  expect(parser, TokenType.RPAREN);
  expect(parser, TokenType.SEMICOLON);

  return {
    gateType,
    name,
    connections,
  };
}

function parseConnection(parser: Parser): string {
  if (
    current(parser).type !== TokenType.IDENTIFIER &&
    current(parser).type !== TokenType.NUMBER
  ) {
    raiseParserError(parser, "expected identifier or number in connection list");
  }

  return advance(parser).value;
}

function parseLogicalOr(parser: Parser): Expr {
  let expr = parseLogicalAnd(parser);

  while (current(parser).type === TokenType.LOGICAL_OR) {
    const op = advance(parser).value;
    const right = parseLogicalAnd(parser);
    expr = createBinaryExpr(op, expr, right);
  }

  return expr;
}

function parseLogicalAnd(parser: Parser): Expr {
  let expr = parseBitOr(parser);

  while (current(parser).type === TokenType.LOGICAL_AND) {
    const op = advance(parser).value;
    const right = parseBitOr(parser);
    expr = createBinaryExpr(op, expr, right);
  }

  return expr;
}

function parseBitOr(parser: Parser): Expr {
  let expr = parseBitXor(parser);

  while (current(parser).type === TokenType.BIT_OR) {
    const op = advance(parser).value;
    const right = parseBitXor(parser);
    expr = createBinaryExpr(op, expr, right);
  }

  return expr;
}

function parseBitXor(parser: Parser): Expr {
  let expr = parseBitAnd(parser);

  while (current(parser).type === TokenType.BIT_XOR) {
    const op = advance(parser).value;
    const right = parseBitAnd(parser);
    expr = createBinaryExpr(op, expr, right);
  }

  return expr;
}

function parseBitAnd(parser: Parser): Expr {
  let expr = parseUnary(parser);

  while (current(parser).type === TokenType.BIT_AND) {
    const op = advance(parser).value;
    const right = parseUnary(parser);
    expr = createBinaryExpr(op, expr, right);
  }

  return expr;
}

function parseUnary(parser: Parser): Expr {
  if (
    current(parser).type === TokenType.BIT_NOT ||
    current(parser).type === TokenType.KW_NOT
  ) {
    const op = advance(parser).value;
    const operand = parseUnary(parser);
    return createUnaryExpr(op, operand);
  }

  return parsePrimary(parser);
}

function parsePrimary(parser: Parser): Expr {
  if (current(parser).type === TokenType.IDENTIFIER) {
    return createIdentifierExpr(advance(parser).value);
  }

  if (current(parser).type === TokenType.NUMBER) {
    return createNumberExpr(advance(parser).value);
  }

  if (current(parser).type === TokenType.LPAREN) {
    advance(parser);
    const expr = parseLogicalOr(parser);
    expect(parser, TokenType.RPAREN);
    return expr;
  }

  raiseParserError(parser, "expected expression");
}

function current(parser: Parser): Token {
  return parser.tokens[parser.index];
}

function peek(parser: Parser): Token {
  if (parser.index + 1 >= parser.tokens.length) {
    return parser.tokens[parser.tokens.length - 1];
  }

  return parser.tokens[parser.index + 1];
}

function advance(parser: Parser): Token {
  const token = current(parser);

  if (parser.index < parser.tokens.length - 1) {
    parser.index += 1;
  }

  return token;
}

function expect(parser: Parser, ...expected: Token["type"][]): Token {
  const token = current(parser);

  if (!expected.includes(token.type)) {
    raiseParserError(
      parser,
      `expected one of [${expected.join(", ")}] got ${token.type}`,
    );
  }

  advance(parser);
  return token;
}

function raiseParserError(parser: Parser, message: string): never {
  const token = current(parser);
  const error = createParserError(message, token.fileName, token.line, token.column);
  throw new Error(formatCompilerError(error));
}

function logDebug(parser: Parser, label: string, value: unknown): void {
  if (!parser.debug) {
    return;
  }

  console.log(label, value);
}

function createIdentifierExpr(name: string): IdentifierExpr {
  return {
    kind: "IdentifierExpr",
    name,
  };
}

function createNumberExpr(value: string): NumberExpr {
  return {
    kind: "NumberExpr",
    value,
  };
}

function createUnaryExpr(op: string, operand: Expr): UnaryExpr {
  return {
    kind: "UnaryExpr",
    op,
    operand,
  };
}

function createBinaryExpr(op: string, left: Expr, right: Expr): BinaryExpr {
  return {
    kind: "BinaryExpr",
    op,
    left,
    right,
  };
}
