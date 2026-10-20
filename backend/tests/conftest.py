import os

# Ensure TEST_MODE is active for the test suite before any app modules are loaded
os.environ["TEST_MODE"] = "1"
