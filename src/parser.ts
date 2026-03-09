import type {
  AssignStmt,
  BinaryExpr,
  CompilationUnit,
  ConnectionRef,
  Expr,
  GateInstance,
  IdentifierExpr,
  ModuleNode,
  NumberExpr,
  PortDecl,
  PortDirection,
  SourceSpan,
  UnaryExpr,
  WireDecl,
} from "./ast";
import { logDebug } from "./debug";
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
  parseCompilationUnit: () => CompilationUnit;
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
    parse: () => parseSingleModule(parser),
    parseCompilationUnit: () => parseCompilationUnit(parser),
  };

  return parser;
}

function parseSingleModule(parser: Parser): ModuleNode {
  const unit = parseCompilationUnit(parser);

  if (unit.modules.length !== 1) {
    const extra = unit.modules[1];
    const error = createParserError(
      "expected EOF after first module",
      extra.fileName,
      extra.span.start.line,
      extra.span.start.column,
      [`found module '${extra.name}'`],
    );
    throw new Error(formatCompilerError(error));
  }

  return unit.modules[0];
}

function parseCompilationUnit(parser: Parser): CompilationUnit {
  const modules: ModuleNode[] = [];

  while (current(parser).type !== TokenType.EOF) {
    modules.push(parseModule(parser));
  }

  return {
    modules,
  };
}

function parseModule(parser: Parser): ModuleNode {
  const moduleToken = expect(parser, TokenType.MODULE);
  const nameToken = expect(parser, TokenType.IDENTIFIER);
  expect(parser, TokenType.LPAREN);
  const ports = parsePorts(parser);
  expect(parser, TokenType.RPAREN);
  expect(parser, TokenType.SEMICOLON);

  const wires: WireDecl[] = [];
  const assigns: AssignStmt[] = [];
  const gates: GateInstance[] = [];

  while (current(parser).type !== TokenType.ENDMODULE) {
    logDebug(parser, "parser", "body-token", {
      type: current(parser).type,
      value: current(parser).value,
    });

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

    raiseParserError(parser, `unexpected token ${describeToken(current(parser))}`);
  }

  const endmoduleToken = expect(parser, TokenType.ENDMODULE);

  return {
    name: nameToken.value,
    ports,
    wires,
    assigns,
    gates,
    span: mergeSpans(moduleToken.span, endmoduleToken.span),
    nameSpan: nameToken.span,
    fileName: nameToken.fileName,
  };
}

