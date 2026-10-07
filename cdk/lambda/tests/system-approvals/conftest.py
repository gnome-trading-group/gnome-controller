import os
import sys

# The Lambda's folder is uploaded as it is, so tests mustn't leave compiled files in it.
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "functions", "system-approvals"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "layers", "common", "python"))
