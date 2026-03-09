import type { SourceSpan } from "./ast";
import type { TokenType } from "./token-types";

export type Token = {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  fileName: string;
  span: SourceSpan;
};
