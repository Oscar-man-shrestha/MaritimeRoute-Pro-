import sys
sys.path.append('.')
from utils.route_calculator import calculate_shortest_path, PORT_LOCATIONS

print("Available ports:", PORT_LOCATIONS)

try:
    # Test a simple route
    path, distance = calculate_shortest_path("Singapore", "Port Moresby")
    print(f"Success! Path: {path}, Distance: {distance}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()



