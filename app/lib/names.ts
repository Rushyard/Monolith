// Local display labels only: transaction recipients remain Stellar addresses.
export const NAMES: Readonly<Record<string, string>> = Object.freeze({
  GCIFXLBRK2CHODLILPTZIPEAK36TOS3MG4QRZGCTJ7PA52PAOP75RS7B: "Sarah",
  GDY5SERGYNGQF2R4SRZ4AHQPJ7HQOLEPLAFISMD37CM2XCTGW4KUBXH6: "Alice",
  GBCQZMHQWCIQJRCQJHAI7L2GS56A3EVY5E2E26DU2RX5SRSU4Y5B32GV: "Bob",
  GDTMYTVUVK24YS33DC7LH2LXF6C4TKOYLPBWZNKKJIIRSAKRJZLSXPH3: "Carol",
  GA5HRQORQCUWGG6ACM6SMLWJO75Q7BWFGERVOBLR4FVSSQGZPPHE5NJH: "Bob (vault)",
});

/** Returns a known display name, or undefined for an unlisted address. */
export function nameOf(addr: string): string | undefined {
  return Object.hasOwn(NAMES, addr) ? NAMES[addr] : undefined;
}
