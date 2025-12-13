# utils/route_calculator.py
import networkx as nx
import json
from math import radians, sin, cos, sqrt, atan2
import random
import time
import math
import os
from functools import lru_cache
from datetime import datetime

class ShippingRouteOptimizer:
    def __init__(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        self.SEA_LANES_GEOJSON_PATH = os.path.join(current_dir, "../Shipping_Lanes_v1.geojson")
        
        print(f"📁 Looking for GeoJSON at: {self.SEA_LANES_GEOJSON_PATH}")
        
        self.PORT_LOCATIONS = {
            "Jebel_Ali": (25.0108, 55.0610),
            "Mumbai": (18.948, 72.835),
            "Colombo": (6.9271, 79.8612),
            "Singapore": (1.3521, 103.8198),
            "Jakarta": (-6.2088, 106.8456),
            "Port Moresby": (-9.4790, 147.1494),
            "Kudat": (6.8831, 116.8466),
            "Bangkok": (13.7563, 100.5018),
            "Manila": (14.5995, 120.9842),
            "Hong_Kong": (22.3193, 114.1694),
            "Busan": (35.1796, 129.0756),
            "Shanghai": (31.2304, 121.4737),
            "Shenzhen": (22.5431, 114.0579),
            "Yokohama": (35.4437, 139.6380),
            "Palu": (0.9003, 119.8780),
            "Tokyo": (35.6762, 139.6503),
            "Melbourne": (-37.8136, 144.9631),
            "Perth": (-31.9514, 115.8617),
            "Suez_Canal": (30.5852, 32.2654),
            "Salalah": (16.9472, 54.0104),
        }
        
        self.AVERAGE_SPEED_KMH = 37.0
        self.FUEL_CONSUMPTION_PER_KM = 0.04
        self.WEATHER_FACTOR = 1.25
        self.GA_POPULATION_SIZE = 40
        self.GA_GENERATIONS = 100
        self.PORT_CONNECTION_THRESHOLD_KM = 500
        
        print("🔄 Initializing Shipping Route Optimizer...")
        
        # Initialize graph and data structures once
        self.sea_graph = self._build_sea_graph()
        self._connect_ports_to_sea_nodes()
        self.port_paths = self._precompute_all_port_paths()
        
        # Initialize weather service as None (lazy loading)
        self.weather_service = None
        
        print("✅ Shipping Route Optimizer initialized successfully!")

    def _build_sea_graph(self):
        """Build the sea graph from GeoJSON data"""
        sea_graph = nx.Graph()
        
        if not os.path.exists(self.SEA_LANES_GEOJSON_PATH):
            raise FileNotFoundError(f"GeoJSON file not found: {self.SEA_LANES_GEOJSON_PATH}")
        
        print(f"📁 Loading GeoJSON from: {self.SEA_LANES_GEOJSON_PATH}")
        
        with open(self.SEA_LANES_GEOJSON_PATH, "r", encoding="utf-8") as f:
            geojson_data = json.load(f)

        def make_sea_node_id(lat, lon):
            return f"sea_{lat:.6f}_{lon:.6f}"

        for feature in geojson_data.get("features", []):
            geometry = feature.get("geometry", {})
            typ = geometry.get("type")
            coords = geometry.get("coordinates", [])
            lines = []
            if typ == "LineString":
                lines.append(coords)
            elif typ == "MultiLineString":
                for line in coords:
                    lines.append(line)
            else:
                continue

            for line in lines:
                prev_node = None
                for lon, lat in line:
                    node_id = make_sea_node_id(lat, lon)
                    if node_id not in sea_graph:
                        sea_graph.add_node(node_id, coord=(lat, lon))
                    if prev_node is not None and not sea_graph.has_edge(prev_node, node_id):
                        coord_a = sea_graph.nodes[prev_node]["coord"]
                        coord_b = sea_graph.nodes[node_id]["coord"]
                        w = self._calculate_distance_km(coord_a, coord_b)
                        sea_graph.add_edge(prev_node, node_id, weight=w)
                    prev_node = node_id

        sea_nodes = len([n for n in sea_graph.nodes if str(n).startswith('sea_')])
        print(f"✅ Built sea-graph with {sea_nodes} sea nodes and {len(list(sea_graph.edges))} edges")
        return sea_graph

    def _connect_ports_to_sea_nodes(self):
        """Connect ports to nearby sea nodes"""
        for pname, pcoord in self.PORT_LOCATIONS.items():
            self.sea_graph.add_node(pname, coord=pcoord)
            connected = []
            for node, data in list(self.sea_graph.nodes(data=True)):
                if not str(node).startswith("sea_"):
                    continue
                d = self._calculate_distance_km(pcoord, data["coord"])
                if d <= self.PORT_CONNECTION_THRESHOLD_KM:
                    self.sea_graph.add_edge(pname, node, weight=d)
                    connected.append(node)
            print(f"🔗 Port {pname} connected to {len(connected)} sea nodes.")

    def _precompute_all_port_paths(self):
        """Precompute paths between all ports for web use"""
        print("⚙️ Precomputing all port-to-port paths...")
        port_paths = {}
        ports = list(self.PORT_LOCATIONS.keys())
        
        total_combinations = len(ports) * (len(ports) - 1)
        current = 0
        
        for i in range(len(ports)):
            for j in range(len(ports)):
                if i == j:
                    continue
                port_paths[(ports[i], ports[j])] = self._astar_between(ports[i], ports[j])
                current += 1
                if current % 50 == 0:
                    print(f"  Progress: {current}/{total_combinations} paths computed")
        
        print("✅ Precompute done.")
        return port_paths

    def _calculate_distance_km(self, coord1, coord2):
        """Haversine distance in km between two (lat, lon) coordinates."""
        R = 6371.0
        lat1, lon1 = coord1
        lat2, lon2 = coord2
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        return 2 * R * atan2(sqrt(a), sqrt(1 - a))

    def _heuristic_distance(self, u, v):
        cu = self.sea_graph.nodes[u].get("coord")
        cv = self.sea_graph.nodes[v].get("coord")
        if cu is None or cv is None:
            return 0.0
        return self._calculate_distance_km(cu, cv)

    @lru_cache(maxsize=None)
    def _astar_between(self, u, v):
        """Run A* between two nodes in the sea graph and return (path_tuple, length)."""
        try:
            path = nx.astar_path(self.sea_graph, u, v, heuristic=self._heuristic_distance, weight="weight")
            length = nx.path_weight(self.sea_graph, path, weight="weight")
            return tuple(path), length
        except Exception as e:
            return None, float("inf")

    def _total_distance(self, port_sequence):
        """Sum of distances along a port sequence using precomputed port-to-port paths."""
        dist = 0.0
        for i in range(len(port_sequence) - 1):
            _, d = self.port_paths.get((port_sequence[i], port_sequence[i + 1]), (None, float("inf")))
            dist += d
        return dist

    def _estimate_travel_time_hours(self, distance_km):
        return (distance_km / self.AVERAGE_SPEED_KMH) * self.WEATHER_FACTOR

    def _estimate_fuel_tonnes(self, distance_km):
        return distance_km * self.FUEL_CONSUMPTION_PER_KM * self.WEATHER_FACTOR

    def _fitness(self, route_seq, goal):
        """Compute fitness for GA - routes with ALL intermediate ports get priority."""
        if hasattr(self, 'current_hub_ports'):
            required_ports = set(self.current_hub_ports)
            actual_ports = set(route_seq[1:-1])  
            
            if not required_ports.issubset(actual_ports):
                return 0.0
        
        d = self._total_distance(route_seq)
        if d == float("inf"):
            return 0.0

        stops = len(route_seq) - 2  
        if goal == "fastest":
            time_hours = self._estimate_travel_time_hours(d) + stops * 8
            return 1.0 / (time_hours + 1e-6)
        else:
            fuel_tonnes = self._estimate_fuel_tonnes(d) * (1 + 0.025 * stops)
            return 1.0 / (fuel_tonnes + 1e-6)

    def _crossover(self, parent1, parent2, hub_ports):
        """Crossover that preserves all hub ports."""
        hubs1 = parent1[1:-1]
        hubs2 = parent2[1:-1]
        all_hubs = list(dict.fromkeys(hubs1 + hubs2))
        
        for hub in hub_ports:
            if hub not in all_hubs:
                all_hubs.append(hub)
        
        child = [parent1[0]] + all_hubs + [parent1[-1]]
        return child

    def _mutate(self, route, hub_ports):
        """Mutation that maintains all hub ports."""
        if len(route) <= 3:
            return route
        
        intermediate_indices = list(range(1, len(route) - 1))
        
        if len(intermediate_indices) >= 2:
            i, j = random.sample(intermediate_indices, 2)
            route[i], route[j] = route[j], route[i]
        
        return route

    def _run_genetic_algorithm(self, start_port, destination_port, hub_ports, goal):
        """Run genetic algorithm to optimize route - GUARANTEES ALL INTERMEDIATE PORTS ARE INCLUDED."""
        if not hub_ports:
            direct_route = [start_port, destination_port]
            direct_distance = self._total_distance(direct_route)
            return direct_route, direct_distance

        print(f"🧬 GA optimizing route with ALL hubs: {hub_ports}")

        population = []
        for _ in range(self.GA_POPULATION_SIZE):
            shuffled_hubs = hub_ports.copy()
            random.shuffle(shuffled_hubs)
            route = [start_port] + shuffled_hubs + [destination_port]
            population.append(route)

        best_route = None
        best_fitness = -float('inf')
        best_distance = float('inf')

        for generation in range(self.GA_GENERATIONS):
            fitness_scores = []
            for route in population:
                route_hubs = set(route[1:-1]) 
                required_hubs = set(hub_ports)
                correct_start_end = route[0] == start_port and route[-1] == destination_port
                
                if required_hubs.issubset(route_hubs) and correct_start_end:
                    distance = self._total_distance(route)
                    fitness = self._fitness(route, goal)
                    fitness_scores.append((route, fitness, distance))
                    
                    if fitness > best_fitness:
                        best_route = route.copy()
                        best_fitness = fitness
                        best_distance = distance
                else:
                    fitness_scores.append((route, 0.0, float('inf')))

            fitness_scores.sort(key=lambda x: x[1], reverse=True)

            new_population = []
            elite_count = max(2, self.GA_POPULATION_SIZE // 10)
            for i in range(min(elite_count, len(fitness_scores))):
                if fitness_scores[i][1] > 0:
                    new_population.append(fitness_scores[i][0])

            while len(new_population) < self.GA_POPULATION_SIZE:
                valid_routes = [route for route, fitness, _ in fitness_scores if fitness > 0]
                
                if len(valid_routes) >= 2:
                    parent1 = max(random.sample(valid_routes, min(3, len(valid_routes))), 
                                 key=lambda r: self._fitness(r, goal))
                    parent2 = max(random.sample(valid_routes, min(3, len(valid_routes))), 
                                 key=lambda r: self._fitness(r, goal))
                    
                    child = self._crossover(parent1, parent2, hub_ports)
                    
                    if random.random() < 0.3:
                        child = self._mutate(child, hub_ports)
                    
                    new_population.append(child)
                else:
                    shuffled = hub_ports.copy()
                    random.shuffle(shuffled)
                    new_population.append([start_port] + shuffled + [destination_port])

            population = new_population[:self.GA_POPULATION_SIZE]

            if generation % 20 == 0:
                print(f"  Generation {generation}: Best distance = {best_distance:.2f} km")

        if best_route:
            final_hubs = set(best_route[1:-1])
            missing_hubs = set(hub_ports) - final_hubs
            
            if missing_hubs:
                print(f"⚠️  Adding missing hubs to final route: {missing_hubs}")
                
                for hub in missing_hubs:
                    best_increase = float('inf')
                    best_position = -1
                    
                    for i in range(1, len(best_route)): 
                        test_route = best_route.copy()
                        test_route.insert(i, hub)
                        increase = self._total_distance(test_route) - best_distance
                        
                        if increase < best_increase:
                            best_increase = increase
                            best_position = i
                    
                    if best_position != -1:
                        best_route.insert(best_position, hub)
                        best_distance = self._total_distance(best_route)

        if not best_route or best_fitness <= 0:
            print("🔄 Using fallback route with all hubs")
            best_route = [start_port] + hub_ports + [destination_port]
            best_distance = self._total_distance(best_route)

        print(f"✅ Final {goal} route: {' → '.join(best_route)}")
        print(f"📏 Total distance: {best_distance:.2f} km")
        print(f"🔢 Includes {len(best_route) - 2} intermediate ports")
        
        return best_route, best_distance

    # WEATHER INTEGRATION FUNCTIONS
    def _initialize_weather_service(self):
        """Lazy initialization of weather service"""
        if self.weather_service is None:
            try:
                from utils.weather_service import weather_service
                self.weather_service = weather_service
                print("✅ Weather service initialized")
            except ImportError as e:
                print(f"⚠️ Weather service import error: {e}")
                print("⚠️ Using simulated weather data")
                self.weather_service = None
    
    def _adjust_for_weather(self, distance_km, weather_impact):
        """Adjust travel time based on weather impact"""
        base_time = (distance_km / self.AVERAGE_SPEED_KMH) * self.WEATHER_FACTOR
        
        if weather_impact < 2:
            multiplier = 1.0
        elif weather_impact < 4:
            multiplier = 1.1
        elif weather_impact < 6:
            multiplier = 1.3
        elif weather_impact < 8:
            multiplier = 1.6
        else:
            multiplier = 2.0
        
        return base_time * multiplier
    
    def _get_weather_recommendation(self, fastest_weather, fuel_weather, goal):
        """Get recommendation based on weather comparison"""
        fastest_impact = fastest_weather['average_impact']
        fuel_impact = fuel_weather['average_impact']
        
        if goal == "fastest":
            if fastest_impact < 4:
                return "Fastest route has favorable weather conditions"
            elif fastest_impact < 6:
                return "Fastest route has moderate weather - proceed with caution"
            else:
                return "Consider fuel-efficient route due to poor weather on fastest route"
        
        elif goal == "fuel":
            if fuel_impact < 4:
                return "Fuel-efficient route has favorable weather conditions"
            elif fuel_impact < 6:
                return "Fuel-efficient route has moderate weather - proceed with caution"
            else:
                return "Consider fastest route due to poor weather on efficient route"
        
        else:
            if fastest_impact < fuel_impact:
                return "Weather favors fastest route"
            elif fuel_impact < fastest_impact:
                return "Weather favors fuel-efficient route"
            else:
                return "Both routes have similar weather conditions"

    def _nodes_to_latlon(self, path_nodes):
        """Convert path nodes to coordinates."""
        coords = []
        for n in path_nodes:
            coord = self.sea_graph.nodes[n].get("coord")
            if coord:
                coords.append(coord)
        return coords

    def _build_full_route_coordinates(self, seq):
        """Convert a sequence of ports into lat/lon coordinates."""
        coords = []
        for i in range(len(seq) - 1):
            start = seq[i]
            end = seq[i + 1]
            path_nodes, _ = self.port_paths.get((start, end), (None, float("inf")))
            if path_nodes:
                seg = self._nodes_to_latlon(path_nodes)
                if coords and seg and coords[-1] == seg[0]:
                    coords.extend(seg[1:])
                else:
                    coords.extend(seg)
            else:
                if coords:
                    coords.append(self.PORT_LOCATIONS[end])
                else:
                    coords.append(self.PORT_LOCATIONS[start])
                    coords.append(self.PORT_LOCATIONS[end])
        return coords

    def _gc_interpolate(self, p1, p2, n=60):
        """Great circle interpolation between two points."""
        lat1, lon1 = map(math.radians, p1)
        lat2, lon2 = map(math.radians, p2)

        def to_vec(lat, lon):
            x = math.cos(lat) * math.cos(lon)
            y = math.cos(lat) * math.sin(lon)
            z = math.sin(lat)
            return (x, y, z)

        v1 = to_vec(lat1, lon1)
        v2 = to_vec(lat2, lon2)
        dot = max(min(v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2], 1.0), -1.0)
        omega = math.acos(dot)
        if abs(omega) < 1e-12:
            return [p1, p2]

        points = []
        for i in range(n):
            t = i / (n - 1)
            s1 = math.sin((1 - t) * omega) / math.sin(omega)
            s2 = math.sin(t * omega) / math.sin(omega)
            x = s1 * v1[0] + s2 * v2[0]
            y = s1 * v1[1] + s2 * v2[1]
            z = s1 * v1[2] + s2 * v2[2]
            lat = math.atan2(z, math.sqrt(x * x + y * y))
            lon = math.atan2(y, x)
            points.append((math.degrees(lat), math.degrees(lon)))
        return points

    def calculate_optimal_routes(self, start_port, destination_port, hub_ports=None, goal="both", include_weather=True):
       
        if hub_ports is None:
            hub_ports = []
        
        print(f"🏁 Calculating routes: {start_port} → {destination_port}")
        print(f"🎯 Intermediate ports: {hub_ports}")
        print(f"🎯 Optimization goal: {goal}")
        print(f"🌤️  Weather integration: {'ENABLED' if include_weather else 'DISABLED'}")
        
        self.current_hub_ports = hub_ports
        
        fastest_route, fastest_distance = self._run_genetic_algorithm(start_port, destination_port, hub_ports, "fastest")
        fuel_route, fuel_distance = self._run_genetic_algorithm(start_port, destination_port, hub_ports, "fuel")
        
        for route_name, route, hubs in [("Fastest", fastest_route, hub_ports), ("Fuel-efficient", fuel_route, hub_ports)]:
            route_hubs = set(route[1:-1])
            required_hubs = set(hubs)
            missing_hubs = required_hubs - route_hubs
            
            if missing_hubs:
                print(f"❌ CRITICAL: {route_name} route missing ports: {missing_hubs}")
                print(f"   Forcing inclusion of missing ports...")
                
                for hub in missing_hubs:
                    best_position = -1
                    best_increase = float('inf')
                    current_distance = self._total_distance(route)
                    
                    for i in range(1, len(route)):
                        test_route = route.copy()
                        test_route.insert(i, hub)
                        increase = self._total_distance(test_route) - current_distance
                        
                        if increase < best_increase:
                            best_increase = increase
                            best_position = i
                    
                    if best_position != -1:
                        route.insert(best_position, hub)
                        print(f"   Added {hub} at position {best_position}")
                
                print(f"   Fixed route: {' → '.join(route)}")
        
        print(f"✅ Final fastest route: {' → '.join(fastest_route)}")
        print(f"✅ Final fuel-efficient route: {' → '.join(fuel_route)}")
        
        # Build route coordinates
        fast_coords = self._build_full_route_coordinates(fastest_route)
        fuel_coords = self._build_full_route_coordinates(fuel_route)
        direct_coords = self._gc_interpolate(
            self.PORT_LOCATIONS[start_port], 
            self.PORT_LOCATIONS[destination_port]
        )
        
        # Calculate base times and fuel without weather adjustment
        fastest_time_base = self._estimate_travel_time_hours(fastest_distance)
        fuel_time_base = self._estimate_travel_time_hours(fuel_distance)
        fastest_fuel_base = self._estimate_fuel_tonnes(fastest_distance)
        fuel_fuel_base = self._estimate_fuel_tonnes(fuel_distance)
        
        # Initialize results structure
        results = {
            'fastest_route': {
                'ports': fastest_route,
                'distance_km': fastest_distance,
                'time_hours': fastest_time_base,
                'fuel_tonnes': fastest_fuel_base,
                'co2_tonnes': fastest_fuel_base * 3.15,
                'coordinates': fast_coords
            },
            'fuel_efficient_route': {
                'ports': fuel_route,
                'distance_km': fuel_distance,
                'time_hours': fuel_time_base,
                'fuel_tonnes': fuel_fuel_base,
                'co2_tonnes': fuel_fuel_base * 3.15,
                'coordinates': fuel_coords
            },
            'direct_route': {
                'coordinates': direct_coords
            },
            'port_locations': self.PORT_LOCATIONS
        }
        
        # Apply weather adjustments if enabled
        if include_weather:
            print("🌤️ Processing weather data...")
            
            # Initialize weather service
            self._initialize_weather_service()
            
            # Generate weather impact for both routes
            if self.weather_service:
                fastest_weather = self.weather_service.get_route_weather_impact(fast_coords)
                fuel_weather = self.weather_service.get_route_weather_impact(fuel_coords)
            else:
                # Use enhanced simulated weather data
                fastest_weather = {
                    'weather_points': [],
                    'average_impact': round(random.uniform(2.0, 6.0), 1),
                    'overall_condition': random.choice(['Good', 'Moderate', 'Excellent']),
                    'recommendation': 'Enhanced simulated weather data',
                    'storm_glass_data': {
                        'average_swell': round(random.uniform(1.0, 3.0), 1),
                        'water_temp': round(18 + random.uniform(-5, 5), 1)
                    }
                }
                fuel_weather = {
                    'weather_points': [],
                    'average_impact': round(random.uniform(2.0, 6.0), 1),
                    'overall_condition': random.choice(['Good', 'Moderate', 'Excellent']),
                    'recommendation': 'Enhanced simulated weather data',
                    'storm_glass_data': {
                        'average_swell': round(random.uniform(1.0, 3.0), 1),
                        'water_temp': round(18 + random.uniform(-5, 5), 1)
                    }
                }
            
            # Adjust times based on weather
            fastest_time_adjusted = self._adjust_for_weather(fastest_distance, fastest_weather['average_impact'])
            fuel_time_adjusted = self._adjust_for_weather(fuel_distance, fuel_weather['average_impact'])
            
            # Update results with weather data
            results['fastest_route']['weather_impact'] = fastest_weather
            results['fastest_route']['time_hours'] = fastest_time_adjusted  # Use adjusted time
            results['fuel_efficient_route']['weather_impact'] = fuel_weather
            results['fuel_efficient_route']['time_hours'] = fuel_time_adjusted  # Use adjusted time
            
            # Add weather-based recommendation
            results['weather_recommendation'] = self._get_weather_recommendation(
                fastest_weather, fuel_weather, goal
            )
            
            print(f"✅ Weather analysis complete. Fastest: {fastest_weather['average_impact']:.1f}/10")
            print(f"✅ Efficient: {fuel_weather['average_impact']:.1f}/10")
        else:
            print("🌤️ Weather integration disabled")
            results['weather_recommendation'] = "Weather data disabled. Enable for detailed analysis."
        
        # Clean up temporary attributes
        if hasattr(self, 'current_hub_ports'):
            del self.current_hub_ports
        
        print("✅ Route calculation complete!")
        return results