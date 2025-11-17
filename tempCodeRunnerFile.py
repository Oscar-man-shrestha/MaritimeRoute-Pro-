from flask import Flask, render_template, request, jsonify
import sys
import os

# Add utils to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'utils'))

from route_calculator import ShippingRouteOptimizer

app = Flask(__name__)

# Add CORS headers manually
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/')
def index():
    # Pass the port list to the template
    ports = list(route_optimizer.PORT_LOCATIONS.keys())
    return render_template('index.html', ports=ports)

@app.route('/calculate-routes', methods=['POST', 'OPTIONS'])
def calculate_routes():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.get_json()
        print(f"Received request: {data}")
        
        start_port = data.get('start_port')
        destination_port = data.get('destination_port')
        hub_ports = data.get('hub_ports', [])
        goal = data.get('goal', 'both')
        
        if not start_port or not destination_port:
            return jsonify({'error': 'Start and destination ports are required'}), 400
        
        if start_port == destination_port:
            return jsonify({'error': 'Start and destination ports cannot be the same'}), 400
        
        # Validate ports exist
        if start_port not in route_optimizer.PORT_LOCATIONS:
            return jsonify({'error': f'Start port {start_port} not found'}), 400
        if destination_port not in route_optimizer.PORT_LOCATIONS:
            return jsonify({'error': f'Destination port {destination_port} not found'}), 400
        
        print(f"Calculating routes: {start_port} -> {destination_port} with hubs: {hub_ports}")
        
        # Calculate routes
        results = route_optimizer.calculate_optimal_routes(
            start_port, destination_port, hub_ports, goal
        )
        
        print("Routes calculated successfully")
        return jsonify(results)
        
    except Exception as e:
        print(f"Error in calculate_routes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get-ports')
def get_ports():
    """Return available ports for frontend"""
    ports = list(route_optimizer.PORT_LOCATIONS.keys())
    return jsonify(ports)

# Initialize your route calculator
route_optimizer = ShippingRouteOptimizer()

if __name__ == '__main__':
    print("🚢 Shipping Route Optimizer Web Server Starting...")
    print("📡 Access the application at: http://localhost:5002")
    print("⏹️  Press CTRL+C to stop the server")
    app.run(debug=True, host='127.0.0.1', port=5002)  # Changed to port 5002