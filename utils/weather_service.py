# # # utils/weather_service.py
# # import os
# # import requests
# # from datetime import datetime, timedelta
# # import pytz
# # from typing import Dict, List, Optional, Tuple
# # import time
# # from dataclasses import dataclass
# # from dotenv import load_dotenv

# # load_dotenv()

# # @dataclass
# # class WeatherData:
# #     temperature: float
# #     wind_speed: float
# #     wind_direction: float
# #     wave_height: float
# #     precipitation: float
# #     visibility: float
# #     condition: str  # calm, moderate, stormy, etc.
# #     timestamp: datetime

# # class WeatherService:
# #     def __init__(self):
# #         # Using OpenWeatherMap API (free tier)
# #         self.api_key = os.getenv('OPENWEATHER_API_KEY', 'your_api_key_here')
# #         self.base_url = "https://api.openweathermap.org/data/2.5"
        
# #         # Alternative: NOAA API (free, no key needed but limited)
# #         self.noaa_base_url = "https://api.weather.gov"
        
# #         # Cache weather data to avoid too many API calls
# #         self.weather_cache = {}
# #         self.cache_duration = 3600  # 1 hour in seconds
    
# #     def get_marine_weather(self, lat: float, lon: float) -> Optional[WeatherData]:
# #         """Get current marine weather for a location"""
# #         cache_key = f"{lat}_{lon}_{datetime.now().strftime('%Y%m%d%H')}"
        
# #         # Check cache first
# #         if cache_key in self.weather_cache:
# #             cached_time, data = self.weather_cache[cache_key]
# #             if time.time() - cached_time < self.cache_duration:
# #                 return data
        
# #         try:
# #             # Try OpenWeatherMap first
# #             url = f"{self.base_url}/weather"
# #             params = {
# #                 'lat': lat,
# #                 'lon': lon,
# #                 'appid': self.api_key,
# #                 'units': 'metric'
# #             }
            
# #             response = requests.get(url, params=params, timeout=10)
            
# #             if response.status_code == 200:
# #                 data = response.json()
                
# #                 # Extract marine-relevant data
# #                 weather_data = WeatherData(
# #                     temperature=data['main']['temp'],
# #                     wind_speed=data['wind']['speed'] * 3.6,  # Convert m/s to km/h
# #                     wind_direction=data['wind'].get('deg', 0),
# #                     wave_height=self._estimate_wave_height(data['wind']['speed']),
# #                     precipitation=data.get('rain', {}).get('1h', 0) or 
# #                                  data.get('snow', {}).get('1h', 0),
# #                     visibility=data.get('visibility', 10000) / 1000,  # Convert to km
# #                     condition=self._determine_condition(data),
# #                     timestamp=datetime.fromtimestamp(data['dt'])
# #                 )
                
# #                 # Cache the result
# #                 self.weather_cache[cache_key] = (time.time(), weather_data)
# #                 return weather_data
                
# #         except Exception as e:
# #             print(f"Error fetching weather data: {e}")
        
# #         return None
    
# #     def get_weather_forecast(self, lat: float, lon: float, hours_ahead: int = 48) -> List[WeatherData]:
# #         """Get weather forecast for next N hours"""
# #         try:
# #             url = f"{self.base_url}/forecast"
# #             params = {
# #                 'lat': lat,
# #                 'lon': lon,
# #                 'appid': self.api_key,
# #                 'units': 'metric',
# #                 'cnt': min(hours_ahead // 3, 40)  # 3-hour intervals
# #             }
            
# #             response = requests.get(url, params=params, timeout=10)
            
# #             if response.status_code == 200:
# #                 data = response.json()
# #                 forecasts = []
                
# #                 for forecast in data['list']:
# #                     weather_data = WeatherData(
# #                         temperature=forecast['main']['temp'],
# #                         wind_speed=forecast['wind']['speed'] * 3.6,
# #                         wind_direction=forecast['wind'].get('deg', 0),
# #                         wave_height=self._estimate_wave_height(forecast['wind']['speed']),
# #                         precipitation=forecast.get('rain', {}).get('3h', 0) or 
# #                                      forecast.get('snow', {}).get('3h', 0),
# #                         visibility=forecast.get('visibility', 10000) / 1000,
# #                         condition=self._determine_condition(forecast),
# #                         timestamp=datetime.fromtimestamp(forecast['dt'])
# #                     )
# #                     forecasts.append(weather_data)
                
# #                 return forecasts
                
# #         except Exception as e:
# #             print(f"Error fetching weather forecast: {e}")
        
# #         return []
    
