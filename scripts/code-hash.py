#!/usr/bin/env python3
"""Prints the base58 NEAR code hash (sha256) of a wasm file: what goes in ctoad_account_code_hash."""
import hashlib
import sys

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + out


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: code-hash.py <file.wasm>")
    with open(sys.argv[1], "rb") as f:
        print(b58encode(hashlib.sha256(f.read()).digest()))
