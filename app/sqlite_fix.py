import sys
import importlib.util

# This needs to happen before any imports that might use sqlite3
if importlib.util.find_spec("pysqlite3"):
    # If pysqlite3 is available, use it instead of the system sqlite3
    __import__('pysqlite3')
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')