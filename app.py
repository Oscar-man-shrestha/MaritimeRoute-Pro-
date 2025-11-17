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
    
    try:
        # Use the route optimizer to calculate the route
        results = route_optimizer.calculate_optimal_routes(start_port, destination_port, hub_ports, goal)
        return jsonify(results)
    except Exception as e:
        print(f"Error calculating route: {e}")
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    print("🚢 Shipping Route Optimizer Web Server Starting...")
    print("📡 Access the application at: http://localhost:5001")  # Changed to 5001
    print("🌐 Also available at: http://0.0.0.0:5001")  # Changed to 5001
    print("⏹️  Press CTRL+C to stop the server")
    app.run(debug=True, port=5001, host='0.0.0.0')  # Changed to port 5001