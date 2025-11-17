import networkx as nx
import json
from math import radians, sin, cos, sqrt, atan2
import random
import time
import math
import os
from functools import lru_cache

class ShippingRouteOptimizer:
    def __init__(self):
        self.SEA_LANES_GEOJSON_PATH = "/Users/oscar/Desktop/ry/Shipping_Lanes_v1.geojson"
        
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
        
        # Initialize the sea graph
        self.sea_graph = self._build_sea_graph()
        self._connect_ports_to_sea_nodes()
        
        # Precompute paths between all ports for web use
        self.port_paths = self._precompute_all_port_paths()
        
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
        # First check if all required ports are included
        if hasattr(self, 'current_hub_ports'):
            required_ports = set(self.current_hub_ports)
            actual_ports = set(route_seq[1:-1])  # Exclude start and end
            
            if not required_ports.issubset(actual_ports):
                # Heavy penalty for missing required ports
                return 0.0
        
        d = self._total_distance(route_seq)
        if d == float("inf"):
            return 0.0

        stops = len(route_seq) - 2  # Number of intermediate stops

        if goal == "fastest":
            # Time-based fitness (minimize time)
            time_hours = self._estimate_travel_time_hours(d) + stops * 8  # Port stop penalty
            return 1.0 / (time_hours + 1e-6)
        else:
            # Fuel-based fitness (minimize fuel)
            fuel_tonnes = self._estimate_fuel_tonnes(d) * (1 + 0.025 * stops)  # Small stop penalty
            return 1.0 / (fuel_tonnes + 1e-6)

    def _crossover(self, parent1, parent2, hub_ports):
        """Crossover that preserves all hub ports."""
        # Get intermediate ports from both parents (excluding start/end)
        hubs1 = parent1[1:-1]
        hubs2 = parent2[1:-1]
        
        # Ensure all required hubs are included
        all_hubs = list(dict.fromkeys(hubs1 + hubs2))
        
        # Make sure ALL selected hub ports are included
        for hub in hub_ports:
            if hub not in all_hubs:
                all_hubs.append(hub)
        
        # Create child with start, all hubs, and destination
        child = [parent1[0]] + all_hubs + [parent1[-1]]
        
        return child

    def _mutate(self, route, hub_ports):
        """Mutation that maintains all hub ports."""
        if len(route) <= 3:  # Only start, one hub, end
            return route
        
        # Only mutate the intermediate ports (not start/end)
        intermediate_indices = list(range(1, len(route) - 1))
        
        if len(intermediate_indices) >= 2:
            # Swap two random intermediate ports
            i, j = random.sample(intermediate_indices, 2)
            route[i], route[j] = route[j], route[i]
        
        return route

    def _run_genetic_algorithm(self, start_port, destination_port, hub_ports, goal):
        """Run genetic algorithm to optimize route - GUARANTEES ALL INTERMEDIATE PORTS ARE INCLUDED."""
        if not hub_ports:
            # If no hub ports, return direct route
            direct_route = [start_port, destination_port]
            direct_distance = self._total_distance(direct_route)
            return direct_route, direct_distance

        print(f"🧬 GA optimizing route with ALL hubs: {hub_ports}")

        # Initialize population that includes ALL hub ports
        population = []
        
        # Create initial population with all hub ports included
        for _ in range(self.GA_POPULATION_SIZE):
            # Always include all hub ports, just shuffle the order
            shuffled_hubs = hub_ports.copy()
            random.shuffle(shuffled_hubs)
            route = [start_port] + shuffled_hubs + [destination_port]
            population.append(route)

        best_route = None
        best_fitness = -float('inf')
        best_distance = float('inf')

        for generation in range(self.GA_GENERATIONS):
            # Evaluate fitness for each route
            fitness_scores = []
            for route in population:
                # Verify ALL hub ports are included
                route_hubs = set(route[1:-1])  # Exclude start and end ports
                required_hubs = set(hub_ports)
                
                if required_hubs.issubset(route_hubs):
                    # All required hubs are included, calculate fitness
                    distance = self._total_distance(route)
                    fitness = self._fitness(route, goal)
                    fitness_scores.append((route, fitness, distance))
                    
                    # Track best route
                    if fitness > best_fitness:
                        best_route = route.copy()
                        best_fitness = fitness
                        best_distance = distance
                else:
                    # Penalize routes that don't include all hubs
                    fitness_scores.append((route, 0.0, float('inf')))

            # Sort by fitness (descending)
            fitness_scores.sort(key=lambda x: x[1], reverse=True)
            
            # Create new population through selection, crossover, and mutation
            new_population = []
            
            # Elitism: keep the best routes
            elite_count = max(2, self.GA_POPULATION_SIZE // 10)
            for i in range(min(elite_count, len(fitness_scores))):
                if fitness_scores[i][1] > 0:  # Only keep valid routes
                    new_population.append(fitness_scores[i][0])

            # Fill the rest of the population
            while len(new_population) < self.GA_POPULATION_SIZE:
                # Selection: choose parents from valid routes
                valid_routes = [route for route, fitness, _ in fitness_scores if fitness > 0]
                
                if len(valid_routes) >= 2:
                    # Tournament selection
                    parent1 = max(random.sample(valid_routes, min(3, len(valid_routes))), 
                                 key=lambda r: self._fitness(r, goal))
                    parent2 = max(random.sample(valid_routes, min(3, len(valid_routes))), 
                                 key=lambda r: self._fitness(r, goal))
                    
                    # Crossover - ensure all hubs are included
                    child = self._crossover(parent1, parent2, hub_ports)
                    
                    # Mutation - maintain all hubs
                    if random.random() < 0.3:
                        child = self._mutate(child, hub_ports)
                    
                    new_population.append(child)
                else:
                    # Fallback: create new route with all hubs
                    shuffled = hub_ports.copy()
                    random.shuffle(shuffled)
                    new_population.append([start_port] + shuffled + [destination_port])

            population = new_population[:self.GA_POPULATION_SIZE]

            # Print progress every 20 generations
            if generation % 20 == 0:
                print(f"  Generation {generation}: Best distance = {best_distance:.2f} km")

        # Final verification - ensure ALL hubs are included
        if best_route:
            final_hubs = set(best_route[1:-1])
            missing_hubs = set(hub_ports) - final_hubs
            
            if missing_hubs:
                print(f"⚠️  Adding missing hubs to final route: {missing_hubs}")
                # Insert missing hubs at optimal positions
                for hub in missing_hubs:
                    # Find the best position to insert the missing hub
                    best_position = -1
                    best_increase = float('inf')
                    
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

        # If no valid route found (shouldn't happen), use fallback
        if not best_route or best_fitness <= 0:
            print("🔄 Using fallback route with all hubs")
            best_route = [start_port] + hub_ports + [destination_port]
            best_distance = self._total_distance(best_route)

        print(f"✅ Final {goal} route: {' → '.join(best_route)}")
        print(f"📏 Total distance: {best_distance:.2f} km")
        print(f"🔢 Includes {len(best_route) - 2} intermediate ports")
        
        return best_route, best_distance

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
                # Fallback: just connect the ports directly
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

    def calculate_optimal_routes(self, start_port, destination_port, hub_ports=None, goal="both"):
        """Main method to calculate optimal routes - GUARANTEES ALL INTERMEDIATE PORTS ARE INCLUDED."""
        if hub_ports is None:
            hub_ports = []
        
        # Store current hub ports for fitness function
        self.current_hub_ports = hub_ports
        
        print(f"🏁 Calculating routes: {start_port} → {destination_port}")
        print(f"🎯 Intermediate ports (ALL WILL BE INCLUDED): {hub_ports}")
        print(f"🎯 Optimization goal: {goal}")
        
        # Run genetic algorithm for both goals
        fastest_route, fastest_distance = self._run_genetic_algorithm(start_port, destination_port, hub_ports, "fastest")
        fuel_route, fuel_distance = self._run_genetic_algorithm(start_port, destination_port, hub_ports, "fuel")
        
        # Final verification - ensure ALL intermediate ports are included
        for route_name, route, hubs in [("Fastest", fastest_route, hub_ports), ("Fuel-efficient", fuel_route, hub_ports)]:
            route_hubs = set(route[1:-1])
            required_hubs = set(hubs)
            missing_hubs = required_hubs - route_hubs
            
            if missing_hubs:
                print(f"❌ CRITICAL: {route_name} route missing ports: {missing_hubs}")
                print(f"   Forcing inclusion of missing ports...")
                
                # Force include missing ports at optimal positions
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
        
        # Calculate coordinates for mapping
        fast_coords = self._build_full_route_coordinates(fastest_route)
        fuel_coords = self._build_full_route_coordinates(fuel_route)
        direct_coords = self._gc_interpolate(
            self.PORT_LOCATIONS[start_port], 
            self.PORT_LOCATIONS[destination_port]
        )
        
        # Prepare results
        results = {
            'fastest_route': {
                'ports': fastest_route,
                'distance_km': fastest_distance,
                'time_hours': self._estimate_travel_time_hours(fastest_distance),
                'fuel_tonnes': self._estimate_fuel_tonnes(fastest_distance),
                'co2_tonnes': self._estimate_fuel_tonnes(fastest_distance) * 3.15,
                'coordinates': fast_coords
            },
            'fuel_efficient_route': {
                'ports': fuel_route,
                'distance_km': fuel_distance,
                'time_hours': self._estimate_travel_time_hours(fuel_distance),
                'fuel_tonnes': self._estimate_fuel_tonnes(fuel_distance),
                'co2_tonnes': self._estimate_fuel_tonnes(fuel_distance) * 3.15,
                'coordinates': fuel_coords
            },
            'direct_route': {
                'coordinates': direct_coords
            },
            'port_locations': self.PORT_LOCATIONS
        }
        
        # Clean up
        if hasattr(self, 'current_hub_ports'):
            del self.current_hub_ports
        
        return results