# #     def get_route_weather_impact(self, route_coordinates: List[Tuple[float, float]]) -> Dict:
# #         """Calculate weather impact along a route"""
# #         weather_points = []
# #         total_impact = 0
        
# #         # Sample points along the route (every 100km)
# #         for i in range(0, len(route_coordinates), max(1, len(route_coordinates) // 10)):
# #             lat, lon = route_coordinates[i]
# #             weather = self.get_marine_weather(lat, lon)
            
# #             if weather:
# #                 impact_score = self._calculate_impact_score(weather)
# #                 weather_points.append({
# #                     'coordinates': (lat, lon),
# #                     'weather': weather,
# #                     'impact_score': impact_score
# #                 })
# #                 total_impact += impact_score
        
# #         avg_impact = total_impact / len(weather_points) if weather_points else 0
        
# #         return {
# #             'weather_points': weather_points,
# #             'average_impact': avg_impact,
# #             'overall_condition': self._impact_to_condition(avg_impact),
# #             'recommendation': self._get_recommendation(avg_impact)
# #         }
    
# #     def _estimate_wave_height(self, wind_speed_ms: float) -> float:
# #         """Estimate wave height based on wind speed (simplified)"""
# #         # Simple conversion: Beaufort scale approximation
# #         wind_speed_kmh = wind_speed_ms * 3.6
        
# #         if wind_speed_kmh < 20:
# #             return 0.5  # Calm
# #         elif wind_speed_kmh < 40:
# #             return 1.0  # Moderate
# #         elif wind_speed_kmh < 60:
# #             return 2.5  # Rough
# #         elif wind_speed_kmh < 80:
# #             return 4.0  # Very rough
# #         else:
# #             return 6.0  # High
    
# #     def _determine_condition(self, weather_data: Dict) -> str:
# #         """Determine sailing condition from weather data"""
# #         wind_speed = weather_data['wind']['speed'] * 3.6  # km/h
# #         precipitation = weather_data.get('rain', {}).get('1h', 0) or \
# #                        weather_data.get('snow', {}).get('1h', 0) or \
# #                        weather_data.get('rain', {}).get('3h', 0) / 3 or 0
        
# #         if wind_speed < 20 and precipitation < 2:
# #             return "calm"
# #         elif wind_speed < 40 and precipitation < 5:
# #             return "moderate"
# #         elif wind_speed < 60:
# #             return "rough"
# #         else:
# #             return "stormy"
    
# #     def _calculate_impact_score(self, weather: WeatherData) -> float:
# #         """Calculate weather impact score (0-10, higher = worse)"""
# #         score = 0
        
# #         # Wind impact
# #         if weather.wind_speed > 80:
# #             score += 4
# #         elif weather.wind_speed > 60:
# #             score += 3
# #         elif weather.wind_speed > 40:
# #             score += 2
# #         elif weather.wind_speed > 20:
# #             score += 1
        
# #         # Wave height impact
# #         if weather.wave_height > 4:
# #             score += 3
# #         elif weather.wave_height > 2.5:
# #             score += 2
# #         elif weather.wave_height > 1:
# #             score += 1
        
# #         # Precipitation impact
# #         if weather.precipitation > 10:
# #             score += 2
# #         elif weather.precipitation > 5:
# #             score += 1
        
# #         # Visibility impact
# #         if weather.visibility < 1:
# #             score += 2
# #         elif weather.visibility < 3:
# #             score += 1
        
# #         return min(score, 10)
    
# #     def _impact_to_condition(self, impact_score: float) -> str:
# #         """Convert impact score to human-readable condition"""
# #         if impact_score < 2:
# #             return "Excellent"
# #         elif impact_score < 4:
# #             return "Good"
# #         elif impact_score < 6:
# #             return "Moderate"
# #         elif impact_score < 8:
# #             return "Poor"
# #         else:
# #             return "Dangerous"
    
# #     def _get_recommendation(self, impact_score: float) -> str:
# #         """Get recommendation based on weather impact"""
# #         if impact_score < 2:
# #             return "Safe to proceed, optimal conditions"
# #         elif impact_score < 4:
# #             return "Proceed with caution, monitor conditions"
# #         elif impact_score < 6:
# #             return "Consider delaying, moderate risk"
# #         elif impact_score < 8:
# #             return "Recommend delaying, poor conditions"
# #         else:
# #             return "Do not proceed, dangerous conditions"
# # # Add Storm Glass API to your weather_service.py

# # class StormGlassWeatherService:
# #     def __init__(self):
# #         self.api_key = os.getenv('STORMGLASS_API_KEY')
# #         self.base_url = "https://api.stormglass.io/v2"
    
