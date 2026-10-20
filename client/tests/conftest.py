import sys
from pathlib import Path

# the client runs as a script from its own folder; tests import it the same way
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
