from flask import Flask, render_template, request, jsonify
from utils.route_calculator import ShippingRouteOptimizer

app = Flask(__name__)

# Initialize the route optimizer
route_optimizer = ShippingRouteOptimizer()

@app.route('/')
def index():
    # Get the list of port names for the dropdown
    ports = list(route_optimizer.PORT_LOCATIONS.keys())
    return render_template('index.html', ports=ports)

@app.route('/calculate-routes', methods=['POST'])
def calculate_routes():
    data = request.get_json()
    start_port = data.get('start_port')
    destination_port = data.get('destination_port')
    hub_ports = data.get('hub_ports', [])
    goal = data.get('goal', 'both')
    
    print(f"🔍 Received route calculation request:")
    print(f"   Start: {start_port}")
    print(f"   Destination: {destination_port}")
    print(f"   Hub ports: {hub_ports}")
    print(f"   Goal: {goal}")
    
    # Validate required inputs
    if not start_port or not destination_port:
        return jsonify({'error': 'Start port and destination port are required'}), 400
    
    if start_port == destination_port:
        return jsonify({'error': 'Start and destination ports cannot be the same'}), 400
    
    try:
        # Use the route optimizer to calculate the route
        results = route_optimizer.calculate_optimal_routes(start_port, destination_port, hub_ports, goal)
        
        print(f"✅ Route calculation completed. Results type: {type(results)}")
        
        # Check if results are valid
        if results is None:
            print("❌ Route optimizer returned None")
            return jsonify({
                'error': 'No route could be calculated with the given parameters',
                'details': 'The route calculation returned no results'
            }), 400
        
        # Ensure the response has the expected structure
        if not isinstance(results, dict):
            print(f"❌ Unexpected results type: {type(results)}")
            return jsonify({
                'error': 'Invalid response format from route calculator',
                'details': f'Expected dict, got {type(results).__name__}'
            }), 500
        
        print(f"📊 Results keys: {list(results.keys()) if results else 'None'}")
        
        return jsonify(results)
        
    except Exception as e:
        print(f"❌ Error calculating route: {e}")
        import traceback
        traceback.print_exc()  # This will print the full stack trace
        return jsonify({
            'error': str(e),
            'details': 'Internal server error during route calculation'
        }), 500

if __name__ == '__main__':
    print("🚢 Shipping Route Optimizer Web Server Starting...")
    print("📡 Access the application at: http://localhost:5001")
    print("🌐 Also available at: http://0.0.0.0:5001")
    print("⏹️  Press CTRL+C to stop the server")
    app.run(debug=True, port=5001, host='0.0.0.0')