class CompilerError(Exception):
    def __init__(self, message: str, file_name: str, line: int, column: int) -> None:
        self.message = message
        self.file_name = file_name
        self.line = line
        self.column = column
        super().__init__(f"{file_name}:{line}:{column}: {message}")


class LexerError(CompilerError):
    pass


class ParserError(CompilerError):
    pass


class SynthesisError(CompilerError):
    pass