# #     def get_marine_weather(self, lat, lon):
# #         try:
# #             response = requests.get(
# #                 f"{self.base_url}/weather/point",
# #                 params={
# #                     'lat': lat,
# #                     'lng': lon,
# #                     'params': 'airTemperature,waterTemperature,windSpeed,windDirection,waveHeight,waveDirection,swellHeight,swellDirection,visibility'
# #                 },
# #                 headers={
# #                     'Authorization': self.api_key
# #                 }
# #             )
            
# #             if response.status_code == 200:
# #                 data = response.json()
# #                 # Process Storm Glass data
# #                 return {
# #                     'air_temperature': data['hours'][0]['airTemperature']['sg'],
# #                     'water_temperature': data['hours'][0]['waterTemperature']['sg'],
# #                     'wind_speed': data['hours'][0]['windSpeed']['sg'] * 3.6,  # m/s to km/h
# #                     'wave_height': data['hours'][0]['waveHeight']['sg'],
# #                     'swell_height': data['hours'][0]['swellHeight']['sg'],
# #                     'visibility': data['hours'][0]['visibility']['sg'],
# #                     'source': 'stormglass'
# #                 }
# #         except Exception as e:
# #             print(f"Storm Glass API error: {e}")
        
# #         return None
# # # Singleton instance
# # weather_service = WeatherService()

# import os
# import requests
# import time
# from datetime import datetime
# from typing import List, Tuple, Dict, Optional
# import random

# class WeatherService:
#     def __init__(self):
#         self.api_key = os.getenv('OPENWEATHER_API_KEY', 'demo_key')
#         self.base_url = "https://api.openweathermap.org/data/2.5"
#         self.weather_cache = {}
#         self.cache_duration = 3600
    
#     def get_marine_weather(self, lat: float, lon: float) -> Optional[Dict]:
#         """Get simulated marine weather data"""
#         cache_key = f"{lat}_{lon}_{datetime.now().strftime('%Y%m%d%H')}"
        
#         if cache_key in self.weather_cache:
#             cached_time, data = self.weather_cache[cache_key]
#             if time.time() - cached_time < self.cache_duration:
#                 return data
        
#         try:
#             # Simulated weather data for demo purposes
#             weather_data = {
#                 'temperature': 22.5 + (lat / 100),
#                 'wind_speed': 15 + (abs(lon) / 1000),  # km/h
#                 'wind_direction': 180 + (lat + lon),
#                 'wave_height': 1.5 + (abs(lat) / 5000),  # meters
#                 'precipitation': 0 if lat > 0 else 5,
#                 'visibility': 10 - (abs(lon) / 10000),  # km
#                 'condition': self._determine_simulated_condition(lat, lon),
#                 'timestamp': datetime.now().isoformat()
#             }
            
#             self.weather_cache[cache_key] = (time.time(), weather_data)
#             return weather_data
            
#         except Exception as e:
#             print(f"Weather simulation error: {e}")
#             return None
    
#     def _determine_simulated_condition(self, lat: float, lon: float) -> str:
#         """Determine sailing condition based on latitude/longitude"""
#         # Simulate different conditions based on geographic location
#         if lat > 30:  # Northern latitudes
#             return "moderate" if lon > 0 else "calm"
#         elif lat < -30:  # Southern latitudes
#             return "rough" if lon > 0 else "moderate"
#         else:  # Tropical/equatorial
#             return "calm" if abs(lon) < 60 else "moderate"
    
#     def get_route_weather_impact(self, route_coordinates: List[Tuple[float, float]]) -> Dict:
#         """Calculate simulated weather impact along a route"""
#         if not route_coordinates:
#             return self._get_default_weather_impact()
        
#         weather_points = []
#         total_impact = 0
#         num_points = min(5, len(route_coordinates))
        
#         # Sample points along the route
#         step = max(1, len(route_coordinates) // num_points)
#         for i in range(0, len(route_coordinates), step):
#             lat, lon = route_coordinates[i]
#             weather = self.get_marine_weather(lat, lon)
            
#             if weather:
#                 impact_score = self._calculate_impact_score(weather)
#                 weather_points.append({
#                     'coordinates': (lat, lon),
#                     'weather': weather,
#                     'impact_score': impact_score
#                 })
#                 total_impact += impact_score
        
#         avg_impact = total_impact / len(weather_points) if weather_points else 3.5
        
#         return {
#             'weather_points': weather_points,
#             'average_impact': round(avg_impact, 2),
#             'overall_condition': self._impact_to_condition(avg_impact),
#             'recommendation': self._get_recommendation(avg_impact)
#         }
    
