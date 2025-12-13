# test_weather.py
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.weather_service import weather_service

def test_weather_service():
    print("🧪 Testing Weather Service Integration...")
    print("=" * 50)
    
    # Check if API key is set
    print(f"📋 API Key configured: {'Yes' if weather_service.api_key != 'your_api_key_here' else 'No (using demo key)'}")
    
    # Test single location
    print("\n📍 Testing single location weather (Jebel_Ali)...")
    try:
        weather = weather_service.get_marine_weather(25.0108, 55.0610)  # Jebel_Ali
        if weather:
            print(f"✅ Weather data retrieved successfully!")
            print(f"   Temperature: {weather.temperature}°C")
            print(f"   Wind Speed: {weather.wind_speed:.1f} km/h")
            print(f"   Wave Height: {weather.wave_height:.1f}m")
            print(f"   Condition: {weather.condition}")
            print(f"   Visibility: {weather.visibility:.1f} km")
        else:
            print("❌ No weather data received. Check API key or network.")
    except Exception as e:
        print(f"❌ Error fetching weather: {e}")
    
    # Test route weather impact
    print("\n🗺️ Testing route weather impact analysis...")
    test_route = [
        (25.0108, 55.0610),  # Jebel_Ali
        (18.948, 72.835),    # Mumbai
        (6.9271, 79.8612),   # Colombo
    ]
    
    try:
        impact = weather_service.get_route_weather_impact(test_route)
        if impact:
            print(f"✅ Route weather analysis successful!")
            print(f"   Average Impact: {impact['average_impact']:.1f}/10")
            print(f"   Overall Condition: {impact['overall_condition']}")
            print(f"   Recommendation: {impact['recommendation']}")
            print(f"   Weather points analyzed: {len(impact['weather_points'])}")
        else:
            print("❌ No route impact data received.")
    except Exception as e:
        print(f"❌ Error in route analysis: {e}")
    
    print("\n" + "=" * 50)
    print("✅ Weather Service Test Complete!")

if __name__ == "__main__":
    test_weather_service()