module simple_logic(input a, b, output y);
  wire temp;
  assign temp = a & b;
  assign y = temp | ~a;
endmodule
