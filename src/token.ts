import type { TokenType } from "./token-types";

export type Token = {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  fileName: string;
};
