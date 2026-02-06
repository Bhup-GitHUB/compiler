from ast_nodes import ModuleNode
from token_model import Token


class Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens

    def parse(self) -> ModuleNode:
        raise NotImplementedError
