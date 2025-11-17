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
                if current % 50 == 0:  # Print progress every 50 combinations
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
            # If A* fails, return infinite distance
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
        """Compute fitness for GA."""
        d = self._total_distance(route_seq)
        if d == float("inf"):
            return 0.0

        stops = len(route_seq) - 2  # exclude start and destination

        if goal == "fastest":
            # For fastest route, penalize distance AND number of stops
            t = self._estimate_travel_time_hours(d) + stops * 24  # 24 hours penalty per hub
            return 1.0 / (t + 1e-6)
        else:
            # For fuel-efficient route, penalize distance more heavily and stops less
            f = self._estimate_fuel_tonnes(d) * (1 + 0.05 * stops)  # 5% penalty per hub
            return 1.0 / (f + 1e-6)

    def _mutate_route(self, route_seq):
        """Swap two intermediate hubs randomly to introduce variation."""
        if len(route_seq) <= 3:
            return route_seq
        a, b = random.sample(range(1, len(route_seq) - 1), 2)
        route_seq[a], route_seq[b] = route_seq[b], route_seq[a]
        return route_seq

    def _crossover_routes(self, parent1, parent2):
        """Create a child route by combining two parent routes."""
        # Get the hub ports from both parents (exclude start and end)
        hubs1 = parent1[1:-1]
        hubs2 = parent2[1:-1]
        
        # Combine and remove duplicates
        all_hubs = list(dict.fromkeys(hubs1 + hubs2))
        
        # Randomly select a subset of hubs (at least 1, at most all)
        num_hubs = random.randint(1, len(all_hubs))
        child_hubs = random.sample(all_hubs, num_hubs)
        
        # Create child route
        child = [parent1[0]] + child_hubs + [parent1[-1]]
        return child

    def _run_genetic_algorithm(self, start_port, destination_port, hub_ports, goal):
        """Run genetic algorithm to optimize route."""
        if not hub_ports:
            # If no hub ports, return direct route
            direct_route = [start_port, destination_port]
            direct_distance = self._total_distance(direct_route)
            return direct_route, direct_distance

        # Initialize population with diverse routes
        population = []
        
        # Add direct route
        population.append([start_port, destination_port])
        
        # Add routes with individual hubs
        for hub in hub_ports:
            population.append([start_port, hub, destination_port])
        
        # Add routes with all hubs in different orders
        if len(hub_ports) > 1:
            # Try a few random permutations
            for _ in range(min(10, self.GA_POPULATION_SIZE - len(population))):
                shuffled = hub_ports.copy()
                random.shuffle(shuffled)
                population.append([start_port] + shuffled + [destination_port])
        
        # Fill remaining population with random combinations
        while len(population) < self.GA_POPULATION_SIZE:
            num_hubs = random.randint(1, len(hub_ports))
            selected_hubs = random.sample(hub_ports, num_hubs)
            population.append([start_port] + selected_hubs + [destination_port])

        best_seq = None
        best_fit = -float("inf")

        for gen in range(self.GA_GENERATIONS):
            # Evaluate fitness
            scored = []
            for seq in population:
                fit = self._fitness(seq, goal)
                scored.append((seq, fit))
                
                # Track best solution
                if fit > best_fit and fit < float("inf"):
                    best_seq = seq[:]
                    best_fit = fit
            
            scored.sort(key=lambda x: x[1], reverse=True)

            # Elitism: keep top solutions
            new_pop = [s[0] for s in scored[:8]]

            # Generate new population through crossover and mutation
            while len(new_pop) < self.GA_POPULATION_SIZE:
                # Select parents from top 50%
                parent_pool = [s[0] for s in scored[:len(scored)//2]]
                if len(parent_pool) < 2:
                    parent_pool = population
                
                p1, p2 = random.sample(parent_pool, 2)
                
                # Crossover
                child = self._crossover_routes(p1, p2)
                
                # Mutation
                if random.random() < 0.3 and len(child) > 3:
                    child = self._mutate_route(child)
                
                # Ensure the route is valid (contains only allowed ports)
                valid_route = [start_port]
                for port in child[1:-1]:
                    if port in hub_ports and port not in valid_route:
                        valid_route.append(port)
                valid_route.append(destination_port)
                
                new_pop.append(valid_route)

            population = new_pop

        # If no valid route found, return direct route
        if best_seq is None or best_fit <= 0:
            direct_route = [start_port, destination_port]
            direct_distance = self._total_distance(direct_route)
            return direct_route, direct_distance
        
        return best_seq, self._total_distance(best_seq)

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
        """Main method to calculate optimal routes for web interface"""
        if hub_ports is None:
            hub_ports = []
            
        print(f"🏁 Running GA for {start_port} → {destination_port} with hubs: {hub_ports}")
        
        # Run genetic algorithm
        fastest_route, fastest_distance = self._run_genetic_algorithm(start_port, destination_port, hub_ports, "fastest")
        fuel_route, fuel_distance = self._run_genetic_algorithm(start_port, destination_port, hub_ports, "fuel")
        
        print(f"✅ Fastest route: {' → '.join(fastest_route)} (Distance: {fastest_distance:.2f} km)")
        print(f"✅ Fuel-efficient route: {' → '.join(fuel_route)} (Distance: {fuel_distance:.2f} km)")
        
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
        
        return results