#     def _calculate_impact_score(self, weather: Dict) -> float:
#         """Calculate weather impact score (0-10, higher = worse)"""
#         score = 0
        
#         # Simulated impact calculation
#         if weather['wind_speed'] > 60:
#             score += 3
#         elif weather['wind_speed'] > 40:
#             score += 2
#         elif weather['wind_speed'] > 20:
#             score += 1
        
#         if weather['wave_height'] > 3:
#             score += 2
#         elif weather['wave_height'] > 1.5:
#             score += 1
        
#         if weather['condition'] == 'rough':
#             score += 2
#         elif weather['condition'] == 'moderate':
#             score += 1
        
#         return min(score, 8)
    
#     def _impact_to_condition(self, impact_score: float) -> str:
#         """Convert impact score to human-readable condition"""
#         if impact_score < 2:
#             return "Excellent"
#         elif impact_score < 4:
#             return "Good"
#         elif impact_score < 6:
#             return "Moderate"
#         elif impact_score < 8:
#             return "Poor"
#         else:
#             return "Dangerous"
    
#     def _get_recommendation(self, impact_score: float) -> str:
#         """Get recommendation based on weather impact"""
#         if impact_score < 2:
#             return "Optimal sailing conditions"
#         elif impact_score < 4:
#             return "Good conditions, proceed as planned"
#         elif impact_score < 6:
#             return "Moderate conditions, monitor weather"
#         else:
#             return "Consider delaying due to poor conditions"
    
#     def _get_default_weather_impact(self) -> Dict:
#         """Return default weather impact when no coordinates available"""
#         return {
#             'weather_points': [],
#             'average_impact': 3.5,
#             'overall_condition': "Moderate",
#             'recommendation': "Standard sailing conditions expected"
#         }

# # Singleton instance
# weather_service = WeatherService()


import os
import requests
import time
from datetime import datetime
from typing import List, Tuple, Dict, Optional
import random

