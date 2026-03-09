module chain_logic(input a, b, c, output y);
  wire temp1, temp2;
  assign temp1 = a & b;
  assign temp2 = temp1 | ~c;
  assign y = temp2 ^ a;
endmodule
