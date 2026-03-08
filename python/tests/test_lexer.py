import pytest

from errors import LexerError
from lexer import Lexer
from token_types import TokenType


def test_minimal_module_tokens() -> None:
    source = "module test();"
    tokens = Lexer(source, "t.v").tokenize()
    types = [token.type for token in tokens]
    assert types == [
        TokenType.MODULE,
        TokenType.IDENTIFIER,
        TokenType.LPAREN,
        TokenType.RPAREN,
        TokenType.SEMICOLON,
        TokenType.EOF,
    ]


def test_port_list_tokens() -> None:
    source = "module m(input a, b, output y);"
    tokens = Lexer(source, "t.v").tokenize()
    types = [token.type for token in tokens]
    assert types == [
        TokenType.MODULE,
        TokenType.IDENTIFIER,
        TokenType.LPAREN,
        TokenType.INPUT,
        TokenType.IDENTIFIER,
        TokenType.COMMA,
        TokenType.IDENTIFIER,
        TokenType.COMMA,
        TokenType.OUTPUT,
        TokenType.IDENTIFIER,
        TokenType.RPAREN,
        TokenType.SEMICOLON,
        TokenType.EOF,
    ]


def test_assign_expression_tokens() -> None:
    source = "assign y = a & b | ~c ^ d;"
    tokens = Lexer(source, "t.v").tokenize()
    types = [token.type for token in tokens]
    assert types == [
        TokenType.ASSIGN,
        TokenType.IDENTIFIER,
        TokenType.EQUALS,
        TokenType.IDENTIFIER,
        TokenType.BIT_AND,
        TokenType.IDENTIFIER,
        TokenType.BIT_OR,
        TokenType.BIT_NOT,
        TokenType.IDENTIFIER,
        TokenType.BIT_XOR,
        TokenType.IDENTIFIER,
        TokenType.SEMICOLON,
        TokenType.EOF,
    ]


def test_primitive_keywords() -> None:
    source = "and or not xor nand nor"
    tokens = Lexer(source, "t.v").tokenize()
    assert [token.type for token in tokens] == [
        TokenType.KW_AND,
        TokenType.KW_OR,
        TokenType.KW_NOT,
        TokenType.KW_XOR,
        TokenType.KW_NAND,
        TokenType.KW_NOR,
        TokenType.EOF,
    ]


def test_logical_operator_precedence_in_lexing() -> None:
    source = "a && b || c & d | e"
    tokens = Lexer(source, "t.v").tokenize()
    assert [token.type for token in tokens] == [
        TokenType.IDENTIFIER,
        TokenType.LOGICAL_AND,
        TokenType.IDENTIFIER,
        TokenType.LOGICAL_OR,
        TokenType.IDENTIFIER,
        TokenType.BIT_AND,
        TokenType.IDENTIFIER,
        TokenType.BIT_OR,
        TokenType.IDENTIFIER,
        TokenType.EOF,
    ]


def test_decimal_number_tokenization() -> None:
    tokens = Lexer("assign y = 42;", "t.v").tokenize()
    assert [token.value for token in tokens if token.type == TokenType.NUMBER] == ["42"]


def test_based_number_tokenization() -> None:
    tokens = Lexer("assign y = 8'b1010; assign z = 16'h1F; assign q = 4'd9;", "t.v").tokenize()
    assert [token.value for token in tokens if token.type == TokenType.NUMBER] == ["8'b1010", "16'h1F", "4'd9"]


def test_line_comment_is_skipped() -> None:
    source = "// comment\nmodule a();"
    tokens = Lexer(source, "t.v").tokenize()
    assert [token.type for token in tokens][:2] == [TokenType.MODULE, TokenType.IDENTIFIER]


def test_block_comment_is_skipped() -> None:
    source = "/* one\n two */ module a();"
    tokens = Lexer(source, "t.v").tokenize()
    assert [token.type for token in tokens][:2] == [TokenType.MODULE, TokenType.IDENTIFIER]


def test_unterminated_block_comment_error() -> None:
    with pytest.raises(LexerError) as exc:
        Lexer("/* no end", "err.v").tokenize()
    error = exc.value
    assert error.file_name == "err.v"
    assert error.line == 1
    assert error.column == 1


def test_invalid_character_error() -> None:
    with pytest.raises(LexerError) as exc:
        Lexer("module test@();", "err.v").tokenize()
    error = exc.value
    assert error.file_name == "err.v"
    assert error.line == 1
    assert error.column == 12


def test_invalid_number_error() -> None:
    with pytest.raises(LexerError) as exc:
        Lexer("assign y = 123abc;", "err.v").tokenize()
    error = exc.value
    assert error.file_name == "err.v"
    assert error.line == 1


def test_eof_once() -> None:
    tokens = Lexer("module a();", "t.v").tokenize()
    eof_count = len([token for token in tokens if token.type == TokenType.EOF])
    assert eof_count == 1


def test_line_and_column_tracking() -> None:
    source = "module a();\nassign y = 1;\nendmodule"
    tokens = Lexer(source, "t.v").tokenize()
    assign_token = [token for token in tokens if token.type == TokenType.ASSIGN][0]
    endmodule_token = [token for token in tokens if token.type == TokenType.ENDMODULE][0]
    assert assign_token.line == 2
    assert assign_token.column == 1
    assert endmodule_token.line == 3
    assert endmodule_token.column == 1


def test_deterministic_token_stream() -> None:
    source = "module m(input a, output y); assign y = a | ~a; endmodule"
    one = Lexer(source, "t.v").tokenize()
    two = Lexer(source, "t.v").tokenize()
    assert one == two
