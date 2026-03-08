from __future__ import annotations

import json
from argparse import ArgumentParser
from dataclasses import asdict, is_dataclass

from errors import CompilerError
from lexer import Lexer
from netlist import emit_verilog
from parser import Parser
from synthesizer import Synthesizer


def build_arg_parser() -> ArgumentParser:
    parser = ArgumentParser(prog="verilog-compiler")
    parser.add_argument("input")
    parser.add_argument("-o", "--output")
    parser.add_argument("--dump-tokens", action="store_true")
    parser.add_argument("--dump-ast", action="store_true")
    parser.add_argument("--strict", action="store_true")
    return parser


def _to_jsonable(value: object) -> object:
    if is_dataclass(value):
        return {key: _to_jsonable(item) for key, item in asdict(value).items()}
    if isinstance(value, list):
        return [_to_jsonable(item) for item in value]
    return value


def main() -> int:
    args = build_arg_parser().parse_args()
    try:
        with open(args.input, "r", encoding="utf-8") as file:
            source = file.read()
        tokens = Lexer(source, args.input).tokenize()
        if args.dump_tokens:
            for token in tokens:
                print(token)
        module = Parser(tokens).parse()
        if args.dump_ast:
            print(json.dumps(_to_jsonable(module), indent=2))
        netlist = Synthesizer(strict=args.strict).synthesize(module)
        rendered = emit_verilog(netlist)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as file:
                file.write(rendered)
        else:
            print(rendered, end="")
        return 0
    except CompilerError as error:
        print(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