function parsePorts(parser: Parser): PortDecl[] {
  const ports: PortDecl[] = [];

  if (current(parser).type === TokenType.RPAREN) {
    return ports;
  }

  while (true) {
    const directionToken = current(parser);
    const direction = parseDirection(parser);
    const names = parseIdentifierGroup(parser);
    const lastName = previous(parser);

    ports.push({
      direction,
      names,
      span: mergeSpans(directionToken.span, lastName.span),
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

  raiseParserError(parser, `expected input or output, got ${describeToken(current(parser))}`);
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
  const wireToken = expect(parser, TokenType.WIRE);
  const names = parseIdentifierGroup(parser);
  const semicolonToken = expect(parser, TokenType.SEMICOLON);

  return {
    names,
    span: mergeSpans(wireToken.span, semicolonToken.span),
  };
}

function parseAssign(parser: Parser): AssignStmt {
  const assignToken = expect(parser, TokenType.ASSIGN);
  const targetToken = expect(parser, TokenType.IDENTIFIER);
  expect(parser, TokenType.EQUALS);
  const expr = parseLogicalOr(parser);
  const semicolonToken = expect(parser, TokenType.SEMICOLON);

  return {
    target: targetToken.value,
    expr,
    span: mergeSpans(assignToken.span, semicolonToken.span),
    targetSpan: targetToken.span,
  };
}

function parseGateInstance(parser: Parser): GateInstance {
  const gateTypeToken = expect(parser, ...Array.from(GATE_TOKEN_TYPES));
  const nameToken = expect(parser, TokenType.IDENTIFIER);
  expect(parser, TokenType.LPAREN);
  const connectionRefs = [parseConnection(parser)];

  while (current(parser).type === TokenType.COMMA) {
    advance(parser);
    connectionRefs.push(parseConnection(parser));
  }

  expect(parser, TokenType.RPAREN);
  const semicolonToken = expect(parser, TokenType.SEMICOLON);

  return {
    gateType: gateTypeToken.value,
    name: nameToken.value,
    connections: connectionRefs.map((ref) => ref.value),
    connectionRefs,
    span: mergeSpans(gateTypeToken.span, semicolonToken.span),
    nameSpan: nameToken.span,
  };
}

function parseConnection(parser: Parser): ConnectionRef {
  if (
    current(parser).type !== TokenType.IDENTIFIER &&
    current(parser).type !== TokenType.NUMBER
  ) {
    raiseParserError(
      parser,
      `expected identifier or number in connection list, got ${describeToken(current(parser))}`,
    );
  }

  const token = advance(parser);
  return {
    value: token.value,
    span: token.span,
  };
}

function parseLogicalOr(parser: Parser): Expr {
  let expr = parseLogicalAnd(parser);

  while (current(parser).type === TokenType.LOGICAL_OR) {
    const op = advance(parser);
    const right = parseLogicalAnd(parser);
    expr = createBinaryExpr(op.value, expr, right, mergeSpans(expr.span, right.span));
  }

  return expr;
}

function parseLogicalAnd(parser: Parser): Expr {
  let expr = parseBitOr(parser);

  while (current(parser).type === TokenType.LOGICAL_AND) {
    const op = advance(parser);
    const right = parseBitOr(parser);
    expr = createBinaryExpr(op.value, expr, right, mergeSpans(expr.span, right.span));
  }

  return expr;
}

function parseBitOr(parser: Parser): Expr {
  let expr = parseBitXor(parser);

  while (current(parser).type === TokenType.BIT_OR) {
    const op = advance(parser);
    const right = parseBitXor(parser);
    expr = createBinaryExpr(op.value, expr, right, mergeSpans(expr.span, right.span));
  }

  return expr;
}

function parseBitXor(parser: Parser): Expr {
  let expr = parseBitAnd(parser);

  while (current(parser).type === TokenType.BIT_XOR) {
    const op = advance(parser);
    const right = parseBitAnd(parser);
    expr = createBinaryExpr(op.value, expr, right, mergeSpans(expr.span, right.span));
  }

  return expr;
}

function parseBitAnd(parser: Parser): Expr {
  let expr = parseUnary(parser);

  while (current(parser).type === TokenType.BIT_AND) {
    const op = advance(parser);
    const right = parseUnary(parser);
    expr = createBinaryExpr(op.value, expr, right, mergeSpans(expr.span, right.span));
  }

  return expr;
}

function parseUnary(parser: Parser): Expr {
  if (
    current(parser).type === TokenType.BIT_NOT ||
    current(parser).type === TokenType.KW_NOT
  ) {
    const op = advance(parser);
    const operand = parseUnary(parser);
    return createUnaryExpr(op.value, operand, mergeSpans(op.span, operand.span));
  }

  return parsePrimary(parser);
}

function parsePrimary(parser: Parser): Expr {
  if (current(parser).type === TokenType.IDENTIFIER) {
    const token = advance(parser);
    return createIdentifierExpr(token.value, token.span);
  }

  if (current(parser).type === TokenType.NUMBER) {
    const token = advance(parser);
    return createNumberExpr(token.value, token.span);
  }

  if (current(parser).type === TokenType.LPAREN) {
    const leftParen = advance(parser);
    const expr = parseLogicalOr(parser);
    const rightParen = expect(parser, TokenType.RPAREN);
    return withExprSpan(expr, mergeSpans(leftParen.span, rightParen.span));
  }

  raiseParserError(parser, `expected expression, got ${describeToken(current(parser))}`);
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

function previous(parser: Parser): Token {
  return parser.tokens[Math.max(0, parser.index - 1)];
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
      `expected ${expected.join(" or ")}, got ${describeToken(token)}`,
    );
  }

  advance(parser);
  return token;
}

function raiseParserError(parser: Parser, message: string): never {
  const token = current(parser);
  const prevToken = parser.index > 0 ? parser.tokens[parser.index - 1] : null;
  const notes = [
    `token: ${describeToken(token)}`,
  ];

  if (prevToken) {
    notes.push(`after: ${describeToken(prevToken)}`);
  }

  const error = createParserError(message, token.fileName, token.line, token.column, notes);
  throw new Error(formatCompilerError(error));
}

function describeToken(token: Token): string {
  if (token.type === TokenType.EOF) {
    return "EOF";
  }

  return `${token.type}('${token.value}')`;
}

function mergeSpans(start: SourceSpan, end: SourceSpan): SourceSpan {
  return {
    start: start.start,
    end: end.end,
  };
}

function createIdentifierExpr(name: string, span: SourceSpan): IdentifierExpr {
  return {
    kind: "IdentifierExpr",
    name,
    span,
  };
}

function createNumberExpr(value: string, span: SourceSpan): NumberExpr {
  return {
    kind: "NumberExpr",
    value,
    span,
  };
}

function createUnaryExpr(op: string, operand: Expr, span: SourceSpan): UnaryExpr {
  return {
    kind: "UnaryExpr",
    op,
    operand,
    span,
  };
}

function createBinaryExpr(op: string, left: Expr, right: Expr, span: SourceSpan): BinaryExpr {
  return {
    kind: "BinaryExpr",
    op,
    left,
    right,
    span,
  };
}

function withExprSpan(expr: Expr, span: SourceSpan): Expr {
  return {
    ...expr,
    span,
  };
}
