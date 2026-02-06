from argparse import ArgumentParser


def build_arg_parser() -> ArgumentParser:
    parser = ArgumentParser(prog="verilog-compiler")
    parser.add_argument("input")
    parser.add_argument("-o", "--output")
    parser.add_argument("--dump-tokens", action="store_true")
    parser.add_argument("--dump-ast", action="store_true")
    parser.add_argument("--strict", action="store_true")
    return parser


def main() -> int:
    parser = build_arg_parser()
    parser.parse_args()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