class WeatherService:
    def __init__(self):
        # Using a free weather API that doesn't require key
        self.cache = {}
        self.cache_duration = 300  # 5 minutes
    
    def get_marine_weather(self, lat: float, lon: float) -> Optional[Dict]:
        """Get simulated marine weather data"""
        cache_key = f"{lat:.2f}_{lon:.2f}"
        
        # Check cache
        if cache_key in self.cache:
            cached_time, data = self.cache[cache_key]
            if time.time() - cached_time < self.cache_duration:
                return data
        
        try:
            # Generate realistic weather data based on location
            # Different weather patterns for different regions
            if 20 <= lat <= 40 and 100 <= lon <= 140:  # East Asia
                wind_speed = random.uniform(15, 35)
                wave_height = random.uniform(1.0, 2.5)
                condition = random.choice(['calm', 'moderate', 'moderate'])
            elif -10 <= lat <= 10:  # Equatorial region
                wind_speed = random.uniform(10, 25)
                wave_height = random.uniform(0.5, 1.5)
                condition = random.choice(['calm', 'calm', 'moderate'])
            elif 40 <= lat <= 60:  # North Atlantic
                wind_speed = random.uniform(25, 45)
                wave_height = random.uniform(2.0, 4.0)
                condition = random.choice(['moderate', 'rough', 'moderate'])
            else:  # Default
                wind_speed = random.uniform(15, 30)
                wave_height = random.uniform(1.0, 3.0)
                condition = random.choice(['calm', 'moderate'])
            
            # Add seasonal variation
            month = datetime.now().month
            if month in [12, 1, 2]:  # Winter in Northern Hemisphere
                wind_speed *= 1.3 if lat > 0 else 0.8
                wave_height *= 1.2 if lat > 0 else 0.9
            elif month in [6, 7, 8]:  # Summer in Northern Hemisphere
                wind_speed *= 0.8 if lat > 0 else 1.2
                wave_height *= 0.9 if lat > 0 else 1.1
            
            weather_data = {
                'temperature': 20 + (lat / 10),
                'wind_speed': round(wind_speed, 1),
                'wind_direction': random.randint(0, 360),
                'wave_height': round(wave_height, 1),
                'precipitation': random.randint(0, 10),
                'visibility': random.uniform(5, 15),
                'condition': condition,
                'timestamp': datetime.now().isoformat(),
                'pressure': 1013 + random.uniform(-10, 10)
            }
            
            self.cache[cache_key] = (time.time(), weather_data)
            return weather_data
            
        except Exception as e:
            print(f"Weather simulation error: {e}")
            return None
    
    def get_route_weather_impact(self, route_coordinates: List[Tuple[float, float]]) -> Dict:
        """Calculate weather impact along a route with enhanced simulation"""
        if not route_coordinates:
            return self._get_default_weather_impact()
        
        weather_points = []
        total_impact = 0
        
        # Sample 5-10 points along the route
        num_points = min(8, len(route_coordinates))
        step = max(1, len(route_coordinates) // num_points)
        
        for i in range(0, len(route_coordinates), step):
            lat, lon = route_coordinates[i]
            weather = self.get_marine_weather(lat, lon)
            
            if weather:
                impact_score = self._calculate_impact_score(weather)
                weather_points.append({
                    'coordinates': [lat, lon],
                    'weather': weather,
                    'impact_score': impact_score
                })
                total_impact += impact_score
        
        avg_impact = total_impact / len(weather_points) if weather_points else 3.5
        
        # Generate route-specific insights
        overall_condition = self._impact_to_condition(avg_impact)
        recommendation = self._get_route_recommendation(weather_points)
        
        return {
            'weather_points': weather_points,
            'average_impact': round(avg_impact, 1),
            'overall_condition': overall_condition,
            'recommendation': recommendation,
            'storm_glass_data': self._generate_storm_glass_data(route_coordinates)
        }
    
    def _calculate_impact_score(self, weather: Dict) -> float:
        """Calculate weather impact score (1-10, higher = worse)"""
        score = 0
        
        # Wind impact (0-4 points)
        if weather['wind_speed'] > 70:  # Gale force
            score += 4
        elif weather['wind_speed'] > 50:  # Strong wind
            score += 3
        elif weather['wind_speed'] > 30:  # Moderate wind
            score += 2
        elif weather['wind_speed'] > 15:  # Light breeze
            score += 1
        
        # Wave impact (0-3 points)
        if weather['wave_height'] > 4.0:  # Very rough
            score += 3
        elif weather['wave_height'] > 2.5:  # Rough
            score += 2
        elif weather['wave_height'] > 1.5:  # Moderate
            score += 1
        
        # Condition impact (0-2 points)
        if weather['condition'] == 'rough':
            score += 2
        elif weather['condition'] == 'moderate':
            score += 1
        
        # Visibility impact (0-1 point)
        if weather['visibility'] < 3:
            score += 1
        
        return min(max(score, 1), 10)  # Ensure between 1-10
    
    def _impact_to_condition(self, impact_score: float) -> str:
        """Convert impact score to human-readable condition"""
        if impact_score < 2.5:
            return "Excellent"
        elif impact_score < 4.0:
            return "Good"
        elif impact_score < 6.0:
            return "Moderate"
        elif impact_score < 8.0:
            return "Poor"
        else:
            return "Dangerous"
    
    def _get_route_recommendation(self, weather_points: List) -> str:
        """Get specific recommendation for the route"""
        if not weather_points:
            return "Standard sailing conditions expected"
        
        impacts = [p['impact_score'] for p in weather_points]
        avg_impact = sum(impacts) / len(impacts)
        max_impact = max(impacts)
        
        if max_impact > 7:
            return "⚠️ Route contains dangerous weather sections. Consider delaying or rerouting."
        elif avg_impact > 5:
            return "Route has challenging weather. Proceed with caution and increased monitoring."
        elif avg_impact < 3:
            return "Optimal sailing conditions along entire route."
        else:
            return "Normal sailing conditions. Standard precautions recommended."
    
    def _generate_storm_glass_data(self, route_coordinates: List[Tuple[float, float]]) -> Dict:
        """Generate mock Storm Glass API data"""
        if not route_coordinates:
            return {}
        
        # Calculate average position
        avg_lat = sum(c[0] for c in route_coordinates) / len(route_coordinates)
        avg_lon = sum(c[1] for c in route_coordinates) / len(route_coordinates)
        
        return {
            'average_swell': round(random.uniform(1.0, 3.5), 1),
            'water_temp': round(15 + (abs(avg_lat) / 3), 1),
            'current_speed': round(random.uniform(0.5, 2.5), 1),
            'current_direction': random.randint(0, 360),
            'salinity': round(33 + random.uniform(-2, 2), 1)
        }
    
    def _get_default_weather_impact(self) -> Dict:
        """Return default weather impact"""
        return {
            'weather_points': [],
            'average_impact': 3.5,
            'overall_condition': "Moderate",
            'recommendation': "Standard sailing conditions expected",
            'storm_glass_data': {}
        }

# Singleton instance
weather_service = WeatherService()