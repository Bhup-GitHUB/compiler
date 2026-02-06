from ast_nodes import ModuleNode
from netlist import NetlistModule


class Synthesizer:
    def __init__(self, strict: bool = False) -> None:
        self.strict = strict

    def synthesize(self, module: ModuleNode) -> NetlistModule:
        raise NotImplementedError
